import React, { useState } from 'react';
import logoSrc from '../../assets/logo.png';

const api = window.electron || {};

export default function TitleBar() {
  const [hoverClose, setHoverClose] = useState(false);
  const [hoverMinimize, setHoverMinimize] = useState(false);
  const [hoverMaximize, setHoverMaximize] = useState(false);

  return (
    <div className="fl-titlebar drag-region flex h-8 shrink-0 select-none items-center border-b border-brd-subtle bg-bg-sidebar/95 px-3">
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

      <div className="flex flex-1 items-center justify-center gap-1.5">
        <img src={logoSrc} alt="" className="h-4 w-4 rounded object-contain" />
        <span className="text-[11px] font-semibold text-tx-muted">Flow Ledger</span>
      </div>

      <div className="w-14" />
    </div>
  );
}
