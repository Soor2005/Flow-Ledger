/**
 * Event Context Analyzer — v2
 * Extracts structured, high-fidelity work context from auto-session data.
 * Core improvement: window titles are parsed as PHRASES not individual words,
 * preserving the semantic meaning of what was actually worked on.
 */

import { isGenericSubject } from './genericKeywordFilter.js';

// ─── App → Work Category Map ──────────────────────────────────────────────────

const APP_CATEGORIES = {
  // Development / Engineering
  vscode: 'development',       'visual studio code': 'development',
  cursor: 'development',       webstorm: 'development',
  intellij: 'development',     'android studio': 'development',
  xcode: 'development',        rider: 'development',
  sublime: 'development',      atom: 'development',
  vim: 'development',          nvim: 'development',
  neovim: 'development',       emacs: 'development',
  'github desktop': 'development',
  tower: 'development',        sourcetree: 'development',
  gitkraken: 'development',    postman: 'development',
  insomnia: 'development',     'docker desktop': 'development',
  terminal: 'development',     iterm: 'development',
  'windows terminal': 'development', hyper: 'development',
  warp: 'development',         'git bash': 'development',
  tableplus: 'development',    dbeaver: 'development',
  sequel: 'development',

  // AI Tools (development-adjacent)
  claude: 'development',       chatgpt: 'development',
  'claude.ai': 'development',  gemini: 'development',
  copilot: 'development',      perplexity: 'research',

  // Design
  figma: 'design',             sketch: 'design',
  'adobe xd': 'design',       photoshop: 'design',
  illustrator: 'design',       'adobe illustrator': 'design',
  'adobe photoshop': 'design', affinity: 'design',
  canva: 'design',             framer: 'design',
  'adobe premiere': 'video',   'final cut': 'video',

  // Writing & Documentation
  notion: 'writing',           obsidian: 'writing',
  word: 'writing',             'microsoft word': 'writing',
  'google docs': 'writing',    pages: 'writing',
  'ia writer': 'writing',      bear: 'writing',
  scrivener: 'writing',        ulysses: 'writing',

  // Communication / Meetings
  zoom: 'meeting',             'microsoft teams': 'meeting',
  teams: 'meeting',            webex: 'meeting',
  whereby: 'meeting',          skype: 'meeting',
  discord: 'communication',    slack: 'communication',
  telegram: 'communication',   whatsapp: 'communication',
  gmail: 'email',              outlook: 'email',
  'microsoft outlook': 'email', spark: 'email',
  airmail: 'email',            thunderbird: 'email',

  // Planning / Project Management
  linear: 'planning',          jira: 'planning',
  asana: 'planning',           trello: 'planning',
  'monday.com': 'planning',    basecamp: 'planning',
  clickup: 'planning',         height: 'planning',
  shortcut: 'planning',

  // Data / Analytics
  excel: 'data',               'microsoft excel': 'data',
  'google sheets': 'data',     numbers: 'data',
  tableau: 'data',             'power bi': 'data',
  airtable: 'data',            retool: 'data',

  // Browsers (context refined by URL/window title)
  chrome: 'research',          'google chrome': 'research',
  safari: 'research',          firefox: 'research',
  edge: 'research',            brave: 'research',
  arc: 'research',             opera: 'research',

  // Learning
  udemy: 'learning',           coursera: 'learning',

  // Admin
  '1password': 'admin',        loom: 'communication',
};

// ─── URL Domain → Topic Map ───────────────────────────────────────────────────

const DOMAIN_TOPICS = {
  'github.com':              { topic: 'GitHub', category: 'development' },
  'docs.github.com':         { topic: 'GitHub Docs', category: 'research' },
  'stackoverflow.com':       { topic: 'Stack Overflow', category: 'research' },
  'developer.mozilla.org':   { topic: 'MDN Web Docs', category: 'research' },
  'npmjs.com':               { topic: 'npm', category: 'development' },
  'vercel.com':              { topic: 'Vercel', category: 'development' },
  'netlify.com':             { topic: 'Netlify', category: 'development' },
  'railway.app':             { topic: 'Railway', category: 'development' },
  'supabase.com':            { topic: 'Supabase', category: 'development' },
  'firebase.google.com':     { topic: 'Firebase', category: 'development' },
  'aws.amazon.com':          { topic: 'AWS', category: 'development' },
  'console.aws.amazon.com':  { topic: 'AWS Console', category: 'development' },
  'cloud.google.com':        { topic: 'Google Cloud', category: 'development' },
  'api.openai.com':          { topic: 'OpenAI API', category: 'development' },
  'platform.openai.com':     { topic: 'OpenAI Platform', category: 'development' },
  'anthropic.com':           { topic: 'Anthropic', category: 'development' },
  'claude.ai':               { topic: 'Claude AI', category: 'development' },
  'chat.openai.com':         { topic: 'ChatGPT', category: 'development' },
  'figma.com':               { topic: 'Figma', category: 'design' },
  'linear.app':              { topic: 'Linear', category: 'planning' },
  'notion.so':               { topic: 'Notion', category: 'writing' },
  'medium.com':              { topic: 'Medium', category: 'research' },
  'dev.to':                  { topic: 'dev.to', category: 'research' },
  'youtube.com':             { topic: 'YouTube', category: 'learning' },
  'docs.anthropic.com':      { topic: 'Anthropic Docs', category: 'research' },
  'huggingface.co':          { topic: 'Hugging Face', category: 'research' },
  'dribbble.com':            { topic: 'Dribbble', category: 'design' },
  'behance.net':             { topic: 'Behance', category: 'design' },
  'fonts.google.com':        { topic: 'Google Fonts', category: 'design' },
  'mail.google.com':         { topic: 'Gmail', category: 'email' },
  'calendar.google.com':     { topic: 'Google Calendar', category: 'planning' },
};

// ─── Work Subtypes (for rich verb selection) ──────────────────────────────────

