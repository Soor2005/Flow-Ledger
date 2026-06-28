/**
 * Burnout Trajectory Engine
 * Part of the Predictive Intelligence layer — sits ON TOP of adaptiveBehaviorEngine,
 * which only reports *current* fatigue. This engine projects fatigue FORWARD,
 * answering "if I keep working at this pace, when do I cross into high/critical risk?"
 *
 * Reuses the exact fatigue formula adaptiveBehaviorEngine.recomputeFatigue() applies
 * to real data, so a forecast here stays consistent with what the live tracker will
 * actually show once those days arrive.
 */

import { localISODate, addDaysLocal } from './dateUtils.js';

function clamp(v, lo = 0, hi = 100) { return Math.max(lo, Math.min(hi, v)); }

// Mirrors adaptiveBehaviorEngine's recomputeFatigue() base-curve, minus the
// consecutive-high-days term (not exposed on the public snapshot) and break
// recovery (unknowable ahead of time) — both are minor contributors next to
// the dominant hours/sustainable ratio term.
function fatigueForWeekHours(weekHours, sustainableHoursPerWeek) {
  const sustainable = Math.max(sustainableHoursPerWeek, 20);
  const ratio = weekHours / sustainable;
  let base;
  if (ratio <= 0)        base = 0;
  else if (ratio <= 1)   base = ratio * 40;
  else if (ratio <= 1.5) base = 40 + (ratio - 1) * 70;
  else                    base = 75 + (ratio - 1.5) * 50;
  return clamp(base);
}

function riskLevelFor(fatigue) {
  if (fatigue < 25) return 'low';
  if (fatigue < 50) return 'medium';
  if (fatigue < 75) return 'high';
  return 'critical';
}

/**
 * Project burnout fatigue forward over the next `daysAhead` days.
 *
 * @param {Object} behavioral - adaptiveBehaviorEngine.getIntelligence() snapshot
 * @param {number} daysAhead
 * @returns {Object} trajectory forecast
 */
export function forecastBurnoutTrajectory(behavioral, daysAhead = 7) {
  const burnout = behavioral?.burnout;
  if (!burnout || burnout.observations < 5) {
    return {
      available: false,
      reason: 'insufficient_history',
      confidence: 0,
      dailyForecast: [],
      crossesHighOn: null,
      crossesCriticalOn: null,
      insight: 'Keep tracking — burnout trajectory needs a bit more history to project forward.',
    };
  }

  const sustainable = burnout.sustainableHoursPerWeek || 35;
  const recentWeeks = (burnout.recentWeeklyHours || []).slice(-6);
  const currentWeekHours = burnout.currentWeekHours || 0;

  // Daily pace: prefer this week's actual pace so far; fall back to the most
  // recent completed week if this week has barely started.
  const today = new Date();
  const dowIdx = (today.getDay() + 6) % 7; // Mon=0..Sun=6
  const daysElapsedThisWeek = dowIdx + 1;
  const paceFromThisWeek = currentWeekHours / daysElapsedThisWeek;
  const paceFromLastWeek = recentWeeks.length ? recentWeeks[recentWeeks.length - 1] / 7 : paceFromThisWeek;
  const dailyPace = daysElapsedThisWeek >= 2 ? paceFromThisWeek : (paceFromThisWeek + paceFromLastWeek) / 2 || paceFromLastWeek;

  // Trend across recent weeks (hours/week change per week) — simple endpoint
  // slope is more robust than full regression against only 3-6 noisy points.
  let weeklyTrend = 0;
  if (recentWeeks.length >= 3) {
    weeklyTrend = (recentWeeks[recentWeeks.length - 1] - recentWeeks[0]) / (recentWeeks.length - 1);
  }
  // Dampen the trend's daily contribution so a single noisy week doesn't dominate.
  const dailyTrendAdjust = (weeklyTrend / 7) * 0.5;

  const dailyForecast = [];
  let crossesHighOn = null;
  let crossesCriticalOn = null;

  let rollingWeekHours = currentWeekHours;
  let simulatedDow = dowIdx;

  for (let i = 1; i <= daysAhead; i++) {
    const date = addDaysLocal(today, i);
    simulatedDow = (simulatedDow + 1) % 7;
    // Week resets every Monday (simulatedDow === 0)
    if (simulatedDow === 0) rollingWeekHours = 0;

    const projectedDailyHours = Math.max(0, dailyPace + dailyTrendAdjust * i);
    rollingWeekHours += projectedDailyHours;

    const fatigue = fatigueForWeekHours(rollingWeekHours, sustainable);
    const riskLevel = riskLevelFor(fatigue);

    if (!crossesHighOn && fatigue >= 50) crossesHighOn = localISODate(date);
    if (!crossesCriticalOn && fatigue >= 75) crossesCriticalOn = localISODate(date);

    dailyForecast.push({
      date: localISODate(date),
      projectedWeekHours: Math.round(rollingWeekHours * 10) / 10,
      projectedDailyHours: Math.round(projectedDailyHours * 10) / 10,
      projectedFatigue: Math.round(fatigue),
      riskLevel,
    });
  }

  const confidence = Math.min(0.95, 0.3 + recentWeeks.length * 0.1 + Math.min(burnout.observations / 60, 0.3));

  const insight = crossesCriticalOn
    ? `At your current pace, fatigue is projected to reach critical risk by ${crossesCriticalOn}.`
    : crossesHighOn
    ? `At your current pace, fatigue is projected to reach high risk by ${crossesHighOn}.`
    : weeklyTrend < -1
    ? 'Workload trending down — burnout risk is easing over the projected week.'
    : 'Pace looks sustainable for the projected week — no threshold crossing expected.';

  return {
    available: true,
    confidence: Math.round(confidence * 100) / 100,
    dailyPaceHours: Math.round(dailyPace * 10) / 10,
    weeklyTrendHours: Math.round(weeklyTrend * 10) / 10,
    dailyForecast,
    crossesHighOn,
    crossesCriticalOn,
    insight,
  };
}
