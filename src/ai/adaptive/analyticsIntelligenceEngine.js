/**
 * Analytics Intelligence Engine
 *
 * Formats adaptive behavioral intelligence into analytics-ready shapes.
 * Consumed by: Reports, Stats, Productivity, Dashboard, Calendar panels.
 *
 * All functions are pure / read-only — they query the behavior engine
 * without triggering any learning pass.
 */

import {
  getIntelligence,
  getAnalyticsData,
  forecastProductivity,
  generateAdaptiveRecommendations,
  FLOW_STATES,
} from './adaptiveBehaviorEngine.js';

// ─── Focus analytics ──────────────────────────────────────────────────────────

/**
 * Return focus analytics data for charts and KPI cards.
 *
 * Suitable for: ProductivityPage focus module, StatsPage, ReportsPage focus module.
 */
export function getFocusAnalytics() {
  const intel = getIntelligence();
  const f     = intel.focus;
  const e     = intel.energy;

  return {
    // Hourly heatmap (24-slot arrays, indexed by hour)
    hourlyFocusScores:   f.hourlyScores,     // 0-100 per hour
    hourlyEnergyLevels:  e.hourlyEnergy,     // 0-100 per hour
    hourlyCounts:        f.hourlyCounts,     // observations per hour
    hourlyMinutes:       f.hourlyMins,       // total minutes tracked per hour

    // Peak window
    peakWindow:     f.peakWindow,
    bestHour:       f.bestHour,
    bestHourLabel:  f.bestHour !== null ? fmtHour(f.bestHour) : null,
    worstHourLabel: f.worstHour !== null ? fmtHour(f.worstHour) : null,
    bestDow:        f.bestDow,
    bestDowLabel:   f.bestDow !== null ? DOW_NAMES[f.bestDow] : null,

    // Metrics
    avgSessionMins:     f.avgSessionMins,
    deepWorkRatioPct:   f.deepWorkRatio,     // 0-100
    observations:       f.observations,
    confidence:         Math.round(f.confidence * 100),
    confidenceLabel:    confidenceLabel(f.confidence),

    // Day-of-week bar chart data
    dowChart: DOW_NAMES.map((day, i) => ({
      day,
      score: intel.focus.dowScores[i] || 0,
    })),

    // Hourly focus chart data (for line/area chart)
    hourlyChart: intel.focus.hourlyScores.map((score, i) => ({
      hour:    i,
      label:   fmtHour(i),
      score:   score || 0,
      energy:  e.hourlyEnergy[i] || 50,
      minutes: f.hourlyMins[i] || 0,
    })),

    // Insight strings
    insights: [
      f.peakWindow
        ? `Highest deep work consistency: ${f.peakWindow}`
        : 'Still learning your focus patterns — keep tracking',
      f.bestDow !== null
        ? `Most productive day: ${DOW_NAMES[f.bestDow]}`
        : null,
      f.deepWorkRatio > 0
        ? `${f.deepWorkRatio}% of tracked time is deep work`
        : null,
    ].filter(Boolean),
  };
}

// ─── Burnout & recovery analytics ────────────────────────────────────────────

/**
 * Return burnout and recovery analytics.
 *
 * Suitable for: ReportsPage burnout module, Productivity burnout card.
 */
export function getBurnoutAnalytics() {
  const intel = getIntelligence();
  const b     = intel.burnout;
  const hist  = intel.history;

  // Weekly hours chart data (last 8 weeks)
  const weeklyHoursChart = (b.recentWeeklyHours || []).map((h, i) => ({
    week:         `W-${(b.recentWeeklyHours.length - i)}`,
    hours:        Math.round(h * 10) / 10,
    sustainable:  Math.round(b.sustainableHoursPerWeek),
    overloaded:   h > b.sustainableHoursPerWeek,
  }));

  // Add current week
  weeklyHoursChart.push({
    week:        'This Week',
    hours:       b.currentWeekHours,
    sustainable: Math.round(b.sustainableHoursPerWeek),
    overloaded:  b.currentWeekHours > b.sustainableHoursPerWeek,
    isCurrent:   true,
  });

  // Fatigue gauge
  const fatigueGauge = {
    value:  b.fatigue,
    label:  b.riskLevel.charAt(0).toUpperCase() + b.riskLevel.slice(1),
    color:  b.riskLevel === 'critical' ? '#EF4444'
      : b.riskLevel === 'high'     ? '#F87171'
      : b.riskLevel === 'medium'   ? '#FBBF24'
      : '#34D399',
  };

  return {
    riskLevel:             b.riskLevel,
    fatigue:               b.fatigue,
    fatigueGauge,
    sustainableHoursPerWeek: b.sustainableHoursPerWeek,
    currentWeekHours:      b.currentWeekHours,
    weeklyHoursChart,
    isAtRisk:              b.isAtRisk,
    isCritical:            b.isCritical,
    observations:          b.observations,
    productivity7DayAvg:   hist.rollingAvg7,
    productivity30DayAvg:  hist.rollingAvg30,
    productivityTrend:     hist.trend,
    consistency:           hist.consistency,
    insights: [
      b.insight,
      b.currentWeekHours > 0
        ? `This week: ${Math.round(b.currentWeekHours * 10) / 10}h of ${Math.round(b.sustainableHoursPerWeek)}h sustainable`
        : null,
      hist.trend !== 'insufficient_data'
        ? `Productivity ${hist.trend} over the past week`
        : null,
    ].filter(Boolean),
  };
}

