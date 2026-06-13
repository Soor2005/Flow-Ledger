import React, { useEffect, useState } from 'react';
import logoSrc from '../../assets/logo.png';

// Boot splash screen — shown once during initial app startup.
// Phases: enter (0ms) → progress (100ms) → exit (1600ms) → done (1950ms)
export default function AppLoader({ onComplete }) {
  const [phase, setPhase] = useState('enter');

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('progress'), 100);
    const t2 = setTimeout(() => setPhase('exit'), 1600);
    const t3 = setTimeout(() => onComplete?.(), 1950);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onComplete]);

  const isEnter = phase === 'enter';
  const isExit  = phase === 'exit';

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-bg-app"
      style={{
        opacity:        isExit ? 0 : 1,
        transition:     isExit ? 'opacity 0.35s ease-in' : undefined,
        pointerEvents:  isExit ? 'none' : undefined,
      }}
    >
      {/* Ambient radial glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          style={{
            position: 'absolute',
            left: '50%', top: '50%',
            width: 640, height: 640,
            transform: 'translate(-50%, -50%)',
            background: 'radial-gradient(circle, rgba(124,108,242,0.07) 0%, transparent 65%)',
            animation: 'fl-glow-pulse 4s ease-in-out infinite',
          }}
        />
      </div>

      {/* Logo + wordmark stack */}
      <div
        className="relative flex flex-col items-center gap-6"
        style={{
          opacity:    isEnter ? 0 : 1,
          transform:  isEnter ? 'translateY(12px) scale(0.96)' : 'translateY(0) scale(1)',
          transition: 'opacity 0.45s ease-out, transform 0.45s cubic-bezier(0.34,1.4,0.64,1)',
        }}
      >
        {/* Logo mark */}
        <div className="relative">
          {/* Glow halo */}
          <div
            style={{
              position: 'absolute', inset: 0,
              background: 'rgba(124,108,242,0.22)',
              filter: 'blur(26px)',
              transform: 'scale(1.7)',
              borderRadius: '50%',
            }}
          />
          {/* Glassmorphism logo box */}
          <div
            className="relative flex h-[72px] w-[72px] items-center justify-center overflow-hidden rounded-2xl"
            style={{
              background:  'linear-gradient(145deg, rgba(124,108,242,0.14), rgba(124,108,242,0.06))',
              boxShadow:   '0 0 0 1px rgba(124,108,242,0.28), 0 8px 32px rgba(124,108,242,0.2), inset 0 1px 0 rgba(255,255,255,0.09)',
              backdropFilter: 'blur(8px)',
            }}
          >
            <img
              src={logoSrc}
              alt="Flow Ledger"
              className="h-10 w-10 object-contain"
              draggable={false}
            />
          </div>
        </div>

        {/* App name */}
        <div
          className="flex flex-col items-center gap-1.5"
          style={{
            opacity:    isEnter ? 0 : 1,
            transform:  isEnter ? 'translateY(6px)' : 'translateY(0)',
            transition: 'opacity 0.4s ease-out 140ms, transform 0.4s ease-out 140ms',
          }}
        >
          <span
            className="text-[22px] font-semibold text-tx-primary"
            style={{ letterSpacing: '-0.025em' }}
          >
            Flow Ledger
          </span>
          <span className="text-sm text-tx-faint" style={{ letterSpacing: '0.01em' }}>
            Loading your workspace
          </span>
        </div>

        {/* Three-dot pulse indicator */}
        <div
          className="flex items-center gap-[6px]"
          style={{
            opacity:    isEnter ? 0 : 1,
            transition: 'opacity 0.4s ease-out 280ms',
          }}
        >
          {[0, 1, 2].map(i => (
            <div
              key={i}
              className="h-[5px] w-[5px] rounded-full bg-accent"
              style={{
                animation:      'fl-dot-bounce 1.4s ease-in-out infinite',
                animationDelay: `${i * 180}ms`,
                opacity: 0.65,
              }}
            />
          ))}
        </div>
      </div>

      {/* Bottom progress bar */}
      <div className="absolute bottom-0 left-0 right-0 h-[2px] overflow-hidden bg-brd-subtle">
        <div
          className="h-full rounded-full bg-accent"
          style={{
            width:      phase === 'progress' || phase === 'exit' ? '100%' : '0%',
            transition: 'width 1.35s cubic-bezier(0.4, 0, 0.2, 1)',
            boxShadow:  '0 0 10px rgba(124,108,242,0.75), 0 0 20px rgba(124,108,242,0.35)',
          }}
        />
      </div>
    </div>
  );
}
