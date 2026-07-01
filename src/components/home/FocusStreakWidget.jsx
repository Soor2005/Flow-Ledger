import React, { useState, useEffect } from 'react';
import { Flame } from 'lucide-react';

const api = window.electron || {};

export default function FocusStreakWidget({ user }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!user?.id) return;
    api.statsFocusStreak?.({ userId: user.id }).then(setData).catch(() => {});
  }, [user?.id]);

  if (!data || (data.currentStreak === 0 && data.longestStreak === 0)) return null;

  const { currentStreak, longestStreak } = data;
  const color = currentStreak >= 7 ? '#f59e0b' : currentStreak >= 3 ? '#f97316' : '#ef4444';

  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-brd-default bg-bg-card px-3.5 py-2.5">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
        style={{ background: `${color}18` }}>
        <Flame size={15} style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-tx-faint">Focus Streak</p>
        <p className="text-[13px] font-bold leading-tight">
          <span style={{ color }}>{currentStreak}</span>
          <span className="text-tx-faint font-normal text-[11px]"> day{currentStreak !== 1 ? 's' : ''}</span>
        </p>
      </div>
      {longestStreak > currentStreak && longestStreak > 0 && (
        <div className="text-right shrink-0">
          <p className="text-[9px] text-tx-faint uppercase tracking-wider">Best</p>
          <p className="text-[12px] font-semibold text-tx-muted">{longestStreak}d</p>
        </div>
      )}
    </div>
  );
}
