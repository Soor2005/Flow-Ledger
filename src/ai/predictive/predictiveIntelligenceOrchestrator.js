/**
 * Predictive Intelligence Orchestrator
 *
 * Single entry point for the Predictive Intelligence layer — mirrors the
 * coordination pattern of reasoningOrchestrator.js (the narrative pipeline),
 * but for forward-looking forecasts instead of backward-looking narration.
 *
 * Architecture position: this layer sits ON TOP of adaptiveBehaviorEngine
 * (the learned-pattern "memory" of focus/energy/workflow/burnout/history)
 * rather than duplicating it — every predictor below reads that same shared
 * snapshot, so they reason from one consistent picture of the user instead
 * of each maintaining its own private state. That shared snapshot is the
 * "contextual memory" backbone other modules (proactive automation, future
 * cross-module collaboration) can subscribe to without depending on each
 * predictor's internals.
 *
 * Each predictor degrades gracefully (returns `available: false` with a
 * reason) rather than guessing confidently from thin data — a forecast you
 * can't trust is worse than no forecast.
 */

import { forecastBurnoutTrajectory } from './burnoutTrajectoryEngine.js';
import { predictScheduleRisk }       from './scheduleRiskPredictor.js';
import { forecastWorkload }          from './workloadForecastEngine.js';
import { detectAnomalies }           from './anomalyDetectionEngine.js';
import { predictNextAction }         from './nextActionPredictor.js';

function emptyBrief() {
  return {
    available: false,
    burnoutTrajectory: null,
    scheduleRisk: null,
    workloadForecast: null,
    anomalies: null,
    nextAction: null,
    overallConfidence: 0,
    generatedAt: Date.now(),
  };
}

/**
 * @param {Object} opts
 * @param {Object} opts.behavioral      - adaptiveBehaviorEngine.getIntelligence() snapshot
 * @param {Array}  [opts.sessions]      - today's manual sessions (for anomaly detection)
 * @param {Array}  [opts.autoSessions]  - today's auto-tracked sessions
 * @param {Array}  [opts.calendarEvents]
 * @param {Array}  [opts.tasks]
 * @param {Array}  [opts.projects]
 * @param {string} [opts.currentProjectId]
 * @param {Object} [opts.upcomingEvent] - { hour, dow, projectId, plannedDurationMins, label }
 * @returns {Object} PredictiveBrief
 */
export function getPredictiveBrief({
  behavioral        = null,
  sessions          = [],
  autoSessions      = [],
  calendarEvents    = [],
  tasks             = [],
  projects          = [],
  currentProjectId  = null,
  upcomingEvent     = null,
} = {}) {
  if (!behavioral) return emptyBrief();

  let burnoutTrajectory = null, scheduleRisk = null, workloadForecast = null, anomalies = null, nextAction = null;

  try { burnoutTrajectory = forecastBurnoutTrajectory(behavioral); } catch { /* never crash the host UI on a forecast failure */ }
  try { if (upcomingEvent) scheduleRisk = predictScheduleRisk(behavioral, upcomingEvent); } catch {}
  try { workloadForecast = forecastWorkload(behavioral, { calendarEvents, tasks }); } catch {}
  try { anomalies = detectAnomalies(behavioral, { sessions, autoSessions }); } catch {}
  try { nextAction = predictNextAction(behavioral, { projects, currentProjectId }); } catch {}

  const subConfidences = [burnoutTrajectory, scheduleRisk, workloadForecast, anomalies]
    .filter(x => x?.available)
    .map(x => x.confidence || 0);
  const overallConfidence = subConfidences.length
    ? Math.round((subConfidences.reduce((s, c) => s + c, 0) / subConfidences.length) * 100) / 100
    : 0;

  // Highest-priority proactive callout across all predictors — the single
  // thing worth surfacing first if the UI only has room for one line.
  // Carries the source predictor's own confidence, not a fabricated number.
  const topAlert =
    burnoutTrajectory?.crossesCriticalOn ? { type: 'burnout', severity: 'high', message: burnoutTrajectory.insight, confidence: burnoutTrajectory.confidence }
    : anomalies?.anomalies?.some(a => a.severity === 'high') ? { type: 'anomaly', severity: 'high', message: anomalies.anomalies.find(a => a.severity === 'high').message, confidence: anomalies.confidence }
    : workloadForecast?.tomorrowOverload ? { type: 'workload', severity: 'moderate', message: workloadForecast.insight, confidence: workloadForecast.confidence }
    : scheduleRisk?.riskLevel === 'high' ? { type: 'schedule', severity: 'moderate', message: scheduleRisk.recommendation, confidence: scheduleRisk.confidence }
    : burnoutTrajectory?.crossesHighOn ? { type: 'burnout', severity: 'moderate', message: burnoutTrajectory.insight, confidence: burnoutTrajectory.confidence }
    : null;

  return {
    available: true,
    burnoutTrajectory,
    scheduleRisk,
    workloadForecast,
    anomalies,
    nextAction,
    topAlert,
    overallConfidence,
    generatedAt: Date.now(),
  };
}
