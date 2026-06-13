/**
 * Calendar Conflict Engine
 * Detects scheduling conflicts, meeting overload, burnout risk, and
 * generates intelligent resolution suggestions.
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseTime(val) {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d) ? null : d;
}

function durationMins(event) {
  const s = parseTime(event.start_time);
  const e = parseTime(event.end_time);
  if (!s || !e) return 0;
  return Math.max(0, (e - s) / 60000);
}

function isOverlap(a, b) {
  const aStart = parseTime(a.start_time);
  const aEnd = parseTime(a.end_time);
  const bStart = parseTime(b.start_time);
  const bEnd = parseTime(b.end_time);
  if (!aStart || !aEnd || !bStart || !bEnd) return false;
  return aStart < bEnd && aEnd > bStart;
}

function overlapMins(a, b) {
  const aStart = parseTime(a.start_time);
  const aEnd   = parseTime(a.end_time);
  const bStart = parseTime(b.start_time);
  const bEnd   = parseTime(b.end_time);
  if (!aStart || !aEnd || !bStart || !bEnd) return 0;
  return Math.max(0, (Math.min(aEnd.getTime(), bEnd.getTime()) - Math.max(aStart.getTime(), bStart.getTime())) / 60000);
}

function isMeeting(event) {
  const title = (event.title || '').toLowerCase();
  const cat = (event.ai_category || event.category || '').toLowerCase();
  return cat === 'meeting' ||
    title.includes('standup') || title.includes('sync') ||
    title.includes('meeting') || title.includes('call') ||
    title.includes('interview') || title.includes('demo');
}

function isDeepWork(event) {
  const title = (event.title || '').toLowerCase();
  const cat = (event.ai_category || event.category || '').toLowerCase();
  return cat === 'deep_work' || cat === 'focus' ||
    title.includes('deep work') || title.includes('focus block') ||
    title.includes('coding') || title.includes('writing');
}

function gapBetween(a, b) {
  // Returns gap in minutes between end of a and start of b
  const aEnd = parseTime(a.end_time);
  const bStart = parseTime(b.start_time);
  if (!aEnd || !bStart) return Infinity;
  return (bStart - aEnd) / 60000;
}

function formatTime(date) {
  if (!date) return '';
  const d = date instanceof Date ? date : parseTime(date);
  if (!d) return '';
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

// ─── Conflict Types ───────────────────────────────────────────────────────────

export const CONFLICT_TYPES = {
  OVERLAP: 'overlap',                    // Two events at the same time
  BACK_TO_BACK: 'back_to_back',          // No gap between events (<5 min)
  MEETING_OVERLOAD: 'meeting_overload',  // Too many meetings in a day
  FOCUS_INTERRUPTED: 'focus_interrupted', // Meeting inside a deep work block
  LONG_FOCUS_BLOCK: 'long_focus_block',  // >3h focus without a break
  OVERLOADED_DAY: 'overloaded_day',      // Total events > 10h
  LATE_SCHEDULING: 'late_scheduling',    // Events outside preferred hours
};

export const SEVERITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
};

// ─── Overlap Detection ────────────────────────────────────────────────────────

/**
 * Find all pairs of events that directly overlap.
 * @param {Array} events
 * @returns {Array} Conflict objects
 */
export function detectOverlaps(events) {
  const conflicts = [];
  const sorted = [...events].sort((a, b) =>
    new Date(a.start_time) - new Date(b.start_time)
  );

  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      if (parseTime(sorted[j].start_time) >= parseTime(sorted[i].end_time)) break;
      if (isOverlap(sorted[i], sorted[j])) {
        const mins = overlapMins(sorted[i], sorted[j]);
        conflicts.push({
          type: CONFLICT_TYPES.OVERLAP,
          severity: mins > 30 ? SEVERITY.HIGH : SEVERITY.MEDIUM,
          eventA: sorted[i],
          eventB: sorted[j],
          overlapMins: Math.round(mins),
          message: `"${sorted[i].title}" overlaps "${sorted[j].title}" by ${Math.round(mins)} minutes`,
          suggestions: [
            `Move "${sorted[j].title}" to start at ${formatTime(sorted[i].end_time)}`,
            `Shorten "${sorted[i].title}" by ${Math.round(mins)} minutes`,
            `Consider cancelling one of the overlapping events`,
          ],
        });
      }
    }
  }

  return conflicts;
}

// ─── Back-to-Back Detection ───────────────────────────────────────────────────

/**
 * Find events with < 5 min gap — no time for bio breaks or context switching.
 */
export function detectBackToBack(events) {
  const conflicts = [];
  const sorted = [...events]
    .filter(e => parseTime(e.start_time) && parseTime(e.end_time))
    .sort((a, b) => new Date(a.start_time) - new Date(b.start_time));

  for (let i = 0; i < sorted.length - 1; i++) {
    const gap = gapBetween(sorted[i], sorted[i + 1]);
    if (gap >= 0 && gap < 5) {
      conflicts.push({
        type: CONFLICT_TYPES.BACK_TO_BACK,
        severity: SEVERITY.LOW,
        eventA: sorted[i],
        eventB: sorted[i + 1],
        gapMins: Math.round(gap),
        message: `"${sorted[i].title}" and "${sorted[i + 1].title}" are back-to-back with only ${Math.round(gap)} min gap`,
        suggestions: [
          `Add a 10-minute buffer between these events`,
          `Move "${sorted[i + 1].title}" 10 minutes later`,
          `Shorten one of the events to create breathing room`,
        ],
      });
    }
  }

  return conflicts;
}

