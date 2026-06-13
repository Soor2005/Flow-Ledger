import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X, Zap, Coffee, Moon, Activity, Code2, Globe, MessageSquare,
  PenLine, Terminal, AlertTriangle, Package, Mail, Monitor,
  CheckCircle2, Maximize2, Minimize2, Clock, Target, TrendingUp,
} from 'lucide-react';

const api = window.electron || {};
const callApi = (name, fallback, payload) => {
  const fn = api[name];
  return typeof fn === 'function' ? fn(payload) : Promise.resolve(fallback);
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function pad(n) { return String(n).padStart(2,'0'); }
function fmtTimer(s) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

function classifyApp(name = '') {
  const n = name.toLowerCase();
  if (/code|vscode|cursor|vim|neovim|intellij|xcode|pycharm|sublime/.test(n))
    return { type: 'deep',        label: 'Coding',  Icon: Code2,         color: '#6366f1' };
  if (/figma|sketch|photoshop|illustrator|canva|affinity/.test(n))
    return { type: 'deep',        label: 'Design',  Icon: PenLine,       color: '#a78bfa' };
  if (/word|docs|notion|obsidian|bear|typora/.test(n))
    return { type: 'deep',        label: 'Writing', Icon: PenLine,       color: '#34d399' };
  if (/terminal|iterm|warp|powershell|bash/.test(n))
    return { type: 'deep',        label: 'Terminal',Icon: Terminal,      color: '#f59e0b' };
  if (/chrome|firefox|safari|edge|brave|arc/.test(n))
    return { type: 'shallow',     label: 'Browser', Icon: Globe,         color: '#fb923c' };
  if (/slack|discord|teams|zoom|telegram|messages/.test(n))
    return { type: 'shallow',     label: 'Chat',    Icon: MessageSquare, color: '#fb923c' };
  if (/mail|outlook|gmail/.test(n))
    return { type: 'shallow',     label: 'Email',   Icon: Mail,          color: '#fb923c' };
  if (/youtube|netflix|spotify|twitch|tiktok/.test(n))
    return { type: 'distraction', label: 'Media',   Icon: AlertTriangle, color: '#ef4444' };
  if (/twitter|instagram|facebook|reddit/.test(n))
    return { type: 'distraction', label: 'Social',  Icon: AlertTriangle, color: '#ef4444' };
  return { type: 'neutral', label: 'Other', Icon: Package, color: '#A8B5B2' };
}

function scoreColor(s) {
  if (s >= 80) return '#4ade80';
  if (s >= 60) return '#facc15';
  if (s >= 40) return '#fb923c';
  return '#f87171';
}

// ─── Theme tokens ─────────────────────────────────────────────────────────────
function makeTheme(isLight) {
  return {
    overlay:       isLight ? '#F5F3FF' : '#07090F',
    topBarGrad:    isLight
      ? 'linear-gradient(to bottom, rgba(245,243,255,0.97) 0%, transparent 100%)'
      : 'linear-gradient(to bottom, rgba(7,9,15,0.90) 0%, transparent 100%)',
    ringTrack:     isLight ? '#E5DEFF' : '#1f2937',
    timerText:     isLight ? '#111827' : '#ffffff',
    mutedText:     isLight ? '#64748b' : '#73817F',
    softText:      isLight ? '#475569' : '#A8B5B2',
    sessionText:   isLight ? '#1e1b4b' : '#ffffff',
    pillBg:        isLight ? 'rgba(124,108,242,0.07)' : 'rgba(255,255,255,0.04)',
    pillBorder:    isLight ? 'rgba(124,108,242,0.18)' : 'rgba(255,255,255,0.07)',
    pillValue:     isLight ? '#111827' : '#ffffff',
    scoreBarBg:    isLight ? '#E5DEFF' : '#1f2937',
    exitBg:        isLight ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.06)',
    exitBgHover:   isLight ? '#EDE9FF'               : 'rgba(255,255,255,0.10)',
    exitBorder:    isLight ? 'rgba(124,108,242,0.25)' : 'rgba(255,255,255,0.10)',
    exitColor:     isLight ? '#374151'               : '#A8B5B2',
    exitColorHover:isLight ? '#111827'               : '#ffffff',
    kbdBg:         isLight ? '#EDE9FF'               : 'rgba(255,255,255,0.08)',
    kbdBorder:     isLight ? 'rgba(124,108,242,0.30)' : 'rgba(255,255,255,0.12)',
    kbdColor:      isLight ? '#4F46E5'               : '#A8B5B2',
    appPillBg:     isLight ? 'rgba(124,108,242,0.07)' : 'rgba(255,255,255,0.05)',
    appPillBorder: isLight ? 'rgba(124,108,242,0.18)' : 'rgba(255,255,255,0.08)',
    appPillText:   isLight ? '#4B5563'               : '#A8B5B2',
    orbOpacity:    isLight ? '0.55'                  : '1',
  };
}