const WORK_SUBTYPES = {
  debugging:     ['debug', 'fix', 'bug', 'error', 'issue', 'crash', 'exception', 'traceback', 'broken', 'resolve', 'patch'],
  testing:       ['test', 'spec', 'jest', 'vitest', 'cypress', 'playwright', 'unit test', 'e2e', 'qa', 'verify'],
  refactoring:   ['refactor', 'clean', 'restructure', 'reorganize', 'cleanup', 'simplify', 'rewrite', 'improve', 'optimize'],
  implementing:  ['implement', 'build', 'create', 'develop', 'ship', 'coding', 'scaffold', 'compose'],
  designing:     ['design', 'wireframe', 'mockup', 'prototype', 'layout', 'ui', 'ux', 'figma', 'sketch'],
  researching:   ['research', 'explore', 'learn', 'study', 'docs', 'documentation', 'how to', 'investigate', 'analyze'],
  reviewing:     ['review', 'code review', 'audit', 'evaluate', 'assess', 'inspect', 'pull request', 'pr'],
  deploying:     ['deploy', 'release', 'ship', 'publish', 'production', 'staging', 'ci', 'cd', 'pipeline'],
  planning:      ['plan', 'roadmap', 'sprint', 'backlog', 'prioritize', 'scope', 'estimate', 'strategy'],
  documenting:   ['docs', 'documentation', 'readme', 'wiki', 'write', 'draft', 'spec', 'proposal'],
  integrating:   ['integrat', 'connect', 'sync', 'api', 'webhook', 'plugin', 'extension', 'setup'],
  architecting:  ['architect', 'architecture', 'structure', 'system design', 'schema', 'database design'],
  configuring:   ['config', 'setup', 'configure', 'settings', 'env', 'environment', 'init', 'install'],
  migrating:     ['migrat', 'upgrade', 'update', 'port', 'convert', 'move', 'transfer'],
};

// ─── Action Verb Dictionary ───────────────────────────────────────────────────

const CATEGORY_VERBS = {
  // Development: intentionally varied — cover building, iterating, shipping, and
  // improving so that consecutive general-development events don't all start with
  // the same verb. Subtype-specific verbs (debugging, testing, etc.) are handled
  // by SUBTYPE_VERBS in eventWritingEngine before this fallback is reached.
  development:  ['Building', 'Extending', 'Iterating on', 'Advancing', 'Shipping', 'Improving'],
  design:       ['Designing', 'Creating', 'Crafting', 'Wireframing', 'Prototyping', 'Refining'],
  writing:      ['Writing', 'Drafting', 'Documenting', 'Authoring', 'Composing', 'Editing'],
  research:     ['Researching', 'Analyzing', 'Exploring', 'Investigating', 'Studying', 'Reviewing'],
  meeting:      ['Meeting', 'Discussing', 'Presenting', 'Collaborating', 'Reviewing', 'Aligning'],
  planning:     ['Planning', 'Scoping', 'Organizing', 'Strategizing', 'Mapping', 'Prioritizing'],
  email:        ['Managing', 'Reviewing', 'Responding to', 'Processing'],
  communication:['Collaborating', 'Coordinating', 'Discussing', 'Syncing'],
  learning:     ['Learning', 'Studying', 'Exploring', 'Training'],
  data:         ['Analyzing', 'Processing', 'Building', 'Reporting'],
  video:        ['Editing', 'Producing', 'Recording'],
  admin:        ['Managing', 'Processing', 'Organizing'],
};

// ─── App Name Suffixes to Strip From Window Titles ───────────────────────────

const WINDOW_TITLE_SUFFIXES = [
  // AI Tools
  /\s*[—–-]\s*Claude\s*$/i,
  /\s*[—–-]\s*ChatGPT\s*$/i,
  /\s*[—–-]\s*Gemini\s*$/i,
  /\s*[—–-]\s*Copilot\s*$/i,
  /\s*[—–-]\s*Perplexity\s*$/i,
  // Code Editors
  /\s*[—–-]\s*Visual Studio Code\s*$/i,
  /\s*[—–-]\s*VS Code\s*$/i,
  /\s*[—–-]\s*Code\s*$/i,
  /\s*[—–-]\s*Cursor\s*$/i,
  /\s*[—–-]\s*IntelliJ IDEA\s*$/i,
  /\s*[—–-]\s*WebStorm\s*$/i,
  /\s*[—–-]\s*PyCharm\s*$/i,
  /\s*[—–-]\s*Xcode\s*$/i,
  /\s*[—–-]\s*Rider\s*$/i,
  // Browsers / Productivity
  /\s*[—–-]\s*Google Chrome\s*$/i,
  /\s*[|·•]\s*GitHub\s*$/i,
  /\s*[—–-]\s*Safari\s*$/i,
  /\s*[—–-]\s*Firefox\s*$/i,
  /\s*[—–-]\s*Microsoft Edge\s*$/i,
  /\s*[—–-]\s*Arc\s*$/i,
  /\s*[—–-]\s*Brave\s*$/i,
  /\s*[|·•—–-]\s*Notion\s*$/i,
  /\s*[—–-]\s*Figma\s*$/i,
  /\s*[—–-]\s*Slack\s*$/i,
  /\s*[—–-]\s*Linear\s*$/i,
  /\s*[|·]\s*Stack Overflow\s*$/i,
  /\s*[|·]\s*MDN Web Docs\s*$/i,
  /\s*[|·]\s*npm\s*$/i,
];

// ─── Generic / Noise Window Title Patterns ────────────────────────────────────

const NOISE_TITLE_PATTERN = /^(new tab|localhost|127\.0\.0\.1|about:blank|loading|untitled|\d+\s*(notification|message|unread)|\(\d+\))/i;
const APP_ONLY_PATTERN = /^(claude|chatgpt|vscode|figma|notion|chrome|firefox|slack|discord|zoom|code)$/i;

