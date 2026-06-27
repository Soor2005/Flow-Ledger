/**
 * Flow Ledger — Complete Notification System
 *
 * Exports:
 *   pushNotification(type, title, description, opts)  — add to notification center
 *   pushToast(type, title, description, opts)          — show a floating toast
 *   NotificationBell({ onClick, count, hasUrgent })   — navbar bell icon
 *   ToastStack()                                       — bottom-right toast renderer
 *   default NotificationCentre({ onClose, ... })       — right-side drawer panel
 */
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Bell, X, CheckCheck, Trash2, Settings2, Pin, Clock,
  Play, Square, Coffee, Zap, Calendar, AlertTriangle,
  Info, Brain, TrendingUp, Target, Shield, Activity,
  ChevronRight, BellOff, Volume2, VolumeX, Sparkles,
  Timer, Award, BarChart2, RefreshCw, ExternalLink,
  CheckCircle, Circle, AlertCircle, ListTodo, AlarmClock,
  ClipboardList, Loader2,
} from 'lucide-react';
import { repairMojibake } from '../../utils/textEncoding';
import { readPrefs } from '../../hooks/usePrefs';

const api = window.electron || {};

// ─── Theme hook ───────────────────────────────────────────────────────────────
function useIsLight() {
  const [isLight, setIsLight] = useState(() =>
    document.documentElement.classList.contains('theme-light')
  );
  useEffect(() => {
    const obs = new MutationObserver(() =>
      setIsLight(document.documentElement.classList.contains('theme-light'))
    );
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  return isLight;
}

// ─── Theme palette helper ─────────────────────────────────────────────────────
function mkTheme(isLight) {
  return isLight ? {
    panelBg:       'linear-gradient(180deg,#ffffff 0%,#f8f5ff 100%)',
    panelBorder:   'rgba(0,0,0,0.08)',
    panelShadow:   '-8px 0 32px rgba(0,0,0,0.10),-1px 0 0 rgba(0,0,0,0.04)',
    accentLine:    true,   // keep accent gradient on top line
    headerBorder:  'rgba(0,0,0,0.07)',
    headerText:    '#0f1117',
    divider:       'rgba(0,0,0,0.06)',
    dividerXs:     'rgba(0,0,0,0.04)',
    text:          '#0f1117',
    textMuted:     '#4a5568',
    textFaint:     '#64748b',
    textMicro:     '#94a3b8',
    itemHover:     'rgba(0,0,0,0.03)',
    notifBorder:   'rgba(0,0,0,0.055)',
    btnBg:         'rgba(0,0,0,0.05)',
    btnBorder:     'rgba(0,0,0,0.09)',
    btnText:       '#4a5568',
    btnTextHover:  '#0f1117',
    btnHoverBg:    'rgba(0,0,0,0.08)',
    scrollbar:     'rgba(0,0,0,0.10) transparent',
    emptyIconBg:   'rgba(0,0,0,0.04)',
    emptyIconBrd:  'rgba(0,0,0,0.08)',
    emptyText:     '#94a3b8',
    emptySubtext:  '#b0b8c8',
    toggleOff:     'rgba(0,0,0,0.13)',
    inputBg:       'rgba(0,0,0,0.04)',
    inputBrd:      'rgba(0,0,0,0.12)',
    silentBg:      'rgba(0,0,0,0.05)',
    silentBrd:     'rgba(0,0,0,0.08)',
    silentText:    '#64748b',
    pinBg:         'rgba(0,0,0,0.06)',
    pinText:       '#64748b',
    toastBg:       'linear-gradient(145deg,#ffffff 0%,#f8f5ff 100%)',
    toastShadow:   '0 8px 32px rgba(0,0,0,0.13),0 0 0 1px rgba(0,0,0,0.04)',
    toastText:     '#0f1117',
    toastSub:      '#64748b',
    toastDismissBg:'rgba(0,0,0,0.05)',
    badgeBrd:      '#f8f5ff',
    tabInactive:   '#64748b',
    tabHoverBg:    'rgba(0,0,0,0.04)',
    tabHoverText:  '#0f1117',
    bellIconColor: '#4a5568',
    bellHoverBg:   'rgba(0,0,0,0.06)',
    bellHoverText: '#0f1117',
    footerText:    '#94a3b8',
    settingsRowBorder: 'rgba(0,0,0,0.05)',
    settingsLabel: '#0f1117',
    settingsSub:   '#64748b',
    clearBorder:   'rgba(239,68,68,0.18)',
    clearBg:       'rgba(239,68,68,0.07)',
    clearText:     'rgba(239,68,68,0.8)',
    clearHoverBg:  'rgba(239,68,68,0.13)',
  } : {
    panelBg:       'linear-gradient(180deg,rgba(13,16,28,0.97) 0%,rgba(10,13,22,0.97) 100%)',
    panelBorder:   'rgba(255,255,255,0.08)',
    panelShadow:   '-12px 0 48px rgba(0,0,0,0.55),-1px 0 0 rgba(255,255,255,0.02)',
    accentLine:    true,
    headerBorder:  'rgba(255,255,255,0.06)',
    headerText:    'white',
    divider:       'rgba(255,255,255,0.06)',
    dividerXs:     'rgba(255,255,255,0.04)',
    text:          'rgba(255,255,255,0.94)',
    textMuted:     'rgba(255,255,255,0.60)',
    textFaint:     'rgba(255,255,255,0.42)',
    textMicro:     'rgba(255,255,255,0.28)',
    itemHover:     'rgba(255,255,255,0.035)',
    notifBorder:   'rgba(255,255,255,0.035)',
    btnBg:         'rgba(255,255,255,0.05)',
    btnBorder:     'rgba(255,255,255,0.09)',
    btnText:       'rgba(255,255,255,0.55)',
    btnTextHover:  'white',
    btnHoverBg:    'rgba(255,255,255,0.09)',
    scrollbar:     'rgba(255,255,255,0.07) transparent',
    emptyIconBg:   'rgba(255,255,255,0.04)',
    emptyIconBrd:  'rgba(255,255,255,0.07)',
    emptyText:     'rgba(255,255,255,0.40)',
    emptySubtext:  'rgba(255,255,255,0.22)',
    toggleOff:     'rgba(255,255,255,0.12)',
    inputBg:       'rgba(255,255,255,0.06)',
    inputBrd:      'rgba(255,255,255,0.10)',
    silentBg:      'rgba(255,255,255,0.07)',
    silentBrd:     'rgba(255,255,255,0.08)',
    silentText:    'rgba(255,255,255,0.4)',
    pinBg:         'rgba(255,255,255,0.07)',
    pinText:       'rgba(255,255,255,0.35)',
    toastBg:       'linear-gradient(145deg,rgba(18,22,36,0.97) 0%,rgba(14,17,28,0.97) 100%)',
    toastShadow:   '0 8px 32px rgba(0,0,0,0.55),0 0 0 1px rgba(255,255,255,0.04)',
    toastText:     'rgba(255,255,255,0.95)',
    toastSub:      'rgba(255,255,255,0.48)',
    toastDismissBg:'rgba(255,255,255,0.06)',
    badgeBrd:      '#0b0e16',
    tabInactive:   'rgba(255,255,255,0.45)',
    tabHoverBg:    'rgba(255,255,255,0.05)',
    tabHoverText:  'rgba(255,255,255,0.7)',
    bellIconColor: '#7a8aaa',
    bellHoverBg:   'rgba(255,255,255,0.07)',
    bellHoverText: 'white',
    footerText:    'rgba(255,255,255,0.28)',
    settingsRowBorder: 'rgba(255,255,255,0.04)',
    settingsLabel: 'rgba(255,255,255,0.88)',
    settingsSub:   'rgba(255,255,255,0.38)',
    clearBorder:   'rgba(248,113,113,0.18)',
    clearBg:       'rgba(248,113,113,0.07)',
    clearText:     'rgba(248,113,113,0.7)',
    clearHoverBg:  'rgba(248,113,113,0.14)',
  };
}

// ─── Desktop notification helper ──────────────────────────────────────────────
// Reuses usePrefs' readPrefs() so settings always come back merged with
// DEFAULT_PREFS — reading raw localStorage here previously meant a fresh
// profile (or one saved before `desktopNotifications` existed) had
// `appPrefs.desktopNotifications === undefined`, which silently disabled all
// desktop notifications with no error anywhere.
function getAppPrefs() {
  try { return readPrefs(); } catch { return {}; }
}
// Resolve the app logo URL that works under both dev (localhost) and production
// (file:// protocol).  CRA sets PUBLIC_URL to "." in production builds so that
// assets load relative to index.html — combining it with the filename gives a
// path the browser can resolve regardless of protocol.
const _LOGO_URL = (() => {
  try {
    const base = process.env.PUBLIC_URL || '';
    // Dev: base = '' → '/logo.png' served by CRA dev server
    // Prod: base = '.' → './logo.png' resolved relative to file:// index.html
    return (base ? `${base}/logo.png` : '/logo.png');
  } catch { return ''; }
})();

function showDesktopNotif(title, description, appPrefs) {
  // notifSound defaults to true; when false → silent notification (no OS sound)
  new Notification(title || 'Flow Ledger', {
    body:   description || '',
    silent: appPrefs.notifSound === false,
    icon:   _LOGO_URL,
  });
}

function fireDesktopNotif(title, description) {
  try {
    const appPrefs = getAppPrefs();
    if (!appPrefs.desktopNotifications) return;
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'granted') {
      showDesktopNotif(title, description, appPrefs);
      return;
    }
    if (Notification.permission === 'denied') return;
    // First run: ask, then actually show this notification once granted
    // instead of silently dropping it until the *next* call.
    Notification.requestPermission().then(perm => {
      if (perm === 'granted') showDesktopNotif(title, description, appPrefs);
    }).catch(() => {});
  } catch {}
}

// ─── Constants ────────────────────────────────────────────────────────────────
const STORE_KEY  = 'fl_notifications';
const PREFS_KEY  = 'fl_notif_prefs';
const MAX_STORE  = 100;
const ACCENT     = '#5347C7';

// ─── Notification type config ─────────────────────────────────────────────────
const TYPE_CFG = {
  // Focus
  session_start:    { Icon: Play,         color: '#22c55e', label: 'Session',    tab: 'focus'   },
  session_stop:     { Icon: Square,       color: ACCENT,    label: 'Session',    tab: 'focus'   },
  deep_work:        { Icon: Zap,          color: '#a78bfa', label: 'Deep Work',  tab: 'focus'   },
  focus_reminder:   { Icon: Target,       color: '#a78bfa', label: 'Focus',      tab: 'focus'   },
  focus_score:      { Icon: TrendingUp,   color: '#34d399', label: 'Focus',      tab: 'focus'   },
  distraction:      { Icon: Shield,       color: '#f59e0b', label: 'Distraction',tab: 'focus'   },
  flow_state:       { Icon: Sparkles,     color: '#a78bfa', label: 'Flow',       tab: 'focus'   },
  break_reminder:   { Icon: Coffee,       color: '#fbbf24', label: 'Break',      tab: 'focus'   },
  goal_achieved:    { Icon: Award,        color: '#34d399', label: 'Goal',       tab: 'focus'   },
  // Meetings
  meeting_soon:     { Icon: Calendar,     color: '#f87171', label: 'Meeting',    tab: 'meetings'},
  meeting_start:    { Icon: Calendar,     color: '#f87171', label: 'Meeting',    tab: 'meetings'},
  calendar_sync:    { Icon: RefreshCw,    color: '#60a5fa', label: 'Sync',       tab: 'meetings'},
  // AI
  ai_insight:       { Icon: Brain,        color: '#c084fc', label: 'AI Insight', tab: 'ai'      },
  weekly_report:    { Icon: BarChart2,    color: '#60a5fa', label: 'Report',     tab: 'ai'      },
  productivity_tip: { Icon: Sparkles,     color: '#c084fc', label: 'Tip',        tab: 'ai'      },
  peak_detected:    { Icon: TrendingUp,   color: '#34d399', label: 'Peak',       tab: 'ai'      },
  // Tasks
  task_overdue:     { Icon: AlarmClock,   color: '#f87171', label: 'Overdue',    tab: 'tasks'   },
  task_due_today:   { Icon: ListTodo,     color: '#fbbf24', label: 'Due Today',  tab: 'tasks'   },
  tasks_daily:      { Icon: ClipboardList,color: '#818cf8', label: 'Daily Tasks',tab: 'tasks'   },
  tasks_yesterday:  { Icon: CheckCircle,  color: '#34d399', label: 'Yesterday',  tab: 'tasks'   },
  // System
  tracking_paused:  { Icon: Activity,     color: '#94a3b8', label: 'Tracking',   tab: 'system'  },
  tracking_resumed: { Icon: Activity,     color: '#34d399', label: 'Tracking',   tab: 'system'  },
  idle_detected:    { Icon: Timer,        color: '#f59e0b', label: 'Idle',       tab: 'system'  },
  sync_complete:    { Icon: CheckCircle,  color: '#34d399', label: 'Sync',       tab: 'system'  },
  error:            { Icon: AlertCircle,  color: '#f87171', label: 'Error',      tab: 'system'  },
  warning:          { Icon: AlertTriangle,color: '#f59e0b', label: 'Warning',    tab: 'system'  },
  info:             { Icon: Info,         color: '#60a5fa', label: 'Info',       tab: 'system'  },
};

// Priority → border accent opacity
const PRIORITY_GLOW = { urgent: 0.40, high: 0.25, normal: 0, low: 0 };

// ─── Storage helpers ──────────────────────────────────────────────────────────
/** Normalize legacy notification shape (pre-rewrite used `ts`, `message`, `detail`). */
function normalizeLegacy(n) {
  // Already in new format
  if (n.title !== undefined || n.timestamp !== undefined) return n;
  return {
    ...n,
    title:       n.message || n.title || '',
    description: n.detail  || n.description || '',
    timestamp:   typeof n.ts === 'number' ? n.ts : Date.now(),
    priority:    n.priority || 'normal',
    actions:     n.actions  || [],
    metadata:    n.metadata || {},
    pinned:      n.pinned   || false,
    relatedPage: n.relatedPage || null,
  };
}
// One-time, self-healing repair of records persisted before the mojibake
// source bug (Dashboard.jsx) was fixed — re-saves the list only if anything
// actually needed fixing.
function repairNotif(n) {
  const title = repairMojibake(n.title);
  const description = repairMojibake(n.description);
  if (title === n.title && description === n.description) return n;
  return { ...n, title, description };
}
function loadNotifs() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
    const list = raw.map(normalizeLegacy);
    const repaired = list.map(repairNotif);
    if (repaired.some((n, i) => n !== list[i])) saveNotifs(repaired);
    return repaired;
  } catch { return []; }
}
function saveNotifs(list) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(list.slice(0, MAX_STORE))); } catch {}
}
function loadPrefs() {
  const defaults = { silent: false, sound: true, toasts: true, quietHoursStart: 22, quietHoursEnd: 8, quietHoursEnabled: false };
  try { return { ...defaults, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') }; } catch { return defaults; }
}
function savePrefs(p) { try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch {} }

// ─── Dedup + ID generation ────────────────────────────────────────────────────
let _id = Date.now();
function nextId() { return String(++_id); }
const _recentKeys = new Map(); // type+title → timestamp (60s dedup window)
function isDuplicate(type, title) {
  const k = `${type}:${title}`;
  const last = _recentKeys.get(k);
  if (last && Date.now() - last < 60_000) return true;
  _recentKeys.set(k, Date.now());
  return false;
}

// ─── Global event buses ───────────────────────────────────────────────────────
const _panelListeners = new Set();
const _toastListeners = new Set();

/**
 * Subscribe to live notification-list updates — lets things like the navbar
 * bell badge stay accurate even while the notification panel itself is
 * unmounted/closed, instead of only refreshing the unread count at mount
 * time and whenever the panel is opened.
 * @param {(list: object[]) => void} cb
 * @returns {() => void} unsubscribe
 */
export function onNotificationsChanged(cb) {
  _panelListeners.add(cb);
  return () => _panelListeners.delete(cb);
}

function isQuietHours(prefs) {
  if (!prefs.quietHoursEnabled) return false;
  const h = new Date().getHours();
  const { quietHoursStart: s, quietHoursEnd: e } = prefs;
  return s > e ? (h >= s || h < e) : (h >= s && h < e);
}

/**
 * Add a notification to the persistent center.
 * @param {string} type       — one of the TYPE_CFG keys
 * @param {string} title
 * @param {string} [description]
 * @param {Object} [opts]     — { priority, relatedPage, actions, metadata, pinned }
 */
export function pushNotification(type, title, description, opts = {}) {
  if (isDuplicate(type, title)) return;
  const prefs = loadPrefs();
  if (prefs.silent || isQuietHours(prefs)) return;

  const notif = {
    id:          nextId(),
    type:        type || 'info',
    title:       title || '',
    description: description || '',
    timestamp:   Date.now(),
    read:        false,
    pinned:      opts.pinned || false,
    priority:    opts.priority || 'normal',
    relatedPage: opts.relatedPage || null,
    actions:     opts.actions || [],
    metadata:    opts.metadata || {},
  };
  const list = [notif, ...loadNotifs()].slice(0, MAX_STORE);  // loadNotifs already normalizes
  saveNotifs(list);
  _panelListeners.forEach(fn => fn(list));
}

/**
 * Show a floating toast (also adds to notification center).
 */
export function pushToast(type, title, description, opts = {}) {
  const prefs = loadPrefs();
  // pushNotification() below applies this same gate, but only to itself — it
  // can't stop pushToast from continuing on to fire the desktop notification
  // and floating toast. Check here too so quiet hours suppress all three
  // consistently instead of just silently dropping the panel record.
  if (prefs.silent || isQuietHours(prefs)) return;
  pushNotification(type, title, description, opts);
  // Fire OS-level desktop notification when the user has enabled it
  fireDesktopNotif(title, description);
  if (!prefs.toasts) return;
  const toast = {
    id:          nextId(),
    type:        type || 'info',
    title:       title || '',
    description: description || '',
    timestamp:   Date.now(),
    priority:    opts.priority || 'normal',
    relatedPage: opts.relatedPage || null,
    autoDismiss: opts.autoDismiss !== false,
    duration:    opts.duration || (opts.priority === 'urgent' ? 8000 : 5000),
  };
  _toastListeners.forEach(fn => fn(toast));
}

// ─── Relative time ────────────────────────────────────────────────────────────
function relTime(ts) {
  if (!ts || isNaN(ts)) return '';
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 0)    return 'just now';
  if (diff < 5)    return 'just now';
  if (diff < 60)   return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)return `${Math.floor(diff / 3600)}h ago`;
  const d = new Date(ts);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// ─── Toast Stack ──────────────────────────────────────────────────────────────
export function ToastStack({ onNavigate }) {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const fn = (toast) => setToasts(prev => [...prev.slice(-3), toast]);
    _toastListeners.add(fn);
    return () => _toastListeners.delete(fn);
  }, []);

  const dismiss = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 20, zIndex: 99999,
      display: 'flex', flexDirection: 'column', gap: 8,
      pointerEvents: toasts.length ? 'auto' : 'none',
    }}>
      <style>{`
        @keyframes toast-in  { from { opacity:0; transform:translateX(18px) scale(0.96); } to { opacity:1; transform:translateX(0) scale(1); } }
        @keyframes toast-out { from { opacity:1; transform:translateX(0); }               to { opacity:0; transform:translateX(18px); }       }
      `}</style>
      {toasts.map(t => (
        <Toast key={t.id} toast={t} onDismiss={dismiss} onNavigate={onNavigate}/>
      ))}
    </div>
  );
}

