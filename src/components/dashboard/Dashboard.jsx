import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Calendar, Timer, Settings, LogOut,
  Briefcase, FileText, Cpu, Zap, Users, TrendingUp, Hash, Shield,
  Music, Command, Flame, Search, Sun, Moon, Star, Home, Bell,
  ChevronDown, BarChart2, Download, ArrowDown, PanelLeftClose, PanelLeftOpen,
  Receipt,
} from 'lucide-react';
import { useAuth } from '../../App';
import { usePrefs } from '../../hooks/usePrefs';
import { useUpdater } from '../shared/UpdateManager';
import { applyAccentColor, setGlobalTimeFormat, setGlobalDateFormat } from '../../utils/helpers';

import CalendarView from '../calendar/CalendarView';
import TimerPage from '../timer/TimerPage';
import ActivityPage from '../activity/ActivityPage';
import ProjectsPage from '../projects/ProjectsPage';
import ClientsPage from '../clients/ClientsPage';
import InvoicesPage from '../invoices/InvoicesPage';
import TasksPage from '../tasks/TasksPage';
import ReportsPage from '../reports/ReportsPage';
import ProjectAnalyticsPage from '../reports/ProjectAnalyticsPage';
import HeatmapPage from '../heatmap/HeatmapPage';
import ProfitabilityPage from '../profitability/ProfitabilityPage';
import ProductivityPage from '../productivity/ProductivityPage';
import DistractionBlocker from '../blocker/DistractionBlocker';
import SettingsPage from './SettingsPage';
import HomePage from '../home/HomePage';

import BreakReminder from '../shared/BreakReminder';
import FocusMusic from '../shared/FocusMusic';
import PageTransition from '../shared/PageTransition';
import FocusSessionDock from '../shared/FocusSessionDock';
import { isMac as IS_MAC_TB, MacControls as TrafficLights, WinControls } from '../shared/TitleBar';
import ProductivityScoreWidget from '../shared/ProductivityScoreWidget';
import ActivitySnapshotButton from '../shared/ActivitySnapshotButton';
import DailyDebrief from '../shared/DailyDebrief';
import CommandPalette, { pushRecentPage } from '../shared/CommandPalette';
import NotificationCentre, { pushNotification, pushToast, ToastStack, NotificationBell, onNotificationsChanged } from '../shared/NotificationCentre';
import OnboardingWizard, { shouldShowOnboarding } from '../shared/OnboardingWizard';
import SetupWizard from '../onboarding/SetupWizard';
import { shouldShowSetup } from '../onboarding/setupGuard';
import logoSrc from '../../assets/logo.png';
import { analyzeContext } from '../../ai/engines/eventContextAnalyzer.js';
import { generateTitle, generateDescription } from '../../ai/engines/eventWritingEngine.js';

const api = window.electron || {};

