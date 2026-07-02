import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Brain, Monitor, Shield, LayoutGrid, Zap, Users, AlertTriangle,
  Clock, TrendingUp, ChevronUp, ChevronDown, Minus, Download,
  Flame, Coffee, Target, BarChart2, Activity, ArrowRight,
  Code2, Globe, MessageSquare, Mail, Music2, Wrench, BookOpen,
  RefreshCw, Timer, Layers, SplitSquareHorizontal,
} from 'lucide-react';
import ExportModal from '../shared/ExportModal';
import { exportAsCSV, exportAsPDF, fmtH, fmtDuration, fmtDateRange, fmtNow } from '../../utils/exportUtils';
import AppIcon from '../shared/AppIcon';
import { getBurnoutAnalytics, getProductivityHistoryAnalytics, getFocusAnalytics } from '../../ai/adaptive/analyticsIntelligenceEngine.js';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid,
  ComposedChart, Line, ReferenceLine,
} from 'recharts';
import { lastNDays } from '../../utils/helpers';

const api = window.electron || {};

const PERIODS = [
  { label: 'Today', days: 'today' },
  { label: '7D',  days: 7  },
  { label: '14D', days: 14 },
  { label: '30D', days: 30 },
  { label: '90D', days: 90 },
  { label: 'Custom', days: 'custom' },
];

const MODULES = [
  { id: 'deepwork',   label: 'Deep Work',  icon: Brain         },
  { id: 'usage',      label: 'App Usage',  icon: Monitor       },
  { id: 'focus',      label: 'Focus',      icon: Shield        },
  { id: 'allocation', label: 'Allocation', icon: Layers        },
  { id: 'switching',  label: 'Switching',  icon: SplitSquareHorizontal },
  { id: 'meetings',   label: 'Meetings',   icon: Users         },
  { id: 'burnout',    label: 'Burnout',    icon: AlertTriangle },
];

const CAT_COLORS = ['#8B7CF6','#5BA7FF','#3DD6A4','#F2B84B','#F27C8A','#A78BFA','#7B8494','#E879C4','#9F8DF7','#45C7D8'];
const APP_ACCENTS = ['#8B7CF6','#5BA7FF','#3DD6A4','#90BFE8','#9CB8D4','#6EA8F7','#F2B84B'];