function Toast({ toast, onDismiss, onNavigate }) {
  const [exiting, setExiting] = useState(false);
  const [paused,  setPaused]  = useState(false);
  const timerRef = useRef(null);
  const isLight  = useIsLight();
  const t        = mkTheme(isLight);
  const cfg = TYPE_CFG[toast.type] || TYPE_CFG.info;
  const { color } = cfg;

  const startTimer = useCallback(() => {
    if (!toast.autoDismiss) return;
    timerRef.current = setTimeout(() => {
      setExiting(true);
      setTimeout(() => onDismiss(toast.id), 280);
    }, toast.duration || 5000);
  }, [toast, onDismiss]);

  useEffect(() => {
    startTimer();
    return () => clearTimeout(timerRef.current);
  }, [startTimer]);

  const pause  = () => { clearTimeout(timerRef.current); setPaused(true); };
  const resume = () => { setPaused(false); startTimer(); };

  const handleClick = () => {
    if (toast.relatedPage && onNavigate) onNavigate(toast.relatedPage);
    setExiting(true);
    setTimeout(() => onDismiss(toast.id), 280);
  };

  return (
    <div
      onMouseEnter={pause}
      onMouseLeave={resume}
      style={{
        width: 330,
        background: t.toastBg,
        border: `1px solid ${color}30`,
        borderLeft: `3px solid ${color}`,
        borderRadius: 14,
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        boxShadow: `${t.toastShadow},0 0 20px ${color}14`,
        cursor: toast.relatedPage ? 'pointer' : 'default',
        animation: `${exiting ? 'toast-out' : 'toast-in'} 0.28s cubic-bezier(0.34,1.56,0.64,1) both`,
        overflow: 'hidden',
        position: 'relative',
      }}
      onClick={handleClick}
    >
      {/* Top shimmer */}
      <div style={{ position:'absolute', top:0, left:0, right:0, height:1, background:`linear-gradient(90deg,transparent 5%,${color}60 50%,transparent 95%)` }}/>

      <div style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'12px 14px' }}>
        {/* Icon */}
        <div style={{ width:30, height:30, borderRadius:9, background:`${color}18`, border:`1px solid ${color}28`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginTop:1 }}>
          <cfg.Icon size={13} color={color}/>
        </div>

        {/* Content */}
        <div style={{ flex:1, minWidth:0 }}>
          {/* Duration + category pill for session_stop notifications */}
          {toast.type === 'session_stop' && toast.metadata?.durLabel && (
            <div style={{ display:'flex', alignItems:'center', gap:5, marginBottom:4 }}>
              <span style={{ fontSize:9, fontWeight:700, color:color, background:`${color}18`, border:`1px solid ${color}30`, borderRadius:5, padding:'1px 7px', letterSpacing:'0.04em' }}>
                {toast.metadata.durLabel}
              </span>
              {toast.metadata.category && (
                <span style={{ fontSize:9, color:'rgba(255,255,255,0.35)', textTransform:'capitalize' }}>
                  {toast.metadata.isDeepWork ? '⚡ Deep focus' : toast.metadata.category}
                  {toast.metadata.isPomodoroEnd ? ' · Pomodoro' : ''}
                </span>
              )}
            </div>
          )}
          <p style={{ fontSize:12.5, fontWeight:700, color:t.toastText, lineHeight:1.3, margin:0 }}>{toast.title}</p>
          {toast.description && (
            <p style={{ fontSize:11, color:t.toastSub, marginTop:3, lineHeight:1.45, margin:'3px 0 0' }}>{toast.description}</p>
          )}
          {toast.relatedPage && (
            <div style={{ display:'flex', alignItems:'center', gap:4, marginTop:6, color:color, fontSize:10.5, fontWeight:600 }}>
              <ExternalLink size={8}/>Open
            </div>
          )}
        </div>

        {/* Dismiss */}
        <button
          onClick={e => { e.stopPropagation(); setExiting(true); setTimeout(() => onDismiss(toast.id), 280); }}
          style={{ width:20, height:20, borderRadius:5, border:'none', background:t.toastDismissBg, cursor:'pointer', color:t.textMicro, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, transition:'all 0.15s' }}
          onMouseEnter={e => { e.currentTarget.style.background=t.btnHoverBg; e.currentTarget.style.color=t.toastText; }}
          onMouseLeave={e => { e.currentTarget.style.background=t.toastDismissBg; e.currentTarget.style.color=t.textMicro; }}>
          <X size={9}/>
        </button>
      </div>

      {/* Progress bar */}
      {toast.autoDismiss && !paused && (
        <div style={{ position:'absolute', bottom:0, left:0, right:0, height:2, background:`${color}22` }}>
          <div style={{ height:'100%', background:color, borderRadius:1, animation:`toast-progress ${toast.duration||5000}ms linear forwards` }}/>
        </div>
      )}
      <style>{`@keyframes toast-progress { from{width:100%} to{width:0%} }`}</style>
    </div>
  );
}

