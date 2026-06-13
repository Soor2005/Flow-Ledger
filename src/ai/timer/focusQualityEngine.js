/**
 * Focus Quality Engine
 * Computes multi-dimensional focus quality scores from auto-session data.
 * Outputs: deepWorkScore, contextSwitchScore, flowScore, overallQuality (0-100)
 */

// ─── App category weights ─────────────────────────────────────────────────────
const DEEP_WORK_APPS = new Set([
  'visual studio code','vscode','cursor','webstorm','intellij','android studio',
  'xcode','vim','neovim','nvim','sublime text','emacs','rider','fleet',
  'figma','sketch','adobe xd','photoshop','illustrator','affinity designer',
  'affinity photo','blender','cinema 4d','davinci resolve','final cut pro',
  'adobe premiere','logic pro','ableton',
  'notion','obsidian','bear','scrivener','ulysses','ia writer','typora',
  'terminal','iterm','iterm2','warp','windows terminal','powershell','git bash',
  'tableau','power bi', 'dbeaver', 'tableplus',
  'postman','insomnia','docker desktop',
]);

const SHALLOW_APPS = new Set([
  'chrome','google chrome','safari','firefox','edge','brave','arc','opera',
  'slack','discord','telegram','whatsapp','signal','messages',
  'gmail','outlook','microsoft outlook','spark','airmail','thunderbird',
  'apple mail',
]);

const DISTRACTION_APPS = new Set([
  'youtube','netflix','spotify','twitch','tiktok','vlc','quicktime',
  'twitter','instagram','facebook','reddit','x',
]);

function categorizeApp(appName = '') {
  const n = appName.toLowerCase().trim();
  if (DEEP_WORK_APPS.has(n))       return 'deep';
  if (SHALLOW_APPS.has(n))         return 'shallow';
  if (DISTRACTION_APPS.has(n))     return 'distraction';
  // Partial match fallbacks
  if (/code|cursor|vim|studio|intellij|xcode|rider|webstorm|sublime|emacs/.test(n)) return 'deep';
  if (/figma|sketch|photoshop|illustrator|affinity|blender|premiere|final cut/.test(n)) return 'deep';
  if (/notion|obsidian|bear|scrivener|ulysses|typora/.test(n)) return 'deep';
  if (/terminal|iterm|warp|powershell|bash/.test(n)) return 'deep';
  if (/chrome|firefox|safari|edge|brave|arc/.test(n)) return 'shallow';
  if (/slack|discord|telegram|whatsapp/.test(n)) return 'shallow';
  if (/mail|outlook|gmail|spark/.test(n)) return 'shallow';
  if (/youtube|netflix|spotify|twitch|reddit/.test(n)) return 'distraction';
  return 'neutral';
}

// ─── Deep Work Score (0-100) ─────────────────────────────────────────────────
function computeDeepWorkScore(autoSessions, totalSecs) {
  if (!totalSecs || !autoSessions.length) return 0;
  const deepSecs = autoSessions
    .filter(s => categorizeApp(s.app_name) === 'deep')
    .reduce((a, s) => a + (s.duration_seconds || 0), 0);
  const ratio = deepSecs / totalSecs;
  // Non-linear: >70% deep = strong score
  if (ratio >= 0.85) return 95;
  if (ratio >= 0.70) return Math.round(80 + (ratio - 0.70) / 0.15 * 15);
  if (ratio >= 0.50) return Math.round(60 + (ratio - 0.50) / 0.20 * 20);
  if (ratio >= 0.30) return Math.round(35 + (ratio - 0.30) / 0.20 * 25);
  return Math.round(ratio / 0.30 * 35);
}

// ─── Context Switch Score (0-100, higher = fewer switches = better) ───────────
function computeContextSwitchScore(autoSessions) {
  if (autoSessions.length <= 1) return 100;
  const totalSecs = autoSessions.reduce((a, s) => a + (s.duration_seconds || 0), 0);
  if (!totalSecs) return 50;
  const totalMins = totalSecs / 60;
  // Count distinct app changes (not just total sessions — adjacent same-app don't count)
  let switches = 0;
  for (let i = 1; i < autoSessions.length; i++) {
    if (autoSessions[i].app_name !== autoSessions[i - 1].app_name) switches++;
  }
  const switchesPerHour = (switches / totalMins) * 60;
  // Ideal: <4/hr = 100, >20/hr = 20
  if (switchesPerHour <= 2)  return 100;
  if (switchesPerHour <= 4)  return 90;
  if (switchesPerHour <= 6)  return 78;
  if (switchesPerHour <= 10) return 62;
  if (switchesPerHour <= 15) return 45;
  if (switchesPerHour <= 20) return 30;
  return Math.max(10, Math.round(30 - (switchesPerHour - 20) * 0.8));
}

// ─── Session Duration Bonus ──────────────────────────────────────────────────
function computeDurationBonus(totalSecs) {
  const mins = totalSecs / 60;
  if (mins >= 90) return 15;
  if (mins >= 60) return 10;
  if (mins >= 45) return 7;
  if (mins >= 25) return 4;
  if (mins >= 15) return 2;
  return 0;
}

