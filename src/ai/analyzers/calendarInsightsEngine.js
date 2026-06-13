/**
 * Calendar Insights Engine
 * Generates real-time AI insights for the calendar sidebar:
 * current session, next event, missed sessions, focus trends,
 * productivity patterns, schedule quality, and action recommendations.
 */

import { calendarMemoryEngine } from '../memory/calendarMemoryEngine.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseTime(val) {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d) ? null : d;
}

function durationMins(start, end) {
  const s = parseTime(start);
  const e = parseTime(end);
  return s && e ? Math.max(0, (e - s) / 60000) : 0;
}

function formatRelativeTime(date) {
  if (!date) return '';
  const now = new Date();
  const diff = (date - now) / 60000; // minutes

  if (Math.abs(diff) < 1) return 'just now';
  if (diff > 0) {
    if (diff < 60) return `in ${Math.round(diff)} min`;
    if (diff < 1440) return `in ${Math.round(diff / 60)}h`;
    return `in ${Math.round(diff / 1440)} day(s)`;
  } else {
    const abs = Math.abs(diff);
    if (abs < 60) return `${Math.round(abs)} min ago`;
    if (abs < 1440) return `${Math.round(abs / 60)}h ago`;
    return `${Math.round(abs / 1440)} day(s) ago`;
  }
}

