/**
 * Telemetry Sanitizer
 * Stage 1 of the contextual intelligence pipeline.
 *
 * Strips system noise, executable names, raw paths, browser pollution,
 * and tracking artifacts from raw auto-session data before it reaches
 * any reasoning engine. Final output should never expose cmd.exe,
 * system32, raw URLs, or installer noise in generated text.
 */

// ─── System Process / Executable Blocklist ───────────────────────────────────

const SYSTEM_PROCESS_RE = /^(cmd|cmd\.exe|conhost|conhost\.exe|svchost|svchost\.exe|powershell|powershell\.exe|explorer|explorer\.exe|taskmgr|taskmgr\.exe|dwm|dwm\.exe|lsass|services|wininit|csrss|smss|ntoskrnl|RuntimeBroker|ShellExperienceHost|SearchHost|StartMenuExperienceHost|ApplicationFrameHost|SystemSettings|WerFault|msiexec|setup|installer|update|updater|crashpad|crashreport|node_modules|npm|yarn|pnpm|pip|conda|brew|apt|dpkg|winget|chocolatey|scoop)(\s|\.exe|$)/i;

const EXECUTABLE_SUFFIX_RE = /\.(exe|dll|bat|cmd|sh|ps1|msi|app|dmg|pkg)(\s|$)/gi;

// ─── System Path Patterns ─────────────────────────────────────────────────────

const SYSTEM_PATH_PATTERNS = [
  /[A-Z]:\\Windows\\(System32|SysWOW64|WinSxS|Temp|Prefetch)/i,
  /[A-Z]:\\Program Files/i,
  /[A-Z]:\\ProgramData/i,
  /[A-Z]:\\Users\\[^\\]+\\AppData/i,
  /\/System\/Library\//i,
  /\/usr\/(bin|lib|local|share)\//i,
  /\/private\/var\//i,
  /\/tmp\//i,
  /node_modules\//i,
  /\.git\//i,
];

function containsSystemPath(str = '') {
  return SYSTEM_PATH_PATTERNS.some(re => re.test(str));
}

// ─── Noisy Window Title Patterns ─────────────────────────────────────────────

const NOISY_TITLE_PATTERNS = [
  /^(New Tab|about:blank|chrome:\/\/|edge:\/\/|moz-extension:\/\/)/i,
  /localhost:\d+/i,
  /127\.0\.0\.1/i,
  /file:\/\/\//i,
  /\.(exe|dll|bat|cmd|sh)(\s|$)/i,
  /^[A-Z]:\\/,                          // bare Windows path
  /^\/Users\/[^/]+\//,                  // bare Unix home path
  /^\d+\s*(notification|message|result|unread)s?/i,
  /^Error\s*[–—-]/i,
  /^(Loading|Connecting|Waiting)\s*\.\.\./i,
];

function isNoisyTitle(title = '') {
  return NOISY_TITLE_PATTERNS.some(re => re.test(title.trim()));
}

// ─── App Name Normalization Map ───────────────────────────────────────────────

const APP_NORMALIZE = {
  // Terminals — normalize to human label
  'windowsterminal': 'Terminal',
  'windows terminal': 'Terminal',
  'iterm': 'Terminal',
  'iterm2': 'Terminal',
  'warp': 'Terminal',
  'hyper': 'Terminal',
  'alacritty': 'Terminal',
  'kitty': 'Terminal',
  'cmd': null,            // suppress — too noisy
  'cmd.exe': null,
  'powershell': 'Terminal',
  'powershell.exe': 'Terminal',
  'bash': 'Terminal',
  'zsh': 'Terminal',
  'fish': 'Terminal',
  'conhost.exe': null,
  'conhost': null,

  // System noise — suppress entirely
  'explorer.exe': null,
  'explorer': null,
  'taskmgr': null,
  'taskmgr.exe': null,
  'svchost': null,
  'svchost.exe': null,
  'dwm.exe': null,
  'dwm': null,
  'msiexec': null,
  'setup': null,
  'installer': null,
  'update': null,
  'updater': null,

  // Editors — canonical names
  'code': 'VS Code',
  'vscode': 'VS Code',
  'visual studio code': 'VS Code',
  'cursor': 'Cursor',
  'zed': 'Zed',
  'sublimetext': 'Sublime Text',
  'sublime text': 'Sublime Text',
  'atom': 'Atom',

  // Browsers — normalize
  'google chrome': 'Chrome',
  'microsoft edge': 'Edge',
  'firefox': 'Firefox',
  'safari': 'Safari',
  'arc browser': 'Arc',

  // AI tools
  'claude': 'Claude',
  'claude.ai': 'Claude',
  'chatgpt': 'ChatGPT',
  'chat.openai.com': 'ChatGPT',
  'gemini': 'Gemini',
};

