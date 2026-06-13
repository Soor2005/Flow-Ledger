/**
 * Flow Ledger — Chrome Extension Background Service Worker
 *
 * MV3 service workers are killed after ~30 s of inactivity and restarted on
 * the next event. All mutable state is therefore stored in
 * chrome.storage.session (survives SW restarts within the same browser session)
 * and restored at the top of every event handler via restoreState().
 *
 * Timers use chrome.alarms (reliable across SW restarts) instead of
 * setInterval (wiped on every restart).
 */

const API_BASE    = 'http://localhost:27314';
const ALARM_NAME  = 'fl-tick';
const ALARM_MINS  = 0.5; // 30 s — minimum allowed for packed extensions

// ── In-memory state (always sync'd with session storage) ──────────────────
let focusModeActive = false;
let blockedPatterns = []; // plain hostnames, e.g. ["twitter.com","reddit.com"]
let currentTab      = null; // { id, url, title }
let tabStartTime    = null; // Date.now() ms when we started tracking current tab
let lastBlockedUrl  = null; // guard against redirect loops
let lastStatusKey   = '';   // detects real changes in focus/blocked list

// ── Session storage helpers ───────────────────────────────────────────────
const SESSION_KEY = 'fl_bg_state';

async function restoreState() {
  try {
    const result = await chrome.storage.session.get(SESSION_KEY);
    const s = result[SESSION_KEY];
    if (!s) return;
    focusModeActive = s.focusModeActive ?? false;
    blockedPatterns = s.blockedPatterns ?? [];
    currentTab      = s.currentTab      ?? null;
    tabStartTime    = s.tabStartTime    ?? null;
    lastBlockedUrl  = s.lastBlockedUrl  ?? null;
    lastStatusKey   = s.lastStatusKey   ?? '';
  } catch { /* storage unavailable */ }
}

async function persistState() {
  try {
    await chrome.storage.session.set({
      [SESSION_KEY]: {
        focusModeActive,
        blockedPatterns,
        currentTab,
        tabStartTime,
        lastBlockedUrl,
        lastStatusKey,
      },
    });
  } catch { /* storage unavailable */ }
}

// ── Badge ─────────────────────────────────────────────────────────────────
function updateBadge() {
  chrome.action.setBadgeText({ text: focusModeActive ? 'ON' : '' });
  chrome.action.setBadgeBackgroundColor({ color: '#7c3aed' });
}

// ── URL helpers ───────────────────────────────────────────────────────────
function isInternalUrl(url) {
  if (!url) return true;
  return (
    url.startsWith('chrome://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('about:') ||
    url.startsWith('data:') ||
    url.includes('blocked.html')
  );
}

function isUrlBlocked(url) {
  if (!focusModeActive || !url || !blockedPatterns.length || isInternalUrl(url)) return false;
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return blockedPatterns.some(p => hostname === p || hostname.endsWith('.' + p));
  } catch {
    return false;
  }
}

function blockedRedirectUrl(originalUrl) {
  return chrome.runtime.getURL(`blocked.html?url=${encodeURIComponent(originalUrl)}`);
}

// ── Browser name (available in SW via navigator) ──────────────────────────
function getBrowserName() {
  try {
    const ua = navigator.userAgent;
    if (ua.includes('Edg/'))     return 'Microsoft Edge';
    if (ua.includes('OPR/'))     return 'Opera';
    if (ua.includes('Brave'))    return 'Brave';
    if (ua.includes('Firefox/')) return 'Firefox';
  } catch { /* userAgent not available */ }
  return 'Google Chrome';
}

// ── Status polling ────────────────────────────────────────────────────────
async function pollStatus() {
  try {
    const res = await fetch(`${API_BASE}/status`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return;
    const data = await res.json();

    const newPatterns = (data.blockedSites ?? []).map(s => s.toLowerCase().trim()).filter(Boolean);
    const newKey      = `${data.focusMode ? '1' : '0'}:${newPatterns.slice().sort().join(',')}`;
    const changed     = newKey !== lastStatusKey;

    if (changed) {
      lastStatusKey   = newKey;
      lastBlockedUrl  = null; // reset block-loop guard on any real status change
    }

    const prevFocus   = focusModeActive;
    focusModeActive   = data.focusMode ?? false;
    blockedPatterns   = newPatterns;

    updateBadge();
    await persistState();

    // Broadcast focus mode change to all content scripts
    if (prevFocus !== focusModeActive) {
      broadcastFocusMode();
    }

    // Re-check current tab in case it just became blocked/unblocked
    if (currentTab && changed) {
      await checkAndBlockTab(currentTab.id, currentTab.url);
    }
  } catch {
    // Desktop app not running — silently ignore
  }
}

function broadcastFocusMode() {
  chrome.tabs.query({}).then(tabs => {
    for (const tab of tabs) {
      chrome.tabs.sendMessage(tab.id, { type: 'focusModeChanged', active: focusModeActive })
        .catch(() => {});
    }
  }).catch(() => {});
}

// ── Blocking ──────────────────────────────────────────────────────────────
async function checkAndBlockTab(tabId, url) {
  if (!url || isInternalUrl(url)) return;
  if (!isUrlBlocked(url)) return;
  if (url === lastBlockedUrl) return; // already redirected this URL

  lastBlockedUrl = url;
  await persistState();

  chrome.tabs.update(tabId, { url: blockedRedirectUrl(url) }).catch(() => {});
  await reportBlocked(url);
  showBlockNotification(url);
}

function showBlockNotification(url) {
  try {
    const host = new URL(url).hostname;
    chrome.notifications.create(`fl-blocked-${Date.now()}`, {
      type:     'basic',
      iconUrl:  'icon48.png',
      title:    'Site Blocked — Flow Ledger',
      message:  `${host} is blocked during Focus Mode. Stay on track!`,
      priority: 1,
    });
  } catch { /* URL parse error */ }
}

// ── Activity reporting ────────────────────────────────────────────────────
async function reportActivity(url, title, durationMs) {
  if (!url || isInternalUrl(url)) return;
  const durationSecs = Math.floor(durationMs / 1000);
  if (durationSecs < 2) return;

  try {
    await fetch(`${API_BASE}/activity`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        title:     title || '',
        appName:   getBrowserName(),
        duration:  durationSecs,
        timestamp: Date.now(),
      }),
      signal: AbortSignal.timeout(3000),
    });
  } catch { /* desktop app not running */ }
}

