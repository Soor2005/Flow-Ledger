import React, { useState, useEffect, useCallback, useMemo } from 'react';

function useThemeLight() {
  const [isLight, setIsLight] = React.useState(() => document.documentElement.classList.contains('theme-light'));
  React.useEffect(() => {
    const obs = new MutationObserver(() => setIsLight(document.documentElement.classList.contains('theme-light')));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  return isLight;
}
import {
  Briefcase, Users, Clock, TrendingUp, BarChart2, Zap,
  ChevronUp, ChevronDown, Minus, Download, DollarSign,
  Target, Brain, Activity, ArrowUpDown, Filter,
  Search, ChevronRight, Globe, Monitor, Calendar,
  Layers, Flame, MousePointer, SortAsc,
} from 'lucide-react';
import ExportModal from '../shared/ExportModal';
import { classifyActivityApp, classifyActivitySession } from '../../utils/activityCategories';
import { exportAsCSV, exportAsPDF, fmtPct, fmtMoney,
  fmtH as fmtHUtil, fmtDuration as fmtDurUtil } from '../../utils/exportUtils';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid,
  ComposedChart, Line,
} from 'recharts';

const api = window.electron || {};

// ─── Constants ─────────────────────────────────────────────────────────────────
const PERIODS = [
  { label: '7D',     days: 7      },
  { label: '14D',    days: 14     },
  { label: '30D',    days: 30     },
  { label: '90D',    days: 90     },
  { label: 'Custom', days: 'custom' },
];

const PROJ_PALETTE = [
  '#7c6cf2','#5BA7FF','#3DD6A4','#F2B84B','#F27C8A',
  '#A78BFA','#38bdf8','#E879C4','#9F8DF7','#45C7D8',
  '#fb923c','#4ade80','#f472b6','#60a5fa','#facc15',
];
const CLIENT_PALETTE = [
  '#5BA7FF','#3DD6A4','#F2B84B','#7c6cf2','#F27C8A',
  '#a78bfa','#38bdf8','#E879C4','#45C7D8','#fb923c',
];

const CHART_TICK    = { fill: '#9AA6B8', fontSize: 11, fontWeight: 500 };
const CHART_GRID    = '#273142';
const TOOLTIP_STYLE = {
  background: 'rgba(17,21,31,0.96)',
  border: '1px solid rgba(148,163,184,0.16)',
  borderRadius: 10,
  color: '#EAEAF0',
  fontSize: 12,
  boxShadow: '0 18px 48px rgba(0,0,0,0.42)',
  padding: '10px 14px',
};
const TOOLTIP_STYLE_LIGHT = {
  background: 'rgba(255,255,255,0.99)',
  border: '1px solid rgba(0,0,0,0.09)',
  borderRadius: 10,
  color: '#111827',
  fontSize: 12,
  boxShadow: '0 12px 40px rgba(0,0,0,0.12)',
  padding: '10px 14px',
};

const CAT_COLOR_MAP = {
  Coding:   '#7c6cf2',
  Meetings: '#60a5fa',
  Writing:  '#34d399',
  Research: '#5BA7FF',
  Admin:    '#fb923c',
  Break:    '#6b7280',
  Design:   '#a78bfa',
  General:  '#9CA3AF',
};

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ─── Helpers ───────────────────────────────────────────────────────────────────
function fmtHrs(s)  { return ((s || 0) / 3600).toFixed(1) + 'h'; }
function fmtDomain(url) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url || '—'; } }
function prodBadge(typeStr) {
  if (typeStr === 'deep')        return { label: 'Deep Work',   color: '#a78bfa', bg: 'rgba(167,139,250,0.13)' };
  if (typeStr === 'meeting')     return { label: 'Meeting',     color: '#F27C8A', bg: 'rgba(242,124,138,0.13)' };
  if (typeStr === 'distraction') return { label: 'Distracting', color: '#f87171', bg: 'rgba(248,113,113,0.13)' };
  if (typeStr === 'shallow')     return { label: 'Productive',  color: '#3DD6A4', bg: 'rgba(61,214,164,0.13)'  };
  return                                 { label: 'Neutral',    color: '#94a3b8', bg: 'rgba(148,163,184,0.10)' };
}
function normaliseApp(name) { return (name || 'Unknown').replace(/\.exe$/i, '').replace(/\.app$/i, '').trim() || 'Unknown'; }
function fmtDuration(s) {
  if (!s || s < 0) return '—';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
function pctOf(part, total) { return total > 0 ? Math.round(((part || 0) / total) * 100) : 0; }

function localDateKey(unix) {
  const d = new Date((unix || 0) * 1000);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function isMeeting(s) {
  return !!(s.is_meeting || /meet|call|zoom|standup|sync/i.test(s.category || ''));
}

// ─── Export section builders ───────────────────────────────────────────────────
function buildProjectsSection(sortedProjects, totalSecs, deepSecs) {
  return {
    title: 'Project Analytics',
    subtitle: `${sortedProjects.length} projects tracked · sorted by time spent`,
    kpis: [
      { label: 'Projects Tracked', value: String(sortedProjects.length) },
      { label: 'Total Time',       value: fmtHUtil(totalSecs) },
      { label: 'Deep Work %',      value: fmtPct(deepSecs, totalSecs) },
      { label: 'Active Projects',  value: String(sortedProjects.filter(p => p.status === 'active').length) },
    ],
    headers: ['Project', 'Status', 'Total Hours', 'Deep Work', 'Meetings', 'Other', 'Sessions', 'Deep %', 'Est. Revenue'],
    rows: sortedProjects.map(p => [
      p.name,
      p.status || 'active',
      fmtHUtil(p.totalSeconds),
      fmtHUtil(p.deepSeconds),
      fmtHUtil(p.meetingSeconds),
      fmtHUtil(Math.max(0, p.totalSeconds - p.deepSeconds - p.meetingSeconds)),
      p.sessionCount,
      fmtPct(p.deepSeconds, p.totalSeconds),
      p.hourlyRate > 0 ? fmtMoney(p.totalSeconds / 3600 * p.hourlyRate) : '—',
    ]),
    summary: [
      ['Projects Tracked', String(sortedProjects.length)],
      ['Active Projects',  String(sortedProjects.filter(p => p.status === 'active').length)],
      ['Total Time',       fmtHUtil(totalSecs)],
      ['Deep Work %',      fmtPct(deepSecs, totalSecs)],
    ],
  };
}

function buildClientsSection(sortedClients) {
  const totalSecs = sortedClients.reduce((a, c) => a + c.totalSeconds, 0);
  const estRevenue = sortedClients.reduce((a, c) => {
    return c.hourlyRate > 0 ? a + (c.totalSeconds / 3600 * c.hourlyRate) : a;
  }, 0);
  return {
    title: 'Client Analytics',
    subtitle: `${sortedClients.length} clients tracked`,
    kpis: [
      { label: 'Clients Tracked',  value: String(sortedClients.length) },
      { label: 'Total Time',       value: fmtHUtil(totalSecs) },
      { label: 'Est. Revenue',     value: estRevenue > 0 ? fmtMoney(estRevenue) : '—' },
      { label: 'Billable Clients', value: String(sortedClients.filter(c => c.billingType !== 'none').length) },
    ],
    headers: ['Client', 'Company', 'Total Hours', 'Meeting Hours', 'Sessions', 'Billing Type', 'Rate', 'Est. Revenue'],
    rows: sortedClients.map(c => [
      c.name,
      c.company || '—',
      fmtHUtil(c.totalSeconds),
      fmtHUtil(c.meetingSeconds),
      c.sessionCount,
      c.billingType || 'none',
      c.hourlyRate > 0 ? `$${c.hourlyRate}/h` : '—',
      c.hourlyRate > 0 ? fmtMoney(c.totalSeconds / 3600 * c.hourlyRate) : '—',
    ]),
    summary: [
      ['Clients Tracked',  String(sortedClients.length)],
      ['Total Time',       fmtHUtil(totalSecs)],
      ['Est. Revenue',     estRevenue > 0 ? fmtMoney(estRevenue) : '—'],
    ],
  };
}

function buildSessionsSection(sessions) {
  const totalSecs = sessions.reduce((a, s) => a + (s.duration_seconds || 0), 0);
  const deepSecs  = sessions.filter(s => s.is_deep_work).reduce((a, s) => a + (s.duration_seconds || 0), 0);
  return {
    title: 'Session Log',
    subtitle: `${sessions.length} sessions in selected period`,
    kpis: [
      { label: 'Total Sessions',  value: String(sessions.length) },
      { label: 'Total Time',      value: fmtHUtil(totalSecs) },
      { label: 'Deep Work',       value: fmtHUtil(deepSecs) },
      { label: 'Avg Session',     value: sessions.length ? fmtDurUtil(Math.round(totalSecs / sessions.length)) : '—' },
    ],
    headers: ['Date', 'Time', 'Title / Category', 'Project', 'Client', 'Duration', 'Deep Work'],
    rows: sessions.slice(0, 500).map(s => {
      const dt = new Date((s.started_at || 0) * 1000);
      return [
        dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        s.title || s.category || '—',
        s.project_name || '—',
        s.client_name  || '—',
        fmtDurUtil(s.duration_seconds || 0),
        s.is_deep_work ? 'Yes' : 'No',
      ];
    }),
    summary: [
      ['Total Sessions', String(sessions.length)],
      ['Total Time',     fmtHUtil(totalSecs)],
      ['Deep Work',      fmtHUtil(deepSecs)],
      ['Deep Work %',    fmtPct(deepSecs, totalSecs)],
    ],
  };
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function TrendBadge({ pct, inverse = false }) {
  if (pct == null) return <span className="text-[11px] font-medium text-tx-faint">—</span>;
  if (pct === 0)   return <span className="flex items-center gap-1 text-[11px] font-medium text-tx-faint"><Minus size={10}/>0% vs last period</span>;
  const good = inverse ? pct < 0 : pct > 0;
  return (
    <span className={`flex items-center gap-1 text-[11px] font-semibold ${good ? 'text-green-300' : 'text-red-300'}`}>
      {pct > 0 ? <ChevronUp size={11}/> : <ChevronDown size={11}/>}
      {Math.abs(pct)}% vs last period
    </span>
  );
}

function KpiCard({ icon: Icon, label, value, sub, accentHex = '#7c6cf2', trend, inversetrend }) {
  const isLight = useThemeLight();
  return (
    <div
      className="fl-kpi-card fl-report-card group relative overflow-hidden rounded-xl border border-white/[0.07] p-5 shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:border-white/[0.14] hover:shadow-popup"
      style={{ background: isLight ? 'linear-gradient(145deg,#FFFFFF,#F8FAFC)' : 'linear-gradient(145deg,rgba(28,32,43,0.94),rgba(18,21,30,0.96))' }}
    >
      <div className="fl-report-card-topline absolute inset-x-5 top-0 h-px opacity-80"
        style={{ background: `linear-gradient(90deg,transparent,${accentHex}99,transparent)` }} />
      <div className="fl-report-card-glow absolute -right-8 -top-10 h-24 w-24 rounded-full opacity-20 blur-2xl transition-opacity group-hover:opacity-30"
        style={{ background: accentHex }} />
      <div className="relative flex items-start justify-between gap-4">
        <div className="min-w-0">
          <span className="fl-report-label block text-[11px] font-bold uppercase tracking-wide text-tx-muted">{label}</span>
          <p className="fl-report-value num mt-3 text-[30px] font-extrabold leading-none text-tx-primary">{value}</p>
          <p className="fl-report-support mt-2 text-[12px] font-medium text-tx-muted">{sub}</p>
        </div>
        <div
          className="fl-report-icon-wrap flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border shadow-inner transition-transform group-hover:scale-105"
          style={{ background: `${accentHex}18`, borderColor: `${accentHex}2f`, boxShadow: `inset 0 1px 0 rgba(255,255,255,0.08),0 10px 24px ${accentHex}16` }}
        >
          <Icon size={16} strokeWidth={2.2} style={{ color: accentHex }} />
        </div>
      </div>
      <div className="fl-report-trend relative mt-4">
        <TrendBadge pct={trend} inverse={inversetrend} />
      </div>
    </div>
  );
}

function SectionCard({ title, subtitle, children, className = '', actions }) {
  return (
    <div className={`fl-analytics-card fl-report-card fl-section-card ${className}`}>
      <div className="fl-report-section-head flex items-center justify-between gap-4 px-6 py-5">
        <div>
          <h3 className="fl-report-title text-[15px] font-bold text-tx-primary">{title}</h3>
          {subtitle && <p className="fl-report-support mt-1 text-[12px] font-medium text-tx-muted">{subtitle}</p>}
        </div>
        {actions}
      </div>
      <div className="fl-report-content px-6 pb-6">{children}</div>
    </div>
  );
}

function EmptyState({ icon: Icon = BarChart2, msg = 'No data for this period' }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-tx-faint">
      <Icon size={28} className="mb-3 opacity-20" />
      <p className="text-[12px] font-medium">{msg}</p>
    </div>
  );
}

function ChartTip({ active, payload, label }) {
  const isLight = useThemeLight();
  if (!active || !payload?.length) return null;
  const style  = isLight ? TOOLTIP_STYLE_LIGHT : TOOLTIP_STYLE;
  const labelC = isLight ? '#6B7280' : '#94A3B8';
  const nameC  = isLight ? '#374151' : '#94A3B8';
  const valC   = isLight ? '#111827' : '#F1F5F9';
  return (
    <div style={{ ...style, minWidth: 148 }}>
      <p style={{ fontSize: 10, fontWeight: 700, color: labelC, textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 8px' }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ margin: i < payload.length - 1 ? '0 0 5px' : 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: p.color || p.fill, flexShrink: 0, display: 'inline-block' }} />
          <span style={{ fontSize: 11.5, color: nameC, flex: 1 }}>{p.name}</span>
          <span style={{ fontSize: 12, color: valC, fontWeight: 700, fontVariantNumeric: 'tabular-nums', marginLeft: 12 }}>
            {typeof p.value === 'number' ? +p.value.toFixed(2) + 'h' : p.value}
          </span>
        </p>
      ))}
    </div>
  );
}

function SortableHeader({ label, field, sortField, sortDir, onSort }) {
  const active = sortField === field;
  return (
    <button
      onClick={() => onSort(field)}
      className={`flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide transition-colors ${
        active ? 'text-accent' : 'text-tx-faint hover:text-tx-muted'
      }`}
    >
      {label}
      <ArrowUpDown size={10} className={active ? 'opacity-100' : 'opacity-40'} />
    </button>
  );
}

function MiniBar({ value, max, color }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
      <div className="h-full rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

function StatusBadge({ status }) {
  const cfg = {
    active:    { color: '#3fb950', bg: '#3fb95015' },
    completed: { color: '#2f81f7', bg: '#2f81f715' },
    paused:    { color: '#d29922', bg: '#d2992215' },
    inactive:  { color: '#6b7280', bg: '#6b728015' },
  }[status] || { color: '#6b7280', bg: '#6b728015' };
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
      style={{ color: cfg.color, background: cfg.bg }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: cfg.color }} />
      {status || 'active'}
    </span>
  );
}