export function normalizeAppName(raw = '') {
  const key = raw.toLowerCase().trim();
  if (key in APP_NORMALIZE) return APP_NORMALIZE[key];   // null = suppress
  // Strip .exe suffix and try again
  const stripped = key.replace(/\.exe$/, '');
  if (stripped in APP_NORMALIZE) return APP_NORMALIZE[stripped];
  // Suppress known system processes
  if (SYSTEM_PROCESS_RE.test(raw)) return null;
  return raw || null;
}

// ─── URL Normalization ────────────────────────────────────────────────────────

const MEANINGFUL_DOMAINS = new Map([
  ['github.com',              'GitHub'],
  ['gitlab.com',              'GitLab'],
  ['bitbucket.org',           'Bitbucket'],
  ['stackoverflow.com',       'Stack Overflow'],
  ['developer.mozilla.org',   'MDN Web Docs'],
  ['npmjs.com',               'npm'],
  ['docs.anthropic.com',      'Anthropic Docs'],
  ['claude.ai',               'Claude AI'],
  ['chat.openai.com',         'ChatGPT'],
  ['openai.com',              'OpenAI'],
  ['figma.com',               'Figma'],
  ['linear.app',              'Linear'],
  ['notion.so',               'Notion'],
  ['vercel.com',              'Vercel'],
  ['supabase.com',            'Supabase'],
  ['railway.app',             'Railway'],
  ['tailwindcss.com',         'Tailwind CSS'],
  ['react.dev',               'React Docs'],
  ['nextjs.org',              'Next.js Docs'],
  ['typescript.org',          'TypeScript Docs'],
  ['huggingface.co',          'Hugging Face'],
  ['docs.github.com',         'GitHub Docs'],
  ['medium.com',              'Medium'],
  ['dev.to',                  'dev.to'],
  ['youtube.com',             'YouTube'],
  ['excalidraw.com',          'Excalidraw'],
  ['mermaid.live',            'Mermaid'],
  ['dbdiagram.io',            'DB Diagram'],
]);

function extractDomain(url = '') {
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return url.replace(/^https?:\/\//i, '').split('/')[0].replace(/^www\./, '');
  }
}

// Query-string keys that are pure tracking noise and carry no navigational
// meaning. Stripped so stored URLs don't leak ad-network / session tokens
// into the AI pipeline.
const TRACKING_PARAMS = new Set([
  // UTM campaign tags
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
  'utm_id', 'utm_source_platform', 'utm_creative_format', 'utm_marketing_tactic',
  // Ad-network click IDs
  'fbclid', 'gclid', 'gclsrc', 'dclid', 'msclkid', 'ttclid', 'twclid',
  'li_fat_id', 'mc_eid', 'igshid', 'epik',
  // HubSpot / Marketo / Salesforce
  '_hsenc', '_hsmi', 'hsa_acc', 'hsa_cam', 'hsa_grp', 'hsa_ad', 'hsa_src',
  'hsa_tgt', 'hsa_kw', 'hsa_mt', 'hsa_net', 'hsa_ver', 'mkt_tok', 'sfdcid',
  // Generic noise
  'ref', 'referrer', 'source', 'origin', 'affiliate',
  // Session / auth tokens that have no semantic value
  'sessionid', 'session_id', 'sess', 'token', 'auth', 'sig', 'signature',
  // Analytics helpers
  '_ga', '_gl', '_gac', 'mc_cid',
]);

/**
 * Strip tracking parameters, ad-network click IDs, and session tokens from
 * a URL, returning a clean canonical form. Returns null for internal or
 * meaningless URLs.
 */
export function stripURLNoise(url = '') {
  if (!url) return null;
  if (/^(chrome-extension|moz-extension|edge-extension|about|file|blob):/.test(url)) return null;
  if (/localhost|\b127\.0\.0\.1\b|0\.0\.0\.0/.test(url)) return null;

  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);

    // Remove all known tracking keys
    for (const key of [...u.searchParams.keys()]) {
      if (TRACKING_PARAMS.has(key.toLowerCase())) {
        u.searchParams.delete(key);
      }
    }

    // Drop fragment — it's client-side state, not canonical content
    u.hash = '';

    return u.toString();
  } catch {
    // Malformed URL — strip query string entirely as a safe fallback
    return url.split('?')[0].split('#')[0] || null;
  }
}

export function normalizeURL(url = '') {
  if (!url) return null;
  // Suppress chrome extensions, internal pages, local
  if (/^(chrome-extension|moz-extension|edge-extension|about|file|blob):/.test(url)) return null;
  if (/localhost|\b127\.0\.0\.1\b|0\.0\.0\.0/.test(url)) return null;

  const domain = extractDomain(url);
  if (!domain || domain.length < 3) return null;

  return MEANINGFUL_DOMAINS.get(domain) || null;
}

// ─── Window Title Sanitization ────────────────────────────────────────────────