// ─── Context switching analytics ──────────────────────────────────────────────

/**
 * Return context switching analytics.
 *
 * Suitable for: ReportsPage switching module, ProductivityPage context module.
 */
export function getContextSwitchAnalytics() {
  const intel = getIntelligence();
  const cs    = intel.contextSwitch;
  const fh    = intel.flow;

  return {
    baseline:        cs.baseline,
    thresholdHigh:   cs.thresholdHigh,
    thresholdCritical: cs.thresholdCritical,
    fragmentation:   cs.fragmentation,
    isHighSwitcher:  cs.isHighSwitcher,

    // Hourly switching heatmap
    hourlyChart: cs.hourlyBaseline.map((rate, i) => ({
      hour:  i,
      label: fmtHour(i),
      rate:  Math.round(rate * 10) / 10,
      level: rate >= cs.thresholdCritical ? 'critical'
        : rate >= cs.thresholdHigh ? 'high'
        : rate >= cs.baseline      ? 'moderate'
        : 'low',
    })),

    // Flow state distribution for pie chart
    flowStateChart: Object.entries(fh.stateDistribution).map(([state, frac]) => ({
      state,
      label:   FLOW_STATE_LABELS[state] || state,
      color:   FLOW_STATE_COLORS[state] || '#94A3B8',
      percent: Math.round(frac * 100),
    })).sort((a, b) => b.percent - a.percent),

    confidence:    confidenceLabel(intel.meta.overallConfidence),
    observations:  cs.observations,

    insights: [
      cs.insight,
      cs.isHighSwitcher
        ? 'Research loops are interrupting implementation consistency'
        : cs.fragmentation > 30
        ? 'Some context fragmentation — aim for 25+ minute focused blocks'
        : 'Healthy focus continuity detected',
    ].filter(Boolean),
  };
}

// ─── Productivity history analytics ──────────────────────────────────────────

/**
 * Return productivity history for time-series charts.
 *
 * Suitable for: StatsPage, ReportsPage overview, Dashboard trend.
 *
 * @param {number} days - number of days to return (default 30)
 */
export function getProductivityHistoryAnalytics(days = 30) {
  const intel  = getIntelligence();
  const h      = intel.history;
  const recent = h.daily.slice(-days);

  // Time series chart data
  const timeSeries = recent.map(d => ({
    date:         d.date,
    score:        d.score,
    hours:        Math.round(d.hours * 10) / 10,
    deepWorkMins: Math.round(d.deepWorkMins),
    switchRate:   Math.round(d.switchRate * 10) / 10,
    flowState:    d.flowState,
    flowLabel:    FLOW_STATE_LABELS[d.flowState] || 'Focused',
    flowColor:    FLOW_STATE_COLORS[d.flowState] || '#60A5FA',
  }));

  // Weekly aggregation for bar chart
  const weeklyBuckets = {};
  for (const d of recent) {
    const weekKey = getWeekLabel(d.date);
    if (!weeklyBuckets[weekKey]) weeklyBuckets[weekKey] = { scores: [], hours: 0, deepWorkMins: 0 };
    weeklyBuckets[weekKey].scores.push(d.score);
    weeklyBuckets[weekKey].hours += d.hours;
    weeklyBuckets[weekKey].deepWorkMins += d.deepWorkMins;
  }
  const weeklyChart = Object.entries(weeklyBuckets).map(([week, data]) => ({
    week,
    avgScore:     Math.round(data.scores.reduce((s, v) => s + v, 0) / data.scores.length),
    totalHours:   Math.round(data.hours * 10) / 10,
    deepWorkMins: Math.round(data.deepWorkMins),
    days:         data.scores.length,
  }));

  return {
    timeSeries,
    weeklyChart,
    rollingAvg7:  h.rollingAvg7,
    rollingAvg30: h.rollingAvg30,
    trend:        h.trend,
    peakScore:    h.peakScore,
    lowestScore:  h.lowestScore,
    consistency:  h.consistency,
    totalDays:    h.totalDays,
    insights: [
      h.insight,
      h.consistency > 70
        ? `${h.consistency}% productivity consistency — strong performance habit`
        : h.consistency > 40
        ? 'Moderate consistency — establishing stronger work patterns'
        : null,
      h.peakScore > 0 ? `Personal best score: ${h.peakScore}/100` : null,
    ].filter(Boolean),
  };
}