const CHART_TICK       = { fill: '#64748B', fontSize: 10.5, fontWeight: 600 };
const CHART_GRID       = 'rgba(148,163,184,0.07)';
const CHART_GRID_PROPS = { stroke: CHART_GRID, strokeDasharray: '1 10', vertical: false };
const TOOLTIP_STYLE = {
  background: 'rgba(13,16,25,0.97)',
  border: '1px solid rgba(148,163,184,0.12)',
  borderRadius: 12, color: '#E2E8F0', fontSize: 12,
  padding: '10px 14px',
  boxShadow: '0 24px 64px rgba(0,0,0,0.56), 0 2px 0 rgba(255,255,255,0.03)',
};
const TLABEL = { color: '#64748B', fontWeight: 700, marginBottom: 6, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.07em' };
const TITEM  = { color: '#E2E8F0', fontWeight: 600, fontSize: 12 };

function classifyCategory(name) {
  const n = (name || '').toLowerCase();
  if (/cod|dev|eng|program|script|build|deploy/.test(n)) return { Icon: Code2,         color: '#7c6cf2' };
  if (/design|figma|sketch|ui|ux|art|creat/.test(n))     return { Icon: LayoutGrid,    color: '#a78bfa' };
  if (/meet|call|zoom|standup|sync/.test(n))              return { Icon: Users,         color: '#60a5fa' };
  if (/chat|slack|discord|message|comm/.test(n))          return { Icon: MessageSquare, color: '#34d399' };
  if (/email|mail|inbox|outlook|gmail/.test(n))           return { Icon: Mail,          color: '#fbbf24' };
  if (/learn|read|course|book|study|research/.test(n))    return { Icon: BookOpen,      color: '#5BA7FF' };
  if (/music|spotify|audio|listen/.test(n))               return { Icon: Music2,        color: '#f87171' };
  if (/admin|plan|manage|notion|doc|write|task/.test(n))  return { Icon: Target,        color: '#fb923c' };
  if (/browse|web|social|news|video|youtube/.test(n))     return { Icon: Globe,         color: '#38bdf8' };
  if (/break|coffee|rest|lunch|pause/.test(n))            return { Icon: Coffee,        color: '#86efac' };
  if (/debug|fix|tool|util|infra/.test(n))                return { Icon: Wrench,        color: '#f472b6' };
  if (/focus|deep|flow|work/.test(n))                     return { Icon: Brain,         color: '#a78bfa' };
  return { Icon: Target, color: '#9CA3AF' };
}

function pctChange(curr, prev) {
  if (!prev) return null;
  return Math.round(((curr - prev) / prev) * 100);
}
function gradeFromScore(score) {
  if (score >= 90) return 'A';
  if (score >= 85) return 'A-';
  if (score >= 80) return 'B+';
  if (score >= 70) return 'B';
  if (score >= 60) return 'C';
  if (score >= 50) return 'D';
  return 'F';
}
function mean(arr) { return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0; }
function fmtHrs(s)  { return (s / 3600).toFixed(1) + 'h'; }
function fmtMins(s) { const m = Math.round(s / 60); return m < 60 ? `${m}m` : `${Math.floor(m/60)}h ${m%60}m`; }
function fmtSecs(s) { if (s < 60) return `${s}s`; if (s < 3600) return `${Math.round(s/60)}m`; return fmtMins(s); }
const MONTH_SHORT  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const fmtAxisDate  = (v) => { if (!v || !v.includes('-')) return v; const [m,d] = v.split('-'); return `${MONTH_SHORT[+m-1]} ${+d}`; };

// ─── Theme hook ────────────────────────────────────────────────────────────────
function useThemeLight() {
  const [isLight, setIsLight] = useState(() => document.documentElement.classList.contains('theme-light'));
  useEffect(() => {
    const obs = new MutationObserver(() => setIsLight(document.documentElement.classList.contains('theme-light')));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  return isLight;
}

const TOOLTIP_STYLE_LIGHT = {
  background: 'rgba(255,255,255,0.99)',
  border: '1px solid rgba(0,0,0,0.09)',
  borderRadius: 12, color: '#111827', fontSize: 12,
  padding: '10px 14px',
  boxShadow: '0 12px 40px rgba(0,0,0,0.12)',
};
const TLABEL_LIGHT = { color: '#374151', fontWeight: 700, marginBottom: 6, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.07em' };
const TITEM_LIGHT  = { color: '#111827', fontWeight: 600, fontSize: 12 };

// ─── Pie chart custom tooltip ─────────────────────────────────────────────────
function PieCatTooltip({ active, payload, isLight }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload || {};
  const color = d.color || payload[0]?.fill || '#7c6cf2';
  const name  = d.name  || payload[0]?.name  || '—';
  const hours = d.hours ?? payload[0]?.value ?? 0;
  const pct   = d.pct   ?? null;

  return (
    <div style={{
      background:   isLight ? '#FFFFFF' : 'rgba(13,16,25,0.97)',
      border:       isLight ? '1px solid rgba(0,0,0,0.10)' : '1px solid rgba(148,163,184,0.12)',
      borderRadius: 12,
      padding:      '10px 14px',
      boxShadow:    isLight
        ? '0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)'
        : '0 24px 64px rgba(0,0,0,0.56)',
      minWidth:     120,
      pointerEvents: 'none',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 7 }}>
        <div style={{ width: 9, height: 9, borderRadius: '50%', background: color, flexShrink: 0 }}/>
        <span style={{ fontSize: 11, fontWeight: 700, color: isLight ? '#1A1730' : '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {name}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontSize: 18, fontWeight: 700, color: isLight ? '#0F0D20' : '#E2E8F0', lineHeight: 1 }}>
          {(+hours).toFixed(1)}h
        </span>
        {pct != null && (
          <span style={{ fontSize: 11, fontWeight: 500, color: isLight ? '#4A4568' : '#64748B' }}>
            {pct}%
          </span>
        )}
      </div>
    </div>
  );
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
  const hex = accentHex;
  return (
    <div className="fl-kpi-card fl-report-card group relative overflow-hidden rounded-[22px] p-5 shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:border-white/[0.14] hover:shadow-popup"
      style={{ background: 'linear-gradient(145deg,rgba(28,32,43,0.94),rgba(18,21,30,0.96))' }}>
      <div className="fl-report-card-topline absolute inset-x-5 top-0 h-px opacity-80" style={{ '--report-card-accent':hex, background:`linear-gradient(90deg,transparent,${hex}99,transparent)` }}/>
      <div className="fl-report-card-glow absolute -right-8 -top-10 h-24 w-24 rounded-full opacity-20 blur-2xl group-hover:opacity-30 transition-opacity" style={{ background: hex }}/>
      <div className="relative flex items-start justify-between gap-4">
        <div className="min-w-0">
          <span className="fl-report-label block text-[11px] font-bold uppercase tracking-[0.12em] text-tx-muted">{label}</span>
          <p className="fl-report-value num mt-3 text-[30px] font-extrabold leading-none text-tx-primary">{value}</p>
          <p className="fl-report-support mt-2 text-[12px] font-medium text-tx-muted">{sub}</p>
        </div>
        <div className="fl-report-icon-wrap flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border shadow-inner group-hover:scale-105 transition-transform"
          style={{ background:`${hex}18`, borderColor:`${hex}2f`, boxShadow:`inset 0 1px 0 rgba(255,255,255,0.08),0 10px 24px ${hex}16` }}>
          <Icon size={16} strokeWidth={2.2} style={{ color: hex }}/>
        </div>
      </div>
      <div className="fl-report-trend relative mt-4"><TrendBadge pct={trend} inverse={inversetrend}/></div>
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

function EmptyState({ icon: Icon = BarChart2, msg = 'No data yet for this period' }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-tx-faint">
      <Icon size={28} className="mb-3 opacity-20"/>
      <p className="text-xs">{msg}</p>
    </div>
  );
}

function ModuleTooltip({ active, payload, label, fmt }) {
  const isLight = useThemeLight();
  if (!active || !payload?.length) return null;
  const displayLabel = label?.includes('-')
    ? (() => { const [m,d] = label.split('-'); return `${MONTH_SHORT[+m-1]} ${+d}`; })()
    : label;
  const bg     = isLight ? 'rgba(255,255,255,0.99)' : 'rgba(13,16,25,0.97)';
  const border = isLight ? '1px solid rgba(0,0,0,0.09)' : '1px solid rgba(148,163,184,0.12)';
  const shadow = isLight ? '0 12px 40px rgba(0,0,0,0.12)' : '0 24px 64px rgba(0,0,0,0.56)';
  const labelC = isLight ? '#6B7280' : '#64748B';
  const nameC  = isLight ? '#374151' : '#94A3B8';
  const valC   = isLight ? '#111827' : '#E2E8F0';
  return (
    <div style={{ background:bg, border, borderRadius:12, padding:'10px 14px', boxShadow:shadow, minWidth:152 }}>
      <p style={{ fontSize:10, fontWeight:700, color:labelC, textTransform:'uppercase', letterSpacing:'0.07em', margin:'0 0 8px' }}>{displayLabel}</p>
      {payload.map((p, i) => (
        <p key={p.name} style={{ margin: i < payload.length-1 ? '0 0 5px' : 0, display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ width:6, height:6, borderRadius:'50%', background:p.color||p.fill, flexShrink:0, display:'inline-block', boxShadow:`0 0 5px ${p.color||p.fill}80` }}/>
          <span style={{ fontSize:11.5, color:nameC, flex:1 }}>{p.name}</span>
          <span style={{ fontSize:12.5, color:valC, fontWeight:700, fontVariantNumeric:'tabular-nums', marginLeft:12 }}>{fmt ? fmt(+p.value.toFixed(2)) : +p.value.toFixed(2)}</span>
        </p>
      ))}
    </div>
  );
}

function StatPill({ label, value, color }) {
  return (
    <div className="fl-report-statpill flex flex-col items-center rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
      <span className="fl-report-value num text-xl font-extrabold" style={{ color }}>{value}</span>
      <span className="fl-report-label mt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-tx-faint">{label}</span>
    </div>
  );
}

function RiskBar({ label, value, max, color, warn }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-tx-secondary">{label}</span>
        <span className="text-xs font-bold" style={{ color: warn ? '#f87171' : '#9AA6B8' }}>{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
        <div className="h-full rounded-full transition-all duration-700"
          style={{ width:`${pct}%`, background: warn ? 'linear-gradient(90deg,#ef444499,#f87171)' : `linear-gradient(90deg,${color}88,${color})` }}/>
      </div>
    </div>
  );
}

// ─── Export section builders ───────────────────────────────────────────────────
function buildTabSection(tabId, { daily, summary, appUsage, catData, deepBlocks, sessions, distraction, effectiveDays }) {
  const totalSecs = summary?.totalSeconds || 0;
  const deepSecs  = summary?.deepWorkSeconds || 0;
  const meetSecs  = summary?.meetingSeconds || 0;
  const breakSecs = summary?.breakSeconds || 0;

  if (tabId === 'deepwork') {
    const avgDeepDur = deepBlocks.length
      ? Math.round(deepBlocks.reduce((s, b) => s + (b.duration_seconds || 0), 0) / deepBlocks.length / 60) : 0;
    const longestDeep = deepBlocks.length ? Math.max(...deepBlocks.map(b => b.duration_seconds || 0)) : 0;
    const daysWithDeep = daily.filter(d => d.deepWork > 0).length;
    return {
      title: 'Deep Work Analytics',
      subtitle: `${effectiveDays}-day analysis of deep focus sessions`,
      kpis: [
        { label: 'Total Deep Work', value: fmtH(deepSecs) },
        { label: 'Avg per Day',     value: `${(deepSecs / 3600 / Math.max(effectiveDays, 1)).toFixed(1)}h` },
        { label: 'Deep Work %',     value: totalSecs ? `${Math.round(deepSecs / totalSecs * 100)}%` : '0%' },
        { label: 'Longest Session', value: fmtDuration(longestDeep) },
        { label: 'Avg Session',     value: `${avgDeepDur}m` },
        { label: 'Consistency',     value: `${daysWithDeep}/${effectiveDays} days` },
      ],
      headers: ['Date', 'Total Hours', 'Deep Work (h)', 'Focus (h)', 'Meetings (h)', 'Breaks (h)', 'Sessions'],
      rows: daily.map(d => [d.fullDate, d.total.toFixed(2), d.deepWork.toFixed(2), d.focus.toFixed(2), d.meetings.toFixed(2), d.breaks.toFixed(2), d.sessions]),
      summary: [
        ['Total Tracked Time',    fmtH(totalSecs)],
        ['Total Deep Work',       fmtH(deepSecs)],
        ['Deep Work %',           totalSecs ? `${Math.round(deepSecs / totalSecs * 100)}%` : '0%'],
        ['Avg per Day',           `${(deepSecs / 3600 / Math.max(effectiveDays, 1)).toFixed(1)}h`],
        ['Days With Deep Work',   `${daysWithDeep} of ${effectiveDays}`],
        ['Avg Session Length',    `${avgDeepDur} minutes`],
        ['Longest Session',       fmtDuration(longestDeep)],
        ['Total Deep Blocks',     String(deepBlocks.length)],
      ],
    };
  }

  if (tabId === 'usage') {
    const appTotal = appUsage.reduce((s, a) => s + (a.total || 0), 0);
    const categorise = (name) => {
      const n = (name || '').toLowerCase();
      if (/code|vscode|cursor|vim|terminal|figma|xcode|pycharm|intellij/.test(n)) return 'Deep Work';
      if (/chrome|firefox|safari|edge|brave|arc/.test(n)) return 'Browser';
      if (/slack|discord|teams|zoom|telegram|messages/.test(n)) return 'Communication';
      if (/youtube|netflix|twitter|reddit|tiktok|instagram/.test(n)) return 'Distraction';
      return 'Other';
    };
    return {
      title: 'App Usage Analytics',
      subtitle: `Time distribution across ${appUsage.length} applications`,
      kpis: [
        { label: 'Apps Tracked', value: String(appUsage.length) },
        { label: 'Total Time',   value: fmtH(appTotal) },
        { label: 'Top App',      value: appUsage[0]?.app_name || '—' },
      ],
      headers: ['Rank', 'Application', 'Time Used', 'Hours', '% of Total', 'Category'],
      rows: appUsage.slice(0, 50).map((a, i) => [
        i + 1,
        a.app_name || 'Unknown',
        fmtDuration(a.total || 0),
        ((a.total || 0) / 3600).toFixed(1) + 'h',
        appTotal ? `${Math.round((a.total || 0) / appTotal * 100)}%` : '0%',
        categorise(a.app_name),
      ]),
      summary: [
        ['Apps Tracked', String(appUsage.length)],
        ['Total Time',   fmtH(appTotal)],
        ['Top App',      appUsage[0]?.app_name || '—'],
        ['Top App Time', fmtH(appUsage[0]?.total || 0)],
      ],
    };
  }

  if (tabId === 'focus') {
    const focusPct    = distraction?.focusPct ?? (totalSecs ? Math.round((summary?.focusSeconds || 0) / totalSecs * 100) : 0);
    const distractPct = distraction?.distractedPct ?? 0;
    const shortSess   = sessions.filter(s => (s.duration_seconds || 0) < 600);
    const switchRate  = sessions.length > 0 ? Math.round(shortSess.length / sessions.length * 100) : 0;
    const avgSessLen  = sessions.length > 0
      ? Math.round(sessions.reduce((s, x) => s + (x.duration_seconds || 0), 0) / sessions.length / 60) : 0;
    return {
      title: 'Focus & Distraction Analytics',
      subtitle: 'Attention quality, context switching, and distraction patterns',
      kpis: [
        { label: 'Focus Time %',   value: `${focusPct}%` },
        { label: 'Distraction %',  value: `${distractPct}%` },
        { label: 'Context Switches', value: `${switchRate}%` },
        { label: 'Avg Session',    value: `${avgSessLen}m` },
        { label: 'Total Sessions', value: String(sessions.length) },
      ],
      headers: ['Date', 'Total Hours', 'Focus (h)', 'Deep Work (h)', 'Sessions', 'Focus %'],
      rows: daily.map(d => [
        d.fullDate, d.total.toFixed(2), d.focus.toFixed(2), d.deepWork.toFixed(2), d.sessions,
        d.total > 0 ? `${Math.round(d.focus / d.total * 100)}%` : '0%',
      ]),
      summary: [
        ['Focus Time %',         `${focusPct}%`],
        ['Distraction %',        `${distractPct}%`],
        ['Context Switch Rate',  `${switchRate}% of sessions < 10 min`],
        ['Short Sessions (<10m)',String(shortSess.length)],
        ['Avg Session Length',   `${avgSessLen} minutes`],
        ['Total Sessions',       String(sessions.length)],
      ],
    };
  }

  if (tabId === 'allocation') {
    return {
      title: 'Time Allocation by Category',
      subtitle: 'Work distribution and category breakdown',
      headers: ['Rank', 'Category', 'Hours', '% of Total'],
      rows: catData.map((c, i) => [i + 1, c.name, c.hours.toFixed(1) + 'h', `${c.pct}%`]),
      summary: [
        ['Categories Tracked', String(catData.length)],
        ['Top Category',       catData[0]?.name || '—'],
        ['Top Category %',     catData[0] ? `${catData[0].pct}%` : '—'],
        ['Total Tracked',      fmtH(totalSecs)],
      ],
    };
  }

  if (tabId === 'switching') {
    const shortSess   = sessions.filter(s => (s.duration_seconds || 0) < 600);
    const switchRate  = sessions.length > 0 ? Math.round(shortSess.length / sessions.length * 100) : 0;
    const avgSessLen  = sessions.length > 0
      ? Math.round(sessions.reduce((s, x) => s + (x.duration_seconds || 0), 0) / sessions.length / 60) : 0;
    return {
      title: 'Context Switching & Session Log',
      subtitle: `Session length distribution and attention fragmentation (${sessions.length} sessions)`,
      kpis: [
        { label: 'Switch Rate',       value: `${switchRate}%` },
        { label: 'Avg Session',       value: `${avgSessLen}m` },
        { label: 'Total Sessions',    value: String(sessions.length) },
        { label: 'Short (<10m)',       value: String(shortSess.length) },
        { label: 'Sessions/Day',      value: (sessions.length / Math.max(effectiveDays, 1)).toFixed(1) },
      ],
      headers: ['Date', 'Time', 'Title / Category', 'Duration', 'Deep Work', 'Type'],
      rows: sessions.slice(0, 200).map(s => {
        const dur = s.duration_seconds || 0;
        const dt  = new Date((s.started_at || 0) * 1000);
        return [
          dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
          dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
          s.title || s.category || '—',
          fmtDuration(dur),
          s.is_deep_work ? 'Yes' : 'No',
          dur < 600 ? 'Switch / Short' : dur >= 1500 ? 'Deep Work Block' : 'Normal',
        ];
      }),
      summary: [
        ['Total Sessions',      String(sessions.length)],
        ['Short (<10m)',         String(shortSess.length)],
        ['Context Switch Rate', `${switchRate}%`],
        ['Avg Session Length',  `${avgSessLen} minutes`],
        ['Sessions per Day',    (sessions.length / Math.max(effectiveDays, 1)).toFixed(1)],
      ],
    };
  }

  if (tabId === 'meetings') {
    const meetPct  = totalSecs ? Math.round(meetSecs / totalSecs * 100) : 0;
    const meetDays = daily.filter(d => d.meetings > 0).length;
    return {
      title: 'Meeting Analytics',
      subtitle: 'Meeting time and impact on deep work capacity',
      kpis: [
        { label: 'Meeting Hours', value: fmtH(meetSecs) },
        { label: 'Meeting %',     value: `${meetPct}%` },
        { label: 'Avg / Day',     value: `${(meetSecs / 3600 / Math.max(effectiveDays, 1)).toFixed(1)}h` },
        { label: 'Days w/ Meetings', value: `${meetDays} of ${effectiveDays}` },
        { label: 'Meet:Deep Ratio',  value: deepSecs > 0 ? (meetSecs / deepSecs).toFixed(2) : '—' },
      ],
      headers: ['Date', 'Total (h)', 'Meetings (h)', 'Deep Work (h)', 'Other (h)', 'Meeting %'],
      rows: daily.map(d => [
        d.fullDate,
        d.total.toFixed(2),
        d.meetings.toFixed(2),
        d.deepWork.toFixed(2),
        Math.max(0, d.total - d.meetings - d.deepWork).toFixed(2),
        d.total > 0 ? `${Math.round(d.meetings / d.total * 100)}%` : '0%',
      ]),
      summary: [
        ['Total Meeting Hours',    fmtH(meetSecs)],
        ['% of Tracked Time',      `${meetPct}%`],
        ['Avg per Day',            `${(meetSecs / 3600 / Math.max(effectiveDays, 1)).toFixed(1)}h`],
        ['Days with Meetings',     `${meetDays} of ${effectiveDays}`],
        ['Meeting:Deep Work Ratio',deepSecs > 0 ? (meetSecs / deepSecs).toFixed(2) : '—'],
      ],
    };
  }

  if (tabId === 'burnout') {
    const avgPerDay  = (totalSecs / 3600 / Math.max(effectiveDays, 1)).toFixed(1);
    const overwork   = daily.filter(d => d.total > 8).length;
    const restDays   = daily.filter(d => d.total === 0).length;
    const breakRatio = totalSecs > 0 ? Math.round(breakSecs / totalSecs * 100) : 0;
    return {
      title: 'Burnout Risk & Energy Management',
      subtitle: 'Work-life balance and sustainable performance indicators',
      kpis: [
        { label: 'Overwork Days (>8h)', value: String(overwork) },
        { label: 'Rest Days',           value: String(restDays) },
        { label: 'Break Ratio',         value: `${breakRatio}%` },
        { label: 'Avg Hours / Day',     value: `${avgPerDay}h` },
        { label: 'Max Single Day',      value: `${daily.length ? Math.max(...daily.map(d => d.total)) : 0}h` },
      ],
      headers: ['Date', 'Total (h)', 'Break (h)', 'Break %', 'Status'],
      rows: daily.map(d => [
        d.fullDate,
        d.total.toFixed(2),
        d.breaks.toFixed(2),
        d.total > 0 ? `${Math.round(d.breaks / d.total * 100)}%` : '0%',
        d.total > 8 ? 'Overwork' : d.total === 0 ? 'Rest Day' : d.total > 6 ? 'Full Day' : 'Light Day',
      ]),
      summary: [
        ['Avg Hours / Day',    `${avgPerDay}h`],
        ['Overwork Days (>8h)',String(overwork)],
        ['Rest Days',          String(restDays)],
        ['Break Ratio',        `${breakRatio}%`],
        ['Total Break Time',   fmtH(breakSecs)],
      ],
    };
  }

  return null;
}

// ─── Main ──────────────────────────────────────────────────────────────────────
export default function ReportsPage({ user }) {
  const isLight = useThemeLight();
  const TT  = isLight ? TOOLTIP_STYLE_LIGHT : TOOLTIP_STYLE;
  const TTL = isLight ? TLABEL_LIGHT : TLABEL;
  const TTI = isLight ? TITEM_LIGHT  : TITEM;
  const [period,      setPeriod]      = useState(7);
  const [customFrom,  setCustomFrom]  = useState('');
  const [customTo,    setCustomTo]    = useState('');
  const [activeTab,   setActiveTab]   = useState('deepwork');
  const [exportOpen,  setExportOpen]  = useState(false);

  // Adaptive behavioral analytics — synchronous localStorage read, no API call
  const adaptiveBurnout  = useMemo(() => { try { return getBurnoutAnalytics(); } catch { return null; } }, []);
  const adaptiveHistory  = useMemo(() => { try { return getProductivityHistoryAnalytics(90); } catch { return null; } }, []);
  const adaptiveFocus    = useMemo(() => { try { return getFocusAnalytics(); } catch { return null; } }, []);
  const [daily,       setDaily]       = useState([]);
  const [summary,     setSummary]     = useState(null);
  const [appUsage,    setAppUsage]    = useState([]);
  const [weekComp,    setWeekComp]    = useState(null);
  const [catData,     setCatData]     = useState([]);
  const [distraction, setDistraction] = useState(null);
  const [deepBlocks,  setDeepBlocks]  = useState([]);
  const [sessions,    setSessions]    = useState([]);
  const [loading,     setLoading]     = useState(true);

  const { fromTs, toTs, effectiveDays } = useMemo(() => {
    const now = Math.floor(Date.now() / 1000);
    if (period === 'custom' && customFrom && customTo) {
      const f = Math.floor(new Date(customFrom).getTime() / 1000);
      const t = Math.floor(new Date(customTo).getTime() / 1000) + 86400;
      return { fromTs: f, toTs: t, effectiveDays: Math.max(1, Math.round((t - f) / 86400)) };
    }
    if (period === 'today') {
      const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
      return { fromTs: Math.floor(midnight.getTime() / 1000), toTs: now, effectiveDays: 1 };
    }
    return { fromTs: now - period * 86400, toTs: now, effectiveDays: period };
  }, [period, customFrom, customTo]);

  const load = useCallback(async () => {
    if (period === 'custom' && (!customFrom || !customTo)) return;
    setLoading(true);
    const [d, sum, apps, comp, dist, blocks, sessRaw] = await Promise.all([
      api.statsDaily?.({ userId: user.id, days: effectiveDays }),
      api.statsSummary?.({ userId: user.id, from: fromTs, to: toTs }),
      api.topApps?.({ userId: user.id, from: fromTs, to: toTs, limit: 20 }),
      api.weekComparison?.({ userId: user.id }),
      api.distractionRatio?.({ userId: user.id, from: fromTs, to: toTs }),
      api.deepWorkBlocks?.({ userId: user.id, from: fromTs, to: toTs }),
      api.listSessions?.({ userId: user.id, from: fromTs, to: toTs }),
    ]);

    setSummary(sum);
    setAppUsage(apps || []);
    setWeekComp(comp);
    setDistraction(dist || null);
    setDeepBlocks(blocks || []);
    setSessions(sessRaw || []);

    let days;
    if (period === 'custom' && customFrom && customTo) {
      days = [];
      const cur = new Date(customFrom); cur.setHours(0,0,0,0);
      const end = new Date(customTo);   end.setHours(0,0,0,0);
      while (cur <= end) { days.push(cur.toISOString().split('T')[0]); cur.setDate(cur.getDate()+1); }
    } else {
      days = lastNDays(effectiveDays);
    }

    setDaily(days.map(date => ({
      date:     date.slice(5),
      fullDate: date,
      total:    +((d?.[date]?.total    || 0)/3600).toFixed(2),
      deepWork: +((d?.[date]?.deepWork || 0)/3600).toFixed(2),
      focus:    +((d?.[date]?.focus    || 0)/3600).toFixed(2),
      meetings: +((d?.[date]?.meetings || 0)/3600).toFixed(2),
      breaks:   +((d?.[date]?.breaks   || 0)/3600).toFixed(2),
      sessions:  d?.[date]?.sessions  || 0,
    })));

    if (sum?.byCategory) {
      const entries = Object.entries(sum.byCategory).sort((a,b) => b[1]-a[1]).slice(0, 10);
      const total   = entries.reduce((s,[,v]) => s+v, 0);
      setCatData(entries.map(([name, secs], i) => {
        const { Icon, color: catColor } = classifyCategory(name);
        return { name, secs, hours: +(secs/3600).toFixed(1), pct: total > 0 ? Math.round(secs/total*100) : 0,
          color: CAT_COLORS[i % CAT_COLORS.length], catColor, Icon };
      }));
    }

    setLoading(false);
  }, [user.id, fromTs, toTs, effectiveDays, period, customFrom, customTo]);

  useEffect(() => { load(); }, [load]);

  // ── Derived metrics ──────────────────────────────────────────────────────────
  const totalSecs  = summary?.totalSeconds || 0;
  const deepSecs   = summary?.deepWorkSeconds || 0;
  const focusSecs  = summary?.focusSeconds || 0;
  const meetSecs   = summary?.meetingSeconds || 0;
  const breakSecs  = summary?.breakSeconds || 0;
  const sessCount  = summary?.sessionCount || 0;
  const deepPct    = totalSecs ? Math.round(deepSecs / totalSecs * 100) : 0;
  const avgPerDay  = (totalSecs / 3600 / Math.max(effectiveDays,1)).toFixed(1);

  // Deep work stats
  const avgDeepDur  = deepBlocks.length ? Math.round(deepBlocks.reduce((s,b) => s + (b.duration_seconds || 0), 0) / deepBlocks.length / 60) : 0;
  const longestDeep = deepBlocks.length ? Math.max(...deepBlocks.map(b => b.duration_seconds || 0)) : 0;
  const deepPerDay  = (deepSecs / 3600 / Math.max(effectiveDays,1)).toFixed(1);
  const deepTrend   = weekComp ? pctChange(weekComp.thisWeek?.deepWorkSecs, weekComp.lastWeek?.deepWorkSecs) : null;

  // Deep work consistency — days that had any deep work
  const daysWithDeep = daily.filter(d => d.deepWork > 0).length;
  const deepConsistency = effectiveDays > 0 ? Math.round((daysWithDeep / effectiveDays) * 100) : 0;

  // App usage
  const appTotal = appUsage.reduce((s,a) => s + (a.total || 0), 0);
  const distractApps = appUsage.filter(a => {
    const n = (a.app_name || '').toLowerCase();
    return /youtube|twitter|instagram|facebook|reddit|tiktok|netflix|twitch|discord|slack|whatsapp|telegram/.test(n);
  });
  const distractTime = distractApps.reduce((s,a) => s + (a.total||0), 0);

  // Focus vs distraction
  const focusPct     = distraction?.focusPct ?? (totalSecs ? Math.round(focusSecs / totalSecs * 100) : 0);
  const distractPct  = distraction?.distractedPct ?? 0;
  const idlePct      = Math.max(0, 100 - focusPct - distractPct);

  // Context switching — sessions < 10 min are switches
  const shortSess    = sessions.filter(s => (s.duration_seconds || 0) < 600);
  const switchRate   = sessions.length > 0 ? Math.round((shortSess.length / sessions.length) * 100) : 0;
  const avgSessLen   = sessions.length > 0 ? Math.round(sessions.reduce((s,x) => s + (x.duration_seconds||0), 0) / sessions.length / 60) : 0;
  const switchPerDay = (sessions.length / Math.max(effectiveDays,1)).toFixed(1);

  // Meetings
  const meetPct      = totalSecs ? Math.round(meetSecs / totalSecs * 100) : 0;
  const meetPerDay   = (meetSecs / 3600 / Math.max(effectiveDays,1)).toFixed(1);
  const meetToWork   = deepSecs > 0 ? (meetSecs / deepSecs).toFixed(2) : '—';
  const meetDays     = daily.filter(d => d.meetings > 0).length;

  // Burnout / energy
  const overworkDays = daily.filter(d => d.total > 8).length;
  const restDays     = daily.filter(d => d.total === 0).length;
  const maxDay       = daily.length ? Math.max(...daily.map(d => d.total)) : 0;
  const breakRatio   = totalSecs > 0 ? Math.round(breakSecs / totalSecs * 100) : 0;
  const burnoutRisk  = (() => {
    let score = 0;
    if (overworkDays >= 3) score += 35;
    if (breakRatio < 10)   score += 25;
    if (avgPerDay > 9)     score += 25;
    if (restDays === 0 && effectiveDays >= 7) score += 15;
    return Math.min(score, 100);
  })();

  // Allocation data for chart
  const allocationData = useMemo(() => {
    const cats = catData.slice(0, 6);
    return cats.map(c => ({ name: c.name, hours: c.hours, color: c.color }));
  }, [catData]);

  // Stacked allocation per day
  const allocationDaily = useMemo(() => daily.map(d => ({
    date: d.date,
    'Deep Work': d.deepWork,
    'Focus': Math.max(0, d.focus - d.deepWork),
    'Meetings': d.meetings,
    'Breaks': d.breaks,
    'Other': Math.max(0, d.total - d.focus - d.meetings - d.breaks),
  })), [daily]);

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="fl-analytics-page fl-report-page">

      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <div className="fl-analytics-toolbar fl-report-toolbar">
        <div>
          <h1 className="fl-report-hero text-xl font-bold text-tx-primary">Reports</h1>
          <p className="fl-report-support mt-1 text-sm font-medium text-tx-muted">
            {new Date(fromTs * 1000).toLocaleDateString('en', { month:'short', day:'numeric' })}
            {' – '}
            {new Date(toTs * 1000).toLocaleDateString('en', { month:'short', day:'numeric', year:'numeric' })}
            {period === 'today' ? ' · today' : period !== 'custom' ? ` · last ${effectiveDays}d` : ''}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="fl-segmented fl-report-segmented">
            {PERIODS.map(({ label, days }) => (
              <button key={days} onClick={() => setPeriod(days)}
                className={`fl-report-chip rounded-md px-3 py-1.5 text-xs font-semibold transition-all duration-200 ${period === days ? 'fl-segment-active fl-report-chip-active' : 'text-tx-muted hover:bg-white/[0.04] hover:text-tx-primary'}`}>
                {label}
              </button>
            ))}
          </div>
          {period === 'custom' && (
            <div className="fl-card fl-report-inline-card flex items-center gap-2 rounded-lg px-3 py-2">
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                className="bg-transparent text-xs text-white focus:outline-none"/>
              <span className="text-tx-faint text-xs">to</span>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                className="bg-transparent text-xs text-white focus:outline-none"/>
            </div>
          )}
          <button
            onClick={() => setExportOpen(true)}
            className="fl-report-export flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3.5 py-2 text-xs font-semibold text-tx-secondary shadow-inner transition-all duration-200 hover:border-accent/35 hover:bg-accent/[0.07] hover:text-accent">
            <Download size={12}/> Export
          </button>
        </div>
      </div>

      {/* ── Module Tabs ───────────────────────────────────────────────────────── */}
      <div className="fl-report-tabs">
        {MODULES.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setActiveTab(id)}
            className={`fl-report-tab flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition-all duration-200 ${
              activeTab === id ? 'fl-report-tab-active bg-white/[0.07] text-white shadow-inner' : 'text-tx-muted hover:bg-white/[0.04] hover:text-tx-primary'
            }`}>
            <Icon size={13}/>{label}
          </button>
        ))}
      </div>

      {/* ── Content ──────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-7 py-7 space-y-6">

        {/* ══════════════════════════════════════════════════════════════
            1. DEEP WORK ANALYTICS
        ══════════════════════════════════════════════════════════════ */}
        {activeTab === 'deepwork' && <>
          {/* Adaptive peak window banner */}
          {adaptiveFocus?.peakWindow && adaptiveFocus.confidence > 20 && (
            <div className="flex items-center gap-3 rounded-xl border px-4 py-2.5"
              style={{ background:'rgba(167,139,250,0.06)', borderColor:'rgba(167,139,250,0.22)' }}>
              <Brain size={13} className="shrink-0" style={{ color:'#a78bfa' }} />
              <span className="text-[10px] flex-1" style={{ color:'#6B8099' }}>
                Adaptive pattern · {adaptiveFocus.insights?.[0]}
              </span>
              <span className="shrink-0 text-[10px] font-bold rounded-lg px-2.5 py-1"
                style={{ background:'rgba(167,139,250,0.12)', color:'#a78bfa' }}>
                {adaptiveFocus.peakWindow}
              </span>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KpiCard icon={Brain}    label="Deep Work Hours" accentHex="#a78bfa"
              value={fmtHrs(deepSecs)} sub={`${deepPerDay}h/day avg`} trend={deepTrend}/>
            <KpiCard icon={Flame}    label="Longest Session"  accentHex="#f59e0b"
              value={fmtMins(longestDeep)} sub="single deep work block"/>
            <KpiCard icon={Timer}    label="Avg Session"      accentHex="#3DD6A4"
              value={`${avgDeepDur}m`} sub={`${deepBlocks.length} blocks total`}/>
            <KpiCard icon={Activity} label="Consistency"      accentHex="#5BA7FF"
              value={`${deepConsistency}%`} sub={`${daysWithDeep}/${effectiveDays} days had deep work`}/>
          </div>

          {/* Deep Work % trend area chart */}
          <SectionCard title="Deep Work Trend" subtitle="Daily hours of deep focus over the period">
            {daily.every(d => d.deepWork === 0)
              ? <EmptyState icon={Brain} msg="No deep work sessions recorded yet"/>
              : <>
                <ResponsiveContainer width="100%" height={210}>
                  <ComposedChart data={daily} margin={{ top:10, right:12, bottom:4, left:-4 }}>
                    <defs>
                      <linearGradient id="dwGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%"  stopColor="#a78bfa" stopOpacity={0.35}/>
                        <stop offset="95%" stopColor="#a78bfa" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="totGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%"  stopColor="#5BA7FF" stopOpacity={0.18}/>
                        <stop offset="95%" stopColor="#5BA7FF" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid {...CHART_GRID_PROPS}/>
                    <XAxis dataKey="date" tick={CHART_TICK} axisLine={false} tickLine={false} tickFormatter={fmtAxisDate}
                      interval={effectiveDays > 14 ? Math.floor(effectiveDays/7) : 0}/>
                    <YAxis tick={CHART_TICK} axisLine={false} tickLine={false} unit="h" width={34}/>
                    <Tooltip content={<ModuleTooltip fmt={v => `${v}h`}/>}/>
                    <Area type="monotone" dataKey="total"    stroke="#5BA7FF" strokeWidth={1.5} fill="url(#totGrad)" name="Total" activeDot={false}/>
                    <Area type="monotone" dataKey="deepWork" stroke="#a78bfa" strokeWidth={2.3} fill="url(#dwGrad)"  name="Deep Work" activeDot={{ r:4, strokeWidth:0 }}/>
                  </ComposedChart>
                </ResponsiveContainer>
                <div className="mt-5 flex items-center gap-7">
                  {[['Deep Work','#a78bfa'],['Total Work','#5BA7FF']].map(([l,c]) => (
                    <div key={l} className="flex items-center gap-2">
                      <svg width="20" height="8" viewBox="0 0 20 8" fill="none">
                        <line x1="0" y1="4" x2="20" y2="4" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
                        <circle cx="10" cy="4" r="2.5" fill={c}/>
                      </svg>
                      <span style={{ fontSize:11, fontWeight:600, color:'#64748B', letterSpacing:'0.01em' }}>{l}</span>
                    </div>
                  ))}
                </div>
              </>}
          </SectionCard>

          {/* Deep Work % per day */}
          <SectionCard title="Deep Work Ratio Per Day" subtitle="Percentage of each day spent in deep focus">
            {daily.every(d => d.total === 0)
              ? <EmptyState icon={Zap}/>
              : <ResponsiveContainer width="100%" height={150}>
                <BarChart data={daily.map(d => ({ date: d.date, pct: d.total > 0 ? Math.round(d.deepWork/d.total*100) : 0 }))}>
                  <CartesianGrid {...CHART_GRID_PROPS}/>
                  <XAxis dataKey="date" tick={CHART_TICK} axisLine={false} tickLine={false} tickFormatter={fmtAxisDate}
                    interval={effectiveDays > 14 ? Math.floor(effectiveDays/7) : 0}/>
                  <YAxis tick={CHART_TICK} axisLine={false} tickLine={false} unit="%" width={38} domain={[0,100]}/>
                  <ReferenceLine y={50} stroke="#a78bfa44" strokeDasharray="4 4"/>
                  <Tooltip content={<ModuleTooltip fmt={v => `${v}%`}/>}/>
                  <Bar dataKey="pct" name="Deep Work %" fill="#a78bfa" radius={[4,4,0,0]} fillOpacity={0.85}/>
                </BarChart>
              </ResponsiveContainer>}
          </SectionCard>

          {/* Deep Work Blocks table */}
          {deepBlocks.length > 0 && (
            <SectionCard title="Deep Work Sessions" subtitle={`${deepBlocks.length} sessions ≥ 25 min in the last ${effectiveDays} days`}>
              <div className="space-y-2">
                {deepBlocks.slice(0, 10).map(b => {
                  const dt      = new Date(b.started_at * 1000);
                  const dateStr = dt.toLocaleDateString('en', { month:'short', day:'numeric' });
                  const timeStr = dt.toLocaleTimeString('en', { hour:'2-digit', minute:'2-digit' });
                  const mins    = Math.round((b.duration_seconds || 0) / 60);
                  const tier    = mins >= 90 ? { color:'#a78bfa', label:'Elite' } : mins >= 60 ? { color:'#f59e0b', label:'Strong' } : { color:'#5BA7FF', label:'Good' };
                  const barPct  = longestDeep > 0 ? Math.round((b.duration_seconds / longestDeep) * 100) : 0;
                  return (
                    <div key={b.id} className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5 hover:border-white/[0.1] transition-all">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border"
                        style={{ background:`${tier.color}18`, borderColor:`${tier.color}30` }}>
                        <Flame size={14} style={{ color: tier.color }}/>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                          <p className="text-xs font-semibold text-tx-primary truncate">{b.title || b.category || 'Deep Work'}</p>
                          <span className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
                            style={{ background:`${tier.color}20`, color: tier.color }}>{tier.label}</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                          <div className="h-full rounded-full" style={{ width:`${barPct}%`, background:`linear-gradient(90deg,${tier.color}88,${tier.color})` }}/>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold" style={{ color: tier.color }}>{mins}m</p>
                        <p className="text-[10px] text-tx-faint">{dateStr} {timeStr}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </SectionCard>
          )}
        </>}

        {/* ══════════════════════════════════════════════════════════════
            2. APP & WEBSITE USAGE
        ══════════════════════════════════════════════════════════════ */}
        {activeTab === 'usage' && <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KpiCard icon={Monitor}  label="Apps Tracked"       accentHex="#5BA7FF"
              value={appUsage.length} sub={`over ${effectiveDays} days`}/>
            <KpiCard icon={Clock}    label="Total App Time"      accentHex="#8B7CF6"
              value={fmtHrs(appTotal)} sub={`${(appTotal/3600/Math.max(effectiveDays,1)).toFixed(1)}h/day avg`}/>
            <KpiCard icon={AlertTriangle} label="Distraction Apps" accentHex="#f87171"
              value={distractApps.length} sub={fmtHrs(distractTime) + ' total'} inversetrend/>
            <KpiCard icon={TrendingUp} label="Top App Share"     accentHex="#3DD6A4"
              value={appUsage[0] ? `${Math.round((appUsage[0].total||0)/Math.max(appTotal,1)*100)}%` : '—'}
              sub={appUsage[0]?.app_name || 'no data'}/>
          </div>

          {appUsage.length === 0
            ? <div className="fl-analytics-card"><EmptyState icon={Monitor} msg="No app usage data — enable auto-tracking"/></div>
            : <>
              {/* App list */}
              <SectionCard title={`Top Apps — Last ${effectiveDays} Days`} subtitle={`${appUsage.length} apps tracked`}>
                <div className="divide-y divide-white/[0.05]">
                  {appUsage.slice(0, 15).map((a, i) => {
                    const pct    = appTotal > 0 ? Math.round((a.total||0)/appTotal*100) : 0;
                    const hrs    = (a.total||0)/3600;
                    const avg    = a.occurrences > 0 ? Math.round(((a.total||0)/60)/a.occurrences) : 0;
                    const accent = APP_ACCENTS[i % APP_ACCENTS.length];
                    const barPct = Math.max(3, Math.round(((a.total||0)/(appUsage[0]?.total||1))*100));
                    const isDistract = /youtube|twitter|instagram|facebook|reddit|tiktok|netflix|twitch/.test((a.app_name||'').toLowerCase());
                    return (
                      <div key={a.app_name} className="fl-app-row group py-3.5">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.055] bg-white/[0.03] text-[11px] font-bold text-tx-muted">
                          #{i+1}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-3">
                            <AppIcon appName={a.app_name} url={a.url} size={34} radius={8}/>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="truncate text-sm font-bold text-tx-primary">{a.app_name}</p>
                                {isDistract && (
                                  <span className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide bg-red-500/15 text-red-400">distraction</span>
                                )}
                              </div>
                              <p className="text-[10px] text-tx-faint mt-0.5">{a.occurrences} uses · avg {avg}m/session · {(hrs/Math.max(effectiveDays,1)).toFixed(2)}h/day</p>
                            </div>
                          </div>
                          <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white/[0.055]">
                            <div className="h-full rounded-full transition-all duration-500 group-hover:brightness-110"
                              style={{ width:`${barPct}%`, background:`linear-gradient(90deg,${accent}cc,${accent})`, boxShadow:`0 0 16px ${accent}33` }}/>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="num text-base font-extrabold text-white">{hrs.toFixed(1)}h</p>
                          <p className="text-[11px] text-tx-faint">{pct}% of total</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </SectionCard>

              {/* Distraction apps breakdown */}
              {distractApps.length > 0 && (
                <SectionCard title="Distraction Platforms" subtitle="Time spent on identified distraction apps">
                  <div className="space-y-3">
                    {distractApps.map((a, i) => {
                      const hrs  = (a.total||0)/3600;
                      const pct  = appTotal > 0 ? Math.round((a.total||0)/appTotal*100) : 0;
                      return (
                        <div key={a.app_name}>
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-2">
                              <AppIcon appName={a.app_name} url={a.url} size={22} radius={5}/>
                              <span className="text-xs font-medium text-tx-secondary">{a.app_name}</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-[11px] text-tx-faint">{pct}%</span>
                              <span className="text-xs font-bold text-red-400">{hrs.toFixed(1)}h</span>
                            </div>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                            <div className="h-full rounded-full" style={{ width:`${pct}%`, background:'linear-gradient(90deg,#ef444488,#f87171)' }}/>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </SectionCard>
              )}

              {/* Horizontal bar chart */}
              <SectionCard title="App Usage Chart" subtitle="Comparative view of top 12 apps">
                <ResponsiveContainer width="100%" height={Math.max(Math.min(appUsage.length,12) * 36, 140)}>
                  <BarChart data={appUsage.slice(0,12).map((a,i) => ({
                    name: a.app_name, hours: +(( a.total||0)/3600).toFixed(1), color: APP_ACCENTS[i%APP_ACCENTS.length],
                  }))} layout="vertical" barCategoryGap="22%">
                    <XAxis type="number" tick={CHART_TICK} axisLine={false} tickLine={false} unit="h"/>
                    <YAxis type="category" dataKey="name" tick={CHART_TICK} axisLine={false} tickLine={false} width={100}/>
                    <Tooltip content={<ModuleTooltip fmt={v => `${v}h`}/>}/>
                    <Bar dataKey="hours" name="Time" radius={[0,5,5,0]}>
                      {appUsage.slice(0,12).map((_,i) => <Cell key={i} fill={APP_ACCENTS[i%APP_ACCENTS.length]}/>)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </SectionCard>
            </>}
        </>}

        {/* ══════════════════════════════════════════════════════════════
            3. FOCUS VS DISTRACTION RATIO
        ══════════════════════════════════════════════════════════════ */}
        {activeTab === 'focus' && <>
          {/* Adaptive productivity trend */}
          {adaptiveHistory?.trend && adaptiveHistory.trend !== 'insufficient_data' && (
            <div className="flex items-center gap-3 rounded-xl border px-4 py-2.5"
              style={{ background:'rgba(16,185,129,0.06)', borderColor:'rgba(16,185,129,0.2)' }}>
              <TrendingUp size={13} className="shrink-0" style={{ color:'#10b981' }} />
              <span className="text-[10px] flex-1" style={{ color:'#6B8099' }}>
                {adaptiveHistory.insights?.[0]} · 7-day avg: {adaptiveHistory.rollingAvg7}/100 · 30-day avg: {adaptiveHistory.rollingAvg30}/100
              </span>
              <span className="shrink-0 text-[10px] font-bold capitalize rounded-lg px-2.5 py-1"
                style={{ background: adaptiveHistory.trend === 'improving' ? 'rgba(52,211,153,0.12)' : adaptiveHistory.trend === 'declining' ? 'rgba(248,113,113,0.12)' : 'rgba(129,140,248,0.12)', color: adaptiveHistory.trend === 'improving' ? '#34D399' : adaptiveHistory.trend === 'declining' ? '#F87171' : '#818CF8' }}>
                {adaptiveHistory.trend === 'improving' ? '↑ Improving' : adaptiveHistory.trend === 'declining' ? '↓ Declining' : '→ Stable'}
              </span>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KpiCard icon={Shield}       label="Focused Time"     accentHex="#10b981"
              value={fmtHrs(distraction?.focusSecs ?? focusSecs)} sub={`${focusPct}% of tracked time`}/>
            <KpiCard icon={AlertTriangle} label="Distracted Time"  accentHex="#f87171"
              value={fmtHrs(distraction?.distractedSecs ?? 0)}    sub={`${distractPct}% of tracked time`} inversetrend/>
            <KpiCard icon={Coffee}       label="Idle / Break"      accentHex="#f59e0b"
              value={fmtHrs(breakSecs)} sub={`${idlePct}% unaccounted`}/>
            <KpiCard icon={Zap}          label="Focus Sessions"    accentHex="#8B7CF6"
              value={sessCount} sub={`avg ${avgSessLen}m each`}/>
          </div>

          {/* Big ratio viz */}
          <SectionCard title="Focus vs Distraction Breakdown" subtitle="How your tracked time is distributed">
            {!distraction && focusSecs === 0
              ? <EmptyState icon={Shield} msg="Start auto-tracking to see your focus ratio"/>
              : <>
                {/* Segmented bar */}
                <div className="mb-6">
                  <div className="flex h-6 overflow-hidden rounded-full" style={{ gap: 2 }}>
                    {focusPct > 0 && <div className="flex items-center justify-center text-[9px] font-bold text-white transition-all"
                      style={{ width:`${focusPct}%`, background:'linear-gradient(90deg,#059669,#10b981)', borderRadius:'9999px 0 0 9999px' }}>
                      {focusPct >= 12 ? `${focusPct}%` : ''}
                    </div>}
                    {distractPct > 0 && <div className="flex items-center justify-center text-[9px] font-bold text-white transition-all"
                      style={{ width:`${distractPct}%`, background:'linear-gradient(90deg,#dc2626,#f87171)', borderRadius: focusPct === 0 ? '9999px 0 0 9999px' : 0 }}>
                      {distractPct >= 12 ? `${distractPct}%` : ''}
                    </div>}
                    {idlePct > 0 && <div className="flex items-center justify-center text-[9px] font-bold text-tx-faint transition-all"
                      style={{ width:`${idlePct}%`, background:'rgba(255,255,255,0.06)', borderRadius: '0 9999px 9999px 0' }}>
                      {idlePct >= 12 ? `${idlePct}%` : ''}
                    </div>}
                  </div>
                  <div className="mt-3 flex items-center gap-6">
                    {[['Focused','#10b981',focusPct],['Distracted','#f87171',distractPct],['Idle/Break','#6b7280',idlePct]].map(([l,c,p]) => (
                      <div key={l} className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ background:c }}/>
                        <span className="text-[11px] text-tx-muted">{l}</span>
                        <span className="text-[11px] font-bold text-tx-secondary">{p}%</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <StatPill label="Focused" value={fmtHrs(distraction?.focusSecs ?? focusSecs)} color="#10b981"/>
                  <StatPill label="Distracted" value={fmtHrs(distraction?.distractedSecs ?? distractTime)} color="#f87171"/>
                  <StatPill label="Break / Idle" value={fmtHrs(breakSecs)} color="#f59e0b"/>
                </div>
              </>}
          </SectionCard>

          {/* Focus trend per day */}
          <SectionCard title="Focus Ratio Trend" subtitle="Daily breakdown of focused vs distracted time">
            {daily.every(d => d.total === 0)
              ? <EmptyState icon={TrendingUp}/>
              : <>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={daily.map(d => ({
                    date: d.date,
                    'Deep Focus': d.deepWork,
                    'Focus':      Math.max(0, d.focus - d.deepWork),
                    'Meetings':   d.meetings,
                    'Breaks':     d.breaks,
                  }))} barCategoryGap="20%">
                    <CartesianGrid {...CHART_GRID_PROPS}/>
                    <XAxis dataKey="date" tick={CHART_TICK} axisLine={false} tickLine={false} tickFormatter={fmtAxisDate}
                      interval={effectiveDays > 14 ? Math.floor(effectiveDays/7) : 0}/>
                    <YAxis tick={CHART_TICK} axisLine={false} tickLine={false} unit="h" width={34}/>
                    <Tooltip content={<ModuleTooltip fmt={v => `${v}h`}/>}/>
                    <Bar dataKey="Deep Focus" stackId="a" fill="#a78bfa" radius={[0,0,0,0]}/>
                    <Bar dataKey="Focus"      stackId="a" fill="#3DD6A4" radius={[0,0,0,0]}/>
                    <Bar dataKey="Meetings"   stackId="a" fill="#5BA7FF" radius={[0,0,0,0]}/>
                    <Bar dataKey="Breaks"     stackId="a" fill="#f59e0b" radius={[4,4,0,0]}/>
                  </BarChart>
                </ResponsiveContainer>
                <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
                  {[['Deep Focus','#a78bfa'],['Focus','#3DD6A4'],['Meetings','#5BA7FF'],['Breaks','#f59e0b']].map(([l,c]) => (
                    <div key={l} className="flex items-center gap-1.5">
                      <span className="inline-block h-2 w-3 rounded-sm" style={{ background:c }}/>
                      <span className="text-[11px] font-medium text-tx-muted">{l}</span>
                    </div>
                  ))}
                </div>
              </>}
          </SectionCard>

          {/* Focus sessions list */}
          {sessions.length > 0 && (
            <SectionCard title="Focus Sessions" subtitle={`${sessions.length} sessions in this period`}>
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {sessions.slice(0, 20).map(s => {
                  const mins    = Math.round((s.duration_seconds || 0) / 60);
                  const dt      = new Date((s.started_at || 0) * 1000);
                  const isDeep  = !!s.is_deep_work;
                  return (
                    <div key={s.id} className="flex items-center gap-3 rounded-lg border border-white/[0.05] bg-white/[0.02] px-3.5 py-2.5 hover:border-white/[0.1] transition-all">
                      <div className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: isDeep ? '#a78bfa' : '#3DD6A4' }}/>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-tx-primary truncate">{s.title || s.category || 'Session'}</p>
                        <p className="text-[10px] text-tx-faint">{dt.toLocaleDateString('en',{month:'short',day:'numeric'})} · {dt.toLocaleTimeString('en',{hour:'2-digit',minute:'2-digit'})}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {isDeep && <span className="rounded px-1.5 py-0.5 text-[9px] font-bold bg-violet-500/15 text-violet-400">deep</span>}
                        <span className="text-xs font-bold text-tx-secondary">{mins}m</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </SectionCard>
          )}
        </>}

        {/* ══════════════════════════════════════════════════════════════
            4. TIME ALLOCATION BREAKDOWN
        ══════════════════════════════════════════════════════════════ */}
        {activeTab === 'allocation' && <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KpiCard icon={Brain}    label="Deep Work"   accentHex="#a78bfa" value={fmtHrs(deepSecs)}   sub={`${totalSecs ? Math.round(deepSecs/totalSecs*100) : 0}% of total`}/>
            <KpiCard icon={Zap}      label="Focus"       accentHex="#3DD6A4" value={fmtHrs(Math.max(0,focusSecs-deepSecs))}  sub={`${totalSecs ? Math.round(Math.max(0,focusSecs-deepSecs)/totalSecs*100) : 0}% of total`}/>
            <KpiCard icon={Users}    label="Meetings"    accentHex="#5BA7FF" value={fmtHrs(meetSecs)}   sub={`${meetPct}% of total`}/>
            <KpiCard icon={Coffee}   label="Breaks"      accentHex="#f59e0b" value={fmtHrs(breakSecs)}  sub={`${totalSecs ? Math.round(breakSecs/totalSecs*100) : 0}% of total`}/>
          </div>

          {/* Stacked area allocation */}
          <SectionCard title="Daily Time Allocation" subtitle="How each day was split across activity types">
            {daily.every(d => d.total === 0)
              ? <EmptyState icon={Layers}/>
              : <>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={allocationDaily} barCategoryGap="15%">
                    <CartesianGrid {...CHART_GRID_PROPS}/>
                    <XAxis dataKey="date" tick={CHART_TICK} axisLine={false} tickLine={false} tickFormatter={fmtAxisDate}
                      interval={effectiveDays > 14 ? Math.floor(effectiveDays/7) : 0}/>
                    <YAxis tick={CHART_TICK} axisLine={false} tickLine={false} unit="h" width={34}/>
                    <Tooltip content={<ModuleTooltip fmt={v => `${v}h`}/>}/>
                    {[['Deep Work','#a78bfa'],['Focus','#3DD6A4'],['Meetings','#5BA7FF'],['Breaks','#f59e0b'],['Other','#52606F']].map(([key,color]) => (
                      <Bar key={key} dataKey={key} stackId="a" fill={color} radius={key==='Other' ? [3,3,0,0] : [0,0,0,0]}/>
                    ))}
                  </BarChart>
                </ResponsiveContainer>
                <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
                  {[['Deep Work','#a78bfa'],['Focus','#3DD6A4'],['Meetings','#5BA7FF'],['Breaks','#f59e0b'],['Other','#52606F']].map(([l,c]) => (
                    <div key={l} className="flex items-center gap-1.5">
                      <span className="inline-block h-2 w-3 rounded-sm" style={{ background:c }}/>
                      <span className="text-[11px] font-medium text-tx-muted">{l}</span>
                    </div>
                  ))}
                </div>
              </>}
          </SectionCard>

          {/* Category allocation */}
          {catData.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Donut */}
              <SectionCard title="Category Distribution" subtitle="Share of time per category">
                <div className="flex flex-col items-center py-1">
                  <PieChart width={220} height={210}>
                    <Pie data={catData} cx={108} cy={100} innerRadius={58} outerRadius={88}
                      dataKey="hours" paddingAngle={3} stroke="rgba(17,21,31,0.95)" strokeWidth={3}>
                      {catData.map((_,i) => <Cell key={i} fill={catData[i].color}/>)}
                    </Pie>
                    <Tooltip content={<PieCatTooltip isLight={isLight}/>}/>
                  </PieChart>
                  <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-2">
                    {catData.map(c => (
                      <div key={c.name} className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full" style={{ background: c.color }}/>
                        <span className="text-[11px] text-tx-muted">{c.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </SectionCard>

              {/* Category breakdown bars */}
              <SectionCard title="Category Breakdown" subtitle="Hours by work category">
                <div className="space-y-3">
                  {catData.map(cat => (
                    <div key={cat.name}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <div className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md"
                            style={{ background:`${cat.catColor}22`, border:`1px solid ${cat.catColor}33` }}>
                            {cat.Icon && <cat.Icon size={12} style={{ color:cat.catColor }}/>}
                          </div>
                          <span className="text-xs font-medium text-white">{cat.name}</span>
                        </div>
                        <div className="flex items-center gap-2.5">
                          <span className="text-[10px] text-tx-faint">{cat.pct}%</span>
                          <span className="text-xs font-semibold text-tx-secondary w-10 text-right">{cat.hours}h</span>
                        </div>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
                        <div className="h-full rounded-full transition-all duration-500"
                          style={{ width:`${cat.pct}%`, background:`linear-gradient(90deg,${cat.color}88,${cat.color})` }}/>
                      </div>
                    </div>
                  ))}
                </div>
              </SectionCard>
            </div>
          )}

          {/* Summary stats table */}
          {totalSecs > 0 && (
            <SectionCard title="Allocation Summary" subtitle="Detailed breakdown of all tracked time">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                {[
                  { label:'Total Tracked',  value: fmtHrs(totalSecs),  color:'#8B7CF6', pct: 100 },
                  { label:'Deep Work',      value: fmtHrs(deepSecs),   color:'#a78bfa', pct: Math.round(deepSecs/totalSecs*100) },
                  { label:'Focused (non-deep)', value: fmtHrs(Math.max(0,focusSecs-deepSecs)), color:'#3DD6A4', pct: Math.round(Math.max(0,focusSecs-deepSecs)/totalSecs*100) },
                  { label:'Meetings',       value: fmtHrs(meetSecs),   color:'#5BA7FF', pct: meetPct },
                  { label:'Breaks',         value: fmtHrs(breakSecs),  color:'#f59e0b', pct: Math.round(breakSecs/totalSecs*100) },
                  { label:'Other',          value: fmtHrs(Math.max(0,totalSecs-focusSecs-meetSecs-breakSecs)), color:'#52606F',
                    pct: Math.max(0, 100 - Math.round(focusSecs/totalSecs*100) - meetPct - Math.round(breakSecs/totalSecs*100)) },
                ].map(item => (
                  <div key={item.label} className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ background: item.color }}/>
                      <span className="text-xs font-medium text-tx-secondary">{item.label}</span>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold" style={{ color: item.color }}>{item.value}</p>
                      <p className="text-[10px] text-tx-faint">{item.pct}%</p>
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}
        </>}

        {/* ══════════════════════════════════════════════════════════════
            5. CONTEXT SWITCHING ANALYSIS
        ══════════════════════════════════════════════════════════════ */}
        {activeTab === 'switching' && <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KpiCard icon={SplitSquareHorizontal} label="Switch Rate"       accentHex="#f59e0b"
              value={`${switchRate}%`} sub={`${shortSess.length} of ${sessions.length} sessions < 10m`} inversetrend/>
            <KpiCard icon={Timer}    label="Avg Session Length"  accentHex="#3DD6A4"
              value={`${avgSessLen}m`} sub="across all sessions"/>
            <KpiCard icon={Activity} label="Sessions / Day"      accentHex="#5BA7FF"
              value={switchPerDay} sub={`${sessions.length} total sessions`}/>
            <KpiCard icon={Brain}    label="Deep Work Ratio"     accentHex="#a78bfa"
              value={`${deepPct}%`} sub="time in uninterrupted focus"/>
          </div>

          {sessions.length === 0
            ? <div className="fl-analytics-card"><EmptyState icon={SplitSquareHorizontal} msg="No session data — start tracking focus sessions"/></div>
            : <>
              {/* Session length distribution */}
              <SectionCard title="Session Length Distribution" subtitle="How long your focus sessions typically run">
                {(() => {
                  const buckets = [
                    { label:'<5m',   min:0,    max:300,   color:'#f87171' },
                    { label:'5–10m', min:300,  max:600,   color:'#fb923c' },
                    { label:'10–25m',min:600,  max:1500,  color:'#f59e0b' },
                    { label:'25–60m',min:1500, max:3600,  color:'#3DD6A4' },
                    { label:'60–90m',min:3600, max:5400,  color:'#5BA7FF' },
                    { label:'>90m',  min:5400, max:Infinity, color:'#a78bfa' },
                  ];
                  const data = buckets.map(b => ({
                    label: b.label,
                    count: sessions.filter(s => (s.duration_seconds||0) >= b.min && (s.duration_seconds||0) < b.max).length,
                    color: b.color,
                  }));
                  const maxCount = Math.max(...data.map(d => d.count), 1);
                  return (
                    <>
                      <ResponsiveContainer width="100%" height={160}>
                        <BarChart data={data} barCategoryGap="20%">
                          <CartesianGrid {...CHART_GRID_PROPS}/>
                          <XAxis dataKey="label" tick={CHART_TICK} axisLine={false} tickLine={false}/>
                          <YAxis tick={CHART_TICK} axisLine={false} tickLine={false} width={28} allowDecimals={false}/>
                          <Tooltip content={<ModuleTooltip fmt={v => `${v}`}/>}/>
                          <Bar dataKey="count" name="Sessions" radius={[4,4,0,0]}>
                            {data.map((_,i) => <Cell key={i} fill={data[i].color}/>)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                      <div className="mt-4 grid grid-cols-3 gap-2 lg:grid-cols-6">
                        {data.map(b => (
                          <div key={b.label} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2 text-center">
                            <p className="text-sm font-bold" style={{ color: b.color }}>{b.count}</p>
                            <p className="text-[10px] text-tx-faint mt-0.5">{b.label}</p>
                          </div>
                        ))}
                      </div>
                    </>
                  );
                })()}
              </SectionCard>

              {/* Sessions per day */}
              <SectionCard title="Daily Session Count" subtitle="Number of sessions started per day (more = more switching)">
                <ResponsiveContainer width="100%" height={150}>
                  <ComposedChart data={daily}>
                    <CartesianGrid {...CHART_GRID_PROPS}/>
                    <XAxis dataKey="date" tick={CHART_TICK} axisLine={false} tickLine={false} tickFormatter={fmtAxisDate}
                      interval={effectiveDays > 14 ? Math.floor(effectiveDays/7) : 0}/>
                    <YAxis tick={CHART_TICK} axisLine={false} tickLine={false} width={28} allowDecimals={false}/>
                    <ReferenceLine y={Math.round(sessions.length/Math.max(effectiveDays,1))} stroke="#f59e0b55" strokeDasharray="4 4" label={{ value:'avg', fill:'#f59e0b88', fontSize:10 }}/>
                    <Tooltip content={<ModuleTooltip fmt={v => `${v}`}/>}/>
                    <Bar dataKey="sessions" name="Sessions" fill="#5BA7FF" radius={[4,4,0,0]} fillOpacity={0.85}/>
                    <Line type="monotone" dataKey="sessions" stroke="#f59e0b" strokeWidth={1.5} dot={false} name="Trend"/>
                  </ComposedChart>
                </ResponsiveContainer>
              </SectionCard>

              {/* Multitasking cost insight */}
              <SectionCard title="Switching Cost Insight" subtitle="Estimated productivity impact from context switching">
                <div className="space-y-4">
                  {[
                    { label:'Interruption sessions (< 10m)', value: shortSess.length, max: sessions.length, color:'#f87171', warn: switchRate > 40 },
                    { label:'Avg session length', value: `${avgSessLen}m`, raw: avgSessLen, max: 120, color:'#3DD6A4', warn: avgSessLen < 15 },
                    { label:'Sessions per day', value: switchPerDay, raw: parseFloat(switchPerDay), max: 15, color:'#5BA7FF', warn: parseFloat(switchPerDay) > 10 },
                    { label:'Deep work sessions', value: deepBlocks.length, max: sessions.length, color:'#a78bfa', warn: false },
                  ].map(item => (
                    <RiskBar key={item.label}
                      label={item.label}
                      value={item.value}
                      max={item.raw !== undefined ? item.max : Math.max(item.max,1)}
                      color={item.color}
                      warn={item.warn}/>
                  ))}
                  {switchRate > 40 && (
                    <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/8 px-4 py-3">
                      <p className="text-xs font-semibold text-amber-300">⚡ High context switching detected</p>
                      <p className="mt-1 text-[11px] text-amber-400/70">
                        {switchRate}% of your sessions are under 10 minutes. Try time-blocking longer focus windows to reduce switching overhead.
                      </p>
                    </div>
                  )}
                </div>
              </SectionCard>
            </>}
        </>}

        {/* ══════════════════════════════════════════════════════════════
            6. MEETING EFFICIENCY
        ══════════════════════════════════════════════════════════════ */}
        {activeTab === 'meetings' && <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KpiCard icon={Users}    label="Meeting Hours"    accentHex="#5BA7FF"
              value={fmtHrs(meetSecs)} sub={`${meetPct}% of total work time`}/>
            <KpiCard icon={Clock}    label="Avg / Day"        accentHex="#8B7CF6"
              value={`${meetPerDay}h`} sub={`on ${meetDays}/${effectiveDays} days`}/>
            <KpiCard icon={ArrowRight} label="Meeting:Work Ratio" accentHex="#f59e0b"
              value={typeof meetToWork === 'string' ? meetToWork : `${meetToWork}×`}
              sub="meetings vs deep work" inversetrend/>
            <KpiCard icon={Brain}    label="Deep Work Ratio"  accentHex="#a78bfa"
              value={`${deepPct}%`} sub="time in deep focus"/>
          </div>

          {meetSecs === 0
            ? <div className="fl-analytics-card"><EmptyState icon={Users} msg="No meeting sessions recorded in this period"/></div>
            : <>
              {/* Meeting vs Work stacked bar */}
              <SectionCard title="Meeting Load Per Day" subtitle="Daily meeting hours vs deep work hours">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={daily} barCategoryGap="20%" barGap={3}>
                    <CartesianGrid {...CHART_GRID_PROPS}/>
                    <XAxis dataKey="date" tick={CHART_TICK} axisLine={false} tickLine={false} tickFormatter={fmtAxisDate}
                      interval={effectiveDays > 14 ? Math.floor(effectiveDays/7) : 0}/>
                    <YAxis tick={CHART_TICK} axisLine={false} tickLine={false} unit="h" width={34}/>
                    <Tooltip content={<ModuleTooltip fmt={v => `${v}h`}/>}/>
                    <Bar dataKey="meetings" name="Meetings"  fill="#5BA7FF" radius={[4,4,0,0]} fillOpacity={0.85}/>
                    <Bar dataKey="deepWork" name="Deep Work" fill="#a78bfa" radius={[4,4,0,0]} fillOpacity={0.85}/>
                  </BarChart>
                </ResponsiveContainer>
                <div className="mt-3 flex items-center gap-5">
                  {[['Meetings','#5BA7FF'],['Deep Work','#a78bfa']].map(([l,c]) => (
                    <div key={l} className="flex items-center gap-1.5">
                      <span className="w-3 h-2 rounded-sm inline-block" style={{ background:c }}/>
                      <span className="text-[11px] text-tx-muted">{l}</span>
                    </div>
                  ))}
                </div>
              </SectionCard>

              {/* Meeting-heavy days highlight */}
              <SectionCard title="Meeting Load Analysis" subtitle="Days with heavy meeting load vs productive deep work">
                <div className="space-y-3">
                  {daily.filter(d => d.meetings > 0 || d.deepWork > 0).map(d => {
                    const meetShare = (d.meetings + d.deepWork) > 0 ? d.meetings / (d.meetings + d.deepWork) : 0;
                    const isHeavy   = meetShare > 0.5;
                    return (
                      <div key={d.date} className={`rounded-xl border px-4 py-3 transition-all ${isHeavy ? 'border-blue-500/20 bg-blue-500/5' : 'border-violet-500/15 bg-violet-500/4'}`}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold text-tx-primary">{d.fullDate || d.date}</span>
                          {isHeavy && <span className="rounded px-2 py-0.5 text-[9px] font-bold bg-blue-500/20 text-blue-400">meeting heavy</span>}
                        </div>
                        <div className="flex h-2 overflow-hidden rounded-full gap-0.5">
                          {d.deepWork > 0 && <div className="h-full rounded-full transition-all"
                            style={{ flex: d.deepWork, background:'linear-gradient(90deg,#7c3aed88,#a78bfa)' }}/>}
                          {d.meetings > 0 && <div className="h-full rounded-full transition-all"
                            style={{ flex: d.meetings, background:'linear-gradient(90deg,#1d4ed888,#5BA7FF)' }}/>}
                          {Math.max(0, d.total - d.deepWork - d.meetings) > 0 && <div className="h-full rounded-full"
                            style={{ flex: Math.max(0, d.total - d.deepWork - d.meetings), background:'rgba(255,255,255,0.06)' }}/>}
                        </div>
                        <div className="mt-1.5 flex items-center gap-4 text-[10px] text-tx-faint">
                          <span><span style={{ color:'#a78bfa' }}>●</span> Deep Work {d.deepWork.toFixed(1)}h</span>
                          <span><span style={{ color:'#5BA7FF' }}>●</span> Meetings {d.meetings.toFixed(1)}h</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </SectionCard>

              {/* Meeting efficiency insight */}
              {meetSecs > 0 && (
                <SectionCard title="Meeting Efficiency Insight">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="space-y-3">
                      <RiskBar label="Meeting share of work time" value={`${meetPct}%`} max={100} color="#5BA7FF" warn={meetPct > 35}/>
                      <RiskBar label="Meeting-to-deep-work ratio" value={`${meetToWork}×`} max={3} color="#8B7CF6" warn={parseFloat(meetToWork) > 1}/>
                      <RiskBar label="Days with meetings" value={`${meetDays}/${effectiveDays}`} max={effectiveDays} color="#3DD6A4" warn={false}/>
                    </div>
                    <div className="flex flex-col justify-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                      <p className="text-xs font-semibold text-tx-primary">
                        {meetPct > 35 ? '⚠️ Meeting overload risk' : meetPct > 20 ? '📅 Moderate meeting load' : '✅ Healthy meeting balance'}
                      </p>
                      <p className="text-[11px] text-tx-muted leading-relaxed">
                        {meetPct > 35
                          ? `You're spending ${meetPct}% of your work time in meetings. Consider blocking deep work time and declining non-essential meetings.`
                          : meetPct > 20
                          ? `${meetPct}% in meetings is manageable. Make sure to protect at least ${Math.round((100-meetPct)/100*parseFloat(avgPerDay)*0.5)}h/day for focused work.`
                          : `At ${meetPct}% meeting time, you have strong control over your schedule — great for deep work.`}
                      </p>
                    </div>
                  </div>
                </SectionCard>
              )}
            </>}
        </>}

        {/* ══════════════════════════════════════════════════════════════
            7. BURNOUT & ENERGY INSIGHTS
        ══════════════════════════════════════════════════════════════ */}
        {activeTab === 'burnout' && <>
          {/* Adaptive behavioral fatigue banner */}
          {adaptiveBurnout && adaptiveBurnout.observations > 5 && (
            <div className="flex items-start gap-3 rounded-xl border px-4 py-3 mb-1"
              style={{ background: adaptiveBurnout.riskLevel === 'high' || adaptiveBurnout.riskLevel === 'critical' ? 'rgba(239,68,68,0.07)' : 'rgba(251,191,36,0.06)', borderColor: adaptiveBurnout.riskLevel === 'high' || adaptiveBurnout.riskLevel === 'critical' ? 'rgba(239,68,68,0.25)' : 'rgba(251,191,36,0.25)' }}>
              <Brain size={14} className="shrink-0 mt-0.5" style={{ color: adaptiveBurnout.riskLevel === 'low' ? '#34D399' : adaptiveBurnout.riskLevel === 'high' ? '#f87171' : '#fbbf24' }} />
              <div>
                <p className="text-[10px] font-bold mb-0.5" style={{ color: adaptiveBurnout.riskLevel === 'low' ? '#34D399' : adaptiveBurnout.riskLevel === 'high' ? '#f87171' : '#fbbf24' }}>
                  Adaptive Intelligence · Learned Fatigue: {adaptiveBurnout.fatigue}% · Risk: {adaptiveBurnout.riskLevel.charAt(0).toUpperCase() + adaptiveBurnout.riskLevel.slice(1)}
                </p>
                <p className="text-[10px] leading-relaxed" style={{ color:'#6B8099' }}>
                  {adaptiveBurnout.insights?.[0]} {adaptiveBurnout.insights?.[1] ? `· ${adaptiveBurnout.insights[1]}` : ''}
                </p>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KpiCard icon={AlertTriangle} label="Burnout Risk"     accentHex={burnoutRisk > 60 ? '#f87171' : burnoutRisk > 30 ? '#f59e0b' : '#10b981'}
              value={`${burnoutRisk}%`} sub={burnoutRisk > 60 ? 'High risk — take action' : burnoutRisk > 30 ? 'Moderate — monitor' : 'Low — well balanced'} inversetrend/>
            <KpiCard icon={Flame}         label="Overwork Days"    accentHex="#f87171"
              value={overworkDays} sub={`days > 8h in ${effectiveDays}d period`} inversetrend/>
            <KpiCard icon={Coffee}        label="Break Ratio"      accentHex="#10b981"
              value={`${breakRatio}%`} sub="breaks as % of work time"/>
            <KpiCard icon={RefreshCw}     label="Rest Days"        accentHex="#5BA7FF"
              value={restDays} sub={`${effectiveDays - restDays} active days`}/>
          </div>

          {/* Daily hours trend with overwork line */}
          <SectionCard title="Daily Work Hours" subtitle="Work intensity over time — 8h threshold highlighted">
            {daily.every(d => d.total === 0)
              ? <EmptyState icon={AlertTriangle} msg="No session data to analyze"/>
              : <>
                <ResponsiveContainer width="100%" height={200}>
                  <ComposedChart data={daily} margin={{ top:10, right:12, bottom:4, left:-4 }}>
                    <defs>
                      <linearGradient id="burnGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%"  stopColor="#8B7CF6" stopOpacity={0.35}/>
                        <stop offset="95%" stopColor="#8B7CF6" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid {...CHART_GRID_PROPS}/>
                    <XAxis dataKey="date" tick={CHART_TICK} axisLine={false} tickLine={false} tickFormatter={fmtAxisDate}
                      interval={effectiveDays > 14 ? Math.floor(effectiveDays/7) : 0}/>
                    <YAxis tick={CHART_TICK} axisLine={false} tickLine={false} unit="h" width={34} domain={[0, Math.max(maxDay + 1, 10)]}/>
                    <ReferenceLine y={8} stroke="#f8717160" strokeDasharray="5 4" label={{ value:'8h limit', fill:'#f87171aa', fontSize:10, position:'insideTopRight' }}/>
                    <Tooltip content={<ModuleTooltip fmt={v => `${v}h`}/>}/>
                    <Area type="monotone" dataKey="total" name="Total Work" stroke="#8B7CF6" strokeWidth={2.2} fill="url(#burnGrad)" activeDot={{ r:4, strokeWidth:0 }}/>
                  </ComposedChart>
                </ResponsiveContainer>
                <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
                  <div className="flex items-center gap-1.5"><span className="w-4 h-0.5 inline-block rounded" style={{ background:'#8B7CF6' }}/><span className="text-[11px] text-tx-muted">Daily Hours</span></div>
                  <div className="flex items-center gap-1.5"><span className="w-4 h-0.5 inline-block rounded border-dashed border-t border-red-500"/><span className="text-[11px] text-tx-muted">8h Threshold</span></div>
                </div>
              </>}
          </SectionCard>

          {/* Burnout risk breakdown */}
          <SectionCard title="Burnout Risk Indicators" subtitle="Signals derived from your work patterns">
            <div className="space-y-4">
              {[
                { label:`Overwork days (>${ 8}h)`, value:`${overworkDays} days`, pct: Math.min(overworkDays/Math.max(effectiveDays,1)*100*3, 100), warn: overworkDays >= 3, note: overworkDays >= 3 ? 'Frequent overwork is a leading burnout signal' : 'Healthy' },
                { label:'Break frequency', value:`${breakRatio}%`, pct: Math.max(0, 30 - breakRatio) * 3.3, warn: breakRatio < 10, note: breakRatio < 10 ? 'Too few breaks — risk of mental fatigue' : 'Good recovery rhythm' },
                { label:`Avg daily hours (${avgPerDay}h)`, value: avgPerDay + 'h', pct: Math.min(parseFloat(avgPerDay)/12*100, 100), warn: parseFloat(avgPerDay) > 9, note: parseFloat(avgPerDay) > 9 ? 'Sustained high hours depletes energy' : 'Sustainable pace' },
                { label:'Rest days in period', value:`${restDays} days`, pct: Math.max(0, (effectiveDays >= 7 ? 2 : 1) - restDays) / 2 * 100, warn: restDays === 0 && effectiveDays >= 7, note: restDays === 0 && effectiveDays >= 7 ? 'No days off detected — schedule recovery time' : 'Recovery days found' },
              ].map(item => (
                <div key={item.label} className={`rounded-xl border p-3.5 ${item.warn ? 'border-red-500/20 bg-red-500/5' : 'border-white/[0.06] bg-white/[0.02]'}`}>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div>
                      <p className="text-xs font-semibold" style={{ color: item.warn ? '#f87171' : '#9AA6B8' }}>{item.label}</p>
                      <p className="text-[10px] text-tx-faint mt-0.5">{item.note}</p>
                    </div>
                    <span className="text-sm font-bold shrink-0" style={{ color: item.warn ? '#f87171' : '#3DD6A4' }}>{item.value}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                    <div className="h-full rounded-full transition-all duration-700"
                      style={{ width:`${item.pct}%`, background: item.warn ? 'linear-gradient(90deg,#dc262688,#f87171)' : 'linear-gradient(90deg,#05966988,#10b981)' }}/>
                  </div>
                </div>
              ))}
            </div>

            {burnoutRisk > 30 && (
              <div className={`mt-4 rounded-xl border px-4 py-3.5 ${burnoutRisk > 60 ? 'border-red-500/25 bg-red-500/8' : 'border-amber-500/20 bg-amber-500/8'}`}>
                <p className="text-xs font-bold" style={{ color: burnoutRisk > 60 ? '#f87171' : '#fbbf24' }}>
                  {burnoutRisk > 60 ? '🚨 High burnout risk detected' : '⚠️ Moderate burnout signals'}
                </p>
                <p className="mt-1.5 text-[11px] leading-relaxed" style={{ color: burnoutRisk > 60 ? '#fca5a5' : '#fde68a' }}>
                  {burnoutRisk > 60
                    ? 'Multiple high-risk indicators detected. Consider taking a recovery day, reducing meeting load, and ensuring you take regular short breaks throughout your day.'
                    : 'Some early warning signs present. Monitor your energy levels and make sure you\'re scheduling proper rest and recovery between intense work periods.'}
                </p>
              </div>
            )}
          </SectionCard>

          {/* Work intensity heatmap by day-of-week */}
          {effectiveDays >= 14 && (
            <SectionCard title="Work Pattern by Day of Week" subtitle="Average hours per weekday in this period">
              {(() => {
                const byDow = { Mon:[], Tue:[], Wed:[], Thu:[], Fri:[], Sat:[], Sun:[] };
                const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
                daily.forEach(d => {
                  if (!d.fullDate) return;
                  const dow = dayNames[new Date(d.fullDate).getDay()];
                  if (byDow[dow]) byDow[dow].push(d.total);
                });
                const data = Object.entries(byDow).map(([name, vals]) => ({
                  name, avg: vals.length ? +(vals.reduce((s,v)=>s+v,0)/vals.length).toFixed(1) : 0,
                }));
                const maxAvg = Math.max(...data.map(d => d.avg), 1);
                return (
                  <div className="grid grid-cols-7 gap-2">
                    {data.map(d => {
                      const intensity = maxAvg > 0 ? d.avg / maxAvg : 0;
                      const isWeekend = d.name === 'Sat' || d.name === 'Sun';
                      const color = isWeekend && d.avg > 2 ? '#f87171' : '#8B7CF6';
                      return (
                        <div key={d.name} className="flex flex-col items-center gap-2">
                          <div className="w-full aspect-square rounded-xl border border-white/[0.06] flex items-center justify-center"
                            style={{ background: intensity > 0 ? `${color}${Math.round(intensity * 40).toString(16).padStart(2,'0')}` : 'rgba(255,255,255,0.02)' }}>
                            <span className="text-sm font-bold" style={{ color: intensity > 0.3 ? color : '#52606F' }}>
                              {d.avg > 0 ? d.avg : '—'}
                            </span>
                          </div>
                          <span className="text-[10px] font-semibold" style={{ color: isWeekend ? '#f87171aa' : '#9AA6B8' }}>{d.name}</span>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </SectionCard>
          )}
        </>}

        {loading && (
          <div className="flex items-center justify-center py-20 text-tx-faint">
            <RefreshCw size={16} className="mr-2 animate-spin"/> Loading report data…
          </div>
        )}

      </div>

      {/* ── Export modal ── */}
      <ExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        reportTitle={`Reports — ${MODULES.find(m => m.id === activeTab)?.label || 'Analytics'}`}
        currentSectionLabel={`${MODULES.find(m => m.id === activeTab)?.label} · ${period === 'custom' ? 'Custom range' : `Last ${effectiveDays} days`}`}
        allSectionsLabel={`All ${MODULES.length} modules: ${MODULES.map(m => m.label).join(', ')}`}
        onExport={async (format, scope) => {
          const exportData = { daily, summary, appUsage, catData, deepBlocks, sessions, distraction, effectiveDays };
          const sectionIds = scope === 'current' ? [activeTab] : MODULES.map(m => m.id);
          const sections   = sectionIds.map(id => buildTabSection(id, exportData)).filter(Boolean);
          const periodLabel = period === 'custom' ? `${customFrom} to ${customTo}` : `Last ${effectiveDays} days`;
          const score = Math.max(0, Math.min(100, Math.round(deepPct * 0.4 + focusPct * 0.4 + (100 - burnoutRisk) * 0.2)));
          const burnoutLevel = burnoutRisk >= 60 ? 'High' : burnoutRisk >= 35 ? 'Elevated' : burnoutRisk >= 15 ? 'Moderate' : 'Low';
          const dailyAvgLastWeek  = (weekComp?.lastWeek?.totalSecs    || 0) / 3600 / 7;
          const deepAvgLastWeek   = (weekComp?.lastWeek?.deepWorkSecs || 0) / 3600 / 7;
          const focusPctLastWeek  = weekComp ? Math.round((weekComp.lastWeek?.focusSecs || 0) / Math.max(1, weekComp.lastWeek?.totalSecs || 0) * 100) : 0;
          const dailyFocusPctArr  = daily.map(d => d.total > 0 ? Math.round(d.focus / d.total * 100) : 0);

          // ── Representative day timeline (most recent date that has any sessions) ──
          const dateKey = (ts) => new Date(ts * 1000).toISOString().split('T')[0];
          const sessionDates = [...new Set(sessions.map(s => dateKey(s.started_at)))].sort();
          const repDate = sessionDates[sessionDates.length - 1];
          const timelineBlocks = sessions.filter(s => dateKey(s.started_at) === repDate).map(s => {
            const d = new Date(s.started_at * 1000);
            const startSec = d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
            const dur = s.duration_seconds || 0;
            if (s.session_type === 'meeting') return { startSec, durSec: dur, color: '#F87171', label: 'Meetings' };
            if (s.session_type === 'break')   return { startSec, durSec: dur, color: '#FBBF24', label: 'Breaks' };
            if (s.is_deep_work)                return { startSec, durSec: dur, color: '#5BA7FF', label: 'Deep Work' };
            if (dur < 600)                     return { startSec, durSec: dur, color: '#A78BFA', label: 'Context Switching' };
            return { startSec, durSec: dur, color: '#34D399', label: 'Focus Sessions' };
          });

          // ── Weekly activity heatmap (day-of-week × hour-of-day, minutes active) ──
          const heatmap = Array.from({ length: 7 }, () => Array(24).fill(0));
          sessions.forEach(s => {
            if (!s.started_at) return;
            const d = new Date(s.started_at * 1000);
            const day = (d.getDay() + 6) % 7; // Mon=0..Sun=6
            heatmap[day][d.getHours()] += (s.duration_seconds || 0) / 60;
          });

          const recommendations = [
            breakRatio < 10 ? { text: 'Increase break frequency — currently under 10% of tracked time, which raises fatigue risk.', confidence: 88 } : null,
            switchRate > 40 ? { text: 'Block longer, uninterrupted focus windows — over 40% of sessions are under 10 minutes.', confidence: 82 } : null,
            meetPct > 30 ? { text: 'Audit recurring meetings and consolidate them into fewer days to protect deep work blocks.', confidence: 76 } : null,
            distractApps.length > 0 ? { text: `Restrict access to ${distractApps[0]?.app_name || 'top distraction apps'} during core focus hours.`, confidence: 71 } : null,
          ].filter(Boolean).slice(0, 4);

          const meta = {
            dateRange: `${new Date(fromTs * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} – ${new Date(toTs * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
            period:    periodLabel,
            sections:  sectionIds.map(id => MODULES.find(m => m.id === id)?.label).filter(Boolean).join(', '),
            generatedBy: user.username,
            companyName: user.company || user.workspace_name || null,
            userName:    [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username,

            // Executive summary
            keyTakeaways: [
              `${deepPct}% of tracked time was deep work, averaging ${deepPerDay}h/day across ${effectiveDays} days.`,
              `Meetings consumed ${meetPct}% of tracked time (${meetPerDay}h/day average).`,
              distractApps.length > 0 ? `${distractApps.length} distraction app${distractApps.length === 1 ? '' : 's'} accounted for ${fmtH(distractTime)} this period.` : null,
              `Burnout risk is currently assessed as ${burnoutLevel.toLowerCase()} (${burnoutRisk}/100).`,
            ].filter(Boolean),
            execKpis: [
              { label: 'Total Tracked',  value: fmtH(totalSecs), progress: Math.min(100, Math.round(avgPerDay / Math.max(1, user.daily_target_hours || 6) * 100)) },
              { label: 'Deep Work',      value: `${deepPct}%`, trend: deepTrend, badge: deepPct >= 40 ? 'excellent' : deepPct >= 20 ? 'good' : 'warn', progress: deepPct },
              { label: 'Focus Accuracy', value: `${focusPct}%`, badge: focusPct >= 70 ? 'excellent' : focusPct >= 50 ? 'good' : 'warn', progress: focusPct },
              { label: 'Avg Hours/Day',  value: `${avgPerDay}h`, progress: Math.min(100, Math.round(avgPerDay / Math.max(1, user.daily_target_hours || 6) * 100)) },
            ],
            productivityScore: {
              value: score,
              description: 'Weighted blend of deep work ratio, focus accuracy, and burnout risk over the reporting period.',
              breakdown: [
                { label: 'Deep Work Ratio', weight: 40, value: deepPct,            color: '#5BA7FF' },
                { label: 'Focus Accuracy',  weight: 40, value: focusPct,           color: '#34D399' },
                { label: 'Burnout (inverse)', weight: 20, value: 100 - burnoutRisk, color: '#FBBF24' },
              ],
            },
            radar: [
              { label: 'Deep Work',        value: deepPct },
              { label: 'Focus',            value: focusPct },
              { label: 'Consistency',      value: deepConsistency },
              { label: 'Low Distraction',  value: Math.max(0, 100 - distractPct) },
              { label: 'Break Balance',    value: Math.min(100, breakRatio * 5) },
              { label: 'Meeting Balance',  value: Math.max(0, 100 - meetPct) },
            ],

            // Performance overview
            trend: {
              label: 'Total Tracked Hours',
              unit:  'h',
              points: daily.map(d => ({ label: d.date, value: d.total })),
            },
            comparative: [
              { label: 'Hours / Day',        current: avgPerDay, previous: +dailyAvgLastWeek.toFixed(1), best: +Math.max(...daily.map(d => d.total), 0).toFixed(1), average: +mean(daily.map(d => d.total)).toFixed(1), unit: 'h' },
              { label: 'Deep Work Hours/Day', current: +deepPerDay, previous: +deepAvgLastWeek.toFixed(1), best: +Math.max(...daily.map(d => d.deepWork), 0).toFixed(1), average: +mean(daily.map(d => d.deepWork)).toFixed(1), unit: 'h' },
              { label: 'Focus Accuracy',     current: focusPct, previous: focusPctLastWeek, best: Math.max(...dailyFocusPctArr, 0), average: Math.round(mean(dailyFocusPctArr)), unit: '%' },
            ],

            // Session timeline + weekly heatmap
            timeline: timelineBlocks.length ? {
              dateLabel: repDate ? new Date(repDate).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }) : 'Most recent tracked day',
              blocks: timelineBlocks,
              heatmap,
            } : null,

            // AI insights — expanded executive analysis, built from already-computed page metrics
            aiInsights: {
              strengths: [
                adaptiveFocus?.insights?.[0],
                adaptiveHistory?.trend === 'improving' ? 'Productivity trend is improving over the last 30 days.' : null,
                deepConsistency >= 70 ? `Deep work logged on ${daysWithDeep} of ${effectiveDays} days — strong consistency.` : null,
              ].filter(Boolean),
              weaknesses: [
                switchRate > 40 ? `${switchRate}% of sessions were under 10 minutes, indicating frequent context switching.` : null,
                meetPct > 30 ? `Meetings consumed ${meetPct}% of tracked time, limiting deep work capacity.` : null,
              ].filter(Boolean),
              opportunities: [
                distractApps.length > 0 ? `${distractApps.length} distraction app${distractApps.length === 1 ? '' : 's'} accounted for ${fmtH(distractTime)} this period.` : null,
                breakRatio < 10 ? 'Increase break frequency to sustain focus quality over longer sessions.' : null,
              ].filter(Boolean),
              bottlenecks: [
                overworkDays >= 3 ? `${overworkDays} overwork days (>8h) may be limiting recovery time.` : null,
                meetDays >= effectiveDays * 0.6 ? 'Meetings are spread across most days, fragmenting deep work blocks.' : null,
              ].filter(Boolean),
              burnoutRisk: {
                level: burnoutLevel,
                text: `Composite score of ${burnoutRisk}/100, based on overwork days (${overworkDays}), break ratio (${breakRatio}%), and average daily hours (${avgPerDay}h).`,
              },
              focusPattern: {
                text: adaptiveFocus?.peakWindow
                  ? `Peak focus window detected around ${adaptiveFocus.peakWindow}. ${adaptiveFocus.insights?.[0] || ''}`
                  : `Average session length is ${avgSessLen} minutes across ${sessCount} sessions, with ${switchPerDay} sessions/day.`,
              },
              predictedNextWeek: {
                value: deepTrend != null ? `${deepTrend > 0 ? '+' : ''}${deepTrend}%` : '—',
                text: deepTrend != null
                  ? `Based on the recent trend, deep work is projected to ${deepTrend >= 0 ? 'increase' : 'decrease'} next week if current patterns continue.`
                  : 'Insufficient trend history to generate a forecast yet.',
              },
              recommendations,
            },
            definitions: [
              { term: 'Deep Work',        definition: 'Continuous focused work sessions of 25 minutes or longer with minimal context switching.' },
              { term: 'Focus Accuracy',   definition: 'Share of tracked time classified as focused (non-distracted) activity.' },
              { term: 'Context Switch',   definition: 'A session shorter than 10 minutes, indicating fragmented attention.' },
              { term: 'Burnout Risk',     definition: 'Composite indicator based on overwork days, break ratio, and average daily hours.' },
              { term: 'Productivity Score', definition: '40% deep work ratio + 40% focus accuracy + 20% inverse burnout risk.' },
            ],

            // Final summary page
            finalSummary: {
              grade: gradeFromScore(score),
              score,
              highlights: [
                `Logged ${fmtH(totalSecs)} of tracked time over ${effectiveDays} day${effectiveDays === 1 ? '' : 's'}.`,
                catData[0] ? `${catData[0].name} was the top category at ${catData[0].pct}% of tracked time.` : null,
                longestDeep ? `Longest single deep work session reached ${fmtDuration(longestDeep)}.` : null,
              ].filter(Boolean),
              biggestAchievement: deepConsistency >= 50
                ? `Deep work was logged on ${daysWithDeep} of ${effectiveDays} days, with a longest session of ${fmtDuration(longestDeep)}.`
                : `Best single day reached ${Math.max(...daily.map(d => d.total), 0).toFixed(1)}h of tracked work.`,
              biggestOpportunity: recommendations[0]?.text || (meetPct > 30 ? 'Reduce meeting load to protect deep work capacity.' : 'Maintain current pace — no major opportunities flagged this period.'),
              aiRecommendation: recommendations[0]?.text || 'Continue current focus habits — no high-confidence changes recommended this period.',
              closing: `Overall, this was a ${score >= 70 ? 'strong' : score >= 50 ? 'solid' : 'challenging'} period with a productivity score of ${score}/100. ` +
                `${burnoutLevel === 'Low' ? 'Burnout risk remains low, supporting a sustainable pace.' : `Burnout risk is ${burnoutLevel.toLowerCase()} — consider the recommendations above before the next period.`}`,
            },
          };
          const title    = scope === 'current'
            ? `Flow Ledger — ${MODULES.find(m => m.id === activeTab)?.label} Report`
            : 'Flow Ledger — Full Analytics Report';
          const filename = `flow-ledger-reports-${activeTab}-${new Date().toISOString().split('T')[0]}`;
          if (format === 'csv') exportAsCSV(title, meta, sections, `${filename}.csv`);
          else await exportAsPDF(title, meta, sections);
        }}
      />
    </div>
  );
}
