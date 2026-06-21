/**
 * AutoTracker — passive, zero-interaction time tracker
 *
 * • Polls the active window every POLL_MS milliseconds using OS-native commands
 *   (no native Node modules — pure child_process).
 * • Detects idle via Electron powerMonitor; ignores periods > IDLE_THRESHOLD.
 * • Emits structured events: onActivity, onIdle, onResume.
 * • Stores every micro-session in the `auto_sessions` table.
 */

const { exec, spawn } = require('child_process');
const os   = require('path');   // only for path.join
const path = require('path');
const { trackingWorkflowManager, WORKFLOW_EVENTS } = require('./workflow/workflowEngine');

const POLL_MS               = 4000;   // poll every 4 seconds
const IDLE_THRESHOLD        = 60;     // seconds of system idle before we stop recording
const MIN_DURATION          = 3;      // ignore bursts < 3 seconds
const FLUSH_INTERVAL_MS     = 30_000; // persist a snapshot every 30 s
const BLOCK_COOLDOWN_MS     = 30_000; // 30 s cooldown between block kills per app
const TRACE_PREFIX          = '[AUTO_TRACKER_TRACE]';

// App names that must never be recorded — OS shells and generic runtimes.
// Case-insensitive match against the raw process name returned by OS.
// Note: "electron" is intercepted below and remapped to "Flow Ledger" when
// the window title belongs to this app, so it is intentionally excluded here.
const SELF_APP_RE = /^(electron|node(?:\.exe)?|cmd|conhost|explorer|finder|systemuiserver|dock|loginwindow|windowserver|spotlight|taskbar|shellexperiencehost|startmenuexperiencehost|searchhost|lockapp)$/i;

// ─── OS DETECTION ─────────────────────────────────────────────────────────────
const PLATFORM = process.platform; // 'win32' | 'darwin' | 'linux'

const HIDDEN_CHARS_RE = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060\ufeff]/g;
const BROWSER_SUFFIX_RE = /\s+[-–—]\s+(Google Chrome|Chrome|Microsoft Edge|Edge|Brave|Firefox|Arc|Opera|Safari)$/i;
const VOLATILE_QUERY_RE = /^(utm_|fbclid$|gclid$|mc_|ref$|ref_src$|igshid$|session|token|auth|cache|ts|t)$/i;

function cleanTrackerString(value) {
  return String(value || '').replace(HIDDEN_CHARS_RE, '').replace(/\s+/g, ' ').trim();
}

function normalizeTrackerApp(appName = '') {
  return cleanTrackerString(appName).replace(/\.exe$/i, '').toLowerCase();
}

function normalizeTrackerTitle(title = '') {
  return cleanTrackerString(title).replace(BROWSER_SUFFIX_RE, '').toLowerCase();
}

function normalizeTrackerUrl(url = '') {
  const raw = cleanTrackerString(url);
  if (!raw) return '';
  try {
    const parsed = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    parsed.hash = '';
    [...parsed.searchParams.keys()].forEach((key) => {
      if (VOLATILE_QUERY_RE.test(key)) parsed.searchParams.delete(key);
    });
    return `${parsed.hostname.replace(/^www\./i, '').toLowerCase()}${parsed.pathname.replace(/\/+$/, '').toLowerCase()}${parsed.search}`;
  } catch {
    return raw.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('#')[0].trim().toLowerCase();
  }
}

function trackerFingerprint(info = {}) {
  const app = normalizeTrackerApp(info.appName);
  const title = normalizeTrackerTitle(info.title);
  const url = normalizeTrackerUrl(info.url);
  const browserScope = /chrome|edge|brave|firefox|safari|arc|opera/.test(app)
    ? (url || title)
    : title;
  return `${app}|${browserScope}`;
}

function traceTracker(event, payload = {}) {
  const safe = {
    ...payload,
    title: cleanTrackerString(payload.title || '').slice(0, 140),
    url: cleanTrackerString(payload.url || '').slice(0, 180),
  };
  console.debug(TRACE_PREFIX, event, safe);
}

// ─── PERSISTENT POWERSHELL BRIDGE (Windows) ──────────────────────────────────
// Spawning powershell.exe once and sending commands via stdin is ~10× faster
// than spawning a new process on every poll.

class PowerShellBridge {
  constructor() {
    this.proc       = null;
    this.outBuf     = '';
    this.pending    = null;
    this.ready      = false;
  }

  start() {
    this._startProc();
  }