const TITLE_NOISE_SUFFIXES = [
  /\s*[—–-]\s*Visual Studio Code\s*$/i,
  /\s*[—–-]\s*VS Code\s*$/i,
  /\s*[—–-]\s*Code\s*$/i,
  /\s*[—–-]\s*Cursor\s*$/i,
  /\s*[—–-]\s*WebStorm\s*$/i,
  /\s*[—–-]\s*IntelliJ IDEA\s*$/i,
  /\s*[—–-]\s*(Google Chrome|Chrome|Safari|Firefox|Edge|Arc|Brave)\s*$/i,
  /\s*[|·•]\s*GitHub\s*$/i,
  /\s*[|·•—–-]\s*Notion\s*$/i,
  /\s*[—–-]\s*Figma\s*$/i,
  /\s*[—–-]\s*Claude\s*$/i,
  /\s*[—–-]\s*ChatGPT\s*$/i,
  /\s*[—–-]\s*Linear\s*$/i,
  /\s*[|·]\s*Stack Overflow\s*$/i,
  /\s*[|·]\s*MDN Web Docs\s*$/i,
  /\s*-\s*Google Search\s*$/i,
  /\s*[|·]\s*Google\s*$/i,
  /\s*-\s*Bing\s*$/i,
  /^\d+\s*(unread\s*)?(notification|message|result|item)s?\s*[|·-]\s*/i,
];

export function sanitizeWindowTitle(title = '', appName = '') {
  if (!title) return null;

  let clean = title.trim();

  // Hard reject noisy patterns
  if (isNoisyTitle(clean)) return null;
  if (containsSystemPath(clean)) return null;
  if (SYSTEM_PROCESS_RE.test(clean)) return null;

  // Strip executable suffixes
  clean = clean.replace(EXECUTABLE_SUFFIX_RE, '').trim();

  // Strip known app name suffixes
  for (const re of TITLE_NOISE_SUFFIXES) {
    clean = clean.replace(re, '');
  }

  // Strip the specific app name from end
  if (appName) {
    const esc = appName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    clean = clean.replace(new RegExp(`\\s*[—–-]\\s*${esc}\\s*$`, 'i'), '');
  }

  // Remove raw paths that slipped through
  clean = clean.replace(/[A-Z]:\\[^\s]+/gi, '').replace(/\/[a-z][^\s]+/gi, '').trim();

  // Remove "Search · Google" artifacts
  clean = clean
    .replace(/^(New Tab|about:blank)\s*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (!clean || clean.length < 3) return null;
  return clean;
}

// ─── Session Sanitization ─────────────────────────────────────────────────────

const MIN_DURATION_SECS = 8;

function sessionDuration(s) {
  if (s.duration_seconds > 0) return s.duration_seconds;
  const toSec = v => {
    if (!v) return 0;
    if (typeof v === 'number') return v > 1e10 ? v / 1000 : v;
    const d = new Date(v);
    return isNaN(d) ? 0 : d.getTime() / 1000;
  };
  const start = toSec(s.started_at), end = toSec(s.ended_at);
  return end > start ? end - start : 0;
}

/**
 * Sanitize a batch of raw auto-tracked sessions.
 * Returns cleaned sessions with normalized app names and titles,
 * suppressed system processes, and URL artifacts removed.
 *
 * @param {Array} autoSessions
 * @returns {{ sessions: Array, stats: Object }}
 */
export function sanitizeSessions(autoSessions = []) {
  const stats = { input: autoSessions.length, removed: 0, normalized: 0 };
  const sessions = [];

  for (const s of autoSessions) {
    // Drop idle, very short, or explicitly excluded sessions
    if (s.is_idle) { stats.removed++; continue; }
    if (sessionDuration(s) < MIN_DURATION_SECS) { stats.removed++; continue; }

    const rawApp = s.app_name || '';
    const normalizedApp = normalizeAppName(rawApp);

    // null means "suppress this app entirely"
    if (normalizedApp === null && !s.url) { stats.removed++; continue; }

    const cleanTitle  = sanitizeWindowTitle(s.window_title || '', rawApp);
    const cleanURL    = normalizeURL(s.url || '');
    const strippedURL = stripURLNoise(s.url || '');  // tracking-free raw URL for domain extraction

    // If both title and URL are noise and app is suppressed, drop
    if (normalizedApp === null && !cleanTitle && !cleanURL) { stats.removed++; continue; }

    if (normalizedApp !== rawApp) stats.normalized++;

    sessions.push({
      ...s,
      app_name:     normalizedApp || rawApp,
      window_title: cleanTitle,
      url:          strippedURL || cleanURL || null,  // stripped URL preferred; falls back to domain label
      _originalApp: rawApp,
      _sanitized:   true,
    });
  }

  stats.kept = sessions.length;
  return { sessions, stats };
}

/**
 * Sanitize a single window title string.
 * Convenience export for use in existing eventContextAnalyzer.
 */
export { sanitizeWindowTitle as cleanTitle };
