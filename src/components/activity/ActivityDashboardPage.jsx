import React, { useEffect, useMemo, useState } from 'react';
import AppIcon from '../shared/AppIcon';
import { Activity, AlertTriangle, Calendar, ChevronLeft, ChevronRight, Clock3, Globe, LayoutDashboard, Monitor, Users } from 'lucide-react';
import { Cell, Pie, PieChart, Tooltip } from 'recharts';
import { LoadingSpinner } from '../shared/LoadingSpinner';

const api = window.electron || {};

const RANGE_OPTIONS = [
  { id: 'day', label: 'Day' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
];

const TYPE_META = {
  deep: { label: 'Productivity', color: '#7d63d8' },
  shallow: { label: 'Utility', color: '#6f7188' },
  meeting: { label: 'Meetings', color: '#f07a74' },
  distraction: { label: 'Entertainment', color: '#c8baf8' },
  neutral: { label: 'Miscellaneous', color: '#989bb1' },
};

function localDateStr(ts) {
  const d = ts ? new Date(ts * 1000) : new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

function formatDurationCompact(secs) {
  if (!secs) return '0 min';
  const hours = Math.floor(secs / 3600);
  const mins = Math.floor((secs % 3600) / 60);
  if (!hours) return `${mins} min`;
  if (!mins) return `${hours} hr`;
  return `${hours} hr ${mins} min`;
}

function classifyApp(name = '') {
  const n = (name || '').toLowerCase().replace(/\.exe$/i, '').trim();
  if (!n || n === 'unknown') return { type: 'neutral', label: 'Miscellaneous', color: '#989bb1', Icon: Monitor };
  if (/zoom|webex|whereby|jitsi|gotomeeting|\bteams\b|meet\.google/.test(n)) return { type: 'meeting', label: 'Meetings', color: '#f07a74', Icon: Users };
  if (/\bcode\b|vscode|cursor|windsurf|zed|intellij|pycharm|webstorm|androidstudio|xcode|github desktop|terminal|powershell|pwsh|\bbash\b/.test(n)) return { type: 'deep', label: 'Productivity', color: '#7d63d8', Icon: Activity };
  if (/figma|sketch|photoshop|illustrator|canva|blender|notion|obsidian|typora|craft|ulysses|word|writer|excel|tableau|powerbi/.test(n)) return { type: 'deep', label: 'Documenting', color: '#8d77ec', Icon: Activity };
  if (/outlook|thunderbird|spark|mail|slack|discord|telegram|whatsapp|signal|messenger|googlechat/.test(n)) return { type: 'shallow', label: 'Messaging', color: '#6f7188', Icon: Globe };
  if (/chrome|msedge|\bedge\b|firefox|opera|brave|vivaldi|safari|\barc\b|explorer/.test(n)) return { type: 'shallow', label: 'Browsing', color: '#6f7188', Icon: Globe };
  if (/youtube|netflix|twitch|hulu|spotify|soundcloud|steam|epicgames|xboxapp|reddit|twitter|instagram|facebook|tiktok/.test(n)) return { type: 'distraction', label: 'Entertainment', color: '#c8baf8', Icon: AlertTriangle };
  return { type: 'neutral', label: 'Miscellaneous', color: '#989bb1', Icon: Monitor };
}

function Surface({ children, className = '' }) {
  return (
    <section className={`act-dash-surface ${className}`}>
      {children}
    </section>
  );
}

export default function ActivityDashboardPage({ user }) {
  const [range, setRange] = useState('day');
  const [anchorDate, setAnchorDate] = useState(() => localDateStr());
  const [autoData, setAutoData] = useState([]);
  const [loading, setLoading] = useState(false);

  const todayKey = localDateStr();

  const { from, to, titleDate, subtitleDate, isDayView } = useMemo(() => {
    const now = Math.floor(Date.now() / 1000);
    const anchor = new Date(`${anchorDate}T00:00:00`);
    const end = anchorDate === todayKey ? now : Math.floor(new Date(`${anchorDate}T23:59:59`).getTime() / 1000);

    if (range === 'day') {
      return {
        from: Math.floor(anchor.getTime() / 1000),
        to: end,
        titleDate: anchor.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
        subtitleDate: anchor.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        isDayView: true,
      };
    }

    const spanDays = range === 'week' ? 6 : 29;
    const start = new Date(anchor);
    start.setDate(start.getDate() - spanDays);
    return {
      from: Math.floor(start.getTime() / 1000),
      to: end,
      titleDate: anchor.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
      subtitleDate: `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${anchor.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
      isDayView: false,
    };
  }, [anchorDate, range, todayKey]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const data = await api.autoSessionsRange?.({ userId: user.id, from, to });
        if (!cancelled) setAutoData(data || []);
      } catch (err) {
        console.error('[ActivityDashboardPage] load failed:', err);
        if (!cancelled) setAutoData([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [user.id, from, to]);

  const activeData = useMemo(
    () => autoData.filter(item => !item.is_idle && (item.duration_seconds || 0) > 0),
    [autoData]
  );

  const totalSecs = activeData.reduce((sum, item) => sum + (item.duration_seconds || 0), 0);

  const timelineData = useMemo(() => {
    if (isDayView) {
      const buckets = Array.from({ length: 24 }, (_, hour) => ({
        label: new Date(0, 0, 0, hour).toLocaleTimeString('en-US', { hour: 'numeric' }),
        fullLabel: new Date(0, 0, 0, hour).toLocaleTimeString('en-US', { hour: 'numeric' }),
        secs: 0,
      }));
      activeData.forEach(item => {
        const hour = new Date((item.started_at || 0) * 1000).getHours();
        if (hour >= 0 && hour < 24) buckets[hour].secs += item.duration_seconds || 0;
      });
      return buckets;
    }

    const byDay = {};
    activeData.forEach(item => {
      const key = localDateStr(item.started_at || 0);
      byDay[key] = (byDay[key] || 0) + (item.duration_seconds || 0);
    });

    const days = [];
    let cursor = from;
    while (cursor <= to) {
      const date = new Date(cursor * 1000);
      const key = localDateStr(cursor);
      days.push({
        label: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        fullLabel: date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
        secs: byDay[key] || 0,
      });
      cursor += 86400;
    }
    return days;
  }, [activeData, from, isDayView, to]);

  const typeBreakdown = useMemo(() => {
    const map = {};
    activeData.forEach(item => {
      const type = classifyApp(item.app_name || '').type;
      map[type] = (map[type] || 0) + (item.duration_seconds || 0);
    });
    return Object.entries(map)
      .filter(([, secs]) => secs > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([type, secs]) => ({
        type,
        secs,
        pct: totalSecs ? Math.round((secs / totalSecs) * 100) : 0,
        label: TYPE_META[type]?.label || 'Miscellaneous',
        color: TYPE_META[type]?.color || '#989bb1',
      }));
  }, [activeData, totalSecs]);

  const categoryRows = useMemo(() => {
    const map = {};
    activeData.forEach(item => {
      const cls = classifyApp(item.app_name || '');
      if (!map[cls.label]) map[cls.label] = { secs: 0, color: cls.color };
      map[cls.label].secs += item.duration_seconds || 0;
    });
    return Object.entries(map)
      .sort((a, b) => b[1].secs - a[1].secs)
      .map(([label, value]) => ({
        label,
        secs: value.secs,
        pct: totalSecs ? Math.round((value.secs / totalSecs) * 100) : 0,
        color: value.color,
      }));
  }, [activeData, totalSecs]);

  const appRows = useMemo(() => {
    const map = {};
    activeData.forEach(item => {
      const key = item.app_name || 'Unknown';
      if (!map[key]) map[key] = { secs: 0, url: item.url };
      if (!map[key].url && item.url) map[key].url = item.url;
      map[key].secs += item.duration_seconds || 0;
    });
    return Object.entries(map)
      .sort((a, b) => b[1].secs - a[1].secs)
      .map(([name, value]) => ({
        name,
        secs: value.secs,
        url: value.url,
        pct: totalSecs ? Math.round((value.secs / totalSecs) * 100) : 0,
        color: classifyApp(name).color,
      }));
  }, [activeData, totalSecs]);

  const peakTimeline = Math.max(...timelineData.map(item => item.secs), 1);
  const totalDisplay = formatDurationCompact(totalSecs);

  const moveAnchor = delta => {
    const next = new Date(`${anchorDate}T00:00:00`);
    next.setDate(next.getDate() + delta);
    const nextKey = localDateStr(Math.floor(next.getTime() / 1000));
    if (nextKey <= todayKey) setAnchorDate(nextKey);
  };

  return (
    <div className="h-full overflow-y-auto" style={{ background: 'var(--act-dash-bg)' }}>
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 px-6 py-5">
        <header className="flex flex-col gap-4 pb-4 xl:flex-row xl:items-start xl:justify-between"
          style={{ borderBottom: '1px solid var(--act-dash-surface-brd)' }}>
          <div>
            <div className="mb-2 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent/10 text-accent shrink-0">
                <LayoutDashboard size={18} />
              </div>
              <div>
                <h1 className="text-[1.9rem] font-bold leading-none tracking-tight text-tx-primary">Activity</h1>
              </div>
            </div>
            <p className="text-sm font-medium text-tx-secondary">{titleDate}</p>
          </div>

          <div className="flex flex-col gap-3 xl:items-end">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-xl p-1"
                style={{ border: '1px solid var(--act-dash-range-brd)', background: 'var(--act-dash-range-bg)' }}>
                {RANGE_OPTIONS.map(option => (
                  <button
                    key={option.id}
                    onClick={() => setRange(option.id)}
                    className={`rounded-lg px-4 py-1.5 text-[11px] font-semibold transition-all ${
                      range === option.id ? 'text-tx-primary shadow-sm' : 'text-tx-faint hover:text-tx-secondary'
                    }`}
                    style={range === option.id ? { background: 'var(--act-dash-active-bg)' } : {}}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <label className="flex h-9 items-center gap-2 rounded-xl px-3 text-sm text-tx-secondary cursor-pointer"
                style={{ border: '1px solid var(--act-dash-range-brd)', background: 'var(--act-dash-range-bg)' }}>
                <Calendar size={13} className="text-tx-faint" />
                <input
                  type="date"
                  value={anchorDate}
                  max={todayKey}
                  onChange={e => setAnchorDate(e.target.value)}
                  className="bg-transparent text-tx-primary text-[11px] focus:outline-none"
                />
              </label>

              <button onClick={() => moveAnchor(-1)}
                className="flex h-9 w-9 items-center justify-center rounded-xl text-tx-secondary hover:text-tx-primary transition-colors"
                style={{ border: '1px solid var(--act-dash-range-brd)', background: 'var(--act-dash-range-bg)' }}>
                <ChevronLeft size={14} />
              </button>
              <button
                onClick={() => moveAnchor(1)}
                disabled={anchorDate === todayKey}
                className="flex h-9 w-9 items-center justify-center rounded-xl text-tx-secondary hover:text-tx-primary transition-colors disabled:opacity-35"
                style={{ border: '1px solid var(--act-dash-range-brd)', background: 'var(--act-dash-range-bg)' }}
              >
                <ChevronRight size={14} />
              </button>
            </div>

            <div className="flex items-center gap-2.5 text-[11px] text-tx-faint">
              <span>{subtitleDate}</span>
              {loading && <LoadingSpinner size={13} className="text-accent opacity-70" />}
            </div>
          </div>
        </header>

        {totalSecs === 0 && !loading ? (
          <Surface className="flex min-h-[420px] flex-col items-center justify-center gap-2">
            <Activity size={32} className="mb-2 opacity-20 text-tx-faint" />
            <p className="text-sm font-medium text-tx-secondary">No tracked activity for this period.</p>
            <p className="text-xs text-tx-faint">Enable auto-tracking to populate the dashboard.</p>
          </Surface>
        ) : (
          <>
            <Surface className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-[0.10em] text-tx-faint">Timeline</p>
                <div className="flex items-center gap-2 text-xs font-semibold text-tx-secondary">
                  <Clock3 size={12} className="text-accent opacity-70" />
                  <span>{totalDisplay}</span>
                </div>
              </div>

              <div className="rounded-[16px] p-3" style={{ border: '1px solid var(--act-dash-surface-brd)', background: 'var(--act-dash-inner-bg)' }}>
                {/* Strip timeline */}
                <div className="mb-3">
                  <div className="flex h-2.5 overflow-hidden rounded-md" style={{ border: '1px solid var(--act-dash-surface-brd)', background: 'var(--act-dash-chart-bg)' }}>
                    {timelineData.map((item, index) => (
                      <div
                        key={`strip-${index}`}
                        title={`${item.fullLabel}: ${formatDurationCompact(item.secs)}`}
                        className="h-full"
                        style={{ flex: Math.max(item.secs, 1), background: 'var(--color-accent, #7C6CF2)', opacity: item.secs ? 0.85 : 0.10 }}
                      />
                    ))}
                  </div>
                </div>

                {/* Bar chart */}
                <div className="rounded-[12px] px-3 pb-7 pt-4" style={{ border: '1px solid var(--act-dash-surface-brd)', background: 'var(--act-dash-card-bg)' }}>
                  <div className="grid h-[160px] items-end gap-1.5" style={{ gridTemplateColumns: `repeat(${timelineData.length || 1}, minmax(0, 1fr))` }}>
                    {timelineData.map((item, index) => (
                      <div key={`bar-${index}`} className="relative flex h-full items-end">
                        <div className="absolute inset-y-0 left-0 right-0" style={{ borderRight: '1px solid var(--act-dash-grid-brd)' }} />
                        <div
                          title={`${item.fullLabel}: ${formatDurationCompact(item.secs)}`}
                          className="relative z-10 w-full rounded-t-[6px]"
                          style={{
                            height: `${Math.max(2, Math.round((item.secs / peakTimeline) * 100))}%`,
                            background: 'var(--color-accent, #7C6CF2)',
                            opacity: item.secs ? 0.92 : 0.10,
                          }}
                        />
                      </div>
                    ))}
                  </div>

                  <div className="mt-2 grid gap-1 text-[10px] text-tx-faint" style={{ gridTemplateColumns: `repeat(${timelineData.length || 1}, minmax(0, 1fr))` }}>
                    {timelineData.map((item, index) => {
                      const show = isDayView
                        ? index >= 9 && index <= 16
                        : index % Math.max(1, Math.floor(timelineData.length / 6)) === 0 || index === timelineData.length - 1;
                      return <span key={`tick-${index}`} className="truncate text-center">{show ? item.label : ' '}</span>;
                    })}
                  </div>
                </div>
              </div>
            </Surface>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[260px_minmax(0,1fr)_minmax(0,1fr)]">
              {/* Pie chart panel */}
              <Surface className="p-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-[0.10em] text-tx-faint">Breakdown</p>
                <div className="flex justify-center">
                  <div className="relative">
                    <PieChart width={210} height={210}>
                      <Pie data={typeBreakdown} cx={105} cy={105} innerRadius={62} outerRadius={93} dataKey="secs" paddingAngle={3} strokeWidth={0}>
                        {typeBreakdown.map((item, index) => <Cell key={index} fill={item.color} />)}
                      </Pie>
                      <Tooltip
                        formatter={value => [formatDurationCompact(value), 'Time']}
                        contentStyle={{
                          background: 'var(--act-dash-surface-bg)',
                          border: '1px solid var(--act-dash-surface-brd)',
                          borderRadius: 10, fontSize: 11,
                          color: 'var(--color-tx-primary, #EAEAF0)',
                        }}
                      />
                    </PieChart>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-[10px] uppercase tracking-[0.12em] text-tx-faint">Tracked</span>
                      <span className="mt-1 text-[1.7rem] font-bold tracking-tight text-tx-primary">{totalDisplay}</span>
                    </div>
                  </div>
                </div>
                {/* Legend */}
                <div className="mt-1 space-y-1.5 px-1">
                  {typeBreakdown.map(item => (
                    <div key={item.type} className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full shrink-0" style={{ background: item.color }} />
                      <span className="flex-1 text-[11px] text-tx-secondary truncate">{item.label}</span>
                      <span className="text-[10px] font-semibold text-tx-faint">{item.pct}%</span>
                    </div>
                  ))}
                </div>
              </Surface>

              {/* Categories panel */}
              <Surface className="overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3.5" style={{ borderBottom: '1px solid var(--act-dash-surface-brd)' }}>
                  <p className="text-sm font-semibold text-tx-primary">Categories</p>
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-accent/10 text-accent">{categoryRows.length}</span>
                </div>
                <div className="max-h-[540px] overflow-y-auto px-4 py-1">
                  {categoryRows.map(row => (
                    <div key={row.label} className="flex items-center gap-3 py-2.5" style={{ borderBottom: '1px solid var(--act-dash-grid-brd)' }}>
                      <span className="w-10 text-right text-[11px] font-bold text-accent shrink-0">{row.pct}%</span>
                      <div className="flex flex-1 items-center gap-2.5 min-w-0">
                        <div className="h-1.5 w-14 flex-shrink-0 overflow-hidden rounded-full" style={{ background: 'var(--act-dash-bar-track)' }}>
                          <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(10, row.pct)}%`, background: row.color }} />
                        </div>
                        <span className="truncate text-sm text-tx-primary font-medium">{row.label}</span>
                      </div>
                      <span className="text-right text-[11px] font-medium text-tx-secondary shrink-0">{formatDurationCompact(row.secs)}</span>
                    </div>
                  ))}
                </div>
              </Surface>

              {/* Apps panel */}
              <Surface className="overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3.5" style={{ borderBottom: '1px solid var(--act-dash-surface-brd)' }}>
                  <p className="text-sm font-semibold text-tx-primary">Apps & Websites</p>
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-accent/10 text-accent">{appRows.length}</span>
                </div>
                <div className="max-h-[540px] overflow-y-auto px-4 py-1">
                  {appRows.map(app => {
                    let domain = '';
                    if (app.url) {
                      try { domain = new URL(app.url).hostname; } catch {}
                    }
                    return (
                      <div key={`${app.name}-${domain}`} className="flex items-center gap-3 py-2.5" style={{ borderBottom: '1px solid var(--act-dash-grid-brd)' }}>
                        <span className="w-10 text-right text-[11px] font-bold text-accent shrink-0">{app.pct}%</span>
                        <div className="flex flex-1 min-w-0 items-center gap-2.5">
                          <div className="h-1.5 w-14 flex-shrink-0 overflow-hidden rounded-full" style={{ background: 'var(--act-dash-bar-track)' }}>
                            <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(8, app.pct)}%`, background: app.color }} />
                          </div>
                          <AppIcon appName={app.name} url={app.url} size={22} radius={6} />
                          <div className="min-w-0">
                            <span className="block truncate text-sm font-medium text-tx-primary">{app.name}</span>
                            {domain && <span className="block truncate text-[10px] text-tx-faint">{domain}</span>}
                          </div>
                        </div>
                        <span className="text-right text-[11px] font-medium text-tx-secondary shrink-0">{formatDurationCompact(app.secs)}</span>
                      </div>
                    );
                  })}
                </div>
              </Surface>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