// ─── Notification Bell icon (for navbar) ─────────────────────────────────────
export function NotificationBell({ onClick, count = 0, hasUrgent = false }) {
  const isLight = useIsLight();
  const t = mkTheme(isLight);
  return (
    <button
      onClick={onClick}
      title="Notifications (⌘ N)"
      style={{ position:'relative', display:'flex', alignItems:'center', justifyContent:'center', width:30, height:30, borderRadius:8, background:'transparent', border:'none', cursor:'pointer', color:t.bellIconColor, transition:'all 0.15s' }}
      onMouseEnter={e => { e.currentTarget.style.color=t.bellHoverText; e.currentTarget.style.background=t.bellHoverBg; }}
      onMouseLeave={e => { e.currentTarget.style.color=t.bellIconColor; e.currentTarget.style.background='transparent'; }}>
      <Bell size={14} strokeWidth={1.8}/>
      {count > 0 && (
        <span style={{
          position:'absolute', top:3, right:3,
          minWidth:13, height:13, borderRadius:9999,
          background: hasUrgent ? '#ef4444' : `linear-gradient(135deg,${ACCENT},var(--color-accent))`,
          color:'white', fontSize:7, fontWeight:800,
          display:'flex', alignItems:'center', justifyContent:'center', padding:'0 2px',
          border:`1.5px solid ${t.badgeBrd}`,
          boxShadow: hasUrgent ? '0 0 8px rgba(239,68,68,0.6)' : '0 0 8px rgba(83,71,199,0.5)',
          animation: hasUrgent ? 'notif-pulse 1.4s infinite' : 'none',
        }}>
          {count > 99 ? '99+' : count}
        </span>
      )}
      <style>{`
        @keyframes notif-pulse {
          0%,100% { box-shadow: 0 0 8px rgba(239,68,68,0.6); transform: translate(0,0) scale(1); }
          50%      { box-shadow: 0 0 14px rgba(239,68,68,0.85); transform: translate(0,0) scale(1.12); }
        }
      `}</style>
    </button>
  );
}

