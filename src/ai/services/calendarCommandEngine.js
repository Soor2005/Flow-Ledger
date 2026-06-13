/**
 * Calendar Command Engine
 * Parses natural language scheduling commands and executes calendar actions.
 * Supports creating, moving, and querying calendar events via text.
 */

import { detectCategory } from '../engines/eventIntelligenceEngine.js';
import { predictBestFocusWindows, predictLowEnergyPeriods } from '../predictors/focusPredictionEngine.js';
import { runFullConflictScan, CONFLICT_TYPES } from '../services/calendarConflictEngine.js';

// ─── Intent Types ─────────────────────────────────────────────────────────────

export const INTENTS = {
  CREATE: 'create',
  MOVE: 'move',
  DELETE: 'delete',
  QUERY: 'query',
  OPTIMIZE: 'optimize',
  RECURRING: 'recurring',
  BLOCK: 'block',
};

// ─── Time Parsing ─────────────────────────────────────────────────────────────

const TIME_PATTERNS = [
  // "9 AM", "9:30 AM", "9:30am"
  { pattern: /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i, type: 'absolute' },
  // "at 9", "at 9:30" (assumes business hours if no am/pm)
  { pattern: /\bat\s+(\d{1,2})(?::(\d{2}))?\b/, type: 'relative' },
  // "morning", "afternoon", "evening"
  { pattern: /\b(morning|afternoon|evening|night|noon|midday|midnight)\b/i, type: 'period' },
];

// Time-range patterns — "3-4pm", "3pm-4pm", "3pm to 4pm", "from 3 to 4pm", "3:30-5pm"
const TIME_RANGE_PATTERNS = [
  /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*[-–to]+\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i,
  /\bfrom\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s+to\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i,
];

// Relative-time patterns — "in 2 hours", "in 30 minutes", "in an hour"
const RELATIVE_TIME_PATTERNS = [
  { pattern: /\bin\s+(\d+(?:\.\d+)?)\s*h(?:ours?)?\b/i, unit: 'hours' },
  { pattern: /\bin\s+(\d+)\s*min(?:utes?)?\b/i, unit: 'minutes' },
  { pattern: /\bin\s+an?\s+hour\b/i, unit: 'fixed', value: 60 },
  { pattern: /\bin\s+half\s+an?\s+hour\b/i, unit: 'fixed', value: 30 },
];

const MONTH_NAMES = {
  january: 0, jan: 0, february: 1, feb: 1, march: 2, mar: 2,
  april: 3, apr: 3, may: 4, june: 5, jun: 5,
  july: 6, jul: 6, august: 7, aug: 7, september: 8, sep: 8, sept: 8,
  october: 9, oct: 9, november: 10, nov: 10, december: 11, dec: 11,
};

