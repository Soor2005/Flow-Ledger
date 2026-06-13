/**
 * Calendar Memory Engine
 * Persistent local behavioral intelligence — learns from usage over time.
 * All data stored in localStorage; no network required.
 */

const MEMORY_KEY = 'fl_cal_memory_v1';
const MEMORY_VERSION = 2;

// Default behavioral memory structure
function defaultMemory() {
  return {
    version: MEMORY_VERSION,
    lastUpdated: null,
    sessionsAnalyzed: 0,

    // Work hour preferences derived from session history
    workHours: {
      preferredStart: 9,   // 24h format
      preferredEnd: 18,
      peakStart: null,     // Learned peak focus start hour
      peakEnd: null,
      lowEnergyHours: [],  // Hours with consistently low productivity
    },

    // Focus time patterns — keyed by hour (0-23)
    hourlyFocusScores: {},    // { "9": { totalScore: 420, count: 12 } }
    hourlyDeepWorkRatio: {},  // { "9": { deepWork: 8, total: 12 } }
    hourlyContextSwitches: {}, // { "9": { total: 24, count: 12 } }

    // Break behavior
    breaks: {
      avgDurationMins: 15,
      avgFrequencyPerHour: 0.5,
      preferredTimes: [],    // [10, 15] = 10AM, 3PM tend to be break times
      workspanBeforeBreak: 90, // Typical mins before taking a break
    },

    // Productivity decay (how focus drops over long sessions)
    decay: {
      peakSessionMins: 90,       // Optimal single session length
      decayAfterHours: 3,        // Hours after which productivity drops
      recoveryMins: 20,          // Time needed to recover after decay
    },

    // Per-project timing preferences
    // projectTimings: { projectId: { preferredHours: [9,10,11], avgDuration: 90 } }
    projectTimings: {},

    // Per-category timing preferences
    categoryTimings: {},

    // Weekly patterns — keyed by day of week (0=Sun, 6=Sat)
    weeklyPatterns: {
      0: { avgFocus: 0, count: 0, preferred: false },
      1: { avgFocus: 0, count: 0, preferred: false },
      2: { avgFocus: 0, count: 0, preferred: false },
      3: { avgFocus: 0, count: 0, preferred: false },
      4: { avgFocus: 0, count: 0, preferred: false },
      5: { avgFocus: 0, count: 0, preferred: false },
      6: { avgFocus: 0, count: 0, preferred: false },
    },

    // Behavioral signals
    signals: {
      avgDailyHours: 0,
      avgDeepWorkRatio: 0,
      avgContextSwitchesPerDay: 0,
      longestFocusStreak: 0,     // Minutes
      avgSessionDurationMins: 0,
      totalDaysTracked: 0,
    },

    // Identified productive windows (auto-detected)
    productiveWindows: [],   // [{ startHour, endHour, avgScore, label }]

    // Meeting patterns
    meetingPatterns: {
      avgPerDay: 0,
      avgDurationMins: 0,
      preferredDays: [],
      preferredHours: [],
      focusImpact: 0,  // -1 to 0 (how much meetings reduce focus afterward)
    },
  };
}

class CalendarMemoryEngine {
  constructor() {
    this._memory = this._load();
    this._dirty = false;
    this._saveTimer = null;
    this._learnedSessionKeys = new Set(); // dedup guard — prevents same session counted twice
  }

  // ─── Persistence ─────────────────────────────────────────────────────────

  _load() {
    try {
      const raw = localStorage.getItem(MEMORY_KEY);
      if (!raw) return defaultMemory();
      const parsed = JSON.parse(raw);
      if (parsed.version !== MEMORY_VERSION) {
        // Migrate: preserve what we can, reset the rest
        const fresh = defaultMemory();
        if (parsed.workHours) Object.assign(fresh.workHours, parsed.workHours);
        if (parsed.signals) Object.assign(fresh.signals, parsed.signals);
        return fresh;
      }
      return parsed;
    } catch {
      return defaultMemory();
    }
  }

