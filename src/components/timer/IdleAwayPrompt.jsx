import React from 'react';
import { Coffee, Clock, Check, X } from 'lucide-react';

function fmt(secs) {
  if (!secs || secs <= 0) return '0m';
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60);
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  return `${m}m`;
}

export default function IdleAwayPrompt({ awaySeconds, onSubtract, onKeep }) {
  const label = fmt(awaySeconds);
  return (
    <div className="absolute inset-x-0 bottom-0 z-20 p-3">
      <div className="rounded-xl border border-brd-hover bg-bg-card shadow-xl px-4 py-3 flex items-center gap-3"
        style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.06)' }}>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-status-amber/10">
          <Coffee size={15} className="text-status-amber" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-bold text-tx-primary">You were away for {label}</p>
          <p className="text-[10.5px] text-tx-muted">Subtract from this session?</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button onClick={onSubtract}
            className="flex items-center gap-1 rounded-lg bg-accent/10 px-2.5 py-1.5 text-[11px] font-bold text-accent hover:bg-accent/20 transition">
            <Check size={11} />Subtract {label}
          </button>
          <button onClick={onKeep}
            className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-tx-faint hover:bg-bg-hover transition">
            <X size={11} />Keep
          </button>
        </div>
      </div>
    </div>
  );
}
