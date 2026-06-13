import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { usePrefs } from '../../hooks/usePrefs';
import { createPortal } from 'react-dom';
import {
  Square, ChevronDown, ChevronUp,
  Volume2, VolumeX, Music, Pause, Play,
  Trash2, Coffee, CheckCircle, X, Zap, PenLine,
} from 'lucide-react';
import SessionNotesModal from './SessionNotesModal';

const api = window.electron || {};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtTimer(secs) {
  if (!secs || secs < 0) secs = 0;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function fmtRemaining(secs) {
  if (secs <= 0) return '0:00';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m left`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')} left`;
}

function isAutoSession(s) { return s?.title?.startsWith('Auto:'); }

// ─── Smart workflow label — never shows raw app/process names ─────────────────
function buildWorkflow(session) {
  if (!session) return null;
  const title = session.title || '';
  const clean = title.startsWith('Auto:') ? title.replace('Auto:', '').trim() : title;
  const vague = /^(focus|session|work|task|untitled|auto|computer|screen)$/i;
  if (clean && !vague.test(clean.trim())) return clean;
  if (session.category) {
    const catMap = {
      Coding: 'Development Session', Design: 'Design & UI Work',
      Writing: 'Writing & Docs', Research: 'Research Session',
      Meeting: 'Meeting & Collaboration', Admin: 'Admin & Planning',
      Marketing: 'Marketing Work', Finance: 'Finance & Reporting',
    };
    return catMap[session.category] || session.category;
  }
  return 'Focus Session';
}

// ─── AI focus state derived from session data + elapsed ───────────────────────
function deriveState(session, elapsed) {
  if (!session) return null;
  const mt = session.session_type === 'meeting';
  const br = session.session_type === 'break';
  const dw = session.is_deep_work;
  if (mt) return { label: 'Meeting',      color: '#F87171', glow: 'rgba(248,113,113,0.55)', dot: '🔴' };
  if (br) return { label: 'Break',         color: '#34D399', glow: 'rgba(52,211,153,0.5)',   dot: '☕' };
  if (dw && elapsed > 2700) return { label: 'Deep Flow',   color: '#A89CF7', glow: 'rgba(124,108,242,0.65)', dot: '🟢' };
  if (dw && elapsed > 900)  return { label: 'Deep Work',   color: '#A89CF7', glow: 'rgba(124,108,242,0.55)', dot: '🟢' };
  if (elapsed > 5400)       return { label: 'Momentum',    color: '#34D399', glow: 'rgba(52,211,153,0.55)',  dot: '🟡' };
  if (elapsed > 2400)       return { label: 'In The Zone', color: '#60A5FA', glow: 'rgba(96,165,250,0.5)',   dot: '🟡' };
  if (elapsed > 900)        return { label: 'Focused',     color: '#60A5FA', glow: 'rgba(96,165,250,0.45)', dot: '🟢' };
  return                           { label: 'Warming Up',  color: '#FBBF24', glow: 'rgba(251,191,36,0.4)',  dot: '🟡' };
}

// ─── Focus quality score (0–99) derived from state + elapsed ─────────────────
function deriveFocusScore(aiState, elapsed) {
  if (!aiState) return null;
  const base = {
    'Warming Up': 46, 'Focused': 68, 'In The Zone': 77,
    'Deep Work': 84, 'Deep Flow': 91, 'Momentum': 88,
    'Meeting': 72, 'Break': 60,
  }[aiState.label] ?? 60;
  const micro = Math.round(Math.sin(elapsed / 19) * 2);
  return Math.min(99, Math.max(40, base + micro));
}

// ─── Light / dark mode hook ───────────────────────────────────────────────────
function useIsLight() {
  const [isLight, setIsLight] = useState(
    () => document.documentElement.classList.contains('theme-light')
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

// ─── Per-theme surface palette ────────────────────────────────────────────────
function makeDT(isLight, accent, glow) {
  if (isLight) return {
    // ── Bar surface
    barBg:           'rgba(250,249,255,0.90)',
    barBackdrop:     'blur(16px) saturate(165%)',
    barBorder:       'rgba(107,92,242,0.16)',
    barBoxShadow:    '0 -1px 28px rgba(107,92,242,0.09), 0 -1px 0 rgba(107,92,242,0.08), inset 0 1px 0 rgba(255,255,255,1.0)',
    // ── Ambient glow
    ambientGlow:     'rgba(107,92,242,0.28)',
    // ── Hairline
    hairline:        accent,
    hairlineIdle:    'rgba(107,92,242,0.22)',
    // ── Pulse dot
    dotActive:       accent,
    dotActiveShadow: `0 0 0 3px ${accent}1E, 0 0 10px ${accent}20`,
    dotIdle:         'rgba(107,92,242,0.22)',
    // ── Text — Zone 1
    sessionLabel:    'rgba(26,23,48,0.68)',
    timerActive:     '#18152E',
    timerIdle:       'rgba(26,23,48,0.26)',
    taskCaption:     'rgba(26,23,48,0.55)',
    taskText:        '#1A1730',
    readyText:       'rgba(26,23,48,0.38)',
    colSep:          'rgba(107,92,242,0.12)',
    // ── Badges
    stateBadgeBg:    (a) => `${a}10`,
    stateBadgeBorder:(a) => `${a}28`,
    stateBadgeColor: (a) => a,
    pausedBadgeBg:   'rgba(161,106,0,0.09)',
    pausedBadgeBorder:'rgba(161,106,0,0.26)',
    pausedBadgeColor: '#8B5800',
    // ── Zone separators
    zoneSep:         'rgba(107,92,242,0.10)',
    // ── Progress pill
    progressPillBg:     'rgba(107,92,242,0.04)',
    progressPillBorder: 'rgba(107,92,242,0.12)',
    goalCaption:     'rgba(26,23,48,0.55)',
    goalValue:       '#1A1730',
    progressTrack:   'rgba(107,92,242,0.10)',
    scoreBadgeBg:    (a) => `${a}0E`,
    scoreBadgeBorder:(a) => `${a}20`,
    // ── Ghost btn hover
    ghostHoverBg:    'rgba(83,71,199,0.09)',
    ghostHoverColor: '#5347C7',
    ghostHoverBorder:'rgba(83,71,199,0.16)',
    // ── Note dot
    noteDot:         accent,
    noteDotShadow:   `0 0 5px ${accent}55`,
    // ── Chevron
    chevronColor:    'rgba(26,23,48,0.38)',
    chevronHoverBg:  'rgba(83,71,199,0.08)',
    chevronHoverColor:'rgba(26,23,48,0.72)',
    chevronHoverBorder:'rgba(83,71,199,0.16)',
    chevronActiveBg: 'rgba(83,71,199,0.10)',
    chevronActiveBorder:'rgba(83,71,199,0.20)',
    chevronActiveColor:'#5347C7',
    // ── Pause btn
    pauseBg:       (a) => `${a}10`,
    pauseBorder:   (a) => `${a}28`,
    pauseColor:    (a) => a,
    pauseHoverBg:  (a) => `${a}1C`,
    pauseShadow:   (a) => `0 1px 10px ${a}12`,
    pauseHoverShadow:(a) => `0 2px 16px ${a}1E`,
    // ── Resume btn
    resumeBg:     'rgba(16,185,129,0.09)',
    resumeBorder: 'rgba(16,185,129,0.26)',
    resumeColor:  '#065F46',
    resumeHoverBg:'rgba(16,185,129,0.16)',
    resumeShadow: '0 1px 10px rgba(16,185,129,0.10)',
    resumeHoverShadow:'0 2px 16px rgba(16,185,129,0.20)',
    // ── End btn
    endBg:        'rgba(220,38,38,0.07)',
    endBorder:    'rgba(220,38,38,0.20)',
    endColor:     '#B91C1C',
    endHoverBg:   'rgba(220,38,38,0.13)',
    endHoverBorder:'rgba(220,38,38,0.28)',
    endShadow:    '0 1px 10px rgba(220,38,38,0.07)',
    endHoverShadow:'0 2px 16px rgba(220,38,38,0.14)',
    // ── Music pill
    musicPillBg:    (c) => `${c}0B`,
    musicPillBorder:(c) => `${c}1C`,
    musicIconBg:    (c) => `${c}12`,
    musicIconBorder:(c) => `${c}22`,
    musicSub:       'rgba(26,23,48,0.42)',
    // ── Dropdown
    dropdownBg:     'rgba(255,255,255,0.99)',
    dropdownBorder: 'rgba(107,92,242,0.16)',
    dropdownShadow: '0 16px 52px rgba(83,71,199,0.16), 0 4px 16px rgba(0,0,0,0.07)',
    dropDivider:    'rgba(107,92,242,0.10)',
    dropKeepBg:     'rgba(107,92,242,0.06)',
    dropKeepBorder: 'rgba(107,92,242,0.15)',
    dropKeepColor:  '#5A5478',
    dropKeepHoverBg:'rgba(107,92,242,0.11)',
    dropSecText:    'rgba(83,71,199,0.38)',
  };

  // ── Dark mode
  return {
    barBg:           'rgba(9,11,20,0.78)',
    barBackdrop:     'blur(16px) saturate(180%)',
    barBorder:       `${accent}30`,
    barBoxShadow:    `0 -1px 32px ${accent}12, 0 -1px 0 rgba(255,255,255,0.03), inset 0 1px 0 rgba(255,255,255,0.04)`,
    ambientGlow:     glow,
    hairline:        accent,
    hairlineIdle:    'rgba(255,255,255,0.055)',
    dotActive:       accent,
    dotActiveShadow: `0 0 0 3px ${accent}1E, 0 0 16px ${glow}`,
    dotIdle:         'rgba(255,255,255,0.12)',
    sessionLabel:    'rgba(255,255,255,0.30)',
    timerActive:     '#EDF0FF',
    timerIdle:       'rgba(255,255,255,0.22)',
    taskCaption:     'rgba(255,255,255,0.25)',
    taskText:        'rgba(220,228,255,0.82)',
    readyText:       'rgba(255,255,255,0.22)',
    colSep:          'rgba(255,255,255,0.07)',
    stateBadgeBg:    (a) => `${a}15`,
    stateBadgeBorder:(a) => `${a}30`,
    stateBadgeColor: (a) => a,
    pausedBadgeBg:   'rgba(251,191,36,0.12)',
    pausedBadgeBorder:'rgba(251,191,36,0.28)',
    pausedBadgeColor: '#FBBF24',
    zoneSep:         'rgba(255,255,255,0.055)',
    progressPillBg:     'rgba(255,255,255,0.028)',
    progressPillBorder: 'rgba(255,255,255,0.06)',
    goalCaption:     'rgba(255,255,255,0.28)',
    goalValue:       'rgba(237,240,255,0.90)',
    progressTrack:   'rgba(255,255,255,0.08)',
    scoreBadgeBg:    (a) => `${a}12`,
    scoreBadgeBorder:(a) => `${a}22`,
    ghostHoverBg:    'rgba(124,108,242,0.12)',
    ghostHoverColor: 'rgba(255,255,255,0.92)',
    ghostHoverBorder:'rgba(255,255,255,0.07)',
    noteDot:         '#A89CF7',
    noteDotShadow:   '0 0 5px rgba(168,156,247,0.75)',
    chevronColor:    'var(--dock-text-secondary)',
    chevronHoverBg:  'rgba(255,255,255,0.06)',
    chevronHoverColor:'rgba(255,255,255,0.85)',
    chevronHoverBorder:'rgba(255,255,255,0.09)',
    chevronActiveBg: 'rgba(255,255,255,0.05)',
    chevronActiveBorder:'rgba(255,255,255,0.10)',
    chevronActiveColor:'rgba(255,255,255,0.75)',
    pauseBg:       (a) => `${a}20`,
    pauseBorder:   (a) => `${a}38`,
    pauseColor:    (a) => a,
    pauseHoverBg:  (a) => `${a}32`,
    pauseShadow:   (a) => `0 2px 14px ${a}18`,
    pauseHoverShadow:(a) => `0 4px 20px ${a}28`,
    resumeBg:     'rgba(52,211,153,0.14)',
    resumeBorder: 'rgba(52,211,153,0.32)',
    resumeColor:  '#34D399',
    resumeHoverBg:'rgba(52,211,153,0.22)',
    resumeShadow: '0 2px 16px rgba(52,211,153,0.20)',
    resumeHoverShadow:'0 4px 22px rgba(52,211,153,0.32)',
    endBg:        'rgba(248,113,113,0.10)',
    endBorder:    'rgba(248,113,113,0.22)',
    endColor:     '#FCA5A5',
    endHoverBg:   'rgba(248,113,113,0.18)',
    endHoverBorder:'rgba(248,113,113,0.30)',
    endShadow:    '0 2px 12px rgba(248,113,113,0.10)',
    endHoverShadow:'0 4px 20px rgba(248,113,113,0.22)',
    musicPillBg:    (c) => `${c}10`,
    musicPillBorder:(c) => `${c}20`,
    musicIconBg:    (c) => `${c}18`,
    musicIconBorder:(c) => `${c}28`,
    musicSub:       'rgba(255,255,255,0.38)',
    dropdownBg:     'rgba(8,9,18,0.98)',
    dropdownBorder: 'rgba(255,255,255,0.09)',
    dropdownShadow: '0 28px 72px rgba(0,0,0,0.8), 0 0 0 1px rgba(124,108,242,0.06)',
    dropDivider:    'rgba(255,255,255,0.06)',
    dropKeepBg:     'rgba(255,255,255,0.05)',
    dropKeepBorder: 'rgba(255,255,255,0.09)',
    dropKeepColor:  '#6A7A96',
    dropKeepHoverBg:'rgba(255,255,255,0.09)',
    dropSecText:    '#8A3A3A',
  };
}

// ─── Glassmorphism token (pill/floating variants) ─────────────────────────────
const GLASS = {
  background: 'rgba(10, 12, 22, 0.86)',
  backdropFilter: 'blur(20px) saturate(180%)',
  WebkitBackdropFilter: 'blur(20px) saturate(180%)',
};

// ─── Equalizer bars (music playing indicator) ─────────────────────────────────
function EqBars({ color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 12, flexShrink: 0 }}>
      {[0, 1, 2, 3].map(i => (
        <div key={i} className={`fl-dock-eq-bar-${i}`}
          style={{ width: 2, borderRadius: 99, background: color, flexShrink: 0, minHeight: 3 }} />
      ))}
    </div>
  );
}

// ─── Now-playing label with overflow marquee ──────────────────────────────────
// Width is controlled by the parent flex container — do not set maxWidth here.
function NowPlayingLabel({ text, color, sub, subColor = 'rgba(255,255,255,0.38)' }) {
  const outerRef = useRef(null);
  const innerRef = useRef(null);
  const [scrollPx, setScrollPx] = useState(0);
  useEffect(() => {
    if (!outerRef.current || !innerRef.current) return;
    const overflow = innerRef.current.scrollWidth - outerRef.current.clientWidth;
    setScrollPx(overflow > 4 ? overflow + 6 : 0);
  }, [text]);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1.5, minWidth: 0, overflow: 'hidden' }}>
      <div ref={outerRef} style={{ overflow: 'hidden', whiteSpace: 'nowrap' }}>
        <span ref={innerRef} style={{
          display: 'inline-block', fontSize: 10.5, fontWeight: 600, color, lineHeight: 1.2,
          '--fl-scroll-px': `${scrollPx}px`,
          animation: scrollPx > 0 ? 'fl-dock-marquee 9s ease-in-out infinite' : 'none',
        }}>
          {text}
        </span>
      </div>
      {sub && (
        <span style={{
          fontSize: 9, color: subColor,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.2,
        }}>
          {sub}
        </span>
      )}
    </div>
  );
}

