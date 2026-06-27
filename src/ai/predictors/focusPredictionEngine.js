/**
 * Focus Prediction Engine
 * Analyzes historical patterns to predict optimal focus windows, deep work slots,
 * low-energy periods, and recovery timing for a given day.
 */

import { calendarMemoryEngine } from '../memory/calendarMemoryEngine.js';

// ─── Types & Constants ────────────────────────────────────────────────────────

const WINDOW_LABELS = {
  morning: { start: 5, end: 12, label: 'Morning' },
  midday: { start: 12, end: 15, label: 'Midday' },
  afternoon: { start: 15, end: 18, label: 'Afternoon' },
  evening: { start: 18, end: 22, label: 'Evening' },
  night: { start: 22, end: 5, label: 'Night' },
};

const CIRCADIAN_BASELINE = {
  // Typical human alertness curve (0-100) by hour
  0: 20, 1: 15, 2: 12, 3: 10, 4: 12, 5: 18,
  6: 35, 7: 55, 8: 70, 9: 80, 10: 85, 11: 82,
  12: 70, 13: 60, 14: 55, 15: 65, 16: 72, 17: 70,
  18: 65, 19: 60, 20: 55, 21: 50, 22: 40, 23: 28,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatHour(hour) {
  const h = hour % 24;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${h12}:00 ${ampm}`;
}

function hourLabel(hour) {
  for (const [, { start, end, label }] of Object.entries(WINDOW_LABELS)) {
    if (start <= end) {
      if (hour >= start && hour < end) return label;
    } else {
      if (hour >= start || hour < end) return label;
    }
  }
  return 'Unknown';
}

/**
 * Blend personal historical data with the circadian baseline.
 * If we have little data, rely more on the baseline.
 * As we accumulate data, shift toward the personal pattern.
 */
function blendWithBaseline(personalMap, sessionsAnalyzed) {
  const blended = {};
  const personalWeight = Math.min(sessionsAnalyzed / 100, 0.85); // Max 85% personal
  const baselineWeight = 1 - personalWeight;

  for (let h = 0; h < 24; h++) {
    const personal = personalMap[h] ?? 0;
    const baseline = CIRCADIAN_BASELINE[h] ?? 50;
    blended[h] = Math.round(personal * personalWeight + baseline * baselineWeight);
  }
  return blended;
}

// ─── Core Prediction Functions ────────────────────────────────────────────────

/**
 * Build a 24-hour focus score map for a given target date.
 * Combines personal history + circadian rhythm + day-of-week patterns.
 * @param {Date} targetDate
 * @returns {{ [hour: number]: number }} 0-100 score per hour
 */
export function buildHourlyFocusMap(targetDate = new Date()) {
  const personalMap = calendarMemoryEngine.getHourlyFocusMap();
  const signals = calendarMemoryEngine.getSignals();
  const weeklyPatterns = calendarMemoryEngine.getWeeklyPatterns();
  const dayOfWeek = targetDate.getDay();

  const blended = blendWithBaseline(personalMap, signals.totalDaysTracked || 0);

  // Apply day-of-week modifier
  const dayPattern = weeklyPatterns[dayOfWeek];
  if (dayPattern && dayPattern.count > 2) {
    const dayModifier = (dayPattern.avgFocus - 50) / 100; // -0.5 to +0.5
    for (let h = 0; h < 24; h++) {
      blended[h] = Math.round(Math.max(0, Math.min(100, blended[h] * (1 + dayModifier * 0.3))));
    }
  }

  return blended;
}

/**
 * Predict the best focus windows for a given date.
 * Returns sorted list of windows by predicted focus quality.
 * @param {Date} targetDate
 * @param {Object} options
 * @returns {Array} Focus window predictions
 */
export function predictBestFocusWindows(targetDate = new Date(), options = {}) {
  const {
    minWindowHours = 1,
    deepWorkMinHours = 1.5,
    workStartHour = null,
    workEndHour = null,
  } = options;

  const prefs = calendarMemoryEngine.getPreferredWorkHours();
  const startHour = workStartHour ?? prefs.start ?? 8;
  const endHour = workEndHour ?? prefs.end ?? 21;

  const hourlyScores = buildHourlyFocusMap(targetDate);

  // Find windows of contiguous high-focus hours
  const windows = [];
  let currentWindow = null;

  for (let h = startHour; h < endHour; h++) {
    const score = hourlyScores[h] ?? 0;
    const isGood = score >= 55;

    if (isGood) {
      if (!currentWindow) {
        currentWindow = { startHour: h, endHour: h + 1, scores: [score] };
      } else {
        currentWindow.endHour = h + 1;
        currentWindow.scores.push(score);
      }
    } else {
      if (currentWindow) {
        const duration = currentWindow.endHour - currentWindow.startHour;
        if (duration >= minWindowHours) {
          windows.push(finalizeWindow(currentWindow, targetDate));
        }
        currentWindow = null;
      }
    }
  }
  if (currentWindow) {
    const duration = currentWindow.endHour - currentWindow.startHour;
    if (duration >= minWindowHours) {
      windows.push(finalizeWindow(currentWindow, targetDate));
    }
  }

  // Tag deep work windows
  for (const win of windows) {
    const durationHours = win.durationMins / 60;
    win.suitableForDeepWork = durationHours >= deepWorkMinHours && win.avgScore >= 65;
    win.type = win.suitableForDeepWork ? 'deep_work' : 'focus';
    win.timeOfDay = hourLabel(win.startHour);
  }

  return windows.sort((a, b) => b.avgScore - a.avgScore);
}

function finalizeWindow(w, targetDate) {
  const avgScore = w.scores.length
    ? Math.round(w.scores.reduce((a, b) => a + b, 0) / w.scores.length)
    : 0;
  const peakScore = w.scores.length ? Math.max(...w.scores) : avgScore;
  const durationMins = (w.endHour - w.startHour) * 60;

  const start = new Date(targetDate);
  start.setHours(w.startHour, 0, 0, 0);
  const end = new Date(targetDate);
  end.setHours(w.endHour, 0, 0, 0);

  return {
    startHour: w.startHour,
    endHour: w.endHour,
    startTime: start,
    endTime: end,
    startLabel: formatHour(w.startHour),
    endLabel: formatHour(w.endHour),
    durationMins,
    avgScore,
    peakScore,
    label: `${formatHour(w.startHour)} – ${formatHour(w.endHour)}`,
  };
}

/**
 * Identify low-energy periods to avoid scheduling deep work.
 * @param {Date} targetDate
 * @returns {Array} Low-energy window descriptors
 */
export function predictLowEnergyPeriods(targetDate = new Date()) {
  const prefs = calendarMemoryEngine.getPreferredWorkHours();
  const hourlyScores = buildHourlyFocusMap(targetDate);
  const lowHours = calendarMemoryEngine.getLowEnergyHours();
  const workStart = prefs.start ?? 8;
  const workEnd = prefs.end ?? 21;

  const periods = [];
  let current = null;

  for (let h = workStart; h < workEnd; h++) {
    const score = hourlyScores[h] ?? 0;
    const isKnownLow = lowHours.includes(h);
    const isLow = score < 45 || isKnownLow;

    if (isLow) {
      if (!current) current = { startHour: h, endHour: h + 1, avgScore: score, count: 1 };
      else { current.endHour = h + 1; current.avgScore = (current.avgScore * current.count + score) / (current.count + 1); current.count++; }
    } else {
      if (current) {
        periods.push({
          startHour: current.startHour,
          endHour: current.endHour,
          label: `${formatHour(current.startHour)} – ${formatHour(current.endHour)}`,
          avgScore: Math.round(current.avgScore),
          recommendation: 'Schedule meetings or admin tasks here',
        });
        current = null;
      }
    }
  }
  if (current) {
    periods.push({
      startHour: current.startHour,
      endHour: current.endHour,
      label: `${formatHour(current.startHour)} – ${formatHour(current.endHour)}`,
      avgScore: Math.round(current.avgScore),
      recommendation: 'Schedule meetings or admin tasks here',
    });
  }

  return periods;
}

/**
 * Recommend specific deep work time blocks for a date.
 * Factors in existing calendar events to avoid conflicts.
 * @param {Date} targetDate
 * @param {Array} existingEvents - calendar events to avoid
 * @param {number} targetDeepWorkHours - how many hours of deep work to schedule
 * @returns {Array} Recommended time blocks
 */
export function recommendDeepWorkSlots(targetDate = new Date(), existingEvents = [], targetDeepWorkHours = 4) {
  const allWindows = predictBestFocusWindows(targetDate, { deepWorkMinHours: 1 });
  const deepWindows = allWindows.filter(w => w.suitableForDeepWork);

  // Find time slots not occupied by events
  const busySlots = existingEvents.map(e => ({
    start: new Date(e.start_time),
    end: new Date(e.end_time),
  })).filter(s => !isNaN(s.start) && !isNaN(s.end));

  const recommendations = [];
  let hoursScheduled = 0;

  for (const window of deepWindows) {
    if (hoursScheduled >= targetDeepWorkHours) break;

    // Check if window overlaps with busy slots
    const windowStart = window.startTime;
    const windowEnd = window.endTime;

    const isBlocked = busySlots.some(
      s => s.start < windowEnd && s.end > windowStart
    );

    if (!isBlocked) {
      const durationHours = window.durationMins / 60;
      const allocate = Math.min(durationHours, targetDeepWorkHours - hoursScheduled);
      hoursScheduled += allocate;

      recommendations.push({
        ...window,
        recommendedDurationMins: Math.round(allocate * 60),
        priority: recommendations.length === 0 ? 'primary' : 'secondary',
        insight: getDeepWorkInsight(window),
      });
    }
  }

  return recommendations;
}

function getDeepWorkInsight(window) {
  const h = window.startHour;
  if (h >= 5 && h < 10) return 'Morning deep work leverages peak cortisol levels.';
  if (h >= 10 && h < 12) return 'Late morning is a strong cognitive performance window.';
  if (h >= 14 && h < 17) return 'Afternoon window — good for analytical tasks.';
  if (h >= 17 && h < 21) return 'Evening session — ideal for uninterrupted creative work.';
  return 'High-focus window based on your personal patterns.';
}

/**
 * Predict recovery period timing.
 * Returns the next recommended break time based on current session state.
 * @param {Date} sessionStartTime - when the current session began
 * @param {number} currentFocusMins - how long currently in focus
 * @returns {Object} Recovery recommendation
 */
export function predictRecoveryTiming(sessionStartTime, currentFocusMins = 0) {
  const signals = calendarMemoryEngine.getSignals();
  const optimalSessionMins = Math.max(
    60,
    Math.min(signals.avgSessionDurationMins || 90, 120)
  );

  const minsUntilBreak = Math.max(0, optimalSessionMins - currentFocusMins);
  const breakTime = new Date();
  breakTime.setMinutes(breakTime.getMinutes() + minsUntilBreak);

  const urgency = currentFocusMins > optimalSessionMins * 1.5 ? 'high'
    : currentFocusMins > optimalSessionMins ? 'medium'
    : 'low';

  return {
    recommendedBreakInMins: Math.round(minsUntilBreak),
    recommendedBreakAt: breakTime,
    recommendedBreakDurationMins: 15,
    urgency,
    message: urgency === 'high'
      ? 'You\'ve been in focus too long. Take a break now.'
      : urgency === 'medium'
      ? `Break recommended in ${Math.round(minsUntilBreak)} minutes.`
      : `Next break in ~${Math.round(minsUntilBreak)} minutes.`,
  };
}

/**
 * Generate a full focus forecast for the day.
 * Returns an hour-by-hour map with predictions and recommendations.
 * @param {Date} targetDate
 * @param {Array} existingEvents
 * @returns {Object} Full day forecast
 */
export function generateDayFocusForecast(targetDate = new Date(), existingEvents = []) {
  const hourlyScores = buildHourlyFocusMap(targetDate);
  const focusWindows = predictBestFocusWindows(targetDate);
  const lowEnergyPeriods = predictLowEnergyPeriods(targetDate);
  const deepWorkSlots = recommendDeepWorkSlots(targetDate, existingEvents);
  const dayOfWeek = targetDate.getDay();
  const weeklyPatterns = calendarMemoryEngine.getWeeklyPatterns();
  const dayPattern = weeklyPatterns[dayOfWeek];

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayName = dayNames[dayOfWeek];

  const topWindow = focusWindows[0];
  const peakHour = Object.entries(hourlyScores)
    .sort(([, a], [, b]) => b - a)[0];

  const dayQuality = dayPattern?.count > 2
    ? dayPattern.avgFocus > 65 ? 'high'
      : dayPattern.avgFocus > 45 ? 'medium'
      : 'low'
    : 'unknown';

  return {
    date: targetDate.toISOString().slice(0, 10),
    dayName,
    dayQuality,
    hourlyScores,
    focusWindows,
    lowEnergyPeriods,
    deepWorkSlots,
    peakFocusHour: peakHour ? parseInt(peakHour[0]) : null,
    peakFocusScore: peakHour ? peakHour[1] : 0,
    bestWindow: topWindow || null,
    summary: buildForecastSummary(topWindow, lowEnergyPeriods, dayQuality, dayName),
  };
}

function buildForecastSummary(bestWindow, lowPeriods, dayQuality, dayName) {
  const parts = [];
  if (bestWindow) {
    parts.push(`Best focus window: ${bestWindow.label} (score: ${bestWindow.avgScore}/100).`);
  }
  if (lowPeriods.length) {
    parts.push(`Low energy expected around ${lowPeriods[0].label} — good for meetings.`);
  }
  if (dayQuality === 'high') {
    parts.push(`${dayName}s are historically your most productive day.`);
  } else if (dayQuality === 'low') {
    parts.push(`${dayName}s tend to be lower-energy — plan lighter tasks accordingly.`);
  }
  return parts.join(' ') || 'Not enough historical data yet — keep tracking to improve predictions.';
}

/**
 * Get a simple next-focus recommendation (used in insights sidebar).
 * @param {Date} now
 * @param {Array} existingEvents
 * @returns {{ startTime: Date, endTime: Date, label: string, score: number } | null}
 */
export function getNextFocusRecommendation(now = new Date(), existingEvents = []) {
  const windows = predictBestFocusWindows(now, { minWindowHours: 0.5 });
  const currentHour = now.getHours() + now.getMinutes() / 60;

  // predictBestFocusWindows() sorts its results by score, not by time, so
  // .find() here used to return whichever eligible window scored highest —
  // which could be hours later than a perfectly fine, sooner window. Sort the
  // *eligible* candidates chronologically before picking, so "next" actually
  // means next.
  const upcoming = windows
    .filter(w => w.startHour >= currentHour)
    .sort((a, b) => a.startHour - b.startHour);

  const next = upcoming.find(w => w.suitableForDeepWork);
  const fallback = upcoming[0];

  return next || fallback || null;
}
