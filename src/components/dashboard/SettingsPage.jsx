import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Activity, AlertCircle, AlertTriangle, ArrowRight, Ban, Bell, Brain,
  Calendar, Check, CheckCircle2, ChevronDown, ChevronRight, ChevronUp, Chrome, Clock,
  Cloud, Download, Eye, EyeOff, Filter, Globe, Hash,
  Info, Keyboard, Layers, Link, Loader2, Mail, Monitor,
  Moon, Palette, Plus, Power, RefreshCw, Repeat, Search,
  ShieldCheck, SlidersHorizontal, Smartphone, Sparkles, Sun,
  Tag, Target, Timer, Trash2, User, Volume2, VolumeX, X, Zap,
} from 'lucide-react';
import { useAuth } from '../../App';
import { isSupabaseEnabled } from '../../utils/supabase';
import logoSrc from '../../assets/logo.png';
import { useUpdater, fmtCheckTime } from '../shared/UpdateManager';

const api = window.electron || {};

// ── Preferences store ──────────────────────────────────────────────────────────
const FL_PREFS_KEY = 'fl_prefs';
const DEFAULT_PREFS = {
  // General › Appearance
  themeMode: 'dark',        // 'light' | 'dark' | 'system'
  accentColor: '#7c6cf2',
  density: 'comfortable',   // 'compact' | 'comfortable'
  reduceMotion: false,
  // General › Window
  minimizeToTray: true,
  closeToTray: false,
  // General › Date & Time
  timeFormat: '12h',        // '12h' | '24h'
  dateFormat: 'MMM D',      // 'MMM D' | 'DD/MM' | 'MM/DD' | 'YYYY-MM-DD'
  weekStart: 'mon',         // 'sun' | 'mon'
  // General › Interface
  sidebarBehavior: 'manual', // 'manual' | 'auto'
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

function loadPrefs() {
  try {
    const stored = JSON.parse(localStorage.getItem(FL_PREFS_KEY) || '{}');
    // For 'system' intent, preserve that choice — the matchMedia effect
    // in the component will apply the correct resolved theme.
    if (stored.themeMode === 'system') {
      return { ...DEFAULT_PREFS, ...stored, themeMode: 'system' };
    }
    // For explicit light/dark, read the ACTUAL active theme from the DOM
    // (set by App.js) so the Seg control always reflects what's on screen,
    // even if fl_theme localStorage is stale from a previous session.
    const activeTheme = document.documentElement.classList.contains('theme-light')
      ? 'light'
      : document.documentElement.classList.contains('theme-dark')
        ? 'dark'
        : (localStorage.getItem('fl_theme') || DEFAULT_PREFS.themeMode);
    return { ...DEFAULT_PREFS, ...stored, themeMode: activeTheme };
  } catch {
    const activeTheme = document.documentElement.classList.contains('theme-light') ? 'light' : 'dark';
    return { ...DEFAULT_PREFS, themeMode: activeTheme };
  }
}

// ── Accent color presets ───────────────────────────────────────────────────────
const ACCENT_COLORS = [
  { label: 'Violet',  value: '#7c6cf2' },
  { label: 'Indigo',  value: '#6366f1' },
  { label: 'Blue',    value: '#3b82f6' },
  { label: 'Cyan',    value: '#06b6d4' },
  { label: 'Emerald', value: '#10b981' },
  { label: 'Amber',   value: '#f59e0b' },
  { label: 'Rose',    value: '#f43f5e' },
  { label: 'Pink',    value: '#ec4899' },
];

const COLORS = ['#6366f1','#8b5cf6','#3b82f6','#10b981','#f59e0b','#ef4444','#ec4899','#7c6cf2','#6b7280'];
const TYPES  = [
  { value: 'focus',   label: 'Focus',   color: '#10b981' },
  { value: 'meeting', label: 'Meeting', color: '#8b5cf6' },
  { value: 'break',   label: 'Break',   color: '#f59e0b' },
  { value: 'other',   label: 'Other',   color: '#6b7280' },
];

// ── Nav sections (9 total) ─────────────────────────────────────────────────────
const NAV_SECTIONS = [
  { id: 'general',      label: 'General',              Icon: SlidersHorizontal, desc: 'Appearance, window, date & time',         color: '#7c6cf2' },
  { id: 'tracking',     label: 'Tracking & Activity',  Icon: Activity,          desc: 'Auto-tracking, idle, intelligence',        color: '#10b981' },
  { id: 'calendar',     label: 'Calendar',             Icon: Calendar,          desc: 'Connections, sync, display',               color: '#a78bfa' },
  { id: 'focus',        label: 'Focus Sessions',        Icon: Timer,             desc: 'Timer presets, dock, Pomodoro',            color: '#f59e0b' },
  { id: 'notifs',       label: 'Notifications',         Icon: Bell,              desc: 'Alerts, reminders, sounds',                color: '#3b82f6' },
  { id: 'shortcuts',    label: 'Shortcuts',             Icon: Keyboard,          desc: 'Global hotkeys and automation',            color: '#06b6d4' },
  { id: 'categories',   label: 'Categories',            Icon: Tag,               desc: 'Session types, tags, colors',              color: '#fb923c' },
  { id: 'integrations', label: 'Integrations',          Icon: Layers,            desc: 'Chrome extension, cloud sync',             color: '#3b82f6' },
  { id: 'updates',      label: 'About & Updates',       Icon: Download,          desc: 'Version info, changelog, update channel',  color: '#7c6cf2' },
  { id: 'privacy',      label: 'Privacy & Security',    Icon: ShieldCheck,       desc: 'Data controls and factory reset',          color: '#ef4444' },
];

const SEARCH_INDEX = [
  { section:'general',    label:'Theme — Light / Dark / System', desc:'Choose your workspace appearance or sync with OS' },
  { section:'general',    label:'Compact / Comfortable density', desc:'Adjust spacing and element size' },
  { section:'general',    label:'Reduce motion',                 desc:'Disable animations and transitions' },
  { section:'general',    label:'Sidebar animation',             desc:'Animate the sidebar when it expands or collapses' },
  { section:'general',    label:'Minimize to tray',              desc:'Keep running in background when minimized' },
  { section:'general',    label:'Close to tray',                 desc:'Don\'t quit on window close' },
  { section:'general',    label:'Time format — 12h / 24h',       desc:'How times are displayed throughout the app' },
  { section:'general',    label:'Date format',                   desc:'Choose your preferred date display style' },
  { section:'general',    label:'Week start day',                desc:'Sunday or Monday first in calendar views' },
  { section:'general',    label:'Sidebar behavior',              desc:'Manual or auto-collapsing sidebar' },
  { section:'general',    label:'Remember last page',            desc:'Reopen the last visited page on launch' },
  { section:'tracking',   label:'Auto-track active window',      desc:'Record every app and website automatically' },
  { section:'tracking',   label:'Launch tracker at login',       desc:'Start background tracker at system startup' },
  { section:'tracking',   label:'Idle detection threshold',      desc:'Seconds of inactivity before pausing timer' },
  { section:'tracking',   label:'Auto-pause when inactive',      desc:'Automatically pause session on idle' },
  { section:'tracking',   label:'Auto-resume tracking',          desc:'Resume automatically when activity resumes' },
  { section:'tracking',   label:'Minimum session duration',      desc:'Ignore sessions shorter than N seconds' },
  { section:'tracking',   label:'App blacklist',                 desc:'Apps to exclude from tracking' },
  { section:'tracking',   label:'Website blacklist',             desc:'Sites to exclude from Chrome tracking' },
  { section:'tracking',   label:'Private mode apps',            desc:'Apps tracked but not shown in analytics' },
  { section:'tracking',   label:'Focus scoring',                 desc:'Enable AI-powered focus quality score' },
  { section:'tracking',   label:'Deep work threshold',           desc:'Minutes of uninterrupted work to qualify as deep work' },
  { section:'tracking',   label:'Distraction sensitivity',       desc:'How aggressively to flag distracting apps' },
  { section:'tracking',   label:'Context switching sensitivity', desc:'Detect and penalize rapid app switching' },
  { section:'calendar',   label:'Calendar connections',          desc:'Google, Outlook, Apple Calendar feed connections' },
  { section:'calendar',   label:'Sync frequency',               desc:'How often to refresh calendar events' },
  { section:'calendar',   label:'Auto-create focus events',      desc:'Write focus sessions back to calendar' },
  { section:'calendar',   label:'Default calendar view',         desc:'Week, day, or month view on open' },
  { section:'calendar',   label:'Timezone',                      desc:'Override or auto-detect timezone' },
  { section:'focus',      label:'Focus timer duration',          desc:'Default Pomodoro or focus block length' },
  { section:'focus',      label:'Break timer presets',           desc:'Short and long break durations' },
  { section:'focus',      label:'Pomodoro mode',                 desc:'Automatic work/break rotation' },
  { section:'focus',      label:'Focus dock position',           desc:'Where the floating session dock appears' },
  { section:'focus',      label:'Smart nudges',                  desc:'Gentle focus reminders during sessions' },
  { section:'notifs',     label:'Desktop notifications',         desc:'System-level alerts from Flow Ledger' },
  { section:'notifs',     label:'Notification sound',            desc:'Play a sound with alerts' },
  { section:'notifs',     label:'Daily summary',                 desc:'End-of-day productivity recap notification' },
  { section:'notifs',     label:'Break reminders',               desc:'Remind you to take breaks' },
  { section:'notifs',     label:'Meeting reminders',             desc:'Alert before upcoming calendar events' },
  { section:'shortcuts',  label:'Start / stop tracking hotkey',  desc:'Global shortcut to toggle tracking' },
  { section:'shortcuts',  label:'Focus mode shortcut',           desc:'Shortcut to enter focus mode' },
  { section:'shortcuts',  label:'Command palette shortcut',      desc:'Open the command palette from anywhere' },
  { section:'shortcuts',  label:'Quick capture shortcut',        desc:'Log time or add a session quickly' },
  { section:'categories', label:'Session categories',            desc:'Tag and color-code your time blocks' },
  { section:'integrations',label:'Chrome Extension',             desc:'Per-website tracking inside Chrome' },
  { section:'integrations',label:'Cloud Sync',                   desc:'Optional cloud backup' },
  { section:'privacy',    label:'Reset all data',                desc:'Factory reset — wipe all sessions and settings' },
];

// Calendar provider data
const PROVIDER_META = {
  google:  { label: 'Google Calendar',  Icon: Calendar },
  outlook: { label: 'Outlook Calendar', Icon: Mail },
  apple:   { label: 'Apple Calendar',   Icon: Smartphone },
  ical:    { label: 'Custom iCal',      Icon: Link },
};
const CAL_PROVIDERS = [
  { id: 'google',  name: 'Google Calendar',  color: '#4285f4' },
  { id: 'outlook', name: 'Outlook / Office', color: '#0072c6' },
  { id: 'apple',   name: 'Apple Calendar',   color: '#555555' },
  { id: 'ical',    name: 'Custom iCal URL',  color: '#6366f1' },
];
const CAL_INSTRUCTIONS = {
  google:  ['Open Google Calendar on desktop','Click ⚙ Settings → your calendar → Integrate calendar','Copy the "Secret address in iCal format" URL'],
  outlook: ['Sign in to Outlook on the web','Open Calendar → right-click calendar → Share → ICS link','Copy the ICS URL shown'],
  apple:   ['Open Calendar app on Mac','File → Export or right-click → Share → Copy ICS URL','Paste the resulting webcal:// or https:// URL below'],
  ical:    ['Find the iCal/ICS feed URL for your service','It usually ends in .ics','Paste the full URL below'],
};

// ── CalConnectDialog ───────────────────────────────────────────────────────────
function CalConnectDialog({ onClose, onSave }) {
  const [provider, setProvider] = useState('google');
  const [label, setLabel]       = useState('');
  const [icsUrl, setIcsUrl]     = useState('');
  const [color, setColor]       = useState('#4285f4');
  const [step, setStep]         = useState(1);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');

  const save = async () => {
    if (!icsUrl.trim()) return;
    setSaving(true); setError('');
    try {
      const url = icsUrl.trim().replace(/^webcal:\/\//i, 'https://');
      await onSave({ provider, label: label || CAL_PROVIDERS.find(p => p.id === provider)?.name, icsUrl: url, color });
      onClose();
    } catch (err) {
      setError(err?.message || 'Could not connect. Check the URL and try again.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="fl-cal-dialog w-[480px] rounded-2xl overflow-hidden shadow-2xl"
        style={{ background: 'var(--st-card-bg)', border: '1px solid var(--st-divider)' }}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom:'1px solid var(--st-divider)' }}>
          <div className="flex items-center gap-2">
            <Calendar size={15} className="text-violet-400" />
            <h2 className="text-sm font-bold" style={{ color:'var(--st-text)' }}>Connect Calendar</h2>
          </div>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg text-tx-faint transition hover:bg-white/[0.07] hover:text-white">
            <X size={14} />
          </button>
        </div>
        <div className="p-6 space-y-4">
          {step === 1 ? (
            <>
              <p className="text-xs text-tx-secondary">Choose your calendar provider. Flow Ledger imports events via a private calendar feed URL — no account login required.</p>
              <div className="grid grid-cols-2 gap-2">
                {CAL_PROVIDERS.map(p => {
                  const PIcon = PROVIDER_META[p.id]?.Icon;
                  return (
                    <button key={p.id} onClick={() => { setProvider(p.id); setColor(p.color); }}
                      className="flex items-center gap-2.5 rounded-xl p-3 text-left transition-all"
                      style={{ border:`1px solid ${provider===p.id?'rgba(124,108,242,0.45)':'var(--st-divider)'}`, background:provider===p.id?'rgba(124,108,242,0.12)':'var(--st-item-bg)', color:provider===p.id?'var(--st-text)':'var(--st-text-muted)' }}>
                      {PIcon && <PIcon size={14} style={{ color: p.color }} />}
                      <span className="text-xs font-semibold">{p.name}</span>
                    </button>
                  );
                })}
              </div>
              <button onClick={() => setStep(2)} className="w-full rounded-xl py-2.5 text-sm font-bold text-white transition hover:brightness-110"
                style={{ background:'linear-gradient(135deg,var(--color-accent),#6b6dff)', boxShadow:'0 4px 14px rgba(124,108,242,0.30)' }}>
                Next — Get Calendar URL →
              </button>
            </>
          ) : (
            <>
              <div className="rounded-xl p-4" style={{ background:'var(--st-item-bg)', border:'1px solid var(--st-divider)' }}>
                <p className="text-[10px] text-tx-faint uppercase tracking-wider font-bold mb-2.5">How to get your {PROVIDER_META[provider]?.label} URL</p>
                <ol className="space-y-2">
                  {(CAL_INSTRUCTIONS[provider] || []).map((s, i) => (
                    <li key={i} className="flex gap-2.5 text-xs text-tx-secondary">
                      <span className="flex h-4 w-4 shrink-0 mt-0.5 items-center justify-center rounded-full text-[9px] font-bold text-white" style={{ background:'rgba(124,108,242,0.30)' }}>{i+1}</span>
                      {s}
                    </li>
                  ))}
                </ol>
              </div>
              <div>
                <label className="mb-1.5 block text-[10px] text-tx-faint uppercase tracking-wider font-bold">Calendar Name (optional)</label>
                <input value={label} onChange={e => setLabel(e.target.value)} placeholder={PROVIDER_META[provider]?.label}
                  className="w-full rounded-xl px-3 py-2 text-xs placeholder-tx-faint outline-none" style={{ color:'var(--st-text)', background:'var(--st-input-bg)', border:'1px solid var(--st-input-brd)' }} />
              </div>
              <div>
                <label className="mb-1.5 block text-[10px] text-tx-faint uppercase tracking-wider font-bold">Calendar Feed URL *</label>
                <input value={icsUrl} onChange={e => setIcsUrl(e.target.value)} placeholder="https://calendar.google.com/calendar/ical/…"
                  className="w-full rounded-xl px-3 py-2 text-xs placeholder-tx-faint outline-none font-mono" style={{ color:'var(--st-text)', background:'var(--st-input-bg)', border:'1px solid var(--st-input-brd)' }} />
              </div>
              {error && (
                <div className="flex items-start gap-2 rounded-xl px-3 py-2.5" style={{ background:'rgba(239,68,68,0.10)', border:'1px solid rgba(239,68,68,0.25)' }}>
                  <AlertCircle size={13} className="shrink-0 mt-0.5 text-red-400" />
                  <p className="text-[11px] text-red-300 leading-relaxed">{error}</p>
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={() => setStep(1)} className="flex-1 rounded-xl py-2.5 text-sm font-semibold transition"
                  style={{ background:'var(--st-ctrl-bg)', border:'1px solid var(--st-ctrl-brd)', color:'var(--st-text-muted)' }}>← Back</button>
                <button onClick={save} disabled={!icsUrl.trim()||saving} className="flex-1 rounded-xl py-2.5 text-sm font-bold text-white transition disabled:opacity-40 hover:brightness-110"
                  style={{ background:'linear-gradient(135deg,var(--color-accent),#6b6dff)', boxShadow:'0 4px 14px rgba(124,108,242,0.28)' }}>
                  {saving ? 'Connecting…' : 'Connect & Sync'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Reusable UI atoms ──────────────────────────────────────────────────────────
// ─── About & Updates section ──────────────────────────────────────────────────
function AboutUpdatesSection() {
  const updater = useUpdater();
  const [localChecking, setLocalChecking] = useState(false);
  const [localResult, setLocalResult]     = useState(null); // null | 'upToDate' | 'error'
  const [showNotes, setShowNotes]         = useState(false);

  // Sync local checking state with updater phase
  const isChecking = localChecking || updater?.phase === 'checking';

  const handleCheck = async () => {
    setLocalChecking(true);
    setLocalResult(null);
    const result = await updater?.check();
    // IPC events update the context; handle dev-mode stub result here
    if (result?.dev) setLocalResult('upToDate');
    else if (result?.ok === false) setLocalResult('error');
    setLocalChecking(false);
  };

  const handleChannelChange = async (ch) => {
    await updater?.setChannel(ch);
  };

  // Show "up to date" after a check with no update found
  const upToDate = localResult === 'upToDate' ||
    (updater?.phase === 'idle' && updater?.lastCheckAt && !updater?.updateInfo);

  const cv = updater?.currentVersion || '—';
  const lv = updater?.updateInfo?.version;

  return (
    <>
      {/* Version card */}
      <SettingCard title="About Flow Ledger" desc="Application version and update status" icon={Download} accent="#7c6cf2">
        {/* App identity row */}
        <div className="flex items-center gap-4 pb-4 mb-2" style={{ borderBottom: '1px solid var(--st-divider-sm)' }}>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
            style={{ background: 'linear-gradient(135deg,#7c6cf2,#9D8FF5)', boxShadow: '0 6px 20px rgba(124,108,242,0.38)' }}>
            <Zap size={22} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-extrabold" style={{ color: 'var(--st-text)' }}>Flow Ledger</p>
            <p className="text-[11.5px] text-tx-faint mt-0.5">Local-first productivity workspace</p>
          </div>
          {/* Status badge */}
          {updater?.phase === 'downloaded' ? (
            <span className="text-[10px] font-bold px-2.5 py-1 rounded-full" style={{ background: 'rgba(16,185,129,0.14)', color: '#34d399', border: '1px solid rgba(16,185,129,0.28)' }}>
              Ready to install
            </span>
          ) : lv ? (
            <span className="text-[10px] font-bold px-2.5 py-1 rounded-full" style={{ background: 'rgba(124,108,242,0.14)', color: '#a78bfa', border: '1px solid rgba(124,108,242,0.28)' }}>
              Update available
            </span>
          ) : upToDate ? (
            <span className="text-[10px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5" style={{ background: 'rgba(16,185,129,0.10)', color: '#34d399', border: '1px solid rgba(16,185,129,0.22)' }}>
              <span className="h-1.5 w-1.5 rounded-full bg-green-400" />Up to date
            </span>
          ) : null}
        </div>

        {/* Version rows */}
        <SettingRow label="Current version" desc="Installed version of Flow Ledger.">
          <span className="font-mono text-[13px] font-bold" style={{ color: 'var(--st-text)' }}>v{cv}</span>
        </SettingRow>

        {lv && (
          <SettingRow label="Latest version" desc="New version available for download.">
            <span className="font-mono text-[13px] font-bold" style={{ color: '#a78bfa' }}>v{lv}</span>
          </SettingRow>
        )}

        <SettingRow label="Last checked" desc="When Flow Ledger last checked for updates.">
          <span className="text-[12.5px] font-medium" style={{ color: 'var(--st-text)' }}>
            {fmtCheckTime(updater?.lastCheckAt)}
          </span>
        </SettingRow>

        {/* Check / Download / Install button */}
        <SettingRow label="Software updates" desc="Check for the latest version of Flow Ledger." last>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {updater?.phase === 'downloaded' ? (
              <button onClick={() => updater?.install()}
                className="flex items-center gap-2 rounded-xl px-4 py-1.5 text-[12px] font-bold text-white transition hover:brightness-110"
                style={{ background: 'linear-gradient(135deg,#10b981,#34d399)', boxShadow: '0 4px 14px rgba(16,185,129,0.30)' }}>
                <ArrowRight size={12} strokeWidth={2.5} />Restart & Install
              </button>
            ) : updater?.phase === 'available' || lv ? (
              <button onClick={() => updater?.download()}
                className="flex items-center gap-2 rounded-xl px-4 py-1.5 text-[12px] font-bold text-white transition hover:brightness-110"
                style={{ background: 'linear-gradient(135deg,#7c6cf2,#9D8FF5)', boxShadow: '0 4px 14px rgba(124,108,242,0.30)' }}>
                <Download size={12} strokeWidth={2.5} />Download v{lv}
              </button>
            ) : (
              <button onClick={handleCheck} disabled={isChecking}
                className="flex items-center gap-2 rounded-xl px-4 py-1.5 text-[12px] font-bold transition hover:brightness-110 disabled:opacity-60"
                style={{ background: 'var(--st-ctrl-bg)', border: '1px solid var(--st-ctrl-brd)', color: 'var(--st-text)' }}>
                {isChecking
                  ? <><Loader2 size={12} className="animate-spin" />Checking…</>
                  : <><RefreshCw size={12} />Check for Updates</>}
              </button>
            )}
            {localResult === 'error' && updater?.phase === 'error' && (
              <span className="text-[11px] text-red-400">Check failed — try again</span>
            )}
          </div>
        </SettingRow>
      </SettingCard>

      {/* Update channel card */}
      <SettingCard title="Update Channel" desc="Choose between stable releases and early access" icon={Zap} accent="#f59e0b">
        <SettingRow label="Release channel" desc="Stable receives tested releases. Beta gets new features earlier — may contain bugs." last>
          <div className="flex items-center gap-2">
            {[{ value: 'stable', label: 'Stable', desc: 'Tested' }, { value: 'beta', label: 'Beta', desc: 'Early access' }].map(opt => (
              <button key={opt.value}
                onClick={() => handleChannelChange(opt.value)}
                className="flex flex-col items-center rounded-xl px-4 py-2 text-[11.5px] font-semibold transition"
                style={{
                  background: updater?.channel === opt.value ? 'rgba(124,108,242,0.18)' : 'var(--st-ctrl-bg)',
                  border: updater?.channel === opt.value ? '1px solid rgba(124,108,242,0.40)' : '1px solid var(--st-ctrl-brd)',
                  color: updater?.channel === opt.value ? '#c4b5fd' : 'var(--st-text)',
                }}>
                <span className="font-bold">{opt.label}</span>
                <span className="text-[9px] font-normal mt-0.5" style={{ color: updater?.channel === opt.value ? '#a78bfa' : 'var(--tx-faint,#555)' }}>{opt.desc}</span>
              </button>
            ))}
          </div>
        </SettingRow>
      </SettingCard>

      {/* Release notes card */}
      {updater?.updateInfo?.releaseNotes && (
        <SettingCard title="Release Notes" desc={`What's new in v${updater.updateInfo.version}`} icon={Info} accent="#06b6d4">
          <div style={{ padding: 0 }}>
            <div className="rounded-xl p-4 text-[12px] leading-relaxed whitespace-pre-wrap"
              style={{
                color: 'var(--st-text)', background: 'var(--st-ctrl-bg)',
                border: '1px solid var(--st-ctrl-brd)',
                maxHeight: showNotes ? 600 : 160, overflow: 'hidden',
                transition: 'max-height 0.25s ease',
              }}>
              {updater.updateInfo.releaseNotes}
            </div>
            {updater.updateInfo.releaseNotes.length > 300 && (
              <button onClick={() => setShowNotes(v => !v)}
                className="mt-2 text-[11px] font-semibold flex items-center gap-1 transition"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7c6cf2', padding: 0 }}
                onMouseOver={e => e.currentTarget.style.color = '#a78bfa'}
                onMouseOut={e => e.currentTarget.style.color = '#7c6cf2'}>
                {showNotes ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                {showNotes ? 'Collapse' : 'Expand full changelog'}
              </button>
            )}
          </div>
        </SettingCard>
      )}

      {/* Data safety notice */}
      <SettingCard title="Update Safety" desc="Your data is always preserved during updates" icon={ShieldCheck} accent="#10b981">
        <div className="space-y-2.5">
          {[
            { label: 'Sessions, tasks & projects preserved', desc: 'All tracked data in the SQLite database is never touched by the installer.' },
            { label: 'Settings and preferences kept', desc: 'Your workspace configuration, themes, and shortcuts carry over unchanged.' },
            { label: 'Zero manual reinstallation', desc: 'Updates install silently and relaunch Flow Ledger automatically.' },
          ].map(item => (
            <div key={item.label} className="flex items-start gap-3 rounded-xl px-4 py-3.5"
              style={{ background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.14)' }}>
              <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                style={{ background: 'rgba(16,185,129,0.22)', border: '1px solid rgba(16,185,129,0.32)' }}>
                <Check size={10} className="text-green-400" strokeWidth={3.5} />
              </div>
              <div>
                <p className="text-[12.5px] font-bold" style={{ color: 'var(--st-text)' }}>{item.label}</p>
                <p className="mt-0.5 text-[11px] text-tx-faint leading-relaxed">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </SettingCard>
    </>
  );
}

function SettingCard({ title, desc, icon: Icon, accent = '#7c6cf2', badge, children }) {
  return (
    <div className="fl-setting-card rounded-2xl overflow-hidden"
      style={{ background:'var(--st-card-bg)', border:'1px solid var(--st-divider)', boxShadow:'var(--st-card-shadow)' }}>
      <div className="flex items-center justify-between px-5 py-4"
        style={{ background:'var(--st-card-hdr-bg)', borderBottom:'1px solid var(--st-divider-sm)' }}>
        <div className="flex items-center gap-3">
          {Icon && (
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"
              style={{ background:`${accent}18`, border:`1px solid ${accent}30` }}>
              <Icon size={15} style={{ color: accent }} />
            </div>
          )}
          <div>
            <h3 className="text-[13.5px] font-bold" style={{ color:'var(--st-text)' }}>{title}</h3>
            {desc && <p className="mt-0.5 text-[11px] text-tx-faint">{desc}</p>}
          </div>
        </div>
        {badge}
      </div>
      <div className="px-5 py-5">{children}</div>
    </div>
  );
}

function SettingRow({ label, desc, children, last = false, full = false }) {
  const rowBorder = !last ? { borderBottom:'1px solid var(--st-divider-xs)' } : {};
  if (full) return (
    <div className="py-4" style={rowBorder}>
      <div className="mb-3">
        <p className="text-[13px] font-medium" style={{ color:'var(--st-text)' }}>{label}</p>
        {desc && <p className="mt-0.5 text-[11px] leading-relaxed text-tx-faint">{desc}</p>}
      </div>
      {children}
    </div>
  );
  return (
    <div className="flex items-center justify-between py-3.5" style={rowBorder}>
      <div className="flex-1 min-w-0 pr-8">
        <p className="text-[13px] font-medium" style={{ color:'var(--st-text)' }}>{label}</p>
        {desc && <p className="mt-0.5 text-[11px] leading-relaxed text-tx-faint">{desc}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Toggle({ value, onChange, disabled }) {
  return (
    <button type="button" onClick={() => !disabled && onChange(!value)} disabled={disabled}
      className={`relative flex shrink-0 rounded-full transition-all duration-200 ${disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'}`}
      style={{ width:40, height:22, background:value?'linear-gradient(135deg,var(--color-accent),#6b6dff)':'var(--st-toggle-off)', boxShadow:value?'0 2px 8px rgba(124,108,242,0.38)':'none' }}>
      <span className="absolute top-[3px] h-4 w-4 rounded-full bg-white transition-all duration-200"
        style={{ left:value?'20px':'3px', boxShadow:'0 1px 4px rgba(0,0,0,0.25)' }} />
    </button>
  );
}

function Seg({ options, value, onChange, size = 'md' }) {
  const py = size === 'sm' ? 'py-1 px-2.5 text-[11px]' : 'py-1.5 px-3 text-[12px]';
  return (
    <div className="fl-seg flex rounded-xl overflow-hidden"
      style={{ background:'var(--st-seg-bg)', border:'1px solid var(--st-seg-brd)', padding:3, gap:2 }}>
      {options.map(opt => (
        <button key={opt.value} onClick={() => onChange(opt.value)}
          className={`fl-seg-opt fl-seg-opt--${value===opt.value?'active':'idle'} flex items-center gap-1.5 rounded-[9px] font-semibold whitespace-nowrap transition-all ${py}`}
          style={{ background:value===opt.value?'var(--st-seg-active-bg)':'transparent', border:`1px solid ${value===opt.value?'var(--st-seg-active-brd)':'transparent'}`, color:value===opt.value?'var(--st-text)':'var(--st-text-faint2)' }}>
          {opt.Icon && <opt.Icon size={11} />}
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function TagInput({ values, onChange, placeholder }) {
  const [input, setInput] = useState('');
  const add = () => {
    const v = input.trim();
    if (v && !values.includes(v)) { onChange([...values, v]); setInput(''); }
  };
  return (
    <div className="space-y-2">
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {values.map(v => (
            <span key={v} className="fl-tag-chip flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium"
              style={{ background:'var(--st-item-hover)', border:'1px solid var(--st-input-brd)', color:'#c8d6f0' }}>
              {v}
              <button onClick={() => onChange(values.filter(x => x !== v))} className="text-tx-faint transition hover:text-red-400"><X size={9} /></button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input value={input} onChange={e => setInput(e.target.value)} placeholder={placeholder}
          onKeyDown={e => e.key === 'Enter' && add()}
          className="flex-1 rounded-xl py-2 px-3 text-[12px] text-white placeholder-tx-faint outline-none transition"
          style={{ background:'var(--st-input-bg)', border:'1px solid var(--st-input-brd)' }}
          onFocus={e => e.target.style.borderColor='rgba(124,108,242,0.50)'}
          onBlur={e => e.target.style.borderColor=''}
        />
        <button onClick={add} className="fl-tag-add rounded-xl px-4 text-[12px] font-semibold text-white transition hover:brightness-110"
          style={{ background:'rgba(124,108,242,0.22)', border:'1px solid rgba(124,108,242,0.38)' }}>Add</button>
      </div>
    </div>
  );
}

function DurationPicker({ value, onChange, presets, unit = 'min', last }) {
  return (
    <div className="flex items-center gap-1.5">
      {presets.map(p => (
        <button key={p} onClick={() => onChange(p)}
          className={`fl-dur-preset fl-dur-preset--${value===p?'active':'idle'} min-w-[40px] rounded-xl px-2.5 py-1.5 text-center text-[11.5px] font-bold transition-all`}
          style={{ background:value===p?'rgba(124,108,242,0.22)':'var(--st-ctrl-bg)', border:`1px solid ${value===p?'rgba(124,108,242,0.45)':'var(--st-ctrl-brd)'}`, color:value===p?'#a78bfa':'var(--st-text-faint2)' }}>
          {p}<span className="text-[9px] opacity-60 ml-0.5">{unit}</span>
        </button>
      ))}
      <input type="number" value={value} onChange={e => onChange(Number(e.target.value))} min={1} max={480}
        className="w-14 rounded-xl py-1.5 px-2 text-center text-[12px] font-bold outline-none transition"
        style={{ color:'var(--st-text)', background:'var(--st-input-bg)', border:'1px solid var(--st-input-brd)' }}
        onFocus={e => e.target.style.borderColor='rgba(124,108,242,0.55)'}
        onBlur={e => e.target.style.borderColor=''}
      />
    </div>
  );
}

function ShortcutBadge({ keys }) {
  return (
    <div className="flex items-center gap-1">
      {keys.split('+').map((k, i) => (
        <kbd key={i} className="fl-kbd rounded-md px-2 py-1 text-[10px] font-bold text-white"
          style={{ background:'var(--st-ctrl-bg)', border:'1px solid var(--st-ctrl-brd)', boxShadow:'inset 0 -1px 0 rgba(0,0,0,0.20)' }}>
          {k}
        </kbd>
      ))}
    </div>
  );
}

// ── Main SettingsPage ──────────────────────────────────────────────────────────
export default function SettingsPage({ user, categories, setCategories }) {
  const { logout, updateUser, theme, setTheme } = useAuth();

  // ── UI state ─────────────────────────────────────────────────────────────────
  const [activeSection, setActiveSection] = useState('general');
  const [searchQuery, setSearchQuery]     = useState('');
  const [saveToast, setSaveToast]         = useState(null);
  const [prefs, setPrefs]                 = useState(loadPrefs);
  const searchRef = useRef(null);

  const showToast = useCallback((msg) => {
    setSaveToast(msg);
    setTimeout(() => setSaveToast(null), 2500);
  }, []);

  const updatePref = useCallback((key, value) => {
    setPrefs(prev => {
      const next = { ...prev, [key]: value };
      try {
        localStorage.setItem(FL_PREFS_KEY, JSON.stringify(next));
        // Keep App.js's fl_theme in sync when the theme preference changes
        if (key === 'themeMode' && (value === 'light' || value === 'dark')) {
          localStorage.setItem('fl_theme', value);
        }
        // Notify same-tab subscribers (usePrefs hook in other components)
        window.dispatchEvent(new CustomEvent('fl-prefs-change'));
      } catch {}
      return next;
    });
    // Directly apply the theme when the user changes the theme control.
    // Doing this here (not in an effect) means it ONLY fires on explicit user
    // interaction — never on mount — which eliminates the spurious dark-mode
    // switch that occurred when navigating to the Settings page.
    if (key === 'themeMode' && (value === 'light' || value === 'dark')) {
      setTheme(value);
    }
    showToast('Preference saved');
  }, [showToast, setTheme]);

  // System mode: subscribe to OS colour-scheme changes.
  // This effect is intentionally INERT for 'light' and 'dark' modes — it
  // returns early immediately, so it can never call setTheme on mount and
  // can never cause the spurious light→dark switch the user reported.
  useEffect(() => {
    if (prefs.themeMode !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => setTheme(mq.matches ? 'dark' : 'light');
    apply(); // Apply OS theme immediately when system mode is (re-)activated
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [prefs.themeMode, setTheme]);

  // App.js theme → prefs.themeMode display
  // Keeps the Seg control in sync when the theme is toggled via the
  // toolbar icon or profile dropdown (without writing to localStorage).
  useEffect(() => {
    setPrefs(prev => {
      if (prev.themeMode === 'system') return prev; // 'system' controls itself via matchMedia
      if (prev.themeMode === theme)    return prev; // already in sync, no re-render
      return { ...prev, themeMode: theme };
    });
  }, [theme]);

  // Density class
  useEffect(() => {
    document.documentElement.classList.toggle('fl-compact', prefs.density === 'compact');
  }, [prefs.density]);

  // Reduce motion class
  useEffect(() => {
    document.documentElement.classList.toggle('fl-reduce-motion', prefs.reduceMotion);
  }, [prefs.reduceMotion]);

  // Ctrl+F focuses search
  useEffect(() => {
    const h = (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'f') { e.preventDefault(); searchRef.current?.focus(); } };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, []);

  // ── Window behavior → Electron IPC ───────────────────────────────────────────
  // Fires on pref change (and once on mount to restore saved settings).
  useEffect(() => {
    api.setWindowBehavior?.({ minimizeToTray: prefs.minimizeToTray, closeToTray: prefs.closeToTray });
  }, [prefs.minimizeToTray, prefs.closeToTray]);

  // ── Tracking extras → Electron IPC ───────────────────────────────────────────
  // autoPauseOnIdle / autoResume / minSessionDuration aren't in the original
  // saveTrackSettings call — send them as extended tracking settings.
  useEffect(() => {
    api.updateTrackingExtras?.({
      userId: user.id,
      autoPauseOnIdle: prefs.autoPauseOnIdle,
      autoResume: prefs.autoResume,
      minSessionDuration: prefs.minSessionDuration,
    });
  }, [user.id, prefs.autoPauseOnIdle, prefs.autoResume, prefs.minSessionDuration]);

  // ── Exclusions → Electron IPC ────────────────────────────────────────────────
  useEffect(() => {
    api.updateTrackingExclusions?.({
      userId: user.id,
      appBlacklist: prefs.appBlacklist,
      websiteBlacklist: prefs.websiteBlacklist,
      privateModeApps: prefs.privateModeApps,
    });
  }, [user.id, prefs.appBlacklist, prefs.websiteBlacklist, prefs.privateModeApps]);

  // ── Focus Intelligence → Electron IPC ────────────────────────────────────────
  useEffect(() => {
    api.updateFocusSettings?.({
      userId: user.id,
      focusScoringEnabled: prefs.focusScoringEnabled,
      deepWorkThreshold: prefs.deepWorkThreshold,
      distractionSensitivity: prefs.distractionSensitivity,
      contextSwitchSensitivity: prefs.contextSwitchSensitivity,
      focusBlockDetection: prefs.focusBlockDetection,
      productivityMapping: prefs.productivityMapping,
    });
  }, [
    user.id,
    prefs.focusScoringEnabled, prefs.deepWorkThreshold,
    prefs.distractionSensitivity, prefs.contextSwitchSensitivity,
    prefs.focusBlockDetection, prefs.productivityMapping,
  ]);

  // ── Desktop notifications permission ─────────────────────────────────────────
  useEffect(() => {
    if (!prefs.desktopNotifications) return;
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, [prefs.desktopNotifications]);

  // ── Global shortcuts → Electron IPC ──────────────────────────────────────────
  useEffect(() => {
    api.registerGlobalShortcuts?.({
      startStop: prefs.shortcutStartStop,
      focusMode: prefs.shortcutFocusMode,
      palette: prefs.shortcutPalette,
      quickCapture: prefs.shortcutQuickCapture,
    });
  }, [
    prefs.shortcutStartStop, prefs.shortcutFocusMode,
    prefs.shortcutPalette, prefs.shortcutQuickCapture,
  ]);

  // ── Focus session settings → Electron IPC ────────────────────────────────────
  useEffect(() => {
    api.updateFocusSessionSettings?.({
      userId: user.id,
      focusDuration: prefs.focusDuration,
      shortBreakDuration: prefs.shortBreakDuration,
      longBreakDuration: prefs.longBreakDuration,
      longBreakInterval: prefs.longBreakInterval,
      pomodoroMode: prefs.pomodoroMode,
      autoStartFocusMode: prefs.autoStartFocusMode,
      smartNudges: prefs.smartNudges,
    });
  }, [
    user.id,
    prefs.focusDuration, prefs.shortBreakDuration, prefs.longBreakDuration,
    prefs.longBreakInterval, prefs.pomodoroMode, prefs.autoStartFocusMode, prefs.smartNudges,
  ]);

  // ── Notification settings → Electron IPC ─────────────────────────────────────
  useEffect(() => {
    api.updateNotificationSettings?.({
      userId: user.id,
      notifSound: prefs.notifSound,
      dailySummary: prefs.dailySummary,
      dailySummaryTime: prefs.dailySummaryTime,
      focusAlerts: prefs.focusAlerts,
      breakReminders: prefs.breakReminders,
      meetingReminders: prefs.meetingReminders,
    });
  }, [
    user.id,
    prefs.notifSound, prefs.dailySummary, prefs.dailySummaryTime,
    prefs.focusAlerts, prefs.breakReminders, prefs.meetingReminders,
  ]);

  // ── "Break reminders" toggle → the actual DB-backed break scheduler ──────────
  // The notification-settings IPC above has no listener on the main side, so
  // without this the toggle visually flips but the smart break popup keeps
  // firing (or never fires) regardless of what the user picked.
  useEffect(() => {
    api.updateBreakSettings?.({ userId: user.id, enabled: prefs.breakReminders });
  }, [user.id, prefs.breakReminders]);

  // ── General ──────────────────────────────────────────────────────────────────
  const [target, setTarget] = useState(user.daily_target_hours || 6);
  useEffect(() => { setTarget(user.daily_target_hours || 6); }, [user.daily_target_hours]);

  const saveTarget = async () => {
    const hours = parseFloat(target);
    if (!Number.isFinite(hours) || hours <= 0) return;
    await api.updateTarget?.({ userId: user.id, hours });
    updateUser?.({ daily_target_hours: hours });
    showToast('Daily target saved');
  };

  // ── Profile fields ────────────────────────────────────────────────────────────
  const [profile, setProfile] = useState({
    firstName:     user.first_name     || '',
    lastName:      user.last_name      || '',
    email:         user.email          || '',
    company:       user.company        || '',
    industry:      user.industry       || '',
    teamSize:      user.team_size      || '',
    workType:      user.work_type      || '',
    workspaceName: user.workspace_name || '',
  });
  const [profileSaving, setProfileSaving] = useState(false);
  useEffect(() => {
    setProfile({
      firstName:     user.first_name     || '',
      lastName:      user.last_name      || '',
      email:         user.email          || '',
      company:       user.company        || '',
      industry:      user.industry       || '',
      teamSize:      user.team_size      || '',
      workType:      user.work_type      || '',
      workspaceName: user.workspace_name || '',
    });
  }, [user.id]);

  const setProf = (key) => (e) => setProfile(p => ({ ...p, [key]: e.target.value }));

  const saveProfile = async () => {
    if (!profile.email.trim()) { showToast('Email is required'); return; }
    setProfileSaving(true);
    try {
      const res = await api.updateProfile?.({
        userId:        user.id,
        firstName:     profile.firstName.trim(),
        lastName:      profile.lastName.trim(),
        email:         profile.email.trim(),
        company:       profile.company.trim(),
        industry:      profile.industry,
        teamSize:      profile.teamSize,
        workType:      profile.workType,
        workspaceName: profile.workspaceName.trim(),
      });
      if (res?.success === false) { showToast(res.error || 'Save failed'); return; }
      updateUser?.({
        first_name:     profile.firstName.trim(),
        last_name:      profile.lastName.trim(),
        email:          profile.email.trim(),
        company:        profile.company.trim(),
        industry:       profile.industry,
        team_size:      profile.teamSize,
        work_type:      profile.workType,
        workspace_name: profile.workspaceName.trim(),
      });
      showToast('Profile saved');
    } finally {
      setProfileSaving(false);
    }
  };

  // ── Tracking ─────────────────────────────────────────────────────────────────
  const [trackSettings, setTrackSettings] = useState({ auto_track:1, start_on_login:1, idle_threshold_secs:60 });
  const [trackerStatus, setTrackerStatus] = useState(null);

  const loadTrackSettings = useCallback(async () => {
    const [s, status] = await Promise.all([api.getTrackingSettings?.({ userId:user.id }), api.trackerStatus?.()]);
    if (s) setTrackSettings(s);
    if (status) setTrackerStatus(status);
  }, [user.id]);

  useEffect(() => { loadTrackSettings(); }, [loadTrackSettings]);
  useEffect(() => {
    const t = setInterval(async () => { const s = await api.trackerStatus?.(); if (s) setTrackerStatus(s); }, 5000);
    return () => clearInterval(t);
  }, []);

  const saveTrackSettings = async (patch) => {
    const updated = {
      auto_track:          patch.auto_track          !== undefined ? patch.auto_track : patch.autoTrack !== undefined ? (patch.autoTrack?1:0) : trackSettings.auto_track,
      start_on_login:      patch.start_on_login      !== undefined ? (patch.start_on_login?1:0) : trackSettings.start_on_login,
      idle_threshold_secs: patch.idle_threshold_secs !== undefined ? patch.idle_threshold_secs : patch.idleThreshold !== undefined ? patch.idleThreshold : trackSettings.idle_threshold_secs,
    };
    setTrackSettings(updated);
    await api.updateTrackingSettings?.({ userId:user.id, autoTrack:!!updated.auto_track, startOnLogin:!!updated.start_on_login, idleThreshold:updated.idle_threshold_secs });
    showToast('Tracking settings saved');
    setTimeout(async () => { const s = await api.trackerStatus?.(); if (s) setTrackerStatus(s); }, 800);
  };

  const manualToggleTracker = async () => {
    if (trackerStatus?.running) await api.stopTracker?.();
    else await api.startTracker?.({ userId: user.id });
    setTimeout(async () => { const s = await api.trackerStatus?.(); if (s) setTrackerStatus(s); }, 600);
  };

  // ── Auto timezone detection ───────────────────────────────────────────────────
  const detectedTz = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    []
  );
  // When 'auto' is active, broadcast the detected timezone so Calendar and
  // other modules can consume it via the fl-prefs-change event.
  useEffect(() => {
    if (prefs.timezone !== 'auto') return;
    const stored = JSON.parse(localStorage.getItem(FL_PREFS_KEY) || '{}');
    if (stored._detectedTz === detectedTz) return;
    const next = { ...stored, _detectedTz: detectedTz };
    localStorage.setItem(FL_PREFS_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('fl-prefs-change', { detail: { timezone: detectedTz } }));
  }, [prefs.timezone, detectedTz]);

  // ── Calendar ──────────────────────────────────────────────────────────────────
  const [calSources, setCalSources] = useState([]);
  const [showCalDialog, setShowCalDialog] = useState(false);
  const [calSyncing, setCalSyncing] = useState(false);
  const [calSyncMsg, setCalSyncMsg] = useState('');

  const loadCalSources = useCallback(async () => {
    const src = await api.calendarSources?.({ userId: user.id });
    setCalSources(src || []);
  }, [user.id]);

  useEffect(() => { loadCalSources(); }, [loadCalSources]);

  const addCalSource = async (data) => {
    await api.calendarAddSource?.({ userId:user.id, ...data });
    setCalSyncing(true);
    try { await api.calendarSync?.({ userId:user.id }); } catch (e) { console.warn(e); }
    finally { setCalSyncing(false); await loadCalSources(); }
  };

  const removeCalSource = async (id) => { await api.calendarRemoveSource?.({ connectionId:id }); await loadCalSources(); };

  const syncCal = async () => {
    if (calSyncing || calSources.length === 0) return;
    setCalSyncing(true); setCalSyncMsg('');
    try { await api.calendarSync?.({ userId:user.id }); setCalSyncMsg('Synced!'); showToast('Calendars synced'); setTimeout(()=>setCalSyncMsg(''),2500); }
    catch { setCalSyncMsg('Sync failed'); setTimeout(()=>setCalSyncMsg(''),3000); }
    finally { setCalSyncing(false); }
  };

  // ── Calendar auto-sync interval ───────────────────────────────────────────────
  // Only active when calSyncFrequency is a number (minutes) and sources exist.
  // Must be after calSources declaration to avoid TDZ error.
  useEffect(() => {
    if (prefs.calSyncFrequency === 'manual' || calSources.length === 0) return;
    const minutes = Number(prefs.calSyncFrequency);
    if (!minutes || isNaN(minutes)) return;
    const interval = setInterval(() => {
      api.calendarSync?.({ userId: user.id }).catch(() => {});
    }, minutes * 60 * 1000);
    return () => clearInterval(interval);
  }, [prefs.calSyncFrequency, calSources.length, user.id]);

  // ── Categories ────────────────────────────────────────────────────────────────
  const [newName, setNewName]   = useState('');
  const [newColor, setNewColor] = useState('#6366f1');
  const [newType, setNewType]   = useState('focus');

  const addCategory = async () => {
    if (!newName.trim()) return;
    const cat = await api.createCategory?.({ userId:user.id, name:newName.trim(), color:newColor, sessionType:newType });
    if (cat?.id) { setCategories(c => [...c, cat]); setNewName(''); }
  };
  const delCategory = async (id) => { await api.deleteCategory?.({ categoryId:id }); setCategories(c => c.filter(x=>x.id!==id)); };

  // ── Integrations ──────────────────────────────────────────────────────────────
  const [supaUrl, setSupaUrl]   = useState(localStorage.getItem('supa_url')||'');
  const [supaKey, setSupaKey]   = useState(localStorage.getItem('supa_key')||'');
  const [showSupaKey, setShowSupaKey] = useState(false);

  const saveSupabase = () => {
    localStorage.setItem('supa_url', supaUrl); localStorage.setItem('supa_key', supaKey);
    showToast('Supabase settings saved — reloading…');
    setTimeout(() => window.location.reload(), 1000);
  };

  // ── Privacy ───────────────────────────────────────────────────────────────────
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetInput, setResetInput] = useState('');
  const [resetting, setResetting]   = useState(false);

  const handleResetAllData = async () => {
    if (resetInput.toLowerCase() !== 'reset') return;
    setResetting(true);
    try { await api.resetAllData?.({ userId:user.id }); window.location.reload(); }
    catch (e) { console.error(e); setResetting(false); }
  };

  // ── Search ────────────────────────────────────────────────────────────────────
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const q = searchQuery.toLowerCase();
    return SEARCH_INDEX.filter(i => i.label.toLowerCase().includes(q) || i.desc.toLowerCase().includes(q));
  }, [searchQuery]);

  const filteredSections = useMemo(() => {
    if (!searchQuery.trim()) return NAV_SECTIONS;
    const q = searchQuery.toLowerCase();
    return NAV_SECTIONS.filter(s =>
      s.label.toLowerCase().includes(q) || s.desc.toLowerCase().includes(q) ||
      SEARCH_INDEX.some(i => i.section===s.id && (i.label.toLowerCase().includes(q)||i.desc.toLowerCase().includes(q)))
    );
  }, [searchQuery]);

  const idleOptions = [{ secs:30,label:'30s' },{ secs:60,label:'1 min' },{ secs:120,label:'2 min' },{ secs:300,label:'5 min' }];
  const activeMeta  = NAV_SECTIONS.find(s => s.id === activeSection);
  const ActiveIcon  = activeMeta?.Icon;

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="fl-settings-page flex h-full overflow-hidden">

      {/* ───────────────────────── SIDEBAR ───────────────────────────────── */}
      <aside className="flex w-[228px] shrink-0 flex-col overflow-hidden"
        style={{ background:'var(--st-page-bg)', borderRight:'1px solid var(--st-divider)', boxShadow:'var(--st-aside-shadow)' }}>

        <div className="px-5 py-[18px]" style={{ borderBottom:'1px solid var(--st-divider)' }}>
          <h1 className="text-[15px] font-extrabold" style={{ color:'var(--st-text)' }}>Preferences</h1>
          <p className="mt-0.5 text-[11px] text-tx-faint">Flow Ledger workspace settings</p>
        </div>

        {/* Search */}
        <div className="px-3 py-2.5" style={{ borderBottom:'1px solid var(--st-divider-sm)' }}>
          <div className="relative">
            <Search size={12} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-tx-faint" />
            <input ref={searchRef} type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search settings…" className="w-full rounded-lg py-[7px] pl-8 pr-8 text-[12px] placeholder-tx-faint outline-none transition-all" style={{ color:'var(--st-text)', background:'var(--st-ctrl-bg)', border:'1px solid var(--st-ctrl-brd)' }}
              onFocus={e => { e.target.style.borderColor='rgba(124,108,242,0.50)'; e.target.style.boxShadow='0 0 0 3px rgba(124,108,242,0.10)'; }}
              onBlur={e => { e.target.style.borderColor=''; e.target.style.boxShadow='none'; }}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 flex h-4 w-4 items-center justify-center rounded-full text-tx-faint transition hover:text-white" style={{ background:'var(--st-ctrl-bg)' }}>
                <X size={8} />
              </button>
            )}
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {filteredSections.length === 0 ? (
            <p className="px-3 py-5 text-center text-[11px] text-tx-faint">No matching sections</p>
          ) : filteredSections.map(section => {
            const isActive = activeSection === section.id && !searchResults;
            const SIcon = section.Icon;
            return (
              <button key={section.id} onClick={() => { setActiveSection(section.id); setSearchQuery(''); }}
                className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all duration-150"
                style={{ background:isActive?`linear-gradient(135deg,${section.color}1A,${section.color}0D)`:'transparent', border:`1px solid ${isActive?section.color+'2E':'transparent'}`, boxShadow:isActive?`0 4px 18px ${section.color}14,inset 0 1px 0 rgba(255,255,255,0.05)`:'none' }}
                onMouseEnter={e => { if(!isActive) e.currentTarget.style.background='var(--st-hover)'; }}
                onMouseLeave={e => { if(!isActive) e.currentTarget.style.background='transparent'; }}>
                <div className={`fl-nav-icon fl-nav-icon--${isActive?'active':'idle'} flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-lg`}
                  style={{ background:isActive?`${section.color}22`:'var(--st-nav-idle)', border:`1px solid ${isActive?section.color+'38':'var(--st-nav-idle-brd)'}` }}>
                  <SIcon size={13} style={{ color:isActive?section.color:'var(--st-text-faint2)' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-[12.5px] font-semibold leading-none" style={{ color:isActive?'var(--st-text)':'var(--st-text-muted)' }}>{section.label}</p>
                  <p className="mt-0.5 truncate text-[10px] leading-none" style={{ color:isActive?`${section.color}CC`:'var(--st-text-faint2)' }}>{section.desc}</p>
                </div>
                {isActive && <ChevronRight size={10} className="shrink-0 text-tx-faint" />}
              </button>
            );
          })}
        </nav>

        <div className="px-4 py-4" style={{ borderTop:'1px solid var(--st-divider)' }}>
          <div className="flex items-center gap-2 mb-1.5">
            <img src={logoSrc} alt="" className="h-4 w-4 rounded object-contain opacity-60" />
            <span className="text-[11px] font-semibold text-tx-faint">Flow Ledger v2.0</span>
          </div>
          <p className="text-[10px] text-tx-faint opacity-70">Local-first · Port 27314 · All data on device.</p>
        </div>
      </aside>

      {/* ─────────────────────────── CONTENT ─────────────────────────────── */}
      <div className="relative flex flex-1 flex-col overflow-hidden bg-bg-app">

        {/* Header */}
        <div className="fl-settings-hdr shrink-0 px-8 py-[18px]"
          style={{ background:'var(--st-header-bg)', borderBottom:'1px solid var(--st-divider-sm)', boxShadow:'var(--st-hdr-shimmer)' }}>
          <div className="mb-2 flex items-center gap-1.5 text-[10.5px] text-tx-faint">
            <span>Preferences</span><ChevronRight size={9} />
            <span style={{ color:'var(--st-breadcrumb)' }}>{searchResults ? 'Search results' : activeMeta?.label}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
              style={{ background:searchResults?'rgba(124,108,242,0.14)':`${activeMeta?.color || '#7c6cf2'}16`, border:`1px solid ${searchResults?'rgba(124,108,242,0.24)':`${activeMeta?.color||'#7c6cf2'}2A`}` }}>
              {searchResults ? <Search size={16} className="text-accent-light" /> : (ActiveIcon && <ActiveIcon size={17} style={{ color:activeMeta?.color }} />)}
            </div>
            <div>
              <h1 className="text-[18px] font-extrabold leading-tight" style={{ color:'var(--st-text)' }}>
                {searchResults ? `"${searchQuery}"` : activeMeta?.label}
              </h1>
              <p className="mt-0.5 text-[11.5px] text-tx-faint">
                {searchResults ? `${searchResults.length} setting${searchResults.length!==1?'s':''} matched` : activeMeta?.desc}
              </p>
            </div>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-8 py-6 space-y-4 bg-bg-app">

          {/* Search results */}
          {searchResults && (
            <>
              {searchResults.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Search size={32} className="mb-3 text-tx-faint opacity-25" />
                  <p className="text-[14px] font-semibold text-tx-secondary">No settings found</p>
                  <p className="mt-1 text-[12px] text-tx-faint">Try "theme", "idle", "calendar", or "shortcut"</p>
                </div>
              ) : (
                <div className="rounded-2xl overflow-hidden"
                  style={{ background:'var(--st-card-bg)', border:'1px solid var(--st-divider)', boxShadow:'var(--st-card-shadow)' }}>
                  {searchResults.map((item, i) => {
                    const sec = NAV_SECTIONS.find(s => s.id === item.section);
                    const SecIcon = sec?.Icon;
                    return (
                      <button key={i} onClick={() => { setActiveSection(item.section); setSearchQuery(''); }}
                        className="flex w-full items-center gap-4 px-5 py-4 text-left transition hover:bg-white/[0.04]"
                        style={{ borderBottom:i<searchResults.length-1?'1px solid var(--st-divider-xs)':'none' }}>
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                          style={{ background:`${sec?.color||'#7c6cf2'}16`, border:`1px solid ${sec?.color||'#7c6cf2'}28` }}>
                          {SecIcon && <SecIcon size={14} style={{ color:sec?.color }} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-semibold" style={{ color:'var(--st-text)' }}>{item.label}</p>
                          <p className="mt-0.5 text-[11px] text-tx-faint">{item.desc}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                            style={{ background:`${sec?.color||'#7c6cf2'}18`, color:sec?.color||'#7c6cf2', border:`1px solid ${sec?.color||'#7c6cf2'}28` }}>
                            {sec?.label}
                          </span>
                          <ChevronRight size={12} className="text-tx-faint" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* ══════════════ SECTION CONTENT ══════════════ */}
          {!searchResults && (
            <>

              {/* ════ GENERAL ════ */}
              {activeSection === 'general' && (
                <>
                  {/* Account */}
                  <SettingCard title="Account" desc="Profile and workspace identity" icon={User} accent="#7c6cf2">
                    {/* Avatar + username row */}
                    <div className="flex items-center gap-4 pb-4 mb-1" style={{ borderBottom:'1px solid var(--st-divider-sm)' }}>
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-[17px] font-extrabold text-white"
                        style={{ background:'linear-gradient(135deg,var(--color-accent),#60a5fa)', boxShadow:'0 6px 20px rgba(124,108,242,0.38)' }}>
                        {(user.first_name?.[0] || user.username[0]).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-bold" style={{ color:'var(--st-text)' }}>
                          {user.first_name ? `${user.first_name} ${user.last_name||''}`.trim() : user.username}
                        </p>
                        <p className="text-[11.5px] text-tx-faint">@{user.username}</p>
                        <div className="mt-2 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                          style={{ background:'rgba(124,108,242,0.14)', color:'#a78bfa', border:'1px solid rgba(124,108,242,0.24)' }}>
                          <span className="h-1.5 w-1.5 rounded-full bg-green-400" />Local workspace
                        </div>
                      </div>
                      <button onClick={logout} className="ml-2 shrink-0 rounded-xl px-3 py-1.5 text-[11.5px] font-semibold text-red-400/80 transition"
                        style={{ border:'1px solid rgba(239,68,68,0.22)', background:'rgba(239,68,68,0.07)' }}
                        onMouseEnter={e => { e.currentTarget.style.background='rgba(239,68,68,0.15)'; e.currentTarget.style.color='#f87171'; }}
                        onMouseLeave={e => { e.currentTarget.style.background='rgba(239,68,68,0.07)'; e.currentTarget.style.color=''; }}>
                        Sign out
                      </button>
                    </div>

                    {/* Editable profile fields */}
                    <div className="pt-1 space-y-4" style={{ borderBottom:'1px solid var(--st-divider-sm)', paddingBottom:'16px', marginBottom:'4px' }}>
                      {/* First / Last name */}
                      <div>
                        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-tx-faint">Name</p>
                        <div className="flex gap-2">
                          <input value={profile.firstName} onChange={setProf('firstName')} placeholder="First name"
                            className="flex-1 rounded-xl py-2 px-3 text-[13px] outline-none transition"
                            style={{ color:'var(--st-text)', background:'var(--st-ctrl-bg)', border:'1px solid var(--st-ctrl-brd)' }}
                            onFocus={e=>e.target.style.borderColor='rgba(124,108,242,0.55)'}
                            onBlur={e=>e.target.style.borderColor=''} />
                          <input value={profile.lastName} onChange={setProf('lastName')} placeholder="Last name"
                            className="flex-1 rounded-xl py-2 px-3 text-[13px] outline-none transition"
                            style={{ color:'var(--st-text)', background:'var(--st-ctrl-bg)', border:'1px solid var(--st-ctrl-brd)' }}
                            onFocus={e=>e.target.style.borderColor='rgba(124,108,242,0.55)'}
                            onBlur={e=>e.target.style.borderColor=''} />
                        </div>
                      </div>

                      {/* Email */}
                      <div>
                        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-tx-faint">Email</p>
                        <input type="email" value={profile.email} onChange={setProf('email')} placeholder="you@example.com" required
                          className="w-full rounded-xl py-2 px-3 text-[13px] outline-none transition"
                          style={{ color:'var(--st-text)', background:'var(--st-ctrl-bg)', border:'1px solid var(--st-ctrl-brd)' }}
                          onFocus={e=>e.target.style.borderColor='rgba(124,108,242,0.55)'}
                          onBlur={e=>e.target.style.borderColor=''} />
                      </div>

                      {/* Company + Workspace name */}
                      <div>
                        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-tx-faint">Workspace</p>
                        <div className="flex gap-2">
                          <input value={profile.workspaceName} onChange={setProf('workspaceName')} placeholder="Workspace name"
                            className="flex-1 rounded-xl py-2 px-3 text-[13px] outline-none transition"
                            style={{ color:'var(--st-text)', background:'var(--st-ctrl-bg)', border:'1px solid var(--st-ctrl-brd)' }}
                            onFocus={e=>e.target.style.borderColor='rgba(124,108,242,0.55)'}
                            onBlur={e=>e.target.style.borderColor=''} />
                          <input value={profile.company} onChange={setProf('company')} placeholder="Company"
                            className="flex-1 rounded-xl py-2 px-3 text-[13px] outline-none transition"
                            style={{ color:'var(--st-text)', background:'var(--st-ctrl-bg)', border:'1px solid var(--st-ctrl-brd)' }}
                            onFocus={e=>e.target.style.borderColor='rgba(124,108,242,0.55)'}
                            onBlur={e=>e.target.style.borderColor=''} />
                        </div>
                      </div>

                      {/* Industry */}
                      <div>
                        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-tx-faint">Industry</p>
                        <select value={profile.industry} onChange={setProf('industry')}
                          className="w-full rounded-xl py-2 px-3 text-[13px] outline-none transition appearance-none"
                          style={{ color: profile.industry ? 'var(--st-text)' : 'var(--tx-faint,#666)', background:'var(--st-ctrl-bg)', border:'1px solid var(--st-ctrl-brd)' }}
                          onFocus={e=>e.target.style.borderColor='rgba(124,108,242,0.55)'}
                          onBlur={e=>e.target.style.borderColor=''}>
                          <option value="">Select industry…</option>
                          {['Technology','Finance','Healthcare','Education','Creative & Design','Marketing','Consulting','Legal','Real Estate','Other'].map(i => (
                            <option key={i} value={i}>{i}</option>
                          ))}
                        </select>
                      </div>

                      {/* Team size */}
                      <div>
                        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-tx-faint">Team Size</p>
                        <div className="flex gap-2 flex-wrap">
                          {[{value:'solo',label:'Just me'},{value:'2-5',label:'2–5'},{value:'6-15',label:'6–15'},{value:'16-50',label:'16–50'},{value:'50+',label:'50+'}].map(opt => (
                            <button key={opt.value} type="button"
                              onClick={() => setProfile(p => ({ ...p, teamSize: opt.value }))}
                              className="rounded-xl px-3 py-1.5 text-[12px] font-semibold transition"
                              style={{
                                background: profile.teamSize === opt.value ? 'rgba(124,108,242,0.20)' : 'var(--st-ctrl-bg)',
                                color:      profile.teamSize === opt.value ? '#a78bfa'                : 'var(--st-text)',
                                border:     profile.teamSize === opt.value ? '1px solid rgba(124,108,242,0.45)' : '1px solid var(--st-ctrl-brd)',
                              }}>
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Work type */}
                      <div>
                        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-tx-faint">Work Type</p>
                        <div className="flex gap-2 flex-wrap">
                          {[{value:'individual',label:'Individual'},{value:'freelancer',label:'Freelancer'},{value:'agency',label:'Agency'},{value:'startup',label:'Startup'},{value:'enterprise',label:'Enterprise'},{value:'student',label:'Student'}].map(opt => (
                            <button key={opt.value} type="button"
                              onClick={() => setProfile(p => ({ ...p, workType: opt.value }))}
                              className="rounded-xl px-3 py-1.5 text-[12px] font-semibold transition"
                              style={{
                                background: profile.workType === opt.value ? 'rgba(124,108,242,0.20)' : 'var(--st-ctrl-bg)',
                                color:      profile.workType === opt.value ? '#a78bfa'                : 'var(--st-text)',
                                border:     profile.workType === opt.value ? '1px solid rgba(124,108,242,0.45)' : '1px solid var(--st-ctrl-brd)',
                              }}>
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Save profile button */}
                      <div className="pt-1">
                        <button onClick={saveProfile} disabled={profileSaving}
                          className="flex items-center gap-2 rounded-xl px-5 py-2 text-[13px] font-bold text-white transition hover:brightness-110 disabled:opacity-60"
                          style={{ background:'linear-gradient(135deg,var(--color-accent),#6b6dff)', boxShadow:'0 4px 14px rgba(124,108,242,0.28)' }}>
                          {profileSaving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} strokeWidth={3} />}
                          Save Profile
                        </button>
                      </div>
                    </div>

                    <SettingRow label="Daily target" desc="Hours per day toward your progress ring." last>
                      <div className="flex items-center gap-2">
                        <input type="number" value={target} onChange={e=>setTarget(e.target.value)} min="0.5" max="24" step="0.5"
                          className="w-16 rounded-xl py-1.5 px-2 text-center text-[13px] font-bold outline-none transition"
                          style={{ color:'var(--st-text)', background:'var(--st-ctrl-bg)', border:'1px solid var(--st-ctrl-brd)' }}
                          onFocus={e=>e.target.style.borderColor='rgba(124,108,242,0.55)'}
                          onBlur={e=>e.target.style.borderColor=''}
                        />
                        <span className="text-[11px] text-tx-faint">hrs</span>
                        <button onClick={saveTarget} className="flex items-center gap-1.5 rounded-xl px-4 py-1.5 text-[12px] font-bold text-white transition hover:brightness-110"
                          style={{ background:'linear-gradient(135deg,var(--color-accent),#6b6dff)', boxShadow:'0 4px 14px rgba(124,108,242,0.30)' }}>
                          <Check size={11} strokeWidth={3} />Save
                        </button>
                      </div>
                    </SettingRow>
                  </SettingCard>

                  {/* Appearance */}
                  <SettingCard title="Appearance" desc="Theme and display density" icon={Palette} accent="#f59e0b">
                    {/* Theme mode */}
                    <SettingRow label="App theme" desc="Light, dark, or follow your system preference.">
                      <Seg value={prefs.themeMode} onChange={v=>updatePref('themeMode',v)} options={[
                        { value:'light', label:'Light', Icon:Sun },
                        { value:'dark',  label:'Dark',  Icon:Moon },
                        { value:'system',label:'System',Icon:Monitor },
                      ]} />
                    </SettingRow>

                    {/* Density */}
                    <SettingRow label="Interface density" desc="Compact reduces padding and element size." last>
                      <Seg value={prefs.density} onChange={v=>updatePref('density',v)} options={[
                        { value:'comfortable', label:'Comfortable' },
                        { value:'compact',     label:'Compact' },
                      ]} />
                    </SettingRow>
                  </SettingCard>

                  {/* Window */}
                  <SettingCard title="Window Behavior" desc="How the app behaves when minimized or closed" icon={Monitor} accent="#3b82f6">
                    <SettingRow label="Minimize to tray" desc="Keep Flow Ledger running in the background when minimized.">
                      <Toggle value={prefs.minimizeToTray} onChange={v=>updatePref('minimizeToTray',v)} />
                    </SettingRow>
                    <SettingRow label="Close to tray" desc="Don't quit when the window is closed — continue tracking." last>
                      <Toggle value={prefs.closeToTray} onChange={v=>updatePref('closeToTray',v)} />
                    </SettingRow>
                  </SettingCard>

                  {/* Date & Time */}
                  <SettingCard title="Date & Time" desc="How dates and times are displayed throughout the app" icon={Clock} accent="#10b981">
                    <SettingRow label="Time format" desc="12-hour AM/PM or 24-hour clock.">
                      <Seg value={prefs.timeFormat} onChange={v=>updatePref('timeFormat',v)} options={[
                        { value:'12h', label:'12h' },
                        { value:'24h', label:'24h' },
                      ]} />
                    </SettingRow>
                    <SettingRow label="Date format" desc="How dates appear in session lists and reports.">
                      <Seg value={prefs.dateFormat} onChange={v=>updatePref('dateFormat',v)} options={[
                        { value:'MMM D',    label:'Jan 5' },
                        { value:'DD/MM',    label:'05/01' },
                        { value:'MM/DD',    label:'01/05' },
                        { value:'YYYY-MM-DD',label:'ISO' },
                      ]} size="sm" />
                    </SettingRow>
                    <SettingRow label="Week starts on" desc="First day of the week in calendar views." last>
                      <Seg value={prefs.weekStart} onChange={v=>updatePref('weekStart',v)} options={[
                        { value:'sun', label:'Sunday' },
                        { value:'mon', label:'Monday' },
                      ]} />
                    </SettingRow>
                  </SettingCard>

                  {/* Interface */}
                  <SettingCard title="Interface" desc="Motion, sidebar, and navigation preferences" icon={SlidersHorizontal} accent="#a78bfa">
                    <SettingRow label="Reduce motion" desc="Disable animations and transitions for accessibility.">
                      <Toggle value={prefs.reduceMotion} onChange={v=>updatePref('reduceMotion',v)} />
                    </SettingRow>
                    <SettingRow label="Sidebar animation" desc="Animate the sidebar when it expands or collapses.">
                      <Toggle value={prefs.sidebarMotion} onChange={v=>updatePref('sidebarMotion',v)} />
                    </SettingRow>
                    <SettingRow label="Sidebar behavior" desc="Manual keeps the sidebar state until you toggle it. Auto collapses it when the window is narrow.">
                      <Seg value={prefs.sidebarBehavior} onChange={v=>updatePref('sidebarBehavior',v)} options={[
                        { value:'manual', label:'Manual' },
                        { value:'auto',   label:'Auto' },
                      ]} />
                    </SettingRow>
                    <SettingRow label="Remember last page" desc="Reopen the last visited page when Flow Ledger launches." last>
                      <Toggle value={prefs.rememberLastPage} onChange={v=>updatePref('rememberLastPage',v)} />
                    </SettingRow>
                  </SettingCard>
                </>
              )}

              {/* ════ TRACKING ════ */}
              {activeSection === 'tracking' && (
                <>
                  {/* Tracker engine */}
                  <SettingCard title="Background Tracker" desc="Activity monitoring engine" icon={Power} accent="#10b981"
                    badge={
                      <div className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold"
                        style={{ background:trackerStatus?.running?'rgba(16,185,129,0.14)':'var(--st-ctrl-bg)', border:`1px solid ${trackerStatus?.running?'rgba(16,185,129,0.32)':'var(--st-ctrl-brd)'}`, color:trackerStatus?.running?'#34d399':'var(--st-text-faint2)' }}>
                        <span className={`h-1.5 w-1.5 rounded-full ${trackerStatus?.running?'bg-green-400 animate-pulse':'bg-[#6a7a98]'}`} />
                        {trackerStatus?.running ? 'Running' : 'Stopped'}
                      </div>
                    }>
                    <div className="mb-4 flex items-center justify-between rounded-2xl px-4 py-4"
                      style={{ background:trackerStatus?.running?'rgba(16,185,129,0.07)':'var(--st-item-bg)', border:`1px solid ${trackerStatus?.running?'rgba(16,185,129,0.18)':'var(--st-divider)'}` }}>
                      <div className="flex-1 min-w-0">
                        {trackerStatus?.running && trackerStatus.currentApp ? (
                          <div>
                            <p className="text-[10.5px] font-bold uppercase tracking-wider text-green-400 opacity-80">Now tracking</p>
                            <p className="mt-0.5 text-[13px] font-semibold truncate" style={{ color:'var(--st-text)' }}>{trackerStatus.currentApp}</p>
                          </div>
                        ) : (
                          <div>
                            <p className="text-[13px] font-semibold text-tx-secondary">Tracker is {trackerStatus?.running?'running':'stopped'}</p>
                            <p className="mt-0.5 text-[11px] text-tx-faint">
                              {trackerStatus?.platform==='win32'?'Windows — PowerShell':trackerStatus?.platform==='darwin'?'macOS — Accessibility API':'Linux — xdotool'}
                            </p>
                          </div>
                        )}
                      </div>
                      <button onClick={manualToggleTracker}
                        className="ml-4 flex shrink-0 items-center gap-1.5 rounded-xl px-4 py-2 text-[11.5px] font-bold transition"
                        style={{ background:trackerStatus?.running?'rgba(239,68,68,0.14)':'rgba(16,185,129,0.14)', border:`1px solid ${trackerStatus?.running?'rgba(239,68,68,0.30)':'rgba(16,185,129,0.28)'}`, color:trackerStatus?.running?'#f87171':'#34d399' }}
                        onMouseEnter={e=>e.currentTarget.style.filter='brightness(1.2)'}
                        onMouseLeave={e=>e.currentTarget.style.filter='none'}>
                        <Power size={12} />{trackerStatus?.running ? 'Stop' : 'Start'}
                      </button>
                    </div>
                    <SettingRow label="Auto-track active window" desc="Records the active app and website every 4 seconds.">
                      <Toggle value={!!trackSettings.auto_track} onChange={v=>saveTrackSettings({auto_track:v?1:0})} />
                    </SettingRow>
                    <SettingRow label="Launch tracker at login" desc="Start background tracking silently when your computer boots." last>
                      <Toggle value={!!trackSettings.start_on_login} onChange={v=>saveTrackSettings({start_on_login:v?1:0})} />
                    </SettingRow>
                  </SettingCard>

                  {/* Idle Detection */}
                  <SettingCard title="Idle Detection" desc="Pause and resume behavior when you stop working" icon={Clock} accent="#f59e0b">
                    <SettingRow label="Idle threshold" desc="Stop recording after this much inactivity.">
                      <div className="flex items-center gap-1.5">
                        {idleOptions.map(opt => (
                          <button key={opt.secs} onClick={() => saveTrackSettings({idle_threshold_secs:opt.secs})}
                            className="rounded-xl px-3 py-1.5 text-[11.5px] font-semibold transition-all"
                            style={{ background:trackSettings.idle_threshold_secs===opt.secs?'rgba(124,108,242,0.22)':'var(--st-ctrl-bg)', border:`1px solid ${trackSettings.idle_threshold_secs===opt.secs?'rgba(124,108,242,0.48)':'var(--st-ctrl-brd)'}`, color:trackSettings.idle_threshold_secs===opt.secs?'#a78bfa':'var(--st-text-faint2)' }}>
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </SettingRow>
                    <SettingRow label="Auto-pause when inactive" desc="Automatically pause the session timer on idle.">
                      <Toggle value={prefs.autoPauseOnIdle} onChange={v=>updatePref('autoPauseOnIdle',v)} />
                    </SettingRow>
                    <SettingRow label="Auto-resume tracking" desc="Resume the session automatically when activity is detected." last>
                      <Toggle value={prefs.autoResume} onChange={v=>updatePref('autoResume',v)} />
                    </SettingRow>
                  </SettingCard>

                  {/* Session Filters */}
                  <SettingCard title="Session Filters" desc="Exclude apps, sites, and short sessions from tracking" icon={Filter} accent="#3b82f6">
                    <SettingRow label="Minimum session duration" desc="Discard sessions shorter than this threshold.">
                      <Seg value={String(prefs.minSessionDuration)} onChange={v=>updatePref('minSessionDuration',Number(v))} options={[
                        { value:'10', label:'10s' },
                        { value:'30', label:'30s' },
                        { value:'60', label:'1 min' },
                        { value:'120',label:'2 min' },
                      ]} size="sm" />
                    </SettingRow>
                    <SettingRow label="App blacklist" desc="Apps tracked but never shown or counted." full>
                      <TagInput values={prefs.appBlacklist} onChange={v=>updatePref('appBlacklist',v)} placeholder="e.g. Finder, System Preferences…" />
                    </SettingRow>
                    <SettingRow label="Website blacklist" desc="Domains excluded from Chrome extension tracking." full>
                      <TagInput values={prefs.websiteBlacklist} onChange={v=>updatePref('websiteBlacklist',v)} placeholder="e.g. mail.google.com, reddit.com…" />
                    </SettingRow>
                    <SettingRow label="Private mode apps" desc="Tracked for time totals but hidden from app-level analytics." full last>
                      <TagInput values={prefs.privateModeApps} onChange={v=>updatePref('privateModeApps',v)} placeholder="e.g. Signal, 1Password…" />
                    </SettingRow>
                  </SettingCard>

                  {/* Focus Intelligence */}
                  <SettingCard title="Focus Intelligence" desc="Rize.io-style scoring, deep work detection, and distraction analysis" icon={Brain} accent="#8b5cf6">
                    <div className="mb-3 flex items-start gap-2.5 rounded-xl px-3.5 py-3"
                      style={{ background:'rgba(139,92,246,0.08)', border:'1px solid rgba(139,92,246,0.18)' }}>
                      <Sparkles size={12} className="mt-0.5 shrink-0" style={{ color:'#a78bfa' }} />
                      <p className="text-[11px] text-tx-faint leading-relaxed">
                        Focus Intelligence analyzes your work patterns to generate a daily focus score, detect deep work blocks, and flag distraction spikes.
                      </p>
                    </div>
                    <SettingRow label="Focus scoring" desc="Generate a daily focus quality score based on your session patterns.">
                      <Toggle value={prefs.focusScoringEnabled} onChange={v=>updatePref('focusScoringEnabled',v)} />
                    </SettingRow>
                    <SettingRow label="Focus block detection" desc="Automatically detect and label uninterrupted deep work blocks.">
                      <Toggle value={prefs.focusBlockDetection} onChange={v=>updatePref('focusBlockDetection',v)} />
                    </SettingRow>
                    <SettingRow label="Productivity category mapping" desc="Map apps to productivity categories for smarter scoring.">
                      <Toggle value={prefs.productivityMapping} onChange={v=>updatePref('productivityMapping',v)} />
                    </SettingRow>
                    <SettingRow label="Deep work threshold" desc="Minimum uninterrupted focus minutes to qualify as deep work.">
                      <Seg value={String(prefs.deepWorkThreshold)} onChange={v=>updatePref('deepWorkThreshold',Number(v))} options={[
                        { value:'25', label:'25m' },
                        { value:'45', label:'45m' },
                        { value:'60', label:'60m' },
                        { value:'90', label:'90m' },
                      ]} size="sm" />
                    </SettingRow>
                    <SettingRow label="Distraction sensitivity" desc="How aggressively to flag distracting apps and context switches.">
                      <Seg value={prefs.distractionSensitivity} onChange={v=>updatePref('distractionSensitivity',v)} options={[
                        { value:'low',    label:'Low' },
                        { value:'medium', label:'Medium' },
                        { value:'high',   label:'High' },
                      ]} />
                    </SettingRow>
                    <SettingRow label="Context switching sensitivity" desc="Detect and penalize rapid switching between unrelated apps." last>
                      <Seg value={prefs.contextSwitchSensitivity} onChange={v=>updatePref('contextSwitchSensitivity',v)} options={[
                        { value:'low',    label:'Low' },
                        { value:'medium', label:'Medium' },
                        { value:'high',   label:'High' },
                      ]} />
                    </SettingRow>
                  </SettingCard>
                </>
              )}

              {/* ════ CALENDAR ════ */}
              {activeSection === 'calendar' && (
                <>
                  {/* Connections */}
                  <SettingCard title="Calendar Connections" desc="Overlay events from external calendars on your timeline" icon={Calendar} accent="#a78bfa"
                    badge={calSources.length>0 ? (
                      <span className="rounded-full px-2.5 py-0.5 text-[10px] font-bold"
                        style={{ background:'rgba(167,139,250,0.16)', color:'#a78bfa', border:'1px solid rgba(167,139,250,0.28)' }}>
                        {calSources.length} connected
                      </span>
                    ) : null}>
                    {calSources.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-10 text-center rounded-2xl mb-4"
                        style={{ border:'1px dashed var(--st-divider)' }}>
                        <Calendar size={26} className="mb-3 text-tx-faint opacity-30" />
                        <p className="text-[13px] font-semibold text-tx-secondary">No calendars connected</p>
                        <p className="mt-1 text-[11px] text-tx-faint">Add a calendar feed to overlay events on your timeline</p>
                      </div>
                    ) : (
                      <div className="mb-4 space-y-2">
                        {calSources.map(src => (
                          <div key={src.id} className="group flex items-center justify-between rounded-2xl px-4 py-3 transition"
                            style={{ background:'var(--st-item-bg)', border:'1px solid var(--st-divider)' }}
                            onMouseEnter={e=>e.currentTarget.style.background='var(--st-item-hover)'}
                            onMouseLeave={e=>e.currentTarget.style.background='var(--st-item-bg)'}>
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background:src.color||'#6366f1', boxShadow:`0 0 10px ${src.color||'#6366f1'}55` }} />
                              <div className="min-w-0">
                                <p className="text-[13px] font-semibold truncate" style={{ color:'var(--st-text)' }}>{src.label||src.provider}</p>
                                <p className="text-[10px] font-mono text-tx-faint truncate">{src.ics_url}</p>
                              </div>
                            </div>
                            <button onClick={()=>removeCalSource(src.id)} className="ml-4 shrink-0 rounded-lg p-1.5 opacity-0 transition-all group-hover:opacity-100" style={{ color:'#f87171' }}
                              onMouseEnter={e=>e.currentTarget.style.background='rgba(239,68,68,0.12)'}
                              onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                              <Trash2 size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center gap-2.5">
                      <button onClick={()=>setShowCalDialog(true)} className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-[12px] font-bold text-white transition hover:brightness-110"
                        style={{ background:'linear-gradient(135deg,var(--color-accent),#a78bfa)', boxShadow:'0 4px 14px rgba(124,108,242,0.28)' }}>
                        <Plus size={13} />Add Calendar
                      </button>
                      {calSources.length > 0 && (
                        <button onClick={syncCal} disabled={calSyncing} className="flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[12px] font-semibold text-tx-secondary transition disabled:opacity-40"
                          style={{ background:'var(--st-ctrl-bg)', border:'1px solid var(--st-ctrl-brd)' }}
                          onMouseEnter={e=>{e.currentTarget.style.borderColor='rgba(167,139,250,0.38)';e.currentTarget.style.color='white';}}
                          onMouseLeave={e=>{e.currentTarget.style.borderColor='';e.currentTarget.style.color='';}}>
                          <RefreshCw size={12} className={calSyncing?'animate-spin':''} />{calSyncing?'Syncing…':'Sync Now'}
                        </button>
                      )}
                      {calSyncMsg && (
                        <span className={`flex items-center gap-1.5 text-[11px] font-semibold ${calSyncMsg==='Synced!'?'text-green-400':'text-red-400'}`}>
                          {calSyncMsg==='Synced!'?<CheckCircle2 size={11}/>:<AlertCircle size={11}/>}{calSyncMsg}
                        </span>
                      )}
                    </div>
                  </SettingCard>

                  {/* Sync behavior */}
                  <SettingCard title="Sync Behavior" desc="How and when calendar data is refreshed" icon={RefreshCw} accent="#10b981">
                    <SettingRow label="Sync frequency" desc="How often to automatically refresh your calendar feeds.">
                      <Seg value={prefs.calSyncFrequency} onChange={v=>updatePref('calSyncFrequency',v)} options={[
                        { value:'manual', label:'Manual' },
                        { value:'15',     label:'15 min' },
                        { value:'30',     label:'30 min' },
                        { value:'60',     label:'1 hour' },
                      ]} size="sm" />
                    </SettingRow>
                    <SettingRow label="Auto-create focus events" desc="Write completed focus sessions back to your primary calendar as events.">
                      <Toggle value={prefs.autoCreateFocusEvents} onChange={v=>updatePref('autoCreateFocusEvents',v)} />
                    </SettingRow>
                    <SettingRow label="Merge sessions into calendar" desc="Combine overlapping tracked sessions with matching calendar events." last>
                      <Toggle value={prefs.mergeSessionsToCalendar} onChange={v=>updatePref('mergeSessionsToCalendar',v)} />
                    </SettingRow>
                  </SettingCard>

                  {/* Display */}
                  <SettingCard title="Display & Layout" desc="Default views, timezone, and visual options" icon={Monitor} accent="#3b82f6">
                    <SettingRow label="Default calendar view" desc="The view shown when you open the Calendar page.">
                      <Seg value={prefs.calDefaultView} onChange={v=>updatePref('calDefaultView',v)} options={[
                        { value:'day',   label:'Day' },
                        { value:'week',  label:'Week' },
                        { value:'month', label:'Month' },
                      ]} />
                    </SettingRow>
                    <SettingRow label="Timezone" desc="Auto-detect from system, or lock to a specific zone.">
                      <div className="flex items-center gap-2">
                        <Seg value={prefs.timezone} onChange={v=>updatePref('timezone',v)} options={[
                          { value:'auto',  label:'Auto', Icon:Globe },
                          { value:'fixed', label:'Fixed' },
                        ]} />
                        {prefs.timezone === 'auto' && (
                          <span className="text-[11px] text-tx-faint">{detectedTz}</span>
                        )}
                      </div>
                    </SettingRow>
                    <SettingRow label="Sticky header" desc="Keep the time-of-day header visible while scrolling the timeline.">
                      <Toggle value={prefs.calStickyHeader} onChange={v=>updatePref('calStickyHeader',v)} />
                    </SettingRow>
                    <SettingRow label="Event stacking" desc="Stack overlapping events side-by-side rather than hiding them." last>
                      <Toggle value={prefs.calEventStacking} onChange={v=>updatePref('calEventStacking',v)} />
                    </SettingRow>
                  </SettingCard>
                </>
              )}

              {/* ════ FOCUS SESSIONS ════ */}
              {activeSection === 'focus' && (
                <>
                  <SettingCard title="Timer Presets" desc="Default durations for focus blocks and breaks" icon={Timer} accent="#f59e0b">
                    <SettingRow label="Focus duration" desc="Length of a single focus block.">
                      <DurationPicker value={prefs.focusDuration} onChange={v=>updatePref('focusDuration',v)} presets={[15,25,45,60]} />
                    </SettingRow>
                    <SettingRow label="Short break" desc="Break taken between focus blocks.">
                      <DurationPicker value={prefs.shortBreakDuration} onChange={v=>updatePref('shortBreakDuration',v)} presets={[3,5,10,15]} />
                    </SettingRow>
                    <SettingRow label="Long break" desc="Extended break after completing a full Pomodoro cycle.">
                      <DurationPicker value={prefs.longBreakDuration} onChange={v=>updatePref('longBreakDuration',v)} presets={[10,15,20,30]} />
                    </SettingRow>
                    <SettingRow label="Long break interval" desc="Number of focus blocks before a long break is triggered." last>
                      <Seg value={String(prefs.longBreakInterval)} onChange={v=>updatePref('longBreakInterval',Number(v))} options={[
                        {value:'2',label:'2'},
                        {value:'3',label:'3'},
                        {value:'4',label:'4'},
                        {value:'6',label:'6'},
                      ]} />
                    </SettingRow>
                  </SettingCard>

                  <SettingCard title="Focus Mode" desc="Automatic behavior and smart reminders during sessions" icon={Target} accent="#10b981">
                    <SettingRow label="Pomodoro mode" desc="Automatically rotate focus → short break → long break on a timer.">
                      <Toggle value={prefs.pomodoroMode} onChange={v=>updatePref('pomodoroMode',v)} />
                    </SettingRow>
                    <SettingRow label="Auto-start focus mode" desc="Enter focus mode automatically when a session is detected.">
                      <Toggle value={prefs.autoStartFocusMode} onChange={v=>updatePref('autoStartFocusMode',v)} />
                    </SettingRow>
                    <SettingRow label="Smart nudges" desc="Gentle on-screen nudges when you drift from your focus task.">
                      <Toggle value={prefs.smartNudges} onChange={v=>updatePref('smartNudges',v)} />
                    </SettingRow>
                    <SettingRow label="Focus reminders" desc="Remind you to start a session if you've been idle too long." last>
                      <Toggle value={prefs.focusReminders} onChange={v=>updatePref('focusReminders',v)} />
                    </SettingRow>
                  </SettingCard>

                  <SettingCard title="Focus Dock" desc="The floating session widget at the bottom of your screen" icon={Zap} accent="#a78bfa">
                    <SettingRow label="Dock position" desc="Where the floating focus dock appears on screen.">
                      <Seg value={prefs.dockPosition} onChange={v=>updatePref('dockPosition',v)} options={[
                        { value:'bottom-left',   label:'Left' },
                        { value:'bottom-center', label:'Center' },
                        { value:'bottom-right',  label:'Right' },
                      ]} />
                    </SettingRow>
                    <SettingRow label="Compact dock" desc="Show a minimal pill-sized dock instead of the full expanded bar." last>
                      <Toggle value={prefs.dockCompact} onChange={v=>updatePref('dockCompact',v)} />
                    </SettingRow>
                  </SettingCard>
                </>
              )}

              {/* ════ NOTIFICATIONS ════ */}
              {activeSection === 'notifs' && (
                <>
                  <SettingCard title="Alerts" desc="Desktop notification and sound settings" icon={Bell} accent="#3b82f6">
                    <SettingRow label="Desktop notifications" desc="Allow Flow Ledger to send system-level notifications.">
                      <Toggle value={prefs.desktopNotifications} onChange={v=>updatePref('desktopNotifications',v)} />
                    </SettingRow>
                    <SettingRow label="Notification sound" desc="Play a sound when an alert fires." last>
                      <div className="flex items-center gap-2">
                        <Toggle value={prefs.notifSound} onChange={v=>updatePref('notifSound',v)} />
                        {prefs.notifSound ? <Volume2 size={13} className="text-tx-faint" /> : <VolumeX size={13} className="text-tx-faint opacity-40" />}
                      </div>
                    </SettingRow>
                  </SettingCard>

                  <SettingCard title="Reminders" desc="Scheduled and context-aware reminders" icon={Bell} accent="#f59e0b">
                    <SettingRow label="Daily summary" desc="End-of-day productivity recap notification.">
                      <div className="flex items-center gap-3">
                        <Toggle value={prefs.dailySummary} onChange={v=>updatePref('dailySummary',v)} />
                        {prefs.dailySummary && (
                          <input type="time" value={prefs.dailySummaryTime} onChange={e=>updatePref('dailySummaryTime',e.target.value)}
                            className="rounded-xl py-1.5 px-2.5 text-[12px] font-semibold outline-none transition"
                            style={{ color:'var(--st-text)', background:'var(--st-ctrl-bg)', border:'1px solid var(--st-ctrl-brd)', colorScheme:'inherit' }} />
                        )}
                      </div>
                    </SettingRow>
                    <SettingRow label="Focus alerts" desc="Notify when you're in a long uninterrupted focus streak.">
                      <Toggle value={prefs.focusAlerts} onChange={v=>updatePref('focusAlerts',v)} />
                    </SettingRow>
                    <SettingRow label="Break reminders" desc="Remind you to step away when you've been working too long.">
                      <Toggle value={prefs.breakReminders} onChange={v=>updatePref('breakReminders',v)} />
                    </SettingRow>
                    <SettingRow label="Meeting reminders" desc="Alert a few minutes before upcoming calendar events." last>
                      <Toggle value={prefs.meetingReminders} onChange={v=>updatePref('meetingReminders',v)} />
                    </SettingRow>
                  </SettingCard>
                </>
              )}

              {/* ════ SHORTCUTS ════ */}
              {activeSection === 'shortcuts' && (
                <>
                  <SettingCard title="Global Keyboard Shortcuts" desc="Hotkeys that work even when Flow Ledger is in the background" icon={Keyboard} accent="#06b6d4">
                    <div className="mb-3 flex items-start gap-2.5 rounded-xl px-3.5 py-3"
                      style={{ background:'rgba(6,182,212,0.07)', border:'1px solid rgba(6,182,212,0.16)' }}>
                      <Info size={12} className="mt-0.5 shrink-0" style={{ color:'#06b6d4' }} />
                      <p className="text-[11px] text-tx-faint leading-relaxed">
                        Global shortcuts are registered at the OS level and work even when the Flow Ledger window is hidden. Custom shortcut recording coming soon.
                      </p>
                    </div>
                    {[
                      { label:'Start / Stop tracking',   desc:'Toggle the background tracker',             key: prefs.shortcutStartStop    },
                      { label:'Enter focus mode',         desc:'Start a focus session immediately',          key: prefs.shortcutFocusMode     },
                      { label:'Open command palette',     desc:'Jump to any page or action',                 key: prefs.shortcutPalette       },
                      { label:'Quick capture',            desc:'Log time or add a session without opening the app', key: prefs.shortcutQuickCapture },
                    ].map((item, i, arr) => (
                      <SettingRow key={item.label} label={item.label} desc={item.desc} last={i===arr.length-1}>
                        <ShortcutBadge keys={item.key} />
                      </SettingRow>
                    ))}
                  </SettingCard>

                  <SettingCard title="Trigger Actions" desc="Run automations when specific events happen" icon={Zap} accent="#f59e0b">
                    <div className="mb-3 flex items-start gap-2.5 rounded-xl px-3.5 py-3"
                      style={{ background:'rgba(245,158,11,0.07)', border:'1px solid rgba(245,158,11,0.16)' }}>
                      <Sparkles size={12} className="mt-0.5 shrink-0 text-amber-400" />
                      <p className="text-[11px] text-tx-faint leading-relaxed">
                        Trigger-based automations fire when conditions are met. Full customization with scripting support coming in a future update.
                      </p>
                    </div>
                    {[
                      { label:'On focus session start',  desc:'Execute an action when a focus block begins' },
                      { label:'On break time',           desc:'Trigger when a break reminder fires' },
                      { label:'On daily target reached', desc:'Celebrate when you hit your daily goal' },
                      { label:'On distraction detected', desc:'React when a blacklisted app is opened' },
                    ].map((item, i, arr) => (
                      <SettingRow key={item.label} label={item.label} desc={item.desc} last={i===arr.length-1}>
                        <button className="rounded-xl px-3 py-1.5 text-[11px] font-semibold transition"
                          style={{ background:'var(--st-ctrl-bg)', border:'1px solid var(--st-ctrl-brd)', color:'var(--st-text-faint2)' }}
                          onMouseEnter={e=>{e.currentTarget.style.borderColor='rgba(245,158,11,0.35)';e.currentTarget.style.color='var(--st-text)';}}
                          onMouseLeave={e=>{e.currentTarget.style.borderColor='';e.currentTarget.style.color='';}}>
                          Configure
                        </button>
                      </SettingRow>
                    ))}
                  </SettingCard>
                </>
              )}

              {/* ════ CATEGORIES ════ */}
              {activeSection === 'categories' && (
                <SettingCard title="Session Categories" desc="Color-code and organize your tracked time blocks" icon={Tag} accent="#fb923c">
                  {categories.length === 0 ? (
                    <div className="mb-5 flex flex-col items-center justify-center rounded-2xl py-8 text-center" style={{ border:'1px dashed var(--st-divider)' }}>
                      <Tag size={22} className="mb-2 text-tx-faint opacity-30" />
                      <p className="text-[12px] text-tx-faint">No custom categories yet. Add one below.</p>
                    </div>
                  ) : (
                    <div className="mb-5 space-y-1.5">
                      {categories.map(cat => (
                        <div key={cat.id} className="group flex items-center justify-between rounded-xl px-4 py-3 transition"
                          style={{ background:'var(--st-item-bg)', border:'1px solid var(--st-divider)' }}
                          onMouseEnter={e=>e.currentTarget.style.background='var(--st-item-hover)'}
                          onMouseLeave={e=>e.currentTarget.style.background='var(--st-item-bg)'}>
                          <div className="flex items-center gap-3">
                            <div className="h-3 w-3 rounded-full" style={{ background:cat.color, boxShadow:`0 2px 8px ${cat.color}55` }} />
                            <span className="text-[13px] font-semibold" style={{ color:'var(--st-text)' }}>{cat.name}</span>
                            <span className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                              style={{ background:`${cat.color}18`, color:cat.color, border:`1px solid ${cat.color}30` }}>
                              {cat.session_type}
                            </span>
                          </div>
                          <button onClick={()=>delCategory(cat.id)} className="rounded-lg p-1.5 opacity-0 transition-all group-hover:opacity-100" style={{ color:'#f87171' }}
                            onMouseEnter={e=>e.currentTarget.style.background='rgba(239,68,68,0.12)'}
                            onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                            <Trash2 size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="rounded-2xl p-4 space-y-3" style={{ background:'var(--st-item-bg)', border:'1px solid var(--st-divider)' }}>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-tx-faint">New Category</p>
                    <div className="flex gap-1.5">
                      {TYPES.map(t => (
                        <button key={t.value} onClick={()=>setNewType(t.value)} className="flex-1 rounded-xl py-1.5 text-[11px] font-semibold transition-all"
                          style={{ background:newType===t.value?`${t.color}1F`:'var(--st-item-bg)', border:`1px solid ${newType===t.value?t.color+'42':'var(--st-divider)'}`, color:newType===t.value?t.color:'var(--st-text-faint2)' }}>
                          {t.label}
                        </button>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {COLORS.map(c => (
                        <button key={c} onClick={()=>setNewColor(c)} className="relative h-5 w-5 rounded-lg transition-all hover:scale-110"
                          style={{ background:c, boxShadow:newColor===c?`0 0 0 2.5px var(--st-card-bg),0 0 0 4.5px ${c}`:undefined, transform:newColor===c?'scale(1.15)':'scale(1)' }}>
                          {newColor===c && <Check size={9} className="absolute inset-0 m-auto text-white" strokeWidth={3.5} />}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="Category name…"
                        onKeyDown={e=>e.key==='Enter'&&addCategory()}
                        className="flex-1 rounded-xl py-2 px-3 text-[12.5px] placeholder-tx-faint outline-none transition"
                        style={{ color:'var(--st-text)', background:'var(--st-input-bg)', border:'1px solid var(--st-input-brd)' }}
                        onFocus={e=>e.target.style.borderColor='rgba(124,108,242,0.55)'}
                        onBlur={e=>e.target.style.borderColor=''}
                      />
                      <button onClick={addCategory} className="flex items-center gap-1.5 rounded-xl px-4 text-[12px] font-bold text-white transition hover:brightness-110"
                        style={{ background:'linear-gradient(135deg,var(--color-accent),#6b6dff)', boxShadow:'0 4px 12px rgba(124,108,242,0.28)' }}>
                        <Plus size={13} />Add
                      </button>
                    </div>
                  </div>
                </SettingCard>
              )}

              {/* ════ INTEGRATIONS ════ */}
              {activeSection === 'integrations' && (
                <>
                  <SettingCard title="Chrome Extension" desc="Track individual websites and tabs inside Chrome" icon={Chrome} accent="#4285f4">
                    <div className="space-y-2 mb-4">
                      {[
                        { step:1, label:'Open chrome://extensions',    desc:'Navigate to this URL in Chrome' },
                        { step:2, label:'Enable Developer Mode',        desc:'Toggle the switch in the top-right corner' },
                        { step:3, label:'Click "Load Unpacked"',        desc:'Select the chrome-extension/ folder from Flow Ledger' },
                        { step:4, label:'Done — auto-connects',         desc:'Extension connects to localhost:27314 automatically' },
                      ].map(item => (
                        <div key={item.step} className="flex items-start gap-3 rounded-xl px-4 py-3"
                          style={{ background:'var(--st-item-bg)', border:'1px solid var(--st-divider)' }}>
                          <div className="flex h-6 w-6 shrink-0 mt-0.5 items-center justify-center rounded-full text-[10px] font-extrabold"
                            style={{ background:'rgba(66,133,244,0.20)', border:'1px solid rgba(66,133,244,0.32)', color:'#4285f4' }}>{item.step}</div>
                          <div>
                            <p className="text-[12.5px] font-semibold" style={{ color:'var(--st-text)' }}>{item.label}</p>
                            <p className="text-[11px] text-tx-faint">{item.desc}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-start gap-2.5 rounded-xl px-3.5 py-3" style={{ background:'rgba(245,158,11,0.07)', border:'1px solid rgba(245,158,11,0.18)' }}>
                      <Info size={12} className="mt-0.5 shrink-0 text-amber-400" />
                      <p className="text-[11px] text-tx-faint">Without the extension, Chrome appears as a single block. Requires Flow Ledger Desktop on <span className="font-mono text-[10px]" style={{ color:'var(--st-text)', background:'var(--st-ctrl-bg)', padding:'1px 5px', borderRadius:5 }}>localhost:27314</span>.</p>
                    </div>
                  </SettingCard>

                </>
              )}

              {/* ════ PRIVACY ════ */}
              {activeSection === 'updates' && <AboutUpdatesSection />}

              {activeSection === 'privacy' && (
                <>
                  <SettingCard title="Data & Privacy" desc="Your data stays on your device — always" icon={ShieldCheck} accent="#10b981">
                    <div className="space-y-2.5">
                      {[
                        { label:'Local-first storage',       desc:'All sessions, tasks, and settings are in a SQLite database on this machine only.' },
                        { label:'No telemetry or analytics', desc:'Flow Ledger never sends crash reports, usage events, or any data to external servers.' },
                        { label:'No cloud account required', desc:'Works 100% offline. Supabase sync is purely optional and configured entirely by you.' },
                      ].map(item => (
                        <div key={item.label} className="flex items-start gap-3 rounded-xl px-4 py-3.5"
                          style={{ background:'rgba(16,185,129,0.07)', border:'1px solid rgba(16,185,129,0.14)' }}>
                          <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                            style={{ background:'rgba(16,185,129,0.22)', border:'1px solid rgba(16,185,129,0.32)' }}>
                            <Check size={10} className="text-green-400" strokeWidth={3.5} />
                          </div>
                          <div>
                            <p className="text-[12.5px] font-bold" style={{ color:'var(--st-text)' }}>{item.label}</p>
                            <p className="mt-0.5 text-[11px] text-tx-faint leading-relaxed">{item.desc}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </SettingCard>

                  {/* Danger Zone */}
                  <div className="fl-danger-zone rounded-2xl overflow-hidden"
                    style={{ background:'linear-gradient(145deg,rgba(28,10,12,0.97),rgba(18,8,10,0.99))', border:'1px solid rgba(239,68,68,0.20)', boxShadow:'0 12px 40px rgba(0,0,0,0.20),inset 0 1px 0 rgba(239,68,68,0.06)' }}>
                    <div className="flex items-center gap-3 px-5 py-4" style={{ background:'rgba(239,68,68,0.08)', borderBottom:'1px solid rgba(239,68,68,0.14)' }}>
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl" style={{ background:'rgba(239,68,68,0.18)', border:'1px solid rgba(239,68,68,0.30)' }}>
                        <AlertTriangle size={15} className="text-red-400" />
                      </div>
                      <div>
                        <h3 className="text-[13.5px] font-bold text-red-300">Danger Zone</h3>
                        <p className="text-[11px]" style={{ color:'rgba(248,113,113,0.60)' }}>Irreversible actions — proceed with extreme caution</p>
                      </div>
                    </div>
                    <div className="px-5 py-5">
                      {!showResetConfirm ? (
                        <div className="flex items-start justify-between gap-6">
                          <div>
                            <p className="text-[13px] font-bold" style={{ color:'var(--st-text)' }}>Reset all workspace data</p>
                            <p className="mt-1 text-[11.5px] text-tx-faint leading-relaxed">Permanently deletes all sessions, tasks, projects, clients, categories, and settings.</p>
                          </div>
                          <button onClick={()=>setShowResetConfirm(true)} className="flex shrink-0 items-center gap-1.5 rounded-xl px-4 py-2 text-[12px] font-bold text-red-400 transition"
                            style={{ background:'rgba(239,68,68,0.12)', border:'1px solid rgba(239,68,68,0.26)' }}
                            onMouseEnter={e=>e.currentTarget.style.background='rgba(239,68,68,0.22)'}
                            onMouseLeave={e=>e.currentTarget.style.background='rgba(239,68,68,0.12)'}>
                            <Trash2 size={12} />Reset All Data
                          </button>
                        </div>
                      ) : (
                        <div className="rounded-2xl p-4" style={{ background:'rgba(239,68,68,0.07)', border:'1px solid rgba(239,68,68,0.18)' }}>
                          <div className="flex items-start gap-3 mb-4">
                            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-red-400" />
                            <div>
                              <p className="text-[13px] font-extrabold text-red-300">This cannot be undone.</p>
                              <p className="mt-0.5 text-[11.5px] leading-relaxed" style={{ color:'rgba(248,113,113,0.75)' }}>
                                Type <strong className="font-mono text-white">reset</strong> below to confirm.
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <input value={resetInput} onChange={e=>setResetInput(e.target.value)} placeholder="Type 'reset' to confirm"
                              className="flex-1 rounded-xl py-2 px-3 text-[12.5px] font-mono placeholder-tx-faint outline-none transition"
                              style={{ color:'var(--st-text)', background:'var(--st-input-bg)', border:'1px solid rgba(239,68,68,0.30)' }}
                              onFocus={e=>e.target.style.borderColor='rgba(239,68,68,0.60)'}
                              onBlur={e=>e.target.style.borderColor='rgba(239,68,68,0.30)'}
                            />
                            <button onClick={handleResetAllData} disabled={resetInput.toLowerCase()!=='reset'||resetting}
                              className="flex shrink-0 items-center gap-1.5 rounded-xl px-4 py-2 text-[12px] font-bold text-white transition disabled:opacity-40"
                              style={{ background:'#dc2626', boxShadow:'0 4px 14px rgba(220,38,38,0.28)' }}>
                              {resetting?<><Loader2 size={12} className="animate-spin"/>Resetting…</>:'Confirm Reset'}
                            </button>
                            <button onClick={()=>{setShowResetConfirm(false);setResetInput('');}} className="shrink-0 rounded-xl px-3 py-2 text-[11.5px] text-tx-secondary transition hover:text-white"
                              style={{ background:'var(--st-ctrl-bg)', border:'1px solid var(--st-ctrl-brd)' }}>Cancel</button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </>
          )}
          <div className="h-8" />
        </div>
      </div>

      {/* Save toast */}
      {saveToast && (
        <div className="pointer-events-none fixed bottom-6 right-6 z-50 flex items-center gap-2.5 rounded-2xl px-4 py-3"
          style={{ background:'linear-gradient(145deg,rgba(18,24,38,0.97),rgba(12,16,26,0.99))', border:'1px solid rgba(52,211,153,0.28)', boxShadow:'0 16px 40px rgba(0,0,0,0.32),inset 0 1px 0 rgba(255,255,255,0.05)', backdropFilter:'blur(20px)', animation:'settingsToastIn 0.22s cubic-bezier(0.22,1,0.36,1) forwards' }}>
          <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full" style={{ background:'rgba(52,211,153,0.22)' }}>
            <CheckCircle2 size={12} className="text-green-400" />
          </div>
          <span className="text-[12.5px] font-semibold text-white">{saveToast}</span>
        </div>
      )}

      {showCalDialog && <CalConnectDialog onClose={()=>setShowCalDialog(false)} onSave={addCalSource} />}
    </div>
  );
}
