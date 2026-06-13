import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  X, TrendingUp, Clock, Zap, Target, Star, Award,
  Flame, BarChart2, ArrowUp, ArrowDown, Minus,
  Brain, Trophy, ChevronRight, Activity, Sparkles,
} from 'lucide-react';

const api = window.electron || {};

function fmt(s) {
  if (!s || s <= 0) return '0m';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}
function pct(used, total) {
  if (!total) return 0;
  return Math.min(100, Math.round((used / total) * 100));
}
function hashColor(str) {
  const P = ['#7C6CF2','#34D399','#F87171','#60A5FA','#FB923C','#A78BFA','#FBBF24','#818CF8','#F472B6','#94A3B8'];
  let h = 0;
  for (let i = 0; i < (str || '').length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return P[h % P.length];
}
function fmtHour(h) {
  return h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`;
}

// ─── Theme palette ────────────────────────────────────────────────────────────
function buildTheme(isLight) {
  return isLight ? {
    overlay:        'rgba(80,70,120,0.35)',
    modalBg:        '#FFFFFF',
    modalBorder:    'rgba(124,108,242,0.22)',
    modalShadow:    '0 32px 80px rgba(100,80,200,0.18), 0 0 0 1px rgba(124,108,242,0.12)',
    headerBg:       'linear-gradient(135deg, rgba(124,108,242,0.09) 0%, rgba(124,108,242,0.03) 60%, transparent 100%)',
    headerBorder:   'rgba(124,108,242,0.14)',
    iconBoxBg:      'rgba(124,108,242,0.12)',
    iconBoxBorder:  'rgba(124,108,242,0.28)',
    iconBoxShadow:  '0 0 16px rgba(124,108,242,0.15)',
    closeHoverBg:   'rgba(0,0,0,0.06)',
    bodyBg:         'transparent',
    heroBg:         'linear-gradient(135deg, rgba(124,108,242,0.07) 0%, rgba(124,108,242,0.02) 100%)',
    heroBorder:     'rgba(124,108,242,0.2)',
    summaryBg:      'rgba(124,108,242,0.06)',
    summaryBorder:  'rgba(124,108,242,0.2)',
    summaryLeft:    'rgba(124,108,242,0.5)',
    summaryText:    '#4A3B8A',
    cardBg:         '#F8F5FF',
    cardBorder:     'rgba(124,108,242,0.14)',
    cardBorder2:    'rgba(124,108,242,0.1)',
    statLabelColor: '#7D769A',
    textPrimary:    '#1E1B2E',
    textSecondary:  '#3D3560',
    textMuted:      '#6B64A0',
    textFaint:      '#9B94C4',
    textFaintest:   '#B8B0D8',
    sectionLabel:   '#6D5ACE',
    sectionIconBg:  (c) => `${c}18`,
    arcTrack:       'rgba(124,108,242,0.12)',
    heatBarEmpty:   'rgba(124,108,242,0.07)',
    prodBarTrack:   'rgba(124,108,242,0.08)',
    appBarTrack:    'rgba(0,0,0,0.06)',
    tomorrowBg:     'linear-gradient(135deg, rgba(124,108,242,0.07), rgba(124,108,242,0.02))',
    tomorrowBorder: 'rgba(124,108,242,0.18)',
    tomorrowIconBg: 'rgba(124,108,242,0.1)',
    tomorrowIconBd: 'rgba(124,108,242,0.2)',
    footerBg:       'rgba(248,245,255,0.6)',
    footerBorder:   'rgba(124,108,242,0.12)',
    footerTextColor:'#9B94C4',
    spinnerBorder:  '2px solid rgba(124,108,242,0.15)',
    spinnerTop:     '#7c6cf2',
    divider:        'rgba(124,108,242,0.1)',
    btnBg:          'linear-gradient(135deg, #7c6cf2, #6366F1)',
    btnShadow:      '0 4px 14px rgba(124,108,242,0.35)',
    btnShadowHover: '0 6px 20px rgba(124,108,242,0.5)',
  } : {
    overlay:        'rgba(0,0,0,0.75)',
    modalBg:        '#0E1118',
    modalBorder:    'rgba(124,108,242,0.2)',
    modalShadow:    '0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(124,108,242,0.1), 0 0 60px rgba(124,108,242,0.05)',
    headerBg:       'linear-gradient(135deg, rgba(124,108,242,0.12) 0%, rgba(124,108,242,0.04) 60%, transparent 100%)',
    headerBorder:   'rgba(255,255,255,0.06)',
    iconBoxBg:      'linear-gradient(135deg, rgba(124,108,242,0.3), rgba(124,108,242,0.1))',
    iconBoxBorder:  'rgba(124,108,242,0.35)',
    iconBoxShadow:  '0 0 20px rgba(124,108,242,0.25)',
    closeHoverBg:   'rgba(255,255,255,0.06)',
    bodyBg:         'transparent',
    heroBg:         'linear-gradient(135deg, rgba(124,108,242,0.07) 0%, rgba(124,108,242,0.02) 100%)',
    heroBorder:     'rgba(124,108,242,0.18)',
    summaryBg:      'rgba(124,108,242,0.06)',
    summaryBorder:  'rgba(124,108,242,0.18)',
    summaryLeft:    'rgba(124,108,242,0.6)',
    summaryText:    '#C4B5FD',
    cardBg:         '#111420',
    cardBorder:     'rgba(255,255,255,0.06)',
    cardBorder2:    'rgba(255,255,255,0.05)',
    statLabelColor: '#4B5263',
    textPrimary:    '#EAEAF0',
    textSecondary:  '#9CA3AF',
    textMuted:      '#6B7280',
    textFaint:      '#4B5263',
    textFaintest:   '#3A404F',
    sectionLabel:   '#C4B5FD',
    sectionIconBg:  (c) => `${c}18`,
    arcTrack:       'rgba(255,255,255,0.05)',
    heatBarEmpty:   'rgba(255,255,255,0.04)',
    prodBarTrack:   'rgba(255,255,255,0.04)',
    appBarTrack:    'rgba(255,255,255,0.05)',
    tomorrowBg:     'linear-gradient(135deg, rgba(124,108,242,0.08), rgba(124,108,242,0.03))',
    tomorrowBorder: 'rgba(124,108,242,0.2)',
    tomorrowIconBg: 'rgba(124,108,242,0.15)',
    tomorrowIconBd: 'rgba(124,108,242,0.28)',
    footerBg:       'rgba(0,0,0,0.2)',
    footerBorder:   'rgba(255,255,255,0.06)',
    footerTextColor:'#3A404F',
    spinnerBorder:  '2px solid rgba(124,108,242,0.2)',
    spinnerTop:     '#7c6cf2',
    divider:        'rgba(255,255,255,0.06)',
    btnBg:          'linear-gradient(135deg, #7c6cf2, #6366F1)',
    btnShadow:      '0 4px 14px rgba(124,108,242,0.4)',
    btnShadowHover: '0 6px 20px rgba(124,108,242,0.55)',
  };
}

// ─── Circular arc progress ────────────────────────────────────────────────────
function ArcProgress({ percent, size = 110, strokeWidth = 9, arcTrack }) {
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const filled = (Math.min(percent, 100) / 100) * circumference;
  const color = percent >= 100 ? '#34D399' : percent >= 75 ? '#7c6cf2' : percent >= 50 ? '#A78BFA' : '#FBBF24';
  const glow  = percent >= 100 ? 'rgba(52,211,153,0.5)' : 'rgba(124,108,242,0.5)';
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', filter: `drop-shadow(0 0 6px ${glow})` }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={arcTrack} strokeWidth={strokeWidth} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={strokeWidth}
        strokeDasharray={`${filled} ${circumference}`} strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 1s cubic-bezier(0.34,1.56,0.64,1)' }} />
    </svg>
  );
}

// ─── Hourly activity bars ─────────────────────────────────────────────────────
function HourHeatmap({ sessions = [], from, T }) {
  const slots = Array(24).fill(0);
  const nowSec = Math.floor(Date.now() / 1000);
  sessions.forEach(s => {
    const start = s.started_at || 0;
    const end   = s.ended_at || Math.min(start + (s.duration_seconds || 0), nowSec);
    for (let h = 6; h < 22; h++) {
      const sStart = from + h * 3600, sEnd = sStart + 3600;
      slots[h] += Math.max(0, Math.min(end, sEnd) - Math.max(start, sStart));
    }
  });
  const maxVal = Math.max(...slots.slice(6, 22), 1);
  const MAX_H  = 28;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: MAX_H + 14 }}>
      {Array.from({ length: 16 }, (_, i) => i + 6).map(h => {
        const secs = slots[h];
        const barH = secs > 0 ? Math.max(Math.round((secs / maxVal) * MAX_H), 3) : 2;
        const intensity = secs / maxVal;
        return (
          <div key={h} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
            <div style={{ width: '100%', height: MAX_H, display: 'flex', alignItems: 'flex-end' }}>
              <div style={{
                width: '100%', height: barH, borderRadius: 3,
                background: secs > 0
                  ? `rgba(124,108,242,${0.25 + intensity * 0.75})`
                  : T.heatBarEmpty,
                boxShadow: secs > 0 && intensity > 0.6 ? '0 0 6px rgba(124,108,242,0.4)' : 'none',
                transition: 'height 0.5s ease',
              }} />
            </div>
            {h % 3 === 0 && (
              <span style={{ fontSize: 7, color: T.textFaintest, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                {fmtHour(h)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Productivity mix bar ─────────────────────────────────────────────────────
function ProductivityBar({ deepSecs, focusSecs, meetSecs, breakSecs, totalSecs, T }) {
  if (!totalSecs) return null;
  const segs = [
    { label: 'Deep Work', secs: deepSecs,  color: '#34D399', grad: 'linear-gradient(90deg,#34D399,#10B981)' },
    { label: 'Focus',     secs: focusSecs, color: '#818CF8', grad: 'linear-gradient(90deg,#9D8FF5,#818CF8)' },
    { label: 'Meetings',  secs: meetSecs,  color: '#F87171', grad: 'linear-gradient(90deg,#F87171,#EF4444)' },
    { label: 'Breaks',    secs: breakSecs, color: '#FBBF24', grad: 'linear-gradient(90deg,#FBBF24,#F59E0B)' },
  ].filter(s => s.secs > 0);
  if (!segs.length) return null;
  return (
    <div>
      <div style={{ height: 10, borderRadius: 99, overflow: 'hidden', display: 'flex', gap: 2, background: T.prodBarTrack, padding: 2, boxSizing: 'border-box' }}>
        {segs.map((s, i) => (
          <div key={s.label} style={{
            width: `${(s.secs / totalSecs) * 100}%`, height: '100%',
            background: s.grad,
            borderRadius: i === 0 ? '99px 4px 4px 99px' : i === segs.length - 1 ? '4px 99px 99px 4px' : 4,
            minWidth: 4,
            boxShadow: `0 0 6px ${s.color}50`,
            transition: 'width 0.6s cubic-bezier(0.4,0,0.2,1)',
          }} />
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px 14px', marginTop: 9 }}>
        {segs.map(s => (
          <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 7, height: 7, borderRadius: 2, background: s.color, boxShadow: `0 0 4px ${s.color}60` }} />
            <span style={{ fontSize: 9.5, color: T.textMuted }}>{s.label}</span>
            <span style={{ fontSize: 9.5, fontWeight: 700, color: T.textSecondary }}>{fmt(s.secs)}</span>
            <span style={{ fontSize: 9, color: T.textFaint }}>{pct(s.secs, totalSecs)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Section header ────────────────────────────────────────────────────────────
function SectionHead({ icon: Icon, label, sub, T, color = '#7c6cf2' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <div style={{
          width: 22, height: 22, borderRadius: 6,
          background: `${color}18`, border: `1px solid ${color}25`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Icon size={11} style={{ color }} />
        </div>
        <span style={{ fontSize: 10.5, fontWeight: 700, color: T.sectionLabel, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          {label}
        </span>
      </div>
      {sub && <span style={{ fontSize: 9.5, color: T.textFaint }}>{sub}</span>}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function DailyDebrief({ user, onClose }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);

  const isLight = document.documentElement.classList.contains('theme-light');
  const T = useMemo(() => buildTheme(isLight), [isLight]);

  const load = useCallback(async () => {
    setLoading(true);
    const now = Math.floor(Date.now() / 1000);
    const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
    const from = Math.floor(midnight.getTime() / 1000);
    const dateKey = `${midnight.getFullYear()}-${String(midnight.getMonth()+1).padStart(2,'0')}-${String(midnight.getDate()).padStart(2,'0')}`;
    const yDate = new Date(midnight); yDate.setDate(yDate.getDate() - 1);
    const yFrom = Math.floor(yDate.getTime() / 1000);

    const [sessions, autoSessions, summary, appUsageRaw, scoreData, streakData, ySummary] = await Promise.all([
      (api.listSessions?.({ userId: user.id, from, to: now }) || Promise.resolve([])).catch(() => []),
      (api.autoSessionsToday?.({ userId: user.id }) || Promise.resolve([])).catch(() => []),
      (api.statsSummary?.({ userId: user.id, from, to: now }) || Promise.resolve(null)).catch(() => null),
      (api.appUsageByDate?.({ userId: user.id, dateKey }) || Promise.resolve([])).catch(() => []),
      (api.focusScore?.({ userId: user.id, dateKey }) || Promise.resolve(null)).catch(() => null),
      (api.statsStreak?.({ userId: user.id }) || Promise.resolve(null)).catch(() => null),
      (api.statsSummary?.({ userId: user.id, from: yFrom, to: from }) || Promise.resolve(null)).catch(() => null),
    ]);

    const sessArr = sessions || [];
    const autoArr = autoSessions || [];
    const appArr  = appUsageRaw || [];

    const manualSecs = sessArr.reduce((s, x) => s + Math.max(0, (x.ended_at || now) - x.started_at), 0);
    const autoSecs   = autoArr.reduce((s, x) => s + (x.duration_seconds || 0), 0);
    const totalSecs  = summary?.totalSeconds || Math.max(manualSecs, autoSecs);
    const deepSecs   = summary?.deepWorkSeconds || sessArr.filter(s => s.is_deep_work).reduce((a, s) => a + Math.max(0, (s.ended_at||now)-s.started_at), 0);
    const focusSecs  = summary?.focusSeconds  || 0;
    const meetSecs   = summary?.meetingSeconds || 0;
    const breakSecs  = summary?.breakSeconds  || 0;

    let topApps = [];
    if (appArr.length > 0) {
      topApps = appArr.slice(0, 6).map(a => ({ app: a.app_name || a.url || 'Unknown', secs: a.total || a.duration_seconds || 0 })).filter(a => a.secs > 0);
    } else {
      const appMap = {};
      autoArr.forEach(s => { const k = s.app_name || 'Unknown'; appMap[k] = (appMap[k]||0) + (s.duration_seconds||0); });
      topApps = Object.entries(appMap).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([app,secs])=>({app,secs}));
    }

    let bestSession = null;
    if (sessArr.length > 0) {
      const b = sessArr.reduce((best, s) => {
        const dur = (s.ended_at||now) - s.started_at;
        return dur > (best.ended_at||now) - best.started_at ? s : best;
      });
      const bDur = (b.ended_at||now) - b.started_at;
      if (bDur >= 300) bestSession = { title: b.title || b.category || 'Focus Session', secs: bDur };
    }

    const hourMap = {};
    sessArr.forEach(s => {
      const h = new Date(s.started_at * 1000).getHours();
      hourMap[h] = (hourMap[h]||0) + ((s.ended_at||now) - s.started_at);
    });
    const peakEntry = Object.entries(hourMap).sort((a,b)=>b[1]-a[1])[0];
    const peakHourLabel = peakEntry ? fmtHour(parseInt(peakEntry[0])) : null;

    const target      = (user.daily_target_hours || 6) * 3600;
    const goalPct     = pct(totalSecs, target);
    const goalMet     = totalSecs >= target;
    const focusScore  = scoreData?.score || 0;
    const streak      = streakData?.streak || 0;
    const yTotal      = ySummary?.totalSeconds || 0;
    const vsYesterday = yTotal > 0 ? Math.round(((totalSecs - yTotal) / yTotal) * 100) : null;
    const deepCount   = sessArr.filter(s => ((s.ended_at||now)-s.started_at) >= 1500).length;
    const avgSessionMins = sessArr.length > 0 ? Math.round(totalSecs / sessArr.length / 60) : 0;

    let summaryText = '';
    if (goalMet)         summaryText = `Outstanding! You hit your ${fmt(target)} goal and logged ${fmt(totalSecs)} of tracked time.`;
    else if (goalPct>=75) summaryText = `Great progress — ${fmt(totalSecs)} logged, just ${fmt(target-totalSecs)} from your goal.`;
    else if (goalPct>=50) summaryText = `Solid session — ${fmt(totalSecs)} logged, ${goalPct}% of your ${fmt(target)} daily goal.`;
    else if (totalSecs>0) summaryText = `You logged ${fmt(totalSecs)} today — ${goalPct}% of your ${fmt(target)} goal. Build on this tomorrow.`;
    else                  summaryText = `No time logged today. Every great streak starts with one session.`;
    if (focusScore >= 80) summaryText += ` Exceptional focus score of ${focusScore}.`;
    else if (deepCount > 0) summaryText += ` ${deepCount} deep work session${deepCount>1?'s':''} completed.`;
    if (vsYesterday !== null && Math.abs(vsYesterday) >= 10) {
      summaryText += vsYesterday > 0 ? ` ${vsYesterday}% more productive than yesterday.` : ` ${Math.abs(vsYesterday)}% below yesterday's output.`;
    }

    setData({
      totalSecs, deepSecs, focusSecs, meetSecs, breakSecs,
      deepCount, topApps, goalPct, goalMet, target, summary: summaryText,
      sessionCount: sessArr.length, avgSessionMins, focusScore, streak,
      vsYesterday, yTotal, bestSession, peakHourLabel, sessions: sessArr, from,
    });
    setLoading(false);
  }, [user.id, user.daily_target_hours]);

  useEffect(() => { load(); }, [load]);

  return (
    <div
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: T.overlay, backdropFilter: 'blur(6px)',
      }}>
      <div style={{
        width: 560, maxHeight: '90vh', overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        background: T.modalBg,
        border: `1px solid ${T.modalBorder}`,
        borderRadius: 20,
        boxShadow: T.modalShadow,
      }}>

        {/* ── Header ──────────────────────────────────────────────────────────── */}
        <div style={{
          padding: '18px 20px 16px',
          background: T.headerBg,
          borderBottom: `1px solid ${T.headerBorder}`,
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 12,
                background: T.iconBoxBg,
                border: `1px solid ${T.iconBoxBorder}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: T.iconBoxShadow,
              }}>
                <Star size={18} style={{ color: '#A78BFA' }} />
              </div>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 800, color: T.textPrimary, letterSpacing: '-0.02em', margin: 0 }}>
                  Daily Debrief
                </h3>
                <p style={{ fontSize: 11, color: T.textFaint, margin: 0, marginTop: 1 }}>
                  {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </p>
              </div>
            </div>
            <button onClick={onClose} style={{
              width: 28, height: 28, borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent', border: `1px solid ${T.cardBorder}`,
              cursor: 'pointer', color: T.textFaint, transition: 'all 0.15s',
            }}
              onMouseOver={e => { e.currentTarget.style.background = T.closeHoverBg; e.currentTarget.style.color = T.textSecondary; }}
              onMouseOut={e  => { e.currentTarget.style.background = 'transparent';  e.currentTarget.style.color = T.textFaint; }}>
              <X size={13} />
            </button>
          </div>
        </div>

        {/* ── Scrollable body ──────────────────────────────────────────────────── */}
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', background: T.bodyBg }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 220, flexDirection: 'column', gap: 10 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                border: T.spinnerBorder,
                borderTopColor: T.spinnerTop,
                animation: 'spin 0.8s linear infinite',
              }} />
              <p style={{ fontSize: 12, color: T.textFaint }}>Loading your day…</p>
            </div>
          ) : (
            <div style={{ padding: '20px 20px 0' }}>

              {/* ── Hero: Arc + totals ────────────────────────────────────────── */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 20, padding: '18px 20px',
                background: T.heroBg, border: `1px solid ${T.heroBorder}`,
                borderRadius: 16, marginBottom: 14,
              }}>
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <ArcProgress percent={data.goalPct} size={110} strokeWidth={9} arcTrack={T.arcTrack} />
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 22, fontWeight: 900, color: data.goalMet ? '#34D399' : T.textPrimary, letterSpacing: '-0.04em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                      {data.goalPct}%
                    </span>
                    <span style={{ fontSize: 8.5, color: T.textFaint, marginTop: 2, letterSpacing: '0.06em', textTransform: 'uppercase' }}>of goal</span>
                  </div>
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>
                    <p style={{ fontSize: 10.5, color: T.textFaint, marginBottom: 2, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Time Logged</p>
                    <p style={{ fontSize: 28, fontWeight: 900, color: T.textPrimary, letterSpacing: '-0.04em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{fmt(data.totalSecs)}</p>
                    <p style={{ fontSize: 10, color: T.textFaint, marginTop: 2 }}>target {fmt(data.target)}/day</p>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {data.goalMet && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 9px', borderRadius: 99, background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.25)' }}>
                        <Award size={10} style={{ color: '#34D399' }} />
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#34D399' }}>Goal reached!</span>
                      </div>
                    )}
                    {data.vsYesterday !== null && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 9px', borderRadius: 99,
                        background: data.vsYesterday > 0 ? 'rgba(52,211,153,0.1)' : data.vsYesterday < 0 ? 'rgba(248,113,113,0.1)' : 'rgba(124,108,242,0.08)',
                        border: `1px solid ${data.vsYesterday > 0 ? 'rgba(52,211,153,0.22)' : data.vsYesterday < 0 ? 'rgba(248,113,113,0.22)' : 'rgba(124,108,242,0.18)'}`,
                      }}>
                        {data.vsYesterday > 0
                          ? <ArrowUp size={9} style={{ color: '#34D399' }} />
                          : data.vsYesterday < 0
                            ? <ArrowDown size={9} style={{ color: '#F87171' }} />
                            : <Minus size={9} style={{ color: '#7c6cf2' }} />}
                        <span style={{ fontSize: 10, fontWeight: 700, color: data.vsYesterday > 0 ? '#34D399' : data.vsYesterday < 0 ? '#F87171' : '#7c6cf2' }}>
                          {data.vsYesterday > 0 ? '+' : ''}{data.vsYesterday}% vs yesterday
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* ── Summary ───────────────────────────────────────────────────── */}
              <div style={{
                padding: '13px 15px', borderRadius: 13, marginBottom: 14,
                background: T.summaryBg,
                border: `1px solid ${T.summaryBorder}`,
                borderLeft: `3px solid ${T.summaryLeft}`,
              }}>
                <p style={{ fontSize: 12, color: T.summaryText, lineHeight: 1.65, margin: 0 }}>{data.summary}</p>
              </div>

              {/* ── 4 stats ───────────────────────────────────────────────────── */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 14 }}>
                {[
                  {
                    label: 'Focus Score',
                    value: data.focusScore > 0 ? data.focusScore : '—',
                    sub:   data.focusScore >= 80 ? 'Exceptional' : data.focusScore >= 60 ? 'Good' : data.focusScore > 0 ? 'Building' : 'No data',
                    icon: Brain,
                    color: data.focusScore >= 80 ? '#34D399' : data.focusScore >= 60 ? '#818CF8' : '#FBBF24',
                  },
                  {
                    label: 'Sessions',
                    value: data.sessionCount,
                    sub:   data.avgSessionMins > 0 ? `${data.avgSessionMins}m avg` : '—',
                    icon: Activity,
                    color: '#60A5FA',
                  },
                  {
                    label: 'Deep Work',
                    value: data.deepSecs > 0 ? fmt(data.deepSecs) : `${data.deepCount}`,
                    sub:   data.deepSecs > 0 ? `${data.deepCount} block${data.deepCount!==1?'s':''}` : 'sessions ≥25m',
                    icon: Zap,
                    color: '#34D399',
                  },
                  {
                    label: 'Streak',
                    value: data.streak > 0 ? `${data.streak}d` : '—',
                    sub:   data.streak >= 7 ? '🔥 On fire!' : data.streak >= 3 ? 'Keep it up' : data.streak > 0 ? 'Just started' : 'Start today',
                    icon: Flame,
                    color: data.streak >= 7 ? '#FB923C' : data.streak >= 3 ? '#FBBF24' : T.textFaint,
                  },
                ].map(({ label, value, sub, icon: Icon, color }) => (
                  <div key={label} style={{
                    padding: '12px 12px 11px',
                    background: T.cardBg,
                    border: `1px solid ${T.cardBorder}`,
                    borderRadius: 13,
                    display: 'flex', flexDirection: 'column', gap: 3,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                      <Icon size={11} style={{ color, flexShrink: 0 }} />
                      <span style={{ fontSize: 8.5, fontWeight: 700, color: T.statLabelColor, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
                    </div>
                    <span style={{ fontSize: 20, fontWeight: 900, color: T.textPrimary, letterSpacing: '-0.03em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
                    <span style={{ fontSize: 9, color: T.textFaint, lineHeight: 1.3 }}>{sub}</span>
                  </div>
                ))}
              </div>

              {/* ── Productivity Mix ──────────────────────────────────────────── */}
              {data.totalSecs > 0 && (data.deepSecs + data.focusSecs + data.meetSecs + data.breakSecs > 0) && (
                <div style={{
                  padding: '14px 16px', background: T.cardBg,
                  border: `1px solid ${T.cardBorder}`, borderRadius: 14, marginBottom: 14,
                }}>
                  <SectionHead icon={BarChart2} label="Productivity Mix" sub={fmt(data.totalSecs) + ' total'} T={T} />
                  <ProductivityBar
                    deepSecs={data.deepSecs} focusSecs={data.focusSecs}
                    meetSecs={data.meetSecs}  breakSecs={data.breakSecs}
                    totalSecs={data.totalSecs} T={T}
                  />
                </div>
              )}

              {/* ── Activity Timeline ─────────────────────────────────────────── */}
              {data.sessions.length > 0 && (
                <div style={{
                  padding: '14px 16px', background: T.cardBg,
                  border: `1px solid ${T.cardBorder}`, borderRadius: 14, marginBottom: 14,
                }}>
                  <SectionHead icon={Clock} label="Activity Timeline"
                    sub={data.peakHourLabel ? `Peak at ${data.peakHourLabel}` : undefined} T={T} />
                  <HourHeatmap sessions={data.sessions} from={data.from} T={T} />
                  <p style={{ fontSize: 9, color: T.textFaintest, marginTop: 6, textAlign: 'center' }}>6am — 10pm</p>
                </div>
              )}

              {/* ── Best session + Yesterday ──────────────────────────────────── */}
              {(data.bestSession || data.vsYesterday !== null) && (
                <div style={{ display: 'grid', gridTemplateColumns: data.bestSession && data.vsYesterday !== null ? '1fr 1fr' : '1fr', gap: 8, marginBottom: 14 }}>
                  {data.bestSession && (
                    <div style={{ padding: '13px 14px', background: T.cardBg, border: `1px solid ${T.cardBorder}`, borderRadius: 14 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                        <Trophy size={11} style={{ color: '#FBBF24' }} />
                        <span style={{ fontSize: 9, fontWeight: 700, color: T.statLabelColor, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Best Session</span>
                      </div>
                      <p style={{ fontSize: 12, fontWeight: 700, color: T.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 3 }}>
                        {data.bestSession.title}
                      </p>
                      <p style={{ fontSize: 11, color: '#7c6cf2', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(data.bestSession.secs)}</p>
                    </div>
                  )}
                  {data.vsYesterday !== null && (
                    <div style={{ padding: '13px 14px', background: T.cardBg, border: `1px solid ${T.cardBorder}`, borderRadius: 14 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                        <TrendingUp size={11} style={{ color: '#60A5FA' }} />
                        <span style={{ fontSize: 9, fontWeight: 700, color: T.statLabelColor, textTransform: 'uppercase', letterSpacing: '0.08em' }}>vs Yesterday</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 3 }}>
                        <span style={{
                          fontSize: 20, fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1, fontVariantNumeric: 'tabular-nums',
                          color: data.vsYesterday > 0 ? '#34D399' : data.vsYesterday < 0 ? '#F87171' : T.textMuted,
                        }}>
                          {data.vsYesterday > 0 ? '+' : ''}{data.vsYesterday}%
                        </span>
                        {data.vsYesterday > 0
                          ? <ArrowUp size={14} style={{ color: '#34D399' }} />
                          : data.vsYesterday < 0
                            ? <ArrowDown size={14} style={{ color: '#F87171' }} />
                            : <Minus size={14} style={{ color: T.textMuted }} />}
                      </div>
                      <p style={{ fontSize: 9.5, color: T.textFaint }}>Yesterday: {fmt(data.yTotal)}</p>
                    </div>
                  )}
                </div>
              )}

              {/* ── Top Apps ──────────────────────────────────────────────────── */}
              {data.topApps.length > 0 && (
                <div style={{
                  padding: '14px 16px', background: T.cardBg,
                  border: `1px solid ${T.cardBorder}`, borderRadius: 14, marginBottom: 14,
                }}>
                  <SectionHead icon={Activity} label="Top Applications" sub={`${data.topApps.length} apps`} T={T} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                    {data.topApps.map(({ app, secs }, idx) => {
                      const barPct  = pct(secs, data.topApps[0].secs);
                      const timePct = pct(secs, data.totalSecs || data.topApps[0].secs);
                      const color   = hashColor(app);
                      const isTop   = idx === 0;
                      return (
                        <div key={app} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{
                            width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                            background: `${color}18`, border: `1px solid ${color}28`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            <span style={{ fontSize: 11, fontWeight: 800, color }}>{(app[0]||'?').toUpperCase()}</span>
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                              <span style={{ fontSize: 11, fontWeight: isTop ? 700 : 500, color: isTop ? T.textPrimary : T.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {app}
                              </span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, marginLeft: 8 }}>
                                <span style={{ fontSize: 9.5, fontWeight: 700, color: T.textSecondary, fontVariantNumeric: 'tabular-nums' }}>{fmt(secs)}</span>
                                {timePct > 0 && <span style={{ fontSize: 9, color: T.textFaint }}>{timePct}%</span>}
                              </div>
                            </div>
                            <div style={{ height: 4, background: T.appBarTrack, borderRadius: 99, overflow: 'hidden' }}>
                              <div style={{
                                height: '100%', borderRadius: 99,
                                background: isTop ? `linear-gradient(90deg,${color},${color}90)` : `${color}80`,
                                width: `${barPct}%`,
                                transition: 'width 0.6s cubic-bezier(0.4,0,0.2,1)',
                                boxShadow: isTop ? `0 0 6px ${color}50` : 'none',
                              }} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── Tomorrow nudge ────────────────────────────────────────────── */}
              <div style={{
                padding: '14px 16px', marginBottom: 20,
                background: T.tomorrowBg,
                border: `1px solid ${T.tomorrowBorder}`,
                borderRadius: 14,
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 9, flexShrink: 0,
                    background: T.tomorrowIconBg, border: `1px solid ${T.tomorrowIconBd}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1,
                  }}>
                    <Sparkles size={14} style={{ color: '#A78BFA' }} />
                  </div>
                  <div>
                    <p style={{ fontSize: 12, fontWeight: 700, color: '#A78BFA', marginBottom: 5 }}>Tomorrow's Head Start</p>
                    <p style={{ fontSize: 11, color: T.textMuted, lineHeight: 1.6, margin: 0 }}>
                      {data.goalMet
                        ? `Excellent day! Set your top 3 priorities tonight so tomorrow starts with clarity. Consider a ${data.deepSecs > 0 ? fmt(Math.min(data.deepSecs, 5400)) : '90m'} deep work block to maintain momentum.`
                        : `You're ${fmt(data.target - data.totalSecs)} short of your goal. Plan a focused morning session first thing — even 45 minutes of deep work before 10am makes a significant difference.`}
                    </p>
                  </div>
                </div>
              </div>

            </div>
          )}
        </div>

        {/* ── Footer ──────────────────────────────────────────────────────────── */}
        {!loading && (
          <div style={{
            padding: '12px 20px 16px',
            borderTop: `1px solid ${T.footerBorder}`,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            flexShrink: 0, background: T.footerBg,
          }}>
            <p style={{ fontSize: 10, color: T.footerTextColor, margin: 0 }}>
              {data.sessionCount > 0
                ? `${data.sessionCount} session${data.sessionCount!==1?'s':''} · ${fmt(data.totalSecs)} tracked`
                : 'No sessions logged today'}
            </p>
            <button onClick={onClose} style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '8px 18px', borderRadius: 10,
              background: T.btnBg, border: 'none',
              cursor: 'pointer', color: '#fff',
              fontSize: 12, fontWeight: 700,
              boxShadow: T.btnShadow, transition: 'box-shadow 0.15s',
            }}
              onMouseOver={e => e.currentTarget.style.boxShadow = T.btnShadowHover}
              onMouseOut={e  => e.currentTarget.style.boxShadow = T.btnShadow}>
              Done for today <ChevronRight size={13} />
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
