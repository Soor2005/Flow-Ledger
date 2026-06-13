import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  BarChart2, Zap, Clock, TrendingUp, Monitor,
  Flame, DollarSign, ChevronUp, ChevronDown, Minus,
  Calendar, Share2, Download, Bell, Sparkles,
  MoreHorizontal, FolderOpen, Coffee, Target, Layers,
  ArrowRight, Info,
} from 'lucide-react';
import {
  AreaChart, Area, LineChart, Line,
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import { formatHours, lastNDays, getCategoryColor } from '../../utils/helpers';
import { getDashboardBehavioralKPIs } from '../../ai/adaptive/behaviorAnalyticsBridge.js';

const api = window.electron || {};

// ─── Constants ────────────────────────────────────────────────────────────────
const PERIODS = [
  { label: '7D', days: 7 }, { label: '14D', days: 14 },
  { label: '30D', days: 30 }, { label: '90D', days: 90 },
  { label: 'Custom', days: 'custom' },
];
const CAT_COLORS = [
  '#7c6cf2','#60A5FA','#34D399','#FBBF24','#F87171',
  '#A78BFA','#F472B6','#94A3B8',
];
const DAYS_LABEL = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const TOOLTIP_DARK_STYLE = { background: '#1A1D24', border: '1px solid #343A49', borderRadius: 10, fontSize: 11, color: '#EAEAF0' };
const TOOLTIP_DARK_LABEL = { color: '#EAEAF0', marginBottom: 4, fontWeight: 700 };
const TOOLTIP_DARK_ITEM = { color: '#EAEAF0', fontWeight: 600 };

// ─── Helpers ─────────────────────────────────────────────────────────────────
function pct(curr, prev) {
  if (!prev || prev === 0) return null;
  return Math.round(((curr - prev) / prev) * 100);
}
function fmtHM(secs) {
  if (!secs || secs <= 0) return '0m';
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
function fmtHour(h) {
  if (h === 0) return '12am';
  if (h < 12) return `${h}am`;
  if (h === 12) return '12pm';
  return `${h - 12}pm`;
}

// ─── Trend badge ──────────────────────────────────────────────────────────────
function TrendBadge({ p }) {
  if (p === null || p === undefined) return null;
  if (p === 0) return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 99, background: 'rgba(107,114,128,0.15)', color: '#6B7280' }}>
      <Minus size={8} />0%
    </span>
  );
  const pos = p > 0;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 2,
      fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99,
      background: pos ? 'rgba(52,211,153,0.12)' : 'rgba(248,113,113,0.12)',
      color: pos ? '#34D399' : '#F87171',
    }}>
      {pos ? <ChevronUp size={9} strokeWidth={2.5} /> : <ChevronDown size={9} strokeWidth={2.5} />}
      {Math.abs(p)}%
    </span>
  );
}

