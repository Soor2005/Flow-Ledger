import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Play, Square, Trash2, Zap, Clock, Plus, X, TimerReset, Coffee,
  RotateCcw, Award, Briefcase, CheckSquare, Shield, ChevronDown,
  FolderOpen, CheckCircle2, Activity, Globe, Code2, MessageSquare,
  Mail, Terminal, PenLine, AlertTriangle, Package, Radio, Calendar,
  Moon, Cpu, Monitor, Pause, RefreshCw, Eye, TrendingUp, BarChart2,
  Target, Flame, ArrowRight, Layers,
} from 'lucide-react';
import { formatDuration, formatTime, getCategoryColor, todayStart } from '../../utils/helpers';
import { usePrefs } from '../../hooks/usePrefs';
import { pushToast } from '../shared/NotificationCentre';
import { analyzeContext } from '../../ai/engines/eventContextAnalyzer.js';
import { generateTitle, generateDescription } from '../../ai/engines/eventWritingEngine.js';
import { useTimerAI } from '../../hooks/useTimerAI.js';
import AIStatusPanel, { PostSessionAICard } from './AIStatusPanel.jsx';
import { finalizeSessionIntelligence } from '../../ai/timer/timerAIEngine.js';
import SessionInspectorPanel from './SessionInspectorPanel.jsx';

const api = window.electron || {};

// ─── AI session-end notification builder ─────────────────────────────────────
// Title  → event title (AI-generated or user-set, never "Auto: X").
// Body   → stat summary distinct from the title: duration · category · deep focus · project
// The body NEVER re-describes the title — no "Researched Research Session." echoes.
function buildSessionEndNotif(session, durationSecs) {
  const h = Math.floor(durationSecs / 3600);
  const m = Math.round((durationSecs % 3600) / 60);
  const durLabel = h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${Math.max(1, m)}m`;

  const CAT_LABELS = {
    development: 'Development', coding: 'Development', research: 'Research',
    design: 'Design', writing: 'Writing', planning: 'Planning',
    meeting: 'Meeting', communication: 'Communication', learning: 'Learning',
    data: 'Data & Analytics', admin: 'Admin', focus: 'Focus', break: 'Break',
  };
  const rawCat   = (session.category || '').toLowerCase();
  const catLabel = CAT_LABELS[rawCat] || (session.category
    ? session.category.charAt(0).toUpperCase() + session.category.slice(1)
    : 'Session');

  const parts = [durLabel, catLabel];
  if (session.is_deep_work) parts.push('Deep focus');
  if (session.project_name) parts.push(session.project_name);
  const body = parts.join(' · ');

  let notifTitle;
  try {
    const isAutoSession = (session.title || '').toLowerCase().startsWith('auto:');
    if (isAutoSession) {
      const appName = (session.title || '').replace(/^auto:\s*/i, '').trim();
      notifTitle = appName
        ? `${appName.charAt(0).toUpperCase() + appName.slice(1)} — auto-tracked`
        : 'Auto-tracked session';
    } else if (session.title && !['session', 'focus session', 'focus block', 'untitled'].includes(session.title.toLowerCase())) {
      notifTitle = session.title;
    } else {
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

// ─── Helpers ──────────────────────────────────────────────────────────────────
function pad(n) { return String(n).padStart(2, '0'); }
function formatTimer(s) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}
function fmtHM(s) {
  if (!s || s < 0) return '0m';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
function fmtCountdown(secs) {
  if (secs <= 0) return 'ending now';
  const m = Math.floor(secs / 60), s = secs % 60;
  return m > 0 ? `${m}m ${pad(s)}s` : `${s}s`;
}

// ─── Meeting-event detector ───────────────────────────────────────────────────
// Returns true only when a calendar event has genuine meeting/conferencing
// attributes. A plain calendar block (dentist, lunch, school run) returns false.
function isMeetingEvent(ev) {
  if (!ev) return false;
  if (ev.meeting_url) return true;
  if (ev.conference_data || ev.hangout_link) return true;
  const text = `${ev.title || ''} ${ev.description || ''} ${ev.location || ''}`.toLowerCase();
  if (/zoom\.us|meet\.google|teams\.microsoft|webex\.com|whereby\.com|bluejeans\.com|gotomeeting|around\.co/.test(text)) return true;
  if (/\bstand.?up\b|standup|\bsync\b|\bscrum\b|\bcall\b|\bmeeting\b|\binterview\b|\bwebinar\b|\bdemo\b|\bconference\b/.test((ev.title || '').toLowerCase())) return true;
  return false;
}

// ─── App classifier ───────────────────────────────────────────────────────────
function classifyApp(name = '') {
  const n = name.toLowerCase();
  if (/code|vscode|cursor|vim|neovim|intellij|xcode|pycharm|sublime|webstorm|rider|fleet/.test(n))
    return { type: 'deep',        label: 'Coding',  Icon: Code2,         color: '#6366f1' };
  if (/figma|sketch|photoshop|illustrator|canva|affinity|blender|cinema4d/.test(n))
    return { type: 'deep',        label: 'Design',  Icon: PenLine,       color: '#a78bfa' };
  if (/word|docs|notion|obsidian|bear|typora|pages|ulysses|scrivener/.test(n))
    return { type: 'deep',        label: 'Writing', Icon: PenLine,       color: '#34d399' };
  if (/terminal|iterm|warp|powershell|bash|hyper|alacritty|kitty/.test(n))
    return { type: 'deep',        label: 'Terminal',Icon: Terminal,      color: '#f59e0b' };
  if (/chrome|firefox|safari|edge|brave|arc|opera/.test(n))
    return { type: 'shallow',     label: 'Browser', Icon: Globe,         color: '#fb923c' };
  if (/slack|discord|teams|zoom|telegram|messages|signal|whatsapp/.test(n))
    return { type: 'shallow',     label: 'Chat',    Icon: MessageSquare, color: '#fb923c' };
  if (/mail|outlook|gmail|spark|thunderbird|airmail/.test(n))
    return { type: 'shallow',     label: 'Email',   Icon: Mail,          color: '#fb923c' };
  if (/youtube|netflix|spotify|twitch|tiktok|vlc|quicktime|plex/.test(n))
    return { type: 'distraction', label: 'Media',   Icon: AlertTriangle, color: '#ef4444' };
  if (/twitter|instagram|facebook|reddit/.test(n))
    return { type: 'distraction', label: 'Social',  Icon: AlertTriangle, color: '#ef4444' };
  return { type: 'neutral', label: 'Other', Icon: Package, color: '#94a3b8' };
}

const CLASSIFY_RULES = [
  { label: 'Coding',   pattern: 'VS Code, Cursor, Vim, IntelliJ, PyCharm', type: 'deep',        color: '#6366f1', Icon: Code2          },
  { label: 'Design',   pattern: 'Figma, Sketch, Photoshop, Illustrator',   type: 'deep',        color: '#a78bfa', Icon: PenLine        },
  { label: 'Writing',  pattern: 'Notion, Obsidian, Word, Bear, Typora',    type: 'deep',        color: '#34d399', Icon: PenLine        },
  { label: 'Terminal', pattern: 'Terminal, Warp, iTerm, PowerShell',       type: 'deep',        color: '#f59e0b', Icon: Terminal       },
  { label: 'Browser',  pattern: 'Chrome, Firefox, Safari, Arc, Edge',      type: 'shallow',     color: '#fb923c', Icon: Globe          },
  { label: 'Chat',     pattern: 'Slack, Discord, Teams, Zoom, Telegram',   type: 'shallow',     color: '#fb923c', Icon: MessageSquare  },
  { label: 'Email',    pattern: 'Mail, Outlook, Spark, Gmail',             type: 'shallow',     color: '#fb923c', Icon: Mail           },
  { label: 'Media',    pattern: 'YouTube, Netflix, Spotify, Twitch',       type: 'distraction', color: '#ef4444', Icon: AlertTriangle  },
  { label: 'Social',   pattern: 'Twitter, Instagram, Reddit, Facebook',    type: 'distraction', color: '#ef4444', Icon: AlertTriangle  },
];

const TYPE_META = {
  deep:        { label: 'Deep Work',    bg: 'bg-indigo-500/12',   text: 'text-indigo-400',   border: 'border-indigo-500/20' },
  shallow:     { label: 'Shallow Work', bg: 'bg-amber-500/12',    text: 'text-amber-400',    border: 'border-amber-500/20'  },
  distraction: { label: 'Distraction',  bg: 'bg-red-500/12',      text: 'text-red-400',      border: 'border-red-500/20'    },
  neutral:     { label: 'Neutral',      bg: 'bg-bg-hover',        text: 'text-tx-muted',     border: 'border-brd-default'   },
};

function focusQuality(appClass, elapsedSecs) {
  if (!appClass) return 0;
  const base    = appClass.type === 'deep' ? 72 : appClass.type === 'shallow' ? 44 : 15;
  const sustain = Math.min(18, Math.floor(elapsedSecs / 300) * 4);
  return Math.min(100, base + sustain);
}
function fqColor(s) {
  if (s >= 75) return '#4ade80';
  if (s >= 50) return '#facc15';
  if (s >= 30) return '#fb923c';
  return '#f87171';
}

// ─── Category mapper ──────────────────────────────────────────────────────────
function mapToCategory(appClass, userCategories) {
  if (!appClass || !userCategories.length) return userCategories[0]?.name || 'Focus';
  const KEYWORD_MAP = {
    Coding:   ['code', 'dev', 'engineering', 'development', 'programming', 'tech'],
    Design:   ['design', 'creative', 'art', 'visual', 'ux', 'ui'],
    Writing:  ['write', 'writing', 'content', 'blog', 'docs', 'copy'],
    Browser:  ['research', 'browse', 'web', 'internet'],
    Chat:     ['meeting', 'comm', 'slack', 'chat', 'calls'],
    Email:    ['email', 'mail', 'inbox'],
    Terminal: ['terminal', 'shell', 'cli', 'command'],
  };
  const exact = userCategories.find(c => c.name.toLowerCase() === appClass.label.toLowerCase());
  if (exact) return exact.name;
  const kws = KEYWORD_MAP[appClass.label] || [];
  const fuzzy = userCategories.find(c => kws.some(k => c.name.toLowerCase().includes(k)));
  if (fuzzy) return fuzzy.name;
  return userCategories[0]?.name || appClass.label;
}

// ─── App avatar ───────────────────────────────────────────────────────────────
function AppAvatar({ name = '', size = 44, active = false }) {
  const APP_COLORS = ['#6366f1','#a78bfa','#34d399','#f59e0b','#fb923c','#60a5fa','#f472b6','#4ade80'];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const color = APP_COLORS[h % APP_COLORS.length];
  return (
    <div style={{
      width: size, height: size, borderRadius: Math.round(size * 0.28),
      background: `${color}18`, border: `1.5px solid ${color}${active ? '55' : '30'}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      boxShadow: active ? `0 0 0 3px ${color}12, 0 0 16px ${color}18` : 'none',
      transition: 'box-shadow 0.3s ease, border-color 0.3s ease',
    }}>
      <span style={{ fontSize: Math.round(size * 0.42), fontWeight: 800, color, lineHeight: 1 }}>
        {name.trim()[0]?.toUpperCase() || '?'}
      </span>
    </div>
  );
}