// ─── Settings pane ────────────────────────────────────────────────────────────
function NotifSettings({ prefs, onChange, onBack }) {
  const isLight = useIsLight();
  const t = mkTheme(isLight);

  const row = (label, sub, key, type = 'toggle') => (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 16px', borderBottom:`1px solid ${t.settingsRowBorder}` }}>
      <div>
        <p style={{ fontSize:12.5, fontWeight:600, color:t.settingsLabel, margin:0 }}>{label}</p>
        {sub && <p style={{ fontSize:10.5, color:t.settingsSub, marginTop:2 }}>{sub}</p>}
      </div>
      {type === 'toggle' && (
        <button
          onClick={() => onChange({ ...prefs, [key]: !prefs[key] })}
          style={{ width:36, height:20, borderRadius:10, border:'none', cursor:'pointer', position:'relative', background: prefs[key] ? ACCENT : t.toggleOff, transition:'background 0.2s', flexShrink:0 }}>
          <span style={{ position:'absolute', top:2, left: prefs[key] ? 18 : 2, width:16, height:16, borderRadius:'50%', background:'white', transition:'left 0.2s', boxShadow:'0 1px 3px rgba(0,0,0,0.4)' }}/>
        </button>
      )}
    </div>
  );

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'13px 16px', borderBottom:`1px solid ${t.headerBorder}` }}>
        <button onClick={onBack} style={{ width:24, height:24, borderRadius:6, border:`1px solid ${t.btnBorder}`, background:t.btnBg, cursor:'pointer', color:t.textFaint, display:'flex', alignItems:'center', justifyContent:'center', transition:'all 0.15s' }}>
          <ChevronRight size={11} style={{ transform:'rotate(180deg)' }}/>
        </button>
        <span style={{ fontSize:13, fontWeight:700, color:t.headerText }}>Notification Settings</span>
      </div>
      <div style={{ flex:1, overflowY:'auto' }}>
        {row('Silent Mode', 'Suppress all notifications', 'silent')}
        {row('Sound Alerts', 'Play sounds for important alerts', 'sound')}
        {row('Toast Notifications', 'Show floating notification pop-ups', 'toasts')}
        {row('Quiet Hours', 'Silence during specified times', 'quietHoursEnabled')}
        {prefs.quietHoursEnabled && (
          <div style={{ padding:'10px 16px', borderBottom:`1px solid ${t.settingsRowBorder}`, display:'flex', gap:10, alignItems:'center' }}>
            <div style={{ flex:1 }}>
              <p style={{ fontSize:11, color:t.textFaint, marginBottom:6 }}>From</p>
              <input type="number" min={0} max={23} value={prefs.quietHoursStart}
                onChange={e => onChange({ ...prefs, quietHoursStart: Number(e.target.value) })}
                style={{ width:'100%', background:t.inputBg, border:`1px solid ${t.inputBrd}`, borderRadius:7, padding:'5px 8px', color:t.text, fontSize:12, colorScheme: isLight ? 'light' : 'dark' }}/>
            </div>
            <div style={{ flex:1 }}>
              <p style={{ fontSize:11, color:t.textFaint, marginBottom:6 }}>Until</p>
              <input type="number" min={0} max={23} value={prefs.quietHoursEnd}
                onChange={e => onChange({ ...prefs, quietHoursEnd: Number(e.target.value) })}
                style={{ width:'100%', background:t.inputBg, border:`1px solid ${t.inputBrd}`, borderRadius:7, padding:'5px 8px', color:t.text, fontSize:12, colorScheme: isLight ? 'light' : 'dark' }}/>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Notification card ────────────────────────────────────────────────────────
function NotifCard({ notif, onRead, onDismiss, onPin, onNavigate }) {
  const [hovered, setHovered] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const isLight = useIsLight();
  const t = mkTheme(isLight);
  const cfg = TYPE_CFG[notif.type] || TYPE_CFG.info;
  const { color } = cfg;
  const glow = PRIORITY_GLOW[notif.priority] || 0;

  const handleDismiss = (e) => {
    e?.stopPropagation();
    setDismissing(true);
    setTimeout(() => onDismiss(notif.id), 240);
  };

  const handleClick = () => {
    onRead(notif.id);
    if (notif.relatedPage && onNavigate) onNavigate(notif.relatedPage);
  };

  return (
    <div
      onClick={handleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        display: 'flex',
        gap: 10,
        padding: '11px 14px 11px 18px',
        borderBottom: `1px solid ${t.notifBorder}`,
        background: hovered
          ? t.itemHover
          : notif.read
            ? 'transparent'
            : `rgba(${hexToRgb(color)},0.04)`,
        cursor: notif.relatedPage ? 'pointer' : 'default',
        transition: 'background 0.15s',
        animation: dismissing ? 'notif-dismiss 0.24s ease forwards' : 'notif-enter 0.22s ease both',
        transform: hovered ? 'scale(1.005)' : 'scale(1)',
        borderLeft: notif.pinned ? `2px solid ${color}` : '2px solid transparent',
      }}>

      {/* Unread indicator */}
      {!notif.read && (
        <div style={{ position:'absolute', left:6, top:'50%', transform:'translateY(-50%)', width:5, height:5, borderRadius:'50%', background:color, boxShadow:`0 0 6px ${color}` }}/>
      )}

      {/* Priority glow */}
      {glow > 0 && !isLight && (
        <div style={{ position:'absolute', inset:0, borderRadius:0, background:`radial-gradient(ellipse at left,${color}${Math.round(glow*100).toString(16).padStart(2,'0')} 0%,transparent 70%)`, pointerEvents:'none' }}/>
      )}

      {/* Icon */}
      <div style={{ width:32, height:32, borderRadius:10, background:`${color}16`, border:`1px solid ${color}28`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginTop:1 }}>
        <cfg.Icon size={14} color={color}/>
      </div>

      {/* Content */}
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:6 }}>
          <p style={{ fontSize:12.5, fontWeight:notif.read ? 500 : 700, color:notif.read ? t.textMuted : t.text, lineHeight:1.35, margin:0 }}>
            {notif.title}
          </p>
          <span style={{ fontSize:9.5, color:t.textMicro, whiteSpace:'nowrap', flexShrink:0, marginTop:1, fontVariantNumeric:'tabular-nums' }}>
            {relTime(notif.timestamp)}
          </span>
        </div>

        {notif.description && (
          <p style={{ fontSize:11, color:t.textFaint, marginTop:3, lineHeight:1.5, margin:'3px 0 0' }}>
            {notif.description}
          </p>
        )}

        {/* Action buttons */}
        {(notif.actions?.length > 0 || notif.relatedPage) && hovered && (
          <div style={{ display:'flex', gap:5, marginTop:7, flexWrap:'wrap' }}>
            {notif.relatedPage && (
              <button
                onClick={e => { e.stopPropagation(); onRead(notif.id); if (onNavigate) onNavigate(notif.relatedPage); }}
                style={{ display:'flex', alignItems:'center', gap:4, fontSize:10.5, fontWeight:600, padding:'3px 8px', borderRadius:6, border:`1px solid ${color}30`, background:`${color}14`, color, cursor:'pointer', transition:'all 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.background=`${color}24`; }}
                onMouseLeave={e => { e.currentTarget.style.background=`${color}14`; }}>
                <ExternalLink size={8}/>Open
              </button>
            )}
            {(notif.actions || []).map((act, i) => (
              <button key={i} onClick={e => { e.stopPropagation(); act.onClick?.(); }}
                style={{ fontSize:10.5, fontWeight:600, padding:'3px 8px', borderRadius:6, border:`1px solid ${t.btnBorder}`, background:t.btnBg, color:t.btnText, cursor:'pointer', transition:'all 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.background=t.btnHoverBg; e.currentTarget.style.color=t.btnTextHover; }}
                onMouseLeave={e => { e.currentTarget.style.background=t.btnBg; e.currentTarget.style.color=t.btnText; }}>
                {act.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Hover controls */}
      {hovered && (
        <div style={{ display:'flex', flexDirection:'column', gap:3, flexShrink:0 }}>
          <button onClick={e => { e.stopPropagation(); onPin(notif.id); }}
            title={notif.pinned ? 'Unpin' : 'Pin'}
            style={{ width:20, height:20, borderRadius:5, border:'none', background:t.pinBg, cursor:'pointer', color: notif.pinned ? color : t.pinText, display:'flex', alignItems:'center', justifyContent:'center', transition:'all 0.15s' }}>
            <Pin size={9}/>
          </button>
          <button onClick={handleDismiss}
            title="Dismiss"
            style={{ width:20, height:20, borderRadius:5, border:'none', background:t.pinBg, cursor:'pointer', color:t.pinText, display:'flex', alignItems:'center', justifyContent:'center', transition:'all 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.color='#f87171'; e.currentTarget.style.background='rgba(248,113,113,0.12)'; }}
            onMouseLeave={e => { e.currentTarget.style.color=t.pinText; e.currentTarget.style.background=t.pinBg; }}>
            <X size={9}/>
          </button>
        </div>
      )}

      <style>{`
        @keyframes notif-enter   { from{opacity:0;transform:translateX(8px)} to{opacity:1;transform:translateX(0)} }
        @keyframes notif-dismiss { from{opacity:1;transform:translateX(0)}   to{opacity:0;transform:translateX(12px);max-height:0;padding:0;margin:0} }
      `}</style>
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────
export default function NotificationCentre({ onClose, onNavigate }) {
  const [notifs,    setNotifs]    = useState(() => loadNotifs());
  const [activeTab, setActiveTab] = useState('all');
  const [showPrefs, setShowPrefs] = useState(false);
  const [prefs,     setPrefs]     = useState(() => loadPrefs());
  const panelRef = useRef(null);
  const isLight  = useIsLight();
  const t        = mkTheme(isLight);

  // Subscribe to global pushes
  useEffect(() => {
    const fn = (list) => setNotifs([...list]);
    _panelListeners.add(fn);
    return () => _panelListeners.delete(fn);
  }, []);

  // Subscribe to IPC events
  useEffect(() => {
    const subs = [];
    const sub = (fn) => { if (fn) subs.push(fn); };

    sub(api.onBreakReminder?.((d) =>
      pushToast('break_reminder', `Time for a break`, `${d?.activeMins || '?'}m of focus. Step away for ${d?.duration || 10} mins.`, { priority: 'high' })
    ));
    sub(api.onSessionStopped?.((d) => {
      // This IPC path fires for sessions stopped outside Dashboard/Timer
      // (e.g. tray menu, keyboard shortcut, or API calls).
      // Dashboard.jsx and TimerPage.jsx handle their own stop notifications via
      // buildSessionEndNotif — the 60-second dedup window prevents double-firing
      // when both paths run for the same session.

      if (!d) return; // no data → skip (old preload version with no payload)

      const h = Math.floor((d.duration_seconds || 0) / 3600);
      const m = Math.round(((d.duration_seconds || 0) % 3600) / 60);
      const durLabel = d.duration_seconds
        ? (h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${Math.max(1, m)}m`)
        : null;

      // Category label
      const CAT_LABELS = {
        development:'Development', coding:'Development', research:'Research',
        design:'Design', writing:'Writing', planning:'Planning',
        meeting:'Meeting', communication:'Communication', learning:'Learning',
        data:'Data & Analytics', admin:'Admin', focus:'Focus',
      };
      const rawCat   = (d.category || '').toLowerCase();
      const catLabel = CAT_LABELS[rawCat] || (d.category
        ? d.category.charAt(0).toUpperCase() + d.category.slice(1)
        : null);

      // Title: show "Generating Event title…" during AI generation,
      //        clean app name for auto-tracked, or the actual event title.
      let notifTitle;
      if (d.titleGenerating) {
        notifTitle = 'Generating Event title…';
      } else if ((d.title || '').toLowerCase().startsWith('auto:')) {
        const appName = d.title.replace(/^auto:\s*/i, '').trim();
        notifTitle = appName
          ? `${appName.charAt(0).toUpperCase() + appName.slice(1)} — auto-tracked`
          : 'Auto-tracked session';
      } else if (d.title && d.title.trim().length > 3) {
        notifTitle = d.title.trim();
      } else {
        notifTitle = catLabel ? `${catLabel} session` : 'Session ended';
      }

      // Body: stat summary, distinct from title
      const bodyParts = [];
      if (durLabel)        bodyParts.push(durLabel);
      if (catLabel)        bodyParts.push(catLabel);
      if (d.is_deep_work)  bodyParts.push('Deep focus');
      const body = bodyParts.length ? bodyParts.join(' · ') : 'Saved to Activity';

      pushToast('session_stop', notifTitle, body, {
        relatedPage: 'activity',
        metadata: { durLabel, category: d.category, isDeepWork: d.is_deep_work },
      });
    }));
    sub(api.onTrackerHeartbeat?.((d) => {
      if (d?.inCalEvent) {
        pushNotification('tracking_paused', 'Tracking paused', `In meeting: ${d.inCalEvent.title || 'Calendar event'}`, { priority: 'normal' });
      }
    }));
    sub(api.onAiDailyScores?.((d) => {
      if (d?.overall_score >= 80) {
        pushToast('peak_detected', 'Peak performance!', `Your productivity score hit ${d.overall_score}/100 today.`, { priority: 'high', relatedPage: 'productivity' });
      }
    }));
    sub(api.onAiWorkflowSummary?.((d) => {
      if (d?.dominant) {
        pushNotification('ai_insight', 'Workflow insight', `You're in ${d.dominant} mode. ${d.recommendation || ''}`, { relatedPage: 'productivity' });
      }
    }));
    sub(api.onAiDistractionAlert?.((d) => {
      if (d?.score > 60) {
        pushToast('distraction', 'Distraction detected', `Focus is slipping. ${d.recommendation || 'Consider a short reset.'}`, { priority: 'high', relatedPage: 'blocker' });
      }
    }));
    sub(api.onTrackerIdle?.(() =>
      pushNotification('idle_detected', 'You seem idle', 'No activity detected. Timer paused.', { priority: 'low' })
    ));
    sub(api.onTrackerResume?.(() =>
      pushNotification('tracking_resumed', 'Tracking resumed', 'Welcome back — your session continues.', { priority: 'low' })
    ));

    // ── Flow state (in-app + native) ─────────────────────────────────────────
    sub(api.onSessionFlowState?.((d) => {
      pushToast('flow_state',
        `🌊 Flow State — ${d?.sessionTitle || 'Active session'}`,
        '25 minutes of deep focus. Keep going!',
        { priority: 'normal', relatedPage: 'activity' }
      );
    }));

    // ── Task notifications ────────────────────────────────────────────────────
    sub(api.onTasksDaily?.((d) => {
      if (!d?.tasks?.length) return;
      const todayCount    = d.tasks.filter(t => t.status !== 'done').length;
      const overdueCount  = d.tasks.filter(t => t.isOverdue).length;
      const dueTodayCount = d.tasks.filter(t => t.isDueToday && !t.isOverdue).length;

      let body = '';
      if (overdueCount > 0 && dueTodayCount > 0) {
        body = `${overdueCount} overdue · ${dueTodayCount} due today · ${todayCount} total pending`;
      } else if (overdueCount > 0) {
        body = `${overdueCount} overdue · ${todayCount} total pending`;
      } else if (dueTodayCount > 0) {
        body = `${dueTodayCount} due today · ${todayCount} total pending`;
      } else {
        body = `${todayCount} pending task${todayCount !== 1 ? 's' : ''} for today`;
      }

      // Build preview of top task titles
      const topTasks = d.tasks.filter(t => t.status !== 'done').slice(0, 3);
      const preview = topTasks.map(t => `· ${t.title}`).join('\n');

      pushToast('tasks_daily', `Good morning — Daily Task Digest`, body, {
        priority: overdueCount > 0 ? 'high' : 'normal',
        relatedPage: 'tasks',
        metadata: { taskCount: todayCount, overdueCount, dueTodayCount, preview },
      });
    }));

    sub(api.onTasksOverdue?.((d) => {
      if (!d?.tasks?.length) return;
      const count = d.tasks.length;
      const topTitle = d.tasks[0]?.title;
      const body = count === 1
        ? `"${topTitle}" is past its due date.`
        : `"${topTitle}" and ${count - 1} other task${count - 1 !== 1 ? 's' : ''} need attention.`;

      pushToast('task_overdue',
        count === 1 ? 'Task Overdue' : `${count} Tasks Overdue`,
        body,
        { priority: 'urgent', relatedPage: 'tasks', metadata: { tasks: d.tasks.slice(0, 5) } }
      );
    }));

    sub(api.onTasksYesterday?.((d) => {
      if (!d) return;
      const { completed = 0, pending = 0, totalTime = 0 } = d;
      if (completed === 0 && pending === 0) return;

      const timeLabel = totalTime >= 3600
        ? `${Math.round(totalTime / 360) / 10}h`
        : `${Math.round(totalTime / 60)}m`;

      const body = completed > 0
        ? `${completed} task${completed !== 1 ? 's' : ''} completed · ${timeLabel} tracked${pending > 0 ? ` · ${pending} still pending` : ''}`
        : `${pending} pending task${pending !== 1 ? 's' : ''} from yesterday still need attention.`;

      pushNotification('tasks_yesterday',
        completed > 0 ? `Yesterday: ${completed} task${completed !== 1 ? 's' : ''} done` : 'Pending tasks from yesterday',
        body,
        { priority: pending > 0 ? 'normal' : 'low', relatedPage: 'tasks' }
      );
    }));

    sub(api.onTaskDueToday?.((d) => {
      if (!d?.task) return;
      pushToast('task_due_today',
        `Due today: ${d.task.title}`,
        d.task.project_name ? `Project: ${d.task.project_name}` : 'This task is due today.',
        { priority: 'high', relatedPage: 'tasks', metadata: { taskId: d.task.id } }
      );
    }));

    return () => subs.forEach(fn => fn?.());
  }, []);

  // Click-outside close
  useEffect(() => {
    const h = (e) => { if (panelRef.current && !panelRef.current.contains(e.target)) onClose?.(); };
    document.addEventListener('mousedown', h, true);
    return () => document.removeEventListener('mousedown', h, true);
  }, [onClose]);

  // Keyboard
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const handlePrefs = (p) => { setPrefs(p); savePrefs(p); };

  const markRead     = useCallback((id) => { const u = notifs.map(n => n.id===id?{...n,read:true}:n); setNotifs(u); saveNotifs(u); }, [notifs]);
  const markAllRead  = useCallback(() => { const u = notifs.map(n=>({...n,read:true})); setNotifs(u); saveNotifs(u); }, [notifs]);
  const dismiss      = useCallback((id) => { const u = notifs.filter(n=>n.id!==id); setNotifs(u); saveNotifs(u); }, [notifs]);
  const togglePin    = useCallback((id) => { const u = notifs.map(n=>n.id===id?{...n,pinned:!n.pinned}:n); setNotifs(u); saveNotifs(u); }, [notifs]);
  const clearAll     = useCallback(() => { setNotifs([]); saveNotifs([]); }, []);

  const TABS = [
    { id: 'all',      label: 'All'      },
    { id: 'focus',    label: 'Focus'    },
    { id: 'tasks',    label: 'Tasks'    },
    { id: 'meetings', label: 'Meetings' },
    { id: 'ai',       label: 'AI'       },
    { id: 'system',   label: 'System'   },
  ];

  const filtered = useMemo(() => {
    const base = activeTab === 'all'
      ? notifs
      : notifs.filter(n => (TYPE_CFG[n.type] || TYPE_CFG.info).tab === activeTab);
    // Pinned first, then by timestamp desc
    return [...base].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.timestamp - a.timestamp);
  }, [notifs, activeTab]);

  const unread   = notifs.filter(n => !n.read).length;
  const tabCounts = useMemo(() => {
    const c = {};
    notifs.filter(n=>!n.read).forEach(n => {
      const tab = (TYPE_CFG[n.type]||TYPE_CFG.info).tab;
      c[tab] = (c[tab]||0) + 1;
    });
    return c;
  }, [notifs]);

  return (
    <div
      ref={panelRef}
      style={{
        position: 'fixed',
        top: 48,
        right: 0,
        width: 360,
        height: 'calc(100vh - 48px)',
        background: t.panelBg,
        borderLeft: `1px solid ${t.panelBorder}`,
        backdropFilter: 'blur(40px) saturate(1.5)',
        WebkitBackdropFilter: 'blur(40px) saturate(1.5)',
        boxShadow: t.panelShadow,
        zIndex: 9500,
        display: 'flex',
        flexDirection: 'column',
        animation: 'nc-slide-in 0.22s cubic-bezier(0.4,0,0.2,1) both',
      }}>
      <style>{`
        @keyframes nc-slide-in { from{opacity:0;transform:translateX(24px)} to{opacity:1;transform:translateX(0)} }
      `}</style>

      {/* Top accent line */}
      <div style={{ position:'absolute', top:0, left:0, right:0, height:1, background:`linear-gradient(90deg,transparent 5%,${ACCENT}66 40%,${ACCENT}99 60%,transparent 95%)` }}/>

      {showPrefs ? (
        <NotifSettings prefs={prefs} onChange={handlePrefs} onBack={() => setShowPrefs(false)}/>
      ) : (
        <>
          {/* ── Header ── */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 16px 10px', borderBottom:`1px solid ${t.headerBorder}`, flexShrink:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <Bell size={14} color={ACCENT}/>
              <span style={{ fontSize:14, fontWeight:700, color:t.headerText, letterSpacing:'-0.01em' }}>Notifications</span>
              {unread > 0 && (
                <span style={{ fontSize:10, fontWeight:800, background: isLight ? 'rgba(83,71,199,0.12)' : ACCENT, color: isLight ? ACCENT : 'white', borderRadius:9999, padding:'1px 7px', letterSpacing:'0.01em' }}>{unread}</span>
              )}
              {prefs.silent && (
                <span style={{ display:'flex', alignItems:'center', gap:4, fontSize:10, color:t.silentText, background:t.silentBg, borderRadius:9999, padding:'2px 8px', border:`1px solid ${t.silentBrd}` }}>
                  <BellOff size={9}/>Silent
                </span>
              )}
            </div>
            <div style={{ display:'flex', gap:4, alignItems:'center' }}>
              {unread > 0 && (
                <button onClick={markAllRead} title="Mark all read"
                  style={{ display:'flex', alignItems:'center', gap:3, fontSize:10.5, fontWeight:600, padding:'4px 8px', borderRadius:7, border:`1px solid ${t.btnBorder}`, background:t.btnBg, color:t.btnText, cursor:'pointer', transition:'all 0.15s' }}
                  onMouseEnter={e=>{e.currentTarget.style.color=t.btnTextHover;e.currentTarget.style.background=t.btnHoverBg;}}
                  onMouseLeave={e=>{e.currentTarget.style.color=t.btnText;e.currentTarget.style.background=t.btnBg;}}>
                  <CheckCheck size={10}/>Read all
                </button>
              )}
              <button onClick={() => setShowPrefs(true)} title="Settings"
                style={{ width:28, height:28, borderRadius:7, border:`1px solid ${t.btnBorder}`, background:t.btnBg, cursor:'pointer', color:t.btnText, display:'flex', alignItems:'center', justifyContent:'center', transition:'all 0.15s' }}
                onMouseEnter={e=>{e.currentTarget.style.color=t.btnTextHover;e.currentTarget.style.background=t.btnHoverBg;}}
                onMouseLeave={e=>{e.currentTarget.style.color=t.btnText;e.currentTarget.style.background=t.btnBg;}}>
                <Settings2 size={11}/>
              </button>
              <button onClick={onClose} title="Close (Esc)"
                style={{ width:28, height:28, borderRadius:7, border:`1px solid ${t.btnBorder}`, background:t.btnBg, cursor:'pointer', color:t.btnText, display:'flex', alignItems:'center', justifyContent:'center', transition:'all 0.15s' }}
                onMouseEnter={e=>{e.currentTarget.style.color=t.btnTextHover;e.currentTarget.style.background=t.btnHoverBg;}}
                onMouseLeave={e=>{e.currentTarget.style.color=t.btnText;e.currentTarget.style.background=t.btnBg;}}>
                <X size={11}/>
              </button>
            </div>
          </div>

          {/* ── Tabs ── */}
          <div style={{ display:'flex', gap:2, padding:'8px 12px', borderBottom:`1px solid ${t.divider}`, flexShrink:0, overflowX:'auto' }}>
            {TABS.map(({ id, label }) => {
              const cnt = id === 'all' ? unread : (tabCounts[id] || 0);
              const active = activeTab === id;
              return (
                <button key={id} onClick={() => setActiveTab(id)}
                  style={{ display:'flex', alignItems:'center', gap:5, fontSize:11.5, fontWeight:600, padding:'5px 10px', borderRadius:8, border: active ? `1px solid ${ACCENT}40` : '1px solid transparent', background: active ? `${ACCENT}18` : 'transparent', color: active ? ACCENT : t.tabInactive, cursor:'pointer', transition:'all 0.15s', whiteSpace:'nowrap' }}
                  onMouseEnter={e => { if (!active) { e.currentTarget.style.background=t.tabHoverBg; e.currentTarget.style.color=t.tabHoverText; } }}
                  onMouseLeave={e => { if (!active) { e.currentTarget.style.background='transparent'; e.currentTarget.style.color=t.tabInactive; } }}>
                  {label}
                  {cnt > 0 && (
                    <span style={{ fontSize:9, fontWeight:800, minWidth:14, height:14, borderRadius:9999, background: active ? (isLight ? 'rgba(83,71,199,0.18)' : ACCENT) : (isLight ? 'rgba(83,71,199,0.10)' : 'rgba(255,255,255,0.12)'), color: isLight ? ACCENT : (active ? 'white' : 'rgba(255,255,255,0.75)'), display:'flex', alignItems:'center', justifyContent:'center', padding:'0 4px' }}>{cnt > 99 ? '99+' : cnt}</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* ── List ── */}
          <div style={{ flex:1, overflowY:'auto', scrollbarWidth:'thin', scrollbarColor:t.scrollbar }}>
            {filtered.length === 0 ? (
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'48px 20px', gap:10, textAlign:'center' }}>
                <div style={{ width:44, height:44, borderRadius:13, background:t.emptyIconBg, border:`1px solid ${t.emptyIconBrd}`, display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <Bell size={20} color={t.emptyText}/>
                </div>
                <p style={{ fontSize:13, fontWeight:600, color:t.emptyText, margin:0 }}>
                  {activeTab === 'all' ? 'No notifications yet' : `No ${activeTab} notifications`}
                </p>
                <p style={{ fontSize:11, color:t.emptySubtext, maxWidth:200, lineHeight:1.5, margin:0 }}>
                  Session events, AI insights, and reminders will appear here.
                </p>
              </div>
            ) : (
              filtered.map(n => (
                <NotifCard
                  key={n.id} notif={n}
                  onRead={markRead} onDismiss={dismiss}
                  onPin={togglePin} onNavigate={onNavigate}/>
              ))
            )}
          </div>

          {/* ── Footer ── */}
          {notifs.length > 0 && (
            <div style={{ borderTop:`1px solid ${t.divider}`, padding:'9px 14px', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
              <span style={{ fontSize:10.5, color:t.footerText }}>
                {notifs.length} notification{notifs.length !== 1 ? 's' : ''}
              </span>
              <button onClick={clearAll}
                style={{ display:'flex', alignItems:'center', gap:4, fontSize:10.5, fontWeight:600, padding:'4px 8px', borderRadius:6, border:`1px solid ${t.clearBorder}`, background:t.clearBg, color:t.clearText, cursor:'pointer', transition:'all 0.15s' }}
                onMouseEnter={e=>{e.currentTarget.style.background=t.clearHoverBg;e.currentTarget.style.color='#f87171';}}
                onMouseLeave={e=>{e.currentTarget.style.background=t.clearBg;e.currentTarget.style.color=t.clearText;}}>
                <Trash2 size={9}/>Clear all
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function hexToRgb(hex) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `${r},${g},${b}`;
}