// ─── Ambient orb background ───────────────────────────────────────────────────
function AmbientOrbs({ appClass, isIdle, T }) {
  const color1 = isIdle  ? '#374151'
    : appClass?.type === 'deep' ? (appClass.color || '#6366f1')
    : appClass?.type === 'distraction' ? '#ef4444'
    : '#6366f1';
  const color2 = isIdle ? '#1f2937'
    : appClass?.type === 'deep' ? '#8b5cf6'
    : '#7c6cf2';

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden"
         style={{ zIndex: 0, opacity: T.orbOpacity }}>
      <div style={{
        position: 'absolute', width: 600, height: 600,
        top: '-15%', left: '-10%',
        borderRadius: '50%',
        background: `radial-gradient(circle, ${color1}22 0%, transparent 70%)`,
        animation: 'orb-drift 12s ease-in-out infinite alternate',
        transition: 'background 1.5s ease',
      }}/>
      <div style={{
        position: 'absolute', width: 500, height: 500,
        bottom: '-10%', right: '-5%',
        borderRadius: '50%',
        background: `radial-gradient(circle, ${color2}18 0%, transparent 70%)`,
        animation: 'orb-drift 10s ease-in-out infinite alternate-reverse',
        transition: 'background 1.5s ease',
      }}/>
      <style>{`
        @keyframes orb-drift {
          0%   { transform: translate(0, 0) scale(1); }
          100% { transform: translate(40px, 30px) scale(1.08); }
        }
      `}</style>
    </div>
  );
}

// ─── Big progress ring ────────────────────────────────────────────────────────
function BigRing({ progress, elapsed, focusScore, appClass, isIdle, activeSession, T }) {
  const size = 380, sw = 14;
  const cx = size / 2, cy = size / 2;
  const R  = cx - sw - 6;
  const circ = 2 * Math.PI * R;
  const offset = circ - circ * Math.min(progress, 1);

  const grad1 = isIdle ? '#374151'
    : appClass?.type === 'deep'        ? (appClass.color || '#6366f1')
    : appClass?.type === 'distraction' ? '#ef4444'
    : '#7c6cf2';
  const grad2 = isIdle ? '#4B5563'
    : appClass?.type === 'deep'        ? '#8b5cf6'
    : appClass?.type === 'distraction' ? '#f97316'
    : '#a78bfa';

  const glowColor = isIdle ? '#73817F' : grad1;

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <defs>
          <linearGradient id="fm-ring-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor={grad1} />
            <stop offset="100%" stopColor={grad2} />
          </linearGradient>
        </defs>
        {/* Track */}
        <circle cx={cx} cy={cy} r={R} fill="none"
          stroke={T.ringTrack} strokeWidth={sw} />
        {/* Progress */}
        {activeSession && (
          <circle cx={cx} cy={cy} r={R} fill="none"
            stroke="url(#fm-ring-grad)"
            strokeWidth={sw}
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            style={{
              transition: 'stroke-dashoffset 1s linear',
              filter: `drop-shadow(0 0 12px ${glowColor}80)`,
            }}
          />
        )}
      </svg>

      {/* Centre content */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 8,
      }}>
        {isIdle ? (
          <>
            <Moon size={28} color={T.mutedText} />
            <span style={{ color: T.mutedText, fontSize: 14, fontWeight: 600 }}>Idle</span>
          </>
        ) : (
          <>
            <div style={{
              fontSize: activeSession ? 56 : 42,
              fontWeight: 700,
              color: T.timerText,
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: -2,
              lineHeight: 1,
              transition: 'font-size 0.3s ease',
            }}>
              {fmtTimer(elapsed)}
            </div>
            {activeSession && focusScore !== null && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <div style={{
                  width: 90, height: 4, borderRadius: 9999,
                  background: T.scoreBarBg, overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%', borderRadius: 9999,
                    width: `${focusScore}%`,
                    background: scoreColor(focusScore),
                    transition: 'width 1s ease, background 0.5s ease',
                  }}/>
                </div>
                <span style={{ fontSize: 12, color: scoreColor(focusScore), fontWeight: 600 }}>
                  {focusScore}
                </span>
              </div>
            )}
            {!activeSession && (
              <span style={{ fontSize: 14, color: T.mutedText }}>No active session</span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Stat pill ────────────────────────────────────────────────────────────────
function StatPill({ Icon, label, value, color, T }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
      background: T.pillBg,
      border: `1px solid ${T.pillBorder}`,
      borderRadius: 16, padding: '12px 20px', minWidth: 90,
      boxShadow: T.isLight ? '0 2px 12px rgba(124,108,242,0.08)' : 'none',
    }}>
      <Icon size={16} color={color || T.mutedText} />
      <span style={{ fontSize: 20, fontWeight: 700, color: T.pillValue, lineHeight: 1 }}>{value}</span>
      <span style={{ fontSize: 11, color: T.mutedText }}>{label}</span>
    </div>
  );
}

