import { useState, useEffect } from 'react';

export const FL_PREFS_KEY = 'fl_prefs';

export const DEFAULT_PREFS = {
  // General › Appearance
  themeMode: 'dark',
  accentColor: '#7c6cf2',
  density: 'comfortable',
  reduceMotion: false,
  // General › Window
  minimizeToTray: true,
  closeToTray: false,
  // General › Date & Time
  timeFormat: '12h',
  dateFormat: 'MMM D',
  weekStart: 'mon',
  // General › Interface
  sidebarBehavior: 'manual',
  sidebarMotion: true,
  rememberLastPage: true,
  // Tracking › Idle
  autoPauseOnIdle: true,
  autoResume: false,
  minSessionDuration: 30,
  // Tracking › Exclusions
  appBlacklist: [],
  websiteBlacklist: [],
  privateModeApps: [],
  // Tracking › Focus Intelligence
  focusScoringEnabled: true,
  deepWorkThreshold: 45,
  distractionSensitivity: 'medium',
  contextSwitchSensitivity: 'medium',
  focusBlockDetection: true,
  productivityMapping: true,
  // Calendar
  calSyncFrequency: 'manual',
  autoCreateFocusEvents: false,
  mergeSessionsToCalendar: false,
  calDefaultView: 'week',
  timezone: 'auto',
  calStickyHeader: true,
  calEventStacking: true,
  // Focus Sessions
  focusDuration: 25,
  shortBreakDuration: 5,
  longBreakDuration: 15,
  longBreakInterval: 4,
  autoStartFocusMode: false,
  dockPosition: 'bottom-center',
  dockCompact: false,
  pomodoroMode: false,
  smartNudges: true,
  focusReminders: true,
  // Notifications
  desktopNotifications: true,
  notifSound: true,
  dailySummary: true,
  dailySummaryTime: '18:00',
  focusAlerts: true,
  breakReminders: true,
  meetingReminders: true,
  // Shortcuts
  shortcutStartStop: 'Ctrl+Shift+T',
  shortcutFocusMode: 'Ctrl+Shift+F',
  shortcutPalette: 'Ctrl+K',
  shortcutQuickCapture: 'Ctrl+Shift+N',
};

export function readPrefs() {
  try {
    const stored = JSON.parse(localStorage.getItem(FL_PREFS_KEY) || '{}');
    return { ...DEFAULT_PREFS, ...stored };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

/**
 * usePrefs — subscribes to fl_prefs changes from both:
 *   - same-tab updates (custom 'fl-prefs-change' event, dispatched by SettingsPage)
 *   - cross-tab updates (native 'storage' event)
 *
 * Returns the merged prefs object (DEFAULT_PREFS + stored overrides).
 */
export function usePrefs() {
  const [prefs, setPrefs] = useState(readPrefs);

  useEffect(() => {
    const refresh = () => setPrefs(readPrefs());

    // Same-tab: SettingsPage dispatches this after writing to localStorage
    window.addEventListener('fl-prefs-change', refresh);
    // Cross-tab: native storage event
    window.addEventListener('storage', (e) => {
      if (e.key === FL_PREFS_KEY) refresh();
    });

    return () => {
      window.removeEventListener('fl-prefs-change', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  return prefs;
}
