/**
 * usePredictiveIntelligence
 *
 * React hook — the single integration point for the Predictive Intelligence
 * layer (src/ai/predictive/). Sits on top of useAdaptiveIntelligence's learned
 * `behavioral` snapshot rather than re-learning anything itself.
 *
 * Usage:
 *   const adaptiveAI   = useAdaptiveIntelligence({ sessions, autoSessions });
 *   const predictiveAI = usePredictiveIntelligence({
 *     behavioral: adaptiveAI.behavioral,
 *     sessions, autoSessions, calendarEvents, tasks, projects,
 *     upcomingEvent,
 *   });
 *
 *   predictiveAI.brief.burnoutTrajectory
 *   predictiveAI.brief.workloadForecast
 *   predictiveAI.brief.scheduleRisk
 *   predictiveAI.brief.anomalies
 *   predictiveAI.brief.nextAction
 *   predictiveAI.topAlert
 */

import { useMemo } from 'react';
import { getPredictiveBrief } from '../ai/predictive/predictiveIntelligenceOrchestrator.js';

// Local (not UTC) date key — toISOString() shifts to the previous day for
// anyone west of UTC once local time is past midnight UTC, which would
// silently exclude this morning's sessions from "today".
function localDateKey(unixSec) {
  const d = new Date((unixSec || 0) * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * @param {Object} opts
 * @param {Object} opts.behavioral       - adaptiveBehaviorEngine snapshot (from useAdaptiveIntelligence)
 * @param {Array}  [opts.sessions]
 * @param {Array}  [opts.autoSessions]
 * @param {Array}  [opts.calendarEvents]
 * @param {Array}  [opts.tasks]
 * @param {Array}  [opts.projects]
 * @param {string} [opts.currentProjectId]
 * @param {Object} [opts.upcomingEvent]
 * @param {boolean} [opts.enabled]
 */
export function usePredictiveIntelligence({
  behavioral        = null,
  sessions          = [],
  autoSessions      = [],
  calendarEvents    = [],
  tasks             = [],
  projects          = [],
  currentProjectId  = null,
  upcomingEvent     = null,
  enabled           = true,
} = {}) {
  // Only today's activity is relevant to the predictors (anomaly detection,
  // workload-so-far) — filtering here keeps the orchestrator inputs small
  // and keeps the memo key stable across full-history reloads.
  const todayKey = localDateKey(Math.floor(Date.now() / 1000));
  const todaySessions = useMemo(
    () => sessions.filter(s => localDateKey(s.started_at) === todayKey),
    [sessions, todayKey],
  );
  const todayAutoSessions = useMemo(
    () => autoSessions.filter(a => localDateKey(a.started_at) === todayKey),
    [autoSessions, todayKey],
  );

  const brief = useMemo(() => {
    if (!enabled || !behavioral) return null;
    try {
      return getPredictiveBrief({
        behavioral,
        sessions: todaySessions,
        autoSessions: todayAutoSessions,
        calendarEvents,
        tasks,
        projects,
        currentProjectId,
        upcomingEvent,
      });
    } catch {
      return null;
    }
  }, [
    enabled, behavioral, todaySessions, todayAutoSessions,
    calendarEvents, tasks, projects, currentProjectId, upcomingEvent,
  ]);

  return {
    isReady: !!brief?.available,
    brief,

    // Shortcuts — most commonly used fields
    burnoutTrajectory: brief?.burnoutTrajectory || null,
    scheduleRisk:       brief?.scheduleRisk || null,
    workloadForecast:   brief?.workloadForecast || null,
    anomalies:          brief?.anomalies?.anomalies || [],
    hasAnomalies:       brief?.anomalies?.hasAnomalies || false,
    nextAction:         brief?.nextAction?.predictions?.[0] || null,
    topAlert:           brief?.topAlert || null,
    overallConfidence:  brief?.overallConfidence || 0,
  };
}

export default usePredictiveIntelligence;
