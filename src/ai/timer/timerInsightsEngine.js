/**
 * Timer Insights Engine
 * Generates per-session AI insight cards shown in the Timer UI.
 * Each insight is a concise, human-readable data point.
 */

import { FLOW_STATES } from './flowStateEngine.js';

// ─── Insight card types ───────────────────────────────────────────────────────
export const INSIGHT_TYPES = {
  WORKFLOW:       'workflow',
  FOCUS_QUALITY:  'focus_quality',
  FLOW_STATE:     'flow_state',
  CONTINUITY:     'continuity',
  CONTEXT_SWITCH: 'context_switch',
  DEEP_WORK:      'deep_work',
  RECOMMENDATION: 'recommendation',
  PROJECT:        'project',
  DURATION:       'duration',
};

// ─── Build live insights for active session ────────────────────────────────────
export function buildLiveInsights({ workflow, flowState, focusQuality, continuity, elapsedSecs, heartbeat, projectContext }) {
  const insights = [];
  const mins = Math.round(elapsedSecs / 60);

  // 1. Workflow detected
  if (workflow?.label) {
    insights.push({
      type:    INSIGHT_TYPES.WORKFLOW,
      icon:    '⚙',
      label:   'Workflow Detected',
      value:   workflow.label,
      sub:     `${Math.round((workflow.confidence || 0) * 100)}% confidence`,
      color:   '#818CF8',
      priority: 10,
    });
  }

  // 2. Flow state
  if (flowState && elapsedSecs >= 120) {
    const fs = flowState;
    insights.push({
      type:     INSIGHT_TYPES.FLOW_STATE,
      icon:     fs.icon || '●',
      label:    'Focus State',
      value:    fs.label,
      sub:      fs.reason || fs.description,
      color:    fs.color,
      pulse:    fs.pulse,
      priority: 9,
    });
  }

  // 3. Focus quality (after 5 min)
  if (elapsedSecs >= 300 && focusQuality?.overall > 0) {
    const fq = focusQuality;
    insights.push({
      type:     INSIGHT_TYPES.FOCUS_QUALITY,
      icon:     '◉',
      label:    'Focus Quality',
      value:    `${fq.overall}/100`,
      sub:      fq.label,
      color:    fq.color,
      score:    fq.overall,
      priority: 8,
    });
  }

  // 4. Continuity
  if (continuity?.isContinuation) {
    insights.push({
      type:     INSIGHT_TYPES.CONTINUITY,
      icon:     '↩',
      label:    'Session Continuity',
      value:    continuity.verb,
      sub:      continuity.prevTitle,
      color:    '#34D399',
      priority: 7,
    });
  }

  // 5. Project detected
  if (workflow?.projectName) {
    insights.push({
      type:     INSIGHT_TYPES.PROJECT,
      icon:     '◆',
      label:    'Project',
      value:    workflow.projectName,
      sub:      workflow.urlContext || workflow.action || '',
      color:    projectContext?.color || '#A78BFA',
      priority: 6,
    });
  }

  // 6. Context switching (show warning if high)
  if (elapsedSecs >= 300 && focusQuality?.switchesPerHour >= 8) {
    insights.push({
      type:     INSIGHT_TYPES.CONTEXT_SWITCH,
      icon:     '⇄',
      label:    'Context Switching',
      value:    `${Math.round(focusQuality.switchesPerHour)}/hr`,
      sub:      focusQuality.switchesPerHour >= 14 ? 'High — reducing deep focus' : 'Moderate',
      color:    focusQuality.switchesPerHour >= 14 ? '#F87171' : '#FBBF24',
      priority: 5,
    });
  }

  // 7. Deep work indicator
  if (elapsedSecs >= 600 && focusQuality?.breakdown?.deepPct >= 60) {
    insights.push({
      type:     INSIGHT_TYPES.DEEP_WORK,
      icon:     '⚡',
      label:    'Deep Work',
      value:    `${focusQuality.breakdown.deepPct}%`,
      sub:      `of ${mins}m in deep focus`,
      color:    '#6366F1',
      priority: 4,
    });
  }

  // Sort by priority, take top 4
  return insights.sort((a, b) => b.priority - a.priority).slice(0, 4);
}

// ─── Build post-session insights ──────────────────────────────────────────────
export function buildPostSessionInsights({ finalizedSession, durationSecs }) {
  if (!finalizedSession) return [];
  const { insights: sessionInsights, workflow, focusQuality, flowState } = finalizedSession;

  const insights = [];
  const mins = Math.round(durationSecs / 60);

  // Key objective
  insights.push({
    type:   INSIGHT_TYPES.WORKFLOW,
    icon:   '🎯',
    label:  'Key Objective',
    value:  sessionInsights?.find(i => i.type === 'objective')?.value || workflow?.label || 'Focused Work',
    color:  '#818CF8',
  });

  // Focus quality
  if (focusQuality) {
    insights.push({
      type:   INSIGHT_TYPES.FOCUS_QUALITY,
      icon:   '◉',
      label:  'Focus Quality',
      value:  `${focusQuality.overall}/100`,
      sub:    focusQuality.label,
      color:  focusQuality.color,
      score:  focusQuality.overall,
    });
  }

  // Flow state
  if (flowState) {
    insights.push({
      type:   INSIGHT_TYPES.FLOW_STATE,
      icon:   flowState.icon || '●',
      label:  'Flow State',
      value:  flowState.label,
      color:  flowState.color,
    });
  }

  // Deep work
  if (focusQuality?.breakdown?.deepPct > 0) {
    insights.push({
      type:   INSIGHT_TYPES.DEEP_WORK,
      icon:   '⚡',
      label:  'Deep Work',
      value:  `${focusQuality.breakdown.deepPct}%`,
      sub:    `${Math.round(focusQuality.breakdown.deepSecs / 60)}m of ${mins}m`,
      color:  '#6366F1',
    });
  }

  return insights;
}

// ─── Real-time workflow description for display ────────────────────────────────
export function getLiveWorkflowDescription(workflow, heartbeat, elapsedSecs) {
  if (!workflow?.label || elapsedSecs < 30) {
    return heartbeat?.appName ? `Using ${heartbeat.appName}` : 'Watching for activity…';
  }
  return workflow.label;
}

// ─── Confidence bar label ─────────────────────────────────────────────────────
export function getConfidenceLabel(confidence) {
  if (confidence >= 0.90) return 'High';
  if (confidence >= 0.70) return 'Good';
  if (confidence >= 0.50) return 'Medium';
  return 'Low';
}

// ─── Session score card (for notification / post-session display) ─────────────
export function buildScoreCard(focusQuality, durationSecs) {
  const { overall: score } = focusQuality;
  const mins = Math.round(durationSecs / 60);
  let label, color;
  if (score >= 90) { label = 'Exceptional'; color = '#818CF8'; }
  else if (score >= 80) { label = 'Deep Flow';    color = '#6366F1'; }
  else if (score >= 70) { label = 'High Focus';   color = '#34D399'; }
  else if (score >= 55) { label = 'Focused';      color = '#FBBF24'; }
  else if (score >= 40) { label = 'Moderate';     color = '#F97316'; }
  else                  { label = 'Low Focus';    color = '#EF4444'; }
  return { score, label, color, mins, durationSecs };
}
