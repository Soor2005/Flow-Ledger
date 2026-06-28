/**
 * Workload Forecast Engine
 * Part of the Predictive Intelligence layer.
 *
 * Projects tomorrow's and next-week's total tracked hours by blending:
 *   - what's already on the calendar (known, certain)
 *   - what's historically typical for that day-of-week (learned baseline)
 *   - pending task hours due soon (estimated_hours on undone tasks)
 * and flags overload before it happens, rather than reporting it afterward.
 */

import { localISODate, addDaysLocal } from './dateUtils.js';

function dowFromISODate(iso) {
  return new Date(`${iso}T00:00:00`).getDay(); // 0=Sun..6=Sat — local midnight, no UTC shift
}

function typicalHoursForDow(history, dow) {
  const matches = (history?.daily || []).filter(d => dowFromISODate(d.date) === dow);
  if (!matches.length) return null;
  const total = matches.reduce((s, d) => s + (d.hours || 0), 0);
  return total / matches.length;
}

function hoursScheduledOn(calendarEvents, dateISO) {
  return calendarEvents
    .filter(e => localISODate(new Date((e.start_time || 0) * 1000)) === dateISO)
    .reduce((s, e) => s + Math.max(0, ((e.end_time || e.start_time) - e.start_time) / 3600), 0);
}

function pendingTaskHoursDueBy(tasks, dateISO) {
  const cutoff = new Date(`${dateISO}T23:59:59`).getTime() / 1000;
  return tasks
    .filter(t => t.status !== 'done' && t.estimated_hours > 0 && t.due_date && t.due_date <= cutoff)
    .reduce((s, t) => s + (t.estimated_hours || 0), 0);
}

/**
 * Forecast one day's projected hours by blending known schedule with the
 * learned baseline for that day-of-week, then layering pending task load.
 */
function forecastDay(behavioral, calendarEvents, tasks, dateISO) {
  const dow = dowFromISODate(dateISO);
  const typical = typicalHoursForDow(behavioral.history, dow);
  const scheduled = hoursScheduledOn(calendarEvents, dateISO);
  const pendingDue = pendingTaskHoursDueBy(tasks, dateISO);

  // Fill the gap between what's already booked and the historical norm —
  // don't just add typical+scheduled, since scheduled hours are usually a
  // subset of what ends up tracked.
  const historyGap = typical != null ? Math.max(0, typical - scheduled) : 0;
  const projectedHours = scheduled + historyGap + pendingDue * 0.5; // tasks rarely land 100% on the exact due day

  return {
    date: dateISO,
    scheduledHours:   Math.round(scheduled * 10) / 10,
    typicalHours:     typical != null ? Math.round(typical * 10) / 10 : null,
    pendingTaskHours: Math.round(pendingDue * 10) / 10,
    projectedHours:   Math.round(projectedHours * 10) / 10,
  };
}

/**
 * @param {Object} behavioral - adaptiveBehaviorEngine.getIntelligence() snapshot
 * @param {Object} opts
 * @param {Array}  opts.calendarEvents - { start_time, end_time } unix seconds
 * @param {Array}  opts.tasks          - { status, estimated_hours, due_date }
 * @param {number} [opts.horizonDays]
 */
export function forecastWorkload(behavioral, { calendarEvents = [], tasks = [], horizonDays = 7 } = {}) {
  if (!behavioral?.history) {
    return { available: false, reason: 'insufficient_history', days: [], weekTotalHours: 0, overloadRisk: false, confidence: 0 };
  }

  const sustainableDaily = (behavioral.burnout?.sustainableHoursPerWeek || 35) / 7;
  const today = new Date();

  const days = [];
  for (let i = 1; i <= horizonDays; i++) {
    const d = localISODate(addDaysLocal(today, i));
    days.push(forecastDay(behavioral, calendarEvents, tasks, d));
  }

  const weekTotalHours = Math.round(days.reduce((s, d) => s + d.projectedHours, 0) * 10) / 10;
  const tomorrow = days[0];
  const tomorrowOverload = tomorrow.projectedHours > sustainableDaily * 1.25;
  const weekOverload = weekTotalHours > (behavioral.burnout?.sustainableHoursPerWeek || 35) * 1.1;

  const observedDays = (behavioral.history.daily || []).length;
  const confidence = Math.min(0.9, 0.25 + observedDays * 0.02);

  const insight = tomorrowOverload
    ? `Tomorrow is projected at ${tomorrow.projectedHours}h — above your sustainable daily pace.`
    : weekOverload
    ? `This week is tracking toward ${weekTotalHours}h, above your sustainable weekly pace.`
    : `Workload looks manageable — tomorrow projected at ${tomorrow.projectedHours}h.`;

  return {
    available: true,
    confidence: Math.round(confidence * 100) / 100,
    days,
    tomorrow,
    weekTotalHours,
    overloadRisk: tomorrowOverload || weekOverload,
    tomorrowOverload,
    weekOverload,
    insight,
  };
}
