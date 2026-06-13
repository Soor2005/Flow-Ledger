/**
 * Behavior Analytics Bridge
 *
 * Merges adaptive behavioral intelligence with the existing calendarInsightsEngine
 * output. Provides a single enriched intelligence object consumed by:
 *   - useAdaptiveIntelligence hook
 *   - SummaryPanel AIInsightsPanel
 *   - Dashboard Overview
 *   - Reports & Stats pages (via getEnrichedAnalytics)
 *
 * The bridge does NOT replace existing insights — it augments them with
 * personalized learned behavioral context.
 */

import {
  learn,
  getIntelligence,
  detectCurrentFlowState,
  generateAdaptiveRecommendations,
  forecastProductivity,
  getAnalyticsData,
  recordRecommendationFeedback,
} from './adaptiveBehaviorEngine.js';

import {
  getBehavioralInsightsForSidebar,
  getFullAnalyticsBundleForReports,
  getFocusAnalytics,
  getBurnoutAnalytics,
  getContextSwitchAnalytics,
  getProductivityHistoryAnalytics,
  getWorkflowIntelligenceAnalytics,
  getForecastAnalytics,
} from './analyticsIntelligenceEngine.js';

// ─── Session normalization ────────────────────────────────────────────────────

function normalizeSessions(sessions = []) {
  return sessions.filter(s => {
    const dur = s.duration_seconds || 0;
    return dur >= 120;
  });
}

// ─── Main learning trigger ────────────────────────────────────────────────────

/**
 * Trigger a learning pass from the app's current session data.
 * Call this:
 *   - On app startup (with cached sessions)
 *   - After a session ends
 *   - After bulk session import
 *   - In useCalendarAI's runAnalysis callback
 *
 * @param {Array} sessions      - manual sessions
 * @param {Array} autoSessions  - auto-tracked sessions
 * @returns {Object} intelligence snapshot
 */
export function triggerLearning(sessions = [], autoSessions = []) {
  const normalized = normalizeSessions(sessions);
  return learn(normalized, autoSessions);
}

// ─── Enriched insights for the Summary Panel / AI Insights section ────────────

/**
 * Merge behavioral intelligence with the existing calendarInsights bundle.
 * The existing bundle from calendarInsightsEngine becomes the base;
 * this function injects behavioral context into it.
 *
 * @param {Object} existingInsights - output of generateInsightsBundleForSidebar
 * @param {Object} [liveSession]    - current live session data (optional)
 * @returns {Object} enriched insights bundle
 */
export function enrichInsightsWithBehavior(existingInsights = {}, liveSession = null) {
  const behavioral = getBehavioralInsightsForSidebar();
  const intel      = getIntelligence();
  const forecast   = forecastProductivity(4);
  const recs       = generateAdaptiveRecommendations();

  // Detect current flow state if there's an active session
  const currentFlow = liveSession
    ? detectCurrentFlowState(liveSession)
    : null;

  // Merge recommendations: behavioral recs first, then existing
  const existingRecs = existingInsights?.recommendations || [];
  const mergedRecs = [
    ...recs.map(r => ({ ...r, source: 'behavioral' })),
    ...existingRecs.map(r => ({ ...r, source: 'calendar' })),
  ].slice(0, 5);

  return {
    // Pass through everything from the existing bundle
    ...existingInsights,

    // ── Behavioral augmentation ──────────────────────────────────────────
    behavioral: {
      // Current flow state
      currentFlowState:    currentFlow,
      flowStateMeta:       currentFlow ? {
        state:       currentFlow.state,
        label:       currentFlow.label,
        color:       currentFlow.color,
        emoji:       currentFlow.emoji,
        description: currentFlow.description,
        recommendation: currentFlow.recommendation,
      } : null,

      // Burnout & fatigue
      burnoutRisk:     behavioral.burnoutRisk,
      burnoutFatigue:  behavioral.burnoutFatigue,
      fatigueInsight:  behavioral.fatigueInsight,
      burnoutColor:    burnoutColor(behavioral.burnoutRisk),

      // Focus patterns
      peakWindow:       behavioral.peakWindow,
      bestHour:         behavioral.bestHour,
      bestHourLabel:    behavioral.bestHourLabel,
      focusInsight:     behavioral.focusInsight,

      // Context switching
      fragmentation:    behavioral.fragmentation,
      switchInsight:    behavioral.switchInsight,

      // Workflow continuity
      currentWorkflow:  behavioral.currentWorkflow,
      isContinuing:     behavioral.isContinuing,
      workflowInsight:  behavioral.workflowInsight,

      // Productivity trend
      rollingAvg7:      behavioral.rollingAvg7,
      productivityTrend: behavioral.productivityTrend,
      historyInsight:   behavioral.historyInsight,

      // Forecast
      forecast,
      nextBestWindow:   behavioral.nextBestWindow,

      // Top behavioral recommendations
      topRecommendations: recs.slice(0, 3),

      // Intelligence maturity
      maturityLevel:    behavioral.maturityLevel,
      confidence:       behavioral.confidence,
    },

    // ── Override recommendations with merged list ────────────────────────
    recommendations: mergedRecs,

    // ── Add behavioral summary flags ─────────────────────────────────────
    summary: {
      ...(existingInsights?.summary || {}),
      hasBehavioralIntelligence: intel.meta.totalObservations > 0,
      behavioralMaturity:        intel.meta.maturityLevel,
      behavioralConfidence:      Math.round(intel.meta.overallConfidence * 100),
      burnoutRisk:               behavioral.burnoutRisk,
      isInPeakWindow:            isPeakWindowNow(intel),
    },
  };
}