async function reportBlocked(url) {
  try {
    await fetch(`${API_BASE}/blocked`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ url, timestamp: Date.now() }),
      signal:  AbortSignal.timeout(3000),
    });
  } catch { /* desktop app not running */ }
}

// ── Tab lifecycle ─────────────────────────────────────────────────────────
async function onTabFocused(tab) {
  if (!tab) return;

  // Flush time accumulated on the previous tab
  if (currentTab && tabStartTime) {
    const elapsed = Date.now() - tabStartTime;
    if (elapsed >= 2000) {
      await reportActivity(currentTab.url, currentTab.title, elapsed);
    }
  }

  // Only track real web pages
  const isTrackable = tab.url && !isInternalUrl(tab.url);

  currentTab     = isTrackable ? { id: tab.id, url: tab.url, title: tab.title || '' } : null;
  tabStartTime   = isTrackable ? Date.now() : null;
  lastBlockedUrl = null;
  await persistState();

  if (isTrackable) {
    await checkAndBlockTab(tab.id, tab.url);
  }
}

// Flush current tab activity without changing tabs (called by alarm and window-blur)
async function flushCurrentTab(resetTimer = true) {
  if (!currentTab || !tabStartTime) return;
  const elapsed = Date.now() - tabStartTime;
  if (elapsed >= 2000) {
    await reportActivity(currentTab.url, currentTab.title, elapsed);
  }
  if (resetTimer) {
    tabStartTime = Date.now();
    await persistState();
  } else {
    tabStartTime = null;
    await persistState();
  }
}

async function getActiveTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab || null;
  } catch {
    return null;
  }
}

// ── Event listeners ───────────────────────────────────────────────────────

// User switches to a different tab
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  await restoreState();
  try {
    const tab = await chrome.tabs.get(tabId);
    await onTabFocused(tab);
  } catch { /* tab may have been closed */ }
});

// Navigation completes within a tab (URL may have changed)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  await restoreState();
  try {
    const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (active?.id === tabId) {
      await onTabFocused(tab);
    }
  } catch { /* ignore */ }
});

// User switches browser window focus (Chrome loses / gains focus)
chrome.windows.onFocusChanged.addListener(async (windowId) => {
  await restoreState();
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    // Chrome lost OS focus — flush current tab but don't reset timer
    await flushCurrentTab(false);
    return;
  }
  // Chrome gained OS focus — start tracking active tab
  const tab = await getActiveTab();
  if (tab) await onTabFocused(tab);
});

// Navigation committed in the main frame — catch SPA navigations and redirects
chrome.webNavigation.onCommitted.addListener(async (details) => {
  if (details.frameId !== 0) return;
  if (isInternalUrl(details.url)) return;
  await restoreState();

  // Update tracked URL if this is the active tab
  if (currentTab && currentTab.id === details.tabId && currentTab.url !== details.url) {
    // Flush time on old URL
    if (tabStartTime) {
      const elapsed = Date.now() - tabStartTime;
      if (elapsed >= 2000) await reportActivity(currentTab.url, currentTab.title, elapsed);
    }
    currentTab.url = details.url;
    tabStartTime   = Date.now();
    lastBlockedUrl = null;
    await persistState();
  }

  await checkAndBlockTab(details.tabId, details.url);
});

// Alarm tick — runs every 30 s to poll status and flush activity
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) return;
  await restoreState();
  await pollStatus();
  await flushCurrentTab(true); // report activity so far, then reset window
});

// Messages from popup and content scripts
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'getStatus') {
    sendResponse({ focusModeActive, blockedPatterns, currentTab });
  }
  return true; // keep channel open for async sendResponse
});

// ── Init ──────────────────────────────────────────────────────────────────
async function init() {
  await restoreState();

  // Recreate alarm (idempotent — Chrome deduplicates by name)
  await chrome.alarms.create(ALARM_NAME, { periodInMinutes: ALARM_MINS });

  // Fetch fresh status immediately
  await pollStatus();

  // Seed current tab if we don't already have one (e.g. fresh install)
  if (!currentTab) {
    const tab = await getActiveTab();
    if (tab && tab.url && !isInternalUrl(tab.url)) {
      currentTab   = { id: tab.id, url: tab.url, title: tab.title || '' };
      tabStartTime = Date.now();
      await persistState();
    }
  }

  updateBadge();
}

chrome.runtime.onInstalled.addListener(init);
chrome.runtime.onStartup.addListener(init);
init();
