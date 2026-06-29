/* ─────────────────────────────────────────────────────────────────────────────
   snapshotData.js — data aggregation for the "Activity Snapshot" feature.

   Deliberately thin: every number here comes from an existing engine/service.
   This file fetches the raw records (sessions, auto-sessions, calendar
   events, projects) and hands them to the same aggregation functions the
   rest of the app already uses (sessionSummaryEngine, useProductivityScore's
   computeScore, focusQualityEngine, analyticsIntelligenceEngine) — it does
   not reimplement any scoring or insight logic itself.
───────────────────────────────────────────────────────────────────────────── */

import {
  generateDailySummary, generateWeeklySummary, buildCategoryBreakdown,
} from '../ai/engines/sessionSummaryEngine.js';
import { computeScore } from '../hooks/useProductivityScore.js';
import { computeFocusQuality } from '../ai/timer/focusQualityEngine.js';
import { getFocusAnalytics, getContextSwitchAnalytics } from '../ai/adaptive/analyticsIntelligenceEngine.js';
import { todayStart, weekStart, monthStart } from './helpers.js';
import { fmtDateRange } from './exportUtils.js';

const api = () => window.electron || {};

// ─── Snapshot category legend ─────────────────────────────────────────────────
// A dedicated color legend for the exported image (distinct from the
// calendar's internal category colors) — matches the palette specified for
// this feature so the shared image reads consistently regardless of how a
// user has labeled their own session categories.
export const SNAPSHOT_CATEGORY_COLORS = {
  deep_work: '#8B5CF6', deep: '#8B5CF6',
  focus: '#3B82F6', development: '#3B82F6', coding: '#3B82F6',
  meeting: '#FB923C', meetings: '#FB923C',
  research: '#22D3EE',
  learning: '#34D399', design: '#34D399',
  break: '#94A3B8',
  planning: '#A78BFA',
  admin: '#64748B', email: '#64748B', communication: '#64748B',
  writing: '#F472B6', data: '#FBBF24',
};

export function categoryColor(category = '') {
  const key = (category || '').toLowerCase().trim();
  if (SNAPSHOT_CATEGORY_COLORS[key]) return SNAPSHOT_CATEGORY_COLORS[key];
  for (const [k, v] of Object.entries(SNAPSHOT_CATEGORY_COLORS)) {
    if (key.includes(k)) return v;
  }
  return '#7C8494';
}

// Warm-palette variant of the legend above, used by the timeline bar in the
// "golden hour" template so session blocks stay tonally consistent with the
// backdrop while still varying by category intensity.
const WARM_CATEGORY_COLORS = {
  deep_work: '#E8552E', deep: '#E8552E', focus: '#E8552E',
  development: '#F2784A', coding: '#F2784A',
  meeting: '#FFA94D', meetings: '#FFA94D',
  research: '#FFC178', learning: '#FFD9A0', design: '#FFD9A0',
  break: '#6B5A52',
  planning: '#F2935C', admin: '#8B6F62',
};

export function warmCategoryColor(category = '') {
  const key = (category || '').toLowerCase().trim();
  if (WARM_CATEGORY_COLORS[key]) return WARM_CATEGORY_COLORS[key];
  for (const [k, v] of Object.entries(WARM_CATEGORY_COLORS)) {
    if (key.includes(k)) return v;
  }
  return '#C97A4A';
}

function getPeriodRange(period) {
  const now = Math.floor(Date.now() / 1000);
  if (period === 'week') {
    return { from: weekStart(), to: now, anchorDate: new Date(weekStart() * 1000) };
  }
  if (period === 'month') {
    return { from: monthStart(), to: now, anchorDate: new Date(monthStart() * 1000) };
  }
  return { from: todayStart(), to: now, anchorDate: new Date(todayStart() * 1000) };
}

// The immediately-preceding period of equal length, used for the "vs
// yesterday / vs last week / vs last month" comparison line on each stat.
function getPreviousPeriodRange(period, from) {
  const ONE_DAY = 86400;
  if (period === 'week')  return { from: from - 7 * ONE_DAY, to: from, anchorDate: new Date((from - 7 * ONE_DAY) * 1000) };
  if (period === 'month') {
    const d = new Date(from * 1000);
    d.setMonth(d.getMonth() - 1);
    return { from: Math.floor(d.getTime() / 1000), to: from, anchorDate: d };
  }
  return { from: from - ONE_DAY, to: from, anchorDate: new Date((from - ONE_DAY) * 1000) };
}

