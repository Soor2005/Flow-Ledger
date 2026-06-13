import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flame,
  Sparkles,
  TrendingUp,
} from 'lucide-react';

const api = window.electron || {};

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAYS   = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const YEAR_COLORS_DARK  = ['#151A2B','#112A2B','#145447','#1A8A67','#2EEB9A'];
const YEAR_COLORS_LIGHT = ['#E2E8F0','#BBF7D0','#4ADE80','#16A34A','#166534'];
const STAT_ACCENTS = ['#8B7CF6', '#35D399', '#5BA7FF'];

function useIsLightTheme() {
  const [isLight, setIsLight] = useState(() =>
    document.documentElement.classList.contains('theme-light')
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

function localDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseLocalDate(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function getIntensity(seconds) {
  if (!seconds || seconds === 0) return 0;
  if (seconds < 1800) return 1;
  if (seconds < 3600) return 2;
  if (seconds < 7200) return 3;
  return 4;
}

function getMonthStats(yearData, year, monthIndex) {
  const entries = Object.entries(yearData).filter(([key]) => {
    const date = parseLocalDate(key);
    return date.getMonth() === monthIndex && date.getFullYear() === year;
  });

  return {
    seconds: entries.reduce((sum, [, seconds]) => sum + seconds, 0),
    activeDays: entries.filter(([, seconds]) => seconds > 0).length,
  };
}

const TOD_DAYS  = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const TOD_HOURS = Array.from({ length: 24 }, (_, i) => i);

function buildTodGrid(sessions) {
  // grid[dayOfWeek(0=Mon..6=Sun)][hour] = total seconds
  const grid = Array.from({ length: 7 }, () => new Array(24).fill(0));
  sessions.forEach(s => {
    if (!s.started_at || !s.duration_seconds) return;
    const d = new Date(s.started_at * 1000);
    const dow = (d.getDay() + 6) % 7; // 0=Mon
    const h   = d.getHours();
    grid[dow][h] += s.duration_seconds;
  });
  return grid;
}

export default function HeatmapPage({ user }) {
  const isLight   = useIsLightTheme();
  const YEAR_COLORS = isLight ? YEAR_COLORS_LIGHT : YEAR_COLORS_DARK;

  const [year, setYear] = useState(new Date().getFullYear());
  const [yearData, setYearData] = useState({});
  const [hovered, setHovered] = useState(null);
  const [totals, setTotals] = useState({ days: 0, hours: 0, longest: 0 });
  const [todGrid, setTodGrid] = useState(() => Array.from({ length: 7 }, () => new Array(24).fill(0)));
  const [todHovered, setTodHovered] = useState(null);

  const loadYear = useCallback(async () => {
    const map = await api.statsHeatmap?.({ userId: user.id, year });
    setYearData(map || {});
    const vals = Object.values(map || {});
    setTotals({
      days: vals.filter(v => v > 0).length,
      hours: Math.round(vals.reduce((a, v) => a + v, 0) / 3600),
      longest: Math.round(Math.max(...vals.map(v => v / 3600), 0) * 10) / 10,
    });
  }, [user.id, year]);

  const loadTod = useCallback(async () => {
    const now  = Math.floor(Date.now() / 1000);
    const from = now - 90 * 86400; // last 90 days
    const sessions = await api.autoSessionsRange?.({ userId: user.id, from, to: now }) || [];
    setTodGrid(buildTodGrid(sessions));
  }, [user.id]);

  useEffect(() => { loadYear(); }, [loadYear]);
  useEffect(() => { loadTod(); }, [loadTod]);

  const jan1 = new Date(year, 0, 1);
  const startDay = (jan1.getDay() + 6) % 7;
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const daysInY = isLeap ? 366 : 365;
  const cells = [];
  const todayKey = localDateKey(new Date());

  for (let i = 0; i < startDay; i++) cells.push(null);
  for (let d = 0; d < daysInY; d++) {
    const date = new Date(year, 0, d + 1);
    const key = localDateKey(date);
    const isFuture = key > todayKey;
    cells.push({ key, date, seconds: yearData[key] || 0, isFuture });
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const monthPos = {};
  weeks.forEach((week, weekIndex) => {
    week.forEach(cell => {
      if (!cell) return;
      const month = cell.date.getMonth();
      if (!(month in monthPos)) monthPos[month] = weekIndex;
    });
  });

  const monthStats = MONTHS.map((_, i) => getMonthStats(yearData, year, i));
  const maxMonthSeconds = Math.max(...monthStats.map(m => m.seconds), 1);

  return (
    <div className="fl-heatmap-page h-full overflow-y-auto">
      <div className="px-8 py-8">
        <div className="mb-7 flex items-start justify-between gap-6">
          <div>
            <div className="mb-3 flex items-center gap-2">
              <Sparkles size={14} className="text-accent" />
              <p className="text-xs font-bold uppercase tracking-wide text-tx-muted">Workspace</p>
            </div>
            <h1 className="text-2xl font-extrabold text-tx-primary">Heatmap</h1>
            <p className="mt-2 text-sm font-medium text-tx-muted">Find your strongest rhythms and build better habits.</p>
          </div>
          <div className="mt-5 hidden items-center gap-2 text-sm font-medium text-tx-muted md:flex">
            <Activity size={14} className="text-green-300" />
            Find your strongest rhythms
          </div>
        </div>

        <div className="mb-7 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-tx-primary">Activity Heatmap</h2>
            <p className="mt-1 text-sm font-medium text-tx-muted">Your work patterns visualized</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setYear(y => y - 1)}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/[0.07] bg-white/[0.025] text-tx-muted shadow-inner transition-all duration-200 hover:border-white/[0.12] hover:bg-white/[0.055] hover:text-tx-primary"
              aria-label="Previous year"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="flex h-10 items-center rounded-lg border border-white/[0.07] bg-white/[0.03] shadow-inner">
              <span className="num min-w-20 px-5 text-center text-sm font-extrabold text-tx-primary">{year}</span>
              <button
                onClick={() => setYear(y => y + 1)}
                disabled={year >= new Date().getFullYear()}
                className="flex h-10 w-10 items-center justify-center border-l border-white/[0.07] text-tx-muted transition-all duration-200 hover:bg-white/[0.05] hover:text-tx-primary disabled:cursor-not-allowed disabled:opacity-30"
                aria-label="Next year"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>

        <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
          {[
            { icon: Flame, label: 'Active Days', value: totals.days, sub: `out of ${daysInY}` },
            { icon: Clock, label: 'Total Hours', value: `${totals.hours}h`, sub: `in ${year}` },
            { icon: TrendingUp, label: 'Longest Day', value: `${totals.longest}h`, sub: 'single day record' },
          ].map(({ icon: Icon, label, value, sub }, i) => {
            const accent = STAT_ACCENTS[i];
            return (
              <div key={label} className="fl-heat-stat">
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border shadow-inner"
                  style={{ background: `${accent}22`, borderColor: `${accent}35`, color: accent }}
                >
                  <Icon size={18} />
                </div>
                <div className="h-16 w-px bg-white/[0.08]" />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-tx-muted">{label}</p>
                  <p className="num mt-2 text-3xl font-extrabold leading-none text-tx-primary">{value}</p>
                  <p className="mt-2 text-[12px] font-medium text-tx-muted">{sub}</p>
                </div>
                <div className="hidden h-14 w-28 items-end gap-1 sm:flex" aria-hidden="true">
                  {[...Array(12)].map((_, barIndex) => (
                    <span
                      key={barIndex}
                      className="w-1.5 rounded-t-full opacity-80"
                      style={{
                        height: `${8 + ((barIndex * 7 + i * 11) % 34)}px`,
                        background: barIndex > 7 || i === 1 ? accent : 'rgba(148,163,184,0.20)',
                      }}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="fl-heatmap-panel mb-7 overflow-x-auto">
          <div className="min-w-[1040px]">
            <div className="mb-4 ml-14 grid" style={{ gridTemplateColumns: `repeat(${weeks.length}, 16px)`, columnGap: '6px' }}>
              {weeks.map((_, weekIndex) => {
                const entry = Object.entries(monthPos).find(([, pos]) => pos === weekIndex);
                return (
                  <div key={weekIndex} className="text-center text-[12px] font-medium text-tx-muted">
                    {entry ? MONTHS[parseInt(entry[0], 10)] : ''}
                  </div>
                );
              })}
            </div>

            <div className="flex gap-3">
              <div className="flex w-8 flex-col gap-[6px]">
                {DAYS.map(day => (
                  <div key={day} className="flex h-4 items-center justify-end text-[12px] font-medium text-tx-muted">
                    {day.slice(0, 1)}
                  </div>
                ))}
              </div>
              <div className="flex gap-[6px]">
                {weeks.map((week, weekIndex) => (
                  <div key={weekIndex} className="flex flex-col gap-[6px]">
                    {week.map((cell, dayIndex) => (
                      <div
                        key={dayIndex}
                        className={`h-4 w-4 rounded-[5px] transition-all duration-150 ${cell && !cell.isFuture ? 'hover:scale-125 hover:ring-2 hover:ring-white/30' : ''}`}
                        style={{ background: cell ? (cell.isFuture ? (isLight ? 'rgba(15,23,42,0.05)' : 'rgba(148,163,184,0.035)') : YEAR_COLORS[getIntensity(cell.seconds)]) : 'transparent' }}
                        onMouseEnter={() => cell && !cell.isFuture && setHovered(cell)}
                        onMouseLeave={() => setHovered(null)}
                        title={cell && !cell.isFuture ? `${cell.key}: ${Math.round((cell.seconds || 0) / 3600 * 10) / 10}h` : ''}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 flex items-center justify-center gap-3">
              <span className="text-[12px] font-medium text-tx-muted">Less</span>
              <div className="flex items-center gap-2">
                {YEAR_COLORS.map((color, i) => (
                  <div key={i} className="h-4 w-4 rounded-[5px]" style={{ background: color }} />
                ))}
              </div>
              <span className="text-[12px] font-medium text-tx-muted">More</span>
            </div>
          </div>
        </div>

        {hovered && (
          <div className="fl-heat-tooltip mb-7 inline-flex items-center gap-3">
            <span className="h-3 w-3 rounded-sm" style={{ background: YEAR_COLORS[getIntensity(hovered.seconds)] }} />
            <div>
              <p className="text-xs font-semibold text-white">
                {hovered.date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
              <p className="text-[11px] text-tx-faint">
                {hovered.seconds > 0
                  ? `${Math.round(hovered.seconds / 3600 * 10) / 10}h tracked`
                  : 'No activity'}
              </p>
            </div>
          </div>
        )}

        {/* ── Time-of-Day Heatmap ── */}
        <div className="mb-7">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-widest text-tx-muted">Time-of-Day Heatmap</h3>
            <p className="text-[11px] text-tx-faint">Last 90 days — darker = more time</p>
          </div>
          <div className="fl-heatmap-panel overflow-x-auto">
            <div style={{ minWidth: 680 }}>
              {/* Hour labels */}
              <div className="mb-1 flex" style={{ paddingLeft: 36 }}>
                {TOD_HOURS.map(h => (
                  <div key={h} className="text-center text-[9px] text-tx-faint" style={{ width: 22, flexShrink: 0 }}>
                    {h % 3 === 0 ? (h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h-12}p`) : ''}
                  </div>
                ))}
              </div>
              {/* Grid rows */}
              {todGrid.map((row, dow) => {
                const maxInRow = Math.max(...row, 1);
                return (
                  <div key={dow} className="flex items-center mb-0.5">
                    <div className="text-[10px] text-tx-faint text-right pr-2 shrink-0" style={{ width: 36 }}>
                      {TOD_DAYS[dow]}
                    </div>
                    {row.map((secs, h) => {
                      const intensity = secs === 0 ? 0 : Math.min(4, Math.ceil((secs / maxInRow) * 4));
                      const bg = YEAR_COLORS[intensity];
                      const isHov = todHovered?.dow === dow && todHovered?.h === h;
                      return (
                        <div key={h}
                          style={{ width: 20, height: 16, borderRadius: 3, background: bg, flexShrink: 0, marginRight: 2, border: isHov ? '1px solid rgba(255,255,255,0.4)' : '1px solid transparent', cursor: secs > 0 ? 'pointer' : 'default', transition: 'transform 0.1s', transform: isHov ? 'scale(1.2)' : 'scale(1)' }}
                          onMouseEnter={() => setTodHovered({ dow, h, secs })}
                          onMouseLeave={() => setTodHovered(null)}
                        />
                      );
                    })}
                  </div>
                );
              })}
              {/* Tooltip */}
              {todHovered && todHovered.secs > 0 && (
                <div className="mt-3 inline-flex items-center gap-2 rounded-lg bg-bg-app border border-brd-default px-3 py-2">
                  <span className="text-xs text-white font-semibold">{TOD_DAYS[todHovered.dow]} {todHovered.h}:00–{todHovered.h+1}:00</span>
                  <span className="text-[11px] text-tx-faint">— {(todHovered.secs / 3600).toFixed(1)}h tracked (90d total)</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div>
          <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-tx-muted">Monthly Breakdown</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {MONTHS.map((month, monthIndex) => {
              const { seconds, activeDays } = monthStats[monthIndex];
              const barWidth = Math.round((seconds / maxMonthSeconds) * 100);
              return (
                <div key={month} className="fl-month-card">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-sm font-bold text-tx-primary">{month}</span>
                    <span className="text-xs font-medium text-tx-muted">{activeDays}d</span>
                  </div>
                  <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-white/[0.09]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-green-400 to-emerald-300 shadow-[0_0_18px_rgba(52,211,153,0.26)] transition-all duration-500"
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                  <p className="text-xs font-medium text-tx-muted">{Math.round(seconds / 3600 * 10) / 10}h</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
