/**
 * Productivity Insights Aggregator
 *
 * Combines behavioral intelligence from adaptiveBehaviorEngine with
 * signals from the existing AI pipeline (calendarInsightsEngine,
 * productivityAnalysisEngine, sessionContinuityEngine) to produce
 * the highest-quality, personalized insight output for every surface.
 *
 * This is the "conductor" — it doesn't run algorithms itself, it
 * assembles authoritative output from all intelligence sources.
 */

import { getIntelligence, forecastProductivity, generateAdaptiveRecommendations } from './adaptiveBehaviorEngine.js';
import { getBehavioralInsightsForSidebar, getContextSwitchAnalytics, getFocusAnalytics } from './analyticsIntelligenceEngine.js';

// ─── Aggregated summary panel insights ───────────────────────────────────────

/**
 * Build the complete AI Insights object for the SummaryPanel.
 * Merges behavioral patterns with live calendar/session signals.
 *
 * @param {Object} opts
 * @param {Object}  opts.calendarInsights     - from generateInsightsBundleForSidebar
 * @param {Object}  opts.productivityAnalysis - from analyzeProductivity
 * @param {Object}  opts.liveSession          - current active session (optional)
 * @param {boolean} opts.isTracking           - whether a session is running
 * @returns {Object} aggregated insight panel data
 */
export function aggregateSummaryPanelInsights({
  calendarInsights   = {},
  productivityAnalysis = {},
  liveSession        = null,
  isTracking         = false,
} = {}) {
  const intel      = getIntelligence();
  const behavioral = getBehavioralInsightsForSidebar();
  const recs       = generateAdaptiveRecommendations();
  const forecast   = forecastProductivity(4);

  // ── Burnout signal (behavioral overrides calendar for accuracy) ────────
  const burnoutRisk = intel.burnout.riskLevel;
  const burnoutFromCalendar = productivityAnalysis?.burnoutRisk?.level || 'low';
  // Use the higher of the two risk signals
  const finalBurnoutRisk = riskMax(burnoutRisk, burnoutFromCalendar);

  // ── Deep work intelligence (blend learned ratio with today's actual) ───
  const learnedDeepWorkPct = intel.focus.deepWorkRatio;
  const todayDeepWorkPct   = productivityAnalysis?.deepWork?.deepWorkPercent || 0;
  const deepWorkInsight    = todayDeepWorkPct > 0
    ? (todayDeepWorkPct > learnedDeepWorkPct * 1.2
      ? `${todayDeepWorkPct}% deep work — above your ${learnedDeepWorkPct}% average`
      : todayDeepWorkPct < learnedDeepWorkPct * 0.6
      ? `Only ${todayDeepWorkPct}% deep work today — your average is ${learnedDeepWorkPct}%`
      : `${todayDeepWorkPct}% deep work — on track with your ${learnedDeepWorkPct}% average`)
    : null;

  // ── Focus quality (calendar analysis + behavioral context) ────────────
  const focusQuality = productivityAnalysis?.focusQuality || intel.history.rollingAvg7 || 0;

  // ── Peak window recommendation ─────────────────────────────────────────
  const nowHour     = new Date().getHours();
  const isInPeak    = intel.focus.bestHour !== null &&
                      Math.abs(nowHour - intel.focus.bestHour) <= 1 &&
                      intel.focus.observations >= 5;
  const nextPeak    = forecast.find(f => f.isBestWindow);

  // ── Productivity narrative ─────────────────────────────────────────────
  const narrative = buildProductivityNarrative(intel, productivityAnalysis, isTracking);

  // ── Unified recommendations (behavioral + calendar, deduplicated) ──────
  const calRecs = calendarInsights?.recommendations || [];
  const allRecs = mergeRecommendations(
    recs.map(r => ({ ...r, source: 'behavioral' })),
    calRecs.map(r => ({ ...r, source: 'calendar' }))
  );

  return {
    // ── Narrative header ───────────────────────────────────────────────
    narrative,

    // ── Flow & focus ───────────────────────────────────────────────────
    focusQuality,
    isInPeakWindow:   isInPeak,
    peakWindow:       intel.focus.peakWindow,
    bestHourLabel:    behavioral.bestHourLabel,
    deepWorkInsight,
    deepWorkRatio:    learnedDeepWorkPct,
    focusInsight:     intel.focus.insight,

    // ── Burnout & energy ───────────────────────────────────────────────
    burnoutRisk:      finalBurnoutRisk,
    burnoutFatigue:   intel.burnout.fatigue,
    burnoutInsight:   intel.burnout.insight,
    weeklyHours:      intel.burnout.currentWeekHours,
    sustainableHours: intel.burnout.sustainableHoursPerWeek,
    energyLevel:      intel.energy.hourlyEnergy[nowHour] || 50,

    // ── Context switching ──────────────────────────────────────────────
    fragmentation:    intel.contextSwitch.fragmentation,
    switchBaseline:   intel.contextSwitch.baseline,
    switchInsight:    intel.contextSwitch.insight,

    // ── Workflow continuity ────────────────────────────────────────────
    currentWorkflow:  intel.workflow.currentWorkflow,
    isContinuing:     intel.workflow.isContinuing,
    workflowInsight:  intel.workflow.insight,
    recurringCount:   intel.workflow.recurringPatterns.length,

    // ── Productivity history ───────────────────────────────────────────
    rollingAvg7:      intel.history.rollingAvg7,
    productivityTrend: intel.history.trend,
    historyInsight:   intel.history.insight,
    consistency:      intel.history.consistency,

    // ── Forecast ──────────────────────────────────────────────────────
    forecast,
    nextBestWindow:   nextPeak || null,
    nextPeakLabel:    nextPeak ? nextPeak.label : null,

    // ── Recommendations ────────────────────────────────────────────────
    topRecommendation: allRecs[0] || null,
    recommendations:   allRecs.slice(0, 5),

    // ── Pass-through from calendar insights ───────────────────────────
    calendarInsights,
    productivityAnalysis,

    // ── Intelligence metadata ──────────────────────────────────────────
    maturityLevel:    intel.meta.maturityLevel,
    confidence:       Math.round(intel.meta.overallConfidence * 100),
    observations:     intel.meta.totalObservations,
    lastUpdated:      intel.meta.lastUpdated,
  };
}

