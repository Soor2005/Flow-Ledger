/**
 * WorkflowManager — Phase 1
 *
 * Single source of truth for workflow state, ownership, confidence, and transitions.
 * All workflow split/continue decisions flow through processActivity().
 */

import { extractWorkflowIdentity } from '../engines/workflowDominanceEngine.js';
import { calculateWorkflowConfidence } from './WorkflowConfidenceEngine.js';
import { isSupportingToolContext, normalizeToolName, safeUrlHostname } from '../config/supportingTools.js';
import { logWorkflowEvent, WORKFLOW_EVENTS } from './workflowDiagnostics.js';

const WORKFLOW_STORAGE_KEY = 'fl_active_workflow_v1';
const WORKFLOW_HISTORY_KEY = 'fl_workflow_history_v1';
const MAX_HISTORY = 50;

const LOCK_CONFIDENCE_THRESHOLD = 0.8;
const LOCK_DURATION_MINS = 20;
const HARD_BREAK_CONFIDENCE = 0.3;
const PROLONGED_IDLE_MINS = 30;

const browserStorage = {
  getItem: (k) => (typeof localStorage !== 'undefined' ? localStorage.getItem(k) : null),
  setItem: (k, v) => { if (typeof localStorage !== 'undefined') localStorage.setItem(k, v); },
  removeItem: (k) => { if (typeof localStorage !== 'undefined') localStorage.removeItem(k); },
};

/**
 * @typedef {Object} WorkflowActivity
 * @property {string} [id]
 * @property {number} [timestamp]
 * @property {string} app_name
 * @property {string} [appName]
 * @property {string} [window_title]
 * @property {string} [title]
 * @property {string} [url]
 * @property {number} [duration_seconds]
 */

/**
 * @typedef {Object} WorkflowEntity
 * @property {string} id
 * @property {string} name
 * @property {Object|null} [project]
 * @property {string} [intent]
 * @property {string} [objective]
 * @property {number} startTime
 * @property {number} lastActivityTime
 * @property {number} confidence
 * @property {boolean} locked
 * @property {'active'|'paused'|'completed'} status
 * @property {WorkflowActivity[]} activities
 * @property {string[]} supportingTools
 * @property {string[]} keywords
 * @property {Object} [context]
 * @property {number} [ownershipScore]
 * @property {string|null} [lastBreakReason]
 */

class WorkflowManager {
  /**
   * @param {{ storage?: typeof browserStorage }} [options]
   */
  constructor(options = {}) {
    this.storage = options.storage || browserStorage;
    /** @type {WorkflowEntity|null} */
    this.activeWorkflow = null;
    /** @type {WorkflowEntity[]} */
    this.history = [];
    this.loadState();
  }

  loadState() {
    try {
      const raw = this.storage.getItem(WORKFLOW_STORAGE_KEY);
      if (raw) {
        this.activeWorkflow = JSON.parse(raw);
        this._normalizeWorkflow(this.activeWorkflow);
      }
      const histRaw = this.storage.getItem(WORKFLOW_HISTORY_KEY);
      if (histRaw) this.history = JSON.parse(histRaw) || [];
    } catch (e) {
      console.error('[WorkflowManager] Failed to load state:', e);
      this.activeWorkflow = null;
      this.history = [];
    }
  }

  saveState() {
    try {
      if (this.activeWorkflow) {
        this.storage.setItem(WORKFLOW_STORAGE_KEY, JSON.stringify(this.activeWorkflow));
      } else {
        this.storage.removeItem(WORKFLOW_STORAGE_KEY);
      }
      this.storage.setItem(WORKFLOW_HISTORY_KEY, JSON.stringify(this.history.slice(-MAX_HISTORY)));
    } catch (e) {
      console.error('[WorkflowManager] Failed to save state:', e);
    }
  }

  _normalizeWorkflow(workflow) {
    if (!workflow) return;
    if (!Array.isArray(workflow.activities)) workflow.activities = [];
    if (!Array.isArray(workflow.supportingTools)) workflow.supportingTools = [];
    if (!Array.isArray(workflow.keywords)) workflow.keywords = [];
    if (!workflow.context) {
      workflow.context = { keywords: [], activeFiles: [], domains: [], apps: [] };
    }
    if (!Array.isArray(workflow.context.apps)) workflow.context.apps = [];
    if (!Array.isArray(workflow.context.domains)) workflow.context.domains = [];
    if (!Array.isArray(workflow.context.keywords)) workflow.context.keywords = [];
    workflow.locked = !!workflow.locked;
    workflow.confidence = workflow.confidence ?? workflow.ownershipScore ?? 0;
  }

