/**
 * Session Matching Engine
 * Core logic that intelligently maps tracked auto-sessions to planned calendar events.
 * Handles: overlap detection, planned→actual conversion, duplicate prevention,
 * and dynamic actual-worked-duration calculation.
 */

// ─── Types ────────────────────────────────────────────────────────────────────
// CalendarEvent: { id, title, start_time, end_time, project_id, client_id, ... }
// AutoSession:   { id, started_at, ended_at, duration_seconds, app_name, ai_category, ... }
// ManualSession: { id, started_at, ended_at, duration_seconds, category, project_id, ... }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseTime(val) {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d) ? null : d;
}

function durationMins(start, end) {
  const s = parseTime(start);
  const e = parseTime(end);
  if (!s || !e) return 0;
  return Math.max(0, (e - s) / 60000);
}

function overlapMins(aStart, aEnd, bStart, bEnd) {
  const overlapStart = Math.max(aStart.getTime(), bStart.getTime());
  const overlapEnd = Math.min(aEnd.getTime(), bEnd.getTime());
  return Math.max(0, (overlapEnd - overlapStart) / 60000);
}

function sessionIsInFuture(session) {
  const start = parseTime(session.started_at || session.start_time);
  return start && start > new Date();
}

function eventIsInFuture(event) {
  const start = parseTime(event.start_time);
  return start && start > new Date();
}

// ─── Overlap Detection ────────────────────────────────────────────────────────

/**
 * Find all tracked sessions that overlap with a given calendar event.
 * Returns session list sorted by overlap duration descending.
 * @param {Object} event
 * @param {Array} sessions - auto or manual sessions
 * @returns {Array} Matching sessions with overlap metadata
 */
export function findOverlappingSessions(event, sessions) {
  const evStart = parseTime(event.start_time);
  const evEnd = parseTime(event.end_time);
  if (!evStart || !evEnd) return [];

  const results = [];

  for (const session of sessions) {
    if (sessionIsInFuture(session)) continue;

    const sStart = parseTime(session.started_at);
    const sEnd = parseTime(session.ended_at);
    if (!sStart || !sEnd) continue;

    const overlap = overlapMins(evStart, evEnd, sStart, sEnd);
    if (overlap <= 0) continue;

    const sessionDuration = durationMins(session.started_at, session.ended_at);
    const eventDuration = durationMins(event.start_time, event.end_time);

    results.push({
      session,
      overlapMins: Math.round(overlap * 10) / 10,
      overlapPercent: Math.round((overlap / Math.max(sessionDuration, 1)) * 100),
      coveragePercent: Math.round((overlap / Math.max(eventDuration, 1)) * 100),
      isFullCover: overlap >= eventDuration * 0.8, // 80%+ = full coverage
    });
  }

  return results.sort((a, b) => b.overlapMins - a.overlapMins);
}

// ─── Session → Event Matching ─────────────────────────────────────────────────

/**
 * For each calendar event, find all sessions that cover it and compute
 * actual worked duration, completion status, and matched sessions.
 *
 * IMPORTANT: Only past events are evaluated. Future events have no actuals.
 *
 * @param {Array} events - calendar events
 * @param {Array} autoSessions - auto-tracked sessions
 * @param {Array} manualSessions - manually logged sessions
 * @returns {Array} Enriched event objects
 */
export function matchSessionsToEvents(events, autoSessions = [], manualSessions = []) {
  const allSessions = [...autoSessions, ...manualSessions];

  return events.map(event => {
    if (eventIsInFuture(event)) {
      return {
        ...event,
        _ai: {
          status: 'planned',
          actualMins: 0,
          plannedMins: durationMins(event.start_time, event.end_time),
          completionPercent: 0,
          matchedSessions: [],
          hasActualData: false,
        },
      };
    }

    const matchedSessions = findOverlappingSessions(event, allSessions);
    const totalActualMins = matchedSessions.reduce((sum, m) => sum + m.overlapMins, 0);
    const plannedMins = durationMins(event.start_time, event.end_time);
    const completionPercent = plannedMins > 0
      ? Math.min(100, Math.round((totalActualMins / plannedMins) * 100))
      : 0;

    // Derive dominant category from matched sessions
    const categoryCounts = {};
    for (const { session } of matchedSessions) {
      const cat = session.category || session.ai_category || 'unknown';
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    }
    const dominantCategory = Object.entries(categoryCounts)
      .sort(([, a], [, b]) => b - a)[0]?.[0] || null;

    // Is session complete?
    const isCompleted = completionPercent >= 80;
    const isMissed = completionPercent < 10 && new Date(event.end_time) < new Date();
    const isPartial = !isCompleted && !isMissed;

    return {
      ...event,
      _ai: {
        status: isCompleted ? 'completed' : isMissed ? 'missed' : isPartial ? 'partial' : 'planned',
        actualMins: Math.round(totalActualMins * 10) / 10,
        plannedMins: Math.round(plannedMins * 10) / 10,
        completionPercent,
        matchedSessions: matchedSessions.map(m => ({
          sessionId: m.session.id,
          overlapMins: m.overlapMins,
          overlapPercent: m.overlapPercent,
          coveragePercent: m.coveragePercent,
          isFullCover: m.isFullCover,
          category: m.session.category || m.session.ai_category,
          appName: m.session.app_name,
        })),
        dominantCategory,
        hasActualData: matchedSessions.length > 0,
        varianceMins: Math.round(totalActualMins - plannedMins),
      },
    };
  });
}

