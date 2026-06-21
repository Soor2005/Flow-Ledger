'use strict';

/**
 * Electron main-process workflow engine (CommonJS).
 * Mirrors src/ai/core WorkflowManager for live tracking pipeline.
 */

const { extractWorkflowIdentity } = require('../srcBridge/workflowIdentityBridge');

const WORKFLOW_EVENTS = {
  STARTED:              'WORKFLOW_STARTED',
  CONTINUED:            'WORKFLOW_CONTINUED',
  LOCKED:               'WORKFLOW_LOCKED',
  EXTENDED:             'WORKFLOW_EXTENDED',
  MERGED:               'WORKFLOW_MERGED',
  SPLIT:                'WORKFLOW_SPLIT',
  CONFIDENCE:           'WORKFLOW_CONFIDENCE',
  SUPPORTING_TOOL:      'SUPPORTING_TOOL_DETECTED',
  SESSION_SPLIT:        'SESSION_SPLIT_REASON',
  SESSION_CONTINUATION: 'SESSION_CONTINUATION_REASON',
  SESSION_EXTENDED:     'SESSION_EXTENDED',
  SESSION_CREATION_BLOCKED: 'SESSION_CREATION_BLOCKED',
  SESSION_CREATION_ALLOWED: 'SESSION_CREATION_ALLOWED',
  WORKFLOW_SIMILARITY_SCORE: 'WORKFLOW_SIMILARITY_SCORE',
};

const SUPPORTING_TOOL_APPS = [
  'chatgpt', 'claude', 'gemini', 'copilot', 'perplexity', 'poe', 'phind',
  'github', 'google chrome', 'chrome', 'microsoft edge', 'edge', 'firefox',
  'brave', 'arc', 'opera', 'safari', 'vivaldi', 'visual studio code', 'vscode', 'cursor',
  'code', 'terminal', 'windows terminal', 'iterm', 'iterm2', 'warp', 'hyper',
  'kitty', 'alacritty', 'wezterm', 'powershell', 'notion', 'obsidian', 'flow ledger',
  'documentation', 'docs',
];

const SUPPORTING_TOOL_DOMAINS = [
  'chatgpt.com', 'chat.openai.com', 'claude.ai', 'gemini.google.com',
  'copilot.microsoft.com', 'perplexity.ai', 'poe.com', 'github.com',
  'gitlab.com', 'bitbucket.org', 'notion.so', 'notion.site', 'docs.google.com',
  'developer.mozilla.org', 'stackoverflow.com', 'npmjs.com', 'readthedocs.io', 'devdocs.io',
];

const LOCK_CONFIDENCE_THRESHOLD = 0.8;
const LOCK_DURATION_MINS = 20;
const HARD_BREAK_CONFIDENCE = 0.3;
const PROLONGED_IDLE_MINS = 30;

const WEIGHTS = { intent: 0.35, project: 0.30, continuity: 0.20, semantic: 0.10, application: 0.05 };
const STOP_WORDS = new Set(['the', 'a', 'an', 'and', 'or', 'for', 'with', 'from', 'this', 'that', 'new', 'tab', 'window', 'file', 'page', 'app', 'auto']);

function logWorkflowEvent(event, payload = {}) {
  console.debug('[WORKFLOW]', event, { ts: Date.now(), event, ...payload });
}

function norm(str) {
  return String(str || '').toLowerCase().trim();
}

function normalizeToolName(name) {
  return String(name || '').replace(/\.exe$/i, '').trim().toLowerCase();
}

function safeUrlHostname(url) {
  if (!url) return '';
  try {
    return new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return String(url).replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0].toLowerCase();
  }
}

function isSupportingToolApp(appName) {
  const n = normalizeToolName(appName);
  return SUPPORTING_TOOL_APPS.some(t => n === t || n.includes(t));
}

function isSupportingToolUrl(url) {
  const host = safeUrlHostname(url);
  return host && SUPPORTING_TOOL_DOMAINS.some(d => host === d || host.endsWith('.' + d));
}

function isSupportingToolContext(appName, url) {
  return isSupportingToolApp(appName) || isSupportingToolUrl(url);
}

function extractKeywords(text) {
  return String(text || '').replace(/[^a-zA-Z0-9\s]/g, ' ').split(/\s+/)
    .map(w => w.toLowerCase().trim()).filter(w => w.length >= 3 && !STOP_WORDS.has(w));
}

