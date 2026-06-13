'use strict';

const { app, ipcMain } = require('electron');
const path = require('path');
const fs   = require('fs');

// ─── Graceful fallback if electron-updater not yet installed ──────────────────
let autoUpdater = null;
try {
  ({ autoUpdater } = require('electron-updater'));
} catch (e) {
  console.warn('[updater] electron-updater unavailable — auto-updates disabled:', e.message);
}

const isDev          = !!process.env.ELECTRON_START_URL;
const CHECK_INTERVAL = 4 * 60 * 60 * 1000;   // 4 hours
const CHANNEL_FILE   = 'fl-update-channel.json';

let _win         = null;
let _timer       = null;
let _lastCheckAt = null;
let _channel     = 'stable';

// ─── IPC push to renderer ────────────────────────────────────────────────────
function push(event, data) {
  if (_win && !_win.isDestroyed()) {
    _win.webContents.send(event, data ?? null);
  }
}

// ─── Channel persistence ──────────────────────────────────────────────────────
function readChannel() {
  try {
    const f = path.join(app.getPath('userData'), CHANNEL_FILE);
    if (fs.existsSync(f)) {
      const d = JSON.parse(fs.readFileSync(f, 'utf8'));
      return d.channel === 'beta' ? 'beta' : 'stable';
    }
  } catch {}
  return 'stable';
}

function writeChannel(ch) {
  try {
    const f = path.join(app.getPath('userData'), CHANNEL_FILE);
    fs.writeFileSync(f, JSON.stringify({ channel: ch }), 'utf8');
  } catch {}
}

// ─── Parse release notes (string | array | null) ─────────────────────────────
function parseNotes(raw) {
  if (!raw) return '';
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) {
    return raw.map(n => (n && typeof n === 'object' ? (n.note || '') : String(n))).filter(Boolean).join('\n\n');
  }
  return String(raw);
}

// ─── Detect mandatory flag from notes content ─────────────────────────────────
function isMandatory(info) {
  const notes = parseNotes(info.releaseNotes);
  return /\[MANDATORY\]|\[CRITICAL\]/i.test(notes) || Boolean(info.mandatory);
}

// ─── Attach autoUpdater event listeners ──────────────────────────────────────
function attachListeners() {
  if (!autoUpdater) return;

  autoUpdater.on('checking-for-update', () => {
    _lastCheckAt = new Date().toISOString();
    push('updater:checking', { lastCheckAt: _lastCheckAt });
  });

  autoUpdater.on('update-available', (info) => {
    const notes    = parseNotes(info.releaseNotes);
    const sizeBytes = (info.files || []).reduce((sum, f) => sum + (f.size || 0), 0);
    push('updater:available', {
      version:      info.version,
      releaseDate:  info.releaseDate,
      releaseNotes: notes,
      sizeBytes,
      mandatory:    isMandatory(info),
    });
  });

  autoUpdater.on('update-not-available', () => {
    push('updater:notAvailable', { lastCheckAt: _lastCheckAt });
  });

  autoUpdater.on('download-progress', (p) => {
    push('updater:progress', {
      percent:        Math.round(p.percent * 10) / 10,
      transferred:    p.transferred,
      total:          p.total,
      bytesPerSecond: p.bytesPerSecond,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    push('updater:downloaded', {
      version:      info.version,
      releaseNotes: parseNotes(info.releaseNotes),
      mandatory:    isMandatory(info),
    });
  });

  autoUpdater.on('error', (err) => {
    console.error('[updater] Error:', err.message);
    push('updater:error', { message: err.message || 'Update check failed' });
  });
}

// ─── Background check helper ──────────────────────────────────────────────────
async function silentCheck() {
  if (!autoUpdater || isDev) return;
  try {
    await autoUpdater.checkForUpdates();
  } catch (e) {
    console.warn('[updater] Background check failed:', e.message);
  }
}

// ─── IPC handlers — real (when electron-updater present) ─────────────────────
function registerHandlers() {
  ipcMain.handle('updater:getInfo', () => ({
    currentVersion: app.getVersion(),
    channel:        _channel,
    lastCheckAt:    _lastCheckAt,
    isDev,
  }));

  ipcMain.handle('updater:check', async () => {
    // In dev mode return a harmless stub so Settings can still render
    if (isDev) {
      _lastCheckAt = new Date().toISOString();
      return { ok: true, dev: true, currentVersion: app.getVersion() };
    }
    try {
      await autoUpdater.checkForUpdates();
      _lastCheckAt = new Date().toISOString();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('updater:download', async () => {
    try {
      await autoUpdater.downloadUpdate();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('updater:install', () => {
    // isSilent=false → shows UAC on Windows if needed
    // isForceRunAfter=true → relaunches app after install
    setImmediate(() => autoUpdater.quitAndInstall(false, true));
  });

  ipcMain.handle('updater:setChannel', (_, { channel }) => {
    const ch = channel === 'beta' ? 'beta' : 'stable';
    _channel = ch;
    writeChannel(ch);
    autoUpdater.allowPrerelease = ch === 'beta';
    return { ok: true, channel: ch };
  });
}

// ─── IPC stubs — when electron-updater is absent ─────────────────────────────
function registerStubs() {
  ipcMain.handle('updater:getInfo',    () => ({
    currentVersion: app.getVersion(),
    channel: 'stable',
    lastCheckAt: null,
    isDev: true,
  }));
  ipcMain.handle('updater:check',      () => ({ ok: false, error: 'Updater not available in this build.' }));
  ipcMain.handle('updater:download',   () => ({ ok: false, error: 'Updater not available.' }));
  ipcMain.handle('updater:install',    () => {});
  ipcMain.handle('updater:setChannel', (_, { channel }) => ({ ok: true, channel }));
}

// ─── Public API: call after mainWindow is created ────────────────────────────
function setupUpdater(mainWindow) {
  _win = mainWindow;

  if (!autoUpdater) {
    registerStubs();
    return;
  }

  _channel = readChannel();

  autoUpdater.logger              = null;   // avoid verbose electron-log output
  autoUpdater.autoDownload        = false;  // user triggers the download
  autoUpdater.autoInstallOnAppQuit = true;  // install on normal quit if downloaded
  autoUpdater.allowPrerelease     = _channel === 'beta';
  autoUpdater.allowDowngrade      = false;

  attachListeners();
  registerHandlers();

  if (!isDev) {
    // First silent check 8 s after window shows (gives app time to finish loading)
    setTimeout(silentCheck, 8_000);
    // Recurring check every 4 hours
    _timer = setInterval(silentCheck, CHECK_INTERVAL);
  }
}

module.exports = { setupUpdater };
