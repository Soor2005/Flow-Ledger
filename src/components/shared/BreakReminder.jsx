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

export default function BreakReminder({ userId, onDismiss, onSessionChange, data = {} }) {
  const [tip]        = useState(() => BREAK_TIPS[Math.floor(Math.random() * BREAK_TIPS.length)]);
  const [duration,   setDuration]   = useState(data.duration || 17);
  const [elapsed,    setElapsed]    = useState(0);
  const [isBreaking, setIsBreaking] = useState(false);
  const timerRef     = useRef(null);
  const sessionIdRef = useRef(null); // track the open break session so we can stop it

  const activeMins = data.activeMins || 0;
  const intensity  = data.intensity  || 0;

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

  const pad = (n) => String(n).padStart(2, '0');
  const remaining = duration * 60 - elapsed;
  const breakPct  = elapsed / (duration * 60);
  const intColor  = intensity >= 70 ? '#f59e0b' : intensity >= 40 ? '#10b981' : '#6366f1';

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm"/>

      <div className="relative z-10 w-[440px] bg-bg-card border border-brd-strong rounded-2xl overflow-hidden shadow-2xl scale-in">
        {/* Top gradient bar */}
        <div className="h-1.5 w-full bg-gradient-to-r from-accent via-purple-500 to-blue-500"/>

        <div className="p-7">
          {/* Icon */}
          <div className="flex items-center justify-center mb-5">
            <div className="w-16 h-16 rounded-2xl bg-teal-500/15 border border-teal-500/25 flex items-center justify-center relative">
              <Coffee size={28} className="text-teal-400"/>
              {/* Intensity badge */}
              {intensity > 0 && (
                <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold" style={{background: intColor}}>
                  {intensity >= 70 ? '🔥' : '✅'}
                </div>
              )}
            </div>
          </div>

          {/* Text */}
          <h2 className="text-xl font-bold text-white text-center mb-1">Time for a break</h2>
          {activeMins > 0 && (
            <p className="text-sm text-center mb-1">
              <span className="font-semibold" style={{color: intColor}}>You've been working for {activeMins} minutes</span>
              <span className="text-tx-secondary"> straight.</span>
            </p>
          )}
          <p className="text-xs text-tx-secondary text-center mb-5">
            Regular breaks boost deep work quality and reduce mental fatigue.
          </p>

          {/* Intensity meter */}
          {intensity > 0 && (
            <div className="mb-4 bg-bg-app border border-brd-default rounded-xl px-4 py-3">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  <Flame size={11} className="text-amber-400"/>
                  <span className="text-[10px] text-tx-secondary">Work intensity this session</span>
                </div>
                <span className="text-[10px] font-bold" style={{color: intColor}}>{intensity}%</span>
              </div>
              <div className="h-1.5 bg-brd-default rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700"
                  style={{width:`${intensity}%`, background:`linear-gradient(90deg,${intColor}80,${intColor})`}}/>
              </div>
            </div>
          )}

          {/* Tip */}
          <div className="flex items-center gap-2 bg-bg-hover rounded-xl px-4 py-3 mb-5">
            <span className="text-base">💡</span>
            <span className="text-xs text-tx-secondary">{tip}</span>
          </div>

          {!isBreaking ? (
            <>
              {/* Break duration */}
              <div className="mb-5">
                <p className="text-[10px] text-tx-faint uppercase tracking-widest font-medium mb-2 text-center">Break duration</p>
                <div className="flex gap-2 justify-center">
                  {[5, 10, 17, 30].map(mins => (
                    <button key={mins} onClick={()=>setDuration(mins)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                        duration===mins ? 'bg-accent text-white' : 'bg-bg-hover text-tx-secondary hover:text-white hover:bg-brd-default'
                      }`}>
                      {mins}m
                    </button>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="space-y-2">
                <button onClick={startBreak}
                  className="w-full flex items-center justify-center gap-2 bg-accent hover:bg-teal-500 text-white font-semibold py-3 rounded-xl transition-all text-sm">
                  <Coffee size={15}/>Start {duration}-minute break
                </button>
                <div className="flex gap-2">
                  <button onClick={snooze}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-bg-hover hover:bg-brd-default text-tx-secondary hover:text-white py-2.5 rounded-xl transition-all text-sm">
                    <Clock size={13}/>Snooze 10m
                  </button>
                  <button onClick={dismiss}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-bg-hover hover:bg-brd-default text-tx-secondary hover:text-white py-2.5 rounded-xl transition-all text-sm">
                    <X size={13}/>Dismiss
                  </button>
                </div>
              </div>
            </>
          ) : (
            /* Break in progress */
            <div className="text-center space-y-4">
              <div className="relative w-24 h-24 mx-auto">
                {/* SVG ring — absolutely positioned so the text overlay stacks on top cleanly */}
                <svg viewBox="0 0 96 96" className="absolute inset-0 w-full h-full" style={{transform:'rotate(-90deg)'}}>
                  <circle cx="48" cy="48" r="40" fill="none" stroke="#263438" strokeWidth="6"/>
                  <circle cx="48" cy="48" r="40" fill="none" stroke="#10b981" strokeWidth="6"
                    strokeDasharray={`${breakPct * 251.2} 251.2`} strokeLinecap="round"
                    style={{filter:'drop-shadow(0 0 6px #10b98160)'}}/>
                </svg>
                {/* Timer text — centred via flex on the same 96×96 box */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-xl font-bold text-white font-mono leading-none">
                    {pad(Math.floor(remaining/60))}:{pad(remaining%60)}
                  </span>
                </div>
              </div>
              <p className="text-sm font-semibold text-green-400">Break in progress ✓</p>
              <p className="text-xs text-tx-faint">Relax — the timer will close automatically when done.</p>
              <button onClick={dismiss} className="text-xs text-tx-faint hover:text-white transition-colors">
                End break early
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-brd-default bg-bg-app px-6 py-3 flex items-center justify-center gap-2">
          <Zap size={11} className="text-amber-400"/>
          <span className="text-[10px] text-tx-faint">Regular breaks increase deep work output by up to 40%</span>
        </div>
      </div>
    </div>
  );
}
