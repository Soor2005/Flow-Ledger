/**
 * Adaptive Behavior Engine  v1
 *
 * Central behavioral intelligence system — no LLMs, no cloud, fully local.
 *
 * Learning algorithms used:
 *   EWMA  — Exponential Weighted Moving Average (smooths noisy signals)
 *   THD   — Temporal-decay Histogram (hour/day buckets, old data fades)
 *   BCS   — Bayesian-inspired Confidence Scoring (grows with observations)
 *   FAM   — Fatigue Accumulation Model (burnout detection)
 *   FSM   — Multi-factor Flow State Machine (7 states)
 *   MWMA  — Momentum-Weighted Moving Average (scheduling preference)
 *
 * Storage: localStorage keys prefixed fl_abi_v1_ (kept < 100KB each)
 * CPU:     all processing runs synchronously in microtasks, no intervals
 * Memory:  ring-buffers cap historical data at configurable depths
 */

// ─── Constants ────────────────────────────────────────────────────────────────

const NS = 'fl_abi_v1_';          // storage namespace
const DECAY_HL = 14;               // half-life in days for temporal decay
const EWMA_A  = 0.18;             // learning rate (lower = more stable)
const MIN_OBS_CONFIDENCE = 5;      // observations needed for low confidence
const HIGH_OBS_CONFIDENCE = 30;    // observations needed for high confidence
const HISTORY_DAYS = 90;           // max days of daily history kept
const WORKFLOW_MEMORY_DEPTH = 40;  // max distinct workflows remembered
const SESSION_MIN_SECS = 120;      // sessions shorter than this are ignored

// Flow state IDs
export const FLOW_STATES = {
  DEEP_FLOW:        'deep_flow',
  HIGH_MOMENTUM:    'high_momentum',
  FOCUSED:          'focused',
  RESEARCH_MODE:    'research_mode',
  PLANNING_STATE:   'planning_state',
  CONTEXT_SWITCHING:'context_switching',
  RECOVERY_NEEDED:  'recovery_needed',
  BURNOUT_RISK:     'burnout_risk',
};

// ─── Storage helpers ──────────────────────────────────────────────────────────

function load(key, fallback = null) {
  try {
    const raw = localStorage.getItem(NS + key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}

function save(key, value) {
  try { localStorage.setItem(NS + key, JSON.stringify(value)); } catch {}
}

// ─── Math helpers ─────────────────────────────────────────────────────────────

function ewma(prev, next, alpha = EWMA_A) {
  return prev == null ? next : alpha * next + (1 - alpha) * prev;
}

function decayWeight(daysAgo) {
  return Math.exp(-daysAgo * Math.LN2 / DECAY_HL);
}

function confidence(observationCount) {
  return Math.min(1, 1 - Math.exp(-observationCount / MIN_OBS_CONFIDENCE));
}

function clamp(v, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, v));
}

function toUnix(val) {
  if (!val) return 0;
  if (typeof val === 'number') return val > 1e10 ? val / 1000 : val;
  return new Date(val).getTime() / 1000;
}

function daysBetween(unixA, unixB) {
  return Math.abs(unixA - unixB) / 86400;
}