  _normalizeActivity(activity) {
    const ts = activity.timestamp
      || (activity.started_at
        ? (typeof activity.started_at === 'number'
          ? (activity.started_at > 1e10 ? activity.started_at : activity.started_at * 1000)
          : new Date(activity.started_at).getTime())
        : Date.now());

    return {
      id: activity.id || `act_${ts}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: ts,
      app_name: activity.app_name || activity.appName || '',
      window_title: activity.window_title || activity.title || '',
      url: activity.url || '',
      duration_seconds: activity.duration_seconds || activity.duration || 0,
    };
  }

  _workflowDurationMins(workflow) {
    if (!workflow?.startTime) return 0;
    const end = workflow.lastActivityTime || Date.now();
    return Math.max(0, (end - workflow.startTime) / 60000);
  }

  _evaluateLock(workflow) {
    const durationMins = this._workflowDurationMins(workflow);
    const shouldLock = workflow.confidence >= LOCK_CONFIDENCE_THRESHOLD && durationMins >= LOCK_DURATION_MINS;
    if (shouldLock && !workflow.locked) {
      workflow.locked = true;
      logWorkflowEvent(WORKFLOW_EVENTS.LOCKED, {
        workflowId: workflow.id,
        confidence: workflow.confidence,
        durationMins: Math.round(durationMins),
      });
    }
    return workflow.locked;
  }

  _mergeKeywords(workflow, keywords = []) {
    for (const kw of keywords) {
      if (kw && !workflow.keywords.includes(kw)) workflow.keywords.push(kw);
      if (kw && !workflow.context.keywords.includes(kw)) workflow.context.keywords.push(kw);
    }
  }

  _registerSupportingTool(workflow, appName, url) {
    const tool = normalizeToolName(appName);
    if (tool && !workflow.supportingTools.includes(tool)) {
      workflow.supportingTools.push(tool);
    }
    const domain = safeUrlHostname(url);
    if (domain && !workflow.context.domains.includes(domain)) {
      workflow.context.domains.push(domain);
    }
    if (isSupportingToolContext(appName, url)) {
      logWorkflowEvent(WORKFLOW_EVENTS.SUPPORTING_TOOL, {
        workflowId: workflow.id,
        app: tool,
        url: domain || url,
      });
    }
  }

  _appendContext(workflow, activity) {
    const app = normalizeToolName(activity.app_name);
    if (app) {
      const existing = workflow.context.apps.find(a => normalizeToolName(a.name) === app);
      if (existing) {
        existing.duration += activity.duration_seconds || 0;
      } else {
        workflow.context.apps.push({ name: activity.app_name, duration: activity.duration_seconds || 0 });
      }
      this._registerSupportingTool(workflow, activity.app_name, activity.url);
    }

    const domain = safeUrlHostname(activity.url);
    if (domain && !workflow.context.domains.includes(domain)) {
      workflow.context.domains.push(domain);
    }

    const titleKws = (activity.window_title || '').split(/\s+/).filter(k => k.length > 2);
    this._mergeKeywords(workflow, titleKws);

    const identity = extractWorkflowIdentity(activity);
    this._mergeKeywords(workflow, identity.keywords || []);
    if (identity.label && identity.label !== 'unknown' && !workflow.objective) {
      workflow.objective = identity.label;
    }
  }

  startNewWorkflow(initialActivity, project = null, breakReason = null) {
    const activity = this._normalizeActivity(initialActivity);
    const now = activity.timestamp;
    const identity = extractWorkflowIdentity(activity);
    const workflowName = identity.label && identity.label !== 'unknown' ? identity.label : 'Untitled Workflow';

    /** @type {WorkflowEntity} */
    const workflow = {
      id: `wf_${now}_${Math.random().toString(36).slice(2, 9)}`,
      name: workflowName,
      project: project || null,
      intent: identity.category || 'unknown',
      objective: identity.label !== 'unknown' ? identity.label : undefined,
      startTime: now,
      lastActivityTime: now,
      confidence: 0.5,
      locked: false,
      status: 'active',
      activities: [activity],
      supportingTools: [],
      keywords: [...(identity.keywords || [])],
      context: {
        keywords: [...(identity.keywords || [])],
        activeFiles: [],
        domains: safeUrlHostname(activity.url) ? [safeUrlHostname(activity.url)] : [],
        apps: [{ name: activity.app_name, duration: activity.duration_seconds || 0 }],
      },
      ownershipScore: 0.5,
      lastBreakReason: breakReason,
    };

    this._registerSupportingTool(workflow, activity.app_name, activity.url);
    this.activeWorkflow = workflow;
    this.saveState();

    logWorkflowEvent(WORKFLOW_EVENTS.STARTED, {
      workflowId: workflow.id,
      name: workflow.name,
      project: project?.name || project?.id || null,
      reason: breakReason || 'initial',
    });

    return workflow;
  }

  /**
   * Determine if workflow should split.
   * @returns {{ split: boolean, reason: string|null }}
   */
  _shouldSplitWorkflow(workflow, activity, confidence, project, options = {}) {
    if (options.forceSplit) return { split: true, reason: options.forceSplitReason || 'manual_stop' };
    if (options.calendarInterruption) return { split: true, reason: 'calendar_interruption' };

    const gapMins = Math.max(0, (activity.timestamp - workflow.lastActivityTime) / 60000);
    if (gapMins >= PROLONGED_IDLE_MINS) {
      return { split: true, reason: 'prolonged_idle' };
    }

    if (confidence < HARD_BREAK_CONFIDENCE) {
      return { split: true, reason: 'low_confidence_transition' };
    }

    const wfProjectId = workflow.project?.id || workflow.project;
    const newProjectId = project?.id || activity.project_id || null;
    if (wfProjectId && newProjectId && wfProjectId !== newProjectId) {
      return { split: true, reason: 'project_change' };
    }

    const identity = extractWorkflowIdentity(activity);
    if (
      workflow.objective &&
      identity.label &&
      identity.label !== 'unknown' &&
      identity.category !== 'utility' &&
      identity.category !== 'distraction' &&
      !workflow.keywords.some(k => identity.keywords?.includes(k)) &&
      identity.keywords?.length >= 2 &&
      confidence < 0.45
    ) {
      return { split: true, reason: 'objective_change' };
    }

    if (workflow.locked) {
      logWorkflowEvent(WORKFLOW_EVENTS.SESSION_CONTINUATION, {
        workflowId: workflow.id,
        reason: 'workflow_locked',
        confidence,
        app: activity.app_name,
      });
      return { split: false, reason: null };
    }

    if (isSupportingToolContext(activity.app_name, activity.url)) {
      logWorkflowEvent(WORKFLOW_EVENTS.SESSION_CONTINUATION, {
        workflowId: workflow.id,
        reason: 'supporting_tool_context',
        app: activity.app_name,
      });
      return { split: false, reason: null };
    }

    return { split: false, reason: null };
  }

  _continueWorkflow(workflow, activity, confidence) {
    workflow.activities.push(activity);
    workflow.lastActivityTime = activity.timestamp;
    workflow.confidence = confidence;
    workflow.ownershipScore = confidence;
    this._appendContext(workflow, activity);
    this._evaluateLock(workflow);
    this.saveState();

    logWorkflowEvent(WORKFLOW_EVENTS.CONTINUED, {
      workflowId: workflow.id,
      confidence,
      app: activity.app_name,
    });

    logWorkflowEvent(WORKFLOW_EVENTS.CONFIDENCE, {
      workflowId: workflow.id,
      confidence,
    });

    if (this._workflowDurationMins(workflow) > LOCK_DURATION_MINS) {
      logWorkflowEvent(WORKFLOW_EVENTS.EXTENDED, {
        workflowId: workflow.id,
        durationMins: Math.round(this._workflowDurationMins(workflow)),
        toolCount: workflow.supportingTools.length,
      });
    }

    return workflow;
  }

  /**
   * Core entry point — all workflow decisions flow through here.
   *
   * @param {WorkflowActivity} newActivity
   * @param {Object|null} project
   * @param {Object} [options]
   * @returns {{
   *   workflow: WorkflowEntity,
   *   isNew: boolean,
   *   breakReason: string|null,
   *   confidence: number,
   *   shouldFlushSegment: boolean,
   *   continued: boolean,
   * }}
   */
  processActivity(newActivity, project = null, options = {}) {
    const activity = this._normalizeActivity(newActivity);

    if (!this.activeWorkflow) {
      const workflow = this.startNewWorkflow(activity, project);
      return {
        workflow,
        isNew: true,
        breakReason: null,
        confidence: workflow.confidence,
        shouldFlushSegment: false,
        continued: false,
      };
    }

    const { score: confidence, breakdown } = calculateWorkflowConfidence(
      this.activeWorkflow,
      activity,
      project || this.activeWorkflow.project,
    );

    logWorkflowEvent(WORKFLOW_EVENTS.CONFIDENCE, {
      workflowId: this.activeWorkflow.id,
      confidence,
      breakdown,
      app: activity.app_name,
    });

    const { split, reason } = this._shouldSplitWorkflow(
      this.activeWorkflow,
      activity,
      confidence,
      project,
      options,
    );

    if (split) {
      logWorkflowEvent(WORKFLOW_EVENTS.SPLIT, {
        workflowId: this.activeWorkflow.id,
        reason,
        confidence,
      });
      logWorkflowEvent(WORKFLOW_EVENTS.SESSION_SPLIT, {
        workflowId: this.activeWorkflow.id,
        reason,
        fromApp: this.activeWorkflow.activities.at(-1)?.app_name,
        toApp: activity.app_name,
      });

      this.endActiveWorkflow(reason);
      const workflow = this.startNewWorkflow(activity, project, reason);
      return {
        workflow,
        isNew: true,
        breakReason: reason,
        confidence: workflow.confidence,
        shouldFlushSegment: true,
        continued: false,
      };
    }

    const workflow = this._continueWorkflow(this.activeWorkflow, activity, confidence);
    return {
      workflow,
      isNew: false,
      breakReason: null,
      confidence,
      shouldFlushSegment: options.contextChanged === true,
      continued: true,
    };
  }

  endActiveWorkflow(reason = null) {
    if (!this.activeWorkflow) return;
    this.activeWorkflow.status = 'completed';
    this.activeWorkflow.lastBreakReason = reason;
    this.history.push({ ...this.activeWorkflow, completedAt: Date.now() });
    if (this.history.length > MAX_HISTORY) {
      this.history = this.history.slice(-MAX_HISTORY);
    }
    logWorkflowEvent(WORKFLOW_EVENTS.SPLIT, {
      workflowId: this.activeWorkflow.id,
      reason: reason || 'completed',
      activityCount: this.activeWorkflow.activities.length,
    });
    this.activeWorkflow = null;
    this.saveState();
  }

  pauseActiveWorkflow(reason = 'paused') {
    if (!this.activeWorkflow) return;
    this.activeWorkflow.status = 'paused';
    this.activeWorkflow.lastBreakReason = reason;
    this.saveState();
  }

  resumeActiveWorkflow() {
    if (!this.activeWorkflow) return;
    this.activeWorkflow.status = 'active';
    this.saveState();
  }

  getActiveWorkflow() {
    return this.activeWorkflow;
  }

  getWorkflowHistory() {
    return [...this.history];
  }

  getWorkflowContextForAI() {
    const wf = this.activeWorkflow;
    if (!wf) return null;
    return {
      id: wf.id,
      name: wf.name,
      project: wf.project,
      intent: wf.intent,
      objective: wf.objective,
      primaryCategory: wf.intent,
      keywords: wf.keywords,
      supportingTools: wf.supportingTools,
      domains: wf.context?.domains || [],
      apps: (wf.context?.apps || []).map(a => a.name),
      lastActivityTime: wf.lastActivityTime,
      totalDurationMins: this._workflowDurationMins(wf),
      confidence: wf.confidence,
      locked: wf.locked,
      ownershipScore: wf.confidence,
    };
  }

  /** Validate continuity before allowing external session splits. */
  validateContinuityBeforeSplit(activity, project = null) {
    if (!this.activeWorkflow) return { allowSplit: true, reason: 'no_active_workflow' };
    const { score } = calculateWorkflowConfidence(this.activeWorkflow, this._normalizeActivity(activity), project);
    if (this.activeWorkflow.locked) {
      return { allowSplit: false, reason: 'workflow_locked', confidence: score };
    }
    if (score >= HARD_BREAK_CONFIDENCE) {
      return { allowSplit: false, reason: 'confidence_sufficient', confidence: score };
    }
    return { allowSplit: true, reason: 'confidence_below_threshold', confidence: score };
  }
}

export const workflowManager = new WorkflowManager();
export { WorkflowManager, LOCK_CONFIDENCE_THRESHOLD, LOCK_DURATION_MINS, HARD_BREAK_CONFIDENCE };