const COMPARISON_LABEL = { day: 'vs yesterday', week: 'vs last week', month: 'vs last month' };

function pctOf(part, total) {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

function pctChange(curr, prev) {
  if (!prev) return null;
  return Math.round(((curr - prev) / prev) * 100);
}

/**
 * Build the full data set the Activity Snapshot template needs for a given
 * period ('day' | 'week' | 'month'), reusing existing engines for every
 * computed number.
 */
export async function buildSnapshotData({ userId, period = 'day', projects: projectsIn, clients: clientsIn }) {
  const a = api();
  const { from, to, anchorDate } = getPeriodRange(period);
  const prevRange = getPreviousPeriodRange(period, from);

  const [sessions, autoSessions, calEvents, projects, clients, prevSessions, prevAutoSessions] = await Promise.all([
    a.listSessions?.({ userId, from, to }).catch(() => []) ?? [],
    a.autoSessionsRange?.({ userId, from, to }).catch(() => []) ?? [],
    a.calendarList?.({ userId, from, to }).catch(() => []) ?? [],
    projectsIn || (a.listProjects?.({ userId }).catch(() => []) ?? []),
    clientsIn  || (a.listClients?.({ userId }).catch(() => []) ?? []),
    a.listSessions?.({ userId, from: prevRange.from, to: prevRange.to }).catch(() => []) ?? [],
    a.autoSessionsRange?.({ userId, from: prevRange.from, to: prevRange.to }).catch(() => []) ?? [],
  ]);

  let totalMins, deepWorkMins, deepWorkPct, totalSessions, categoryBreakdown,
    projectBreakdown, appUsage, periodInsights, narrative;

  if (period === 'day') {
    const summary = generateDailySummary(anchorDate, sessions, autoSessions, calEvents, projects, clients);
    totalMins        = summary.totalMins;
    deepWorkMins      = summary.deepWorkMins;
    deepWorkPct       = summary.deepWorkPct;
    totalSessions     = summary.totalSessions;
    categoryBreakdown = summary.categoryBreakdown;
    projectBreakdown  = summary.projectBreakdown;
    appUsage          = summary.appUsage;
    periodInsights    = (summary.insights || []).map(i => i.text);
    narrative         = summary.narrative;
  } else {
    const summary = generateWeeklySummary(anchorDate, sessions, autoSessions, projects);
    totalMins        = summary.totalMins;
    deepWorkMins      = summary.deepWorkMins;
    deepWorkPct       = summary.deepWorkPct;
    totalSessions     = summary.totalSessions;
    categoryBreakdown = buildCategoryBreakdown(sessions);
    projectBreakdown  = summary.topProjects;
    appUsage          = summary.appUsage;
    periodInsights    = [];
    narrative         = summary.narrative;
  }

  const totalSecs    = Math.round((totalMins || 0) * 60);
  const deepWorkSecs = Math.round((deepWorkMins || 0) * 60);
  const meetingEntry = categoryBreakdown.find(c => /meet/i.test(c.category));
  const meetingSecs  = Math.round((meetingEntry?.mins || 0) * 60);
  const meetingsCount = (sessions || []).filter(s => /meet/i.test(s.category || s.ai_category || '')).length;

  // ── Comparison vs the equivalent previous period ────────────────────────────
  // Reuses the exact same aggregation function for the prior period so the
  // comparison is apples-to-apples (e.g. day-vs-day, week-vs-week).
  const prevSummary = period === 'day'
    ? generateDailySummary(prevRange.anchorDate, prevSessions, prevAutoSessions, [], projects, clients)
    : generateWeeklySummary(prevRange.anchorDate, prevSessions, prevAutoSessions, projects);
  const prevTotalSecs = Math.round((prevSummary.totalMins || 0) * 60);
  const prevDeepWorkSecs = Math.round((prevSummary.deepWorkMins || 0) * 60);
  const prevSessionsCount = prevSummary.totalSessions || 0;
  const prevProductivityScore = computeScore(prevAutoSessions);
  const prevActiveAutoSessions = (prevAutoSessions || []).filter(s => !s.is_idle);
  const prevFocusScore = computeFocusQuality(prevActiveAutoSessions, prevTotalSecs).overall;

  // ── Scores — same formulas the rest of the app uses ─────────────────────────
  const productivityScore = computeScore(autoSessions);
  const activeAutoSessions = (autoSessions || []).filter(s => !s.is_idle);
  const focusResult = computeFocusQuality(activeAutoSessions, totalSecs);

  const comparison = {
    label: COMPARISON_LABEL[period] || 'vs previous period',
    totalPct:      pctChange(totalSecs, prevTotalSecs),
    deepWorkPct:   pctChange(deepWorkSecs, prevDeepWorkSecs),
    sessionsDelta: (totalSessions ?? 0) - prevSessionsCount,
    scorePct:      pctChange(productivityScore, prevProductivityScore),
    focusScorePct: pctChange(focusResult.overall, prevFocusScore),
    meetingsCount,
  };

  // ── Distribution bars ────────────────────────────────────────────────────────
  const catTotalSecs = categoryBreakdown.reduce((s, c) => s + c.mins * 60, 0) || totalSecs;
  const distribution = categoryBreakdown.slice(0, 7).map(c => ({
    category: c.category,
    label:    c.label,
    secs:     Math.round(c.mins * 60),
    pct:      pctOf(c.mins * 60, catTotalSecs),
    color:    categoryColor(c.category),
  }));

  // ── Top apps ──────────────────────────────────────────────────────────────
  // Icons are resolved via the same native-OS-icon IPC call AppIcon.jsx uses
  // (app:getIcon → a base64 data: URL), never a remote favicon fetch — this
  // keeps the exported canvas free of cross-origin taint risk.
  const appTotalSecs = (appUsage || []).reduce((s, app) => s + app.mins * 60, 0);
  const topApps = await Promise.all((appUsage || []).slice(0, 5).map(async app => {
    let icon = null;
    try { icon = await a.getAppIcon?.({ appName: app.name }); } catch { /* falls back to initials badge */ }
    return {
      name: app.name,
      secs: Math.round(app.mins * 60),
      pct:  pctOf(app.mins * 60, appTotalSecs),
      icon,
    };
  }));

  // ── Top projects ──────────────────────────────────────────────────────────
  const projTotalSecs = (projectBreakdown || []).reduce((s, p) => s + p.mins * 60, 0);
  const topProjects = (projectBreakdown || []).slice(0, 5).map(p => ({
    name: p.name,
    secs: Math.round(p.mins * 60),
    pct:  pctOf(p.mins * 60, projTotalSecs),
  }));

  // ── Completed sessions — timeline + table ────────────────────────────────
  const completedSessions = (sessions || [])
    .filter(s => s.started_at && s.ended_at && s.ended_at > s.started_at)
    .sort((x, y) => x.started_at - y.started_at);

  const timelineBlocks = completedSessions.map(s => ({
    start: s.started_at,
    end:   s.ended_at,
    color: categoryColor(s.category || s.ai_category),
    warmColor: warmCategoryColor(s.category || s.ai_category),
  }));

  const sessionRows = completedSessions.map(s => ({
    category: s.category || s.ai_category || 'Other',
    color:    categoryColor(s.category || s.ai_category),
    title:    s.title || s.category || 'Untitled session',
    start:    s.started_at,
    end:      s.ended_at,
    durationSecs: s.ended_at - s.started_at,
  }));

  // ── Timeline axis ────────────────────────────────────────────────────────
  // 'day' always plots against the full midnight-to-midnight scale (so the
  // card reads "12 AM ── 11 PM" regardless of when tracking started).
  const axisStart = from;
  const axisEnd   = from + 86400;

  // ── Daily buckets (week/month periods) ──────────────────────────────────
  // An hour-of-day timeline only makes sense for a single day. For week/month
  // periods, plotting absolute timestamps against an hour-of-day axis produces
  // a near-empty bar (a few minutes of tracked time is invisible across a
  // month-wide span) and tick labels that coincidentally cluster on the same
  // hour (a ~28-day span's quartile points land within minutes of each other
  // hour-of-day, since 28 days is so close to an exact multiple of 24h).
  // Show one bar per calendar day instead.
  function localDateKey(ts) {
    const d = new Date(ts * 1000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  let dailyBuckets = [];
  if (period !== 'day') {
    const bucketSecs = {};
    for (const s of (autoSessions || [])) {
      if (s.is_idle || !s.started_at) continue;
      const dur = s.duration_seconds || Math.max(0, (s.ended_at || s.started_at) - s.started_at);
      const key = localDateKey(s.started_at);
      bucketSecs[key] = (bucketSecs[key] || 0) + dur;
    }
    const dayCount = Math.max(1, Math.round((to - from) / 86400) + 1);
    for (let i = 0; i < dayCount; i++) {
      const dayTs = from + i * 86400;
      if (dayTs > to + 86400) break;
      dailyBuckets.push({ date: new Date(dayTs * 1000), secs: bucketSecs[localDateKey(dayTs)] || 0 });
    }
  }

  // ── Achievement — the single most meaningful highlight for the period ───────
  // Derived entirely from data already computed above (session durations,
  // focus/productivity scores) — not a separate analytics pass.
  const achievement = determineAchievement({
    sessionRows, focusScore: focusResult.overall, productivityScore, sessionsCompleted: totalSessions ?? completedSessions.length,
  });

  // ── AI insights — period-specific first, then adaptive/historical ───────────
  // (analyticsIntelligenceEngine reads the same adaptive behavior profile
  // used by Reports/Productivity pages — no new analytics logic here.)
  let insights = [...periodInsights];
  if (insights.length < 3) {
    try {
      const focusA = getFocusAnalytics();
      insights.push(...(focusA.insights || []));
    } catch { /* adaptive profile may not exist yet for new users */ }
  }
  if (insights.length < 3) {
    try {
      const csA = getContextSwitchAnalytics();
      insights.push(...(csA.insights || []));
    } catch { /* same as above */ }
  }
  insights = [...new Set(insights)].slice(0, 3);
  if (!insights.length && narrative) insights = [narrative];

  const rangeLabel = period === 'day'
    ? anchorDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    : fmtDateRange(from, to);

  return {
    period,
    rangeLabel,
    generatedAt: new Date(),

    totalSecs,
    deepWorkSecs,
    deepWorkPct,
    meetingSecs,
    sessionsCompleted: totalSessions ?? completedSessions.length,
    productivityScore,
    focusScore: focusResult.overall,
    comparison,
    achievement,

    distribution,
    topApps,
    topProjects,
    insights,
    timelineBlocks,
    dailyBuckets,
    sessionRows,

    rangeStart: from,
    rangeEnd: to,
    axisStart,
    axisEnd,
  };
}

/**
 * Pick the single most meaningful highlight for the period, in priority
 * order, from data already computed by buildSnapshotData — no separate
 * analytics pass. Always returns something so the Achievement card never
 * renders empty.
 */
function determineAchievement({ sessionRows, focusScore, productivityScore, sessionsCompleted }) {
  const deepCandidates = sessionRows.filter(s => /deep|focus/i.test(s.category));
  const longestDeep = [...deepCandidates].sort((a, b) => b.durationSecs - a.durationSecs)[0];

  if (longestDeep && longestDeep.durationSecs >= 90 * 60) {
    const hrs = Math.round((longestDeep.durationSecs / 3600) * 10) / 10;
    return { icon: '🔥', title: `${hrs}h Focus Streak`, detail: `Longest deep work block: ${longestDeep.title}` };
  }
  if (focusScore >= 85) {
    return { icon: '⭐', title: 'Excellent Focus Score', detail: `Focus score of ${focusScore} — among your sharpest sessions` };
  }
  if (productivityScore >= 80) {
    return { icon: '🏆', title: 'Productivity Goal Achieved', detail: `Productivity score of ${productivityScore} today` };
  }
  if (longestDeep) {
    const mins = Math.round(longestDeep.durationSecs / 60);
    return { icon: '🚀', title: 'Deep Work Logged', detail: `${mins}m of focused work in a single session` };
  }
  return { icon: '✨', title: 'Tracked Day', detail: `${sessionsCompleted} session${sessionsCompleted === 1 ? '' : 's'} completed` };
}
