import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Plus, Search, X, Check, ChevronDown, Briefcase, Upload, DollarSign,
  Clock, MoreHorizontal, Edit2, Trash2, Users, ArrowUpDown, Tag,
  TrendingUp, BarChart2, Filter, Download, Table2, LayoutGrid, Columns,
  Activity, Calendar, Zap,
} from 'lucide-react';
import DetailAnalyticsModal from '../shared/DetailAnalyticsModal';
import CsvImportModal from '../shared/CsvImportModal';
import { downloadCSV, normalizeValue } from '../../utils/csv';
import { getProjectBehavioralIntel } from '../../ai/adaptive/behaviorAnalyticsBridge.js';

const api = window.electron || {};
const callApi = (name, fallback, payload) => {
  const fn = api[name];
  return typeof fn === 'function' ? fn(payload) : Promise.resolve(fallback);
};

const COLORS = ['#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444','#6366f1','#ec4899','#7c6cf2','#f97316','#06b6d4'];

const STATUS_OPTIONS = [
  { value: 'active',    label: 'Active',    color: '#3fb950', bg: '#3fb95015' },
  { value: 'inactive',  label: 'Inactive',  color: '#6b7280', bg: '#6b728015' },
  { value: 'completed', label: 'Completed', color: '#2f81f7', bg: '#2f81f715' },
  { value: 'paused',    label: 'Paused',    color: '#d29922', bg: '#d2992215' },
];