function BillingBadge({ type }) {
  const opts = {
    hourly:   { label: 'Hourly',   color: '#3fb950' },
    retainer: { label: 'Retainer', color: '#2f81f7' },
    hybrid:   { label: 'Hybrid',   color: '#f97316' },
    none:     { label: 'None',     color: '#6b7280' },
  };
  const opt = opts[type] || opts.none;
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider"
      style={{ color: opt.color, background: opt.color + '18', border: `1px solid ${opt.color}30` }}>
      {opt.label}
    </span>
  );
}

function ColorDot({ color, size = 8 }) {
  return <span className="inline-block shrink-0 rounded-full" style={{ width: size, height: size, background: color }} />;
}

function SectionDivider({ label, color }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-px flex-1 bg-white/[0.04]" />
      <span className="text-[11px] font-bold uppercase tracking-[0.10em]" style={{ color }}>
        {label}
      </span>
      <div className="h-px flex-1 bg-white/[0.04]" />
    </div>
  );
}

// ─── Day-of-Week Sparkbar ───────────────────────────────────────────────────────
function DayOfWeekBars({ sessions }) {
  const data = useMemo(() => {
    const map = [0, 0, 0, 0, 0, 0, 0];
    (sessions || []).forEach(s => {
      if (!s.started_at) return;
      map[new Date(s.started_at * 1000).getDay()] += s.duration_seconds || 0;
    });
    const max = Math.max(...map, 1);
    return DAYS_OF_WEEK.map((d, i) => ({ day: d, secs: map[i], pct: Math.round((map[i] / max) * 100) }));
  }, [sessions]);

  return (
    <div className="flex items-end gap-1.5" style={{ height: 56 }}>
      {data.map((d, i) => (
        <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
          <div className="flex w-full items-end justify-center" style={{ height: 40 }}>
            <div
              className="w-full rounded-t-[3px] transition-all duration-700"
              style={{
                height: `${Math.max(d.pct, d.secs > 0 ? 4 : 0)}%`,
                background: 'linear-gradient(180deg,rgba(124,108,242,0.85),rgba(124,108,242,0.35))',
              }}
            />
          </div>
          <span className="text-[9px] font-semibold text-tx-faint">{d.day}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Multi-line Project Trend ───────────────────────────────────────────────────
function ProjectTrendChart({ sessions, projects, fromTs, toTs }) {
  const isLight = useThemeLight();
  const top5 = useMemo(() => {
    const totals = {};
    (sessions || []).forEach(s => {
      if (!s.project_id) return;
      totals[s.project_id] = (totals[s.project_id] || 0) + (s.duration_seconds || 0);
    });
    return Object.entries(totals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id]) => {
        const p = (projects || []).find(p => p.id === id);
        return { id, name: p?.name || 'Unknown', color: p?.color || PROJ_PALETTE[0] };
      });
  }, [sessions, projects]);

  const chartData = useMemo(() => {
    const dayMap = {};
    const cur = new Date(fromTs * 1000); cur.setHours(0, 0, 0, 0);
    const end = new Date(toTs * 1000);
    while (cur <= end) {
      const dk = localDateKey(Math.floor(cur.getTime() / 1000));
      dayMap[dk] = { date: cur.toLocaleDateString('en', { month: 'short', day: 'numeric' }) };
      top5.forEach(p => { dayMap[dk][p.name] = 0; });
      cur.setDate(cur.getDate() + 1);
    }
    (sessions || []).forEach(s => {
      const proj = top5.find(p => p.id === s.project_id);
      if (!proj) return;
      const dk = localDateKey(s.started_at);
      if (dayMap[dk]) {
        dayMap[dk][proj.name] = +((dayMap[dk][proj.name] || 0) + (s.duration_seconds || 0) / 3600).toFixed(2);
      }
    });
    return Object.values(dayMap);
  }, [sessions, top5, fromTs, toTs]);

  if (top5.length === 0) return <EmptyState msg="No project sessions in this period" />;

  return (
    <div>
      <div style={{ height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 4, right: 16, left: -10, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={isLight ? 'rgba(0,0,0,0.06)' : CHART_GRID} vertical={false} />
            <XAxis dataKey="date" tick={CHART_TICK} tickLine={false} axisLine={false}
              interval={Math.max(0, Math.floor(chartData.length / 8) - 1)} />
            <YAxis tick={CHART_TICK} tickLine={false} axisLine={false} tickFormatter={v => v + 'h'} />
            <Tooltip content={<ChartTip />} />
            {top5.map((p, i) => (
              <Area
                key={p.id}
                type="monotone"
                dataKey={p.name}
                stroke={p.color}
                fill={p.color}
                fillOpacity={0.08 + i * 0.02}
                strokeWidth={1.8}
                dot={false}
                stackId={undefined}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        {top5.map(p => (
          <span key={p.id} className="flex items-center gap-1.5 text-[11px] text-tx-muted">
            <span className="h-[3px] w-5 rounded-full" style={{ background: p.color }} />
            {p.name}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Collapsible section wrapper ───────────────────────────────────────────────
function CollapsibleSection({ title, icon: Icon, count, badge, defaultOpen = false, isLight, children }) {
  const [open, setOpen] = useState(defaultOpen);
  const brd = isLight ? '#E2E8F0'               : 'rgba(255,255,255,0.07)';
  const hBg = isLight ? '#FFFFFF'               : 'rgba(255,255,255,0.03)';
  const cBg = isLight ? '#F8FAFC'               : 'rgba(255,255,255,0.015)';
  const lbl = isLight ? '#111827'               : '#E2E8F0';
  const sub = isLight ? '#6B7280'               : '#64748B';
  const pip = isLight ? 'rgba(0,0,0,0.06)'      : 'rgba(255,255,255,0.06)';
  return (
    <div style={{ border: `1px solid ${brd}`, borderRadius: 14, overflow: 'hidden' }}>
      <button onClick={() => setOpen(o => !o)} style={{ background: hBg, width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '13px 18px', cursor: 'pointer', border: 'none' }}>
        <Icon size={14} style={{ color: sub, flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: lbl, flex: 1, textAlign: 'left' }}>{title}</span>
        {badge && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, color: badge.color, background: badge.bg }}>{badge.label}</span>}
        {count != null && <span style={{ fontSize: 11, color: sub, background: pip, padding: '2px 9px', borderRadius: 20, fontWeight: 600 }}>{count}</span>}
        <ChevronRight size={13} style={{ color: sub, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.18s ease', flexShrink: 0 }} />
      </button>
      {open && <div style={{ background: cBg }}>{children}</div>}
    </div>
  );
}

// ─── Activity Sources Panel ─────────────────────────────────────────────────────
function ActivitySourcesPanel({ actData, filtered, filterLabel, isLight, onExportActivity }) {
  const [search,   setSearch]   = useState('');
  const [appSort,  setAppSort]  = useState('time');
  const [siteSort, setSiteSort] = useState('time');
  const [evtSort,  setEvtSort]  = useState('time');
  const [expandApp, setExpandApp] = useState(null);

  if (!actData) return null;

  const { apps, websites, events, totalAutoSecs, breakdown } = actData;

  // ── Search filter ────────────────────────────────────────────────────────────
  const q = search.toLowerCase();
  const visApps  = apps.filter(a => !q || a.name.includes(q)).sort((a, b) =>
    appSort === 'time' ? b.totalSecs - a.totalSecs :
    appSort === 'sessions' ? b.sessions - a.sessions :
    appSort === 'deep' ? b.deepSecs - a.deepSecs :
    a.name.localeCompare(b.name)
  );
  const visSites = websites.filter(s => !q || s.domain.includes(q)).sort((a, b) =>
    siteSort === 'time' ? b.totalSecs - a.totalSecs :
    siteSort === 'visits' ? b.visits - a.visits :
    a.domain.localeCompare(b.domain)
  );
  const visEvts = filtered.filter(e =>
    !q || (e.title || '').toLowerCase().includes(q) || (e.category || '').toLowerCase().includes(q)
  ).sort((a, b) =>
    evtSort === 'time' ? b.started_at - a.started_at :
    evtSort === 'duration' ? (b.duration_seconds || 0) - (a.duration_seconds || 0) :
    (a.title || '').localeCompare(b.title || '')
  );

  // ── Token colours ────────────────────────────────────────────────────────────
  const cardBg  = isLight ? '#FFFFFF'         : 'rgba(255,255,255,0.03)';
  const cardBrd = isLight ? '#E2E8F0'         : 'rgba(255,255,255,0.07)';
  const tx1     = isLight ? '#111827'         : '#E2E8F0';
  const tx2     = isLight ? '#374151'         : '#94A3B8';
  const tx3     = isLight ? '#6B7280'         : '#64748B';
  const rowHov  = isLight ? '#F4F6FA'         : 'rgba(255,255,255,0.03)';
  const divBrd  = isLight ? '#EEF2F7'         : 'rgba(255,255,255,0.04)';
  const inputBg = isLight ? '#F8FAFC'         : 'rgba(255,255,255,0.04)';
  const inputBrd= isLight ? '#E2E8F0'         : 'rgba(255,255,255,0.08)';

  const SortBtn = ({ label, field, current, onSet }) => (
    <button onClick={() => onSet(field)} style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6, cursor: 'pointer', border: `1px solid ${current === field ? '#7c6cf2' : inputBrd}`, background: current === field ? 'rgba(124,108,242,0.12)' : 'transparent', color: current === field ? '#7c6cf2' : tx3 }}>{label}</button>
  );

  // ── Productivity breakdown bar ────────────────────────────────────────────────
  const bk = breakdown;
  const bkTotal = Math.max(bk.deep + bk.productive + bk.neutral + bk.distracting + bk.meeting, 1);
  const bkSegments = [
    { label: 'Deep Work',  secs: bk.deep,        color: '#a78bfa' },
    { label: 'Productive', secs: bk.productive,   color: '#3DD6A4' },
    { label: 'Meetings',   secs: bk.meeting,      color: '#5BA7FF' },
    { label: 'Neutral',    secs: bk.neutral,      color: '#94a3b8' },
    { label: 'Distracting',secs: bk.distracting,  color: '#f87171' },
  ].filter(s => s.secs > 0);

  // ── Top apps mini chart data ─────────────────────────────────────────────────
  const topAppsChart = visApps.slice(0, 8).map(a => ({ name: a.name.length > 14 ? a.name.slice(0, 13) + '…' : a.name, hours: +(a.totalSecs / 3600).toFixed(2), color: a.cls?.color || '#7c6cf2' }));
  const topSitesChart = visSites.slice(0, 8).map(s => ({ name: s.domain.length > 16 ? s.domain.slice(0, 15) + '…' : s.domain, hours: +(s.totalSecs / 3600).toFixed(2), color: prodBadge(s.cls?.type)?.color || '#5BA7FF' }));

  return (
    <div style={{ marginTop: 8 }}>
      {/* Panel header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{ flex: 1 }}>
          <h3 style={{ fontSize: 15, fontWeight: 800, color: tx1, margin: 0 }}>Activity Sources</h3>
          <p style={{ fontSize: 12, color: tx3, margin: '3px 0 0' }}>Apps, websites &amp; events for <span style={{ color: '#7c6cf2', fontWeight: 700 }}>{filterLabel}</span></p>
        </div>
        {/* Search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: inputBg, border: `1px solid ${inputBrd}`, borderRadius: 9, padding: '6px 12px', minWidth: 200 }}>
          <Search size={13} style={{ color: tx3, flexShrink: 0 }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search apps, sites, events…"
            style={{ background: 'none', border: 'none', outline: 'none', fontSize: 12, color: tx1, width: '100%', '::placeholder': { color: tx3 } }} />
        </div>
        {onExportActivity && (
          <button onClick={onExportActivity} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: tx2, background: cardBg, border: `1px solid ${cardBrd}`, borderRadius: 9, padding: '7px 14px', cursor: 'pointer' }}>
            <Download size={13} /> Export
          </button>
        )}
      </div>

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'App Time',    value: fmtHrs(totalAutoSecs),  color: '#7c6cf2', icon: Monitor   },
          { label: 'Apps Used',   value: apps.length,             color: '#3DD6A4', icon: Layers    },
          { label: 'Websites',    value: websites.length,         color: '#5BA7FF', icon: Globe     },
          { label: 'Events',      value: filtered.length,         color: '#F2B84B', icon: Calendar  },
          { label: 'Focus Score', value: bk.focusScore + '%',     color: bk.focusScore >= 60 ? '#3DD6A4' : bk.focusScore >= 40 ? '#F2B84B' : '#f87171', icon: Flame },
        ].map(({ label, value, color, icon: Ic }) => (
          <div key={label} style={{ background: cardBg, border: `1px solid ${cardBrd}`, borderRadius: 12, padding: '12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
              <Ic size={12} style={{ color }} />
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: tx3 }}>{label}</span>
            </div>
            <span style={{ fontSize: 22, fontWeight: 800, color, lineHeight: 1 }}>{value}</span>
          </div>
        ))}
      </div>

      {/* Charts row */}
      {(topAppsChart.length > 0 || bkSegments.length > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: topSitesChart.length > 0 ? '1fr 1fr 260px' : '1fr 260px', gap: 12, marginBottom: 16 }}>
          {/* Top apps bar */}
          {topAppsChart.length > 0 && (
            <div style={{ background: cardBg, border: `1px solid ${cardBrd}`, borderRadius: 14, padding: '16px 18px' }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: tx1, marginBottom: 12 }}>Top Applications</p>
              <ResponsiveContainer width="100%" height={Math.max(topAppsChart.length * 28, 80)}>
                <BarChart data={topAppsChart} layout="vertical" margin={{ left: 0, right: 30, top: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={isLight ? 'rgba(0,0,0,0.05)' : '#273142'} horizontal={false} />
                  <XAxis type="number" tick={{ fill: isLight ? '#6B7280' : '#9AA6B8', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => v + 'h'} />
                  <YAxis type="category" dataKey="name" tick={{ fill: isLight ? '#374151' : '#9AA6B8', fontSize: 10 }} tickLine={false} axisLine={false} width={90} />
                  <Tooltip content={<ChartTip />} />
                  <Bar dataKey="hours" name="Time" radius={[0, 5, 5, 0]}>
                    {topAppsChart.map((d, i) => <Cell key={i} fill={d.color} fillOpacity={0.85} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          {/* Top sites bar */}
          {topSitesChart.length > 0 && (
            <div style={{ background: cardBg, border: `1px solid ${cardBrd}`, borderRadius: 14, padding: '16px 18px' }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: tx1, marginBottom: 12 }}>Top Websites</p>
              <ResponsiveContainer width="100%" height={Math.max(topSitesChart.length * 28, 80)}>
                <BarChart data={topSitesChart} layout="vertical" margin={{ left: 0, right: 30, top: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={isLight ? 'rgba(0,0,0,0.05)' : '#273142'} horizontal={false} />
                  <XAxis type="number" tick={{ fill: isLight ? '#6B7280' : '#9AA6B8', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => v + 'h'} />
                  <YAxis type="category" dataKey="name" tick={{ fill: isLight ? '#374151' : '#9AA6B8', fontSize: 10 }} tickLine={false} axisLine={false} width={100} />
                  <Tooltip content={<ChartTip />} />
                  <Bar dataKey="hours" name="Time" radius={[0, 5, 5, 0]}>
                    {topSitesChart.map((d, i) => <Cell key={i} fill={d.color} fillOpacity={0.85} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          {/* Productivity distribution */}
          <div style={{ background: cardBg, border: `1px solid ${cardBrd}`, borderRadius: 14, padding: '16px 18px' }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: tx1, marginBottom: 10 }}>Activity Breakdown</p>
            {/* Stacked bar */}
            <div style={{ display: 'flex', height: 10, borderRadius: 999, overflow: 'hidden', marginBottom: 12 }}>
              {bkSegments.map(seg => (
                <div key={seg.label} style={{ flex: seg.secs / bkTotal, background: seg.color, minWidth: seg.secs / bkTotal > 0.02 ? 4 : 0 }} />
              ))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {bkSegments.map(seg => (
                <div key={seg.label} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: seg.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: tx2, flex: 1 }}>{seg.label}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: tx1, fontVariantNumeric: 'tabular-nums' }}>{fmtHrs(seg.secs)}</span>
                  <span style={{ fontSize: 10, color: tx3, width: 30, textAlign: 'right' }}>{Math.round(seg.secs / bkTotal * 100)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* ── Applications ─────────────────────────────────────────────────── */}
        <CollapsibleSection title="Applications Used" icon={Monitor} count={visApps.length} defaultOpen isLight={isLight}>
          <div style={{ padding: '0 18px 14px' }}>
            {/* Sort strip */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 0 10px', borderBottom: `1px solid ${divBrd}` }}>
              <SortAsc size={11} style={{ color: tx3 }} />
              <span style={{ fontSize: 10, color: tx3, marginRight: 4 }}>Sort:</span>
              {[['time','Time'],['sessions','Sessions'],['deep','Deep Work'],['name','Name']].map(([f, l]) => (
                <SortBtn key={f} label={l} field={f} current={appSort} onSet={setAppSort} />
              ))}
            </div>
            {visApps.length === 0
              ? <p style={{ fontSize: 12, color: tx3, padding: '16px 0', textAlign: 'center' }}>No application data for this filter</p>
              : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginTop: 4 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${divBrd}` }}>
                      {['Application','Time','Deep Work','Sessions','% of Total'].map(h => (
                        <th key={h} style={{ padding: '8px 6px', textAlign: h === 'Application' ? 'left' : 'right', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: tx3 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visApps.slice(0, expandApp === '__all' ? 999 : 12).map(a => {
                      const pb  = prodBadge(a.cls?.type);
                      const pct = totalAutoSecs > 0 ? Math.round(a.totalSecs / totalAutoSecs * 100) : 0;
                      const isExp = expandApp === a.name;
                      return (
                        <React.Fragment key={a.name}>
                          <tr
                            onClick={() => setExpandApp(isExp ? null : a.name)}
                            style={{ borderBottom: `1px solid ${divBrd}`, cursor: 'pointer', transition: 'background 0.12s' }}
                            onMouseEnter={e => e.currentTarget.style.background = rowHov}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                          >
                            <td style={{ padding: '9px 6px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={{ width: 28, height: 28, borderRadius: 7, background: pb.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                  <Monitor size={13} style={{ color: pb.color }} />
                                </div>
                                <div>
                                  <span style={{ fontWeight: 600, color: tx1, display: 'block' }}>{a.name}</span>
                                  <span style={{ fontSize: 10, color: pb.color, background: pb.bg, padding: '1px 6px', borderRadius: 4, fontWeight: 600 }}>{pb.label}</span>
                                </div>
                              </div>
                            </td>
                            <td style={{ padding: '9px 6px', textAlign: 'right', fontWeight: 700, color: tx1, fontVariantNumeric: 'tabular-nums' }}>{fmtHrs(a.totalSecs)}</td>
                            <td style={{ padding: '9px 6px', textAlign: 'right', color: '#a78bfa', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{a.deepSecs > 0 ? fmtHrs(a.deepSecs) : <span style={{ color: tx3 }}>—</span>}</td>
                            <td style={{ padding: '9px 6px', textAlign: 'right', color: tx2, fontVariantNumeric: 'tabular-nums' }}>{a.sessions}</td>
                            <td style={{ padding: '9px 6px', textAlign: 'right' }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                                <div style={{ width: 48, height: 4, borderRadius: 999, background: isLight ? '#EEF2F7' : 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                                  <div style={{ width: `${pct}%`, height: '100%', background: pb.color, borderRadius: 999 }} />
                                </div>
                                <span style={{ fontSize: 11, fontWeight: 700, color: pb.color, width: 28, textAlign: 'right' }}>{pct}%</span>
                              </div>
                            </td>
                          </tr>
                          {isExp && (
                            <tr style={{ background: isLight ? '#F8FAFC' : 'rgba(124,108,242,0.04)' }}>
                              <td colSpan={5} style={{ padding: '10px 14px 12px 48px' }}>
                                <div style={{ display: 'flex', gap: 20 }}>
                                  {[
                                    { label: 'Total Time',  value: fmtDuration(a.totalSecs) },
                                    { label: 'Deep Work',   value: a.deepSecs > 0 ? fmtDuration(a.deepSecs) : '—' },
                                    { label: 'Avg Session', value: a.sessions > 0 ? fmtDuration(Math.round(a.totalSecs / a.sessions)) : '—' },
                                    { label: 'Category',    value: a.cls?.label || 'Other' },
                                  ].map(m => (
                                    <div key={m.label}>
                                      <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: tx3, marginBottom: 2 }}>{m.label}</p>
                                      <p style={{ fontSize: 13, fontWeight: 700, color: tx1 }}>{m.value}</p>
                                    </div>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              )
            }
            {visApps.length > 12 && expandApp !== '__all' && (
              <button onClick={() => setExpandApp('__all')} style={{ marginTop: 8, fontSize: 11, color: '#7c6cf2', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                Show all {visApps.length} apps ↓
              </button>
            )}
          </div>
        </CollapsibleSection>

        {/* ── Websites ─────────────────────────────────────────────────────── */}
        <CollapsibleSection title="Websites Visited" icon={Globe} count={visSites.length} isLight={isLight}>
          <div style={{ padding: '0 18px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 0 10px', borderBottom: `1px solid ${divBrd}` }}>
              <SortAsc size={11} style={{ color: tx3 }} />
              <span style={{ fontSize: 10, color: tx3, marginRight: 4 }}>Sort:</span>
              {[['time','Time'],['visits','Visits'],['name','Name']].map(([f, l]) => (
                <SortBtn key={f} label={l} field={f} current={siteSort} onSet={setSiteSort} />
              ))}
            </div>
            {visSites.length === 0
              ? <p style={{ fontSize: 12, color: tx3, padding: '16px 0', textAlign: 'center' }}>No website data for this filter</p>
              : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginTop: 4 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${divBrd}` }}>
                      {['Website','Time','Visits','Type','% of Total'].map(h => (
                        <th key={h} style={{ padding: '8px 6px', textAlign: h === 'Website' ? 'left' : 'right', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: tx3 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visSites.slice(0, 20).map(s => {
                      const pb  = prodBadge(s.cls?.type);
                      const pct = totalAutoSecs > 0 ? Math.round(s.totalSecs / totalAutoSecs * 100) : 0;
                      return (
                        <tr key={s.domain}
                          style={{ borderBottom: `1px solid ${divBrd}`, transition: 'background 0.12s' }}
                          onMouseEnter={e => e.currentTarget.style.background = rowHov}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          <td style={{ padding: '9px 6px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{ width: 24, height: 24, borderRadius: 6, background: pb.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <Globe size={12} style={{ color: pb.color }} />
                              </div>
                              <span style={{ fontWeight: 600, color: tx1 }}>{s.domain}</span>
                            </div>
                          </td>
                          <td style={{ padding: '9px 6px', textAlign: 'right', fontWeight: 700, color: tx1, fontVariantNumeric: 'tabular-nums' }}>{fmtHrs(s.totalSecs)}</td>
                          <td style={{ padding: '9px 6px', textAlign: 'right', color: tx2, fontVariantNumeric: 'tabular-nums' }}>{s.visits}</td>
                          <td style={{ padding: '9px 6px', textAlign: 'right' }}>
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 5, color: pb.color, background: pb.bg }}>{pb.label}</span>
                          </td>
                          <td style={{ padding: '9px 6px', textAlign: 'right' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                              <div style={{ width: 48, height: 4, borderRadius: 999, background: isLight ? '#EEF2F7' : 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                                <div style={{ width: `${pct}%`, height: '100%', background: pb.color, borderRadius: 999 }} />
                              </div>
                              <span style={{ fontSize: 11, fontWeight: 700, color: pb.color, width: 28, textAlign: 'right' }}>{pct}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )
            }
          </div>
        </CollapsibleSection>

        {/* ── Events Timeline ───────────────────────────────────────────────── */}
        <CollapsibleSection title="Events Timeline" icon={Calendar} count={visEvts.length} isLight={isLight}>
          <div style={{ padding: '0 18px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 0 10px', borderBottom: `1px solid ${divBrd}` }}>
              <SortAsc size={11} style={{ color: tx3 }} />
              <span style={{ fontSize: 10, color: tx3, marginRight: 4 }}>Sort:</span>
              {[['time','Newest'],['duration','Duration'],['name','Name']].map(([f, l]) => (
                <SortBtn key={f} label={l} field={f} current={evtSort} onSet={setEvtSort} />
              ))}
            </div>
            {visEvts.length === 0
              ? <p style={{ fontSize: 12, color: tx3, padding: '16px 0', textAlign: 'center' }}>No events for this filter</p>
              : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                  {visEvts.slice(0, 30).map(ev => {
                    const dt    = new Date((ev.started_at || 0) * 1000);
                    const end   = ev.ended_at ? new Date(ev.ended_at * 1000) : null;
                    const pb    = prodBadge(ev.is_deep_work ? 'deep' : ev.is_meeting ? 'meeting' : ev.category === 'Break' ? 'neutral' : 'shallow');
                    const dur   = fmtDuration(ev.duration_seconds || (ev.ended_at ? ev.ended_at - ev.started_at : 0));
                    return (
                      <div key={ev.id}
                        style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 0', borderBottom: `1px solid ${divBrd}`, transition: 'background 0.12s', borderRadius: 8, paddingLeft: 4 }}
                        onMouseEnter={e => e.currentTarget.style.background = rowHov}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        {/* Time column */}
                        <div style={{ minWidth: 84, flexShrink: 0 }}>
                          <p style={{ fontSize: 11, fontWeight: 700, color: tx2, fontVariantNumeric: 'tabular-nums' }}>
                            {dt.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                          {end && <p style={{ fontSize: 10, color: tx3, fontVariantNumeric: 'tabular-nums' }}>→ {end.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })}</p>}
                          <p style={{ fontSize: 10, color: tx3 }}>{dt.toLocaleDateString('en', { month: 'short', day: 'numeric' })}</p>
                        </div>
                        {/* Dot */}
                        <div style={{ marginTop: 4, width: 8, height: 8, borderRadius: '50%', background: pb.color, flexShrink: 0 }} />
                        {/* Content */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 12, fontWeight: 700, color: tx1, marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {ev.title || ev.category || 'Session'}
                          </p>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 10, fontWeight: 700, color: pb.color, background: pb.bg, padding: '1px 6px', borderRadius: 4 }}>{pb.label}</span>
                            {ev.category && <span style={{ fontSize: 10, color: tx3 }}>{ev.category}</span>}
                            {ev.project_name && <span style={{ fontSize: 10, color: '#7c6cf2', background: 'rgba(124,108,242,0.1)', padding: '1px 6px', borderRadius: 4 }}>{ev.project_name}</span>}
                            {ev.client_name && <span style={{ fontSize: 10, color: '#5BA7FF', background: 'rgba(91,167,255,0.1)', padding: '1px 6px', borderRadius: 4 }}>{ev.client_name}</span>}
                          </div>
                        </div>
                        {/* Duration */}
                        <div style={{ flexShrink: 0, textAlign: 'right' }}>
                          <p style={{ fontSize: 12, fontWeight: 800, color: tx1 }}>{dur}</p>
                        </div>
                      </div>
                    );
                  })}
                  {visEvts.length > 30 && <p style={{ fontSize: 11, color: tx3, textAlign: 'center', padding: '8px 0' }}>+{visEvts.length - 30} more events — narrow your date range to see all</p>}
                </div>
              )
            }
          </div>
        </CollapsibleSection>

      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function ProjectAnalyticsPage({ user }) {
  const [period,        setPeriod]        = useState(30);
  const [customFrom,    setCustomFrom]    = useState('');
  const [customTo,      setCustomTo]      = useState('');
  const [sessions,      setSessions]      = useState([]);
  const [projects,      setProjects]      = useState([]);
  const [clients,       setClients]       = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [filterProject, setFilterProject] = useState('all');
  const [filterClient,  setFilterClient]  = useState('all');
  const [filterCat,     setFilterCat]     = useState('all');
  const [projSort,      setProjSort]      = useState({ field: 'totalSeconds', dir: 'desc' });
  const [clientSort,    setClientSort]    = useState({ field: 'totalSeconds', dir: 'desc' });
  const [exportOpen,    setExportOpen]    = useState(false);
  const [autoSessions,  setAutoSessions]  = useState([]);

  // ── Date range ─────────────────────────────────────────────────────────────
  const { fromTs, toTs, effectiveDays, dateLabel } = useMemo(() => {
    const now = Math.floor(Date.now() / 1000);
    if (period === 'custom' && customFrom && customTo) {
      const f = Math.floor(new Date(customFrom).getTime() / 1000);
      const t = Math.floor(new Date(customTo).getTime() / 1000) + 86400;
      const days = Math.max(1, Math.round((t - f) / 86400));
      return { fromTs: f, toTs: t, effectiveDays: days, dateLabel: `${customFrom}_${customTo}` };
    }
    return {
      fromTs: now - period * 86400,
      toTs: now,
      effectiveDays: period,
      dateLabel: `last-${period}d`,
    };
  }, [period, customFrom, customTo]);

  // ── Load data ──────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (period === 'custom' && (!customFrom || !customTo)) return;
    setLoading(true);
    try {
      const [projs, clts, sess, auto] = await Promise.all([
        api.listProjects?.({ userId: user.id })                               ?? [],
        api.listClients?.({ userId: user.id })                                ?? [],
        api.listSessions?.({ userId: user.id, from: fromTs, to: toTs })       ?? [],
        api.autoSessionsRange?.({ userId: user.id, from: fromTs, to: toTs })  ?? [],
      ]);
      setProjects(Array.isArray(projs) ? projs : []);
      setClients(Array.isArray(clts)  ? clts  : []);
      setSessions(Array.isArray(sess) ? sess  : []);
      setAutoSessions(Array.isArray(auto) ? auto : []);
    } catch { /* silent — fallback to empty state */ }
    finally { setLoading(false); }
  }, [user.id, fromTs, toTs, period, customFrom, customTo]);

  useEffect(() => { load(); }, [load]);

  // ── Filtered sessions ──────────────────────────────────────────────────────
  const filtered = useMemo(() => sessions.filter(s => {
    if (filterProject !== 'all' && s.project_id !== filterProject) return false;
    if (filterClient  !== 'all') {
      const cid = s.client_id || projects.find(p => p.id === s.project_id)?.client_id;
      if (cid !== filterClient) return false;
    }
    if (filterCat !== 'all' && (s.category || 'General') !== filterCat) return false;
    return true;
  }), [sessions, filterProject, filterClient, filterCat, projects]);

  // ── Activity Sources data (cross-reference auto_sessions with filtered sessions)
  const activityData = useMemo(() => {
    const anyFilter = filterProject !== 'all' || filterClient !== 'all' || filterCat !== 'all';
    if (!anyFilter || filtered.length === 0) return null;

    // Time windows of all filtered sessions
    const intervals = filtered.map(s => ({
      from: s.started_at,
      to:   s.ended_at || (s.started_at + (s.duration_seconds || 0)),
    }));

    // Deep-work intervals for per-app deep overlap calculation
    const deepIntervals = filtered
      .filter(s => s.is_deep_work)
      .map(s => ({ from: s.started_at, to: s.ended_at || (s.started_at + (s.duration_seconds || 0)) }));

    function deepOverlap(as) {
      const asEnd = as.ended_at || (as.started_at + (as.duration_seconds || 0));
      return deepIntervals.reduce((sum, di) => {
        const s = Math.max(as.started_at, di.from);
        const e = Math.min(asEnd, di.to);
        return e > s ? sum + (e - s) : sum;
      }, 0);
    }

    // Filter auto_sessions to those overlapping filtered session windows
    const relevant = autoSessions.filter(as => {
      if (as.is_idle) return false;
      const asEnd = as.ended_at || (as.started_at + (as.duration_seconds || 0));
      return intervals.some(si => as.started_at < si.to && asEnd > si.from);
    });

    // Apps aggregation
    const appMap = {};
    relevant.forEach(as => {
      const key = normaliseApp(as.app_name).toLowerCase();
      if (!appMap[key]) {
        const cls = classifyActivityApp(as.app_name || '');
        appMap[key] = { name: normaliseApp(as.app_name), cls, totalSecs: 0, deepSecs: 0, sessions: 0 };
      }
      appMap[key].totalSecs += as.duration_seconds || 0;
      appMap[key].deepSecs  += Math.min(deepOverlap(as), as.duration_seconds || 0);
      appMap[key].sessions  += 1;
    });

    // Websites aggregation (from auto_sessions with url)
    const siteMap = {};
    relevant.filter(as => as.url).forEach(as => {
      const domain = fmtDomain(as.url);
      if (!domain || domain === '—') return;
      if (!siteMap[domain]) {
        const cls = classifyActivitySession(as);
        siteMap[domain] = { domain, cls, totalSecs: 0, visits: 0 };
      }
      siteMap[domain].totalSecs += as.duration_seconds || 0;
      siteMap[domain].visits    += 1;
    });

    const totalAutoSecs = relevant.reduce((a, s) => a + (s.duration_seconds || 0), 0);

    // Activity breakdown from filtered sessions
    const deepSecs       = filtered.filter(s => s.is_deep_work).reduce((a, s) => a + (s.duration_seconds || 0), 0);
    const meetingSecs    = filtered.filter(s => s.is_meeting).reduce((a, s) => a + (s.duration_seconds || 0), 0);
    const totalFilterSecs = filtered.reduce((a, s) => a + (s.duration_seconds || 0), 0);

    // Classify remaining auto-session time
    let productiveSecs = 0, neutralSecs = 0, distractingSecs = 0;
    relevant.forEach(as => {
      const t = classifyActivityApp(as.app_name || '').type;
      const d = as.duration_seconds || 0;
      if (t === 'deep' || t === 'shallow') productiveSecs += d;
      else if (t === 'distraction')        distractingSecs += d;
      else                                 neutralSecs     += d;
    });

    const focusScore = totalFilterSecs > 0
      ? Math.round(((deepSecs + productiveSecs * 0.5) / Math.max(totalFilterSecs, totalAutoSecs, 1)) * 100)
      : 0;

    return {
      apps:     Object.values(appMap).sort((a, b) => b.totalSecs - a.totalSecs),
      websites: Object.values(siteMap).sort((a, b) => b.totalSecs - a.totalSecs),
      totalAutoSecs,
      breakdown: {
        deep: deepSecs, meeting: meetingSecs,
        productive: productiveSecs, neutral: neutralSecs,
        distracting: distractingSecs,
        focusScore: Math.min(focusScore, 100),
      },
    };
  }, [autoSessions, filtered, filterProject, filterClient, filterCat]);

  // ── Project aggregation ────────────────────────────────────────────────────
  const projectRows = useMemo(() => {
    const map = {};
    filtered.forEach(s => {
      const pid = s.project_id;
      if (!pid) return;
      if (!map[pid]) {
        const p = projects.find(p => p.id === pid);
        const colorIdx = Object.keys(map).length;
        map[pid] = {
          id:             pid,
          name:           p?.name || 'Unknown Project',
          color:          p?.color || PROJ_PALETTE[colorIdx % PROJ_PALETTE.length],
          status:         p?.status || 'active',
          clientId:       p?.client_id,
          hourlyRate:     p?.hourly_rate || 0,
          weeklyBudget:   p?.weekly_budget_hours || 0,
          totalSeconds:   0,
          deepSeconds:    0,
          meetingSeconds: 0,
          sessionCount:   0,
          ctxSwitches:    0,
        };
      }
      const dur = s.duration_seconds || 0;
      map[pid].totalSeconds   += dur;
      if (s.is_deep_work)  map[pid].deepSeconds    += dur;
      if (isMeeting(s))    map[pid].meetingSeconds += dur;
      map[pid].sessionCount++;
      map[pid].ctxSwitches += s.context_switches || 0;
    });
    return Object.values(map);
  }, [filtered, projects]);

  const sortedProjects = useMemo(() => {
    return [...projectRows].sort((a, b) => {
      const av = a[projSort.field] ?? 0, bv = b[projSort.field] ?? 0;
      const cmp = typeof av === 'string' ? av.localeCompare(bv) : av - bv;
      return projSort.dir === 'asc' ? cmp : -cmp;
    });
  }, [projectRows, projSort]);

  // ── Client aggregation ─────────────────────────────────────────────────────
  const clientRows = useMemo(() => {
    const map = {};
    filtered.forEach(s => {
      let cid = s.client_id;
      if (!cid && s.project_id) cid = projects.find(p => p.id === s.project_id)?.client_id;
      if (!cid) return;
      if (!map[cid]) {
        const c = clients.find(c => c.id === cid);
        const colorIdx = Object.keys(map).length;
        map[cid] = {
          id:             cid,
          name:           c?.name || 'Unknown Client',
          color:          c?.color || CLIENT_PALETTE[colorIdx % CLIENT_PALETTE.length],
          company:        c?.company || '',
          billingType:    c?.billing_type || 'none',
          hourlyRate:     c?.hourly_rate || 0,
          totalSeconds:   0,
          meetingSeconds: 0,
          sessionCount:   0,
        };
      }
      const dur = s.duration_seconds || 0;
      map[cid].totalSeconds   += dur;
      if (isMeeting(s)) map[cid].meetingSeconds += dur;
      map[cid].sessionCount++;
    });
    return Object.values(map);
  }, [filtered, projects, clients]);

  const sortedClients = useMemo(() => {
    return [...clientRows].sort((a, b) => {
      const av = a[clientSort.field] ?? 0, bv = b[clientSort.field] ?? 0;
      const cmp = typeof av === 'string' ? av.localeCompare(bv) : av - bv;
      return clientSort.dir === 'asc' ? cmp : -cmp;
    });
  }, [clientRows, clientSort]);

  // ── Summary metrics ────────────────────────────────────────────────────────
  const totalSecs    = filtered.reduce((a, s) => a + (s.duration_seconds || 0), 0);
  const deepSecs     = filtered.filter(s => s.is_deep_work).reduce((a, s) => a + (s.duration_seconds || 0), 0);
  const meetSecs     = filtered.filter(isMeeting).reduce((a, s) => a + (s.duration_seconds || 0), 0);
  const deepPct      = pctOf(deepSecs, totalSecs);
  const activeProjs  = projectRows.filter(p => p.status === 'active').length;
  const billableSecs = clientRows
    .filter(c => c.billingType !== 'none')
    .reduce((a, c) => a + c.totalSeconds, 0);

  // ── Daily trend data ───────────────────────────────────────────────────────
  const dailyData = useMemo(() => {
    const dateMap = {};
    filtered.forEach(s => {
      const dk = localDateKey(s.started_at);
      if (!dateMap[dk]) dateMap[dk] = { deep: 0, meetings: 0, other: 0 };
      const dur = s.duration_seconds || 0;
      if (s.is_deep_work) dateMap[dk].deep     += dur;
      else if (isMeeting(s)) dateMap[dk].meetings += dur;
      else dateMap[dk].other += dur;
    });
    const pts = [];
    const cur = new Date(fromTs * 1000); cur.setHours(0, 0, 0, 0);
    const end = new Date(toTs * 1000);
    while (cur <= end) {
      const dk  = localDateKey(Math.floor(cur.getTime() / 1000));
      const d   = dateMap[dk] || { deep: 0, meetings: 0, other: 0 };
      const lbl = effectiveDays <= 14
        ? cur.toLocaleDateString('en', { month: 'short', day: 'numeric' })
        : cur.toLocaleDateString('en', { month: 'short', day: 'numeric' });
      pts.push({
        date:          lbl,
        'Deep Work':   +(d.deep     / 3600).toFixed(2),
        'Meetings':    +(d.meetings / 3600).toFixed(2),
        'Other Work':  +(d.other    / 3600).toFixed(2),
      });
      cur.setDate(cur.getDate() + 1);
    }
    return pts;
  }, [filtered, fromTs, toTs, effectiveDays]);

  // ── Project chart data (horizontal bar) ────────────────────────────────────
  const projBarData = useMemo(() =>
    [...projectRows]
      .sort((a, b) => b.totalSeconds - a.totalSeconds)
      .slice(0, 10)
      .map(p => ({
        name:        p.name.length > 20 ? p.name.slice(0, 18) + '…' : p.name,
        fullName:    p.name,
        color:       p.color,
        'Total':     +(p.totalSeconds / 3600).toFixed(2),
        'Deep Work': +(p.deepSeconds  / 3600).toFixed(2),
        'Meetings':  +(p.meetingSeconds / 3600).toFixed(2),
      })),
  [projectRows]);

  // ── Client pie data ────────────────────────────────────────────────────────
  const clientPie = useMemo(() =>
    [...clientRows]
      .sort((a, b) => b.totalSeconds - a.totalSeconds)
      .slice(0, 8)
      .map((c, i) => ({
        name:  c.name,
        value: +(c.totalSeconds / 3600).toFixed(2),
        color: c.color || CLIENT_PALETTE[i % CLIENT_PALETTE.length],
      })),
  [clientRows]);

  // ── Category breakdown ─────────────────────────────────────────────────────
  const catData = useMemo(() => {
    const map = {};
    filtered.forEach(s => {
      const cat = s.category || 'General';
      map[cat] = (map[cat] || 0) + (s.duration_seconds || 0);
    });
    return Object.entries(map)
      .map(([name, secs], i) => ({
        name,
        value: +(secs / 3600).toFixed(2),
        color: CAT_COLOR_MAP[name] || PROJ_PALETTE[i % PROJ_PALETTE.length],
      }))
      .sort((a, b) => b.value - a.value);
  }, [filtered]);

  // ── Unique categories (for filter dropdown) ────────────────────────────────
  const allCategories = useMemo(() => {
    const s = new Set(sessions.map(s => s.category || 'General'));
    return [...s].sort();
  }, [sessions]);

  // ── Sort handlers ──────────────────────────────────────────────────────────
  const handleProjSort = (field) => setProjSort(prev => ({
    field, dir: prev.field === field && prev.dir === 'desc' ? 'asc' : 'desc',
  }));
  const handleClientSort = (field) => setClientSort(prev => ({
    field, dir: prev.field === field && prev.dir === 'desc' ? 'asc' : 'desc',
  }));

  // ── Interval hint for XAxis ────────────────────────────────────────────────
  const xInterval = effectiveDays <= 7 ? 0 : effectiveDays <= 30 ? Math.floor(effectiveDays / 10) : Math.floor(effectiveDays / 8);

  const isLight   = useThemeLight();
  const TT        = isLight ? TOOLTIP_STYLE_LIGHT : TOOLTIP_STYLE;
  const chartGrid = isLight ? 'rgba(0,0,0,0.06)' : CHART_GRID;

  // ── Activity Sources filter label ──────────────────────────────────────────
  const filterLabel = useMemo(() => {
    if (filterProject !== 'all') {
      const p = projects.find(p => p.id === filterProject);
      return p?.name || 'Selected Project';
    }
    if (filterClient !== 'all') {
      const c = clients.find(c => c.id === filterClient);
      return c?.name || 'Selected Client';
    }
    if (filterCat !== 'all') return filterCat;
    return null;
  }, [filterProject, filterClient, filterCat, projects, clients]);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="fl-report-page flex h-full min-h-0 flex-col overflow-y-auto" style={{ background: 'var(--color-bg-app)' }}>

      {/* ── Sticky header ──────────────────────────────────────────────────── */}
      <div
        className="sticky top-0 z-20 border-b border-white/[0.06]"
        style={{ background: isLight ? 'rgba(248,250,252,0.97)' : 'rgba(13,17,28,0.97)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}
      >
        {/* Title row */}
        <div className="flex items-center justify-between px-8 pt-6 pb-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-tx-faint">
              Reports &rsaquo; Business Intelligence
            </p>
            <h1 className="mt-1 text-[22px] font-extrabold leading-none tracking-tight text-tx-primary">
              Project &amp; Client Analytics
            </h1>
            <p className="mt-1.5 text-[13px] text-tx-muted">
              Deep insights into time, focus, and work distribution across projects and clients
            </p>
          </div>
          <button
            onClick={() => setExportOpen(true)}
            className="fl-report-export flex items-center gap-2 rounded-[10px] border border-white/[0.08] px-4 py-2.5 text-[13px] font-semibold text-tx-secondary transition-all duration-150 hover:border-accent/40 hover:bg-accent/[0.08] hover:text-accent"
            style={{ background: 'rgba(255,255,255,0.03)' }}
          >
            <Download size={14} />
            Export
          </button>
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-2 px-8 pb-4">
          {/* Period pills */}
          <div
            className="fl-report-segmented flex items-center gap-0.5 rounded-[10px] border border-white/[0.07] p-1"
            style={{ background: 'rgba(255,255,255,0.025)' }}
          >
            {PERIODS.map(p => (
              <button
                key={p.label}
                onClick={() => setPeriod(p.days)}
                className={`fl-report-chip rounded-[7px] px-3 py-1.5 text-[12px] font-semibold transition-all duration-150 ${
                  period === p.days
                    ? 'bg-accent text-white shadow-sm fl-report-chip-active'
                    : 'text-tx-muted hover:bg-white/[0.05] hover:text-tx-primary'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {period === 'custom' && (
            <>
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                className="rounded-[8px] border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-[12px] text-tx-primary outline-none focus:border-accent/40" />
              <span className="text-[12px] text-tx-faint">to</span>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                className="rounded-[8px] border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-[12px] text-tx-primary outline-none focus:border-accent/40" />
            </>
          )}

          <div className="mx-1 h-4 w-px bg-white/[0.08]" />

          {/* Client filter */}
          <div className="relative">
            <select value={filterClient} onChange={e => setFilterClient(e.target.value)}
              className="appearance-none rounded-[9px] border border-white/[0.08] bg-bg-card px-3 py-1.5 pr-7 text-[12px] font-medium text-tx-secondary outline-none transition-all hover:border-white/[0.14] focus:border-accent/40">
              <option value="all">All Clients</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <ChevronDown size={11} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-tx-faint" />
          </div>

          {/* Project filter */}
          <div className="relative">
            <select value={filterProject} onChange={e => setFilterProject(e.target.value)}
              className="appearance-none rounded-[9px] border border-white/[0.08] bg-bg-card px-3 py-1.5 pr-7 text-[12px] font-medium text-tx-secondary outline-none transition-all hover:border-white/[0.14] focus:border-accent/40">
              <option value="all">All Projects</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <ChevronDown size={11} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-tx-faint" />
          </div>

          {/* Category filter */}
          <div className="relative">
            <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
              className="appearance-none rounded-[9px] border border-white/[0.08] bg-bg-card px-3 py-1.5 pr-7 text-[12px] font-medium text-tx-secondary outline-none transition-all hover:border-white/[0.14] focus:border-accent/40">
              <option value="all">All Categories</option>
              {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <ChevronDown size={11} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-tx-faint" />
          </div>

          {(filterProject !== 'all' || filterClient !== 'all' || filterCat !== 'all') && (
            <button
              onClick={() => { setFilterProject('all'); setFilterClient('all'); setFilterCat('all'); }}
              className="flex items-center gap-1.5 rounded-[8px] border border-red-500/20 bg-red-500/[0.06] px-3 py-1.5 text-[11px] font-semibold text-red-400 transition-all hover:border-red-500/40 hover:bg-red-500/[0.10]"
            >
              <Minus size={10} />
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* ── Page content ────────────────────────────────────────────────────── */}
      <div className="flex-1 space-y-6 p-8">

        {loading ? (
          <div className="flex items-center justify-center py-32">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
              <p className="text-[13px] text-tx-faint">Loading analytics…</p>
            </div>
          </div>
        ) : (
          <>
            {/* ── KPI Row ─────────────────────────────────────────────────── */}
            <div className="grid grid-cols-4 gap-4">
              <KpiCard
                icon={Clock}
                label="Total Tracked"
                value={fmtHrs(totalSecs)}
                sub={`${filtered.length} sessions · ${effectiveDays}d period`}
                accentHex="#7c6cf2"
              />
              <KpiCard
                icon={Brain}
                label="Deep Work"
                value={fmtHrs(deepSecs)}
                sub={`${deepPct}% of total tracked time`}
                accentHex="#5BA7FF"
              />
              <KpiCard
                icon={Briefcase}
                label="Projects Tracked"
                value={projectRows.length}
                sub={`${activeProjs} active · ${projectRows.length - activeProjs} other`}
                accentHex="#3DD6A4"
              />
              <KpiCard
                icon={Users}
                label="Clients Worked"
                value={clientRows.length}
                sub={`${fmtHrs(billableSecs)} billable time`}
                accentHex="#F2B84B"
              />
            </div>

            {/* ══ PROJECT ANALYTICS ══════════════════════════════════════════ */}
            <SectionDivider label="Project Analytics" color="rgba(124,108,242,0.55)" />

            {/* Hours per project + Deep work vs Meetings */}
            <div className="grid grid-cols-2 gap-4">
              <SectionCard title="Time per Project" subtitle="Total tracked hours, top 10 ranked by volume">
                {projBarData.length === 0 ? (
                  <EmptyState msg="Assign sessions to projects to see analytics" />
                ) : (
                  <div style={{ height: Math.max(200, projBarData.length * 36 + 24) }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={projBarData} layout="vertical" margin={{ left: 4, right: 28, top: 4, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} horizontal={false} />
                        <XAxis type="number" tick={CHART_TICK} tickLine={false} axisLine={false} tickFormatter={v => v + 'h'} />
                        <YAxis type="category" dataKey="name" tick={CHART_TICK} tickLine={false} axisLine={false} width={108} />
                        <Tooltip content={<ChartTip />} />
                        <Bar dataKey="Total" radius={[0, 5, 5, 0]}>
                          {projBarData.map((entry, i) => (
                            <Cell key={i} fill={entry.color || PROJ_PALETTE[i % PROJ_PALETTE.length]} fillOpacity={0.88} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </SectionCard>

              <SectionCard title="Deep Work vs Meetings" subtitle="Focus quality breakdown per project">
                {projBarData.length === 0 ? (
                  <EmptyState msg="No project data available" />
                ) : (
                  <div style={{ height: Math.max(200, projBarData.length * 36 + 24) }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={projBarData} layout="vertical" margin={{ left: 4, right: 16, top: 4, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} horizontal={false} />
                        <XAxis type="number" tick={CHART_TICK} tickLine={false} axisLine={false} tickFormatter={v => v + 'h'} />
                        <YAxis type="category" dataKey="name" tick={CHART_TICK} tickLine={false} axisLine={false} width={108} />
                        <Tooltip content={<ChartTip />} />
                        <Bar dataKey="Deep Work" fill="#7c6cf2" fillOpacity={0.88} />
                        <Bar dataKey="Meetings"  fill="#F27C8A" fillOpacity={0.88} radius={[0, 5, 5, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </SectionCard>
            </div>

            {/* Project Focus Efficiency */}
            {projectRows.length > 0 && (
              <SectionCard title="Project Focus Efficiency" subtitle="Deep work percentage per project — green ≥ 60%, amber ≥ 40%, red < 40%">
                <div className="grid grid-cols-2 gap-x-10 gap-y-5">
                  {[...projectRows]
                    .sort((a, b) => pctOf(b.deepSeconds, b.totalSeconds) - pctOf(a.deepSeconds, a.totalSeconds))
                    .slice(0, 10)
                    .map(p => {
                      const fp = pctOf(p.deepSeconds, p.totalSeconds);
                      const mp = pctOf(p.meetingSeconds, p.totalSeconds);
                      const fc = fp >= 60 ? '#3DD6A4' : fp >= 40 ? '#F2B84B' : '#F27C8A';
                      return (
                        <div key={p.id} className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-2">
                              <ColorDot color={p.color} size={7} />
                              <span className="truncate text-[12px] font-semibold text-tx-secondary max-w-[150px]">{p.name}</span>
                            </div>
                            <div className="flex shrink-0 items-center gap-3">
                              <span className="text-[11px] text-tx-faint">{fmtHrs(p.totalSeconds)}</span>
                              <span className="num w-9 text-right text-[12px] font-bold tabular-nums" style={{ color: fc }}>{fp}%</span>
                            </div>
                          </div>
                          {/* Segmented progress: deep work | meetings | other */}
                          <div className="relative h-2 overflow-hidden rounded-full bg-white/[0.06]">
                            <div className="absolute left-0 top-0 h-full rounded-l-full"
                              style={{ width: `${fp}%`, background: `linear-gradient(90deg,${fc}88,${fc})` }} />
                            {mp > 0 && (
                              <div className="absolute top-0 h-full opacity-70"
                                style={{ left: `${fp}%`, width: `${mp}%`, background: '#F27C8A' }} />
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-[10px] text-tx-faint">
                            <span className="flex items-center gap-1">
                              <span className="h-1.5 w-1.5 rounded-full bg-[#7c6cf2]" />
                              {fmtHrs(p.deepSeconds)} deep
                            </span>
                            <span className="flex items-center gap-1">
                              <span className="h-1.5 w-1.5 rounded-full bg-[#F27C8A]" />
                              {fmtHrs(p.meetingSeconds)} meetings
                            </span>
                            <span className="ml-auto">{p.sessionCount} sessions</span>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </SectionCard>
            )}

            {/* Project trends over time */}
            <SectionCard title="Project Trends" subtitle="Hours tracked per project over the selected period (top 5)">
              <ProjectTrendChart sessions={filtered} projects={projects} fromTs={fromTs} toTs={toTs} />
            </SectionCard>

            {/* Project details table */}
            <SectionCard
              title="Project Details"
              subtitle={`${sortedProjects.length} project${sortedProjects.length !== 1 ? 's' : ''} with tracked time`}
            >
              {sortedProjects.length === 0 ? (
                <EmptyState msg="No project sessions found. Assign sessions to projects to see data." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr className="border-b border-white/[0.05]">
                        <th className="py-3 pr-4 text-left">
                          <SortableHeader label="Project" field="name" sortField={projSort.field} sortDir={projSort.dir} onSort={handleProjSort} />
                        </th>
                        <th className="py-3 pr-4 text-right">
                          <SortableHeader label="Total" field="totalSeconds" sortField={projSort.field} sortDir={projSort.dir} onSort={handleProjSort} />
                        </th>
                        <th className="py-3 pr-4 text-right">
                          <SortableHeader label="Deep Work" field="deepSeconds" sortField={projSort.field} sortDir={projSort.dir} onSort={handleProjSort} />
                        </th>
                        <th className="py-3 pr-4 text-right">
                          <SortableHeader label="Meetings" field="meetingSeconds" sortField={projSort.field} sortDir={projSort.dir} onSort={handleProjSort} />
                        </th>
                        <th className="py-3 pr-4 text-right">
                          <SortableHeader label="Sessions" field="sessionCount" sortField={projSort.field} sortDir={projSort.dir} onSort={handleProjSort} />
                        </th>
                        <th className="py-3 pr-6 text-center">
                          <span className="text-[11px] font-bold uppercase tracking-wide text-tx-faint">Focus %</span>
                        </th>
                        <th className="py-3 text-center">
                          <span className="text-[11px] font-bold uppercase tracking-wide text-tx-faint">Status</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedProjects.map(p => {
                        const fp     = pctOf(p.deepSeconds, p.totalSeconds);
                        const fc     = fp >= 60 ? '#3DD6A4' : fp >= 40 ? '#F2B84B' : '#F27C8A';
                        const client = clients.find(c => c.id === p.clientId);
                        return (
                          <tr key={p.id} className="group border-b border-white/[0.04] transition-colors hover:bg-white/[0.025]">
                            <td className="py-3.5 pr-4">
                              <div className="flex min-w-0 items-center gap-2.5">
                                <div className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: p.color }} />
                                <div className="min-w-0">
                                  <span className="block truncate font-semibold text-tx-primary max-w-[180px]">{p.name}</span>
                                  {client && <span className="text-[10px] text-tx-faint">{client.name}</span>}
                                </div>
                              </div>
                            </td>
                            <td className="py-3.5 pr-4 text-right">
                              <span className="num font-semibold text-tx-primary">{fmtHrs(p.totalSeconds)}</span>
                            </td>
                            <td className="py-3.5 pr-4 text-right">
                              <span className="num font-medium" style={{ color: '#7c6cf2' }}>{fmtHrs(p.deepSeconds)}</span>
                            </td>
                            <td className="py-3.5 pr-4 text-right">
                              <span className="num font-medium" style={{ color: '#F27C8A' }}>{fmtHrs(p.meetingSeconds)}</span>
                            </td>
                            <td className="py-3.5 pr-4 text-right">
                              <span className="num text-tx-secondary">{p.sessionCount}</span>
                            </td>
                            <td className="py-3.5 pr-4">
                              <div className="flex items-center gap-2.5">
                                <div className="min-w-0 flex-1">
                                  <MiniBar value={p.deepSeconds} max={p.totalSeconds} color={fc} />
                                </div>
                                <span className="num w-8 shrink-0 text-right text-[11px] text-tx-muted">{fp}%</span>
                              </div>
                            </td>
                            <td className="py-3.5 text-center">
                              <StatusBadge status={p.status} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>

            {/* ══ CLIENT ANALYTICS ═══════════════════════════════════════════ */}
            <SectionDivider label="Client Analytics" color="rgba(91,167,255,0.55)" />

            <div className="grid grid-cols-2 gap-4">
              {/* Client workload donut */}
              <SectionCard title="Client Workload Distribution" subtitle="Time share across clients">
                {clientPie.length === 0 ? (
                  <EmptyState msg="Assign sessions or projects to clients to see data" />
                ) : (
                  <div className="flex items-center gap-6">
                    <div className="shrink-0" style={{ width: 190, height: 190 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={clientPie} cx="50%" cy="50%" innerRadius={52} outerRadius={82}
                            paddingAngle={2} dataKey="value" strokeWidth={0}>
                            {clientPie.map((entry, i) => (
                              <Cell key={i} fill={entry.color} fillOpacity={0.90} />
                            ))}
                          </Pie>
                          <Tooltip formatter={v => [`${v}h`, '']} contentStyle={TT} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex-1 min-w-0 space-y-2.5">
                      {clientPie.map((c, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: c.color }} />
                          <span className="flex-1 truncate text-[12px] text-tx-secondary">{c.name}</span>
                          <span className="num shrink-0 text-[12px] font-semibold text-tx-primary">{c.value}h</span>
                          <span className="num w-9 shrink-0 text-right text-[10px] text-tx-faint">
                            {pctOf(c.value * 3600, totalSecs)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </SectionCard>

              {/* Meeting load by client */}
              <SectionCard title="Meeting Load by Client" subtitle="Productive time vs meeting time per client">
                {clientRows.length === 0 ? (
                  <EmptyState msg="No client data available" />
                ) : (
                  <div style={{ height: 220 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={[...clientRows]
                          .sort((a, b) => b.totalSeconds - a.totalSeconds)
                          .slice(0, 8)
                          .map(c => ({
                            name:        c.name.length > 12 ? c.name.slice(0, 10) + '…' : c.name,
                            'Productive': +((c.totalSeconds - c.meetingSeconds) / 3600).toFixed(2),
                            'Meetings':   +(c.meetingSeconds / 3600).toFixed(2),
                            color:        c.color,
                          }))}
                        margin={{ top: 4, right: 8, left: -10, bottom: 4 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} vertical={false} />
                        <XAxis dataKey="name" tick={CHART_TICK} tickLine={false} axisLine={false} />
                        <YAxis tick={CHART_TICK} tickLine={false} axisLine={false} tickFormatter={v => v + 'h'} />
                        <Tooltip content={<ChartTip />} />
                        <Bar dataKey="Productive" stackId="a" fill="#5BA7FF" fillOpacity={0.85} />
                        <Bar dataKey="Meetings"   stackId="a" fill="#F27C8A" fillOpacity={0.85} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                    <div className="mt-3 flex items-center justify-center gap-5">
                      {[['Productive', '#5BA7FF'], ['Meetings', '#F27C8A']].map(([lbl, col]) => (
                        <span key={lbl} className="flex items-center gap-1.5 text-[11px] text-tx-muted">
                          <span className="h-1.5 w-3 rounded-full" style={{ background: col }} />
                          {lbl}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </SectionCard>
            </div>

            {/* Client details table */}
            <SectionCard
              title="Client Details"
              subtitle={`${sortedClients.length} client${sortedClients.length !== 1 ? 's' : ''} with tracked time`}
            >
              {sortedClients.length === 0 ? (
                <EmptyState msg="No client sessions found. Assign sessions or projects to clients to see analytics." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr className="border-b border-white/[0.05]">
                        <th className="py-3 pr-4 text-left">
                          <SortableHeader label="Client" field="name" sortField={clientSort.field} sortDir={clientSort.dir} onSort={handleClientSort} />
                        </th>
                        <th className="py-3 pr-4 text-right">
                          <SortableHeader label="Total Hours" field="totalSeconds" sortField={clientSort.field} sortDir={clientSort.dir} onSort={handleClientSort} />
                        </th>
                        <th className="py-3 pr-4 text-right">
                          <SortableHeader label="Meetings" field="meetingSeconds" sortField={clientSort.field} sortDir={clientSort.dir} onSort={handleClientSort} />
                        </th>
                        <th className="py-3 pr-4 text-right">
                          <SortableHeader label="Sessions" field="sessionCount" sortField={clientSort.field} sortDir={clientSort.dir} onSort={handleClientSort} />
                        </th>
                        <th className="py-3 pr-4 text-center">
                          <span className="text-[11px] font-bold uppercase tracking-wide text-tx-faint">Billing</span>
                        </th>
                        <th className="py-3 text-right">
                          <span className="text-[11px] font-bold uppercase tracking-wide text-tx-faint">Est. Revenue</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedClients.map(c => {
                        const hrs = c.totalSeconds / 3600;
                        const rev = c.hourlyRate > 0 ? hrs * c.hourlyRate : null;
                        const mp  = pctOf(c.meetingSeconds, c.totalSeconds);
                        return (
                          <tr key={c.id} className="group border-b border-white/[0.04] transition-colors hover:bg-white/[0.025]">
                            <td className="py-3.5 pr-4">
                              <div className="flex min-w-0 items-center gap-2.5">
                                <div className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.color }} />
                                <div className="min-w-0">
                                  <span className="block truncate font-semibold text-tx-primary">{c.name}</span>
                                  {c.company && <span className="text-[10px] text-tx-faint">{c.company}</span>}
                                </div>
                              </div>
                            </td>
                            <td className="py-3.5 pr-4 text-right">
                              <span className="num font-semibold text-tx-primary">{fmtHrs(c.totalSeconds)}</span>
                            </td>
                            <td className="py-3.5 pr-4 text-right">
                              <div className="flex flex-col items-end gap-0.5">
                                <span className="num font-medium" style={{ color: '#F27C8A' }}>{fmtHrs(c.meetingSeconds)}</span>
                                {mp > 0 && <span className="text-[10px] text-tx-faint">{mp}% of total</span>}
                              </div>
                            </td>
                            <td className="py-3.5 pr-4 text-right">
                              <span className="num text-tx-secondary">{c.sessionCount}</span>
                            </td>
                            <td className="py-3.5 pr-4 text-center">
                              <BillingBadge type={c.billingType} />
                            </td>
                            <td className="py-3.5 text-right">
                              {rev != null ? (
                                <span className="num font-semibold text-green-300">${rev.toFixed(0)}</span>
                              ) : (
                                <span className="text-tx-faint">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {/* Totals row */}
                      {sortedClients.length > 1 && (
                        <tr className="border-t border-white/[0.08] bg-white/[0.015]">
                          <td className="py-3 pr-4">
                            <span className="text-[11px] font-bold uppercase tracking-wide text-tx-faint">Total</span>
                          </td>
                          <td className="py-3 pr-4 text-right">
                            <span className="num font-bold text-tx-primary">
                              {fmtHrs(sortedClients.reduce((a, c) => a + c.totalSeconds, 0))}
                            </span>
                          </td>
                          <td className="py-3 pr-4 text-right">
                            <span className="num font-bold" style={{ color: '#F27C8A' }}>
                              {fmtHrs(sortedClients.reduce((a, c) => a + c.meetingSeconds, 0))}
                            </span>
                          </td>
                          <td className="py-3 pr-4 text-right">
                            <span className="num font-bold text-tx-secondary">
                              {sortedClients.reduce((a, c) => a + c.sessionCount, 0)}
                            </span>
                          </td>
                          <td className="py-3 pr-4" />
                          <td className="py-3 text-right">
                            {sortedClients.some(c => c.hourlyRate > 0) && (
                              <span className="num font-bold text-green-300">
                                ${sortedClients
                                  .filter(c => c.hourlyRate > 0)
                                  .reduce((a, c) => a + (c.totalSeconds / 3600) * c.hourlyRate, 0)
                                  .toFixed(0)}
                              </span>
                            )}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>

            {/* ══ TIME ALLOCATION ════════════════════════════════════════════ */}
            <SectionDivider label="Time Allocation" color="rgba(61,214,164,0.55)" />

            {/* Daily breakdown chart */}
            <SectionCard
              title="Daily Work Breakdown"
              subtitle="Stacked view of deep work, meetings, and other time across the period"
            >
              {dailyData.every(d => (d['Deep Work'] + d['Meetings'] + d['Other Work']) === 0) ? (
                <EmptyState msg="No sessions in this period" />
              ) : (
                <div>
                  <div style={{ height: 240 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={dailyData} margin={{ top: 4, right: 16, left: -10, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} vertical={false} />
                        <XAxis dataKey="date" tick={CHART_TICK} tickLine={false} axisLine={false} interval={xInterval} />
                        <YAxis tick={CHART_TICK} tickLine={false} axisLine={false} tickFormatter={v => v + 'h'} />
                        <Tooltip content={<ChartTip />} />
                        <Area type="monotone" dataKey="Deep Work"  stackId="1" stroke="#7c6cf2" fill="#7c6cf2" fillOpacity={0.72} strokeWidth={1.5} />
                        <Area type="monotone" dataKey="Meetings"   stackId="1" stroke="#F27C8A" fill="#F27C8A" fillOpacity={0.72} strokeWidth={1.5} />
                        <Area type="monotone" dataKey="Other Work" stackId="1" stroke="#5BA7FF" fill="#5BA7FF" fillOpacity={0.55} strokeWidth={1.5} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-4 flex items-center justify-center gap-6">
                    {[['Deep Work', '#7c6cf2'], ['Meetings', '#F27C8A'], ['Other Work', '#5BA7FF']].map(([lbl, col]) => (
                      <span key={lbl} className="flex items-center gap-1.5 text-[11px] text-tx-muted">
                        <span className="h-1.5 w-4 rounded-full" style={{ background: col }} />
                        {lbl}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </SectionCard>

            {/* Category breakdown + Period summary */}
            <div className="grid grid-cols-3 gap-4">
              {/* Category donut */}
              <SectionCard title="Category Breakdown" subtitle="Time by work category">
                {catData.length === 0 ? (
                  <EmptyState msg="No category data" />
                ) : (
                  <>
                    <div style={{ height: 180 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={catData} cx="50%" cy="50%" innerRadius={46} outerRadius={76}
                            paddingAngle={2} dataKey="value" strokeWidth={0}>
                            {catData.map((entry, i) => (
                              <Cell key={i} fill={entry.color} fillOpacity={0.90} />
                            ))}
                          </Pie>
                          <Tooltip formatter={v => [`${v}h`, '']} contentStyle={TT} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="mt-3 space-y-2">
                      {catData.slice(0, 6).map((c, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: c.color }} />
                          <span className="flex-1 truncate text-[11px] text-tx-secondary">{c.name}</span>
                          <span className="num text-[11px] text-tx-muted">{c.value}h</span>
                          <span className="num w-8 text-right text-[10px] text-tx-faint">
                            {pctOf(c.value * 3600, totalSecs)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </SectionCard>

              {/* Period summary stats */}
              <SectionCard title="Period Summary" subtitle={`${effectiveDays}-day overview`} className="col-span-2">
                <div className="grid grid-cols-3 gap-3 mb-6">
                  {[
                    { label: 'Avg Daily',    value: fmtHrs(totalSecs / effectiveDays), color: '#7C6CF2' },
                    { label: 'Focus Rate',   value: deepPct + '%',                     color: '#3DD6A4' },
                    { label: 'Meeting Load', value: pctOf(meetSecs, totalSecs) + '%',  color: '#F27C8A' },
                    { label: 'Projects',     value: projectRows.length,                color: '#5BA7FF' },
                    { label: 'Clients',      value: clientRows.length,                 color: '#F2B84B' },
                    { label: 'Sessions',     value: filtered.length,                   color: '#a78bfa' },
                  ].map(s => (
                    <div key={s.label}
                      className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-center transition-all hover:border-white/[0.10] hover:bg-white/[0.04]">
                      <p className="num text-[22px] font-extrabold leading-none" style={{ color: s.color }}>{s.value}</p>
                      <p className="mt-2 text-[10px] font-bold uppercase tracking-wide text-tx-faint">{s.label}</p>
                    </div>
                  ))}
                </div>
                <div>
                  <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-tx-faint">Activity by Day of Week</p>
                  <DayOfWeekBars sessions={filtered} />
                </div>
              </SectionCard>
            </div>
          </>
        )}

        {/* ── Activity Sources Panel ──────────────────────────────────────────── */}
        {activityData && filterLabel && (
          <div style={{
            marginTop: 8,
            background: isLight
              ? 'linear-gradient(180deg,rgba(248,250,252,0.6),rgba(244,246,250,0.4))'
              : 'rgba(255,255,255,0.015)',
            border: `1px solid ${isLight ? '#E2E8F0' : 'rgba(255,255,255,0.07)'}`,
            borderRadius: 18,
            padding: 24,
          }}>
            {/* Divider label */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <div style={{ height: 1, flex: 1, background: isLight ? '#E2E8F0' : 'rgba(255,255,255,0.06)' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <MousePointer size={12} style={{ color: '#7c6cf2' }} />
                <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.10em', color: '#7c6cf2' }}>Activity Sources</span>
              </div>
              <div style={{ height: 1, flex: 1, background: isLight ? '#E2E8F0' : 'rgba(255,255,255,0.06)' }} />
            </div>
            <ActivitySourcesPanel
              actData={activityData}
              filtered={filtered}
              filterLabel={filterLabel}
              isLight={isLight}
            />
          </div>
        )}
      </div>

      {/* ── Export modal ── */}
      <ExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        reportTitle="Project & Client Analytics"
        currentSectionLabel={`Projects table · ${sortedProjects.length} projects · ${dateLabel.replace(/-/g, ' ')}`}
        allSectionsLabel={`Projects (${sortedProjects.length}), Clients (${sortedClients.length}), Session log (${filtered.length} sessions)`}
        onExport={async (format, scope) => {
          const filtersActive = filterProject !== 'all' || filterClient !== 'all' || filterCat !== 'all';
          const meta = {
            dateRange: `${new Date(fromTs * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} – ${new Date(toTs * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
            period:    period === 'custom' ? `${customFrom} to ${customTo}` : `Last ${effectiveDays} days`,
            filters:   filtersActive ? 'Active filters applied' : 'No filters',
          };
          const sections = scope === 'current'
            ? [buildProjectsSection(sortedProjects, totalSecs, deepSecs)]
            : [
                buildProjectsSection(sortedProjects, totalSecs, deepSecs),
                buildClientsSection(sortedClients),
                buildSessionsSection(filtered),
              ];
          const title = 'Flow Ledger — Project & Client Analytics';
          const filename = `flow-ledger-analytics-${dateLabel}.csv`;
          if (format === 'csv') exportAsCSV(title, meta, sections, filename);
          else exportAsPDF(title, meta, sections);
        }}
      />
    </div>
  );
}