// ─── AI session-end notification builder ───────────────────────────────────
// Title   → the event title (AI-generated or user-set).
// Body    → a STAT SUMMARY that is always distinct from the title:
//           duration · category · deep focus badge · project
// The body NEVER re-describes the title to avoid "Exploring Research Session /
// Researched Research Session." duplication.
function buildSessionEndNotif(session, durationSecs) {
  // Duration label
  const h = Math.floor(durationSecs / 3600);
  const m = Math.round((durationSecs % 3600) / 60);
  const durLabel = h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${Math.max(1, m)}m`;

  // Category label — human-readable
  const CAT_LABELS = {
    development: 'Development', coding: 'Development', research: 'Research',
    design: 'Design', writing: 'Writing', planning: 'Planning',
    meeting: 'Meeting', communication: 'Communication', learning: 'Learning',
    data: 'Data & Analytics', admin: 'Admin', focus: 'Focus', break: 'Break',
  };
  const rawCat  = (session.category || '').toLowerCase();
  const catLabel = CAT_LABELS[rawCat] || (session.category
    ? session.category.charAt(0).toUpperCase() + session.category.slice(1)
    : 'Session');

  // Stat summary pills — never echoes the event title
  const parts = [durLabel, catLabel];
  if (session.is_deep_work) parts.push('Deep focus');
  if (session.project_name) parts.push(session.project_name);
  const body = parts.join(' · ');

  // Decide the notification title:
  //   - Use existing meaningful user title if set
  //   - Skip AI generation for "Auto: X" sessions — use a clean app-name label instead
  //   - Otherwise run the AI title generator for context-aware name
  let notifTitle;
  try {
    const isAutoSession = (session.title || '').toLowerCase().startsWith('auto:');
    if (isAutoSession) {
      // "Auto: claude" → "Claude — auto-tracked"
      const appName = (session.title || '').replace(/^auto:\s*/i, '').trim();
      notifTitle = appName
        ? `${appName.charAt(0).toUpperCase() + appName.slice(1)} — auto-tracked`
        : 'Auto-tracked session';
    } else if (session.title && !['session', 'focus session', 'focus block', 'untitled'].includes(session.title.toLowerCase())) {
      // User already set a meaningful title — use it directly
      notifTitle = session.title;
    } else {
      // Run AI title generation (uses category + project context)
      const context = analyzeContext({
        autoSessions: [],
        session: { ...session, duration_seconds: durationSecs },
        durationMins: Math.round(durationSecs / 60),
      });
      const titleResult = generateTitle(context);
      notifTitle = titleResult.title || session.title || catLabel + ' Session';
    }
  } catch {
    notifTitle = session.title || catLabel + ' Session';
  }

  return { title: notifTitle, description: body, durLabel, durationSecs };
}
const callApi = (name, fallback, payload) => {
  const fn = api[name];
  return typeof fn === 'function' ? fn(payload) : Promise.resolve(fallback);
};

// Parse a shortcut string like "Ctrl+Shift+K" and test it against a KeyboardEvent.
// Ctrl maps to ctrlKey|metaKey so Mac Cmd and Win/Linux Ctrl both work.
function matchesShortcut(e, shortcut = '') {
  const parts     = shortcut.toLowerCase().split('+').map(s => s.trim());
  const key       = parts.at(-1);
  const needCtrl  = parts.includes('ctrl');
  const needShift = parts.includes('shift');
  const needAlt   = parts.includes('alt');
  return (
    !!(needCtrl  ? (e.ctrlKey || e.metaKey) : !(e.ctrlKey || e.metaKey)) &&
    !!(needShift ? e.shiftKey : !e.shiftKey) &&
    !!(needAlt   ? e.altKey   : !e.altKey) &&
    e.key.toLowerCase() === key
  );
}

const SIDEBAR_WIDTH = 262;
const SIDEBAR_COLLAPSED_WIDTH = 86;

const NAV_GROUPS = [
  {
    id: 'home',
    label: 'Home',
    items: [
      { id: 'home', label: 'Home', Icon: Home },
    ],
  },
  {
    id: 'track',
    label: 'Track',
    items: [
      { id: 'calendar', label: 'Calendar', Icon: Calendar },
      { id: 'tracker', label: 'Timer', Icon: Timer },
      { id: 'activity', label: 'Activity', Icon: Cpu },
    ],
  },
  {
    id: 'work',
    label: 'Work',
    items: [
      { id: 'projects', label: 'Projects', Icon: Briefcase },
      { id: 'clients', label: 'Clients', Icon: Users },
      { id: 'invoices', label: 'Invoices', Icon: Receipt },
      { id: 'tasks', label: 'Tasks', Icon: Hash },
    ],
  },
  {
    id: 'insights',
    label: 'Insights',
    items: [
      { id: 'reports',   label: 'Reports',    Icon: FileText   },
      { id: 'analytics', label: 'Analytics',  Icon: BarChart2  },
      { id: 'heatmap',   label: 'Heatmap',    Icon: Flame      },
      { id: 'profitability', label: 'Profitability', Icon: TrendingUp },
      { id: 'productivity',  label: 'Productivity',  Icon: Zap        },
    ],
  },
  {
    id: 'tools',
    label: 'Tools',
    items: [
      { id: 'blocker', label: 'Focus Blocker', Icon: Shield },
    ],
  },
];

function CollapsedTooltip({ label, children }) {
  return (
    <div className="relative flex w-full justify-center" aria-label={label}>
      {children}
      <span
        className="pointer-events-none absolute left-full top-1/2 z-30 ml-3 -translate-y-1/2 whitespace-nowrap rounded-[10px] px-2.5 py-1.5 text-[11px] font-semibold opacity-0 shadow-[0_18px_40px_rgba(0,0,0,0.35)] transition-all duration-200 group-hover:translate-x-1 group-hover:opacity-100"
        style={{
          background: 'rgba(13,17,28,0.96)',
          border: '1px solid rgba(255,255,255,0.08)',
          color: '#e7eefc',
          backdropFilter: 'blur(18px)',
          WebkitBackdropFilter: 'blur(18px)',
        }}
      >
        {label}
      </span>
    </div>
  );
}

function NavItem({ label, Icon, isActive, onClick, collapsed, badge, compactCollapsed = false }) {
  const collapsedButtonSize = compactCollapsed ? 'h-10 w-10 rounded-xl' : 'h-12 w-12 rounded-[14px]';
  const collapsedIconFrame = compactCollapsed ? 'h-4 w-4' : 'h-[18px] w-[18px]';
  const collapsedIconSize = compactCollapsed ? 16 : 18;
  const collapsedBadgePosition = compactCollapsed ? 'right-[7px] top-[7px]' : 'right-[9px] top-[9px]';

  const button = (
    <button
      onClick={onClick}
      aria-label={collapsed ? label : undefined}
      className={`
        nav-item group/ni relative flex select-none items-center overflow-hidden
        text-left outline-none transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]
        ${isActive ? 'nav-active' : ''}
        ${collapsed ? `mx-auto justify-center px-0 ${collapsedButtonSize}` : 'w-full justify-start gap-3 rounded-[14px] px-3 py-3 pl-4'}
      `}
      style={{
        background: isActive
          ? 'linear-gradient(135deg, rgba(124,92,255,0.22) 0%, rgba(107,78,242,0.14) 100%)'
          : 'transparent',
        border: `1px solid ${isActive ? 'rgba(124,92,255,0.28)' : 'transparent'}`,
        boxShadow: isActive
          ? '0 8px 24px rgba(124,92,255,0.20), inset 0 1px 0 rgba(255,255,255,0.12), 0 0 0 1px rgba(124,92,255,0.06)'
          : 'none',
        backdropFilter: isActive ? 'blur(8px)' : 'none',
        WebkitBackdropFilter: isActive ? 'blur(8px)' : 'none',
        transition: 'background 200ms ease, border-color 200ms ease, box-shadow 200ms ease',
      }}
    >
      {isActive && (
        <span
          aria-hidden
          className={`absolute left-0 top-1/2 h-[58%] w-[3px] -translate-y-1/2 rounded-r-full ${collapsed ? 'opacity-0' : 'opacity-100'}`}
          style={{ background: 'linear-gradient(180deg, rgba(196,181,253,0.2) 0%, rgba(124,108,242,1) 50%, rgba(96,165,250,0.45) 100%)' }}
        />
      )}
      <span
        aria-hidden
        className={`absolute rounded-[11px] opacity-0 transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] group-hover/ni:opacity-100 ${
          collapsed ? 'inset-[2px]' : 'inset-[1px]'
        }`}
        style={{
          background: isActive
            ? 'rgba(255,255,255,0.04)'
            : 'linear-gradient(135deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.03) 100%)',
          backdropFilter: 'blur(4px)',
        }}
      />

      <span className={`relative flex shrink-0 items-center justify-center transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${collapsed ? collapsedIconFrame : 'h-4 w-4'}`}>
        <Icon
          size={collapsed ? collapsedIconSize : 15}
          strokeWidth={isActive ? 2 : 1.8}
          className={isActive ? 'text-white' : 'text-[#7a8aaa] transition-colors duration-200 group-hover/ni:text-[#d4e0f5]'}
        />
      </span>

      {!collapsed && (
        <span className={`relative min-w-0 flex-1 truncate text-[13px] font-semibold leading-none tracking-[-0.01em] transition-colors duration-200 ${
          isActive ? 'text-white' : 'text-[#a8bacf] group-hover/ni:text-[#dae8ff]'
        }`}>
          {label}
        </span>
      )}

      {badge && (
        <span
          className={`rounded-full bg-status-green pulse-dot transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${collapsed ? `absolute ${collapsedBadgePosition} h-2.5 w-2.5 ring-2 ring-[#0c0f17]` : 'relative ml-auto h-2 w-2'}`}
        />
      )}
    </button>
  );

  return collapsed ? <CollapsedTooltip label={label}>{button}</CollapsedTooltip> : button;
}

// All valid page IDs (for validating stored last-page value)
const ALL_PAGE_IDS = new Set([
  'home', 'calendar', 'tracker', 'activity', 'projects',
  'clients', 'tasks', 'reports', 'analytics', 'heatmap',
  'profitability', 'productivity', 'blocker', 'settings',
]);

export default function Dashboard() {
  const { user, logout, theme, toggleTheme, profile } = useAuth();
  const updater = useUpdater();
  const prefs = usePrefs();
  const [page, setPage] = useState(() => {
    // Restore last visited page on mount if the pref is enabled
    try {
      const p = JSON.parse(localStorage.getItem('fl_prefs') || '{}');
      if (p.rememberLastPage !== false) {
        const last = localStorage.getItem('fl_last_page');
        if (last && ALL_PAGE_IDS.has(last)) return last;
      }
    } catch { /* ignore */ }
    return 'home';
  });
  const [categories, setCategories] = useState([]);
  const [activeSession,    setActiveSession]    = useState(null);
  const [scheduledSession, setScheduledSession] = useState(null);
  const [showBreak, setShowBreak] = useState(false);
  const [showMusic, setShowMusic] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [showNotifs, setShowNotifs] = useState(false);
  const [showSetup,      setShowSetup]      = useState(() => shouldShowSetup());
  const [showOnboarding, setShowOnboarding] = useState(() => !shouldShowSetup() && shouldShowOnboarding());
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('fl_sidebar_collapsed') === 'true'; }
    catch { return false; }
  });
  const [notifCount, setNotifCount] = useState(() => {
    try { return JSON.parse(localStorage.getItem('fl_notifications') || '[]').filter(n => !n.read).length; }
    catch { return 0; }
  });
  const showNotifsRef = useRef(showNotifs);
  useEffect(() => { showNotifsRef.current = showNotifs; }, [showNotifs]);
  // Keep the bell badge live — without this it only reflected whatever the
  // unread count was at mount time, so notifications pushed afterwards (e.g.
  // session-stop, break reminders) silently piled up with no visible signal
  // until the panel happened to be opened for some other reason.
  useEffect(() => {
    const unsub = onNotificationsChanged((list) => {
      setNotifCount(showNotifsRef.current ? 0 : list.filter(n => !n.read).length);
    });
    return unsub;
  }, []);
  const [breakData, setBreakData] = useState({});
  const [showDebrief, setShowDebrief] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef(null);
  // Keep bottom padding for 7 s after session ends so the completion banner
  // doesn't overlap content while it's still visible
  const refreshActive = useCallback(async () => {
    const sess = await api.activeSession?.({ userId: user.id });
    setActiveSession(sess || null);
  }, [user.id]);

  useEffect(() => {
    callApi('listCategories', [], { userId: user.id }).then(setCategories);
    refreshActive();
    // Initial check for a scheduled session that's already in progress at mount
    api.activeScheduledSession?.({ userId: user.id }).then(s => setScheduledSession(s || null)).catch(() => {});
  }, [user.id, refreshActive]);

  // ── Listen for scheduled-session push events from the main process ───────────
  useEffect(() => {
    const unsub = api.onScheduledSession?.((sess) => setScheduledSession(sess || null));
    return () => typeof unsub === 'function' && unsub();
  }, []);

  // ── When a session is stopped externally (e.g. auto-stopped by scheduled session
  // watcher), clear activeSession so the dock and timer page update immediately.
  useEffect(() => {
    const unsub = api.onSessionStopped?.(() => setActiveSession(null));
    return () => typeof unsub === 'function' && unsub();
  }, []);

  // ── Keep dock in sync with auto-focus sessions ─────────────────────────────
  // Auto-tracking sessions are managed by the Electron main-process AF machine
  // and only surfaced as events — they never go through the manual startSession
  // flow so activeSession would otherwise stay null while the tracker records.
  useEffect(() => {
    const unsub = api.onAutoFocusState?.((data) => {
      if (!data) return;
      if (data.reason === 'started' && data.session) {
        // Session object is in the event payload — set it directly to avoid a
        // race-condition with refreshActive querying before the row is committed.
        setActiveSession(data.session);
      } else if (
        data.reason === 'idle' ||
        data.reason === 'user_paused' ||
        data.reason === 'mode_switch'
      ) {
        setActiveSession(null);
      } else if (data.reason === 'user_resumed') {
        // Session may have already been committed — query DB for the live row.
        refreshActive();
      }
    });
    return () => typeof unsub === 'function' && unsub();
  }, [refreshActive]);

  useEffect(() => {
    const cleanup = api.onBreakReminder?.((data) => {
      setBreakData(data || {});
      setShowBreak(true);
    });
    return () => cleanup?.();
  }, []);

  // Keep the main process in sync with the "Desktop notifications" toggle —
  // it lives in renderer localStorage, but break reminders are scheduled and
  // fired from the main process so it can show them even while minimized.
  useEffect(() => {
    api.syncDesktopNotifPref?.({ enabled: prefs.desktopNotifications !== false });
  }, [prefs.desktopNotifications]);

  // One-time notice when the OS doesn't support native notifications at all —
  // break reminders still work, just as the in-app card instead.
  useEffect(() => {
    const cleanup = api.onBreakNotifUnavailable?.(() => {
      pushToast('info', 'Desktop notifications unavailable',
        'Your system doesn’t support native notifications — break reminders will show in-app instead.',
        { priority: 'low' }
      );
    });
    return () => cleanup?.();
  }, []);

  useEffect(() => {
    const handler = (e) => {
      // Command palette — respects the user's configured shortcut (default Ctrl+K)
      if (matchesShortcut(e, prefs.shortcutPalette || 'Ctrl+K')) {
        e.preventDefault();
        setShowPalette(v => !v);
      }
      // Cmd/Ctrl+N  → toggle notification centre (hardcoded system shortcut)
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === 'n') {
        e.preventDefault();
        setShowNotifs(v => !v);
        if (!showNotifs) setNotifCount(0);
      }
      if (e.key === 'Escape') {
        setShowPalette(false);
        setShowBreak(false);
        setProfileOpen(false);
        setShowNotifs(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showNotifs, prefs.shortcutPalette]);

  // Close profile dropdown on outside click
  useEffect(() => {
    if (!profileOpen) return;
    const handler = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [profileOpen]);

  const navigate = (nextPage) => {
    setPage(nextPage);
    const cmd = NAV_GROUPS.flatMap(g => g.items).find(i => i.id === nextPage);
    if (cmd) pushRecentPage(nextPage, cmd.label);
    // Persist last visited page when the feature is enabled
    if (prefs.rememberLastPage) {
      try { localStorage.setItem('fl_last_page', nextPage); } catch { /* noop */ }
    }
  };

  const stopSession = async (pauseOffsetSecs = 0) => {
    if (!activeSession) return;

    // Snapshot the session before clearing state
    const sessionSnap   = { ...activeSession };
    const nowUnix       = Math.floor(Date.now() / 1000);
    const effectiveEnd  = nowUnix - Math.max(0, pauseOffsetSecs);
    const durationSecs  = Math.max(0, effectiveEnd - (sessionSnap.started_at || nowUnix));

    const stopPayload   = { sessionId: sessionSnap.id };
    if (pauseOffsetSecs > 0) stopPayload.endedAt = effectiveEnd;
    await api.stopSession?.(stopPayload);
    setActiveSession(null);

    // Generate AI-written title + description and push enriched notification
    const { title, description, durLabel } = buildSessionEndNotif(sessionSnap, durationSecs);
    pushToast('session_stop', title, description, {
      relatedPage: 'activity',
      duration:    7000,
      metadata:    { durLabel, category: sessionSnap.category, isDeepWork: sessionSnap.is_deep_work },
    });
    setNotifCount(c => c + 1);
  };

  const handlePaletteAction = (action) => {
    if (action === 'start-session') navigate('tracker');
    if (action === 'stop-session') stopSession();
    if (action === 'toggle-music') setShowMusic(v => !v);
    if (action === 'take-break') setShowBreak(true);
  };

  const toggleCollapsed = () => {
    setCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem('fl_sidebar_collapsed', String(next)); }
      catch { /* noop */ }
      return next;
    });
  };

  // ── Sidebar auto-collapse based on window width ───────────────────────────────
  useEffect(() => {
    if (prefs.sidebarBehavior !== 'auto') return;
    const handleResize = () => {
      const shouldCollapse = window.innerWidth < 1200;
      setCollapsed(prev => {
        if (prev !== shouldCollapse) {
          try { localStorage.setItem('fl_sidebar_collapsed', String(shouldCollapse)); }
          catch { /* noop */ }
        }
        return shouldCollapse;
      });
    };
    handleResize(); // apply immediately on pref change
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [prefs.sidebarBehavior]);

  // ── Global pref effects (applied at startup AND on every change) ─────────────
  // These must live here (not just in SettingsPage) so they're active even when
  // the user has never opened Settings in this session.

  // 1. Accent color — injects a <style> tag that overrides Tailwind's static classes
  useEffect(() => {
    applyAccentColor(prefs.accentColor || '#7c6cf2');
  }, [prefs.accentColor]);

  // 2. Interface density — toggles fl-compact on <html>
  useEffect(() => {
    document.documentElement.classList.toggle('fl-compact', prefs.density === 'compact');
  }, [prefs.density]);

  // 3. Reduce motion — toggles fl-reduce-motion on <html>
  useEffect(() => {
    document.documentElement.classList.toggle('fl-reduce-motion', !!prefs.reduceMotion);
  }, [prefs.reduceMotion]);

  // 4. Time format — updates the module-level formatter used by formatTime()
  useEffect(() => {
    setGlobalTimeFormat(prefs.timeFormat || '12h');
  }, [prefs.timeFormat]);

  // 5. Date format — updates the module-level formatter used by formatDate()
  useEffect(() => {
    setGlobalDateFormat(prefs.dateFormat || 'MMM D');
  }, [prefs.dateFormat]);

  const sharedProps = { user, categories, setCategories, activeSession, setActiveSession, refreshActive, scheduledSession };
  const accountName =
    [profile?.first_name || user.first_name, profile?.last_name || user.last_name].filter(Boolean).join(' ')
    || profile?.full_name
    || user.full_name
    || user.username
    || user.email
    || 'Workspace';
  sharedProps.accountName = accountName;
  const accountMeta = user.username ? `@${user.username}` : (profile?.email || user.email || 'Local workspace');
  const initials =
    accountName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part[0])
      .join('')
      .toUpperCase() || 'U';
  const sidebarWidth = collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH;

  const utilityButtons = [
    { icon: Command, label: 'Command Palette', action: () => setShowPalette(true), active: showPalette },
    { icon: Music,   label: 'Focus Music',     action: () => setShowMusic(v => !v), active: showMusic  },
    // Bell is rendered separately below using NotificationBell for the badge/pulse
    { icon: theme === 'light' ? Moon : Sun, label: theme === 'light' ? 'Dark mode' : 'Light mode', action: toggleTheme, active: false },
    { icon: Star, label: 'Daily Debrief', action: () => setShowDebrief(true), active: false },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ══════════════════════════ NATIVE TITLE BAR ═════════════════════════
          28-32px — only the app menu (sidebar toggle) and window controls.
          This is the actual OS-level drag region; everything else lives in
          the application toolbar below.
      ═══════════════════════════════════════════════════════════════════════ */}
      <div
        className="drag-region fl-titlebar relative z-40 shrink-0 flex items-center justify-between select-none"
        style={{
          height: 30,
          background: '#0a0d14',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
        }}
      >
        <div className="no-drag flex items-center gap-2" style={{ paddingLeft: 10 }}>
          {/* macOS window controls (close / minimize / maximize) */}
          {IS_MAC_TB && <TrafficLights />}

          {/* Sidebar collapse / expand — same 30px footprint as the toolbar's
              utility icon buttons, capped by the 30px title bar height. */}
          <button
            onClick={toggleCollapsed}
            className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px] text-[#5d6c89] transition-all duration-150 hover:bg-white/[0.07] hover:text-white active:scale-95"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed
              ? <PanelLeftOpen size={16} strokeWidth={1.8} />
              : <PanelLeftClose size={16} strokeWidth={1.8} />}
          </button>
        </div>

        {/* Windows/Linux window controls — flush against the right edge */}
        {!IS_MAC_TB && <WinControls height={30} />}
      </div>

      {/* ══════════════════════════ APPLICATION TOOLBAR ══════════════════════
          48-56px — all app-level controls: search, command palette, music,
          theme, favorites, notifications, branding, profile. No window
          chrome here, and no page-specific controls (those live on their
          own pages).
      ═══════════════════════════════════════════════════════════════════════ */}
      <header
        className="fl-topnav relative z-30 shrink-0 flex items-center"
        style={{
          height: 56,
          background: 'linear-gradient(180deg,#0d1119 0%,#0b0e16 100%)',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          boxShadow: '0 1px 0 rgba(255,255,255,0.025)',
        }}
      >
        {/* Ambient glow */}
        <div aria-hidden className="pointer-events-none absolute inset-0"
          style={{ background: 'radial-gradient(ellipse at center,rgba(124,108,242,0.07),transparent 60%)' }} />

        {/* LEFT — flex-1: productivity score widget + activity snapshot */}
        <div className="flex flex-1 items-center gap-2.5 pl-5">
          <ProductivityScoreWidget userId={user.id} />
          <ActivitySnapshotButton
            userId={user.id}
            accountName={accountName}
            initials={initials}
            logoSrc={logoSrc}
          />
        </div>

        {/* CENTER — absolutely pinned to 50% so it never shifts with content changes */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-[11px] select-none">
          <img
            src={logoSrc}
            alt="Flow Ledger"
            className="h-[22px] w-[22px] shrink-0 object-contain"
            style={{ filter: 'drop-shadow(0 3px 10px rgba(124,108,242,0.45))' }}
          />
          <span className="whitespace-nowrap text-[13px] font-semibold uppercase tracking-[0.04em] text-white/88">
            FLOW LEDGER
          </span>
        </div>

        {/* RIGHT — flex-1 justify-end: utility icons + profile */}
        <div className="fl-topnav-right-rail">

          {/* ── Utility icon row ── */}
          <div className="fl-topnav-utility-row">
            {utilityButtons.map((btn, i) => (
              <button
                key={i}
                onClick={btn.action}
                title={btn.label}
                aria-label={btn.label}
                className={`fl-topnav-icon-btn relative flex h-[30px] w-[30px] items-center justify-center rounded-[8px] transition-all duration-150 ${
                  btn.active
                    ? 'text-accent bg-accent/[0.12]'
                    : 'text-[#7a8aaa] hover:text-white hover:bg-white/[0.07]'
                }`}
              >
                <btn.icon size={14} strokeWidth={1.8} />
              </button>
            ))}
            {/* Update indicator — shows when an update is available or downloaded */}
            <UpdateNavButton updater={updater} onOpenSettings={() => { setPage('settings'); }} />

            {/* Notification bell — uses dedicated component for badge + pulse */}
            <NotificationBell
              onClick={() => { setShowNotifs(v => !v); if (!showNotifs) setNotifCount(0); }}
              count={notifCount}
              hasUrgent={false}
            />
          </div>

          {/* Separator */}
          <div className="fl-nav-sep mx-2 h-[18px] w-px shrink-0" style={{ background: 'rgba(255,255,255,0.08)' }} />

          {/* ── Profile pill ── */}
          <div className="fl-topnav-profile-wrap relative" ref={profileRef}>
            <button
              onClick={() => setProfileOpen(o => !o)}
              className={`fl-profile-pill flex min-w-0 items-center gap-[7px] rounded-[9px] px-2 py-[5px] transition-all duration-150 ${profileOpen ? '' : 'hover:bg-white/[0.07]'}`}
              style={{
                height: 30,
                border: `1px solid ${profileOpen ? 'rgba(124,108,242,0.32)' : 'rgba(255,255,255,0.08)'}`,
                background: profileOpen ? 'rgba(124,108,242,0.13)' : 'rgba(255,255,255,0.025)',
                boxShadow: profileOpen ? '0 0 0 3px rgba(124,108,242,0.10)' : undefined,
              }}
            >
              <div
                className="flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-[5px] text-[9px] font-extrabold text-white"
                style={{
                  background: 'var(--color-accent-avatar, linear-gradient(135deg,#7c6cf2 0%,#60a5fa 100%))',
                  boxShadow: 'var(--color-accent-glow-sm, 0 2px 6px rgba(124,108,242,0.45))',
                }}
              >
                {initials}
              </div>
              <span className="fl-profile-pill-label truncate text-[12px] font-semibold leading-none text-white/85">
                {accountName}
              </span>
              <ChevronDown
                size={10}
                className="shrink-0 text-white/35 transition-transform duration-200"
                style={{ transform: profileOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
              />
            </button>

            {/* Dropdown */}
            {profileOpen && (
              <div
                className="fl-profile-dropdown absolute right-0 top-full mt-2 w-[232px] overflow-hidden rounded-[13px]"
                style={{
                  background: 'rgba(13,17,28,0.97)',
                  border: '1px solid rgba(255,255,255,0.10)',
                  backdropFilter: 'blur(32px) saturate(160%)',
                  WebkitBackdropFilter: 'blur(32px) saturate(160%)',
                  boxShadow: '0 20px 60px rgba(0,0,0,0.55), 0 4px 16px rgba(0,0,0,0.30), inset 0 1px 0 rgba(255,255,255,0.06)',
                  animation: 'profileDropIn 0.16s cubic-bezier(0.22,1,0.36,1) forwards',
                  zIndex: 9999,
                }}
              >
                <div className="px-4 pt-4 pb-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-[12px] font-extrabold text-white"
                      style={{
                        background: 'var(--color-accent-avatar, linear-gradient(135deg,#7c6cf2 0%,#60a5fa 100%))',
                        boxShadow: 'var(--color-accent-glow-md, 0 5px 14px rgba(124,108,242,0.38))',
                      }}
                    >
                      {initials}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-bold leading-none text-white">{accountName}</p>
                      <p className="fl-profile-meta mt-[5px] truncate text-[11px] leading-none text-[#7888a8]">{accountMeta}</p>
                    </div>
                  </div>
                  <div
                    className="mt-3 flex items-center gap-2 rounded-[7px] px-3 py-[7px]"
                    style={{ background: 'rgba(124,108,242,0.09)', border: '1px solid rgba(124,108,242,0.17)' }}
                  >
                    <div className="h-[7px] w-[7px] rounded-full bg-emerald-400" style={{ boxShadow: '0 0 6px rgba(52,211,153,0.75)' }} />
                    <span className="text-[11px] font-medium text-[#a0b0cc]">Local workspace</span>
                    <span className="ml-auto text-[10px] font-bold text-accent">Free</span>
                  </div>
                </div>

                <div data-divider className="mx-3 h-px" style={{ background: 'rgba(255,255,255,0.07)' }} />

                <div className="p-[6px]">
                  <ProfileMenuItem
                    icon={Settings}
                    label="Settings"
                    shortcut="⌘,"
                    onClick={() => { navigate('settings'); setProfileOpen(false); }}
                  />
                  <ProfileMenuItem
                    icon={theme === 'light' ? Moon : Sun}
                    label={theme === 'light' ? 'Switch to Dark mode' : 'Switch to Light mode'}
                    onClick={() => { toggleTheme(); setProfileOpen(false); }}
                  />
                </div>

                <div data-divider className="mx-3 h-px" style={{ background: 'rgba(255,255,255,0.07)' }} />

                <div className="p-[6px]">
                  <ProfileMenuItem
                    icon={LogOut}
                    label="Sign out"
                    danger
                    onClick={() => { setProfileOpen(false); logout(); }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ══════════════════════════ APP BODY ════════════════════════════════ */}
      <div className="flex flex-1 overflow-hidden">

        <aside
          className={`
            fl-sidebar relative z-20 flex shrink-0 select-none flex-col overflow-hidden
            ${prefs.sidebarMotion ? 'transition-[width] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]' : ''}
            ${collapsed ? 'is-collapsed w-[88px]' : 'w-[262px]'}
          `}
          style={{
            background: 'rgba(8, 10, 18, 0.45)',
            backdropFilter: 'blur(24px) saturate(180%)',
            WebkitBackdropFilter: 'blur(24px) saturate(180%)',
            borderRight: '1px solid rgba(255,255,255,0.08)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), 4px 0 32px rgba(0,0,0,0.18), 0 0 60px rgba(124,92,255,0.06)',
          }}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{ background: 'linear-gradient(180deg, rgba(124,92,255,0.09) 0%, rgba(124,92,255,0.02) 35%, transparent 65%)' }}
          />

          {/* Search */}
          <div className={`shrink-0 ${prefs.sidebarMotion ? 'transition-[padding] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]' : ''} ${collapsed ? 'flex justify-center px-3 pb-3 pt-3' : 'px-4 pb-3 pt-3'}`}>
            {collapsed ? (
              <CollapsedTooltip label="Search  Ctrl K">
                <button
                  onClick={() => setShowPalette(true)}
                  aria-label="Search  Ctrl K"
                  className="flex h-12 w-12 items-center justify-center rounded-[14px] border border-white/[0.06] bg-white/[0.03] text-[#aebbd8] transition-all duration-150 hover:border-white/[0.10] hover:bg-white/[0.06] hover:text-white"
                >
                  <Search size={16} />
                </button>
              </CollapsedTooltip>
            ) : (
              <button
                onClick={() => setShowPalette(true)}
                className="group/srch flex w-full items-center gap-2.5 rounded-xl px-3 py-[10px] text-left outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-accent/25"
                style={{
                  background: theme === 'light' ? 'rgba(255,255,255,0.90)' : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${theme === 'light' ? 'rgba(107,92,242,0.18)' : 'rgba(255,255,255,0.09)'}`,
                  boxShadow: theme === 'light'
                    ? '0 2px 10px rgba(107,92,242,0.08), inset 0 1px 0 rgba(255,255,255,0.96)'
                    : 'inset 0 1px 0 rgba(255,255,255,0.06), 0 2px 8px rgba(0,0,0,0.12)',
                  backdropFilter: 'blur(8px)',
                  WebkitBackdropFilter: 'blur(8px)',
                }}
                title="Command Palette  Ctrl K"
                onMouseEnter={e => {
                  if (theme === 'light') {
                    e.currentTarget.style.background = 'rgba(107,92,242,0.10)';
                    e.currentTarget.style.borderColor = 'rgba(107,92,242,0.28)';
                  } else {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)';
                  }
                }}
                onMouseLeave={e => {
                  if (theme === 'light') {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.90)';
                    e.currentTarget.style.borderColor = 'rgba(107,92,242,0.18)';
                  } else {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.09)';
                  }
                }}
              >
                <Search size={13} className="shrink-0 text-[#8a9ab8] transition-colors group-hover/srch:text-white" />
                <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-[#b0c2d8] transition-colors group-hover/srch:text-white/80">
                  Search or jump
                </span>
                <kbd className="shrink-0 rounded-md border border-white/[0.07] bg-white/[0.05] px-1.5 py-[3px] text-[9px] font-semibold text-[#7888a0]">
                  Ctrl K
                </kbd>
              </button>
            )}
          </div>

          {/* Nav */}
          <nav className={`flex-1 overflow-y-auto overflow-x-hidden pb-3 ${collapsed ? 'px-3' : 'px-4'}`} style={{ scrollbarWidth: 'none' }}>
            {NAV_GROUPS.map(({ id: gid, label, items }, gi) => (
              <div key={gid} className={collapsed ? (gi === 0 ? 'mt-1' : 'mt-4') : (gi === 0 ? 'mt-2' : 'mt-4')}>
                {!collapsed && (
                  <div className="mb-2 px-1">
                    <div className="mb-2 h-px w-full" style={{ background: 'linear-gradient(90deg,transparent,rgba(124,108,242,0.20) 40%,rgba(124,108,242,0.20) 60%,transparent)' }} />
                    <p className="text-[11px] font-bold uppercase tracking-[0.10em] select-none" style={{ color: 'rgba(148,130,255,0.45)' }}>
                      {label}
                    </p>
                  </div>
                )}
                {collapsed && gi > 0 && (
                  <div className="mx-auto mb-3 h-px w-8 rounded-full" style={{ background: 'rgba(124,108,242,0.22)' }} />
                )}
                <div className={collapsed ? 'space-y-2' : 'space-y-1'}>
                  {items.map(({ id, label: itemLabel, Icon }) => (
                    <NavItem
                      key={id}
                      label={itemLabel}
                      Icon={Icon}
                      isActive={page === id}
                      onClick={() => navigate(id)}
                      collapsed={collapsed}
                      badge={id === 'tracker' && !!activeSession}
                    />
                  ))}
                </div>
              </div>
            ))}
          </nav>

          {/* Bottom: Settings only — pb-[58px] so the fixed FocusSessionDock never overlaps */}
          <div className="relative shrink-0 border-t border-white/[0.08]" style={{ paddingBottom: 58 }}>
            <div className={`${prefs.sidebarMotion ? 'transition-[padding] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]' : ''} ${collapsed ? 'px-3 py-2.5' : 'px-4 py-2.5'}`}>
              <NavItem
                label="Settings"
                Icon={Settings}
                isActive={page === 'settings'}
                onClick={() => navigate('settings')}
                collapsed={collapsed}
                compactCollapsed
              />
            </div>
          </div>
        </aside>

        {showNotifs && (
          <NotificationCentre
            onClose={() => { setShowNotifs(false); setNotifCount(0); }}
            onNavigate={(page) => { navigate(page); setShowNotifs(false); }}
          />
        )}

        <main
          className="flex min-w-0 flex-1 flex-col overflow-hidden"
          style={{ paddingBottom: 58 }}
        >
          <PageTransition pageKey={page} className="min-h-0 flex-1 overflow-hidden">
            {page === 'home'          && <HomePage user={user} onNavigate={navigate} />}
            {page === 'calendar'      && <CalendarView {...sharedProps} onNavigate={navigate} />}
            {page === 'tracker'       && <TimerPage {...sharedProps} />}
            {page === 'activity'      && <ActivityPage {...sharedProps} />}
            {page === 'projects'      && <ProjectsPage {...sharedProps} />}
            {page === 'clients'       && <ClientsPage {...sharedProps} />}
            {page === 'invoices'      && <InvoicesPage {...sharedProps} />}
            {page === 'tasks'         && <TasksPage {...sharedProps} />}
            {page === 'reports'       && <ReportsPage {...sharedProps} />}
            {page === 'analytics'     && <ProjectAnalyticsPage {...sharedProps} />}
            {page === 'heatmap'       && <HeatmapPage {...sharedProps} />}
            {page === 'profitability' && <ProfitabilityPage {...sharedProps} />}
            {page === 'productivity'  && <ProductivityPage {...sharedProps} />}
            {page === 'blocker'       && <DistractionBlocker {...sharedProps} />}
            {page === 'settings'      && <SettingsPage {...sharedProps} />}
          </PageTransition>
        </main>

      </div>{/* end body row */}

      {/* Overlays — outside the body row so they stack over everything */}
      {showBreak && (
        <BreakReminder
          userId={user.id}
          data={breakData}
          onDismiss={() => setShowBreak(false)}
          onSessionChange={refreshActive}
        />
      )}
      <FocusMusic show={showMusic} onClose={() => setShowMusic(false)} />
      <FocusSessionDock
        activeSession={activeSession}
        scheduledSession={scheduledSession}
        sidebarWidth={sidebarWidth}
        onStop={stopSession}
        onOpenMusic={() => setShowMusic(true)}
        onTakeBreak={() => setShowBreak(true)}
      />
      {showPalette && (
        <CommandPalette
          user={user}
          onNavigate={navigate}
          onAction={handlePaletteAction}
          activeSession={activeSession}
          onClose={() => setShowPalette(false)}
        />
      )}
      {showSetup && (
        <SetupWizard
          onComplete={() => { setShowSetup(false); setShowOnboarding(false); refreshActive?.(); }}
        />
      )}
      {!showSetup && showOnboarding && (
        <OnboardingWizard
          user={user}
          onComplete={() => { setShowOnboarding(false); setCategories([]); refreshActive?.(); }}
          onDismiss={() => setShowOnboarding(false)}
        />
      )}
      {showDebrief && <DailyDebrief user={user} onClose={() => setShowDebrief(false)} />}

      {/* Global toast stack — always mounted, renders bottom-right toasts */}
      <ToastStack onNavigate={(page) => { navigate(page); setShowNotifs(false); }}/>
    </div>
  );
}

