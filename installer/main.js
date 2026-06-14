const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path  = require('path');
const fs    = require('fs');
const os    = require('os');
const { exec, execSync } = require('child_process');

const APP_NAME    = 'Flow Ledger';
const APP_VERSION = '2.0.0';

let win;
let finalInstallDir = '';

// ─── Window ───────────────────────────────────────────────────────────────────
function createWindow() {
  win = new BrowserWindow({
    width:           480,
    height:          620,
    resizable:       false,
    maximizable:     false,
    frame:           false,
    transparent:     true,
    center:          true,
    titleBarStyle:   'hidden',
    backgroundColor: '#00000000',
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      nodeIntegration:  false,
      contextIsolation: true,
    },
    show: false,
  });

  win.loadFile(path.join(__dirname, 'index.html'));
  win.once('ready-to-show', () => win.show());
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());

// ─── Window controls ──────────────────────────────────────────────────────────
ipcMain.on('win:close',    () => win?.close());
ipcMain.on('win:minimize', () => win?.minimize());

// ─── Default install directory ────────────────────────────────────────────────
ipcMain.handle('installer:get-default-dir', () =>
  path.join(os.homedir(), 'AppData', 'Local', 'Programs', APP_NAME)
);

// ─── Browse for install directory ─────────────────────────────────────────────
ipcMain.handle('installer:browse', async () => {
  const defaultPath = path.join(os.homedir(), 'AppData', 'Local', 'Programs');
  const result = await dialog.showOpenDialog(win, {
    title:       'Choose Installation Location',
    properties:  ['openDirectory', 'createDirectory'],
    defaultPath,
  });
  return result.canceled ? null : result.filePaths[0];
});

// ─── Disk info ────────────────────────────────────────────────────────────────
ipcMain.handle('installer:disk-info', async (_, targetPath) => {
  try {
    const drive  = (targetPath || 'C:').split(':')[0].toUpperCase() + ':';
    // Use PowerShell — wmic is deprecated/removed on Windows 11
    const output = execSync(
      `powershell -NoProfile -NonInteractive -Command "` +
      `(Get-PSDrive -Name ${drive.replace(':', '')} -PSProvider FileSystem).Free"`,
      { encoding: 'utf8', timeout: 5000 }
    );
    const freeBytes = parseInt(output.trim()) || 0;
    const freeGB   = (freeBytes / 1024 ** 3).toFixed(1);
    return { freeGB, freeBytes };
  } catch {
    return { freeGB: '—', freeBytes: 0 };
  }
});