// ─── Workflow intelligence analytics ──────────────────────────────────────────

/**
 * Return workflow memory and pattern analytics.
 *
 * Suitable for: ProjectAnalyticsPage, AI Insights section, Workflow panel.
 */
export function getWorkflowIntelligenceAnalytics() {
  const intel = getIntelligence();
  const wf    = intel.workflow;

  return {
    recurringPatterns:   wf.recurringPatterns,
    recentWorkflows:     wf.recentWorkflows,
    continuityChain:     wf.continuityChain,
    isContinuing:        wf.isContinuing,
    currentWorkflow:     wf.currentWorkflow,
    projectBehaviors:    wf.projectBehaviors,
    observations:        wf.observations,

    // For timeline visualization — last 10 workflows
    workflowTimeline: wf.recentWorkflows
      .sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen))
      .slice(0, 10)
      .map(w => ({
        title:    w.title,
        category: w.category,
        count:    w.count,
        avgMins:  Math.round(w.avgMins),
        lastSeen: w.lastSeen,
        isRecurring: w.count >= 3,
      })),

    // For word cloud / frequency list
    patternFrequency: wf.recurringPatterns.map(p => ({
      label:    p.label,
      weight:   p.frequency,
      category: p.category,
      avgHour:  p.avgStartHour,
      hourLabel: fmtHour(p.avgStartHour || 9),
    })),

    insight: wf.insight,
  };
}

// ─── Productivity forecast analytics ─────────────────────────────────────────

/**
 * Return a productivity forecast for visualization.
 *
 * Suitable for: Dashboard next-session widget, AI Insights forecast card.
 */
export function getForecastAnalytics(hoursAhead = 8) {
  const forecast = forecastProductivity(hoursAhead);
  const intel    = getIntelligence();

  const best = forecast.reduce((a, b) => a.predictedScore > b.predictedScore ? a : b, forecast[0]);

  return {
    forecast,
    bestWindow: best,
    peakWindowLabel: intel.focus.peakWindow,
    confidence:      intel.focus.confidence,
    confidenceLabel: confidenceLabel(intel.focus.confidence),
    burnoutRisk:     intel.burnout.riskLevel,

    // Chart-ready: area chart of predicted scores
    chart: forecast.map(f => ({
      hour:  f.hour,
      label: f.label,
      score: f.predictedScore,
      color: f.isBestWindow ? '#34D399' : f.predictedScore >= 65 ? '#818CF8' : '#60A5FA',
      isBest: f.isBestWindow,
    })),

    insight: best
      ? `Deep work probability highest at ${best.label} (score: ${best.predictedScore}/100)`
      : null,
  };
}

// ─── Full analytics bundle for reports ───────────────────────────────────────

/**
 * Return the full analytics bundle — consumed by Reports, Stats, Dashboard.
 * This is the single source of truth for behavioral analytics data.
 */