// ─── Analytics data for reports/stats pages ───────────────────────────────────

/**
 * Return analytics data ready for the Reports and Stats pages.
 * These pages call window.electron for their data, but behavioral
 * analytics is returned from localStorage — no electron IPC needed.
 *
 * @param {'7d'|'14d'|'30d'|'90d'} period
 * @returns {Object} enriched analytics for report charts
 */
export function getEnrichedAnalyticsForPeriod(period = '30d') {
  const days = { '7d': 7, '14d': 14, '30d': 30, '90d': 90 }[period] || 30;

  return {
    // Full report bundle
    ...getFullAnalyticsBundleForReports(),

    // Per-period slices
    productivityHistory:  getProductivityHistoryAnalytics(days),
    focusAnalytics:       getFocusAnalytics(),
    burnoutAnalytics:     getBurnoutAnalytics(),
    contextSwitch:        getContextSwitchAnalytics(),
    workflow:             getWorkflowIntelligenceAnalytics(),
    forecast:             getForecastAnalytics(8),

    period,
    days,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Return a minimal behavioral KPI set for Dashboard Overview cards.
 *
 * @returns {Object}
 */
export function getDashboardBehavioralKPIs() {
  const intel = getIntelligence();

  return {
    // Score & trend
    productivityScore:   intel.history.rollingAvg7,
    productivityTrend:   intel.history.trend,
    scoreColor:          scoreColor(intel.history.rollingAvg7),

    // Focus
    peakWindow:         intel.focus.peakWindow,
    deepWorkRatio:      intel.focus.deepWorkRatio,
    focusConfidence:    Math.round(intel.focus.confidence * 100),

    // Burnout
    burnoutRisk:        intel.burnout.riskLevel,
    burnoutFatigue:     intel.burnout.fatigue,
    weeklyHours:        intel.burnout.currentWeekHours,
    sustainableHours:   intel.burnout.sustainableHoursPerWeek,

    // Flow
    topFlowState:       intel.flow.topState,
    bestFlowHour:       intel.flow.bestFlowHour,

    // Context switching
    fragmentation:      intel.contextSwitch.fragmentation,
    switchBaseline:     intel.contextSwitch.baseline,

    // System maturity
    maturityLevel:      intel.meta.maturityLevel,
    overallConfidence:  Math.round(intel.meta.overallConfidence * 100),
    observations:       intel.meta.totalObservations,

    // Top recommendation
    topRecommendation:  generateAdaptiveRecommendations()[0] || null,
  };
}

/**
 * Return project-specific behavioral intelligence.
 * Useful in ProjectAnalyticsPage to show learned behavior per project.
 *
 * @param {string} projectId
 * @returns {Object|null}
 */
export function getProjectBehavioralIntel(projectId) {
  if (!projectId) return null;
  const intel = getIntelligence();
  const pb    = intel.workflow.projectBehaviors[projectId];
  if (!pb) return null;

  return {
    projectId,
    sessionCount:    pb.count,
    avgSessionMins:  Math.round(pb.avgMins),
    category:        pb.category,
    deepWorkRatioPct: Math.round(pb.deepWorkRatio * 100),
    insight: pb.deepWorkRatio > 0.5
      ? `${Math.round(pb.deepWorkRatio * 100)}% of ${pb.category} work on this project is deep focus`
      : `Primarily ${pb.category} work — ${pb.count} sessions tracked`,
  };
}

/**
 * Expose recommendation feedback recording so UI components can call it.
 */
export { recordRecommendationFeedback };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function burnoutColor(risk) {
  return risk === 'critical' ? '#EF4444'
    : risk === 'high'     ? '#F87171'
    : risk === 'medium'   ? '#FBBF24'
    : '#34D399';
}

function scoreColor(score) {
  return score >= 80 ? '#34D399'
    : score >= 65 ? '#818CF8'
    : score >= 45 ? '#FBBF24'
    : '#F87171';
}

function isPeakWindowNow(intel) {
  const hour = new Date().getHours();
  const best = intel.focus.bestHour;
  return best !== null && Math.abs(hour - best) <= 1 && intel.focus.observations >= 5;
}