// ─── Report-level aggregation ─────────────────────────────────────────────────

/**
 * Build behavioral analytics data for a specific report module.
 *
 * @param {'deepwork'|'focus'|'context'|'burnout'|'patterns'|'workflow'} module
 * @param {number} days
 * @returns {Object} module-specific analytics + behavioral intelligence
 */
export function aggregateReportModuleData(module, days = 30) {
  const intel = getIntelligence();

  const base = {
    maturityLevel:   intel.meta.maturityLevel,
    confidence:      Math.round(intel.meta.overallConfidence * 100),
    observations:    intel.meta.totalObservations,
    learnedBaseline: {
      avgScore:    intel.history.rollingAvg30,
      deepWork:    intel.focus.deepWorkRatio,
      switchRate:  intel.contextSwitch.baseline,
      peakWindow:  intel.focus.peakWindow,
      burnoutRisk: intel.burnout.riskLevel,
    },
  };

  switch (module) {
    case 'deepwork': return {
      ...base,
      hourlyFocusChart:    intel.focus.hourlyScores.map((s, h) => ({ hour: h, score: s, label: fmtHour(h) })),
      dowPerformance:      intel.focus.dowScores.map((s, i) => ({ day: DOW[i], score: Math.round(s) })),
      peakWindow:          intel.focus.peakWindow,
      avgDeepWorkRatioPct: intel.focus.deepWorkRatio,
      avgSessionMins:      intel.focus.avgSessionMins,
      bestHour:            intel.focus.bestHour,
      flowBestHour:        intel.flow.bestFlowHour,
      avgFlowDuration:     intel.flow.avgFlowDuration,
      insights: [intel.focus.insight].filter(Boolean),
    };

    case 'focus': return {
      ...base,
      hourlyEnergy:        intel.energy.hourlyEnergy.map((e, h) => ({ hour: h, energy: e, label: fmtHour(h) })),
      naturalStartHour:    intel.energy.naturalStartHour,
      naturalEndHour:      intel.energy.naturalEndHour,
      sustainableHoursDay: intel.energy.sustainableHoursPerDay,
      focusChart:          intel.focus.hourlyScores.map((s, h) => ({ hour: h, score: s })),
      insights: [intel.focus.insight, intel.energy.insight].filter(Boolean),
    };

    case 'context': return {
      ...base,
      fragmentation:     intel.contextSwitch.fragmentation,
      baseline:          intel.contextSwitch.baseline,
      thresholdHigh:     intel.contextSwitch.thresholdHigh,
      hourlyBaseline:    intel.contextSwitch.hourlyBaseline.map((r, h) => ({ hour: h, rate: Math.round(r * 10) / 10 })),
      flowDistribution:  intel.flow.stateDistribution,
      flowRecent:        intel.flow.recent.slice(-20),
      insights: [intel.contextSwitch.insight].filter(Boolean),
    };

    case 'burnout': return {
      ...base,
      fatigue:             intel.burnout.fatigue,
      riskLevel:           intel.burnout.riskLevel,
      sustainableHoursWk:  intel.burnout.sustainableHoursPerWeek,
      currentWeekHours:    intel.burnout.currentWeekHours,
      recentWeeklyHours:   intel.burnout.recentWeeklyHours,
      productivityTrend:   intel.history.trend,
      rollingAvg7:         intel.history.rollingAvg7,
      rollingAvg30:        intel.history.rollingAvg30,
      insights: [intel.burnout.insight, intel.history.insight].filter(Boolean),
    };

    case 'patterns': return {
      ...base,
      productivityHistory: intel.history.daily.slice(-days).map(d => ({
        date:   d.date,
        score:  Math.round(d.score),
        hours:  Math.round(d.hours * 10) / 10,
        deep:   Math.round(d.deepWorkMins),
        state:  d.flowState,
      })),
      consistency:         intel.history.consistency,
      peakScore:           intel.history.peakScore,
      insights: [intel.history.insight].filter(Boolean),
    };

    case 'workflow': return {
      ...base,
      recurringPatterns:  intel.workflow.recurringPatterns,
      recentWorkflows:    intel.workflow.recentWorkflows.slice(0, 15),
      continuityChain:    intel.workflow.continuityChain,
      projectBehaviors:   intel.workflow.projectBehaviors,
      insights: [intel.workflow.insight].filter(Boolean),
    };

    default: return base;
  }
}

