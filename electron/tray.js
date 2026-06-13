/**
 * System Tray — "set & forget" background presence
 * Keeps Flow Ledger alive in the background even when the main window is closed.
 */

const { Tray, Menu, nativeImage, app } = require('electron');
let tray = null;

function createTray(mainWindow, { iconPath, getActiveSession, stopSession, openWindow }) {
  // Use a simple 16×16 PNG. In production you'd ship a real icon.
  // For now use a transparent 1×1 placeholder — Electron handles missing icons gracefully.
  let icon;
  try {
    const fs = require('fs');
    if (iconPath && fs.existsSync(iconPath)) {
      icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
    } else {
      // Create a minimal 16x16 icon programmatically
      icon = nativeImage.createEmpty();
    }
  } catch {
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);
  tray.setToolTip('Flow Ledger — Productivity Tracker');

  const rebuildMenu = () => {
    const session = getActiveSession?.();
    const sessionItems = session
      ? [
          { label: `🔴 Recording: ${session.category}`, enabled: false },
          { label: 'Stop Session', click: () => stopSession?.() },
          { type: 'separator' },
        ]
      : [
          { label: 'No active session', enabled: false },
          { type: 'separator' },
        ];

    const contextMenu = Menu.buildFromTemplate([
      { label: 'Flow Ledger', enabled: false },
      { type: 'separator' },
      ...sessionItems,
      {
        label: 'Open Flow Ledger',
        click: () => {
          openWindow?.();
          mainWindow?.show();
          mainWindow?.focus();
        },
      },
      {
        label: 'Start on Login',
        type: 'checkbox',
        checked: app.getLoginItemSettings().openAtLogin,
        click: (item) => {
          app.setLoginItemSettings({ openAtLogin: item.checked });
        },
      },
      { type: 'separator' },
      {
        label: 'Quit Flow Ledger',
        click: () => app.quit(),
      },
    ]);

    tray.setContextMenu(contextMenu);
  };

  rebuildMenu();

  // Left-click → show window
  tray.on('click', () => {
    mainWindow?.show();
    mainWindow?.focus();
    openWindow?.();
  });

  // Rebuild menu every 30s so session timer info stays fresh
  setInterval(rebuildMenu, 30000);

  return { tray, rebuildMenu };
}

function destroyTray() {
  tray?.destroy();
  tray = null;
}

module.exports = { createTray, destroyTray };