function jaccardSimilarity(a, b) {
  if (!a.length || !b.length) return 0;
  const setB = new Set(b);
  const shared = a.filter(x => setB.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return union > 0 ? shared / union : 0;
}

function normalizeActivity(activity) {
  const ts = activity.timestamp || Date.now();
  return {
    id: activity.id || `act_${ts}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: ts,
    app_name: activity.app_name || activity.appName || '',
    window_title: activity.window_title || activity.title || '',
    url: activity.url || '',
    duration_seconds: activity.duration_seconds || activity.duration || 0,
  };
}

function calculateWorkflowConfidence(workflow, activity, project) {
  if (!workflow || !activity) return { score: 0, breakdown: {} };

  const identity = extractWorkflowIdentity({
    app_name: activity.app_name,
    window_title: activity.window_title,
    url: activity.url,
  });

  const wfIntent = norm(workflow.intent || workflow.primaryCategory || '');
  const actIntent = norm(identity.category || 'work');
  let intentScore = jaccardSimilarity(workflow.keywords || [], identity.keywords || []);
  if (wfIntent && actIntent && (wfIntent === actIntent || wfIntent.includes(actIntent))) intentScore = 0.95;
  if (isSupportingToolContext(activity.app_name, activity.url)) intentScore = Math.max(intentScore, 0.85);

  const wfProject = workflow.project?.id || workflow.project?.name || workflow.project;
  const actProject = project?.id || project?.name || activity.project_id;
  let projectScore = 0.6;
  if (wfProject && actProject) projectScore = wfProject === actProject ? 1 : 0.1;
  else if (wfProject || actProject) projectScore = 0.55;

  const gapMins = Math.max(0, (activity.timestamp - (workflow.lastActivityTime || workflow.startTime)) / 60000);
  let continuityScore = 0.2;
  if (gapMins < 2) continuityScore = 1;
  else if (gapMins < 10) continuityScore = 0.85;
  else if (gapMins < 20) continuityScore = 0.7;
  else if (gapMins < 30) continuityScore = 0.5;

  const wfKeywords = [...(workflow.keywords || []), ...extractKeywords(workflow.name), ...extractKeywords(workflow.objective)];
  const actKeywords = [...(identity.keywords || []), ...extractKeywords(activity.window_title), ...extractKeywords(activity.url)];
  const semanticScore = jaccardSimilarity(wfKeywords, actKeywords);

  const app = norm(activity.app_name);
  const wfApps = (workflow.supportingTools || []).map(normalizeToolName);
  let applicationScore = 0.35;
  if (wfApps.includes(app)) applicationScore = 1;
  else if (isSupportingToolContext(app, activity.url)) applicationScore = 0.9;
  else if (!wfApps.length) applicationScore = 0.5;

  const breakdown = {
    intent: intentScore,
    project: projectScore,
    continuity: continuityScore,
    semantic: semanticScore,
    application: applicationScore,
  };

  const score = (
    breakdown.intent * WEIGHTS.intent +
    breakdown.project * WEIGHTS.project +
    breakdown.continuity * WEIGHTS.continuity +
    breakdown.semantic * WEIGHTS.semantic +
    breakdown.application * WEIGHTS.application
  );

  return { score: Math.min(Math.max(score, 0), 1), breakdown };
}

class TrackingWorkflowManager {
  constructor() {
    this.activeWorkflow = null;
    this.history = [];
    this.currentProject = null;
  }

  setProject(project) {
    this.currentProject = project;
  }

  workflowDurationMins(workflow) {
    return Math.max(0, ((workflow.lastActivityTime || Date.now()) - workflow.startTime) / 60000);
  }

  evaluateLock(workflow) {
    const durationMins = this.workflowDurationMins(workflow);
    if (workflow.confidence >= LOCK_CONFIDENCE_THRESHOLD && durationMins >= LOCK_DURATION_MINS && !workflow.locked) {
      workflow.locked = true;
      logWorkflowEvent(WORKFLOW_EVENTS.LOCKED, { workflowId: workflow.id, confidence: workflow.confidence, durationMins: Math.round(durationMins) });
    }
    return workflow.locked;
  }

  startNewWorkflow(initialActivity, project, breakReason) {
    const activity = normalizeActivity(initialActivity);
    const identity = extractWorkflowIdentity({ app_name: activity.app_name, window_title: activity.window_title, url: activity.url });
    const name = identity.label && identity.label !== 'unknown' ? identity.label : 'Untitled Workflow';

    this.activeWorkflow = {
      id: `wf_${activity.timestamp}_${Math.random().toString(36).slice(2, 9)}`,
      name,
      project: project || this.currentProject || null,
      intent: identity.category || 'unknown',
      objective: identity.label !== 'unknown' ? identity.label : undefined,
      startTime: activity.timestamp,
      lastActivityTime: activity.timestamp,
      confidence: 0.5,
      locked: false,
      status: 'active',
      activities: [activity],
      supportingTools: [],
      keywords: [...(identity.keywords || [])],
      lastBreakReason: breakReason || null,
    };

    this._registerTool(this.activeWorkflow, activity.app_name, activity.url);
    logWorkflowEvent(WORKFLOW_EVENTS.STARTED, { workflowId: this.activeWorkflow.id, name, reason: breakReason || 'initial' });
    return this.activeWorkflow;
  }

  _registerTool(workflow, appName, url) {
    const tool = normalizeToolName(appName);
    if (tool && !workflow.supportingTools.includes(tool)) workflow.supportingTools.push(tool);
    if (isSupportingToolContext(appName, url)) {
      logWorkflowEvent(WORKFLOW_EVENTS.SUPPORTING_TOOL, { workflowId: workflow.id, app: tool, url: safeUrlHostname(url) || url });
    }
  }

  shouldSplit(workflow, activity, confidence, project, options) {
    if (options.forceSplit) return { split: true, reason: options.forceSplitReason || 'manual_stop' };
    if (options.calendarInterruption) return { split: true, reason: 'calendar_interruption' };

    const gapMins = Math.max(0, (activity.timestamp - workflow.lastActivityTime) / 60000);
    if (gapMins >= PROLONGED_IDLE_MINS) return { split: true, reason: 'prolonged_idle' };
    if (confidence < HARD_BREAK_CONFIDENCE) return { split: true, reason: 'low_confidence_transition' };

    const wfProjectId = workflow.project?.id || workflow.project;
    const newProjectId = project?.id || activity.project_id;
    if (wfProjectId && newProjectId && wfProjectId !== newProjectId) return { split: true, reason: 'project_change' };

    if (workflow.locked) {
      logWorkflowEvent(WORKFLOW_EVENTS.SESSION_CONTINUATION, { workflowId: workflow.id, reason: 'workflow_locked', confidence });
      return { split: false, reason: null };
    }

    if (isSupportingToolContext(activity.app_name, activity.url)) {
      logWorkflowEvent(WORKFLOW_EVENTS.SESSION_CONTINUATION, { workflowId: workflow.id, reason: 'supporting_tool_context', app: activity.app_name });
      return { split: false, reason: null };
    }

    return { split: false, reason: null };
  }

  continueWorkflow(workflow, activity, confidence) {
    workflow.activities.push(activity);
    workflow.lastActivityTime = activity.timestamp;
    workflow.confidence = confidence;
    this._registerTool(workflow, activity.app_name, activity.url);
    const identity = extractWorkflowIdentity({ app_name: activity.app_name, window_title: activity.window_title, url: activity.url });
    for (const kw of identity.keywords || []) {
      if (!workflow.keywords.includes(kw)) workflow.keywords.push(kw);
    }
    this.evaluateLock(workflow);
    logWorkflowEvent(WORKFLOW_EVENTS.CONTINUED, { workflowId: workflow.id, confidence, app: activity.app_name });
    logWorkflowEvent(WORKFLOW_EVENTS.CONFIDENCE, { workflowId: workflow.id, confidence });
    return workflow;
  }

  processActivity(newActivity, project, options = {}) {
    const activity = normalizeActivity({ ...newActivity, timestamp: newActivity.timestamp || Date.now() });
    const resolvedProject = project || this.currentProject;

    if (!this.activeWorkflow) {
      const workflow = this.startNewWorkflow(activity, resolvedProject);
      return { workflow, isNew: true, breakReason: null, confidence: workflow.confidence, shouldSplitWorkflow: false, workflowId: workflow.id };
    }

    const { score: confidence, breakdown } = calculateWorkflowConfidence(this.activeWorkflow, activity, resolvedProject);
    logWorkflowEvent(WORKFLOW_EVENTS.CONFIDENCE, { workflowId: this.activeWorkflow.id, confidence, breakdown, app: activity.app_name });

    const { split, reason } = this.shouldSplit(this.activeWorkflow, activity, confidence, resolvedProject, options);
    if (split) {
      logWorkflowEvent(WORKFLOW_EVENTS.SPLIT, { workflowId: this.activeWorkflow.id, reason, confidence });
      logWorkflowEvent(WORKFLOW_EVENTS.SESSION_SPLIT, { workflowId: this.activeWorkflow.id, reason, toApp: activity.app_name });
      this.endActiveWorkflow(reason);
      const workflow = this.startNewWorkflow(activity, resolvedProject, reason);
      return { workflow, isNew: true, breakReason: reason, confidence: workflow.confidence, shouldSplitWorkflow: true, workflowId: workflow.id };
    }

    const workflow = this.continueWorkflow(this.activeWorkflow, activity, confidence);
    return { workflow, isNew: false, breakReason: null, confidence, shouldSplitWorkflow: false, workflowId: workflow.id };
  }

  endActiveWorkflow(reason) {
    if (!this.activeWorkflow) return;
    this.activeWorkflow.status = 'completed';
    this.history.push({ ...this.activeWorkflow, completedAt: Date.now() });
    if (this.history.length > 50) this.history = this.history.slice(-50);
    logWorkflowEvent(WORKFLOW_EVENTS.SPLIT, { workflowId: this.activeWorkflow.id, reason: reason || 'completed' });
    this.activeWorkflow = null;
  }

  getActiveWorkflow() {
    return this.activeWorkflow;
  }

  validateContinuityBeforeSplit(activity, project) {
    if (!this.activeWorkflow) return { allowSplit: true, reason: 'no_active_workflow' };
    const { score } = calculateWorkflowConfidence(this.activeWorkflow, normalizeActivity(activity), project || this.currentProject);
    if (this.activeWorkflow.locked) return { allowSplit: false, reason: 'workflow_locked', confidence: score };
    if (score >= HARD_BREAK_CONFIDENCE) return { allowSplit: false, reason: 'confidence_sufficient', confidence: score };
    return { allowSplit: true, reason: 'confidence_below_threshold', confidence: score };
  }

  resolveSessionOwnership(activityInput, project, options = {}) {
    const activity = normalizeActivity(activityInput || {});
    const workflow = this.activeWorkflow;

    if (!workflow) {
      logWorkflowEvent(WORKFLOW_EVENTS.SESSION_CREATION_ALLOWED, {
        reason: 'no_active_workflow',
        app: activity.app_name,
      });
      return {
        action: 'create',
        createNewSession: true,
        extendSession: false,
        workflow: null,
        workflowId: null,
        confidence: 0,
        similarity: 0,
        continuity: { allowSplit: true, reason: 'no_active_workflow' },
        reason: 'no_active_workflow',
      };
    }

    const { score, breakdown } = calculateWorkflowConfidence(workflow, activity, project || this.currentProject);
    const continuity = this.validateContinuityBeforeSplit(activity, project || this.currentProject);
    const supportingTool = isSupportingToolContext(activity.app_name, activity.url);
    const sameWorkflow = options.workflowId ? options.workflowId === workflow.id : true;
    const shouldExtend = sameWorkflow && !options.workflowSplit && (
      options.workflowMerged ||
      workflow.locked ||
      supportingTool ||
      !continuity.allowSplit ||
      score >= HARD_BREAK_CONFIDENCE
    );

    logWorkflowEvent(WORKFLOW_EVENTS.WORKFLOW_SIMILARITY_SCORE, {
      workflowId: workflow.id,
      app: activity.app_name,
      similarity: score,
      confidence: score,
      breakdown,
      continuity,
      supportingTool,
    });

    if (shouldExtend) {
      logWorkflowEvent(WORKFLOW_EVENTS.CONTINUED, {
        workflowId: workflow.id,
        reason: options.workflowMerged ? 'workflow_merged' : supportingTool ? 'supporting_tool_extends_workflow' : continuity.reason || 'workflow_continuity',
        confidence: score,
        app: activity.app_name,
      });
      return {
        action: 'extend',
        createNewSession: false,
        extendSession: true,
        workflow,
        workflowId: workflow.id,
        workflowName: workflow.name,
        confidence: score,
        similarity: score,
        breakdown,
        continuity,
        supportingTool,
        reason: options.workflowMerged ? 'workflow_merged' : supportingTool ? 'supporting_tool_extends_workflow' : continuity.reason || 'workflow_continuity',
      };
    }

    logWorkflowEvent(WORKFLOW_EVENTS.SESSION_CREATION_ALLOWED, {
      workflowId: workflow.id,
      reason: options.workflowSplit ? 'workflow_transition' : continuity.reason || 'low_similarity',
      confidence: score,
      app: activity.app_name,
    });

    return {
      action: 'create',
      createNewSession: true,
      extendSession: false,
      workflow,
      workflowId: workflow.id,
      workflowName: workflow.name,
      confidence: score,
      similarity: score,
      breakdown,
      continuity,
      supportingTool,
      reason: options.workflowSplit ? 'workflow_transition' : continuity.reason || 'low_similarity',
    };
  }
}

const trackingWorkflowManager = new TrackingWorkflowManager();

module.exports = {
  TrackingWorkflowManager,
  trackingWorkflowManager,
  WORKFLOW_EVENTS,
  isSupportingToolContext,
  normalizeToolName,
  safeUrlHostname,
  LOCK_CONFIDENCE_THRESHOLD,
  HARD_BREAK_CONFIDENCE,
};