// ─── Meeting Overload ─────────────────────────────────────────────────────────

/**
 * Detect when meetings consume too much of the day.
 * Threshold: > 4 hours of meetings = overload.
 */
export function detectMeetingOverload(events) {
  // Group by calendar day — prevents false positives when week/month events are passed
  const byDay = {};
  for (const e of events) {
    const s = parseTime(e.start_time);
    if (!s) continue;
    const dayKey = s.toISOString().slice(0, 10);
    if (!byDay[dayKey]) byDay[dayKey] = [];
    byDay[dayKey].push(e);
  }

  const conflicts = [];
  for (const [dayKey, dayEvents] of Object.entries(byDay)) {
    const meetings = dayEvents.filter(isMeeting);
    if (!meetings.length) continue;

    const totalMeetingMins = meetings.reduce((sum, e) => sum + durationMins(e), 0);
    if (totalMeetingMins < 240) continue;

    const totalEventMins = dayEvents.reduce((sum, e) => sum + durationMins(e), 0);
    const meetingPercent = totalEventMins > 0
      ? Math.round((totalMeetingMins / totalEventMins) * 100) : 0;

    const severity = totalMeetingMins >= 360 ? SEVERITY.CRITICAL
      : totalMeetingMins >= 300 ? SEVERITY.HIGH
      : SEVERITY.MEDIUM;

    const dayDate = new Date(dayKey + 'T12:00:00');
    const dayLabel = dayDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

    conflicts.push({
      type: CONFLICT_TYPES.MEETING_OVERLOAD,
      severity,
      day: dayKey,
      dayLabel,
      totalMeetingMins: Math.round(totalMeetingMins),
      meetingCount: meetings.length,
      meetingPercent,
      message: `${dayLabel}: ${Math.round(totalMeetingMins / 60)}h of meetings (${meetingPercent}% of your day)`,
      suggestions: [
        'Batch meetings into morning or afternoon blocks',
        'Decline non-essential meetings',
        'Protect at least 2h of uninterrupted focus time',
        'Consider async alternatives for status meetings',
      ],
    });
  }

  return conflicts;
}

// ─── Focus Interruptions ──────────────────────────────────────────────────────

/**
 * Detect meetings scheduled inside deep work blocks.
 */
export function detectFocusInterruptions(events) {
  const conflicts = [];
  const focusBlocks = events.filter(isDeepWork);
  const meetings = events.filter(isMeeting);

  for (const focusBlock of focusBlocks) {
    for (const meeting of meetings) {
      if (isOverlap(focusBlock, meeting)) {
        conflicts.push({
          type: CONFLICT_TYPES.FOCUS_INTERRUPTED,
          severity: SEVERITY.MEDIUM,
          focusBlock,
          meeting,
          message: `"${meeting.title}" interrupts your focus block "${focusBlock.title}"`,
          suggestions: [
            `Move "${meeting.title}" to before or after the focus block`,
            `Reschedule the focus block around the meeting`,
            `Shorten the focus block to accommodate the meeting`,
          ],
        });
      }
    }
  }

  return conflicts;
}

// ─── Long Focus Block ─────────────────────────────────────────────────────────

/**
 * Detect focus blocks > 3h without a break event in between.
 */
export function detectLongFocusBlocks(events) {
  const conflicts = [];
  const focusBlocks = events.filter(isDeepWork).sort(
    (a, b) => new Date(a.start_time) - new Date(b.start_time)
  );

  for (const block of focusBlocks) {
    const blockMins = durationMins(block);
    if (blockMins > 180) {
      conflicts.push({
        type: CONFLICT_TYPES.LONG_FOCUS_BLOCK,
        severity: blockMins > 300 ? SEVERITY.HIGH : SEVERITY.MEDIUM,
        event: block,
        durationMins: Math.round(blockMins),
        message: `Focus block "${block.title}" is ${Math.round(blockMins / 60)}h long — risks fatigue`,
        suggestions: [
          `Split into two 90-minute blocks with a 15-minute break`,
          `Add a break event at the midpoint`,
          `Research shows peak deep work duration is 90-120 minutes`,
        ],
      });
    }
  }

  return conflicts;
}

// ─── Overloaded Day ───────────────────────────────────────────────────────────

/**
 * Flag when any single day's scheduled time exceeds healthy limits.
 * Groups events by calendar day first to avoid false positives when
 * week or month events are passed together.
 */