// ─── Installation ─────────────────────────────────────────────────────────────
ipcMain.handle('installer:install', async (_, { installDir }) => {
  const targetDir = installDir;  // installDir is the final destination (already includes app name)
  finalInstallDir = targetDir;

  try {
    const steps = [
      { label: 'Creating installation directory…',  progress: 8  },
      { label: 'Copying application files…',        progress: 30 },
      { label: 'Extracting runtime components…',    progress: 55 },
      { label: 'Registering file associations…',    progress: 70 },
      { label: 'Creating shortcuts…',               progress: 82 },
      { label: 'Registering application…',          progress: 92 },
      { label: 'Finalizing installation…',          progress: 100 },
    ];

    // ── Step 0: Create target directory ──────────────────────────────────────
    emit(steps[0]);
    fs.mkdirSync(targetDir, { recursive: true });
    await sleep(400);

    // ── Step 1-2: Copy bundled app files ─────────────────────────────────────
    emit(steps[1]);
    const bundleSrc = app.isPackaged
      ? path.join(process.resourcesPath, 'app-bundle')
      : path.join(__dirname, '..', 'dist', 'win-unpacked');

    if (fs.existsSync(bundleSrc)) {
      await roboCopy(bundleSrc, targetDir, (pct) => {
        const mapped = steps[1].progress + Math.round((pct / 100) * (steps[2].progress - steps[1].progress));
        win?.webContents.send('installer:progress', { label: steps[1].label, progress: mapped });
      });
    } else {
      // dev / no bundle — simulate
      await sleep(900);
    }

    emit(steps[2]);
    await sleep(500);

    // ── Step 3: File association placeholder ─────────────────────────────────
    emit(steps[3]);
    await sleep(350);

    // ── Step 4: Shortcuts ─────────────────────────────────────────────────────
    emit(steps[4]);
    const exePath = path.join(targetDir, `${APP_NAME}.exe`);
    if (fs.existsSync(exePath)) {
      // Use app.getPath() so OneDrive-redirected Desktop/AppData are resolved correctly
      const desktopLnk = path.join(app.getPath('desktop'), `${APP_NAME}.lnk`);
      const startDir   = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', APP_NAME);
      fs.mkdirSync(startDir, { recursive: true });
      createShortcut(exePath, desktopLnk, targetDir);
      createShortcut(exePath, path.join(startDir, `${APP_NAME}.lnk`), targetDir);
    }
    await sleep(300);

    // ── Step 5: Registry ──────────────────────────────────────────────────────
    emit(steps[5]);
    await registerProgram(targetDir, exePath);
    await sleep(300);

    // ── Done ──────────────────────────────────────────────────────────────────
    emit(steps[6]);
    await sleep(500);

    return { success: true, installDir: targetDir };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ─── Launch ───────────────────────────────────────────────────────────────────
ipcMain.on('installer:launch', (_, dir) => {
  const exePath = path.join(dir || finalInstallDir, `${APP_NAME}.exe`);
  if (fs.existsSync(exePath)) shell.openPath(exePath);
  else shell.openPath(dir || finalInstallDir);
  setTimeout(() => app.quit(), 500);
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function emit(step) {
  win?.webContents.send('installer:progress', step);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function roboCopy(src, dest, onProgress) {
  return new Promise((resolve, reject) => {
    // /E   = copy subdirs incl. empty
    // /R:1 = retry once on failure (default is 1M retries — would hang forever)
    // /W:1 = wait 1s between retries
    // /NJH /NJS = no job header/summary
    // /NC /NS   = no class/size columns (keep filename lines for progress counting)
    const proc = exec(
      `robocopy "${src}" "${dest}" /E /R:1 /W:1 /NJH /NJS /NC /NS`,
      { maxBuffer: 128 * 1024 * 1024 }
    );

    let filesDone = 0;
    proc.stdout?.on('data', (chunk) => {
      const lines = chunk.split('\n').filter(l => l.trim());
      filesDone += lines.length;
      // Electron win-unpacked is ~1500 files — cap estimate at 99%
      const pct = Math.min(99, Math.round((filesDone / 1500) * 100));
      onProgress(pct);
    });

    proc.on('close', (code) => {
      // robocopy exit codes 0–7 are all success variants; 8+ = error
      if (code !== null && code <= 7) resolve();
      else reject(new Error(`File copy failed (robocopy exit ${code})`));
    });

    proc.on('error', (err) => reject(new Error(`robocopy could not start: ${err.message}`)));
  });
}

function createShortcut(target, linkPath, workDir) {
  const script = [
    `$ErrorActionPreference = 'Stop'`,
    `$ws = New-Object -ComObject WScript.Shell`,
    `$sc = $ws.CreateShortcut('${linkPath.replace(/'/g, "''")}')`,
    `$sc.TargetPath = '${target.replace(/'/g, "''")}'`,
    `$sc.WorkingDirectory = '${workDir.replace(/'/g, "''")}'`,
    `$sc.Description = 'Flow Ledger - Personal Productivity Tracker'`,
    `$sc.Save()`,
  ].join('\r\n');
  const tmp = path.join(os.tmpdir(), `fl-sc-${Date.now()}.ps1`);
  fs.writeFileSync(tmp, script, 'utf16le');  // PowerShell reads UTF-16 LE reliably
  try {
    execSync(
      `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${tmp}"`,
      { timeout: 12000, stdio: 'pipe' }
    );
  } catch (err) {
    // Non-fatal: shortcut failure shouldn't abort install
    console.warn('Shortcut creation warning:', err.message);
  } finally {
    try { fs.unlinkSync(tmp); } catch {}
  }
}

function registerProgram(installDir, exePath) {
  const key  = `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\FlowLedger`;
  const rows = [
    ['DisplayName',    'REG_SZ',    APP_NAME],
    ['DisplayVersion', 'REG_SZ',    APP_VERSION],
    ['Publisher',      'REG_SZ',    'Flow Ledger'],
    ['InstallLocation','REG_SZ',    installDir],
    ['DisplayIcon',    'REG_SZ',    exePath],
    ['EstimatedSize',  'REG_DWORD', '148480'],
    ['NoModify',       'REG_DWORD', '1'],
    ['NoRepair',       'REG_DWORD', '1'],
  ];
  for (const [name, type, val] of rows) {
    try {
      execSync(`reg add "${key}" /v "${name}" /t ${type} /d "${val}" /f`, {
        timeout: 8000, stdio: 'pipe'
      });
    } catch (err) {
      throw new Error(`Registry write failed [${name}]: ${err.message}`);
    }
  }
}
