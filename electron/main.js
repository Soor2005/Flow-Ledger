const { app, BrowserWindow, ipcMain, powerMonitor, Notification, nativeImage, session: electronSession, screen, dialog } = require('electron');

// ─── GPU workaround: relaunch with sandbox disabled on first run ──────────────
// On Windows + NVIDIA, Electron's GPU *sandbox process* crashes silently,
// producing an invisible/black window. The GPU itself works fine — only the
// sandbox wrapper fails. appendSwitch() is too late in packaged builds, so we
// relaunch once with --disable-gpu-sandbox as a real CLI arg (Chromium reads
// it before starting the GPU service). This keeps full hardware acceleration.
if (app.isPackaged && !app.commandLine.hasSwitch('disable-gpu-sandbox')) {
  app.relaunch({ args: process.argv.slice(1).concat(['--disable-gpu-sandbox']) });
  app.exit(0);
}

const path   = require('path');
const fs     = require('fs');
const http   = require('http');
const { exec } = require('child_process');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { AutoTracker }     = require('./tracker');
const { IdleWatcher }     = require('./idleWatcher');
const {
  trackingWorkflowManager,
  WORKFLOW_EVENTS,
  normalizeToolName,
} = require('./workflow/workflowEngine');
const { createTray, destroyTray } = require('./tray');
const { FlowLedgerAI, WORKFLOW_NAMES } = require('./ai-engine');
const { parseTitleHistory, pushTitleHistory } = require('./windowTitleAnalyzer');
const { setupUpdater }    = require('./updater');
const { createClient: createSupabaseClient } = require('@supabase/supabase-js');

// ─── Load .env for main process ───────────────────────────────────────────────
// CRA only loads REACT_APP_* vars for the renderer bundle; we parse .env here
// so the main process can read SUPABASE_SERVICE_ROLE without exposing it to the
// renderer (never put the service-role key in a REACT_APP_ variable).
try {
  const envCandidates = [
    path.join(__dirname, '..', '.env'),
    path.join(process.resourcesPath || '', 'config', '.env'),
    path.join(process.resourcesPath || '', '.env'),
    path.join(path.dirname(process.execPath || ''), '.env'),
  ].filter(Boolean);

  const loadedEnvPath = envCandidates.find(candidate => fs.existsSync(candidate));
  if (loadedEnvPath) {
    fs.readFileSync(loadedEnvPath, 'utf8').split('\n').forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) return;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      if (key && !process.env[key]) process.env[key] = val;
    });
    console.log('[env] Loaded main-process env from:', loadedEnvPath);
  } else {
    console.warn('[env] No .env file found for main process. Checked:', envCandidates);
  }
} catch (err) {
  console.error('[env] Failed to load main-process env:', err);
}

// ─── Supabase admin client (service-role, main process only) ─────────────────
let supabaseAdmin = null;
function getSupabaseAdmin() {
  if (!supabaseAdmin) {
    const url = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL || '';
    const key = process.env.SUPABASE_SERVICE_ROLE || '';
    if (url && key) {
      supabaseAdmin = createSupabaseClient(url, key, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
    }
  }
  return supabaseAdmin;
}

// ─── Global error safety net ──────────────────────────────────────────────────
// Catches any uncaught exception in the main process that would otherwise
// show Electron's crash dialog.  EPIPE is the most common culprit — it fires
// when the PowerShell bridge pipe closes unexpectedly (process killed, restarted
// by Windows Update, etc.).  We log it and let the bridge auto-restart; we
// never want the whole app to die over a broken pipe.
// console.error/warn alone are not enough in a packaged Windows GUI app —
// there is no attached console, so anything logged only to console is
// invisible and the user just sees a frozen/blank app with zero diagnostics.
// Mirror fatal errors to a crash.log in userData so they're actually findable.
function logFatal(label, err) {
  try {
    const line = `[${new Date().toISOString()}] ${label}: ${err && err.stack ? err.stack : err}\n`;
    fs.appendFileSync(path.join(app.getPath('userData'), 'crash.log'), line);
  } catch (_) { /* best effort — never let logging itself crash the app */ }
}

process.on('uncaughtException', (err) => {
  if (err.code === 'EPIPE' || err.code === 'ERR_STREAM_DESTROYED') {
    // Benign — broken pipe from the PowerShell tracker child process.
    // The PowerShellBridge will auto-restart in 2 s.
    console.warn('[main] Suppressed EPIPE from tracker bridge:', err.message);
    return;
  }
  // For any other uncaught error log it but do NOT crash — keeps the app alive.
  console.error('[main] Uncaught exception:', err);
  logFatal('uncaughtException', err);
});

process.on('unhandledRejection', (reason) => {
  // Suppress noisy but harmless promise rejections (network, tracker, etc.)
  console.warn('[main] Unhandled rejection:', reason);
  logFatal('unhandledRejection', reason);
});

const isDev   = !!process.env.ELECTRON_START_URL;
const DB_PATH   = path.join(app.getPath('userData'), 'flow-ledger-v4.db');
const BACKUP_PATH = DB_PATH + '.bak';
const LOGS_DIR = path.join(app.getPath('userData'), 'logs');
const ACTIVATION_LOG_PATH = path.join(LOGS_DIR, 'activation.log');

function ensureActivationLogDir() {
  try {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  } catch (err) {
    console.error('[activation] Failed to create logs directory:', err);
  }
}

function serializeActivationLogValue(value) {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
      code: value.code,
      status: value.status,
    };
  }
  if (Array.isArray(value)) {
    return value.map(serializeActivationLogValue);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, serializeActivationLogValue(nestedValue)])
    );
  }
  return value;
}

function writeActivationLog(level, step, details = {}) {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    step,
    details: serializeActivationLogValue(details),
  };
  const line = `[activation] ${JSON.stringify(payload)}`;
  const consoleMethod = typeof console[level] === 'function' ? console[level] : console.log;
  consoleMethod(line);
  try {
    ensureActivationLogDir();
    fs.appendFileSync(ACTIVATION_LOG_PATH, `${line}\n`, 'utf8');
  } catch (err) {
    console.error('[activation] Failed to write activation log file:', err);
  }
}