function isoDay(unixSec) {
  // Use local timezone (not UTC) so midnight sessions aren't misclassified
  const d = new Date(unixSec * 1000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ISO date (local) for the Monday of the week containing `date`
function getWeekStartISO(date) {
  const d = new Date(date);
  const dow = d.getDay();
  const diff = d.getDate() - dow + (dow === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ─── Initial state factories ──────────────────────────────────────────────────

function initFocusPatterns() {
  return {
    hourlyScore:  new Array(24).fill(0),  // avg focus quality 0-100
    hourlyCounts: new Array(24).fill(0),  // observation count per hour
    hourlyMins:   new Array(24).fill(0),  // total tracked minutes per hour
    dowScore:     new Array(7).fill(0),   // day-of-week avg score
    dowCounts:    new Array(7).fill(0),
    bestHour: null, worstHour: null, bestDow: null,
    peakWindow: null,                     // e.g. "9AM–1PM"
    avgSessionMins: 60,
    avgDeepWorkRatio: 0,
    totalObservations: 0,
    updatedAt: null,
  };
}

function initEnergyPatterns() {
  return {
    hourlyEnergy: new Array(24).fill(50), // 0-100 energy estimate per hour
    hourlyCounts: new Array(24).fill(0),
    sustainableHoursPerDay: 7,
    sustainableHoursPerWeek: 35,
    naturalStartHour: 9,
    naturalEndHour: 18,
    postLunchDipHour: 14,
    recoveryRatio: 0.2,                   // fraction of time in recovery/break
    totalObservations: 0,
    updatedAt: null,
  };
}

function initWorkflowMemory() {
  return {
    recentWorkflows: [],      // [{title, category, lastSeen, count, avgMins}]
    recurringPatterns: [],    // [{label, frequency, avgStartHour, sessions}]
    continuityChain: [],      // ordered list of recent workflow titles
    projectBehaviors: {},     // projectId → {avgMins, category, deepWorkRatio}
    totalObservations: 0,
    updatedAt: null,
  };
}

function initContextSwitchPatterns() {
  return {
    baseline: 3,              // learned avg switches per 10-min block
    thresholdHigh: 8,         // above this = distracted
    thresholdCritical: 15,    // above this = fragmented
    hourlyBaseline: new Array(24).fill(3),
    hourlyCounts:   new Array(24).fill(0),
    daily: [],                // last 30 days: {date, avg, peak}
    fragmentation: 0,         // 0-100 score (higher = more fragmented)
    totalObservations: 0,
    updatedAt: null,
  };
}

function initBurnoutTracker() {
  return {
    sustainableHoursPerWeek: 35,
    recentWeeklyHours: [],     // last 8 weeks of total hours
    currentWeekHours: 0,
    fatigue: 0,                // 0-100 cumulative fatigue
    riskLevel: 'low',          // 'low' | 'medium' | 'high' | 'critical'
    consecutiveHighDays: 0,
    lastRecoveryDate: null,
    recoveryEffectiveness: 0.7, // how well recovery actually restores energy
    totalObservations: 0,
    updatedAt: null,
  };
}

function initProductivityHistory() {
  return {
    daily: [],                 // [{date, score, hours, deepWorkMins, switchRate, flowState}]
    rollingAvg7: 0,
    rollingAvg30: 0,
    trend: 'insufficient_data',
    peakScore: 0,
    lowestScore: 100,
    consistency: 0,            // 0-100 how consistent the user is
    totalDays: 0,
    updatedAt: null,
  };
}

function initFlowHistory() {
  return {
    recent: [],                // last 50 detected states [{state, score, hour, durationMins, date}]
    stateDistribution: {},     // state → fraction of time
    avgFlowDuration: 45,       // minutes
    bestFlowHour: 10,
    flowEntryConditions: {},   // state → {avgSwitches, avgDuration, topCategory}
    totalObservations: 0,
    updatedAt: null,
  };
}

function initSchedulingPatterns() {
  return {
    preferredStartHour: 9,
    preferredEndHour: 18,
    deepWorkPreferredHours: [9, 10, 11],
    meetingPreferredHours: [14, 15],
    breakFrequencyMins: 90,
    avgSessionGapMins: 15,
    schedulingConsistency: 0,  // how often user follows their own patterns
    totalObservations: 0,
    updatedAt: null,
  };
}

function initRecommendationHistory() {
  return {
    given: [],                 // [{id, type, message, givenAt, context}]
    accepted: [],              // [{id, acceptedAt}]
    dismissed: [],
    successRate: 0.5,
    totalGiven: 0,
    updatedAt: null,
  };
}

// ─── Load all patterns ────────────────────────────────────────────────────────

function loadAllPatterns() {
  return {
    focus:          load('focusPatterns',         initFocusPatterns()),
    energy:         load('energyPatterns',         initEnergyPatterns()),
    workflow:       load('workflowMemory',          initWorkflowMemory()),
    contextSwitch:  load('contextSwitchPatterns',  initContextSwitchPatterns()),
    burnout:        load('burnoutTracker',          initBurnoutTracker()),
    history:        load('productivityHistory',    initProductivityHistory()),
    flow:           load('flowHistory',             initFlowHistory()),
    scheduling:     load('schedulingPatterns',     initSchedulingPatterns()),
    recommendations:load('recommendationHistory',  initRecommendationHistory()),
  };
}

function saveAllPatterns(P) {
  save('focusPatterns',        P.focus);
  save('energyPatterns',       P.energy);
  save('workflowMemory',       P.workflow);
  save('contextSwitchPatterns',P.contextSwitch);
  save('burnoutTracker',       P.burnout);
  save('productivityHistory',  P.history);
  save('flowHistory',          P.flow);
  save('schedulingPatterns',   P.scheduling);
  save('recommendationHistory',P.recommendations);
}

// ─── Feature extraction ───────────────────────────────────────────────────────

function extractSessionFeatures(session) {
  const start = toUnix(session.started_at);
  const end   = toUnix(session.ended_at);
  const dur   = session.duration_seconds || Math.max(end - start, 0);
  if (dur < SESSION_MIN_SECS) return null;

  const d = new Date(start * 1000);
  return {
    hour:        d.getHours(),
    dow:         d.getDay(),
    date:        isoDay(start),
    startUnix:   start,
    durationMins: dur / 60,
    category:    (session.ai_category || session.category || 'general').toLowerCase(),
    isDeepWork:  !!(session.is_deep_work),
    switches:    session.context_switches || 0,
    switchRate:  dur > 0 ? (session.context_switches || 0) / (dur / 600) : 0, // per 10 min
    appName:     (session.app_name || '').toLowerCase(),
    title:       session.title || session.window_title || '',
    projectId:   session.project_id || null,
    score:       session.overallScore || null,
  };
}

// ─── Learning functions ───────────────────────────────────────────────────────

function learnFocusPatterns(P, features, focusScore) {
  const f = P.focus;
  const h = features.hour;
  const d = features.dow;

  // EWMA update for hourly score
  const prevCount = f.hourlyCounts[h];
  f.hourlyCounts[h]++;
  f.hourlyMins[h] += features.durationMins;

  if (prevCount === 0) {
    f.hourlyScore[h] = focusScore;
  } else {
    f.hourlyScore[h] = ewma(f.hourlyScore[h], focusScore);
  }

  // Day-of-week update
  f.dowCounts[d]++;
  f.dowScore[d] = ewma(f.dowScore[d], focusScore);

  // Session duration learning
  f.avgSessionMins = ewma(f.avgSessionMins, features.durationMins);

  // Deep work ratio learning
  f.avgDeepWorkRatio = ewma(f.avgDeepWorkRatio, features.isDeepWork ? 1 : 0);

  f.totalObservations++;
  f.updatedAt = new Date().toISOString();

  // Derive best/worst from histogram
  const scoredHours = f.hourlyScore
    .map((s, i) => ({ hour: i, score: s, count: f.hourlyCounts[i] }))
    .filter(h => h.count >= 2);

  if (scoredHours.length > 0) {
    scoredHours.sort((a, b) => b.score - a.score);
    f.bestHour  = scoredHours[0].hour;
    f.worstHour = scoredHours[scoredHours.length - 1].hour;

    // Detect peak window (consecutive high-score hours)
    const hourScores = f.hourlyScore.map((s, i) => ({ hour: i, score: s, count: f.hourlyCounts[i] }));
    f.peakWindow = detectPeakWindow(hourScores);
  }

  const scoredDow = f.dowScore
    .map((s, i) => ({ dow: i, score: s, count: f.dowCounts[i] }))
    .filter(d => d.count >= 1);
  if (scoredDow.length > 0) {
    f.bestDow = scoredDow.sort((a, b) => b.score - a.score)[0].dow;
  }
}

function detectPeakWindow(hourScores) {
  const DOW_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const high = hourScores.filter(h => h.count >= 2 && h.score >= 65);
  if (high.length === 0) return null;

  // Find longest consecutive run of high hours
  let best = [], current = [];
  for (const h of high.sort((a, b) => a.hour - b.hour)) {
    if (current.length && h.hour !== current[current.length - 1].hour + 1) {
      if (current.length > best.length) best = current;
      current = [];
    }
    current.push(h);
  }
  if (current.length > best.length) best = current;
  if (best.length < 2) return high.length > 0
    ? `${fmtHour(high[0].hour)}–${fmtHour(high[high.length - 1].hour + 1)}`
    : null;
  return `${fmtHour(best[0].hour)}–${fmtHour(best[best.length - 1].hour + 1)}`;
}

function fmtHour(h) {
  const h12 = h % 12 || 12;
  return `${h12}${h < 12 ? 'AM' : 'PM'}`;
}

function learnEnergyPatterns(P, features, energyScore) {
  const e = P.energy;
  const h = features.hour;

  e.hourlyCounts[h]++;
  e.hourlyEnergy[h] = ewma(e.hourlyEnergy[h], energyScore);

  // Learn natural start/end hours from when user actually works
  if (features.durationMins >= 20) {
    e.naturalStartHour = Math.round(ewma(e.naturalStartHour, h < 12 ? h : e.naturalStartHour));
    if (h >= 16) {
      e.naturalEndHour = Math.round(ewma(e.naturalEndHour, h + Math.min(features.durationMins / 60, 2)));
    }
  }

  e.totalObservations++;
  e.updatedAt = new Date().toISOString();
}

function learnWorkflowMemory(P, features) {
  const w = P.workflow;
  const key = normalizeWorkflowTitle(features.title, features.category);
  if (!key) return;

  // Update or insert workflow entry
  const existing = w.recentWorkflows.find(wf => wf.key === key);
  if (existing) {
    existing.count++;
    existing.lastSeen = features.date;
    existing.avgMins  = ewma(existing.avgMins, features.durationMins);
    existing.avgHour  = Math.round(ewma(existing.avgHour, features.hour));
  } else {
    w.recentWorkflows.push({
      key,
      title:    features.title || key,
      category: features.category,
      count:    1,
      lastSeen: features.date,
      firstSeen: features.date,
      avgMins:  features.durationMins,
      avgHour:  features.hour,
      projectId: features.projectId,
    });
    // Cap depth
    if (w.recentWorkflows.length > WORKFLOW_MEMORY_DEPTH) {
      w.recentWorkflows.sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen));
      w.recentWorkflows = w.recentWorkflows.slice(0, WORKFLOW_MEMORY_DEPTH);
    }
  }

  // Update continuity chain
  if (!w.continuityChain.includes(key)) {
    w.continuityChain = [key, ...w.continuityChain].slice(0, 10);
  }

  // Detect recurring patterns (count >= 3)
  w.recurringPatterns = w.recentWorkflows
    .filter(wf => wf.count >= 3)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .map(wf => ({
      label:   wf.title,
      frequency: wf.count,
      avgStartHour: wf.avgHour,
      category: wf.category,
      projectId: wf.projectId,
    }));

  // Per-project behavior
  if (features.projectId) {
    const pb = w.projectBehaviors[features.projectId] || { count: 0, avgMins: 0, deepWorkRatio: 0, category: features.category };
    pb.count++;
    pb.avgMins       = ewma(pb.avgMins, features.durationMins);
    pb.deepWorkRatio = ewma(pb.deepWorkRatio, features.isDeepWork ? 1 : 0);
    pb.category      = features.category;
    w.projectBehaviors[features.projectId] = pb;
  }

  w.totalObservations++;
  w.updatedAt = new Date().toISOString();
}

function normalizeWorkflowTitle(title = '', category = '') {
  const cleaned = title
    .replace(/\.[a-z]{2,5}$/i, '')    // strip file extensions
    .replace(/[—–\-]\s*.+$/, '')       // strip "— project" suffix
    .replace(/^\s*(building|implementing|debugging|fixing|reviewing|testing)\s+/i, '')
    .trim()
    .toLowerCase();
  if (cleaned.length < 4) return category || null;
  return cleaned.slice(0, 60);
}

function learnContextSwitchPatterns(P, features) {
  const cs = P.contextSwitch;
  const h  = features.hour;
  const sr = features.switchRate;

  cs.hourlyCounts[h]++;
  cs.hourlyBaseline[h] = ewma(cs.hourlyBaseline[h], sr);
  cs.baseline = ewma(cs.baseline, sr);

  // Adapt thresholds from learned baseline
  cs.thresholdHigh     = Math.max(cs.baseline * 2.5, 5);
  cs.thresholdCritical = Math.max(cs.baseline * 4,   10);

  // Rolling fragmentation score (0-100)
  const fragFactor = clamp((sr / cs.thresholdCritical) * 100);
  cs.fragmentation = ewma(cs.fragmentation, fragFactor);

  cs.totalObservations++;
  cs.updatedAt = new Date().toISOString();
}

function learnBurnoutTracker(P, features) {
  const b = P.burnout;

  // currentWeekHours is computed from scratch in learn() — don't accumulate here.
  // Only track consecutive high-day signals from deep-work sessions.
  if (features.isDeepWork && features.durationMins >= 60) {
    b.consecutiveHighDays = Math.min((b.consecutiveHighDays || 0) + 1, 7);
  }

  // Learn sustainable baseline from historical weekly hours
  if (b.totalObservations >= 14) {
    const recentAvg = (b.recentWeeklyHours || []).slice(-4).reduce((s, h) => s + h, 0) / 4;
    if (recentAvg > 0) {
      b.sustainableHoursPerWeek = ewma(b.sustainableHoursPerWeek, recentAvg * 0.85);
    }
  }

  b.totalObservations++;
  b.updatedAt = new Date().toISOString();
}

// Recompute fatigue from week hours (called once per learn() pass, not per-session).
// Model: 0–35h = low–medium, 35–52h = high, 52h+ = critical.
// Breaks reduce fatigue proportionally.
function recomputeFatigue(P, currentWeekHours, weekBreakHours) {
  const b = P.burnout;
  const sustainable = Math.max(b.sustainableHoursPerWeek, 20);
  const ratio = currentWeekHours / sustainable;

  // Base fatigue: 0% at 0h, 40% at sustainable limit, 75% at 1.5×, 100% at 2×
  let base;
  if (ratio <= 0)   { base = 0; }
  else if (ratio <= 1)   { base = ratio * 40; }
  else if (ratio <= 1.5) { base = 40 + (ratio - 1) * 70; }
  else                   { base = 75 + (ratio - 1.5) * 50; }

  // Consecutive high days add additional strain
  base += Math.min(10, (b.consecutiveHighDays || 0) * 2);

  // Break recovery: each hour of breaks reduces fatigue (up to 20 points)
  const recoveryBonus = Math.min(20, weekBreakHours * 6);

  b.fatigue = clamp(base - recoveryBonus);
  b.riskLevel = b.fatigue < 25 ? 'low'
    : b.fatigue < 50 ? 'medium'
    : b.fatigue < 75 ? 'high'
    : 'critical';
}

function learnSchedulingPatterns(P, features) {
  const s = P.scheduling;

  if (features.durationMins < 15) return;

  // Learn preferred start hour from morning sessions
  if (features.hour < 12 && features.durationMins >= 20) {
    s.preferredStartHour = Math.round(ewma(s.preferredStartHour, features.hour));
  }

  // Learn preferred end hour from afternoon/evening sessions
  if (features.hour >= 15) {
    const endHour = features.hour + features.durationMins / 60;
    s.preferredEndHour = Math.round(ewma(s.preferredEndHour, endHour));
  }

  // Learn deep work preferred hours
  if (features.isDeepWork) {
    const existingIdx = s.deepWorkPreferredHours.indexOf(features.hour);
    if (existingIdx === -1 && s.deepWorkPreferredHours.length < 5) {
      s.deepWorkPreferredHours.push(features.hour);
      s.deepWorkPreferredHours.sort((a, b) => a - b);
    }
  }

  // Learn break frequency
  s.avgSessionGapMins = ewma(s.avgSessionGapMins, 10); // placeholder, refined externally
  s.totalObservations++;
  s.updatedAt = new Date().toISOString();
}

// ─── Productivity score computation ───────────────────────────────────────────

function computeSessionScore(features) {
  let score = 50;

  // Deep work adds significantly
  if (features.isDeepWork) score += 25;

  // Duration quality (sweet spot 60-120 min)
  const durScore = features.durationMins < 25  ? 0
    : features.durationMins < 45  ? 15
    : features.durationMins < 90  ? 25
    : features.durationMins < 150 ? 20
    : 10;
  score += durScore;

  // Context switching penalty
  const switchPenalty = Math.min(features.switchRate * 5, 25);
  score -= switchPenalty;

  // Category bonus
  const catBonus = {
    development: 10, design: 10, writing: 8,
    research: 5, planning: 5,
    meeting: 0, break: -5, distraction: -15,
  };
  score += catBonus[features.category] || 0;

  return clamp(score);
}

function computeEnergyScore(features, P) {
  // Estimate energy from position in day relative to learned patterns
  const e = P.energy;
  const baseEnergy = e.hourlyEnergy[features.hour];

  // Fatigue reduction
  const fatigueReduction = P.burnout.fatigue * 0.3;

  // Deep work acts as energy signal
  const deepBoost = features.isDeepWork ? 10 : 0;

  return clamp(baseEnergy + deepBoost - fatigueReduction);
}

// ─── Flow state detection ─────────────────────────────────────────────────────

function detectFlowState(features, P, currentSessionMins = 0) {
  const { switchRate, durationMins, isDeepWork, category } = features;
  const burnoutFatigue = P.burnout.fatigue;
  const baseSwitchRate = P.contextSwitch.baseline;
  const sessionMins    = currentSessionMins || durationMins;

  // Burnout/recovery takes priority
  if (burnoutFatigue >= 75) return { state: FLOW_STATES.BURNOUT_RISK,     score: 10 };
  if (burnoutFatigue >= 50) return { state: FLOW_STATES.RECOVERY_NEEDED,  score: 25 };

  // Context switching
  if (switchRate >= P.contextSwitch.thresholdCritical) {
    return { state: FLOW_STATES.CONTEXT_SWITCHING, score: 20 };
  }

  // Deep flow: long focused session, low switches, development/design category
  if (
    isDeepWork &&
    sessionMins >= 60 &&
    switchRate < baseSwitchRate * 1.2 &&
    ['development', 'design', 'writing'].includes(category)
  ) {
    return { state: FLOW_STATES.DEEP_FLOW, score: 95 };
  }

  // High momentum: good focus, moderate duration
  if (
    sessionMins >= 35 &&
    switchRate < baseSwitchRate * 1.5 &&
    ['development', 'design', 'writing', 'research'].includes(category)
  ) {
    return { state: FLOW_STATES.HIGH_MOMENTUM, score: 80 };
  }

  // Research mode: multiple browser sessions, moderate switches
  if (category === 'research' && switchRate < P.contextSwitch.thresholdHigh) {
    return { state: FLOW_STATES.RESEARCH_MODE, score: 60 };
  }

  // Planning state
  if (['planning', 'meeting', 'writing'].includes(category) && sessionMins >= 20) {
    return { state: FLOW_STATES.PLANNING_STATE, score: 55 };
  }

  // Default: focused
  return { state: FLOW_STATES.FOCUSED, score: 65 };
}

// ─── Update daily productivity history ────────────────────────────────────────

function updateDailyHistory(P, date, score, durationMins, deepWorkMins, switchRate, flowState) {
  const h = P.history;
  const existing = h.daily.find(d => d.date === date);

  if (existing) {
    existing.score      = ewma(existing.score, score);
    existing.hours      = (existing.hours || 0) + durationMins / 60;
    existing.deepWorkMins = (existing.deepWorkMins || 0) + deepWorkMins;
    existing.switchRate = ewma(existing.switchRate || 3, switchRate);
    existing.flowState  = flowState;
  } else {
    h.daily.push({ date, score, hours: durationMins / 60, deepWorkMins, switchRate, flowState });
    if (h.daily.length > HISTORY_DAYS) {
      h.daily.sort((a, b) => new Date(a.date) - new Date(b.date));
      h.daily = h.daily.slice(-HISTORY_DAYS);
    }
  }

  // Rolling averages
  const last7  = h.daily.slice(-7).map(d => d.score);
  const last30 = h.daily.slice(-30).map(d => d.score);
  h.rollingAvg7  = last7.length  ? last7.reduce((s, v) => s + v, 0) / last7.length   : 0;
  h.rollingAvg30 = last30.length ? last30.reduce((s, v) => s + v, 0) / last30.length : 0;

  // Trend detection
  if (last7.length >= 5 && last30.length >= 20) {
    const diff = h.rollingAvg7 - h.rollingAvg30;
    h.trend = diff >  5 ? 'improving'
      : diff < -5 ? 'declining'
      : 'stable';
  } else {
    h.trend = 'insufficient_data';
  }

  h.peakScore    = Math.max(h.peakScore || 0, score);
  h.lowestScore  = Math.min(h.lowestScore ?? 100, score);
  h.totalDays    = h.daily.length;

  // Consistency: std dev of recent scores (inverted — lower std = higher consistency)
  if (last7.length >= 3) {
    const mean = h.rollingAvg7;
    const stdDev = Math.sqrt(last7.reduce((s, v) => s + (v - mean) ** 2, 0) / last7.length);
    h.consistency = clamp(100 - stdDev * 2);
  }

  h.updatedAt = new Date().toISOString();
}

// ─── Record flow state in history ─────────────────────────────────────────────

function recordFlowState(P, flowResult, features) {
  const fh = P.flow;
  fh.recent.push({
    state:       flowResult.state,
    score:       flowResult.score,
    hour:        features.hour,
    durationMins: features.durationMins,
    date:        features.date,
    category:    features.category,
    recordedAt:  new Date().toISOString(),
  });
  if (fh.recent.length > 50) fh.recent = fh.recent.slice(-50);

  // Update state distribution
  const dist = {};
  for (const r of fh.recent) {
    dist[r.state] = (dist[r.state] || 0) + r.durationMins;
  }
  const totalMins = Object.values(dist).reduce((s, v) => s + v, 0);
  fh.stateDistribution = totalMins > 0
    ? Object.fromEntries(Object.entries(dist).map(([k, v]) => [k, v / totalMins]))
    : {};

  // Best flow hour (from deep_flow + high_momentum records)
  const deepRecords = fh.recent.filter(r =>
    r.state === FLOW_STATES.DEEP_FLOW || r.state === FLOW_STATES.HIGH_MOMENTUM
  );
  if (deepRecords.length >= 3) {
    const hourCounts = new Array(24).fill(0);
    deepRecords.forEach(r => hourCounts[r.hour]++);
    fh.bestFlowHour = hourCounts.indexOf(Math.max(...hourCounts));
  }

  fh.avgFlowDuration = ewma(
    fh.avgFlowDuration,
    flowResult.state === FLOW_STATES.DEEP_FLOW ? features.durationMins : fh.avgFlowDuration
  );

  fh.totalObservations++;
  fh.updatedAt = new Date().toISOString();
}

// ─── Main learn function ──────────────────────────────────────────────────────

/**
 * Learn from a batch of sessions.
 * Call this after any new sessions are tracked or on app start.
 *
 * @param {Array} sessions      - manual session records
 * @param {Array} autoSessions  - auto-tracked sessions (optional)
 * @param {Date}  [asOf]        - reference date (defaults to now)
 * @returns {Object} intelligence snapshot
 */
export function learn(sessions = [], autoSessions = [], asOf = new Date()) {
  const P = loadAllPatterns();
  const nowUnix = asOf.getTime() / 1000;

  // ── One-time migration: clear inflated burnout + history data from old accumulation bugs ──
  const migrationKey = 'fl_abi_v1_burnout_migration_v3';
  if (!localStorage.getItem(migrationKey)) {
    P.burnout.currentWeekHours    = 0;
    P.burnout.fatigue             = 0;
    P.burnout.riskLevel           = 'low';
    P.burnout.consecutiveHighDays = 0;
    P.history.daily               = []; // clear daily hours that were double-counted
    save('learnedSessionKeys', []);     // clear dedup cache so all sessions re-learn cleanly
    localStorage.removeItem('fl_abi_v1_burnout_migration_v2'); // remove old flag
    localStorage.setItem(migrationKey, '1');
  }

  // Merge manual sessions (primary signal) with auto-sessions for context switching
  const allSessions = [...sessions];

  // ── Compute current week hours from scratch to avoid double-counting ─────
  // Filter to sessions that started within the current ISO week and in the past.
  const weekStartISO = getWeekStartISO(asOf);
  let currentWeekWorkHours = 0;
  let currentWeekBreakHours = 0;
  for (const s of allSessions) {
    const startUnix = toUnix(s.started_at);
    if (!startUnix || startUnix * 1000 > asOf.getTime()) continue; // skip future
    const sessionDay = isoDay(startUnix);
    if (sessionDay < weekStartISO) continue; // skip sessions from previous weeks
    const durSecs = s.duration_seconds || Math.max(
      Math.min(toUnix(s.ended_at) || nowUnix, nowUnix) - startUnix, 0
    );
    const cat = (s.ai_category || s.category || '').toLowerCase();
    if (cat === 'break' || cat === 'lunch' || cat === 'idle') {
      currentWeekBreakHours += durSecs / 3600;
    } else {
      currentWeekWorkHours += durSecs / 3600;
    }
  }
  P.burnout.currentWeekHours = currentWeekWorkHours;

  // Build a per-session context_switch map from auto-sessions if available
  const autoByDate = {};
  for (const a of autoSessions) {
    if (a.is_idle) continue;
    const day = isoDay(toUnix(a.started_at));
    if (!autoByDate[day]) autoByDate[day] = { switches: 0, mins: 0 };
    autoByDate[day].switches += a.context_switches || 0;
    autoByDate[day].mins += (a.duration_seconds || 0) / 60;
  }

  // Deduplicate sessions by key to prevent the same session being learned multiple times
  // across repeated learn() calls (common when React re-renders with the same sessions).
  const learnedKeys = new Set(
    (load('learnedSessionKeys', []) || [])
  );
  const newLearnedKeys = [];

  for (const session of allSessions) {
    const sessionKey = session.id || `${session.started_at}|${session.ended_at}`;
    if (learnedKeys.has(sessionKey)) continue; // already learned — skip
    newLearnedKeys.push(sessionKey);

    const features = extractSessionFeatures(session);
    if (!features) continue;

    // Apply temporal decay weight to old sessions
    const daysAgo = daysBetween(features.startUnix, nowUnix);
    const weight  = decayWeight(daysAgo);
    if (weight < 0.01) continue; // data older than ~3 months, skip

    // Enrich switch rate with auto-session data when missing
    if ((features.switches === 0 || features.switchRate === 0) && autoByDate[features.date]) {
      const aday = autoByDate[features.date];
      if (aday.mins > 0) {
        features.switchRate = (aday.switches / aday.mins) * 10; // per 10 min
      }
    }

    const score   = computeSessionScore(features);
    const energy  = computeEnergyScore(features, P);
    const flow    = detectFlowState(features, P);

    // Apply temporal weight to learning rates
    const alpha = EWMA_A * weight;

    learnFocusPatterns(P, features, score);
    learnEnergyPatterns(P, features, energy);
    learnWorkflowMemory(P, features);
    learnContextSwitchPatterns(P, features);
    learnBurnoutTracker(P, features);
    learnSchedulingPatterns(P, features);

    updateDailyHistory(
      P, features.date, score,
      features.durationMins,
      features.isDeepWork ? features.durationMins : 0,
      features.switchRate,
      flow.state
    );
    recordFlowState(P, flow, features);
  }

  // Persist the set of learned session keys (capped at 500 most recent to limit storage)
  if (newLearnedKeys.length > 0) {
    const updated = [...learnedKeys, ...newLearnedKeys].slice(-500);
    save('learnedSessionKeys', updated);
  }

  // Recompute fatigue now that currentWeekHours is settled
  recomputeFatigue(P, currentWeekWorkHours, currentWeekBreakHours);

  // Flush weekly burnout accumulator (roll current week → history on week boundary)
  const currentWeekKey = getISOWeek(asOf);
  const storedWeekKey  = load('currentWeekKey', null);
  if (storedWeekKey && storedWeekKey !== currentWeekKey) {
    P.burnout.recentWeeklyHours = [...(P.burnout.recentWeeklyHours || []), P.burnout.currentWeekHours].slice(-8);
    P.burnout.currentWeekHours  = 0;
    save('currentWeekKey', currentWeekKey);
  } else if (!storedWeekKey) {
    save('currentWeekKey', currentWeekKey);
  }

  saveAllPatterns(P);

  return buildIntelligenceSnapshot(P);
}

function getISOWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  return `${d.getFullYear()}-W${Math.ceil((((d - yearStart) / 86400000) + 1) / 7)}`;
}

// ─── Intelligence snapshot builder ───────────────────────────────────────────

function buildIntelligenceSnapshot(P) {
  const focus     = P.focus;
  const energy    = P.energy;
  const workflow  = P.workflow;
  const cs        = P.contextSwitch;
  const burnout   = P.burnout;
  const history   = P.history;
  const flow      = P.flow;
  const sched     = P.scheduling;

  const focusConf = confidence(focus.totalObservations);

  return {
    // ── Focus intelligence ─────────────────────────────────────────────────
    focus: {
      bestHour:        focus.bestHour,
      worstHour:       focus.worstHour,
      bestDow:         focus.bestDow,
      peakWindow:      focus.peakWindow,
      avgSessionMins:  Math.round(focus.avgSessionMins),
      deepWorkRatio:   Math.round(focus.avgDeepWorkRatio * 100),
      hourlyScores:    focus.hourlyScore.map(s => Math.round(s)),
      hourlyCounts:    focus.hourlyCounts,
      hourlyMins:      focus.hourlyMins.map(m => Math.round(m)),
      dowScores:       focus.dowScore.map(s => Math.round(s)),
      confidence:      focusConf,
      observations:    focus.totalObservations,
      insight: focus.peakWindow
        ? `Your deepest focus historically occurs during ${focus.peakWindow}`
        : 'Tracking your focus patterns — insights will appear after a few sessions',
    },

    // ── Energy intelligence ────────────────────────────────────────────────
    energy: {
      hourlyEnergy:         energy.hourlyEnergy.map(e => Math.round(e)),
      naturalStartHour:     energy.naturalStartHour,
      naturalEndHour:       Math.round(energy.naturalEndHour),
      sustainableHoursPerDay: Math.round(energy.sustainableHoursPerDay * 10) / 10,
      peakEnergyHour:       energy.hourlyEnergy.indexOf(Math.max(...energy.hourlyEnergy)),
      lowEnergyHour:        energy.hourlyEnergy.indexOf(Math.min(...energy.hourlyEnergy)),
      observations:         energy.totalObservations,
      insight: `Estimated peak energy: ${fmtHour(energy.hourlyEnergy.indexOf(Math.max(...energy.hourlyEnergy)))}`,
    },

    // ── Workflow intelligence ──────────────────────────────────────────────
    workflow: {
      recurringPatterns:   workflow.recurringPatterns,
      recentWorkflows:     workflow.recentWorkflows.slice(0, 10),
      continuityChain:     workflow.continuityChain,
      projectBehaviors:    workflow.projectBehaviors,
      isContinuing:        workflow.continuityChain.length > 1,
      currentWorkflow:     workflow.continuityChain[0] || null,
      observations:        workflow.totalObservations,
      insight: workflow.recurringPatterns.length > 0
        ? `Recurring workflow detected: ${workflow.recurringPatterns[0]?.label}`
        : null,
    },

    // ── Context switching intelligence ─────────────────────────────────────
    contextSwitch: {
      baseline:            Math.round(cs.baseline * 10) / 10,
      thresholdHigh:       Math.round(cs.thresholdHigh),
      thresholdCritical:   Math.round(cs.thresholdCritical),
      fragmentation:       Math.round(cs.fragmentation),
      hourlyBaseline:      cs.hourlyBaseline.map(v => Math.round(v * 10) / 10),
      isHighSwitcher:      cs.fragmentation > 50,
      observations:        cs.totalObservations,
      insight: cs.fragmentation > 60
        ? 'High context-switching detected — consider batching similar tasks'
        : cs.fragmentation > 30
        ? 'Moderate context-switching — protect longer focus blocks'
        : 'Good focus continuity — context switching is within healthy range',
    },

    // ── Burnout intelligence ───────────────────────────────────────────────
    burnout: {
      riskLevel:             burnout.riskLevel,
      fatigue:               Math.round(burnout.fatigue),
      sustainableHoursPerWeek: Math.round(burnout.sustainableHoursPerWeek),
      currentWeekHours:      Math.round(burnout.currentWeekHours * 10) / 10,
      recentWeeklyHours:     burnout.recentWeeklyHours,
      isAtRisk:              burnout.riskLevel === 'high' || burnout.riskLevel === 'critical',
      isCritical:            burnout.riskLevel === 'critical',
      observations:          burnout.totalObservations,
      insight: burnout.riskLevel === 'critical' ? 'Critical burnout risk — take an extended break immediately'
        : burnout.riskLevel === 'high'     ? 'High fatigue detected — consider a recovery session'
        : burnout.riskLevel === 'medium'   ? 'Fatigue building — schedule short breaks'
        : 'Recovery balance looks healthy',
    },

    // ── Productivity history ───────────────────────────────────────────────
    history: {
      daily:       history.daily,
      rollingAvg7: Math.round(history.rollingAvg7),
      rollingAvg30: Math.round(history.rollingAvg30),
      trend:       history.trend,
      peakScore:   Math.round(history.peakScore),
      lowestScore: Math.round(history.lowestScore),
      consistency: Math.round(history.consistency),
      totalDays:   history.totalDays,
      insight: history.trend === 'improving' ? 'Productivity trend improving over the past week'
        : history.trend === 'declining'   ? 'Productivity declining — consider workload adjustments'
        : history.trend === 'stable'      ? 'Consistent productivity — stable performance pattern'
        : null,
    },

    // ── Flow state intelligence ────────────────────────────────────────────
    flow: {
      recent:            flow.recent.slice(-10),
      stateDistribution: flow.stateDistribution,
      bestFlowHour:      flow.bestFlowHour,
      avgFlowDuration:   Math.round(flow.avgFlowDuration),
      topState:          getTopFlowState(flow.stateDistribution),
      observations:      flow.totalObservations,
    },

    // ── Scheduling intelligence ────────────────────────────────────────────
    scheduling: {
      preferredStartHour:       sched.preferredStartHour,
      preferredEndHour:         Math.round(sched.preferredEndHour),
      deepWorkPreferredHours:   sched.deepWorkPreferredHours,
      meetingPreferredHours:    sched.meetingPreferredHours,
      breakFrequencyMins:       sched.breakFrequencyMins,
      observations:             sched.totalObservations,
    },

    // ── Meta ───────────────────────────────────────────────────────────────
    meta: {
      lastUpdated:      new Date().toISOString(),
      totalObservations: focus.totalObservations,
      overallConfidence: focusConf,
      maturityLevel:    focusConf < 0.2 ? 'learning'
        : focusConf < 0.6 ? 'developing'
        : focusConf < 0.9 ? 'established'
        : 'expert',
    },
  };
}

function getTopFlowState(dist = {}) {
  const entries = Object.entries(dist);
  if (!entries.length) return null;
  return entries.sort(([, a], [, b]) => b - a)[0][0];
}

// ─── Real-time flow state detection (for current session) ─────────────────────

/**
 * Detect the current flow state based on a live session snapshot.
 * Call this during an active session for real-time state.
 *
 * @param {Object} liveSession - { durationMins, switchRate, category, isDeepWork }
 * @returns {Object} { state, score, label, color, description, recommendation }
 */
export function detectCurrentFlowState(liveSession = {}) {
  const P = loadAllPatterns();
  const features = {
    durationMins: liveSession.durationMins || 0,
    switchRate:   liveSession.switchRate   || 0,
    category:     (liveSession.category || 'general').toLowerCase(),
    isDeepWork:   !!liveSession.isDeepWork,
    hour:         new Date().getHours(),
    date:         isoDay(Date.now() / 1000),
    title:        liveSession.title || '',
    projectId:    liveSession.projectId || null,
  };

  const flow = detectFlowState(features, P, liveSession.durationMins);
  return enrichFlowState(flow, P);
}

const FLOW_STATE_META = {
  [FLOW_STATES.DEEP_FLOW]:         { label: 'Deep Flow',         color: '#34D399', emoji: '⚡', description: 'Peak cognitive performance — protect this state', recommendation: "You're in deep flow — avoid switching contexts" },
  [FLOW_STATES.HIGH_MOMENTUM]:     { label: 'High Momentum',     color: '#818CF8', emoji: '🚀', description: 'Strong focus and forward progress', recommendation: 'Keep going — momentum is building' },
  [FLOW_STATES.FOCUSED]:           { label: 'Focused',           color: '#60A5FA', emoji: '🎯', description: 'Steady focused work', recommendation: 'Good focus rhythm — minimize interruptions' },
  [FLOW_STATES.RESEARCH_MODE]:     { label: 'Research Mode',     color: '#FBBF24', emoji: '🔍', description: 'Exploration and information gathering', recommendation: 'Set a research time-box to avoid rabbit holes' },
  [FLOW_STATES.PLANNING_STATE]:    { label: 'Planning State',    color: '#A78BFA', emoji: '📋', description: 'Organizing and strategizing', recommendation: 'Convert plans to actionable tasks before switching' },
  [FLOW_STATES.CONTEXT_SWITCHING]: { label: 'Context Switching', color: '#F87171', emoji: '⚠️', description: 'Fragmented attention across multiple contexts', recommendation: 'Pick one task and commit for at least 25 minutes' },
  [FLOW_STATES.RECOVERY_NEEDED]:   { label: 'Recovery Needed',   color: '#FB923C', emoji: '😓', description: 'Cognitive fatigue detected — quality declining', recommendation: 'Take a 15-20 minute break before continuing' },
  [FLOW_STATES.BURNOUT_RISK]:      { label: 'Burnout Risk',      color: '#EF4444', emoji: '🔥', description: 'Critical fatigue level — risk of burnout', recommendation: 'Stop working — take a real break or end the day' },
};

function enrichFlowState(flow, P) {
  const meta = FLOW_STATE_META[flow.state] || FLOW_STATE_META[FLOW_STATES.FOCUSED];
  return {
    state:         flow.state,
    score:         flow.score,
    label:         meta.label,
    color:         meta.color,
    emoji:         meta.emoji,
    description:   meta.description,
    recommendation: meta.recommendation,
  };
}

// ─── Productivity forecast ────────────────────────────────────────────────────

/**
 * Forecast productivity for the next N hours based on learned patterns.
 *
 * @param {number} hoursAhead - how many hours to forecast (1-8)
 * @returns {Array} [{hour, predictedScore, confidence, label, isBestWindow}]
 */
export function forecastProductivity(hoursAhead = 4) {
  const P    = loadAllPatterns();
  const now  = new Date();
  const startHour = now.getHours();
  const forecast  = [];
  const conf = confidence(P.focus.totalObservations);

  for (let i = 0; i < hoursAhead; i++) {
    const hour    = (startHour + i) % 24;
    const rawScore = P.focus.hourlyScore[hour];
    const count    = P.focus.hourlyCounts[hour];
    const energy   = P.energy.hourlyEnergy[hour];

    // Blend learned focus score with energy model
    const blended = count >= 2
      ? rawScore * 0.7 + energy * 0.3
      : energy;                              // fall back to energy when no data

    // Burnout penalty on forecast
    const fatiguePenalty = P.burnout.fatigue * 0.25;
    const predicted = clamp(blended - fatiguePenalty);

    const isBestWindow = predicted >= 70 && (P.focus.peakWindow
      ? hour >= (P.focus.bestHour || 9) && hour <= (P.focus.bestHour || 9) + 3
      : false);

    forecast.push({
      hour,
      label:          fmtHour(hour),
      predictedScore: Math.round(predicted),
      confidence:     Math.round(conf * 100),
      isBestWindow,
      energyLevel:    Math.round(energy),
      recommendation: predicted >= 75 ? 'Schedule deep work here'
        : predicted >= 55 ? 'Good for focused tasks'
        : predicted >= 35 ? 'Better for shallow work or meetings'
        : 'Consider a break — low energy window',
    });
  }

  return forecast;
}

// ─── Adaptive recommendations ─────────────────────────────────────────────────

/**
 * Generate personalized adaptive recommendations based on all learned patterns.
 *
 * @returns {Array} prioritized recommendation objects
 */
export function generateAdaptiveRecommendations() {
  const P    = loadAllPatterns();
  const now  = new Date();
  const hour = now.getHours();
  const recs = [];

  // ── Burnout / fatigue ──────────────────────────────────────────────────
  if (P.burnout.riskLevel === 'critical') {
    recs.push({
      priority: 1, type: 'critical', icon: '🔥',
      title: 'Burnout Risk Detected',
      message: `Fatigue at ${Math.round(P.burnout.fatigue)}% — take an extended break or end the day`,
      confidence: 'high',
      action: 'take_break',
    });
  } else if (P.burnout.riskLevel === 'high') {
    recs.push({
      priority: 2, type: 'warning', icon: '⚠️',
      title: 'High Fatigue',
      message: 'Consider a 20-minute recovery break before continuing deep work',
      confidence: 'medium',
      action: 'take_break',
    });
  }

  // ── Peak window coming up ──────────────────────────────────────────────
  if (P.focus.bestHour !== null && P.focus.totalObservations >= 5) {
    const bestHour = P.focus.bestHour;
    const hoursUntil = (bestHour - hour + 24) % 24;
    if (hoursUntil > 0 && hoursUntil <= 3) {
      recs.push({
        priority: 3, type: 'opportunity', icon: '⚡',
        title: `Peak Focus Window in ${hoursUntil}h`,
        message: `Your highest focus historically at ${fmtHour(bestHour)} — schedule deep work`,
        confidence: confidence(P.focus.totalObservations) > 0.5 ? 'high' : 'medium',
        action: 'schedule_deep_work',
      });
    }
  }

  // ── Context switching alert ────────────────────────────────────────────
  if (P.contextSwitch.fragmentation > 60) {
    recs.push({
      priority: 4, type: 'warning', icon: '🔄',
      title: 'High Context Switching',
      message: 'Focus quality declines after excessive app switching — try time-boxing tasks',
      confidence: 'high',
      action: 'reduce_switching',
    });
  }

  // ── Deep work deficit ──────────────────────────────────────────────────
  const today = P.history.daily.find(d => d.date === isoDay(Date.now() / 1000));
  if (today && today.hours >= 3 && today.deepWorkMins < 45) {
    recs.push({
      priority: 5, type: 'tip', icon: '🧠',
      title: 'Deep Work Deficit',
      message: `Only ${Math.round(today.deepWorkMins)}min of deep work today — aim for 90min+`,
      confidence: 'high',
      action: 'start_deep_work',
    });
  }

  // ── Scheduling recommendation ──────────────────────────────────────────
  if (P.focus.peakWindow && P.scheduling.totalObservations >= 5) {
    const isInPeakWindow = P.focus.bestHour !== null &&
      Math.abs(hour - P.focus.bestHour) <= 2;
    if (isInPeakWindow && P.burnout.riskLevel === 'low') {
      recs.push({
        priority: 6, type: 'success', icon: '✅',
        title: "You're in Your Peak Window",
        message: `${P.focus.peakWindow} is your best focus time — maximize deep work now`,
        confidence: 'high',
        action: 'maximize_focus',
      });
    }
  }

  // ── Recurring workflow ─────────────────────────────────────────────────
  if (P.workflow.recurringPatterns.length > 0) {
    const top = P.workflow.recurringPatterns[0];
    if (top.avgStartHour !== undefined && Math.abs(hour - top.avgStartHour) <= 1) {
      recs.push({
        priority: 7, type: 'info', icon: '🔁',
        title: 'Recurring Workflow',
        message: `You typically work on "${top.label}" around this time`,
        confidence: 'medium',
        action: 'continue_workflow',
      });
    }
  }

  // ── Week balance ───────────────────────────────────────────────────────
  if (P.burnout.currentWeekHours > P.burnout.sustainableHoursPerWeek * 0.85) {
    const remaining = P.burnout.sustainableHoursPerWeek - P.burnout.currentWeekHours;
    if (remaining < 8 && remaining > 0) {
      recs.push({
        priority: 8, type: 'warning', icon: '📊',
        title: 'Weekly Workload',
        message: `${Math.round(remaining)}h remaining in your sustainable week — plan accordingly`,
        confidence: 'high',
        action: 'balance_workload',
      });
    }
  }

  return recs.sort((a, b) => a.priority - b.priority).slice(0, 5);
}

// ─── Full intelligence snapshot (for hooks) ───────────────────────────────────

/**
 * Return the complete current intelligence snapshot without running learn().
 * Useful for reading cached intelligence from the hook.
 *
 * @returns {Object} full intelligence snapshot
 */
export function getIntelligence() {
  const P = loadAllPatterns();
  return buildIntelligenceSnapshot(P);
}

/**
 * Return analytics-ready behavioral data for charts and reports.
 *
 * @returns {Object} analytics data
 */
export function getAnalyticsData() {
  const P    = loadAllPatterns();
  const snap = buildIntelligenceSnapshot(P);

  return {
    // Time-series for charts
    productivityTimeSeries: P.history.daily.map(d => ({
      date:         d.date,
      score:        Math.round(d.score),
      hours:        Math.round(d.hours * 10) / 10,
      deepWorkMins: Math.round(d.deepWorkMins),
      switchRate:   Math.round(d.switchRate * 10) / 10,
      flowState:    d.flowState,
    })),

    // Hourly focus heatmap (24 hours)
    hourlyFocusHeatmap: P.focus.hourlyScore.map((score, hour) => ({
      hour,
      label:  fmtHour(hour),
      score:  Math.round(score),
      count:  P.focus.hourlyCounts[hour],
      energy: Math.round(P.energy.hourlyEnergy[hour]),
    })),

    // Day-of-week performance
    dowPerformance: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((day, i) => ({
      day,
      score:  Math.round(P.focus.dowScore[i]),
      count:  P.focus.dowCounts[i],
    })),

    // Flow state distribution (for pie/donut chart)
    flowStateDistribution: Object.entries(P.flow.stateDistribution).map(([state, fraction]) => ({
      state,
      label:    FLOW_STATE_META[state]?.label || state,
      color:    FLOW_STATE_META[state]?.color || '#94A3B8',
      fraction: Math.round(fraction * 100),
    })),

    // Burnout trajectory
    burnoutTrajectory: {
      currentFatigue:  Math.round(P.burnout.fatigue),
      riskLevel:       P.burnout.riskLevel,
      weeklyHours:     P.burnout.recentWeeklyHours,
      sustainable:     Math.round(P.burnout.sustainableHoursPerWeek),
      currentWeek:     Math.round(P.burnout.currentWeekHours * 10) / 10,
    },

    // Workflow patterns (for word cloud / list)
    workflowPatterns: P.workflow.recurringPatterns,

    // Context switching trend (last 30 daily records)
    contextSwitchTrend: P.contextSwitch.daily.slice(-30).map(d => ({
      date: d.date,
      avg:  Math.round(d.avg * 10) / 10,
      peak: Math.round(d.peak || 0),
    })),

    // Summary metrics
    summary: {
      overallConfidence:     Math.round(snap.meta.overallConfidence * 100),
      maturityLevel:         snap.meta.maturityLevel,
      peakFocusWindow:       snap.focus.peakWindow,
      bestDayLabel:          ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][P.focus.bestDow] || null,
      avgProductivityScore:  Math.round(P.history.rollingAvg30),
      productivityTrend:     P.history.trend,
      burnoutRisk:           P.burnout.riskLevel,
      deepWorkRatioLearned:  Math.round(P.focus.avgDeepWorkRatio * 100),
      sustainableHoursPerDay: Math.round(P.energy.sustainableHoursPerDay * 10) / 10,
      contextSwitchBaseline: Math.round(P.contextSwitch.baseline * 10) / 10,
    },

    // Pass-through of the full snapshot for components that need it
    intelligence: snap,
    recommendations: generateAdaptiveRecommendations(),
    forecast: forecastProductivity(6),
  };
}

/**
 * Record recommendation feedback (accepted / dismissed).
 */
export function recordRecommendationFeedback(recId, accepted) {
  const P = loadAllPatterns();
  if (accepted) {
    P.recommendations.accepted.push({ id: recId, acceptedAt: new Date().toISOString() });
  } else {
    P.recommendations.dismissed.push({ id: recId, dismissedAt: new Date().toISOString() });
  }
  const total    = P.recommendations.accepted.length + P.recommendations.dismissed.length;
  P.recommendations.successRate = total > 0
    ? P.recommendations.accepted.length / total
    : 0.5;
  P.recommendations.updatedAt = new Date().toISOString();
  save('recommendationHistory', P.recommendations);
}

/**
 * Reset all learned patterns (for testing or user request).
 */
export function resetIntelligence() {
  const keys = [
    'focusPatterns','energyPatterns','workflowMemory','contextSwitchPatterns',
    'burnoutTracker','productivityHistory','flowHistory','schedulingPatterns',
    'recommendationHistory','currentWeekKey',
  ];
  keys.forEach(k => localStorage.removeItem(NS + k));
}
