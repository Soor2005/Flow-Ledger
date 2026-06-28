/**
 * DetailAnalyticsModal — shared analytics overlay for Projects, Clients, and Goals.
 *
 * Props:
 *   type    – 'project' | 'client' | 'goal'
 *   item    – the raw DB record
 *   user    – { id }
 *   onClose – callback
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  X, ChevronLeft, ChevronRight, Briefcase, Users, Target,
  Clock, TrendingUp, BarChart2, DollarSign, Zap, Calendar,
  Flame, Tag, Building2, Hash, Download,
} from 'lucide-react';
import {
  LineChart, Line, AreaChart, Area,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { exportAsCSV, exportAsPDF, fmtDuration, fmtMoney, fmtDate as fmtExportDate, fmtNow } from '../../utils/exportUtils';

const api = window.electron || {};

// ─── helpers ──────────────────────────────────────────────────────────────────
function fmt(s) {
  if (!s || s < 0) return '0m';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
function fmtHrs(s) { return ((s || 0) / 3600).toFixed(1) + 'h'; }

// Use local date parts to avoid UTC midnight → previous day shift in negative-offset timezones
function localDateKey(unix) {
  const d = new Date((unix || 0) * 1000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getWeekRange(offset = 0) {
  const now = new Date();
  // Monday-based week
  const day    = now.getDay() === 0 ? 6 : now.getDay() - 1;
  const monday = new Date(now);
  monday.setDate(now.getDate() - day + offset * 7);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return {
    from:  Math.floor(monday.getTime() / 1000),
    to:    Math.floor(sunday.getTime()  / 1000),
    days:  7,
    label: monday.toLocaleDateString('en', { month: 'short', day: 'numeric' }) +
           ' – ' +
           sunday.toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' }),
    monday,
  };
}

function getMonthRange(offset = 0) {
  const now   = new Date();
  const year  = now.getFullYear();
  const month = now.getMonth() + offset;
  const first = new Date(year, month, 1);
  const last  = new Date(year, month + 1, 0, 23, 59, 59, 999);
  return {
    from:  Math.floor(first.getTime() / 1000),
    to:    Math.floor(last.getTime()  / 1000),
    days:  last.getDate(),
    label: first.toLocaleDateString('en', { month: 'long', year: 'numeric' }),
    first,
  };
}

function buildDailyMap(sessions, itemFilterFn) {
  const map = {};
  (sessions || []).forEach(s => {
    if (!itemFilterFn(s)) return;
    const dk = localDateKey(s.started_at);
    map[dk] = (map[dk] || 0) + (s.duration_seconds || 0);
  });
  return map;
}

function makeDailyPoints(from, days, dailyMap) {
  return Array.from({ length: days }, (_, i) => {
    const unix = from + i * 86400;
    const dk   = localDateKey(unix);
    const d    = new Date(unix * 1000);
    const secs = dailyMap[dk] || 0;
    return {
      date:  d.toLocaleDateString('en', { month: 'short', day: 'numeric' }),
      hours: +(secs / 3600).toFixed(2),
      secs,
    };
  });
}

// ─── item meta ────────────────────────────────────────────────────────────────
// `projects` is only needed for type 'client', to also catch sessions that are
// only tagged with a project_id (no client_id of their own) so that, e.g.,
// 1h logged on each of 3 projects belonging to the same client adds up to 3h.
function getItemMeta(type, item, projects = []) {
  if (type === 'project') {
    return {
      name:   item.name,
      color:  item.color || '#3b82f6',
      Icon:   Briefcase,
      typeLabel: 'Project',
      tags: [
        item.status && { label: item.status, icon: Hash },
        item.hourly_rate > 0 && { label: `$${item.hourly_rate}/hr`, icon: DollarSign },
        item.keywords && { label: item.keywords.split(',')[0].trim(), icon: Tag },
      ].filter(Boolean),
      filterFn: s => s.project_id === item.id,
      billable: item.hourly_rate > 0,
      rate:     item.hourly_rate || 0,
    };
  }
  if (type === 'client') {
    const clientProjectIds = new Set(projects.filter(p => p.client_id === item.id).map(p => p.id));
    return {
      name:   item.name,
      color:  item.color || '#6366f1',
      Icon:   Users,
      typeLabel: 'Client',
      tags: [
        item.company && { label: item.company, icon: Building2 },
        item.status  && { label: item.status,  icon: Hash },
        item.billing_type && item.billing_type !== 'none' && { label: item.billing_type, icon: DollarSign },
      ].filter(Boolean),
      filterFn: s => s.client_id === item.id || clientProjectIds.has(s.project_id),
      billable: item.hourly_rate > 0,
      rate:     item.hourly_rate || 0,
    };
  }
  // goal
  return {
    name:   item.title,
    color:  '#7c6cf2',
    Icon:   Target,
    typeLabel: 'Goal',
    tags: [
      { label: item.period,              icon: Calendar },
      { label: `${item.target_hours}h target`, icon: Clock },
      item.category && { label: item.category, icon: Zap },
    ].filter(Boolean),
    filterFn: s => !item.category || (s.category || '').toLowerCase() === item.category.toLowerCase(),
    billable: false,
    rate:     0,
  };
}

// ─── Light / dark mode hook ───────────────────────────────────────────────────
function useIsLight() {
  const [isLight, setIsLight] = useState(
    () => document.documentElement.classList.contains('theme-light')
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

// ─── Per-theme palette ────────────────────────────────────────────────────────
function makeDA(isLight) {
  if (isLight) return {
    // ── Overlay ──────────────────────────────────────────────────────────────
    overlay:              'rgba(60,50,130,0.30)',
    // ── Modal card ───────────────────────────────────────────────────────────
    modalBg:              'linear-gradient(160deg, #FFFFFF 0%, #FAFBFF 55%, #F4F2FF 100%)',
    modalBorder:          'rgba(124,108,242,0.22)',
    modalShadow:          (c) => `0 0 0 1px ${c}14, 0 32px 80px rgba(0,0,0,0.12), 0 8px 32px rgba(124,108,242,0.12)`,
    // ── Accent stripe ─────────────────────────────────────────────────────────
    accentStripe:         'linear-gradient(90deg, transparent, rgba(124,108,242,0.55) 30%, #7c6cf2 50%, rgba(124,108,242,0.55) 70%, transparent)',
    // ── Header ───────────────────────────────────────────────────────────────
    headerBg:             'rgba(255,255,255,0.85)',
    headerBorder:         'rgba(124,108,242,0.09)',
    // ── Icon ─────────────────────────────────────────────────────────────────
    iconBg:               (c) => `${c}16`,
    iconBorder:           (c) => `${c}28`,
    // ── Type badge ───────────────────────────────────────────────────────────
    typeBadgeBg:          (c) => `${c}12`,
    typeBadgeColor:       (c) => c,
    // ── Text hierarchy ───────────────────────────────────────────────────────
    textPrimary:          '#0F0D20',
    textSecondary:        '#2E2B4A',
    textMuted:            '#4A4568',
    textFaint:            '#6A6688',
    // ── Close button ─────────────────────────────────────────────────────────
    closeBtnColor:        '#5A5778',
    closeBtnHoverBg:      'rgba(124,108,242,0.09)',
    closeBtnHoverColor:   '#0F0D20',
    closeBtnHoverBorder:  'rgba(124,108,242,0.18)',
    // ── Metrics strip ────────────────────────────────────────────────────────
    metricsBg:            'rgba(248,246,255,0.75)',
    metricsBorder:        'rgba(124,108,242,0.08)',
    metricCellBorder:     'rgba(124,108,242,0.08)',
    metricIconBg:         (c) => `${c}12`,
    metricLabel:          '#3D3A5C',
    metricValueColor:     '#0F0D20',
    metricSub:            '#5A5778',
    // ── Chart area ───────────────────────────────────────────────────────────
    chartAreaBg:          'transparent',
    // ── Period toggle pill ───────────────────────────────────────────────────
    togglePillBg:         'rgba(255,255,255,0.90)',
    togglePillBorder:     'rgba(124,108,242,0.15)',
    togglePillShadow:     '0 1px 4px rgba(124,108,242,0.08)',
    activeTabBg:          '#7c6cf2',
    activeTabColor:       '#FFFFFF',
    activeTabShadow:      '0 2px 8px rgba(124,108,242,0.30)',
    inactiveTabColor:     '#3D3A5C',
    // ── Nav buttons ──────────────────────────────────────────────────────────
    navBtnBg:             'rgba(255,255,255,0.90)',
    navBtnBorder:         'rgba(124,108,242,0.16)',
    navBtnText:           '#3D3A5C',
    navBtnHoverColor:     '#0F0D20',
    rangeText:            '#2E2B4A',
    // ── Chart header ─────────────────────────────────────────────────────────
    chartHeaderText:      '#0F0D20',
    chartSessionsText:    '#3D3A5C',
    // ── Chart card ───────────────────────────────────────────────────────────
    chartCardBg:          '#FFFFFF',
    chartCardBorder:      'rgba(124,108,242,0.10)',
    chartCardShadow:      '0 2px 16px rgba(124,108,242,0.07), 0 1px 4px rgba(0,0,0,0.03)',
    emptyIconColor:       '#9C98B8',
    emptyTextColor:       '#3D3A5C',
    peakTextColor:        '#3D3A5C',
    // ── Recharts ─────────────────────────────────────────────────────────────
    gridStroke:           'rgba(124,108,242,0.07)',
    axisTick:             '#4A4568',
    // ── Top days ─────────────────────────────────────────────────────────────
    sectionLabelColor:    '#4A4568',
    dayDateColor:         '#2E2B4A',
    progressTrack:        'rgba(124,108,242,0.09)',
    dayValueColor:        '#0F0D20',
    dayPctColor:          '#5A5778',
    // ── Footer ───────────────────────────────────────────────────────────────
    footerBg:             'rgba(248,246,255,0.90)',
    footerBorder:         'rgba(124,108,242,0.08)',
    footerMetaColor:      '#3D3A5C',
    footerValueColor:     '#0F0D20',
    footerBtnBg:          'rgba(255,255,255,0.90)',
    footerBtnBorder:      'rgba(124,108,242,0.18)',
    footerBtnText:        '#2E2B4A',
    footerBtnHoverBg:     'rgba(124,108,242,0.08)',
    footerBtnHoverBorder: 'rgba(124,108,242,0.28)',
    footerBtnHoverText:   '#0F0D20',
    // ── Tooltip ──────────────────────────────────────────────────────────────
    tipBg:                'rgba(255,255,255,0.98)',
    tipBorder:            'rgba(124,108,242,0.16)',
    tipShadow:            '0 4px 20px rgba(83,71,199,0.12), 0 1px 6px rgba(0,0,0,0.06)',
    tipLabel:             '#3D3A5C',
    tipValue:             '#0F0D20',
  };

  // ── Dark mode ─────────────────────────────────────────────────────────────
  return {
    overlay:              'rgba(0,0,0,0.72)',
    modalBg:              'linear-gradient(160deg,#141720 0%,#0F1219 60%,#0C0E16 100%)',
    modalBorder:          'rgba(255,255,255,0.08)',
    modalShadow:          (c) => `0 32px 80px rgba(0,0,0,0.65), 0 0 0 1px ${c}1E, 0 0 80px ${c}09`,
    accentStripe:         'linear-gradient(90deg, transparent, rgba(124,108,242,0.30) 30%, #7c6cf2 50%, rgba(124,108,242,0.30) 70%, transparent)',
    headerBg:             'transparent',
    headerBorder:         'rgba(255,255,255,0.07)',
    iconBg:               (c) => `${c}20`,
    iconBorder:           (c) => `${c}32`,
    typeBadgeBg:          (c) => `${c}1A`,
    typeBadgeColor:       (c) => c,
    textPrimary:          '#EDF1FA',
    textSecondary:        '#C0CBDB',
    textMuted:            '#9AAABB',
    textFaint:            '#7B8899',
    closeBtnColor:        '#8A9BB8',
    closeBtnHoverBg:      'rgba(255,255,255,0.07)',
    closeBtnHoverColor:   '#EDF1FA',
    closeBtnHoverBorder:  'rgba(255,255,255,0.12)',
    metricsBg:            'rgba(0,0,0,0.20)',
    metricsBorder:        'rgba(255,255,255,0.06)',
    metricCellBorder:     'rgba(255,255,255,0.06)',
    metricIconBg:         (c) => `${c}18`,
    metricLabel:          '#9AAABB',
    metricValueColor:     '#EDF1FA',
    metricSub:            '#7B8899',
    chartAreaBg:          'transparent',
    togglePillBg:         'linear-gradient(145deg,rgba(27,31,42,0.92),rgba(17,20,29,0.96))',
    togglePillBorder:     'rgba(255,255,255,0.07)',
    togglePillShadow:     '0 2px 8px rgba(0,0,0,0.18)',
    activeTabBg:          'rgba(255,255,255,0.09)',
    activeTabColor:       '#EDF1FA',
    activeTabShadow:      'none',
    inactiveTabColor:     '#8A9BB8',
    navBtnBg:             '#1A1D24',
    navBtnBorder:         '#2A2F3A',
    navBtnText:           '#C0CBDB',
    navBtnHoverColor:     '#EDF1FA',
    rangeText:            '#C0CBDB',
    chartHeaderText:      '#EDF1FA',
    chartSessionsText:    '#8A9BB8',
    chartCardBg:          'linear-gradient(145deg,rgba(27,31,42,0.92),rgba(17,20,29,0.96))',
    chartCardBorder:      'rgba(255,255,255,0.07)',
    chartCardShadow:      '0 16px 38px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.05)',
    emptyIconColor:       'rgba(255,255,255,0.18)',
    emptyTextColor:       '#8A9BB8',
    peakTextColor:        '#9AAABB',
    gridStroke:           '#1E2530',
    axisTick:             '#8090A4',
    sectionLabelColor:    '#8A9BB8',
    dayDateColor:         '#A8B8CC',
    progressTrack:        '#2A2F3A',
    dayValueColor:        '#EDF1FA',
    dayPctColor:          '#7B8899',
    footerBg:             'rgba(0,0,0,0.22)',
    footerBorder:         'rgba(255,255,255,0.06)',
    footerMetaColor:      '#8A9BB8',
    footerValueColor:     '#EDF1FA',
    footerBtnBg:          '#2A2F3A',
    footerBtnBorder:      '#363C4A',
    footerBtnText:        '#C0CBDB',
    footerBtnHoverBg:     '#1E2230',
    footerBtnHoverBorder: '#2A2F3A',
    footerBtnHoverText:   '#EDF1FA',
    tipBg:                '#12191B',
    tipBorder:            '#263438',
    tipShadow:            '0 4px 20px rgba(0,0,0,0.5)',
    tipLabel:             '#C0CBDB',
    tipValue:             '#F2F6FF',
  };
}

// ─── Custom tooltip ───────────────────────────────────────────────────────────
const ChartTip = ({ active, payload, label, isLight }) => {
  if (!active || !payload?.length) return null;
  const t = makeDA(isLight);
  return (
    <div style={{ background: t.tipBg, border: `1px solid ${t.tipBorder}`, borderRadius: 10, padding: '8px 12px', boxShadow: t.tipShadow }}>
      <p style={{ fontSize: 11, color: t.tipLabel, marginBottom: 4 }}>{label}</p>
      <p style={{ fontSize: 13, fontWeight: 700, color: t.tipValue }}>{payload[0]?.value}h</p>
    </div>
  );
};

// ─── Main Modal ───────────────────────────────────────────────────────────────
export default function DetailAnalyticsModal({ type, item, user, onClose }) {
  const isLight = useIsLight();
  const [viewPeriod,  setViewPeriod]  = useState('week');  // 'week' | 'month'
  const [offset,      setOffset]      = useState(0);       // 0 = current, -1 = prev, ...
  const [sessions,    setSessions]    = useState([]);
  const [allSessions, setAllSessions] = useState([]);      // all-time (for totals)
  const [loading,     setLoading]     = useState(true);
  const [tasks,       setTasks]       = useState([]);
  const [projects,    setProjects]    = useState([]);
  const [showExport,  setShowExport]  = useState(false);
  const [exporting,   setExporting]   = useState(false);

  const meta = useMemo(() => getItemMeta(type, item, projects), [type, item, projects]);
  const DT   = useMemo(() => makeDA(isLight), [isLight]);

  // Conditional primary-text class (replaces hardcoded `text-white` throughout)
  const pt = isLight ? 'text-[#1A1730]' : 'text-white';

  // ── Compute range ──────────────────────────────────────────────────────────
  const range = useMemo(
    () => viewPeriod === 'week' ? getWeekRange(offset) : getMonthRange(offset),
    [viewPeriod, offset]
  );

  // ── Load sessions for selected range ──────────────────────────────────────
  const loadRange = useCallback(async () => {
    setLoading(true);
    const [rangeRows, allRows] = await Promise.all([
      api.listSessions?.({ userId: user.id, from: range.from, to: range.to }),
      allSessions.length === 0
        ? api.listSessions?.({ userId: user.id, from: 0, to: Math.floor(Date.now() / 1000) })
        : Promise.resolve(null),
    ]);
    setSessions(rangeRows || []);
    if (allRows) setAllSessions(allRows);
    setLoading(false);
  }, [user.id, range.from, range.to]); // eslint-disable-line

  useEffect(() => { loadRange(); }, [loadRange]);

  // ── Load tasks/projects allocated to this client or project (for report export) ──
  useEffect(() => {
    if (type !== 'client' && type !== 'project') return;
    (async () => {
      const [taskList, projectList] = await Promise.all([
        api.listTasks?.({ userId: user.id }),
        api.listProjects?.({ userId: user.id }),
      ]);
      setTasks(taskList || []);
      setProjects(projectList || []);
    })();
  }, [type, item.id, user.id]);

  // ── Derived data ───────────────────────────────────────────────────────────
  const rangeFiltered = useMemo(
    () => sessions.filter(meta.filterFn),
    [sessions, meta.filterFn]
  );

  const allFiltered = useMemo(
    () => allSessions.filter(meta.filterFn),
    [allSessions, meta.filterFn]
  );

  // This week / this month totals
  const now = Math.floor(Date.now() / 1000);
  const weekStart  = now - 7  * 86400;
  const monthStart = now - 30 * 86400;

  const thisWeekSecs  = useMemo(() =>
    allFiltered.filter(s => s.started_at >= weekStart).reduce((a, s) => a + (s.duration_seconds || 0), 0),
  [allFiltered, weekStart]);

  const thisMonthSecs = useMemo(() =>
    allFiltered.filter(s => s.started_at >= monthStart).reduce((a, s) => a + (s.duration_seconds || 0), 0),
  [allFiltered, monthStart]);

  const allTimeSecs = useMemo(() =>
    allFiltered.reduce((a, s) => a + (s.duration_seconds || 0), 0),
  [allFiltered]);

  const allTimeSessions = allFiltered.length;

  const revenue = useMemo(() =>
    meta.billable
      ? allFiltered.reduce((a, s) => a + ((s.duration_seconds || 0) / 3600) * meta.rate, 0)
      : 0,
  [allFiltered, meta]);

  // ── Chart data ─────────────────────────────────────────────────────────────
  const dailyMap = useMemo(
    () => buildDailyMap(rangeFiltered, () => true),
    [rangeFiltered]
  );

  const chartData = useMemo(
    () => makeDailyPoints(range.from, range.days, dailyMap),
    [range.from, range.days, dailyMap]
  );

  const rangeTotalSecs = rangeFiltered.reduce((a, s) => a + (s.duration_seconds || 0), 0);
  const maxInChart     = Math.max(...chartData.map(d => d.hours), 0.1);
  const chartColor     = meta.color;

  const yNiceMax = (() => {
    if (maxInChart <= 1)  return 1;
    if (maxInChart <= 2)  return 2;
    if (maxInChart <= 4)  return 4;
    if (maxInChart <= 6)  return 6;
    if (maxInChart <= 8)  return 8;
    if (maxInChart <= 12) return 12;
    if (maxInChart <= 16) return 16;
    if (maxInChart <= 24) return 24;
    return Math.ceil(maxInChart / 8) * 8;
  })();
  const yStep  = yNiceMax / 4;
  const yTicks = [0, yStep, yStep * 2, yStep * 3, yNiceMax];

  // ── Metrics ────────────────────────────────────────────────────────────────
  const metrics = [
    { label: 'This Week',   value: fmtHrs(thisWeekSecs),         sub: 'last 7 days',       color: meta.color, Icon: Calendar },
    { label: 'This Month',  value: fmtHrs(thisMonthSecs),        sub: 'last 30 days',       color: '#2f81f7',  Icon: TrendingUp },
    { label: 'All Time',    value: fmtHrs(allTimeSecs),          sub: `${allTimeSessions} sessions`, color: '#10b981', Icon: Clock },
    ...(meta.billable ? [{ label: 'Revenue',  value: `$${revenue.toFixed(0)}`, sub: `@ $${meta.rate}/hr`, color: '#f59e0b', Icon: DollarSign }] : []),
    ...(type === 'goal'
      ? [{ label: 'Target', value: `${item.target_hours}h`, sub: item.period, color: '#7c6cf2', Icon: Target }]
      : []),
  ];

  // ── Report export: worked tasks, projects, and sessions allocated here ───────
  const canExportReport = type === 'client' || type === 'project';

  const projectNameById = useMemo(
    () => Object.fromEntries(projects.map(p => [p.id, p.name])),
    [projects]
  );

  const relatedTasks = useMemo(() => {
    if (!canExportReport) return [];
    return tasks.filter(t => type === 'client' ? t.client_id === item.id : t.project_id === item.id);
  }, [tasks, type, item.id, canExportReport]);

  const relatedProjects = useMemo(() => {
    if (type !== 'client') return [];
    return projects.filter(p => p.client_id === item.id);
  }, [projects, type, item.id]);

  const buildExportSections = () => {
    const sortedSessions = [...allFiltered].sort((a, b) => (b.started_at || 0) - (a.started_at || 0));

    const sections = [];

    if (type === 'client' && relatedProjects.length) {
      sections.push({
        title: 'Projects',
        headers: ['Project', 'Status', 'Hourly Rate', 'Hours Logged', 'Revenue'],
        rows: relatedProjects.map(p => {
          const projSecs = allSessions
            .filter(s => s.project_id === p.id)
            .reduce((a, s) => a + (s.duration_seconds || 0), 0);
          const projRevenue = (p.hourly_rate || 0) * (projSecs / 3600);
          return [p.name, p.status || 'active', fmtMoney(p.hourly_rate), fmtDuration(projSecs), fmtMoney(projRevenue)];
        }),
      });
    }

    sections.push({
      title: 'Worked Tasks',
      headers: ['Task', 'Project', 'Status', 'Priority', 'Estimated Hours', 'Logged Hours', 'Due Date'],
      rows: relatedTasks.map(t => [
        t.title,
        t.project_name || projectNameById[t.project_id] || '—',
        t.status || 'todo',
        t.priority ?? '—',
        t.estimated_hours ? `${t.estimated_hours}h` : '—',
        fmtDuration(t.total_seconds),
        fmtExportDate(t.due_date),
      ]),
    });

    sections.push({
      title: 'Sessions',
      headers: ['Date', 'Title', 'Project', 'Duration', 'Type'],
      rows: sortedSessions.map(s => [
        fmtExportDate(s.started_at),
        s.title || '—',
        projectNameById[s.project_id] || '—',
        fmtDuration(s.duration_seconds),
        s.is_deep_work ? 'Deep Work' : (s.session_type || 'focus'),
      ]),
      kpis: [
        { label: 'Total Sessions', value: sortedSessions.length },
        { label: 'Total Hours', value: fmtDuration(allTimeSecs) },
        ...(meta.billable ? [{ label: 'Total Revenue', value: fmtMoney(revenue) }] : []),
      ],
    });

    return sections;
  };

  const doExportReport = async (format) => {
    setExporting(true);
    try {
      const reportTitle = `${meta.name} — ${meta.typeLabel} Report`;
      const reportMeta = {
        [meta.typeLabel]: meta.name,
        ...(type === 'client' && item.company ? { Company: item.company } : {}),
        ...(type === 'client' ? { 'Billing Type': item.billing_type || 'none' } : {}),
        'Date Range': 'All time',
        'Total Hours': fmtDuration(allTimeSecs),
        ...(meta.billable ? { 'Total Revenue': fmtMoney(revenue) } : {}),
        Generated: fmtNow(),
      };
      const sections = buildExportSections();
      const filename = `${meta.typeLabel.toLowerCase()}-report-${meta.name}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');

      if (format === 'pdf') {
        await exportAsPDF(reportTitle, reportMeta, sections);
      } else {
        exportAsCSV(reportTitle, reportMeta, sections, filename);
      }
    } finally {
      setExporting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: DT.overlay,
        backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        padding: '16px 16px 84px 16px',
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        width: 620, maxWidth: 'calc(100vw - 32px)',
        maxHeight: '100%',
        display: 'flex', flexDirection: 'column',
        background: DT.modalBg,
        border: `1px solid ${DT.modalBorder}`,
        borderRadius: 20,
        boxShadow: DT.modalShadow(meta.color),
        overflow: 'hidden',
      }}>

        {/* ── Accent stripe ───────────────────────────────────────────────── */}
        <div style={{ height: 2, flexShrink: 0, background: DT.accentStripe }} />

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div style={{
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          padding: '18px 22px 14px',
          background: DT.headerBg,
          borderBottom: `1px solid ${DT.headerBorder}`,
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            {/* Color icon */}
            <div style={{
              width: 40, height: 40, borderRadius: 12, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: DT.iconBg(meta.color), border: `1px solid ${DT.iconBorder(meta.color)}`,
            }}>
              <meta.Icon size={17} style={{ color: meta.color }}/>
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <h2 style={{
                  fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em',
                  color: DT.textPrimary, margin: 0,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{meta.name}</h2>
                <span style={{
                  fontSize: 10, padding: '2px 8px', borderRadius: 99, fontWeight: 600,
                  background: DT.typeBadgeBg(meta.color), color: DT.typeBadgeColor(meta.color),
                }}>{meta.typeLabel}</span>
              </div>
              {/* Tags */}
              {meta.tags.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
                  {meta.tags.map((t, i) => (
                    <span key={i} style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      fontSize: 10, color: DT.textFaint,
                    }}>
                      <t.icon size={9} style={{ color: DT.textFaint }}/>
                      {t.label}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Close */}
          <button onClick={onClose}
            style={{
              width: 28, height: 28, borderRadius: 8, flexShrink: 0, marginLeft: 12,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent', border: '1px solid transparent',
              color: DT.closeBtnColor, cursor: 'pointer', transition: 'all 0.12s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.color = DT.closeBtnHoverColor;
              e.currentTarget.style.background = DT.closeBtnHoverBg;
              e.currentTarget.style.borderColor = DT.closeBtnHoverBorder;
            }}
            onMouseLeave={e => {
              e.currentTarget.style.color = DT.closeBtnColor;
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.borderColor = 'transparent';
            }}>
            <X size={14}/>
          </button>
        </div>

        {/* ── Metrics strip ───────────────────────────────────────────────── */}
        <div style={{
          display: 'flex',
          background: DT.metricsBg,
          borderBottom: `1px solid ${DT.metricsBorder}`,
          flexShrink: 0,
        }}>
          {metrics.map((m, i) => (
            <div key={i} style={{
              flex: 1, padding: '12px 16px', textAlign: 'center',
              borderRight: i < metrics.length - 1 ? `1px solid ${DT.metricCellBorder}` : 'none',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, marginBottom: 5 }}>
                <div style={{
                  width: 18, height: 18, borderRadius: 5,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: DT.metricIconBg(m.color),
                }}>
                  <m.Icon size={10} style={{ color: m.color }}/>
                </div>
                <span style={{
                  fontSize: 9, color: DT.metricLabel, textTransform: 'uppercase',
                  letterSpacing: '0.07em', fontWeight: 700,
                }}>{m.label}</span>
              </div>
              <p style={{ fontSize: 17, fontWeight: 800, color: DT.metricValueColor, lineHeight: 1, margin: 0, letterSpacing: '-0.02em' }}>
                {m.value}
              </p>
              <p style={{ fontSize: 9, color: DT.metricSub, marginTop: 3 }}>{m.sub}</p>
            </div>
          ))}
        </div>

        {/* ── Chart area ──────────────────────────────────────────────────── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px', background: DT.chartAreaBg }}>

          {/* Period toggle + nav */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            {/* Toggle pill */}
            <div style={{
              display: 'flex', gap: 2, padding: 3, borderRadius: 10,
              background: DT.togglePillBg,
              border: `1px solid ${DT.togglePillBorder}`,
              boxShadow: DT.togglePillShadow,
            }}>
              {['week','month'].map(p => (
                <button key={p}
                  onClick={() => { setViewPeriod(p); setOffset(0); }}
                  style={{
                    padding: '5px 14px', borderRadius: 7,
                    fontSize: 11, fontWeight: 600,
                    border: viewPeriod === p ? `1px solid ${DT.togglePillBorder}` : '1px solid transparent',
                    background: viewPeriod === p ? DT.activeTabBg : 'transparent',
                    color: viewPeriod === p ? DT.activeTabColor : DT.inactiveTabColor,
                    boxShadow: viewPeriod === p ? DT.activeTabShadow : 'none',
                    cursor: 'pointer', transition: 'all 0.15s', textTransform: 'capitalize',
                  }}>
                  {p === 'week' ? 'Week' : 'Month'}
                </button>
              ))}
            </div>

            {/* Period nav */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button onClick={() => setOffset(o => o - 1)}
                style={{
                  width: 28, height: 28,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: 8, cursor: 'pointer', transition: 'all 0.12s',
                  background: DT.navBtnBg, border: `1px solid ${DT.navBtnBorder}`,
                  color: DT.navBtnText,
                }}
                onMouseEnter={e => e.currentTarget.style.color = DT.navBtnHoverColor}
                onMouseLeave={e => e.currentTarget.style.color = DT.navBtnText}>
                <ChevronLeft size={13}/>
              </button>
              <span style={{
                fontSize: 11, color: DT.rangeText, minWidth: 160, textAlign: 'center', fontWeight: 500,
              }}>{range.label}</span>
              <button
                onClick={() => setOffset(o => Math.min(o + 1, 0))}
                disabled={offset >= 0}
                style={{
                  width: 28, height: 28,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: 8, cursor: offset >= 0 ? 'default' : 'pointer',
                  opacity: offset >= 0 ? 0.3 : 1, transition: 'all 0.12s',
                  background: DT.navBtnBg, border: `1px solid ${DT.navBtnBorder}`,
                  color: DT.navBtnText,
                }}
                onMouseEnter={e => { if (offset < 0) e.currentTarget.style.color = DT.navBtnHoverColor; }}
                onMouseLeave={e => e.currentTarget.style.color = DT.navBtnText}>
                <ChevronRight size={13}/>
              </button>
            </div>
          </div>

          {/* Chart header */}
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: DT.chartHeaderText, margin: 0 }}>
              {loading ? 'Loading…' : `${fmtHrs(rangeTotalSecs)} tracked`}
            </p>
            <p style={{ fontSize: 10, color: DT.chartSessionsText, margin: 0 }}>
              {rangeFiltered.length} session{rangeFiltered.length !== 1 ? 's' : ''}
            </p>
          </div>

          {/* Area chart card */}
          <div style={{
            borderRadius: 14, padding: '16px 16px 8px',
            background: DT.chartCardBg,
            border: `1px solid ${DT.chartCardBorder}`,
            boxShadow: DT.chartCardShadow,
          }}>
            {loading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 140, color: DT.emptyTextColor, fontSize: 11 }}>
                Loading data…
              </div>
            ) : rangeTotalSecs === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 140, gap: 6 }}>
                <BarChart2 size={22} style={{ color: DT.emptyIconColor }}/>
                <p style={{ fontSize: 11, color: DT.emptyTextColor, margin: 0 }}>No sessions in this period</p>
              </div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={140}>
                  <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 2 }}>
                    <defs>
                      <linearGradient id={`dam_grad_${type}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor={chartColor} stopOpacity={isLight ? 0.18 : 0.30}/>
                        <stop offset="95%" stopColor={chartColor} stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke={DT.gridStroke} strokeDasharray="4 4" vertical={false}/>
                    <XAxis dataKey="date" tick={{ fill: DT.axisTick, fontSize: 9 }}
                      axisLine={false} tickLine={false}
                      interval={viewPeriod === 'month' ? Math.floor(range.days / 6) : 0}/>
                    <YAxis
                      ticks={yTicks}
                      tickFormatter={v => `${v}h`}
                      tick={{ fill: DT.axisTick, fontSize: 10, fontWeight: 500 }}
                      axisLine={false} tickLine={false}
                      width={38} domain={[0, yNiceMax]}/>
                    <Tooltip content={<ChartTip isLight={isLight}/>}/>
                    <Area type="monotone" dataKey="hours" stroke={chartColor} strokeWidth={2}
                      fill={`url(#dam_grad_${type})`} dot={{ fill: chartColor, r: 3, strokeWidth: 0 }}
                      activeDot={{ r: 5, fill: chartColor }}/>
                  </AreaChart>
                </ResponsiveContainer>
                {/* Peak day callout */}
                {(() => {
                  const peak = chartData.reduce((a, d) => d.hours > a.hours ? d : a, chartData[0]);
                  return peak?.hours > 0 ? (
                    <p style={{ fontSize: 10, color: DT.peakTextColor, marginTop: 4, textAlign: 'center' }}>
                      Peak: <span style={{ color: chartColor, fontWeight: 600 }}>{peak.hours}h</span> on {peak.date}
                    </p>
                  ) : null;
                })()}
              </>
            )}
          </div>

          {/* Daily breakdown mini-list (top 5 days) */}
          {!loading && rangeTotalSecs > 0 && (
            <div style={{ marginTop: 18 }}>
              <p style={{
                fontSize: 9, color: DT.sectionLabelColor, textTransform: 'uppercase',
                letterSpacing: '0.08em', fontWeight: 700, marginBottom: 10,
              }}>
                Top Days
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {chartData
                  .filter(d => d.secs > 0)
                  .sort((a, b) => b.secs - a.secs)
                  .slice(0, 5)
                  .map((d, i) => {
                    const pct = rangeTotalSecs > 0 ? Math.round(d.secs / rangeTotalSecs * 100) : 0;
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 10, color: DT.dayDateColor, width: 76, flexShrink: 0 }}>{d.date}</span>
                        <div style={{ flex: 1, height: 5, borderRadius: 99, background: DT.progressTrack, overflow: 'hidden' }}>
                          <div style={{ height: '100%', borderRadius: 99, width: `${pct}%`, background: chartColor, transition: 'width 0.4s ease' }}/>
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 700, color: DT.dayValueColor, width: 32, textAlign: 'right' }}>{d.hours}h</span>
                        <span style={{ fontSize: 9, color: DT.dayPctColor, width: 26, textAlign: 'right' }}>{pct}%</span>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 22px 16px',
          background: DT.footerBg,
          borderTop: `1px solid ${DT.footerBorder}`,
          flexShrink: 0,
        }}>
          <p style={{ fontSize: 10, color: DT.footerMetaColor, margin: 0 }}>
            All-time:{' '}
            <span style={{ color: DT.footerValueColor, fontWeight: 700 }}>{fmtHrs(allTimeSecs)}</span>
            {' · '}
            <span style={{ color: DT.footerMetaColor }}>{allTimeSessions} sessions</span>
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {canExportReport && (
              <div style={{ position: 'relative' }}>
                <button onClick={() => setShowExport(v => !v)} disabled={exporting}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '7px 16px', borderRadius: 10, cursor: exporting ? 'default' : 'pointer',
                    fontSize: 12, fontWeight: 600, opacity: exporting ? 0.6 : 1,
                    background: DT.footerBtnBg,
                    border: `1px solid ${DT.footerBtnBorder}`,
                    color: meta.color,
                    transition: 'all 0.13s',
                  }}
                  onMouseEnter={e => { if (!exporting) { e.currentTarget.style.background = DT.footerBtnHoverBg; e.currentTarget.style.borderColor = DT.footerBtnHoverBorder; }}}
                  onMouseLeave={e => { e.currentTarget.style.background = DT.footerBtnBg; e.currentTarget.style.borderColor = DT.footerBtnBorder; }}>
                  <Download size={12} />
                  {exporting ? 'Exporting…' : 'Export Report'}
                </button>
                {showExport && !exporting && (
                  <>
                    <div style={{ position: 'fixed', inset: 0, zIndex: 10010 }} onClick={() => setShowExport(false)} />
                    <div style={{
                      position: 'absolute', bottom: '120%', right: 0, zIndex: 10011,
                      width: 200, borderRadius: 10, overflow: 'hidden',
                      background: DT.chartCardBg, border: `1px solid ${DT.chartCardBorder}`,
                      boxShadow: DT.chartCardShadow,
                    }}>
                      <p style={{ fontSize: 9.5, fontWeight: 700, color: DT.sectionLabelColor, textTransform: 'uppercase', letterSpacing: '0.07em', margin: 0, padding: '8px 12px 6px' }}>
                        Tasks, projects &amp; sessions
                      </p>
                      {[
                        { id: 'csv', label: 'Export as CSV' },
                        { id: 'pdf', label: 'Export as PDF' },
                      ].map(o => (
                        <button key={o.id}
                          onClick={() => { setShowExport(false); doExportReport(o.id); }}
                          style={{
                            width: '100%', textAlign: 'left', padding: '8px 12px',
                            fontSize: 12, color: DT.textSecondary, background: 'transparent',
                            border: 'none', cursor: 'pointer', transition: 'background 0.12s',
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = DT.footerBtnHoverBg}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                          {o.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
            <button onClick={onClose}
              style={{
                padding: '7px 18px', borderRadius: 10, cursor: 'pointer',
                fontSize: 12, fontWeight: 500,
                background: DT.footerBtnBg,
                border: `1px solid ${DT.footerBtnBorder}`,
                color: DT.footerBtnText,
                transition: 'all 0.13s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = DT.footerBtnHoverBg;
                e.currentTarget.style.borderColor = DT.footerBtnHoverBorder;
                e.currentTarget.style.color = DT.footerBtnHoverText;
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = DT.footerBtnBg;
                e.currentTarget.style.borderColor = DT.footerBtnBorder;
                e.currentTarget.style.color = DT.footerBtnText;
              }}>
              Close
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