  _startProc() {
    // Guard: don't double-spawn
    if (this.proc) return;

    try {
      this.proc = spawn('powershell.exe', [
        '-NonInteractive', '-NoProfile', '-NoLogo',
        '-ExecutionPolicy', 'Bypass',
        '-Command', '-',
      ], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    } catch {
      // PowerShell not available on this machine — degrade gracefully
      this.proc  = null;
      this.ready = false;
      return;
    }

    // ── EPIPE guard ──────────────────────────────────────────────────────────
    // Without this, any write to stdin after PowerShell exits throws an
    // uncaught EPIPE exception that crashes the Electron main process.
    this.proc.stdin.on('error', (err) => {
      if (err.code === 'EPIPE' || err.code === 'ERR_STREAM_DESTROYED') {
        // Expected — PowerShell died mid-write. The exit handler will restart.
      }
      // Other errors also silently absorbed; proc.on('exit') will handle restart.
    });

    this.proc.stdout.on('data', (chunk) => {
      this.outBuf += chunk.toString();
      const idx = this.outBuf.indexOf('##END##');
      if (idx !== -1) {
        const result = this.outBuf.slice(0, idx).trim();
        this.outBuf  = this.outBuf.slice(idx + 7).replace(/^\r?\n/, '');
        if (this.pending) {
          const resolve = this.pending;
          this.pending  = null;
          resolve(result);
        }
      }
    });

    this.proc.stdout.on('error', () => {}); // absorb read errors on dead stdout
    this.proc.stderr.on('data',  () => {}); // suppress stderr noise
    this.proc.stderr.on('error', () => {});

    this.proc.on('exit', () => {
      this.proc  = null;
      this.ready = false;
      // Resolve any pending query so callers don't hang
      if (this.pending) { this.pending(null); this.pending = null; }
      // Auto-restart after a short back-off so the next poll works
      if (!this._stopping) {
        setTimeout(() => this._startProc(), 2000);
      }
    });

    // Load Win32 GetForegroundWindow once into the persistent session so every
    // subsequent query can use [Win32FG.NativeMethods] without recompiling.
    const initCmd =
      `$sig = '[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();` +
      ` [DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(IntPtr hWnd, out int lpdwProcessId);';` +
      ` if (-not ([System.Management.Automation.PSTypeName]'Win32FG.NativeMethods').Type) {` +
      `   Add-Type -MemberDefinition $sig -Name 'NativeMethods' -Namespace 'Win32FG' -ErrorAction SilentlyContinue` +
      ` }; Write-Host '##END##'\n`;

    try {
      this.proc.stdin.write(initCmd);
      this.ready = true;
    } catch {
      // stdin already closed — exit handler will restart
      this.ready = false;
    }
  }

  query(cmd) {
    return new Promise((resolve) => {
      if (!this.proc || !this.ready) { resolve(null); return; }
      this.pending = resolve;
      // Append sentinel so we know response is complete
      try {
        this.proc.stdin.write(`${cmd}; Write-Host '##END##'\n`);
      } catch {
        // stdin closed between ready-check and write — resolve immediately
        if (this.pending === resolve) { this.pending = null; resolve(null); }
        return;
      }
      // Safety timeout — if PowerShell hangs we don't block the poll loop
      setTimeout(() => {
        if (this.pending === resolve) { this.pending = null; resolve(null); }
      }, 3000);
    });
  }

  stop() {
    this._stopping = true;
    try { this.proc?.stdin?.end(); } catch {}
    try { this.proc?.kill();       } catch {}
    this.proc  = null;
    this.ready = false;
  }
}

// ─── AUTO TRACKER ─────────────────────────────────────────────────────────────
class AutoTracker {
  constructor({ onActivity, onIdle, onResume, onBlocked, getIdleTime, isBlocked, getProject }) {
    this.onActivity  = onActivity;
    this.onIdle      = onIdle;
    this.onResume    = onResume;
    this.onBlocked   = onBlocked;
    this.getIdleTime = getIdleTime;   // () => seconds of system idle
    this.isBlocked   = isBlocked;     // (appName) => bool
    this.getProject  = getProject;    // () => { id, name } | null

    this.currentApp     = null;
    this.currentTitle   = null;
    this.currentUrl     = null;
    this.sessionStart   = null;
    this.currentFingerprint = null;
    this.idle           = false;
    this.intervalHandle = null;
    this.psBridge       = PLATFORM === 'win32' ? new PowerShellBridge() : null;
    // Cooldown: track last time we fired onBlocked per app to avoid notification spam
    this._lastBlocked   = {};  // appName → timestamp (ms)

    // URL injected by Chrome extension
    this.latestBrowserUrl   = null;
    this.latestBrowserTitle = null;
    this.latestBrowserApp   = null;
  }

