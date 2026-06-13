/**
 * Productivity Analysis Engine
 * Generates focus quality, context switching, burnout risk, and distraction metrics.
 * All computation runs locally in the renderer — no network required.
 */

import { calendarMemoryEngine } from '../memory/calendarMemoryEngine.js';

// ─── Constants ───────────────────────────────────────────────────────────────

const DISTRACTION_CATEGORIES = new Set([
  'distraction', 'social', 'entertainment', 'news', 'gaming',
]);

const DEEP_WORK_CATEGORIES = new Set([
  'deep_work', 'development', 'design', 'writing', 'research', 'focus',
]);

const MEETING_CATEGORIES = new Set([
  'meeting', 'communication', 'call',
]);

const SCORING_WEIGHTS = {
  focusQuality: {
    deepWorkRatio: 0.35,
    avgSessionDuration: 0.25,
    contextSwitching: 0.20,
    distractionResistance: 0.20,
  },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sessionDurationMins(session, capMs = null) {
  if (session.duration_seconds) return session.duration_seconds / 60;
  if (session.started_at && session.ended_at) {
    const start = new Date(session.started_at).getTime();
    const end   = capMs
      ? Math.min(new Date(session.ended_at).getTime(), capMs)
      : new Date(session.ended_at).getTime();
    return Math.max(0, (end - start) / 60000);
  }
  return 0;
}

function isFutureSession(session) {
  return new Date(session.started_at) > new Date();
}

function isDistractionSession(session) {
  const cat = (session.category || session.ai_category || '').toLowerCase();
  const label = (session.ai_label || '').toLowerCase();
  return DISTRACTION_CATEGORIES.has(cat) ||
    label.includes('youtube') || label.includes('reddit') ||
    label.includes('twitter') || label.includes('instagram') ||
    label.includes('tiktok') || label.includes('facebook');
}

function isDeepWorkSession(session) {
  if (session.is_deep_work) return true;
  const cat = (session.category || session.ai_category || '').toLowerCase();
  return DEEP_WORK_CATEGORIES.has(cat);
}

function isMeetingSession(session) {
  const cat = (session.category || session.ai_category || '').toLowerCase();
  const type = (session.session_type || '').toLowerCase();
  return MEETING_CATEGORIES.has(cat) || type === 'meeting';
}

// ─── Focus Quality Score ──────────────────────────────────────────────────────

/**
 * Score = weighted combination of:
 * - Deep work ratio (what % of time is deep work)
 * - Average session duration (longer = better focus)
 * - Context switching penalty (fewer switches = better)
 * - Distraction resistance (% time NOT in distraction apps)
 */
function calculateFocusQualityScore(sessions) {
  const actual = sessions.filter(s => !isFutureSession(s));
  if (!actual.length) return 0;

  const totalMins = actual.reduce((sum, s) => sum + sessionDurationMins(s), 0);
  if (totalMins === 0) return 0;

  // Deep work ratio
  const deepWorkMins = actual
    .filter(isDeepWorkSession)
    .reduce((sum, s) => sum + sessionDurationMins(s), 0);
  const deepWorkRatio = deepWorkMins / totalMins;

  // Average session duration (normalize to 0-1, optimal = 90 min)
  const avgDuration = totalMins / actual.length;
  const durationScore = Math.min(avgDuration / 90, 1);

  // Context switching (total switches / sessions — lower is better)
  const totalSwitches = actual.reduce((sum, s) => sum + (s.context_switches || 0), 0);
  const avgSwitches = totalSwitches / actual.length;
  const switchScore = Math.max(0, 1 - avgSwitches / 20); // 20 switches = 0

  // Distraction resistance
  const distractionMins = actual
    .filter(isDistractionSession)
    .reduce((sum, s) => sum + sessionDurationMins(s), 0);
  const distractionRatio = distractionMins / totalMins;
  const distractionResistance = 1 - distractionRatio;

  const w = SCORING_WEIGHTS.focusQuality;
  const score =
    deepWorkRatio * w.deepWorkRatio * 100 +
    durationScore * w.avgSessionDuration * 100 +
    switchScore * w.contextSwitching * 100 +
    distractionResistance * w.distractionResistance * 100;

  return Math.round(Math.min(100, Math.max(0, score)));
}

// ─── Context Switching Score ──────────────────────────────────────────────────

/**
 * Measures how well focus was maintained — fewer transitions = higher score.
 * Considers: total context switches, category jumps, short session bursts.
 */
function calculateContextSwitchingScore(sessions) {
  const actual = sessions.filter(s => !isFutureSession(s));
  if (!actual.length) return 100;

  const sorted = [...actual].sort((a, b) =>
    new Date(a.started_at) - new Date(b.started_at)
  );

  // Track explicit context switches from session data
  const explicitSwitches = sorted.reduce((sum, s) => sum + (s.context_switches || 0), 0);

  // Count category jumps (consecutive sessions with different categories)
  let categoryJumps = 0;
  for (let i = 1; i < sorted.length; i++) {
    const prevCat = (sorted[i - 1].category || sorted[i - 1].ai_category || '').toLowerCase();
    const currCat = (sorted[i].category || sorted[i].ai_category || '').toLowerCase();
    if (prevCat && currCat && prevCat !== currCat) categoryJumps++;
  }

  // Short session bursts (sessions < 10 min indicate scattered focus)
  const shortSessions = sorted.filter(s => sessionDurationMins(s) < 10).length;
  const shortRatio = shortSessions / sorted.length;

  // Combine into a penalty
  const switchPenalty = Math.min(explicitSwitches * 2, 40);
  const jumpPenalty = Math.min(categoryJumps * 5, 30);
  const shortPenalty = shortRatio * 30;

  const score = Math.max(0, 100 - switchPenalty - jumpPenalty - shortPenalty);
  return Math.round(score);
}

// ─── Burnout Risk ─────────────────────────────────────────────────────────────

/**
 * Analyzes:
 * - Total hours worked today
 * - Ratio of breaks to work
 * - Consecutive work hours without a break
 * - Historical trend (from memory)
 */
function calculateBurnoutRisk(sessions, historicalAvgHours = 7) {
  const nowMs = Date.now();

  // Only count sessions that started today (in the user's local timezone)
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayStartMs = todayStart.getTime();

  const actual = sessions.filter(s => {
    if (isFutureSession(s)) return false;
    const start = new Date(s.started_at).getTime();
    return start >= todayStartMs;
  });

  if (!actual.length) return { level: 'low', score: 0, reasons: [] };

  const sorted = [...actual].sort((a, b) =>
    new Date(a.started_at) - new Date(b.started_at)
  );

  // Cap ended_at to now so ongoing/future-ending sessions aren't over-counted
  const totalMins = actual.reduce((sum, s) => sum + sessionDurationMins(s, nowMs), 0);
  const totalHours = totalMins / 60;

  const reasons = [];
  let riskScore = 0;

  // Overwork risk — only flag if the user has genuinely worked those hours today
  if (totalHours > 10) {
    riskScore += 40;
    reasons.push(`${Math.round(totalHours * 10) / 10}h tracked today — very long day`);
  } else if (totalHours > 8) {
    riskScore += 20;
    reasons.push(`${Math.round(totalHours * 10) / 10}h tracked today — long day`);
  } else if (totalHours > historicalAvgHours + 2) {
    riskScore += 15;
    reasons.push(`${Math.round(totalHours - historicalAvgHours)}h above your daily average`);
  }

  // Break deficit
  const breakSessions = actual.filter(s => {
    const cat = (s.category || s.ai_category || '').toLowerCase();
    return cat === 'break' || cat === 'idle';
  });
  const breakMins = breakSessions.reduce((sum, s) => sum + sessionDurationMins(s, nowMs), 0);
  const breakRatio = breakMins / Math.max(totalMins, 1);

  if (breakRatio < 0.05 && totalHours > 4) {
    riskScore += 25;
    reasons.push('Very few breaks taken today');
  } else if (breakRatio < 0.1 && totalHours > 6) {
    riskScore += 10;
    reasons.push('Insufficient break time today');
  }

  // Longest unbroken work streak
  let maxStreakMins = 0;
  let currentStreakMins = 0;

  for (const s of sorted) {
    const cat = (s.category || s.ai_category || '').toLowerCase();
    if (cat === 'break' || cat === 'idle') {
      maxStreakMins = Math.max(maxStreakMins, currentStreakMins);
      currentStreakMins = 0;
    } else {
      currentStreakMins += sessionDurationMins(s, nowMs);
    }
  }
  maxStreakMins = Math.max(maxStreakMins, currentStreakMins);

  if (maxStreakMins > 240) {
    riskScore += 25;
    reasons.push(`${Math.round(maxStreakMins / 60)}h continuous work without a break`);
  } else if (maxStreakMins > 150) {
    riskScore += 10;
    reasons.push('Long unbroken work session');
  }

  // Context switching overload
  const totalSwitches = actual.reduce((sum, s) => sum + (s.context_switches || 0), 0);
  if (totalSwitches > 100) {
    riskScore += 15;
    reasons.push('High cognitive load from context switching');
  }

  const level = riskScore >= 50 ? 'high' : riskScore >= 25 ? 'medium' : 'low';
  return { level, score: Math.min(100, riskScore), reasons };
}

// ─── Distraction Analysis ─────────────────────────────────────────────────────

function analyzeDistraction(sessions) {
  const actual = sessions.filter(s => !isFutureSession(s));
  const distracting = actual.filter(isDistractionSession);

  const totalMins = actual.reduce((sum, s) => sum + sessionDurationMins(s), 0);
  const distractionMins = distracting.reduce((sum, s) => sum + sessionDurationMins(s), 0);

  const topDistractors = {};
  for (const s of distracting) {
    const key = s.ai_label || s.window_title || s.app_name || 'Unknown';
    const mins = sessionDurationMins(s);
    topDistractors[key] = (topDistractors[key] || 0) + mins;
  }

  const sorted = Object.entries(topDistractors)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([name, mins]) => ({ name, mins: Math.round(mins), percent: Math.round(mins / Math.max(totalMins, 1) * 100) }));

  return {
    totalDistractionMins: Math.round(distractionMins),
    distractionPercent: Math.round(distractionMins / Math.max(totalMins, 1) * 100),
    topDistractors: sorted,
    distractionFreeSessions: actual.filter(s => !isDistractionSession(s)).length,
  };
}

