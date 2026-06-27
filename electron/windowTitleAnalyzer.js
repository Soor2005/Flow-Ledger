'use strict';

/* ─────────────────────────────────────────────────────────────────────────────
   windowTitleAnalyzer.js — Node/CommonJS port of the window-title cleaning and
   scoring logic from src/ai/engines/eventContextAnalyzer.js (renderer, ESM,
   browser-only — uses localStorage and can't run in the Electron main process).

   Why this exists: the live auto-tracking narrative writer (ai-engine.js
   summarizeSession, called from main.js while a session is being tracked)
   previously only looked at `category_key` + `duration` per activity and
   threw away `window_title` / `app_name` / `url` entirely, even though those
   fields were sitting right there on every row. This module gives it the
   same window-title cleaning/scoring quality the renderer's calendar-event
   writer already has, so ai_recommended_title/description are built from
   what was actually on screen, not a randomly-picked canned phrase.
───────────────────────────────────────────────────────────────────────────── */

// ─── App name suffixes to strip from window titles ───────────────────────────
const WINDOW_TITLE_SUFFIXES = [
  /\s*[—–-]\s*Claude\s*$/i, /\s*[—–-]\s*ChatGPT\s*$/i, /\s*[—–-]\s*Gemini\s*$/i,
  /\s*[—–-]\s*Copilot\s*$/i, /\s*[—–-]\s*Perplexity\s*$/i,
  /\s*[—–-]\s*Visual Studio Code\s*$/i, /\s*[—–-]\s*VS Code\s*$/i, /\s*[—–-]\s*Code\s*$/i,
  /\s*[—–-]\s*Cursor\s*$/i, /\s*[—–-]\s*IntelliJ IDEA\s*$/i, /\s*[—–-]\s*WebStorm\s*$/i,
  /\s*[—–-]\s*PyCharm\s*$/i, /\s*[—–-]\s*Xcode\s*$/i, /\s*[—–-]\s*Rider\s*$/i,
  /\s*[—–-]\s*Google Chrome\s*$/i, /\s*[|·•]\s*GitHub\s*$/i, /\s*[—–-]\s*Safari\s*$/i,
  /\s*[—–-]\s*Firefox\s*$/i, /\s*[—–-]\s*Microsoft Edge\s*$/i, /\s*[—–-]\s*Arc\s*$/i,
  /\s*[—–-]\s*Brave\s*$/i, /\s*[|·•—–-]\s*Notion\s*$/i, /\s*[—–-]\s*Figma\s*$/i,
  /\s*[—–-]\s*Slack\s*$/i, /\s*[—–-]\s*Linear\s*$/i, /\s*[|·]\s*Stack Overflow\s*$/i,
  /\s*[|·]\s*MDN Web Docs\s*$/i, /\s*[|·]\s*npm\s*$/i,
];

const NOISE_TITLE_PATTERN = /^(new tab|localhost|127\.0\.0\.1|about:blank|loading|untitled|\d+\s*(notification|message|unread)|\(\d+\))/i;
const APP_ONLY_PATTERN = /^(claude|chatgpt|vscode|figma|notion|chrome|firefox|slack|discord|zoom|code)$/i;

const HARD_REJECT_PATTERNS = [
  /https?:\/\//, /[A-Z]:\\(Windows|Program Files|Users)/i, /\/(usr|System|bin|etc)\//,
  /\.exe(\s|$)/i, /^\(\d+\)/, /youtube\.com\/watch/i, /mail\.google\.com\/mail/i,
  /\|\s*(youtube|netflix|twitch|spotify)\s*$/i,
];

const SYSTEM_NOTIFICATION_PATTERNS = [
  /your .+ is running/i, /running at \d+\s*%/i, /\d+\s*%\s*[–—-]\s*$/i, /^your /i,
  /\d+\s*%\s*(complete|done|loaded|left|used|free)/i, /\bnotif(ication|y)\b/i, /\bunread\b/i,
  /^\s*[-–—]\s*$/, /update available/i, /\binstalling\b.*\d+\s*%/i,
];

const ENTERTAINMENT_TITLE_RE = [
  /youtube\.com\/watch/i,
  /\|\s*(youtube|netflix|spotify|twitch|disney\+?|prime video|hbo|hulu|peacock)\s*$/i,
  /\bep(isode)?\s*\d+\b/i, /\bseason\s*\d+\b/i,
  /\bforza\b|\bcall of duty\b|\bminecraft\b|\bsteam\b|\blol\b/i,
];

const SYSTEM_PATH_TITLE_RE = [
  /[A-Z]:\\(Windows|Program Files|ProgramData|Users\\[^\\]+\\AppData)/i,
  /\/(usr|System|private|Library|Applications|bin|etc|var|tmp)\//,
  /node_modules\//i, /\.exe(\s|$)/i, /\.dll(\s|$)/i,
];