// ─── Duplicate Detection ──────────────────────────────────────────────────────

/**
 * Detect sessions that would create duplicates in the calendar.
 * A "General" auto-session that fully covers a specific event is a duplicate.
 * @param {Array} events
 * @param {Array} autoSessions
 * @returns {Set<string>} Set of autoSession IDs that are duplicates
 */
export function detectDuplicateSessions(events, autoSessions) {
  const duplicateIds = new Set();

  for (const event of events) {
    if (eventIsInFuture(event)) continue;

    const matches = findOverlappingSessions(event, autoSessions);
    const fullCovers = matches.filter(m => m.isFullCover);

    // If there's a named specific session that covers this event,
    // mark "General" sessions as duplicates
    const hasSpecific = fullCovers.some(m => {
      const cat = (m.session.ai_category || m.session.category || '').toLowerCase();
      return cat !== 'general' && cat !== 'unknown' && cat !== 'idle';
    });

    if (hasSpecific) {
      for (const m of fullCovers) {
        const cat = (m.session.ai_category || m.session.category || '').toLowerCase();
        if (cat === 'general' || cat === 'unknown') {
          duplicateIds.add(m.session.id);
        }
      }
    }
  }

  return duplicateIds;
}

// ─── Planned → Completed Conversion ──────────────────────────────────────────

/**
 * Convert a planned calendar event to a "completed" session record
 * using the actual tracked data.
 * @param {Object} event - planned calendar event
 * @param {Array} matchedSessions - result from findOverlappingSessions
 * @returns {Object} Completed session data
 */
export function buildCompletedSession(event, matchedSessions) {
  const totalActualMins = matchedSessions.reduce((sum, m) => sum + m.overlapMins, 0);
  const plannedMins = durationMins(event.start_time, event.end_time);

  // Earliest start and latest end from matched sessions
  const starts = matchedSessions.map(m => parseTime(m.session.started_at)).filter(Boolean);
  const ends = matchedSessions.map(m => parseTime(m.session.ended_at)).filter(Boolean);

  const actualStart = starts.length ? new Date(Math.min(...starts)) : parseTime(event.start_time);
  const actualEnd = ends.length ? new Date(Math.max(...ends)) : parseTime(event.end_time);

  const totalContextSwitches = matchedSessions.reduce(
    (sum, m) => sum + (m.session.context_switches || 0),
    0
  );

  const apps = [...new Set(
    matchedSessions
      .map(m => m.session.app_name)
      .filter(Boolean)
  )];

  return {
    title: event.title_override || event.title,
    project_id: event.project_id,
    client_id: event.client_id,
    started_at: actualStart?.toISOString(),
    ended_at: actualEnd?.toISOString(),
    duration_seconds: Math.round(totalActualMins * 60),
    planned_duration_seconds: Math.round(plannedMins * 60),
    completion_percent: plannedMins > 0
      ? Math.min(100, Math.round(totalActualMins / plannedMins * 100))
      : 0,
    context_switches: totalContextSwitches,
    apps_used: apps,
    calendar_event_id: event.id,
    source: 'calendar_match',
  };
}

// ─── Schedule Adherence ───────────────────────────────────────────────────────

/**
 * Calculate overall schedule adherence for a set of matched events.
 * @param {Array} enrichedEvents - output of matchSessionsToEvents
 * @returns {Object} Schedule adherence stats
 */
export function calculateScheduleAdherence(enrichedEvents) {
  const past = enrichedEvents.filter(e => e._ai && !eventIsInFuture(e));
  if (!past.length) return { adherence: null, completed: 0, missed: 0, partial: 0, total: 0 };

  const completed = past.filter(e => e._ai.status === 'completed').length;
  const missed = past.filter(e => e._ai.status === 'missed').length;
  const partial = past.filter(e => e._ai.status === 'partial').length;

  const totalPlannedMins = past.reduce((sum, e) => sum + (e._ai.plannedMins || 0), 0);
  const totalActualMins = past.reduce((sum, e) => sum + (e._ai.actualMins || 0), 0);

  return {
    adherence: totalPlannedMins > 0
      ? Math.round(Math.min(totalActualMins, totalPlannedMins) / totalPlannedMins * 100)
      : null,
    completed,
    missed,
    partial,
    total: past.length,
    totalPlannedMins: Math.round(totalPlannedMins),
    totalActualMins: Math.round(totalActualMins),
    varianceMins: Math.round(totalActualMins - totalPlannedMins),
  };
}