// ─── Deep Work Analysis ───────────────────────────────────────────────────────

function analyzeDeepWork(sessions) {
  const actual = sessions.filter(s => !isFutureSession(s));
  const deepSessions = actual.filter(isDeepWorkSession);

  const totalMins = actual.reduce((sum, s) => sum + sessionDurationMins(s), 0);
  const deepMins = deepSessions.reduce((sum, s) => sum + sessionDurationMins(s), 0);

  const sessionDurations = deepSessions.map(sessionDurationMins);
  const avgDeepDuration = sessionDurations.length
    ? sessionDurations.reduce((a, b) => a + b, 0) / sessionDurations.length
    : 0;
  const maxDeepDuration = sessionDurations.length ? Math.max(...sessionDurations) : 0;

  // Deep work quality: longer sessions with fewer interruptions = higher quality
  const avgSwitches = deepSessions.length
    ? deepSessions.reduce((sum, s) => sum + (s.context_switches || 0), 0) / deepSessions.length
    : 0;
  const quality = Math.round(
    (Math.min(avgDeepDuration / 90, 1) * 60) +
    (Math.max(0, 1 - avgSwitches / 10) * 40)
  );

  return {
    deepWorkMins: Math.round(deepMins),
    deepWorkPercent: Math.round(deepMins / Math.max(totalMins, 1) * 100),
    sessionCount: deepSessions.length,
    avgSessionMins: Math.round(avgDeepDuration),
    longestSessionMins: Math.round(maxDeepDuration),
    qualityScore: Math.min(100, quality),
  };
}