function maskActivationKey(rawKey) {
  const normalised = String(rawKey || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
  if (!normalised) return '';
  if (normalised.length <= 4) return normalised;
  return `${'*'.repeat(Math.max(normalised.length - 4, 0))}${normalised.slice(-4)}`;
}

function createActivationDebugState(userId) {
  return {
    currentUserId: userId || null,
    supabaseConnectionStatus: 'not_checked',
    activationKeyLookupStatus: 'not_started',
    exactActivationError: '',
    logFile: ACTIVATION_LOG_PATH,
  };
}

function activationFailure(code, message, debug = {}) {
  return {
    success: false,
    error: code,
    message,
    debug: {
      ...debug,
      exactActivationError: message,
    },
  };
}

function classifySupabaseError(error, fallbackCode = 'activation_failed', fallbackMessage = 'Activation failed') {
  const rawMessage = String(
    error?.message ||
    error?.error_description ||
    error?.details ||
    error?.hint ||
    error ||
    fallbackMessage
  );
  const lower = rawMessage.toLowerCase();
  const status = error?.status;
  const code = String(error?.code || '').toLowerCase();

  if (lower.includes('supabase_service_role')) {
    return { code: 'missing_supabase_service_role', message: 'Missing SUPABASE_SERVICE_ROLE' };
  }
  if (lower.includes('supabase_url')) {
    return { code: 'missing_supabase_url', message: 'Missing SUPABASE_URL' };
  }
  if (
    lower.includes('invalid api key') ||
    lower.includes('apikey is invalid') ||
    lower.includes('no api key found') ||
    lower.includes('invalid jwt') ||
    status === 401
  ) {
    return { code: 'invalid_api_key', message: 'Invalid API Key' };
  }
  if (
    lower.includes('row level security') ||
    lower.includes('row-level security') ||
    lower.includes('permission denied') ||
    code === '42501'
  ) {
    return { code: 'rls_access_denied', message: 'RLS policy denied access' };
  }
  if (
    lower.includes('network request failed') ||
    lower.includes('fetch failed') ||
    lower.includes('failed to fetch') ||
    lower.includes('getaddrinfo') ||
    lower.includes('econnrefused') ||
    lower.includes('enotfound')
  ) {
    return { code: 'network_request_failed', message: 'Network request failed' };
  }
  if (
    lower.includes('failed to connect') ||
    lower.includes('connection refused') ||
    lower.includes('connection terminated') ||
    status === 503
  ) {
    return { code: 'failed_to_connect_supabase', message: 'Failed to connect to Supabase' };
  }
  if (fallbackCode === 'profile_update_failed') {
    return { code: 'profile_update_failed', message: 'Profile update failed' };
  }

  return { code: fallbackCode, message: rawMessage || fallbackMessage };
}

function getAppIconPath() {
  // Prefer .ico on Windows — better integration with Action Center
  if (process.platform === 'win32') {
    const ico = path.join(__dirname, 'icon.ico');
    if (fs.existsSync(ico)) return ico;
  }
  const candidates = [
    path.join(__dirname, '..', 'src', 'assets', 'logo.png'),
    path.join(__dirname, '..', 'build', 'logo.png'),
    path.join(__dirname, '..', 'public', 'logo.png'),
  ];
  return candidates.find(p => fs.existsSync(p)) || candidates[0];
}

// Native OS notifications (esp. Windows toast) are rendered by a separate OS
// shell process that reads the icon file directly off disk — it can't see
// inside the app.asar archive the way Electron's own patched fs/nativeImage
// loader can. Loading the icon into a NativeImage here (asar-aware) and
// handing Notification the decoded bitmap — instead of a path string —
// sidesteps that entirely, so the icon (and the notification itself) keeps
// working in packaged/production builds, not just `npm run` dev mode.
let _notifIcon = null;
function getNotifIcon() {
  if (_notifIcon) return _notifIcon;
  try {
    const img = nativeImage.createFromPath(getAppIconPath());
    if (!img.isEmpty()) _notifIcon = img;
  } catch {}
  return _notifIcon || undefined;
}

// ── Branding: ensures Windows notifications show "Flow Ledger" not "Electron"
app.setName('Flow Ledger');
if (process.platform === 'win32') {
  app.setAppUserModelId('com.flowledger.app');
}

let db              = null;
let mainWindow      = null;
let trayHandle      = null;
let tracker         = null;
let httpServer      = null;         // Chrome extension HTTP bridge
let currentUserId   = null;
let currentSessionId = null;
let focusModeActive = false;        // true = distraction blocking ON
let focusStartTime  = null;         // Unix ms when focus mode started (persists across nav)
let focusProfileId  = null;         // active profile id (or null = global rules only)
let focusRuleScope  = 'global';     // 'global' = common rules, 'profile' = selected profile only
let _scheduleControlledFocus = false; // true = schedule system activated focus mode
let aiEngine        = null;         // FlowLedgerAI instance (initialised after DB ready)
let breakReminderTimeout = null;
let flowStateTimeout    = null;     // fires after 25 min of uninterrupted work
let quitting        = false;        // set true on app.quit() so close hides vs quits

// ─── TRACKING EXCLUSIONS (loaded from DB on login, updated via IPC) ───────────
let trackingExclusions = { appBlacklist: [], websiteBlacklist: [], privateModeApps: [] };

function loadTrackingExclusions(userId) {
  try {
    const row = get('SELECT * FROM tracking_exclusions WHERE user_id=?', [userId]);
    if (row) {
      trackingExclusions = {
        appBlacklist:    JSON.parse(row.app_blacklist    || '[]').map(s => s.toLowerCase().trim()),
        websiteBlacklist:JSON.parse(row.website_blacklist|| '[]').map(s => s.toLowerCase().trim()),
        privateModeApps: JSON.parse(row.private_apps    || '[]').map(s => s.toLowerCase().trim()),
      };
    } else {
      trackingExclusions = { appBlacklist: [], websiteBlacklist: [], privateModeApps: [] };
    }
  } catch (_) {
    trackingExclusions = { appBlacklist: [], websiteBlacklist: [], privateModeApps: [] };
  }
}

// ─── AUTO-FOCUS STATE MACHINE (main-process owned, UI-lifecycle independent) ──
// Lives here so it survives page navigations, component unmounts, and dev-mode
// HMR reloads. The React TimerPage subscribes for display only — it never drives
// the machine.
const AF_THRESHOLD_SECS = 60;      // sustained productive activity before session is created
const AF_IDLE_STOP_SECS = 15 * 60; // unbroken idle before the running session is closed
let afState       = 'watching';     // 'watching' | 'buffering' | 'tracking' | 'paused'
let afSession     = null;           // { id, title, category, started_at } | null
let afBufferStart = null;           // Date.now() ms when buffering started
let afBufferTick  = null;           // setInterval handle for buffer progress
let afIdleTimer   = null;           // setTimeout handle for idle-stop
let afLastExtendLogAt = 0;          // throttles active-session heartbeat logs

// ── Manual session idle watcher ───────────────────────────────────────────────
let manualIdleWatcher = null;

// ── Meeting auto-detection state ──────────────────────────────────────────────
const MEETING_APPS_RE = /^(zoom|microsoft.?teams|ms-teams|webex|loom|around)$/i;
const MEETING_URL_RE  = /meet\.google\.com|zoom\.us\/j\/|teams\.microsoft\.com\/l\/meetup/i;
const MEETING_CONFIRM_SECS = 90; // fire event after meeting sustained for this long
let meetingTrack = null; // { app, startMs, fired }


function getAfWorkflowId() {
  try {
    return afSession?.workflowId || trackingWorkflowManager.getActiveWorkflow()?.id || null;
  } catch {
    return afSession?.workflowId || null;
  }
}

function logAF(event, reason, extra = {}) {
  console.debug('[AF]', event, {
    timestamp: new Date().toISOString(),
    afState,
    sessionId: afSession?.id || null,
    workflowId: getAfWorkflowId(),
    reason: reason || null,
    ...extra,
  });
}

function setAfState(nextState, reason) {
  if (afState === nextState) return;
  const previousState = afState;
  afState = nextState;
  logAF('AF_STATE_CHANGE', reason, { previousState, nextState });
}

function clearAfBuffer(reason) {
  const hadBuffer = !!(afBufferTick || afBufferStart);
  if (afBufferTick) {
    clearInterval(afBufferTick);
    afBufferTick = null;
  }
  afBufferStart = null;
  if (reason && hadBuffer) logAF('AF_INVALID_STATE_RESET', reason);
}

function hasActiveAfSession() {
  return !!afSession;
}

function ensureActiveAfTracking(reason) {
  if (!hasActiveAfSession()) return false;
  if (afState !== 'tracking') {
    clearAfBuffer(reason || 'active_session_state_repair');
    setAfState('tracking', reason || 'active_session_state_repair');
    logAF('AF_INVALID_STATE_RESET', reason || 'active_session_state_repair');
  }
  return true;
}

function hydrateActiveAfSessionFromDb(reason) {
  if (afSession || !db || !currentUserId) return false;
  try {
    const active = get(
      `SELECT id, title, category, started_at
         FROM sessions
        WHERE user_id=? AND ended_at IS NULL AND title LIKE 'Auto:%'
        ORDER BY started_at DESC LIMIT 1`,
      [currentUserId]
    );
    if (!active?.id) return false;
    afSession = {
      id: active.id,
      title: active.title || 'Auto: Focus',
      category: active.category || 'Focus',
      started_at: active.started_at,
      appName: (active.title || '').replace(/^Auto:\s*/i, '') || 'Focus',
      workflowId: getAfWorkflowId(),
    };
    setAfState('tracking', reason || 'hydrate_active_session');
    clearAfBuffer(reason || 'hydrate_active_session');
    logAF('AF_SESSION_REUSED', reason || 'hydrate_active_session');
    return true;
  } catch (e) {
    console.error('[AF] Active session hydrate failed:', e.message);
    return false;
  }
}

function afReset() {
  const previousSessionId = afSession?.id || null;
  afSession = null; afBufferStart = null;
  setAfState('watching', 'reset');
  afLastExtendLogAt = 0;
  clearInterval(afBufferTick); afBufferTick = null;
  clearTimeout(afIdleTimer);  afIdleTimer  = null;
  logAF('AF_INVALID_STATE_RESET', 'reset', { previousSessionId });
}

function afBroadcast(reason) {
  if (!mainWindow) return;
  if (ensureActiveAfTracking(reason || 'broadcast_active_session_guard')) {
    clearAfBuffer(reason || 'broadcast_active_session_guard');
  }
  const broadcastState = hasActiveAfSession() ? 'tracking' : afState;
  const bufferPct = (broadcastState === 'buffering' && afBufferStart)
    ? Math.min(100, Math.round(((Date.now() - afBufferStart) / 1000 / AF_THRESHOLD_SECS) * 100))
    : 0;
  logAF('AF_BROADCAST_STATE', reason, { broadcastState, bufferPct });
  mainWindow.webContents.send('tracker:afState', {
    state: broadcastState, session: afSession, bufferPct, reason: reason || null,
  });
}

// Called on every live heartbeat — drives the buffer and session lifecycle.
function runAutoFocusMachine(appName, liveAI) {
  if (!currentUserId) return;

  // User manually paused — do not start any new sessions until they resume
  if (afState === 'user_paused') return;

  try {
    const s = get('SELECT auto_track FROM tracking_settings WHERE user_id=?', [currentUserId]);
    if (s && s.auto_track === 0) return; // user disabled auto-track
  } catch { return; }

  // Activity → cancel any pending idle-stop immediately
  if (afIdleTimer) { clearTimeout(afIdleTimer); afIdleTimer = null; }

  // Session already running — keep it alive across all app switches
  hydrateActiveAfSessionFromDb('heartbeat_db_active_session');
  if (ensureActiveAfTracking('active_session_heartbeat')) {
    const now = Date.now();
    if (now - afLastExtendLogAt >= 30000) {
      afLastExtendLogAt = now;
      logAF('AF_SESSION_EXTENDED', 'active_session_heartbeat', { appName });
    }
    return;
  }

  const appLower      = (appName || '').toLowerCase();
  const isProductive  = !!(liveAI?.deepWork
    || liveAI?.sessionType === 'deep_work'
    || liveAI?.sessionType === 'shallow_work'
    || /code|vscode|cursor|figma|terminal|powershell|iterm|warp|notion|obsidian|word|docs|excel|sheets|vim|rider|xcode|intellij|pycharm|sublime|webstorm|flow.ledger/.test(appLower));
  const isDistraction = !!(liveAI?.sessionType === 'distraction'
    || /youtube|netflix|twitter|instagram|facebook|reddit|tiktok|twitch/.test(appLower));

  if (afState === 'watching' || afState === 'paused') {
    if (isProductive && !isDistraction) {
      if (!afBufferStart) afBufferStart = Date.now();
      setAfState('buffering', 'productive_activity_buffering');
      if (!afBufferTick) {
        afBufferTick = setInterval(() => {
          if (ensureActiveAfTracking('buffer_tick_active_session_guard')) return;
          const elapsed = Math.floor((Date.now() - (afBufferStart || Date.now())) / 1000);
          afBroadcast();
          if (elapsed >= AF_THRESHOLD_SECS) {
            clearInterval(afBufferTick); afBufferTick = null;
            launchAutoFocusSession(appName, liveAI);
          }
        }, 2000);
      }
      afBroadcast();
    }
    return;
  }

  if (afState === 'buffering' && isDistraction) {
    clearAfBuffer('distraction_during_buffer');
    setAfState('watching', 'distraction_during_buffer');
    afBroadcast();
  }
}

// Creates a focus session in the DB and transitions to 'tracking'.
function launchAutoFocusSession(appName, liveAI) {
  if (!db || !currentUserId) return;
  hydrateActiveAfSessionFromDb('launch_db_active_session');
  if (ensureActiveAfTracking('launch_guard_existing_session')) {
    logAF('AF_SESSION_CREATION_BLOCKED', 'active_session_exists', { appName });
    logAF('AF_SESSION_REUSED', 'active_session_exists', { appName });
    afBroadcast('active_session_reused');
    return;
  }
  try {
    const cats = all('SELECT name FROM categories WHERE user_id=? ORDER BY rowid', [currentUserId]);
    // Prefer AI-matched category; fall back to first user category
    let categoryName = cats[0]?.name || 'Focus';
    if (liveAI?.category) {
      const hit = cats.find(c => c.name.toLowerCase() === (liveAI.category || '').toLowerCase());
      if (hit) categoryName = hit.name;
    }

    const id    = uuidv4();
    const now   = Math.floor(Date.now() / 1000);
    const title = `Auto: ${appName || 'Focus'}`;
    const deep  = liveAI?.deepWork ? 1 : 0;

    // Only stop a previous *auto* session — never forcibly end a manual session
    const active = get('SELECT id, started_at, title FROM sessions WHERE user_id=? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1', [currentUserId]);
    if (active?.title?.startsWith('Auto:')) {
      const dur = Math.max(0, now - active.started_at);
      run('UPDATE sessions SET ended_at=?,duration_seconds=?,is_deep_work=? WHERE id=?',
        [now, dur, dur >= 1500 ? 1 : 0, active.id]);
    }

    run('INSERT INTO sessions (id,user_id,category,title,started_at,is_deep_work,session_type) VALUES (?,?,?,?,?,?,?)',
      [id, currentUserId, categoryName, title, now, deep, 'focus']);

    let workflowId = null;
    try { workflowId = trackingWorkflowManager.getActiveWorkflow()?.id || null; } catch {}
    afSession = { id, title, category: categoryName, started_at: now, appName: appName || 'Focus', workflowId };
    setAfState('tracking', 'session_created');
    afLastExtendLogAt = Date.now();
    logAF('AF_SESSION_CREATED', 'session_created', { appName, title });
    afBroadcast('started');
  } catch (e) {
    console.error('[AF] Session create failed:', e.message);
    setAfState('watching', 'session_create_failed');
    afBroadcast();
  }
}

// Closes the running AF session in the DB, generates an AI title, and notifies.
function closeAutoFocusSession(reason) {
  const sessId    = afSession?.id;
  const sessStart = afSession?.started_at;
  const rawApp    = afSession?.appName || 'Focus';
  const category  = afSession?.category || 'Focus';
  const workflowId = getAfWorkflowId();
  afSession = null;
  setAfState('watching', reason || 'session_closed');
  afLastExtendLogAt = 0;

  let aiTitle = null;
  let durSecs = 0;
  let isDeep  = false;

  if (db && sessId) {
    try {
      const t = Math.floor(Date.now() / 1000);
      const s = get('SELECT started_at FROM sessions WHERE id=?', [sessId]);
      if (s) {
        durSecs = Math.max(0, t - s.started_at);
        isDeep  = durSecs >= 1500;
        run('UPDATE sessions SET ended_at=?,duration_seconds=?,is_deep_work=? WHERE id=?',
          [t, durSecs, isDeep ? 1 : 0, sessId]);
      }

      // Generate AI title from activities recorded during this focus window
      if (aiEngine && sessStart && durSecs >= 60) {
        try {
          const acts = all(
            'SELECT * FROM auto_sessions WHERE user_id=? AND started_at >= ? AND started_at <= ? ORDER BY started_at ASC',
            [currentUserId, sessStart - 30, t + 30]
          );
          if (acts.length > 0) {
            const mapped = acts.map(a => ({
              ...a,
              category_key: (a.ai_category || '').toLowerCase(),
              duration: a.duration_seconds || 30,
            }));
            const wf = aiEngine.detectWorkflow(mapped);
            if (wf?.workflowName && wf.workflowName !== 'Work Session') {
              aiTitle = wf.workflowName;
            }
          }
        } catch {}
      }
    } catch {}
  }

  // Fallback: classify the primary app → "Coding in Cursor", "Designing in Figma", etc.
  if (!aiTitle && aiEngine) {
    try {
      const cls = aiEngine.classifyActivity(rawApp, '', '');
      const ACTION = {
        development: 'Coding in',    design: 'Designing in', writing: 'Writing in',
        research:    'Researching in', planning: 'Planning in', learning: 'Learning in',
        communication: 'Communicating via', admin: 'Admin work in',
        meeting: 'Meeting via', focus: 'Focused work in',
      };
      const clean  = rawApp.replace(/\s*(desktop|app|browser)\s*/gi, '').trim();
      const proper = clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
      aiTitle = `${ACTION[cls.categoryKey] || 'Working in'} ${proper}`;
    } catch {}
  }

  // Last-resort fallback
  if (!aiTitle) {
    const proper = rawApp.charAt(0).toUpperCase() + rawApp.slice(1);
    aiTitle = `${proper} session`;
  }

  // Persist AI title so activity feed shows the same name as the notification
  if (db && sessId && aiTitle) {
    try { run('UPDATE sessions SET title=? WHERE id=?', [aiTitle, sessId]); } catch {}
  }

  // Fire notifications only for sessions long enough to matter (≥ 1 min).
  // The renderer's onSessionStopped handler fires both the in-app bell/toast AND
  // the OS desktop notification (with icon), so we don't need a separate
  // main-process Notification here — that would produce a duplicate popup.
  if (mainWindow && durSecs >= 60) {
    mainWindow.webContents.send('session:stopped', {
      title:            aiTitle,
      category,
      duration_seconds: durSecs,
      is_deep_work:     isDeep,
    });
  }

  afBroadcast(reason || null);
  logAF('AF_SESSION_CLOSED', reason || 'session_closed', { sessionId: sessId || null, workflowId, durationSeconds: durSecs });
}

// ─── STARTUP SESSION RECOVERY ────────────────────────────────────────────────
// Close sessions orphaned by a previous crash, power-off, or OS force-quit.
// Called once per login/session-restore so stale open rows are sealed before
// any new tracking begins.  Sessions are capped at 8 h so an overnight orphan
// doesn't inflate daily totals by an absurd amount.
function recoverOpenSessions(userId) {
  if (!db || !userId) return;
  try {
    const t    = Math.floor(Date.now() / 1000);
    const open = all('SELECT id, started_at FROM sessions WHERE user_id=? AND ended_at IS NULL', [userId]);
    if (!open.length) return;
    for (const s of open) {
      const endAt = Math.min(t, s.started_at + 8 * 3600); // cap at 8 h
      const dur   = Math.max(0, endAt - s.started_at);
      run('UPDATE sessions SET ended_at=?,duration_seconds=?,is_deep_work=? WHERE id=?',
        [endAt, dur, dur >= 1500 ? 1 : 0, s.id]);
    }
    console.log(`[recovery] Sealed ${open.length} orphaned session(s)`);
  } catch (e) {
    console.error('[recovery]', e.message);
  }
}

// ─── SQL.JS ───────────────────────────────────────────────────────────────────
async function initDatabase() {
  const initSqlJs = require('sql.js');
  const wasmPath  = path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
  const SQL       = await initSqlJs({ locateFile: () => wasmPath });

  // Attempt to open a candidate buffer; returns the live sql.js Database or null.
  const tryOpen = (buf) => {
    if (!buf || buf.length < 512 || buf.toString('ascii', 0, 6) !== 'SQLite') return null;
    try { return new SQL.Database(buf); } catch { return null; }
  };

  if (fs.existsSync(DB_PATH)) {
    const buf = fs.readFileSync(DB_PATH);
    db = tryOpen(buf);
    if (!db) {
      // Primary file is corrupt or empty — before giving up, try the rolling
      // backup written by save() on the previous successful write. This is
      // the recovery path for power-loss/corruption scenarios: instead of
      // silently wiping the user's data and starting fresh, fall back to the
      // last known-good snapshot.
      const backupBuf = fs.existsSync(BACKUP_PATH) ? fs.readFileSync(BACKUP_PATH) : null;
      db = tryOpen(backupBuf);

      const badPath = DB_PATH + '.corrupt-' + Date.now();
      try { fs.renameSync(DB_PATH, badPath); } catch (_) {}

      if (db) {
        console.warn(`[db] Primary database was corrupt — recovered from backup (${BACKUP_PATH}). Corrupt file preserved at ${badPath}.`);
      } else {
        console.warn(`[db] Database file was corrupt or empty and no usable backup was found — backed up to ${badPath} and starting fresh.`);
        db = new SQL.Database();
      }
    }
  } else if (fs.existsSync(BACKUP_PATH)) {
    // Primary missing entirely (e.g. deleted mid-write before rename) — recover from backup.
    db = tryOpen(fs.readFileSync(BACKUP_PATH));
    if (db) {
      console.warn('[db] Primary database file was missing — recovered from backup.');
    } else {
      db = new SQL.Database();
    }
  } else {
    db = new SQL.Database();
  }
  createSchema();
  migrateSchema();

  // Initialise AI engine with DB helpers
  aiEngine = new FlowLedgerAI(db, { run, get, all });
}

function migrateSchema() {
  // Add new columns to existing DBs that pre-date them
  const migrations = [
    'ALTER TABLE clients ADD COLUMN monthly_retainer REAL DEFAULT 0',
    'ALTER TABLE clients ADD COLUMN included_hours REAL DEFAULT 0',
    'ALTER TABLE clients ADD COLUMN keywords TEXT',
    'ALTER TABLE clients ADD COLUMN billing_type TEXT DEFAULT "none"',
    'ALTER TABLE clients ADD COLUMN status TEXT DEFAULT "active"',
    // User profile fields
    'ALTER TABLE users ADD COLUMN first_name TEXT',
    'ALTER TABLE users ADD COLUMN last_name TEXT',
    'ALTER TABLE users ADD COLUMN company TEXT',
    'ALTER TABLE users ADD COLUMN industry TEXT',
    'ALTER TABLE users ADD COLUMN team_size TEXT',
    'ALTER TABLE users ADD COLUMN work_type TEXT',
    'ALTER TABLE users ADD COLUMN workspace_name TEXT',
    // Spotify integration
    `CREATE TABLE IF NOT EXISTS spotify_tokens (
      id INTEGER PRIMARY KEY,
      client_id TEXT,
      access_token TEXT,
      refresh_token TEXT,
      expires_at INTEGER
    )`,
  ];
  for (const sql of migrations) {
    try { db.run(sql); } catch (_) { /* column already exists */ }
  }
}

function save() {
  try {
    const data = db.export();
    const buf  = Buffer.from(data);

    // Sanity-check: refuse to overwrite a good database with an obviously bad export.
    // A valid SQLite file is at least 512 bytes and starts with the SQLite magic header.
    if (buf.length < 512 || buf.toString('ascii', 0, 6) !== 'SQLite') {
      console.error('[save] Skipping export — result looks invalid (size=%d). DB file preserved.', buf.length);
      return;
    }

    // Roll the current on-disk file into a one-generation-back backup *before*
    // overwriting it, so a power loss that corrupts the live file (or a bad
    // write that slips past the sanity check above) still leaves a recoverable
    // copy on disk. Only roll a backup when the existing file is itself valid,
    // so we never replace a good backup with a bad one.
    try {
      if (fs.existsSync(DB_PATH)) {
        const existing = fs.readFileSync(DB_PATH);
        if (existing.length >= 512 && existing.toString('ascii', 0, 6) === 'SQLite') {
          fs.writeFileSync(BACKUP_PATH, existing);
        }
      }
    } catch (_) { /* backup is best-effort, never block the primary save */ }

    // Atomic write: write to a temp file then rename, so a crash mid-write
    // cannot leave a partial/corrupt file at DB_PATH. fsync the temp file
    // before the rename so the bytes are actually flushed to stable storage —
    // without this, a sudden power-off can lose data that was only sitting in
    // the OS write cache even though writeFileSync had already "returned".
    const tmp = DB_PATH + '.tmp';
    const fd = fs.openSync(tmp, 'w');
    try {
      fs.writeSync(fd, buf);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmp, DB_PATH);

    // Best-effort: fsync the containing directory too, so the rename itself
    // (the directory entry update) survives a power cut. Not supported on
    // Windows (no directory file descriptors), so this is a no-op there.
    if (process.platform !== 'win32') {
      try {
        const dirFd = fs.openSync(path.dirname(DB_PATH), 'r');
        try { fs.fsyncSync(dirFd); } finally { fs.closeSync(dirFd); }
      } catch (_) {}
    }
  } catch (e) {
    console.error('[save] Failed to persist database:', e.message);
  }
}

function createSchema() {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      email TEXT,
      password_hash TEXT NOT NULL,
      daily_target_hours REAL DEFAULT 6,
      first_name TEXT,
      last_name TEXT,
      company TEXT,
      industry TEXT,
      team_size TEXT,
      work_type TEXT,
      workspace_name TEXT,
      created_at INTEGER DEFAULT (strftime('%s','now')),
      last_login INTEGER
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'General',
      project_id TEXT,
      client_id TEXT,
      title TEXT,
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      duration_seconds INTEGER,
      is_deep_work INTEGER DEFAULT 0,
      session_type TEXT DEFAULT 'focus',
      notes TEXT,
      context_switches INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS auto_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      app_name TEXT NOT NULL,
      window_title TEXT,
      url TEXT,
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      duration_seconds INTEGER NOT NULL DEFAULT 0,
      date_key TEXT NOT NULL,
      is_idle INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS app_usage (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      session_id TEXT,
      app_name TEXT NOT NULL,
      window_title TEXT,
      duration_seconds INTEGER NOT NULL DEFAULT 0,
      recorded_at INTEGER NOT NULL,
      date_key TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#6366f1',
      icon TEXT DEFAULT 'folder',
      session_type TEXT DEFAULT 'focus'
    );
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#3b82f6',
      client_id TEXT,
      hourly_rate REAL DEFAULT 0,
      active INTEGER DEFAULT 1,
      created_at INTEGER DEFAULT (strftime('%s','now'))
    );
    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      email TEXT,
      company TEXT,
      color TEXT DEFAULT '#6366f1',
      hourly_rate REAL DEFAULT 0,
      monthly_retainer REAL DEFAULT 0,
      included_hours REAL DEFAULT 0,
      active INTEGER DEFAULT 1,
      created_at INTEGER DEFAULT (strftime('%s','now'))
    );
    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      client_id TEXT NOT NULL,
      invoice_number TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      currency TEXT NOT NULL DEFAULT 'USD',
      issue_date INTEGER NOT NULL,
      due_date INTEGER,
      period_from INTEGER,
      period_to INTEGER,
      line_items_json TEXT NOT NULL DEFAULT '[]',
      subtotal REAL DEFAULT 0,
      tax_rate REAL DEFAULT 0,
      tax_amount REAL DEFAULT 0,
      total REAL DEFAULT 0,
      notes TEXT,
      created_at INTEGER DEFAULT (strftime('%s','now')),
      paid_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS goals (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      target_hours REAL NOT NULL,
      period TEXT NOT NULL DEFAULT 'daily',
      category TEXT,
      active INTEGER DEFAULT 1,
      created_at INTEGER DEFAULT (strftime('%s','now'))
    );
    CREATE TABLE IF NOT EXISTS streaks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      goal_id TEXT NOT NULL,
      current_streak INTEGER DEFAULT 0,
      longest_streak INTEGER DEFAULT 0,
      last_completed_date TEXT
    );
    CREATE TABLE IF NOT EXISTS focus_scores (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      date_key TEXT NOT NULL,
      score INTEGER DEFAULT 0,
      focus_seconds INTEGER DEFAULT 0,
      meeting_seconds INTEGER DEFAULT 0,
      break_seconds INTEGER DEFAULT 0,
      other_seconds INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#6366f1'
    );
    CREATE TABLE IF NOT EXISTS session_tags (
      session_id TEXT NOT NULL,
      tag_id TEXT NOT NULL,
      PRIMARY KEY (session_id, tag_id)
    );
    CREATE TABLE IF NOT EXISTS distraction_rules (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      rule_type TEXT NOT NULL DEFAULT 'app',
      pattern TEXT NOT NULL,
      label TEXT,
      active INTEGER DEFAULT 1,
      created_at INTEGER DEFAULT (strftime('%s','now'))
    );
    CREATE TABLE IF NOT EXISTS break_settings (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      enabled INTEGER DEFAULT 1,
      work_interval_mins INTEGER DEFAULT 52,
      break_duration_mins INTEGER DEFAULT 17,
      reminder_style TEXT DEFAULT 'gentle'
    );
    CREATE TABLE IF NOT EXISTS tracking_settings (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      auto_track INTEGER DEFAULT 1,
      start_on_login INTEGER DEFAULT 1,
      idle_threshold_secs INTEGER DEFAULT 60,
      blocked_attempts INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS tracking_exclusions (
      user_id TEXT PRIMARY KEY,
      app_blacklist TEXT NOT NULL DEFAULT '[]',
      website_blacklist TEXT NOT NULL DEFAULT '[]',
      private_apps TEXT NOT NULL DEFAULT '[]'
    );
    CREATE TABLE IF NOT EXISTS pending_entries (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      date_key TEXT NOT NULL,
      reviewed INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (strftime('%s','now'))
    );
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      project_id TEXT,
      client_id TEXT,
      status TEXT NOT NULL DEFAULT 'todo',
      priority INTEGER DEFAULT 3,
      keywords TEXT,
      due_date INTEGER,
      estimated_hours REAL,
      parent_task_id TEXT,
      total_seconds INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (strftime('%s','now')),
      updated_at INTEGER DEFAULT (strftime('%s','now'))
    );
    CREATE TABLE IF NOT EXISTS calendar_connections (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      label TEXT,
      ics_url TEXT NOT NULL,
      color TEXT DEFAULT '#3b82f6',
      last_synced INTEGER,
      created_at INTEGER DEFAULT (strftime('%s','now'))
    );
    CREATE TABLE IF NOT EXISTS calendar_events (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      connection_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      title TEXT NOT NULL,
      title_override TEXT,
      description TEXT,
      location TEXT,
      meeting_url TEXT,
      start_time INTEGER NOT NULL,
      end_time INTEGER NOT NULL,
      all_day INTEGER DEFAULT 0,
      attendees_json TEXT,
      color TEXT DEFAULT '#3b82f6',
      status TEXT DEFAULT 'confirmed',
      is_recurring INTEGER DEFAULT 0,
      synced_at INTEGER DEFAULT (strftime('%s','now'))
    );
    CREATE TABLE IF NOT EXISTS blocker_profiles (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      color TEXT DEFAULT '#7C6CF2',
      active INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (strftime('%s','now'))
    );

    CREATE TABLE IF NOT EXISTS ai_user_patterns (
      keyword TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      boost REAL DEFAULT 0.3,
      updated_at INTEGER DEFAULT (strftime('%s','now'))
    );

    CREATE TABLE IF NOT EXISTS ai_daily_scores (
      user_id TEXT NOT NULL,
      date_key TEXT NOT NULL,
      focus_score INTEGER DEFAULT 0,
      workflow_score INTEGER DEFAULT 0,
      distraction_resistance INTEGER DEFAULT 0,
      efficiency_score INTEGER DEFAULT 0,
      overall_score INTEGER DEFAULT 0,
      deep_work_mins INTEGER DEFAULT 0,
      distraction_mins INTEGER DEFAULT 0,
      updated_at INTEGER DEFAULT (strftime('%s','now')),
      PRIMARY KEY (user_id, date_key)
    );

    CREATE TABLE IF NOT EXISTS ai_switch_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      app_name TEXT,
      url TEXT,
      category TEXT,
      session_type TEXT,
      ts INTEGER DEFAULT (strftime('%s','now'))
    );

    CREATE TABLE IF NOT EXISTS ai_session_data (
      session_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      ai_label TEXT,
      ai_category TEXT,
      ai_session_type TEXT,
      ai_confidence REAL DEFAULT 0,
      ai_is_deep_work INTEGER DEFAULT 0,
      ai_workflow_name TEXT,
      ai_signals TEXT,
      created_at INTEGER DEFAULT (strftime('%s','now'))
    );
  `);

  // ── Schema migrations (idempotent) ──────────────────────────────────────────
  const tryAlter = (sql) => { try { db.run(sql); } catch (_) {} };
  tryAlter('ALTER TABLE clients      ADD COLUMN keywords     TEXT');
  tryAlter('ALTER TABLE clients      ADD COLUMN billing_type TEXT DEFAULT "none"');
  tryAlter('ALTER TABLE clients      ADD COLUMN status       TEXT DEFAULT "active"');
  tryAlter('ALTER TABLE clients      ADD COLUMN currency     TEXT DEFAULT "USD"');
  tryAlter('ALTER TABLE projects     ADD COLUMN keywords            TEXT');
  tryAlter('ALTER TABLE projects     ADD COLUMN status              TEXT DEFAULT "active"');
  tryAlter('ALTER TABLE projects     ADD COLUMN weekly_budget_hours REAL DEFAULT 0');
  tryAlter('ALTER TABLE projects     ADD COLUMN notes               TEXT');
  tryAlter('ALTER TABLE sessions     ADD COLUMN task_id      TEXT');
  // Auto-session project/client tagging (enables time aggregation per project/client)
  tryAlter('ALTER TABLE auto_sessions ADD COLUMN project_id  TEXT');
  tryAlter('ALTER TABLE auto_sessions ADD COLUMN client_id   TEXT');
  // Calendar event project/client assignment
  tryAlter('ALTER TABLE calendar_events ADD COLUMN project_id TEXT');
  tryAlter('ALTER TABLE calendar_events ADD COLUMN client_id  TEXT');
  tryAlter('ALTER TABLE calendar_events ADD COLUMN title_override TEXT');
  // Google OAuth columns for calendar_connections
  tryAlter('ALTER TABLE calendar_connections ADD COLUMN access_token  TEXT');
  tryAlter('ALTER TABLE calendar_connections ADD COLUMN refresh_token TEXT');
  tryAlter('ALTER TABLE calendar_connections ADD COLUMN token_expiry  INTEGER');
  tryAlter('ALTER TABLE calendar_connections ADD COLUMN account_email TEXT');
  tryAlter('ALTER TABLE calendar_connections ADD COLUMN google_cal_id TEXT');
  // Google OAuth app credentials (stored once, shared across all Google connections)
  db.run(`CREATE TABLE IF NOT EXISTS google_oauth_creds (
    id      INTEGER PRIMARY KEY CHECK (id = 1),
    client_id     TEXT NOT NULL,
    client_secret TEXT NOT NULL,
    created_at    INTEGER DEFAULT (strftime('%s','now'))
  )`);
  // Task priority and time estimate (added after initial release)
  tryAlter('ALTER TABLE tasks ADD COLUMN priority        INTEGER DEFAULT 3');
  tryAlter('ALTER TABLE tasks ADD COLUMN estimated_hours REAL');
  tryAlter('ALTER TABLE tasks ADD COLUMN parent_task_id  TEXT');
  // Task notes, reminder, and recurrence
  tryAlter('ALTER TABLE tasks ADD COLUMN notes           TEXT');
  tryAlter('ALTER TABLE tasks ADD COLUMN reminder_at     INTEGER');
  tryAlter('ALTER TABLE tasks ADD COLUMN recurrence_rule TEXT');
  tryAlter('ALTER TABLE sessions ADD COLUMN task_id TEXT');
  tryAlter('ALTER TABLE distraction_rules ADD COLUMN profile_id TEXT');
  tryAlter('ALTER TABLE blocker_profiles ADD COLUMN placeholder INTEGER DEFAULT 0');
  // Activity ratio for manual sessions (0-100; 100 = fully active, 0 = mostly away)
  tryAlter('ALTER TABLE sessions ADD COLUMN activity_ratio INTEGER DEFAULT 100');
  // AI engine columns
  tryAlter('ALTER TABLE auto_sessions ADD COLUMN ai_label TEXT');
  tryAlter('ALTER TABLE auto_sessions ADD COLUMN ai_category TEXT');
  tryAlter('ALTER TABLE auto_sessions ADD COLUMN ai_session_type TEXT');
  tryAlter('ALTER TABLE auto_sessions ADD COLUMN ai_confidence REAL DEFAULT 0');
  tryAlter('ALTER TABLE auto_sessions ADD COLUMN ai_is_deep_work INTEGER DEFAULT 0');
  tryAlter('ALTER TABLE auto_sessions ADD COLUMN ai_workflow_name TEXT');
  tryAlter('ALTER TABLE auto_sessions ADD COLUMN workflow_id TEXT');
  tryAlter('ALTER TABLE auto_sessions ADD COLUMN supporting_tools TEXT');
  tryAlter('ALTER TABLE auto_sessions ADD COLUMN ai_recommended_title TEXT');
  tryAlter('ALTER TABLE auto_sessions ADD COLUMN ai_recommended_description TEXT');
  // Distinct window titles seen across a merged/extended session block — without
  // this, window_title gets overwritten on every extend and the narrative writer
  // only ever sees the LATEST title, losing everything else done during the block.
  tryAlter("ALTER TABLE auto_sessions ADD COLUMN title_history TEXT DEFAULT '[]'");

  // Day planning mode
  db.run(`CREATE TABLE IF NOT EXISTS day_plans (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    date_key TEXT NOT NULL,
    plan_json TEXT NOT NULL DEFAULT '[]',
    created_at INTEGER DEFAULT (strftime('%s','now')),
    UNIQUE(user_id, date_key)
  )`);
  // Scheduled distraction blocking
  db.run(`CREATE TABLE IF NOT EXISTS block_schedules (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    label TEXT NOT NULL,
    profile_ids TEXT NOT NULL DEFAULT '[]',
    days_mask INTEGER NOT NULL DEFAULT 62,
    start_mins INTEGER NOT NULL DEFAULT 540,
    end_mins INTEGER NOT NULL DEFAULT 720,
    active INTEGER DEFAULT 1,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  )`);
  tryAlter('ALTER TABLE users ADD COLUMN slack_token TEXT');

  save();
}

// ─── KEYWORD MATCHING HELPER ──────────────────────────────────────────────────
// Used both at flush time (main.js) and in buildBlocks (renderer).
// Returns { projectId, clientId } or null.
function matchProjectClient(userId, appName, title, url) {
  if (!userId) return null;
  const text = [appName, title, url].filter(Boolean).join(' ').toLowerCase();

  const kwHit = (keywords) =>
    keywords
      ? keywords.split(',').some(kw => {
          const k = kw.trim().toLowerCase();
          return k.length >= 2 && text.includes(k);
        })
      : false;

  const projects = all(
    "SELECT id, name, keywords, client_id FROM projects WHERE user_id=? AND active=1",
    [userId]
  );
  for (const p of projects) {
    if (text.includes(p.name.toLowerCase()) || kwHit(p.keywords)) {
      return { projectId: p.id, clientId: p.client_id || null };
    }
  }

  const clients = all(
    "SELECT id, name, keywords FROM clients WHERE user_id=? AND active=1",
    [userId]
  );
  for (const c of clients) {
    if (text.includes(c.name.toLowerCase()) || kwHit(c.keywords)) {
      return { projectId: null, clientId: c.id };
    }
  }

  return null;
}

// ─── APP NAME ALIAS MAP ───────────────────────────────────────────────────────
// Maps user-friendly app names to their actual OS process names (Windows-first).
// Keys are lowercase; values are pipe-separated regex alternatives.
function logWorkflowPersistence(event, payload = {}) {
  console.debug('[WORKFLOW]', event, { ts: Date.now(), event, ...payload });
}

function parseSupportingTools(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return String(raw).split(',').map(s => s.trim()).filter(Boolean);
  }
}

function mergeSupportingTools(existingRaw, activeWorkflow, appName) {
  const tools = new Set(parseSupportingTools(existingRaw).map(normalizeToolName).filter(Boolean));
  for (const tool of activeWorkflow?.supportingTools || []) {
    const normalized = normalizeToolName(tool);
    if (normalized) tools.add(normalized);
  }
  const current = normalizeToolName(appName);
  if (current) tools.add(current);
  return JSON.stringify([...tools]);
}

function findWorkflowSessionToExtend(userId, workflowId) {
  if (!workflowId) return null;
  return get(
    `SELECT id, started_at, ended_at, duration_seconds, project_id, client_id, supporting_tools
       FROM auto_sessions
      WHERE user_id=? AND workflow_id=?
      ORDER BY ended_at DESC
      LIMIT 1`,
    [userId, workflowId]
  );
}

function shouldInsertWorkflowSession({ ownership, existingWorkflowSession, workflowSplit, flushReason }) {
  if (existingWorkflowSession) return false;
  if (workflowSplit) return true;
  if (ownership?.extendSession) return true; // first persisted segment for this workflow
  if (ownership?.createNewSession) return true;
  return ownership?.reason === 'no_active_workflow' && !flushReason;
}

function getProjectClientNames(projectId, clientId) {
  let projectName = null;
  let clientName = null;
  try {
    if (projectId) projectName = get('SELECT name FROM projects WHERE id=?', [projectId])?.name || null;
    if (clientId) clientName = get('SELECT name FROM clients WHERE id=?', [clientId])?.name || null;
  } catch (_) {}
  return { projectName, clientName };
}

function buildAutoSessionNarrative(rows = [], { projectId = null, clientId = null, fallbackTitle = null } = {}) {
  if (!aiEngine || !rows.length) return { title: fallbackTitle || null, description: null };
  try {
    const mapped = rows
      .filter(Boolean)
      .map(row => ({
        ...row,
        category_key: row.category_key || row.ai_category || row.ai_session_type || 'focus',
        duration: row.duration || row.duration_seconds || 0,
      }));
    const { projectName, clientName } = getProjectClientNames(projectId, clientId);
    const summary = aiEngine.summarizeSession(mapped, projectName, clientName);
    return {
      title: summary?.name || summary?.workflowName || fallbackTitle || null,
      description: summary?.description || null,
    };
  } catch (e) {
    console.error('[AI] Auto-session narrative failed:', e.message);
    return { title: fallbackTitle || null, description: null };
  }
}

const APP_NAME_ALIASES = {
  // Microsoft Office — Office apps use internal codenames as process names
  'powerpoint':     'powerpnt|powerpoint',
  'excel':          'excel',
  'word':           'winword|word',
  'onenote':        'onenote',
  'outlook':        'outlook',
  'access':         'msaccess|access',
  'publisher':      'mspub|publisher',
  'visio':          'visio',
  'project':        'winproj|msproject',
  // Microsoft 365 / Teams
  'teams':          'teams|msteams',
  'microsoft teams':'teams|msteams',
  // Browsers
  'edge':           'msedge|edge',
  'google chrome':  'chrome',
  'firefox':        'firefox',
  'brave':          'brave',
  'opera':          'opera|opera_gx',
  'opera gx':       'opera_gx|opera',
  // Communication
  'discord':        'discord',
  'slack':          'slack',
  'skype':          'skype',
  'telegram':       'telegram',
  'signal':         'signal',
  'whatsapp':       'whatsapp',
  'zoom':           'zoom',
  'webex':          'ciscowebexstart|webex',
  // Entertainment
  'spotify':        'spotify',
  'vlc':            'vlc',
  'itunes':         'itunes',
  // Games / launchers
  'steam':          'steam',
  'epic games':     'epicgameslauncher|epicgames',
  'epicgames':      'epicgameslauncher|epicgames',
  'battlenet':      'battlenet|battle\\.net',
  'battle.net':     'battlenet|battle\\.net',
  'origin':         'origin',
  'ea app':         'eadesktop|eaapp',
  'gog galaxy':     'galaxyclient',
  // Creative / design
  'photoshop':      'photoshop',
  'illustrator':    'illustrator',
  'premiere':       'premiere',
  'after effects':  'afterfx',
  'lightroom':      'lightroom',
  'figma':          'figma',
  // Dev tools
  'vscode':         'code|vscode',
  'vs code':        'code|vscode',
  'visual studio':  'devenv',
  'notepad++':      'notepad\\+\\+',
  'intellij':       'idea|intellij',
  'pycharm':        'pycharm',
  // Productivity
  'notion':         'notion',
  'obsidian':       'obsidian',
  'evernote':       'evernote',
};

// Expands a user-entered pattern (e.g. "powerpoint|excel") into a regex pattern
// that also matches the actual OS process names (e.g. "powerpnt|powerpoint|excel").
function expandAppPattern(userPattern) {
  const parts = userPattern.split('|').map(p => p.trim()).filter(Boolean);
  const expanded = [];
  for (const part of parts) {
    const alias = APP_NAME_ALIASES[part.toLowerCase()];
    if (alias) {
      alias.split('|').forEach(a => expanded.push(a));
    } else {
      expanded.push(part);
    }
  }
  return [...new Set(expanded)].join('|');
}

// ─── DATE HELPERS ─────────────────────────────────────────────────────────────
// Always use LOCAL calendar date, never UTC — prevents "work shows up tomorrow"
// for users in timezones ahead of UTC (e.g. UTC+5:30 at 11 PM local = next UTC day).
function localDateKey(ts) {
  const d = ts ? new Date(ts * 1000) : new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

// ─── SQL HELPERS ──────────────────────────────────────────────────────────────
function run(sql, params = []) { db.run(sql, params); save(); }

function get(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  if (stmt.step()) { const r = stmt.getAsObject(); stmt.free(); return r; }
  stmt.free();
  return undefined;
}

function all(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

// ─── AUTO-TRACKER SETUP ──────────────────────────────────────────────────────
function startAutoTracker(userId) {
  if (tracker) { tracker.stop(); tracker = null; }
  if (afSession) {
    ensureActiveAfTracking('tracker_restart_active_session');
  } else {
    afReset();
  }
  currentUserId = userId;

  tracker = new AutoTracker({
    getIdleTime: () => {
      try { return powerMonitor.getSystemIdleTime(); } catch { return 0; }
    },

    isBlocked: (appName, windowTitle) => {
      if (!focusModeActive || !userId) return false;
      const profileClause = focusRuleScope === 'profile'
        ? (focusProfileId ? 'AND dr.profile_id=?' : 'AND 1=0')
        : 'AND dr.profile_id IS NULL';
      const params = focusRuleScope === 'profile' && focusProfileId ? [userId, focusProfileId] : [userId];
      const rules = all(
        `SELECT dr.* FROM distraction_rules dr
         LEFT JOIN blocker_profiles bp ON dr.profile_id = bp.id
         WHERE dr.user_id=? AND dr.active=1 AND dr.rule_type='app'
         ${profileClause}`,
        params
      );
      return rules.some(r => {
        // Expand user-friendly name (e.g. "powerpoint") to actual process patterns (e.g. "powerpnt|powerpoint")
        const expandedPattern = expandAppPattern(r.pattern);
        try {
          const re = new RegExp(expandedPattern, 'i');
          // Match against process name first, then fall back to window title
          if (re.test(appName)) return true;
          if (windowTitle && re.test(windowTitle)) return true;
          // Also test original pattern against window title (catches "- PowerPoint" suffixes)
          return windowTitle ? new RegExp(r.pattern, 'i').test(windowTitle) : false;
        } catch {
          return appName.toLowerCase().includes(r.pattern.toLowerCase()) ||
            (windowTitle && windowTitle.toLowerCase().includes(r.pattern.toLowerCase()));
        }
      });
    },

    onActivity: ({ appName, title, url, duration, flush, workflowId, workflowName, workflowSplit, flushReason }) => {
      if (!userId) return;
      const now     = Math.floor(Date.now() / 1000);
      // Use session START time for date bucketing — prevents late-night sessions
      // (started April 30, flushed May 1 after midnight) from landing on the wrong date.
      const dateKey = (flush && duration) ? localDateKey(now - duration) : localDateKey();

      // Check for an active confirmed calendar event RIGHT NOW.
      // Drives both the heartbeat "inCalEvent" field and the flush-guard below.
      let activeCalEvent = null;
      if (currentUserId && db) {
        try {
          activeCalEvent = get(
            `SELECT id, title, end_time FROM calendar_events
             WHERE user_id=? AND status='confirmed'
             AND start_time <= ? AND end_time > ?
             LIMIT 1`,
            [currentUserId, now, now]
          ) || null;
        } catch (_) {}
      }

      // Notify renderer with live heartbeat + real-time AI classification
      if (!flush && mainWindow) {
        let liveAI = {};
        if (aiEngine) {
          try {
            const cls = aiEngine.classifyActivity(appName, url || '', title || '');
            const focus = aiEngine.analyzeFocus(appName, url || '', cls.categoryKey);
            liveAI = {
              category:    cls.category,
              categoryKey: cls.categoryKey,
              sessionType: cls.sessionType,
              deepWork:    cls.deepWork,
              confidence:  cls.confidence,
              color:       cls.color,
              focusScore:  focus.score,
              focusState:  focus.state,
              switchRate:  focus.switchRate,
            };
          } catch (_) {}
        }
        mainWindow.webContents.send('tracker:heartbeat', {
          appName, title, url, ai: liveAI,
          // Renderer uses this to display "In Meeting" and suppress focus timer
          inCalEvent: activeCalEvent
            ? { id: activeCalEvent.id, title: activeCalEvent.title, endTime: activeCalEvent.end_time }
            : null,
        });

        // ── Meeting auto-detection ───────────────────────────────────────────
        const isMeetingApp = MEETING_APPS_RE.test(appName) ||
          (url && MEETING_URL_RE.test(url));
        if (isMeetingApp) {
          if (!meetingTrack || meetingTrack.app !== appName) {
            meetingTrack = { app: appName, startMs: Date.now(), fired: false };
          } else if (!meetingTrack.fired) {
            const secsInMeeting = (Date.now() - meetingTrack.startMs) / 1000;
            if (secsInMeeting >= MEETING_CONFIRM_SECS) {
              meetingTrack.fired = true;
              if (mainWindow) {
                mainWindow.webContents.send('meeting:detected', {
                  appName: meetingTrack.app,
                  durationSecs: Math.round(secsInMeeting),
                });
              }
            }
          }
        } else {
          meetingTrack = null;
        }

        // ── Persistent auto-focus state machine ──────────────────────────────
        // Suppress buffering/tracking while a confirmed calendar event is live.
        if (activeCalEvent) {
          if (afSession) closeAutoFocusSession('cal_event');
          else if (afState === 'buffering') {
            clearAfBuffer('cal_event');
            setAfState('watching', 'cal_event');
            afBroadcast();
          }
        } else {
          runAutoFocusMachine(appName, liveAI);
        }
      }

      // On flush: persist auto-session + aggregate into app_usage
      if (flush && duration >= 3) {
        const sessionStart = now - duration;

        // ── Calendar event overlap guard ────────────────────────────────────
        // If ANY confirmed calendar event overlaps this auto-session's time range,
        // discard the auto-session entirely. Scheduled events and auto-tracked
        // sessions must remain separate and non-overlapping.
        const overlappingEvent = get(
          `SELECT id FROM calendar_events
           WHERE user_id=? AND status='confirmed'
           AND start_time < ? AND end_time > ?
           LIMIT 1`,
          [userId, now, sessionStart]
        );
        if (overlappingEvent) {
          // Drop this auto-session — it falls inside a scheduled calendar event.
          // End active workflow — calendar interruption is a hard workflow split.
          trackingWorkflowManager.endActiveWorkflow('calendar_interruption');
          if (mainWindow) {
            mainWindow.webContents.send('tracker:activity', { appName, title, url, duration, dateKey, skipped: true });
          }
          return;
        }

        // ── Tracking exclusions ────────────────────────────────────────────
        const appNameLower = appName.toLowerCase();

        // App blacklist — never record these apps at all
        if (trackingExclusions.appBlacklist.some(b => appNameLower.includes(b))) return;

        // Website blacklist — never record sessions from these domains
        if (url) {
          const urlLower = url.toLowerCase();
          if (trackingExclusions.websiteBlacklist.some(d => urlLower.includes(d))) return;
        }

        // Private mode apps — record time totals (auto_sessions) but skip app_usage
        const isPrivateApp = trackingExclusions.privateModeApps.some(a => appNameLower.includes(a));

        // Auto-assign project/client via keyword matching
        const match = matchProjectClient(userId, appName, title, url);

        // Higher-priority: check if a calendar event WITH a project assignment
        // overlaps this session. Calendar context beats keyword matching.
        const calEvent = get(
          `SELECT project_id, client_id FROM calendar_events
           WHERE user_id=? AND project_id IS NOT NULL
           AND start_time<=? AND end_time>=?
           ORDER BY start_time DESC LIMIT 1`,
          [userId, sessionStart, now]
        );
        const finalProjectId = calEvent?.project_id || match?.projectId || null;
        const finalClientId  = calEvent?.client_id  || match?.clientId  || null;

        // ── AI classification ──────────────────────────────────────────────
        let aiLabel = null, aiCategory = null, aiSessionType = null;
        let aiConfidence = 0, aiIsDeepWork = 0;
        let aiSignals = null;
        const activeWorkflow = trackingWorkflowManager.getActiveWorkflow();
        const resolvedWorkflowId = workflowId || activeWorkflow?.id || null;
        const aiWorkflowName = workflowName || activeWorkflow?.name || null;

        if (aiEngine) {
          try {
            const cls = aiEngine.classifyActivity(appName, url || '', title || '');
            aiLabel       = cls.label;
            aiCategory    = cls.category;
            aiSessionType = cls.sessionType;
            aiConfidence  = cls.confidence;
            aiIsDeepWork  = cls.deepWork ? 1 : 0;
            aiSignals     = JSON.stringify(cls.signals || []);

            // Record for focus analysis (app switches)
            aiEngine.recordSwitch(appName, url || '', Date.now() - duration * 1000);

            // Persist switch event for behavioral analytics
            aiEngine.persistSwitchEvent(userId, appName, url || '', cls.categoryKey, cls.sessionType);

            // Detect & send distraction alert if warranted
            const dist = aiEngine.detectDistraction(appName, url || '', title || '');
            if (dist.isDistracted && mainWindow) {
              mainWindow.webContents.send('ai:distractionAlert', {
                score: dist.score,
                patterns: dist.patterns,
                recommendation: dist.recommendation,
                appName,
              });
            }
          } catch (e) {
            // AI errors are non-fatal — tracking continues
          }
        }

        const ownership = trackingWorkflowManager.resolveSessionOwnership(
          {
            appName,
            title,
            url: url || '',
            timestamp: now * 1000,
            duration_seconds: duration,
          },
          finalProjectId ? { id: finalProjectId } : null,
          {
            workflowId: resolvedWorkflowId,
            workflowSplit: !!workflowSplit,
            workflowMerged: /WORKFLOW_MERGED/i.test(String(flushReason || '')),
            flushReason: flushReason || null,
          }
        );
        const existingWorkflowSession = resolvedWorkflowId && !workflowSplit
          ? findWorkflowSessionToExtend(userId, resolvedWorkflowId)
          : null;
        const shouldInsertSession = shouldInsertWorkflowSession({
          ownership,
          existingWorkflowSession,
          workflowSplit: !!workflowSplit,
          flushReason,
        });

        let id = existingWorkflowSession?.id || uuidv4();
        if (existingWorkflowSession) {
          const supportingTools = mergeSupportingTools(existingWorkflowSession.supporting_tools, activeWorkflow, appName);

          // window_title gets overwritten below on every extend, so without this the
          // narrative writer would only ever see the LATEST title and lose everything
          // else done earlier in this merged session block. title_history recovers it.
          const existingRow = get('SELECT * FROM auto_sessions WHERE id=?', [id]);
          const priorTitles = parseTitleHistory(existingRow?.title_history)
            .filter(t => t.toLowerCase() !== (title || '').toLowerCase());
          // No exact per-title timing is tracked, so split the session's elapsed
          // duration evenly across prior titles as a reasonable approximation —
          // enough for the time-weighted phrase ranking to consider them.
          const nominalDur = priorTitles.length
            ? Math.max(30, Math.floor((existingRow?.duration_seconds || 0) / (priorTitles.length + 1)))
            : 0;
          const historyRows = priorTitles.map(t => ({
            app_name: existingRow?.app_name || appName,
            window_title: t,
            duration_seconds: nominalDur,
            ai_category: existingRow?.ai_category,
          }));

          const narrativeRows = historyRows.concat([existingRow].filter(Boolean)).concat({
            app_name: appName,
            window_title: title || '',
            url: url || null,
            duration_seconds: duration,
            ai_category: aiCategory,
            ai_session_type: aiSessionType,
            ai_label: aiLabel,
          });
          const narrative = buildAutoSessionNarrative(narrativeRows, {
            projectId: finalProjectId || existingWorkflowSession.project_id || null,
            clientId: finalClientId || existingWorkflowSession.client_id || null,
            fallbackTitle: aiWorkflowName || aiLabel || appName,
          });
          const newTitleHistory = pushTitleHistory(existingRow?.title_history, title || '', 10);
          logWorkflowPersistence(WORKFLOW_EVENTS.SESSION_CREATION_BLOCKED, {
            sessionId: id,
            workflowId: resolvedWorkflowId,
            appName,
            reason: ownership.reason || flushReason || 'workflow_continuity',
            confidence: ownership.confidence,
          });
          run(
            `UPDATE auto_sessions
                SET ended_at=?,
                    duration_seconds=duration_seconds+?,
                    window_title=?,
                    url=COALESCE(?, url),
                    project_id=COALESCE(project_id, ?),
                    client_id=COALESCE(client_id, ?),
                    ai_label=COALESCE(?, ai_label),
                    ai_category=COALESCE(?, ai_category),
                    ai_session_type=COALESCE(?, ai_session_type),
                    ai_confidence=MAX(COALESCE(ai_confidence,0), ?),
                    ai_is_deep_work=MAX(COALESCE(ai_is_deep_work,0), ?),
                    ai_workflow_name=COALESCE(?, ai_workflow_name),
                    workflow_id=?,
                    supporting_tools=?,
                    ai_recommended_title=COALESCE(?, ai_recommended_title),
                    ai_recommended_description=COALESCE(?, ai_recommended_description),
                    title_history=?
              WHERE id=?`,
            [now, duration, title || '', url || null, finalProjectId, finalClientId,
             aiLabel, aiCategory, aiSessionType, aiConfidence, aiIsDeepWork, aiWorkflowName,
             resolvedWorkflowId, supportingTools, narrative.title, narrative.description,
             newTitleHistory, id]
          );
          logWorkflowPersistence(WORKFLOW_EVENTS.SESSION_EXTENDED, {
            sessionId: id,
            workflowId: resolvedWorkflowId,
            appName,
            duration,
            confidence: ownership.confidence,
          });
          logWorkflowPersistence(WORKFLOW_EVENTS.EXTENDED, {
            workflowId: resolvedWorkflowId,
            sessionId: id,
            appName,
            supportingTools: JSON.parse(supportingTools),
          });
        } else if (shouldInsertSession) {
          const supportingTools = mergeSupportingTools(null, activeWorkflow, appName);
          const narrative = buildAutoSessionNarrative([{
            app_name: appName,
            window_title: title || '',
            url: url || null,
            duration_seconds: duration,
            ai_category: aiCategory,
            ai_session_type: aiSessionType,
            ai_label: aiLabel,
          }], {
            projectId: finalProjectId,
            clientId: finalClientId,
            fallbackTitle: aiWorkflowName || aiLabel || appName,
          });
          logWorkflowPersistence(WORKFLOW_EVENTS.SESSION_CREATION_ALLOWED, {
            workflowId: resolvedWorkflowId,
            appName,
            reason: workflowSplit
              ? 'workflow_split'
              : (ownership.reason === 'no_active_workflow' ? 'first_session_without_active_workflow' : 'first_session_for_workflow'),
            confidence: ownership.confidence,
          });
          run(
            `INSERT INTO auto_sessions
               (id,user_id,app_name,window_title,url,started_at,ended_at,duration_seconds,
                date_key,project_id,client_id,
                ai_label,ai_category,ai_session_type,ai_confidence,ai_is_deep_work,ai_workflow_name,workflow_id,supporting_tools,
                ai_recommended_title,ai_recommended_description,title_history)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [id, userId, appName, title || '', url || null, now - duration, now, duration,
             dateKey, finalProjectId, finalClientId,
             aiLabel, aiCategory, aiSessionType, aiConfidence, aiIsDeepWork, aiWorkflowName, resolvedWorkflowId, supportingTools,
             narrative.title, narrative.description, JSON.stringify(title ? [title] : [])]
          );
        } else {
          logWorkflowPersistence(WORKFLOW_EVENTS.SESSION_CREATION_BLOCKED, {
            workflowId: resolvedWorkflowId,
            appName,
            reason: ownership.reason || flushReason || 'workflow_owned_without_insert',
            confidence: ownership.confidence,
          });
          return;
        }

        // Persist AI session metadata separately for rich queries
        if (aiEngine && aiLabel) {
          try {
            run(
              `INSERT OR REPLACE INTO ai_session_data
                 (session_id, user_id, ai_label, ai_category, ai_session_type,
                  ai_confidence, ai_is_deep_work, ai_signals)
               VALUES (?,?,?,?,?,?,?,?)`,
              [id, userId, aiLabel, aiCategory, aiSessionType,
               aiConfidence, aiIsDeepWork, aiSignals]
            );
          } catch (_) {}
        }

        // Upsert into app_usage aggregates — skipped for private-mode apps
        if (!isPrivateApp) {
          const existing = get(
            'SELECT id, duration_seconds FROM app_usage WHERE user_id=? AND app_name=? AND date_key=? AND session_id IS NULL',
            [userId, appName, dateKey]
          );
          if (existing) {
            run('UPDATE app_usage SET duration_seconds=? WHERE id=?', [existing.duration_seconds + duration, existing.id]);
          } else {
            run('INSERT INTO app_usage (id,user_id,app_name,window_title,duration_seconds,recorded_at,date_key) VALUES (?,?,?,?,?,?,?)',
              [uuidv4(), userId, appName, title || '', duration, now, dateKey]);
          }
        }

        if (mainWindow) {
          mainWindow.webContents.send('tracker:activity', {
            appName, title, url, duration, dateKey,
            workflowId: resolvedWorkflowId,
            workflowName: aiWorkflowName,
            workflowSplit: !!workflowSplit,
            flushReason: flushReason || null,
          });
        }
      }
    },

    getProject: () => {
      if (!userId || !db) return null;
      try {
        const now = Math.floor(Date.now() / 1000);
        const calEvent = get(
          `SELECT project_id FROM calendar_events
           WHERE user_id=? AND project_id IS NOT NULL
           AND start_time<=? AND end_time>=?
           ORDER BY start_time DESC LIMIT 1`,
          [userId, now, now]
        );
        if (calEvent?.project_id) {
          const p = get('SELECT id, name FROM projects WHERE id=?', [calEvent.project_id]);
          if (p) return p;
        }
      } catch (_) {}
      return null;
    },

    onIdle: () => {
      if (mainWindow) mainWindow.webContents.send('tracker:idle', {});

      // AF: buffer was pending but user went idle — just reset, no session yet
      if (afState === 'buffering' && !afSession) {
        clearAfBuffer('idle_before_session');
        setAfState('watching', 'idle_before_session');
        afBroadcast();
      // AF: session running — arm the idle-stop countdown
      } else if (ensureActiveAfTracking('idle_active_session') && !afIdleTimer) {
        afIdleTimer = setTimeout(() => {
          afIdleTimer = null;
          if (!ensureActiveAfTracking('idle_timeout_guard')) return;
          closeAutoFocusSession('idle');
        }, AF_IDLE_STOP_SECS * 1000);
      }
    },

    onResume: () => {
      if (mainWindow) mainWindow.webContents.send('tracker:resume', {});

      // AF: user came back — cancel any pending idle-stop immediately
      if (afIdleTimer) { clearTimeout(afIdleTimer); afIdleTimer = null; }
      if (ensureActiveAfTracking('resume_active_session')) {
        afBroadcast('resume_active_session');
      } else if (afState === 'paused') {
        setAfState('watching', 'resume_without_session');
        afBroadcast();
      }
    },

    onBlocked: (appName) => {
      // Increment blocked attempts counter
      if (userId) {
        run('UPDATE tracking_settings SET blocked_attempts = blocked_attempts + 1 WHERE user_id=?', [userId]);
      }

      // ── Force-close the blocked app (process-level kill) ──────────────
      try {
        // Build the full set of process names to kill: the raw detected name
        // plus any alias expansions (handles POWERPNT ↔ powerpoint, etc.)
        const safeApp = appName.replace(/[^a-zA-Z0-9.\-_ ]/g, '');
        const aliasExpanded = expandAppPattern(appName); // may add extra alternatives
        const processNames = [...new Set([safeApp, ...aliasExpanded.split('|').map(p => p.replace(/[^a-zA-Z0-9.\-_ ]/g, '')).filter(Boolean)])];

        if (process.platform === 'win32') {
          processNames.forEach(name => {
            exec(`taskkill /IM "${name}.exe" /F`, () => {});
            exec(`taskkill /IM "${name}" /F`,     () => {});
          });
        } else if (process.platform === 'darwin') {
          processNames.forEach(name => {
            exec(`osascript -e 'tell application "${name}" to quit'`, () => {
              setTimeout(() => exec(`pkill -ix "${name}"`, () => {}), 2000);
            });
          });
        } else {
          processNames.forEach(name => exec(`pkill -ix "${name}"`, () => {}));
        }
      } catch {}

      // Show native notification (one per cooldown window — tracker enforces this)
      try {
        new Notification({
          title: '🚫 Distraction Blocked',
          body: `${appName} is blocked during Focus Mode. Stay focused!`,
          icon: getNotifIcon(),
          silent: false,
        }).show();
      } catch {}

      // Also send to renderer
      if (mainWindow) {
        mainWindow.webContents.send('tracker:blocked', { appName });
      }
    },
  });

  tracker.start();
}

