/**
 * Productivity Reasoning Engine
 * Generates human-quality productivity analysis and recommendations
 * from session metrics. No LLMs — pure rule-based reasoning.
 */

// ─── Productivity state derivation ───────────────────────────────────────────
export function deriveProductivityState(focusQuality, flowState, elapsedSecs) {
  const { overall: score, contextSwitchScore, deepWorkScore } = focusQuality;
  const mins = elapsedSecs / 60;

  if (score >= 85 && mins >= 45) return { label: 'Peak Output', color: '#818CF8', icon: '⚡' };
  if (score >= 70 && mins >= 25) return { label: 'High Output',  color: '#34D399', icon: '🎯' };
  if (score >= 55)               return { label: 'Productive',   color: '#6EE7B7', icon: '✓' };
  if (contextSwitchScore < 40)   return { label: 'Fragmented',   color: '#FBBF24', icon: '🔀' };
  if (score >= 30)               return { label: 'Moderate',     color: '#94A3B8', icon: '→' };
  return                                 { label: 'Warming Up',  color: '#CBD5E1', icon: '○' };
}

// ─── Context switching analysis ───────────────────────────────────────────────
export function analyzeContextSwitching(autoSessions = [], elapsedSecs = 0) {
  if (!autoSessions.length) return { message: null, severity: 'none', count: 0, rate: 0 };

  let switches = 0;
  for (let i = 1; i < autoSessions.length; i++) {
    if (autoSessions[i].app_name !== autoSessions[i - 1].app_name) switches++;
  }
  const hours = elapsedSecs / 3600 || 1;
  const rate  = switches / hours;

  if (rate < 4)  return { message: `Excellent focus — only ${switches} context switch${switches !== 1 ? 'es' : ''} this session.`, severity: 'excellent', count: switches, rate };
  if (rate < 8)  return { message: `Moderate switching (${Math.round(rate)}/hr) — workflow is mostly stable.`, severity: 'good', count: switches, rate };
  if (rate < 14) return { message: `Context switching (${Math.round(rate)}/hr) is reducing deep focus capacity.`, severity: 'moderate', count: switches, rate };
  return               { message: `High context switching (${Math.round(rate)}/hr) — focus quality is significantly impacted.`, severity: 'high', count: switches, rate };
}

// ─── Deep work summary ────────────────────────────────────────────────────────
export function summarizeDeepWork(breakdown, elapsedSecs) {
  if (!breakdown) return null;
  const { deepPct, deepSecs } = breakdown;
  const mins = Math.round(deepSecs / 60);
  if (deepPct >= 80) return `${mins}m of deep focus work — excellent concentration.`;
  if (deepPct >= 60) return `${mins}m of deep work out of ${Math.round(elapsedSecs / 60)}m total — strong session.`;
  if (deepPct >= 40) return `${mins}m of deep work. ${Math.round((1 - deepPct / 100) * elapsedSecs / 60)}m on shallow tasks.`;
  if (deepPct > 0)   return `Limited deep work (${deepPct}%) — most activity was shallow or exploratory.`;
  return 'Session was primarily shallow or research-oriented work.';
}

// ─── AI-generated session recommendation ─────────────────────────────────────
export function generateRecommendation(flowState, focusQuality, contextSwitching, elapsedSecs, opts = {}) {
  const { id: stateId } = flowState;
  const { overall: score, deepWorkScore } = focusQuality;
  const { severity: ctxSeverity } = contextSwitching;
  const mins = elapsedSecs / 60;
  const { peakWindow = null, breakDueInMins = null } = opts;

  // Break recommendation
  if (breakDueInMins !== null && breakDueInMins <= 5 && mins >= 50) {
    return { text: `${Math.round(mins)}m session reached — a short break now will maintain performance.`, type: 'break' };
  }

  if (stateId === 'deep_flow' && score >= 85) {
    return { text: 'You\'re in deep flow — avoid interruptions and maintain this state as long as possible.', type: 'sustain' };
  }
  if (stateId === 'context_switching' || ctxSeverity === 'high') {
    return { text: 'Consider switching to a single deep-work app and eliminating chat/email notifications.', type: 'focus' };
  }
  if (stateId === 'recovery_needed') {
    return { text: 'Step away for 10–15 minutes. Continuous deep work without breaks reduces output quality.', type: 'break' };
  }
  if (deepWorkScore < 40 && score >= 45) {
    return { text: 'Open your primary work tool to shift from shallow to deep work mode.', type: 'deepen' };
  }
  if (score < 40 && mins >= 15) {
    return { text: 'Focus quality is low. Close non-essential tabs and minimize distractions.', type: 'focus' };
  }
  if (peakWindow && score >= 70) {
    return { text: `Peak focus window detected. ${peakWindow} is your optimal deep work time — use it well.`, type: 'peak' };
  }
  if (score >= 70) {
    return { text: 'Solid focus quality. Continue your current workflow for maximum output.', type: 'sustain' };
  }

  return { text: 'Track more focused work sessions to unlock personalized productivity insights.', type: 'general' };
}

