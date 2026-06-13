/**
 * useAdaptiveIntelligence
 *
 * React hook — the single integration point for behavioral intelligence
 * throughout the app. Wraps adaptiveBehaviorEngine and behaviorAnalyticsBridge.
 *
 * Usage:
 *   const ai = useAdaptiveIntelligence({ sessions, autoSessions });
 *
 *   // Summary panel / AI Insights
 *   ai.flowState         — current detected flow state
 *   ai.burnoutRisk       — 'low' | 'medium' | 'high' | 'critical'
 *   ai.peakWindow        — "9AM–1PM"
 *   ai.recommendations   — adaptive personalized recommendations
 *   ai.forecast          — 4-hour productivity forecast
 *   ai.behavioral        — full behavioral intelligence object
 *
 *   // Reports / Analytics pages
 *   ai.analytics         — analytics-ready data for charts
 *   ai.reportData(days)  — period-sliced report bundle
 *   ai.weeklyReview      — weekly behavioral review
 *
 *   // Actions
 *   ai.triggerLearn()    — manually trigger a learning pass
 *   ai.recordFeedback()  — record recommendation feedback
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  learn,
  getIntelligence,
  detectCurrentFlowState,
  generateAdaptiveRecommendations,
  forecastProductivity,
  getAnalyticsData,
  recordRecommendationFeedback,
} from '../ai/adaptive/adaptiveBehaviorEngine.js';
import {
  triggerLearning,
  enrichInsightsWithBehavior,
  getEnrichedAnalyticsForPeriod,
  getDashboardBehavioralKPIs,
  getProjectBehavioralIntel,
} from '../ai/adaptive/behaviorAnalyticsBridge.js';
import {
  aggregateSummaryPanelInsights,
  aggregateReportModuleData,
  getWeeklyBehavioralReview,
} from '../ai/adaptive/productivityInsightsAggregator.js';

// ─── Throttle helper ──────────────────────────────────────────────────────────

function useThrottle(fn, ms = 2000) {
  const lastRan = useRef(0);
  return useCallback((...args) => {
    const now = Date.now();
    if (now - lastRan.current >= ms) {
      lastRan.current = now;
      return fn(...args);
    }
  }, [fn, ms]);
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * @param {Object} opts
 * @param {Array}   opts.sessions           - manual sessions array
 * @param {Array}   opts.autoSessions       - auto-tracked sessions array
 * @param {Object}  opts.liveSession        - current live session (optional)
 * @param {Object}  opts.calendarInsights   - from useCalendarAI.insights (optional)
 * @param {Object}  opts.productivityAnalysis - from useCalendarAI.productivity (optional)
 * @param {boolean} opts.enabled            - enable/disable the engine (default true)
 * @param {boolean} opts.autoLearn          - auto-trigger learning on mount (default true)
 */