// ─── Session Efficiency ───────────────────────────────────────────────────────

/**
 * Compares actual worked time vs scheduled/planned time.
 * plannedMins = sum of calendar event durations for the period.
 * actualMins = sum of tracked session durations.
 */
function calculateSessionEfficiency(sessions, plannedMins = 0) {
  const actual = sessions.filter(s => !isFutureSession(s));
  const actualMins = actual.reduce((sum, s) => sum + sessionDurationMins(s), 0);

  if (plannedMins === 0) return { efficiency: null, actualMins, plannedMins, variance: 0 };

  const efficiency = Math.round((actualMins / plannedMins) * 100);
  const variance = Math.round(actualMins - plannedMins);

  return {
    efficiency: Math.min(efficiency, 200), // Cap at 200% to avoid outlier distortion
    actualMins: Math.round(actualMins),
    plannedMins: Math.round(plannedMins),
    variance,
    adherencePercent: Math.min(100, Math.round((Math.min(actualMins, plannedMins) / plannedMins) * 100)),
  };
}

// ─── Planned vs Actual ────────────────────────────────────────────────────────

function analyzePlannedVsActual(sessions, calendarEvents) {
  const now = new Date();

  // Only count past events as "planned"
  const pastEvents = calendarEvents.filter(e => new Date(e.end_time) <= now);
  const plannedMins = pastEvents.reduce((sum, e) => {
    const s = new Date(e.start_time);
    const en = new Date(e.end_time);
    return sum + (isNaN(s) || isNaN(en) ? 0 : (en - s) / 60000);
  }, 0);

  const actualSessions = sessions.filter(s => !isFutureSession(s));
  const actualMins = actualSessions.reduce((sum, s) => sum + sessionDurationMins(s), 0);

  const focusCompletionPct = plannedMins > 0
    ? Math.round(Math.min(actualMins, plannedMins) / plannedMins * 100)
    : null;

  const scheduleAdherencePct = plannedMins > 0
    ? Math.round((actualMins / plannedMins) * 100)
    : null;

  const variance = Math.round(actualMins - plannedMins);

  return {
    plannedHours: Math.round(plannedMins / 60 * 10) / 10,
    actualHours: Math.round(actualMins / 60 * 10) / 10,
    focusCompletionPct,
    scheduleAdherencePct,
    productivityEfficiency: focusCompletionPct,
    varianceMins: variance,
    onTrack: scheduleAdherencePct !== null && scheduleAdherencePct >= 80,
  };
}

