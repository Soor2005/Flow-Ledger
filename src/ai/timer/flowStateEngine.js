/**
 * Flow State Engine
 * Detects real-time and historical flow/cognitive states from session data.
 * 7 states: deep_flow, high_momentum, focused, research_mode, planning_state,
 *           context_switching, recovery_needed
 */

import { computeFocusQuality } from './focusQualityEngine.js';

// ─── Flow State Definitions ───────────────────────────────────────────────────
export const FLOW_STATES = {
  deep_flow: {
    id:      'deep_flow',
    label:   'Deep Flow',
    icon:    '⚡',
    color:   '#818CF8',
    bg:      'rgba(129,140,248,0.12)',
    border:  'rgba(129,140,248,0.30)',
    pulse:   true,
    description: 'Sustained high-intensity focus with minimal interruptions.',
  },
  high_momentum: {
    id:      'high_momentum',
    label:   'High Momentum',
    icon:    '🚀',
    color:   '#34D399',
    bg:      'rgba(52,211,153,0.10)',
    border:  'rgba(52,211,153,0.25)',
    pulse:   false,
    description: 'Strong productive rhythm across tools and tasks.',
  },
  focused: {
    id:      'focused',
    label:   'Focused Work',
    icon:    '🎯',
    color:   '#7C6CF2',
    bg:      'rgba(124,108,242,0.10)',
    border:  'rgba(124,108,242,0.25)',
    pulse:   false,
    description: 'Consistent productive activity with good focus quality.',
  },
  research_mode: {
    id:      'research_mode',
    label:   'Research Mode',
    icon:    '🔬',
    color:   '#60A5FA',
    bg:      'rgba(96,165,250,0.10)',
    border:  'rgba(96,165,250,0.25)',
    pulse:   false,
    description: 'Broad information gathering and synthesis.',
  },
  planning_state: {
    id:      'planning_state',
    label:   'Planning Mode',
    icon:    '📋',
    color:   '#A78BFA',
    bg:      'rgba(167,139,250,0.10)',
    border:  'rgba(167,139,250,0.25)',
    pulse:   false,
    description: 'Strategy, organization, and decision-making work.',
  },
  context_switching: {
    id:      'context_switching',
    label:   'Context Switching',
    icon:    '🔀',
    color:   '#FBBF24',
    bg:      'rgba(251,191,36,0.10)',
    border:  'rgba(251,191,36,0.25)',
    pulse:   false,
    description: 'Frequent attention shifts reducing deep focus capacity.',
  },
  recovery_needed: {
    id:      'recovery_needed',
    label:   'Recovery Needed',
    icon:    '☕',
    color:   '#F87171',
    bg:      'rgba(248,113,113,0.10)',
    border:  'rgba(248,113,113,0.25)',
    pulse:   true,
    description: 'High fatigue or sustained output — rest recommended.',
  },
};

// ─── App Category Rules ───────────────────────────────────────────────────────
const DEEP_WORK_PATTERNS   = /code|cursor|vim|studio|intellij|xcode|rider|webstorm|sublime|figma|sketch|photoshop|illustrator|affinity|blender|premiere|final cut|terminal|iterm|warp|powershell|notion|obsidian|bear|scrivener|ulysses|typora/i;
const RESEARCH_PATTERNS    = /chrome|firefox|safari|edge|brave|arc|claude|chatgpt|perplexity|gemini/i;
const PLANNING_PATTERNS    = /linear|jira|asana|trello|clickup|monday|height|shortcut|basecamp/i;
const COMM_PATTERNS        = /slack|discord|telegram|whatsapp|signal|teams|zoom|meet|webex/i;

function classifyAppStream(autoSessions) {
  const cats = { deep: 0, research: 0, planning: 0, comm: 0, other: 0 };
  for (const s of autoSessions) {
    const app = s.app_name || '';
    const secs = s.duration_seconds || 30;
    if (DEEP_WORK_PATTERNS.test(app))  cats.deep     += secs;
    else if (RESEARCH_PATTERNS.test(app)) cats.research += secs;
    else if (PLANNING_PATTERNS.test(app)) cats.planning += secs;
    else if (COMM_PATTERNS.test(app))     cats.comm     += secs;
    else                                   cats.other    += secs;
  }
  return cats;
}

function countContextSwitches(autoSessions) {
  let switches = 0;
  for (let i = 1; i < autoSessions.length; i++) {
    if (autoSessions[i].app_name !== autoSessions[i - 1].app_name) switches++;
  }
  return switches;
}

function longestDeepStreak(autoSessions) {
  let max = 0, cur = 0;
  for (const s of autoSessions) {
    if (DEEP_WORK_PATTERNS.test(s.app_name || '')) {
      cur += s.duration_seconds || 0;
    } else {
      if (cur > max) max = cur;
      cur = 0;
    }
  }
  return Math.max(max, cur);
}