function ProfileMenuItem({ icon: Icon, label, shortcut, danger, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`
        fl-profile-menu-item ${danger ? 'danger' : ''}
        flex w-full items-center gap-2.5 rounded-[9px] px-3 py-2.5
        text-left transition-all duration-100
        ${danger
          ? 'text-[#f87171]/70 hover:bg-red-500/10 hover:text-red-400'
          : 'text-[#c8d6f0] hover:bg-white/[0.06] hover:text-white'}
      `}
    >
      <Icon size={13} className="shrink-0 opacity-80" />
      <span className="flex-1 text-[12px] font-medium leading-none">{label}</span>
      {shortcut && (
        <kbd className="rounded-md border border-white/[0.08] bg-white/[0.04] px-1.5 py-[3px] text-[9px] font-semibold text-[#5a6a88]">
          {shortcut}
        </kbd>
      )}
    </button>
  );
}

// ─── Update nav button ────────────────────────────────────────────────────────
function UpdateNavButton({ updater, onOpenSettings }) {
  if (!updater) return null;

  const { phase, updateInfo, download, install } = updater;
  const isDownloaded  = phase === 'downloaded';
  const isAvailable   = phase === 'available';
  const isDownloading = phase === 'downloading';

  if (!isAvailable && !isDownloaded && !isDownloading) return null;

  const handleClick = () => {
    if (isDownloaded)  return install();
    if (isAvailable)   return download();
    // while downloading: open settings for progress view
    onOpenSettings();
  };

  const label = isDownloaded
    ? 'Restart & Install'
    : isDownloading
      ? 'Downloading…'
      : `v${updateInfo?.version} ready`;

  const accent = isDownloaded ? '#10b981' : '#7c6cf2';
  const bgAlpha = isDownloaded ? 'rgba(16,185,129,0.13)' : 'rgba(124,108,242,0.13)';
  const borderColor = isDownloaded ? 'rgba(16,185,129,0.32)' : 'rgba(124,108,242,0.32)';
  const textColor = isDownloaded ? '#34d399' : '#c4b5fd';

  return (
    <button
      onClick={handleClick}
      title={isDownloaded ? 'Update downloaded — click to restart and install' : 'Update available — click to download'}
      style={{
        display: 'flex', alignItems: 'center', gap: 5,
        height: 26, padding: '0 9px',
        borderRadius: 7,
        background: bgAlpha,
        border: `1px solid ${borderColor}`,
        color: textColor,
        fontSize: 11, fontWeight: 700,
        cursor: 'pointer',
        transition: 'all 0.15s',
        letterSpacing: '-0.01em',
        whiteSpace: 'nowrap',
        position: 'relative',
        overflow: 'hidden',
      }}
      onMouseOver={e => { e.currentTarget.style.filter = 'brightness(1.15)'; }}
      onMouseOut={e  => { e.currentTarget.style.filter = ''; }}
    >
      {/* Subtle shimmer for downloaded state */}
      {isDownloaded && (
        <span style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(90deg, transparent 0%, rgba(52,211,153,0.08) 50%, transparent 100%)',
          animation: 'fl-upd-shimmer 2s ease-in-out infinite',
        }} />
      )}

      {/* Dot indicator */}
      <span style={{
        width: 5, height: 5, borderRadius: '50%',
        background: accent,
        boxShadow: `0 0 6px ${accent}`,
        flexShrink: 0,
        animation: isDownloading ? 'fl-pulse-dot 1.4s ease-in-out infinite' : 'none',
      }} />

      {/* Icon */}
      {isDownloaded
        ? <Download size={11} strokeWidth={2.5} />
        : <ArrowDown size={11} strokeWidth={2.5} style={{ animation: isDownloading ? 'fl-pulse-dot 1.4s ease-in-out infinite' : 'none' }} />
      }

      {label}
    </button>
  );
}

// Windows/Linux window controls flush against the navbar's right edge,
// spanning its full 48px height (matches native Windows 10/11 chrome).