  start() {
    console.log("TRACKER STARTED");
    if (PLATFORM === 'win32') this.psBridge?.start();
    this.sessionStart  = Date.now();
    this.intervalHandle = setInterval(() => this._poll(), POLL_MS);
    this._poll();
  }

  stop() {
    clearInterval(this.intervalHandle);
    this.psBridge?.stop();
    this._flush();
  }

  /** Called by the WebSocket/HTTP server when Chrome extension sends a URL */
  injectBrowserUrl(appName, url, title) {
    this.latestBrowserApp   = appName;
    this.latestBrowserUrl   = url;
    this.latestBrowserTitle = title;
  }

  // ── Main poll ──────────────────────────────────────────────────────────────
  async _poll() {
    // 1. Idle check
    const idleSecs = this.getIdleTime?.() ?? 0;
    if (idleSecs >= IDLE_THRESHOLD) {
      if (!this.idle) {
        this.idle = true;
        this._flush('IDLE_CHANGE:entered_idle', { endWorkflow: true, workflowReason: 'prolonged_idle' });
        this.onIdle?.();
      }
      return;
    }
    if (this.idle) {
      this.idle         = false;
      this.sessionStart = Date.now();
      traceTracker('IDLE_CHANGE', { reason: 'resumed_from_idle' });
      this.onResume?.();
    }

    // 2. Get active window
    let info = await this._getActiveWindow();
    if (!info) return;

    // In dev mode the process is "electron"; remap it to "Flow Ledger" so
    // time spent in this app is recorded under the correct name.
    if (/^electron$/i.test(info.appName) && /flow.?ledger/i.test(info.title || '')) {
      info.appName = 'Flow Ledger';
    }

    // Skip OS shells and generic runtimes — never record them
    if (SELF_APP_RE.test(info.appName)) return;

    // Skip "ghost" Notepad entries — Windows sometimes returns Notepad when no
    // real window is focused (minimised, locked screen flash, etc.).  Only allow
    // Notepad through when it has a meaningful window title (i.e. an actual file).
    const GHOST_APP_RE = /^(notepad|wordpad|mspaint|calc|calculator)$/i;
    if (GHOST_APP_RE.test(info.appName) && (!info.title || info.title.trim() === '')) return;

    // Normalise app names so classifiers get clean tokens (strip "- Windows" suffixes etc.)
    info.appName = info.appName.trim();

    // 3. If active app is a browser AND we have a URL from the extension, use it
    const isBrowser = /chrome|firefox|edge|safari|brave|opera/i.test(info.appName);
    if (isBrowser && this.latestBrowserApp && this.latestBrowserUrl) {
      info.url   = this.latestBrowserUrl;
      info.title = this.latestBrowserTitle || info.title;
    }

    // 4. Distraction check — only fire once per BLOCK_COOLDOWN_MS per app
    if (this.isBlocked?.(info.appName, info.title)) {
      const now  = Date.now();
      const last = this._lastBlocked[info.appName] || 0;
      if (now - last >= BLOCK_COOLDOWN_MS) {
        this._lastBlocked[info.appName] = now;
        // Flush any accumulated time for the blocked app before notifying
        await this._flush('END_SESSION:blocked_app');
        this.onBlocked?.(info.appName, info.title);
      }
      // Do NOT record time while blocked — reset current session
      this.currentApp   = null;
      this.currentTitle = null;
      this.currentUrl   = null;
      this.sessionStart = null;
      this.currentFingerprint = null;
      return;
    }

    // 5. Workflow-centric context change — app/URL/tab changes are context signals,
    //    not automatic session splits. WorkflowManager decides continue vs split.
    const nextFingerprint = trackerFingerprint(info);
    const contextChanged = nextFingerprint !== this.currentFingerprint;
    const project = this.getProject?.() || null;

    if (contextChanged) {
      const hadPreviousApp = !!this.currentApp;
      const workflowActivity = {
        appName: info.appName,
        title: info.title,
        url: info.url || null,
        timestamp: Date.now(),
      };

      const wfResult = trackingWorkflowManager.processActivity(workflowActivity, project, {
        contextChanged: true,
        calendarInterruption: false,
      });

      if (hadPreviousApp) {
        const splitReason = wfResult.shouldSplitWorkflow ? wfResult.breakReason : null;
        traceTracker(wfResult.isNew ? WORKFLOW_EVENTS.SPLIT : 'WORKFLOW_CONTINUED', {
          reason: splitReason || 'context_signal_app_change',
          from: this.currentFingerprint,
          to: nextFingerprint,
          workflowId: wfResult.workflowId,
          confidence: wfResult.confidence,
          appName: info.appName,
        });
        await this._flush(
          wfResult.shouldSplitWorkflow
            ? `WORKFLOW_SPLIT:${splitReason || 'transition'}`
            : 'CONTEXT_SEGMENT:app_change_same_workflow',
          { workflowId: wfResult.workflowId, workflowSplit: wfResult.shouldSplitWorkflow },
        );
      } else {
        traceTracker('START_SESSION', {
          reason: 'initial_window',
          appName: info.appName,
          workflowId: wfResult.workflowId,
        });
      }

      this.currentApp   = info.appName;
      this.currentTitle = info.title;
      this.currentUrl   = info.url || null;
      this.sessionStart = Date.now();
      this.currentFingerprint = nextFingerprint;
    }

    // 6. Periodic flush — write a snapshot every FLUSH_INTERVAL_MS even if the app
    //    hasn't changed. Without this, Activity shows nothing until the user switches apps.
    if (
      !contextChanged &&
      this.currentApp &&
      this.sessionStart &&
      Date.now() - this.sessionStart >= FLUSH_INTERVAL_MS
    ) {
      const duration = Math.floor((Date.now() - this.sessionStart) / 1000);
      if (duration >= MIN_DURATION) {
        const activeWf = trackingWorkflowManager.getActiveWorkflow();
        traceTracker('UPDATE_SESSION', {
          reason: 'periodic_telemetry_flush',
          appName: this.currentApp,
          title: this.currentTitle,
          url: this.currentUrl,
          duration,
          workflowId: activeWf?.id,
        });
        this.onActivity?.({
          appName:  this.currentApp,
          title:    this.currentTitle,
          url:      this.currentUrl,
          duration,
          flush:    true,
          workflowId: activeWf?.id || null,
          workflowName: activeWf?.name || null,
        });
        this.sessionStart = Date.now(); // restart counter for this app
      }
    }
    // Emit heartbeat so callers can show "live" activity
    const activeWorkflow = trackingWorkflowManager.getActiveWorkflow();
    this.onActivity?.({
      appName:  this.currentApp,
      title:    this.currentTitle,
      url:      this.currentUrl,
      elapsed:  Math.floor((Date.now() - (this.sessionStart || Date.now())) / 1000),
      idle:     false,
      workflowId: activeWorkflow?.id || null,
      workflowName: activeWorkflow?.name || null,
      workflowLocked: activeWorkflow?.locked || false,
      workflowConfidence: activeWorkflow?.confidence ?? null,
    });
  }