// ─── Tiny sparkline ───────────────────────────────────────────────────────────
function Sparkline({ data, color, dataKey = 'val' }) {
  if (!data || data.length < 2) return <div style={{ height: 40 }} />;
  return (
    <ResponsiveContainer width="100%" height={40}>
      <AreaChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={`spark_${color.replace('#','')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={color} stopOpacity={0.25} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={1.5}
          fill={`url(#spark_${color.replace('#','')})`} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ─── Mini 48-slot activity timeline ──────────────────────────────────────────
function MiniTimeline({ sessions = [], catData = [] }) {
  const SLOTS = 48;
  const segments = useMemo(() => {
    const arr = Array(SLOTS).fill(null).map(() => ({ color: null }));
    const mark = (startUnix, endUnix, color) => {
      if (!startUnix) return;
      const sD = new Date(startUnix * 1000);
      const eD = endUnix ? new Date(endUnix * 1000) : new Date();
      const sSlot = Math.floor((sD.getHours() * 60 + sD.getMinutes()) / 30);
      const eSlot = Math.ceil((eD.getHours() * 60 + eD.getMinutes()) / 30);
      for (let i = Math.max(0, sSlot); i < Math.min(SLOTS, eSlot); i++) {
        if (!arr[i].color) arr[i] = { color };
      }
    };
    for (const s of sessions) {
      const c = s.is_deep_work ? '#6366F1' : '#818CF8';
      mark(s.started_at, s.ended_at, c);
    }
    return arr;
  }, [sessions]);

  const nowSlot = Math.floor((new Date().getHours() * 60 + new Date().getMinutes()) / 30);
  const nowPct  = (nowSlot / SLOTS) * 100;

  return (
    <div>
      <div style={{ position: 'relative', height: 6 }}>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', gap: 1, overflow: 'hidden', borderRadius: 3 }}>
          {segments.map((seg, i) => (
            <div key={i} style={{ flex: 1, height: '100%', background: seg.color || '#1E222E', borderRadius: 1 }} />
          ))}
        </div>
        <div style={{ position: 'absolute', top: 0, bottom: 0, width: 1, background: 'rgba(239,68,68,0.7)', left: `${nowPct}%`, transform: 'translateX(-50%)' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
        {['12a','6a','12p','6p','12a'].map((l, i) => (
          <span key={i} style={{ fontSize: 8, color: '#4B5263', fontVariantNumeric: 'tabular-nums' }}>{l}</span>
        ))}
      </div>
    </div>
  );
}

// ─── Section label ────────────────────────────────────────────────────────────
function SL({ children, icon: Icon }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      {Icon && <Icon size={8} style={{ color: '#4B5263' }} />}
      <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#4B5263' }}>
        {children}
      </span>
    </div>
  );
}

// ─── AI Insight block ─────────────────────────────────────────────────────────
function AiInsight({ text, accent = '#818CF8', onView }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px',
      background: `${accent}08`, border: `1px solid ${accent}18`,
      borderRadius: 10, marginTop: 8,
    }}>
      <div style={{ width: 20, height: 20, borderRadius: 6, background: `${accent}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
        <Sparkles size={10} style={{ color: accent }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
          <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: accent }}>Insight</span>
        </div>
        <p style={{ fontSize: 10, color: '#9CA3AF', lineHeight: 1.5 }}>{text}</p>
      </div>
      {onView && (
        <button onClick={onView} style={{
          flexShrink: 0, fontSize: 9, fontWeight: 600, padding: '3px 8px',
          borderRadius: 6, background: `${accent}15`, color: accent,
          border: `1px solid ${accent}25`, cursor: 'pointer', whiteSpace: 'nowrap',
        }}>
          View Report
        </button>
      )}
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function StatsPage({ user, categories }) {
  const [period,       setPeriod]       = useState(7);
  const [customFrom,   setCustomFrom]   = useState('');
  const [customTo,     setCustomTo]     = useState('');
  const [daily,        setDaily]        = useState([]);
  const [summary,      setSummary]      = useState(null);

  // Adaptive behavioral KPIs — synchronous read from localStorage
  const behavioralKPIs = useMemo(() => { try { return getDashboardBehavioralKPIs(); } catch { return null; } }, []);
  const [catData,      setCatData]      = useState([]);
  const [weekComp,     setWeekComp]     = useState(null);
  const [topApps,      setTopApps]      = useState([]);
  const [heatmap,      setHeatmap]      = useState(null);
  const [intensity,    setIntensity]    = useState(null);
  const [billable,     setBillable]     = useState(null);
  const [focusScore,   setFocusScore]   = useState(0);
  const [loading,      setLoading]      = useState(true);
  const [sidebarTab,   setSidebarTab]   = useState('projects');
  // Sidebar: today's data
  const [todaySummary, setTodaySummary] = useState(null);
  const [todaySessions,setTodaySessions]= useState([]);
  const [todayApps,    setTodayApps]    = useState([]);
  const [projectData,  setProjectData]  = useState([]);

  const { from: fromTs, to: toTs, effectiveDays } = useMemo(() => {
    const now = Math.floor(Date.now() / 1000);
    if (period === 'custom' && customFrom && customTo) {
      const f = Math.floor(new Date(customFrom).getTime() / 1000);
      const t = Math.floor(new Date(customTo).getTime() / 1000) + 86400;
      return { from: f, to: t, effectiveDays: Math.max(1, Math.round((t - f) / 86400)) };
    }
    return { from: now - period * 86400, to: now, effectiveDays: period };
  }, [period, customFrom, customTo]);

  // Period date range label
  const dateRangeLabel = useMemo(() => {
    const fmt = (ts) => new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return `${fmt(fromTs)} – ${fmt(toTs)}`;
  }, [fromTs, toTs]);

  useEffect(() => {
    if (period === 'custom' && (!customFrom || !customTo)) return;
    setLoading(true);
    const today    = new Date().toISOString().split('T')[0];
    const todayD   = new Date(); todayD.setHours(0,0,0,0);
    const todayTs  = Math.floor(todayD.getTime() / 1000);

    Promise.all([
      api.statsDaily?.({ userId: user.id, days: effectiveDays }),
      api.statsSummary?.({ userId: user.id, from: fromTs, to: toTs }),
      api.weekComparison?.({ userId: user.id }),
      api.topApps?.({ userId: user.id, from: fromTs, to: toTs, limit: 8 }),
      api.hourlyHeatmap?.({ userId: user.id, days: effectiveDays }),
      api.workIntensity?.({ userId: user.id, windowMins: 90 }),
      api.billableSummary?.({ userId: user.id, from: fromTs, to: toTs }),
      api.focusScore?.({ userId: user.id, dateKey: today }),
      // Today's sidebar data
      api.statsSummary?.({ userId: user.id, from: todayTs, to: todayTs + 86400 }),
      api.listSessions?.({ userId: user.id, from: todayTs, to: todayTs + 86400 }),
      api.appUsageByDate?.({ userId: user.id, dateKey: today }),
    ]).then(([d, sum, comp, apps, heat, inten, bill, score, todaySum, todaySess, todayA]) => {
      setSummary(sum);
      setWeekComp(comp);
      setTopApps(apps || []);
      setHeatmap(heat);
      setIntensity(inten);
      setBillable(bill);
      setFocusScore(score?.score || sum?.focusScore || 0);
      setTodaySummary(todaySum);
      setTodaySessions(todaySess || []);
      setTodayApps(todayA || []);

      const days = lastNDays(effectiveDays);
      const dailyRows = days.map(date => ({
        date:     date.slice(5),
        total:    +((d?.[date]?.total    || 0) / 3600).toFixed(2),
        deepWork: +((d?.[date]?.deepWork || 0) / 3600).toFixed(2),
        sessions:  d?.[date]?.sessions || 0,
      }));
      setDaily(dailyRows);

      if (sum?.byCategory) {
        const entries = Object.entries(sum.byCategory).sort((a, b) => b[1] - a[1]).slice(0, 7);
        const total   = entries.reduce((s, [, v]) => s + v, 0);
        setCatData(entries.map(([name, secs], i) => ({
          name, value: +(secs / 3600).toFixed(1),
          pct: total > 0 ? Math.round((secs / total) * 100) : 0,
          color: getCategoryColor(name, categories) || CAT_COLORS[i % CAT_COLORS.length],
        })));
      }

      // Project breakdown from today's sessions
      if (todaySess?.length) {
        const tally = {};
        for (const s of todaySess) {
          const key   = s.project_name || s.category || 'Untracked';
          const color = s.project_color || CAT_COLORS[Object.keys(tally).length % CAT_COLORS.length];
          if (!tally[key]) tally[key] = { secs: 0, color };
          tally[key].secs += s.duration_seconds || (s.ended_at ? s.ended_at - s.started_at : 0);
        }
        const totalSess = Object.values(tally).reduce((s, v) => s + v.secs, 0);
        setProjectData(Object.entries(tally)
          .sort((a, b) => b[1].secs - a[1].secs).slice(0, 5)
          .map(([name, { secs, color }]) => ({
            name, secs, color,
            pct: totalSess > 0 ? Math.round((secs / totalSess) * 100) : 0,
          })));
      }
      setLoading(false);
    });
  }, [user.id, fromTs, toTs, effectiveDays, categories]);

  // ── Derived ──────────────────────────────────────────────────────────────────
  const totalHrs   = summary ? (summary.totalSeconds / 3600).toFixed(1) : '0';
  const deepPct    = summary?.totalSeconds
    ? Math.round(((summary.deepWorkSeconds || 0) / summary.totalSeconds) * 100) : 0;
  const avgHrs     = summary ? (summary.totalSeconds / 3600 / effectiveDays).toFixed(1) : '0';
  const sessions   = summary?.sessionCount || 0;
  const totalTrend = weekComp ? pct(weekComp.thisWeek?.totalSecs,    weekComp.lastWeek?.totalSecs)    : null;
  const deepTrend  = weekComp ? pct(weekComp.thisWeek?.deepWorkSecs, weekComp.lastWeek?.deepWorkSecs) : null;
  const sessTrend  = weekComp ? pct(weekComp.thisWeek?.sessions,     weekComp.lastWeek?.sessions)     : null;
  const avgTrend   = null;
  const scoreColor = focusScore >= 80 ? '#34D399' : focusScore >= 60 ? '#818CF8' : focusScore >= 40 ? '#FBBF24' : '#6B7280';
  const scoreLabel = focusScore >= 80 ? 'Excellent' : focusScore >= 60 ? 'Good' : focusScore >= 40 ? 'Average' : 'Getting started';
  const appTotal   = topApps.reduce((s, a) => s + (a.total || 0), 0);

  const HOURS = Array.from({ length: 24 }, (_, h) => ({
    h, label: h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h-12}p`,
    val: heatmap?.hourly?.[h] || 0,
    intensity: (() => { const max = Math.max(...(heatmap?.hourly || [1])); return max > 0 ? (heatmap?.hourly?.[h] || 0) / max : 0; })(),
  }));

  // Today sidebar derived
  const todayTotal    = todaySummary?.totalSeconds    || 0;
  const todayFocus    = todaySummary?.focusSeconds    || 0;
  const todayDeep     = todaySummary?.deepWorkSeconds || 0;
  const todayMeetings = todaySummary?.meetingSeconds  || 0;
  const todayCount    = todaySummary?.sessionCount    || 0;
  const todayFocusPct = todayTotal > 0 ? Math.round((todayFocus / todayTotal) * 100) : 0;
  const todayDeepPct  = todayTotal > 0 ? Math.round((todayDeep  / todayTotal) * 100) : 0;
  const todayAppTotal = todayApps.reduce((s, a) => s + (a.total || 0), 0);

  // AI insights
  const peakDayEntry = useMemo(() => {
    if (!daily.length) return null;
    return daily.reduce((best, d) => (!best || d.deepWork > best.deepWork) ? d : best, null);
  }, [daily]);
  const topCat = catData[0];
  const aiInsightChart = peakDayEntry?.deepWork > 0
    ? `Your deep work was highest on ${peakDayEntry.date}. Consider scheduling more focus blocks.`
    : 'Start logging sessions to unlock deep work insights.';
  const aiInsightCat = topCat
    ? `${topCat.name} is your top growth area. Keep investing time here!`
    : 'Log sessions across categories to see your breakdown.';
  const aiInsightSidebar = summary?.meetingSeconds > 0 && summary.focusSeconds > 0
    ? `Your focus drops after meetings. Consider adding buffer time.`
    : 'Track more sessions to receive personalized insights.';

  // ── Stacked activity bar segments ────────────────────────────────────────────
  const barSegs = [
    { label: 'Deep Work', value: todayDeep,                              color: '#34D399' },
    { label: 'Focus',     value: Math.max(todayFocus - todayDeep, 0),   color: '#818CF8' },
    { label: 'Meetings',  value: todayMeetings,                          color: '#F87171' },
    { label: 'Other',     value: Math.max(todayTotal - todayFocus - todayMeetings, 0), color: '#374151' },
  ].filter(s => s.value > 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: '#0F1117' }}>

      {/* ── CONTROLS BAR ──────────────────────────────────────────────────────── */}
      <div style={{ flexShrink: 0, borderBottom: '1px solid #1E222E', background: '#0C0E14' }}>
        {/* Period filter row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '10px 24px 10px' }}>
          {/* Left: date range pill + icon buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 12px', borderRadius: 8, background: '#161921', border: '1px solid #252932', cursor: 'default' }}>
              <Calendar size={11} style={{ color: '#6B7280' }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: '#EAEAF0', fontVariantNumeric: 'tabular-nums' }}>{dateRangeLabel}</span>
            </div>
            {[Download, Bell].map((Icon, i) => (
              <button key={i} style={{ width: 32, height: 32, borderRadius: 8, background: '#161921', border: '1px solid #252932', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#6B7280', transition: 'all 0.15s' }}
                onMouseOver={e => { e.currentTarget.style.color = '#EAEAF0'; e.currentTarget.style.background = '#1E2230'; }}
                onMouseOut={e  => { e.currentTarget.style.color = '#6B7280'; e.currentTarget.style.background = '#161921'; }}>
                <Icon size={13} />
              </button>
            ))}
          </div>
          {/* Right: period switcher + Ask AI */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {period === 'custom' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 8, background: '#161921', border: '1px solid #252932' }}>
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                style={{ background: 'transparent', border: 'none', fontSize: 11, color: '#EAEAF0', outline: 'none', colorScheme: 'dark' }} />
              <span style={{ fontSize: 10, color: '#4B5263' }}>→</span>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                style={{ background: 'transparent', border: 'none', fontSize: 11, color: '#EAEAF0', outline: 'none', colorScheme: 'dark' }} />
            </div>
          )}
          {/* Period segmented control */}
          <div style={{ display: 'flex', background: '#161921', border: '1px solid #252932', borderRadius: 8, padding: 2, gap: 1 }}>
            {PERIODS.map(({ label, days }) => (
              <button key={days} onClick={() => setPeriod(days)}
                style={{
                  padding: '4px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                  background: period === days ? '#21253A' : 'transparent',
                  color: period === days ? '#EAEAF0' : '#6B7280',
                  border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                }}>
                {label}
              </button>
            ))}
          </div>
          {/* Ask AI */}
          <button style={{ display: 'flex', alignItems: 'center', gap: 6, height: 32, padding: '0 14px', borderRadius: 8, background: 'linear-gradient(135deg, var(--color-accent), #9D8FF5)', border: 'none', cursor: 'pointer', color: 'white', fontSize: 11, fontWeight: 700, boxShadow: '0 0 16px rgba(124,108,242,0.35)', letterSpacing: '-0.01em' }}>
            <Sparkles size={12} />
            Ask AI
            <ArrowRight size={10} style={{ opacity: 0.7 }} />
          </button>
          </div>{/* end right */}
        </div>{/* end flex row */}
      </div>{/* end controls bar */}

      {/* ── BODY: Main + Sidebar ──────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── MAIN SCROLLABLE CONTENT ─────────────────────────────────────────── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* ── KPI Strip ──────────────────────────────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            {[
              { Icon: Clock,      label: 'Total Time', val: `${totalHrs}h`, sub: `Avg ${avgHrs}h/day`, color: '#818CF8', trend: totalTrend, sparkKey: 'total'    },
              { Icon: Zap,        label: 'Deep Work',  val: `${deepPct}%`,  sub: `${fmtHM(summary?.deepWorkSeconds||0)} of focus`, color: '#FBBF24', trend: deepTrend, sparkKey: 'deepWork' },
              { Icon: TrendingUp, label: 'Avg / Day',  val: `${avgHrs}h`,   sub: `Across ${effectiveDays} days`,  color: '#60A5FA', trend: avgTrend,  sparkKey: 'total'    },
              { Icon: BarChart2,  label: 'Sessions',   val: sessions,       sub: `~${Math.round(sessions/Math.max(effectiveDays,1))}/day avg`, color: '#34D399', trend: sessTrend, sparkKey: 'sessions' },
            ].map(({ Icon, label, val, sub, color, trend, sparkKey }) => (
              <div key={label} style={{ background: '#13151F', border: '1px solid #1E222E', borderRadius: 14, padding: '16px 16px 0', overflow: 'hidden', position: 'relative', transition: 'border-color 0.2s' }}
                onMouseOver={e => e.currentTarget.style.borderColor = '#252932'}
                onMouseOut={e  => e.currentTarget.style.borderColor = '#1E222E'}>
                {/* Top accent line */}
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${color}CC, transparent)`, borderRadius: '14px 14px 0 0' }} />

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon size={13} style={{ color }} />
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
                  </div>
                  <button style={{ width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 5, background: 'transparent', border: 'none', cursor: 'pointer', color: '#4B5263' }}
                    onMouseOver={e => e.currentTarget.style.color = '#6B7280'}
                    onMouseOut={e  => e.currentTarget.style.color = '#4B5263'}>
                    <MoreHorizontal size={13} />
                  </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 2 }}>
                  <span style={{ fontSize: 28, fontWeight: 800, color: '#EAEAF0', letterSpacing: '-0.03em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{val}</span>
                  <TrendBadge p={trend} />
                </div>
                <p style={{ fontSize: 10, color: '#4B5263', marginBottom: 8 }}>{sub}</p>
                <Sparkline data={daily} color={color} dataKey={sparkKey} />
              </div>
            ))}
          </div>

          {/* ── Focus Score + Work Intensity + Billable ────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>

            {/* Focus Score */}
            <div style={{ background: '#13151F', border: '1px solid #1E222E', borderRadius: 14, padding: 20, position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at 10% 60%, ${scoreColor}10 0%, transparent 60%)`, pointerEvents: 'none' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 14 }}>
                <div style={{ width: 24, height: 24, borderRadius: 7, background: `${scoreColor}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Target size={12} style={{ color: scoreColor }} />
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#EAEAF0' }}>Focus Score</span>
                <button style={{ marginLeft: 3, background: 'none', border: 'none', cursor: 'pointer', color: '#4B5263', padding: 0 }}>
                  <Info size={11} />
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                {/* Ring */}
                <div style={{ position: 'relative', width: 88, height: 88, flexShrink: 0 }}>
                  <svg width="88" height="88" style={{ transform: 'rotate(-90deg)' }}>
                    <circle cx="44" cy="44" r="35" fill="none" stroke="#1E222E" strokeWidth="7" />
                    <circle cx="44" cy="44" r="35" fill="none" stroke={scoreColor} strokeWidth="7"
                      strokeDasharray={`${(focusScore / 100) * 219.9} 219.9`} strokeLinecap="round"
                      style={{ filter: `drop-shadow(0 0 6px ${scoreColor}60)`, transition: 'stroke-dasharray 0.8s ease' }} />
                  </svg>
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 20, fontWeight: 800, color: '#EAEAF0', lineHeight: 1 }}>{focusScore}</span>
                    <span style={{ fontSize: 8, color: '#4B5263', marginTop: 1 }}>/100</span>
                  </div>
                </div>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 700, color: scoreColor, marginBottom: 4 }}>{scoreLabel}</p>
                  <p style={{ fontSize: 11, color: '#6B7280', lineHeight: 1.5 }}>
                    {focusScore >= 80 ? 'You crushed it. Outstanding work rhythm.'
                      : focusScore >= 60 ? 'Solid productive session'
                      : focusScore >= 40 ? 'Room for improvement'
                      : 'Log sessions to build your score'}
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 12, padding: '8px 10px', background: `${scoreColor}08`, border: `1px solid ${scoreColor}15`, borderRadius: 8 }}>
                <Sparkles size={9} style={{ color: scoreColor, flexShrink: 0 }} />
                <p style={{ fontSize: 10, color: '#9CA3AF', lineHeight: 1 }}>
                  {focusScore >= 60 ? 'You maintained a good focus score this week. Keep it up!' : 'Schedule deep work blocks to improve your score.'}
                </p>
              </div>
              {/* Behavioral intelligence row */}
              {behavioralKPIs && behavioralKPIs.maturityLevel !== 'learning' && (
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {behavioralKPIs.peakWindow && (
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'6px 10px', borderRadius:8, background:'rgba(52,211,153,0.06)', border:'1px solid rgba(52,211,153,0.15)' }}>
                      <span style={{ fontSize:9.5, color:'#6B8099' }}>Learned peak window</span>
                      <span style={{ fontSize:9.5, fontWeight:700, color:'#34D399' }}>{behavioralKPIs.peakWindow}</span>
                    </div>
                  )}
                  {behavioralKPIs.productivityTrend !== 'insufficient_data' && (
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'6px 10px', borderRadius:8, background:'rgba(129,140,248,0.06)', border:'1px solid rgba(129,140,248,0.15)' }}>
                      <span style={{ fontSize:9.5, color:'#6B8099' }}>7-day trend</span>
                      <span style={{ fontSize:9.5, fontWeight:700, color: behavioralKPIs.productivityTrend === 'improving' ? '#34D399' : behavioralKPIs.productivityTrend === 'declining' ? '#F87171' : '#818CF8' }}>
                        {behavioralKPIs.productivityTrend === 'improving' ? '↑ Improving' : behavioralKPIs.productivityTrend === 'declining' ? '↓ Declining' : '→ Stable'}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Work Intensity */}
            <div style={{ background: '#13151F', border: '1px solid #1E222E', borderRadius: 14, padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <div style={{ width: 24, height: 24, borderRadius: 7, background: 'rgba(251,146,60,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Flame size={12} style={{ color: '#FB923C' }} />
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#EAEAF0' }}>Work Intensity</span>
                </div>
                <span style={{ fontSize: 9, fontWeight: 600, padding: '3px 8px', borderRadius: 6, background: '#161921', border: '1px solid #252932', color: '#6B7280' }}>Last 90 min</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 10 }}>
                <span style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-0.03em', color: (intensity?.intensity ?? 0) > 70 ? '#34D399' : (intensity?.intensity ?? 0) > 40 ? '#FBBF24' : '#6B7280', fontVariantNumeric: 'tabular-nums' }}>
                  {intensity?.intensity ?? 0}%
                </span>
                <span style={{ fontSize: 10, color: '#4B5263' }}>active ratio</span>
              </div>
              {/* Gradient bar */}
              <div style={{ height: 8, background: '#1E222E', borderRadius: 99, overflow: 'hidden', marginBottom: 14 }}>
                <div style={{
                  height: '100%', borderRadius: 99, transition: 'width 0.7s ease',
                  width: `${intensity?.intensity ?? 0}%`,
                  background: (intensity?.intensity ?? 0) > 70
                    ? 'linear-gradient(90deg, #34D399, #10B981)'
                    : (intensity?.intensity ?? 0) > 40
                      ? 'linear-gradient(90deg, #FBBF24, #FB923C)'
                      : 'linear-gradient(90deg, #818CF8, #7c6cf2)',
                }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                {[
                  { label: 'Active',     val: `${intensity?.activeMins ?? 0}m` },
                  { label: 'Continuous', val: `${intensity?.continuousMins ?? 0}m` },
                ].map(m => (
                  <div key={m.label} style={{ background: '#0F1117', border: '1px solid #1E222E', borderRadius: 8, padding: '8px 10px' }}>
                    <p style={{ fontSize: 8, color: '#4B5263', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>{m.label}</p>
                    <p style={{ fontSize: 16, fontWeight: 800, color: '#EAEAF0', fontVariantNumeric: 'tabular-nums' }}>{m.val}</p>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 10, color: '#4B5263' }}>Goal: 20% active ratio</span>
                <button style={{ fontSize: 10, fontWeight: 700, color: '#818CF8', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Increase</button>
              </div>
            </div>

            {/* Billable */}
            <div style={{ background: '#13151F', border: '1px solid #1E222E', borderRadius: 14, padding: 20, position: 'relative', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <div style={{ width: 24, height: 24, borderRadius: 7, background: 'rgba(52,211,153,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <DollarSign size={12} style={{ color: '#34D399' }} />
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#EAEAF0' }}>Billable</span>
                </div>
                <span style={{ fontSize: 9, fontWeight: 600, padding: '3px 8px', borderRadius: 6, background: '#161921', border: '1px solid #252932', color: '#6B7280' }}>{effectiveDays}D period</span>
              </div>
              {billable && billable.totalHours > 0 ? (
                <>
                  <p style={{ fontSize: 32, fontWeight: 800, color: '#34D399', letterSpacing: '-0.03em', lineHeight: 1, marginBottom: 2, fontVariantNumeric: 'tabular-nums' }}>
                    ${Math.round(billable.revenue || 0).toLocaleString()}
                  </p>
                  <p style={{ fontSize: 10, color: '#4B5263', marginBottom: 12 }}>earned this period</p>
                  <div style={{ height: 6, background: '#1E222E', borderRadius: 99, overflow: 'hidden', marginBottom: 6 }}>
                    <div style={{ height: '100%', borderRadius: 99, background: 'linear-gradient(90deg, #34D399, #10B981)', width: `${billable.utilization || 0}%`, transition: 'width 0.7s' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#34D399' }}>{billable.utilization || 0}% utilized</span>
                    <span style={{ fontSize: 10, color: '#4B5263', fontVariantNumeric: 'tabular-nums' }}>{(billable.billableHours || 0).toFixed(1)}h / {(billable.totalHours || 0).toFixed(1)}h</span>
                  </div>
                </>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <p style={{ fontSize: 32, fontWeight: 800, color: '#34D399', letterSpacing: '-0.03em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>$0</p>
                  <p style={{ fontSize: 10, color: '#4B5263', marginBottom: 10 }}>earned this period</p>
                  <div style={{ height: 6, background: '#1E222E', borderRadius: 99, overflow: 'hidden', marginBottom: 6 }}>
                    <div style={{ height: '100%', borderRadius: 99, background: '#34D39933', width: '0%' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#4B5263' }}>0% utilized</span>
                    <span style={{ fontSize: 10, color: '#4B5263' }}>0.0h / 3.0h</span>
                  </div>
                  <div style={{ padding: '10px 12px', background: 'rgba(52,211,153,0.05)', border: '1px solid rgba(52,211,153,0.12)', borderRadius: 8 }}>
                    <p style={{ fontSize: 10, color: '#6B7280', lineHeight: 1.5, marginBottom: 6 }}>Add billable time to track your revenue and utilization.</p>
                    <button style={{ fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 6, background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.2)', color: '#34D399', cursor: 'pointer' }}>
                      + Add Time
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Daily Focus Hours + By Category ────────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>

            {/* Daily Focus Hours */}
            <div style={{ background: '#13151F', border: '1px solid #1E222E', borderRadius: 14, padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <h3 style={{ fontSize: 13, fontWeight: 700, color: '#EAEAF0' }}>Daily Focus Hours</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {[['Total','#818CF8'],['Deep Work','#FBBF24']].map(([l, c]) => (
                    <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 20, height: 2, borderRadius: 99, background: c, display: 'inline-block' }} />
                      <span style={{ fontSize: 10, color: '#6B7280' }}>{l}</span>
                    </div>
                  ))}
                  <div style={{ fontSize: 10, fontWeight: 600, padding: '3px 9px', borderRadius: 6, background: '#161921', border: '1px solid #252932', color: '#6B7280', cursor: 'pointer' }}>
                    Day ▾
                  </div>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={daily} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="g_total" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#818CF8" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#818CF8" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="g_deep" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#FBBF24" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#FBBF24" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" tick={{ fill: '#4B5263', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#4B5263', fontSize: 10 }} axisLine={false} tickLine={false} unit="h" width={32} />
                  <Tooltip
                    contentStyle={{ background: '#1A1D24', border: '1px solid #252932', borderRadius: 10, fontSize: 11, padding: '8px 12px' }}
                    labelStyle={{ color: '#9CA3AF', marginBottom: 4, fontWeight: 600 }}
                    itemStyle={{ color: '#EAEAF0' }}
                    formatter={(v, n) => [`${v}h`, n]}
                  />
                  <Area type="monotone" dataKey="total"    name="Total"     stroke="#818CF8" strokeWidth={2} fill="url(#g_total)" dot={false} activeDot={{ r: 4, fill: '#818CF8' }} />
                  <Area type="monotone" dataKey="deepWork" name="Deep Work" stroke="#FBBF24" strokeWidth={2} fill="url(#g_deep)"  dot={false} activeDot={{ r: 4, fill: '#FBBF24' }} />
                </AreaChart>
              </ResponsiveContainer>
              <AiInsight text={aiInsightChart} accent="#818CF8" onView={() => {}} />
            </div>

            {/* By Category */}
            <div style={{ background: '#13151F', border: '1px solid #1E222E', borderRadius: 14, padding: 20, display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <h3 style={{ fontSize: 13, fontWeight: 700, color: '#EAEAF0' }}>By Category</h3>
                <button style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#818CF8', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                  View details <ArrowRight size={10} />
                </button>
              </div>
              {catData.length === 0 ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4B5263', fontSize: 11 }}>No data yet</div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={130}>
                    <PieChart>
                      <Pie data={catData} cx="50%" cy="50%" innerRadius={36} outerRadius={58} dataKey="value" paddingAngle={2}>
                        {catData.map((_, i) => <Cell key={i} fill={catData[i].color} />)}
                      </Pie>
                      <Tooltip
                        contentStyle={TOOLTIP_DARK_STYLE}
                        labelStyle={TOOLTIP_DARK_LABEL}
                        itemStyle={TOOLTIP_DARK_ITEM}
                        formatter={v => [`${v}h`]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                    {catData.slice(0, 5).map(c => (
                      <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 3, background: c.color, flexShrink: 0 }} />
                        <span style={{ fontSize: 10, color: '#9CA3AF', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                        <span style={{ fontSize: 10, color: '#6B7280', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{c.pct}%</span>
                        <span style={{ fontSize: 10, fontWeight: 600, color: '#EAEAF0', fontVariantNumeric: 'tabular-nums', flexShrink: 0, width: 32, textAlign: 'right' }}>{c.value}h</span>
                      </div>
                    ))}
                  </div>
                  {/* Category AI insight */}
                  {topCat && (
                    <div style={{ marginTop: 10, padding: '8px 10px', background: `${catData[0].color}0C`, border: `1px solid ${catData[0].color}18`, borderRadius: 8, display: 'flex', alignItems: 'center', gap: 7 }}>
                      <Sparkles size={10} style={{ color: catData[0].color, flexShrink: 0 }} />
                      <p style={{ fontSize: 10, color: '#9CA3AF', lineHeight: 1.4 }}>{aiInsightCat}</p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* ── Peak Hours ─────────────────────────────────────────────────────── */}
          <div style={{ background: '#13151F', border: '1px solid #1E222E', borderRadius: 14, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <h3 style={{ fontSize: 13, fontWeight: 700, color: '#EAEAF0', marginBottom: 3 }}>Peak Hours</h3>
                <p style={{ fontSize: 10, color: '#4B5263' }}>When you work most across the {effectiveDays}-day window</p>
              </div>
              {heatmap?.peakHour !== undefined && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 12px', background: '#161921', border: '1px solid #252932', borderRadius: 8 }}>
                  <span style={{ fontSize: 10, color: '#6B7280' }}>
                    Peak hour: <strong style={{ color: '#A78BFA' }}>{fmtHour(heatmap.peakHour)}</strong>
                  </span>
                  {heatmap?.peakDay !== undefined && (
                    <span style={{ fontSize: 10, color: '#6B7280' }}>
                      Peak day: <strong style={{ color: '#A78BFA' }}>{DAYS_LABEL[heatmap.peakDay]}</strong>
                    </span>
                  )}
                </div>
              )}
            </div>
            {/* Bar chart */}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 80 }}>
              {HOURS.map(({ h, label, intensity: iv }) => (
                <div key={h} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div
                    title={`${label}: ${Math.round(iv * 100)}%`}
                    style={{
                      width: '100%', borderRadius: '3px 3px 0 0',
                      height: `${Math.max(iv * 72, iv > 0 ? 4 : 0)}px`,
                      background: iv > 0.75 ? 'linear-gradient(180deg, var(--color-accent), #5B4FE8)'
                        : iv > 0.45 ? 'linear-gradient(180deg, #60A5FA, #3B82F6)'
                        : iv > 0.15 ? '#263D55'
                        : '#1A1E28',
                      opacity: iv > 0 ? 0.9 : 0.3,
                      transition: 'height 0.4s ease',
                      cursor: 'default',
                      minHeight: iv > 0 ? 3 : 1,
                    }}
                  />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', marginTop: 6 }}>
              {HOURS.map(({ h, label }, i) => (
                <div key={h} style={{ flex: 1, textAlign: 'center' }}>
                  {i % 6 === 0 && <span style={{ fontSize: 8, color: '#4B5263' }}>{label}</span>}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 10, paddingTop: 10, borderTop: '1px solid #1E222E' }}>
              {[['#7c6cf2','High (75%+)'],['#60A5FA','Medium (45–75%)'],['#263D55','Low (15–45%)']].map(([c, l]) => (
                <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: c }} />
                  <span style={{ fontSize: 9, color: '#4B5263' }}>{l}</span>
                </div>
              ))}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
