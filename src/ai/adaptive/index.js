/**
 * Adaptive Behavioral Intelligence — barrel export
 *
 * Import from here rather than individual files:
 *   import { useAdaptiveIntelligence } from '../../ai/adaptive';
 *   import { getFullAnalyticsBundleForReports } from '../../ai/adaptive';
 */

// Core engine
export {
  learn,
  getIntelligence,
  getAnalyticsData,
  detectCurrentFlowState,
  forecastProductivity,
  generateAdaptiveRecommendations,
  recordRecommendationFeedback,
  resetIntelligence,
  FLOW_STATES,
} from './adaptiveBehaviorEngine.js';

// Analytics intelligence layer
export {
  getFocusAnalytics,
  getBurnoutAnalytics,
  getContextSwitchAnalytics,
  getProductivityHistoryAnalytics,
  getWorkflowIntelligenceAnalytics,
  getForecastAnalytics,
  getFullAnalyticsBundleForReports,
  getBehavioralInsightsForSidebar,
} from './analyticsIntelligenceEngine.js';

// Bridge (app integration)
export {
  triggerLearning,
  enrichInsightsWithBehavior,
  getEnrichedAnalyticsForPeriod,
  getDashboardBehavioralKPIs,
  getProjectBehavioralIntel,
} from './behaviorAnalyticsBridge.js';

// Aggregator (multi-surface insights)
export {
  aggregateSummaryPanelInsights,
  aggregateReportModuleData,
  getWeeklyBehavioralReview,
} from './productivityInsightsAggregator.js';