function enableStartOnLogin(userId) {
  try {
    app.setLoginItemSettings({ openAtLogin: true });
  } catch {}

  if (!userId) return;
  const existing = get('SELECT id FROM tracking_settings WHERE user_id=?', [userId]);
  if (existing) {
    run('UPDATE tracking_settings SET start_on_login=1 WHERE user_id=?', [userId]);
  } else {
    run('INSERT INTO tracking_settings (id,user_id,auto_track,start_on_login,idle_threshold_secs) VALUES (?,?,?,?,?)',
      [uuidv4(), userId, 1, 1, 60]);
  }
}

function startUserServices(userId) {
  enableStartOnLogin(userId);
  loadTrackingExclusions(userId);

  const trackSettings = get('SELECT * FROM tracking_settings WHERE user_id=?', [userId]);
  if (!trackSettings || trackSettings.auto_track !== 0) {
    startAutoTracker(userId);
  } else {
    currentUserId = userId;
  }
  scheduleBreakReminder(userId);
  startAiAnalysis(userId);
  startTaskNotifications(userId);  // daily digest, overdue alerts, yesterday summary

  // Start watching for scheduled sessions that are currently in-progress.
  // The watcher pushes tracker:scheduledSession events to the renderer so the
  // dock widget can show progress without the renderer polling.
  if (mainWindow) startScheduledSessionWatcher(mainWindow, userId);
}

// ─── CHROME EXTENSION HTTP BRIDGE ────────────────────────────────────────────
// Runs on localhost:27314
// - GET /status   → returns { focusMode, blockedSites }
// - POST /activity → receives { url, title, appName }
// - POST /blocked  → receives { url } (extension signals a block was shown)

const HTTP_PORT = 27314;

function startHttpServer() {
  if (httpServer) return;

  httpServer = http.createServer((req, res) => {
    // CORS for Chrome extension
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    if (req.method === 'GET' && req.url === '/status') {
      // Return focus mode state + flattened list of blocked hostnames
      // Only active URL rules for the current user; empty list when focus is off
      let blockedSites = [];
      if (focusModeActive && currentUserId) {
        const profileClause = focusRuleScope === 'profile'
          ? (focusProfileId ? 'AND dr.profile_id=?' : 'AND 1=0')
          : 'AND dr.profile_id IS NULL';
        const params = focusRuleScope === 'profile' && focusProfileId ? [currentUserId, focusProfileId] : [currentUserId];
        const rules = all(
          `SELECT dr.pattern FROM distraction_rules dr
           LEFT JOIN blocker_profiles bp ON dr.profile_id = bp.id
           WHERE dr.user_id=? AND dr.active=1 AND dr.rule_type='url'
           ${profileClause}`,
          params
        );
        // Patterns can be "twitter\\.com|facebook\\.com" → split by | and clean to plain hostnames
        rules.forEach(r => {
          r.pattern.split('|').forEach(raw => {
            // Strip regex escapes and leading/trailing whitespace, extract domain
            const domain = raw.trim().replace(/\\\./g, '.').replace(/^www\\./, '').replace(/^[^a-zA-Z0-9]/, '');
            if (domain) blockedSites.push(domain.toLowerCase());
          });
        });
        blockedSites = [...new Set(blockedSites)]; // dedupe
      }
      res.writeHead(200);
      res.end(JSON.stringify({ focusMode: focusModeActive, blockedSites, profileId: focusProfileId, ruleScope: focusRuleScope }));
      return;
    }

if (req.method === 'POST') {
  let body = '';

  req.on('data', (d) => {
    body += d;
  });

  req.on('end', () => {
    try {
      const data = JSON.parse(body);

      // ─── ACTIVITY TRACKING ─────────────────────────────
      // Only inject URL into the tracker — the tracker handles persistence on flush.
      // Writing directly here too caused duplicate auto_sessions entries.
      if (req.url === '/activity') {
        if (data.url && !data.url.startsWith('chrome://') && !data.url.startsWith('chrome-extension://')) {
          tracker?.injectBrowserUrl(
            data.appName || 'Google Chrome',
            data.url,
            data.title || ''
          );
        }
      }

      // ─── BLOCKED TRACKING ─────────────────────────────
      if (req.url === '/blocked' && currentUserId) {
        run(
          'UPDATE tracking_settings SET blocked_attempts = blocked_attempts + 1 WHERE user_id=?',
          [currentUserId]
        );

        if (mainWindow) {
          mainWindow.webContents.send('tracker:blocked', { url: data.url });
        }
      }

      res.writeHead(200);
      res.end(JSON.stringify({ ok: true }));

    } catch (err) {
      console.error("❌ JSON ERROR:", err);

      res.writeHead(400);
      res.end(JSON.stringify({ error: 'Bad JSON' }));
    }
  });

  return;
}

    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  httpServer.listen(HTTP_PORT, '0.0.0.0', () => {
    // HTTP server ready — Chrome extension can now connect
  });

  httpServer.on('error', () => {
    // Port in use — another instance running, ignore
  });
}

// ─── FLOW STATE DETECTION ─────────────────────────────────────────────────────
function scheduleFlowState(sessionTitle) {
  clearTimeout(flowStateTimeout);
  const FLOW_MS = 25 * 60 * 1000; // 25 minutes
  flowStateTimeout = setTimeout(() => {
    const title = sessionTitle || 'Your session';
    const body  = `${title} — 25 minutes in. Deep focus mode active. Keep going!`;
    // Native OS notification
    try {
      new Notification({ title: '🌊 Flow State Reached', body, icon: getNotifIcon() }).show();
    } catch (e) { /* notifications unavailable */ }
    // Also push to in-app notification centre
    if (mainWindow) {
      mainWindow.webContents.send('session:flowState', { sessionTitle: title });
    }
  }, FLOW_MS);
}

// ─── BREAK REMINDER ───────────────────────────────────────────────────────────
// snoozeMs lets a caller (e.g. the "Snooze 10m" button) override the normal
// work-interval delay with a short one-off wait instead.

// Tracks the currently-shown native break notification so a second reminder
// (e.g. a fast re-schedule) closes the stale one instead of stacking duplicates.
let pendingBreakNotification = null;
// Renderer's "Desktop notifications" master toggle (prefs.desktopNotifications),
// synced down via the 'prefs:syncDesktopNotif' IPC call below. Defaults to true
// (matches DEFAULT_PREFS) so reminders work before the renderer's first sync.
let rendererWantsDesktopNotif = true;
// Only surface the "desktop notifications unavailable" notice once per app
// run — it would be noisy to repeat it on every single break interval.
let breakNotifUnavailableNotified = false;

ipcMain.handle('prefs:syncDesktopNotif', (_, { enabled } = {}) => {
  rendererWantsDesktopNotif = enabled !== false;
  return { success: true };
});

/**
 * Fire a break reminder as a native OS notification (Windows toast / macOS
 * banner / Linux notification), so it appears even while Flow Ledger is
 * minimized or sitting in the system tray — no in-app popup is shown unless
 * the user actually clicks it, or native notifications aren't available.
 */
function fireBreakReminder(userId, payload) {
  // Prevent duplicate notifications for the same reminder cycle.
  if (pendingBreakNotification) {
    try { pendingBreakNotification.close(); } catch {}
    pendingBreakNotification = null;
  }

  const osSupportsNotif = Notification.isSupported();
  const useNative = osSupportsNotif && rendererWantsDesktopNotif;

  if (useNative) {
    const intensityLabel = payload.intensity >= 70 ? 'High-intensity' : payload.intensity >= 40 ? 'Focused' : 'Light';
    const notif = new Notification({
      title: '☕ Time for a Break — Flow Ledger',
      body:  `${intensityLabel} ${payload.activeMins}-min stretch. Recharge for ${payload.duration} min.`,
      icon:  getNotifIcon(),
      silent: false,
    });
    // Clicking the toast brings the app forward and opens the break card —
    // it never appears unprompted while the window is hidden/minimized.
    notif.on('click', () => {
      showMainWindow();
      mainWindow?.webContents.send('break:reminder', payload);
    });
    notif.on('close', () => {
      if (pendingBreakNotification === notif) pendingBreakNotification = null;
    });
    notif.show();
    pendingBreakNotification = notif;
  } else if (mainWindow) {
    // Graceful fallback: OS-level notifications aren't available (unsupported
    // platform/session, or the OS itself has them disabled) — surface the
    // in-app reminder directly instead of losing the prompt entirely.
    mainWindow.webContents.send('break:reminder', payload);
    if (!osSupportsNotif && !breakNotifUnavailableNotified) {
      breakNotifUnavailableNotified = true;
      mainWindow.webContents.send('break:notifUnavailable');
    }
  }
}

function scheduleBreakReminder(userId, snoozeMs = null) {
  clearTimeout(breakReminderTimeout);
  const settings = get('SELECT * FROM break_settings WHERE user_id=?', [userId]);
  if (!settings || !settings.enabled) return;
  const intervalMs = snoozeMs || (settings.work_interval_mins || 52) * 60 * 1000;
  breakReminderTimeout = setTimeout(() => {
    // Smart: only fire if user has actually been working (>=50% active in window)
    const windowSecs = (settings.work_interval_mins || 52) * 60;
    const nowSec = Math.floor(Date.now() / 1000);
    const activeRow = get(
      'SELECT SUM(duration_seconds) as total FROM auto_sessions WHERE user_id=? AND started_at>=?',
      [userId, nowSec - windowSecs]
    );
    const activeSecs = activeRow?.total || 0;
    const activeRatio = activeSecs / windowSecs;
    if (activeRatio >= 0.5) {
      fireBreakReminder(userId, {
        duration: settings.break_duration_mins || 17,
        activeMins: Math.round(activeSecs / 60),
        intensity: Math.min(100, Math.round(activeRatio * 100)),
      });
    } else {
      // User wasn't very active — reschedule quietly
      scheduleBreakReminder(userId);
    }
  }, intervalMs);
}

// ─── WINDOW ───────────────────────────────────────────────────────────────────

// Module-level show helper — used by createWindow AND second-instance handler.
// Clamps to visible screen area, restores from minimised state, then shows+focuses.
function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  // Clamp position so the window never appears on a disconnected monitor.
  const bounds   = mainWindow.getBounds();
  const displays = screen.getAllDisplays();
  const onScreen = displays.some(d => {
    const wa = d.workArea;
    return bounds.x < wa.x + wa.width  && bounds.x + bounds.width  > wa.x
        && bounds.y < wa.y + wa.height && bounds.y + bounds.height > wa.y;
  });
  if (!onScreen) mainWindow.center();
  // restore() unminimises; show() makes it visible; focus() brings it to front.
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1024, minHeight: 650,
    frame: false, titleBarStyle: 'hidden', backgroundColor: '#0d1117',
    show: false,
    icon: getAppIconPath(),
    webPreferences: {
      nodeIntegration: false, contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  const url = process.env.ELECTRON_START_URL || `file://${path.join(__dirname, '../build/index.html')}`;
  mainWindow.loadURL(url);

  // Primary trigger: show once the renderer has painted its first frame.
  mainWindow.once('ready-to-show', showMainWindow);

  // Secondary trigger: did-finish-load fires after JS executes — catches cases
  // where ready-to-show fires too early or is skipped on Windows.
  mainWindow.webContents.once('did-finish-load', () => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      showMainWindow();
    }
  });

  // Final fallback: force-show after 8 s. Does NOT check isVisible() because
  // ready-to-show can fire with a blank/transparent frame (software renderer not
  // yet composited), leaving the window "shown" but invisible to the user.
  // Calling show()+focus() a second time forces a repaint.
  const showFallback = setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      showMainWindow();
    }
  }, 8000);

  if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' });

  // Hide to tray instead of quitting when user closes
  mainWindow.on('close', (e) => {
    if (!quitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  // Push maximize/restore state so the custom titlebar can swap its icon —
  // mirrors the native OS window-control behavior (maximize <-> restore icon).
  mainWindow.on('maximize',   () => mainWindow.webContents.send('window:maximizedChange', true));
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('window:maximizedChange', false));
}

// Disable GPU hardware acceleration. Electron's GPU compositor crashes silently
// on some NVIDIA driver + Windows configurations, causing the renderer to never
// paint (black window, ready-to-show never fires). Software rendering is fast
// enough for this UI and avoids the GPU process entirely.
// (SwiftShader is applied via relaunch at the top of this file — see the
// app.isPackaged / hasSwitch('use-gl') block above.)

// Suppress the harmless "Autofill.enable wasn't found" CDP warning that Chrome
// DevTools emits in Electron — the feature simply doesn't exist in this build.
app.commandLine.appendSwitch('disable-features', 'AutofillServerCommunication');

// Prevent Chromium from throttling setInterval/setTimeout in the renderer when
// the window is not focused. Without this, the focus session dock timer stops
// updating after 3-5 minutes in production (dev mode is unaffected because
// DevTools being open suppresses the same throttling).
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');

// ─── Custom protocol for email deep-links (flowledger://auth/callback) ────────
// On Windows in dev mode the executable is electron.exe running a script, so we
// must pass the script path explicitly — otherwise the OS can't map the protocol
// back to the correct command line.
if (process.platform === 'win32') {
  app.setAsDefaultProtocolClient('flowledger', process.execPath, [
    path.resolve(process.argv[1]),
  ]);
} else {
  app.setAsDefaultProtocolClient('flowledger');
}

// Single-instance lock + second-instance deep-link handler.
// Only enforced in production — in dev mode (ELECTRON_START_URL set) lingering
// processes from hot-reloads would hold the lock and kill the new instance.
app.on('second-instance', (_event, argv) => {
  const url = argv.find(a => a.startsWith('flowledger://'));
  if (url && mainWindow) {
    mainWindow.webContents.send('auth:deepLink', url);
  }
  // Always bring the window forward regardless of deep-link presence.
  showMainWindow();
});

if (!isDev) {
  const gotSingleLock = app.requestSingleInstanceLock();
  if (!gotSingleLock) app.quit();
}

// macOS: deep-link comes in via 'open-url' event
app.on('open-url', (event, url) => {
  event.preventDefault();
  if (url.startsWith('flowledger://') && mainWindow) {
    mainWindow.webContents.send('auth:deepLink', url);
    mainWindow.show();
    mainWindow.focus();
  }
});

// ─── SCHEDULED BLOCKING CHECKER ──────────────────────────────────────────────
function startScheduleChecker() {
  setInterval(() => {
    if (!currentUserId || !db) return;
    const schedules = all('SELECT * FROM block_schedules WHERE user_id=? AND active=1', [currentUserId]);
    const now = new Date();
    const dayBit = 1 << now.getDay();
    const currentMins = now.getHours() * 60 + now.getMinutes();
    const active = schedules.find(s => (s.days_mask & dayBit) && currentMins >= s.start_mins && currentMins < s.end_mins);

    if (active && !focusModeActive) {
      const profileId = (() => { try { return JSON.parse(active.profile_ids || '[]')[0] || null; } catch { return null; } })();
      focusModeActive = true;
      focusStartTime  = Date.now();
      focusProfileId  = profileId;
      focusRuleScope  = profileId ? 'profile' : 'global';
      _scheduleControlledFocus = true;
      if (mainWindow) {
        mainWindow.webContents.send('focusMode:changed', { active: true, startedAt: focusStartTime, profileId, ruleScope: focusRuleScope });
        mainWindow.webContents.send('schedule:activated', { label: active.label });
      }
    } else if (!active && _scheduleControlledFocus) {
      _scheduleControlledFocus = false;
      focusModeActive = false;
      focusStartTime  = null;
      focusProfileId  = null;
      focusRuleScope  = 'global';
      if (mainWindow) {
        mainWindow.webContents.send('focusMode:changed', { active: false, startedAt: null, profileId: null, ruleScope: 'global' });
        mainWindow.webContents.send('schedule:deactivated', {});
      }
    }
  }, 60000);
}

app.whenReady().then(async () => {
  // Allow the renderer to fetch Supabase APIs and WebSocket realtime channels.
  // Without this, Electron blocks cross-origin requests from file:// and localhost.
  electronSession.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob:;" +
          " connect-src 'self' https://*.supabase.co wss://*.supabase.co https://supabase.io https://*.somafm.com https://somafm.com;" +
          " script-src 'self' 'unsafe-inline' 'unsafe-eval';" +
          " style-src 'self' 'unsafe-inline';" +
          " img-src 'self' data: blob: https:;" +
          " media-src 'self' data: blob: https: http:;" +
          " font-src 'self' data:;",
        ],
      },
    });
  });

  await initDatabase();
  createWindow();

  // Forward any startup deep-link (app launched via protocol click while closed)
  const startUrl = process.argv.find(a => a.startsWith('flowledger://'));
  if (startUrl) {
    // Window isn't ready yet — wait for it to load then send
    mainWindow.webContents.once('did-finish-load', () => {
      mainWindow.webContents.send('auth:deepLink', startUrl);
    });
  }

  setupUpdater(mainWindow);
  startHttpServer();
  startScheduleChecker();

  // Tray
  trayHandle = createTray(mainWindow, {
    iconPath: getAppIconPath(),
    getActiveSession: () => currentSessionId
      ? get('SELECT * FROM sessions WHERE id=?', [currentSessionId]) : null,
    stopSession: () => {
      if (currentSessionId) {
        const session = get('SELECT * FROM sessions WHERE id=?', [currentSessionId]);
        if (session) {
          const now = Math.floor(Date.now() / 1000);
          const dur = now - session.started_at;
          run('UPDATE sessions SET ended_at=?,duration_seconds=?,is_deep_work=? WHERE id=?',
            [now, dur, dur >= 1500 ? 1 : 0, currentSessionId]);
          currentSessionId = null;
          mainWindow?.webContents.send('session:stopped', {});
        }
      }
    },
    openWindow: () => {
      mainWindow?.show();
      mainWindow?.focus();
    },
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else showMainWindow();
  });
}).catch((err) => {
  // Without this, a thrown error anywhere in startup (e.g. initDatabase()
  // failing) left the app running with zero window, zero tray icon, and
  // zero visible diagnostics — just a silently hung process. Now it's both
  // logged to crash.log and surfaced to the user instead of failing invisibly.
  console.error('[main] Fatal startup error:', err);
  logFatal('startup', err);
  dialog.showErrorBox(
    'Flow Ledger failed to start',
    `An error occurred during startup:\n\n${err?.message || err}\n\n` +
    `Details were written to: ${path.join(app.getPath('userData'), 'crash.log')}`
  );
  app.exit(1);
});

// ─── AI PERIODIC ANALYSIS JOB ────────────────────────────────────────────────
// Runs every 5 minutes while the app is open. Computes & persists daily scores,
// pushes focus state and behavioral insights to the renderer.
let aiAnalysisInterval = null;

function startAiAnalysis(userId) {
  if (aiAnalysisInterval) clearInterval(aiAnalysisInterval);
  if (!aiEngine || !userId) return;

  const runAnalysis = () => {
    if (!db || !userId) return;
    try {
      const dateKey    = localDateKey();
      const todayActs  = all(
        'SELECT * FROM auto_sessions WHERE user_id=? AND date_key=? ORDER BY started_at ASC',
        [userId, dateKey]
      );

      // Compute & save daily scores
      const scores = aiEngine.calculateProductivityScores(todayActs);
      aiEngine.saveDailyScores(userId, dateKey, scores);

      // Compute workflow summary for today
      const workflow = aiEngine.detectWorkflow(
        todayActs.map(a => ({ ...a, category_key: a.ai_category }))
      );

      // Compute focus state from switch log
      const focus = aiEngine.analyzeFocus('', '', '');

      // Push to renderer
      if (mainWindow) {
        mainWindow.webContents.send('ai:dailyScores',   { ...scores, dateKey });
        mainWindow.webContents.send('ai:focusState',    focus);
        mainWindow.webContents.send('ai:workflowSummary', workflow);
      }
    } catch (e) {
      // Non-fatal
    }
  };

  runAnalysis(); // run immediately
  aiAnalysisInterval = setInterval(runAnalysis, 5 * 60 * 1000);
}

// ─── TASK RECURRENCE HELPER ───────────────────────────────────────────────────

function computeNextRecurringDue(dueDateSec, rule) {
  const base = dueDateSec ? new Date(dueDateSec * 1000) : new Date();
  base.setHours(0, 0, 0, 0);
  const next = new Date(base);
  if (rule === 'daily') {
    next.setDate(next.getDate() + 1);
  } else if (rule === 'weekdays') {
    next.setDate(next.getDate() + 1);
    while (next.getDay() === 0 || next.getDay() === 6) next.setDate(next.getDate() + 1);
  } else if (rule === 'weekly') {
    next.setDate(next.getDate() + 7);
  } else if (rule === 'monthly') {
    next.setMonth(next.getMonth() + 1);
  } else {
    next.setDate(next.getDate() + 1);
  }
  return Math.floor(next.getTime() / 1000);
}

// ─── TASK NOTIFICATIONS ───────────────────────────────────────────────────────

let taskNotifDailyTimer    = null;
let taskNotifOverdueTimer  = null;
let taskNotifReminderTimer = null;

/**
 * Enrich raw task rows with computed due-date flags.
 */
function enrichTaskDueFlags(tasks) {
  const nowSec      = Math.floor(Date.now() / 1000);
  const todayStart  = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);
  const todayEnd    = todayStart + 86399;
  const yesterdayEnd = todayStart - 1;

  return tasks.map(t => ({
    ...t,
    isOverdue:   !!t.due_date && t.due_date < todayStart && t.status !== 'done',
    isDueToday:  !!t.due_date && t.due_date >= todayStart && t.due_date <= todayEnd && t.status !== 'done',
    isDueYesterday: !!t.due_date && t.due_date > yesterdayEnd - 86400 && t.due_date <= yesterdayEnd,
  }));
}

/**
 * Send daily task digest (called once per day in the morning).
 */
function sendDailyTaskDigest(userId) {
  if (!db || !userId || !mainWindow) return;
  try {
    const rawTasks = all(
      `SELECT t.*, p.name as project_name FROM tasks t
       LEFT JOIN projects p ON t.project_id = p.id
       WHERE t.user_id = ? AND t.status NOT IN ('done','archived')
       ORDER BY t.priority ASC, t.due_date ASC NULLS LAST`,
      [userId]
    );
    const tasks = enrichTaskDueFlags(rawTasks);
    if (tasks.length === 0) return; // nothing to notify about

    mainWindow.webContents.send('tasks:daily', { tasks, sentAt: Date.now() });
  } catch (e) { /* non-fatal */ }
}

/**
 * Check for overdue tasks and send notification if any new ones exist.
 * Persists a "last notified" set so we don't spam for the same tasks.
 */
const _notifiedOverdueIds = new Set();

function checkOverdueTasks(userId) {
  if (!db || !userId || !mainWindow) return;
  try {
    const rawTasks = all(
      `SELECT t.*, p.name as project_name FROM tasks t
       LEFT JOIN projects p ON t.project_id = p.id
       WHERE t.user_id = ? AND t.status NOT IN ('done','archived')
         AND t.due_date IS NOT NULL AND t.due_date < ?
       ORDER BY t.due_date ASC`,
      [userId, Math.floor(new Date().setHours(0, 0, 0, 0) / 1000)]
    );

    // Only notify for tasks we haven't already alerted
    const newOverdue = rawTasks.filter(t => !_notifiedOverdueIds.has(t.id));
    if (newOverdue.length === 0) return;

    newOverdue.forEach(t => _notifiedOverdueIds.add(t.id));
    const enriched = enrichTaskDueFlags(newOverdue);
    mainWindow.webContents.send('tasks:overdue', { tasks: enriched, sentAt: Date.now() });
  } catch (e) { /* non-fatal */ }
}

/**
 * Send individual "due today" reminders for tasks due today
 * that haven't been notified yet (one notification per task).
 */
const _notifiedDueTodayIds = new Set();

function checkDueTodayTasks(userId) {
  if (!db || !userId || !mainWindow) return;
  try {
    const todayStart = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);
    const todayEnd   = todayStart + 86399;
    const tasks = all(
      `SELECT t.*, p.name as project_name FROM tasks t
       LEFT JOIN projects p ON t.project_id = p.id
       WHERE t.user_id = ? AND t.status NOT IN ('done','archived')
         AND t.due_date >= ? AND t.due_date <= ?
       ORDER BY t.due_date ASC`,
      [userId, todayStart, todayEnd]
    );
    for (const task of tasks) {
      if (_notifiedDueTodayIds.has(task.id)) continue;
      _notifiedDueTodayIds.add(task.id);
      mainWindow.webContents.send('tasks:dueToday', { task: enrichTaskDueFlags([task])[0] });
    }
  } catch (e) { /* non-fatal */ }
}

/**
 * Fire OS + in-app notifications for tasks whose reminder_at is due.
 * Runs every 60s. After firing, clears reminder_at so it doesn't repeat.
 */
const _notifiedReminderKeys = new Set();

function checkTaskReminders(userId) {
  if (!db || !userId || !mainWindow) return;
  try {
    const now   = Math.floor(Date.now() / 1000);
    const since = now - 65; // small buffer for timer drift
    const tasks = all(
      `SELECT * FROM tasks WHERE user_id=? AND status NOT IN ('done','archived')
       AND reminder_at IS NOT NULL AND reminder_at >= ? AND reminder_at <= ?`,
      [userId, since, now]
    );
    for (const task of tasks) {
      const key = `${task.id}:${task.reminder_at}`;
      if (_notifiedReminderKeys.has(key)) continue;
      _notifiedReminderKeys.add(key);
      try {
        new Notification({ title: 'Task Reminder', body: task.title, icon: getNotifIcon() }).show();
      } catch (_) {}
      mainWindow.webContents.send('tasks:reminder', { task, sentAt: Date.now() });
      run('UPDATE tasks SET reminder_at=NULL WHERE id=?', [task.id]);
    }
  } catch (_) {}
}

/**
 * Send yesterday summary: how many tasks were completed vs still pending.
 */
function sendYesterdayTaskSummary(userId) {
  if (!db || !userId || !mainWindow) return;
  try {
    const yesterdayStart = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000) - 86400;
    const yesterdayEnd   = yesterdayStart + 86399;

    // Tasks completed yesterday (updated_at in yesterday's window, status = done)
    const completedRows = all(
      `SELECT id FROM tasks WHERE user_id=? AND status='done'
         AND updated_at >= ? AND updated_at <= ?`,
      [userId, yesterdayStart, yesterdayEnd]
    );

    // Tasks that were due yesterday and are still pending
    const stillPending = all(
      `SELECT COUNT(*) as cnt FROM tasks
       WHERE user_id=? AND status NOT IN ('done','archived')
         AND due_date >= ? AND due_date <= ?`,
      [userId, yesterdayStart, yesterdayEnd]
    );

    // Total seconds tracked on sessions from yesterday
    const timeRow = get(
      `SELECT COALESCE(SUM(duration_seconds),0) as total FROM sessions
       WHERE user_id=? AND started_at >= ? AND started_at <= ?`,
      [userId, yesterdayStart, yesterdayEnd]
    );

    mainWindow.webContents.send('tasks:yesterday', {
      completed:  completedRows.length,
      pending:    stillPending?.[0]?.cnt || 0,
      totalTime:  timeRow?.total || 0,
      sentAt:     Date.now(),
    });
  } catch (e) { /* non-fatal */ }
}

/**
 * Start all task notification timers for a given user.
 * Called once after login / app start.
 */
