/**
 * Timer AI Engine — Main Orchestrator
 * Coordinates all timer AI subsystems for a unified intelligence API.
 * Used by useTimerAI hook to provide real-time and post-session intelligence.
 */

import { inferWorkflow, mergeWorkflowFromSessions } from './workflowIntelligenceEngine.js';
import { computeLiveFocusQuality, computeFocusQuality } from './focusQualityEngine.js';
import { detectFlowState, detectLiveFlowState } from './flowStateEngine.js';
import { detectContinuity, detectProjectRecurrence, detectWorkflowContinuity } from './sessionContinuityEngine.js';
import { generateRecommendation, buildProductivitySummary, analyzeContextSwitching, deriveProductivityState } from './productivityReasoningEngine.js';
import { buildLiveInsights, buildPostSessionInsights, getLiveWorkflowDescription, getConfidenceLabel, buildScoreCard } from './timerInsightsEngine.js';
import { finalizeSession, generateSessionRecommendation } from './sessionFinalizationEngine.js';

// ─── Real-time analysis (called every heartbeat tick) ─────────────────────────
export function analyzeRealTime({
  heartbeat,
  elapsedSecs,
  recentAutoSessions = [],
  recentSessions = [],
  currentSession = null,
  projectContext = null,
  sessionCountToday = 0,
}) {
  // 1. Infer current workflow from live data
  const workflow = inferWorkflow(heartbeat, recentAutoSessions, projectContext);

  // 2. Compute live focus quality
  const focusQuality = elapsedSecs >= 120
    ? computeLiveFocusQuality(heartbeat, elapsedSecs, recentAutoSessions)
    : { overall: 0, label: 'Starting', color: '#94A3B8', deepWorkScore: 0, contextSwitchScore: 100, switchesPerHour: 0, breakdown: null };

  // 3. Detect live flow state
  const recentSwitches = countRecentSwitches(recentAutoSessions, 600); // last 10 min
  const flowState = detectLiveFlowState(heartbeat, elapsedSecs, recentSwitches);

  // 4. Detect session continuity
  const continuity = elapsedSecs < 60
    ? detectContinuity(currentSession, recentAutoSessions, recentSessions)
    : null;

  // 5. Detect project recurrence
  const projectRecurrence = currentSession?.project_id
    ? detectProjectRecurrence(currentSession.project_id, recentSessions)
    : null;

  // 6. Derive productivity state
  const productivityState = deriveProductivityState(focusQuality, flowState, elapsedSecs);

  // 7. Context switching analysis
  const contextSwitching = analyzeContextSwitching(recentAutoSessions, elapsedSecs);

  // 8. Generate recommendation
  const recommendation = elapsedSecs >= 300
    ? generateRecommendation(flowState, focusQuality, contextSwitching, elapsedSecs, {
        sessionCountToday,
      })
    : null;

  // 9. Build live insights
  const insights = buildLiveInsights({
    workflow, flowState, focusQuality, continuity,
    elapsedSecs, heartbeat, projectContext,
  });

  // 10. Live workflow description
  const workflowDescription = getLiveWorkflowDescription(workflow, heartbeat, elapsedSecs);

  // 11. Productivity summary
  const productivitySummary = elapsedSecs >= 180
    ? buildProductivitySummary(focusQuality, flowState, recentAutoSessions, elapsedSecs)
    : null;

  return {
    workflow,
    focusQuality,
    flowState,
    continuity,
    projectRecurrence,
    productivityState,
    contextSwitching,
    recommendation,
    insights,
    workflowDescription,
    productivitySummary,
    confidence: workflow.confidence,
    confidenceLabel: getConfidenceLabel(workflow.confidence),
  };
}

// ─── Post-session finalization (called once on session stop) ──────────────────
export function finalizeSessionIntelligence({
  session,
  autoSessions = [],
  recentSessions = [],
}) {
  // Run full finalization pipeline
  const finalized = finalizeSession(session, autoSessions, recentSessions);
  if (!finalized) return null;

  const durationSecs = session.duration_seconds ||
    ((session.ended_at || Math.floor(Date.now() / 1000)) - session.started_at);

  // Post-session insights
  const postInsights = buildPostSessionInsights({ finalizedSession: finalized, durationSecs });

  // Score card
  const scoreCard = buildScoreCard(finalized.focusQuality, durationSecs);

  // Recommendation
  const recommendation = generateSessionRecommendation(
    postInsights, finalized.flowState, finalized.focusQuality
  );

  return {
    ...finalized,
    postInsights,
    scoreCard,
    recommendation,
    durationSecs,
  };
}

// ─── Auto-session project inference ──────────────────────────────────────────
export function inferProjectFromAutoSessions(autoSessions = [], projects = []) {
  if (!projects.length || !autoSessions.length) return null;

  // Count app patterns per project
  const scores = {};
  for (const project of projects) {
    scores[project.id] = 0;
    const name = (project.name || '').toLowerCase();
    for (const s of autoSessions) {
      const title = (s.window_title || '').toLowerCase();
      const url   = (s.url || '').toLowerCase();
      if (title.includes(name) || url.includes(name)) scores[project.id] += 2;
      if (title.includes(name.split(/\s+/)[0])) scores[project.id] += 1;
    }
  }

  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  if (!best || best[1] === 0) return null;
  const project = projects.find(p => p.id === best[0]);
  return project ? { projectId: project.id, projectName: project.name, confidence: Math.min(0.9, best[1] * 0.15) } : null;
}

// ─── Session merging logic ────────────────────────────────────────────────────
export function detectMergeableSessionGroup(sessions = []) {
  if (sessions.length < 2) return null;

  const sorted = [...sessions].sort((a, b) => a.started_at - b.started_at);
  const groups = [];
  let current = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    const prevEnd = prev.ended_at || (prev.started_at + (prev.duration_seconds || 0));
    const gap = curr.started_at - prevEnd;

    // Same workflow + <20 min gap → merge candidate
    const sameCategory = curr.category === prev.category;
    const sameProject  = curr.project_id && curr.project_id === prev.project_id;
    if ((sameCategory || sameProject) && gap < 1200) {
      current.push(curr);
    } else {
      if (current.length >= 2) groups.push(current);
      current = [curr];
    }
  }
  if (current.length >= 2) groups.push(current);

  return groups.length > 0 ? groups : null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function countRecentSwitches(autoSessions, windowSecs) {
  const cutoff = Math.floor(Date.now() / 1000) - windowSecs;
  const recent = autoSessions.filter(s => s.started_at >= cutoff);
  let n = 0;
  for (let i = 1; i < recent.length; i++) {
    if (recent[i].app_name !== recent[i - 1].app_name) n++;
  }
  return n;
}

// ─── Productivity scoring for analytics integration ───────────────────────────
export function computeSessionProductivityMetrics(session, autoSessions = []) {
  const durationSecs = session.duration_seconds ||
    ((session.ended_at || Math.floor(Date.now() / 1000)) - session.started_at);

  const fq = computeFocusQuality(autoSessions, durationSecs);
  const fs = detectFlowState(autoSessions, durationSecs, fq.overall);
  const workflow = mergeWorkflowFromSessions(autoSessions, session);

  return {
    focusScore: fq.overall,
    deepWorkPct: fq.breakdown?.deepPct || 0,
    contextSwitchScore: fq.contextSwitchScore,
    flowStateId: fs.id,
    flowStateLabel: fs.label,
    workflowType: workflow?.dominantType || 'other',
    workflowProject: workflow?.primaryProject || null,
    switchesPerHour: fq.switchesPerHour,
  };
}
