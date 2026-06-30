import React, { useState, useEffect, useRef } from 'react';
import { Coffee, X, Clock, Zap, Flame } from 'lucide-react';

const api = window.electron || {};

const BREAK_TIPS = [
  "Stand up and stretch for 2 minutes",
  "Look at something 20 feet away for 20 seconds (20-20-20 rule)",
  "Drink a glass of water",
  "Take 10 slow, deep breaths",
  "Walk around for a few minutes",
  "Close your eyes and rest for 1 minute",
  "Do shoulder rolls and neck stretches",
  "Step outside for fresh air",
  "Do 10 jumping jacks or a quick walk",
];

// ─── Theme detection — mirrors the pattern used by SessionDetailPopup /
// SessionNotesModal: watch the root <html> class instead of relying on
// Tailwind's `dark:` variant, since the app toggles theme via a class swap.
function useThemeLight() {
  const [isLight, setIsLight] = useState(() => document.documentElement.classList.contains('theme-light'));
  useEffect(() => {
    const obs = new MutationObserver(() => setIsLight(document.documentElement.classList.contains('theme-light')));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  return isLight;
}

// ─── Per-theme palette — only the values that can't be expressed as static
// Tailwind utility pairs (gradients, shadows, SVG strokes) live here.
function makePalette(isLight) {
  if (isLight) return {
    backdrop:     'radial-gradient(circle at 50% 35%, rgba(124,108,242,0.10), rgba(176,166,224,0.40) 65%)',
    cardBg:       'linear-gradient(165deg, #FFFFFF 0%, #FAF8FF 55%, #F4F1FF 100%)',
    cardBorder:   '1px solid rgba(107,92,242,0.16)',
    cardShadow:   '0 28px 70px rgba(83,71,199,0.18), 0 0 0 1px rgba(107,92,242,0.08), inset 0 1px 0 rgba(255,255,255,0.7)',
    iconBg:       'rgba(124,108,242,0.10)',
    iconBorder:   '1px solid rgba(124,108,242,0.22)',
    iconColor:    '#5347C7',
    badgeRing:    'rgba(255,255,255,0.98)',
    panelBg:      'rgba(107,92,242,0.05)',
    panelBorder:  '1px solid rgba(107,92,242,0.10)',
    track:        'rgba(107,92,242,0.08)',
    ringTrack:    'rgba(26,23,48,0.10)',
    footerBorder: '1px solid rgba(107,92,242,0.10)',
    footerBg:     'rgba(107,92,242,0.04)',
    heading:      '#1A1730',
    sub:          'rgba(26,23,48,0.55)',
    faint:        'rgba(26,23,48,0.45)',
    faint2:       'rgba(26,23,48,0.60)',
    faint3:       'rgba(26,23,48,0.42)',
    faint4:       'rgba(26,23,48,0.36)',
  };
  return {
    backdrop:     'radial-gradient(circle at 50% 35%, rgba(124,108,242,0.16), rgba(4,6,13,0.74) 65%)',
    cardBg:       'linear-gradient(165deg, rgba(20,18,36,0.97) 0%, rgba(13,12,22,0.99) 60%, rgba(10,9,16,0.99) 100%)',
    cardBorder:   '1px solid rgba(255,255,255,0.08)',
    cardShadow:   '0 28px 70px rgba(0,0,0,0.55), 0 0 0 1px rgba(124,108,242,0.10), inset 0 1px 0 rgba(255,255,255,0.04)',
    iconBg:       'rgba(124,108,242,0.12)',
    iconBorder:   '1px solid rgba(124,108,242,0.25)',
    iconColor:    '#A89CF7',
    badgeRing:    'rgba(13,12,22,0.97)',
    panelBg:      'rgba(255,255,255,0.03)',
    panelBorder:  '1px solid rgba(255,255,255,0.06)',
    track:        'rgba(255,255,255,0.06)',
    ringTrack:    'rgba(255,255,255,0.08)',
    footerBorder: '1px solid rgba(255,255,255,0.06)',
    footerBg:     'rgba(0,0,0,0.20)',
    heading:      '#FFFFFF',
    sub:          'rgba(255,255,255,0.45)',
    faint:        'rgba(255,255,255,0.40)',
    faint2:       'rgba(255,255,255,0.55)',
    faint3:       'rgba(255,255,255,0.35)',
    faint4:       'rgba(255,255,255,0.30)',
  };
}

export default function BreakReminder({ userId, onDismiss, onSessionChange, data = {} }) {
  const isLight = useThemeLight();
  const t = makePalette(isLight);
  const [tip]        = useState(() => BREAK_TIPS[Math.floor(Math.random() * BREAK_TIPS.length)]);
  const [duration,   setDuration]   = useState(data.duration || 17);
  const [elapsed,    setElapsed]    = useState(0);
  const [isBreaking, setIsBreaking] = useState(false);
  const [visible,    setVisible]    = useState(false);
  const timerRef     = useRef(null);
  const sessionIdRef = useRef(null); // track the open break session so we can stop it

  const activeMins = data.activeMins || 0;
  const intensity  = data.intensity  || 0;

  // Mount-triggered entrance (lets the scale/opacity transition actually run
  // instead of snapping in at full size).
  useEffect(() => { requestAnimationFrame(() => setVisible(true)); }, []);

  // Cleanup: stop any open break session when the component unmounts mid-break
  useEffect(() => {
    return () => {
      clearInterval(timerRef.current);
      if (sessionIdRef.current) {
        api.stopSession?.({ sessionId: sessionIdRef.current }).catch(() => {});
        sessionIdRef.current = null;
        onSessionChange?.();
      }
    };
  }, []);

  const stopBreakSession = async () => {
    clearInterval(timerRef.current);
    if (sessionIdRef.current) {
      await api.stopSession?.({ sessionId: sessionIdRef.current }).catch(() => {});
      sessionIdRef.current = null;
      onSessionChange?.();
    }
  };

  const startBreak = async () => {
    const res = await api.startSession?.({ userId, category: 'Break', title: 'Scheduled Break', sessionType: 'break' });
    sessionIdRef.current = res?.id ?? null;
    onSessionChange?.();
    setIsBreaking(true);
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    // Auto-dismiss when break is over — stop session first
    setTimeout(async () => {
      await stopBreakSession();
      onDismiss?.();
    }, duration * 60 * 1000);
  };

  const snooze = async () => {
    await stopBreakSession();
    await api.dismissBreak?.({ userId, snoozeMins: 10 });
    onDismiss?.();
  };

  const dismiss = async () => {
    await stopBreakSession();
    await api.dismissBreak?.({ userId });
    onDismiss?.();
  };

  // Esc to dismiss — matches the rest of the app's panel/modal convention.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') dismiss(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const pad = (n) => String(n).padStart(2, '0');
  const remaining = duration * 60 - elapsed;
  const breakPct  = elapsed / (duration * 60);
  const intColor  = intensity >= 70 ? '#FBBF24' : intensity >= 40 ? '#34D399' : '#7C6CF2';
  const intLabel  = intensity >= 70 ? 'High-intensity' : intensity >= 40 ? 'Focused' : 'Light';

  const pillClass = isLight
    ? 'bg-[rgba(107,92,242,0.06)] text-[rgba(26,23,48,0.62)] hover:bg-[rgba(107,92,242,0.13)] hover:text-[#1A1730]'
    : 'bg-white/[0.04] text-white/50 hover:bg-white/[0.08] hover:text-white';
  const closeClass = isLight
    ? 'text-[rgba(26,23,48,0.35)] hover:bg-[rgba(26,23,48,0.06)] hover:text-[#1A1730]'
    : 'text-white/35 hover:bg-white/[0.06] hover:text-white';
  const durationOffClass = isLight
    ? 'bg-[rgba(107,92,242,0.06)] text-[rgba(26,23,48,0.55)] hover:bg-[rgba(107,92,242,0.13)] hover:text-[#1A1730]'
    : 'bg-white/[0.04] text-white/50 hover:bg-white/[0.08] hover:text-white';

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) dismiss(); }}
    >
      {/* Backdrop — soft tint, not a hard black overlay, so the app underneath
          still reads as "alive" rather than fully obscured. */}
      <div
        className="absolute inset-0 transition-opacity duration-300"
        style={{
          background: t.backdrop,
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          opacity: visible ? 1 : 0,
        }}
      />

      <div
        className="relative z-10 w-[440px] max-w-[calc(100vw-32px)] overflow-hidden rounded-[22px]"
        style={{
          background: t.cardBg,
          border: t.cardBorder,
          boxShadow: t.cardShadow,
          transform: visible ? 'scale(1) translateY(0)' : 'scale(0.96) translateY(8px)',
          opacity: visible ? 1 : 0,
          transition: 'transform 280ms cubic-bezier(0.16,1,0.3,1), opacity 240ms ease',
        }}
      >
        {/* Top accent bar — on-brand gradient, identical across themes */}
        <div className="h-[3px] w-full bg-gradient-to-r from-accent via-accent-light to-status-blue" />

        {/* Close (X) — top-right, always reachable without scrolling to the footer */}
        <button
          onClick={dismiss}
          className={`absolute right-3.5 top-4 z-10 rounded-lg p-1.5 transition ${closeClass}`}
          aria-label="Dismiss"
        >
          <X size={15} />
        </button>

        <div className="px-7 pb-7 pt-8">
          {/* Icon */}
          <div className="mb-5 flex items-center justify-center">
            <div
              className="relative flex h-16 w-16 items-center justify-center rounded-2xl"
              style={{ background: t.iconBg, border: t.iconBorder }}
            >
              <Coffee size={26} style={{ color: t.iconColor }} />
              {intensity > 0 && (
                <div
                  className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold shadow-md"
                  style={{ background: intColor, boxShadow: `0 0 0 3px ${t.badgeRing}` }}
                >
                  {intensity >= 70 ? '🔥' : '✅'}
                </div>
              )}
            </div>
          </div>

          {/* Text */}
          <h2 className="mb-1 text-center text-[19px] font-bold tracking-tight" style={{ color: t.heading }}>Time for a break</h2>
          {activeMins > 0 && (
            <p className="mb-1 text-center text-[13px]">
              <span className="font-semibold" style={{ color: intColor }}>You've been working for {activeMins} minutes</span>
              <span style={{ color: t.sub }}> straight.</span>
            </p>
          )}
          <p className="mb-5 text-center text-[11.5px] leading-relaxed" style={{ color: t.faint }}>
            Regular breaks boost deep work quality and reduce mental fatigue.
          </p>

          {/* Intensity meter */}
          {intensity > 0 && (
            <div className="mb-4 rounded-xl px-4 py-3" style={{ background: t.panelBg, border: t.panelBorder }}>
              <div className="mb-1.5 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Flame size={11} className="text-status-amber" />
                  <span className="text-[10px] font-medium" style={{ color: t.faint2 }}>{intLabel} session</span>
                </div>
                <span className="text-[10px] font-bold" style={{ color: intColor }}>{intensity}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full" style={{ background: t.track }}>
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${intensity}%`, background: `linear-gradient(90deg, ${intColor}80, ${intColor})` }}
                />
              </div>
            </div>
          )}

          {/* Tip */}
          <div className="mb-5 flex items-center gap-2.5 rounded-xl px-4 py-3" style={{ background: t.panelBg }}>
            <span className="shrink-0 text-base">💡</span>
            <span className="text-[12px] leading-snug" style={{ color: t.faint2 }}>{tip}</span>
          </div>

          {!isBreaking ? (
            <>
              {/* Break duration */}
              <div className="mb-5">
                <p className="mb-2 text-center text-[10px] font-semibold uppercase tracking-widest" style={{ color: t.faint4 }}>Break duration</p>
                <div className="flex justify-center gap-2">
                  {[5, 10, 17, 30].map(mins => (
                    <button
                      key={mins}
                      onClick={() => setDuration(mins)}
                      className={`rounded-lg px-4 py-2 text-[13px] font-semibold transition-all ${
                        duration === mins
                          ? 'bg-accent text-white shadow-[0_4px_14px_rgba(124,108,242,0.35)]'
                          : durationOffClass
                      }`}
                    >
                      {mins}m
                    </button>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="space-y-2">
                <button
                  onClick={startBreak}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-accent to-accent-light py-3 text-[13px] font-bold text-white shadow-[0_8px_24px_rgba(124,108,242,0.30)] transition-transform hover:scale-[1.01] active:scale-[0.99]"
                >
                  <Coffee size={15} />Start {duration}-minute break
                </button>
                <div className="flex gap-2">
                  <button
                    onClick={snooze}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-[12.5px] font-semibold transition ${pillClass}`}
                  >
                    <Clock size={13} />Snooze 10m
                  </button>
                  <button
                    onClick={dismiss}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-[12.5px] font-semibold transition ${pillClass}`}
                  >
                    <X size={13} />Dismiss
                  </button>
                </div>
              </div>
            </>
          ) : (
            /* Break in progress */
            <div className="space-y-4 text-center">
              <div className="relative mx-auto h-24 w-24">
                <svg viewBox="0 0 96 96" className="absolute inset-0 h-full w-full" style={{ transform: 'rotate(-90deg)' }}>
                  <circle cx="48" cy="48" r="40" fill="none" stroke={t.ringTrack} strokeWidth="6" />
                  <circle
                    cx="48" cy="48" r="40" fill="none" stroke="#34D399" strokeWidth="6"
                    strokeDasharray={`${breakPct * 251.2} 251.2`} strokeLinecap="round"
                    style={{ filter: 'drop-shadow(0 0 6px rgba(52,211,153,0.45))', transition: 'stroke-dasharray 1s linear' }}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="font-mono text-xl font-bold leading-none" style={{ color: t.heading }}>
                    {pad(Math.floor(remaining / 60))}:{pad(remaining % 60)}
                  </span>
                </div>
              </div>
              <p className="text-[13px] font-semibold text-status-green">Break in progress ✓</p>
              <p className="text-[11.5px]" style={{ color: t.faint3 }}>Relax — the timer will close automatically when done.</p>
              <button onClick={dismiss} className="text-[11.5px] transition-colors hover:opacity-80" style={{ color: t.faint3 }}>
                End break early
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-center gap-2 px-6 py-3" style={{ borderTop: t.footerBorder, background: t.footerBg }}>
          <Zap size={11} className="text-status-amber" />
          <span className="text-[10px]" style={{ color: t.faint4 }}>Regular breaks increase deep work output by up to 40%</span>
        </div>
      </div>
    </div>
  );
}