  /** Flush current app-session to DB callback */
  async _flush(reason, meta = {}) {
    if (!this.currentApp || !this.sessionStart) return;
    const duration = Math.floor((Date.now() - this.sessionStart) / 1000);
    if (duration < MIN_DURATION) return;

    const workflowId = meta.workflowId || trackingWorkflowManager.getActiveWorkflow()?.id || null;
    const workflowName = trackingWorkflowManager.getActiveWorkflow()?.name || null;

    if (meta.endWorkflow) {
      trackingWorkflowManager.endActiveWorkflow(meta.workflowReason || reason);
    }

    traceTracker('END_SESSION', {
      reason: reason || 'flush',
      appName: this.currentApp,
      title: this.currentTitle,
      url: this.currentUrl,
      duration,
      fingerprint: this.currentFingerprint,
      workflowId,
      workflowSplit: !!meta.workflowSplit,
    });
    this.onActivity?.({
      appName:  this.currentApp,
      title:    this.currentTitle,
      url:      this.currentUrl,
      duration,
      flush:    true,
      workflowId,
      workflowName,
      workflowSplit: !!meta.workflowSplit,
      flushReason: reason || 'flush',
    });
    this.sessionStart = null;
  }

  // ── OS-specific window fetchers ────────────────────────────────────────────
  async _getActiveWindow() {
    if (PLATFORM === 'win32')  return this._winActive();
    if (PLATFORM === 'darwin') return this._macActive();
    return this._linuxActive();
  }