// ─── Distraction Penalty ─────────────────────────────────────────────────────
function computeDistractionPenalty(autoSessions, totalSecs) {
  if (!totalSecs) return 0;
  const distractSecs = autoSessions
    .filter(s => categorizeApp(s.app_name) === 'distraction')
    .reduce((a, s) => a + (s.duration_seconds || 0), 0);
  const ratio = distractSecs / totalSecs;
  return Math.min(30, Math.round(ratio * 60));
}

// ─── Sustained Focus Bonus ────────────────────────────────────────────────────
function computeSustainedFocusBonus(autoSessions) {
  // Find longest uninterrupted deep-work streak
  let longestStreak = 0, current = 0;
  for (const s of autoSessions) {
    if (categorizeApp(s.app_name) === 'deep') {
      current += s.duration_seconds || 0;
    } else {
      if (current > longestStreak) longestStreak = current;
      current = 0;
    }
  }
  if (current > longestStreak) longestStreak = current;
  const mins = longestStreak / 60;
  if (mins >= 60) return 10;
  if (mins >= 45) return 7;
  if (mins >= 30) return 5;
  if (mins >= 20) return 3;
  return 0;
}

// ─── Main: Compute Full Focus Quality ────────────────────────────────────────
export function computeFocusQuality(autoSessions = [], manualElapsedSecs = 0) {
  const totalSecs = autoSessions.reduce((a, s) => a + (s.duration_seconds || 0), 0)
    || manualElapsedSecs;

  if (!totalSecs) return defaultQuality();

  const deepWorkScore      = computeDeepWorkScore(autoSessions, totalSecs);
  const contextSwitchScore = computeContextSwitchScore(autoSessions);
  const durationBonus      = computeDurationBonus(totalSecs);
  const distractionPenalty = computeDistractionPenalty(autoSessions, totalSecs);
  const sustainedBonus     = computeSustainedFocusBonus(autoSessions);

  // Weighted composite: deep work matters most, context switching second
  const base = (deepWorkScore * 0.55) + (contextSwitchScore * 0.35) + (20 * 0.10);
  const overall = Math.min(100, Math.max(0,
    Math.round(base + durationBonus + sustainedBonus - distractionPenalty)
  ));

  // Category breakdown for display
  const deepSecs  = autoSessions.filter(s => categorizeApp(s.app_name) === 'deep').reduce((a,s)=>a+(s.duration_seconds||0),0);
  const shallowSecs = autoSessions.filter(s => categorizeApp(s.app_name) === 'shallow').reduce((a,s)=>a+(s.duration_seconds||0),0);
  const distractSecs = autoSessions.filter(s => categorizeApp(s.app_name) === 'distraction').reduce((a,s)=>a+(s.duration_seconds||0),0);
  const neutralSecs = totalSecs - deepSecs - shallowSecs - distractSecs;

  const switchCount = (() => {
    let n = 0;
    for (let i = 1; i < autoSessions.length; i++) {
      if (autoSessions[i].app_name !== autoSessions[i-1].app_name) n++;
    }
    return n;
  })();

  return {
    overall,
    deepWorkScore,
    contextSwitchScore,
    label: qualityLabel(overall),
    color: qualityColor(overall),
    breakdown: {
      deepSecs, shallowSecs, distractSecs, neutralSecs, totalSecs,
      deepPct:     totalSecs > 0 ? Math.round(deepSecs / totalSecs * 100) : 0,
      shallowPct:  totalSecs > 0 ? Math.round(shallowSecs / totalSecs * 100) : 0,
      distractPct: totalSecs > 0 ? Math.round(distractSecs / totalSecs * 100) : 0,
    },
    switchCount,
    switchesPerHour: totalSecs > 0 ? Math.round((switchCount / totalSecs) * 3600) : 0,
  };
}

// ─── Live score during active session (lightweight, no history) ───────────────
export function computeLiveFocusQuality(heartbeat, elapsedSecs, recentAutoSessions = []) {
  if (elapsedSecs < 60) return defaultQuality();
  const appCat = categorizeApp(heartbeat?.appName || '');
  const base = appCat === 'deep' ? 72 : appCat === 'shallow' ? 44 : appCat === 'distraction' ? 15 : 38;
  const durBonus = computeDurationBonus(elapsedSecs);
  const ctxScore = recentAutoSessions.length > 0 ? computeContextSwitchScore(recentAutoSessions) : 75;
  const overall = Math.min(100, Math.round(base * 0.6 + ctxScore * 0.3 + durBonus));
  return {
    overall,
    deepWorkScore: base,
    contextSwitchScore: ctxScore,
    label: qualityLabel(overall),
    color: qualityColor(overall),
    breakdown: null,
    switchCount: 0,
    switchesPerHour: 0,
  };
}

function defaultQuality() {
  return { overall: 0, deepWorkScore: 0, contextSwitchScore: 100, label: 'Starting', color: '#94A3B8', breakdown: null, switchCount: 0, switchesPerHour: 0 };
}

function qualityLabel(score) {
  if (score >= 90) return 'Exceptional';
  if (score >= 80) return 'Deep Flow';
  if (score >= 70) return 'High Focus';
  if (score >= 55) return 'Focused';
  if (score >= 40) return 'Moderate';
  if (score >= 25) return 'Distracted';
  return 'Low Focus';
}

function qualityColor(score) {
  if (score >= 80) return '#6366F1';
  if (score >= 65) return '#34D399';
  if (score >= 45) return '#FBBF24';
  if (score >= 25) return '#F97316';
  return '#EF4444';
}