// ─── Focus type chip ──────────────────────────────────────────────────────────
function TypeChip({ type, size = 'sm' }) {
  const m = TYPE_META[type] || TYPE_META.neutral;
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-bold uppercase tracking-wide ${size === 'xs' ? 'text-[9px]' : 'text-[10px]'} ${m.bg} ${m.text} ${m.border}`}>
      {type === 'deep' && <Zap size={size === 'xs' ? 8 : 9} />}
      {m.label}
    </span>
  );
}

// ─── Focus quality ring (SVG) ─────────────────────────────────────────────────
function FocusRing({ score, color, size = 80, label }) {
  const r = (size - 10) / 2;
  const C = 2 * Math.PI * r;
  const dash = (score / 100) * C;
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <defs>
          <filter id="fq-glow" x="-30%" y="-30%" width="160%" height="160%" colorInterpolationFilters="sRGB">
            <feGaussianBlur in="SourceAlpha" stdDeviation="2" result="blur" />
            <feFlood floodColor={color} floodOpacity="0.4" result="col" />
            <feComposite in="col" in2="blur" operator="in" result="glow" />
            <feMerge><feMergeNode in="glow" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--color-bg-hover, #1e222e)" strokeWidth={7} />
        {score > 0 && (
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={7}
            strokeDasharray={`${dash} ${C}`} strokeLinecap="round"
            filter="url(#fq-glow)"
            style={{ transition: 'stroke-dasharray 0.8s cubic-bezier(0.4,0,0.2,1)' }} />
        )}
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
        <span style={{ fontSize: Math.round(size * 0.24), fontWeight: 800, color, lineHeight: 1 }}>{score}</span>
        {label && <span style={{ fontSize: 9, color: '#64748b', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{label}</span>}
      </div>
    </div>
  );
}

// ─── Mode toggle ──────────────────────────────────────────────────────────────
function ModeToggle({ mode, onChange }) {
  return (
    <div className="flex items-center gap-1 rounded-xl bg-bg-input p-1">
      {[
        { id: 'auto',   Icon: Radio, label: 'Automatic' },
        { id: 'manual', Icon: Play,  label: 'Manual'    },
      ].map(({ id, Icon, label }) => {
        const active = mode === id;
        return (
          <button key={id} onClick={() => onChange(id)}
            className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all ${
              active ? 'bg-bg-active text-tx-primary shadow-sm' : 'text-tx-muted hover:text-tx-secondary'
            }`}>
            <Icon size={11} />
            {label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Focus hero card (auto mode centrepiece) ──────────────────────────────────
function FocusHeroCard({
  heartbeat, isIdle, idleElapsed, activeCalEvent, calCountdown,
  autoElapsed, appClass, categories, activeSession,
  autoFocusSession, autoFocusState, bufferPct,
  onStopAutoSession, onPauseAutoSession, onResumeAutoTracking, trackingElapsed,
}) {
  const fq = useMemo(() => focusQuality(appClass, autoElapsed), [appClass, autoElapsed]);
  const fqC = fqColor(fq);

  const calProgress = activeCalEvent
    ? Math.max(0, Math.min(1,
        (Math.floor(Date.now() / 1000) - activeCalEvent.start_time)
        / (activeCalEvent.end_time - activeCalEvent.start_time)
      ))
    : 0;
  const evColor = activeCalEvent?.color || '#60A5FA';

  // Session is alive even while idle — it will only end after AUTO_IDLE_STOP_SECS
  const sessionAliveWhileIdle = isIdle && autoFocusState === 'tracking' && autoFocusSession;

  const isMeeting = isMeetingEvent(activeCalEvent);

  const statusBadge = autoFocusState === 'user_paused' ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-status-amber/12 px-2.5 py-1 text-[11px] font-semibold text-status-amber">
      <Pause size={9} className="text-status-amber" />Paused
    </span>
  ) : activeCalEvent ? (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
      isMeeting ? 'bg-status-amber/12 text-status-amber' : 'bg-blue-500/10 text-blue-400'
    }`}>
      <span className={`h-1.5 w-1.5 rounded-full animate-pulse ${isMeeting ? 'bg-status-amber' : 'bg-blue-400'}`} />
      {isMeeting ? 'In meeting' : 'In event'}
    </span>
  ) : isIdle ? (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
      sessionAliveWhileIdle
        ? 'bg-indigo-500/10 text-indigo-400'  // session still running — show it
        : 'bg-bg-hover text-tx-faint'
    }`}>
      <span className={`h-1.5 w-1.5 rounded-full ${sessionAliveWhileIdle ? 'bg-indigo-400' : 'bg-tx-faint'}`} />
      {sessionAliveWhileIdle ? 'Idle · session live' : 'Idle'}
    </span>
  ) : autoFocusState === 'buffering' ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-500/12 px-2.5 py-1 text-[11px] font-semibold text-indigo-400">
      <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse" />Starting…
    </span>
  ) : autoFocusState === 'tracking' ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-status-green/10 px-2.5 py-1 text-[11px] font-semibold text-status-green">
      <span className="h-1.5 w-1.5 rounded-full bg-status-green animate-pulse" />Tracking
    </span>
  ) : heartbeat?.appName ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-bg-hover px-2.5 py-1 text-[11px] font-semibold text-tx-muted">
      <span className="h-1.5 w-1.5 rounded-full bg-tx-muted" />Watching
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-bg-hover px-2.5 py-1 text-[11px] font-semibold text-tx-faint">
      <Cpu size={10} className="animate-pulse" />Waiting
    </span>
  );

  return (
    <div className="fl-card overflow-hidden" style={{
      boxShadow: autoFocusState === 'tracking'
        ? '0 0 0 1px rgba(124,108,242,0.18), 0 4px 24px rgba(124,108,242,0.08)'
        : undefined,
    }}>
      {/* Tracking accent line */}
      {autoFocusState === 'tracking' && (
        <div style={{ height: 2, background: 'linear-gradient(90deg, #7c6cf2, #a78bfa 50%, transparent 100%)' }} />
      )}
      {/* ── Header ── */}
      <div className="flex items-center justify-between border-b border-brd-subtle px-5 py-3"
        style={{ background: autoFocusState === 'tracking' ? 'rgba(124,108,242,0.03)' : undefined }}>
        <div className="flex items-center gap-2.5">
          <div className={`relative flex h-7 w-7 items-center justify-center rounded-lg ${
            autoFocusState === 'tracking' ? 'bg-accent/15' : 'bg-accent/10'
          }`}>
            <Activity size={13} className="text-accent" />
            {autoFocusState === 'tracking' && (
              <span className="absolute -right-0.5 -top-0.5 flex h-2.5 w-2.5">
                <span className="absolute h-full w-full rounded-full bg-status-green animate-ping opacity-60" />
                <span className="relative h-2.5 w-2.5 rounded-full bg-status-green border border-bg-card" />
              </span>
            )}
          </div>
          <span className="text-xs font-bold uppercase tracking-wider" style={{
            color: autoFocusState === 'tracking' ? 'rgba(124,108,242,0.9)' : undefined,
          }}>Live Activity</span>
        </div>
        {statusBadge}
      </div>

      {/* ── User-paused ── */}
      {autoFocusState === 'user_paused' ? (
        <div className="flex flex-col items-center justify-center gap-4 py-10 px-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-status-amber/10 ring-1 ring-status-amber/20">
            <Pause size={30} className="text-status-amber" />
          </div>
          <div className="text-center">
            <p className="text-sm font-bold text-tx-secondary">Auto-tracking paused</p>
            <p className="mt-1 text-xs text-tx-faint">No new focus sessions will be recorded until you resume.</p>
          </div>
          <button
            onClick={onResumeAutoTracking}
            className="flex items-center gap-2 rounded-xl bg-status-green/15 border border-status-green/25 px-5 py-2.5 text-sm font-bold text-status-green transition hover:bg-status-green/25 hover:text-white">
            <Play size={13} fill="currentColor" />Resume tracking
          </button>
          {heartbeat?.appName && (
            <div className="flex items-center gap-2 text-[10px] text-tx-faint">
              <Monitor size={10} /><span>Background: {heartbeat.appName}</span>
            </div>
          )}
        </div>

      /* ── Idle ── */
      ) : isIdle ? (
        <div className="flex flex-col items-center justify-center gap-4 py-10 px-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-bg-hover/80 ring-1 ring-brd-subtle">
            <Moon size={30} className="text-tx-faint" />
          </div>
          <div className="text-center">
            <p className="text-sm font-bold text-tx-secondary">No activity detected</p>
            {idleElapsed > 0 && (
              <p className="mt-1 text-xs text-tx-faint">Idle for {fmtHM(idleElapsed)}</p>
            )}
          </div>

          {/* Session keeps running while idle — show it clearly */}
          {sessionAliveWhileIdle ? (
            <div className="w-full rounded-xl bg-indigo-500/8 border border-indigo-500/18 px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse shrink-0" />
                  <span className="text-xs font-semibold text-indigo-300 truncate">
                    {autoFocusSession.title || autoFocusSession.category} · still running
                  </span>
                </div>
                <span className="num shrink-0 ml-3 font-mono text-xs font-bold text-indigo-300">
                  {formatTimer(Math.floor(Date.now() / 1000) - autoFocusSession.started_at)}
                </span>
              </div>
              <p className="mt-1.5 text-[10px] text-indigo-400/60">
                Session ends after 5 min idle · resume anytime to keep it going
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-lg bg-bg-input px-4 py-2">
              <RefreshCw size={10} className="text-tx-faint" />
              <p className="text-[10px] text-tx-faint">Will resume automatically when you return</p>
            </div>
          )}
        </div>

      /* ── Calendar event ── */
      ) : activeCalEvent ? (
        <div className="p-5">
          <div className="mb-4 flex items-start gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
              style={{ background: `${evColor}18`, border: `1.5px solid ${evColor}30` }}>
              <Calendar size={20} style={{ color: evColor }} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-tx-primary truncate">{activeCalEvent.title || 'Calendar Event'}</p>
              <p className="mt-0.5 text-xs text-tx-muted">
                {formatTime(activeCalEvent.start_time)} → {formatTime(activeCalEvent.end_time)}
              </p>
              {calCountdown > 0 && (
                <p className="mt-0.5 text-[10px] text-status-amber">ends in {fmtCountdown(calCountdown)}</p>
              )}
            </div>
          </div>

          {/* Progress bar */}
          <div className="mb-4">
            <div className="h-1.5 overflow-hidden rounded-full bg-bg-hover">
              <div className="h-full rounded-full transition-all duration-1000"
                style={{ width: `${calProgress * 100}%`, background: `linear-gradient(90deg, ${evColor}, ${evColor}aa)` }} />
            </div>
            <div className="mt-1.5 flex justify-between">
              <span className="text-[10px] text-tx-faint">{Math.round(calProgress * 100)}% complete</span>
              <span className="text-[10px] text-tx-faint">{fmtCountdown(calCountdown)} left</span>
            </div>
          </div>

          {/* Pause notice */}
          <div className="flex items-center gap-2.5 rounded-xl bg-status-amber/7 border border-status-amber/18 px-3.5 py-3">
            <Pause size={13} className="text-status-amber shrink-0" />
            <div>
              <p className="text-xs font-semibold text-status-amber">Auto-tracking paused</p>
              <p className="text-[10px] text-tx-muted mt-0.5">Resumes automatically after this event ends.</p>
            </div>
          </div>

          {heartbeat?.appName && (
            <div className="mt-3 flex items-center gap-2 text-[10px] text-tx-faint">
              <Monitor size={10} /><span>Background: {heartbeat.appName}</span>
            </div>
          )}
        </div>

      /* ── Active: app detected ── */
      ) : heartbeat?.appName ? (
        <div className="p-4">

          {/* App + elapsed row */}
          <div className="mb-4 flex items-center gap-3.5 rounded-xl border border-brd-subtle bg-bg-sidebar/60 px-3.5 py-3">
            <AppAvatar name={heartbeat.appName} size={46} active={autoFocusState === 'tracking'} />

            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-extrabold text-tx-primary truncate leading-tight">{heartbeat.appName}</p>
              {heartbeat.url && (
                <p className="mt-0.5 text-[11px] text-tx-muted truncate">
                  {(() => { try { return new URL(heartbeat.url).hostname.replace(/^www\./, ''); } catch { return heartbeat.url; } })()}
                </p>
              )}
              {appClass && (
                <div className="mt-1.5 flex items-center gap-1.5">
                  <TypeChip type={appClass.type} />
                </div>
              )}
            </div>

            {/* Elapsed */}
            <div className="shrink-0 text-right">
              <span className="num font-mono text-[22px] font-extrabold leading-none text-tx-primary tabular-nums">
                {formatTimer(autoElapsed)}
              </span>
              <p className="mt-0.5 text-[10px] text-tx-faint">in app</p>
            </div>
          </div>

          {/* ── Focus quality OR buffer ring ── */}
          {autoFocusState === 'buffering' ? (
            <div className="rounded-xl bg-indigo-500/6 border border-indigo-500/15 p-4">
              <div className="mb-3 flex items-center gap-3">
                <div className="relative h-11 w-11 shrink-0">
                  <svg width={44} height={44} style={{ transform: 'rotate(-90deg)' }}>
                    <circle cx={22} cy={22} r={17} fill="none" stroke="#1e2334" strokeWidth={5} />
                    <circle cx={22} cy={22} r={17} fill="none" stroke="#6366f1" strokeWidth={5}
                      strokeDasharray={`${(bufferPct / 100) * 2 * Math.PI * 17} ${2 * Math.PI * 17}`}
                      strokeLinecap="round"
                      style={{ transition: 'stroke-dasharray 0.6s ease' }} />
                  </svg>
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 9, fontWeight: 800, color: '#818cf8' }}>{bufferPct}%</span>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-bold text-indigo-300">Creating focus session…</p>
                  <p className="text-[10px] text-tx-muted mt-0.5">Sustained activity detected</p>
                </div>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-indigo-500/15">
                <div className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${bufferPct}%`, background: 'linear-gradient(90deg, #6366f1, #a78bfa)' }} />
              </div>
            </div>
          ) : appClass ? (
            <div className="flex items-center gap-4">
              <FocusRing score={fq} color={fqC} size={72} label="focus" />
              <div className="flex-1 min-w-0">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-tx-faint">Quality</span>
                  <span className="text-[10px] font-bold" style={{ color: fqC }}>{fq}/100</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-bg-hover">
                  <div className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${fq}%`, background: `linear-gradient(90deg, ${fqC}, ${fqC}99)` }} />
                </div>
                <p className="mt-1.5 text-[10px] text-tx-faint">
                  {fq >= 75 ? 'Excellent deep focus' : fq >= 50 ? 'Productive session' : fq >= 30 ? 'Light work mode' : 'Distraction detected'}
                </p>
              </div>
            </div>
          ) : null}

          {/* ── Auto-session badge ── */}
          {autoFocusState === 'tracking' && autoFocusSession && (
            <div className="mt-4 rounded-xl bg-indigo-500/8 border border-indigo-500/18 px-3.5 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-indigo-500/15">
                    <Zap size={11} className="text-indigo-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-indigo-300 truncate">
                      {autoFocusSession.title || autoFocusSession.category}
                    </p>
                    <p className="text-[10px] text-indigo-400/60">auto session · recording</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="num font-mono text-xs font-bold text-indigo-300 tabular-nums">
                    {formatTimer(Math.floor(Date.now() / 1000) - autoFocusSession.started_at)}
                  </span>
                  <button
                    onClick={onPauseAutoSession}
                    title="Pause auto-tracking"
                    className="flex items-center gap-1 rounded-lg bg-status-amber/12 border border-status-amber/20 px-2 py-1 text-[10px] font-bold text-status-amber transition hover:bg-status-amber/22 hover:text-amber-300">
                    <Pause size={8} />Pause
                  </button>
                  <button
                    onClick={onStopAutoSession}
                    title="Stop this auto session"
                    className="flex items-center gap-1 rounded-lg bg-red-500/12 border border-red-500/20 px-2 py-1 text-[10px] font-bold text-red-400 transition hover:bg-red-500/20 hover:text-red-300">
                    <Square size={8} fill="currentColor" />Stop
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Manual session badge ── */}
          {activeSession && (
            <div className="mt-3 flex items-center justify-between rounded-xl bg-accent/8 border border-accent/18 px-3.5 py-2.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse shrink-0" />
                <span className="text-xs font-semibold text-accent truncate">
                  {activeSession.title || activeSession.category} · manual
                </span>
              </div>
              <span className="num shrink-0 ml-2 font-mono text-xs font-bold text-tx-faint">
                {formatTimer(Math.floor(Date.now() / 1000) - activeSession.started_at)}
              </span>
            </div>
          )}
        </div>

      /* ── Waiting for first heartbeat ── */
      ) : (
        <div className="flex flex-col items-center justify-center gap-4 py-10 px-6">
          <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-bg-hover/80 ring-1 ring-brd-subtle">
            <Cpu size={28} className="animate-pulse text-tx-faint" />
            <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-status-green/20">
              <span className="h-2 w-2 rounded-full bg-status-green animate-ping" />
            </span>
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-tx-secondary">Tracking active</p>
            {trackingElapsed > 0 && (
              <p className="mt-1 num font-mono text-lg font-bold text-tx-primary tabular-nums">
                {formatTimer(trackingElapsed)}
              </p>
            )}
            <p className="mt-1 text-xs text-tx-faint">Waiting for app activity…</p>
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-bg-input px-4 py-2">
            <span className="h-1.5 w-1.5 rounded-full bg-status-green animate-pulse shrink-0" />
            <p className="text-[10px] text-tx-faint">Tracking in background · will detect automatically</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Day analytics strip ──────────────────────────────────────────────────────
function DayAnalytics({ stats, sessions }) {
  const total     = stats?.totalSeconds     || 0;
  const deepWork  = stats?.deepWorkSeconds  || 0;
  const sessCount = sessions?.length        || 0;
  const deepPct   = total > 0 ? Math.round((deepWork / total) * 100) : 0;
  const GOAL_SECS = 6 * 3600; // 6h daily goal
  const goalPct   = Math.min(100, Math.round((total / GOAL_SECS) * 100));

  const metrics = [
    {
      label: 'Tracked',
      value: fmtHM(total),
      sub: `${goalPct}% of daily goal`,
      color: '#6366f1',
      pct: goalPct,
      Icon: Clock,
    },
    {
      label: 'Deep Work',
      value: fmtHM(deepWork),
      sub: `${deepPct}% deep focus`,
      color: '#f59e0b',
      pct: deepPct,
      Icon: Zap,
    },
    {
      label: 'Sessions',
      value: String(sessCount),
      sub: 'focus blocks',
      color: '#34d399',
      pct: Math.min(100, sessCount * 10),
      Icon: Layers,
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-2.5">
      {metrics.map(m => (
        <div key={m.label}
          className="fl-card flex flex-col overflow-hidden transition-all duration-200 hover:-translate-y-px"
          style={{ boxShadow: undefined }}>
          {/* Color accent top bar */}
          <div style={{ height: 2.5, background: `linear-gradient(90deg, ${m.color}, ${m.color}55)` }} />
          <div className="flex flex-col gap-2 p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-tx-faint">{m.label}</span>
              <div className="flex h-5.5 w-5.5 items-center justify-center rounded-md" style={{ background: `${m.color}18` }}>
                <m.Icon size={10} style={{ color: m.color }} />
              </div>
            </div>
            <p className="num text-[22px] font-extrabold leading-none text-tx-primary">{m.value}</p>
            <div>
              <div className="mb-1.5 h-1 overflow-hidden rounded-full bg-bg-hover">
                <div className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${m.pct}%`, background: `linear-gradient(90deg, ${m.color}cc, ${m.color})` }} />
              </div>
              <p className="text-[9.5px] text-tx-faint">{m.sub}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Category breakdown bar ───────────────────────────────────────────────────
function CategoryBreakdownBar({ sessions, categories }) {
  const data = useMemo(() => {
    if (!sessions?.length) return [];
    const totals = {};
    for (const s of sessions) {
      const cat = s.category || 'Other';
      totals[cat] = (totals[cat] || 0) + (s.duration_seconds || 0);
    }
    const total = Object.values(totals).reduce((a, b) => a + b, 0);
    if (!total) return [];
    return Object.entries(totals)
      .map(([cat, secs]) => ({
        cat,
        secs,
        pct: Math.round((secs / total) * 100),
        color: getCategoryColor(cat, categories),
      }))
      .sort((a, b) => b.secs - a.secs)
      .slice(0, 6);
  }, [sessions, categories]);

  if (!data.length) return null;

  return (
    <div className="fl-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-accent/10">
            <BarChart2 size={11} className="text-accent" />
          </div>
          <span className="text-xs font-bold text-tx-secondary">Today's Breakdown</span>
        </div>
        <span className="text-[10px] text-tx-faint">{data.length} categories</span>
      </div>
      {/* Segmented bar — taller, more refined */}
      <div className="flex h-2.5 overflow-hidden rounded-full gap-0.5">
        {data.map(d => (
          <div key={d.cat} className="transition-all duration-700 rounded-full"
            style={{ width: `${d.pct}%`, background: d.color }} />
        ))}
      </div>
      {/* Legend — tighter grid */}
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
        {data.map(d => (
          <div key={d.cat} className="flex items-center gap-1.5 min-w-0">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: d.color }} />
            <span className="truncate text-[11px] text-tx-muted">{d.cat}</span>
            <span className="ml-auto shrink-0 text-[10px] font-bold tabular-nums" style={{ color: d.color }}>{d.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Classification panel ─────────────────────────────────────────────────────
function ClassificationPanel({ heartbeat, appClass }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="fl-card overflow-hidden">
      <button onClick={() => setOpen(v => !v)}
        className="flex w-full items-center justify-between px-4 py-3 transition-colors hover:bg-bg-hover/30">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/10">
            <Eye size={12} className="text-accent" />
          </div>
          <div className="text-left">
            <p className="text-xs font-semibold text-tx-primary">Activity Classification</p>
            <p className="text-[10px] text-tx-faint">How apps map to focus types</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {heartbeat?.appName && appClass && (
            <span className="rounded-full border px-2 py-0.5 text-[9px] font-bold"
              style={{ background: `${appClass.color}12`, borderColor: `${appClass.color}25`, color: appClass.color }}>
              {heartbeat.appName}
            </span>
          )}
          <ChevronDown size={12} className={`text-tx-faint transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {open && (
        <div className="border-t border-brd-subtle px-4 pb-4 pt-3">
          {/* Current app highlight */}
          {heartbeat?.appName && appClass && (
            <div className="mb-3 flex items-center gap-3 rounded-lg border px-3 py-2.5"
              style={{ background: `${appClass.color}0D`, borderColor: `${appClass.color}25` }}>
              <appClass.Icon size={14} style={{ color: appClass.color, flexShrink: 0 }} />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-tx-primary truncate">
                  {heartbeat.appName} <span className="text-tx-faint font-normal">→ {appClass.label}</span>
                </p>
                <p className="text-[10px] text-tx-faint mt-0.5">Currently matched</p>
              </div>
              <TypeChip type={appClass.type} size="xs" />
            </div>
          )}
          <div className="space-y-1">
            {CLASSIFY_RULES.map(rule => {
              const m = TYPE_META[rule.type];
              return (
                <div key={rule.label}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 transition hover:bg-bg-hover/50">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
                    style={{ background: `${rule.color}15`, border: `1px solid ${rule.color}25` }}>
                    <rule.Icon size={11} style={{ color: rule.color }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold text-tx-primary">{rule.label}</p>
                    <p className="text-[9px] text-tx-faint truncate">{rule.pattern}</p>
                  </div>
                  <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide ${m.bg} ${m.text} ${m.border}`}>
                    {m.label.replace(' Work', '')}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Inline project picker (per-session row) ─────────────────────────────────
function SessionProjectPicker({ session, projects, onUpdateProject }) {
  const [open,    setOpen]    = useState(false);
  const [saving,  setSaving]  = useState(false);
  const ref = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const assign = async (projectId, projectName) => {
    setSaving(true);
    setOpen(false);
    await onUpdateProject?.(session.id, projectId, projectName, session);
    setSaving(false);
  };

  const assigned = session.project_id
    ? projects.find(p => p.id === session.project_id) || { name: session.project_name, color: '#7c6cf2' }
    : null;

  return (
    <div ref={ref} className="relative" style={{ display: 'inline-flex' }}>
      {assigned ? (
        /* Assigned badge — click to change */
        <button
          onClick={() => setOpen(v => !v)}
          title="Change project"
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] font-semibold transition hover:opacity-75"
          style={{
            background: (assigned.color || '#7c6cf2') + '18',
            border: `1px solid ${assigned.color || '#7c6cf2'}35`,
            color: assigned.color || '#7c6cf2',
          }}
        >
          {saving
            ? <span className="h-2 w-2 rounded-full border border-current animate-spin opacity-60" style={{ borderTopColor: 'transparent' }} />
            : <Briefcase size={7} />}
          {assigned.name || session.project_name}
          <ChevronDown size={7} className="opacity-60" />
        </button>
      ) : (
        /* No project — show "+ Project" on row hover */
        <button
          onClick={() => setOpen(v => !v)}
          title="Assign to project"
          className="inline-flex items-center gap-1 rounded-md border border-dashed px-1.5 py-0.5 text-[9px] font-medium opacity-0 transition group-hover:opacity-100
                     border-brd-default text-tx-faint hover:border-accent hover:text-accent hover:bg-accent/5"
        >
          {saving
            ? <span className="h-2 w-2 rounded-full border border-current animate-spin" style={{ borderTopColor: 'transparent' }} />
            : <Plus size={7} />}
          Project
        </button>
      )}

      {/* Dropdown */}
      {open && (
        <div
          className="absolute z-50 rounded-xl border border-brd-strong bg-bg-card shadow-popup overflow-hidden"
          style={{ bottom: 'calc(100% + 6px)', left: 0, minWidth: 200, maxWidth: 260 }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-brd-subtle">
            <span className="text-[10px] font-bold uppercase tracking-wider text-tx-faint">Assign Project</span>
            <button onClick={() => setOpen(false)} className="text-tx-faint hover:text-tx-primary transition">
              <X size={11} />
            </button>
          </div>

          <div className="max-h-52 overflow-y-auto py-1">
            {/* Clear option (only if currently assigned) */}
            {assigned && (
              <button
                onClick={() => assign(null, null)}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-tx-faint hover:bg-bg-hover transition text-left"
              >
                <X size={11} className="shrink-0" />
                <span>Remove project</span>
              </button>
            )}

            {projects.length === 0 && (
              <p className="px-3 py-3 text-[11px] text-tx-faint italic">No projects yet</p>
            )}

            {projects.map(p => {
              const isSelected = session.project_id === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => assign(p.id, p.name)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-xs transition text-left
                    ${isSelected ? 'bg-accent/8 text-accent' : 'hover:bg-bg-hover text-tx-secondary hover:text-tx-primary'}`}
                >
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: p.color || '#7c6cf2' }} />
                  <span className="flex-1 truncate font-medium">{p.name}</span>
                  {isSelected && <CheckCircle2 size={11} className="shrink-0 text-accent" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Session timeline (auto mode log) ────────────────────────────────────────
function SessionTimeline({ sessions, categories, projects, onDelete, onUpdateProject, selectedSessionId, onSelectSession }) {
  const todayS = todayStart();
  const [filter,       setFilter]       = useState('all'); // all | deep | auto
  const [mergeGroups,  setMergeGroups]  = useState([]);
  const [dismissedMerge, setDismissedMerge] = useState(false);

  // Detect mergeable session groups
  useEffect(() => {
    if (dismissedMerge) return;
    const todayList = (sessions || []).filter(s => s.started_at >= todayS);
    if (todayList.length < 2) { setMergeGroups([]); return; }
    import('../../ai/timer/timerAIEngine.js').then(({ detectMergeableSessionGroup }) => {
      const groups = detectMergeableSessionGroup(todayList);
      setMergeGroups(groups || []);
    }).catch(() => {});
  }, [sessions, todayS, dismissedMerge]);

  const displayed = useMemo(() => {
    let list = (sessions || []).filter(s => s.started_at >= todayS);
    if (filter === 'deep')  list = list.filter(s => s.is_deep_work);
    if (filter === 'auto')  list = list.filter(s => s.title?.startsWith('Auto:'));
    return list.slice(0, 20);
  }, [sessions, todayS, filter]);

  const grouped = useMemo(() => {
    return displayed.reduce((acc, s) => {
      const date = new Date(s.started_at * 1000).toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric',
      });
      if (!acc[date]) acc[date] = [];
      acc[date].push(s);
      return acc;
    }, {});
  }, [displayed]);

  const totalToday = (sessions || [])
    .filter(s => s.started_at >= todayS)
    .reduce((a, s) => a + (s.duration_seconds || 0), 0);

  return (
    <div className="fl-card flex flex-col overflow-hidden" style={{ minHeight: 480 }}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-brd-subtle bg-bg-sidebar/40 px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/10">
            <Activity size={13} className="text-accent" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-tx-primary leading-tight">Session Log</h2>
            <p className="text-[10px] text-tx-faint leading-tight">Today's work</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {totalToday > 0 && (
            <span className="rounded-lg border border-brd-subtle bg-bg-hover px-2.5 py-1 text-xs font-bold text-tx-secondary tabular-nums">
              {fmtHM(totalToday)}
            </span>
          )}
          <div className="flex items-center gap-0.5 rounded-lg bg-bg-input p-0.5">
            {[['all','All'],['deep','Deep'],['auto','Auto']].map(([id, label]) => (
              <button key={id} onClick={() => setFilter(id)}
                className={`rounded-md px-2.5 py-1.5 text-[10px] font-bold transition-all ${filter === id ? 'bg-bg-active text-tx-primary shadow-sm' : 'text-tx-faint hover:text-tx-secondary'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {Object.keys(grouped).length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center text-center px-6">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-bg-input text-tx-faint">
              <Activity size={22} />
            </div>
            <p className="text-sm font-bold text-tx-secondary">No sessions yet today</p>
            <p className="mt-1 text-xs text-tx-muted">
              {filter === 'all'
                ? 'Sessions will appear here as you work.'
                : `No ${filter} sessions yet. Switch to 'All' to see everything.`}
            </p>
          </div>
        ) : (
          <div className="p-5 space-y-6">
            {/* AI merge suggestion banner */}
            {mergeGroups.length > 0 && filter === 'all' && (
              <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/8 px-4 py-3 flex items-start gap-3">
                <Layers size={13} className="shrink-0 text-indigo-400 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-bold text-indigo-300">
                    AI detected {mergeGroups.reduce((a, g) => a + g.length, 0)} sessions from the same workflow
                  </p>
                  <p className="text-[10px] text-indigo-400/60 mt-0.5">
                    {mergeGroups.map(g => {
                      const title = g[0]?.title || g[0]?.category || 'Work';
                      const totalMins = Math.round(g.reduce((a,s) => a+(s.duration_seconds||0), 0) / 60);
                      return `${title.replace('Auto: ','')} — ${totalMins}m`;
                    }).join(' · ')}
                  </p>
                </div>
                <button
                  onClick={() => setDismissedMerge(true)}
                  className="shrink-0 text-indigo-400/40 hover:text-indigo-300 transition"
                >
                  <X size={12} />
                </button>
              </div>
            )}
            {Object.entries(grouped).map(([date, daySessions]) => (
              <div key={date}>
                <div className="mb-2.5 flex items-center gap-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-tx-faint">{date}</p>
                  <div className="flex-1 h-px bg-brd-subtle" />
                  <span className="rounded-md border border-brd-subtle bg-bg-hover px-2 py-0.5 text-[10px] font-semibold tabular-nums text-tx-faint">
                    {fmtHM(daySessions.reduce((a, s) => a + (s.duration_seconds || 0), 0))}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {daySessions.map(s => {
                    const color = getCategoryColor(s.category, categories);
                    const appCls = s.title?.startsWith('Auto:')
                      ? classifyApp(s.title.replace('Auto: ', ''))
                      : null;
                    const isRunning = !s.ended_at;
                    const isSelected = s.id === selectedSessionId;
                    return (
                      <div key={s.id}
                        onClick={() => onSelectSession?.(s.id)}
                        className="group relative flex items-stretch gap-0 rounded-xl border bg-bg-input overflow-hidden transition-all duration-150 hover:border-brd-hover hover:bg-bg-hover/50 hover:shadow-sm cursor-pointer"
                        style={{
                          borderColor: isSelected ? color : (isRunning ? `${color}35` : 'var(--color-brd-subtle, rgba(255,255,255,0.08))'),
                          background: isSelected ? `${color}0c` : (isRunning ? `${color}06` : undefined),
                          boxShadow: isSelected ? `0 0 0 1px ${color}55` : undefined,
                        }}>
                        {/* Category stripe */}
                        <div className="w-[3px] shrink-0" style={{ background: isRunning ? `linear-gradient(180deg, ${color}, ${color}88)` : color }} />

                        <div className="flex min-w-0 flex-1 items-center gap-3 px-3.5 py-2.5">
                          {/* Session info */}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="text-[13px] font-semibold text-tx-primary truncate">
                                {s.title?.startsWith('Auto: ') ? s.title.replace('Auto: ', '') : (s.title || s.category)}
                              </p>
                              {s.is_deep_work && (
                                <span className="inline-flex items-center gap-0.5 rounded bg-status-amber/12 px-1.5 py-0.5 text-[9px] font-bold text-status-amber">
                                  <Zap size={7} />Deep
                                </span>
                              )}
                              {s.title?.startsWith('Auto:') && (
                                <span className="inline-flex items-center gap-0.5 rounded bg-indigo-500/10 px-1.5 py-0.5 text-[9px] font-bold text-indigo-400">
                                  <Radio size={7} />Auto
                                </span>
                              )}
                            </div>
                            <div className="mt-0.5 flex items-center gap-1.5 flex-wrap">
                              <span className="font-mono text-[11px] tabular-nums text-tx-muted">
                                {formatTime(s.started_at)}
                                <span className="mx-1 text-tx-faint opacity-50">–</span>
                                {s.ended_at ? formatTime(s.ended_at) : <span className="text-status-green animate-pulse">now</span>}
                              </span>
                              {appCls && <TypeChip type={appCls.type} size="xs" />}
                              {onUpdateProject && (
                                <span onClick={e => e.stopPropagation()}>
                                  <SessionProjectPicker
                                    session={s}
                                    projects={projects || []}
                                    onUpdateProject={onUpdateProject}
                                  />
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Duration + delete */}
                          <div className="flex shrink-0 items-center gap-1.5">
                            <span className="num rounded-lg px-2.5 py-1.5 font-mono text-xs font-bold tabular-nums"
                              style={{
                                background: `${color}14`,
                                border: `1px solid ${color}25`,
                                color: isRunning ? color : undefined,
                              }}>
                              {isRunning ? formatTimer(Math.floor(Date.now() / 1000) - s.started_at) : formatDuration(s.duration_seconds)}
                            </span>
                            <button onClick={(e) => { e.stopPropagation(); if (selectedSessionId === s.id) onSelectSession?.(null); onDelete?.(s.id); }}
                              className="rounded-lg p-1.5 text-tx-faint opacity-0 transition hover:bg-status-red/10 hover:text-status-red group-hover:opacity-100">
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Project + task picker ────────────────────────────────────────────────────
function ProjectTaskPicker({ projects, selProjectId, setSelProjectId, tasks, selTaskId, setSelTaskId, loadingTasks }) {
  const [projOpen, setProjOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const selProject = projects.find(p => p.id === selProjectId);
  const selTask    = tasks.find(t => t.id === selTaskId);

  return (
    <div className="space-y-3">
      <div>
        <p className="fl-label mb-2">Project <span className="text-tx-faint font-normal normal-case">(optional)</span></p>
        <div className="relative">
          <button onClick={() => { setProjOpen(v => !v); setTaskOpen(false); }}
            className="w-full flex items-center gap-2 rounded-lg border border-brd-default bg-bg-input px-3 py-2.5 text-sm transition hover:border-brd-hover">
            {selProject
              ? <><span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: selProject.color }} /><span className="flex-1 text-left font-medium text-tx-primary truncate">{selProject.name}</span></>
              : <><FolderOpen size={13} className="text-tx-faint shrink-0" /><span className="flex-1 text-left text-tx-faint">No project</span></>}
            <ChevronDown size={13} className="text-tx-faint shrink-0" />
          </button>
          {projOpen && (
            <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-xl border border-brd-strong bg-bg-card shadow-popup overflow-hidden">
              <button onClick={() => { setSelProjectId(null); setSelTaskId(null); setProjOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-tx-faint hover:bg-bg-hover transition">
                <X size={11} /> No project
              </button>
              <div className="max-h-48 overflow-y-auto">
                {projects.map(p => (
                  <button key={p.id} onClick={() => { setSelProjectId(p.id); setSelTaskId(null); setProjOpen(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-bg-hover transition">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: p.color }} />
                    <span className={`flex-1 text-left ${p.id === selProjectId ? 'font-bold text-tx-primary' : 'text-tx-secondary'}`}>{p.name}</span>
                    {p.id === selProjectId && <CheckCircle2 size={12} className="text-accent shrink-0" />}
                  </button>
                ))}
                {projects.length === 0 && <p className="px-3 py-2 text-xs text-tx-faint italic">No projects yet</p>}
              </div>
            </div>
          )}
        </div>
      </div>

      {selProjectId && (
        <div>
          <p className="fl-label mb-2">Task <span className="text-tx-faint font-normal normal-case">(optional)</span></p>
          <div className="relative">
            <button onClick={() => { setTaskOpen(v => !v); setProjOpen(false); }}
              className="w-full flex items-center gap-2 rounded-lg border border-brd-default bg-bg-input px-3 py-2.5 text-sm transition hover:border-brd-hover">
              {selTask
                ? <><CheckSquare size={12} className="text-accent shrink-0" /><span className="flex-1 text-left font-medium text-tx-primary truncate">{selTask.title}</span></>
                : <><CheckSquare size={12} className="text-tx-faint shrink-0" /><span className="flex-1 text-left text-tx-faint">{loadingTasks ? 'Loading…' : 'No task'}</span></>}
              <ChevronDown size={13} className="text-tx-faint shrink-0" />
            </button>
            {taskOpen && (
              <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-xl border border-brd-strong bg-bg-card shadow-popup overflow-hidden">
                <button onClick={() => { setSelTaskId(null); setTaskOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-tx-faint hover:bg-bg-hover transition">
                  <X size={11} /> No task
                </button>
                <div className="max-h-48 overflow-y-auto">
                  {tasks.map(t => (
                    <button key={t.id} onClick={() => { setSelTaskId(t.id); setTaskOpen(false); }}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-bg-hover transition">
                      <span className={`inline-flex items-center gap-1.5 flex-1 text-left ${t.id === selTaskId ? 'font-bold text-tx-primary' : 'text-tx-secondary'}`}>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${t.status === 'done' ? 'bg-status-green/15 text-status-green' : t.status === 'in_progress' ? 'bg-status-amber/15 text-status-amber' : 'bg-bg-hover text-tx-faint'}`}>
                          {t.status || 'todo'}
                        </span>
                        {t.title}
                      </span>
                      {t.id === selTaskId && <CheckCircle2 size={12} className="text-accent shrink-0" />}
                    </button>
                  ))}
                  {tasks.length === 0 && !loadingTasks && <p className="px-3 py-2 text-xs text-tx-faint italic">No tasks for this project</p>}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Manual mode panel ────────────────────────────────────────────────────────
function ManualModePanel({ user, categories, setCategories, activeSession, setActiveSession, refreshActive }) {
  const prefs = usePrefs();

  // Derive durations from settings (prefs values are in minutes)
  const focusSecs      = (prefs.focusDuration     || 25) * 60;
  const shortBreakSecs = (prefs.shortBreakDuration ||  5) * 60;
  const longBreakSecs  = (prefs.longBreakDuration  || 15) * 60;
  const longBreakEvery = prefs.longBreakInterval   ||  4;

  const [sessions,     setSessions]     = useState([]);
  const [selCat,       setSelCat]       = useState('');
  const [title,        setTitle]        = useState('');
  const [elapsed,      setElapsed]      = useState(0);
  const [loading,      setLoading]      = useState(false);
  const [newCatName,   setNewCatName]   = useState('');
  const [newCatColor,  setNewCatColor]  = useState('#7c6cf2');
  const [showCatForm,  setShowCatForm]  = useState(false);
  const [projects,     setProjects]     = useState([]);
  const [clients,      setClients]      = useState([]);
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [tasks,        setTasks]        = useState([]);
  const [selProjectId, setSelProjectId] = useState(null);
  const [selTaskId,    setSelTaskId]    = useState(null);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [enableBlocker,setEnableBlocker]= useState(false);
  // Initialize pomodoroMode from user preference
  const [pomodoroMode, setPomodoroMode] = useState(() => prefs.pomodoroMode ?? false);
  const [pomodoroPhase,setPomodoroPhase]= useState('work');
  const [pomodoroCount,setPomodoroCount]= useState(0);
  const [breakElapsed, setBreakElapsed] = useState(0);
  const [scoreCard,      setScoreCard]      = useState(null);
  const [postSessionAI,  setPostSessionAI]  = useState(null);
  const blockerAutoStarted = useRef(false);
  const timerRef  = useRef(null);
  const breakRef  = useRef(null);
  // Tracks the duration (seconds) of the currently running break so the
  // countdown and progress ring stay correct even when prefs change mid-session.
  const currentBreakSecsRef = useRef(shortBreakSecs);

  const loadSessions = useCallback(async () => {
    const now = Math.floor(Date.now() / 1000);
    const from = todayStart() - 7 * 86400;
    const list = await api.listSessions?.({ userId: user.id, from, to: now });
    // Exclude __auto_block: rows — those are Activity-page metadata, not real sessions
    setSessions((list || []).filter(s => !String(s.notes || '').startsWith('__auto_block:')));
  }, [user.id]);

  useEffect(() => { api.listProjects?.({ userId: user.id }).then(l => setProjects(l || [])); }, [user.id]);
  useEffect(() => { api.listClients?.({ userId: user.id }).then(l => setClients(l || [])); }, [user.id]);

  useEffect(() => {
    if (!selProjectId) { setTasks([]); setSelTaskId(null); return; }
    setLoadingTasks(true);
    api.listTasks?.({ userId: user.id }).then(l => {
      setTasks((l || []).filter(t => t.project_id === selProjectId && t.status !== 'done'));
      setLoadingTasks(false);
    });
  }, [selProjectId, user.id]);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  const handleInspectorMutate = useCallback(async (nextSelectedId) => {
    await loadSessions();
    setSelectedSessionId(nextSelectedId);
  }, [loadSessions]);

  // Set initial category when categories load and none is selected yet
  useEffect(() => {
    if (categories.length > 0 && !selCat) setSelCat(categories[0]?.name || '');
  }, [categories, selCat]);

  useEffect(() => {
    if (activeSession) {
      const tick = () => setElapsed(Math.floor(Date.now() / 1000) - activeSession.started_at);
      tick();
      timerRef.current = setInterval(tick, 1000);
    } else {
      clearInterval(timerRef.current);
      setElapsed(0);
    }
    return () => clearInterval(timerRef.current);
  }, [activeSession]);

  const selTask = tasks.find(t => t.id === selTaskId);

  const startSession = async () => {
    if (!selCat) return;
    setLoading(true);
    const res = await api.startSession?.({
      userId: user.id, category: selCat,
      title: title.trim() || selTask?.title || null,
      projectId: selProjectId || null, taskId: selTaskId || null,
    });
    if (res?.id) {
      await refreshActive(); setTitle('');
      if (enableBlocker) { await api.startFocusMode?.({ userId: user.id }); blockerAutoStarted.current = true; }
    }
    setLoading(false);
  };

  // Pomodoro auto-stop — uses focusDuration / shortBreakDuration / longBreakDuration from prefs
  useEffect(() => {
    if (!pomodoroMode || !activeSession || pomodoroPhase !== 'work') return;
    if (elapsed >= focusSecs) {
      (async () => {
        const sessionSnap = { ...activeSession };
        const durSecs     = elapsed;
        await api.stopSession?.({ sessionId: sessionSnap.id });
        if (blockerAutoStarted.current) { await api.stopFocusMode?.(); blockerAutoStarted.current = false; }
        setActiveSession(null); await loadSessions();
        const newCount = pomodoroCount + 1;
        // Every longBreakEvery sessions → long break; otherwise short break
        const breakSecs = (newCount % longBreakEvery === 0) ? longBreakSecs : shortBreakSecs;
        currentBreakSecsRef.current = breakSecs;
        setPomodoroPhase('break'); setPomodoroCount(newCount);
        setBreakElapsed(0); clearInterval(breakRef.current);
        breakRef.current = setInterval(() => {
          setBreakElapsed(prev => {
            if (prev >= breakSecs - 1) { clearInterval(breakRef.current); setPomodoroPhase('work'); return 0; }
            return prev + 1;
          });
        }, 1000);

        // AI finalization + notification for pomodoro session
        const breakMins = Math.round(breakSecs / 60);
        try {
          const from = sessionSnap.started_at;
          const to   = Math.floor(Date.now() / 1000);
          const autoList = await api.autoSessionsRange?.({ userId: user.id, from, to }).catch(() => []) || [];
          const intel = finalizeSessionIntelligence({ session: { ...sessionSnap, duration_seconds: durSecs }, autoSessions: autoList, recentSessions: sessions });
          if (intel) {
            setPostSessionAI(intel);
            const isVague = !sessionSnap.title || ['session','focus session','focus block','untitled'].includes((sessionSnap.title || '').toLowerCase());
            if (isVague && intel.title?.length > 3) {
              api.updateSession?.({ sessionId: sessionSnap.id, title: intel.title, category: sessionSnap.category || 'General', notes: sessionSnap.notes || null, projectId: sessionSnap.project_id || null, clientId: sessionSnap.client_id || null }).catch(() => {});
            }
            pushToast('session_stop', intel.title || sessionSnap.title || 'Pomodoro complete',
              `${intel.focusQuality?.overall || '?'}/100 focus · Break starting — ${breakMins}m.`,
              { relatedPage: 'activity', duration: 8000, metadata: { isPomodoroEnd: true } }
            );
            return;
          }
        } catch {}
        const { title, description, durLabel } = buildSessionEndNotif(sessionSnap, durSecs);
        pushToast('session_stop', title,
          `${description} Break starting — ${breakMins}m.`,
          { relatedPage: 'activity', duration: 8000, metadata: { durLabel, isPomodoroEnd: true } }
        );
      })();
    }
  }, [elapsed, pomodoroMode, activeSession, pomodoroPhase, loadSessions, setActiveSession,
      focusSecs, shortBreakSecs, longBreakSecs, longBreakEvery, pomodoroCount]);

  useEffect(() => () => clearInterval(breakRef.current), []);

  const stopSession = async () => {
    if (!activeSession) return;
    setLoading(true);
    const dur         = elapsed;
    const sessionSnap = { ...activeSession, duration_seconds: dur };
    await api.stopSession?.({ sessionId: sessionSnap.id });
    if (blockerAutoStarted.current) { await api.stopFocusMode?.(); blockerAutoStarted.current = false; }
    setActiveSession(null); await loadSessions(); setLoading(false);
    if (pomodoroMode) { setPomodoroPhase('work'); clearInterval(breakRef.current); }

    // AI finalization for meaningful sessions (>= 2 min)
    if (dur >= 120) {
      try {
        // Fetch auto-sessions that overlapped this manual session
        const from = sessionSnap.started_at;
        const to   = Math.floor(Date.now() / 1000);
        const autoList = await api.autoSessionsRange?.({ userId: user.id, from, to }).catch(() => []) || [];

        const intel = finalizeSessionIntelligence({
          session:       sessionSnap,
          autoSessions:  autoList,
          recentSessions: sessions,
        });

        if (intel) {
          setPostSessionAI(intel);

          // Use AI focus score for score card (falls back to duration formula)
          const aiScore = intel.focusQuality?.overall || Math.min(100, Math.round((dur / (90 * 60)) * 100));
          const aiLabel = intel.focusQuality?.label   || (aiScore >= 80 ? 'Excellent' : aiScore >= 60 ? 'Good' : aiScore >= 40 ? 'Fair' : 'Low');
          const aiColor = intel.focusQuality?.color   || (aiScore >= 80 ? '#34D399' : aiScore >= 60 ? '#7c6cf2' : aiScore >= 40 ? '#FBBF24' : '#F87171');
          if (dur >= 60) { setScoreCard({ score: aiScore, label: aiLabel, color: aiColor, dur }); setTimeout(() => setScoreCard(null), 8000); }

          // Write AI title back to DB if session had a vague/missing title
          const isVague = !sessionSnap.title ||
            ['session','focus session','focus block','untitled'].includes(sessionSnap.title.toLowerCase());
          if (isVague && intel.title?.length > 3) {
            api.updateSession?.({
              sessionId: sessionSnap.id, title: intel.title,
              category: sessionSnap.category || 'General',
              notes: sessionSnap.notes || null,
              projectId: sessionSnap.project_id || null,
              clientId:  sessionSnap.client_id  || null,
            }).catch(() => {});
          }

          // Notification with AI title
          const { title: notifTitle, description, durLabel } = buildSessionEndNotif(
            { ...sessionSnap, title: intel.title || sessionSnap.title }, dur
          );
          pushToast('session_stop', notifTitle, description, {
            relatedPage: 'activity', duration: 7000,
            metadata: { durLabel, category: sessionSnap.category, isDeepWork: intel.isDeepWork },
          });
          return;
        }
      } catch {}

      // Fallback: basic score + notification
      const score = Math.min(100, Math.max(0, Math.round((dur / (90 * 60)) * 100)));
      const label = score >= 80 ? 'Excellent' : score >= 60 ? 'Good' : score >= 40 ? 'Fair' : 'Low';
      const color = score >= 80 ? '#34D399' : score >= 60 ? '#7c6cf2' : score >= 40 ? '#FBBF24' : '#F87171';
      if (dur >= 60) { setScoreCard({ score, label, color, dur }); setTimeout(() => setScoreCard(null), 6000); }
      const { title, description, durLabel } = buildSessionEndNotif(sessionSnap, dur);
      pushToast('session_stop', title, description, { relatedPage: 'activity', duration: 7000, metadata: { durLabel } });
    } else if (dur >= 60) {
      const score = Math.min(100, Math.max(0, Math.round((dur / (90 * 60)) * 100)));
      const label = score >= 80 ? 'Excellent' : score >= 60 ? 'Good' : score >= 40 ? 'Fair' : 'Low';
      const color = score >= 80 ? '#34D399' : score >= 60 ? '#7c6cf2' : score >= 40 ? '#FBBF24' : '#F87171';
      setScoreCard({ score, label, color, dur });
      setTimeout(() => setScoreCard(null), 6000);
    }
  };

  const addCategory = async () => {
    if (!newCatName.trim()) return;
    const cat = await api.createCategory?.({ userId: user.id, name: newCatName.trim(), color: newCatColor });
    if (cat?.id) { setCategories(c => [...c, cat]); setSelCat(cat.name); setNewCatName(''); setShowCatForm(false); }
  };

  const isDeepWork   = elapsed >= 25 * 60;
  const pomoTotal    = pomodoroPhase === 'work' ? focusSecs : currentBreakSecsRef.current;
  const pomoCurrent  = pomodoroPhase === 'work' ? Math.min(elapsed, focusSecs) : breakElapsed;
  const pomoProgress = pomoTotal > 0 ? pomoCurrent / pomoTotal : 0;
  // R=48 keeps the stroke (width=7) inside the 110×110 SVG viewport (55 - 48 - 3.5 = 3.5px margin)
  const RING_R = 48, RING_C = 2 * Math.PI * RING_R;
  const todaySessions = sessions.filter(s => s.started_at >= todayStart());
  const todayTotal    = todaySessions.reduce((a, s) => a + (s.duration_seconds || 0), 0);
  const weekTotal     = sessions.reduce((a, s) => a + (s.duration_seconds || 0), 0);
  const grouped = sessions.reduce((acc, s) => {
    const date = new Date(s.started_at * 1000).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    if (!acc[date]) acc[date] = [];
    acc[date].push(s);
    return acc;
  }, {});

  const activeCatColor = getCategoryColor(selCat, categories);

  return (
    <div className="grid min-h-full grid-cols-1 gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
      <section className="space-y-4">

          {/* Session control card */}
        <div className="fl-card overflow-hidden">
          {/* Header */}
          <div className="border-b border-brd-subtle bg-bg-sidebar/70 px-5 py-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-md bg-accent/10">
                  <Clock size={11} className="text-accent" />
                </div>
                <p className="text-xs font-bold uppercase tracking-wider text-tx-secondary">Focus Session</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setPomodoroMode(v => !v); setPomodoroPhase('work'); setPomodoroCount(0); clearInterval(breakRef.current); setBreakElapsed(0); }}
                  disabled={!!activeSession}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${pomodoroMode ? 'bg-status-amber/15 text-status-amber' : 'text-tx-faint hover:bg-bg-hover hover:text-tx-primary'} disabled:opacity-40`}>
                  <RotateCcw size={11} />
                  {pomodoroMode ? `Pomo ${pomodoroPhase === 'break' ? '☕' : `#${pomodoroCount + 1}`}` : 'Pomodoro'}
                </button>
                {activeSession && (
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-status-green/12 px-2.5 py-1.5 text-xs font-bold text-status-green">
                    <span className="h-1.5 w-1.5 rounded-full bg-status-green animate-pulse" />Live
                  </span>
                )}
              </div>
            </div>

            {/* Timer display */}
            {pomodoroMode && pomodoroPhase === 'break' ? (
              <div className="flex flex-col items-center py-2">
                <div className="relative mb-3">
                  <svg width={110} height={110} style={{ transform: 'rotate(-90deg)' }}>
                    <circle cx={55} cy={55} r={RING_R} fill="none" stroke="var(--color-bg-input,#1a1e2a)" strokeWidth={7} />
                    <circle cx={55} cy={55} r={RING_R} fill="none" stroke="#34D399" strokeWidth={7}
                      strokeDasharray={`${(1 - pomoProgress) * RING_C} ${RING_C}`}
                      strokeLinecap="round" style={{ transition: 'stroke-dasharray 1s linear' }} />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <Coffee size={18} className="text-status-green mb-0.5" />
                    <span className="num font-mono text-lg font-extrabold text-tx-primary">{formatTimer(Math.max(0, currentBreakSecsRef.current - breakElapsed))}</span>
                  </div>
                </div>
                <p className="text-sm font-bold text-status-green">
                  {currentBreakSecsRef.current >= longBreakSecs ? 'Long break!' : 'Break time!'}{' '}
                  {pomodoroCount} pomo{pomodoroCount !== 1 ? 's' : ''} done
                </p>
                <button onClick={() => { clearInterval(breakRef.current); setPomodoroPhase('work'); setBreakElapsed(0); }}
                  className="mt-2 text-xs text-tx-faint hover:text-tx-primary transition">Skip break →</button>
              </div>
            ) : (
              <div className={pomodoroMode ? 'flex flex-col items-center' : ''}>
                {pomodoroMode ? (
                  <div className="relative mb-2">
                    <svg width={110} height={110} style={{ transform: 'rotate(-90deg)' }}>
                      <circle cx={55} cy={55} r={RING_R} fill="none" stroke="var(--color-bg-input,#1a1e2a)" strokeWidth={7} />
                      <circle cx={55} cy={55} r={RING_R} fill="none" stroke="#FBBF24" strokeWidth={7}
                        strokeDasharray={`${pomoProgress * RING_C} ${RING_C}`}
                        strokeLinecap="round" style={{ transition: 'stroke-dasharray 1s linear' }} />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="num font-mono text-lg font-extrabold text-tx-primary">
                        {formatTimer(activeSession ? Math.max(0, focusSecs - elapsed) : focusSecs)}
                      </span>
                      <span className="text-[10px] text-tx-faint">remaining</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-end gap-2">
                    <span className="num font-mono text-6xl font-extrabold leading-none text-tx-primary tabular-nums">
                      {formatTimer(elapsed)}
                    </span>
                    {activeSession && isDeepWork && (
                      <span className="mb-1 inline-flex items-center gap-1 rounded-lg bg-status-amber/15 px-2 py-1 text-xs font-bold text-status-amber">
                        <Zap size={11} />Deep
                      </span>
                    )}
                  </div>
                )}
                <p className={`${pomodoroMode ? 'text-center' : ''} mt-2 text-sm text-tx-muted`}>
                  {activeSession ? (activeSession.title || activeSession.category) : 'Select a category to begin.'}
                </p>
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="space-y-5 p-5">
            {activeSession ? (
              <div className="space-y-3">
                <div className="rounded-xl border border-brd-subtle bg-bg-input p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full" style={{ background: getCategoryColor(activeSession.category, categories) }} />
                      <span className="text-sm font-bold" style={{ color: getCategoryColor(activeSession.category, categories) }}>
                        {activeSession.category}
                      </span>
                    </div>
                    {isDeepWork && (
                      <span className="inline-flex items-center gap-1 rounded-lg bg-status-amber/12 px-2 py-1 text-xs font-bold text-status-amber">
                        <Zap size={11} />Deep work
                      </span>
                    )}
                  </div>
                  {(activeSession.project_name || activeSession.task_title) && (
                    <div className="flex flex-wrap gap-2">
                      {activeSession.project_name && (
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-accent/10 px-2 py-1 text-xs font-semibold text-accent">
                          <Briefcase size={10} />{activeSession.project_name}
                        </span>
                      )}
                      {activeSession.task_title && (
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-status-green/10 px-2 py-1 text-xs font-semibold text-status-green">
                          <CheckSquare size={10} />{activeSession.task_title}
                        </span>
                      )}
                    </div>
                  )}
                  {blockerAutoStarted.current && (
                    <div className="flex items-center gap-1.5 text-xs text-status-green font-semibold">
                      <Shield size={11} /><span>Focus blocker active</span>
                    </div>
                  )}
                </div>
                <button onClick={stopSession} disabled={loading}
                  className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-status-red/90 py-3.5 text-sm font-bold text-white transition hover:bg-status-red disabled:opacity-60">
                  <Square size={14} fill="currentColor" />End Session
                </button>
              </div>
            ) : (
              <>
                {/* Category */}
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="fl-label">Category</p>
                    <button onClick={() => setShowCatForm(v => !v)}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold text-accent transition hover:bg-accent/10">
                      <Plus size={12} />Add
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {categories.map(cat => {
                      const active = selCat === cat.name;
                      return (
                        <button key={cat.id} onClick={() => setSelCat(cat.name)}
                          className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold transition ${active ? 'border-transparent bg-bg-active text-tx-primary shadow-sm' : 'border-brd-default bg-bg-input text-tx-secondary hover:border-brd-hover hover:text-tx-primary'}`}>
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: cat.color }} />
                          {cat.name}
                        </button>
                      );
                    })}
                  </div>
                  {showCatForm && (
                    <div className="mt-3 rounded-xl border border-brd-default bg-bg-input p-3">
                      <input value={newCatName} onChange={e => setNewCatName(e.target.value)}
                        placeholder="Category name" className="fl-input mb-2"
                        onKeyDown={e => e.key === 'Enter' && addCategory()} />
                      <div className="flex items-center gap-2">
                        <input type="color" value={newCatColor} onChange={e => setNewCatColor(e.target.value)}
                          className="h-9 w-10 rounded-lg border-0 bg-transparent" />
                        <button onClick={addCategory} className="fl-btn flex-1 py-2 text-xs">Add category</button>
                        <button onClick={() => setShowCatForm(false)}
                          className="rounded-lg p-2 text-tx-muted transition hover:bg-bg-hover hover:text-tx-primary">
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <ProjectTaskPicker
                  projects={projects} selProjectId={selProjectId} setSelProjectId={setSelProjectId}
                  tasks={tasks} selTaskId={selTaskId} setSelTaskId={setSelTaskId} loadingTasks={loadingTasks}
                />

                <div>
                  <label className="fl-label mb-2 block">Work Description</label>
                  <input value={title} onChange={e => setTitle(e.target.value)}
                    placeholder={selTask ? selTask.title : 'Optional note for this session'}
                    className="fl-input px-4 py-3"
                    onKeyDown={e => e.key === 'Enter' && startSession()} />
                </div>

                {/* Focus blocker toggle */}
                <div className="flex items-center justify-between rounded-xl border border-brd-default bg-bg-input px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${enableBlocker ? 'bg-status-green/15 text-status-green' : 'bg-bg-hover text-tx-faint'}`}>
                      <Shield size={14} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-tx-primary">Focus Blocker</p>
                      <p className="text-xs text-tx-muted">Block distractions during session</p>
                    </div>
                  </div>
                  <button onClick={() => setEnableBlocker(v => !v)}
                    className={`relative h-7 w-12 rounded-full border transition-all ${enableBlocker ? 'border-status-green/30 bg-status-green' : 'border-white/[0.12] bg-white/[0.08]'}`}>
                    <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${enableBlocker ? 'left-6' : 'left-1'}`} />
                  </button>
                </div>

                {/* Start button */}
                <button onClick={startSession} disabled={!selCat || loading}
                  className="group relative flex w-full items-center justify-center gap-2.5 overflow-hidden rounded-xl py-3.5 text-sm font-bold text-white transition disabled:opacity-50"
                  style={{ background: selCat ? `linear-gradient(135deg, ${activeCatColor}cc, ${activeCatColor})` : 'var(--color-bg-active)' }}>
                  <Play size={15} fill="currentColor" />
                  Start Session
                  {selCat && <ArrowRight size={14} className="opacity-60 group-hover:translate-x-0.5 transition-transform" />}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-2.5">
          <div className="fl-card overflow-hidden">
            <div style={{ height: 2.5, background: 'linear-gradient(90deg, #7c6cf2, #7c6cf255)' }} />
            <div className="p-3.5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-tx-faint">Today</p>
                <div className="flex h-5 w-5 items-center justify-center rounded-md bg-accent/12">
                  <TrendingUp size={10} className="text-accent" />
                </div>
              </div>
              <p className="num text-[22px] font-extrabold leading-none text-tx-primary">{formatDuration(todayTotal)}</p>
            </div>
          </div>
          <div className="fl-card overflow-hidden">
            <div style={{ height: 2.5, background: 'linear-gradient(90deg, #34d399, #34d39955)' }} />
            <div className="p-3.5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-tx-faint">This Week</p>
                <div className="flex h-5 w-5 items-center justify-center rounded-md" style={{ background: '#34d39918' }}>
                  <BarChart2 size={10} style={{ color: '#34d399' }} />
                </div>
              </div>
              <p className="num text-[22px] font-extrabold leading-none text-tx-primary">{formatDuration(weekTotal)}</p>
            </div>
          </div>
        </div>

        {/* Deep work explainer */}
        <div className="fl-card flex items-center gap-3.5 px-4 py-3.5" style={{ borderLeft: '3px solid rgba(245,158,11,0.6)' }}>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-status-amber/12">
            <Flame size={14} className="text-status-amber" />
          </div>
          <div>
            <p className="text-xs font-bold text-tx-primary">Deep Work</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-tx-muted">
              Sessions ≥ 25 min are marked deep work — your highest-leverage focus blocks.
            </p>
          </div>
        </div>
      </section>

      {/* Session log + inspector — flex row so opening the inspector resizes
          the log instead of covering it; both share this row's height. */}
      <div className="flex min-w-0 gap-4" style={{ minHeight: 520 }}>
      <section className="fl-card flex min-w-0 flex-1 flex-col overflow-hidden">

        {/* Post-session card — shown at the top of the results column so it
            never displaces the Focus Session timer on the left */}
        {(postSessionAI || scoreCard) && (
          <div style={{ padding: '16px 16px 0', animation: 'sessionCardIn 0.3s cubic-bezier(0.34,1.56,0.64,1)' }}>
            <style>{`@keyframes sessionCardIn{from{opacity:0;transform:translateY(-12px)}to{opacity:1;transform:translateY(0)}}`}</style>
            {postSessionAI ? (
              <PostSessionAICard
                finalizedIntel={postSessionAI}
                onDismiss={() => setPostSessionAI(null)}
              />
            ) : scoreCard && (
              <div className="fl-card flex items-center gap-4 p-4 border-l-4 mb-0"
                style={{ borderLeftColor: scoreCard.color, boxShadow: `0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px ${scoreCard.color}20` }}>
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
                  style={{ background: `${scoreCard.color}18` }}>
                  <Award size={22} style={{ color: scoreCard.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-tx-faint mb-0.5">Session Score</p>
                  <p className="text-xl font-extrabold" style={{ color: scoreCard.color }}>
                    {scoreCard.score}<span className="text-sm text-tx-muted font-medium"> /100 · {scoreCard.label}</span>
                  </p>
                  <p className="text-xs text-tx-muted">{formatDuration(scoreCard.dur)} tracked</p>
                </div>
                <button onClick={() => setScoreCard(null)}
                  style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.25)', cursor: 'pointer', padding: 4, fontSize: 16, lineHeight: 1 }}>
                  ✕
                </button>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between border-b border-brd-subtle bg-bg-sidebar/40 px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/10">
              <TimerReset size={13} className="text-accent" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-tx-primary leading-tight">Session Log</h2>
              <p className="text-[10px] text-tx-faint leading-tight">Recent work</p>
            </div>
          </div>
          {sessions.length > 0 && (
            <span className="rounded-lg border border-brd-subtle bg-bg-hover px-2.5 py-1 text-xs font-bold tabular-nums text-tx-secondary">
              {fmtHM(sessions.reduce((a, s) => a + (s.duration_seconds || 0), 0))} total
            </span>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {Object.keys(grouped).length === 0 ? (
            <div className="flex h-72 flex-col items-center justify-center text-center">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-bg-input text-tx-faint">
                <Clock size={22} />
              </div>
              <p className="text-sm font-bold text-tx-secondary">No sessions yet</p>
              <p className="mt-1 text-xs text-tx-muted">Start your first session and it will appear here.</p>
            </div>
          ) : (
            <div className="space-y-5">
              {Object.entries(grouped).map(([date, daySessions]) => (
                <div key={date}>
                  <div className="mb-2.5 flex items-center gap-3">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-tx-faint">{date}</p>
                    <div className="flex-1 h-px bg-brd-subtle" />
                    <p className="text-[10px] font-semibold tabular-nums text-tx-faint">
                      {fmtHM(daySessions.reduce((a, s) => a + (s.duration_seconds || 0), 0))}
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    {daySessions.map(s => {
                      const sColor = getCategoryColor(s.category, categories);
                      const isRunning = !s.ended_at;
                      const isSelected = s.id === selectedSessionId;
                      return (
                      <div key={s.id}
                        onClick={() => setSelectedSessionId(s.id)}
                        className="group relative flex items-stretch rounded-xl border bg-bg-input overflow-hidden transition-all duration-150 hover:border-brd-hover hover:bg-bg-hover/50 hover:shadow-sm cursor-pointer"
                        style={{
                          borderColor: isSelected ? sColor : (isRunning ? `${sColor}35` : 'var(--color-brd-subtle, rgba(255,255,255,0.08))'),
                          background: isSelected ? `${sColor}0c` : (isRunning ? `${sColor}06` : undefined),
                          boxShadow: isSelected ? `0 0 0 1px ${sColor}55` : undefined,
                        }}>
                        <div className="w-[3px] shrink-0" style={{ background: sColor }} />
                        <div className="flex min-w-0 flex-1 items-center gap-3 px-3.5 py-2.5">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="text-[13px] font-semibold text-tx-primary truncate">{s.title || s.category}</p>
                              {s.is_deep_work && (
                                <span className="inline-flex items-center gap-0.5 rounded bg-status-amber/12 px-1.5 py-0.5 text-[9px] font-bold text-status-amber">
                                  <Zap size={7} />Deep
                                </span>
                              )}
                            </div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                              <span className="font-mono text-[11px] tabular-nums text-tx-muted">
                                {formatTime(s.started_at)}
                                <span className="mx-1 opacity-40">–</span>
                                {s.ended_at ? formatTime(s.ended_at) : <span className="text-status-green animate-pulse">now</span>}
                              </span>
                              <span onClick={e => e.stopPropagation()}>
                                <SessionProjectPicker
                                  session={s}
                                  projects={projects}
                                  onUpdateProject={async (sessionId, projectId, projectName, sess) => {
                                    await api.updateSession?.({
                                      sessionId,
                                      title:     sess?.title     ?? null,
                                      category:  sess?.category  ?? null,
                                      notes:     sess?.notes     ?? null,
                                      projectId: projectId       ?? null,
                                      clientId:  sess?.client_id ?? null,
                                    });
                                    setSessions(prev => prev.map(x =>
                                      x.id === sessionId
                                        ? { ...x, project_id: projectId ?? null, project_name: projectName ?? null }
                                        : x
                                    ));
                                  }}
                                />
                              </span>
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-1.5">
                            <span className="num rounded-lg px-2.5 py-1.5 font-mono text-xs font-bold tabular-nums"
                              style={{
                                background: `${sColor}14`,
                                border: `1px solid ${sColor}25`,
                                color: isRunning ? sColor : undefined,
                              }}>
                              {formatDuration(s.duration_seconds)}
                            </span>
                            <button onClick={async (e) => {
                              e.stopPropagation();
                              if (selectedSessionId === s.id) setSelectedSessionId(null);
                              setSessions(p => p.filter(x => x.id !== s.id));
                              try { await api.deleteSession?.({ sessionId: s.id }); }
                              catch { setSessions(p => [...p, s].sort((a, b) => b.started_at - a.started_at)); }
                            }}
                              className="rounded-lg p-1.5 text-tx-faint opacity-0 transition hover:bg-status-red/10 hover:text-status-red group-hover:opacity-100">
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <SessionInspectorPanel
        session={sessions.find(s => s.id === selectedSessionId) || null}
        userId={user.id}
        categories={categories}
        projects={projects}
        clients={clients}
        recentSessions={sessions}
        onClose={() => setSelectedSessionId(null)}
        onAfterMutate={handleInspectorMutate}
      />
      </div>

    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function TimerPage({ user, categories, setCategories, activeSession, setActiveSession, refreshActive, scheduledSession }) {
  // ── Tracking mode ──────────────────────────────────────────────────────────
  const [trackingMode, setTrackingMode] = useState(() => localStorage.getItem('fl-tracking-mode') || 'auto');

  const changeMode = useCallback((m) => {
    setTrackingMode(m);
    localStorage.setItem('fl-tracking-mode', m);
    api.updateTrackingSettings?.({ userId: user.id, autoTrack: m === 'auto' }).catch(() => {});
  }, [user.id]);

  useEffect(() => {
    api.getTrackingSettings?.({ userId: user.id }).then(s => {
      if (s && !localStorage.getItem('fl-tracking-mode')) {
        setTrackingMode(s.auto_track ? 'auto' : 'manual');
      }
    }).catch(() => {});
  }, [user.id]);

  // ── Live tracker state ─────────────────────────────────────────────────────
  const [heartbeat,        setHeartbeat]        = useState(null);
  const [isIdle,           setIsIdle]           = useState(false);
  const [idleStart,        setIdleStart]        = useState(null);
  const [idleElapsed,      setIdleElapsed]      = useState(0);
  const [autoElapsed,      setAutoElapsed]      = useState(0);
  const autoStartRef       = useRef(null);
  const prevAppRef         = useRef(null);
  const idleTickRef        = useRef(null);
  const autoTickRef        = useRef(null);

  // ── Calendar awareness ─────────────────────────────────────────────────────
  const [activeCalEvent,   setActiveCalEvent]   = useState(null);
  const [calCountdown,     setCalCountdown]     = useState(0);
  // Track active event by start_time (not id) so duplicate calendar connections
  // with the same event at different IDs don't trigger spurious pause/resume cycles.
  const calPrevEventIdRef  = useRef(null); // kept for compat — stores start_time now
  const trackingModeRef    = useRef(trackingMode);   // stable ref — avoids recreating intervals
  const activeSessionRef   = useRef(activeSession);  // stable ref for calendar callback
  const scheduledPauseRef  = useRef(null);            // event id with a precision setTimeout queued

  // ── Today stats ────────────────────────────────────────────────────────────
  const [todayStats,       setTodayStats]       = useState(null);
  const [todaySessions,    setTodaySessions]    = useState([]);
  const [statsLoading,     setStatsLoading]     = useState(false);

  // ── Projects list (for session-row project picker) ─────────────────────────
  const [autoProjects,     setAutoProjects]     = useState([]);
  useEffect(() => {
    api.listProjects?.({ userId: user.id }).then(l => setAutoProjects(l || [])).catch(() => {});
  }, [user.id]);
  const [autoClients,      setAutoClients]      = useState([]);
  useEffect(() => {
    api.listClients?.({ userId: user.id }).then(l => setAutoClients(l || [])).catch(() => {});
  }, [user.id]);
  const [selectedSessionId, setSelectedSessionId] = useState(null);

  // ── Recent auto-sessions for AI (live window: last 30 min) ───────────────────
  const [recentAutoSessions, setRecentAutoSessions] = useState([]);
  const [postSessionAI,      setPostSessionAI]      = useState(null);
  useEffect(() => {
    if (trackingMode !== 'auto') return;
    const load = () => {
      const from = Math.floor(Date.now() / 1000) - 1800; // 30-min window
      api.autoSessionsRange?.({ userId: user.id, from, to: Math.floor(Date.now() / 1000) })
        .then(list => setRecentAutoSessions(list || []))
        .catch(() => {});
    };
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [user.id, trackingMode]);

  // ── Auto-focus session state ───────────────────────────────────────────────
  const [autoFocusSession,  setAutoFocusSession]  = useState(null);
  const [autoFocusState,    setAutoFocusState]    = useState('watching');
  const [bufferPct,         setBufferPct]         = useState(0);
  const [autoToast,         setAutoToast]         = useState(null);
  const autoFocusSessionRef = useRef(null);
  const autoFocusStateRef   = useRef('watching');

  const categoriesRef       = useRef(categories);

  // ── Timer AI Intelligence ──────────────────────────────────────────────────
  const timerAI = useTimerAI({
    heartbeat,
    activeSession,
    autoFocusSession,
    autoFocusState,
    elapsedSecs: autoElapsed,
    recentAutoSessions,
    recentSessions: todaySessions,
    projects: autoProjects,
    enabled: trackingMode === 'auto',
  });

  // ── Tracking-start elapsed (starts immediately when auto mode is enabled) ──
  // Persisted in localStorage so navigating between pages does NOT reset the
  // counter. The stored timestamp is considered stale after 24 h.
  const TRACKING_START_KEY  = 'fl-auto-mode-start';
  const [trackingElapsed,   setTrackingElapsed]   = useState(0);
  const trackingStartRef    = useRef(null);
  const trackingTickRef     = useRef(null);

  useEffect(() => {
    clearInterval(trackingTickRef.current);
    if (trackingMode === 'auto') {
      const storedStr  = localStorage.getItem(TRACKING_START_KEY);
      const stored     = storedStr ? parseInt(storedStr, 10) : NaN;
      const MAX_AGE_MS = 24 * 3600 * 1000;
      const start = (Number.isFinite(stored) && stored > 0 && (Date.now() - stored) < MAX_AGE_MS)
        ? stored
        : Date.now();
      if (start !== stored) localStorage.setItem(TRACKING_START_KEY, String(start));
      trackingStartRef.current = start;
      setTrackingElapsed(Math.floor((Date.now() - start) / 1000));
      trackingTickRef.current = setInterval(() => {
        setTrackingElapsed(Math.floor((Date.now() - start) / 1000));
      }, 1000);
    } else {
      trackingStartRef.current = null;
      localStorage.removeItem(TRACKING_START_KEY);
      setTrackingElapsed(0);
    }
    return () => clearInterval(trackingTickRef.current);
  }, [trackingMode]);

  // ── Load today stats ───────────────────────────────────────────────────────
  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    const now    = Math.floor(Date.now() / 1000);
    const todayS = todayStart();
    try {
      const [stats, sessions, active] = await Promise.all([
        api.statsSummary?.({ userId: user.id, from: todayS, to: now }),
        api.listSessions?.({ userId: user.id, from: todayS, to: now }),
        api.activeSession?.({ userId: user.id }),
      ]);
      setTodayStats(stats || null);
      // Exclude __auto_block: rows from the timer timeline
      const list = (sessions || []).filter(s => !String(s.notes || '').startsWith('__auto_block:'));
      // Prepend any currently-running session so new recordings appear in the
      // timeline immediately — sessions:list only returns completed rows.
      if (active && active.started_at >= todayS && !list.find(s => s.id === active.id)) {
        setTodaySessions([active, ...list]);
      } else {
        setTodaySessions(list);
      }
    } catch {}
    setStatsLoading(false);
  }, [user.id]);

  useEffect(() => {
    loadStats();
    const t = setInterval(loadStats, 30_000);
    return () => clearInterval(t);
  }, [loadStats, activeSession]);

  const handleAutoInspectorMutate = useCallback(async (nextId) => {
    await loadStats();
    setSelectedSessionId(nextId);
  }, [loadStats]);

  // Keep stable refs in sync with their reactive counterparts
  useEffect(() => { trackingModeRef.current  = trackingMode;  }, [trackingMode]);
  useEffect(() => { activeSessionRef.current = activeSession; }, [activeSession]);

  // ── Register tracker event listeners ──────────────────────────────────────
  useEffect(() => {
    const unsubHB = api.onTrackerHeartbeat?.((hb) => {
      setHeartbeat(hb); setIsIdle(false);
      clearInterval(idleTickRef.current); setIdleElapsed(0); setIdleStart(null);
      if (hb.appName !== prevAppRef.current) {
        prevAppRef.current = hb.appName; autoStartRef.current = Date.now(); setAutoElapsed(0);
      }
    });
    const unsubIdle = api.onTrackerIdle?.(() => {
      setIsIdle(true);
      const now = Date.now(); setIdleStart(now);
      clearInterval(idleTickRef.current);
      idleTickRef.current = setInterval(() => setIdleElapsed(Math.floor((Date.now() - now) / 1000)), 1000);
      clearInterval(autoTickRef.current);
    });
    const unsubRes = api.onTrackerResume?.(() => {
      setIsIdle(false); clearInterval(idleTickRef.current); setIdleElapsed(0); setIdleStart(null);
      autoStartRef.current = Date.now(); setAutoElapsed(0); prevAppRef.current = null;
    });

    // ── Auto-focus state: driven entirely by main process ──────────────────
    // Subscribe to state-change events pushed from the AF machine.
    const unsubAF = api.onAutoFocusState?.((data) => {
      if (!data) return;
      autoFocusStateRef.current = data.state;
      setAutoFocusState(data.state);
      setBufferPct(data.bufferPct ?? 0);
      if (data.session !== undefined) {
        autoFocusSessionRef.current = data.session;
        setAutoFocusSession(data.session);
      }
      // Toast notifications
      if (data.reason === 'started') {
        setAutoToast({ type: 'started', category: data.session?.category, app: data.session?.title?.replace('Auto: ', '') });
        setTimeout(() => setAutoToast(null), 4000);
        loadStats();
      } else if (data.reason === 'idle') {
        setAutoToast({ type: 'stopped', reason: 'idle' });
        setTimeout(() => setAutoToast(null), 4000);
        loadStats();
        // Trigger AI finalization for ended session
        const endedSession = autoFocusSessionRef.current;
        if (endedSession) {
          const from = endedSession.started_at;
          const to   = Math.floor(Date.now() / 1000);
          api.autoSessionsRange?.({ userId: user.id, from, to })
            .then(autoList => timerAI.finalizeSession(endedSession, autoList || []))
            .then(intel => { if (intel) setPostSessionAI(intel); })
            .catch(() => {});
        }
      } else if (data.reason === 'user_paused') {
        setAutoToast({ type: 'paused' });
        setTimeout(() => setAutoToast(null), 3000);
        loadStats();
      } else if (data.reason === 'user_resumed') {
        setAutoToast({ type: 'resumed' });
        setTimeout(() => setAutoToast(null), 3000);
      } else if (data.reason === 'mode_switch') {
        loadStats();
      }
    });

    // Sync current AF state immediately on mount — don't wait for next heartbeat
    api.getAutoFocusState?.().then(s => {
      if (!s) return;
      autoFocusStateRef.current = s.state;
      setAutoFocusState(s.state);
      setBufferPct(s.bufferPct ?? 0);
      autoFocusSessionRef.current = s.session;
      setAutoFocusSession(s.session);
    }).catch(() => {});

    return () => {
      if (typeof unsubHB === 'function') unsubHB();
      if (typeof unsubIdle === 'function') unsubIdle();
      if (typeof unsubRes  === 'function') unsubRes();
      if (typeof unsubAF  === 'function') unsubAF();
      clearInterval(idleTickRef.current);
      clearInterval(autoTickRef.current);
    };
  }, [loadStats]);

  // ── Tick auto-elapsed counter ──────────────────────────────────────────────
  useEffect(() => {
    clearInterval(autoTickRef.current);
    if (!isIdle && autoStartRef.current) {
      autoTickRef.current = setInterval(() => {
        setAutoElapsed(Math.floor((Date.now() - autoStartRef.current) / 1000));
      }, 1000);
    }
    return () => clearInterval(autoTickRef.current);
  }, [isIdle, heartbeat?.appName]);

  // ── Calendar awareness — poll every 15 s with precision timing ───────────
  // Uses stable refs so the callback and interval are created only once.
  // Handles: AF pause on event start, AF resume on event end, manual-session
  // stop, and a precision setTimeout when an event is ≤60 s away.
  const checkCalendar = useCallback(async () => {
    const now = Math.floor(Date.now() / 1000);
    try {
      const events = await api.calendarList?.({ userId: user.id, from: now - 3600, to: now + 7200 });
      const active = (events || []).find(e => e.start_time <= now && e.end_time > now) || null;
      setActiveCalEvent(active);

      if (active) {
        // Use start_time as the event key — if there are duplicate calendar connections
        // the same event appears with two different IDs but the same start_time.
        // Comparing by start_time prevents spurious pause/resume when SQL ordering flips.
        const activeKey = active.start_time;
        if (activeKey !== calPrevEventIdRef.current) {
          // New event became active
          calPrevEventIdRef.current = activeKey;
          if (trackingModeRef.current === 'auto') {
            // Pause the AF machine so it won't start new sessions during the event
            await api.pauseAutoSession?.().catch(() => {});
          }
          // Also stop any open manual session
          if (activeSessionRef.current) {
            await api.stopSession?.({ sessionId: activeSessionRef.current.id }).catch(() => {});
            setActiveSession(null);
          }
          loadStats();
        }
      } else if (calPrevEventIdRef.current !== null) {
        // Event just ended — resume tracking
        calPrevEventIdRef.current = null;
        if (trackingModeRef.current === 'auto') {
          await api.resumeAutoTracking?.().catch(() => {});
          loadStats();
        }
      }

      // Precision: if an event starts within the next 60 s, schedule a
      // focused check exactly when it starts so we react instantly instead
      // of waiting up to 15 s for the next poll cycle.
      const upcoming = (events || []).find(e => e.start_time > now && e.start_time <= now + 60);
      if (upcoming && scheduledPauseRef.current !== upcoming.start_time) {
        scheduledPauseRef.current = upcoming.start_time;
        const delayMs = (upcoming.start_time - now) * 1000;
        setTimeout(() => {
          scheduledPauseRef.current = null;
          checkCalendar();
        }, delayMs);
      }
    } catch {}
  }, [user.id, setActiveSession, loadStats]);

  useEffect(() => {
    checkCalendar();
    const t = setInterval(checkCalendar, 15_000);
    return () => clearInterval(t);
  }, [checkCalendar]);

  // ── Calendar countdown tick ────────────────────────────────────────────────
  useEffect(() => {
    if (!activeCalEvent) { setCalCountdown(0); return; }
    const tick = () => setCalCountdown(Math.max(0, activeCalEvent.end_time - Math.floor(Date.now() / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [activeCalEvent]);

  // Keep categoriesRef current
  useEffect(() => { categoriesRef.current = categories; }, [categories]);

  // Buffer tick and session creation are now handled in main.js (AF state machine).
  // The bufferPct state is updated via the onAutoFocusState event listener above.

  // ── Auto-session state machine is now owned by main.js ───────────────────
  // The React component is a pure subscriber: it syncs on mount and listens for
  // tracker:afState events. No timers, no session creation, no idle detection
  // happen here — that all runs in the Electron main process regardless of
  // which page is currently rendered.
  //
  // Calendar-event pausing is handled entirely inside checkCalendar above via
  // api.pauseAutoSession / api.resumeAutoTracking — no duplicate effect needed.

  const appClass = useMemo(
    () => heartbeat?.appName ? classifyApp(heartbeat.appName) : null,
    [heartbeat?.appName],
  );

  const deleteSession = useCallback(async (id) => {
    await api.deleteSession?.({ sessionId: id });
    setTodaySessions(prev => prev.filter(s => s.id !== id));
  }, []);

  const updateSessionProject = useCallback(async (sessionId, projectId, projectName, session) => {
    await api.updateSession?.({
      sessionId,
      title:     session?.title     ?? null,
      category:  session?.category  ?? null,
      notes:     session?.notes     ?? null,
      projectId: projectId          ?? null,
      clientId:  session?.client_id ?? null,
    });
    setTodaySessions(prev => prev.map(s =>
      s.id === sessionId
        ? { ...s, project_id: projectId ?? null, project_name: projectName ?? null }
        : s
    ));
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────
  const isLiveTracking = trackingMode === 'auto' && autoFocusState === 'tracking';

  return (
    <div className="h-full overflow-y-auto bg-bg-app">
      {/* ── Page header ── */}
      <div className="sticky top-0 z-20 border-b border-brd-subtle bg-bg-app/95 px-6 py-3 backdrop-blur-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10 ring-1 ring-accent/15 shadow-sm">
              <Activity size={16} className="text-accent" />
              {isLiveTracking && (
                <span className="absolute -right-0.5 -top-0.5 flex h-3 w-3">
                  <span className="absolute h-full w-full rounded-full bg-status-green animate-ping opacity-70" />
                  <span className="relative flex h-3 w-3 items-center justify-center rounded-full bg-status-green">
                    <span className="h-1.5 w-1.5 rounded-full bg-white" />
                  </span>
                </span>
              )}
            </div>
            <div>
              <h1 className="text-sm font-bold text-tx-primary leading-tight">Focus Tracker</h1>
              <p className="flex items-center gap-1.5 text-[10px] leading-tight">
                {isLiveTracking && <span className="h-1.5 w-1.5 rounded-full bg-status-green shrink-0" />}
                <span className="text-tx-faint">
                  {trackingMode === 'auto'
                    ? isLiveTracking ? 'Recording · session in progress' : 'Automatic · monitoring in background'
                    : 'Manual · start sessions when ready'}
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {trackingMode === 'auto' && (
              <button onClick={loadStats} disabled={statsLoading}
                className="flex items-center gap-1.5 rounded-lg border border-brd-default bg-bg-input px-3 py-1.5 text-xs font-semibold text-tx-muted transition hover:border-brd-hover hover:text-tx-primary disabled:opacity-40">
                <RefreshCw size={10} className={statsLoading ? 'animate-spin' : ''} />
                Refresh
              </button>
            )}
            <ModeToggle mode={trackingMode} onChange={changeMode} />
          </div>
        </div>
      </div>

      <div className="p-6">
        {trackingMode === 'auto' ? (
          /* ── Automatic mode ── */
          <div className="grid min-h-full grid-cols-1 gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">

            {/* Left column */}
            <div className="flex flex-col gap-4">

              {/* ── Scheduled-session in-progress card ─────────────────────── */}
              {scheduledSession && !activeSession && (() => {
                const nowSec    = Math.floor(Date.now() / 1000);
                const elapsed   = Math.max(0, nowSec - scheduledSession.started_at);
                const remaining = Math.max(0, scheduledSession.ended_at - nowSec);
                const duration  = Math.max(1,  scheduledSession.ended_at - scheduledSession.started_at);
                const progress  = Math.min(1, elapsed / duration);
                const label     = scheduledSession.title || scheduledSession.category || 'Scheduled Work';
                const color     = scheduledSession.project_color || '#818CF8';
                const fmtR = (s) => `${formatTimer(Math.max(0, s))} remaining`;
                return (
                  <div style={{
                    borderRadius: 14, border: `1px solid ${color}35`,
                    background: `linear-gradient(135deg, ${color}12 0%, ${color}06 100%)`,
                    padding: '14px 16px', position: 'relative', overflow: 'hidden',
                  }}>
                    {/* Progress fill */}
                    <div style={{
                      position: 'absolute', inset: 0, zIndex: 0,
                      background: `linear-gradient(90deg, ${color}18 0%, transparent 100%)`,
                      width: `${progress * 100}%`,
                      transition: 'width 1s linear',
                    }} />
                    <div style={{ position: 'relative', zIndex: 1 }}>
                      <div className="flex items-center gap-2 mb-2">
                        <span style={{
                          width: 8, height: 8, borderRadius: '50%',
                          background: color, boxShadow: `0 0 8px ${color}80`,
                          animation: 'pulse 1.8s infinite',
                          flexShrink: 0,
                        }} />
                        <span className="text-xs font-bold" style={{ color }}>In Progress · Scheduled Block</span>
                        {scheduledSession.project_name && (
                          <span className="text-[10px] ml-auto" style={{ color: `${color}99` }}>
                            {scheduledSession.project_name}
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-bold text-tx-primary mb-1 truncate">{label}</p>
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-mono font-semibold" style={{ color }}>
                          {formatTimer(elapsed)}
                        </span>
                        <span className="text-tx-faint text-[10px]">·</span>
                        <span className="text-[11px] text-tx-muted font-tabular">{fmtR(remaining)}</span>
                      </div>
                      {/* Progress bar */}
                      <div className="mt-3 h-1.5 rounded-full bg-bg-hover overflow-hidden">
                        <div style={{
                          height: '100%', borderRadius: 99,
                          width: `${progress * 100}%`,
                          background: `linear-gradient(90deg, ${color}99, ${color})`,
                          transition: 'width 1s linear',
                        }} />
                      </div>
                      {progress >= 0.9 && (
                        <p className="mt-2 text-[10px]" style={{ color: '#34D399' }}>
                          ⚡ Almost done — auto-tracking will resume when this block ends
                        </p>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Auto-session toast */}
              {autoToast && (
                <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-semibold ${
                  autoToast.type === 'started'  ? 'bg-indigo-500/10 border-indigo-500/22 text-indigo-300'
                  : autoToast.type === 'paused' ? 'bg-status-amber/10 border-status-amber/20 text-status-amber'
                  : autoToast.type === 'resumed'? 'bg-status-green/10 border-status-green/20 text-status-green'
                  : 'bg-bg-hover border-brd-subtle text-tx-muted'
                }`}>
                  {autoToast.type === 'paused'  ? <Pause size={13} className="shrink-0" />
                  : autoToast.type === 'resumed' ? <Play size={13} className="shrink-0" fill="currentColor" />
                  : <Zap size={13} className="shrink-0" />}
                  {autoToast.type === 'started'  ? `Focus session started · ${autoToast.category}`
                  : autoToast.type === 'paused'  ? 'Auto-tracking paused · resume anytime'
                  : autoToast.type === 'resumed' ? 'Auto-tracking resumed · watching for activity'
                  : autoToast.reason === 'idle'  ? 'Focus session ended · idle for 5+ minutes'
                  : 'Focus session ended · calendar event started'}
                </div>
              )}

              {/* Hero tracking card */}
              <FocusHeroCard
                heartbeat={heartbeat}
                isIdle={isIdle}
                idleElapsed={idleElapsed}
                activeCalEvent={activeCalEvent}
                calCountdown={calCountdown}
                autoElapsed={autoElapsed}
                appClass={appClass}
                categories={categories}
                activeSession={activeSession}
                autoFocusSession={autoFocusSession}
                autoFocusState={autoFocusState}
                bufferPct={bufferPct}
                trackingElapsed={trackingElapsed}
                onStopAutoSession={async () => {
                  const stoppedSession = autoFocusSessionRef.current;
                  await api.stopAutoSession?.();
                  loadStats();
                  // Finalize with AI when user manually stops
                  if (stoppedSession) {
                    const from = stoppedSession.started_at;
                    const to   = Math.floor(Date.now() / 1000);
                    api.autoSessionsRange?.({ userId: user.id, from, to })
                      .then(autoList => timerAI.finalizeSession(stoppedSession, autoList || [], todaySessions))
                      .then(intel => { if (intel) setPostSessionAI(intel); })
                      .catch(() => {});
                  }
                }}
                onPauseAutoSession={async () => {
                  await api.pauseAutoSession?.();
                  loadStats();
                }}
                onResumeAutoTracking={async () => {
                  await api.resumeAutoTracking?.();
                }}
              />

              {/* ── AI Intelligence Panel ── */}
              {(autoFocusState === 'tracking' || timerAI.hasIntel || autoFocusState === 'buffering') && (
                <AIStatusPanel
                  workflow={timerAI.workflow}
                  flowState={timerAI.flowState}
                  focusQuality={timerAI.focusQuality}
                  liveInsights={timerAI.liveInsights}
                  recommendation={timerAI.recommendation}
                  continuity={timerAI.continuity}
                  projectSuggestion={timerAI.projectSuggestion}
                  productivityState={timerAI.productivityState}
                  workflowDesc={timerAI.workflowDesc}
                  confidence={timerAI.confidence}
                  confidenceLabel={timerAI.confidenceLabel}
                  elapsedSecs={autoElapsed}
                  isTracking={autoFocusState === 'tracking'}
                  hasIntel={timerAI.hasIntel}
                  onAcceptProjectSuggestion={(suggestion) => {
                    if (autoFocusSession?.id) {
                      api.updateSession?.({ sessionId: autoFocusSession.id, projectId: suggestion.projectId });
                    }
                  }}
                />
              )}

              {/* ── Post-session AI card ── */}
              {postSessionAI && (
                <PostSessionAICard
                  finalizedIntel={postSessionAI}
                  onDismiss={() => setPostSessionAI(null)}
                />
              )}

              {/* Analytics strip */}
              <DayAnalytics stats={todayStats} sessions={todaySessions} />

              {/* Category breakdown */}
              <CategoryBreakdownBar sessions={todaySessions} categories={categories} />

              {/* Classification panel */}
              <ClassificationPanel heartbeat={heartbeat} appClass={appClass} />

              {/* Calendar-aware hint */}
              {!activeCalEvent && (
                <div className="fl-card flex items-center gap-3.5 px-4 py-3.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
                    <Calendar size={14} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-tx-primary">Calendar-aware tracking</p>
                    <p className="mt-0.5 text-[10px] text-tx-faint leading-relaxed">
                      Auto-tracking pauses on active events and resumes when they end.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Right column — session timeline + inspector, sharing one row so
                opening the inspector resizes the timeline instead of covering it */}
            <div className="flex min-w-0 flex-1 gap-4">
              <div className="min-w-0 flex-1">
                <SessionTimeline
                  sessions={todaySessions}
                  categories={categories}
                  projects={autoProjects}
                  onDelete={deleteSession}
                  onUpdateProject={updateSessionProject}
                  selectedSessionId={selectedSessionId}
                  onSelectSession={setSelectedSessionId}
                />
              </div>
              <SessionInspectorPanel
                session={todaySessions.find(s => s.id === selectedSessionId) || null}
                userId={user.id}
                categories={categories}
                projects={autoProjects}
                clients={autoClients}
                recentSessions={todaySessions}
                onClose={() => setSelectedSessionId(null)}
                onAfterMutate={handleAutoInspectorMutate}
              />
            </div>
          </div>

        ) : (
          /* ── Manual mode ── */
          <ManualModePanel
            user={user}
            categories={categories}
            setCategories={setCategories}
            activeSession={activeSession}
            setActiveSession={setActiveSession}
            refreshActive={refreshActive}
          />
        )}
      </div>
    </div>
  );
}