// ─── Main overlay ─────────────────────────────────────────────────────────────
export default function FocusModeOverlay({
  activeSession,
  elapsed,
  focusScore,
  isIdle,
  heartbeat,
  focusData,
  ringProgress,
  onClose,
}) {
  const [goal, setGoal] = useState(null);
  const [isLight, setIsLight] = useState(
    () => document.documentElement.classList.contains('theme-light')
  );

  // React to theme changes
  useEffect(() => {
    const obs = new MutationObserver(() => {
      setIsLight(document.documentElement.classList.contains('theme-light'));
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  const T = { ...makeTheme(isLight), isLight };

  const appClass = heartbeat?.appName ? classifyApp(heartbeat.appName) : null;

  useEffect(() => {
    callApi('listGoals', [], { userId: activeSession?.user_id }).then(gs => {
      const daily = (gs || []).find(g => g.type === 'daily' || g.period === 'daily');
      if (daily) setGoal(daily);
    }).catch(() => {});
  }, [activeSession]);

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') onClose?.();
      if (e.key === 'f' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); onClose?.(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const idlePct = focusData?.totalSecs > 0
    ? Math.round((focusData.idleSecs / focusData.totalSecs) * 100)
    : 0;
  const sessionLabel = activeSession?.title || activeSession?.category || 'Focus Session';

  const goalProgress = goal && elapsed > 0
    ? Math.min(Math.round(elapsed / 60) / (goal.target_minutes || 480) * 100, 100)
    : null;

  return (
    <div className="fl-focus-overlay" style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: T.overlay,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 32,
      overflow: 'hidden',
      transition: 'background 0.4s ease',
    }}>
      <AmbientOrbs appClass={appClass} isIdle={isIdle} T={T} />

      {/* ── Top bar ── */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 24px',
        background: T.topBarGrad,
        zIndex: 1,
      }}>
        {/* Session name */}
        <div className="fl-focus-overlay-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: activeSession ? '#4ade80' : T.mutedText,
            boxShadow: activeSession ? '0 0 8px #4ade8090' : 'none',
            animation: activeSession && !isIdle ? 'pulse-dot 2s infinite' : 'none',
          }}/>
          <span style={{ fontSize: 14, fontWeight: 600, color: T.sessionText }}>{sessionLabel}</span>
        </div>

        {/* Right: current app + close */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {heartbeat?.appName && !isIdle && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: T.appPillBg,
              border: `1px solid ${T.appPillBorder}`,
              borderRadius: 20, padding: '5px 12px',
            }}>
              {appClass && <appClass.Icon size={13} color={appClass.color} />}
              <span style={{ fontSize: 12, color: T.appPillText }}>{heartbeat.appName}</span>
            </div>
          )}
          {isIdle && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: T.appPillBg,
              border: `1px solid ${T.appPillBorder}`,
              borderRadius: 20, padding: '5px 12px',
            }}>
              <Moon size={13} color={T.mutedText}/>
              <span style={{ fontSize: 12, color: T.appPillText }}>Idle</span>
            </div>
          )}
          <button
            className="fl-focus-overlay-exit"
            onClick={onClose}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: T.exitBg,
              border: `1px solid ${T.exitBorder}`,
              borderRadius: 10, padding: '7px 12px', cursor: 'pointer',
              color: T.exitColor, fontSize: 12, transition: 'all 0.2s',
              boxShadow: isLight ? '0 2px 10px rgba(124,108,242,0.12)' : 'none',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = T.exitBgHover; e.currentTarget.style.color = T.exitColorHover; }}
            onMouseLeave={e => { e.currentTarget.style.background = T.exitBg;      e.currentTarget.style.color = T.exitColor; }}
          >
            <Minimize2 size={13}/>
            <span>Exit Focus</span>
            <kbd style={{
              background: T.kbdBg,
              border: `1px solid ${T.kbdBorder}`,
              color: T.kbdColor,
              borderRadius: 5, padding: '1px 5px', fontSize: 10,
            }}>ESC</kbd>
          </button>
        </div>
      </div>

      {/* ── Ring ── */}
      <div style={{ position: 'relative', zIndex: 1 }}>
        <BigRing
          progress={ringProgress}
          elapsed={elapsed}
          focusScore={focusScore}
          appClass={appClass}
          isIdle={isIdle}
          activeSession={!!activeSession}
          T={T}
        />
      </div>

      {/* ── Stats row ── */}
      <div style={{ display: 'flex', gap: 12, position: 'relative', zIndex: 1 }}>
        <StatPill Icon={Zap}      label="Focus"   value={`${focusScore}%`}         color={scoreColor(focusScore)} T={T} />
        <StatPill Icon={Activity} label="Switches" value={focusData?.switches ?? 0} color="#6366f1"               T={T} />
        <StatPill Icon={Clock}    label="Idle"    value={`${idlePct}%`}            color={idlePct > 30 ? '#f97316' : T.mutedText} T={T} />
        {goalProgress !== null && (
          <StatPill Icon={Target}    label="Goal"     value={`${Math.round(goalProgress)}%`} color="#4ade80" T={T} />
        )}
        {activeSession && (
          <StatPill Icon={TrendingUp} label="Deep Work"
            value={focusScore >= 70 && elapsed >= 25 * 60 ? '✓' : '—'}
            color={focusScore >= 70 && elapsed >= 25 * 60 ? '#4ade80' : T.mutedText} T={T} />
        )}
      </div>

      {/* ── Motivational line ── */}
      {!isIdle && activeSession && focusScore >= 70 && (
        <p style={{
          position: 'relative', zIndex: 1,
          fontSize: 13,
          color: isLight ? 'rgba(79,70,229,0.5)' : 'rgba(74,222,128,0.35)',
          letterSpacing: 0.3, fontStyle: 'italic',
          maxWidth: 400, textAlign: 'center',
          animation: 'fade-in-up 0.6s ease forwards',
        }}>
          Deep work in progress
        </p>
      )}

      {/* ── Distraction warning ── */}
      {appClass?.type === 'distraction' && activeSession && (
        <div style={{
          position: 'absolute', bottom: 40, zIndex: 1,
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'rgba(239,68,68,0.1)',
          border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: 12, padding: '10px 20px',
          animation: 'fade-in-up 0.4s ease',
        }}>
          <AlertTriangle size={14} color="#f87171" />
          <span style={{ fontSize: 12, color: isLight ? '#dc2626' : '#fca5a5' }}>
            Distraction detected — {heartbeat?.appName}
          </span>
        </div>
      )}

      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.4; }
        }
        @keyframes fade-in-up {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
