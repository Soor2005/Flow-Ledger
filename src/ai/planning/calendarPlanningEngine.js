/**
 * Calendar Planning Engine
 * Generates intelligent weekly schedules, deep work recommendations,
 * project time allocations, and meeting balancing suggestions.
 */

import { calendarMemoryEngine } from '../memory/calendarMemoryEngine.js';
import { predictBestFocusWindows, predictLowEnergyPeriods } from '../predictors/focusPredictionEngine.js';
import { runFullConflictScan } from '../services/calendarConflictEngine.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseTime(val) {
  const d = new Date(val);
  return isNaN(d) ? null : d;
}

function durationMins(event) {
  const s = parseTime(event.start_time);
  const e = parseTime(event.end_time);
  return s && e ? Math.max(0, (e - s) / 60000) : 0;
}

function addMinutes(date, mins) {
  return new Date(date.getTime() + mins * 60000);
}

function setHourOnDate(baseDate, hour, minute = 0) {
  const d = new Date(baseDate);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function formatTimeLabel(date) {
  if (!date) return '';
  const h = date.getHours();
  const m = date.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function getDatesInWeek(weekStartDate) {
  const dates = [];
  const start = new Date(weekStartDate);
  start.setHours(0, 0, 0, 0);
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    dates.push(d);
  }
  return dates;
}

function getWeekdayDates(weekStartDate) {
  return getDatesInWeek(weekStartDate).filter(d => {
    const day = d.getDay();
    return day !== 0 && day !== 6; // Mon-Fri
  });
}

function isFreeSlot(slotStart, slotEnd, existingEvents) {
  return !existingEvents.some(e => {
    const eStart = parseTime(e.start_time);
    const eEnd = parseTime(e.end_time);
    if (!eStart || !eEnd) return false;
    return slotStart < eEnd && slotEnd > eStart;
  });
}

// ─── Deep Work Schedule Generation ───────────────────────────────────────────

/**
 * Find optimal deep work slots across a set of days, respecting existing events.
 * @param {Array<Date>} dates - days to plan
 * @param {Array} existingEvents - events already scheduled
 * @param {Object} options
 * @returns {Array} Recommended deep work blocks
 */
export function generateDeepWorkRecommendations(dates, existingEvents = [], options = {}) {
  const {
    targetHoursPerDay = 4,
    minBlockMins = 60,
    maxBlockMins = 120,
    preferredBlockMins = 90,
  } = options;

  const prefs = calendarMemoryEngine.getPreferredWorkHours();
  const recommendations = [];

  for (const date of dates) {
    const dayEvents = existingEvents.filter(e => {
      const start = parseTime(e.start_time);
      return start && start.toDateString() === date.toDateString();
    });

    const windows = predictBestFocusWindows(date, {
      minWindowHours: minBlockMins / 60,
      workStartHour: prefs.start,
      workEndHour: prefs.end,
    });

    const deepWindows = windows.filter(w => w.suitableForDeepWork);
    let hoursPlanned = 0;
    const dayBlocks = [];

    for (const window of deepWindows) {
      if (hoursPlanned >= targetHoursPerDay) break;

      // Find free sub-slots within this window
      let cursor = window.startTime;
      const windowEnd = window.endTime;

      while (cursor < windowEnd && hoursPlanned < targetHoursPerDay) {
        const blockEnd = addMinutes(cursor, preferredBlockMins);
        const effectiveEnd = blockEnd > windowEnd ? windowEnd : blockEnd;

        if ((effectiveEnd - cursor) / 60000 < minBlockMins) break;

        if (isFreeSlot(cursor, effectiveEnd, dayEvents)) {
          const blockMins = (effectiveEnd - cursor) / 60000;
          dayBlocks.push({
            date: date.toISOString().slice(0, 10),
            startTime: new Date(cursor),
            endTime: new Date(effectiveEnd),
            durationMins: Math.round(blockMins),
            focusScore: window.avgScore,
            label: `Deep Work — ${formatTimeLabel(cursor)} to ${formatTimeLabel(effectiveEnd)}`,
            type: 'deep_work',
            timeOfDay: window.timeOfDay,
            priority: dayBlocks.length === 0 ? 'primary' : 'secondary',
          });
          hoursPlanned += blockMins / 60;
          cursor = addMinutes(effectiveEnd, 15); // Buffer
        } else {
          cursor = addMinutes(cursor, 30); // Skip ahead and try again
        }
      }
    }

    if (dayBlocks.length) {
      recommendations.push(...dayBlocks);
    }
  }

  return recommendations;
}

// ─── Meeting Batching ─────────────────────────────────────────────────────────

/**
 * Analyze existing meetings and suggest batching them into fewer time blocks.
 * @param {Array} events - all events for the week
 * @returns {Object} Meeting balancing recommendations
 */
export function generateMeetingBalancingPlan(events) {
  const meetings = events.filter(e => {
    const title = (e.title || '').toLowerCase();
    const cat = (e.ai_category || '').toLowerCase();
    return cat === 'meeting' || title.includes('meeting') ||
      title.includes('sync') || title.includes('standup') || title.includes('call');
  });

  if (!meetings.length) {
    return { hasMeetings: false, suggestions: [] };
  }

  // Group by day
  const byDay = {};
  for (const m of meetings) {
    const day = (m.start_time || '').slice(0, 10);
    if (!byDay[day]) byDay[day] = [];
    byDay[day].push(m);
  }

  const suggestions = [];

  for (const [day, dayMeetings] of Object.entries(byDay)) {
    const totalMins = dayMeetings.reduce((sum, m) => sum + durationMins(m), 0);
    const dayDate = parseTime(day);
    const dayName = dayDate?.toLocaleDateString('en-US', { weekday: 'long' });

    if (totalMins > 240) {
      suggestions.push({
        type: 'reduce',
        day,
        dayName,
        meetingCount: dayMeetings.length,
        totalMins: Math.round(totalMins),
        message: `${dayName} has ${Math.round(totalMins / 60)}h of meetings. Consider moving some to less busy days.`,
        actions: [`Defer lower-priority meetings from ${dayName}`, 'Try async alternatives for status updates'],
      });
    }

    // Detect scattered meetings (spread across the day with gaps)
    const sorted = [...dayMeetings].sort((a, b) =>
      new Date(a.start_time) - new Date(b.start_time)
    );
    const span = parseTime(sorted[sorted.length - 1].end_time) - parseTime(sorted[0].start_time);
    const spanHours = span / 3600000;
    if (spanHours > 6 && dayMeetings.length >= 3) {
      suggestions.push({
        type: 'batch',
        day,
        dayName,
        message: `${dayName} meetings are scattered across ${Math.round(spanHours)}h. Batch them into a 2-3h window to free up focus time.`,
        actions: ['Cluster meetings into morning (9-12) or afternoon (2-5)', 'Protect one 3h deep work block'],
      });
    }
  }

  // Overall meeting days recommendation
  const meetingDays = Object.keys(byDay).length;
  if (meetingDays >= 5) {
    suggestions.push({
      type: 'no-meeting-day',
      message: 'You have meetings every day. Consider protecting 1-2 "no meeting" days for deep work.',
      actions: ['Block Tuesday and Thursday as meeting-free days', 'Use async communication instead'],
    });
  }

  return {
    hasMeetings: true,
    totalMeetingCount: meetings.length,
    totalMeetingMins: Math.round(meetings.reduce((sum, m) => sum + durationMins(m), 0)),
    byDay,
    suggestions,
  };
}

// ─── Project Time Allocation ──────────────────────────────────────────────────

/**
 * Allocate remaining capacity to projects based on priority and estimates.
 * @param {Array<Date>} dates - planning horizon (workdays)
 * @param {Array} projects - [{ id, name, estimatedHours, priority, deadline }]
 * @param {Array} existingEvents - already scheduled events
 * @param {number} dailyCapacityHours - available hours per day for project work
 * @returns {Array} Project allocation blocks
 */
export function allocateProjectTime(dates, projects, existingEvents = [], dailyCapacityHours = 4) {
  if (!projects.length) return [];

  const workdays = dates.filter(d => {
    const day = d.getDay();
    return day !== 0 && day !== 6;
  });

  // Sort projects by priority and deadline
  const sortedProjects = [...projects].sort((a, b) => {
    const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
    const aPriority = priorityOrder[a.priority] || 2;
    const bPriority = priorityOrder[b.priority] || 2;
    if (bPriority !== aPriority) return bPriority - aPriority;
    if (a.deadline && b.deadline) return new Date(a.deadline) - new Date(b.deadline);
    return 0;
  });

  const allocations = [];
  const capacityPerDay = dailyCapacityHours * 60; // in minutes

  // Simple round-robin allocation weighted by priority
  const totalWeight = sortedProjects.reduce((sum, p) => {
    const w = { critical: 4, high: 3, medium: 2, low: 1 };
    return sum + (w[p.priority] || 2);
  }, 0);

  for (const date of workdays) {
    let remainingCapacity = capacityPerDay;
    const dayEvents = existingEvents.filter(e => {
      const s = parseTime(e.start_time);
      return s && s.toDateString() === date.toDateString();
    });

    // Deduct already-scheduled events
    const scheduledMins = dayEvents.reduce((sum, e) => sum + durationMins(e), 0);
    remainingCapacity = Math.max(0, remainingCapacity - scheduledMins);

    if (remainingCapacity < 30) continue;

    for (const project of sortedProjects) {
      const w = { critical: 4, high: 3, medium: 2, low: 1 };
      const weight = w[project.priority] || 2;
      const share = (weight / totalWeight) * remainingCapacity;
      const allocMins = Math.min(Math.round(share), 120); // Cap at 2h per project per day

      if (allocMins < 30) continue;

      const preferredHours = calendarMemoryEngine.getProjectPreferredHours(project.id);
      const preferredHour = preferredHours[0] || 9;
      const blockStart = setHourOnDate(date, preferredHour);
      const blockEnd = addMinutes(blockStart, allocMins);

      if (!isFreeSlot(blockStart, blockEnd, [...dayEvents, ...allocations.map(a => ({
        start_time: a.startTime.toISOString(),
        end_time: a.endTime.toISOString(),
      }))])) continue;

      allocations.push({
        projectId: project.id,
        projectName: project.name,
        date: date.toISOString().slice(0, 10),
        startTime: blockStart,
        endTime: blockEnd,
        durationMins: allocMins,
        label: `${project.name} — ${formatTimeLabel(blockStart)}`,
        type: 'project_allocation',
        priority: project.priority,
      });
    }
  }

  return allocations;
}

// ─── Weekly Schedule Generation ───────────────────────────────────────────────

/**
 * Generate a complete recommended weekly schedule.
 * @param {Date} weekStart - Monday of the target week
 * @param {Array} existingEvents - already scheduled events this week
 * @param {Array} projects - projects to allocate time for
 * @param {Object} options
 * @returns {Object} Full weekly schedule recommendation
 */
export function generateWeeklySchedule(weekStart, existingEvents = [], projects = [], options = {}) {
  const {
    includeDeepWork = true,
    includeProjectAllocation = true,
    targetDeepWorkHoursPerDay = 4,
    workStartHour = 8,
    workEndHour = 20,
  } = options;

  const weekdays = getWeekdayDates(weekStart);
  const deepWorkBlocks = includeDeepWork
    ? generateDeepWorkRecommendations(weekdays, existingEvents, {
        targetHoursPerDay: targetDeepWorkHoursPerDay,
      })
    : [];

  const projectAllocations = includeProjectAllocation && projects.length
    ? allocateProjectTime(weekdays, projects, existingEvents)
    : [];

  const meetingPlan = generateMeetingBalancingPlan(existingEvents);

  const allRecommended = [...deepWorkBlocks, ...projectAllocations];

  // Conflict scan on existing events
  const conflictReport = runFullConflictScan(existingEvents);

  // Weekly totals
  const totalPlannedMins = existingEvents.reduce((sum, e) => sum + durationMins(e), 0);
  const totalDeepWorkMins = deepWorkBlocks.reduce((sum, b) => sum + b.durationMins, 0);
  const avgDeepWorkPerDay = weekdays.length > 0
    ? Math.round(totalDeepWorkMins / weekdays.length)
    : 0;

  return {
    weekStart: weekStart.toISOString().slice(0, 10),
    weekdays: weekdays.map(d => d.toISOString().slice(0, 10)),
    existingEvents: existingEvents.length,
    recommendations: {
      deepWorkBlocks,
      projectAllocations,
      totalRecommendedBlocks: allRecommended.length,
    },
    meetingPlan,
    conflicts: conflictReport,
    summary: {
      totalPlannedHours: Math.round(totalPlannedMins / 60 * 10) / 10,
      recommendedDeepWorkHours: Math.round(totalDeepWorkMins / 60 * 10) / 10,
      avgDeepWorkPerDayMins: avgDeepWorkPerDay,
      scheduleQuality: conflictReport.scheduleQualityScore,
    },
    insights: generateWeeklyInsights(conflictReport, meetingPlan, deepWorkBlocks, weekdays.length),
  };
}

function generateWeeklyInsights(conflictReport, meetingPlan, deepWorkBlocks, totalDays) {
  const insights = [];

  if (conflictReport.hasCritical) {
    insights.push(`Critical scheduling conflict detected: ${conflictReport.topConflict?.message || 'overlap found'}.`);
  }

  if (meetingPlan.totalMeetingMins > 600) {
    insights.push(`${Math.round(meetingPlan.totalMeetingMins / 60)}h of meetings this week. Protect deep work time.`);
  }

  const deepWorkDays = new Set(deepWorkBlocks.map(b => b.date)).size;
  if (deepWorkDays < totalDays && deepWorkDays > 0) {
    insights.push(`Deep work opportunities identified for ${deepWorkDays} of ${totalDays} workdays.`);
  }

  if (meetingPlan.suggestions.some(s => s.type === 'no-meeting-day')) {
    insights.push('Consider creating 1-2 meeting-free days for sustained focus.');
  }

  return insights;
}

// ─── Recovery Scheduling ──────────────────────────────────────────────────────

/**
 * Recommend strategic break placement in a schedule.
 * @param {Array} events - sorted events for a day
 * @returns {Array} Break recommendations
 */
export function recommendBreaks(events) {
  if (!events.length) return [];

  const sorted = [...events]
    .filter(e => parseTime(e.start_time) && parseTime(e.end_time))
    .sort((a, b) => new Date(a.start_time) - new Date(b.start_time));

  const breaks = [];
  let cumulativeWorkMins = 0;

  for (let i = 0; i < sorted.length; i++) {
    const event = sorted[i];
    const eventMins = durationMins(event);
    cumulativeWorkMins += eventMins;

    // There's nowhere to place a break after the last event (no next event
    // to gap against), so only evaluate when one follows. The previous
    // `cumulativeWorkMins >= 90 || (i < sorted.length - 1)` outer condition
    // was misleading dead weight: the second disjunct is true for every
    // iteration except the last anyway, and on the last iteration
    // `nextEventStart` is always null regardless of cumulative time, so the
    // `>= 90` half could never actually gate anything either way.
    if (i >= sorted.length - 1) continue;

    const breakStart = parseTime(event.end_time);
    const nextEventStart = parseTime(sorted[i + 1].start_time);

    if (breakStart && nextEventStart) {
      const gapMins = (nextEventStart - breakStart) / 60000;
      if (gapMins >= 10) {
        const breakMins = Math.min(gapMins, 20);
        breaks.push({
          recommendedStart: breakStart,
          recommendedEnd: addMinutes(breakStart, breakMins),
          durationMins: breakMins,
          afterEvent: event.title,
          beforeEvent: sorted[i + 1]?.title,
          reason: cumulativeWorkMins >= 90
            ? `${Math.round(cumulativeWorkMins)} min work session — recovery needed`
            : 'Natural transition point',
          label: `Break — ${formatTimeLabel(breakStart)}`,
        });
        cumulativeWorkMins = 0;
      }
    }
  }

  return breaks;
}