  _scheduleSave() {
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this._persist(), 2000);
  }

  _persist() {
    try {
      this._memory.lastUpdated = new Date().toISOString();
      localStorage.setItem(MEMORY_KEY, JSON.stringify(this._memory));
      this._dirty = false;
    } catch (e) {
      console.warn('[CalendarMemory] Save failed:', e);
    }
  }

  /** Force immediate save */
  flush() {
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._persist();
  }

  // ─── Learning ─────────────────────────────────────────────────────────────

  /**
   * Ingest a batch of sessions to update all memory patterns.
   * @param {Array} sessions - manual or auto-tracked sessions
   */
  learnFromSessions(sessions) {
    if (!sessions?.length) return;

    const nowMs = Date.now();
    const newSessions = [];

    for (const session of sessions) {
      // Deduplicate: skip sessions we've already processed in this instance lifetime
      const key = session.id || `${session.started_at}_${session.ended_at}`;
      if (this._learnedSessionKeys.has(key)) continue;
      this._learnedSessionKeys.add(key);

      const start = new Date(session.started_at);
      // Cap end to now to prevent future-ending sessions inflating durations
      const rawEnd = new Date(session.ended_at || session.started_at);
      const end = rawEnd > nowMs ? new Date(nowMs) : rawEnd;
      if (isNaN(start) || isNaN(end)) continue;
      if (start > nowMs) continue; // skip future sessions entirely

      const durationMins = (end - start) / 60000;
      if (durationMins < 1) continue; // skip sub-minute junk

      const hour = start.getHours();
      const dayOfWeek = start.getDay();
      const isDeepWork = !!session.is_deep_work;
      const contextSwitches = session.context_switches || 0;

      this._updateHourlyFocus(hour, session, durationMins, isDeepWork, contextSwitches);
      this._updateWeeklyPattern(dayOfWeek, session);
      if (session.project_id) this._updateProjectTiming(session.project_id, hour, durationMins);
      if (session.category)   this._updateCategoryTiming(session.category, hour, durationMins);

      newSessions.push(session);
    }

    if (!newSessions.length) return; // nothing new to learn

    this._memory.sessionsAnalyzed += newSessions.length;
    this._recomputeSignals(newSessions);
    this._detectProductiveWindows();
    this._scheduleSave();
  }

  _updateHourlyFocus(hour, session, durationMins, isDeepWork, contextSwitches) {
    const key = String(hour);

    // Focus score: longer sessions + deep work + fewer switches = higher score
    const baseScore = Math.min(durationMins / 90, 1) * 60;
    const deepBonus = isDeepWork ? 30 : 0;
    const switchPenalty = Math.min(contextSwitches * 5, 30);
    const score = Math.max(0, baseScore + deepBonus - switchPenalty);

    if (!this._memory.hourlyFocusScores[key]) {
      this._memory.hourlyFocusScores[key] = { totalScore: 0, count: 0 };
    }
    this._memory.hourlyFocusScores[key].totalScore += score;
    this._memory.hourlyFocusScores[key].count += 1;

    if (!this._memory.hourlyDeepWorkRatio[key]) {
      this._memory.hourlyDeepWorkRatio[key] = { deepWork: 0, total: 0 };
    }
    this._memory.hourlyDeepWorkRatio[key].total += 1;
    if (isDeepWork) this._memory.hourlyDeepWorkRatio[key].deepWork += 1;

    if (!this._memory.hourlyContextSwitches[key]) {
      this._memory.hourlyContextSwitches[key] = { total: 0, count: 0 };
    }
    this._memory.hourlyContextSwitches[key].total += contextSwitches;
    this._memory.hourlyContextSwitches[key].count += 1;
  }

  _updateWeeklyPattern(dayOfWeek, session) {
    const durationMins = session.duration_seconds ? session.duration_seconds / 60 : 0;
    const focusScore = session.is_deep_work ? 80 : 50;
    const pat = this._memory.weeklyPatterns[dayOfWeek];
    const prevTotal = pat.avgFocus * pat.count;
    pat.count += 1;
    pat.avgFocus = (prevTotal + focusScore) / pat.count;
    // Mark as preferred if above average
    pat.preferred = pat.avgFocus > 60;
  }

  _updateProjectTiming(projectId, hour, durationMins) {
    if (!this._memory.projectTimings[projectId]) {
      this._memory.projectTimings[projectId] = {
        preferredHours: {},
        totalSessions: 0,
        avgDurationMins: 0,
      };
    }
    const pt = this._memory.projectTimings[projectId];
    pt.preferredHours[hour] = (pt.preferredHours[hour] || 0) + 1;
    const prev = pt.avgDurationMins * pt.totalSessions;
    pt.totalSessions += 1;
    pt.avgDurationMins = (prev + durationMins) / pt.totalSessions;
  }

  _updateCategoryTiming(category, hour, durationMins) {
    if (!this._memory.categoryTimings[category]) {
      this._memory.categoryTimings[category] = { preferredHours: {} };
    }
    const ct = this._memory.categoryTimings[category];
    ct.preferredHours[hour] = (ct.preferredHours[hour] || 0) + 1;
  }

  _recomputeSignals(recentSessions) {
    const s = this._memory.signals;

    // Total days tracked (unique date_key values or derived from started_at)
    const days = new Set(recentSessions.map(s => {
      const d = new Date(s.started_at);
      return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    }));
    s.totalDaysTracked = Math.max(s.totalDaysTracked, days.size);

    // Average session duration
    const durations = recentSessions
      .map(s => s.duration_seconds ? s.duration_seconds / 60 : 0)
      .filter(d => d > 0);
    if (durations.length) {
      const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
      s.avgSessionDurationMins = s.avgSessionDurationMins
        ? (s.avgSessionDurationMins * 0.7 + avg * 0.3)  // Exponential moving average
        : avg;
    }

    // Deep work ratio
    const deepCount = recentSessions.filter(s => s.is_deep_work).length;
    const newRatio = recentSessions.length ? deepCount / recentSessions.length : 0;
    s.avgDeepWorkRatio = s.avgDeepWorkRatio
      ? (s.avgDeepWorkRatio * 0.7 + newRatio * 0.3)
      : newRatio;

    // Longest focus streak
    const sorted = [...recentSessions]
      .filter(s => s.started_at && s.ended_at && s.is_deep_work)
      .sort((a, b) => new Date(a.started_at) - new Date(b.started_at));
    let streak = 0;
    for (const sess of sorted) {
      const mins = (new Date(sess.ended_at) - new Date(sess.started_at)) / 60000;
      streak = Math.max(streak, mins);
    }
    if (streak > s.longestFocusStreak) s.longestFocusStreak = streak;
  }

  _detectProductiveWindows() {
    const scores = this._memory.hourlyFocusScores;
    const windows = [];

    const hours = Object.entries(scores)
      .map(([h, v]) => ({ hour: parseInt(h), avg: v.count ? v.totalScore / v.count : 0 }))
      .filter(h => h.avg > 40)  // Only meaningful focus hours
      .sort((a, b) => a.hour - b.hour);

    // Group consecutive hours into windows
    let currentWindow = null;
    for (const { hour, avg } of hours) {
      if (!currentWindow) {
        currentWindow = { startHour: hour, endHour: hour + 1, totalScore: avg, count: 1 };
      } else if (hour === currentWindow.endHour) {
        currentWindow.endHour = hour + 1;
        currentWindow.totalScore += avg;
        currentWindow.count += 1;
      } else {
        windows.push({
          ...currentWindow,
          avgScore: currentWindow.totalScore / currentWindow.count,
          label: this._labelWindow(currentWindow.startHour, currentWindow.endHour),
        });
        currentWindow = { startHour: hour, endHour: hour + 1, totalScore: avg, count: 1 };
      }
    }
    if (currentWindow) {
      windows.push({
        ...currentWindow,
        avgScore: currentWindow.totalScore / currentWindow.count,
        label: this._labelWindow(currentWindow.startHour, currentWindow.endHour),
      });
    }

    this._memory.productiveWindows = windows
      .sort((a, b) => b.avgScore - a.avgScore)
      .slice(0, 5);
  }

  _labelWindow(startHour, endHour) {
    const fmt = h => {
      const ampm = h >= 12 ? 'PM' : 'AM';
      const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
      return `${h12}${ampm}`;
    };
    return `${fmt(startHour)}–${fmt(endHour)}`;
  }

  // ─── Read API ─────────────────────────────────────────────────────────────

  /** Get the top N most productive hours */
  getBestFocusHours(n = 3) {
    return Object.entries(this._memory.hourlyFocusScores)
      .map(([h, v]) => ({ hour: parseInt(h), score: v.count ? v.totalScore / v.count : 0 }))
      .sort((a, b) => b.score - a.score)
      .slice(0, n)
      .map(x => x.hour);
  }

  /** Get hours with consistently low productivity */
  getLowEnergyHours() {
    return Object.entries(this._memory.hourlyFocusScores)
      .map(([h, v]) => ({ hour: parseInt(h), score: v.count ? v.totalScore / v.count : 0 }))
      .filter(x => x.score < 25 && this._memory.hourlyFocusScores[x.hour]?.count >= 3)
      .map(x => x.hour);
  }

  /** Get preferred hours for a specific project */
  getProjectPreferredHours(projectId) {
    const pt = this._memory.projectTimings[projectId];
    if (!pt) return this.getBestFocusHours();
    return Object.entries(pt.preferredHours)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([h]) => parseInt(h));
  }

  /** Get the top productive windows */
  getProductiveWindows(n = 3) {
    return this._memory.productiveWindows.slice(0, n);
  }

  /** Get preferred work start/end hours */
  getPreferredWorkHours() {
    return {
      start: this._memory.workHours.preferredStart,
      end: this._memory.workHours.preferredEnd,
    };
  }

  /** Get average deep work ratio (0-1) */
  getDeepWorkRatio() {
    return this._memory.signals.avgDeepWorkRatio;
  }

  /** Get the hourly focus score map for visualizations */
  getHourlyFocusMap() {
    const map = {};
    for (const [h, v] of Object.entries(this._memory.hourlyFocusScores)) {
      map[parseInt(h)] = v.count ? Math.round(v.totalScore / v.count) : 0;
    }
    return map;
  }

  /** Get weekly productivity pattern */
  getWeeklyPatterns() {
    return this._memory.weeklyPatterns;
  }

  /** Get all behavioral signals */
  getSignals() {
    return { ...this._memory.signals };
  }

  /** Get meeting impact on focus */
  getMeetingFocusImpact() {
    return this._memory.meetingPatterns.focusImpact;
  }

  /** Get full memory snapshot (for debugging/export) */
  snapshot() {
    return JSON.parse(JSON.stringify(this._memory));
  }

  /** Update work hours from settings */
  setPreferredWorkHours(start, end) {
    this._memory.workHours.preferredStart = start;
    this._memory.workHours.preferredEnd = end;
    this._scheduleSave();
  }

  /** Update meeting patterns */
  learnFromMeetings(meetings) {
    if (!meetings?.length) return;
    const durations = meetings.map(m => {
      const s = new Date(m.start_time);
      const e = new Date(m.end_time);
      return isNaN(s) || isNaN(e) ? 0 : (e - s) / 60000;
    }).filter(d => d > 0);

    if (durations.length) {
      const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
      const mp = this._memory.meetingPatterns;
      mp.avgDurationMins = mp.avgDurationMins
        ? (mp.avgDurationMins * 0.7 + avg * 0.3)
        : avg;
      mp.avgPerDay = Math.max(1, Math.round(meetings.length / 5));
    }
    this._scheduleSave();
  }

  /** Record that a meeting reduced post-meeting focus */
  recordMeetingFocusImpact(impactScore) {
    const mp = this._memory.meetingPatterns;
    mp.focusImpact = mp.focusImpact
      ? (mp.focusImpact * 0.8 + impactScore * 0.2)
      : impactScore;
    this._scheduleSave();
  }

  /** Reset all memory */
  reset() {
    this._memory = defaultMemory();
    this._persist();
  }
}

// Singleton export
export const calendarMemoryEngine = new CalendarMemoryEngine();
export default calendarMemoryEngine;