export function useAdaptiveIntelligence({
  sessions         = [],
  autoSessions     = [],
  liveSession      = null,
  calendarInsights = null,
  productivityAnalysis = null,
  enabled          = true,
  autoLearn        = true,
} = {}) {
  const [intelligence, setIntelligence] = useState(null);
  const [isLearning,   setIsLearning]   = useState(false);
  const [lastLearned,  setLastLearned]  = useState(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // ── Initial intelligence read from storage (synchronous, no learning) ──
  useEffect(() => {
    if (!enabled) return;
    try {
      const cached = getIntelligence();
      if (mountedRef.current) setIntelligence(cached);
    } catch {}
  }, [enabled]);

  // ── Learning pass (triggered when sessions change or on mount) ────────
  const runLearning = useCallback(() => {
    if (!enabled || isLearning) return;

    // Don't learn if sessions haven't changed and we learned recently
    if (sessions.length === 0) return;

    setIsLearning(true);
    // Use a microtask so the UI doesn't block
    Promise.resolve().then(() => {
      try {
        const snapshot = triggerLearning(sessions, autoSessions);
        if (mountedRef.current) {
          setIntelligence(snapshot);
          setLastLearned(new Date());
        }
      } catch (err) {
        // Silent — the engine is optional, never crash the app
      } finally {
        if (mountedRef.current) setIsLearning(false);
      }
    });
  }, [sessions, autoSessions, enabled, isLearning]);

  // Throttle to avoid running on every render
  const throttledLearn = useThrottle(runLearning, 5000);

  // Auto-learn on mount and when sessions change
  // Dep array intentionally limited to session count — throttledLearn is stable
  // (useThrottle returns a new ref-wrapped fn only when its inputs change),
  // and including the full sessions array would re-trigger on every object reference change.
  const learnTriggerKey = `${enabled}-${autoLearn}-${sessions.length}`;
  useEffect(() => {
    if (!enabled || !autoLearn) return;
    throttledLearn();
  }, [learnTriggerKey]); // eslint-disable rule not available in this project

  // ── Derive stable output from intelligence snapshot ───────────────────
  const behavioral = useMemo(() => {
    if (!intelligence) return null;
    return intelligence;
  }, [intelligence]);

  // ── Current flow state (re-derived when live session changes) ────────
  const currentFlowState = useMemo(() => {
    if (!liveSession) return null;
    try {
      return detectCurrentFlowState(liveSession);
    } catch {
      return null;
    }
  }, [
    liveSession?.durationMins,
    liveSession?.switchRate,
    liveSession?.category,
    liveSession?.isDeepWork,
  ]);

  // ── Recommendations (regenerated when intelligence or live session changes) ──
  const recommendations = useMemo(() => {
    if (!intelligence) return [];
    try { return generateAdaptiveRecommendations(); } catch { return []; }
  }, [intelligence, liveSession?.durationMins, liveSession?.category]);

  // ── 4-hour forecast ───────────────────────────────────────────────────
  const forecast = useMemo(() => {
    if (!intelligence) return [];
    try { return forecastProductivity(4); } catch { return []; }
  }, [intelligence]);

  // ── Summary panel enriched insights ──────────────────────────────────
  const summaryInsights = useMemo(() => {
    if (!intelligence) return null;
    try {
      return aggregateSummaryPanelInsights({
        calendarInsights,
        productivityAnalysis,
        liveSession,
        isTracking: !!liveSession,
      });
    } catch { return null; }
  }, [intelligence, calendarInsights, productivityAnalysis, liveSession]);

  // ── Dashboard KPIs ────────────────────────────────────────────────────
  const dashboardKPIs = useMemo(() => {
    if (!intelligence) return null;
    try { return getDashboardBehavioralKPIs(); } catch { return null; }
  }, [intelligence]);

  // ── Weekly review ─────────────────────────────────────────────────────
  const weeklyReview = useMemo(() => {
    if (!intelligence) return null;
    try { return getWeeklyBehavioralReview(); } catch { return null; }
  }, [intelligence]);

  // ── Analytics data (for charts/reports) — lazy, call on demand ───────
  const getAnalytics = useCallback(() => {
    try { return getAnalyticsData(); } catch { return null; }
  }, []);

  const getReportData = useCallback((period = '30d') => {
    try { return getEnrichedAnalyticsForPeriod(period); } catch { return null; }
  }, []);

  const getModuleData = useCallback((module, days = 30) => {
    try { return aggregateReportModuleData(module, days); } catch { return null; }
  }, []);

  const getProjectIntel = useCallback((projectId) => {
    try { return getProjectBehavioralIntel(projectId); } catch { return null; }
  }, []);

  // ── Feedback recorder ─────────────────────────────────────────────────
  const recordFeedback = useCallback((recId, accepted) => {
    try { recordRecommendationFeedback(recId, accepted); } catch {}
  }, []);

  // ── Public API ────────────────────────────────────────────────────────
  return {
    // State
    isLearning,
    lastLearned,
    isReady: !!intelligence,

    // Core intelligence object (raw)
    behavioral,
    intelligence,

    // Real-time
    currentFlowState,
    recommendations,
    forecast,

    // Derived views
    summaryInsights,
    dashboardKPIs,
    weeklyReview,

    // Shortcuts (most commonly used fields)
    burnoutRisk:      intelligence?.burnout?.riskLevel || 'low',
    burnoutFatigue:   intelligence?.burnout?.fatigue || 0,
    peakWindow:       intelligence?.focus?.peakWindow || null,
    bestHour:         intelligence?.focus?.bestHour,
    fragmentation:    intelligence?.contextSwitch?.fragmentation || 0,
    rollingAvg7:      intelligence?.history?.rollingAvg7 || 0,
    productivityTrend: intelligence?.history?.trend || 'insufficient_data',
    maturityLevel:    intelligence?.meta?.maturityLevel || 'learning',
    overallConfidence: Math.round((intelligence?.meta?.overallConfidence || 0) * 100),
    currentWorkflow:  intelligence?.workflow?.currentWorkflow || null,
    isContinuing:     intelligence?.workflow?.isContinuing || false,
    topFlowState:     intelligence?.flow?.topState || null,

    // Analytics data (lazy — call when needed)
    getAnalytics,
    getReportData,
    getModuleData,
    getProjectIntel,

    // Actions
    triggerLearn:   runLearning,
    recordFeedback,
  };
}

export default useAdaptiveIntelligence;