function formatDuration(mins) {
  if (mins < 60) return `${Math.round(mins)} min`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatTime(date) {
  if (!date) return '';
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function isActiveNow(event) {
  const now = new Date();
  const start = parseTime(event.start_time);
  const end = parseTime(event.end_time);
  return start && end && now >= start && now <= end;
}

function isPast(event) {
  const end = parseTime(event.end_time);
  return end && end < new Date();
}

function getSessionDurationMins(session) {
  if (session.duration_seconds) return session.duration_seconds / 60;
  return durationMins(session.started_at, session.ended_at);
}

// ─── Current Session Insight ──────────────────────────────────────────────────

/**
 * Detect and describe the current active session or event.
 * @param {Array} autoSessions - auto-tracked sessions
 * @param {Array} calendarEvents - calendar events
 * @returns {Object | null}
 */
export function getCurrentSessionInsight(autoSessions = [], calendarEvents = []) {
  const now = new Date();

  // Check for active calendar event first
  const activeEvent = calendarEvents.find(isActiveNow);

  // Check for a recently-started tracked session (within last 5 min)
  const recentSession = [...autoSessions]
    .filter(s => {
      const start = parseTime(s.started_at);
      const end = parseTime(s.ended_at);
      return start && (!end || end > now) && (now - start) >= 0;
    })
    .sort((a, b) => new Date(b.started_at) - new Date(a.started_at))[0];

  if (!activeEvent && !recentSession) return null;

  const session = recentSession;
  const event = activeEvent;

  const sessionMins = session
    ? (now - parseTime(session.started_at)) / 60000
    : 0;

  const eventProgress = (() => {
    if (!event) return null;
    const eventStart = parseTime(event.start_time);
    const eventEnd   = parseTime(event.end_time);
    const eventDur   = eventEnd - eventStart;
    if (!eventDur || eventDur <= 0) return 0;
    return Math.min(100, Math.max(0, Math.round((now - eventStart) / eventDur * 100)));
  })();

  const remainingMins = event
    ? (parseTime(event.end_time) - now) / 60000
    : null;

  return {
    type: 'current_session',
    hasEvent: !!event,
    hasTracked: !!session,
    event: event ? {
      id: event.id,
      title: event.title_override || event.title,
      startTime: formatTime(parseTime(event.start_time)),
      endTime: formatTime(parseTime(event.end_time)),
      progressPercent: eventProgress,
      remainingMins: remainingMins ? Math.round(remainingMins) : null,
      remainingLabel: remainingMins ? formatDuration(remainingMins) + ' remaining' : null,
    } : null,
    session: session ? {
      appName: session.app_name,
      category: session.ai_category || session.category,
      durationMins: Math.round(sessionMins),
      durationLabel: formatDuration(sessionMins),
      isDeepWork: !!session.is_deep_work,
    } : null,
    label: event
      ? `Working on: ${event.title_override || event.title}`
      : session
      ? `Tracking: ${session.ai_label || session.app_name || 'Session'}`
      : 'No active session',
  };
}

// ─── Next Event Insight ───────────────────────────────────────────────────────

/**
 * Find and describe the next upcoming calendar event.
 * @param {Array} calendarEvents
 * @returns {Object | null}
 */
export function getNextEventInsight(calendarEvents = []) {
  const now = new Date();

  const upcoming = calendarEvents
    .filter(e => {
      const start = parseTime(e.start_time);
      return start && start > now;
    })
    .sort((a, b) => new Date(a.start_time) - new Date(b.start_time));

  if (!upcoming.length) return null;

  const next = upcoming[0];
  const start = parseTime(next.start_time);
  const minsUntil = (start - now) / 60000;
  const eventMins = durationMins(next.start_time, next.end_time);

  const isImminient = minsUntil <= 15;
  const isSoon = minsUntil <= 60;

  return {
    type: 'next_event',
    event: {
      id: next.id,
      title: next.title_override || next.title,
      startTime: formatTime(start),
      durationMins: Math.round(eventMins),
      durationLabel: formatDuration(eventMins),
    },
    minsUntil: Math.round(minsUntil),
    relativeLabel: formatRelativeTime(start),
    isImminent: isImminient,
    isSoon,
    label: `Next: ${next.title_override || next.title} ${formatRelativeTime(start)}`,
    alert: isImminient
      ? `"${next.title_override || next.title}" starts in ${Math.round(minsUntil)} min — wrap up current work`
      : null,
    followingEvents: upcoming.slice(1, 3).map(e => ({
      title: e.title_override || e.title,
      startTime: formatTime(parseTime(e.start_time)),
      relativeLabel: formatRelativeTime(parseTime(e.start_time)),
    })),
  };
}

// ─── Missed Sessions Detection ────────────────────────────────────────────────

/**
 * Identify planned calendar events that had no tracked activity.
 * @param {Array} calendarEvents
 * @param {Array} enrichedEvents - from sessionMatchingEngine.matchSessionsToEvents
 * @returns {Array} Missed sessions
 */
export function getMissedSessions(calendarEvents = [], enrichedEvents = []) {
  const enrichedMap = new Map(enrichedEvents.map(e => [e.id, e]));
  const now = new Date();

  return calendarEvents
    .filter(e => {
      const end = parseTime(e.end_time);
      if (!end || end > now) return false; // Must be past

      const enriched = enrichedMap.get(e.id);
      if (!enriched) return false;

      return enriched._ai?.status === 'missed';
    })
    .map(e => {
      const eventMins = durationMins(e.start_time, e.end_time);
      return {
        eventId: e.id,
        title: e.title_override || e.title,
        startTime: formatTime(parseTime(e.start_time)),
        endTime: formatTime(parseTime(e.end_time)),
        plannedMins: Math.round(eventMins),
        missedAt: formatRelativeTime(parseTime(e.end_time)),
        impact: eventMins >= 60 ? 'high' : eventMins >= 30 ? 'medium' : 'low',
      };
    })
    .sort((a, b) => b.plannedMins - a.plannedMins)
    .slice(0, 5);
}

// ─── Focus Trend ──────────────────────────────────────────────────────────────

/**
 * Compute focus trend over recent days.
 * @param {Array} dailyScores - [{ date, overallScore }] sorted ascending
 * @returns {Object} Trend analysis
 */
export function getFocusTrend(dailyScores = []) {
  if (dailyScores.length < 2) {
    return {
      trend: 'insufficient_data',
      trendLabel: 'Not enough data',
      direction: 'neutral',
      change: 0,
      insight: 'Keep tracking to see your focus trends.',
    };
  }

  const recent = dailyScores.slice(-7); // Last 7 days
  const avg = recent.reduce((sum, d) => sum + (d.overallScore || 0), 0) / recent.length;

  const older = dailyScores.slice(-14, -7);
  const prevAvg = older.length
    ? older.reduce((sum, d) => sum + (d.overallScore || 0), 0) / older.length
    : avg;

  const change = avg - prevAvg;
  const direction = change > 5 ? 'up' : change < -5 ? 'down' : 'stable';

  // Week-over-week trend
  const trend = direction === 'up' ? 'improving'
    : direction === 'down' ? 'declining'
    : 'stable';

  // Streak analysis
  const sortedScores = [...recent].sort((a, b) => new Date(a.date) - new Date(b.date));
  let goodStreak = 0;
  for (let i = sortedScores.length - 1; i >= 0; i--) {
    if ((sortedScores[i].overallScore || 0) >= 60) goodStreak++;
    else break;
  }

  const insight = trend === 'improving'
    ? `Focus quality up ${Math.round(change)} points vs last week. Keep the momentum!`
    : trend === 'declining'
    ? `Focus quality down ${Math.abs(Math.round(change))} points vs last week. Review distractions.`
    : goodStreak >= 3
    ? `Consistent focus for ${goodStreak} days — great streak!`
    : 'Focus quality is stable this week.';

  return {
    trend,
    trendLabel: trend === 'improving' ? '↑ Improving' : trend === 'declining' ? '↓ Declining' : '→ Stable',
    direction,
    weekAvg: Math.round(avg),
    prevWeekAvg: Math.round(prevAvg),
    change: Math.round(change),
    goodStreak,
    recentDays: recent.map(d => ({ date: d.date, score: d.overallScore || 0 })),
    insight,
  };
}

// ─── Deep Work Ratio ──────────────────────────────────────────────────────────

/**
 * Calculate today's deep work ratio and compare to personal average.
 * @param {Array} sessions - today's sessions
 * @returns {Object}
 */
export function getDeepWorkRatioInsight(sessions = []) {
  const now = new Date();
  const actual = sessions.filter(s => {
    const start = parseTime(s.started_at);
    return start && start <= now;
  });

  const totalMins = actual.reduce((sum, s) => sum + getSessionDurationMins(s), 0);
  const deepMins = actual
    .filter(s => s.is_deep_work || (s.ai_category || s.category) === 'deep_work')
    .reduce((sum, s) => sum + getSessionDurationMins(s), 0);

  const ratio = totalMins > 0 ? deepMins / totalMins : 0;
  const pct = Math.round(ratio * 100);

  const historicalRatio = calendarMemoryEngine.getDeepWorkRatio();
  const historicalPct = Math.round(historicalRatio * 100);

  const vsAvg = pct - historicalPct;
  const comparison = vsAvg > 10 ? 'above average'
    : vsAvg < -10 ? 'below average'
    : 'on track';

  if (totalMins < 15) {
    return {
      deepWorkMins: 0, totalMins: 0, ratio: 0,
      historicalRatio: historicalPct, comparison: 'on track', vsAvg: 0,
      label: 'No sessions tracked yet',
      insight: 'Track your first session to see deep work analytics.',
    };
  }

  return {
    deepWorkMins: Math.round(deepMins),
    totalMins: Math.round(totalMins),
    ratio: pct,
    historicalRatio: historicalPct,
    comparison,
    vsAvg,
    label: `${pct}% deep work today`,
    insight: pct >= 40
      ? `${pct}% deep work ratio — excellent focus discipline`
      : pct >= 25
      ? `${pct}% deep work — target 40%+ for peak productivity`
      : `Only ${pct}% deep work today. Try longer uninterrupted blocks.`,
  };
}

// ─── Schedule Quality ─────────────────────────────────────────────────────────

/**
 * Assess the quality of today's schedule against actuals.
 * @param {Array} enrichedEvents - from matchSessionsToEvents
 * @param {number} conflictScore - from calendarConflictEngine
 * @returns {Object}
 */
export function getScheduleQualityInsight(enrichedEvents = [], conflictScore = 100) {
  const past = enrichedEvents.filter(e => isPast(e));
  if (!past.length) {
    return {
      score: conflictScore,
      label: conflictScore >= 80 ? 'Excellent' : conflictScore >= 60 ? 'Good' : 'Needs attention',
      completed: 0, missed: 0, partial: 0, total: 0,
      insight: 'No completed events yet today.',
    };
  }

  const completed = past.filter(e => e._ai?.status === 'completed').length;
  const missed = past.filter(e => e._ai?.status === 'missed').length;
  const partial = past.filter(e => e._ai?.status === 'partial').length;

  const adherence = past.length > 0
    ? Math.round((completed / past.length) * 100)
    : 0;

  const score = Math.round(
    (conflictScore * 0.4) +
    (adherence * 0.6)
  );

  const label = score >= 85 ? 'Excellent'
    : score >= 70 ? 'Good'
    : score >= 50 ? 'Fair'
    : 'Needs improvement';

  const insight = completed === past.length && past.length > 0
    ? 'Perfect schedule execution — all planned events completed!'
    : missed > 0
    ? `${missed} planned event(s) missed. Review your schedule to identify blockers.`
    : partial > 0
    ? `${partial} event(s) partially completed. Focus on finishing planned work.`
    : 'Schedule is on track.';

  return {
    score,
    label,
    completed,
    missed,
    partial,
    total: past.length,
    adherence,
    conflictScore,
    insight,
  };
}

// ─── Productivity Trend ───────────────────────────────────────────────────────

/**
 * Identify when in the day the user is most productive.
 * @returns {Object}
 */
export function getProductivityPeakInsight() {
  const hourlyMap = calendarMemoryEngine.getHourlyFocusMap();
  const windows = calendarMemoryEngine.getProductiveWindows(3);
  const signals = calendarMemoryEngine.getSignals();

  if (signals.totalDaysTracked < 3) {
    return {
      hasSufficientData: false,
      insight: 'Keep tracking for 3+ days to see your productivity peak times.',
      windows: [],
    };
  }

  const peak = Object.entries(hourlyMap)
    .filter(([, score]) => score > 0)
    .sort(([, a], [, b]) => b - a)[0];

  const peakHour = peak ? parseInt(peak[0]) : null;
  const peakScore = peak ? peak[1] : 0;

  const formatHour = h => {
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `${h12} ${ampm}`;
  };

  return {
    hasSufficientData: true,
    peakHour,
    peakScore,
    peakLabel: peakHour !== null ? `Most productive around ${formatHour(peakHour)}` : null,
    windows: windows.map(w => ({
      label: w.label,
      avgScore: Math.round(w.avgScore),
      quality: w.avgScore >= 75 ? 'excellent' : w.avgScore >= 60 ? 'good' : 'moderate',
    })),
    avgDeepWorkRatio: Math.round(signals.avgDeepWorkRatio * 100),
    avgSessionDurationMins: Math.round(signals.avgSessionDurationMins),
    insight: peakHour !== null
      ? `You focus best around ${formatHour(peakHour)} with a score of ${peakScore}/100. Schedule deep work here.`
      : 'No clear peak detected yet.',
  };
}

// ─── Workflow Objective Insight ───────────────────────────────────────────────

/**
 * Surface the user's current recurring work objective from semantic memory.
 * Shows what the user has been consistently working on across sessions.
 *
 * @param {Object} continuityProfile - from sessionContinuityEngine
 * @param {Object} featureGraph      - from featureGraphEngine
 * @returns {Object | null}
 */
export function getWorkflowObjectiveInsight(continuityProfile = null, featureGraph = null) {
  const objective = continuityProfile?.activeObjective;
  const recurringFeatures = continuityProfile?.recurringFeatures || [];
  const topFeature = featureGraph?.topFeature;
  const featureNarrative = featureGraph?.featureNarrative;

  if (!objective && !topFeature && !recurringFeatures.length) return null;

  const description = objective?.description ||
    (topFeature ? `Working on ${topFeature.label.toLowerCase()}` : null) ||
    featureNarrative;

  if (!description) return null;

  const confidence = objective?.confidence ||
    (topFeature ? topFeature.activationScore : 0.5);

  const relatedFeatures = recurringFeatures.slice(0, 3).map(f => f.label);

  return {
    type: 'workflow_objective',
    description,
    confidence: Math.round(confidence * 100) / 100,
    relatedFeatures,
    isEstablishedWork: (continuityProfile?.recurringFeatures?.length || 0) >= 2,
    workflowStage: continuityProfile?.workflowStage?.label || null,
    label: description,
    insight: relatedFeatures.length >= 2
      ? `Ongoing work: ${description} — primarily ${relatedFeatures[0].toLowerCase()} and ${relatedFeatures[1].toLowerCase()}.`
      : `Current focus: ${description}`,
  };
}

// ─── Implementation Phase Insight ─────────────────────────────────────────────

/**
 * Show where in the development cycle the user currently is.
 * @param {Object} workflowState - from workflowStateEngine
 * @param {Object} continuityProfile
 * @returns {Object | null}
 */
export function getImplementationPhaseInsight(workflowState = null, continuityProfile = null) {
  const phase = workflowState?.implementationPhase;
  const stage = continuityProfile?.workflowStage;
  const workType = workflowState?.workType;

  if (!phase && !stage) return null;

  const phaseLabel = phase?.label || stage?.label || 'Active Development';
  const workTypeLabel = workType?.label || null;

  const PHASE_DESCRIPTIONS = {
    initial:      'In the planning and exploration phase — laying groundwork.',
    building:     'Actively building — primary implementation in progress.',
    iterating:    'Iterating — implementing and debugging in parallel.',
    stabilizing:  'Stabilizing — focused on fixing and hardening.',
    polishing:    'Polishing — refactoring and quality improvements.',
    finishing:    'Wrapping up — testing and documentation.',
  };

  const description = PHASE_DESCRIPTIONS[phase?.phase] ||
    `Currently ${phaseLabel.toLowerCase()}.`;

  return {
    type: 'implementation_phase',
    phase: phase?.phase || 'iterating',
    phaseLabel,
    workTypeLabel,
    confidence: phase?.confidence || 0.5,
    description,
    label: workTypeLabel || phaseLabel,
    insight: description,
  };
}

// ─── AI Tool Usage Insight ────────────────────────────────────────────────────

/**
 * Analyze how the user is using AI tools in their workflow.
 * @param {Array} autoSessions - today's auto-sessions
 * @returns {Object | null}
 */
export function getAIToolUsageInsight(autoSessions = []) {
  const AI_RE = /^(claude|chatgpt|gemini|copilot|perplexity)/i;
  const aiSessions = autoSessions.filter(s => AI_RE.test(s.app_name || ''));
  if (!aiSessions.length) return null;

  const totalSecs = autoSessions.reduce((s, x) => s + (x.duration_seconds || 0), 0);
  const aiSecs = aiSessions.reduce((s, x) => s + (x.duration_seconds || 0), 0);
  const aiPct = totalSecs > 0 ? Math.round(aiSecs / totalSecs * 100) : 0;
  const aiMins = Math.round(aiSecs / 60);

  // Count unique conversation topics from window titles
  const topics = aiSessions
    .map(s => (s.window_title || '').replace(/\s*[-—]\s*(Claude|ChatGPT|Gemini)\s*$/i, '').trim())
    .filter(t => t.length >= 6);
  const uniqueTopics = [...new Set(topics)].slice(0, 3);

  const usageLabel = aiPct >= 60 ? 'Primary workspace'
    : aiPct >= 30 ? 'Active co-pilot'
    : aiPct >= 10 ? 'Supporting tool'
    : 'Light usage';

  return {
    type: 'ai_tool_usage',
    aiMins,
    aiPct,
    usageLabel,
    topTopics: uniqueTopics,
    insight: aiPct >= 40
      ? `AI tools are your primary workspace today — ${aiMins} min (${aiPct}%) of focused AI-assisted work.`
      : `Using AI tools for ${aiMins} min (${aiPct}%) — ${usageLabel.toLowerCase()}.`,
    label: `${usageLabel} · ${aiMins}m`,
  };
}

// ─── Feature Progress Insight ──────────────────────────────────────────────────

/**
 * Show which product features are actively being worked on.
 * @param {Object} featureGraph - from featureGraphEngine
 * @returns {Object | null}
 */
export function getFeatureProgressInsight(featureGraph = null) {
  if (!featureGraph?.activeCluster?.length) return null;

  const cluster = featureGraph.activeCluster.slice(0, 3);
  const system = featureGraph.activeSystem;

  const featureList = cluster.map(f => ({
    label: f.label,
    strength: f.activationScore,
    intensity: f.activationScore >= 0.7 ? 'heavy' : f.activationScore >= 0.4 ? 'active' : 'light',
  }));

  const primaryFeature = featureList[0];
  const systemLabel = system?.label || 'product system';

  return {
    type: 'feature_progress',
    features: featureList,
    systemLabel,
    primaryFeature: primaryFeature?.label,
    graphSize: featureGraph.graphSize || 0,
    insight: featureList.length >= 2
      ? `Active features: ${featureList[0].label} and ${featureList[1].label} in the ${systemLabel}.`
      : `Primary focus: ${primaryFeature?.label} (${systemLabel}).`,
    label: primaryFeature?.label || systemLabel,
  };
}

// ─── AI Recommendations ───────────────────────────────────────────────────────

/**
 * Generate top 3 actionable AI recommendations for the user right now.
 * @param {Object} context - { currentSession, nextEvent, focusTrend, scheduleQuality, burnoutRisk, deepWorkRatio }
 * @returns {Array<Object>} Recommendations sorted by priority
 */
export function generateAIRecommendations(context = {}) {
  const {
    currentSession,
    nextEvent,
    focusTrend,
    scheduleQuality,
    burnoutRisk,
    deepWorkRatio,
    missedSessions = [],
    conflictReport,
    workflowObjective,
    implementationPhase,
    aiToolUsage,
  } = context;

  const recommendations = [];

  // Imminent event alert
  if (nextEvent?.isImminent) {
    recommendations.push({
      priority: 1,
      type: 'alert',
      icon: '⏰',
      title: 'Upcoming Event',
      message: nextEvent.alert,
      action: 'View event',
    });
  }

  // Burnout risk
  if (burnoutRisk?.level === 'high') {
    recommendations.push({
      priority: 2,
      type: 'warning',
      icon: '🔥',
      title: 'Burnout Risk',
      message: burnoutRisk.reasons[0] || 'You\'ve been working too long without breaks.',
      action: 'Schedule a break',
    });
  }

  // Deep work ratio low
  if (deepWorkRatio && deepWorkRatio.ratio < 20 && deepWorkRatio.totalMins > 120) {
    recommendations.push({
      priority: 3,
      type: 'tip',
      icon: '🎯',
      title: 'Boost Deep Work',
      message: `Only ${deepWorkRatio.ratio}% deep work today. Block a 90-min focus window.`,
      action: 'Schedule focus block',
    });
  }

  // Missed sessions
  if (missedSessions.length > 0) {
    const highImpact = missedSessions.filter(s => s.impact === 'high');
    if (highImpact.length > 0) {
      recommendations.push({
        priority: 4,
        type: 'info',
        icon: '📋',
        title: 'Missed Sessions',
        message: `"${highImpact[0].title}" was missed (${highImpact[0].plannedMins} min planned).`,
        action: 'Reschedule',
      });
    }
  }

  // Critical conflicts
  if (conflictReport?.hasCritical) {
    recommendations.push({
      priority: 2,
      type: 'warning',
      icon: '⚠️',
      title: 'Schedule Conflict',
      message: conflictReport.topConflict?.message || 'Critical scheduling conflict detected.',
      action: 'Resolve conflict',
    });
  }

  // Focus trend declining
  if (focusTrend?.trend === 'declining' && focusTrend.change < -10) {
    recommendations.push({
      priority: 5,
      type: 'tip',
      icon: '📉',
      title: 'Focus Declining',
      message: `Focus score down ${Math.abs(focusTrend.change)} pts vs last week. Review habits.`,
      action: 'View insights',
    });
  }

  // Schedule quality poor
  if (scheduleQuality && scheduleQuality.score < 50 && scheduleQuality.total > 0) {
    recommendations.push({
      priority: 5,
      type: 'tip',
      icon: '📅',
      title: 'Schedule Quality',
      message: scheduleQuality.insight,
      action: 'Optimize schedule',
    });
  }

  // Workflow objective: remind about what's being built
  if (workflowObjective?.isEstablishedWork && recommendations.length < 2) {
    recommendations.push({
      priority: 6,
      type: 'info',
      icon: '🔄',
      title: 'Ongoing Work',
      message: workflowObjective.insight,
      action: null,
    });
  }

  // Implementation phase context: nudge toward next phase
  if (implementationPhase?.phase === 'building' && recommendations.length < 2) {
    recommendations.push({
      priority: 7,
      type: 'tip',
      icon: '🏗️',
      title: 'Build Momentum',
      message: `${implementationPhase.description} Keep the implementation streak going.`,
      action: null,
    });
  }

  if (implementationPhase?.phase === 'iterating' && recommendations.length < 2) {
    recommendations.push({
      priority: 7,
      type: 'tip',
      icon: '⚡',
      title: 'Iteration Mode',
      message: `${implementationPhase.description} Consider a 30-min debug-free build block to push forward.`,
      action: null,
    });
  }

  // Positive reinforcement
  if (recommendations.length === 0) {
    if (deepWorkRatio?.ratio >= 40) {
      recommendations.push({
        priority: 10,
        type: 'success',
        icon: '✅',
        title: 'Great Focus Day',
        message: `${deepWorkRatio.ratio}% deep work ratio — you're in the zone!`,
        action: null,
      });
    } else if (aiToolUsage?.aiPct >= 40) {
      recommendations.push({
        priority: 10,
        type: 'success',
        icon: '🤖',
        title: 'AI-Assisted Deep Work',
        message: aiToolUsage.insight,
        action: null,
      });
    } else {
      recommendations.push({
        priority: 10,
        type: 'info',
        icon: '💡',
        title: 'On Track',
        message: 'Schedule looks healthy. Focus on your next planned block.',
        action: null,
      });
    }
  }

  return recommendations
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 3);
}

// ─── Full Insights Bundle ─────────────────────────────────────────────────────

/**
 * Generate the complete insights bundle for the sidebar.
 * Now includes: workflow objective, implementation phase, AI tool usage,
 * feature progress, and richer recommendations.
 *
 * @param {Object} data - all available data including orchestrator outputs
 * @returns {Object} Complete insights
 */
export function generateInsightsBundleForSidebar(data = {}) {
  const {
    autoSessions = [],
    manualSessions = [],
    calendarEvents = [],
    enrichedEvents = [],
    dailyScores = [],
    conflictReport = null,
    burnoutRisk = null,
    // New: AI pipeline outputs (passed from useCalendarAI)
    continuityProfile = null,
    featureGraph = null,
    workflowState = null,
  } = data;

  const allSessions = [...autoSessions, ...manualSessions];

  const currentSession     = getCurrentSessionInsight(autoSessions, calendarEvents);
  const nextEvent          = getNextEventInsight(calendarEvents);
  const missedSessions     = getMissedSessions(calendarEvents, enrichedEvents);
  const focusTrend         = getFocusTrend(dailyScores);
  const deepWorkRatio      = getDeepWorkRatioInsight(allSessions);
  const scheduleQuality    = getScheduleQualityInsight(enrichedEvents, conflictReport?.scheduleQualityScore ?? 100);
  const productivityPeak   = getProductivityPeakInsight();

  // New intelligence insights
  const workflowObjective  = getWorkflowObjectiveInsight(continuityProfile, featureGraph);
  const implementationPhase = getImplementationPhaseInsight(workflowState, continuityProfile);
  const aiToolUsage        = getAIToolUsageInsight(autoSessions);
  const featureProgress    = getFeatureProgressInsight(featureGraph);

  const recommendations = generateAIRecommendations({
    currentSession,
    nextEvent,
    focusTrend,
    scheduleQuality,
    burnoutRisk,
    deepWorkRatio,
    missedSessions,
    conflictReport,
    workflowObjective,
    implementationPhase,
    aiToolUsage,
  });

  return {
    timestamp: new Date().toISOString(),
    currentSession,
    nextEvent,
    missedSessions,
    focusTrend,
    deepWorkRatio,
    scheduleQuality,
    productivityPeak,

    // New intelligence layer
    workflowObjective,
    implementationPhase,
    aiToolUsage,
    featureProgress,

    recommendations,
    summary: {
      hasAlerts: recommendations.some(r => r.type === 'alert' || r.type === 'warning'),
      topRecommendation: recommendations[0] || null,
      hasWorkflowContext: !!(workflowObjective || featureProgress),
      currentWorkType: workflowState?.workType?.label || implementationPhase?.workTypeLabel || null,
    },
  };
}