const EMOJI_RE = /[\u{1F300}-\u{1FFFF}\u{2600}-\u{27BF}]/u;

function isSystemNotificationTitle(phrase) { return SYSTEM_NOTIFICATION_PATTERNS.some(re => re.test(phrase)); }
function isEntertainmentTitle(title) { return ENTERTAINMENT_TITLE_RE.some(re => re.test(title || '')); }
function containsSystemPath(title) { return SYSTEM_PATH_TITLE_RE.some(re => re.test(title || '')); }
function capitalizeWords(str) { return String(str || '').replace(/\b([a-z])/g, c => c.toUpperCase()); }

/** Strip app-name suffixes and noise from a window title. */
function cleanWindowTitle(title, appName) {
  if (!title) return '';
  let clean = String(title).trim();
  if (containsSystemPath(clean)) return '';
  if (isEntertainmentTitle(clean)) return '';

  clean = clean.replace(/^\(\d+\)\s*/, '');
  clean = clean
    .replace(/\s*[—–\-]\s*https?:\/\/[^\s]+/g, '')
    .replace(/\s*https?:\/\/[^\s]+/g, '')
    .trim();

  const PLATFORM_SUFFIX_RE = /\s*\|\s*(Sony LIV|Netflix|Prime Video|Hotstar|Zee5|SonyLIV|Disney|Spotify|YouTube Music|Apple TV)\s*$/i;
  clean = clean.replace(PLATFORM_SUFFIX_RE, '').trim();

  for (const pattern of WINDOW_TITLE_SUFFIXES) clean = clean.replace(pattern, '');

  if (appName) {
    const escaped = appName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    clean = clean.replace(new RegExp(`\\s*[—–\\-]\\s*${escaped}\\s*$`, 'i'), '');
  }

  clean = clean
    .replace(/\s*-\s*Google Search\s*$/i, '')
    .replace(/\s*[|·]\s*Google\s*$/i, '')
    .replace(/\s*-\s*Bing\s*$/i, '')
    .replace(/\s*[-–—]\s*(Stack Overflow|Server Fault|Super User|Stack Exchange)\s*$/i, '')
    .replace(/^\d+\s*(unread\s*)?(notification|message|result|item)s?\s*[|·-]\s*/i, '')
    .replace(/^(New Tab|about:blank)\s*$/i, '')
    .trim();

  if (/https?:\/\//.test(clean)) return '';
  if (containsSystemPath(clean)) return '';
  return clean;
}

/** Parse an IDE-style window title: "file.ext — project — Editor" → { file, project }. */
function parseIDETitle(title) {
  const parts = String(title || '').split(/\s*[—–-]\s*/).map(p => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const fileName = parts[0];
  // Guard: only treat this as an IDE title when the first segment actually
  // looks like a filename ("foo.js", "bar.tsx") — otherwise generic browser
  // tab titles like "How to debounce... - Stack Overflow" get misread as
  // "file — project" and the title comes out inverted/nonsensical.
  if (!/\.[a-zA-Z0-9]{1,6}$/.test(fileName) || fileName.split(/\s+/).length > 6) return null;
  const readable = fileName
    .replace(/\.[a-z]{1,5}$/, '')
    .replace(/[_-]/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim();
  return { file: capitalizeWords(readable), project: parts[1] || null };
}

/** Score a cleaned window title for meaningfulness — higher = more specific. */
function scoreTitlePhrase(phrase) {
  if (!phrase || phrase.length < 4) return 0;
  if (isSystemNotificationTitle(phrase)) return 0;
  if (HARD_REJECT_PATTERNS.some(re => re.test(phrase))) return 0;
  if (containsSystemPath(phrase)) return 0;
  if (isEntertainmentTitle(phrase)) return 0;

  const lower = phrase.toLowerCase();
  const words = phrase.split(/\s+/).filter(Boolean);
  let score = 0;

  score += Math.min(words.length, 8) * 8;
  if (phrase.length > 20) score += 15;
  if (phrase.length > 35) score += 10;

  const ACTION_VERBS = ['building', 'implementing', 'designing', 'creating', 'developing',
    'fixing', 'debugging', 'testing', 'writing', 'researching', 'refactoring',
    'reviewing', 'planning', 'deploying', 'migrating', 'integrating', 'architecting',
    'improving', 'adding', 'updating', 'configuring', 'setting', 'working'];
  if (ACTION_VERBS.some(v => lower.startsWith(v + ' '))) score += 35;

  const TECH_TERMS = ['engine', 'api', 'component', 'module', 'system', 'service',
    'logic', 'feature', 'dashboard', 'pipeline', 'algorithm', 'schema',
    'interface', 'integration', 'architecture', 'flow', 'session', 'calendar',
    'hook', 'store', 'context', 'provider', 'handler', 'controller', 'manager',
    'view', 'panel', 'modal', 'sidebar', 'page', 'layout', 'chart', 'widget'];
  score += TECH_TERMS.filter(t => lower.includes(t)).length * 10;

  const titleCaseWords = words.filter(w => /^[A-Z][a-z]/.test(w));
  if (titleCaseWords.length >= 2) score += 20;
  if (titleCaseWords.length >= 3) score += 15;

  if (/\s[—–]\s*(claude|chatgpt|gemini|copilot|perplexity|gpt)/i.test(phrase)) score += 45;
  if (/\.[a-z]{2,5}/.test(phrase) && words.length >= 2) score += 20;
  if (/^(how to|why does|fix|debug|implement|what is|difference between)/i.test(phrase)) score += 25;

  if (EMOJI_RE.test(phrase)) score -= 40;
  if (/\s[–—-]\s*$/.test(phrase)) score -= 25;
  if (/\b\d+\s*%/.test(phrase)) score -= 50;
  if (APP_ONLY_PATTERN.test(phrase)) score -= 60;
  if (NOISE_TITLE_PATTERN.test(phrase)) score -= 80;
  if (/https?:\/\//.test(phrase)) score -= 30;
  if (/^\/[a-z]/.test(phrase)) score -= 20;

  return score;
}

const TIME_WEIGHT_CAP_MINS = 120;

/**
 * Aggregate window titles across a set of activity rows into ranked, deduped
 * phrases — same time-weighted ranking as the renderer's calendar-event
 * writer, so a 90-minute IDE session always outranks a 3-minute distraction
 * tab regardless of how many times each was logged.
 *
 * @param {{window_title?:string, app_name?:string, duration_seconds?:number, duration?:number}[]} activities
 */
function summarizeWindowTitles(activities = []) {
  const phraseData = {};

  for (const a of activities) {
    if (!a || !a.window_title) continue;
    const dur = a.duration_seconds || a.duration || 0;
    if (dur < 5) continue;

    const cleaned = cleanWindowTitle(a.window_title, a.app_name || '');
    if (!cleaned || cleaned.length < 4) continue;
    if (NOISE_TITLE_PATTERN.test(cleaned)) continue;
    if (isSystemNotificationTitle(cleaned)) continue;
    if (HARD_REJECT_PATTERNS.some(re => re.test(cleaned))) continue;
    if (containsSystemPath(cleaned)) continue;

    if (!phraseData[cleaned]) phraseData[cleaned] = { durationSecs: 0, appName: a.app_name || '' };
    phraseData[cleaned].durationSecs += dur;
  }

  const ranked = Object.entries(phraseData)
    .map(([phrase, data]) => {
      const qualityScore = scoreTitlePhrase(phrase);
      const timeMins = Math.min(data.durationSecs / 60, TIME_WEIGHT_CAP_MINS);
      const linearWeight = timeMins + 1;
      return { phrase, durationSecs: data.durationSecs, appName: data.appName, score: qualityScore, combined: qualityScore * linearWeight };
    })
    .filter(p => p.score > 0)
    .sort((a, b) => b.combined - a.combined)
    .slice(0, 8);

  const distinctApps = [...new Set(activities.map(a => a?.app_name).filter(Boolean))];

  return {
    bestPhrase: ranked[0]?.phrase || null,
    bestPhraseScore: ranked[0]?.score || 0,
    bestAppName: ranked[0]?.appName || distinctApps[0] || null,
    distinctPhrases: ranked,
    distinctApps,
  };
}

// ─── Title history (recovers titles lost when a merged session overwrites
//      window_title on every extend — see main.js auto_sessions UPDATE path) ──

function parseTitleHistory(json) {
  try {
    const arr = JSON.parse(json || '[]');
    return Array.isArray(arr) ? arr.filter(t => typeof t === 'string' && t) : [];
  } catch { return []; }
}

/** Append a title to the history, deduped (case-insensitive) and capped at `max`. */
function pushTitleHistory(json, newTitle, max = 10) {
  const history = parseTitleHistory(json);
  if (!newTitle) return JSON.stringify(history);
  const exists = history.some(t => t.toLowerCase() === newTitle.toLowerCase());
  const next = exists ? history : [...history, newTitle].slice(-max);
  return JSON.stringify(next);
}

/**
 * Turn a cleaned window-title phrase into a short, human title fragment.
 * IDE titles ("file.js — Project — Editor", already stripped of " — Editor"
 * by cleanWindowTitle) still carry "file — Project" — splitting it out avoids
 * stacking the project name twice when the caller also prepends its own
 * project/client context.
 */
function humanizePhrase(phrase) {
  const ide = parseIDETitle(phrase);
  if (ide?.file && ide.file.length > 2) return { text: ide.file, project: ide.project || null };
  return { text: capitalizeWords(phrase), project: null };
}

module.exports = {
  humanizePhrase,
  cleanWindowTitle, parseIDETitle, scoreTitlePhrase, summarizeWindowTitles,
  parseTitleHistory, pushTitleHistory, capitalizeWords,
};
