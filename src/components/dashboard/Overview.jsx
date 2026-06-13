import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Timer, Zap, BarChart2, Target, TrendingUp, Clock, ArrowRight,
  Monitor, Brain, Coffee, Flame, Moon, ChevronUp, ChevronDown, Minus,
} from 'lucide-react';
import { formatDuration, formatHours, todayStart, weekStart, lastNDays, getCategoryColor } from '../../utils/helpers';
import { BarChart, Bar, XAxis, ResponsiveContainer, Tooltip, PieChart, Pie, Cell } from 'recharts';
import { getDashboardBehavioralKPIs } from '../../ai/adaptive/behaviorAnalyticsBridge.js';
import { getWeeklyBehavioralReview } from '../../ai/adaptive/productivityInsightsAggregator.js';

const api = window.electron || {};

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

function appIcon(name = '') {
  const n = name.toLowerCase();
  if (n.includes('chrome') || n.includes('firefox') || n.includes('safari') || n.includes('edge')) return '🌐';
  if (n.includes('code') || n.includes('vscode') || n.includes('vim') || n.includes('cursor')) return '💻';
  if (n.includes('slack') || n.includes('discord') || n.includes('teams') || n.includes('zoom')) return '💬';
  if (n.includes('figma') || n.includes('sketch') || n.includes('photoshop')) return '🎨';
  if (n.includes('notion') || n.includes('word') || n.includes('docs')) return '📝';
  if (n.includes('terminal') || n.includes('iterm') || n.includes('bash')) return '🖥️';
  if (n.includes('mail') || n.includes('outlook')) return '📧';
  if (n.includes('spotify') || n.includes('music')) return '🎵';
  return '📦';
}

function pctChange(curr, prev) {
  if (!prev || prev === 0) return null;
  return Math.round(((curr - prev) / prev) * 100);
}

function TrendBadge({ pct }) {
  if (pct === null || pct === undefined) return null;
  if (pct > 0) return <span className="flex items-center gap-0.5 text-green-400 text-[10px] font-semibold"><ChevronUp size={11} />{pct}%</span>;
  if (pct < 0) return <span className="flex items-center gap-0.5 text-red-400 text-[10px] font-semibold"><ChevronDown size={11} />{Math.abs(pct)}%</span>;
  return <span className="flex items-center gap-0.5 text-tx-faint text-[10px]"><Minus size={10} />0%</span>;
}

function StatCard({ icon: Icon, label, value, sub, color = 'text-teal-400', trend }) {
  return (
    <div className="bg-bg-card rounded-xl border border-brd-default p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-tx-faint font-medium uppercase tracking-wider">{label}</span>
        <Icon size={13} className={color} />
      </div>
      <div className="flex items-end gap-2 leading-none">
        <div className="text-2xl font-bold text-white">{value}</div>
        <TrendBadge pct={trend} />
      </div>
      {sub && <div className="text-[10px] text-tx-faint mt-1">{sub}</div>}
    </div>
  );
}

function IntensityMeter({ intensity = 0, continuousMins = 0 }) {
  const color = intensity >= 70 ? '#f59e0b' : intensity >= 40 ? '#10b981' : '#6366f1';
  const label = intensity >= 70 ? '🔥 High focus' : intensity >= 40 ? '✅ Active' : '💤 Light activity';
  return (
    <div className="w-full mt-2">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <Flame size={11} className="text-amber-400" />
          <span className="text-[10px] text-tx-secondary">Intensity</span>
        </div>
        <span className="text-[10px] font-bold" style={{ color }}>{intensity}%</span>
      </div>
      <div className="h-1.5 bg-brd-default rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${intensity}%`, background: `linear-gradient(90deg, ${color}80, ${color})` }}
        />
      </div>
      <p className="text-[10px] text-tx-faint mt-1">
        {continuousMins > 0 ? `${continuousMins}m continuous · ${label}` : label}
      </p>
    </div>
  );
}

const CAT_COLORS = ['#7c6cf2', '#2f81f7', '#10b981', '#f59e0b', '#f87171', '#7c6cf2'];