function startTaskNotifications(userId) {
  if (!userId) return;

  // Clear any existing timers
  clearTimeout(taskNotifDailyTimer);
  clearInterval(taskNotifOverdueTimer);
  clearInterval(taskNotifReminderTimer);

  // ── Morning digest: fire at 9:00 AM local time ─────────────────────────
  function scheduleMorningDigest() {
    const now  = new Date();
    const next = new Date(now);
    next.setHours(9, 0, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1); // already past 9am → tomorrow
    const msUntil = next.getTime() - now.getTime();

    taskNotifDailyTimer = setTimeout(() => {
      sendDailyTaskDigest(userId);
      checkDueTodayTasks(userId);
      // Reschedule for next day
      scheduleMorningDigest();
    }, msUntil);
  }
  scheduleMorningDigest();

  // ── Overdue check: on startup + every hour ──────────────────────────────
  checkOverdueTasks(userId);
  taskNotifOverdueTimer = setInterval(() => {
    checkOverdueTasks(userId);
    checkDueTodayTasks(userId);
  }, 60 * 60 * 1000); // every 1 hour

  // ── Reminder check: every 60 seconds ──────────────────────────────────
  checkTaskReminders(userId);
  taskNotifReminderTimer = setInterval(() => checkTaskReminders(userId), 60 * 1000);

  // ── Yesterday summary: fire on startup (morning) once per day ──────────
  const lastYesterdaySent = (() => {
    try { return parseInt(localStorage?.getItem?.('fl_yesterday_notif_date') || '0', 10); } catch { return 0; }
  })();
  const todayKey = new Date().toDateString();
  if (lastYesterdaySent !== todayKey) {
    sendYesterdayTaskSummary(userId);
    // In main process, use a simple in-memory flag (no localStorage available here)
  }
}

app.on('before-quit', () => {
  quitting = true;
  // Gracefully close any running auto-focus session so it doesn't persist overnight
  if (afSession) closeAutoFocusSession('app_close');
  // Also close any manually open sessions (covers force-quit / unexpected exits)
  if (db && currentUserId) {
    try {
      const t = Math.floor(Date.now() / 1000);
      const open = all('SELECT id, started_at FROM sessions WHERE user_id=? AND ended_at IS NULL', [currentUserId]);
      for (const s of open) {
        const dur = Math.max(0, t - s.started_at);
        run('UPDATE sessions SET ended_at=?,duration_seconds=?,is_deep_work=? WHERE id=?',
          [t, dur, dur >= 1500 ? 1 : 0, s.id]);
      }
    } catch (_) {}
  }
});

// OS-initiated power events (shutdown, sleep, lock) fire with a short grace
// window before the machine actually powers off — force an immediate flush
// of whatever is in memory so an unexpected shutdown doesn't lose writes
// that happened since the last `run()` call.
try {
  powerMonitor.on('shutdown', () => { try { save(); } catch (_) {} });
  powerMonitor.on('suspend',  () => { try { save(); } catch (_) {} });
  powerMonitor.on('lock-screen', () => { try { save(); } catch (_) {} });
} catch (_) {}

app.on('window-all-closed', () => {
  if (tracker) tracker.stop();
  if (httpServer) httpServer.close();
  clearTimeout(breakReminderTimeout);
  clearTimeout(flowStateTimeout);
  destroyTray();
  clearTimeout(taskNotifDailyTimer);
  clearInterval(taskNotifOverdueTimer);
  clearInterval(taskNotifReminderTimer);
  if (process.platform !== 'darwin') app.quit();
});

// ─── WINDOW CONTROLS ─────────────────────────────────────────────────────────
ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-maximize', () => mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize());
ipcMain.on('window-close',    () => mainWindow?.hide());   // hide to tray
ipcMain.handle('window-isMaximized', () => !!mainWindow?.isMaximized());