export function detectOverloadedDay(events, maxHours = 10) {
  // Group by calendar day
  const byDay = {};
  for (const e of events) {
    const s = parseTime(e.start_time);
    if (!s) continue;
    const dayKey = s.toISOString().slice(0, 10);
    if (!byDay[dayKey]) byDay[dayKey] = [];
    byDay[dayKey].push(e);
  }

  const conflicts = [];
  for (const [dayKey, dayEvents] of Object.entries(byDay)) {
    const totalMins = dayEvents.reduce((sum, e) => sum + durationMins(e), 0);
    if (totalMins < maxHours * 60) continue;

    const severity = totalMins >= maxHours * 60 * 1.5 ? SEVERITY.CRITICAL
      : totalMins >= maxHours * 60 * 1.2 ? SEVERITY.HIGH
      : SEVERITY.MEDIUM;

    const dayDate = new Date(dayKey + 'T12:00:00');
    const dayLabel = dayDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

    conflicts.push({
      type: CONFLICT_TYPES.OVERLOADED_DAY,
      severity,
      day: dayKey,
      dayLabel,
      totalMins: Math.round(totalMins),
      totalHours: Math.round(totalMins / 60 * 10) / 10,
      message: `${dayLabel}: ${Math.round(totalMins / 60)}h scheduled — overloaded day`,
      suggestions: [
        'Defer lower-priority tasks to another day',
        'Reduce meeting durations where possible',
        'Protect at least 1h for admin and transitions',
        'Ensure you have proper meal and break time',
      ],
    });
  }

  return conflicts;
}

// ─── Burnout Risk Assessment ──────────────────────────────────────────────────

/**
 * Analyze a week of events for burnout risk patterns.
 * @param {Array} weekEvents - events across 7 days
 * @param {string} dateKey - 'YYYY-MM-DD' for the week start
 * @returns {Object} Burnout risk assessment
 */
export function assessWeeklyBurnoutRisk(weekEvents) {
  // Group by day
  const byDay = {};
  for (const event of weekEvents) {
    const d = (event.start_time || '').slice(0, 10);
    if (!byDay[d]) byDay[d] = [];
    byDay[d].push(event);
  }

  const days = Object.keys(byDay).sort();
  const dailyHours = days.map(d => byDay[d].reduce((sum, e) => sum + durationMins(e), 0) / 60);

  const avgHours = dailyHours.length
    ? dailyHours.reduce((a, b) => a + b, 0) / dailyHours.length
    : 0;
  const maxHours = dailyHours.length ? Math.max(...dailyHours) : 0;
  const daysOver8h = dailyHours.filter(h => h > 8).length;
  const daysOver10h = dailyHours.filter(h => h > 10).length;
  const workDays = dailyHours.filter(h => h > 0).length;

  const riskScore =
    (daysOver10h * 25) +
    (daysOver8h * 10) +
    (avgHours > 9 ? 20 : avgHours > 8 ? 10 : 0) +
    (workDays >= 6 ? 20 : 0);

  const level = riskScore >= 60 ? 'high' : riskScore >= 30 ? 'medium' : 'low';

  const recommendations = [];
  if (daysOver10h > 0) recommendations.push(`${daysOver10h} day(s) scheduled over 10h — reduce commitments`);
  if (workDays >= 6) recommendations.push('Working 6+ days risks burnout — protect your off-days');
  if (avgHours > 9) recommendations.push('Average > 9h/day is unsustainable long-term');

  return {
    level,
    riskScore: Math.min(100, riskScore),
    avgDailyHours: Math.round(avgHours * 10) / 10,
    maxDailyHours: Math.round(maxHours * 10) / 10,
    daysOver8h,
    daysOver10h,
    workDays,
    recommendations,
  };
}

// ─── Full Conflict Scan ───────────────────────────────────────────────────────

/**
 * Run all conflict detectors on a set of events.
 * Returns all conflicts grouped by severity.
 * @param {Array} events
 * @returns {Object} Full conflict report
 */
export function runFullConflictScan(events) {
  const all = [
    ...detectOverlaps(events),
    ...detectBackToBack(events),
    ...detectMeetingOverload(events),
    ...detectFocusInterruptions(events),
    ...detectLongFocusBlocks(events),
    ...detectOverloadedDay(events),
  ];

  const bySeverity = {
    [SEVERITY.CRITICAL]: all.filter(c => c.severity === SEVERITY.CRITICAL),
    [SEVERITY.HIGH]: all.filter(c => c.severity === SEVERITY.HIGH),
    [SEVERITY.MEDIUM]: all.filter(c => c.severity === SEVERITY.MEDIUM),
    [SEVERITY.LOW]: all.filter(c => c.severity === SEVERITY.LOW),
  };

  const score = Math.max(0, 100 -
    bySeverity.critical.length * 30 -
    bySeverity.high.length * 15 -
    bySeverity.medium.length * 7 -
    bySeverity.low.length * 3
  );

  return {
    conflicts: all,
    bySeverity,
    totalConflicts: all.length,
    scheduleQualityScore: Math.round(score),
    hasCritical: bySeverity.critical.length > 0,
    hasHigh: bySeverity.high.length > 0,
    topConflict: all.sort((a, b) => {
      const order = { critical: 4, high: 3, medium: 2, low: 1 };
      return (order[b.severity] || 0) - (order[a.severity] || 0);
    })[0] || null,
  };
}