// Patterns that unconditionally disqualify a title phrase from being used
const HARD_REJECT_PATTERNS = [
  /https?:\/{0,2}/i,                           // raw or malformed/truncated URLs (e.g. "https:/")
  /[A-Z]:\\(Windows|Program Files|Users)/i,  // Windows system paths
  /\/(usr|System|bin|etc)\//,                 // Unix system paths
  /\.exe(\s|$)/i,                             // executables
  /^\(\d+\)/,                                 // notification badges
  /youtube\.com\/watch/i,                     // YouTube video URLs
  /mail\.google\.com\/mail/i,                 // Gmail raw URLs
  /\|\s*(youtube|netflix|twitch|spotify)\s*$/i, // entertainment platforms
];

// System/notification-style title patterns — should never appear in generated titles
const SYSTEM_NOTIFICATION_PATTERNS = [
  /your .+ is running/i,          // "Your Claude is Running at 30%"
  /running at \d+\s*%/i,          // "Running at 30%"
  /\d+\s*%\s*[–—-]\s*$/i,        // ends with "30% –"
  /^your /i,                       // starts with "Your " (system ownership language)
  /\d+\s*%\s*(complete|done|loaded|left|used|free)/i,
  /\bnotif(ication|y)\b/i,
  /\bunread\b/i,
  /^\s*[-–—]\s*$/,                 // just a dash
  /update available/i,
  /\binstalling\b.*\d+\s*%/i,
];

function isSystemNotificationTitle(phrase) {
  return SYSTEM_NOTIFICATION_PATTERNS.some(re => re.test(phrase));
}

// Detects emoji characters (often used in system notifications / app badges)
const EMOJI_RE = /[\u{1F300}-\u{1FFFF}\u{2600}-\u{27BF}]/u;

// ─── Helper Functions ─────────────────────────────────────────────────────────

export function normalize(str = '') {
  return String(str).toLowerCase().trim();
}