// ─── NATIVE APP ICON ─────────────────────────────────────────────────────────
// Returns a base64 data URL for the OS-level icon of a local app.
// On macOS: searches /Applications, /System/Applications, and Spotlight (mdfind).
// On Windows: looks up the .exe in common install paths.
// Returns null if the app cannot be found — the renderer falls back gracefully.
const _iconCache = new Map();
ipcMain.handle('app:getIcon', async (_, { appName }) => {
  if (!appName) return null;
  if (_iconCache.has(appName)) return _iconCache.get(appName);

  const resolveIcon = async (filePath) => {
    try {
      if (!fs.existsSync(filePath)) return null;
      const icon = await app.getFileIcon(filePath, { size: 'normal' });
      return icon.toDataURL();
    } catch { return null; }
  };

  let dataUrl = null;

  if (process.platform === 'darwin') {
    // Candidate paths on macOS
    const name  = appName.replace(/\.app$/i, '');
    const paths = [
      `/Applications/${name}.app`,
      `/System/Applications/${name}.app`,
      `/Applications/Utilities/${name}.app`,
      `/System/Applications/Utilities/${name}.app`,
    ];
    for (const p of paths) {
      dataUrl = await resolveIcon(p);
      if (dataUrl) break;
    }

    // Spotlight search as a fallback (handles apps with different folder names)
    if (!dataUrl) {
      dataUrl = await new Promise((resolve) => {
        const escaped = name.replace(/"/g, '\\"');
        exec(
          `mdfind -onlyin /Applications "kMDItemDisplayName == \\"${escaped}\\" && kMDItemKind == 'Application'" 2>/dev/null | head -1`,
          { timeout: 1500 },
          async (err, stdout) => {
            if (err || !stdout.trim()) { resolve(null); return; }
            resolve(await resolveIcon(stdout.trim()));
          }
        );
      });
    }

    // Wider Spotlight search (all volumes)
    if (!dataUrl) {
      dataUrl = await new Promise((resolve) => {
        const escaped = name.replace(/"/g, '\\"');
        exec(
          `mdfind "kMDItemDisplayName == \\"${escaped}\\" && kMDItemKind == 'Application'" 2>/dev/null | head -1`,
          { timeout: 2000 },
          async (err, stdout) => {
            if (err || !stdout.trim()) { resolve(null); return; }
            resolve(await resolveIcon(stdout.trim()));
          }
        );
      });
    }

  } else if (process.platform === 'win32') {
    const safeName = appName.replace(/[^a-zA-Z0-9.\-_ ]/g, '');
    const exeName  = safeName.endsWith('.exe') ? safeName : `${safeName}.exe`;

    // 1. Fastest: ask PowerShell for the path of a running process with this name.
    //    Handles Discord, Spotify, Steam and any app installed in a versioned sub-folder.
    const runningPath = await new Promise(resolve => {
      exec(
        `powershell -NonInteractive -NoProfile -Command "$p = Get-Process '${safeName.replace(/\.exe$/i, '')}' -ErrorAction SilentlyContinue | Select-Object -First 1; if ($p -and $p.Path) { $p.Path }"`,
        { timeout: 3000, windowsHide: true },
        (err, out) => resolve(err ? null : (out?.trim() || null))
      );
    });
    if (runningPath) dataUrl = await resolveIcon(runningPath);

    // 2. Registry lookup: where Windows records the app's InstallLocation.
    if (!dataUrl) {
      const regPath = await new Promise(resolve => {
        exec(
          `powershell -NonInteractive -NoProfile -Command "$r = @('HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*') | ForEach-Object { Get-ItemProperty $_ -ErrorAction SilentlyContinue } | Where-Object { $_.DisplayName -match '(?i)${safeName.replace(/\./g, '\\.')}' } | Select-Object -First 1; if ($r.InstallLocation) { Join-Path $r.InstallLocation '${exeName}' } elseif ($r.DisplayIcon) { ($r.DisplayIcon -split ',')[0].Trim('\"') }"`,
          { timeout: 4000, windowsHide: true },
          (err, out) => resolve(err ? null : (out?.trim() || null))
        );
      });
      if (regPath) dataUrl = await resolveIcon(regPath);
    }

    // 3. Static directory heuristic — direct sub-folder named after the app.
    if (!dataUrl) {
      const dirs = [
        process.env.ProgramFiles,
        process.env['ProgramFiles(X86)'],
        process.env.LOCALAPPDATA,
        `${process.env.LOCALAPPDATA}\\Programs`,
        process.env.APPDATA,
      ].filter(Boolean);
      for (const dir of dirs) {
        const candidate = path.join(dir, safeName, exeName);
        dataUrl = await resolveIcon(candidate);
        if (dataUrl) break;
      }
    }
  }

  _iconCache.set(appName, dataUrl);
  return dataUrl;
});

// ─── AUTH ─────────────────────────────────────────────────────────────────────
ipcMain.handle('auth:register', async (_, { username, email, password, firstName, lastName }) => {
  try {
    if (!email || !email.trim()) return { success: false, error: 'Email is required' };
    if (get('SELECT id FROM users WHERE username=?', [username]))
      return { success: false, error: 'Username already taken' };
    if (get('SELECT id FROM users WHERE email=?', [email.trim().toLowerCase()]))
      return { success: false, error: 'An account with this email already exists' };

    const hash = await bcrypt.hash(password, 12);
    const id   = uuidv4();
    run(
      'INSERT INTO users (id,username,email,password_hash,first_name,last_name) VALUES (?,?,?,?,?,?)',
      [id, username, email.trim().toLowerCase(), hash, firstName?.trim() || null, lastName?.trim() || null]
    );

    [
      { name:'Coding',   color:'#6366f1', icon:'code',      type:'focus'   },
      { name:'Design',   color:'#8b5cf6', icon:'pen-tool',  type:'focus'   },
      { name:'Meetings', color:'#f59e0b', icon:'users',     type:'meeting' },
      { name:'Writing',  color:'#10b981', icon:'pen',       type:'focus'   },
      { name:'Research', color:'#3b82f6', icon:'search',    type:'focus'   },
      { name:'Admin',    color:'#ef4444', icon:'folder',    type:'other'   },
      { name:'Break',    color:'#6b7280', icon:'coffee',    type:'break'   },
      { name:'Learning', color:'#14b8a6', icon:'book-open', type:'focus'   },
    ].forEach(c =>
      run('INSERT INTO categories (id,user_id,name,color,icon,session_type) VALUES (?,?,?,?,?,?)',
        [uuidv4(), id, c.name, c.color, c.icon, c.type])
    );
    run('INSERT INTO break_settings (id,user_id) VALUES (?,?)', [uuidv4(), id]);
    run('INSERT INTO tracking_settings (id,user_id,start_on_login) VALUES (?,?,?)', [uuidv4(), id, 1]);
    startUserServices(id);

    return { success: true, user: { id, username, email: email.trim().toLowerCase(), daily_target_hours: 6, first_name: firstName?.trim() || null, last_name: lastName?.trim() || null } };
  } catch (err) { return { success: false, error: err.message }; }
});

// Build the public user object returned to the renderer — single source of truth.
function toPublicUser(u) {
  return {
    id:                 u.id,
    username:           u.username,
    email:              u.email,
    daily_target_hours: u.daily_target_hours || 6,
    first_name:         u.first_name  || null,
    last_name:          u.last_name   || null,
    company:            u.company     || null,
    industry:           u.industry    || null,
    team_size:          u.team_size   || null,
    work_type:          u.work_type   || null,
    workspace_name:     u.workspace_name || null,
  };
}

ipcMain.handle('auth:login', async (_, { username, password }) => {
  try {
    const user = get('SELECT * FROM users WHERE username=?', [username]);
    if (!user) return { success: false, error: 'Invalid username or password' };
    if (!await bcrypt.compare(password, user.password_hash))
      return { success: false, error: 'Invalid username or password' };

    run('UPDATE users SET last_login=? WHERE id=?', [Math.floor(Date.now()/1000), user.id]);
    recoverOpenSessions(user.id);
    startUserServices(user.id);

    return { success: true, user: toPublicUser(user) };
  } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('auth:restoreSession', (_, { userId }) => {
  try {
    const user = get('SELECT * FROM users WHERE id=?', [userId]);
    if (!user) return { success: false, error: 'Saved login no longer exists' };

    run('UPDATE users SET last_login=? WHERE id=?', [Math.floor(Date.now()/1000), user.id]);
    recoverOpenSessions(user.id);
    startUserServices(user.id);

    return { success: true, user: toPublicUser(user) };
  } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('auth:updateTarget', (_, { userId, hours }) => {
  run('UPDATE users SET daily_target_hours=? WHERE id=?', [hours, userId]);
  return { success: true };
});

// ─── Supabase-backed auth ─────────────────────────────────────────────────────

// Called after a successful Supabase login to sync (or create) the local SQLite
// user record. Uses the Supabase UUID as the local user ID so all existing
// foreign-key references stay consistent.
ipcMain.handle('auth:supabaseLogin', async (_, { supabaseUser }) => {
  try {
    const { id, email, user_metadata } = supabaseUser || {};
    if (!id) return { success: false, error: 'Invalid Supabase user' };

    const fullName  = (user_metadata?.full_name || '').trim();
    const nameParts = fullName.split(' ');
    const firstName = nameParts[0] || null;
    const lastName  = nameParts.slice(1).join(' ') || null;

    let user = get('SELECT * FROM users WHERE id=?', [id]);

    if (!user) {
      // Derive a unique username from the email prefix
      const baseUsername = (email || id).split('@')[0].replace(/[^a-z0-9_]/gi, '_').toLowerCase();
      let username = baseUsername;
      let suffix   = 1;
      while (get('SELECT id FROM users WHERE username=?', [username])) {
        username = `${baseUsername}${suffix++}`;
      }

      run(
        'INSERT OR IGNORE INTO users (id, username, email, first_name, last_name, password_hash) VALUES (?,?,?,?,?,?)',
        [id, username, (email || '').toLowerCase(), firstName, lastName, 'supabase_auth']
      );

      // Seed default categories for new users
      const existingCats = all('SELECT name FROM categories WHERE user_id=?', [id]);
      if (existingCats.length === 0) {
        [
          { name:'Coding',   color:'#6366f1', icon:'code',      type:'focus'   },
          { name:'Design',   color:'#8b5cf6', icon:'pen-tool',  type:'focus'   },
          { name:'Meetings', color:'#f59e0b', icon:'users',     type:'meeting' },
          { name:'Writing',  color:'#10b981', icon:'pen',       type:'focus'   },
          { name:'Research', color:'#3b82f6', icon:'search',    type:'focus'   },
          { name:'Admin',    color:'#ef4444', icon:'folder',    type:'other'   },
          { name:'Break',    color:'#6b7280', icon:'coffee',    type:'break'   },
          { name:'Learning', color:'#14b8a6', icon:'book-open', type:'focus'   },
        ].forEach(c =>
          run('INSERT INTO categories (id,user_id,name,color,icon,session_type) VALUES (?,?,?,?,?,?)',
            [uuidv4(), id, c.name, c.color, c.icon, c.type])
        );
        run('INSERT OR IGNORE INTO break_settings (id,user_id) VALUES (?,?)',    [uuidv4(), id]);
        run('INSERT OR IGNORE INTO tracking_settings (id,user_id,start_on_login) VALUES (?,?,?)', [uuidv4(), id, 1]);
      }

      user = get('SELECT * FROM users WHERE id=?', [id]);
    }

    run('UPDATE users SET last_login=? WHERE id=?', [Math.floor(Date.now() / 1000), id]);
    recoverOpenSessions(id);
    startUserServices(id);

    return { success: true, user: toPublicUser(user) };
  } catch (err) {
    console.error('[auth:supabaseLogin]', err.message);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('auth:supabaseLogout', () => {
  try {
    if (currentUserId) {
      // Close any open sessions so the timer stops cleanly
      const open = get('SELECT id,started_at FROM sessions WHERE user_id=? AND ended_at IS NULL', [currentUserId]);
      if (open) {
        const now = Math.floor(Date.now() / 1000);
        run('UPDATE sessions SET ended_at=?,duration_seconds=? WHERE id=?',
          [now, now - open.started_at, open.id]);
      }
    }
    currentUserId = null;
    currentSessionId = null;
    afReset();
  } catch {}
  return { success: true };
});

// Validates an activation key entirely in the main process using the service-role
// key — the renderer never sees the service-role key and cannot bypass this check.
ipcMain.handle('auth:validateActivationKey', async (_, { key, userId }) => {
  const debug = createActivationDebugState(userId);
  const safeKey = maskActivationKey(key);
  const supabaseUrl = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL || '';
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE || '';

  writeActivationLog('log', 'validate-start', {
    userId: userId || null,
    key: safeKey,
  });
  writeActivationLog('log', 'env-check', {
    hasSupabaseUrl: Boolean(supabaseUrl),
    hasSupabaseServiceRole: Boolean(serviceRole),
  });

  if (!supabaseUrl) {
    debug.supabaseConnectionStatus = 'missing_url';
    writeActivationLog('error', 'env-missing-url', { userId: userId || null });
    return activationFailure('missing_supabase_url', 'Missing SUPABASE_URL', debug);
  }
  if (!serviceRole) {
    debug.supabaseConnectionStatus = 'missing_service_role';
    writeActivationLog('error', 'env-missing-service-role', { userId: userId || null });
    return activationFailure('missing_supabase_service_role', 'Missing SUPABASE_SERVICE_ROLE', debug);
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    debug.supabaseConnectionStatus = 'client_init_failed';
    writeActivationLog('error', 'supabase-client-init-failed', { userId: userId || null });
    return activationFailure('failed_to_connect_supabase', 'Failed to connect to Supabase', debug);
  }

  try {
    const normalised = (key || '').replace(/[\s-]/g, '').toUpperCase();
    writeActivationLog('log', 'key-normalized', {
      userId: userId || null,
      key: maskActivationKey(normalised),
      length: normalised.length,
    });
    if (!normalised) {
      debug.activationKeyLookupStatus = 'invalid_input';
      return activationFailure('activation_key_not_found', 'Activation key not found', debug);
    }

    debug.supabaseConnectionStatus = 'checking';
    writeActivationLog('log', 'supabase-connection-check-start', { userId: userId || null });
    const { count: connectionCount, error: connectionError } = await admin
      .from('activation_keys')
      .select('id', { head: true, count: 'exact' });

    if (connectionError) {
      const classified = classifySupabaseError(connectionError, 'failed_to_connect_supabase', 'Failed to connect to Supabase');
      debug.supabaseConnectionStatus = classified.code;
      writeActivationLog('error', 'supabase-connection-check-failed', {
        userId: userId || null,
        error: connectionError,
        classified,
      });
      return activationFailure(classified.code, classified.message, debug);
    }

    debug.supabaseConnectionStatus = 'connected';
    writeActivationLog('log', 'supabase-connection-check-success', {
      userId: userId || null,
      rowCountVisible: connectionCount,
    });

    // Build all plausible stored formats so the lookup works regardless of
    // whether the key was inserted with dashes (XXXX-XXXX) or without (XXXXXXXX).
    const candidates = [
      normalised,
      normalised.match(/.{1,4}/g)?.join('-') ?? normalised,
    ];

    let keyRow = null;
    for (const candidate of candidates) {
      debug.activationKeyLookupStatus = 'querying';
      writeActivationLog('log', 'activation-key-lookup-attempt', {
        userId: userId || null,
        candidate: maskActivationKey(candidate),
      });
      const { data, error } = await admin
        .from('activation_keys')
        .select('*')
        .eq('activation_key', candidate)
        .maybeSingle();

      if (error) {
        const classified = classifySupabaseError(error, 'activation_lookup_failed', 'Activation key lookup failed');
        debug.activationKeyLookupStatus = classified.code;
        writeActivationLog('error', 'activation-key-lookup-error', {
          userId: userId || null,
          candidate: maskActivationKey(candidate),
          error,
          classified,
        });
        return activationFailure(classified.code, classified.message, debug);
      }

      writeActivationLog('log', 'activation-key-lookup-result', {
        userId: userId || null,
        candidate: maskActivationKey(candidate),
        found: Boolean(data),
        keyId: data?.id || null,
        status: data?.status || null,
        redeemedBy: data?.redeemed_by || null,
      });

      if (data) {
        keyRow = data;
        break;
      }
    }

    if (!keyRow) {
      debug.activationKeyLookupStatus = 'not_found';
      writeActivationLog('warn', 'activation-key-not-found', {
        userId: userId || null,
        candidates: candidates.map(maskActivationKey),
      });
      return activationFailure('activation_key_not_found', 'Activation key not found', debug);
    }

    debug.activationKeyLookupStatus = `found:${keyRow.status}`;
    writeActivationLog('log', 'activation-key-row-loaded', {
      userId: userId || null,
      keyId: keyRow.id,
      status: keyRow.status,
      redeemedBy: keyRow.redeemed_by || null,
      expiresAt: keyRow.expires_at || null,
    });

    if (keyRow.status === 'Used') {
      writeActivationLog('warn', 'activation-key-already-used', { userId: userId || null, keyId: keyRow.id });
      return activationFailure('activation_key_already_used', 'Activation key already used', debug);
    }
    if (keyRow.status === 'Disabled') {
      writeActivationLog('warn', 'activation-key-disabled', { userId: userId || null, keyId: keyRow.id });
      return activationFailure('disabled_key', 'Activation key is disabled', debug);
    }
    if (keyRow.status === 'Expired') {
      writeActivationLog('warn', 'activation-key-expired', { userId: userId || null, keyId: keyRow.id });
      return activationFailure('expired_key', 'Activation key has expired', debug);
    }
    if (keyRow.status !== 'Available') {
      writeActivationLog('warn', 'activation-key-invalid-status', {
        userId: userId || null,
        keyId: keyRow.id,
        status: keyRow.status,
      });
      return activationFailure('activation_key_not_found', 'Activation key not found', debug);
    }

    // Expiry date guard
    if (keyRow.expires_at && new Date(keyRow.expires_at) < new Date()) {
      const { error: expireErr } = await admin.from('activation_keys').update({ status: 'Expired' }).eq('id', keyRow.id);
      writeActivationLog(expireErr ? 'error' : 'log', 'activation-key-expiry-sync', {
        userId: userId || null,
        keyId: keyRow.id,
        updated: !expireErr,
        error: expireErr || null,
      });
      return activationFailure('expired_key', 'Activation key has expired', debug);
    }

    // Check this user hasn't already activated with a different key
    if (keyRow.redeemed_by && keyRow.redeemed_by !== userId) {
      writeActivationLog('warn', 'activation-key-redeemed-by-other-user', {
        userId: userId || null,
        keyId: keyRow.id,
        redeemedBy: keyRow.redeemed_by,
      });
      return activationFailure('activation_key_already_used', 'Activation key already used', debug);
    }

    const now = new Date().toISOString();
    writeActivationLog('log', 'activation-key-update-start', {
      userId: userId || null,
      keyId: keyRow.id,
      redeemedAt: now,
    });

    // Atomically mark key as used — extra .eq('status','Available') guard means
    // this only matches if another request hasn't already redeemed the key.
    const { data: updatedRows, error: updateKeyErr } = await admin
      .from('activation_keys')
      .update({ status: 'Used', redeemed_by: userId, redeemed_at: now })
      .eq('id', keyRow.id)
      .eq('status', 'Available')
      .select('id');

    if (updateKeyErr) {
      const classified = classifySupabaseError(updateKeyErr, 'activation_update_failed', 'Activation key update failed');
      writeActivationLog('error', 'activation-key-update-error', {
        userId: userId || null,
        keyId: keyRow.id,
        error: updateKeyErr,
        classified,
      });
      return activationFailure(classified.code, classified.message, debug);
    }
    if (!updatedRows || updatedRows.length === 0) {
      writeActivationLog('warn', 'activation-key-update-no-rows', {
        userId: userId || null,
        keyId: keyRow.id,
      });
      return activationFailure('activation_key_already_used', 'Activation key already used', debug);
    }

    writeActivationLog('log', 'activation-key-update-success', {
      userId: userId || null,
      keyId: keyRow.id,
      updatedRows: updatedRows.length,
    });

    // Update profile to active
    const { error: profileErr } = await admin
      .from('profiles')
      .update({
        account_status:    'active',
        activation_key_id: keyRow.id,
        activated_at:      now,
      })
      .eq('user_id', userId);

    if (profileErr) {
      const classified = classifySupabaseError(profileErr, 'profile_update_failed', 'Profile update failed');
      writeActivationLog('error', 'profile-update-error', {
        userId: userId || null,
        keyId: keyRow.id,
        error: profileErr,
        classified,
      });
      const { error: rollbackErr } = await admin.from('activation_keys')
        .update({ status: 'Available', redeemed_by: null, redeemed_at: null })
        .eq('id', keyRow.id);
      writeActivationLog(rollbackErr ? 'error' : 'log', 'activation-key-rollback-result', {
        userId: userId || null,
        keyId: keyRow.id,
        rolledBack: !rollbackErr,
        error: rollbackErr || null,
      });
      return activationFailure(classified.code, classified.message, debug);
    }

    writeActivationLog('log', 'profile-update-success', {
      userId: userId || null,
      keyId: keyRow.id,
      accountStatus: 'active',
    });
    writeActivationLog('log', 'validate-success', {
      userId: userId || null,
      keyId: keyRow.id,
    });

    return {
      success: true,
      message: 'Activation succeeded',
      debug: {
        ...debug,
        activationKeyLookupStatus: 'activated',
      },
    };
  } catch (err) {
    const classified = classifySupabaseError(err, 'activation_failed', 'Activation failed');
    writeActivationLog('error', 'validate-exception', {
      userId: userId || null,
      key: safeKey,
      error: err,
      classified,
    });
    return activationFailure(classified.code, classified.message, debug);
  }
});

ipcMain.handle('user:updateProfile', (_, { userId, firstName, lastName, email, company, industry, teamSize, workType, workspaceName }) => {
  try {
    const sets = [], vals = [];
    if (firstName      !== undefined) { sets.push('first_name=?');     vals.push(firstName?.trim()     || null); }
    if (lastName       !== undefined) { sets.push('last_name=?');      vals.push(lastName?.trim()      || null); }
    if (email          !== undefined) { sets.push('email=?');          vals.push(email?.trim().toLowerCase() || null); }
    if (company        !== undefined) { sets.push('company=?');        vals.push(company?.trim()       || null); }
    if (industry       !== undefined) { sets.push('industry=?');       vals.push(industry             || null); }
    if (teamSize       !== undefined) { sets.push('team_size=?');      vals.push(teamSize             || null); }
    if (workType       !== undefined) { sets.push('work_type=?');      vals.push(workType             || null); }
    if (workspaceName  !== undefined) { sets.push('workspace_name=?'); vals.push(workspaceName?.trim() || null); }
    if (sets.length === 0) return { success: true };
    vals.push(userId);
    run(`UPDATE users SET ${sets.join(',')} WHERE id=?`, vals);
    const updated = get('SELECT * FROM users WHERE id=?', [userId]);
    return { success: true, user: toPublicUser(updated) };
  } catch (err) { return { success: false, error: err.message }; }
});

// ─── SESSIONS (manual) ────────────────────────────────────────────────────────
ipcMain.handle('sessions:start', (_, { userId, category, title, projectId, clientId, taskId, sessionType, startedAt, notes }) => {
  const id  = uuidv4();
  const realNow = Math.floor(Date.now()/1000);
  const now = startedAt || realNow;
  // Never allow the DB 'General' default to silently apply — fall back to 'Focus'
  // so sessions always carry a meaningful category in the calendar.
  const safeCategory = (category && category.trim()) ? category.trim() : 'Focus';
  const isLiveRecording = !startedAt || Math.abs(startedAt - realNow) <= 60;
  if (isLiveRecording) {
    const active = get('SELECT * FROM sessions WHERE user_id=? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1', [userId]);
    if (active) {
      const stopTime = Math.max(realNow, active.started_at);
      const dur = Math.max(0, stopTime - active.started_at);
      run('UPDATE sessions SET ended_at=?,duration_seconds=?,is_deep_work=? WHERE id=?',
        [stopTime, dur, dur >= 1500 ? 1 : 0, active.id]);
    }
  }
  run('INSERT INTO sessions (id,user_id,category,project_id,client_id,task_id,title,started_at,session_type,notes) VALUES (?,?,?,?,?,?,?,?,?,?)',
    [id, userId, safeCategory, projectId||null, clientId||null, taskId||null, title||null, now, sessionType||'focus', notes||null]);
  if (isLiveRecording) {
    currentSessionId = id;
    scheduleBreakReminder(userId);
    scheduleFlowState(title || category || 'Session');
    // Start idle watcher for this manual session
    manualIdleWatcher?.stop();
    const tsRow = get('SELECT idle_threshold_secs FROM tracking_settings WHERE user_id=?', [userId]);
    const manualIdleThreshold = Math.max(300, (tsRow?.idle_threshold_secs || 300));
    manualIdleWatcher = new IdleWatcher({
      getIdleTime:   () => { try { return powerMonitor.getSystemIdleTime(); } catch { return 0; } },
      thresholdSecs: manualIdleThreshold,
      onIdle:  ({ awayStartedAt }) => {
        if (mainWindow) mainWindow.webContents.send('timer:manualIdle', { awayStartedAt });
      },
      onResume: ({ awaySeconds }) => {
        if (mainWindow) mainWindow.webContents.send('timer:manualResume', { awaySeconds });
      },
    });
    manualIdleWatcher.start();
  }
  return { id, started_at: now };
});

ipcMain.handle('sessions:stop', (_, { sessionId, endedAt, titleGenerating }) => {
  const session = get('SELECT * FROM sessions WHERE id=?', [sessionId]);
  if (!session) return { success: false };
  const stopTime = endedAt || Math.floor(Date.now()/1000);
  const dur  = Math.max(0, stopTime - session.started_at);
  const deep = dur >= 1500 ? 1 : 0;
  const activityRatio = manualIdleWatcher ? manualIdleWatcher.activityRatio() : 100;
  manualIdleWatcher?.stop();
  if (currentSessionId === sessionId) manualIdleWatcher = null;
  run('UPDATE sessions SET ended_at=?,duration_seconds=?,is_deep_work=?,activity_ratio=? WHERE id=?',
    [stopTime, dur, deep, activityRatio, sessionId]);
  if (currentSessionId === sessionId) {
    currentSessionId = null;
    clearTimeout(flowStateTimeout);
  }
  updateFocusScore(session.user_id, session.started_at, session.session_type, dur);
  if (session.task_id) {
    run('UPDATE tasks SET total_seconds = COALESCE(total_seconds, 0) + ? WHERE id=?',
      [Math.round(dur), session.task_id]);
  }
  run('INSERT INTO pending_entries (id,user_id,session_id,date_key) VALUES (?,?,?,?)',
    [uuidv4(), session.user_id, sessionId, localDateKey(session.started_at)]);

  // Fire session-stopped event with full metadata so the notification shows
  // the actual event title (or "Generating Event title…" while AI processes it)
  if (mainWindow) {
    mainWindow.webContents.send('session:stopped', {
      title:           session.title   || null,
      category:        session.category || null,
      duration_seconds: dur,
      is_deep_work:    !!deep,
      titleGenerating: !!titleGenerating,  // renderer shows "Generating Event title…"
    });
  }

  return { success: true, duration: dur, isDeepWork: !!deep };
});

// ── Atomic schedule handler: creates + immediately stops a session in one call ──
// Avoids the two-IPC race that could leave a session with ended_at=NULL if the
// second call (sessions:stop) fails or is never received.
ipcMain.handle('sessions:schedule', (_, { userId, category, title, projectId, clientId, taskId, sessionType, startedAt, endedAt, notes }) => {
  const id  = uuidv4();
  const safeCategory = (category && category.trim()) ? category.trim() : 'Scheduled Work';
  const start = startedAt;
  const end   = endedAt;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return { success: false, error: 'invalid_times' };
  }
  const dur  = Math.max(0, end - start);
  const deep = dur >= 1500 ? 1 : 0;
  run(
    'INSERT INTO sessions (id,user_id,category,project_id,client_id,task_id,title,started_at,ended_at,duration_seconds,is_deep_work,session_type,notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
    [id, userId, safeCategory, projectId||null, clientId||null, taskId||null, title||null, start, end, dur, deep, sessionType||'focus', notes||null]
  );
  updateFocusScore(userId, start, sessionType || 'focus', dur);
  if (taskId) {
    run('UPDATE tasks SET total_seconds = COALESCE(total_seconds, 0) + ? WHERE id=?', [Math.round(dur), taskId]);
  }
  run('INSERT INTO pending_entries (id,user_id,session_id,date_key) VALUES (?,?,?,?)',
    [uuidv4(), userId, id, localDateKey(start)]);
  return { id, started_at: start, ended_at: end, duration_seconds: dur };
});

// ── Subtract away-time from a running session by advancing its started_at ────
ipcMain.handle('sessions:subtractAway', (_, { sessionId, seconds }) => {
  const session = get('SELECT started_at FROM sessions WHERE id=? AND ended_at IS NULL', [sessionId]);
  if (!session) return { success: false };
  const newStart = session.started_at + Math.round(seconds);
  run('UPDATE sessions SET started_at=? WHERE id=?', [newStart, sessionId]);
  return { success: true, newStartedAt: newStart };
});

// ── Work-day boundary status ──────────────────────────────────────────────────
ipcMain.handle('workday:status', (_, { userId }) => {
  try {
    const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
    const dayStart = Math.floor(midnight.getTime() / 1000);
    const now      = Math.floor(Date.now() / 1000);
    const row = get(
      `SELECT MIN(started_at) AS first_start,
              SUM(CASE WHEN ended_at IS NOT NULL THEN duration_seconds
                       ELSE MAX(0, ? - started_at) END) AS total_sec
       FROM sessions
       WHERE user_id=? AND started_at >= ? AND session_type != 'break'`,
      [now, userId, dayStart]
    );
    const user = get('SELECT daily_target_hours FROM users WHERE id=?', [userId]);
    const targetSec = Math.round((user?.daily_target_hours || 8) * 3600);
    if (!row?.first_start) return { started: false };
    const totalSec   = row.total_sec || 0;
    const overtimeSec = Math.max(0, totalSec - targetSec);
    return {
      started: true,
      startedAt:   row.first_start,
      totalSec,
      targetSec,
      overtimeSec,
    };
  } catch { return { started: false }; }
});

ipcMain.handle('sessions:list', (_, { userId, from, to, includeAutoBlocks = false }) => {
  // ── Exclusion rules ────────────────────────────────────────────────────────
  //
  // 1. __auto_block: sessions (default excluded):
  //    Metadata rows created when Activity-page blocks are annotated.
  //    These must NOT appear in Calendar/Timer as standalone events.
  //    The Activity page passes includeAutoBlocks=true when it needs them.
  //
  // 2. __cal_event: sessions that are in the FUTURE:
  //    Calendar events pre-converted to sessions before they happen.
  //    They should not count as worked time until the event has actually started.
  //    NOTE: manually-scheduled sessions (no __cal_event: marker) ARE allowed to
  //    have future start times — the user intentionally placed them there.
  //
  const nowSec = Math.floor(Date.now() / 1000);
  let q = `SELECT s.*, p.name as project_name, p.color as project_color, c.name as client_name, c.company as client_company,
                  t.title as task_title, t.description as task_description, t.keywords as task_keywords
           FROM sessions s LEFT JOIN projects p ON s.project_id=p.id LEFT JOIN clients c ON s.client_id=c.id LEFT JOIN tasks t ON s.task_id=t.id
           WHERE s.user_id=? AND s.ended_at IS NOT NULL`;
  const params = [userId];

  // Exclude __auto_block: rows (unless the caller specifically wants them)
  if (!includeAutoBlocks) {
    q += ` AND (s.notes IS NULL OR s.notes NOT LIKE '__auto_block:%')`;
  }

  // Exclude only __cal_event: sessions that haven't started yet
  // (pre-converted meetings that are still in the future).
  // COALESCE(notes, '') avoids NULL propagation: without it,
  // NULL LIKE '...' = NULL so NOT (future AND NULL) = NOT NULL = NULL (falsy),
  // which incorrectly excludes manually-scheduled future sessions with null notes.
  q += ` AND NOT (s.started_at > ? AND COALESCE(s.notes, '') LIKE '__cal_event:%')`;
  params.push(nowSec);

  if (from) { q += ' AND s.started_at>=?'; params.push(from); }
  if (to)   { q += ' AND s.started_at<=?'; params.push(to); }
  q += ' ORDER BY s.started_at DESC';
  return all(q, params);
});

ipcMain.handle('sessions:active', (_, { userId }) =>
  get('SELECT * FROM sessions WHERE user_id=? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1', [userId]) || null
);

// ── Return the session that is CURRENTLY IN PROGRESS based on its scheduled time ──
// Scheduled sessions have both started_at AND ended_at set (not open-ended).
// started_at <= now < ended_at means the block is happening right now.
ipcMain.handle('sessions:active_scheduled', (_, { userId }) => {
  const nowSec = Math.floor(Date.now() / 1000);
  return get(
    `SELECT s.*, p.name as project_name, p.color as project_color, c.name as client_name, c.company as client_company,
            t.title as task_title, t.description as task_description, t.keywords as task_keywords
     FROM sessions s
     LEFT JOIN projects p ON s.project_id = p.id
     LEFT JOIN clients  c ON s.client_id  = c.id
     LEFT JOIN tasks    t ON s.task_id    = t.id
     WHERE s.user_id = ?
       AND s.ended_at IS NOT NULL
       AND s.started_at <= ?
       AND s.ended_at   >  ?
       AND (s.notes IS NULL OR s.notes NOT LIKE '__auto_block:%')
     ORDER BY s.started_at DESC
     LIMIT 1`,
    [userId, nowSec, nowSec]
  ) || null;
});

// ── Periodic watcher: push scheduled-session events to the renderer every 30 s ──
// This keeps the dock in sync without requiring the renderer to poll.
let _scheduledWatchInterval = null;
let _lastScheduledId        = null;

function startScheduledSessionWatcher(win, userId) {
  if (_scheduledWatchInterval) clearInterval(_scheduledWatchInterval);
  const check = () => {
    if (!win || win.isDestroyed()) return;
    const nowSec = Math.floor(Date.now() / 1000);
    const sess = get(
      `SELECT s.*, p.name as project_name, p.color as project_color
       FROM sessions s
       LEFT JOIN projects p ON s.project_id = p.id
       WHERE s.user_id = ?
         AND s.ended_at IS NOT NULL
         AND s.started_at <= ?
         AND s.ended_at   >  ?
         AND (s.notes IS NULL OR s.notes NOT LIKE '__auto_block:%')
       ORDER BY s.started_at DESC LIMIT 1`,
      [userId, nowSec, nowSec]
    ) || null;
    const newId = sess?.id ?? null;
    if (newId !== _lastScheduledId) {
      // A scheduled session just became active — auto-stop any running focus session
      // so the user isn't double-counted and the dock/timer reflect reality.
      if (newId !== null) {
        const active = get(
          'SELECT * FROM sessions WHERE user_id=? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1',
          [userId]
        );
        if (active) {
          const dur  = Math.max(0, nowSec - active.started_at);
          const deep = dur >= 1500 ? 1 : 0;
          run('UPDATE sessions SET ended_at=?,duration_seconds=?,is_deep_work=? WHERE id=?',
            [nowSec, dur, deep, active.id]);
          if (currentSessionId === active.id) {
            currentSessionId = null;
            clearTimeout(flowStateTimeout);
          }
          updateFocusScore(active.user_id, active.started_at, active.session_type, dur);
          if (active.task_id) {
            run('UPDATE tasks SET total_seconds=COALESCE(total_seconds,0)+? WHERE id=?',
              [Math.round(dur), active.task_id]);
          }
          run('INSERT INTO pending_entries (id,user_id,session_id,date_key) VALUES (?,?,?,?)',
            [uuidv4(), active.user_id, active.id, localDateKey(active.started_at)]);
          win.webContents.send('session:stopped', {
            title:            active.title    || null,
            category:         active.category || null,
            duration_seconds: dur,
            is_deep_work:     !!deep,
            autoStopped:      true,
            titleGenerating:  false,
          });
        }
      }
      _lastScheduledId = newId;
      win.webContents.send('tracker:scheduledSession', sess);
    }
  };
  check(); // immediate first check
  _scheduledWatchInterval = setInterval(check, 30_000);
}

function stopScheduledSessionWatcher() {
  if (_scheduledWatchInterval) { clearInterval(_scheduledWatchInterval); _scheduledWatchInterval = null; }
  _lastScheduledId = null;
}
ipcMain.handle('sessions:delete', (_, { sessionId }) => { run('DELETE FROM sessions WHERE id=?', [sessionId]); return { success: true }; });
ipcMain.handle('sessions:update', (_, { sessionId, title, category, notes, projectId, clientId }) => {
  // AI learning: if category changed, train the engine on this correction
  if (aiEngine && category) {
    try {
      const existing = get('SELECT * FROM sessions WHERE id=?', [sessionId]);
      if (existing && existing.category !== category) {
        const autoS = get('SELECT * FROM auto_sessions WHERE id=?', [sessionId]);
        const src   = autoS || existing;
        aiEngine.learnFromCorrection(
          src.app_name || '', src.url || '', src.window_title || title || '',
          existing.category || '', category
        );
      }
    } catch (_) {}
  }
  run('UPDATE sessions SET title=?,category=?,notes=?,project_id=?,client_id=? WHERE id=?',
    [title, category, notes, projectId||null, clientId||null, sessionId]);
  return { success: true };
});

ipcMain.handle('sessions:updateTime', (_, { sessionId, startedAt, endedAt }) => {
  const dur = (endedAt && startedAt) ? endedAt - startedAt : null;
  run(
    'UPDATE sessions SET started_at=?, ended_at=?, duration_seconds=? WHERE id=?',
    [startedAt, endedAt || null, dur || null, sessionId]
  );
  return { success: true };
});

// ─── AUTO-SESSIONS ────────────────────────────────────────────────────────────
ipcMain.handle('autoSessions:today', (_, { userId }) => {
  const dateKey = localDateKey();
  return all('SELECT * FROM auto_sessions WHERE user_id=? AND date_key=? ORDER BY started_at DESC', [userId, dateKey]);
});

ipcMain.handle('autoSessions:byDate', (_, { userId, dateKey }) =>
  all('SELECT * FROM auto_sessions WHERE user_id=? AND date_key=? ORDER BY started_at DESC', [userId, dateKey])
);

ipcMain.handle('autoSessions:range', (_, { userId, from, to }) =>
  all('SELECT * FROM auto_sessions WHERE user_id=? AND started_at>=? AND started_at<=? ORDER BY started_at DESC',
    [userId, from, to])
);

ipcMain.handle('autoSessions:update', (_, {
  sessionId, appName, windowTitle, url, categoryKey, categoryLabel, projectId, clientId,
}) => {
  // Capture the current category BEFORE updating so we can teach the AI the delta
  const existing = get('SELECT id, ai_category FROM auto_sessions WHERE id=?', [sessionId]);
  if (!existing) return { success: false, error: 'Session not found' };

  const previousCategory = existing.ai_category || null;

  run(
    `UPDATE auto_sessions
        SET app_name=?,
            window_title=?,
            url=?,
            ai_category=?,
            ai_label=?,
            project_id=?,
            client_id=?
      WHERE id=?`,
    [
      appName || 'Unknown',
      windowTitle || '',
      url || null,
      categoryKey || null,
      categoryLabel || null,
      projectId || null,
      clientId || null,
      sessionId,
    ]
  );

  try {
    run(
      `INSERT INTO ai_session_data
         (session_id, user_id, ai_label, ai_category)
       SELECT id, user_id, ?, ? FROM auto_sessions WHERE id=?
       ON CONFLICT(session_id) DO UPDATE SET ai_label=excluded.ai_label, ai_category=excluded.ai_category`,
      [categoryLabel || null, categoryKey || null, sessionId]
    );
  } catch (_) {}

  // Teach the AI engine about this single-session correction so the same
  // app/url/title combination is classified correctly in future sessions.
  if (aiEngine && categoryKey && previousCategory !== categoryKey) {
    aiEngine.learnFromCorrection(
      appName     || '',
      url         || '',
      windowTitle || '',
      previousCategory,
      categoryKey
    );
  }

  return { success: true };
});

ipcMain.handle('autoSessions:delete', (_, { sessionId }) => {
  run('DELETE FROM ai_session_data WHERE session_id=?', [sessionId]);
  run('DELETE FROM auto_sessions WHERE id=?', [sessionId]);
  return { success: true };
});

// Bulk-update the category for all sessions from a given app.
// scope: 'today'  → only within [todayFrom, todayTo)
//        'all'    → all dates
ipcMain.handle('autoSessions:updateCategoryByApp', (_, {
  userId, appName, categoryKey, categoryLabel, scope, todayFrom, todayTo,
}) => {
  if (!userId || !appName) return { success: false, error: 'Missing required params' };

  if (scope === 'today' && todayFrom != null) {
    run(
      `UPDATE auto_sessions SET ai_category=?, ai_label=?
       WHERE user_id=? AND app_name=? AND started_at>=? AND started_at<?`,
      [categoryKey || null, categoryLabel || null, userId, appName, todayFrom, todayTo ?? todayFrom + 86400]
    );
    // Moderate AI override: today's sessions + near-future (boost 0.70)
    if (aiEngine && categoryKey) {
      aiEngine.learnAppOverride(appName, categoryKey, 0.70);
    }
  } else {
    // scope === 'all': user explicitly applied category to every past & future session
    run(
      `UPDATE auto_sessions SET ai_category=?, ai_label=?
       WHERE user_id=? AND app_name=?`,
      [categoryKey || null, categoryLabel || null, userId, appName]
    );
    // Strong AI override: 0.95 beats every built-in pattern (max ~0.80)
    // so future auto-sessions from this app are always classified correctly.
    if (aiEngine && categoryKey) {
      aiEngine.learnAppOverride(appName, categoryKey, 0.95);
    }
  }

  return { success: true };
});

ipcMain.handle('autoSessions:live', (_, { userId }) => {
  // Return current live session info from tracker
  if (!tracker || !currentUserId || currentUserId !== userId) return null;
  return {
    appName: tracker.currentApp,
    title:   tracker.currentTitle,
    url:     tracker.currentUrl,
    elapsed: tracker.sessionStart ? Math.floor((Date.now() - tracker.sessionStart) / 1000) : 0,
    idle:    tracker.idle,
  };
});

// ─── AUTO-BLOCK → SESSIONS UPSERT ────────────────────────────────────────────
// When the user assigns a project/client to an auto-tracked block in the
// Activity Inbox, we persist it as a sessions-table row so that project stats,
// client stats, task totals, and goal progress all reflect the time correctly.
ipcMain.handle('autoSessions:saveBlock', (_, {
  userId, blockId, projectId, clientId, taskId, task,
  startedAt, endedAt, duration, type, note, prevTaskId,
}) => {
  const marker   = `__auto_block:${blockId}`;
  const existing = get('SELECT id, task_id, duration_seconds FROM sessions WHERE user_id=? AND notes=?', [userId, marker]);

  // Map activity type to session_type
  const sessionTypeMap = {
    deep: 'focus', shallow: 'focus', meeting: 'meeting', distraction: 'focus', neutral: 'focus',
  };
  const sessionType = sessionTypeMap[type] || 'focus';
  const isDeep = (type === 'deep' || (duration >= 1500 && type !== 'distraction')) ? 1 : 0;

  // ── Task time-tracking delta ─────────────────────────────────────────────
  // Determine the old task linked to this block (from DB, not the caller's memory)
  const oldTaskId = existing?.task_id || prevTaskId || null;
  const newTaskId = taskId || null;
  const dur = Math.round(duration || 0);

  if (oldTaskId !== newTaskId) {
    // Subtract from the previously linked task
    if (oldTaskId) {
      const oldDur = Math.round(existing?.duration_seconds || duration || 0);
      run('UPDATE tasks SET total_seconds = MAX(0, COALESCE(total_seconds, 0) - ?) WHERE id=?',
        [oldDur, oldTaskId]);
    }
    // Add to the newly linked task
    if (newTaskId) {
      run('UPDATE tasks SET total_seconds = COALESCE(total_seconds, 0) + ? WHERE id=?',
        [dur, newTaskId]);
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  // Derive a meaningful category from the session type so the row never
  // defaults to the DB sentinel 'General'.
  const categoryForType = type === 'meeting' ? 'Meetings'
    : type === 'deep'    ? 'Coding'
    : type === 'shallow' ? 'Research'
    : 'Focus';

  if (existing) {
    run(
      `UPDATE sessions
         SET project_id=?, client_id=?, task_id=?, title=?, notes=?,
             started_at=?, ended_at=?, duration_seconds=?,
             is_deep_work=?, session_type=?, category=?
       WHERE id=?`,
      [projectId||null, clientId||null, newTaskId, task||null, marker,
       startedAt, endedAt, duration, isDeep, sessionType, categoryForType,
       existing.id]
    );
  } else {
    const id = uuidv4();
    run(
      `INSERT INTO sessions
         (id, user_id, project_id, client_id, task_id, title, notes, category,
          started_at, ended_at, duration_seconds, is_deep_work, session_type)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, userId, projectId||null, clientId||null, newTaskId, task||null, marker, categoryForType,
       startedAt, endedAt, duration, isDeep, sessionType]
    );
  }
  return { success: true };
});

// ─── AUTO TRACK SETTINGS ─────────────────────────────────────────────────────
ipcMain.handle('tracking:getSettings', (_, { userId }) =>
  get('SELECT * FROM tracking_settings WHERE user_id=?', [userId]) ||
  { auto_track: 1, start_on_login: 1, idle_threshold_secs: 60, blocked_attempts: 0 }
);

ipcMain.handle('tracking:updateSettings', (_, { userId, autoTrack, startOnLogin, idleThreshold }) => {
  const existing = get('SELECT id FROM tracking_settings WHERE user_id=?', [userId]);
  if (existing) {
    run('UPDATE tracking_settings SET auto_track=?,start_on_login=?,idle_threshold_secs=? WHERE user_id=?',
      [autoTrack?1:0, startOnLogin?1:0, idleThreshold||60, userId]);
  } else {
    run('INSERT INTO tracking_settings (id,user_id,auto_track,start_on_login,idle_threshold_secs) VALUES (?,?,?,?,?)',
      [uuidv4(), userId, autoTrack?1:0, startOnLogin?1:0, idleThreshold||60]);
  }
  // Apply auto-start
  app.setLoginItemSettings({ openAtLogin: !!startOnLogin });
  // Switching to manual → gracefully close any running AF session first
  if (!autoTrack && afSession) {
    closeAutoFocusSession('mode_switch');
  } else if (!autoTrack) {
    afReset();
    if (mainWindow) mainWindow.webContents.send('tracker:afState',
      { state: 'watching', session: null, bufferPct: 0, reason: 'mode_switch' });
  }
  // Start/stop tracker
  if (autoTrack && !tracker) startAutoTracker(userId);
  if (!autoTrack && tracker) { tracker.stop(); tracker = null; }
  return { success: true };
});

ipcMain.handle('tracking:updateExclusions', (_, { userId, appBlacklist, websiteBlacklist, privateModeApps }) => {
  const toList = (arr) => JSON.stringify(Array.isArray(arr) ? arr : []);
  run(
    `INSERT INTO tracking_exclusions (user_id, app_blacklist, website_blacklist, private_apps)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       app_blacklist=excluded.app_blacklist,
       website_blacklist=excluded.website_blacklist,
       private_apps=excluded.private_apps`,
    [userId, toList(appBlacklist), toList(websiteBlacklist), toList(privateModeApps)]
  );
  // Hot-reload into the in-memory variable so running tracker picks it up immediately
  loadTrackingExclusions(userId);
  return { success: true };
});

ipcMain.handle('tracking:startTracker', (_, { userId }) => {
  startAutoTracker(userId);
  return { success: true };
});

ipcMain.handle('tracking:stopTracker', () => {
  if (tracker) { tracker.stop(); tracker = null; }
  return { success: true };
});

ipcMain.handle('tracking:status', () => ({
  running:    !!tracker,
  currentApp: tracker?.currentApp || null,
  idle:       tracker?.idle || false,
  platform:   process.platform,
}));

// User-triggered stop of the current auto-focus session (stop button in timer UI)
ipcMain.handle('tracking:stopAutoSession', () => {
  if (afSession) {
    closeAutoFocusSession('user_stopped');
  } else {
    // In case we're still buffering — cancel the buffer too
    afReset();
    afBroadcast('user_stopped');
  }
  return { success: true };
});

// User-triggered pause — stops current session but keeps machine in user_paused
// so it won't auto-start a new session until the user resumes.
ipcMain.handle('tracking:pauseAutoSession', () => {
  if (afSession) {
    closeAutoFocusSession('user_paused');
  } else {
    clearAfBuffer('user_paused');
    clearTimeout(afIdleTimer);  afIdleTimer  = null;
    afSession     = null;
  }
  setAfState('user_paused', 'user_paused');
  afBroadcast('user_paused');
  return { success: true };
});

// User-triggered resume — transitions back to 'watching' so heartbeats can
// drive the AF machine again.
// Guard: only transition from user_paused. If a session is already tracking,
// calling resume (e.g. from the renderer's calendar-event-end handler) must
// not clobber the running session by setting afState = 'watching'.
ipcMain.handle('tracking:resumeAutoTracking', () => {
  if (ensureActiveAfTracking('user_resume_active_session')) {
    afBroadcast('user_resume_active_session');
  } else if (afState === 'user_paused') {
    setAfState('watching', 'user_resumed');
    afBroadcast('user_resumed');
  }
  return { success: true };
});

// Returns current AF machine state so the TimerPage can sync on mount
// without waiting for the next heartbeat event.
ipcMain.handle('tracker:getAutoFocusState', () => {
  hydrateActiveAfSessionFromDb('get_state_db_active_session');
  ensureActiveAfTracking('get_state_active_session_guard');
  const state = hasActiveAfSession() ? 'tracking' : afState;
  const bufferPct = (state === 'buffering' && afBufferStart)
    ? Math.min(100, Math.round(((Date.now() - afBufferStart) / 1000 / AF_THRESHOLD_SECS) * 100))
    : 0;
  logAF('AF_BROADCAST_STATE', 'get_auto_focus_state', { broadcastState: state, bufferPct });
  return { state, session: afSession, bufferPct };
});

// ─── FOCUS MODE ───────────────────────────────────────────────────────────────
ipcMain.handle('focusMode:start', (_, { userId, profileId, ruleScope } = {}) => {
  focusModeActive = true;
  focusStartTime  = Date.now();
  focusProfileId  = profileId ?? null;
  focusRuleScope  = ruleScope === 'profile' || profileId ? 'profile' : 'global';
  if (mainWindow) mainWindow.webContents.send('focusMode:changed', { active: true, startedAt: focusStartTime, profileId: focusProfileId, ruleScope: focusRuleScope });
  return { success: true, startedAt: focusStartTime, profileId: focusProfileId, ruleScope: focusRuleScope };
});

ipcMain.handle('focusMode:stop', () => {
  focusModeActive = false;
  focusStartTime  = null;
  focusProfileId  = null;
  focusRuleScope  = 'global';
  _scheduleControlledFocus = false;
  if (mainWindow) mainWindow.webContents.send('focusMode:changed', { active: false, startedAt: null, profileId: null, ruleScope: focusRuleScope });
  return { success: true };
});

// Returns persistent start time so re-mounting the component never resets the elapsed clock
ipcMain.handle('focusMode:status', () => ({
  active:    focusModeActive,
  startedAt: focusStartTime,   // ms timestamp or null
  profileId: focusProfileId,   // active profile id or null
  ruleScope: focusRuleScope,
}));

// ─── APP USAGE ────────────────────────────────────────────────────────────────
ipcMain.handle('appUsage:today', (_, { userId }) => {
  const dateKey = localDateKey();
  return all('SELECT app_name, SUM(duration_seconds) as total FROM app_usage WHERE user_id=? AND date_key=? GROUP BY app_name ORDER BY total DESC LIMIT 20', [userId, dateKey]);
});
ipcMain.handle('appUsage:bySession', (_, { sessionId }) =>
  all('SELECT app_name, SUM(duration_seconds) as total FROM app_usage WHERE session_id=? GROUP BY app_name ORDER BY total DESC', [sessionId])
);
ipcMain.handle('appUsage:byDate', (_, { userId, dateKey }) =>
  all('SELECT app_name, SUM(duration_seconds) as total FROM app_usage WHERE user_id=? AND date_key=? GROUP BY app_name ORDER BY total DESC LIMIT 25', [userId, dateKey])
);
ipcMain.handle('appUsage:range', (_, { userId, from, to }) =>
  all('SELECT app_name, SUM(duration_seconds) as total, date_key FROM app_usage WHERE user_id=? AND recorded_at>=? AND recorded_at<=? GROUP BY app_name, date_key ORDER BY total DESC', [userId, from, to])
);

// ─── CATEGORIES ───────────────────────────────────────────────────────────────
ipcMain.handle('categories:list',   (_, { userId }) => all('SELECT * FROM categories WHERE user_id=?', [userId]));
ipcMain.handle('categories:create', (_, { userId, name, color, icon, sessionType }) => {
  const id = uuidv4();
  run('INSERT INTO categories (id,user_id,name,color,icon,session_type) VALUES (?,?,?,?,?,?)', [id, userId, name, color, icon||'folder', sessionType||'focus']);
  return { id, name, color, icon, session_type: sessionType||'focus' };
});
ipcMain.handle('categories:delete', (_, { categoryId }) => { run('DELETE FROM categories WHERE id=?', [categoryId]); return { success: true }; });

// ─── PROJECTS ─────────────────────────────────────────────────────────────────
ipcMain.handle('projects:list',   (_, { userId }) =>
  all('SELECT p.*, c.name as client_name FROM projects p LEFT JOIN clients c ON p.client_id=c.id WHERE p.user_id=? AND p.active=1', [userId])
);
ipcMain.handle('projects:create', (_, { userId, name, color, clientId, hourlyRate, keywords, status, weeklyBudgetHours }) => {
  const id = uuidv4();
  run('INSERT INTO projects (id,user_id,name,color,client_id,hourly_rate,keywords,status,weekly_budget_hours) VALUES (?,?,?,?,?,?,?,?,?)',
    [id, userId, name, color||'#3b82f6', clientId||null, hourlyRate||0, keywords||null, status||'active', weeklyBudgetHours||0]);
  return { id, name, color: color||'#3b82f6', client_id: clientId, hourly_rate: hourlyRate||0, keywords: keywords||null, status: status||'active', weekly_budget_hours: weeklyBudgetHours||0 };
});
ipcMain.handle('projects:update', (_, { projectId, name, color, clientId, hourlyRate, keywords, status, weeklyBudgetHours, notes }) => {
  const sets = [], vals = [];
  if (name              !== undefined) { sets.push('name=?');                vals.push(name); }
  if (color             !== undefined) { sets.push('color=?');               vals.push(color); }
  if (clientId          !== undefined) { sets.push('client_id=?');           vals.push(clientId || null); }
  if (hourlyRate        !== undefined) { sets.push('hourly_rate=?');         vals.push(hourlyRate || 0); }
  if (keywords          !== undefined) { sets.push('keywords=?');            vals.push(keywords || null); }
  if (status            !== undefined) { sets.push('status=?');              vals.push(status); }
  if (weeklyBudgetHours !== undefined) { sets.push('weekly_budget_hours=?'); vals.push(weeklyBudgetHours || 0); }
  if (notes             !== undefined) { sets.push('notes=?');               vals.push(notes || null); }
  if (sets.length === 0) return { success: true };
  vals.push(projectId);
  run(`UPDATE projects SET ${sets.join(',')} WHERE id=?`, vals);
  return { success: true };
});
ipcMain.handle('projects:delete', (_, { projectId }) => { run('UPDATE projects SET active=0 WHERE id=?', [projectId]); return { success: true }; });
ipcMain.handle('projects:recentSessions', (_, { userId, projectId, limit = 5 }) =>
  all('SELECT * FROM sessions WHERE user_id=? AND project_id=? AND ended_at IS NOT NULL ORDER BY started_at DESC LIMIT ?', [userId, projectId, limit])
);
ipcMain.handle('projects:stats', (_, { userId, projectId, from, to }) => {
  const now = Math.floor(Date.now()/1000);
  const f = from || (now - 30 * 86400);
  const t = to   || now;
  // Only count actual completed work — sessions and auto-tracked time.
  // Calendar events are scheduled time, NOT worked time; they must never
  // contribute to project hours even if assigned a project.
  const manual = get(
    `SELECT SUM(duration_seconds) as total, COUNT(*) as count
     FROM sessions
     WHERE user_id=? AND project_id=? AND ended_at IS NOT NULL
       AND started_at>=? AND started_at<=?
       AND started_at <= ?`,
    [userId, projectId, f, t, now]
  );
  const auto = get(
    'SELECT SUM(duration_seconds) as total FROM auto_sessions WHERE user_id=? AND project_id=? AND started_at>=? AND started_at<=?',
    [userId, projectId, f, t]
  );
  return {
    total: (manual?.total || 0) + (auto?.total || 0),
    count: manual?.count || 0,
  };
});

// ─── CLIENTS ─────────────────────────────────────────────────────────────────
ipcMain.handle('clients:list',   (_, { userId }) => all('SELECT * FROM clients WHERE user_id=? AND active=1 ORDER BY name', [userId]));
ipcMain.handle('clients:create', (_, { userId, name, email, company, color, hourlyRate, monthlyRetainer, includedHours, keywords, billingType, status, currency }) => {
  const id = uuidv4();
  run('INSERT INTO clients (id,user_id,name,email,company,color,hourly_rate,monthly_retainer,included_hours,keywords,billing_type,status,currency) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
    [id, userId, name, email||null, company||null, color||'#6366f1', hourlyRate||0, monthlyRetainer||0, includedHours||0, keywords||null, billingType||'none', status||'active', currency||'USD']);
  return { id, name, email, company, color: color||'#6366f1', hourly_rate: hourlyRate||0, monthly_retainer: monthlyRetainer||0, included_hours: includedHours||0, keywords: keywords||null, billing_type: billingType||'none', status: status||'active', currency: currency||'USD' };
});
ipcMain.handle('clients:update', (_, { clientId, name, email, company, color, hourlyRate, monthlyRetainer, includedHours, keywords, billingType, status, currency }) => {
  run('UPDATE clients SET name=?,email=?,company=?,color=?,hourly_rate=?,monthly_retainer=?,included_hours=?,keywords=?,billing_type=?,status=?,currency=? WHERE id=?',
    [name, email||null, company||null, color, hourlyRate||0, monthlyRetainer||0, includedHours||0, keywords||null, billingType||'none', status||'active', currency||'USD', clientId]);
  return { success: true };
});
ipcMain.handle('clients:delete', (_, { clientId }) => { run('UPDATE clients SET active=0 WHERE id=?', [clientId]); return { success: true }; });
ipcMain.handle('clients:stats', (_, { userId, clientId, from, to }) => {
  const now = Math.floor(Date.now()/1000);
  const f = from||(now-30*86400), t = to||now;
  const sessions = all(
    `SELECT s.*, p.hourly_rate FROM sessions s LEFT JOIN projects p ON s.project_id=p.id
     WHERE s.user_id=? AND (s.client_id=? OR p.client_id=?) AND s.ended_at IS NOT NULL AND s.started_at>=? AND s.started_at<=?`,
    [userId, clientId, clientId, f, t]
  );
  // Also count auto-tracked time for this client (direct match or via project)
  const autoRows = all(
    `SELECT a.duration_seconds, p.hourly_rate FROM auto_sessions a
     LEFT JOIN projects p ON a.project_id=p.id
     WHERE a.user_id=? AND (a.client_id=? OR p.client_id=?) AND a.started_at>=? AND a.started_at<=?`,
    [userId, clientId, clientId, f, t]
  );
  const manualSecs = sessions.reduce((a,r) => a+(r.duration_seconds||0), 0);
  const autoSecs   = autoRows.reduce((a,r) => a+(r.duration_seconds||0), 0);
  const revenue    = sessions.reduce((a,r) => a+((r.duration_seconds||0)/3600)*(r.hourly_rate||0), 0)
                   + autoRows.reduce((a,r) => a+((r.duration_seconds||0)/3600)*(r.hourly_rate||0), 0);
  return { sessions, totalSeconds: manualSecs + autoSecs, revenue, sessionCount: sessions.length };
});

// ─── INVOICES ─────────────────────────────────────────────────────────────────
ipcMain.handle('invoices:list', (_, { userId, clientId }) => {
  if (clientId) {
    return all(
      `SELECT i.*, c.name as client_name, c.color as client_color FROM invoices i
       LEFT JOIN clients c ON i.client_id=c.id
       WHERE i.user_id=? AND i.client_id=? ORDER BY i.issue_date DESC`,
      [userId, clientId]
    );
  }
  return all(
    `SELECT i.*, c.name as client_name, c.color as client_color FROM invoices i
     LEFT JOIN clients c ON i.client_id=c.id
     WHERE i.user_id=? ORDER BY i.issue_date DESC`,
    [userId]
  );
});

ipcMain.handle('invoices:get', (_, { invoiceId }) => {
  return get(
    `SELECT i.*, c.name as client_name, c.email as client_email, c.company as client_company, c.color as client_color
     FROM invoices i LEFT JOIN clients c ON i.client_id=c.id WHERE i.id=?`,
    [invoiceId]
  );
});

// Generates a draft invoice by aggregating billable tracked time for a client
// over a date range into per-project line items. Uses the same billable
// heuristic as profitability:summary (project/client rate > 0, notes don't
// contain "[non-billable]") so invoice totals always match what the
// Profitability page already reports for that period.
ipcMain.handle('invoices:generate', (_, { userId, clientId, from, to, taxRate, dueDate, notes }) => {
  const client = get('SELECT * FROM clients WHERE id=?', [clientId]);
  if (!client) return { success: false, error: 'Client not found' };

  const rows = all(
    `SELECT s.duration_seconds, s.notes, s.project_id, p.name as project_name, p.hourly_rate as project_rate
     FROM sessions s LEFT JOIN projects p ON s.project_id=p.id
     WHERE s.user_id=? AND (s.client_id=? OR p.client_id=?) AND s.ended_at IS NOT NULL
       AND s.started_at>=? AND s.started_at<=?`,
    [userId, clientId, clientId, from, to]
  );
  const billable = rows.filter(r => !String(r.notes || '').includes('[non-billable]'));
  const totalHours = billable.reduce((s, r) => s + (r.duration_seconds || 0) / 3600, 0);

  // Billing line items depend on the client's billing model:
  //   - retainer: flat monthly fee, independent of hours tracked
  //   - hybrid:   flat monthly fee + overage hours beyond included_hours, billed
  //               at the client's hourly_rate (used as the "overage rate" for hybrid)
  //   - hourly/none: per-project hours × rate (project rate overrides client rate)
  let lineItems = [];

  if (client.billing_type === 'retainer' || client.billing_type === 'hybrid') {
    lineItems.push({
      description: 'Monthly Retainer',
      hours: Math.round(totalHours * 100) / 100,
      rate: null, // flat fee — not hours × rate
      amount: client.monthly_retainer || 0,
    });

    if (client.billing_type === 'hybrid' && client.hourly_rate > 0) {
      const overageHours = Math.max(0, totalHours - (client.included_hours || 0));
      if (overageHours > 0) {
        lineItems.push({
          description: 'Overage Hours',
          hours: Math.round(overageHours * 100) / 100,
          rate: client.hourly_rate,
          amount: Math.round(overageHours * client.hourly_rate * 100) / 100,
        });
      }
    }
  } else {
    // Group by project name (falls back to "General" for direct client-tagged
    // sessions with no project), using the project's own rate when set,
    // otherwise the client's hourly rate.
    const groups = {};
    for (const r of billable) {
      const key  = r.project_name || 'General';
      const rate = (r.project_rate && r.project_rate > 0) ? r.project_rate : (client.hourly_rate || 0);
      if (!groups[key]) groups[key] = { description: key, hours: 0, rate };
      groups[key].hours += (r.duration_seconds || 0) / 3600;
    }
    lineItems = Object.values(groups)
      .filter(g => g.hours > 0 && g.rate > 0)
      .map(g => ({
        description: g.description,
        hours: Math.round(g.hours * 100) / 100,
        rate: g.rate,
        amount: Math.round(g.hours * g.rate * 100) / 100,
      }));
  }

  const subtotal  = Math.round(lineItems.reduce((s, l) => s + l.amount, 0) * 100) / 100;
  const tax       = taxRate || 0;
  const taxAmount = Math.round(subtotal * (tax / 100) * 100) / 100;
  const total     = Math.round((subtotal + taxAmount) * 100) / 100;

  // Sequential, human-readable invoice numbers: INV-0001, INV-0002, ...
  const countRow      = get('SELECT COUNT(*) as n FROM invoices WHERE user_id=?', [userId]);
  const invoiceNumber = `INV-${String((countRow?.n || 0) + 1).padStart(4, '0')}`;

  const id  = uuidv4();
  const now = Math.floor(Date.now() / 1000);
  run(
    `INSERT INTO invoices
       (id,user_id,client_id,invoice_number,status,currency,issue_date,due_date,period_from,period_to,line_items_json,subtotal,tax_rate,tax_amount,total,notes,created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, userId, clientId, invoiceNumber, 'draft', client.currency || 'USD', now, dueDate || null, from, to,
     JSON.stringify(lineItems), subtotal, tax, taxAmount, total, notes || null, now]
  );

  return get('SELECT * FROM invoices WHERE id=?', [id]);
});

ipcMain.handle('invoices:update', (_, { invoiceId, status, notes, dueDate, taxRate }) => {
  const inv = get('SELECT * FROM invoices WHERE id=?', [invoiceId]);
  if (!inv) return { success: false, error: 'Invoice not found' };

  const newTaxRate = taxRate != null ? taxRate : inv.tax_rate;
  const taxAmount  = Math.round(inv.subtotal * (newTaxRate / 100) * 100) / 100;
  const total      = Math.round((inv.subtotal + taxAmount) * 100) / 100;

  let paidAt = inv.paid_at;
  if (status === 'paid' && inv.status !== 'paid') paidAt = Math.floor(Date.now() / 1000);
  if (status && status !== 'paid') paidAt = null;

  run(
    `UPDATE invoices SET status=?, notes=?, due_date=?, tax_rate=?, tax_amount=?, total=?, paid_at=? WHERE id=?`,
    [status || inv.status, notes != null ? notes : inv.notes, dueDate != null ? dueDate : inv.due_date,
     newTaxRate, taxAmount, total, paidAt, invoiceId]
  );
  return { success: true };
});

ipcMain.handle('invoices:delete', (_, { invoiceId }) => {
  run('DELETE FROM invoices WHERE id=?', [invoiceId]);
  return { success: true };
});

// ─── TASKS ───────────────────────────────────────────────────────────────────
ipcMain.handle('tasks:list', (_, { userId, projectId }) => {
  if (projectId) {
    return all(
      `SELECT t.*, p.name as project_name, p.color as project_color, c.name as client_name
       FROM tasks t
       LEFT JOIN projects p ON t.project_id=p.id
       LEFT JOIN clients  c ON t.client_id=c.id
       WHERE t.user_id=? AND t.project_id=? ORDER BY t.created_at DESC`,
      [userId, projectId]
    );
  }
  return all(
    `SELECT t.*, p.name as project_name, p.color as project_color, c.name as client_name
     FROM tasks t
     LEFT JOIN projects p ON t.project_id=p.id
     LEFT JOIN clients  c ON t.client_id=c.id
     WHERE t.user_id=? ORDER BY t.created_at DESC`,
    [userId]
  );
});
ipcMain.handle('tasks:create', (_, { userId, title, description, projectId, clientId, keywords, dueDate, status, priority, estimatedHours, parentTaskId }) => {
  const id  = uuidv4();
  const now = Math.floor(Date.now()/1000);
  run('INSERT INTO tasks (id,user_id,title,description,project_id,client_id,keywords,due_date,status,priority,estimated_hours,parent_task_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    [id, userId, title, description||null, projectId||null, clientId||null, keywords||null, dueDate||null, status||'todo', priority||3, estimatedHours||null, parentTaskId||null, now, now]);
  return { id, title, status: status||'todo', parent_task_id: parentTaskId||null };
});
ipcMain.handle('tasks:update', (_, payload = {}) => {
  const { taskId } = payload;
  if (!taskId) return { success: false, error: 'Missing taskId' };

  const fieldMap = [
    ['title',          'title'],
    ['description',    'description'],
    ['projectId',      'project_id'],
    ['clientId',       'client_id'],
    ['keywords',       'keywords'],
    ['dueDate',        'due_date'],
    ['status',         'status'],
    ['priority',       'priority'],
    ['estimatedHours', 'estimated_hours'],
    ['totalSeconds',   'total_seconds'],
    ['parentTaskId',   'parent_task_id'],
    ['notes',          'notes'],
    ['reminderAt',     'reminder_at'],
    ['recurrenceRule', 'recurrence_rule'],
  ];

  const nullableFields = new Set([
    'description', 'projectId', 'clientId', 'keywords', 'dueDate',
    'estimatedHours', 'totalSeconds', 'parentTaskId', 'notes', 'reminderAt', 'recurrenceRule',
  ]);
  const sets = [];
  const values = [];

  for (const [inputKey, column] of fieldMap) {
    if (!Object.prototype.hasOwnProperty.call(payload, inputKey)) continue;

    let value = payload[inputKey];
    if (inputKey === 'status' && !value) value = 'todo';
    if (nullableFields.has(inputKey) && value === '') value = null;
    if (value === undefined) continue;

    sets.push(`${column}=?`);
    values.push(value);
  }

  if (!sets.length) return { success: true };

  const now = Math.floor(Date.now() / 1000);
  sets.push('updated_at=?');
  values.push(now, taskId);

  run(`UPDATE tasks SET ${sets.join(',')} WHERE id=?`, values);

  // When a recurring task is marked done, schedule the next occurrence automatically
  if (payload.status === 'done') {
    const t = get('SELECT recurrence_rule, due_date FROM tasks WHERE id=?', [taskId]);
    if (t?.recurrence_rule) {
      const nextDue = computeNextRecurringDue(t.due_date, t.recurrence_rule);
      run('UPDATE tasks SET status=?,due_date=?,reminder_at=NULL,updated_at=? WHERE id=?',
        ['todo', nextDue, now, taskId]);
      return { success: true, rescheduled: true, nextDue };
    }
  }

  return { success: true };
});
ipcMain.handle('tasks:delete',   (_, { taskId }) => { run('DELETE FROM tasks WHERE id=?', [taskId]); return { success: true }; });
ipcMain.handle('tasks:lastActivity', (_, { userId, taskId }) => {
  // Last session where title or notes contains task keywords (best-effort)
  const task = get('SELECT * FROM tasks WHERE id=?', [taskId]);
  if (!task) return null;
  const kw = task.title.toLowerCase();
  const rows = all(`SELECT started_at FROM sessions WHERE user_id=? AND ended_at IS NOT NULL AND (LOWER(title) LIKE ? OR task_id=?) ORDER BY started_at DESC LIMIT 1`,
    [userId, `%${kw}%`, taskId]);
  return rows[0]?.started_at || null;
});

// ─── TAGS ─────────────────────────────────────────────────────────────────────
ipcMain.handle('tags:list',           (_, { userId }) => all('SELECT * FROM tags WHERE user_id=?', [userId]));
ipcMain.handle('tags:create',         (_, { userId, name, color }) => {
  const id = uuidv4();
  run('INSERT INTO tags (id,user_id,name,color) VALUES (?,?,?,?)', [id, userId, name, color||'#6366f1']);
  return { id, name, color: color||'#6366f1' };
});
ipcMain.handle('tags:delete',         (_, { tagId }) => { run('DELETE FROM tags WHERE id=?', [tagId]); run('DELETE FROM session_tags WHERE tag_id=?', [tagId]); return { success: true }; });
ipcMain.handle('tags:forSession',     (_, { sessionId }) => all('SELECT t.* FROM tags t JOIN session_tags st ON t.id=st.tag_id WHERE st.session_id=?', [sessionId]));
ipcMain.handle('tags:addToSession',   (_, { sessionId, tagId }) => { try { run('INSERT OR IGNORE INTO session_tags (session_id,tag_id) VALUES (?,?)', [sessionId, tagId]); } catch {} return { success: true }; });
ipcMain.handle('tags:removeFromSession', (_, { sessionId, tagId }) => { run('DELETE FROM session_tags WHERE session_id=? AND tag_id=?', [sessionId, tagId]); return { success: true }; });

// ─── DISTRACTION RULES ────────────────────────────────────────────────────────
ipcMain.handle('distractions:list',   (_, { userId }) => all('SELECT * FROM distraction_rules WHERE user_id=? ORDER BY created_at DESC', [userId]));
ipcMain.handle('distractions:create', (_, { userId, ruleType, pattern, label }) => {
  const id = uuidv4();

  // 🔹 Clean URL (IMPORTANT)
  function cleanPattern(input) {
    try {
      const url = new URL(input);
      return url.hostname;
    } catch {
      return input
        .replace(/^https?:\/\//, '')
        .replace('www.', '')
        .split('/')[0];
    }
  }

  const cleanedPattern = cleanPattern(pattern);

  // 🔹 Force correct type
  const finalType = cleanedPattern.includes('.') ? 'url' : 'app';

  run(
    'INSERT INTO distraction_rules (id,user_id,rule_type,pattern,label) VALUES (?,?,?,?,?)',
    [id, userId, finalType, cleanedPattern, label || null]
  );

  return { id, rule_type: finalType, pattern: cleanedPattern, label };
});
ipcMain.handle('distractions:toggle', (_, { ruleId, active }) => { run('UPDATE distraction_rules SET active=? WHERE id=?', [active?1:0, ruleId]); return { success: true }; });
ipcMain.handle('distractions:delete', (_, { ruleId }) => { run('DELETE FROM distraction_rules WHERE id=?', [ruleId]); return { success: true }; });

// ─── BLOCKER PROFILES ──────────────────────────────────────────────────────
ipcMain.handle('blockerProfiles:list', (_, { userId }) =>
  all(`SELECT bp.*, COUNT(dr.id) as rule_count
       FROM blocker_profiles bp
       LEFT JOIN distraction_rules dr ON dr.profile_id=bp.id
       WHERE bp.user_id=? GROUP BY bp.id ORDER BY bp.created_at`, [userId])
);

ipcMain.handle('blockerProfiles:create', (_, { userId, name, color }) => {
  const id = uuidv4();
  run('INSERT INTO blocker_profiles (id,user_id,name,color) VALUES (?,?,?,?)',
    [id, userId, name, color || '#7C6CF2']);
  return { id, user_id: userId, name, color: color || '#7C6CF2', active: 0, rule_count: 0 };
});

ipcMain.handle('blockerProfiles:update', (_, { profileId, name, color }) => {
  run('UPDATE blocker_profiles SET name=?, color=? WHERE id=?', [name, color, profileId]);
  return { success: true };
});

ipcMain.handle('blockerProfiles:toggle', (_, { profileId, active }) => {
  run('UPDATE blocker_profiles SET active=? WHERE id=?', [active ? 1 : 0, profileId]);
  return { success: true };
});

ipcMain.handle('blockerProfiles:delete', (_, { profileId }) => {
  run('DELETE FROM distraction_rules WHERE profile_id=?', [profileId]);
  run('DELETE FROM blocker_profiles WHERE id=?', [profileId]);
  return { success: true };
});

ipcMain.handle('blockerProfiles:listRules', (_, { profileId }) =>
  all('SELECT * FROM distraction_rules WHERE profile_id=? ORDER BY created_at DESC', [profileId])
);

ipcMain.handle('blockerProfiles:addRule', (_, { profileId, userId, ruleType, pattern, label }) => {
  if (!userId)    throw new Error('userId is required');
  if (!profileId) throw new Error('profileId is required');
  if (!pattern)   throw new Error('pattern is required');
  const id = uuidv4();
  run('INSERT INTO distraction_rules (id,user_id,rule_type,pattern,label,profile_id,active) VALUES (?,?,?,?,?,?,1)',
    [id, userId, ruleType || 'app', pattern, label || null, profileId]);
  return { id, user_id: userId, rule_type: ruleType || 'app', pattern, label: label || null, profile_id: profileId, active: 1 };
});

ipcMain.handle('blockerProfiles:removeRule', (_, { ruleId }) => {
  run('DELETE FROM distraction_rules WHERE id=?', [ruleId]);
  return { success: true };
});

// ─── BREAK SETTINGS ───────────────────────────────────────────────────────────
ipcMain.handle('break:getSettings', (_, { userId }) =>
  get('SELECT * FROM break_settings WHERE user_id=?', [userId]) || { enabled:1, work_interval_mins:52, break_duration_mins:17 }
);
ipcMain.handle('break:updateSettings', (_, { userId, enabled, workIntervalMins, breakDurationMins, reminderStyle }) => {
  const ex = get('SELECT id FROM break_settings WHERE user_id=?', [userId]);
  if (ex) {
    run('UPDATE break_settings SET enabled=?,work_interval_mins=?,break_duration_mins=?,reminder_style=? WHERE user_id=?',
      [enabled?1:0, workIntervalMins||52, breakDurationMins||17, reminderStyle||'gentle', userId]);
  } else {
    run('INSERT INTO break_settings (id,user_id,enabled,work_interval_mins,break_duration_mins,reminder_style) VALUES (?,?,?,?,?,?)',
      [uuidv4(), userId, enabled?1:0, workIntervalMins||52, breakDurationMins||17, reminderStyle||'gentle']);
  }
  scheduleBreakReminder(userId);
  return { success: true };
});
ipcMain.handle('break:dismiss', (_, { userId, snoozeMins }) => {
  if (pendingBreakNotification) {
    try { pendingBreakNotification.close(); } catch {}
    pendingBreakNotification = null;
  }
  scheduleBreakReminder(userId, snoozeMins ? snoozeMins * 60 * 1000 : null);
  return { success: true };
});

// ─── PDF REPORT EXPORT ─────────────────────────────────────────────────────────
// Renders report HTML in a hidden, offscreen window and uses Chromium's native
// printToPDF (same engine as `chrome --headless --print-to-pdf`) so the output
// gets real automatic page numbers and a footer that repeats on every page via
// headerTemplate/footerTemplate — neither is achievable from window.print().
ipcMain.handle('export:pdf', async (_, { html, headerTemplate, footerTemplate, defaultFilename }) => {
  let win = null;
  try {
    win = new BrowserWindow({
      show: false,
      webPreferences: { offscreen: true, sandbox: true },
    });
    await win.loadURL('data:text/html;charset=UTF-8,' + encodeURIComponent(html));

    const pdfBuffer = await win.webContents.printToPDF({
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: headerTemplate || '<div></div>',
      footerTemplate: footerTemplate || '<div></div>',
      preferCSSPageSize: true,
      // Custom margins leave room for the header/footer templates above —
      // 'default' margins are too tight and clip them on some page sizes.
      margins: { marginType: 'custom', top: 0.7, bottom: 0.65, left: 0.4, right: 0.4 },
    });

    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Save Report as PDF',
      defaultPath: defaultFilename || 'flow-ledger-report.pdf',
      filters: [{ name: 'PDF Document', extensions: ['pdf'] }],
    });
    if (canceled || !filePath) return { success: false, canceled: true };

    fs.writeFileSync(filePath, pdfBuffer);
    return { success: true, path: filePath };
  } catch (err) {
    console.error('[export:pdf] failed:', err.message);
    return { success: false, error: err.message };
  } finally {
    if (win && !win.isDestroyed()) win.destroy();
  }
});

// ─── ACTIVITY SNAPSHOT IMAGE EXPORT ─────────────────────────────────────────────
// Renders the snapshot template's static HTML (from react-dom/server) in an
// offscreen-rendered window and captures it via the OSR 'paint' event — a
// literal screenshot of what was actually rendered, into a virtual
// framebuffer with no dependency on the host machine's real screen/compositor.
// Deliberately NOT html2canvas: html2canvas re-implements text/box painting
// in JS and has long-standing bugs where it correctly reads a flex child's
// position/size from the real layout but then paints the text glyphs at the
// wrong vertical offset within that box (confirmed here — icons centered via
// the exact same CSS technique rendered correctly, only text didn't).
//
// NOTE on two earlier attempts that didn't work, kept here so this isn't
// re-litigated blind next time:
//   1. capturePage() combined with webPreferences.offscreen — unsupported
//      pairing; capturePage() is for normal compositor-managed windows.
//   2. A normal (non-offscreen) window positioned far off-screen + shown via
//      showInactive(), then capturePage() — confirmed via live debugging to
//      return a 0-byte image on this machine: an off-screen-positioned window
//      apparently never gets composited by the GPU/DWM at all here, even when
//      "shown". Ruled out entirely, not just unreliable.
//   3. (This version, refined from the first offscreen attempt) OSR + 'paint'
//      previously came back truncated because the BrowserWindow constructor's
//      width/height isn't reliably honored by the OSR backing store — it
//      needs an explicit setContentSize() call AFTER creation, plus an
//      explicit invalidate() to force a repaint at the corrected size, and we
//      now track the LARGEST frame seen across a settle window rather than
//      requiring the first frame to exactly hit the target (avoids getting
//      stuck on a persistent few-pixel rounding mismatch).
ipcMain.handle('export:snapshotImage', async (_, { html, width, height }) => {
  let win = null;
  let tmpFile = null;
  try {
    // Load via a temp file + file:// instead of a data: URL — the snapshot
    // template embeds base64 app-icon images, and very long data: URLs (after
    // encodeURIComponent inflation) are a known source of silent truncation/
    // corruption in some Chromium configurations. A real file has no such
    // size-dependent edge case.
    tmpFile = path.join(app.getPath('temp'), `fl-snapshot-${Date.now()}-${Math.random().toString(36).slice(2)}.html`);
    fs.writeFileSync(tmpFile, html, 'utf8');

    win = new BrowserWindow({
      show: false,
      width, height, useContentSize: true,
      webPreferences: { offscreen: true, sandbox: true },
    });
    // Constructor width/height isn't reliably honored by the OSR backing
    // store on every platform — force it explicitly.
    win.setContentSize(width, height);

    let bestImage = null;
    let bestArea = 0;
    win.webContents.on('paint', (_event, _dirty, image) => {
      const size = image.getSize();
      const area = size.width * size.height;
      if (area > bestArea) { bestImage = image; bestArea = area; }
    });

    await win.loadFile(tmpFile);
    win.webContents.invalidate();
    // Give OSR time to settle at the corrected viewport and paint a full
    // frame — the resize, fonts, and images each trigger their own repaint.
    await new Promise(resolve => setTimeout(resolve, 600));
    win.webContents.invalidate();
    await new Promise(resolve => setTimeout(resolve, 500));

    if (!bestImage) throw new Error('No frame was painted by the offscreen renderer');
    const size = bestImage.getSize();
    if (size.width < width || size.height < height) {
      console.warn(`[export:snapshotImage] best painted frame ${size.width}x${size.height}, expected ${width}x${height}`);
    }

    const pngBuffer = bestImage.toPNG();
    // Sanity check the actual bytes — every valid PNG starts with this 8-byte
    // signature. Catching a bad capture here gives a clear error instead of
    // shipping a file that "downloads successfully" but won't open.
    const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    if (pngBuffer.length < 8 || !pngBuffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
      throw new Error(`Captured image is not a valid PNG (${pngBuffer.length} bytes)`);
    }

    return { success: true, dataBase64: pngBuffer.toString('base64') };
  } catch (err) {
    console.error('[export:snapshotImage] failed:', err.message);
    return { success: false, error: err.message };
  } finally {
    if (win && !win.isDestroyed()) win.destroy();
    if (tmpFile) { try { fs.unlinkSync(tmpFile); } catch {} }
  }
});

// ─── STATS ────────────────────────────────────────────────────────────────────
ipcMain.handle('stats:summary', (_, { userId, from, to }) => {
  const nowSec = Math.floor(Date.now() / 1000);
  // Clamp the upper bound to now so future-scheduled sessions are never counted
  // as completed time — they appear on the calendar but haven't been worked yet.
  // COALESCE avoids NULL propagation in the __cal_event filter (same fix as sessions:list).
  const effectiveTo = Math.min(to, nowSec);
  const sessions = all(
    `SELECT * FROM sessions WHERE user_id=? AND ended_at IS NOT NULL AND started_at>=? AND started_at<=?
     AND NOT (started_at > ? AND COALESCE(notes,'') LIKE '__cal_event:%')`,
    [userId, from, effectiveTo, nowSec]
  );

  // Raw auto-tracked sessions (the source of truth for tracked time)
  const autoSess = all(
    `SELECT duration_seconds, app_name, url, ai_is_deep_work, ai_category, ai_label, is_idle
     FROM auto_sessions WHERE user_id=? AND is_idle=0 AND started_at>=? AND started_at<=?`,
    [userId, from, to]
  );
  const autoTotal = autoSess.reduce((s,r) => s+(r.duration_seconds||0), 0);

  // Manual sessions that were NOT created by autoSaveBlock (avoid double-counting auto-time)
  const pureManual = sessions.filter(r => !String(r.notes||'').startsWith('__auto_block:'));
  const manualTotal = pureManual.reduce((s,r) => s+(r.duration_seconds||0), 0);

  const total = manualTotal + autoTotal;

  // Deep work: pure-manual is_deep_work=1  +  auto sessions classified as deep
  const manualDeep = pureManual.filter(r=>r.is_deep_work).reduce((s,r)=>s+(r.duration_seconds||0),0);
  const autoDeep   = autoSess.filter(s=>classifyAutoType(s)==='deep').reduce((s,r)=>s+(r.duration_seconds||0),0);
  const deepWork   = manualDeep + autoDeep;

  // Meetings, breaks — from manual sessions only (auto-tracker doesn't record those categories)
  const meetings = pureManual.filter(r=>r.session_type==='meeting').reduce((s,r)=>s+(r.duration_seconds||0),0);
  const breaks   = pureManual.filter(r=>r.session_type==='break').reduce((s,r)=>s+(r.duration_seconds||0),0);

  // Focus = non-meeting/break manual time + all auto time
  const manualFocus = pureManual.filter(r=>r.session_type!=='meeting'&&r.session_type!=='break').reduce((s,r)=>s+(r.duration_seconds||0),0);
  const focus = manualFocus + autoTotal;

  // Category breakdown
  const byCategory = {};
  pureManual.forEach(r => { if (r.category) byCategory[r.category]=(byCategory[r.category]||0)+(r.duration_seconds||0); });
  if (autoDeep   > 0) byCategory['Deep Work (Auto)']   = (byCategory['Deep Work (Auto)']||0)   + autoDeep;
  const autoShallow = autoSess.filter(s=>classifyAutoType(s)==='shallow').reduce((s,r)=>s+(r.duration_seconds||0),0);
  const autoMeet    = autoSess.filter(s=>classifyAutoType(s)==='meeting').reduce((s,r)=>s+(r.duration_seconds||0),0);
  const autoDist    = autoSess.filter(s=>classifyAutoType(s)==='distraction').reduce((s,r)=>s+(r.duration_seconds||0),0);
  if (autoShallow > 0) byCategory['Browsing & Utilities'] = (byCategory['Browsing & Utilities']||0) + autoShallow;
  if (autoMeet    > 0) byCategory['Meetings (Auto)']      = (byCategory['Meetings (Auto)']||0)      + autoMeet;
  if (autoDist    > 0) byCategory['Distractions']         = (byCategory['Distractions']||0)         + autoDist;

  const avgCtx = pureManual.length > 0 ? Math.round(pureManual.reduce((a,r)=>a+(r.context_switches||0),0)/pureManual.length) : 0;
  return {
    totalSeconds:      total,
    deepWorkSeconds:   deepWork,
    focusSeconds:      focus,
    meetingSeconds:    meetings,
    breakSeconds:      breaks,
    byCategory,
    sessionCount:      pureManual.length + autoSess.length,
    focusScore:        calcFocusScore(focus, meetings, breaks, total),
    avgContextSwitches:avgCtx,
  };
});

ipcMain.handle('stats:daily', (_, { userId, days }) => {
  const nowSec = Math.floor(Date.now()/1000);
  const from   = nowSec - days * 86400;

  // Pure-manual sessions — exclude __auto_block: rows and future __cal_event: converts.
  // Manually scheduled future sessions (no __cal_event: marker) are kept.
  const sessions = all(
    `SELECT * FROM sessions WHERE user_id=? AND ended_at IS NOT NULL AND started_at>=?
     AND (notes IS NULL OR notes NOT LIKE '__auto_block:%')
     AND NOT (started_at > ? AND notes LIKE '__cal_event:%')`,
    [userId, from, nowSec]
  );

  // Raw auto-tracked sessions with classification columns
  const autoSess = all(
    `SELECT started_at, duration_seconds, app_name, url, ai_is_deep_work, ai_category, ai_label, is_idle
     FROM auto_sessions WHERE user_id=? AND is_idle=0 AND started_at>=?`,
    [userId, from]
  );

  const daily = {};

  sessions.forEach(r => {
    const d = localDateKey(r.started_at);
    if (!daily[d]) daily[d] = { total:0, deepWork:0, focus:0, meetings:0, breaks:0, sessions:0 };
    daily[d].total    += r.duration_seconds||0;
    daily[d].sessions++;
    if (r.is_deep_work)             daily[d].deepWork  += r.duration_seconds||0;
    if (r.session_type==='focus')   daily[d].focus     += r.duration_seconds||0;
    if (r.session_type==='meeting') daily[d].meetings  += r.duration_seconds||0;
    if (r.session_type==='break')   daily[d].breaks    += r.duration_seconds||0;
  });

  // Auto-tracked sessions: classify and bucket into correct daily fields
  autoSess.forEach(r => {
    const d    = localDateKey(r.started_at);
    const dur  = r.duration_seconds || 0;
    const type = classifyAutoType(r);
    if (!daily[d]) daily[d] = { total:0, deepWork:0, focus:0, meetings:0, breaks:0, sessions:0 };
    daily[d].total    += dur;
    daily[d].sessions++;
    if (type === 'deep')        { daily[d].deepWork += dur; daily[d].focus += dur; }
    else if (type === 'meeting') { daily[d].meetings += dur; }
    else                         { daily[d].focus    += dur; }
  });

  return daily;
});

ipcMain.handle('stats:focusScore', (_, { userId, dateKey }) =>
  get('SELECT * FROM focus_scores WHERE user_id=? AND date_key=?', [userId, dateKey]) || { score: 0 }
);

// Consecutive-day active streak (walks backwards from today)
ipcMain.handle('stats:streak', (_, { userId }) => {
  // Walk backwards from today counting consecutive days with any activity.
  // auto_sessions has date_key; sessions only has started_at (timestamp range).
  let streak = 0;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  for (let i = 0; i < 365; i++) {
    const key      = localDateKey(Math.floor(d.getTime() / 1000));
    const dayStart = Math.floor(d.getTime() / 1000);
    const dayEnd   = dayStart + 86400;
    const hasAuto  = get('SELECT 1 FROM auto_sessions WHERE user_id=? AND date_key=? AND is_idle=0 LIMIT 1', [userId, key]);
    const hasMnl   = get('SELECT 1 FROM sessions WHERE user_id=? AND started_at>=? AND started_at<? LIMIT 1', [userId, dayStart, dayEnd]);
    if (!hasAuto && !hasMnl) break;
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return { streak };
});

ipcMain.handle('stats:heatmap', (_, { userId, year }) => {
  // Use LOCAL midnight for year boundaries so days don't shift for non-UTC users
  const s = Math.floor(new Date(year,     0, 1).getTime() / 1000);
  const e = Math.floor(new Date(year + 1, 0, 1).getTime() / 1000);
  const map = {};

  // Manual sessions
  const manual = all(
    'SELECT started_at, duration_seconds FROM sessions WHERE user_id=? AND ended_at IS NOT NULL AND started_at>=? AND started_at<?',
    [userId, s, e]
  );
  manual.forEach(r => {
    const d = localDateKey(r.started_at);
    map[d] = (map[d] || 0) + (r.duration_seconds || 0);
  });

  // Auto-tracked sessions (the bulk of tracked time)
  const auto = all(
    'SELECT started_at, duration_seconds FROM auto_sessions WHERE user_id=? AND is_idle=0 AND started_at>=? AND started_at<?',
    [userId, s, e]
  );
  auto.forEach(r => {
    const d = localDateKey(r.started_at);
    map[d] = (map[d] || 0) + (r.duration_seconds || 0);
  });

  return map;
});

ipcMain.handle('stats:contextScore', (_, { userId, from, to }) => {
  const sessions = all('SELECT * FROM sessions WHERE user_id=? AND ended_at IS NOT NULL AND started_at>=? AND started_at<=?', [userId, from, to]);
  if (!sessions.length) return { score:100, avgSwitches:0, totalSessions:0 };
  const total = sessions.reduce((a,r)=>a+(r.context_switches||0),0);
  const avg   = total/sessions.length;
  return { score: Math.max(0,Math.round(100-avg*5)), avgSwitches: Math.round(avg*10)/10, totalSessions: sessions.length };
});

// ─── GOALS ────────────────────────────────────────────────────────────────────
ipcMain.handle('goals:list',     (_, { userId }) => all('SELECT * FROM goals WHERE user_id=? AND active=1', [userId]));
ipcMain.handle('goals:create',   (_, { userId, title, targetHours, period, category }) => {
  const id = uuidv4();
  run('INSERT INTO goals (id,user_id,title,target_hours,period,category) VALUES (?,?,?,?,?,?)', [id, userId, title, targetHours, period, category||null]);
  run('INSERT INTO streaks (id,user_id,goal_id) VALUES (?,?,?)', [uuidv4(), userId, id]);
  return { id, title, target_hours: targetHours, period, category };
});
ipcMain.handle('goals:delete',   (_, { goalId }) => { run('UPDATE goals SET active=0 WHERE id=?', [goalId]); return { success:true }; });
ipcMain.handle('goals:progress', (_, { userId, goalId }) => {
  const goal = get('SELECT * FROM goals WHERE id=?', [goalId]);
  if (!goal) return null;
  let from;
  if (goal.period === 'daily') {
    const d = new Date(); d.setHours(0,0,0,0); from = Math.floor(d/1000);
  } else if (goal.period === 'weekly') {
    const d = new Date(); d.setDate(d.getDate()-d.getDay()); d.setHours(0,0,0,0); from = Math.floor(d/1000);
  } else { // monthly
    const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); from = Math.floor(d/1000);
  }
  // Count manual sessions
  let q = 'SELECT SUM(duration_seconds) as total FROM sessions WHERE user_id=? AND ended_at IS NOT NULL AND started_at>=?';
  const p = [userId, from];
  if (goal.category) { q += ' AND category=?'; p.push(goal.category); }
  const row = get(q, p);
  let achieved = row?.total || 0;
  // Also count auto-sessions if no category filter (auto_sessions have no category)
  if (!goal.category) {
    const autoRow = get('SELECT SUM(duration_seconds) as total FROM auto_sessions WHERE user_id=? AND started_at>=? AND is_idle=0', [userId, from]);
    achieved += autoRow?.total || 0;
  }
  const target = goal.target_hours * 3600;
  return { goal, achievedSeconds: achieved, targetSeconds: target, progress: Math.min((achieved/target)*100, 100), streak: get('SELECT * FROM streaks WHERE goal_id=?', [goalId]) };
});
ipcMain.handle('streaks:update', (_, { userId, goalId }) => {
  const today  = localDateKey();
  const streak = get('SELECT * FROM streaks WHERE goal_id=?', [goalId]);
  if (!streak||streak.last_completed_date===today) return streak;
  const yest = new Date(); yest.setDate(yest.getDate()-1);
  const newS = streak.last_completed_date===localDateKey(Math.floor(yest.getTime()/1000)) ? streak.current_streak+1 : 1;
  const lon  = Math.max(newS, streak.longest_streak);
  run('UPDATE streaks SET current_streak=?,longest_streak=?,last_completed_date=? WHERE goal_id=?', [newS, lon, today, goalId]);
  return { current_streak:newS, longest_streak:lon };
});

// ─── PENDING ENTRIES ─────────────────────────────────────────────────────────
ipcMain.handle('pending:list',   (_, { userId }) =>
  all(`SELECT pe.*, s.title, s.category, s.started_at, s.ended_at, s.duration_seconds, s.session_type
       FROM pending_entries pe JOIN sessions s ON pe.session_id=s.id
       WHERE pe.user_id=? AND pe.reviewed=0 ORDER BY pe.created_at DESC LIMIT 20`, [userId])
);
ipcMain.handle('pending:review', (_, { entryId }) => { run('UPDATE pending_entries SET reviewed=1 WHERE id=?', [entryId]); return { success:true }; });

// ─── PROFITABILITY ────────────────────────────────────────────────────────────
ipcMain.handle('profitability:summary', (_, { userId, from, to }) => {
  const now = Math.floor(Date.now()/1000);
  const f=from||(now-30*86400), t=to||now;
  const rows = all(
    `SELECT s.duration_seconds, p.name as project_name, p.hourly_rate, p.color as project_color,
            c.name as client_name, c.color as client_color
     FROM sessions s LEFT JOIN projects p ON s.project_id=p.id LEFT JOIN clients c ON (s.client_id=c.id OR p.client_id=c.id)
     WHERE s.user_id=? AND s.ended_at IS NOT NULL AND s.started_at>=? AND s.started_at<=?`,
    [userId, f, t]
  );
  const byProject={}, byClient={};
  let totalRevenue=0;
  rows.forEach(r => {
    const hrs=( r.duration_seconds||0)/3600, rev=hrs*(r.hourly_rate||0);
    totalRevenue+=rev;
    if (r.project_name) { if (!byProject[r.project_name]) byProject[r.project_name]={hours:0,revenue:0,color:r.project_color}; byProject[r.project_name].hours+=hrs; byProject[r.project_name].revenue+=rev; }
    if (r.client_name)  { if (!byClient[r.client_name])  byClient[r.client_name] ={hours:0,revenue:0,color:r.client_color};  byClient[r.client_name].hours+=hrs;  byClient[r.client_name].revenue+=rev;  }
  });
  return { totalRevenue, byProject, byClient };
});

// ─── EXTENDED STATS ───────────────────────────────────────────────────────────

// Work intensity: how continuously has the user been working in the last N mins?
ipcMain.handle('stats:workIntensity', (_, { userId, windowMins = 90 }) => {
  const now = Math.floor(Date.now() / 1000);
  const from = now - windowMins * 60;
  const rows = all('SELECT started_at, duration_seconds FROM auto_sessions WHERE user_id=? AND started_at>=? ORDER BY started_at', [userId, from]);
  if (!rows.length) return { activeMins: 0, intensity: 0, continuousMins: 0 };

  const activeSecs = rows.reduce((s, r) => s + (r.duration_seconds || 0), 0);
  const intensity  = Math.min(100, Math.round((activeSecs / (windowMins * 60)) * 100));

  // Continuous mins = time since last 5-min+ idle gap
  const sorted = [...rows].sort((a, b) => b.started_at - a.started_at);
  let continuousSecs = 0;
  for (let i = 0; i < sorted.length; i++) {
    const cur  = sorted[i];
    const prev = sorted[i + 1];
    continuousSecs += cur.duration_seconds || 0;
    if (!prev) break;
    const gap = cur.started_at - (prev.started_at + (prev.duration_seconds || 0));
    if (gap > 300) break; // 5-min gap = end of continuous block
  }
  return { activeMins: Math.round(activeSecs / 60), intensity, continuousMins: Math.round(continuousSecs / 60) };
});

// Hour-by-hour heatmap — seconds worked per hour (0–23) + per day-of-week (0–6)
ipcMain.handle('stats:hourlyHeatmap', (_, { userId, days = 14 }) => {
  const from = Math.floor(Date.now() / 1000) - days * 86400;
  const manualSess = all('SELECT started_at, duration_seconds as d FROM sessions WHERE user_id=? AND ended_at IS NOT NULL AND started_at>=?', [userId, from]);
  const autoSess   = all('SELECT started_at, duration_seconds as d FROM auto_sessions WHERE user_id=? AND started_at>=?', [userId, from]);

  const hourly    = new Array(24).fill(0);
  const dayOfWeek = new Array(7).fill(0);
  const dailyHourly = {}; // 'YYYY-MM-DD' -> Array(24)

  [...manualSess, ...autoSess].forEach(({ started_at, d }) => {
    const dt  = new Date(started_at * 1000);
    const h   = dt.getHours();
    const dow = dt.getDay();
    const key = localDateKey(started_at);
    hourly[h]    += d || 0;
    dayOfWeek[dow] += d || 0;
    if (!dailyHourly[key]) dailyHourly[key] = new Array(24).fill(0);
    dailyHourly[key][h] += d || 0;
  });

  const maxHour = Math.max(...hourly);
  const peakHour = maxHour > 0 ? hourly.indexOf(maxHour) : -1;
  const peakDay  = dayOfWeek.indexOf(Math.max(...dayOfWeek));
  return { hourly, dayOfWeek, peakHour, peakDay, dailyHourly };
});

// Deep work blocks: completed sessions >= 25 min
ipcMain.handle('stats:deepWorkBlocks', (_, { userId, from, to }) => {
  const now = Math.floor(Date.now() / 1000);
  const f = from || now - 7 * 86400, t = to || now;

  // 1. Pure-manual deep-work sessions ≥ 25 min
  const manualBlocks = all(
    `SELECT id, title, category, started_at, ended_at, duration_seconds
     FROM sessions WHERE user_id=? AND ended_at IS NOT NULL
     AND started_at>=? AND started_at<=? AND duration_seconds>=1500
     AND is_deep_work=1
     AND (notes IS NULL OR notes NOT LIKE '__auto_block:%')
     ORDER BY started_at DESC`,
    [userId, f, t]
  ).map(b => ({ ...b, source: 'manual' }));

  // 2. Build deep-work blocks from raw auto_sessions
  //    Individual auto-sessions are 4-second snapshots — they must be grouped
  //    into consecutive runs before checking the ≥ 25 min threshold.
  const autoRaw = all(
    `SELECT id, app_name, window_title, url, started_at, duration_seconds,
            ai_is_deep_work, ai_category, ai_label, is_idle
     FROM auto_sessions
     WHERE user_id=? AND is_idle=0 AND started_at>=? AND started_at<=?
     AND duration_seconds > 0
     ORDER BY app_name, started_at ASC`,
    [userId, f, t]
  );

  const autoBlocks = buildAutoDeepBlocks(autoRaw, 1500);

  // Merge, de-duplicate overlapping windows (prefer manual), sort newest first
  const combined = [...manualBlocks, ...autoBlocks]
    .sort((a, b) => b.started_at - a.started_at)
    .slice(0, 30);

  return combined;
});

// Top apps aggregated over a period (from auto_sessions)
ipcMain.handle('stats:topApps', (_, { userId, from, to, limit = 20 }) => {
  const now = Math.floor(Date.now() / 1000);
  const f = from || now - 7 * 86400, t = to || now;
  // Normalise app_name: strip trailing .exe (case-insensitive) so Chrome.exe and chrome are merged
  const rows = all(
    `SELECT
       LOWER(REPLACE(REPLACE(app_name, '.exe', ''), '.EXE', '')) AS app_name,
       SUM(duration_seconds) AS total,
       COUNT(*) AS occurrences
     FROM auto_sessions
     WHERE user_id=? AND is_idle=0 AND started_at>=? AND started_at<=?
       AND app_name IS NOT NULL AND app_name != ''
       AND duration_seconds > 0
     GROUP BY LOWER(REPLACE(REPLACE(app_name, '.exe', ''), '.EXE', ''))
     ORDER BY total DESC LIMIT ?`,
    [userId, f, t, limit]
  );

  // Attach the authoritative category (set on the Activity → Apps page) for
  // each app so consumers never re-derive their own classification. We pick
  // the duration-weighted dominant ai_category/ai_label per app rather than a
  // simple SQL GROUP BY, since a handful of stray sessions may predate a bulk
  // category reassignment.
  if (rows.length) {
    const catRows = all(
      `SELECT
         LOWER(REPLACE(REPLACE(app_name, '.exe', ''), '.EXE', '')) AS app_name,
         ai_category, ai_label, SUM(duration_seconds) AS secs
       FROM auto_sessions
       WHERE user_id=? AND is_idle=0 AND started_at>=? AND started_at<=?
         AND app_name IS NOT NULL AND app_name != '' AND duration_seconds > 0
         AND ai_category IS NOT NULL AND ai_category != ''
       GROUP BY LOWER(REPLACE(REPLACE(app_name, '.exe', ''), '.EXE', '')), ai_category, ai_label`,
      [userId, f, t]
    );
    const dominant = {};
    for (const r of catRows) {
      const cur = dominant[r.app_name];
      if (!cur || r.secs > cur.secs) dominant[r.app_name] = r;
    }
    for (const row of rows) {
      const d = dominant[row.app_name];
      row.ai_category = d ? d.ai_category : null;
      row.ai_label = d ? d.ai_label : null;
    }
  }

  return rows;
});

// Billable summary: billable vs non-billable, utilization rate, ROI
ipcMain.handle('stats:billableSummary', (_, { userId, from, to }) => {
  const now = Math.floor(Date.now() / 1000);
  const f = from || now - 30 * 86400, t = to || now;
  const rows = all(
    `SELECT s.duration_seconds, s.project_id, s.notes, p.hourly_rate, p.name as project_name
     FROM sessions s LEFT JOIN projects p ON s.project_id=p.id
     WHERE s.user_id=? AND s.ended_at IS NOT NULL AND s.started_at>=? AND s.started_at<=?
     AND NOT (s.started_at > ? AND s.notes LIKE '__cal_event:%')`,
    [userId, f, t, now]
  );
  const billable    = rows.filter(r => r.project_id && r.hourly_rate && !String(r.notes || '').includes('[non-billable]'));
  const nonBillable = rows.filter(r => !r.project_id || !r.hourly_rate || String(r.notes || '').includes('[non-billable]'));
  const billableSecs  = billable.reduce((a, r) => a + (r.duration_seconds || 0), 0);
  const totalSecs     = rows.reduce((a, r) => a + (r.duration_seconds || 0), 0);
  const revenue       = billable.reduce((a, r) => a + ((r.duration_seconds || 0) / 3600) * (r.hourly_rate || 0), 0);
  const utilization   = totalSecs > 0 ? Math.round((billableSecs / totalSecs) * 100) : 0;
  const avgRate       = billableSecs > 0 ? revenue / (billableSecs / 3600) : 0;
  return { billableHours: billableSecs / 3600, nonBillableHours: (totalSecs - billableSecs) / 3600, totalHours: totalSecs / 3600, utilization, revenue, avgRate };
});

// Week-over-week comparison — Monday-bounded calendar weeks
ipcMain.handle('stats:weekComparison', (_, { userId }) => {
  const now = Math.floor(Date.now() / 1000);
  // Compute start of the current Monday-bounded calendar week (local time)
  const todayLocal = new Date();
  todayLocal.setHours(0, 0, 0, 0);
  // getDay(): 0=Sun,1=Mon,...,6=Sat — offset so Monday=0
  const daysSinceMon = (todayLocal.getDay() + 6) % 7;
  const thisMonday   = new Date(todayLocal); thisMonday.setDate(todayLocal.getDate() - daysSinceMon);
  const lastMonday   = new Date(thisMonday); lastMonday.setDate(thisMonday.getDate() - 7);
  const thisWeekStart = Math.floor(thisMonday.getTime() / 1000);
  const lastWeekStart = Math.floor(lastMonday.getTime() / 1000);
  const sum = (arr, fn) => arr.reduce((s, r) => s + (fn(r) || 0), 0);

  // Pure-manual sessions — no __auto_block: rows, no future __cal_event: converts
  const thisWeekMnl = all(
    `SELECT * FROM sessions WHERE user_id=? AND ended_at IS NOT NULL AND started_at>=? AND started_at<=?
     AND (notes IS NULL OR notes NOT LIKE '__auto_block:%')
     AND NOT (started_at > ? AND notes LIKE '__cal_event:%')`,
    [userId, thisWeekStart, now, now]
  );
  const lastWeekMnl = all(
    `SELECT * FROM sessions WHERE user_id=? AND ended_at IS NOT NULL AND started_at>=? AND started_at<?
     AND (notes IS NULL OR notes NOT LIKE '__auto_block:%')`,
    [userId, lastWeekStart, thisWeekStart]
  );

  // Auto-sessions for each window
  const thisWeekAuto = all(
    `SELECT started_at, duration_seconds, app_name, url, ai_is_deep_work, ai_category, is_idle
     FROM auto_sessions WHERE user_id=? AND is_idle=0 AND started_at>=?`,
    [userId, thisWeekStart]
  );
  const lastWeekAuto = all(
    `SELECT started_at, duration_seconds, app_name, url, ai_is_deep_work, ai_category, is_idle
     FROM auto_sessions WHERE user_id=? AND is_idle=0 AND started_at>=? AND started_at<?`,
    [userId, lastWeekStart, thisWeekStart]
  );

  const build = (mnl, auto) => {
    const autoTotal    = sum(auto, r => r.duration_seconds);
    const autoDeep     = sum(auto.filter(s => classifyAutoType(s) === 'deep'), r => r.duration_seconds);
    const manualDeep   = sum(mnl.filter(r => r.is_deep_work), r => r.duration_seconds);
    const manualFocus  = sum(mnl.filter(r => r.session_type === 'focus'), r => r.duration_seconds);
    const manualTotal  = sum(mnl, r => r.duration_seconds);
    return {
      totalSecs:    manualTotal + autoTotal,
      deepWorkSecs: manualDeep  + autoDeep,
      focusSecs:    manualFocus + autoTotal,
      sessions:     mnl.length  + auto.length,
    };
  };

  return {
    thisWeek: build(thisWeekMnl, thisWeekAuto),
    lastWeek: build(lastWeekMnl, lastWeekAuto),
  };
});

// Distraction ratio: focus vs distraction auto sessions
ipcMain.handle('stats:distractionRatio', (_, { userId, from, to }) => {
  const now = Math.floor(Date.now() / 1000);
  const f = from || now - 7 * 86400, t = to || now;

  const autoSess = all(
    `SELECT app_name, url, duration_seconds, ai_is_deep_work, ai_category, ai_label, is_idle
     FROM auto_sessions WHERE user_id=? AND is_idle=0 AND started_at>=? AND started_at<=?`,
    [userId, f, t]
  );

  // Also use user-defined distraction_rules on top of AI/app-name classification
  const rules = all('SELECT pattern FROM distraction_rules WHERE user_id=? AND active=1', [userId]);

  let focusSecs = 0, distractedSecs = 0, meetingSecs = 0;
  autoSess.forEach(s => {
    const dur = s.duration_seconds || 0;   // ← was s.duration (wrong column name)
    const type = classifyAutoType(s);

    // Override to distraction if any user rule matches
    const ruleMatch = rules.some(r => {
      try { return new RegExp(r.pattern, 'i').test(s.app_name || '') || new RegExp(r.pattern, 'i').test(s.url || ''); }
      catch { return false; }
    });

    if (ruleMatch || type === 'distraction') distractedSecs += dur;
    else if (type === 'meeting')              meetingSecs    += dur;
    else                                      focusSecs      += dur;
  });

  const total = focusSecs + distractedSecs + meetingSecs;
  return {
    focusSecs,
    distractedSecs,
    meetingSecs,
    total,
    focusPct:      total > 0 ? Math.round(focusSecs      / total * 100) : 0,
    distractedPct: total > 0 ? Math.round(distractedSecs / total * 100) : 0,
    meetingPct:    total > 0 ? Math.round(meetingSecs     / total * 100) : 0,
  };
});

// ─── HELPERS ──────────────────────────────────────────────────────────────────

/**
 * Classify an auto_session row as 'deep', 'meeting', 'distraction', or 'shallow'.
 * Mirrors the classifySession / classifyApp logic in ActivityPage.jsx so the
 * backend reports use exactly the same classification the user sees in the UI.
 *
 * Priority order:
 *   1. ai_is_deep_work flag (set by the AI classifier – most reliable)
 *   2. ai_category string
 *   3. App-name / URL regex patterns (fallback for un-classified rows)
 */
function classifyAutoType(s) {
  const n = ((s.app_name || '') + ' ' + (s.window_title || '')).toLowerCase().replace(/\.exe$/i, '');
  const u = (s.url || '').toLowerCase();
  const combo = n + ' ' + u;

  // AI-provided flags take priority ─────────────────────────────────────────
  if (s.ai_is_deep_work === 1) return 'deep';

  const cat = (s.ai_category || '').toLowerCase();
  const DEEP_AI  = ['deep_work','focus','coding','development','design','writing','learning','work','engineering','research'];
  const DIST_AI  = ['distraction','entertainment','social_media','gaming','video'];
  const MEET_AI  = ['meeting','call','standup','sync','communication'];
  if (DEEP_AI.some(c => cat.includes(c))) return 'deep';
  if (MEET_AI.some(c => cat.includes(c))) return 'meeting';
  if (DIST_AI.some(c => cat.includes(c))) return 'distraction';

  // Meetings (check before deep work — Zoom/Teams can look like "code" tools) ─
  if (/zoom|teams|meet\.google|webex|whereby|jitsi|gotomeeting/.test(combo)) return 'meeting';

  // Explicit distractions ────────────────────────────────────────────────────
  if (/youtube|netflix|twitch|hulu|steam|epicgames|reddit|twitter|instagram|facebook|tiktok|spotify|soundcloud|primevideo/.test(combo)) return 'distraction';

  // Deep-work apps ──────────────────────────────────────────────────────────
  if (/\bcode\b|vscode|cursor|windsurf|zed|intellij|pycharm|webstorm|androidstudio|xcode|github desktop|\bterminal\b|powershell|pwsh|\bbash\b|vim|neovim|emacs|sublime/.test(n)) return 'deep';
  if (/figma|sketch|photoshop|illustrator|canva|blender|notion|obsidian|typora|craft|ulysses/.test(n)) return 'deep';
  if (/\bword\b|excel|powerpoint|pages|numbers|keynote|tableau|powerbi|libreoffice/.test(n)) return 'deep';

  return 'shallow';
}

/**
 * Build consecutive deep-work blocks from raw auto_sessions rows.
 * Sessions from the same app within GAP_BREAK seconds are merged into one block.
 * Only blocks with total duration >= minDuration are kept.
 */
function buildAutoDeepBlocks(rows, minDuration = 1500) {
  const GAP_BREAK = 300; // 5 min gap → new block
  const sorted = rows
    .filter(s => !s.is_idle && (s.duration_seconds || 0) > 0 && classifyAutoType(s) === 'deep')
    .sort((a, b) => a.started_at - b.started_at);

  const blocks = [];
  let cur = null;

  for (const s of sorted) {
    const rowEnd = s.started_at + (s.duration_seconds || 0);
    const gap    = cur ? s.started_at - cur._end : Infinity;
    const sameApp = cur && s.app_name === cur.app_name;

    if (!cur || gap > GAP_BREAK || !sameApp) {
      if (cur && cur.duration_seconds >= minDuration) {
        const { _end, ...blk } = cur;
        blocks.push(blk);
      }
      cur = {
        id:               `auto-${s.id}`,
        title:            s.app_name || 'Deep Work',
        app_name:         s.app_name || '',
        category:         s.ai_label || s.ai_category || 'Auto-tracked',
        started_at:       s.started_at,
        ended_at:         rowEnd,
        duration_seconds: s.duration_seconds || 0,
        source:           'auto',
        _end:             rowEnd,
      };
    } else {
      cur._end             = Math.max(cur._end, rowEnd);
      cur.ended_at         = cur._end;
      cur.duration_seconds += s.duration_seconds || 0;
    }
  }
  if (cur && cur.duration_seconds >= minDuration) {
    const { _end, ...blk } = cur;
    blocks.push(blk);
  }

  return blocks;
}

function calcFocusScore(focus, meetings, breaks, total) {
  if (!total) return 0;
  return Math.round(Math.min((focus/total)*70+Math.min(breaks/total,0.2)*100+(meetings/total)*10, 100));
}

function updateFocusScore(userId, startedAt, sessionType, duration) {
  const dateKey = localDateKey(startedAt);
  const ex = get('SELECT * FROM focus_scores WHERE user_id=? AND date_key=?', [userId, dateKey]);
  if (ex) {
    const f=sessionType==='focus'?ex.focus_seconds+duration:ex.focus_seconds;
    const m=sessionType==='meeting'?ex.meeting_seconds+duration:ex.meeting_seconds;
    const b=sessionType==='break'?ex.break_seconds+duration:ex.break_seconds;
    const o=!['focus','meeting','break'].includes(sessionType)?ex.other_seconds+duration:ex.other_seconds;
    run('UPDATE focus_scores SET score=?,focus_seconds=?,meeting_seconds=?,break_seconds=?,other_seconds=? WHERE id=?',
      [calcFocusScore(f,m,b,f+m+b+o), f, m, b, o, ex.id]);
  } else {
    const f=sessionType==='focus'?duration:0, m=sessionType==='meeting'?duration:0, b=sessionType==='break'?duration:0;
    run('INSERT INTO focus_scores (id,user_id,date_key,score,focus_seconds,meeting_seconds,break_seconds,other_seconds) VALUES (?,?,?,?,?,?,?,?)',
      [uuidv4(), userId, dateKey, calcFocusScore(f,m,b,f+m+b), f, m, b, 0]);
  }
}

// ─── GOOGLE CALENDAR OAUTH ENGINE ────────────────────────────────────────────
// Setup:  console.cloud.google.com  →  New Project  →  Enable "Google Calendar API"
//         →  OAuth consent screen (External)  →  Credentials  →  OAuth 2.0  →  Desktop app
// Store the Client ID + Secret via the in-app credentials dialog (Calendar → Connect → Google).
const { shell } = require('electron');
const { createHash, randomBytes } = require('crypto');

const GOOGLE_OAUTH_PORT   = 42813;
const GOOGLE_REDIRECT_URI = `http://localhost:${GOOGLE_OAUTH_PORT}/oauth2callback`;
const GOOGLE_SCOPES       = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'openid', 'email', 'profile',
].join(' ');

let _googleOAuthServer = null;

// ── Embedded OAuth credentials (not visible to end users) ─────────────────────
const GOOGLE_CLIENT_ID     = process.env.GOOGLE_CLIENT_ID     || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';

// ── Helpers ───────────────────────────────────────────────────────────────────
function googleCreds() {
  // Prefer DB (so existing saved creds still work), fall back to embedded constants
  const row = get('SELECT client_id, client_secret FROM google_oauth_creds WHERE id=1');
  if (row?.client_id && row?.client_secret) return row;
  if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
    return { client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET };
  }
  return null;
}

function httpsPost(url, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const data   = typeof body === 'string' ? body : new URLSearchParams(body).toString();
    const opts = {
      hostname: parsed.hostname, path: parsed.pathname + parsed.search,
      method: 'POST', port: 443,
      headers: {
        'Content-Type':  'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(data),
      },
    };
    const req = require('https').request(opts, (res) => {
      let raw = '';
      res.on('data', c => { raw += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch (_) { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function httpsGet(url, accessToken) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const opts = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'GET', port: 443,
      headers: { Authorization: `Bearer ${accessToken}` },
    };
    require('https').get(opts, (res) => {
      let raw = '';
      res.on('data', c => { raw += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch (_) { resolve({ status: res.statusCode, body: raw }); }
      });
    }).on('error', reject);
  });
}

// Refresh an expired Google access token and update DB
async function refreshGoogleToken(conn) {
  const creds = googleCreds();
  if (!creds || !conn.refresh_token) throw new Error('No refresh token available');
  const resp = await httpsPost('https://oauth2.googleapis.com/token', {
    client_id:     creds.client_id,
    client_secret: creds.client_secret,
    refresh_token: conn.refresh_token,
    grant_type:    'refresh_token',
  });
  if (resp.status !== 200) {
    // Revoked / expired refresh token — clear stored tokens so the UI prompts reconnect
    if (resp.body?.error === 'invalid_grant') {
      run('UPDATE calendar_connections SET access_token=NULL, refresh_token=NULL, token_expiry=NULL WHERE id=?', [conn.id]);
      throw new Error('INVALID_GRANT');
    }
    throw new Error(`Token refresh failed: ${JSON.stringify(resp.body)}`);
  }
  const { access_token, expires_in } = resp.body;
  const expiry = Math.floor(Date.now() / 1000) + (expires_in || 3600) - 60;
  run('UPDATE calendar_connections SET access_token=?, token_expiry=? WHERE id=?',
    [access_token, expiry, conn.id]);
  return access_token;
}

// Ensure we have a valid access token (refresh if expired)
async function validAccessToken(conn) {
  const now = Math.floor(Date.now() / 1000);
  if (conn.access_token && conn.token_expiry && conn.token_expiry > now) return conn.access_token;
  return await refreshGoogleToken(conn);
}

// Fetch and upsert events from Google Calendar API
async function syncGoogleCalendarConnection(conn, userId) {
  const token = await validAccessToken(conn);

  // Fetch events from 3 months ago to 6 months ahead
  const now      = new Date();
  const timeMin  = new Date(now.getTime() - 90  * 86400 * 1000).toISOString();
  const timeMax  = new Date(now.getTime() + 180 * 86400 * 1000).toISOString();
  const calId    = encodeURIComponent(conn.google_cal_id || 'primary');
  const url      = `https://www.googleapis.com/calendar/v3/calendars/${calId}/events` +
    `?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}` +
    `&singleEvents=true&orderBy=startTime&maxResults=500`;

  const resp = await httpsGet(url, token);
  if (resp.status !== 200) {
    console.error('[google-cal] API error', resp.status, JSON.stringify(resp.body));
    throw new Error(`Calendar API error ${resp.status}: ${resp.body?.error?.message || JSON.stringify(resp.body)}`);
  }

  const items = resp.body.items || [];

  // Preserve existing title_override values
  const preserved = {};
  all('SELECT id, title_override FROM calendar_events WHERE connection_id=? AND title_override IS NOT NULL',
    [conn.id]).forEach(r => { preserved[r.id] = r.title_override; });

  run('DELETE FROM calendar_events WHERE connection_id=?', [conn.id]);

  for (const ev of items) {
    if (!ev.start) continue;
    const startRaw = ev.start.dateTime || ev.start.date;
    const endRaw   = ev.end?.dateTime  || ev.end?.date;
    const allDay   = !ev.start.dateTime ? 1 : 0;
    const start    = Math.floor(new Date(startRaw).getTime() / 1000);
    const end      = endRaw ? Math.floor(new Date(endRaw).getTime() / 1000) : start + 3600;

    // Extract video meeting URL from conferenceData or description
    let meetingUrl = null;
    if (ev.conferenceData?.entryPoints) {
      const videoEntry = ev.conferenceData.entryPoints.find(e => e.entryPointType === 'video');
      if (videoEntry) meetingUrl = videoEntry.uri;
    }
    if (!meetingUrl && ev.description) {
      const m = ev.description.match(/https?:\/\/[^\s"<>]*(zoom\.us|teams\.microsoft\.com|meet\.google\.com|webex|whereby)[^\s"<>]*/i);
      if (m) meetingUrl = m[0];
    }
    if (!meetingUrl && ev.location) {
      const m = ev.location.match(/https?:\/\/[^\s"<>]*(zoom\.us|teams\.microsoft\.com|meet\.google\.com|webex|whereby)[^\s"<>]*/i);
      if (m) meetingUrl = m[0];
    }

    const eventId = `${conn.id}_${ev.id}`;
    run(`INSERT OR REPLACE INTO calendar_events
        (id,user_id,connection_id,provider,title,title_override,description,location,meeting_url,
         start_time,end_time,all_day,attendees_json,color,status,is_recurring,synced_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,strftime('%s','now'))`,
      [
        eventId, userId, conn.id, 'google',
        ev.summary || 'Untitled',
        preserved[eventId] || null,
        ev.description || null,
        ev.location || null,
        meetingUrl,
        start, end, allDay,
        ev.attendees ? JSON.stringify(ev.attendees.map(a => a.email || a.displayName)) : null,
        ev.colorId ? `#${googleColorMap[ev.colorId] || '4285f4'}` : conn.color || '#4285f4',
        (ev.status || 'confirmed').toLowerCase(),
        ev.recurrence ? 1 : 0,
      ]);
  }

  run('UPDATE calendar_connections SET last_synced=? WHERE id=?',
    [Math.floor(Date.now() / 1000), conn.id]);
  return { synced: items.length };
}

// Google event color ID → hex
const googleColorMap = {
  '1': '7986cb', '2': '33b679', '3': '8e24aa', '4': 'e67c73',
  '5': 'f6bf26', '6': 'f4511e', '7': '039be5', '8': '616161',
  '9': '3f51b5', '10': '0b8043', '11': 'd50000',
};

// ── IPC: credentials management ───────────────────────────────────────────────
ipcMain.handle('calendar:googleHasCredentials', () => {
  const row = googleCreds();
  return { configured: !!(row?.client_id && row?.client_secret) };
});

ipcMain.handle('calendar:googleSetCredentials', (_, { clientId, clientSecret }) => {
  if (!clientId?.trim() || !clientSecret?.trim()) throw new Error('Client ID and Secret required');
  run(`INSERT OR REPLACE INTO google_oauth_creds (id, client_id, client_secret) VALUES (1, ?, ?)`,
    [clientId.trim(), clientSecret.trim()]);
  return { success: true };
});

// ── IPC: OAuth connect flow ───────────────────────────────────────────────────
ipcMain.handle('calendar:googleConnect', async (_, { userId, calendarId = 'primary', label = 'Google Calendar', color = '#4285f4' }) => {
  const creds = googleCreds();
  if (!creds) throw new Error('CREDENTIALS_NOT_CONFIGURED');

  // Only one Google Calendar account may be connected per user. Block the
  // OAuth flow entirely (rather than letting a second account overwrite or
  // duplicate rows) so the user must explicitly disconnect the existing one
  // first via Settings.
  const existingGoogle = get(
    'SELECT id FROM calendar_connections WHERE user_id=? AND provider=? LIMIT 1',
    [userId, 'google'],
  );
  if (existingGoogle) {
    throw new Error('A Google Calendar account is already connected. Disconnect it first if you want to connect a different one.');
  }

  // Close any lingering callback server
  if (_googleOAuthServer) { try { _googleOAuthServer.close(); } catch (_) {} _googleOAuthServer = null; }

  // PKCE code verifier + challenge
  const verifier  = randomBytes(64).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const state     = randomBytes(16).toString('hex');

  const authParams = new URLSearchParams({
    response_type:         'code',
    client_id:             creds.client_id,
    redirect_uri:          GOOGLE_REDIRECT_URI,
    scope:                 GOOGLE_SCOPES,
    state,
    access_type:           'offline',
    prompt:                'consent',
    code_challenge_method: 'S256',
    code_challenge:        challenge,
  });
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${authParams.toString()}`;

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      if (_googleOAuthServer) { try { _googleOAuthServer.close(); } catch (_) {} _googleOAuthServer = null; }
      reject(new Error('Google auth timed out after 5 minutes'));
    }, 5 * 60 * 1000);

    _googleOAuthServer = http.createServer(async (req, res) => {
      try {
        const reqUrl = new URL(req.url, `http://localhost:${GOOGLE_OAUTH_PORT}`);
        if (reqUrl.pathname !== '/oauth2callback') { res.end(''); return; }

        const code  = reqUrl.searchParams.get('code');
        const errP  = reqUrl.searchParams.get('error');
        const stateP = reqUrl.searchParams.get('state');
        const ok    = !!code && !errP && stateP === state;

        const accentColor = ok ? '#20D9A0' : '#F87171';
        const accentDim   = ok ? '#0D7A5A' : '#7A3232';
        const html = `<!DOCTYPE html><html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Flow Ledger – Google Calendar</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
@keyframes fadeUp{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}
@keyframes scalePop{0%{transform:scale(0.6);opacity:0}70%{transform:scale(1.08)}100%{transform:scale(1);opacity:1}}
@keyframes drawCheck{from{stroke-dashoffset:60}to{stroke-dashoffset:0}}
@keyframes drawX{from{stroke-dashoffset:30}to{stroke-dashoffset:0}}
@keyframes ringPulse{0%,100%{opacity:0.18;transform:scale(1)}50%{opacity:0.08;transform:scale(1.35)}}
body{font-family:-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',sans-serif;background:#080B12;color:#E2E8F0;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:1.5rem}
.card{text-align:center;padding:2.75rem 2.5rem 2.5rem;background:#0F1219;border-radius:20px;border:1px solid #1A1F2E;max-width:420px;width:100%;position:relative;overflow:hidden;animation:fadeUp .55s cubic-bezier(.22,1,.36,1) both}
.card::before{content:'';position:absolute;inset:0;border-radius:20px;background:radial-gradient(ellipse 60% 40% at 50% 0%,${ok ? 'rgba(32,217,160,0.07)' : 'rgba(248,113,113,0.07)'},transparent 70%);pointer-events:none}
.logo-row{display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:2rem;opacity:0.55}
.logo-dot{width:7px;height:7px;border-radius:50%;background:#3B4563}
.logo-name{font-size:11px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:#4A5578}
.icon-wrap{position:relative;width:80px;height:80px;margin:0 auto 1.75rem;animation:scalePop .5s cubic-bezier(.34,1.56,.64,1) .15s both}
.ring{position:absolute;inset:-14px;border-radius:50%;border:1.5px solid ${accentColor};opacity:0.18;animation:ringPulse 2.8s ease-in-out 0.7s infinite}
.icon-bg{width:80px;height:80px;border-radius:50%;background:${ok ? 'rgba(32,217,160,0.1)' : 'rgba(248,113,113,0.1)'};border:1.5px solid ${ok ? 'rgba(32,217,160,0.28)' : 'rgba(248,113,113,0.28)'};display:flex;align-items:center;justify-content:center}
.check-svg{width:34px;height:34px}
.check-path{stroke:${accentColor};stroke-width:3;stroke-linecap:round;stroke-linejoin:round;fill:none;stroke-dasharray:60;stroke-dashoffset:60;animation:drawCheck .45s cubic-bezier(.22,1,.36,1) .5s forwards}
.x-path{stroke:${accentColor};stroke-width:3;stroke-linecap:round;fill:none;stroke-dasharray:30;stroke-dashoffset:30;animation:drawX .3s ease .5s forwards}
.badge{display:inline-flex;align-items:center;gap:6px;background:${ok ? 'rgba(32,217,160,0.08)' : 'rgba(248,113,113,0.08)'};border:1px solid ${ok ? 'rgba(32,217,160,0.2)' : 'rgba(248,113,113,0.2)'};border-radius:999px;padding:4px 12px 4px 8px;margin-bottom:1.25rem;animation:fadeUp .4s ease .35s both}
.badge-dot{width:6px;height:6px;border-radius:50%;background:${accentColor};flex-shrink:0}
.badge-text{font-size:11px;font-weight:600;letter-spacing:.05em;color:${accentColor};text-transform:uppercase}
h1{font-size:20px;font-weight:700;color:#F1F5FF;letter-spacing:-.02em;margin-bottom:.6rem;animation:fadeUp .4s ease .4s both}
.sub{font-size:13.5px;color:#5A6580;line-height:1.75;animation:fadeUp .4s ease .45s both}
.divider{width:40px;height:1px;background:#1A1F2E;margin:1.5rem auto;animation:fadeUp .4s ease .5s both}
.hint{font-size:12px;color:#3B4563;animation:fadeUp .4s ease .55s both}
.gcal-logo{display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:1.5rem;animation:fadeUp .4s ease .3s both}
.gcal-icon{width:36px;height:36px;border-radius:8px;background:#fff;display:flex;align-items:center;justify-content:center;overflow:visible;flex-shrink:0}
.gcal-name{font-size:13px;font-weight:500;color:#6B7A99}
</style></head>
<body><div class="card">
<div class="logo-row"><div class="logo-dot"></div><span class="logo-name">Flow Ledger</span><div class="logo-dot"></div></div>
<div class="icon-wrap">
  <div class="ring"></div>
  <div class="icon-bg">
    ${ok
      ? `<svg class="check-svg" viewBox="0 0 34 34"><polyline class="check-path" points="6,18 14,26 28,10"/></svg>`
      : `<svg class="check-svg" viewBox="0 0 34 34"><line class="x-path" x1="10" y1="10" x2="24" y2="24"/><line class="x-path" x1="24" y1="10" x2="10" y2="24"/></svg>`
    }
  </div>
</div>
<div class="gcal-logo">
  <div class="gcal-icon">
    <svg width="30" height="30" viewBox="0 0 30 30" xmlns="http://www.w3.org/2000/svg"><rect width="30" height="30" rx="5" fill="#fff"/><rect y="0" width="30" height="10" rx="5" fill="#4285F4"/><rect y="5" width="30" height="5" fill="#4285F4"/><rect x="8" y="-1" width="2.5" height="5.5" rx="1.25" fill="#fff"/><rect x="19.5" y="-1" width="2.5" height="5.5" rx="1.25" fill="#fff"/><text x="15" y="24" text-anchor="middle" font-size="11" font-weight="700" font-family="Arial,Helvetica,sans-serif" fill="#4285F4">31</text></svg>
  </div>
  <span class="gcal-name">Google Calendar</span>
</div>
<div class="badge"><div class="badge-dot"></div><span class="badge-text">${ok ? 'Connected' : 'Failed'}</span></div>
<h1>${ok ? 'Calendar connected' : 'Authentication failed'}</h1>
<p class="sub">${ok ? 'Your Google Calendar is now synced with Flow Ledger. You can close this tab and return to the app.' : (errP || 'Something went wrong. Please close this tab and try connecting again.')}</p>
<div class="divider"></div>
<p class="hint">${ok ? 'This tab can be safely closed.' : 'If the issue persists, check your credentials in Settings.'}</p>
</div></body></html>`;

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);

        clearTimeout(timeout);
        if (_googleOAuthServer) { try { _googleOAuthServer.close(); } catch (_) {} _googleOAuthServer = null; }

        if (!ok) { reject(new Error(errP || 'Auth denied')); return; }

        // Exchange code for tokens
        const tokenResp = await httpsPost('https://oauth2.googleapis.com/token', {
          code,
          client_id:     creds.client_id,
          client_secret: creds.client_secret,
          redirect_uri:  GOOGLE_REDIRECT_URI,
          code_verifier: verifier,
          grant_type:    'authorization_code',
        });
        if (tokenResp.status !== 200) {
          reject(new Error(`Token exchange failed: ${JSON.stringify(tokenResp.body)}`)); return;
        }
        const { access_token, refresh_token, expires_in } = tokenResp.body;
        const expiry = Math.floor(Date.now() / 1000) + (expires_in || 3600) - 60;

        // Fetch user email
        let email = null;
        try {
          const info = await httpsGet('https://www.googleapis.com/oauth2/v1/userinfo', access_token);
          if (info.status === 200) email = info.body.email || null;
        } catch (_) {}

        // Re-check the one-account-per-user rule right before insert (closes the
        // race window if two OAuth flows were somehow started concurrently).
        const raceCheck = get(
          'SELECT id FROM calendar_connections WHERE user_id=? AND provider=? LIMIT 1',
          [userId, 'google'],
        );
        if (raceCheck) {
          reject(new Error('A Google Calendar account is already connected.'));
          return;
        }

        // Persist connection (ics_url='' for OAuth connections)
        const connId = uuidv4();
        run(`INSERT INTO calendar_connections
             (id,user_id,provider,label,ics_url,color,access_token,refresh_token,token_expiry,account_email,google_cal_id)
             VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
          [connId, userId, 'google', label, '', color,
           access_token, refresh_token || null, expiry, email, calendarId]);

        // Immediately sync events
        try {
          const conn = get('SELECT * FROM calendar_connections WHERE id=?', [connId]);
          await syncGoogleCalendarConnection(conn, userId);
        } catch (syncErr) {
          console.warn('[google-cal] Initial sync failed:', syncErr.message);
        }

        resolve({ success: true, connectionId: connId, email });
      } catch (err) {
        res.end('Internal error');
        reject(err);
      }
    });

    _googleOAuthServer.on('error', (err) => {
      clearTimeout(timeout);
      reject(new Error(`Could not start OAuth server on port ${GOOGLE_OAUTH_PORT}: ${err.message}`));
    });

    _googleOAuthServer.listen(GOOGLE_OAUTH_PORT, '127.0.0.1', async () => {
      try { await shell.openExternal(authUrl); }
      catch (err) { clearTimeout(timeout); reject(err); }
    });
  });
});

// ─── CALENDAR INTEGRATION ─────────────────────────────────────────────────────
// iCal/ICS URL import — no OAuth required for non-Google sources.
// Outlook: outlook.live.com → Calendar → Share → "Get a link" → ICS URL
// Apple iCloud: icloud.com → Calendar → Share → "Public Calendar" → copy URL

// Fetch any URL (follows redirects, returns text)
function fetchURL(url) {
  return new Promise((resolve, reject) => {
    const follow = (u, depth = 0) => {
      if (depth > 5) { reject(new Error('Too many redirects')); return; }
      const mod = u.startsWith('https') ? require('https') : require('http');
      try {
        mod.get(u, { headers: { 'User-Agent': 'FlowLedger/2.0 Calendar Sync' } }, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            const next = res.headers.location.startsWith('http')
              ? res.headers.location
              : new URL(res.headers.location, u).href;
            follow(next, depth + 1);
            return;
          }
          let data = '';
          res.on('data', c => { data += c; });
          res.on('end', () => resolve(data));
        }).on('error', reject);
      } catch (e) { reject(e); }
    };
    follow(url);
  });
}

// Minimal ICS/iCal parser
function parseICS(text) {
  const events = [];
  // Unfold lines (continuation lines start with space/tab)
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    .replace(/\n[ \t]/g, '').split('\n');

  let cur = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (line === 'BEGIN:VEVENT') { cur = {}; continue; }
    if (line === 'END:VEVENT') {
      if (cur && cur.start && cur.title) events.push(cur);
      cur = null;
      continue;
    }
    if (!cur) continue;

    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const keyPart = line.slice(0, colon);
    const val     = line.slice(colon + 1).trim();
    const key     = keyPart.split(';')[0].toUpperCase();
    const params  = keyPart.slice(key.length);

    const unescape = s => s.replace(/\\n/g, '\n').replace(/\\,/g, ',').replace(/\;/g, ';').replace(/\\\\/g, '\\');

    if (key === 'SUMMARY')     cur.title        = unescape(val);
    if (key === 'DESCRIPTION') cur.description  = unescape(val);
    if (key === 'LOCATION')    cur.location     = unescape(val);
    if (key === 'UID')         cur.uid          = val;
    if (key === 'STATUS')      cur.status       = val.toLowerCase(); // confirmed/tentative/cancelled
    if (key === 'RRULE')       cur.isRecurring  = 1;
    if (key === 'URL')         cur.meetingUrl   = val;
    if (key === 'DTSTART') {
      cur.start    = parseICSDate(val, params);
      cur.allDay   = !val.includes('T') ? 1 : 0;
    }
    if (key === 'DTEND') {
      cur.end = parseICSDate(val, params);
    }
    if (key === 'ATTENDEE') {
      if (!cur.attendees) cur.attendees = [];
      const cn = (params.match(/CN=([^;:]+)/) || [])[1] || val.replace(/^mailto:/i, '');
      cur.attendees.push(cn);
    }
    // Extract Zoom / Teams / Meet URLs from description
    if (key === 'DESCRIPTION' || key === 'LOCATION') {
      const meetMatch = val.match(/https?:\/\/[^\s"<>]*(zoom\.us|teams\.microsoft\.com|meet\.google\.com|webex|whereby)[^\s"<>]*/i);
      if (meetMatch) cur.meetingUrl = meetMatch[0];
    }
  }
  return events;
}

function parseICSDate(val, params = '') {
  // TZID parameter means local time
  const hasTZ = params.includes('TZID') || (!val.endsWith('Z') && val.includes('T'));
  const s = val.replace(/[^0-9T]/g, '');
  if (s.length === 8) {
    // DATE-only: midnight local
    return Math.floor(new Date(`${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`).getTime() / 1000);
  }
  // DateTime
  const iso = `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}T${s.slice(9,11)}:${s.slice(11,13)}:${s.slice(13,15)}${val.endsWith('Z') ? 'Z' : ''}`;
  return Math.floor(new Date(iso).getTime() / 1000);
}

// ── IPC handlers ─────────────────────────────────────────────────────────────

ipcMain.handle('calendar:sources', (_, { userId }) =>
  all('SELECT * FROM calendar_connections WHERE user_id=? ORDER BY created_at', [userId])
);

ipcMain.handle('calendar:addSource', (_, { userId, provider, label, icsUrl, color }) => {
  const id = uuidv4();
  run('INSERT INTO calendar_connections (id,user_id,provider,label,ics_url,color) VALUES (?,?,?,?,?,?)',
    [id, userId, provider || 'ical', label || provider, icsUrl, color || '#3b82f6']);
  return { id, provider, label, ics_url: icsUrl, color: color || '#3b82f6' };
});

ipcMain.handle('calendar:removeSource', (_, { connectionId }) => {
  run('DELETE FROM calendar_events WHERE connection_id=?', [connectionId]);
  run('DELETE FROM calendar_connections WHERE id=?', [connectionId]);
  return { success: true };
});

ipcMain.handle('calendar:sync', async (_, { userId, connectionId }) => {
  // Sync one source, or all sources if connectionId is null
  const sources = connectionId
    ? [get('SELECT * FROM calendar_connections WHERE id=? AND user_id=?', [connectionId, userId])].filter(Boolean)
    : all('SELECT * FROM calendar_connections WHERE user_id=?', [userId]);

  let totalImported = 0;
  const errors = [];

  for (const src of sources) {
    try {
      // ── Google OAuth connections — use Google Calendar API ──────────────────
      if (src.provider === 'google') {
        if (!src.access_token) {
          errors.push({ sourceId: src.id, label: src.label, error: 'No access token — please reconnect your Google Calendar' });
          continue;
        }
        const result = await syncGoogleCalendarConnection(src, userId);
        totalImported += result.synced;
        continue;
      }

      // ── iCal/ICS connections ────────────────────────────────────────────────
      if (!src.ics_url) continue;
      const icsText = await fetchURL(src.ics_url);
      const events  = parseICS(icsText);

      // Only keep events in the next 60 days and past 30 days
      const now   = Math.floor(Date.now() / 1000);
      const from  = now - 30 * 86400;
      const to    = now + 60 * 86400;
      const relevant = events.filter(e => e.end >= from && e.start <= to);

      // Delete old events for this connection, then re-insert. Keep local title edits.
      const existingOverrides = {};
      all('SELECT id, title_override FROM calendar_events WHERE connection_id=? AND title_override IS NOT NULL', [src.id])
        .forEach(row => { existingOverrides[row.id] = row.title_override; });
      run('DELETE FROM calendar_events WHERE connection_id=?', [src.id]);

      for (const ev of relevant) {
        const id = `${src.id}:${ev.uid || uuidv4()}`;
        run(`INSERT OR REPLACE INTO calendar_events
          (id,user_id,connection_id,provider,title,title_override,description,location,meeting_url,
           start_time,end_time,all_day,attendees_json,color,status,is_recurring,synced_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [id, userId, src.id, src.provider,
           ev.title, existingOverrides[id] || null, ev.description || null, ev.location || null, ev.meetingUrl || null,
           ev.start, ev.end || ev.start + 3600,
           ev.allDay || 0,
           ev.attendees ? JSON.stringify(ev.attendees) : null,
           src.color, ev.status || 'confirmed', ev.isRecurring || 0,
           now]);
        totalImported++;
      }

      run('UPDATE calendar_connections SET last_synced=? WHERE id=?', [now, src.id]);
    } catch (err) {
      console.error(`[calendar:sync] failed for source "${src.label}" (${src.id}):`, err);
      const friendlyError = err.message === 'INVALID_GRANT'
        ? 'Access was revoked or expired — please reconnect your Google Calendar'
        : err.message;
      errors.push({ sourceId: src.id, label: src.label, error: friendlyError, invalidGrant: err.message === 'INVALID_GRANT' });
    }
  }
  if (errors.length) console.error('[calendar:sync] completed with errors:', errors);
  return { success: true, totalImported, errors };
});

ipcMain.handle('calendar:list', (_, { userId, from, to }) => {
  const now = Math.floor(Date.now() / 1000);
  return all(
    `SELECT ce.*,
            COALESCE(ce.title_override, ce.title) AS title,
            cc.label  AS source_label,
            cc.color  AS source_color,
            cc.provider AS source_provider,
            p.name    AS project_name,
            p.color   AS project_color,
            cl.name   AS client_name
     FROM calendar_events ce
     JOIN  calendar_connections cc ON ce.connection_id = cc.id
     LEFT JOIN projects p  ON ce.project_id = p.id
     LEFT JOIN clients  cl ON ce.client_id  = cl.id
     WHERE ce.user_id=? AND ce.start_time<=? AND ce.end_time>=? AND ce.status != 'cancelled'
     ORDER BY ce.start_time, ce.id`,
    [userId, to || now + 86400, from || now - 86400]
  );
});

ipcMain.handle('calendar:assignProject', (_, { eventId, projectId, clientId }) => {
  // 1. Update the calendar_events row
  run(
    'UPDATE calendar_events SET project_id=?, client_id=? WHERE id=?',
    [projectId || null, clientId || null, eventId]
  );

  // 2. Upsert a linked session row so this event appears in the project's
  //    recent-sessions list and is counted as a distinct tracked block.
  //    We use the notes field as a stable marker to prevent duplicates.
  const marker = `__cal_event:${eventId}`;
  const ev = get('SELECT * FROM calendar_events WHERE id=?', [eventId]);
  if (ev) {
    const existing = get('SELECT id FROM sessions WHERE notes=?', [marker]);
    if (projectId) {
      const dur = Math.max(0, (ev.end_time || 0) - (ev.start_time || 0));
      if (existing) {
        // Update existing linked session (project/client may have changed)
        run(
          'UPDATE sessions SET project_id=?, client_id=?, duration_seconds=?, ended_at=? WHERE id=?',
          [projectId, clientId || null, dur, ev.end_time || null, existing.id]
        );
      } else {
        // Create a new linked session for this calendar event
        run(
          `INSERT INTO sessions (id,user_id,category,title,started_at,ended_at,duration_seconds,session_type,project_id,client_id,notes)
           VALUES (?,?,?,?,?,?,?,'meeting',?,?,?)`,
          [
            uuidv4(), ev.user_id, 'Meeting',
            ev.title_override || ev.title || 'Calendar Event',
            ev.start_time, ev.end_time || null, dur,
            projectId, clientId || null, marker,
          ]
        );
      }
    } else if (existing) {
      // Project removed — delete the linked session row
      run('DELETE FROM sessions WHERE notes=?', [marker]);
    }
  }

  return { ok: true };
});

ipcMain.handle('calendar:updateEvent', (_, { eventId, title, description, startTime, endTime, location }) => {
  const updates = [];
  const params = [];

  if (title !== undefined) {
    const cleanTitle = String(title || '').trim();
    if (!cleanTitle) return { ok: false, error: 'Event name is required' };
    updates.push('title_override=?');
    params.push(cleanTitle);
  }

  if (description !== undefined) {
    updates.push('description=?');
    params.push(String(description || '').trim() || null);
  }

  if (startTime !== undefined) {
    updates.push('start_time=?');
    params.push(Number(startTime));
  }

  if (endTime !== undefined) {
    updates.push('end_time=?');
    params.push(Number(endTime));
  }

  if (location !== undefined) {
    updates.push('location=?');
    params.push(String(location || '').trim() || null);
  }

  if (!updates.length) return { ok: false, error: 'No event changes supplied' };

  params.push(eventId);
  run(`UPDATE calendar_events SET ${updates.join(', ')} WHERE id=?`, params);
  return { ok: true };
});

ipcMain.handle('calendar:deleteEvent', (_, { eventId }) => {
  // Also remove any linked session created via calendar:assignProject
  const marker = `__cal_event:${eventId}`;
  run('DELETE FROM sessions WHERE notes=?', [marker]);
  run('DELETE FROM calendar_events WHERE id=?', [eventId]);
  return { ok: true };
});

// Auto-convert calendar meeting events to tracked sessions (on-demand).
// Only converts events that have ALREADY ENDED — never creates sessions for
// future/in-progress events so they don't inflate productivity metrics.
ipcMain.handle('calendar:convertMeetings', async (_, { userId, from, to }) => {
  const nowSec = Math.floor(Date.now() / 1000);
  const events = all(
    `SELECT * FROM calendar_events
     WHERE user_id=? AND start_time>=? AND start_time<=?
     AND end_time <= ?
     AND (title LIKE '%meeting%' OR title LIKE '%standup%' OR title LIKE '%sync%'
          OR title LIKE '%interview%' OR title LIKE '%call%' OR meeting_url IS NOT NULL)
     AND status='confirmed'`,
    [userId, from, to, nowSec]
  );
  let converted = 0;
  for (const ev of events) {
    const marker = `__cal_event:${ev.id}`;
    const exists = get('SELECT id FROM sessions WHERE user_id=? AND notes=?', [userId, marker]);
    if (!exists) {
      const dur = Math.max(0, ev.end_time - ev.start_time);
      if (dur < 60) continue; // skip zero-length or malformed events
      run(`INSERT INTO sessions (id,user_id,category,title,started_at,ended_at,duration_seconds,is_deep_work,session_type,notes)
           VALUES (?,?,?,?,?,?,?,0,'meeting',?)`,
        [uuidv4(), userId, 'Meeting', ev.title, ev.start_time, ev.end_time, dur, marker]);
      converted++;
    }
  }
  return { converted };
});

// ─── SHELL ────────────────────────────────────────────────────────────────────
ipcMain.handle('shell:openExternal', async (_, url) => {
  const { shell } = require('electron');
  await shell.openExternal(url);
  return { ok: true };
});

// ─── SPOTIFY ──────────────────────────────────────────────────────────────────
let _spotifyCallbackServer = null;

ipcMain.handle('spotify:startAuth', async (_, { clientId, codeChallenge, state }) => {
  // Close any pre-existing callback server
  if (_spotifyCallbackServer) {
    try { _spotifyCallbackServer.close(); } catch (_) {}
    _spotifyCallbackServer = null;
  }

  const redirectUri = 'http://localhost:8888/callback';
  const scopes = [
    'user-read-playback-state',
    'user-modify-playback-state',
    'user-read-currently-playing',
    'streaming',
    'playlist-read-private',
    'user-library-read',
  ].join(' ');

  const params = new URLSearchParams({
    response_type:         'code',
    client_id:             clientId,
    scope:                 scopes,
    redirect_uri:          redirectUri,
    state,
    code_challenge_method: 'S256',
    code_challenge:        codeChallenge,
    show_dialog:           'true',
  });
  const authUrl = `https://accounts.spotify.com/authorize?${params.toString()}`;

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      if (_spotifyCallbackServer) {
        try { _spotifyCallbackServer.close(); } catch (_) {}
        _spotifyCallbackServer = null;
      }
      reject(new Error('Spotify auth timed out after 5 minutes'));
    }, 5 * 60 * 1000);

    _spotifyCallbackServer = http.createServer((req, res) => {
      try {
        const url  = new URL(req.url, 'http://localhost:8888');
        if (url.pathname !== '/callback') { res.end(''); return; }

        const code  = url.searchParams.get('code');
        const error = url.searchParams.get('error');
        const ok    = !!code && !error;

        const html = `<!DOCTYPE html><html>
<head><meta charset="utf-8"><title>Flow Ledger – Spotify</title>
<style>*{margin:0;padding:0;box-sizing:border-box}
body{font-family:system-ui,sans-serif;background:#0F1117;color:#EAEAF0;
     display:flex;align-items:center;justify-content:center;min-height:100vh}
.box{text-align:center;padding:2.5rem 3rem;background:#1A1D24;
     border-radius:14px;border:1px solid #2A2F3A;max-width:380px}
h2{font-size:20px;margin-bottom:.5rem;color:${ok ? '#34D399' : '#F87171'}}
p{font-size:13px;color:#9CA3AF;line-height:1.6}</style></head>
<body><div class="box">
<h2>${ok ? '✅ Connected to Spotify!' : '❌ Authentication Failed'}</h2>
<p>${ok ? 'You can close this tab and return to Flow Ledger.' : (error || 'Something went wrong. Please try again.')}</p>
</div></body></html>`;

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);

        clearTimeout(timeout);
        if (_spotifyCallbackServer) {
          try { _spotifyCallbackServer.close(); } catch (_) {}
          _spotifyCallbackServer = null;
        }

        if (ok) resolve({ code, redirectUri });
        else    reject(new Error(error || 'Auth denied by user'));
      } catch (err) {
        res.end('Internal error');
        reject(err);
      }
    });

    _spotifyCallbackServer.on('error', (err) => {
      clearTimeout(timeout);
      reject(new Error(`Could not start callback server on port 8888: ${err.message}`));
    });

    _spotifyCallbackServer.listen(8888, '127.0.0.1', async () => {
      try {
        const { shell } = require('electron');
        await shell.openExternal(authUrl);
      } catch (err) {
        clearTimeout(timeout);
        reject(err);
      }
    });
  });
});

ipcMain.handle('spotify:getTokens', () => {
  return get('SELECT * FROM spotify_tokens WHERE id=1') || null;
});

ipcMain.handle('spotify:saveTokens', (_, { clientId, accessToken, refreshToken, expiresAt }) => {
  run(
    `INSERT OR REPLACE INTO spotify_tokens (id, client_id, access_token, refresh_token, expires_at)
     VALUES (1, ?, ?, ?, ?)`,
    [clientId, accessToken || null, refreshToken || null, expiresAt || 0]
  );
  return { ok: true };
});

ipcMain.handle('spotify:clearTokens', () => {
  run('DELETE FROM spotify_tokens WHERE id=1');
  return { ok: true };
});

// ─── AI ENGINE IPC HANDLERS ───────────────────────────────────────────────────

// Classify a single activity on-demand (renderer can call this for manual sessions)
ipcMain.handle('ai:classify', (_, { appName, url, title }) => {
  if (!aiEngine) return null;
  try {
    return aiEngine.classifyActivity(appName || '', url || '', title || '');
  } catch (e) {
    return null;
  }
});

// Get today's productivity scores from the DB (or compute fresh)
ipcMain.handle('ai:getDailyScores', (_, { userId, dateKey }) => {
  if (!aiEngine || !userId) return null;
  try {
    const key = dateKey || localDateKey();
    const stored = get(
      'SELECT * FROM ai_daily_scores WHERE user_id=? AND date_key=?',
      [userId, key]
    );
    if (stored) return stored;
    // Compute fresh if not yet persisted today
    const acts = all(
      'SELECT * FROM auto_sessions WHERE user_id=? AND date_key=? ORDER BY started_at ASC',
      [userId, key]
    );
    const scores = aiEngine.calculateProductivityScores(acts);
    aiEngine.saveDailyScores(userId, key, scores);
    return { ...scores, date_key: key };
  } catch (e) {
    return null;
  }
});

// Get historical scores for N days
ipcMain.handle('ai:historicalScores', (_, { userId, days }) => {
  if (!aiEngine || !userId) return [];
  try {
    return aiEngine.getHistoricalScores(userId, days || 30);
  } catch (e) {
    return [];
  }
});

// Get behavioral analytics for a date range
ipcMain.handle('ai:behavioralInsights', (_, { userId, dateKey }) => {
  if (!aiEngine || !userId) return null;
  try {
    const key = dateKey || localDateKey();
    const acts = all(
      'SELECT * FROM auto_sessions WHERE user_id=? AND date_key=? ORDER BY started_at ASC',
      [userId, key]
    );
    return aiEngine.analyzeBehavior(acts);
  } catch (e) {
    return null;
  }
});

// Get current focus state
ipcMain.handle('ai:focusState', (_, { appName, url, category }) => {
  if (!aiEngine) return null;
  try {
    return aiEngine.analyzeFocus(appName || '', url || '', category || '');
  } catch (e) {
    return null;
  }
});

// Manually trigger a learning correction (called from category edit UI)
ipcMain.handle('ai:learnCorrection', (_, { appName, url, title, originalCategory, correctedCategory }) => {
  if (!aiEngine) return { ok: false };
  try {
    aiEngine.learnFromCorrection(
      appName || '', url || '', title || '',
      originalCategory || '', correctedCategory || ''
    );
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Detect distraction for a given context
ipcMain.handle('ai:detectDistraction', (_, { appName, url, title }) => {
  if (!aiEngine) return null;
  try {
    return aiEngine.detectDistraction(appName || '', url || '', title || '');
  } catch (e) {
    return null;
  }
});

// Get current workflow summary
ipcMain.handle('ai:workflowSummary', (_, { userId, dateKey }) => {
  if (!aiEngine || !userId) return null;
  try {
    const key = dateKey || localDateKey();
    const acts = all(
      'SELECT * FROM auto_sessions WHERE user_id=? AND date_key=? ORDER BY started_at ASC',
      [userId, key]
    );
    return aiEngine.detectWorkflow(acts.map(a => ({ ...a, category_key: a.ai_category })));
  } catch (e) {
    return null;
  }
});

// ─── FOCUS STREAK ─────────────────────────────────────────────────────────────
ipcMain.handle('stats:focusStreak', (_, { userId }) => {
  const user = get('SELECT daily_target_hours FROM users WHERE id=?', [userId]);
  const targetSecs = (user?.daily_target_hours || 6) * 3600;
  const from90 = Math.floor(Date.now() / 1000) - 90 * 86400;

  const manualRows = all(
    `SELECT strftime('%Y-%m-%d', datetime(started_at,'unixepoch','localtime')) as dk,
            COALESCE(SUM(duration_seconds),0) as total
     FROM sessions WHERE user_id=? AND ended_at IS NOT NULL AND started_at>=?
     GROUP BY dk`,
    [userId, from90]
  );
  const autoRows = all(
    `SELECT date_key as dk, COALESCE(SUM(duration_seconds),0) as total
     FROM auto_sessions WHERE user_id=? AND is_idle=0 AND started_at>=?
     GROUP BY dk`,
    [userId, from90]
  );

  const byDate = {};
  manualRows.forEach(r => { byDate[r.dk] = (byDate[r.dk] || 0) + r.total; });
  autoRows.forEach(r => { byDate[r.dk] = (byDate[r.dk] || 0) + r.total; });

  const days = [];
  const d = new Date(); d.setHours(0, 0, 0, 0);
  for (let i = 0; i < 90; i++) {
    const key = localDateKey(Math.floor(d.getTime() / 1000));
    days.push(byDate[key] || 0);
    d.setDate(d.getDate() - 1);
  }

  // Skip today if not yet at target (day still in progress)
  const startIdx = days[0] >= targetSecs ? 0 : 1;
  let currentStreak = 0;
  for (let i = startIdx; i < days.length; i++) {
    if (days[i] >= targetSecs) currentStreak++;
    else break;
  }

  let longest = 0, run = 0;
  for (const t of days) {
    if (t >= targetSecs) { run++; longest = Math.max(longest, run); }
    else run = 0;
  }

  return { currentStreak, longestStreak: longest, targetSecs };
});

// ─── DAY PLANNING ─────────────────────────────────────────────────────────────
ipcMain.handle('dayPlan:get', (_, { userId, dateKey }) =>
  get('SELECT * FROM day_plans WHERE user_id=? AND date_key=?', [userId, dateKey]) || null
);

ipcMain.handle('dayPlan:save', (_, { userId, dateKey, planItems }) => {
  const json = JSON.stringify(planItems || []);
  const existing = get('SELECT id FROM day_plans WHERE user_id=? AND date_key=?', [userId, dateKey]);
  if (existing) {
    run('UPDATE day_plans SET plan_json=? WHERE user_id=? AND date_key=?', [json, userId, dateKey]);
  } else {
    run('INSERT INTO day_plans (id,user_id,date_key,plan_json) VALUES (?,?,?,?)', [uuidv4(), userId, dateKey, json]);
  }
  return { success: true };
});

ipcMain.handle('dayPlan:compare', (_, { userId, dateKey }) => {
  const plan = get('SELECT plan_json FROM day_plans WHERE user_id=? AND date_key=?', [userId, dateKey]);
  if (!plan) return { plan: [], actual: {} };
  const items = JSON.parse(plan.plan_json || '[]');
  const dayStart = Math.floor(new Date(`${dateKey}T00:00:00`).getTime() / 1000);
  const dayEnd   = dayStart + 86400;
  const rows = all(
    'SELECT category, COALESCE(SUM(duration_seconds),0) as total FROM sessions WHERE user_id=? AND ended_at IS NOT NULL AND started_at>=? AND started_at<? GROUP BY category',
    [userId, dayStart, dayEnd]
  );
  const actual = {};
  rows.forEach(r => { actual[r.category] = r.total; });
  return { plan: items, actual };
});

// ─── BLOCK SCHEDULES ─────────────────────────────────────────────────────────
ipcMain.handle('schedules:list', (_, { userId }) =>
  all('SELECT * FROM block_schedules WHERE user_id=? ORDER BY start_mins', [userId])
);
ipcMain.handle('schedules:create', (_, { userId, label, profileIds, daysMask, startMins, endMins }) => {
  const id = uuidv4();
  run('INSERT INTO block_schedules (id,user_id,label,profile_ids,days_mask,start_mins,end_mins) VALUES (?,?,?,?,?,?,?)',
    [id, userId, label, JSON.stringify(profileIds || []), daysMask ?? 62, startMins ?? 540, endMins ?? 720]);
  return { id, label, profile_ids: JSON.stringify(profileIds || []), days_mask: daysMask ?? 62, start_mins: startMins ?? 540, end_mins: endMins ?? 720, active: 1 };
});
ipcMain.handle('schedules:update', (_, { id, label, profileIds, daysMask, startMins, endMins }) => {
  run('UPDATE block_schedules SET label=?,profile_ids=?,days_mask=?,start_mins=?,end_mins=? WHERE id=?',
    [label, JSON.stringify(profileIds || []), daysMask, startMins, endMins, id]);
  return { success: true };
});
ipcMain.handle('schedules:delete', (_, { id }) => { run('DELETE FROM block_schedules WHERE id=?', [id]); return { success: true }; });
ipcMain.handle('schedules:toggle', (_, { id, active }) => { run('UPDATE block_schedules SET active=? WHERE id=?', [active ? 1 : 0, id]); return { success: true }; });

// ─── SLACK STATUS ─────────────────────────────────────────────────────────────
ipcMain.handle('slack:setStatus', (_, { token, statusText, statusEmoji, durationSecs }) => {
  const https = require('https');
  const body  = JSON.stringify({
    profile: {
      status_text:       statusText || '',
      status_emoji:      statusEmoji || '',
      status_expiration: durationSecs ? Math.floor(Date.now() / 1000) + durationSecs : 0,
    },
  });
  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'slack.com',
      path:     '/api/users.profile.set',
      method:   'POST',
      headers:  {
        'Authorization': `Bearer ${token}`,
        'Content-Type':  'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end',  () => { try { resolve(JSON.parse(data)); } catch { resolve({ ok: false }); } });
    });
    req.on('error', () => resolve({ ok: false }));
    req.write(body);
    req.end();
  });
});