export default function Overview({ user, categories, activeSession, onNavigate }) {
  const [todayStats,    setTodayStats]    = useState(null);
  const [weekStats,     setWeekStats]     = useState(null);
  const [weekComp,      setWeekComp]      = useState(null);
  const [dailyData,     setDailyData]     = useState([]);
  const [recentSess,    setRecentSess]    = useState([]);
  const [goalsProgress, setGoalsProg]     = useState([]);
  const [topApps,       setTopApps]       = useState([]);
  const [intensity,     setIntensity]     = useState({ activeMins: 0, intensity: 0, continuousMins: 0 });
  const [heartbeat,     setHeartbeat]     = useState(null);
  const [isIdle,        setIsIdle]        = useState(false);
  const [breakSettings, setBreakSettings] = useState(null);
  const [focusScore,    setFocusScore]    = useState(0);
  const [catPieData,    setCatPieData]    = useState([]);

  // Adaptive behavioral KPIs — read directly from learned localStorage patterns
  const behavioralKPIs = useMemo(() => { try { return getDashboardBehavioralKPIs(); } catch { return null; } }, []);
  const weeklyReview   = useMemo(() => { try { return getWeeklyBehavioralReview(); } catch { return null; } }, []);

  const load = useCallback(async () => {
    const now      = Math.floor(Date.now() / 1000);
    const todayS   = todayStart();
    const weekS    = weekStart();
    const todayKey = new Date().toISOString().split('T')[0];

    const [today, week, daily, sessions, goalList, apps, comp, brkSettings, score] = await Promise.all([
      api.statsSummary?.({ userId: user.id, from: todayS, to: now }),
      api.statsSummary?.({ userId: user.id, from: weekS, to: now }),
      api.statsDaily?.({ userId: user.id, days: 7 }),
      api.listSessions?.({ userId: user.id, from: todayS, to: now }),
      api.listGoals?.({ userId: user.id }),
      api.topApps?.({ userId: user.id, from: todayS, to: now, limit: 6 }),
      api.weekComparison?.({ userId: user.id }),
      api.getBreakSettings?.({ userId: user.id }),
      api.focusScore?.({ userId: user.id, dateKey: todayKey }),
    ]);

    setTodayStats(today);
    setWeekStats(week);
    setWeekComp(comp);
    setRecentSess((sessions || []).slice(0, 6));
    setTopApps(apps || []);
    setBreakSettings(brkSettings);
    setFocusScore(score?.score || today?.focusScore || 0);

    if (today?.byCategory) {
      const entries = Object.entries(today.byCategory).sort((a, b) => b[1] - a[1]).slice(0, 6);
      setCatPieData(entries.map(([name, secs], i) => ({
        name, value: Math.round(secs / 60), color: CAT_COLORS[i % CAT_COLORS.length],
      })));
    }

    const days7 = lastNDays(7);
    setDailyData(days7.map(d => ({
      date:     d.slice(5),
      total:    +((daily?.[d]?.total    || 0) / 3600).toFixed(1),
      deepWork: +((daily?.[d]?.deepWork || 0) / 3600).toFixed(1),
    })));

    if (goalList?.length) {
      Promise.all(goalList.map(g => api.goalProgress?.({ userId: user.id, goalId: g.id })))
        .then(setGoalsProg);
    }
  }, [user.id]);

  const loadIntensity = useCallback(async () => {
    const data = await api.workIntensity?.({ userId: user.id, windowMins: 90 });
    if (data) setIntensity(data);
  }, [user.id]);

  useEffect(() => {
    load();
    loadIntensity();
    const t = setInterval(loadIntensity, 30_000);
    return () => clearInterval(t);
  }, [load, loadIntensity, activeSession]);

  useEffect(() => {
    const unsubHB   = api.onTrackerHeartbeat?.((d) => { setHeartbeat(d); setIsIdle(false); });
    const unsubIdle = api.onTrackerIdle?.(() => setIsIdle(true));
    const unsubRes  = api.onTrackerResume?.(() => setIsIdle(false));
    return () => {
      if (typeof unsubHB   === 'function') unsubHB();
      if (typeof unsubIdle === 'function') unsubIdle();
      if (typeof unsubRes  === 'function') unsubRes();
    };
  }, []);

  const deepPct    = todayStats?.totalSeconds
    ? Math.round((todayStats.deepWorkSeconds || 0) / todayStats.totalSeconds * 100) : 0;
  const totalTrend = weekComp ? pctChange(weekComp.thisWeek?.totalSecs, weekComp.lastWeek?.totalSecs) : null;
  const deepTrend  = weekComp ? pctChange(weekComp.thisWeek?.deepWorkSecs, weekComp.lastWeek?.deepWorkSecs) : null;
  const appTotal   = topApps.reduce((s, a) => s + (a.total || 0), 0);
  const scoreColor = focusScore >= 70 ? '#10b981' : focusScore >= 40 ? '#f59e0b' : '#7c6cf2';
  const C          = 2 * Math.PI * 36;

  return (
    <div className="h-full overflow-y-auto p-6 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Good {getGreeting()}, {user.username} 👋</h1>
          <p className="text-tx-faint text-sm mt-0.5">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>
        {breakSettings?.enabled && (
          <div className="flex items-center gap-2 bg-amber-500/8 border border-amber-500/20 rounded-lg px-3 py-1.5">
            <Coffee size={11} className="text-amber-400" />
            <span className="text-[10px] text-tx-secondary">Break every {breakSettings.work_interval_mins || 52}m</span>
          </div>
        )}
      </div>

      {/* Live Now bar */}
      {(heartbeat || isIdle) && (
        <div className={`flex items-center gap-3 rounded-xl px-4 py-3 border ${isIdle ? 'bg-bg-card border-brd-default' : 'bg-bg-card border-green-500/20'}`}>
          {isIdle
            ? <><Moon size={14} className="text-tx-faint" /><span className="text-xs text-tx-faint">Idle — no activity detected</span></>
            : <>
                <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse shrink-0" />
                <span className="text-base">{appIcon(heartbeat?.appName)}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-white truncate">{heartbeat?.appName || 'Unknown'}</p>
                  {heartbeat?.url && <p className="text-[10px] text-tx-faint truncate">{heartbeat.url}</p>}
                </div>
                <span className="text-[10px] text-green-400 font-medium">Live</span>
              </>
          }
        </div>
      )}

      {/* Active session banner */}
      {activeSession && (
        <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/25 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse" />
            <div>
              <p className="text-green-300 text-sm font-semibold">Session in progress</p>
              <p className="text-green-400/60 text-xs">{activeSession.category}{activeSession.title ? ` · ${activeSession.title}` : ''}</p>
            </div>
          </div>
          <button onClick={() => onNavigate('timer')} className="text-xs text-green-400 hover:text-green-300 flex items-center gap-1">
            View <ArrowRight size={12} />
          </button>
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={Clock}      label="Today"       value={formatHours(todayStats?.totalSeconds || 0)}  sub={`${todayStats?.sessionCount || 0} sessions`}            color="text-teal-400" trend={totalTrend} />
        <StatCard icon={Zap}        label="Deep Work"   value={`${deepPct}%`}                                sub={formatHours(todayStats?.deepWorkSeconds || 0)}          color="text-amber-400"  trend={deepTrend} />
        <StatCard icon={TrendingUp} label="This Week"   value={formatHours(weekStats?.totalSeconds || 0)}   sub={`${weekStats?.sessionCount || 0} sessions`}             color="text-blue-400" />
        <StatCard icon={Brain}      label="Focus Score" value={focusScore}                                   sub={focusScore >= 70 ? 'Excellent' : focusScore >= 40 ? 'Good' : 'Building'} color="text-green-400" />
      </div>

      {/* Adaptive Behavioral Intelligence strip — shown once the engine has learned enough */}
      {behavioralKPIs && behavioralKPIs.maturityLevel !== 'learning' && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Peak focus window */}
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2.5">
            <p className="text-[9px] font-semibold uppercase tracking-widest mb-1" style={{ color:'#34D399' }}>Peak Focus</p>
            <p className="text-sm font-bold text-white leading-none mb-0.5">{behavioralKPIs.peakWindow || '—'}</p>
            <p className="text-[10px]" style={{ color:'#5A6A88' }}>Learned from your patterns</p>
          </div>
          {/* Productivity trend */}
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2.5">
            <p className="text-[9px] font-semibold uppercase tracking-widest mb-1" style={{ color:'#818CF8' }}>7-Day Trend</p>
            <p className="text-sm font-bold leading-none mb-0.5" style={{ color: behavioralKPIs.productivityTrend === 'improving' ? '#34D399' : behavioralKPIs.productivityTrend === 'declining' ? '#F87171' : '#818CF8' }}>
              {behavioralKPIs.productivityTrend === 'improving' ? '↑ Improving' : behavioralKPIs.productivityTrend === 'declining' ? '↓ Declining' : '→ Stable'}
            </p>
            <p className="text-[10px]" style={{ color:'#5A6A88' }}>Avg score: {behavioralKPIs.productivityScore}/100</p>
          </div>
          {/* Burnout status */}
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2.5">
            <p className="text-[9px] font-semibold uppercase tracking-widest mb-1" style={{ color: behavioralKPIs.burnoutRisk === 'low' ? '#34D399' : behavioralKPIs.burnoutRisk === 'high' ? '#F87171' : '#FBBF24' }}>Burnout Risk</p>
            <p className="text-sm font-bold leading-none mb-0.5" style={{ color: behavioralKPIs.burnoutRisk === 'low' ? '#34D399' : behavioralKPIs.burnoutRisk === 'high' ? '#F87171' : '#FBBF24' }}>
              {behavioralKPIs.burnoutRisk.charAt(0).toUpperCase() + behavioralKPIs.burnoutRisk.slice(1)}
            </p>
            <p className="text-[10px]" style={{ color:'#5A6A88' }}>{Math.round(behavioralKPIs.burnoutFatigue)}% fatigue · {Math.round(behavioralKPIs.weeklyHours * 10) / 10}h this week</p>
          </div>
          {/* AI confidence */}
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2.5">
            <p className="text-[9px] font-semibold uppercase tracking-widest mb-1" style={{ color:'#60A5FA' }}>AI Maturity</p>
            <p className="text-sm font-bold text-white leading-none mb-0.5 capitalize">{behavioralKPIs.maturityLevel}</p>
            <p className="text-[10px]" style={{ color:'#5A6A88' }}>{behavioralKPIs.overallConfidence}% confidence · {behavioralKPIs.observations} sessions</p>
          </div>
        </div>
      )}

      {/* Daily summary strip */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Focus Time',   val: formatHours(todayStats?.focusSeconds   || 0), color: '#10b981', bg: 'bg-green-500/8',  border: 'border-green-500/20' },
          { label: 'Meetings',     val: formatHours(todayStats?.meetingSeconds  || 0), color: '#8b5cf6', bg: 'bg-teal-500/8', border: 'border-teal-500/20' },
          { label: 'Breaks Taken', val: formatHours(todayStats?.breakSeconds   || 0), color: '#f59e0b', bg: 'bg-amber-500/8',  border: 'border-amber-500/20' },
        ].map(item => (
          <div key={item.label} className={`${item.bg} border ${item.border} rounded-xl px-4 py-3 flex items-center justify-between`}>
            <span className="text-xs text-tx-secondary">{item.label}</span>
            <span className="text-sm font-bold" style={{ color: item.color }}>{item.val}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Weekly bar */}
        <div className="lg:col-span-2 bg-bg-card rounded-xl border border-brd-default p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">Last 7 Days</h3>
            <button onClick={() => onNavigate('reports')} className="text-xs text-tx-faint hover:text-teal-400 flex items-center gap-1 transition-colors">
              Full report <ArrowRight size={11} />
            </button>
          </div>
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={dailyData} barCategoryGap="30%">
              <XAxis dataKey="date" tick={{ fill: '#73817F', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: '#12191B', border: '1px solid #263438', borderRadius: 8, fontSize: 12 }} labelStyle={{ color: '#A8B5B2' }}
                formatter={(v, n) => [`${v}h`, n === 'deepWork' ? 'Deep Work' : 'Total']} />
              <Bar dataKey="total"    fill="#12191B" radius={[4, 4, 0, 0]} />
              <Bar dataKey="deepWork" fill="#7c6cf2" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-4 mt-1">
            <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded bg-brd-default" /><span className="text-[10px] text-tx-faint">Total</span></div>
            <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded bg-accent" /><span className="text-[10px] text-tx-faint">Deep Work</span></div>
          </div>
        </div>

        {/* Score + intensity */}
        <div className="bg-bg-card rounded-xl border border-brd-default p-5 flex flex-col items-center">
          <h3 className="text-sm font-semibold text-white mb-3 self-start">Today's Score</h3>
          <div className="relative mb-1">
            <svg width="90" height="90" style={{ transform: 'rotate(-90deg)' }}>
              <circle cx="45" cy="45" r="36" fill="none" stroke="#263438" strokeWidth="6" />
              <circle cx="45" cy="45" r="36" fill="none" stroke={scoreColor} strokeWidth="8"
                strokeDasharray={`${(focusScore / 100) * C} ${C}`} strokeLinecap="round"
                style={{ filter: `drop-shadow(0 0 6px ${scoreColor}60)` }} />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold text-white">{focusScore}</span>
              <span className="text-[10px] text-tx-faint">/100</span>
            </div>
          </div>
          <IntensityMeter intensity={intensity.intensity} continuousMins={intensity.continuousMins} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top apps */}
        <div className="bg-bg-card rounded-xl border border-brd-default p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Monitor size={13} className="text-tx-faint" />
              <h3 className="text-sm font-semibold text-white">Top Apps Today</h3>
            </div>
            <button onClick={() => onNavigate('activity')} className="text-xs text-tx-faint hover:text-teal-400 flex items-center gap-1 transition-colors">
              All <ArrowRight size={11} />
            </button>
          </div>
          {topApps.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-24 text-tx-faint text-xs">
              <Monitor size={20} className="mb-2 opacity-20" /><p>No app data yet</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {topApps.slice(0, 5).map(app => {
                const pct = appTotal > 0 ? Math.round((app.total / appTotal) * 100) : 0;
                return (
                  <div key={app.app_name}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span>{appIcon(app.app_name)}</span>
                        <span className="text-xs text-white truncate max-w-[120px]">{app.app_name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-tx-faint">{pct}%</span>
                        <span className="text-[10px] text-tx-faint w-10 text-right">{Math.floor((app.total || 0) / 60)}m</span>
                      </div>
                    </div>
                    <div className="h-1 bg-brd-default rounded-full overflow-hidden">
                      <div className="h-full bg-teal-500/60 rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Category pie */}
        <div className="bg-bg-card rounded-xl border border-brd-default p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">Time by Category</h3>
            <button onClick={() => onNavigate('reports')} className="text-xs text-tx-faint hover:text-teal-400 flex items-center gap-1 transition-colors">
              Details <ArrowRight size={11} />
            </button>
          </div>
          {catPieData.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-24 text-tx-faint text-xs">
              <BarChart2 size={20} className="mb-2 opacity-20" /><p>No sessions today yet</p>
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <PieChart width={100} height={100}>
                <Pie data={catPieData} cx={45} cy={45} innerRadius={28} outerRadius={45} dataKey="value" paddingAngle={2}>
                  {catPieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
              </PieChart>
              <div className="flex-1 space-y-1.5">
                {catPieData.map(entry => (
                  <div key={entry.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: entry.color }} />
                      <span className="text-xs text-tx-secondary truncate max-w-[90px]">{entry.name}</span>
                    </div>
                    <span className="text-[10px] text-tx-faint">{entry.value}m</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Goals + Recent sessions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-bg-card rounded-xl border border-brd-default p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">Goals</h3>
            <button onClick={() => onNavigate('goals')} className="text-xs text-tx-faint hover:text-teal-400 flex items-center gap-1 transition-colors">
              Manage <ArrowRight size={11} />
            </button>
          </div>
          {goalsProgress.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-20 text-tx-faint text-xs">
              <Target size={20} className="mb-2 opacity-20" /><p>No goals yet</p>
              <button onClick={() => onNavigate('goals')} className="text-teal-400 text-xs mt-1 hover:underline">Set your first →</button>
            </div>
          ) : (
            <div className="space-y-3">
              {goalsProgress.slice(0, 4).map((p) => p && (
                <div key={p.goal.id}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-tx-secondary truncate max-w-[160px]">{p.goal.title}</span>
                    <span className="text-tx-faint">{Math.round(p.progress)}%</span>
                  </div>
                  <div className="h-1.5 bg-brd-default rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${p.progress}%`, background: p.progress >= 100 ? '#10b981' : '#7c6cf2' }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-bg-card rounded-xl border border-brd-default p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">Today's Sessions</h3>
            <button onClick={() => onNavigate('timer')} className="text-xs text-tx-faint hover:text-teal-400 flex items-center gap-1 transition-colors">
              All <ArrowRight size={11} />
            </button>
          </div>
          {recentSess.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-20 text-tx-faint text-xs">
              <Timer size={20} className="mb-2 opacity-20" /><p>No sessions today</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {recentSess.map(s => (
                <div key={s.id} className="flex items-center justify-between py-1.5 px-2.5 rounded-lg hover:bg-bg-hover transition-colors">
                  <div className="flex items-center gap-2.5">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: getCategoryColor(s.category, categories) }} />
                    <div>
                      <p className="text-xs font-medium text-white leading-none">{s.title || s.category}</p>
                      <p className="text-[10px] text-tx-faint mt-0.5">
                        {new Date(s.started_at * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-tx-secondary font-mono">{formatDuration(s.duration_seconds)}</span>
                    {s.is_deep_work && <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-400">⚡</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