export function capitalizeFirst(str = '') {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function capitalizeWords(str = '') {
  return str.replace(/\b([a-z])/g, c => c.toUpperCase());
}

function toTimestamp(val) {
  if (!val) return 0;
  if (typeof val === 'number') return val > 1e10 ? val / 1000 : val;
  const d = new Date(val);
  return isNaN(d) ? 0 : d.getTime() / 1000;
}

function durationSeconds(session) {
  if (session.duration_seconds > 0) return session.duration_seconds;
  const s = toTimestamp(session.started_at);
  const e = toTimestamp(session.ended_at);
  return e > s ? e - s : 0;
}

function timeOfDay(unixSec) {
  const h = new Date(unixSec * 1000).getHours();
  if (h >= 5  && h < 12) return 'morning';
  if (h >= 12 && h < 17) return 'afternoon';
  if (h >= 17 && h < 21) return 'evening';
  return 'night';
}

export function extractDomain(url = '') {
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return url.replace(/^https?:\/\//i, '').split('/')[0].replace(/^www\./, '');
  }
}

// ─── Window Title Cleaning ────────────────────────────────────────────────────

// ─── Entertainment / Non-work Domain Detector ────────────────────────────────

const ENTERTAINMENT_TITLE_RE = [
  /youtube\.com\/watch/i,
  /\|\s*(youtube|netflix|spotify|twitch|disney\+?|prime video|hbo|hulu|peacock)\s*$/i,
  /\bep(isode)?\s*\d+\b/i,                // "Ep 1", "Episode 4"
  /\bseason\s*\d+\b/i,                     // "Season 2"
  /\bforza\b|\bcall of duty\b|\bminecraft\b|\bsteam\b|\blol\b/i,  // gaming
  /scam \d{4}|the harshad mehta/i,         // entertainment show names (specific)
];

function isEntertainmentTitle(title = '') {
  return ENTERTAINMENT_TITLE_RE.some(re => re.test(title));
}

// ─── System / Executable Path Detector ───────────────────────────────────────

const SYSTEM_PATH_TITLE_RE = [
  /[A-Z]:\\(Windows|Program Files|ProgramData|Users\\[^\\]+\\AppData)/i,
  /\/(usr|System|private|Library|Applications|bin|etc|var|tmp)\//,
  /node_modules\//i,
  /\.exe(\s|$)/i,
  /\.dll(\s|$)/i,
];

function containsSystemPath(title = '') {
  return SYSTEM_PATH_TITLE_RE.some(re => re.test(title));
}

/**
 * Strip app name suffixes and noise from a window title, leaving the
 * meaningful work description behind.
 */
export function cleanWindowTitle(title = '', appName = '') {
  if (!title) return '';
  let clean = title.trim();

  // ── Hard reject: system paths, executables, entertainment ────────────────
  if (containsSystemPath(clean)) return '';
  if (isEntertainmentTitle(clean)) return '';

  // ── Strip notification badge prefix: "(64) Title" → "Title" ─────────────
  clean = clean.replace(/^\(\d+\)\s*/, '');

  // ── Strip raw URL suffixes: "Title - https://..." → "Title" ──────────────
  // {0,2} on the slash catches malformed/truncated URLs too (e.g. "https:/"
  // with one slash), which a strict "https://" match misses entirely and lets
  // through verbatim into generated titles.
  clean = clean
    .replace(/\s*[—–\-]\s*https?:\/{0,2}\S*/g, '')   // "Title - https://url" or "Title - https:/"
    .replace(/\s*https?:\/{0,2}\S*/g, '')              // bare url fragment anywhere
    .trim();

  // ── Strip pipe-separated video-style suffixes: "Title | Sony LIV" ─────────
  // Only strip if it looks like an entertainment platform suffix
  const PLATFORM_SUFFIX_RE = /\s*\|\s*(Sony LIV|Netflix|Prime Video|Hotstar|Zee5|SonyLIV|Disney|Spotify|YouTube Music|Apple TV)\s*$/i;
  clean = clean.replace(PLATFORM_SUFFIX_RE, '').trim();

  // Remove all known app suffixes
  for (const pattern of WINDOW_TITLE_SUFFIXES) {
    clean = clean.replace(pattern, '');
  }

  // Remove the specific app name if it appears at the end
  if (appName) {
    const escaped = appName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    clean = clean.replace(new RegExp(`\\s*[—–\\-]\\s*${escaped}\\s*$`, 'i'), '');
  }

  // Remove "Search · Google" or "X results - Google Search"
  clean = clean
    .replace(/\s*-\s*Google Search\s*$/i, '')
    .replace(/\s*[|·]\s*Google\s*$/i, '')
    .replace(/\s*-\s*Bing\s*$/i, '')
    .replace(/^\d+\s*(unread\s*)?(notification|message|result|item)s?\s*[|·-]\s*/i, '')
    .replace(/^(New Tab|about:blank)\s*$/i, '')
    .trim();

  // Final: reject if still contains a raw or malformed URL fragment, or system path
  if (/https?:\/{0,2}/i.test(clean)) return '';
  if (containsSystemPath(clean)) return '';

  return clean;
}

/**
 * Extract meaningful phrase from a VS Code window title.
 * "eventWritingEngine.js — Flow Ledger — VS Code" → { file: "Event Writing Engine", project: "Flow Ledger" }
 */
function parseIDETitle(title) {
  // VS Code pattern: "file.ext — folder/project — editor"
  const parts = title.split(/\s*[—–-]\s*/).map(p => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;

  const fileName = parts[0];
  // Convert file name to readable name
  const readable = fileName
    .replace(/\.[a-z]{1,5}$/, '')        // remove extension
    .replace(/[_\-]/g, ' ')              // underscores/dashes to spaces
    .replace(/([a-z])([A-Z])/g, '$1 $2') // camelCase to spaces
    .trim();

  return {
    file: capitalizeWords(readable),
    project: parts[1] || null,
  };
}

// ─── Window Title Phrase Scoring ──────────────────────────────────────────────

/**
 * Score a cleaned window title for meaningfulness.
 * Higher = more specific and informative.
 */
function scoreTitlePhrase(phrase) {
  if (!phrase || phrase.length < 4) return 0;

  // Hard reject: system notifications, URLs, executables, entertainment
  if (isSystemNotificationTitle(phrase)) return 0;
  if (HARD_REJECT_PATTERNS.some(re => re.test(phrase))) return 0;
  if (containsSystemPath(phrase)) return 0;
  if (isEntertainmentTitle(phrase)) return 0;

  const lower = phrase.toLowerCase();
  const words = phrase.split(/\s+/).filter(Boolean);
  let score = 0;

  // Length bonus — more words = more specific (up to 8 words)
  score += Math.min(words.length, 8) * 8;

  // Long meaningful phrase (> 20 chars) is good
  if (phrase.length > 20) score += 15;
  if (phrase.length > 35) score += 10;

  // Starts with an action verb → title already tells us the work
  const ACTION_VERBS = ['building', 'implementing', 'designing', 'creating', 'developing',
    'fixing', 'debugging', 'testing', 'writing', 'researching', 'refactoring',
    'reviewing', 'planning', 'deploying', 'migrating', 'integrating', 'architecting',
    'improving', 'adding', 'updating', 'configuring', 'setting', 'working'];
  if (ACTION_VERBS.some(v => lower.startsWith(v + ' '))) score += 35;

  // Contains technical/domain-specific terms → high value
  const TECH_TERMS = ['engine', 'api', 'component', 'module', 'system', 'service',
    'logic', 'feature', 'dashboard', 'pipeline', 'algorithm', 'schema',
    'interface', 'integration', 'architecture', 'flow', 'session', 'calendar',
    'hook', 'store', 'context', 'provider', 'handler', 'controller', 'manager',
    'view', 'panel', 'modal', 'sidebar', 'page', 'layout', 'chart', 'widget'];
  score += TECH_TERMS.filter(t => lower.includes(t)).length * 10;

  // Proper-noun / feature-name pattern: multiple words with Title Case
  // e.g. "Burnout Risk Engine", "Calendar View", "AI Intelligence Panel"
  const titleCaseWords = words.filter(w => /^[A-Z][a-z]/.test(w));
  if (titleCaseWords.length >= 2) score += 20;
  if (titleCaseWords.length >= 3) score += 15; // stacked bonus for long feature names

  // AI conversation topic — Claude/ChatGPT window titles are highly valuable
  // Pattern: "Fix burnout calculation — Claude" or "How to debounce — ChatGPT"
  if (/\s[—–]\s*(claude|chatgpt|gemini|copilot|perplexity|gpt)/i.test(phrase)) score += 45;

  // IDE file pattern → very specific
  if (/\.[a-z]{2,5}/.test(phrase) && words.length >= 2) score += 20;

  // Question/task patterns from browser tabs → descriptive
  if (/^(how to|why does|fix|debug|implement|what is|difference between)/i.test(phrase)) score += 25;

  // Penalize: contains emoji (system tray / notification badges, not meaningful work titles)
  if (EMOJI_RE.test(phrase)) score -= 40;

  // Penalize: ends with " –" or " —" (truncated browser tab / notification)
  if (/\s[–—-]\s*$/.test(phrase)) score -= 25;

  // Penalize: contains a bare percentage (status indicator, not work description)
  if (/\b\d+\s*%/.test(phrase)) score -= 50;

  // Penalize: just an app name
  if (APP_ONLY_PATTERN.test(phrase)) score -= 60;

  // Penalize: noise patterns
  if (NOISE_TITLE_PATTERN.test(phrase)) score -= 80;

  // Penalize: URL-like content (including malformed/truncated fragments)
  if (/https?:\/{0,2}/i.test(phrase)) score -= 30;

  // Penalize: looks like a file path
  if (/^\/[a-z]/.test(phrase)) score -= 20;

  return score;
}

// ─── Window Title Phrase Extraction ──────────────────────────────────────────

/**
 * Extract ranked, cleaned window title phrases from auto-sessions.
 * Returns top phrases weighted by time spent × specificity score.
 */
export function extractWindowTitlePhrases(autoSessions = []) {
  const phraseData = {}; // phrase → { durationSecs, rawTitles }

  for (const s of autoSessions) {
    if (s.is_idle || !s.window_title) continue;
    const dur = durationSeconds(s);
    if (dur < 5) continue;

    const cleaned = cleanWindowTitle(s.window_title, s.app_name || '');
    // cleanWindowTitle returns '' for system paths, entertainment, and raw URLs
    if (!cleaned || cleaned.length < 4) continue;
    if (NOISE_TITLE_PATTERN.test(cleaned)) continue;
    if (isSystemNotificationTitle(cleaned)) continue;
    // Belt-and-suspenders: hard reject any remaining URL or system path
    if (HARD_REJECT_PATTERNS.some(re => re.test(cleaned))) continue;
    if (containsSystemPath(cleaned)) continue;

    if (!phraseData[cleaned]) {
      phraseData[cleaned] = { durationSecs: 0, appName: s.app_name || '' };
    }
    phraseData[cleaned].durationSecs += dur;
  }

  // ── Time-weighted phrase ranking ──────────────────────────────────────────
  // IMPORTANT: use linear time weighting (capped at 120 min) instead of log().
  //
  // The previous log(duration) formula compressed the time advantage too severely:
  //   - 3-min YouTube tab:         log(181) ≈ 5.2   × score
  //   - 90-min Flow Ledger work:   log(5401) ≈ 8.6  × score  → only 1.65× advantage
  //
  // With linear weighting (minutes, capped at 120):
  //   - 3-min YouTube tab:         3  + 1 =  4  × score
  //   - 90-min Flow Ledger work:  90  + 1 = 91  × score  → 22.75× advantage
  //
  // This matches intuition: 90 minutes of real work should massively outrank
  // 3 minutes of a distraction, not just 1.65×.
  //
  // The cap at 120 min prevents pathological bias toward marathon single-topic sessions
  // (e.g., a 6-hour deep dive should not have 1000× weight over a 15-min task).
  const TIME_WEIGHT_CAP_MINS = 120;

  return Object.entries(phraseData)
    .map(([phrase, data]) => {
      const qualityScore   = scoreTitlePhrase(phrase);
      const timeMins       = Math.min(data.durationSecs / 60, TIME_WEIGHT_CAP_MINS);
      const linearWeight   = timeMins + 1; // +1 avoids zero-weight for ultra-short phrases
      return {
        phrase,
        durationSecs: data.durationSecs,
        appName: data.appName,
        score:    qualityScore,
        combined: qualityScore * linearWeight,
      };
    })
    .filter(p => p.score > 0) // exclude phrases that scored zero (notifications etc.)
    .sort((a, b) => b.combined - a.combined)
    .slice(0, 8);
}

// ─── Work Subtype Detection ───────────────────────────────────────────────────

/**
 * Detect the specific type of work being done from title phrases and keywords.
 * Returns one of the WORK_SUBTYPES keys, or null.
 */
export function detectWorkSubtype(titlePhrases = [], keywords = [], appNames = []) {
  // Build duration-weighted text — longer sessions get more signal weight.
  // A phrase with 60 min behind it matters far more than a 2-min transient phrase.
  const scores = {};

  // Score from title phrases, weighted by duration (log-scaled)
  for (const p of titlePhrases) {
    const text = p.phrase.toLowerCase();
    const weight = Math.log((p.durationSecs || 60) + 1); // log prevents huge outliers
    for (const [subtype, signals] of Object.entries(WORK_SUBTYPES)) {
      const hits = signals.filter(s => text.includes(s)).length;
      if (hits > 0) {
        scores[subtype] = (scores[subtype] || 0) + hits * weight;
      }
    }
  }

  // Score from fallback keywords (unweighted — these are lower quality signals)
  const kwText = [...keywords, ...appNames].join(' ').toLowerCase();
  for (const [subtype, signals] of Object.entries(WORK_SUBTYPES)) {
    const hits = signals.filter(s => kwText.includes(s)).length;
    if (hits > 0) {
      scores[subtype] = (scores[subtype] || 0) + hits * 0.5; // half weight for keywords
    }
  }

  const best = Object.entries(scores)
    .sort(([, a], [, b]) => b - a)
    .find(([, v]) => v > 0);

  return best?.[0] || null;
}

// ─── App Analysis ─────────────────────────────────────────────────────────────

// ─── App Name Normalization (legacy path) ─────────────────────────────────────
// Mirrors telemetrySanitizer.normalizeAppName for the legacy analyzeContext path.

const LEGACY_APP_NORMALIZE = {
  'windowsterminal': 'Terminal', 'windows terminal': 'Terminal',
  'iterm': 'Terminal', 'iterm2': 'Terminal', 'warp': 'Terminal', 'hyper': 'Terminal',
  'powershell': 'Terminal', 'powershell.exe': 'Terminal', 'bash': 'Terminal', 'zsh': 'Terminal',
  'cmd': null, 'cmd.exe': null, 'conhost': null, 'conhost.exe': null,
  'explorer.exe': null, 'explorer': null, 'taskmgr': null, 'taskmgr.exe': null,
  'svchost': null, 'svchost.exe': null, 'dwm': null, 'dwm.exe': null,
  'msiexec': null, 'setup': null, 'installer': null,
  'code': 'VS Code', 'visual studio code': 'VS Code',
  'google chrome': 'Chrome', 'microsoft edge': 'Edge', 'arc browser': 'Arc',
};

const SYSTEM_APP_SUPPRESS_RE = /^(conhost|svchost|dwm|lsass|csrss|wininit|smss|services|RuntimeBroker|ShellExperienceHost|SearchHost|werfault|crashpad|crash_reporter)(\.exe)?$/i;

function legacyNormalizeApp(raw = '') {
  const key = raw.toLowerCase().trim();
  if (key in LEGACY_APP_NORMALIZE) return LEGACY_APP_NORMALIZE[key];
  const stripped = key.replace(/\.exe$/, '');
  if (stripped in LEGACY_APP_NORMALIZE) return LEGACY_APP_NORMALIZE[stripped];
  if (SYSTEM_APP_SUPPRESS_RE.test(raw)) return null;
  return raw || null;
}

function aggregateApps(autoSessions = []) {
  const totals = {};
  for (const s of autoSessions) {
    if (s.is_idle) continue;
    const rawApp = s.app_name || '';
    const normalizedName = legacyNormalizeApp(rawApp);
    if (normalizedName === null) continue; // suppress system processes
    const app = normalize(normalizedName);
    if (!app) continue;
    const dur = durationSeconds(s);
    if (dur < 5) continue;
    if (!totals[app]) totals[app] = { name: normalizedName, durationSecs: 0, category: null };
    totals[app].durationSecs += dur;
  }
  for (const key of Object.keys(totals)) {
    totals[key].category = APP_CATEGORIES[key] || APP_CATEGORIES[key.split(' ')[0]] || 'research';
  }
  return Object.values(totals).sort((a, b) => b.durationSecs - a.durationSecs);
}

// ─── URL / Website Analysis ───────────────────────────────────────────────────

function aggregateWebsites(autoSessions = []) {
  const totals = {};
  for (const s of autoSessions) {
    if (s.is_idle || !s.url) continue;
    const domain = extractDomain(s.url);
    if (!domain || domain.length < 3) continue;
    const dur = durationSeconds(s);
    if (dur < 5) continue;
    if (!totals[domain]) {
      const meta = DOMAIN_TOPICS[domain] || null;
      totals[domain] = {
        domain,
        topic: meta?.topic || capitalizeFirst(domain.replace(/\.(com|io|org|net|app|ai)$/, '')),
        category: meta?.category || 'research',
        durationSecs: 0,
      };
    }
    totals[domain].durationSecs += dur;
  }
  return Object.values(totals).sort((a, b) => b.durationSecs - a.durationSecs);
}

// ─── Simple keyword fallback (words only, used as secondary signal) ───────────

const STOP_WORDS = new Set([
  'the','a','an','and','or','in','on','at','to','for','of','with','is','are',
  'was','be','been','by','from','as','it','this','that','vs','via','new','tab',
  'untitled','document','window','file','page','home','main','index','app',
  'com','io','net','org','claude','chatgpt','gemini','auto',
]);

function extractFallbackKeywords(autoSessions = []) {
  const freq = {};
  for (const s of autoSessions) {
    if (s.is_idle) continue;
    const sources = [s.window_title || '', s.url || ''];
    for (const src of sources) {
      const words = src
        .replace(/[^a-zA-Z0-9\s]/g, ' ')
        .split(/\s+/)
        .map(w => w.toLowerCase().trim())
        .filter(w => w.length >= 4 && !STOP_WORDS.has(w) && !/^\d+$/.test(w));
      for (const word of words) freq[word] = (freq[word] || 0) + 1;
    }
  }
  return Object.entries(freq)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 15)
    .map(([w]) => w);
}

// ─── Category & Focus Assessment ─────────────────────────────────────────────

function determinePrimaryCategory(apps, websites) {
  const categoryTime = {};
  for (const app of apps) {
    const cat = app.category || 'research';
    categoryTime[cat] = (categoryTime[cat] || 0) + app.durationSecs;
  }
  for (const site of websites) {
    if (site.category !== 'research') {
      categoryTime[site.category] = (categoryTime[site.category] || 0) + site.durationSecs * 0.4;
    }
  }
  const sorted = Object.entries(categoryTime).sort(([, a], [, b]) => b - a);
  return sorted[0]?.[0] || 'research';
}

function assessFocusQuality(autoSessions = [], totalDurationMins = 0) {
  if (!autoSessions.length || totalDurationMins < 5) return 'unknown';
  const contextSwitches = autoSessions.reduce((sum, s) => sum + (s.context_switches || 0), 0);
  const switchRate = contextSwitches / Math.max(totalDurationMins / 10, 1);
  if (switchRate < 2 && totalDurationMins >= 45) return 'high';
  if (switchRate < 5) return 'medium';
  return 'low';
}

// ─── Session Continuity (recent history) ──────────────────────────────────────
// Looks at the user's already-completed sessions from earlier today to detect
// whether the current session is a continuation of the same work, rather than
// generating each event in isolation. This is real collected data — not an
// inference from window titles — so it's high-confidence when present.

const CONTINUITY_GAP_CAP_MINS = 240; // beyond 4h gap, don't call it a "continuation"

export function detectRecentContinuity(session, recentSessions = [], project = null) {
  if (!recentSessions.length) return null;

  const curStart = toTimestamp(session?.started_at) || Math.floor(Date.now() / 1000);
  const dayStart = new Date(curStart * 1000); dayStart.setHours(0, 0, 0, 0);
  const dayStartUnix = Math.floor(dayStart.getTime() / 1000);

  const matchesGroup = (s) => {
    if (project?.id) return s.project_id === project.id;
    if (session?.category) return s.category === session.category;
    return false;
  };

  const priorToday = recentSessions
    .filter(s => s.id !== session?.id)
    .filter(s => toTimestamp(s.started_at) >= dayStartUnix && toTimestamp(s.started_at) < curStart)
    .filter(matchesGroup)
    .sort((a, b) => toTimestamp(b.started_at) - toTimestamp(a.started_at));

  if (!priorToday.length) return null;

  const last = priorToday[0];
  const lastEnd = toTimestamp(last.ended_at) || (toTimestamp(last.started_at) + (last.duration_seconds || 0));
  const gapMins = Math.max(0, Math.round((curStart - lastEnd) / 60));
  const priorMinutesToday = Math.round(
    priorToday.reduce((sum, s) => sum + (s.duration_seconds || 0), 0) / 60
  );

  return {
    isContinuation: gapMins <= CONTINUITY_GAP_CAP_MINS,
    sessionNumberToday: priorToday.length + 1,
    priorMinutesToday,
    gapMins,
  };
}

// ─── Main Context Analyzer ────────────────────────────────────────────────────

/**
 * Build a full structured work context from all available signals.
 * The returned object is used by eventWritingEngine to produce titles/descriptions.
 *
 * Key addition vs v1: windowTitlePhrases, bestWindowTitle, workSubtype
 */
// ─── Linked Task Title ────────────────────────────────────────────────────────
// When a session is explicitly linked to a task, the task's title is
// user-curated ground truth — far more reliable than anything inferred from
// window titles or app usage. Reject it only if it's too short, vague, or
// contains the same noise patterns we reject for window-title phrases.

const VAGUE_TASK_TITLE_RE = /^(task|todo|to-do|bug|fix|item|note|misc|untitled|new task|chore|wip)\s*#?\d*$/i;

export function extractLinkedTaskTitle(session) {
  const raw = (session?.task_title || '').trim();
  if (raw.length < 4) return null;
  if (VAGUE_TASK_TITLE_RE.test(raw)) return null;
  if (HARD_REJECT_PATTERNS.some(re => re.test(raw))) return null;
  if (containsSystemPath(raw)) return null;
  if (isGenericSubject(raw)) return null;
  return raw;
}

// ─── Linked Task Description & Keywords ──────────────────────────────────────
// The task's own description and curated keyword list are explicit, user-written
// signals — richer ground truth than anything inferred from window titles. They
// don't replace the title, but they sharpen the purpose clause in descriptions
// and feed the subtype/keyword scoring with high-confidence terms.

export function extractLinkedTaskDescription(session) {
  const raw = (session?.task_description || '').trim();
  if (raw.length < 8) return null;
  if (HARD_REJECT_PATTERNS.some(re => re.test(raw))) return null;
  if (containsSystemPath(raw)) return null;
  return raw.length > 220 ? raw.slice(0, 217).trim() + '…' : raw;
}

export function extractLinkedTaskKeywords(session) {
  const raw = (session?.task_keywords || '').trim();
  if (!raw) return [];
  return raw
    .split(/[,;\n]+/)
    .map(w => w.toLowerCase().trim())
    .filter(w => w.length >= 3 && w.length <= 30)
    .slice(0, 10);
}

// ─── AI Conversation Topic Extractor ─────────────────────────────────────────
// Claude/ChatGPT window titles often contain the most precise description of what
// was being worked on. Extract these as a priority signal.

const AI_TOOL_SUFFIX_RE = /\s*[—–|]\s*(claude|chatgpt|gemini|copilot|perplexity|gpt[\s\-]?\d*|anthropic)\s*$/i;

function extractAIConversationTopics(autoSessions = []) {
  const topics = [];
  for (const s of autoSessions) {
    if (s.is_idle || !s.window_title) continue;
    const dur = durationSeconds(s);
    if (dur < 15) continue;
    const app = (s.app_name || '').toLowerCase();
    const isAITool = /claude|chatgpt|gemini|copilot|perplexity/.test(app) ||
                     AI_TOOL_SUFFIX_RE.test(s.window_title);
    if (!isAITool) continue;

    // Strip the AI tool name from the end of the title
    const topic = s.window_title.replace(AI_TOOL_SUFFIX_RE, '').trim();
    if (topic.length < 5) continue;
    // Skip generic/unhelpful topics
    if (/^(new conversation|new chat|untitled|claude\.ai|chatgpt\.com)$/i.test(topic)) continue;

    topics.push({ phrase: topic, durationSecs: dur, score: 80, combined: 80 * Math.log(dur + 1) });
  }
  // Deduplicate similar topics, keep longest/most specific
  return topics
    .sort((a, b) => b.combined - a.combined)
    .filter((t, i, arr) =>
      i === arr.findIndex(other =>
        other.phrase.toLowerCase().includes(t.phrase.toLowerCase()) ||
        t.phrase.toLowerCase().includes(other.phrase.toLowerCase())
      )
    )
    .slice(0, 3);
}

export function analyzeContext(input = {}) {
  const {
    autoSessions = [],
    session = null,
    project = null,
    client = null,
    date = new Date(),
    durationMins = null,
    // dominantSessions: pre-filtered sessions from workflowDominanceEngine.
    // When provided, phrase/keyword extraction runs on these instead of all autoSessions,
    // ensuring title generation reflects the PRIMARY workflow rather than
    // brief distractions or the most-recent (but minor) app switch.
    dominantSessions = null,
    // recentSessions: the user's other completed sessions (typically today's),
    // used to detect whether this session continues earlier work on the same
    // project/category. Optional — callers that don't have this handy simply
    // omit it and continuity is skipped.
    recentSessions = [],
  } = input;

  // If the caller already ran dominance analysis, use the filtered sessions
  // for phrase/keyword extraction but keep ALL sessions for app/website tallies
  // (so duration totals remain accurate).
  const phraseSessions = dominantSessions && dominantSessions.length >= 1
    ? dominantSessions
    : autoSessions;

  const apps     = aggregateApps(autoSessions);
  const websites = aggregateWebsites(autoSessions);

  // ── Linked task — explicit, user-curated ground truth ─────────────────────
  const linkedTaskTitle       = extractLinkedTaskTitle(session);
  const linkedTaskDescription = extractLinkedTaskDescription(session);
  const linkedTaskKeywords    = extractLinkedTaskKeywords(session);

  // ── Continuity — was this a continuation of earlier work today? ──────────
  const continuity = detectRecentContinuity(session, recentSessions, project);

  // ── Phrase-level window title analysis (from dominant sessions only) ──
  const windowTitlePhrases = extractWindowTitlePhrases(phraseSessions);

  // ── AI conversation topics — highest priority signal when present ──
  // Also extracted from dominant sessions only so a brief AI chat about something
  // unrelated doesn't override 90 min of primary workflow context.
  const aiTopics = extractAIConversationTopics(phraseSessions);

  // Merge AI topics at the front of the phrase list (they're the most specific signal)
  const mergedPhrases = [
    ...aiTopics,
    ...windowTitlePhrases.filter(p =>
      !aiTopics.some(t => t.phrase.toLowerCase() === p.phrase.toLowerCase())
    ),
  ];

  const bestWindowTitle    = mergedPhrases[0]?.phrase || null;

  // ── Session notes as additional keyword source ──
  const sessionNotes = session?.notes || session?.description || '';
  const notesKeywords = sessionNotes.length > 5
    ? sessionNotes
        .replace(/[^a-zA-Z0-9\s]/g, ' ')
        .split(/\s+/)
        .map(w => w.toLowerCase().trim())
        .filter(w => w.length >= 4 && !STOP_WORDS.has(w) && !/^\d+$/.test(w))
        .slice(0, 8)
    : [];

  const taskKeywords = linkedTaskTitle
    ? linkedTaskTitle
        .replace(/[^a-zA-Z0-9\s]/g, ' ')
        .split(/\s+/)
        .map(w => w.toLowerCase().trim())
        .filter(w => w.length >= 4 && !STOP_WORDS.has(w) && !/^\d+$/.test(w))
    : [];

  // Task description — explicit user-written context, ranked between the task
  // title and freeform session notes.
  const taskDescKeywords = linkedTaskDescription
    ? linkedTaskDescription
        .replace(/[^a-zA-Z0-9\s]/g, ' ')
        .split(/\s+/)
        .map(w => w.toLowerCase().trim())
        .filter(w => w.length >= 4 && !STOP_WORDS.has(w) && !/^\d+$/.test(w))
        .slice(0, 10)
    : [];

  // taskKeywords (the curated `t.keywords` column) are explicit, user-tagged
  // ground truth — the single highest-confidence keyword source available,
  // so they go first, ahead of even the task title's own derived words.
  const fallbackKeywords   = [...linkedTaskKeywords, ...taskKeywords, ...taskDescKeywords, ...notesKeywords, ...extractFallbackKeywords(phraseSessions)]
    .filter((w, i, arr) => arr.indexOf(w) === i) // deduplicate
    .slice(0, 24);

  const appNames           = apps.map(a => normalize(a.name));
  // Linked task text gets the strongest subtype-detection weight (treated as a
  // long-duration phrase) since it's explicit ground truth, not inference.
  // The task description is included too (shorter weight) since it often
  // contains the actual verb/action ("debug the login redirect") the title alone lacks.
  const subtypePhrases = linkedTaskTitle
    ? [
        { phrase: linkedTaskTitle, durationSecs: 3600 },
        ...(linkedTaskDescription ? [{ phrase: linkedTaskDescription, durationSecs: 1800 }] : []),
        ...mergedPhrases,
      ]
    : mergedPhrases;
  const workSubtype        = detectWorkSubtype(subtypePhrases, fallbackKeywords, appNames);

  // Time signals
  const sessionStart = session?.started_at || autoSessions[0]?.started_at;
  const startUnix    = toTimestamp(sessionStart) || Math.floor(date.getTime() / 1000);
  const hour         = new Date(startUnix * 1000).getHours();
  const timeSlot     = timeOfDay(startUnix);

  // Duration
  const totalSecs = autoSessions.reduce((sum, s) => sum + durationSeconds(s), 0);
  const effectiveDurationMins = durationMins ?? totalSecs / 60;

  // Category and focus
  const primaryCategory    = determinePrimaryCategory(apps, websites);
  const primaryApp         = apps[0] || null;
  const primarySite        = websites[0] || null;
  const totalContextSwitches = autoSessions.reduce((sum, s) => sum + (s.context_switches || 0), 0);
  const focusQuality       = assessFocusQuality(autoSessions, effectiveDurationMins);
  const isDeepWork = (
    (focusQuality === 'high' || effectiveDurationMins >= 60) &&
    (primaryCategory === 'development' || primaryCategory === 'design' || primaryCategory === 'writing') &&
    totalContextSwitches < 15
  );

  return {
    // ── Primary signals (merged phrases — AI topics first, then window titles) ──
    windowTitlePhrases: mergedPhrases,  // Ranked list: AI topics + window title phrases
    aiTopics,                           // AI conversation topics (Claude/ChatGPT sessions)
    bestWindowTitle,                    // Single best phrase (AI topic if present)
    linkedTaskTitle,                    // Explicit task assignment — outranks every inferred signal
    linkedTaskDescription,               // Task's own description — sharpens the purpose clause
    linkedTaskKeywords,                  // Task's curated keyword tags — highest-confidence keyword source
    workSubtype,                        // Specific work type (debugging, implementing, etc.)
    fallbackKeywords,                   // Keywords from task data + window titles + session notes
    continuity,                         // { isContinuation, sessionNumberToday, priorMinutesToday, gapMins } or null

    // App signals
    apps: apps.slice(0, 8),
    primaryApp: primaryApp?.name || null,
    primaryAppCategory: primaryApp?.category || null,
    appNames,

    // Website signals
    websites: websites.slice(0, 6),
    primarySite: primarySite?.domain || null,
    primarySiteTopic: primarySite?.topic || null,

    // Work classification
    primaryCategory,
    isDeepWork,
    workType: primaryCategory,

    // Time signals
    timeOfDay: timeSlot,
    hour,
    startUnix,
    date,

    // Duration
    durationMins: Math.round(effectiveDurationMins),
    totalSecs: Math.round(totalSecs),

    // Quality signals
    focusQuality,
    contextSwitches: totalContextSwitches,
    sessionCount: autoSessions.filter(s => !s.is_idle).length,

    // Project / Client
    project,
    client,
    session,
  };
}

export function analyzeSessionContext(autoSession, project = null, client = null) {
  return analyzeContext({
    autoSessions: [autoSession],
    project,
    client,
    durationMins: (autoSession.duration_seconds || 0) / 60,
  });
}

export function hasMeaningfulTitle(title = '') {
  const VAGUE = new Set([
    '', 'general', 'work', 'task', 'untitled', 'untitled session', 'session',
    'focus', 'focus session', 'focus block', 'deep work', 'new event',
    'auto-tracked', 'computer time', 'tracked session', 'null', 'undefined',
    'scheduled work',
  ]);
  const normalized = normalize(title);
  if (normalized.length <= 2) return false;
  if (VAGUE.has(normalized)) return false;
  // "Auto: <anything>" is vague
  if (/^auto\s*:/i.test(title)) return false;
  return true;
}

// Public exports for downstream engines
export { APP_CATEGORIES, DOMAIN_TOPICS, CATEGORY_VERBS, WORK_SUBTYPES };
export { parseIDETitle };