// ─── Untracked Period Detection ───────────────────────────────────────────────

/**
 * Find time gaps in the day where no sessions or events were tracked.
 * Useful for identifying lost/unaccounted work time.
 * @param {Array} allSessions - all sessions for the day
 * @param {Array} events - calendar events for the day
 * @param {number} workStartHour - e.g. 8
 * @param {number} workEndHour - e.g. 20
 * @returns {Array} Untracked gaps
 */
export function findUntrackedGaps(allSessions, events, workStartHour = 8, workEndHour = 20) {
  const today = new Date();
  const dayStart = new Date(today);
  dayStart.setHours(workStartHour, 0, 0, 0);
  const dayEnd = new Date(today);
  dayEnd.setHours(workEndHour, 0, 0, 0);

  const now = new Date();
  const effectiveEnd = now < dayEnd ? now : dayEnd;

  // Build timeline of covered periods
  const covered = [];

  for (const s of allSessions) {
    const start = parseTime(s.started_at);
    const end = parseTime(s.ended_at);
    if (!start || !end) continue;
    if (end <= dayStart || start >= effectiveEnd) continue;
    covered.push({
      start: start < dayStart ? dayStart : start,
      end: end > effectiveEnd ? effectiveEnd : end,
    });
  }

  for (const e of events) {
    const start = parseTime(e.start_time);
    const end = parseTime(e.end_time);
    if (!start || !end) continue;
    if (end <= dayStart || start >= effectiveEnd) continue;
    covered.push({
      start: start < dayStart ? dayStart : start,
      end: end > effectiveEnd ? effectiveEnd : end,
    });
  }

  if (!covered.length) {
    return [{
      start: dayStart,
      end: effectiveEnd,
      durationMins: (effectiveEnd - dayStart) / 60000,
    }];
  }

  // Merge overlapping covered periods
  covered.sort((a, b) => a.start - b.start);
  const merged = [covered[0]];
  for (let i = 1; i < covered.length; i++) {
    const last = merged[merged.length - 1];
    if (covered[i].start <= last.end) {
      last.end = new Date(Math.max(last.end, covered[i].end));
    } else {
      merged.push(covered[i]);
    }
  }

  // Find gaps
  const gaps = [];
  let cursor = dayStart;

  for (const period of merged) {
    if (period.start > cursor) {
      const gapMins = (period.start - cursor) / 60000;
      if (gapMins >= 15) { // Only report gaps >= 15 min
        gaps.push({ start: new Date(cursor), end: new Date(period.start), durationMins: Math.round(gapMins) });
      }
    }
    cursor = period.end;
  }

  if (cursor < effectiveEnd) {
    const gapMins = (effectiveEnd - cursor) / 60000;
    if (gapMins >= 15) {
      gaps.push({ start: new Date(cursor), end: new Date(effectiveEnd), durationMins: Math.round(gapMins) });
    }
  }

  return gaps;
}

// ─── Merge Intelligence ────────────────────────────────────────────────────────

/**
 * Intelligently merge multiple auto-sessions that belong to the same work context.
 * Sessions within a gap threshold are merged into one logical session.
 * @param {Array} sessions
 * @param {number} gapThresholdMins - max gap to bridge (default 5 min)
 * @returns {Array} Merged logical sessions
 */
export function mergeAdjacentSessions(sessions, gapThresholdMins = 5) {
  if (!sessions.length) return [];

  const sorted = [...sessions]
    .filter(s => s.started_at && s.ended_at)
    .sort((a, b) => new Date(a.started_at) - new Date(b.started_at));

  if (!sorted.length) return [];

  const merged = [];
  let current = { ...sorted[0] };

  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i];
    const currentEnd = parseTime(current.ended_at);
    const nextStart = parseTime(next.started_at);

    if (!currentEnd || !nextStart) continue;

    const gap = (nextStart - currentEnd) / 60000;

    // Same category + gap within threshold → merge
    const sameContext = (current.ai_category || current.category) ===
      (next.ai_category || next.category);

    if (gap <= gapThresholdMins && sameContext) {
      // Extend the current session
      current.ended_at = next.ended_at;
      current.duration_seconds = (current.duration_seconds || 0) + (next.duration_seconds || 0);
      current.context_switches = (current.context_switches || 0) + (next.context_switches || 0);
      current._mergedCount = (current._mergedCount || 1) + 1;
    } else {
      merged.push(current);
      current = { ...next };
    }
  }
  merged.push(current);

  return merged;
}