// ─── Main state detector ──────────────────────────────────────────────────────
export function detectFlowState(autoSessions = [], elapsedSecs = 0, qualityScore = 0, opts = {}) {
  const totalSecs  = autoSessions.reduce((a, s) => a + (s.duration_seconds || 0), 0) || elapsedSecs;
  const totalMins  = totalSecs / 60;

  if (totalSecs < 120) {
    // Too early to classify — return neutral 'focused'
    return { ...FLOW_STATES.focused, confidence: 0.3, reason: 'Session just started' };
  }

  const cats        = classifyAppStream(autoSessions);
  const switches    = countContextSwitches(autoSessions);
  const switchRate  = totalMins > 0 ? (switches / totalMins) * 60 : 0; // switches/hr
  const deepStreak  = longestDeepStreak(autoSessions);
  const deepPct     = totalSecs > 0 ? cats.deep / totalSecs : 0;
  const researchPct = totalSecs > 0 ? cats.research / totalSecs : 0;
  const planningPct = totalSecs > 0 ? cats.planning / totalSecs : 0;
  const commPct     = totalSecs > 0 ? cats.comm / totalSecs : 0;

  const { burnoutSignal = false, sessionCountToday = 0 } = opts;

  // ── Rule cascade ─────────────────────────────────────────────────────────
  // 1. Recovery needed
  if (burnoutSignal || (sessionCountToday >= 6 && totalMins > 45)) {
    return { ...FLOW_STATES.recovery_needed, confidence: 0.80, reason: 'Extended session count detected' };
  }

  // 2. Deep Flow: 60+ min deep streak, quality ≥ 75, low switches
  if (deepStreak >= 3600 && qualityScore >= 75 && switchRate < 6) {
    return { ...FLOW_STATES.deep_flow, confidence: 0.92, reason: `${Math.round(deepStreak/60)}m sustained deep work` };
  }

  // 3. High Momentum: quality ≥ 65, mostly deep, moderate switches
  if (qualityScore >= 65 && deepPct >= 0.55 && switchRate < 10 && totalMins >= 25) {
    return { ...FLOW_STATES.high_momentum, confidence: 0.85, reason: 'Consistent deep productivity detected' };
  }

  // 4. Context Switching: high switch rate
  if (switchRate >= 15 || (switches >= 12 && totalMins < 30)) {
    return { ...FLOW_STATES.context_switching, confidence: 0.88, reason: `${Math.round(switchRate)} switches/hr detected` };
  }

  // 5. Research Mode: mostly browser/AI tools
  if (researchPct >= 0.50 && deepPct < 0.30) {
    return { ...FLOW_STATES.research_mode, confidence: 0.82, reason: `${Math.round(researchPct * 100)}% research activity` };
  }

  // 6. Planning Mode: mostly planning tools
  if (planningPct >= 0.40) {
    return { ...FLOW_STATES.planning_state, confidence: 0.80, reason: 'Planning tool dominance detected' };
  }

  // 7. Focused (general productive state)
  if (deepPct >= 0.35 || qualityScore >= 45) {
    return { ...FLOW_STATES.focused, confidence: 0.72, reason: 'Productive work pattern detected' };
  }

  // Default: moderate context switch or low data
  if (switchRate >= 8) {
    return { ...FLOW_STATES.context_switching, confidence: 0.60, reason: 'Elevated context switching' };
  }

  return { ...FLOW_STATES.focused, confidence: 0.50, reason: 'Mixed activity pattern' };
}

// ─── Flow state from heartbeat only (real-time, no history) ──────────────────
export function detectLiveFlowState(heartbeat, elapsedSecs, recentSwitches = 0) {
  if (!heartbeat?.appName || elapsedSecs < 60) {
    return { ...FLOW_STATES.focused, confidence: 0.3, reason: 'Initializing' };
  }

  const app = heartbeat.appName;
  const isDeep     = DEEP_WORK_PATTERNS.test(app);
  const isResearch = RESEARCH_PATTERNS.test(app);
  const isPlanning = PLANNING_PATTERNS.test(app);
  const switchRate = elapsedSecs > 0 ? (recentSwitches / (elapsedSecs / 3600)) : 0;

  if (isDeep && elapsedSecs >= 2700 && switchRate < 8) {
    return { ...FLOW_STATES.deep_flow, confidence: 0.78, reason: 'Sustained deep work app' };
  }
  if (isDeep && elapsedSecs >= 900) {
    return { ...FLOW_STATES.focused, confidence: 0.70, reason: 'Active deep work session' };
  }
  if (switchRate >= 15) {
    return { ...FLOW_STATES.context_switching, confidence: 0.75, reason: 'High switch rate' };
  }
  if (isResearch) {
    return { ...FLOW_STATES.research_mode, confidence: 0.68, reason: 'Research activity' };
  }
  if (isPlanning) {
    return { ...FLOW_STATES.planning_state, confidence: 0.68, reason: 'Planning activity' };
  }
  return { ...FLOW_STATES.focused, confidence: 0.50, reason: 'Active session' };
}

// ─── Historical flow pattern summary ─────────────────────────────────────────
export function summarizeFlowHistory(stateHistory = []) {
  if (!stateHistory.length) return null;
  const counts = {};
  for (const s of stateHistory) {
    counts[s.id] = (counts[s.id] || 0) + 1;
  }
  const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return {
    dominantState: dominant ? FLOW_STATES[dominant[0]] : null,
    stateDistribution: counts,
    totalRecorded: stateHistory.length,
  };
}