// ─── Full productivity summary sentence ──────────────────────────────────────
export function buildProductivitySummary(focusQuality, flowState, autoSessions = [], elapsedSecs = 0) {
  const { overall: score, switchesPerHour } = focusQuality;
  const totalMins = Math.round(elapsedSecs / 60);
  const state = flowState.label;
  const deepMins = Math.round((focusQuality.breakdown?.deepSecs || 0) / 60);

  if (!autoSessions.length || elapsedSecs < 120) {
    return 'Session is initializing — tracking will begin shortly.';
  }

  let sentence = '';
  if (score >= 85) {
    sentence = `${state} state with ${deepMins}m of deep work.`;
  } else if (score >= 65) {
    sentence = `${totalMins}m productive session with ${deepMins}m deep focus.`;
  } else if (switchesPerHour >= 12) {
    sentence = `Session is fragmented — ${Math.round(switchesPerHour)} tool switches per hour.`;
  } else {
    sentence = `${totalMins}m session. Focus score ${score}/100.`;
  }

  const apps = [...new Set(autoSessions.map(s => s.app_name).filter(Boolean))];
  if (apps.length === 1) sentence += ` Single-tool focus on ${apps[0]}.`;
  else if (apps.length <= 3) sentence += ` Tools: ${apps.slice(0, 3).join(', ')}.`;

  return sentence;
}

// ─── Session quality label and color ─────────────────────────────────────────
export function getQualityBadge(score) {
  if (score >= 90) return { label: 'Exceptional', color: '#818CF8', emoji: '⚡' };
  if (score >= 80) return { label: 'Deep Flow',   color: '#6366F1', emoji: '🎯' };
  if (score >= 70) return { label: 'High Focus',  color: '#34D399', emoji: '✓' };
  if (score >= 55) return { label: 'Focused',     color: '#FBBF24', emoji: '→' };
  if (score >= 40) return { label: 'Moderate',    color: '#F97316', emoji: '◑' };
  if (score >= 20) return { label: 'Distracted',  color: '#EF4444', emoji: '↓' };
  return                   { label: 'Low',         color: '#94A3B8', emoji: '○' };
}

// ─── Work intensity analysis ──────────────────────────────────────────────────
export function analyzeWorkIntensity(autoSessions = [], elapsedSecs = 0) {
  if (!autoSessions.length) return { level: 'unknown', description: '' };
  const totalSecs = autoSessions.reduce((a, s) => a + (s.duration_seconds || 0), 0);
  const density = totalSecs / (elapsedSecs || 1); // active ratio
  const deepPct = autoSessions.filter(s => {
    const n = (s.app_name || '').toLowerCase();
    return /code|cursor|vim|figma|sketch|terminal|notion|obsidian/.test(n);
  }).reduce((a,s)=>a+(s.duration_seconds||0),0) / (totalSecs || 1);

  if (density >= 0.85 && deepPct >= 0.60) return { level: 'intense', description: 'High-intensity focused session' };
  if (density >= 0.70 && deepPct >= 0.40) return { level: 'high',    description: 'High-output productive session' };
  if (density >= 0.55)                    return { level: 'moderate', description: 'Moderate-intensity session' };
  return                                          { level: 'light',   description: 'Light activity session' };
}
