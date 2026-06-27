import React, { useState, useEffect } from 'react';
import logoSrc from '../../assets/logo.png';

const api = window.electron || {};
export const isMac = api.platform === 'darwin';

// ─── macOS traffic-light controls (top-left, filled circles, glyph on hover) ──
// Exported so other top-bar/drag-region implementations (auth screens, the
// main dashboard navbar) can render the same native-feeling controls instead
// of duplicating markup.
export function MacControls() {
  const [hoverClose,    setHoverClose]    = useState(false);
  const [hoverMinimize, setHoverMinimize] = useState(false);
  const [hoverMaximize, setHoverMaximize] = useState(false);

  return (
    <div className="no-drag flex items-center gap-1.5">
      <button
        onClick={() => api.close?.()}
        onMouseEnter={() => setHoverClose(true)}
        onMouseLeave={() => setHoverClose(false)}
        className="flex h-3 w-3 items-center justify-center rounded-full transition"
        style={{ background: '#ff5f57', boxShadow: hoverClose ? '0 0 0 1px rgba(255,95,87,0.35)' : 'none' }}
        title="Close"
      >
        {hoverClose && <span className="text-[7px] font-bold leading-none text-red-950">x</span>}
      </button>
      <button
        onClick={() => api.minimize?.()}
        onMouseEnter={() => setHoverMinimize(true)}
        onMouseLeave={() => setHoverMinimize(false)}
        className="flex h-3 w-3 items-center justify-center rounded-full transition"
        style={{ background: '#febc2e', boxShadow: hoverMinimize ? '0 0 0 1px rgba(254,188,46,0.35)' : 'none' }}
        title="Minimize"
      >
        {hoverMinimize && <span className="text-[8px] font-bold leading-none text-yellow-950">-</span>}
      </button>
      <button
        onClick={() => api.maximize?.()}
        onMouseEnter={() => setHoverMaximize(true)}
        onMouseLeave={() => setHoverMaximize(false)}
        className="flex h-3 w-3 items-center justify-center rounded-full transition"
        style={{ background: '#28c840', boxShadow: hoverMaximize ? '0 0 0 1px rgba(40,200,64,0.35)' : 'none' }}
        title="Maximize"
      >
        {hoverMaximize && <span className="text-[7px] font-bold leading-none text-green-950">+</span>}
      </button>
    </div>
  );
}

// ─── Windows/Linux controls (top-right, square buttons, system glyphs) ───────
// Exported for reuse — see MacControls comment above.
export function WinControls({ height = 32 } = {}) {
  const [isMaximized, setIsMaximized] = useState(false);
  const [hovered, setHovered] = useState(null); // 'minimize' | 'maximize' | 'close' | null

  useEffect(() => {
    api.isMaximized?.().then(v => setIsMaximized(!!v)).catch(() => {});
    const unsub = api.onMaximizedChange?.((v) => setIsMaximized(!!v));
    return () => { if (typeof unsub === 'function') unsub(); };
  }, []);

  const btnStyle = (name) => ({
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 46, height, border: 'none',
    background: hovered === name
      ? (name === 'close' ? '#e81123' : 'rgba(255,255,255,0.08)')
      : 'transparent',
    color: hovered === 'close' && name === 'close' ? '#fff' : 'currentColor',
    cursor: 'pointer', transition: 'background 0.1s, color 0.1s',
  });

  return (
    <div className="no-drag flex items-stretch" style={{ height }}>
      <button
        onClick={() => api.minimize?.()}
        onMouseEnter={() => setHovered('minimize')}
        onMouseLeave={() => setHovered(null)}
        style={btnStyle('minimize')}
        title="Minimize"
        aria-label="Minimize"
      >
        <svg width="10" height="10" viewBox="0 0 10 10"><rect x="0" y="4.5" width="10" height="1" fill="currentColor" /></svg>
      </button>
      <button
        onClick={() => api.maximize?.()}
        onMouseEnter={() => setHovered('maximize')}
        onMouseLeave={() => setHovered(null)}
        style={btnStyle('maximize')}
        title={isMaximized ? 'Restore' : 'Maximize'}
        aria-label={isMaximized ? 'Restore' : 'Maximize'}
      >
        {isMaximized ? (
          <svg width="10" height="10" viewBox="0 0 10 10">
            <rect x="2.2" y="0.8" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="1" />
            <rect x="0.8" y="2.2" width="7" height="7" fill="#0d1117" stroke="currentColor" strokeWidth="1" />
          </svg>
        ) : (
          <svg width="10" height="10" viewBox="0 0 10 10"><rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1" /></svg>
        )}
      </button>
      <button
        onClick={() => api.close?.()}
        onMouseEnter={() => setHovered('close')}
        onMouseLeave={() => setHovered(null)}
        style={btnStyle('close')}
        title="Close"
        aria-label="Close"
      >
        <svg width="10" height="10" viewBox="0 0 10 10">
          <line x1="0.5" y1="0.5" x2="9.5" y2="9.5" stroke="currentColor" strokeWidth="1" />
          <line x1="9.5" y1="0.5" x2="0.5" y2="9.5" stroke="currentColor" strokeWidth="1" />
        </svg>
      </button>
    </div>
  );
}

export default function TitleBar() {
  return (
    <div className="fl-titlebar drag-region flex h-8 shrink-0 select-none items-center border-b border-brd-subtle bg-bg-sidebar/95 text-tx-muted">
      <div className="flex h-full items-center px-3">
        {isMac && <MacControls />}
      </div>

      <div className="flex flex-1 items-center justify-center gap-1.5">
        <img src={logoSrc} alt="" className="h-4 w-4 rounded object-contain" />
        <span className="text-[11px] font-semibold text-tx-muted">Flow Ledger</span>
      </div>

      <div className="flex h-full items-center justify-end" style={{ minWidth: isMac ? 56 : undefined }}>
        {!isMac && <WinControls />}
      </div>
    </div>
  );
}