export function getFullAnalyticsBundleForReports() {
  const data  = getAnalyticsData();
  const intel = data.intelligence;

  return {
    // All chart data
    productivityTimeSeries:  data.productivityTimeSeries,
    hourlyFocusHeatmap:      data.hourlyFocusHeatmap,
    dowPerformance:          data.dowPerformance,
    flowStateDistribution:   data.flowStateDistribution,
    burnoutTrajectory:       data.burnoutTrajectory,
    workflowPatterns:        data.workflowPatterns,

    // Summary KPIs
    kpis: {
      avgProductivityScore:  data.summary.avgProductivityScore,
      productivityTrend:     data.summary.productivityTrend,
      peakFocusWindow:       data.summary.peakFocusWindow,
      burnoutRisk:           data.summary.burnoutRisk,
      deepWorkRatioPct:      data.summary.deepWorkRatioLearned,
      sustainableHoursPerDay: data.summary.sustainableHoursPerDay,
      contextSwitchBaseline: data.summary.contextSwitchBaseline,
      bestDay:               data.summary.bestDayLabel,
      maturityLevel:         data.summary.maturityLevel,
      overallConfidence:     data.summary.overallConfidence,
    },

    // Per-module analytics
    focus:         getFocusAnalytics(),
    burnout:       getBurnoutAnalytics(),
    contextSwitch: getContextSwitchAnalytics(),
    history:       getProductivityHistoryAnalytics(90),
    workflow:      getWorkflowIntelligenceAnalytics(),
    forecast:      getForecastAnalytics(6),

    // Recommendations
    recommendations: data.recommendations,

    // Intelligence metadata
    meta: intel.meta,
  };
}

// ─── Sidebar intelligence panel data ─────────────────────────────────────────

/**
 * Return a compact intelligence summary for sidebar/summary panels.
 * Designed to extend the existing calendarInsightsEngine output.
 */
export function getBehavioralInsightsForSidebar() {
  const intel = getIntelligence();
  const recs  = generateAdaptiveRecommendations();
  const forecast = forecastProductivity(3);

  const nextBestWindow = forecast.find(f => f.isBestWindow) || forecast.reduce(
    (a, b) => a.predictedScore > b.predictedScore ? a : b, forecast[0]
  );

  return {
    // Maturity level banner
    maturityLevel:    intel.meta.maturityLevel,
    confidence:       Math.round(intel.meta.overallConfidence * 100),

    // Current behavioral state
    burnoutRisk:      intel.burnout.riskLevel,
    burnoutFatigue:   intel.burnout.fatigue,
    fatigueInsight:   intel.burnout.insight,

    // Focus intelligence
    peakWindow:       intel.focus.peakWindow,
    bestHour:         intel.focus.bestHour,
    bestHourLabel:    intel.focus.bestHour !== null ? fmtHour(intel.focus.bestHour) : null,
    focusInsight:     intel.focus.insight,

    // Flow
    topFlowState:     intel.flow.topState,
    bestFlowHour:     intel.flow.bestFlowHour,
    avgFlowDuration:  intel.flow.avgFlowDuration,

    // Context switching
    fragmentation:    intel.contextSwitch.fragmentation,
    switchInsight:    intel.contextSwitch.insight,

    // Workflow
    currentWorkflow:  intel.workflow.currentWorkflow,
    isContinuing:     intel.workflow.isContinuing,
    workflowInsight:  intel.workflow.insight,

    // Productivity history
    rollingAvg7:      intel.history.rollingAvg7,
    productivityTrend: intel.history.trend,
    historyInsight:   intel.history.insight,

    // Next best window
    nextBestWindow,

    // Adaptive recommendations (top 3 for sidebar)
    topRecommendations: recs.slice(0, 3),
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtHour(h) {
  const h12 = h % 12 || 12;
  return `${h12}${h < 12 ? 'AM' : 'PM'}`;
}

function confidenceLabel(c) {
  return c < 0.2 ? 'Low (still learning)'
    : c < 0.5 ? 'Developing'
    : c < 0.8 ? 'High'
    : 'Very High';
}

function getWeekLabel(dateStr) {
  const d = new Date(dateStr);
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const DOW_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

const FLOW_STATE_LABELS = {
  deep_flow:         'Deep Flow',
  high_momentum:     'High Momentum',
  focused:           'Focused',
  research_mode:     'Research Mode',
  planning_state:    'Planning',
  context_switching: 'Context Switching',
  recovery_needed:   'Recovery Needed',
  burnout_risk:      'Burnout Risk',
};

const FLOW_STATE_COLORS = {
  deep_flow:         '#34D399',
  high_momentum:     '#818CF8',
  focused:           '#60A5FA',
  research_mode:     '#FBBF24',
  planning_state:    '#A78BFA',
  context_switching: '#F87171',
  recovery_needed:   '#FB923C',
  burnout_risk:      '#EF4444',
};