  _winActive() {
    return new Promise((resolve) => {
      // Use GetForegroundWindow (Win32) to get the ACTUAL focused window — not
      // a guess based on CPU. The type is pre-loaded in the persistent PS session.
      const cmd =
        `try {` +
        ` $hwnd = [Win32FG.NativeMethods]::GetForegroundWindow();` +
        ` $pid2 = 0;` +
        ` [Win32FG.NativeMethods]::GetWindowThreadProcessId($hwnd, [ref]$pid2) | Out-Null;` +
        ` $p = Get-Process -Id $pid2 -ErrorAction SilentlyContinue;` +
        ` if ($p -and $p.MainWindowTitle) { "$($p.Name)|$($p.MainWindowTitle)" }` +
        ` elseif ($p) { "$($p.Name)|" }` +
        ` else { "idle|" }` +
        `} catch { "idle|" }`;

      if (this.psBridge?.ready) {
        this.psBridge.query(cmd).then((out) => {
          if (!out || out.startsWith('idle')) { resolve(null); return; }
          const sep  = out.indexOf('|');
          const app  = sep >= 0 ? out.slice(0, sep).trim() : out.trim();
          const title = sep >= 0 ? out.slice(sep + 1).trim() : '';
          if (!app || app === 'idle') { resolve(null); return; }
          resolve({ appName: app, title });
        });
      } else {
        // Fallback one-shot (no persistent session available yet)
        const oneShot =
          `$hw=[System.Runtime.InteropServices.Marshal];` +
          `Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow(); [DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(IntPtr h, out int p);' -Name 'NM2' -Namespace 'W2' -EA SilentlyContinue;` +
          `$hwnd=[W2.NM2]::GetForegroundWindow(); $pid2=0; [W2.NM2]::GetWindowThreadProcessId($hwnd,[ref]$pid2)|Out-Null;` +
          `$p=Get-Process -Id $pid2 -EA SilentlyContinue; if($p){"$($p.Name)|$($p.MainWindowTitle)"}else{"idle|"}`;
        exec(
          `powershell -NonInteractive -NoProfile -Command "${oneShot.replace(/"/g, '\\"')}"`,
          { timeout: 4000, windowsHide: true },
          (err, out) => {
            if (err || !out?.trim() || out.trim().startsWith('idle')) { resolve(null); return; }
            const sep = out.trim().indexOf('|');
            const app = sep >= 0 ? out.trim().slice(0, sep).trim() : out.trim();
            const title = sep >= 0 ? out.trim().slice(sep + 1).trim() : '';
            resolve(app ? { appName: app, title } : null);
          }
        );
      }
    });
  }

  _macActive() {
    return new Promise((resolve) => {
      // Primary: `path to frontmost application` works WITHOUT Accessibility permissions
      // on all macOS versions including Catalina+
      exec(
        `osascript -e 'POSIX path of (path to frontmost application)'`,
        { timeout: 2500 },
        (err, out) => {
          if (!err && out?.trim()) {
            // Path looks like /Applications/Google Chrome.app/ — extract the name
            const parts   = out.trim().replace(/\/$/, '').split('/').filter(Boolean);
            const appEntry = parts.find(p => p.endsWith('.app')) || parts[parts.length - 1] || '';
            const appName  = appEntry.replace(/\.app$/, '') || 'Unknown';

            // Try to grab the window title without System Events (best-effort, no permission needed)
            exec(
              `osascript -e 'tell application "${appName}" to get name of front window' 2>/dev/null`,
              { timeout: 1200 },
              (_, titleOut) => {
                resolve({ appName, title: titleOut?.trim() || '' });
              }
            );
            return;
          }

          // Fallback: System Events (requires Accessibility permission but catches edge cases)
          exec(
            `osascript -e 'tell application "System Events" to get name of first application process whose frontmost is true'`,
            { timeout: 2000 },
            (err2, out2) => {
              if (!err2 && out2?.trim()) {
                resolve({ appName: out2.trim(), title: '' });
              } else {
                resolve(null);
              }
            }
          );
        }
      );
    });
  }

  _linuxActive() {
    return new Promise((resolve) => {
      exec('xdotool getactivewindow getwindowname 2>/dev/null', { timeout: 2000 }, (err, out) => {
        if (err || !out?.trim()) { resolve(null); return; }
        resolve({ appName: 'Unknown', title: out.trim() });
      });
    });
  }
}

module.exports = { AutoTracker };