// ─── Recovery Analysis ────────────────────────────────────────────────────────

function analyzeRecovery(sessions) {
  const actual = sessions.filter(s => !isFutureSession(s));
  const sorted = [...actual].sort((a, b) =>
    new Date(a.started_at) - new Date(b.started_at)
  );

  const breaks = sorted.filter(s => {
    const cat = (s.category || s.ai_category || '').toLowerCase();
    return cat === 'break' || cat === 'idle';
  });

  const breakMins = breaks.reduce((sum, s) => sum + sessionDurationMins(s), 0);
  const avgBreakMins = breaks.length ? breakMins / breaks.length : 0;

  // Ideal: 10-20 min breaks every 90 mins
  const workMins = actual
    .filter(s => {
      const cat = (s.category || s.ai_category || '').toLowerCase();
      return cat !== 'break' && cat !== 'idle';
    })
    .reduce((sum, s) => sum + sessionDurationMins(s), 0);

  const idealBreakMins = Math.round(workMins / 90) * 15;
  const breakScore = idealBreakMins > 0
    ? Math.min(100, Math.round((Math.min(breakMins, idealBreakMins * 1.5) / idealBreakMins) * 100))
    : 50;

  return {
    breakCount: breaks.length,
    totalBreakMins: Math.round(breakMins),
    avgBreakMins: Math.round(avgBreakMins),
    breakScore,
    recommendation: breakScore < 50
      ? 'Take more regular breaks to maintain focus quality'
      : breakScore < 75
      ? 'Break frequency is acceptable but could be improved'
      : 'Good recovery pattern — breaks are well-timed',
  };
}