function fmt(s) {
  if (!s) return '—';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtDate(u) {
  if (!u) return '—';
  const d = new Date(u * 1000);
  const diffDays = Math.floor((Date.now() - d) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7)  return `${diffDays}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Status Badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const opt = STATUS_OPTIONS.find(o => o.value === (status || 'active')) || STATUS_OPTIONS[0];
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold tracking-wide"
      style={{ color: opt.color, background: opt.bg, border: `1px solid ${opt.color}35` }}>
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: opt.color, boxShadow: `0 0 4px ${opt.color}90` }} />
      {opt.label}
    </span>
  );
}

// ─── Budget Bar ────────────────────────────────────────────────────────────────
function BudgetBar({ used, total, color }) {
  if (!total) return <span className="text-xs text-tx-faint">No budget</span>;
  const pct = Math.min((used / total) * 100, 100);
  const barColor = pct > 90 ? '#ef4444' : pct > 70 ? '#d29922' : color;
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-tx-faint">{used.toFixed(1)}h / {total}h</span>
        <span className="text-[10px] font-semibold tabular-nums" style={{ color: barColor }}>{Math.round(pct)}%</span>
      </div>
      <div className="h-1.5 bg-brd-default rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500"
             style={{ width: `${pct}%`, background: barColor }} />
      </div>
    </div>
  );
}

// ─── Row Menu ──────────────────────────────────────────────────────────────────
function RowMenu({ onEdit, onDelete }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={e => { e.stopPropagation(); setOpen(v => !v); }}
        className="w-7 h-7 flex items-center justify-center rounded-lg text-tx-faint hover:text-white hover:bg-brd-default transition-all opacity-0 group-hover:opacity-100">
        <MoreHorizontal size={14} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-8 z-50 w-36 bg-bg-card border border-brd-strong rounded-xl shadow-2xl overflow-hidden">
            <button onClick={e => { e.stopPropagation(); setOpen(false); onEdit(); }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs text-tx-secondary hover:text-white hover:bg-brd-default transition-all">
              <Edit2 size={11} />Edit Project
            </button>
            <button onClick={e => { e.stopPropagation(); setOpen(false); onDelete(); }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-all">
              <Trash2 size={11} />Archive
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── KPI Strip ─────────────────────────────────────────────────────────────────
function KpiStrip({ projects, statsMap, weeklyMap }) {
  const activeCount   = projects.filter(p => (p.status || 'active') === 'active').length;
  const totalSecs     = Object.values(statsMap).reduce((a, s) => a + (s?.total || 0), 0);
  const totalHours    = totalSecs / 3600;
  const totalRevenue  = projects.reduce((sum, p) => sum + ((statsMap[p.id]?.total || 0) / 3600) * (p.hourly_rate || 0), 0);
  const weeklyHours   = Object.values(weeklyMap).reduce((a, s) => a + (s?.total || 0), 0) / 3600;
  const billableCount = projects.filter(p => (p.hourly_rate || 0) > 0).length;

  const kpis = [
    { label: 'Active Projects', value: activeCount, suffix: '', sub: `${billableCount} billable`, icon: <Briefcase size={16} />, color: '#7c6cf2' },
    { label: 'Hours Logged',    value: totalHours.toFixed(1), suffix: 'h', sub: '30-day total', icon: <Clock size={16} />, color: '#3b82f6' },
    { label: 'Revenue Earned',  value: `$${Math.round(totalRevenue).toLocaleString()}`, suffix: '', sub: '30-day total', icon: <DollarSign size={16} />, color: '#10b981' },
    { label: 'This Week',       value: weeklyHours.toFixed(1), suffix: 'h', sub: 'hours tracked', icon: <TrendingUp size={16} />, color: '#f59e0b' },
  ];

  return (
    <div className="grid grid-cols-4 gap-3 px-5 py-4 border-b border-brd-subtle">
      {kpis.map(k => (
        <div key={k.label}
          className="fl-report-card fl-entity-card fl-kpi-card flex items-center gap-3.5 px-4 py-3 rounded-xl bg-bg-card border border-brd-subtle">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
               style={{ background: k.color + '18', border: `1px solid ${k.color}28`, color: k.color }}>
            {k.icon}
          </div>
          <div className="min-w-0">
            <p className="text-[10px] text-tx-faint uppercase tracking-wider leading-none font-medium">{k.label}</p>
            <p className="text-[16px] font-bold text-white leading-tight mt-1">
              {k.value}<span className="text-[11px] font-semibold text-tx-secondary ml-0.5">{k.suffix}</span>
            </p>
            <p className="text-[10px] text-tx-faint leading-none mt-0.5">{k.sub}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Empty State ───────────────────────────────────────────────────────────────
function EmptyState({ onCreate, onImport }) {
  return (
    <div className="flex flex-col items-center justify-center flex-1 py-24">
      <div className="w-16 h-16 rounded-2xl bg-bg-card border border-brd-default flex items-center justify-center mb-4">
        <Briefcase size={26} className="text-tx-faint" />
      </div>
      <h3 className="text-sm font-bold text-white mb-1">No projects yet</h3>
      <p className="text-xs text-tx-faint text-center max-w-xs mb-6 leading-relaxed">
        Create your first project to track time, budget, and revenue across clients and deliverables.
      </p>
      <div className="flex items-center gap-3">
        <button onClick={onCreate}
          className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-all">
          <Plus size={14} />Create Project
        </button>
        <button onClick={onImport}
          className="flex items-center gap-2 bg-bg-card hover:bg-bg-hover border border-brd-default text-tx-secondary hover:text-white text-sm px-4 py-2.5 rounded-xl transition-all">
          <Upload size={14} />Import
        </button>
      </div>
    </div>
  );
}

// ─── Project Grid Card ─────────────────────────────────────────────────────────
function ProjectGridCard({ p, stats, weekly, recent, clients, onEdit, onDelete, onClick }) {
  const hours      = (stats?.total || 0) / 3600;
  const weeklyH    = (weekly?.total || 0) / 3600;
  const revenue    = hours * (p.hourly_rate || 0);
  const lastSess   = recent?.[0]?.started_at;
  const client     = clients.find(c => c.id === p.client_id);
  const budgetPct  = p.weekly_budget_hours > 0 ? Math.min((weeklyH / p.weekly_budget_hours) * 100, 100) : 0;
  const barColor   = budgetPct > 90 ? '#ef4444' : budgetPct > 70 ? '#d29922' : p.color;

  return (
    <div onClick={onClick}
      className="group fl-report-card fl-entity-card relative bg-bg-card border border-brd-subtle rounded-2xl overflow-hidden cursor-pointer transition-all duration-200">

      {/* Color stripe */}
      <div className="h-[3px]" style={{ background: `linear-gradient(90deg, ${p.color}, ${p.color}55)` }} />

      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start justify-between mb-3.5">
          <div className="flex items-start gap-2.5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold shrink-0"
                 style={{ background: p.color + '18', border: `1.5px solid ${p.color}30`, color: p.color }}>
              {p.name[0].toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-white leading-tight truncate max-w-[140px]">{p.name}</p>
              {client
                ? <p className="text-[10px] text-tx-faint mt-0.5 truncate">{client.name}</p>
                : <p className="text-[10px] text-tx-faint mt-0.5">No client</p>
              }
            </div>
          </div>
          <StatusBadge status={p.status || 'active'} />
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="bg-bg-app rounded-lg px-2.5 py-2">
            <p className="text-[9px] text-tx-faint uppercase tracking-wider">Hours (30d)</p>
            <p className="text-[12px] font-bold text-white mt-0.5">{hours > 0 ? hours.toFixed(1) + 'h' : '—'}</p>
          </div>
          <div className="bg-bg-app rounded-lg px-2.5 py-2">
            <p className="text-[9px] text-tx-faint uppercase tracking-wider">Revenue</p>
            <p className="text-[12px] font-bold text-green-400 mt-0.5">
              {revenue > 0 ? '$' + Math.round(revenue).toLocaleString() : 'N/A'}
            </p>
          </div>
          <div className="bg-bg-app rounded-lg px-2.5 py-2">
            <p className="text-[9px] text-tx-faint uppercase tracking-wider">Last Active</p>
            <p className="text-[11px] font-medium text-tx-secondary mt-0.5">{fmtDate(lastSess)}</p>
          </div>
          <div className="bg-bg-app rounded-lg px-2.5 py-2">
            <p className="text-[9px] text-tx-faint uppercase tracking-wider">Rate</p>
            <p className="text-[11px] font-semibold mt-0.5"
               style={{ color: p.hourly_rate > 0 ? '#4ade80' : undefined }}>
              {p.hourly_rate > 0 ? `$${p.hourly_rate}/hr` : <span className="text-tx-faint">Non-billable</span>}
            </p>
          </div>
        </div>

        {/* Weekly budget progress */}
        {p.weekly_budget_hours > 0 ? (
          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-[9px] text-tx-faint">Weekly budget</p>
              <p className="text-[9px] font-semibold" style={{ color: barColor }}>{Math.round(budgetPct)}%</p>
            </div>
            <div className="h-1 bg-brd-default rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500"
                   style={{ width: `${budgetPct}%`, background: barColor }} />
            </div>
            <p className="text-[9px] text-tx-faint mt-0.5">{weeklyH.toFixed(1)}h / {p.weekly_budget_hours}h this week</p>
          </div>
        ) : (
          <p className="text-[9px] text-tx-faint">No weekly budget set</p>
        )}
      </div>

      {/* Hover action overlay */}
      <div className="absolute bottom-3.5 right-3.5 flex items-center gap-1 opacity-0 group-hover:opacity-100 translate-y-1 group-hover:translate-y-0 transition-all duration-150">
        <button onClick={e => { e.stopPropagation(); onEdit(); }}
          className="w-6 h-6 flex items-center justify-center rounded-lg bg-bg-hover border border-brd-default text-tx-secondary hover:text-white transition-all">
          <Edit2 size={10} />
        </button>
        <button onClick={e => { e.stopPropagation(); onDelete(); }}
          className="w-6 h-6 flex items-center justify-center rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:text-red-300 transition-all">
          <Trash2 size={10} />
        </button>
      </div>
    </div>
  );
}

// ─── Kanban Card ───────────────────────────────────────────────────────────────
function KanbanCard({ p, stats, recent, clients, onClick, onEdit }) {
  const hours    = (stats?.total || 0) / 3600;
  const revenue  = hours * (p.hourly_rate || 0);
  const lastSess = recent?.[0]?.started_at;
  const client   = clients.find(c => c.id === p.client_id);

  return (
    <div onClick={onClick}
      className="group fl-report-card fl-entity-card bg-bg-card border border-brd-subtle rounded-xl p-3.5 cursor-pointer transition-all duration-150">

      <div className="flex items-start justify-between mb-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold shrink-0"
               style={{ background: p.color + '18', border: `1px solid ${p.color}28`, color: p.color }}>
            {p.name[0].toUpperCase()}
          </div>
          <p className="text-[12px] font-semibold text-white truncate">{p.name}</p>
        </div>
        <button onClick={e => { e.stopPropagation(); onEdit(); }}
          className="w-5 h-5 flex items-center justify-center rounded text-tx-faint hover:text-white hover:bg-brd-default transition-all opacity-0 group-hover:opacity-100 shrink-0">
          <Edit2 size={9} />
        </button>
      </div>

      {client && (
        <p className="text-[10px] text-tx-faint mb-2 flex items-center gap-1">
          <Users size={9} className="shrink-0" />{client.name}
        </p>
      )}

      <div className="flex items-center justify-between">
        <span className="text-[10px] text-tx-faint">
          {hours > 0 ? `${hours.toFixed(1)}h logged` : 'No sessions yet'}
        </span>
        {revenue > 0 && (
          <span className="text-[10px] font-semibold text-green-400">${Math.round(revenue).toLocaleString()}</span>
        )}
      </div>

      {lastSess && (
        <p className="text-[9px] text-tx-faint mt-1.5 flex items-center gap-1">
          <Activity size={8} className="shrink-0" />{fmtDate(lastSess)}
        </p>
      )}
    </div>
  );
}

// ─── Kanban Column ─────────────────────────────────────────────────────────────
function KanbanColumn({ status, projects, statsMap, recentMap, clients, onSelect, onEdit }) {
  const opt = STATUS_OPTIONS.find(o => o.value === status) || STATUS_OPTIONS[0];
  return (
    <div className="flex flex-col min-w-[272px] max-w-[272px]">
      {/* Column header */}
      <div className="flex items-center gap-2 px-1 pb-3">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: opt.color }} />
        <span className="text-xs font-semibold text-tx-secondary">{opt.label}</span>
        <span className="ml-auto text-[10px] font-medium text-tx-faint bg-brd-default rounded-full px-1.5 py-0.5 tabular-nums">
          {projects.length}
        </span>
      </div>

      {/* Cards */}
      <div className="flex flex-col gap-2 overflow-y-auto flex-1 pr-1">
        {projects.length === 0 ? (
          <div className="border border-dashed border-brd-subtle rounded-xl p-5 text-center">
            <p className="text-[11px] text-tx-faint">No {opt.label.toLowerCase()} projects</p>
          </div>
        ) : (
          projects.map(p => (
            <KanbanCard
              key={p.id}
              p={p}
              stats={statsMap[p.id]}
              recent={recentMap[p.id]}
              clients={clients}
              onClick={() => onSelect(p)}
              onEdit={() => onEdit(p)}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ─── Modal theme tokens (mirrors TasksPage pattern) ────────────────────────────
function modalTheme(isLight) {
  return isLight ? {
    // ── Light mode ────────────────────────────────────────────────────────
    backdrop: 'rgba(80,70,140,0.28)',
    cardBg: 'linear-gradient(160deg,#FAFBFF 0%,#F5F3FF 55%,#EDE9FF 100%)',
    cardBorder: 'rgba(124,108,242,0.28)', cardShadow: '0 0 0 1px rgba(124,108,242,0.14), 0 24px 60px rgba(124,108,242,0.18), 0 8px 24px rgba(0,0,0,0.08)',
    sectionBg: 'rgba(255,255,255,0.72)', sectionBorder: 'rgba(124,108,242,0.16)', sectionTitle: '#6B7280',
    labelColor: '#6B7280', headerTitle: '#0F172A', headerSub: '#6B7280',
    iconBg: 'rgba(124,108,242,0.12)', iconBorder: 'rgba(124,108,242,0.25)',
    closeBtnColor: '#9CA3AF', closeBtnHoverBg: 'rgba(15,23,42,0.07)', closeBtnHoverBorder: 'rgba(15,23,42,0.10)', closeBtnHoverColor: '#1E293B',
    inputBg: '#FFFFFF', inputBorder: 'rgba(124,108,242,0.25)', inputText: '#1E293B', inputBgFocus: 'rgba(124,108,242,0.04)', inputBorderBlur: 'rgba(124,108,242,0.22)',
    titleBg: '#FFFFFF', titleBorder: 'rgba(124,108,242,0.3)', titleBgFocus: 'rgba(124,108,242,0.04)', titleText: '#0F172A', titleBorderBlur: 'rgba(124,108,242,0.25)',
    selectBg: '#FFFFFF', selectBorder: 'rgba(124,108,242,0.25)', selectText: '#1E293B',
    iconColor: '#9CA3AF', colorScheme: 'light',
    btnInactiveBorder: 'rgba(124,108,242,0.22)', btnInactiveText: '#9CA3AF',
    btnHoverBg: 'rgba(124,108,242,0.07)', btnHoverText: '#374151', btnHoverBorder: 'rgba(124,108,242,0.35)',
    statusDotInactive: '#D1D5DB', tagHintColor: '#9CA3AF',
    footerBg: 'rgba(255,255,255,0.8)', footerBorder: 'rgba(124,108,242,0.16)',
    cancelBorder: 'rgba(15,23,42,0.14)', cancelText: '#4B5563',
    cancelHoverBg: 'rgba(124,108,242,0.07)', cancelHoverText: '#0F172A', cancelHoverBorder: 'rgba(124,108,242,0.35)',
    createMoreText: '#9CA3AF', createMoreActiveText: '#7c6cf2',
    toggleOffTrack: 'rgba(124,108,242,0.2)', toggleOffBorder: 'rgba(124,108,242,0.3)',
    swatchSelectedBorder: '#1E293B', swatchUnselectedBorder: 'transparent',
    customSwatchBg: 'rgba(15,23,42,0.07)', customSwatchBorder: 'rgba(15,23,42,0.18)', customSwatchPlus: 'rgba(15,23,42,0.4)',
  } : {
    // ── Dark mode ─────────────────────────────────────────────────────────
    backdrop: 'rgba(2,4,10,0.82)',
    cardBg: 'linear-gradient(160deg,#141720 0%,#0F1219 60%,#0C0E16 100%)',
    cardBorder: 'rgba(255,255,255,0.09)', cardShadow: '0 0 0 1px rgba(255,255,255,0.04), 0 40px 80px rgba(0,0,0,0.75), 0 0 80px rgba(124,108,242,0.07)',
    sectionBg: 'rgba(0,0,0,0.25)', sectionBorder: 'rgba(255,255,255,0.07)', sectionTitle: '#4B5568',
    labelColor: '#4B5568', headerTitle: '#E4E8F4', headerSub: '#4B5568',
    iconBg: 'rgba(124,108,242,0.16)', iconBorder: 'rgba(124,108,242,0.28)',
    closeBtnColor: '#4B5568', closeBtnHoverBg: 'rgba(255,255,255,0.08)', closeBtnHoverBorder: 'rgba(255,255,255,0.12)', closeBtnHoverColor: '#E4E8F4',
    inputBg: 'rgba(4,6,14,0.65)', inputBorder: 'rgba(255,255,255,0.09)', inputText: '#E4E8F4', inputBgFocus: 'rgba(124,108,242,0.12)', inputBorderBlur: 'rgba(255,255,255,0.08)',
    titleBg: 'rgba(4,6,14,0.7)', titleBorder: 'rgba(255,255,255,0.10)', titleBgFocus: 'rgba(124,108,242,0.12)', titleText: '#E4E8F4', titleBorderBlur: 'rgba(255,255,255,0.09)',
    selectBg: 'rgba(4,6,14,0.7)', selectBorder: 'rgba(255,255,255,0.09)', selectText: '#E4E8F4',
    iconColor: '#4B5568', colorScheme: 'dark',
    btnInactiveBorder: 'rgba(255,255,255,0.08)', btnInactiveText: '#6B7280',
    btnHoverBg: 'rgba(255,255,255,0.06)', btnHoverText: '#A0A8BC', btnHoverBorder: 'rgba(255,255,255,0.14)',
    statusDotInactive: '#3A404F', tagHintColor: '#3A404F',
    footerBg: 'rgba(0,0,0,0.28)', footerBorder: 'rgba(255,255,255,0.07)',
    cancelBorder: 'rgba(255,255,255,0.10)', cancelText: '#6B7280',
    cancelHoverBg: 'rgba(255,255,255,0.06)', cancelHoverText: '#C0C8DC', cancelHoverBorder: 'rgba(255,255,255,0.16)',
    createMoreText: '#4B5568', createMoreActiveText: '#C4B5FD',
    toggleOffTrack: 'rgba(42,47,58,0.9)', toggleOffBorder: 'rgba(255,255,255,0.07)',
    swatchSelectedBorder: 'white', swatchUnselectedBorder: 'transparent',
    customSwatchBg: 'rgba(255,255,255,0.08)', customSwatchBorder: 'rgba(255,255,255,0.16)', customSwatchPlus: 'rgba(255,255,255,0.55)',
  };
}

// ─── Project Modal ─────────────────────────────────────────────────────────────
function useThemeLight() {
  const [isLight, setIsLight] = useState(() => document.documentElement.classList.contains('theme-light'));
  useEffect(() => {
    const obs = new MutationObserver(() => setIsLight(document.documentElement.classList.contains('theme-light')));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  return isLight;
}

function ProjectModal({ project, clients, onClose, onSave }) {
  const isLight = useThemeLight();
  const T       = modalTheme(isLight);

  const [form, setForm] = useState({
    name:              project?.name                || '',
    color:             project?.color               || '#7c6cf2',
    clientId:          project?.client_id           || '',
    hourlyRate:        project?.hourly_rate          || '',
    keywords:          project?.keywords            || '',
    status:            project?.status              || 'active',
    weeklyBudgetHours: project?.weekly_budget_hours || '',
  });
  const [createMore, setCreateMore] = useState(false);
  const [saving,     setSaving]     = useState(false);
  const set     = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  const hasName = !!form.name.trim();

  const selectedStatus = STATUS_OPTIONS.find(o => o.value === form.status) || STATUS_OPTIONS[0];
  const selectedClient = clients.find(c => c.id === form.clientId);

  const save = async () => {
    if (!hasName) return;
    setSaving(true);
    await onSave({ ...form, hourlyRate: parseFloat(form.hourlyRate) || 0, weeklyBudgetHours: parseFloat(form.weeklyBudgetHours) || 0 });
    setSaving(false);
    if (createMore && !project) {
      setForm(prev => ({ name: '', color: prev.color, clientId: prev.clientId, hourlyRate: '', keywords: '', status: 'active', weeklyBudgetHours: '' }));
    } else {
      onClose();
    }
  };

  const inputFocus = e => { e.currentTarget.style.borderColor = 'rgba(124,108,242,0.58)'; e.currentTarget.style.background = T.inputBgFocus; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(124,108,242,0.09)'; };
  const inputBlur  = e => { e.currentTarget.style.borderColor = T.inputBorderBlur; e.currentTarget.style.background = T.inputBg; e.currentTarget.style.boxShadow = 'none'; };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: T.backdrop, backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', padding: '16px 16px 84px 16px' }}
      onClick={e => e.target === e.currentTarget && onClose()}>

      <div style={{ width: '100%', maxWidth: 560, maxHeight: '100%', background: T.cardBg, border: `1px solid ${T.cardBorder}`, borderRadius: 20, boxShadow: T.cardShadow, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* ── Accent stripe ── */}
        <div style={{ height: 2, flexShrink: 0, background: 'linear-gradient(90deg, transparent, #7c6cf290 30%, #7c6cf2 50%, #7c6cf290 70%, transparent)' }} />

        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px 12px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: T.iconBg, border: `1px solid ${T.iconBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Briefcase size={14} style={{ color: '#7c6cf2' }} />
            </div>
            <div>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: T.headerTitle, margin: 0, letterSpacing: '-0.02em' }}>{project ? 'Edit Project' : 'New Project'}</h3>
              <p style={{ fontSize: 10.5, color: T.headerSub, margin: 0, marginTop: 1 }}>{project ? 'Update project details' : 'Add a project to track time & budget'}</p>
            </div>
          </div>
          <button onClick={onClose}
            style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, background: 'transparent', border: '1px solid transparent', cursor: 'pointer', color: T.closeBtnColor, transition: 'all 0.12s ease' }}
            onMouseOver={e => { e.currentTarget.style.color = T.closeBtnHoverColor; e.currentTarget.style.background = T.closeBtnHoverBg; e.currentTarget.style.borderColor = T.closeBtnHoverBorder; }}
            onMouseOut={e  => { e.currentTarget.style.color = T.closeBtnColor; e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; }}>
            <X size={14} />
          </button>
        </div>

        {/* ── Scrollable Body ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 4px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 4 }}>

            {/* ── Project Name (primary focus) ── */}
            <div>
              <p style={{ fontSize: 9.5, fontWeight: 700, color: T.labelColor, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 4 }}>
                Project Name <span style={{ color: '#7c6cf2', fontSize: 10 }}>*</span>
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, background: form.color + '20', border: `1.5px solid ${form.color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Briefcase size={14} style={{ color: form.color }} />
                </div>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Website Redesign" autoFocus maxLength={120}
                  style={{ flex: 1, background: T.titleBg, border: `1px solid ${T.titleBorder}`, borderRadius: 11, padding: '10px 14px', fontSize: 14, fontWeight: 600, color: T.titleText, outline: 'none', letterSpacing: '-0.02em', transition: 'border-color 0.15s, background 0.15s, box-shadow 0.15s' }}
                  onFocus={e => { e.currentTarget.style.borderColor = 'rgba(124,108,242,0.6)'; e.currentTarget.style.background = T.titleBgFocus; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(124,108,242,0.09)'; }}
                  onBlur={e  => { e.currentTarget.style.borderColor = T.titleBorderBlur; e.currentTarget.style.background = T.titleBg; e.currentTarget.style.boxShadow = 'none'; }}
                />
              </div>
            </div>

            {/* ── Color ── */}
            <div style={{ background: T.sectionBg, border: `1px solid ${T.sectionBorder}`, borderRadius: 12 }}>
              <div style={{ padding: '9px 14px 0' }}><span style={{ fontSize: 9.5, fontWeight: 700, color: T.sectionTitle, textTransform: 'uppercase', letterSpacing: '0.09em' }}>Color</span></div>
              <div style={{ padding: '8px 14px 12px' }}>
                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
                  {COLORS.map(c => (
                    <button key={c} onClick={() => setForm(f => ({ ...f, color: c }))}
                      style={{ width: 26, height: 26, borderRadius: 8, background: c, border: `2px solid ${form.color === c ? T.swatchSelectedBorder : T.swatchUnselectedBorder}`, cursor: 'pointer', transition: 'all 0.12s ease', flexShrink: 0 }}
                      onMouseOver={e => { if (form.color !== c) e.currentTarget.style.transform = 'scale(1.15)'; }}
                      onMouseOut={e  => { e.currentTarget.style.transform = 'scale(1)'; }} />
                  ))}
                  {/* Custom picker */}
                  <div style={{ position: 'relative' }} title="Custom color">
                    <label htmlFor="proj-custom-color" style={{ width: 26, height: 26, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: `2px solid ${COLORS.includes(form.color) ? T.customSwatchBorder : T.swatchSelectedBorder}`, background: COLORS.includes(form.color) ? T.customSwatchBg : form.color, transition: 'all 0.12s ease', flexShrink: 0 }}>
                      {COLORS.includes(form.color) && <span style={{ fontSize: 14, color: T.customSwatchPlus, lineHeight: 1 }}>+</span>}
                    </label>
                    <input id="proj-custom-color" type="color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                      style={{ position: 'absolute', opacity: 0, width: '100%', height: '100%', top: 0, left: 0, cursor: 'pointer', pointerEvents: 'none' }} tabIndex={-1} />
                  </div>
                  {!COLORS.includes(form.color) && (
                    <span style={{ fontSize: 9.5, fontWeight: 700, color: form.color, background: form.color + '18', border: `1px solid ${form.color}40`, borderRadius: 6, padding: '3px 7px', fontVariantNumeric: 'tabular-nums', letterSpacing: '0.04em' }}>
                      {form.color.toUpperCase()}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* ── Assignment ── */}
            <div style={{ background: T.sectionBg, border: `1px solid ${T.sectionBorder}`, borderRadius: 12 }}>
              <div style={{ padding: '9px 14px 0' }}><span style={{ fontSize: 9.5, fontWeight: 700, color: T.sectionTitle, textTransform: 'uppercase', letterSpacing: '0.09em' }}>Assignment</span></div>
              <div style={{ padding: '8px 14px 12px' }}>
                <p style={{ fontSize: 9.5, fontWeight: 700, color: T.labelColor, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Users size={9} />Client
                </p>
                <div style={{ position: 'relative' }}>
                  {selectedClient && (
                    <div style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 18, height: 18, borderRadius: 5, background: (selectedClient.color || '#7c6cf2') + '25', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1, pointerEvents: 'none' }}>
                      <span style={{ fontSize: 8, fontWeight: 800, color: selectedClient.color || '#7c6cf2' }}>{selectedClient.name[0].toUpperCase()}</span>
                    </div>
                  )}
                  <select value={form.clientId} onChange={set('clientId')}
                    style={{ width: '100%', background: T.selectBg, border: `1px solid ${T.selectBorder}`, borderRadius: 9, padding: `8px 28px 8px ${selectedClient ? 34 : 10}px`, fontSize: 12, color: T.selectText, outline: 'none', appearance: 'none', cursor: 'pointer', boxSizing: 'border-box', transition: 'border-color 0.15s, box-shadow 0.15s', colorScheme: T.colorScheme }}
                    onFocus={e => { e.currentTarget.style.borderColor = 'rgba(124,108,242,0.55)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(124,108,242,0.08)'; }}
                    onBlur={e  => { e.currentTarget.style.borderColor = T.selectBorder; e.currentTarget.style.boxShadow = 'none'; }}>
                    <option value="">No client</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}{c.company ? ` · ${c.company}` : ''}</option>)}
                  </select>
                  <ChevronDown size={10} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: T.iconColor, pointerEvents: 'none' }} />
                </div>
              </div>
            </div>

            {/* ── Billing ── */}
            <div style={{ background: T.sectionBg, border: `1px solid ${T.sectionBorder}`, borderRadius: 12 }}>
              <div style={{ padding: '9px 14px 0' }}><span style={{ fontSize: 9.5, fontWeight: 700, color: T.sectionTitle, textTransform: 'uppercase', letterSpacing: '0.09em' }}>Billing</span></div>
              <div style={{ padding: '8px 14px 12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <p style={{ fontSize: 9.5, fontWeight: 700, color: T.labelColor, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 5 }}><DollarSign size={9} />Hourly Rate</p>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: T.iconColor, pointerEvents: 'none' }}>$</span>
                    <input type="number" value={form.hourlyRate} onChange={set('hourlyRate')} placeholder="0 = non-billable"
                      style={{ width: '100%', background: T.inputBg, border: `1px solid ${T.inputBorder}`, borderRadius: 9, padding: '8px 10px 8px 22px', fontSize: 12, color: T.inputText, outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s, box-shadow 0.15s', colorScheme: T.colorScheme }}
                      onFocus={inputFocus} onBlur={inputBlur} />
                  </div>
                </div>
                <div>
                  <p style={{ fontSize: 9.5, fontWeight: 700, color: T.labelColor, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 5 }}><Clock size={9} />Weekly Budget</p>
                  <div style={{ position: 'relative' }}>
                    <input type="number" min="0" step="0.5" value={form.weeklyBudgetHours} onChange={set('weeklyBudgetHours')} placeholder="hrs/wk"
                      style={{ width: '100%', background: T.inputBg, border: `1px solid ${T.inputBorder}`, borderRadius: 9, padding: '8px 40px 8px 10px', fontSize: 12, color: T.inputText, outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s, box-shadow 0.15s', colorScheme: T.colorScheme }}
                      onFocus={inputFocus} onBlur={inputBlur} />
                    <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: T.iconColor, pointerEvents: 'none' }}>hrs/wk</span>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Keywords ── */}
            <div style={{ background: T.sectionBg, border: `1px solid ${T.sectionBorder}`, borderRadius: 12 }}>
              <div style={{ padding: '9px 14px 0' }}><span style={{ fontSize: 9.5, fontWeight: 700, color: T.sectionTitle, textTransform: 'uppercase', letterSpacing: '0.09em' }}>Keywords</span></div>
              <div style={{ padding: '8px 14px 12px' }}>
                <div style={{ position: 'relative' }}>
                  <Tag size={11} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: T.iconColor, pointerEvents: 'none' }} />
                  <input value={form.keywords} onChange={set('keywords')} placeholder="project-name, repo-slug, jira-board…"
                    style={{ width: '100%', background: T.inputBg, border: `1px solid ${T.inputBorder}`, borderRadius: 9, padding: '8px 10px 8px 28px', fontSize: 12, color: T.inputText, outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s, box-shadow 0.15s' }}
                    onFocus={inputFocus} onBlur={inputBlur} />
                </div>
                <p style={{ fontSize: 10, color: T.tagHintColor, margin: '5px 0 0' }}>Window titles & URLs matching these are auto-attributed to this project.</p>
              </div>
            </div>

            {/* ── Status ── */}
            <div style={{ background: T.sectionBg, border: `1px solid ${T.sectionBorder}`, borderRadius: 12 }}>
              <div style={{ padding: '9px 14px 0' }}><span style={{ fontSize: 9.5, fontWeight: 700, color: T.sectionTitle, textTransform: 'uppercase', letterSpacing: '0.09em' }}>Status</span></div>
              <div style={{ padding: '8px 14px 12px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {STATUS_OPTIONS.map(opt => {
                  const active = form.status === opt.value;
                  return (
                    <button key={opt.value} onClick={() => setForm(f => ({ ...f, status: opt.value }))}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: active ? 600 : 400, border: `1px solid ${active ? `${opt.color}45` : T.btnInactiveBorder}`, background: active ? opt.bg : 'transparent', color: active ? opt.color : T.btnInactiveText, cursor: 'pointer', transition: 'all 0.12s ease' }}
                      onMouseOver={e => { if (!active) { e.currentTarget.style.background = T.btnHoverBg; e.currentTarget.style.color = T.btnHoverText; e.currentTarget.style.borderColor = T.btnHoverBorder; }}}
                      onMouseOut={e  => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.btnInactiveText; e.currentTarget.style.borderColor = T.btnInactiveBorder; }}}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: active ? opt.color : T.statusDotInactive, flexShrink: 0, boxShadow: active ? `0 0 5px ${opt.color}` : 'none', transition: 'all 0.12s' }} />
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

          </div>
        </div>

        {/* ── Footer ── */}
        <div style={{ padding: '12px 20px 18px', borderTop: `1px solid ${T.footerBorder}`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, background: T.footerBg }}>
          {/* Live summary */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0, overflow: 'hidden' }}>
            <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 5, background: `${selectedStatus.color}16`, border: `1px solid ${selectedStatus.color}30`, color: selectedStatus.color, fontWeight: 600, whiteSpace: 'nowrap' }}>
              <span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: selectedStatus.color, marginRight: 5, verticalAlign: 'middle' }} />{selectedStatus.label}
            </span>
            {form.hourlyRate && parseFloat(form.hourlyRate) > 0 && (
              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 5, background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.25)', color: '#34D399', fontWeight: 600, whiteSpace: 'nowrap' }}>
                ${form.hourlyRate}/hr
              </span>
            )}
            {!project && (
              <button onClick={() => setCreateMore(v => !v)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, color: createMore ? T.createMoreActiveText : T.createMoreText, background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 0', flexShrink: 0, transition: 'color 0.15s' }}>
                <div style={{ width: 26, height: 14, borderRadius: 99, background: createMore ? 'rgba(124,108,242,0.55)' : T.toggleOffTrack, transition: 'background 0.15s', position: 'relative', flexShrink: 0, border: `1px solid ${createMore ? 'rgba(124,108,242,0.65)' : T.toggleOffBorder}` }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#fff', position: 'absolute', top: 1, left: createMore ? 13 : 1, transition: 'left 0.15s', boxShadow: '0 1px 3px rgba(0,0,0,0.25)' }} />
                </div>
                Create more
              </button>
            )}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
            <button onClick={onClose}
              style={{ padding: '8px 15px', background: 'transparent', border: `1px solid ${T.cancelBorder}`, borderRadius: 9, color: T.cancelText, fontSize: 12, cursor: 'pointer', transition: 'all 0.12s ease', fontWeight: 500 }}
              onMouseOver={e => { e.currentTarget.style.color = T.cancelHoverText; e.currentTarget.style.borderColor = T.cancelHoverBorder; e.currentTarget.style.background = T.cancelHoverBg; }}
              onMouseOut={e  => { e.currentTarget.style.color = T.cancelText; e.currentTarget.style.borderColor = T.cancelBorder; e.currentTarget.style.background = 'transparent'; }}>
              Cancel
            </button>
            <button onClick={save} disabled={saving || !hasName}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', background: hasName ? '#7c6cf2' : (isLight ? 'rgba(124,108,242,0.15)' : 'rgba(124,108,242,0.22)'), border: `1px solid ${hasName ? '#9D8FF5' : 'rgba(124,108,242,0.2)'}`, borderRadius: 9, color: hasName ? '#fff' : (isLight ? 'rgba(124,108,242,0.45)' : 'rgba(255,255,255,0.3)'), fontSize: 12.5, fontWeight: 600, cursor: hasName ? 'pointer' : 'default', transition: 'all 0.12s ease', boxShadow: hasName ? '0 2px 12px rgba(124,108,242,0.32)' : 'none', letterSpacing: '-0.01em' }}
              onMouseOver={e => { if (hasName && !saving) { e.currentTarget.style.background = '#9D8FF5'; e.currentTarget.style.boxShadow = '0 4px 18px rgba(124,108,242,0.45)'; }}}
              onMouseOut={e  => { if (hasName) { e.currentTarget.style.background = '#7c6cf2'; e.currentTarget.style.boxShadow = '0 2px 12px rgba(124,108,242,0.32)'; }}}>
              <Check size={13} strokeWidth={2.5} />
              {saving ? 'Saving…' : project ? 'Save Changes' : 'Create Project'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function ProjectsPage({ user }) {
  const [projects,      setProjects]      = useState([]);
  const [clients,       setClients]       = useState([]);
  const [statsMap,      setStatsMap]      = useState({});
  const [recentMap,     setRecentMap]     = useState({});
  const [weeklyMap,     setWeeklyMap]     = useState({});
  const [showModal,     setShowModal]     = useState(false);
  const [editProj,      setEditProj]      = useState(null);
  const [detailProj,    setDetailProj]    = useState(null);
  const [showImport,    setShowImport]    = useState(false);
  const [search,        setSearch]        = useState('');
  const [statusFilter,  setStatusFilter]  = useState('all');
  const [clientFilter,  setClientFilter]  = useState('all');
  const [sortBy,        setSortBy]        = useState('name');
  const [sortDir,       setSortDir]       = useState('asc');
  const [loading,       setLoading]       = useState(true);
  const [view,          setView]          = useState('table'); // 'table' | 'grid' | 'kanban'

  // Per-project behavioral intelligence (memoized per project list)
  const projectBehaviorMap = useMemo(() => {
    const map = {};
    for (const p of projects) {
      try { const intel = getProjectBehavioralIntel(p.id); if (intel) map[p.id] = intel; } catch {}
    }
    return map;
  }, [projects]);

  const load = useCallback(async () => {
    setLoading(true);
    const [list, clientList] = await Promise.all([
      api.listProjects?.({ userId: user.id }),
      api.listClients?.({ userId: user.id }),
    ]);
    setProjects(list || []);
    setClients(clientList || []);

    if (list?.length) {
      const now = Math.floor(Date.now() / 1000), from = now - 30 * 86400;
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
      weekStart.setHours(0, 0, 0, 0);
      const weekFrom = Math.floor(weekStart.getTime() / 1000);
      const [statResults, recentResults, weekResults] = await Promise.all([
        Promise.all(list.map(p => callApi('projectStats', null, { userId: user.id, projectId: p.id, from, to: now }).then(s => ({ id: p.id, s })))),
        Promise.all(list.map(p => callApi('projectRecentSessions', [], { userId: user.id, projectId: p.id }).then(r => ({ id: p.id, r })))),
        Promise.all(list.map(p => callApi('projectStats', null, { userId: user.id, projectId: p.id, from: weekFrom, to: now }).then(s => ({ id: p.id, s })))),
      ]);
      const sm = {}, rm = {}, wm = {};
      statResults.forEach(({ id, s }) => { sm[id] = s; });
      recentResults.forEach(({ id, r }) => { rm[id] = r; });
      weekResults.forEach(({ id, s }) => { wm[id] = s; });
      setStatsMap(sm);
      setRecentMap(rm);
      setWeeklyMap(wm);
    }
    setLoading(false);
  }, [user.id]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async ({ name, color, clientId, hourlyRate, keywords, status, weeklyBudgetHours }) => {
    if (editProj) {
      await api.updateProject?.({ projectId: editProj.id, name, color, clientId: clientId || null, hourlyRate, keywords, status, weeklyBudgetHours });
    } else {
      await api.createProject?.({ userId: user.id, name, color, clientId: clientId || null, hourlyRate, keywords, status, weeklyBudgetHours });
    }
    setEditProj(null);
    await load();
  };

  const del = async (id) => {
    if (!window.confirm('Archive this project?')) return;
    await api.deleteProject?.({ projectId: id });
    setProjects(p => p.filter(x => x.id !== id));
  };

  const openEdit = (proj) => { setEditProj(proj); setShowModal(true); };

  const importProjects = async (rows) => {
    let imported = 0;
    for (const row of rows) {
      const name = row.name || row.project || row['project name'];
      if (!name) continue;
      const clientName = row.client || row['client name'];
      const client = clients.find(c => normalizeValue(c.name) === normalizeValue(clientName));
      await api.createProject?.({
        userId: user.id, name,
        color: row.color || '#3b82f6',
        clientId: client?.id || null,
        hourlyRate: parseFloat(row.hourly_rate || row['hourly rate'] || row.rate) || 0,
        keywords: row.keywords || row.tags || '',
        status: row.status || 'active',
        weeklyBudgetHours: parseFloat(row.weekly_budget_hours || row['weekly budget hours'] || row.budget) || 0,
      });
      imported += 1;
    }
    await load();
    return imported;
  };

  const exportCSV = () => {
    const rows = [['Project', 'Client', 'Status', 'Hourly Rate ($)', 'Weekly Budget Hours',
      'Hours Logged (30d)', 'Revenue (30d)', 'Last Active', 'Keywords']];
    filtered.forEach(project => {
      const stats  = statsMap[project.id];
      const recent = recentMap[project.id];
      const hours  = (stats?.total || 0) / 3600;
      rows.push([
        project.name, project.client_name || '', project.status || 'active',
        project.hourly_rate || 0, project.weekly_budget_hours || 0,
        hours.toFixed(2), (hours * (project.hourly_rate || 0)).toFixed(2),
        fmtDate(recent?.[0]?.started_at), project.keywords || '',
      ]);
    });
    downloadCSV(`projects-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  };

  // ── Derived data ─────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = [...projects];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(q) || (p.client_name || '').toLowerCase().includes(q));
    }
    if (statusFilter !== 'all') list = list.filter(p => (p.status || 'active') === statusFilter);
    if (clientFilter !== 'all') list = list.filter(p => (p.client_id || 'none') === clientFilter);
    list.sort((a, b) => {
      let va, vb;
      if (sortBy === 'name')     { va = a.name; vb = b.name; }
      else if (sortBy === 'time')     { va = statsMap[a.id]?.total || 0; vb = statsMap[b.id]?.total || 0; }
      else if (sortBy === 'activity') { va = recentMap[a.id]?.[0]?.started_at || 0; vb = recentMap[b.id]?.[0]?.started_at || 0; }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [projects, search, statusFilter, clientFilter, sortBy, sortDir, statsMap, recentMap]);

  const toggleSort = (col) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('asc'); }
  };

  const SortHeader = ({ col, children }) => (
    <button onClick={() => toggleSort(col)}
      className="flex items-center gap-1.5 text-tx-muted hover:text-tx-primary transition-colors uppercase tracking-wider text-[10px] font-semibold">
      {children}
      <ArrowUpDown size={9} className={sortBy === col ? 'text-accent' : 'opacity-50'} />
    </button>
  );

  // ── View: Table ───────────────────────────────────────────────────────────────
  // Shared cell padding + separator — all <td>s get a soft bottom border so rows
  // are clearly separated without heavy lines.  The last row's border is visually
  // absorbed by the page edge.  Header <th>s get a 2 px bottom line to create a
  // stronger visual anchor between the head and body zones.
  const TD = "align-middle border-b border-white/[0.055] px-4 py-4";
  const TH = "border-b-2 border-brd-strong/60 px-4 py-3.5";

  const renderTable = () => (
    <table className="w-full border-collapse">
      <thead className="sticky top-0 z-10">
        <tr className="fl-table-head">
          <th className={`${TH} text-left`}><SortHeader col="name">Project</SortHeader></th>
          <th className={`${TH} text-left w-36`}>
            <span className="text-tx-faint uppercase tracking-wider text-[10px] font-semibold">Client</span>
          </th>
          <th className={`${TH} text-left w-28`}>
            <span className="text-tx-faint uppercase tracking-wider text-[10px] font-semibold">Status</span>
          </th>
          <th className={`${TH} text-left w-28`}><SortHeader col="activity">Last Active</SortHeader></th>
          <th className={`${TH} text-right w-28`}><SortHeader col="time">Time (30d)</SortHeader></th>
          <th className={`${TH} text-left w-52`}>
            <span className="text-tx-faint uppercase tracking-wider text-[10px] font-semibold">Weekly Budget</span>
          </th>
          <th className={`${TH} text-right w-28`}>
            <span className="text-tx-faint uppercase tracking-wider text-[10px] font-semibold">Revenue</span>
          </th>
          <th className={`${TH} w-9`} />
        </tr>
      </thead>
      <tbody>
        {filtered.length === 0 ? (
          <tr>
            <td colSpan={8} className="text-center py-16 text-tx-faint text-sm">
              No projects match your filters.
              <button onClick={() => { setSearch(''); setStatusFilter('all'); setClientFilter('all'); }}
                className="ml-2 text-blue-400 hover:text-blue-300 underline">Clear filters</button>
            </td>
          </tr>
        ) : filtered.map(p => {
          const stats       = statsMap[p.id];
          const weekly      = weeklyMap[p.id];
          const recent      = recentMap[p.id];
          const timeSecs    = stats?.total || 0;
          const hours       = timeSecs / 3600;
          const weeklyHours = (weekly?.total || 0) / 3600;
          const revenue     = hours * (p.hourly_rate || 0);
          const lastSess    = recent?.[0]?.started_at;
          const client      = clients.find(c => c.id === p.client_id);

          return (
            <tr key={p.id} onClick={() => setDetailProj(p)}
              className="group fl-table-row fl-entity-row cursor-pointer transition-colors">

              {/* Project */}
              <td className={TD}>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold shrink-0"
                       style={{ background: p.color + '18', border: `1.5px solid ${p.color}30`, color: p.color }}>
                    {p.name[0].toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate leading-tight tracking-tight">{p.name}</p>
                    <p className="text-[10px] mt-0.5">
                      {p.hourly_rate > 0
                        ? <span className="text-emerald-400 font-medium">${p.hourly_rate}/hr</span>
                        : <span className="text-tx-faint">Non-billable</span>
                      }
                      {p.keywords && (
                        <span className="text-tx-faint"> · {p.keywords.split(',')[0].trim()}</span>
                      )}
                    </p>
                    {/* Adaptive behavioral badge */}
                    {projectBehaviorMap[p.id] && (
                      <p className="text-[9px] mt-0.5" style={{ color:'#5A6A88' }}>
                        🧠 {projectBehaviorMap[p.id].deepWorkRatioPct}% deep work · {projectBehaviorMap[p.id].sessionCount} sessions learned
                      </p>
                    )}
                  </div>
                </div>
              </td>

              {/* Client */}
              <td className={TD}>
                {client ? (
                  <div className="flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded-md flex items-center justify-center text-[9px] font-bold shrink-0"
                         style={{ background: (client.color || '#7c6cf2') + '20', color: client.color || '#7c6cf2' }}>
                      {client.name[0].toUpperCase()}
                    </div>
                    <span className="text-[11px] text-tx-secondary truncate">{client.name}</span>
                  </div>
                ) : (
                  <span className="text-[11px] text-tx-faint">—</span>
                )}
              </td>

              {/* Status */}
              <td className={TD}>
                <StatusBadge status={p.status || 'active'} />
              </td>

              {/* Last Active */}
              <td className={TD}>
                <span className="text-[11px] text-tx-secondary">{fmtDate(lastSess)}</span>
              </td>

              {/* Time */}
              <td className={`${TD} text-right`}>
                <span className="text-[12px] font-semibold text-white tabular-nums">
                  {timeSecs > 0 ? fmt(timeSecs) : '—'}
                </span>
              </td>

              {/* Weekly Budget */}
              <td className={`${TD} min-w-[200px]`}>
                {p.weekly_budget_hours > 0 ? (
                  <BudgetBar used={weeklyHours} total={p.weekly_budget_hours} color={p.color} />
                ) : (
                  <span className="text-[10px] text-tx-faint">No budget set</span>
                )}
              </td>

              {/* Revenue */}
              <td className={`${TD} text-right`}>
                {p.hourly_rate > 0
                  ? <span className={`text-[12px] font-semibold tabular-nums ${revenue > 0 ? 'text-green-400' : 'text-tx-faint'}`}>
                      {revenue > 0 ? `$${Math.round(revenue).toLocaleString()}` : '—'}
                    </span>
                  : <span className="text-[11px] text-tx-faint">N/A</span>
                }
              </td>

              {/* Actions */}
              <td className={`${TD} !px-2`} onClick={e => e.stopPropagation()}>
                <RowMenu onEdit={() => openEdit(p)} onDelete={() => del(p.id)} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  // ── View: Grid ────────────────────────────────────────────────────────────────
  const renderGrid = () => (
    <div className="p-5">
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-tx-faint text-sm">
          No projects match your filters.
          <button onClick={() => { setSearch(''); setStatusFilter('all'); setClientFilter('all'); }}
            className="ml-2 text-blue-400 hover:text-blue-300 underline">Clear filters</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map(p => (
            <ProjectGridCard
              key={p.id}
              p={p}
              stats={statsMap[p.id]}
              weekly={weeklyMap[p.id]}
              recent={recentMap[p.id]}
              clients={clients}
              onEdit={() => openEdit(p)}
              onDelete={() => del(p.id)}
              onClick={() => setDetailProj(p)}
            />
          ))}
        </div>
      )}
    </div>
  );

  // ── View: Kanban ──────────────────────────────────────────────────────────────
  const renderKanban = () => {
    const byStatus = (status) => filtered.filter(p => (p.status || 'active') === status);
    return (
      <div className="flex gap-4 p-5 overflow-x-auto h-full min-h-0">
        {STATUS_OPTIONS.map(opt => (
          <KanbanColumn
            key={opt.value}
            status={opt.value}
            projects={byStatus(opt.value)}
            statsMap={statsMap}
            recentMap={recentMap}
            clients={clients}
            onSelect={setDetailProj}
            onEdit={openEdit}
          />
        ))}
      </div>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="fl-page fl-projects-page fl-report-page">
      <div className="fl-work-surface flex flex-col">

        {/* ── Toolbar ── */}
        <div className="fl-page-toolbar">
          {/* Title */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/15 text-accent">
              <Briefcase size={15} />
            </div>
            <div>
              <h1 className="text-sm font-bold text-white leading-tight">Projects</h1>
              <p className="text-[10px] text-tx-faint leading-none">{projects.length} workstreams</p>
            </div>
          </div>

          {/* View switcher */}
          <div className="flex items-center gap-0.5 bg-bg-input border border-brd-default rounded-lg p-0.5 shrink-0 ml-2">
            {[
              { id: 'table', icon: <Table2 size={13} />, label: 'Table' },
              { id: 'grid',  icon: <LayoutGrid size={13} />, label: 'Grid' },
              { id: 'kanban',icon: <Columns size={13} />, label: 'Kanban' },
            ].map(v => (
              <button key={v.id} onClick={() => setView(v.id)} title={v.label}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                  view === v.id
                    ? 'bg-bg-card text-white shadow-sm border border-brd-default'
                    : 'text-tx-faint hover:text-tx-secondary'
                }`}>
                {v.icon}
                <span className="hidden sm:inline">{v.label}</span>
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative flex-1 max-w-xs ml-2">
            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-tx-faint" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search projects…"
              className="fl-search" />
            {search && (
              <button onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-tx-faint hover:text-white">
                <X size={10} />
              </button>
            )}
          </div>

          {/* Status filter */}
          <div className="relative">
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              className="rounded-lg border border-brd-default bg-bg-input pl-3 pr-7 py-2 text-xs text-tx-secondary focus:outline-none focus:border-accent appearance-none cursor-pointer transition-colors">
              <option value="all">All Status</option>
              {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <ChevronDown size={10} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-tx-faint pointer-events-none" />
          </div>

          {/* Client filter */}
          <div className="relative">
            <select value={clientFilter} onChange={e => setClientFilter(e.target.value)}
              className="rounded-lg border border-brd-default bg-bg-input pl-3 pr-7 py-2 text-xs text-tx-secondary focus:outline-none focus:border-accent appearance-none cursor-pointer transition-colors">
              <option value="all">All Clients</option>
              <option value="none">No Client</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <ChevronDown size={10} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-tx-faint pointer-events-none" />
          </div>

          <div className="flex-1" />

          {/* Action buttons */}
          {projects.length > 0 && (
            <button onClick={exportCSV}
              className="flex items-center gap-1.5 bg-bg-input hover:bg-bg-hover border border-brd-default text-tx-secondary hover:text-white text-xs px-3 py-2 rounded-lg transition-all">
              <Download size={11} />Export
            </button>
          )}
          <button onClick={() => setShowImport(true)}
            className="flex items-center gap-1.5 bg-bg-input hover:bg-bg-hover border border-brd-default text-tx-secondary hover:text-white text-xs px-3 py-2 rounded-lg transition-all">
            <Upload size={11} />Import
          </button>
          <button onClick={() => { setEditProj(null); setShowModal(true); }}
            className="flex items-center gap-1.5 bg-accent hover:bg-accent-light text-white text-xs font-semibold px-3.5 py-2 rounded-lg transition-all">
            <Plus size={12} />New Project
          </button>
        </div>

        {/* ── KPI Strip ── */}
        {!loading && projects.length > 0 && (
          <KpiStrip projects={projects} statsMap={statsMap} weeklyMap={weeklyMap} />
        )}

        {/* ── Content ── */}
        <div className={`flex-1 overflow-auto ${view === 'kanban' ? 'flex flex-col min-h-0' : ''}`}>
          {loading ? (
            <div className="flex items-center justify-center h-40 text-tx-faint text-sm">Loading…</div>
          ) : filtered.length === 0 && !search && statusFilter === 'all' && clientFilter === 'all' ? (
            <EmptyState
              onCreate={() => { setEditProj(null); setShowModal(true); }}
              onImport={() => setShowImport(true)}
            />
          ) : view === 'table' ? renderTable()
            : view === 'grid'  ? renderGrid()
            : renderKanban()
          }
        </div>

        {/* ── Modals ── */}
        {showModal && (
          <ProjectModal
            project={editProj}
            clients={clients}
            onClose={() => { setShowModal(false); setEditProj(null); }}
            onSave={handleSave}
          />
        )}
        {detailProj && (
          <DetailAnalyticsModal
            type="project"
            item={detailProj}
            user={user}
            onClose={() => setDetailProj(null)}
          />
        )}
        {showImport && (
          <CsvImportModal
            title="Import Projects"
            description="Upload a CSV with one project per row. Client is matched by name when present."
            columns={[
              { key: 'name', required: true, hint: 'Project name' },
              { key: 'client', hint: 'Existing client name, optional' },
              { key: 'status', hint: 'active, inactive, completed, or paused' },
              { key: 'hourly_rate', hint: 'Number used for revenue exports' },
              { key: 'weekly_budget_hours', hint: 'Weekly target hours' },
              { key: 'keywords', hint: 'Comma-separated tracking keywords' },
              { key: 'color', hint: 'Hex color, for example #3b82f6' },
            ]}
            sampleRows={[
              ['Website Redesign', 'Acme Corporation', 'active', '75', '10', 'website, redesign', '#3b82f6'],
            ]}
            onClose={() => setShowImport(false)}
            onImport={importProjects}
          />
        )}
      </div>
    </div>
  );
}
