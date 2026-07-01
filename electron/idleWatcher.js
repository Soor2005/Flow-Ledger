// ─── Manual Session Idle Watcher ─────────────────────────────────────────────
// Monitors system idle during a user-started (manual) focus session.
// Separate from the AutoTracker idle logic — that pauses auto-tracking after
// 60s; this watches for prolonged away-periods so the user can subtract them.
//
// • Fires onIdle({ awayStartedAt }) when idle exceeds threshold
// • Fires onResume({ awaySeconds }) when activity resumes
// • Tracks activity ratio (active vs total 30s intervals) for session quality

const POLL_MS          = 30_000;  // check every 30 seconds
const ACTIVE_IDLE_SECS = 30;      // idle < 30s = "active" interval for ratio

class IdleWatcher {
  constructor({ getIdleTime, thresholdSecs, onIdle, onResume }) {
    this.getIdleTime      = getIdleTime;
    this.thresholdSecs    = thresholdSecs || 300;   // 5 min default
    this.onIdle           = onIdle;
    this.onResume         = onResume;
    this._handle          = null;
    this._isAway          = false;
    this._awayStartMs     = null;
    this._activeIntervals = 0;
    this._totalIntervals  = 0;
  }

  start() {
    this.stop();
    this._isAway          = false;
    this._awayStartMs     = null;
    this._activeIntervals = 0;
    this._totalIntervals  = 0;
    this._handle = setInterval(() => this._tick(), POLL_MS);
  }

  stop() {
    clearInterval(this._handle);
    this._handle = null;
  }

  // Returns 0-100 integer. 100 = fully active; 0 = away the whole time.
  activityRatio() {
    if (this._totalIntervals === 0) return 100;
    return Math.round((this._activeIntervals / this._totalIntervals) * 100);
  }

  _tick() {
    const idleSecs = this.getIdleTime?.() ?? 0;
    this._totalIntervals++;

    // Count interval as "active" if not in an away period and recently used input
    if (!this._isAway && idleSecs < ACTIVE_IDLE_SECS) {
      this._activeIntervals++;
    }

    if (!this._isAway && idleSecs >= this.thresholdSecs) {
      this._isAway      = true;
      // Estimate when the user actually left — now minus current idle time
      this._awayStartMs = Date.now() - idleSecs * 1000;
      this.onIdle?.({ awayStartedAt: Math.floor(this._awayStartMs / 1000) });
    } else if (this._isAway && idleSecs < this.thresholdSecs) {
      const awayMs   = Date.now() - (this._awayStartMs || Date.now());
      const awaySecs = Math.max(0, Math.round(awayMs / 1000));
      this._isAway      = false;
      this._awayStartMs = null;
      this.onResume?.({ awaySeconds: awaySecs });
    }
  }
}

module.exports = { IdleWatcher };