const DATE_PATTERNS = [
  { pattern: /\btoday\b/i, resolver: () => new Date() },
  { pattern: /\btomorrow\b/i, resolver: () => addDays(new Date(), 1) },
  { pattern: /\byesterday\b/i, resolver: () => addDays(new Date(), -1) },
  // "next week" → next Monday
  { pattern: /\bnext\s+week\b/i, resolver: () => nextWeekday('monday') },
  // "end of week" / "this weekend" → Friday
  { pattern: /\b(?:end\s+of\s+(?:the\s+)?week|this\s+weekend|weekend)\b/i, resolver: () => closestWeekday('friday') },
  { pattern: /\bnext\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i, resolver: (m) => nextWeekday(m[1]) },
  // "coming friday", "upcoming friday"
  { pattern: /\b(?:coming(?:\s+up)?|upcoming)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i, resolver: (m) => nextWeekday(m[1]) },
  { pattern: /\bthis\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i, resolver: (m) => thisWeekday(m[1]) },
  // "in N days"
  { pattern: /\bin\s+(\d+)\s+days?\b/i, resolver: (m) => addDays(new Date(), parseInt(m[1])) },
  // "March 15", "Jan 5th", "December 25"
  {
    pattern: new RegExp(`\\b(${Object.keys(MONTH_NAMES).join('|')})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, 'i'),
    resolver: (m) => parseMonthDay(m[1], m[2]),
  },
  // "on friday", bare weekday
  { pattern: /\bon\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i, resolver: (m) => closestWeekday(m[1]) },
  { pattern: /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i, resolver: (m) => closestWeekday(m[1]) },
  { pattern: /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/, resolver: (m) => parseMMDD(m[1], m[2], m[3]) },
];

const DURATION_PATTERNS = [
  // "for 2h" / "for 2 hours" / "for 1.5h"
  { pattern: /\bfor\s+(\d+(?:\.\d+)?)\s*h(?:ours?)?\b/i, unit: 'hours' },
  // "for 30 min" / "for 30 minutes" / "for 30mins"
  { pattern: /\bfor\s+(\d+)\s*min(?:utes?|s)?\b/i, unit: 'minutes' },
  // "with 30mins" / "with 1h"
  { pattern: /\bwith\s+(\d+)\s*min(?:utes?|s)?\b/i, unit: 'minutes' },
  { pattern: /\bwith\s+(\d+(?:\.\d+)?)\s*h(?:ours?)?\b/i, unit: 'hours' },
  // "of 30min" / "of 1h"
  { pattern: /\bof\s+(\d+)\s*min(?:utes?|s)?\b/i, unit: 'minutes' },
  { pattern: /\bof\s+(\d+(?:\.\d+)?)\s*h(?:ours?)?\b/i, unit: 'hours' },
  // "lasting 30 min" / "lasting 1h"
  { pattern: /\blasting\s+(\d+)\s*min(?:utes?|s)?\b/i, unit: 'minutes' },
  { pattern: /\blasting\s+(\d+(?:\.\d+)?)\s*h(?:ours?)?\b/i, unit: 'hours' },
  // Standalone "2h" / "1.5h"
  { pattern: /(\d+(?:\.\d+)?)\s*h(?:ours?)?\b/i, unit: 'hours' },
  // Standalone "30 min" / "30mins"
  { pattern: /(\d+)\s*min(?:utes?|s)\b/i, unit: 'minutes' },
  // Standalone "30m" shorthand
  { pattern: /\b(\d+)m\b(?!\s*(?:onday|orning))/i, unit: 'minutes' },
  { pattern: /\bhalf\s+(?:an?\s+)?hour\b/i, unit: 'fixed', value: 30 },
  { pattern: /\ban?\s+hour\b/i, unit: 'fixed', value: 60 },
  { pattern: /\btwo\s+hours?\b/i, unit: 'fixed', value: 120 },
];

// Smart duration defaults based on event type keyword.
// Used when no explicit duration is found in the command.
const EVENT_TYPE_DURATIONS = {
  standup: 15, 'stand-up': 15, scrum: 15, sync: 15,
  huddle: 15, 'quick call': 15, 'quick sync': 15,
  meeting: 30, call: 30, chat: 30, 'check-in': 30, checkin: 30,
  demo: 30, catchup: 30, 'catch-up': 30, coffee: 30, 'coffee chat': 30,
  review: 45, 'one-on-one': 45, '1:1': 45, interview: 60,
  lunch: 60, 'lunch break': 60, break: 30,
  planning: 60, retro: 60, retrospective: 60, workshop: 120, training: 60,
  'deep work': 90, 'deep focus': 90, focus: 90, 'work block': 90,
  'focus block': 90, 'focus session': 90,
};

// Default start time override by event keyword (when no time specified and it's today/tomorrow)
const EVENT_TYPE_TIMES = {
  lunch: { hour: 12, minute: 0 },
  'lunch break': { hour: 12, minute: 0 },
  standup: { hour: 9, minute: 30 },
  'stand-up': { hour: 9, minute: 30 },
};

const RECURRENCE_PATTERNS = [
  { pattern: /\bevery\s+day\b/i, value: 'daily' },
  { pattern: /\bdaily\b/i, value: 'daily' },
  { pattern: /\bevery\s+week\b/i, value: 'weekly' },
  { pattern: /\bweekly\b/i, value: 'weekly' },
  { pattern: /\bevery\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i, value: 'weekly_day' },
  { pattern: /\beveryday\b/i, value: 'daily' },
  { pattern: /\bweekdays\b/i, value: 'weekdays' },
];

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

const WEEKDAY_INDICES = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6,
};

function nextWeekday(dayName) {
  const target = WEEKDAY_INDICES[dayName.toLowerCase()];
  if (target === undefined) return new Date();
  const today = new Date();
  const current = today.getDay();
  const daysUntil = ((target - current + 7) % 7) || 7; // Next occurrence (not today)
  return addDays(today, daysUntil);
}

function thisWeekday(dayName) {
  const target = WEEKDAY_INDICES[dayName.toLowerCase()];
  if (target === undefined) return new Date();
  const today = new Date();
  const current = today.getDay();
  const diff = target - current;
  return addDays(today, diff);
}

function closestWeekday(dayName) {
  const target = WEEKDAY_INDICES[dayName.toLowerCase()];
  if (target === undefined) return new Date();
  const today = new Date();
  const current = today.getDay();
  let diff = target - current;
  if (diff <= 0) diff += 7; // Next occurrence
  return addDays(today, diff);
}

function parseMMDD(month, day, year) {
  const now = new Date();
  const y = year ? (year.length === 2 ? 2000 + parseInt(year) : parseInt(year)) : now.getFullYear();
  return new Date(y, parseInt(month) - 1, parseInt(day));
}

function parseMonthDay(monthStr, dayStr) {
  const now = new Date();
  const monthIdx = MONTH_NAMES[monthStr.toLowerCase()];
  if (monthIdx === undefined) return now;
  const day = parseInt(dayStr);
  let year = now.getFullYear();
  // If the date is in the past this year, move to next year
  const candidate = new Date(year, monthIdx, day);
  if (candidate < now && monthIdx < now.getMonth()) year++;
  return new Date(year, monthIdx, day);
}

// Parse "3-4pm", "3:30pm-5pm", "from 3 to 4pm" → { start: {hour,minute}, durationMins }
function parseTimeRange(text) {
  for (const pattern of TIME_RANGE_PATTERNS) {
    const m = text.match(pattern);
    if (!m) continue;

    // Extract start fields
    const startH = parseInt(m[1]);
    const startMin = parseInt(m[2] || '0');
    const startAmPm = m[3]?.toLowerCase();
    // Extract end fields
    const endH = parseInt(m[4]);
    const endMin = parseInt(m[5] || '0');
    const endAmPm = m[6]?.toLowerCase();

    // Resolve hours using end ampm as the anchor when start ampm is missing
    const anchorAmPm = endAmPm;
    let sH = startH;
    let eH = endH;
    if (anchorAmPm === 'pm') {
      if (eH < 12) eH += 12;
      // Infer start: if start > end (after adding 12), don't add 12
      if (!startAmPm && sH < eH) sH = sH < 12 ? (sH + 12 > eH ? sH : sH) : sH;
      if (!startAmPm && sH + 12 <= eH) sH += 12;
    }
    if (startAmPm === 'pm' && sH < 12) sH += 12;
    if (startAmPm === 'am' && sH === 12) sH = 0;

    const durationMins = (eH * 60 + endMin) - (sH * 60 + startMin);
    if (durationMins <= 0 || durationMins > 480) continue;

    return { start: { hour: sH, minute: startMin }, durationMins };
  }
  return null;
}

// Parse "in 2 hours" / "in 30 minutes" → Date relative to now
function parseRelativeTime(text) {
  for (const { pattern, unit, value } of RELATIVE_TIME_PATTERNS) {
    const m = text.match(pattern);
    if (!m) continue;
    const now = new Date();
    const mins = unit === 'fixed' ? value
      : unit === 'hours' ? Math.round(parseFloat(m[1]) * 60)
      : parseInt(m[1]);
    const target = new Date(now.getTime() + mins * 60000);
    return { date: target, time: { hour: target.getHours(), minute: target.getMinutes() } };
  }
  return null;
}

const PERIOD_HOURS = {
  morning: 9, midday: 12, noon: 12, afternoon: 14, evening: 18, night: 20, midnight: 0,
};

function parseAbsoluteTime(match) {
  const hour = parseInt(match[1]);
  const min = parseInt(match[2] || '0');
  const ampm = match[3]?.toLowerCase();
  let h = hour;
  if (ampm === 'pm' && h < 12) h += 12;
  if (ampm === 'am' && h === 12) h = 0;
  return { hour: h, minute: min };
}

function parseTimeFromText(text) {
  for (const { pattern, type } of TIME_PATTERNS) {
    const m = text.match(pattern);
    if (!m) continue;

    if (type === 'absolute') return parseAbsoluteTime(m);
    if (type === 'relative') {
      const h = parseInt(m[1]);
      const min = parseInt(m[2] || '0');
      // Assume PM if hour < 8 (business context)
      return { hour: h < 8 ? h + 12 : h, minute: min };
    }
    if (type === 'period') {
      const period = m[1].toLowerCase();
      return { hour: PERIOD_HOURS[period] || 9, minute: 0 };
    }
  }
  return null;
}

function parseDateFromText(text) {
  for (const { pattern, resolver } of DATE_PATTERNS) {
    const m = text.match(pattern);
    if (m) return resolver(m);
  }
  return null;
}

function parseDurationFromText(text) {
  for (const { pattern, unit, value } of DURATION_PATTERNS) {
    const m = text.match(pattern);
    if (m) {
      if (unit === 'fixed') return value;
      if (unit === 'hours') return Math.round(parseFloat(m[1]) * 60);
      if (unit === 'minutes') return parseInt(m[1]);
    }
  }
  return null;
}

function parseRecurrenceFromText(text) {
  for (const { pattern, value } of RECURRENCE_PATTERNS) {
    const m = text.match(pattern);
    if (m) {
      if (value === 'weekly_day') {
        const day = m[1].toLowerCase();
        return { type: 'weekly', day, label: `Every ${m[1]}` };
      }
      return { type: value, label: pattern.source.replace(/\\b/g, '').replace(/[()]/g, '') };
    }
  }
  return null;
}

// ─── Intent Detection ─────────────────────────────────────────────────────────

const INTENT_KEYWORDS = {
  [INTENTS.CREATE]: ['schedule', 'create', 'add', 'plan', 'book', 'set up', 'block', 'put'],
  [INTENTS.MOVE]: ['move', 'reschedule', 'shift', 'change', 'update', 'push'],
  [INTENTS.DELETE]: ['delete', 'remove', 'cancel', 'clear', 'unschedule'],
  [INTENTS.OPTIMIZE]: ['optimize', 'improve', 'fix', 'balance', 'reorganize', 'suggest'],
  [INTENTS.QUERY]: ['when', 'what', 'show', 'find', 'list', 'how much', 'how many'],
  [INTENTS.BLOCK]: ['block', 'protect', 'reserve', 'hold', 'do not disturb'],
};

function detectIntent(text) {
  const lower = text.toLowerCase();

  // Check recurring first (often combined with create)
  const hasRecurrence = RECURRENCE_PATTERNS.some(({ pattern }) => pattern.test(lower));

  for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) {
      return hasRecurrence && intent === INTENTS.CREATE ? INTENTS.RECURRING : intent;
    }
  }

  // If no clear intent but has time/date, assume create
  if (parseTimeFromText(lower) || parseDateFromText(lower)) return INTENTS.CREATE;

  return INTENTS.QUERY;
}

// ─── Title Extraction ─────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  'schedule', 'create', 'add', 'plan', 'book', 'set', 'up', 'for', 'at', 'on',
  'to', 'a', 'an', 'the', 'my', 'move', 'tomorrow', 'today', 'next', 'this',
  'am', 'pm', 'hour', 'hours', 'minute', 'minutes', 'every', 'daily', 'weekly',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  'morning', 'afternoon', 'evening', 'night', 'noon',
  // NOTE: 'meeting', 'call', 'session', 'focus', 'block', 'deep', 'work'
  // are intentionally NOT stop words — they are meaningful event type labels.
]);

function extractTitle(text, intent) {
  let cleaned = text
    // ── Time expressions ──────────────────────────────────────────────────
    // Time ranges first: "3-4pm", "from 3 to 4pm"
    .replace(/\bfrom\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s+to\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/gi, '')
    .replace(/\b\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*[-–]\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/gi, '')
    // Relative times: "in 2 hours", "in 30 minutes"
    .replace(/\bin\s+(?:an?\s+)?(?:\d+(?:\.\d+)?\s*)?(?:h(?:ours?)?|min(?:utes?)?|half\s+an?\s+hour)\b/gi, '')
    .replace(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/gi, '')
    .replace(/\bat\s+\d{1,2}(?::\d{2})?\b/gi, '')
    .replace(/\b(morning|afternoon|evening|night|noon|midday|midnight)\b/gi, '')

    // ── Duration expressions (all variants) ───────────────────────────────
    .replace(/\b(?:for|with|of|lasting)\s+\d+(?:\.\d+)?\s*(?:hours?|h|minutes?|mins?)\b/gi, '')
    .replace(/\b\d+(?:\.\d+)?\s*h(?:ours?)?\b/gi, '')
    .replace(/\b\d+\s*min(?:utes?|s)?\b/gi, '')
    .replace(/\b\d+m\b(?!\s*(?:onday|orning))/gi, '')
    .replace(/\bhalf\s+(?:an?\s+)?hour\b/gi, '')
    .replace(/\ban?\s+hour\b/gi, '')
    .replace(/\btwo\s+hours?\b/gi, '')

    // ── Date expressions ──────────────────────────────────────────────────
    .replace(/\b(today|tomorrow|yesterday)\b/gi, '')
    .replace(/\b(?:coming(?:\s+up)?|upcoming|next\s+week|end\s+of\s+(?:the\s+)?week|this\s+weekend|weekend)\b/gi, '')
    .replace(/\b(?:coming(?:\s+up)?|upcoming|next|this)\s+\w+\b/gi, '')
    .replace(/\bon\s+(?:coming\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, '')
    .replace(/\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, '')
    .replace(/\bin\s+\d+\s+days?\b/gi, '')
    .replace(/\b(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\s+\d{1,2}(?:st|nd|rd|th)?\b/gi, '')
    .replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g, '')

    // ── Recurring markers ─────────────────────────────────────────────────
    .replace(/\bevery\s+\w+\b/gi, '')
    .replace(/\b(daily|weekly|monthly|weekdays)\b/gi, '')

    // ── Intent / command words ────────────────────────────────────────────
    .replace(/\b(schedule|create|add|plan|book|block|put|move|reschedule|set\s+up|remind\s+me)\b/gi, '')

    // ── Prepositions and filler words ─────────────────────────────────────
    // Remove standalone articles, prepositions, conjunctions that add no meaning
    .replace(/\b(on|at|with|of|a|an|the|my|in|during|from|to|and|or|for|about|coming|upcoming)\b/gi, '')

    // ── Cleanup ───────────────────────────────────────────────────────────
    .replace(/\s{2,}/g, ' ')
    .trim();

  // Filter out any remaining 1-char tokens or pure-number tokens
  const words = cleaned.split(' ').filter(w => w.length > 1 && !/^\d+$/.test(w));
  if (!words.length) return 'New Event';

  return words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

// ─── Command Builder ──────────────────────────────────────────────────────────

/**
 * Parse a natural language command into a structured action.
 * @param {string} text
 * @returns {Object} Parsed command
 */
export function parseCommand(text) {
  if (!text?.trim()) {
    return { intent: null, confidence: 0, error: 'Empty command' };
  }

  const normalized = text.trim();
  const lower = normalized.toLowerCase();

  const intent = detectIntent(lower);
  const recurrence = parseRecurrenceFromText(lower);

  // ── Time resolution: try range → absolute → relative → period ───────────
  let parsedTime = null;
  let durationFromRange = null;

  const timeRange = parseTimeRange(lower);
  if (timeRange) {
    parsedTime = timeRange.start;
    durationFromRange = timeRange.durationMins;
  }

  if (!parsedTime) {
    // "in 2 hours" / "in 30 minutes" — relative to now
    const relTime = parseRelativeTime(lower);
    if (relTime) {
      parsedTime = relTime.time;
      // Date is "today" in relative mode
    } else {
      parsedTime = parseTimeFromText(lower);
    }
  }

  // ── Date resolution ──────────────────────────────────────────────────────
  const parsedDate = parseDateFromText(lower) || new Date();

  // ── Duration: explicit > from time-range > smart event-type default ──────
  let parsedDuration = durationFromRange || parseDurationFromText(lower);
  const title = extractTitle(normalized, intent);
  const { category } = detectCategory(title);

  if (!parsedDuration) {
    // Check title/command for known event-type keywords
    const cmdLower = lower;
    const matched = Object.entries(EVENT_TYPE_DURATIONS).find(([kw]) => cmdLower.includes(kw));
    parsedDuration = matched ? matched[1] : 60;
  }

  // ── Smart default time by event type (only when no explicit time given) ──
  if (!parsedTime) {
    const eventTypeTime = Object.entries(EVENT_TYPE_TIMES)
      .find(([kw]) => lower.includes(kw));
    if (eventTypeTime) {
      parsedTime = eventTypeTime[1];
    }
  }

  // ── Build start datetime ─────────────────────────────────────────────────
  let startTime = new Date(parsedDate);
  if (parsedTime) {
    startTime.setHours(parsedTime.hour, parsedTime.minute, 0, 0);
  } else if (intent === INTENTS.CREATE) {
    const now = new Date();
    if (parsedDate.toDateString() === now.toDateString()) {
      startTime.setHours(Math.max(now.getHours() + 1, 9), 0, 0, 0);
    } else {
      startTime.setHours(9, 0, 0, 0);
    }
  }

  const endTime = new Date(startTime.getTime() + parsedDuration * 60000);

  // ── Confidence scoring ───────────────────────────────────────────────────
  let confidence = 0.4;
  if (parsedTime)              confidence += 0.25;
  if (parsedDate)              confidence += 0.15;
  if (durationFromRange)       confidence += 0.1;
  else if (parseDurationFromText(lower)) confidence += 0.08;
  if (title !== 'New Event')   confidence += 0.1;
  confidence = Math.min(confidence, 0.97);

  // Auto-execute when we have high confidence + an explicit time + a real title.
  // The UI uses this flag to skip the "Enter to confirm" step.
  const autoExecute = (
    confidence >= 0.85 &&
    !!parsedTime &&
    title !== 'New Event' &&
    (intent === INTENTS.CREATE || intent === INTENTS.RECURRING)
  );

  return {
    intent,
    title,
    category,
    startTime,
    endTime,
    durationMins: parsedDuration,
    recurrence,
    confidence: Math.round(confidence * 100) / 100,
    autoExecute,
    raw: normalized,
    explanation: buildExplanation(intent, title, startTime, parsedDuration, recurrence),
    // Parsed tokens for the rich preview UI
    tokens: {
      hasDate:     !!parseDateFromText(lower),
      hasTime:     !!parsedTime,
      hasDuration: !!parseDurationFromText(lower) || !!durationFromRange,
      isRange:     !!durationFromRange,
    },
  };
}

function buildExplanation(intent, title, startTime, durationMins, recurrence) {
  const now = new Date();
  const isToday    = startTime.toDateString() === now.toDateString();
  const isTomorrow = startTime.toDateString() === addDays(now, 1).toDateString();

  const timeStr = startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const dateStr = isToday    ? 'today'
    : isTomorrow ? 'tomorrow'
    : startTime.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

  const durStr = durationMins >= 60
    ? `${durationMins / 60 === Math.floor(durationMins / 60) ? durationMins / 60 : (durationMins / 60).toFixed(1)}h`
    : `${durationMins}min`;

  if (intent === INTENTS.CREATE || intent === INTENTS.RECURRING) {
    const recStr = recurrence ? `, repeating ${recurrence.label.toLowerCase()}` : '';
    return `"${title}" — ${dateStr} at ${timeStr}, ${durStr}${recStr}`;
  }
  if (intent === INTENTS.MOVE)    return `Move to ${dateStr} at ${timeStr}`;
  if (intent === INTENTS.DELETE)  return `Cancel "${title}"`;
  if (intent === INTENTS.OPTIMIZE) return `Optimize schedule for ${dateStr}`;
  return `Schedule for ${dateStr}`;
}

// ─── Command Execution ────────────────────────────────────────────────────────

/**
 * Execute a parsed command against the calendar.
 * Returns the action taken and any conflicts detected.
 * @param {Object} command - result of parseCommand()
 * @param {Object} context - { existingEvents, userId, onCreateEvent, onUpdateEvent, onDeleteEvent }
 * @returns {Promise<Object>} Execution result
 */
export async function executeCommand(command, context = {}) {
  const { existingEvents = [], onCreateEvent, onUpdateEvent, onDeleteEvent } = context;

  if (!command.intent) {
    return { success: false, error: 'Could not understand the command' };
  }

  const { intent, title, startTime, endTime, durationMins, recurrence, category } = command;

  // ── Conflict check — only OVERLAP (direct time collision) blocks creation ──
  // Back-to-back, overloaded-day, meeting-overload are warnings, not blockers.
  const proposedEvent = {
    id: '__proposed__',
    title,
    start_time: startTime.toISOString(),
    end_time: endTime.toISOString(),
    ai_category: category,
  };

  const allEventsWithProposed = [...existingEvents, proposedEvent];
  const conflictScan = runFullConflictScan(allEventsWithProposed);

  // Only hard-block on true overlaps involving the proposed event
  const hardConflicts = conflictScan.conflicts.filter(
    c => c.type === CONFLICT_TYPES.OVERLAP &&
         (c.eventA?.id === '__proposed__' || c.eventB?.id === '__proposed__')
  );

  // Soft warnings: back-to-back, overload, etc. (we still create but report them)
  const softWarnings = conflictScan.conflicts.filter(
    c => c.type !== CONFLICT_TYPES.OVERLAP &&
         (c.eventA?.id === '__proposed__' || c.eventB?.id === '__proposed__' ||
          c.day === startTime.toISOString().slice(0, 10))
  );

  if (intent === INTENTS.CREATE || intent === INTENTS.RECURRING) {
    const eventData = {
      title,
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      ai_category: category,
      // Map category to session type
      session_type: category === 'meeting' ? 'meeting'
        : category === 'deep_work' ? 'deep_work'
        : category === 'break' ? 'break'
        : 'focus',
      is_deep_work: category === 'deep_work',
      recurrence: recurrence || null,
    };

    if (hardConflicts.length) {
      // True time overlap — find the conflicting event name for a clear message
      const blocker = hardConflicts[0];
      const conflictingTitle = blocker.eventA?.id === '__proposed__'
        ? blocker.eventB?.title : blocker.eventA?.title;
      const overlapMsg = conflictingTitle
        ? `"${conflictingTitle}" is already scheduled at that time`
        : `Another event overlaps at ${startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;

      // Suggest nearby slots
      const alternatives = await suggestAlternativeSlots(startTime, durationMins, existingEvents);

      return {
        success: false,
        blocked: true,
        conflicts: hardConflicts,
        alternatives,
        eventData,
        error: overlapMsg,
        message: overlapMsg,
        suggestion: alternatives.length
          ? `Try ${alternatives[0].label} instead`
          : 'No free slot found nearby',
      };
    }

    // Execute creation
    let createdEvent = eventData;
    if (typeof onCreateEvent === 'function') {
      try {
        createdEvent = await onCreateEvent(eventData);
      } catch (err) {
        return {
          success: false,
          error: `Could not save event: ${err.message || 'Unknown error'}`,
          message: `Could not save event: ${err.message || 'Unknown error'}`,
        };
      }
    }

    const warningNote = softWarnings.length
      ? ` (Note: ${softWarnings[0].message})`
      : '';

    return {
      success: true,
      action: 'created',
      event: createdEvent,
      conflicts: softWarnings,
      message: command.explanation + warningNote,
    };
  }

  if (intent === INTENTS.OPTIMIZE) {
    const recommendations = await generateScheduleOptimizations(existingEvents);
    return {
      success: true,
      action: 'optimized',
      recommendations,
      message: `Generated ${recommendations.length} schedule optimization suggestions`,
    };
  }

  if (intent === INTENTS.QUERY) {
    const results = queryCalendar(command, existingEvents);
    return {
      success: true,
      action: 'query',
      results,
      message: `Found ${results.length} matching events`,
    };
  }

  return {
    success: false,
    error: `Intent "${intent}" requires event selection — not yet supported via text`,
  };
}

// ─── Alternative Slot Suggestion ──────────────────────────────────────────────

/**
 * Suggest conflict-free alternative time slots.
 * @param {Date} preferredStart
 * @param {number} durationMins
 * @param {Array} existingEvents
 * @returns {Array} Alternative slot suggestions
 */
async function suggestAlternativeSlots(preferredStart, durationMins, existingEvents) {
  const focusWindows = predictBestFocusWindows(preferredStart, { minWindowHours: durationMins / 60 });
  const alternatives = [];

  for (const window of focusWindows.slice(0, 5)) {
    const slotStart = window.startTime;
    const slotEnd = new Date(slotStart.getTime() + durationMins * 60000);

    const hasConflict = existingEvents.some(e => {
      const eStart = new Date(e.start_time);
      const eEnd = new Date(e.end_time);
      return slotStart < eEnd && slotEnd > eStart;
    });

    if (!hasConflict) {
      alternatives.push({
        startTime: slotStart,
        endTime: slotEnd,
        label: `${slotStart.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} – ${slotEnd.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`,
        focusScore: window.avgScore,
        isDeepWork: window.suitableForDeepWork,
        reason: window.suitableForDeepWork
          ? 'High-focus window — great for deep work'
          : 'Conflict-free slot with moderate focus potential',
      });
    }
  }

  return alternatives.slice(0, 3);
}

// ─── Schedule Optimization ────────────────────────────────────────────────────

async function generateScheduleOptimizations(existingEvents) {
  const conflictScan = runFullConflictScan(existingEvents);
  const lowEnergyPeriods = predictLowEnergyPeriods(new Date());

  const recommendations = [];

  for (const conflict of conflictScan.conflicts.slice(0, 5)) {
    recommendations.push({
      type: 'resolve_conflict',
      severity: conflict.severity,
      description: conflict.message,
      actions: conflict.suggestions,
    });
  }

  if (lowEnergyPeriods.length) {
    recommendations.push({
      type: 'schedule_insight',
      severity: 'low',
      description: `Low energy expected ${lowEnergyPeriods[0].label} — move deep work away from this window`,
      actions: [lowEnergyPeriods[0].recommendation],
    });
  }

  return recommendations;
}

// ─── Calendar Query ───────────────────────────────────────────────────────────

function queryCalendar(command, events) {
  const { startTime } = command;
  const dayStart = new Date(startTime);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(startTime);
  dayEnd.setHours(23, 59, 59, 999);

  return events.filter(e => {
    const eStart = new Date(e.start_time);
    return eStart >= dayStart && eStart <= dayEnd;
  }).sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
}

// ─── Command History ──────────────────────────────────────────────────────────

const HISTORY_KEY = 'fl_cmd_history';
const MAX_HISTORY = 50;

export function saveCommandToHistory(command, result) {
  try {
    const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    history.unshift({
      command: command.raw,
      intent: command.intent,
      timestamp: new Date().toISOString(),
      success: result.success,
    });
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
  } catch {}
}

export function getCommandHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  } catch {
    return [];
  }
}

/**
 * Get recent command suggestions based on history.
 * @param {string} partial - partial command text
 * @returns {Array<string>} Suggestions
 */
export function getCommandSuggestions(partial = '') {
  const defaults = [
    'Meeting tomorrow 7pm 30mins',
    'Deep work today 9am 2h',
    'Focus block coming Friday 10am with 1h',
    'Schedule standup every Monday 10am 30min',
    'Planning session this Friday morning 1h',
    'Team call tomorrow 3pm 45min',
    'Deep work block 9am for 2 hours',
    'Review meeting coming Tuesday 2pm 1h',
  ];

  const history = getCommandHistory()
    .filter(h => h.success)
    .map(h => h.command)
    .filter((c, i, arr) => arr.indexOf(c) === i) // Unique
    .slice(0, 5);

  const all = [...history, ...defaults];

  if (!partial) return all.slice(0, 6);

  const lower = partial.toLowerCase();
  return all.filter(s => s.toLowerCase().includes(lower)).slice(0, 6);
}
