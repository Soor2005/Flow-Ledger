/**
 * WorkflowConfidenceEngine — Phase 1
 *
 * Application changes have minimal impact (5%). Confidence is driven by
 * intent, project alignment, and historical continuity.
 *
 * Weights:
 *   Intent Similarity      35%
 *   Project Similarity     30%
 *   Historical Continuity  20%
 *   Semantic Similarity    10%
 *   Application Similarity  5%
 */

import { extractWorkflowIdentity } from '../engines/workflowDominanceEngine.js';
import { isSupportingToolContext } from '../config/supportingTools.js';

const WEIGHTS = {
  intent:      0.35,
  project:     0.30,
  continuity:  0.20,
  semantic:    0.10,
  application: 0.05,
};

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'for', 'with', 'from', 'this', 'that',
  'new', 'tab', 'window', 'file', 'page', 'app', 'auto', 'http', 'https',
]);

function norm(str = '') {
  return String(str || '').toLowerCase().trim();
}

function activityTimestamp(activity) {
  if (activity.timestamp) return activity.timestamp;
  if (activity.started_at) {
    const v = activity.started_at;
    return typeof v === 'number' ? (v > 1e10 ? v : v * 1000) : new Date(v).getTime();
  }
  return Date.now();
}

function extractKeywords(text = '') {
  return text
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .map(w => w.toLowerCase().trim())
    .filter(w => w.length >= 3 && !STOP_WORDS.has(w));
}

function jaccardSimilarity(a = [], b = []) {
  if (!a.length || !b.length) return 0;
  const setB = new Set(b);
  const shared = a.filter(x => setB.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return union > 0 ? shared / union : 0;
}

function scoreIntentSimilarity(workflow, activity) {
  const identity = extractWorkflowIdentity(normalizeActivity(activity));
  const wfIntent = norm(workflow.intent || workflow.primaryCategory || '');
  const actIntent = norm(identity.category || 'work');

  if (wfIntent && actIntent && (wfIntent === actIntent || wfIntent.includes(actIntent) || actIntent.includes(wfIntent))) {
    return 0.95;
  }

  if (isSupportingToolContext(activity.app_name || activity.appName, activity.url)) {
    return 0.85;
  }

  const wfKeywords = workflow.keywords || [];
  const actKeywords = identity.keywords || [];
  const overlap = jaccardSimilarity(wfKeywords, actKeywords);
  return Math.min(0.5 + overlap * 0.5, 1);
}

function scoreProjectSimilarity(workflow, activity, project) {
  const wfProject = workflow.project?.id || workflow.project?.name || workflow.project || null;
  const actProject = project?.id || project?.name || activity.project_id || activity.project?.id || null;

  if (wfProject && actProject) {
    if (wfProject === actProject) return 1;
    if (norm(String(wfProject)) === norm(String(actProject))) return 1;
    return 0.1;
  }

  if (wfProject || actProject) return 0.55;

  const wfName = norm(workflow.project?.name || workflow.name || '');
  const actText = norm(`${activity.window_title || activity.title || ''} ${activity.url || ''}`);
  if (wfName && wfName.length >= 3 && actText.includes(wfName)) return 0.8;

  return 0.6;
}

function scoreHistoricalContinuity(workflow, activity) {
  const lastTime = workflow.lastActivityTime || workflow.startTime || 0;
  const actTime = activityTimestamp(activity);
  const gapMins = Math.max(0, (actTime - lastTime) / 60000);

  if (gapMins < 2) return 1;
  if (gapMins < 10) return 0.85;
  if (gapMins < 20) return 0.7;
  if (gapMins < 30) return 0.5;
  return 0.2;
}

function scoreSemanticSimilarity(workflow, activity) {
  const identity = extractWorkflowIdentity(normalizeActivity(activity));
  const wfKeywords = [
    ...(workflow.keywords || []),
    ...extractKeywords(workflow.name || ''),
    ...extractKeywords(workflow.objective || ''),
  ];
  const actKeywords = [
    ...(identity.keywords || []),
    ...extractKeywords(activity.window_title || activity.title || ''),
    ...extractKeywords(activity.url || ''),
  ];
  return jaccardSimilarity(wfKeywords, actKeywords);
}

function scoreApplicationSimilarity(workflow, activity) {
  const app = norm(activity.app_name || activity.appName || '');
  const wfApps = (workflow.supportingTools || workflow.context?.apps || []).map(a =>
    norm(typeof a === 'string' ? a : a.name)
  );

  if (wfApps.includes(app)) return 1;
  if (isSupportingToolContext(app, activity.url)) return 0.9;
  if (wfApps.length === 0) return 0.5;
  return 0.35;
}

function normalizeActivity(activity) {
  return {
    app_name: activity.app_name || activity.appName || '',
    window_title: activity.window_title || activity.title || '',
    url: activity.url || '',
    duration_seconds: activity.duration_seconds || activity.duration || 0,
    started_at: activity.started_at,
    timestamp: activity.timestamp,
  };
}

/**
 * @param {import('./WorkflowManager.js').WorkflowEntity|null} workflow
 * @param {Object} activity
 * @param {Object|null} project
 * @returns {{ score: number, breakdown: Object }}
 */
export function calculateWorkflowConfidence(workflow, activity, project = null) {
  if (!workflow || !activity) {
    return { score: 0, breakdown: {} };
  }

  const breakdown = {
    intent:      scoreIntentSimilarity(workflow, activity),
    project:     scoreProjectSimilarity(workflow, activity, project),
    continuity:  scoreHistoricalContinuity(workflow, activity),
    semantic:    scoreSemanticSimilarity(workflow, activity),
    application: scoreApplicationSimilarity(workflow, activity),
  };

  const score = (
    breakdown.intent      * WEIGHTS.intent +
    breakdown.project     * WEIGHTS.project +
    breakdown.continuity  * WEIGHTS.continuity +
    breakdown.semantic    * WEIGHTS.semantic +
    breakdown.application * WEIGHTS.application
  );

  return {
    score: Math.min(Math.max(score, 0), 1),
    breakdown,
  };
}

export { WEIGHTS };
