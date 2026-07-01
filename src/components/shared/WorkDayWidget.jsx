import React, { useState, useEffect, useCallback } from 'react';
import { Sun, Clock, TrendingUp, AlertTriangle, Moon } from 'lucide-react';

const api = window.electron || {};

function fmt(secs) {
  if (!secs || secs <= 0) return '0m';
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60);
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  return `${m}m`;
}
function fmtTime(unix) {
  if (!unix) return '';
  return new Date(unix * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
}

export default function WorkDayWidget({ user }) {
  const [status, setStatus] = useState(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    try {
      const s = await api.workdayStatus?.({ userId: user.id });
      setStatus(s || null);
    } catch {}
  }, [user?.id]);

  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [load]);

  if (!status?.started) return null;

  const { startedAt, totalSec = 0, targetSec = 28800, overtimeSec = 0 } = status;
  const pct      = Math.min(100, Math.round((totalSec / targetSec) * 100));
  const isOver   = overtimeSec > 0;
  const estEndTs = startedAt + targetSec;

  const barColor   = isOver ? '#f87171' : pct >= 80 ? '#4ade80' : '#7c6cf2';
  const labelColor = isOver ? '#f87171' : '#94a3b8';

  return (
    <div className="fl-card overflow-hidden">
      <div style={{ height: 2, background: `linear-gradient(90deg, ${barColor}, ${barColor}44)` }} />
      <div className="px-4 py-3 flex items-center gap-4">

        {/* Icon */}
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
          style={{ background: `${barColor}14` }}>
          {isOver
            ? <AlertTriangle size={14} style={{ color: barColor }} />
            : <Sun size={14} style={{ color: barColor }} />}
        </div>

        {/* Start + elapsed */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-tx-faint">Work Day</p>
            {isOver && (
              <span className="rounded px-1.5 py-0.5 text-[9px] font-bold"
                style={{ background: '#f8717120', color: '#f87171' }}>
                +{fmt(overtimeSec)} overtime
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-tx-muted">
              Started <span className="font-semibold text-tx-secondary">{fmtTime(startedAt)}</span>
            </span>
            <span className="text-[11px] font-bold text-tx-primary">{fmt(totalSec)} worked</span>
            {!isOver && (
              <span className="text-[11px] text-tx-muted">
                Est. done <span className="font-semibold text-tx-secondary">{fmtTime(estEndTs)}</span>
              </span>
            )}
          </div>
        </div>

        {/* Progress ring */}
        <div className="shrink-0 flex items-center gap-2">
          <div className="relative h-9 w-9">
            <svg width="36" height="36" viewBox="0 0 36 36" style={{ transform: 'rotate(-90deg)' }}>
              <circle cx="18" cy="18" r="14" fill="none" stroke="var(--color-bg-hover)" strokeWidth="3.5" />
              <circle cx="18" cy="18" r="14" fill="none" stroke={barColor} strokeWidth="3.5"
                strokeDasharray={`${(pct / 100) * 87.96} 87.96`} strokeLinecap="round"
                style={{ transition: 'stroke-dasharray 0.8s ease' }} />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold"
              style={{ color: barColor }}>{pct}%</span>
          </div>
        </div>

      </div>
    </div>
  );
}