// ─── Dropdown menu item ───────────────────────────────────────────────────────
function DropItem({ icon, label, danger, onClick }) {
  return (
    <button
      onClick={onClick}
      className={danger ? 'fl-focus-dock-menu-item-danger' : 'fl-focus-dock-menu-item'}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 9,
        padding: '8px 14px', background: 'transparent', border: 'none',
        color: danger ? '#F87171' : 'var(--dock-text-secondary)',
        fontSize: 12, fontWeight: 500, cursor: 'pointer', textAlign: 'left',
        transition: 'background 0.11s, color 0.1s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = danger ? 'rgba(248,113,113,0.09)' : 'rgba(255,255,255,0.05)';
        e.currentTarget.style.color = danger ? '#FCA5A5' : 'var(--dock-text-primary)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.color = danger ? '#F87171' : 'var(--dock-text-secondary)';
      }}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

// ─── Inline zone divider ──────────────────────────────────────────────────────
function ZoneSep({ color = 'rgba(255,255,255,0.055)' }) {
  return (
    <div style={{
      width: 1, height: 20,
      background: color,
      flexShrink: 0, alignSelf: 'center',
      margin: '0 2px',
    }} />
  );
}

// ─── Ghost icon button ────────────────────────────────────────────────────────
function GhostBtn({ onClick, title, size = 32, children, hoverColor = '#A89CF7', hoverBg = 'rgba(124,108,242,0.12)', hoverBorderColor = null, dangerHover = false }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="fl-dock-ghost-btn"
      style={{
        width: size, height: size, borderRadius: 9, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'transparent', border: '1px solid transparent',
        color: 'var(--dock-icon)', cursor: 'pointer',
        transition: 'background 0.13s, color 0.13s, border-color 0.13s, transform 0.09s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = dangerHover ? 'rgba(248,113,113,0.11)' : hoverBg;
        e.currentTarget.style.color = dangerHover ? '#F87171' : hoverColor;
        e.currentTarget.style.borderColor = dangerHover
          ? 'rgba(248,113,113,0.20)'
          : (hoverBorderColor ?? 'rgba(255,255,255,0.07)');
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.color = 'var(--dock-icon)';
        e.currentTarget.style.borderColor = 'transparent';
      }}
      onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.90)'; }}
      onMouseUp={e => { e.currentTarget.style.transform = 'none'; }}
    >
      {children}
    </button>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function FocusSessionDock({ activeSession, scheduledSession, sidebarWidth = 88, onStop, onOpenMusic, onTakeBreak }) {
  const prefs = usePrefs();
  const { dockPosition = 'bottom-center', dockCompact = false } = prefs;
  const isLight = useIsLight();

  const pillPos = useMemo(() => {
    if (dockPosition === 'bottom-left')  return { left: 20 };
    if (dockPosition === 'bottom-right') return { right: 20 };
    return { left: 0, right: 0, marginLeft: 'auto', marginRight: 'auto' };
  }, [dockPosition]);

  // ── Scheduled session clock ─────────────────────────────────────────────────
  const [schedNow, setSchedNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    if (!scheduledSession) return;
    const id = setInterval(() => setSchedNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, [scheduledSession]);

  const schedElapsed = scheduledSession ? Math.max(0, schedNow - scheduledSession.started_at) : 0;
  const schedRemain  = scheduledSession ? Math.max(0, scheduledSession.ended_at - schedNow) : 0;
  const schedDur     = scheduledSession ? Math.max(1, scheduledSession.ended_at - scheduledSession.started_at) : 1;
  const schedPct     = Math.min(1, schedElapsed / schedDur);
  const schedLabel   = scheduledSession ? (scheduledSession.title || scheduledSession.category || 'Scheduled Work') : '';
  const schedColor   = scheduledSession?.project_color || '#818CF8';

  // ── Core state ──────────────────────────────────────────────────────────────
  const [elapsed,      setElapsed]     = useState(0);
  const [dropOpen,     setDropOpen]    = useState(false);
  const [discardConf,  setDiscardConf] = useState(false);
  const [minimized,    setMinimized]   = useState(false);
  const [musicState,   setMusicState]  = useState(() => window.__flMusicState ? { ...window.__flMusicState } : null);
  const [justEnded,    setJustEnded]   = useState(false);
  const [endedSum,     setEndedSum]    = useState(null);
  const [isPaused,     setIsPaused]    = useState(false);
  const [showNotes,    setShowNotes]   = useState(false);
  const [editingTask,  setEditingTask] = useState(false);
  const [taskEditVal,  setTaskEditVal] = useState('');

  const prevRef          = useRef(null);
  const elapsedRef       = useRef(0);
  const endTimer         = useRef(null);
  const dropRef          = useRef(null);
  const isPausedRef      = useRef(false);
  const pauseStartMsRef  = useRef(null);
  const totalPausedMsRef = useRef(0);

  // ── Live timer ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeSession) { setElapsed(0); elapsedRef.current = 0; return; }
    const startMs = activeSession.startTime
      ? new Date(activeSession.startTime).getTime()
      : activeSession.started_at ? activeSession.started_at * 1000 : Date.now();
    const tick = () => {
      if (isPausedRef.current) return;
      const v = Math.max(0, Math.floor((Date.now() - startMs - totalPausedMsRef.current) / 1000));
      setElapsed(v);
      elapsedRef.current = v;
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [activeSession]);

  // ── Session end detection ───────────────────────────────────────────────────
  useEffect(() => {
    if (prevRef.current && !activeSession) {
      const p = prevRef.current;
      const lbl = p.title?.startsWith('Auto:') ? p.title.replace('Auto:', '').trim() : p.title || p.category || 'Session';
      setJustEnded(true); setEndedSum({ elapsed: elapsedRef.current, label: lbl });
      setMinimized(false); setDropOpen(false); setShowNotes(false);
      clearTimeout(endTimer.current);
      endTimer.current = setTimeout(() => setJustEnded(false), 6000);
    }
    if (activeSession) {
      setJustEnded(false); setEndedSum(null);
      clearTimeout(endTimer.current);
      if (prevRef.current?.id !== activeSession.id) setLocalTaskName(null);
      prevRef.current = activeSession;
      if (dockCompact) setMinimized(true);
      isPausedRef.current = false;
      pauseStartMsRef.current = null;
      totalPausedMsRef.current = 0;
      setIsPaused(false);
    }
  }, [activeSession, dockCompact]);

  useEffect(() => () => clearTimeout(endTimer.current), []);

  // ── Music sync ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const sync = () => setMusicState(window.__flMusicState ? { ...window.__flMusicState } : null);
    window.addEventListener('fl-music-update', sync);
    return () => window.removeEventListener('fl-music-update', sync);
  }, []);

  // ── Note panel toggle ───────────────────────────────────────────────────────
  useEffect(() => {
    const h = () => setShowNotes(v => !v);
    window.addEventListener('fl-session-note', h);
    return () => window.removeEventListener('fl-session-note', h);
  }, []);

  // ── Outside click closes dropdown ───────────────────────────────────────────
  useEffect(() => {
    if (!dropOpen) return;
    const h = (e) => {
      if (dropRef.current && !dropRef.current.contains(e.target)) {
        setDropOpen(false); setDiscardConf(false);
      }
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [dropOpen]);

  const sendMusic     = useCallback((a) => window.dispatchEvent(new CustomEvent('fl-music-cmd', { detail: { action: a } })), []);
  const handleEnd     = useCallback(() => {
    setDropOpen(false);
    const pauseOffsetSecs = Math.floor(totalPausedMsRef.current / 1000);
    onStop?.(pauseOffsetSecs);
  }, [onStop]);
  const handleDiscard = useCallback(() => { setDropOpen(false); setDiscardConf(false); onStop?.(0); }, [onStop]);

  const handlePause = useCallback(() => {
    isPausedRef.current   = true;
    pauseStartMsRef.current = Date.now();
    setIsPaused(true);
  }, []);

  const handleResume = useCallback(() => {
    if (pauseStartMsRef.current) {
      totalPausedMsRef.current += Date.now() - pauseStartMsRef.current;
    }
    isPausedRef.current   = false;
    pauseStartMsRef.current = null;
    setIsPaused(false);
    setElapsed(e => e);
  }, []);

  const ms       = musicState;
  const sta      = ms?.station ?? null;
  const playing  = !!(ms?.playing && !ms?.loading);
  const aiState  = deriveState(activeSession, elapsed);
  const workflow = buildWorkflow(activeSession);
  const accent   = aiState?.color || '#7c6cf2';
  const glow     = aiState?.glow  || 'rgba(124,108,242,0.55)';
  const focusScore = useMemo(() => deriveFocusScore(aiState, elapsed), [aiState, elapsed]);
  const sessionGoalMinutes = activeSession?.goal_minutes || activeSession?.target_minutes || 45;
  const sessionGoalLabel = `${sessionGoalMinutes} min goal`;
  const [localTaskName, setLocalTaskName] = useState(null);
  const currentTaskLabel = localTaskName ?? workflow ?? 'Focus Session';
  const goalProgressPct = activeSession
    ? Math.min(100, Math.round((elapsed / (sessionGoalMinutes * 60)) * 100))
    : 0;

  // ── Per-theme surface tokens ─────────────────────────────────────────────────
  const DT = useMemo(() => makeDT(isLight, accent, glow), [isLight, accent, glow]);

  // ════════════════════════════════════════════════════════════════════════════
  // SCHEDULED SESSION PILL
  // ════════════════════════════════════════════════════════════════════════════
  if (false && scheduledSession && !activeSession && !justEnded) {
    return createPortal(
      <div className="fl-focus-dock-pill" style={{
        position: 'fixed', bottom: 20, ...pillPos,
        width: 'fit-content', maxWidth: 'calc(100vw - 40px)',
        zIndex: 9991, pointerEvents: 'all',
      }}>
        <div className="fl-focus-dock-bar" style={{
          ...GLASS, borderRadius: 16, height: 52, padding: '0 16px',
          display: 'flex', alignItems: 'center', gap: 11, minWidth: 320,
          border: `1px solid ${schedColor}28`,
          boxShadow: `0 20px 56px rgba(0,0,0,0.6), 0 4px 16px ${schedColor}10, inset 0 1px 0 rgba(255,255,255,0.055)`,
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'rgba(255,255,255,0.04)' }}>
            <div style={{ height: '100%', width: `${schedPct * 100}%`, background: `linear-gradient(90deg, ${schedColor}80, ${schedColor})`, transition: 'width 1s linear' }} />
          </div>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: schedColor, boxShadow: `0 0 10px ${schedColor}90`, animation: 'fl-dock-pulse-dot 2s ease-in-out infinite', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#E8EAF6', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{schedLabel}</span>
              <span style={{ fontSize: 8, fontWeight: 800, padding: '2px 5px', borderRadius: 4, background: `${schedColor}1E`, border: `1px solid ${schedColor}38`, color: schedColor, letterSpacing: '0.07em', textTransform: 'uppercase', flexShrink: 0 }}>Scheduled</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontFamily: '"SF Mono","Fira Code",monospace', fontSize: 11, fontWeight: 700, color: schedColor, fontVariantNumeric: 'tabular-nums' }}>{fmtTimer(schedElapsed)}</span>
              <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)' }}>·</span>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.32)', fontVariantNumeric: 'tabular-nums' }}>{fmtRemaining(schedRemain)}</span>
              {scheduledSession.project_name && (
                <><span style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)' }}>·</span><span style={{ fontSize: 10, color: 'rgba(255,255,255,0.32)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 90 }}>{scheduledSession.project_name}</span></>
              )}
            </div>
          </div>
          {schedPct >= 0.90 && (
            <span style={{ fontSize: 9.5, color: '#34D399', fontWeight: 600, padding: '3px 8px', borderRadius: 6, background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.18)', display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
              <Zap size={8} />Auto soon
            </span>
          )}
        </div>
      </div>,
      document.body
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // COMPLETION BANNER
  // ════════════════════════════════════════════════════════════════════════════
  if (false && justEnded && endedSum) {
    return createPortal(
      <div className="fl-focus-dock-pill" style={{
        position: 'fixed', bottom: 20, ...pillPos,
        width: 'fit-content', maxWidth: 'calc(100vw - 40px)',
        zIndex: 9991, pointerEvents: 'all',
      }}>
        <div className="fl-focus-dock-bar" style={{
          ...GLASS, borderRadius: 16, height: 52, padding: '0 16px',
          display: 'flex', alignItems: 'center', gap: 12, minWidth: 300,
          border: '1px solid rgba(52,211,153,0.22)',
          boxShadow: '0 20px 56px rgba(0,0,0,0.58), 0 4px 16px rgba(52,211,153,0.08), inset 0 1px 0 rgba(52,211,153,0.06)',
        }}>
          <div style={{ width: 32, height: 32, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(52,211,153,0.10)', border: '1px solid rgba(52,211,153,0.20)' }}>
            <CheckCircle size={15} style={{ color: '#34D399' }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#E4F5EF', marginBottom: 3 }}>Session complete</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, color: '#2E5045' }}>
              <span style={{ fontFamily: '"SF Mono","Fira Code",monospace', color: '#34D399', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmtTimer(endedSum.elapsed)}</span>
              <span style={{ color: '#1E3830' }}>·</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>{endedSum.label}</span>
            </div>
          </div>
          <button onClick={() => { clearTimeout(endTimer.current); setJustEnded(false); }}
            style={{ width: 26, height: 26, borderRadius: 8, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', color: '#1E3830', cursor: 'pointer', transition: 'all 0.13s' }}
            onMouseEnter={e => { e.currentTarget.style.color = '#34D399'; e.currentTarget.style.background = 'rgba(52,211,153,0.09)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#1E3830'; e.currentTarget.style.background = 'transparent'; }}>
            <X size={12} />
          </button>
        </div>
      </div>,
      document.body
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // MINIMIZED PILL
  // ════════════════════════════════════════════════════════════════════════════
  if (false && minimized && activeSession) {
    return createPortal(
      <div className="fl-focus-dock-pill" style={{
        position: 'fixed', bottom: 20, ...pillPos,
        width: 'fit-content', zIndex: 9991, pointerEvents: 'all',
      }}>
        <div className="fl-focus-dock-bar" style={{
          ...GLASS, borderRadius: 99, height: 38, padding: '0 13px',
          display: 'flex', alignItems: 'center', gap: 8,
          border: `1px solid ${accent}28`,
          boxShadow: `0 12px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.055)`,
        }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: accent, boxShadow: `0 0 8px ${glow}`, animation: 'fl-dock-pulse-dot 2.2s ease-in-out infinite', flexShrink: 0 }} />
          <span style={{ fontFamily: '"SF Mono","Fira Code","JetBrains Mono",monospace', fontSize: 14, fontWeight: 700, color: '#DDE2F4', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.3px' }}>
            {fmtTimer(elapsed)}
          </span>
          <span style={{ fontSize: 8, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', padding: '2px 6px', borderRadius: 4, background: `${accent}1A`, border: `1px solid ${accent}35`, color: accent }}>
            {aiState?.label || 'Active'}
          </span>
          <button onClick={() => setMinimized(false)} title="Expand"
            style={{ width: 22, height: 22, borderRadius: 6, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', color: '#1E2C42', cursor: 'pointer', transition: 'all 0.13s' }}
            onMouseEnter={e => { e.currentTarget.style.color = '#A89CF7'; e.currentTarget.style.background = 'rgba(124,108,242,0.12)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#1E2C42'; e.currentTarget.style.background = 'transparent'; }}>
            <ChevronUp size={11} />
          </button>
        </div>
      </div>,
      document.body
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // DROPDOWN MENU
  // ════════════════════════════════════════════════════════════════════════════
  const dropdown = dropOpen && (
    <div ref={dropRef} className="fl-focus-dock-dropdown" style={{
      position: 'absolute', bottom: 'calc(100% + 10px)', left: '50%', transform: 'translateX(-50%)',
      minWidth: 210, borderRadius: 14, overflow: 'hidden',
      background: DT.dropdownBg,
      border: `1px solid ${DT.dropdownBorder}`,
      boxShadow: DT.dropdownShadow,
      backdropFilter: 'blur(40px)', zIndex: 9998, padding: '4px 0',
    }}>
      <DropItem icon={<Coffee size={12} style={{ color: '#FBBF24' }} />} label="Take a Break"
        onClick={() => { setDropOpen(false); onTakeBreak?.(); }} />
      <DropItem icon={<Music size={12} style={{ color: '#A89CF7' }} />} label="Change Sound"
        onClick={() => { setDropOpen(false); onOpenMusic?.(); }} />
      <div style={{ height: 1, background: DT.dropDivider, margin: '3px 0' }} />
      {!discardConf ? (
        <DropItem icon={<Trash2 size={12} style={{ color: '#F87171' }} />} label="Discard Session" danger
          onClick={() => setDiscardConf(true)} />
      ) : (
        <div style={{ padding: '10px 14px 8px' }}>
          <p style={{ fontSize: 11, color: '#F87171', marginBottom: 9, lineHeight: 1.5 }}>
            Discard this session?<br /><span style={{ color: DT.dropSecText }}>Time will not be saved.</span>
          </p>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={handleDiscard} style={{ flex: 1, padding: '6px 0', borderRadius: 8, background: 'rgba(239,68,68,0.14)', border: '1px solid rgba(239,68,68,0.26)', color: '#F87171', fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'background 0.12s' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.24)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.14)'; }}>
              Discard
            </button>
            <button onClick={() => setDiscardConf(false)} style={{ flex: 1, padding: '6px 0', borderRadius: 8, background: DT.dropKeepBg, border: `1px solid ${DT.dropKeepBorder}`, color: DT.dropKeepColor, fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'background 0.12s' }}
              onMouseEnter={e => { e.currentTarget.style.background = DT.dropKeepHoverBg; }}
              onMouseLeave={e => { e.currentTarget.style.background = DT.dropKeepBg; }}>
              Keep
            </button>
          </div>
        </div>
      )}
    </div>
  );

  // ════════════════════════════════════════════════════════════════════════════
  // FULL DOCK — Premium glassmorphism floating command center
  // ════════════════════════════════════════════════════════════════════════════
  const dockPortal = createPortal(
    <div
      className="fl-focus-dock"
      style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        height: 68, width: '100%',
        overflow: 'visible', zIndex: 9990, pointerEvents: 'all',
      }}
    >
      {/* ── Ambient glow behind the bar (active accent colour) */}
      {activeSession && (
        <div aria-hidden style={{
          position: 'absolute', bottom: 0, left: '15%', right: '15%', height: 1,
          background: DT.ambientGlow, filter: 'blur(28px)',
          opacity: 0.45, pointerEvents: 'none', zIndex: 0,
        }} />
      )}

      <div
        className="fl-focus-dock-bar"
        style={{
          background: DT.barBg,
          backdropFilter: DT.barBackdrop,
          WebkitBackdropFilter: DT.barBackdrop,
          display: 'flex', alignItems: 'center',
          height: '100%', minHeight: 68, borderRadius: 0,
          borderTop: `1px solid ${DT.barBorder}`,
          borderLeft: 'none', borderRight: 'none', borderBottom: 'none',
          boxShadow: DT.barBoxShadow,
          position: 'relative', overflow: 'visible',
          transition: 'background 0.35s, border-color 0.5s ease, box-shadow 0.5s ease',
          zIndex: 1,
        }}
      >
        {/* ── Accent hairline ── */}
        <div aria-hidden style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 1,
          zIndex: 2, pointerEvents: 'none',
          background: activeSession ? DT.hairline : DT.hairlineIdle,
          transition: 'background 0.5s ease',
        }} />

        {/* ═══════════════════════════════════════════════════════════════════
            ZONE 1 — LEFT: Pulse · Timer · State badge · Task name
        ═══════════════════════════════════════════════════════════════════ */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 11,
          padding: '0 16px 0 20px', flex: '1 1 34%', minWidth: 0,
        }}>

          {/* Live pulse dot */}
          <div style={{
            width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
            background: activeSession ? DT.dotActive : DT.dotIdle,
            boxShadow: activeSession ? DT.dotActiveShadow : 'none',
            animation: activeSession ? 'fl-dock-pulse-dot 2.4s ease-in-out infinite' : 'none',
            transition: 'background 0.4s, box-shadow 0.4s',
          }} />

          {/* Text columns */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0, flex: 1 }}>

            {/* Col 1 — label + timer + badge */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
              <span style={{
                fontSize: 9.5, fontWeight: 500, letterSpacing: '0.01em', textTransform: 'uppercase',
                color: DT.sessionLabel, lineHeight: 1,
              }}>
                {activeSession ? 'Live Session' : 'No Session'}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  className={activeSession ? 'fl-dock-timer-live' : ''}
                  style={{
                    fontFamily: '"Inter","SF Pro Display",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
                    fontSize: 21, fontWeight: 700, letterSpacing: '-0.5px',
                    color: activeSession ? DT.timerActive : DT.timerIdle,
                    fontVariantNumeric: 'tabular-nums', lineHeight: 1,
                    transition: 'color 0.4s',
                  }}
                >
                  {fmtTimer(elapsed)}
                </span>
                {/* State / Paused badge */}
                {activeSession && (isPaused ? (
                  <span style={{
                    fontSize: 8, fontWeight: 700, textTransform: 'uppercase',
                    letterSpacing: '0.07em', lineHeight: 1,
                    padding: '2.5px 6px', borderRadius: 5,
                    background: DT.pausedBadgeBg,
                    border: `1px solid ${DT.pausedBadgeBorder}`,
                    color: DT.pausedBadgeColor, flexShrink: 0,
                  }}>
                    Paused
                  </span>
                ) : aiState ? (
                  <span style={{
                    fontSize: 8, fontWeight: 700, textTransform: 'uppercase',
                    letterSpacing: '0.07em', lineHeight: 1,
                    padding: '2.5px 6px', borderRadius: 5,
                    background: DT.stateBadgeBg(accent),
                    border: `1px solid ${DT.stateBadgeBorder(accent)}`,
                    color: DT.stateBadgeColor(accent), flexShrink: 0,
                    transition: 'background 0.4s, border-color 0.4s, color 0.4s',
                  }}>
                    {aiState.label}
                  </span>
                ) : null)}
              </div>
            </div>

            {/* Slim column separator */}
            {activeSession && (
              <div style={{
                width: 1, height: 26, flexShrink: 0,
                background: DT.colSep, alignSelf: 'center',
              }} />
            )}

            {/* Col 2 — current task (click to edit) */}
            {activeSession ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3.5, minWidth: 0 }}>
                <span style={{
                  fontSize: 9, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em',
                  color: DT.taskCaption, lineHeight: 1,
                }}>
                  Current Task
                </span>
                {editingTask ? (
                  <input
                    autoFocus
                    value={taskEditVal}
                    onChange={e => setTaskEditVal(e.target.value)}
                    onBlur={() => {
                      setEditingTask(false);
                      const trimmed = taskEditVal.trim();
                      if (trimmed) {
                        setLocalTaskName(trimmed);
                        window.dispatchEvent(new CustomEvent('fl-session-rename', { detail: { title: trimmed } }));
                      }
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') e.currentTarget.blur();
                      if (e.key === 'Escape') { setEditingTask(false); }
                    }}
                    style={{
                      fontSize: 12.5, fontWeight: 500, color: DT.taskText,
                      background: 'transparent',
                      border: 'none', borderBottom: `1px solid ${accent}66`,
                      outline: 'none', padding: '0 0 1px 0',
                      maxWidth: 220, lineHeight: 1,
                      fontFamily: 'inherit', width: 180,
                    }}
                  />
                ) : (
                  <span
                    title="Click to rename"
                    onClick={() => { setTaskEditVal(currentTaskLabel); setEditingTask(true); }}
                    style={{
                      fontSize: 12.5, fontWeight: 500, color: DT.taskText,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      maxWidth: 220, lineHeight: 1, cursor: 'text',
                    }}
                  >
                    {currentTaskLabel}
                  </span>
                )}
              </div>
            ) : (
              <span style={{ fontSize: 11, color: DT.readyText, fontWeight: 400 }}>
                Ready to focus
              </span>
            )}

          </div>
        </div>
        <ZoneSep color={DT.zoneSep} />

        {/* ═══════════════════════════════════════════════════════════════════
            ZONE 2 — CENTER: Goal · Progress bar · Score
        ═══════════════════════════════════════════════════════════════════ */}
        <div style={{
          flex: '1 1 32%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '0 16px', position: 'relative', minWidth: 0,
          opacity: activeSession ? 1 : 0.15,
          pointerEvents: activeSession ? 'all' : 'none',
          transition: 'opacity 0.35s',
        }}>
          {/* Glass progress pill */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 13,
            width: '100%', maxWidth: 370,
            padding: '8px 12px',
            background: DT.progressPillBg,
            border: `1px solid ${DT.progressPillBorder}`,
            borderRadius: 14,
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
          }}>
            {/* Goal label + value */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3.5, flexShrink: 0, minWidth: 96 }}>
              <span style={{
                fontSize: 8.5, fontWeight: 700, letterSpacing: '0.08em',
                textTransform: 'uppercase', color: DT.goalCaption,
              }}>
                Session Goal
              </span>
              <span style={{ fontSize: 12, fontWeight: 600, color: DT.goalValue, whiteSpace: 'nowrap' }}>
                {sessionGoalLabel}
              </span>
            </div>

            {/* Progress track */}
            <div style={{ flex: 1, minWidth: 80 }}>
              <div style={{
                height: 4, borderRadius: 99,
                background: DT.progressTrack,
                overflow: 'hidden',
              }}>
                <div style={{
                  width: `${goalProgressPct}%`, height: '100%', borderRadius: 99,
                  background: `linear-gradient(90deg, ${accent}CC, ${accent})`,
                  boxShadow: `0 0 8px ${glow}`,
                  transition: 'width 0.6s cubic-bezier(0.34,1.2,0.64,1)',
                }} />
              </div>
            </div>

            {/* Score badge */}
            {activeSession && focusScore !== null && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '4px 9px', borderRadius: 9,
                background: DT.scoreBadgeBg(accent),
                border: `1px solid ${DT.scoreBadgeBorder(accent)}`,
                flexShrink: 0,
              }}>
                <div style={{
                  width: 5, height: 5, borderRadius: '50%',
                  background: accent, boxShadow: `0 0 6px ${glow}`,
                  flexShrink: 0,
                  animation: 'fl-dock-pulse-dot 3.2s ease-in-out infinite',
                }} />
                <span style={{
                  fontSize: 11, fontWeight: 700, color: accent,
                  whiteSpace: 'nowrap', lineHeight: 1,
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {focusScore}%
                </span>
              </div>
            )}
          </div>
        </div>
        <ZoneSep color={DT.zoneSep} />

        {/* ═══════════════════════════════════════════════════════════════════
            ZONE 3 — RIGHT: [Music slot] · [Utility icons] · [Action buttons]

            Three-group layout:
              • Music slot  — flex: 1 1 0, min-width: 0  (fills remaining, shrinks)
              • Utility grp — flex: 0 0 auto             (note + chevron, never shrinks)
              • Action grp  — flex: 0 0 auto             (pause + end, never shrinks)

            The music pill has an explicit height (34px) matching the action buttons
            and a hard max-width (204px) so it never overflows into the controls.
        ═══════════════════════════════════════════════════════════════════ */}
        <div style={{
          display: 'flex', alignItems: 'center',
          padding: '0 18px 0 14px', flex: '1 1 34%', minWidth: 0,
          position: 'relative', overflow: 'visible',
        }}>

          {/* Dropdown is absolutely positioned relative to this container */}
          {dropdown}

          {/* ── GROUP 1: Music slot ─────────────────────────────────────────────
              Takes all leftover space. The pill inside is capped at 204px and
              clips gracefully; when there's no music only a 30px ghost btn shows.
          ────────────────────────────────────────────────────────────────────── */}
          <div style={{ flex: '1 1 0', minWidth: 0, display: 'flex', alignItems: 'center' }}>
            {sta ? (
              /* ── Active station pill ── */
              <div style={{
                display: 'flex', alignItems: 'center', gap: 4,
                height: 34,
                paddingLeft: 6, paddingRight: 6,
                borderRadius: 10,
                /* hard width cap — text area inside is flex-1 and will absorb compression */
                maxWidth: 260, minWidth: 34,
                background: DT.musicPillBg(sta.color),
                border: `1px solid ${DT.musicPillBorder(sta.color)}`,
                /* clip any content that cannot fit rather than expanding the dock */
                overflow: 'hidden',
                flexShrink: 1,
                transition: 'background 0.2s, border-color 0.2s',
              }}>

                {/* Station icon / loading spinner */}
                <div style={{
                  width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: DT.musicIconBg(sta.color),
                  border: `1px solid ${DT.musicIconBorder(sta.color)}`,
                  fontSize: 11.5, lineHeight: 1,
                }}>
                  {ms.loading
                    ? <div style={{ width: 8, height: 8, borderRadius: '50%', border: `1.5px solid transparent`, borderTopColor: sta.color, animation: 'fl-spin 0.75s linear infinite' }} />
                    : sta.emoji}
                </div>

                {/* Track info — consumes available width, marquees when overflowing */}
                {playing && (
                  <div style={{ flex: '1 1 0', minWidth: 0, overflow: 'hidden' }}>
                    <NowPlayingLabel text={sta.label} color={sta.color} sub={sta.desc} subColor={DT.musicSub} />
                  </div>
                )}

                {/* EQ bars — only while audio is playing */}
                {playing && <EqBars color={sta.color} />}

                {/* Play / pause toggle */}
                <GhostBtn
                  onClick={() => sendMusic('toggle')}
                  title={playing ? 'Pause music' : 'Play music'}
                  size={26}
                  hoverColor={sta.color}
                  hoverBg={`${sta.color}18`}
                  hoverBorderColor={`${sta.color}28`}
                >
                  {playing ? <Pause size={10} /> : <Play size={10} />}
                </GhostBtn>

                {/* Mute toggle */}
                <GhostBtn
                  onClick={() => sendMusic('mute')}
                  title={ms.muted ? 'Unmute' : 'Mute'}
                  size={26}
                  hoverColor={sta.color}
                  hoverBg={`${sta.color}18`}
                  hoverBorderColor={`${sta.color}28`}
                >
                  {ms.muted ? <VolumeX size={10} /> : <Volume2 size={10} />}
                </GhostBtn>

              </div>
            ) : (
              /* ── No station — compact ghost button ── */
              <GhostBtn
                onClick={() => onOpenMusic?.()}
                title="Ambient sound"
                size={30}
                hoverColor={DT.ghostHoverColor}
                hoverBg={DT.ghostHoverBg}
                hoverBorderColor={DT.ghostHoverBorder}
              >
                <Music size={13} />
              </GhostBtn>
            )}
          </div>

          {/* ── GROUP 2: Utility icons (note + more) ───────────────────────────
              Fixed size — never shrinks or grows.
              A slim internal separator before GROUP 3 breaks them visually.
          ────────────────────────────────────────────────────────────────────── */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 3,
            flexShrink: 0, marginLeft: 10,
          }}>

            {/* Session notes button with filled-dot indicator */}
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <GhostBtn
                onClick={() => setShowNotes(v => !v)}
                title={showNotes ? 'Close notes' : 'Session notes'}
                size={30}
                hoverColor={DT.ghostHoverColor}
                hoverBg={showNotes ? `${DT.ghostHoverBg}dd` : DT.ghostHoverBg}
                hoverBorderColor={DT.ghostHoverBorder}
              >
                <PenLine size={12} style={{ color: showNotes ? DT.ghostHoverColor : undefined }} />
              </GhostBtn>
              {activeSession?.notes && (
                <div style={{
                  position: 'absolute', top: 4, right: 4,
                  width: 5, height: 5, borderRadius: '50%',
                  background: DT.noteDot, boxShadow: DT.noteDotShadow,
                  pointerEvents: 'none',
                }} />
              )}
            </div>

            {/* More / overflow chevron */}
            <button
              onClick={() => { setDropOpen(v => !v); setDiscardConf(false); }}
              className="fl-dock-chevron-btn"
              style={{
                width: 24, height: 30, borderRadius: 8, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: dropOpen ? DT.chevronActiveBg : 'transparent',
                border: `1px solid ${dropOpen ? DT.chevronActiveBorder : 'transparent'}`,
                color: dropOpen ? DT.chevronActiveColor : DT.chevronColor,
                cursor: 'pointer', transition: 'all 0.13s ease',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.color = DT.chevronHoverColor;
                e.currentTarget.style.background = DT.chevronHoverBg;
                e.currentTarget.style.borderColor = DT.chevronHoverBorder;
              }}
              onMouseLeave={e => {
                e.currentTarget.style.color = dropOpen ? DT.chevronActiveColor : DT.chevronColor;
                e.currentTarget.style.background = dropOpen ? DT.chevronActiveBg : 'transparent';
                e.currentTarget.style.borderColor = dropOpen ? DT.chevronActiveBorder : 'transparent';
              }}
            >
              <ChevronDown size={12} style={{
                transition: 'transform 0.22s cubic-bezier(0.34,1.3,0.64,1)',
                transform: dropOpen ? 'rotate(180deg)' : 'none',
              }} />
            </button>

          </div>

          {/* ── Slim separator between utility and action groups ── */}
          <div aria-hidden style={{
            width: 1, height: 16, flexShrink: 0,
            background: DT.zoneSep, alignSelf: 'center', margin: '0 10px',
          }} />

          {/* ── GROUP 3: Action buttons (pause + end + minimize) ───────────────
              Fixed size — the most important controls, always fully visible.
              Height matches the dock height so there's no vertical shift.
          ────────────────────────────────────────────────────────────────────── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>

            {/* Pause / Resume */}
            {isPaused ? (
              <button
                onClick={handleResume}
                title="Resume session"
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  height: 34, paddingLeft: 14, paddingRight: 14, borderRadius: 10,
                  background: DT.resumeBg, border: `1px solid ${DT.resumeBorder}`,
                  color: DT.resumeColor, fontSize: 12.5, fontWeight: 700, letterSpacing: '-0.01em',
                  cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                  boxShadow: DT.resumeShadow,
                  transition: 'background 0.13s, box-shadow 0.13s, transform 0.09s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = DT.resumeHoverBg; e.currentTarget.style.boxShadow = DT.resumeHoverShadow; }}
                onMouseLeave={e => { e.currentTarget.style.background = DT.resumeBg; e.currentTarget.style.boxShadow = DT.resumeShadow; }}
                onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.95)'; }}
                onMouseUp={e => { e.currentTarget.style.transform = 'none'; }}
              >
                <Play size={11} fill="currentColor" strokeWidth={0} />
                Resume
              </button>
            ) : (
              <button
                onClick={handlePause}
                title="Pause session"
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  height: 34, paddingLeft: 14, paddingRight: 14, borderRadius: 10,
                  background: DT.pauseBg(accent), border: `1px solid ${DT.pauseBorder(accent)}`,
                  color: DT.pauseColor(accent), fontSize: 12.5, fontWeight: 700, letterSpacing: '-0.01em',
                  cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                  boxShadow: DT.pauseShadow(accent),
                  transition: 'background 0.13s, box-shadow 0.13s, transform 0.09s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = DT.pauseHoverBg(accent); e.currentTarget.style.boxShadow = DT.pauseHoverShadow(accent); }}
                onMouseLeave={e => { e.currentTarget.style.background = DT.pauseBg(accent); e.currentTarget.style.boxShadow = DT.pauseShadow(accent); }}
                onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.95)'; }}
                onMouseUp={e => { e.currentTarget.style.transform = 'none'; }}
              >
                <Pause size={11} fill="currentColor" strokeWidth={0} />
                Pause
              </button>
            )}

            {/* End Session */}
            <button
              onClick={handleEnd}
              title="End session"
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                height: 34, paddingLeft: 13, paddingRight: 13, borderRadius: 10,
                background: DT.endBg, border: `1px solid ${DT.endBorder}`,
                color: DT.endColor, fontSize: 12.5, fontWeight: 700,
                cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                boxShadow: DT.endShadow,
                transition: 'background 0.13s, border-color 0.13s, box-shadow 0.13s, transform 0.09s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = DT.endHoverBg; e.currentTarget.style.borderColor = DT.endHoverBorder; e.currentTarget.style.boxShadow = DT.endHoverShadow; }}
              onMouseLeave={e => { e.currentTarget.style.background = DT.endBg; e.currentTarget.style.borderColor = DT.endBorder; e.currentTarget.style.boxShadow = DT.endShadow; }}
              onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.95)'; }}
              onMouseUp={e => { e.currentTarget.style.transform = 'none'; }}
            >
              <Square size={11} />
              End Session
            </button>

          </div>

        </div>
      </div>
    </div>,
    document.body
  );

  return (
    <>
      {dockPortal}
      {showNotes && activeSession && (
        <SessionNotesModal
          session={activeSession}
          onClose={() => setShowNotes(false)}
        />
      )}
    </>
  );
}