// ─── Weekly review intelligence ───────────────────────────────────────────────

/**
 * Generate behavioral intelligence for the weekly review summary.
 *
 * @returns {Object} weekly behavioral review
 */
export function getWeeklyBehavioralReview() {
  const intel = getIntelligence();
  const recs  = generateAdaptiveRecommendations();

  const weekData = intel.history.daily
    .filter(d => {
      const date    = new Date(d.date);
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      return date >= weekAgo;
    });

  const avgScore    = weekData.length > 0
    ? Math.round(weekData.reduce((s, d) => s + d.score, 0) / weekData.length)
    : 0;
  const totalHours  = Math.round(weekData.reduce((s, d) => s + d.hours, 0) * 10) / 10;
  const totalDeep   = Math.round(weekData.reduce((s, d) => s + d.deepWorkMins, 0));
  const flowStates  = weekData.map(d => d.flowState).filter(Boolean);
  const topState    = mode(flowStates);

  // Compare to 30-day average
  const vsAvg = intel.history.rollingAvg30 > 0
    ? Math.round((avgScore - intel.history.rollingAvg30) * 10) / 10
    : 0;

  return {
    period:        'week',
    avgScore,
    vsAvg,
    totalHours,
    totalDeepMins: totalDeep,
    deepRatioPct:  totalHours > 0 ? Math.round((totalDeep / (totalHours * 60)) * 100) : 0,
    dominantState: topState,
    burnoutRisk:   intel.burnout.riskLevel,
    weeklyHours:   intel.burnout.currentWeekHours,
    sustainability: intel.burnout.currentWeekHours <= intel.burnout.sustainableHoursPerWeek,
    peakWindow:    intel.focus.peakWindow,
    topPattern:    intel.workflow.recurringPatterns[0]?.label || null,
    productivityTrend: intel.history.trend,
    dailyBreakdown: weekData.map(d => ({
      date:  d.date,
      score: Math.round(d.score),
      hours: Math.round(d.hours * 10) / 10,
      deep:  Math.round(d.deepWorkMins),
      state: d.flowState,
    })),
    keyInsights: [
      intel.burnout.insight,
      intel.focus.insight,
      intel.history.insight,
    ].filter(Boolean),
    recommendations: recs.slice(0, 3),
    maturityLevel:   intel.meta.maturityLevel,
    confidence:      Math.round(intel.meta.overallConfidence * 100),
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildProductivityNarrative(intel, analysis, isTracking) {
  const maturity = intel.meta.maturityLevel;

  if (maturity === 'learning') {
    return 'Behavioral intelligence is learning your work patterns — insights will personalize over time';
  }

  const parts = [];

  if (intel.focus.peakWindow) {
    parts.push(`Peak cognitive window: ${intel.focus.peakWindow}`);
  }

  if (intel.burnout.riskLevel !== 'low') {
    parts.push(intel.burnout.insight);
  } else if (intel.history.trend === 'improving') {
    parts.push('Productivity improving this week');
  } else if (intel.history.trend === 'declining') {
    parts.push('Productivity declining — consider recovery');
  }

  if (intel.contextSwitch.fragmentation > 60) {
    parts.push('High context-switching detected');
  }

  return parts.join(' · ') || 'Personalized intelligence active';
}

function mergeRecommendations(behavioral, calendar) {
  const seen = new Set();
  const merged = [];
  for (const rec of [...behavioral, ...calendar]) {
    const key = rec.type + ':' + (rec.action || rec.title || '');
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(rec);
    }
  }
  return merged.sort((a, b) => (a.priority || 99) - (b.priority || 99));
}

function riskMax(a, b) {
  const order = { low: 0, medium: 1, high: 2, critical: 3 };
  return (order[a] || 0) >= (order[b] || 0) ? a : b;
}

function mode(arr) {
  if (!arr.length) return null;
  const freq = {};
  for (const v of arr) freq[v] = (freq[v] || 0) + 1;
  return Object.entries(freq).sort(([, a], [, b]) => b - a)[0][0];
}

function fmtHour(h) {
  const h12 = h % 12 || 12;
  return `${h12}${h < 12 ? 'AM' : 'PM'}`;
}

const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
