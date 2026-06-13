/**
 * Flow Ledger — content script
 *
 * Injected into every page. Asks the background for the current focus mode
 * state and renders a subtle indicator bar at the top of the page when active.
 * Listens for real-time focus mode change broadcasts from the background.
 */

let indicatorBar = null;

function mountIndicator() {
  if (indicatorBar) return;

  indicatorBar = document.createElement('div');
  indicatorBar.id = 'flow-ledger-indicator';
  Object.assign(indicatorBar.style, {
    position:   'fixed',
    top:        '0',
    left:       '0',
    right:      '0',
    height:     '3px',
    background: 'linear-gradient(90deg, #7c3aed, #2f81f7)',
    zIndex:     '2147483647',
    pointerEvents: 'none',
    opacity:    '1',
    transition: 'opacity 0.4s ease',
  });

  // Append to <html> rather than <body> so it works even on bare-bones pages
  (document.body || document.documentElement).appendChild(indicatorBar);
}

function unmountIndicator() {
  if (!indicatorBar) return;
  indicatorBar.style.opacity = '0';
  setTimeout(() => {
    indicatorBar?.remove();
    indicatorBar = null;
  }, 400);
}

function applyFocusMode(active) {
  if (active) mountIndicator();
  else unmountIndicator();
}

// Ask the background for the current state when the page loads
chrome.runtime.sendMessage({ type: 'getStatus' }, (res) => {
  if (chrome.runtime.lastError) return; // background not ready yet — ignore
  applyFocusMode(res?.focusModeActive ?? false);
});

// React to live focus mode toggles without needing a page reload
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'focusModeChanged') {
    applyFocusMode(msg.active);
  }
});