// ─── AI Insight Strings ───────────────────────────────────────────────────────

function generateProductivityInsights(analysis) {
  const insights = [];
  const { focusQuality, contextSwitching, burnoutRisk, deepWork, distraction, recovery } = analysis;

  // Focus quality
  if (focusQuality >= 80) insights.push('Exceptional focus quality today — you\'re in deep work mode.');
  else if (focusQuality >= 60) insights.push('Good focus quality. A bit more deep work could push you higher.');
  else if (focusQuality < 40) insights.push('Low focus quality detected. Consider reducing distractions and batching tasks.');

  // Context switching
  if (contextSwitching < 40) insights.push('High context switching is reducing cognitive efficiency.');
  else if (contextSwitching > 80) insights.push('Excellent focus continuity — minimal task switching detected.');

  // Burnout risk
  if (burnoutRisk.level === 'high') {
    insights.push(`Burnout risk is high: ${burnoutRisk.reasons[0] || 'Overwork detected'}. Consider a break.`);
  } else if (burnoutRisk.level === 'medium') {
    insights.push('Moderate burnout risk. Prioritize a proper break in the next hour.');
  }

  // Deep work
  if (deepWork.deepWorkPercent > 50) {
    insights.push(`${deepWork.deepWorkPercent}% of your time was deep work — strong productivity signal.`);
  } else if (deepWork.deepWorkPercent < 20 && deepWork.deepWorkMins > 0) {
    insights.push('Deep work ratio is low. Try blocking off uninterrupted 90-min focus windows.');
  }

  // Distraction
  if (distraction.distractionPercent > 20) {
    const top = distraction.topDistractors[0];
    insights.push(
      `Distractions consumed ${distraction.distractionPercent}% of your time${top ? ` (top: ${top.name})` : ''}.`
    );
  }

  // Recovery
  if (recovery.breakCount === 0 && analysis.plannedVsActual?.actualHours > 3) {
    insights.push('No breaks detected in a long session. Recovery pauses improve sustained focus.');
  }

  return insights;
}

// ─── Main Analysis Function ───────────────────────────────────────────────────

/**
 * Full productivity analysis for a set of sessions.
 * @param {Array} sessions - tracked sessions for the period
 * @param {Array} calendarEvents - scheduled calendar events for the period
 * @returns {Object} Full analysis result
 */
export function analyzeProductivity(sessions, calendarEvents = []) {
  const focusQuality = calculateFocusQualityScore(sessions);
  const contextSwitching = calculateContextSwitchingScore(sessions);
  const signals = calendarMemoryEngine.getSignals();
  const burnoutRisk = calculateBurnoutRisk(sessions, signals.avgDailyHours || 7);
  const distraction = analyzeDistraction(sessions);
  const deepWork = analyzeDeepWork(sessions);
  const recovery = analyzeRecovery(sessions);
  const plannedVsActual = analyzePlannedVsActual(sessions, calendarEvents);
  const efficiency = calculateSessionEfficiency(
    sessions,
    plannedVsActual.plannedHours * 60
  );

  const analysis = {
    focusQuality,
    contextSwitching,
    burnoutRisk,
    distraction,
    deepWork,
    recovery,
    plannedVsActual,
    efficiency,
    overallScore: Math.round(
      (focusQuality * 0.3) +
      (contextSwitching * 0.2) +
      ((100 - burnoutRisk.score) * 0.15) +
      (deepWork.qualityScore * 0.2) +
      (recovery.breakScore * 0.15)
    ),
  };

  analysis.insights = generateProductivityInsights(analysis);

  // Memory learning is handled by the calling hook (useCalendarAI) — not here,
  // to prevent the same sessions being learned multiple times per render.

  return analysis;
}

export {
  calculateFocusQualityScore,
  calculateContextSwitchingScore,
  calculateBurnoutRisk,
  analyzeDistraction,
  analyzeDeepWork,
  calculateSessionEfficiency,
  analyzePlannedVsActual,
  analyzeRecovery,
  generateProductivityInsights,
};
