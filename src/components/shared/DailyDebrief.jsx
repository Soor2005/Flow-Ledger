import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  X, TrendingUp, Clock, Zap, Target, Award,
  Flame, BarChart2, ArrowUp, ArrowDown, Minus,
  Brain, Trophy, ChevronRight, Activity,
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
// Deliberately restrained: one accent color, flat surfaces, no gradients/glow.
// Text contrast is kept high — "faint" still needs to be comfortably readable,
// not decorative.
function buildTheme(isLight) {
  return isLight ? {
    overlay:        'rgba(40,35,70,0.40)',
    modalBg:        '#FFFFFF',
    modalBorder:    '#E4E1F0',
    modalShadow:    '0 24px 60px rgba(40,30,90,0.16)',
    headerBorder:   '#ECEAF6',
    closeBg:        'transparent',
    closeHoverBg:   '#F1EFFA',
    bodyBg:         'transparent',
    summaryBg:      '#F6F4FD',
    summaryBorder:  '#E4E1F0',
    summaryText:    '#3A3460',
    cardBg:         '#FAFAFE',
    cardBg2:        '#FFFFFF',
    cardBorder:     '#E9E7F3',
    statLabelColor: '#6A6486',
    textPrimary:    '#1C1A2B',
    textSecondary:  '#46415F',
    textMuted:      '#6A6486',
    textFaint:      '#857FA0',
    textFaintest:   '#A6A1C0',
    sectionLabel:   '#564FA6',
    arcTrack:       '#EDEBF7',
    heatBarEmpty:   '#EDEBF7',
    prodBarTrack:   '#EDEBF7',
    appBarTrack:    '#EDEBF7',
    nudgeBg:        '#F6F4FD',
    nudgeBorder:    '#E4E1F0',
    footerBg:       '#FAFAFE',
    footerBorder:   '#ECEAF6',
    footerTextColor:'#857FA0',
    spinnerBorder:  '2px solid #E9E7F3',
    spinnerTop:     '#7C6CF2',
    btnBg:          '#7C6CF2',
    btnHoverBg:     '#6D5DE0',
  } : {
    overlay:        'rgba(0,0,0,0.72)',
    modalBg:        '#13151D',
    modalBorder:    '#262A38',
    modalShadow:    '0 24px 60px rgba(0,0,0,0.5)',
    headerBorder:   '#23262F',
    closeBg:        'transparent',
    closeHoverBg:   '#1E212B',
    bodyBg:         'transparent',
    summaryBg:      '#181B25',
    summaryBorder:  '#262A38',
    summaryText:    '#C7C2EE',
    cardBg:         '#181B25',
    cardBg2:        '#1C1F2A',
    cardBorder:     '#262A38',
    statLabelColor: '#777E94',
    textPrimary:    '#F1F1F6',
    textSecondary:  '#C2C6D4',
    textMuted:      '#9298AC',
    textFaint:      '#777E94',
    textFaintest:   '#565D72',
    sectionLabel:   '#B6AEEC',
    arcTrack:       '#23262F',
    heatBarEmpty:   '#1E212B',
    prodBarTrack:   '#1E212B',
    appBarTrack:    '#23262F',
    nudgeBg:        '#181B25',
    nudgeBorder:    '#262A38',
    footerBg:       '#0F1117',
    footerBorder:   '#23262F',
    footerTextColor:'#565D72',
    spinnerBorder:  '2px solid #262A38',
    spinnerTop:     '#7C6CF2',
    btnBg:          '#7C6CF2',
    btnHoverBg:     '#8B7DF5',
  };
}

// ─── Circular arc progress ────────────────────────────────────────────────────
function ArcProgress({ percent, size = 104, strokeWidth = 8, arcTrack }) {
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const filled = (Math.min(percent, 100) / 100) * circumference;
  const color = percent >= 100 ? '#34D399' : '#7C6CF2';
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={arcTrack} strokeWidth={strokeWidth} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={strokeWidth}
        strokeDasharray={`${filled} ${circumference}`} strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.8s ease' }} />
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
  const peakHour = slots.indexOf(maxVal);
  const MAX_H  = 32;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: MAX_H + 14 }}>
      {Array.from({ length: 16 }, (_, i) => i + 6).map(h => {
        const secs = slots[h];
        const barH = secs > 0 ? Math.max(Math.round((secs / maxVal) * MAX_H), 3) : 2;
        const isPeak = h === peakHour && secs > 0;
        return (
          <div key={h} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <div style={{ width: '100%', height: MAX_H, display: 'flex', alignItems: 'flex-end' }}>
              <div style={{
                width: '100%', height: barH, borderRadius: 2,
                background: secs > 0 ? (isPeak ? '#7C6CF2' : '#7C6CF299') : T.heatBarEmpty,
                transition: 'height 0.4s ease',
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
    { label: 'Deep Work', secs: deepSecs,  color: '#34D399' },
    { label: 'Focus',     secs: focusSecs, color: '#818CF8' },
    { label: 'Meetings',  secs: meetSecs,  color: '#F87171' },
    { label: 'Breaks',    secs: breakSecs, color: '#FBBF24' },
  ].filter(s => s.secs > 0);
  if (!segs.length) return null;
  return (
    <div>
      <div style={{ height: 8, borderRadius: 4, overflow: 'hidden', display: 'flex', gap: 1.5, background: T.prodBarTrack }}>
        {segs.map(s => (
          <div key={s.label} style={{
            width: `${(s.secs / totalSecs) * 100}%`, height: '100%',
            background: s.color, minWidth: 3,
            transition: 'width 0.5s ease',
          }} />
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', marginTop: 10 }}>
        {segs.map(s => (
          <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 7, height: 7, borderRadius: 2, background: s.color }} />
            <span style={{ fontSize: 10.5, color: T.textMuted }}>{s.label}</span>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: T.textSecondary }}>{fmt(s.secs)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Section header ────────────────────────────────────────────────────────────
function SectionHead({ icon: Icon, label, sub, T }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <Icon size={13} style={{ color: T.sectionLabel }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: T.textSecondary }}>{label}</span>
      </div>
      {sub && <span style={{ fontSize: 10.5, color: T.textFaint, fontWeight: 500 }}>{sub}</span>}
    </div>
  );
}

// ─── Stat tile ────────────────────────────────────────────────────────────────
function StatTile({ label, value, sub, icon: Icon, color, T }) {
  return (
    <div style={{
      padding: '13px 13px 12px',
      background: T.cardBg,
      border: `1px solid ${T.cardBorder}`,
      borderRadius: 12,
      display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 1 }}>
        <Icon size={12} style={{ color, flexShrink: 0 }} />
        <span style={{ fontSize: 9.5, fontWeight: 600, color: T.statLabelColor }}>{label}</span>
      </div>
      <span style={{ fontSize: 19, fontWeight: 800, color: T.textPrimary, letterSpacing: '-0.02em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
      <span style={{ fontSize: 10, color: T.textFaint }}>{sub}</span>
    </div>
  );
}

function useThemeLight() {
  const [isLight, setIsLight] = useState(() => document.documentElement.classList.contains('theme-light'));
  useEffect(() => {
    const obs = new MutationObserver(() => setIsLight(document.documentElement.classList.contains('theme-light')));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  return isLight;
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function DailyDebrief({ user, onClose }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [visible, setVisible] = useState(false);

  const isLight = useThemeLight();
  const T = useMemo(() => buildTheme(isLight), [isLight]);

  useEffect(() => { requestAnimationFrame(() => setVisible(true)); }, []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

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
        background: T.overlay,
        opacity: visible ? 1 : 0,
        transition: 'opacity 200ms ease',
      }}>
      <div style={{
        width: 560, maxHeight: '88vh', overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        background: T.modalBg,
        border: `1px solid ${T.modalBorder}`,
        borderRadius: 16,
        boxShadow: T.modalShadow,
        transform: visible ? 'translateY(0)' : 'translateY(8px)',
        opacity: visible ? 1 : 0,
        transition: 'transform 220ms ease, opacity 200ms ease',
      }}>

        {/* ── Header ──────────────────────────────────────────────────────────── */}
        <div style={{
          padding: '18px 22px',
          borderBottom: `1px solid ${T.headerBorder}`,
          flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: T.textPrimary, margin: 0 }}>
              Daily Debrief
            </h3>
            <p style={{ fontSize: 11.5, color: T.textMuted, margin: 0, marginTop: 2 }}>
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
          </div>
          <button onClick={onClose} style={{
            width: 28, height: 28, borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: T.closeBg, border: `1px solid ${T.cardBorder}`,
            cursor: 'pointer', color: T.textMuted, transition: 'background 0.12s',
          }}
            onMouseOver={e => { e.currentTarget.style.background = T.closeHoverBg; }}
            onMouseOut={e  => { e.currentTarget.style.background = T.closeBg; }}>
            <X size={14} />
          </button>
        </div>

        {/* ── Scrollable body ──────────────────────────────────────────────────── */}
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', background: T.bodyBg }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 280, flexDirection: 'column', gap: 10 }}>
              <div style={{
                width: 26, height: 26, borderRadius: '50%',
                border: T.spinnerBorder,
                borderTopColor: T.spinnerTop,
                animation: 'spin 0.8s linear infinite',
              }} />
              <p style={{ fontSize: 12, color: T.textMuted }}>Loading your day…</p>
            </div>
          ) : (
            <div style={{ padding: '20px 22px 0' }}>

              {/* ── Time logged + goal arc ───────────────────────────────────── */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 20, padding: '16px 18px',
                background: T.cardBg, border: `1px solid ${T.cardBorder}`,
                borderRadius: 14, marginBottom: 14,
              }}>
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <ArcProgress percent={data.goalPct} size={104} strokeWidth={8} arcTrack={T.arcTrack} />
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 19, fontWeight: 800, color: data.goalMet ? '#34D399' : T.textPrimary, letterSpacing: '-0.02em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                      {data.goalPct}%
                    </span>
                    <span style={{ fontSize: 8.5, color: T.textFaint, marginTop: 2 }}>of goal</span>
                  </div>
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 9 }}>
                  <div>
                    <p style={{ fontSize: 10.5, color: T.textMuted, marginBottom: 3, fontWeight: 600 }}>Time logged today</p>
                    <p style={{ fontSize: 26, fontWeight: 800, color: T.textPrimary, letterSpacing: '-0.02em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{fmt(data.totalSecs)}</p>
                    <p style={{ fontSize: 10.5, color: T.textFaint, marginTop: 3 }}>Target {fmt(data.target)}/day</p>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {data.goalMet && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: '#34D399' }}>
                        <Award size={11} /> Goal reached
                      </span>
                    )}
                    {data.vsYesterday !== null && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600,
                        color: data.vsYesterday > 0 ? '#34D399' : data.vsYesterday < 0 ? '#F87171' : T.textMuted }}>
                        {data.vsYesterday > 0
                          ? <ArrowUp size={11} />
                          : data.vsYesterday < 0 ? <ArrowDown size={11} /> : <Minus size={11} />}
                        {data.vsYesterday > 0 ? '+' : ''}{data.vsYesterday}% vs yesterday
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* ── Summary ───────────────────────────────────────────────────── */}
              <div style={{
                padding: '12px 15px', borderRadius: 12, marginBottom: 14,
                background: T.summaryBg, border: `1px solid ${T.summaryBorder}`,
              }}>
                <p style={{ fontSize: 12, color: T.summaryText, lineHeight: 1.6, margin: 0 }}>{data.summary}</p>
              </div>

              {/* ── 4 stat tiles ──────────────────────────────────────────────── */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 14 }}>
                <StatTile T={T} icon={Brain} label="FOCUS SCORE"
                  value={data.focusScore > 0 ? data.focusScore : '—'}
                  sub={data.focusScore >= 80 ? 'Exceptional' : data.focusScore >= 60 ? 'Good' : data.focusScore > 0 ? 'Building' : 'No data'}
                  color="#818CF8" />
                <StatTile T={T} icon={Activity} label="SESSIONS"
                  value={data.sessionCount}
                  sub={data.avgSessionMins > 0 ? `${data.avgSessionMins}m avg` : '—'}
                  color="#60A5FA" />
                <StatTile T={T} icon={Zap} label="DEEP WORK"
                  value={data.deepSecs > 0 ? fmt(data.deepSecs) : `${data.deepCount}`}
                  sub={data.deepSecs > 0 ? `${data.deepCount} block${data.deepCount!==1?'s':''}` : 'sessions ≥25m'}
                  color="#34D399" />
                <StatTile T={T} icon={Flame} label="STREAK"
                  value={data.streak > 0 ? `${data.streak}d` : '—'}
                  sub={data.streak >= 7 ? 'On fire' : data.streak >= 3 ? 'Keep it up' : data.streak > 0 ? 'Just started' : 'Start today'}
                  color={data.streak >= 3 ? '#FB923C' : T.textFaint} />
              </div>

              {/* ── Productivity Mix ──────────────────────────────────────────── */}
              {data.totalSecs > 0 && (data.deepSecs + data.focusSecs + data.meetSecs + data.breakSecs > 0) && (
                <div style={{
                  padding: '14px 16px', background: T.cardBg,
                  border: `1px solid ${T.cardBorder}`, borderRadius: 14, marginBottom: 12,
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
                  border: `1px solid ${T.cardBorder}`, borderRadius: 14, marginBottom: 12,
                }}>
                  <SectionHead icon={Clock} label="Activity Timeline"
                    sub={data.peakHourLabel ? `Peak at ${data.peakHourLabel}` : undefined} T={T} />
                  <HourHeatmap sessions={data.sessions} from={data.from} T={T} />
                  <p style={{ fontSize: 9.5, color: T.textFaintest, marginTop: 8, textAlign: 'center' }}>6am — 10pm</p>
                </div>
              )}

              {/* ── Best session + Yesterday ──────────────────────────────────── */}
              {(data.bestSession || data.vsYesterday !== null) && (
                <div style={{ display: 'grid', gridTemplateColumns: data.bestSession && data.vsYesterday !== null ? '1fr 1fr' : '1fr', gap: 8, marginBottom: 12 }}>
                  {data.bestSession && (
                    <div style={{ padding: '13px 14px', background: T.cardBg, border: `1px solid ${T.cardBorder}`, borderRadius: 14 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                        <Trophy size={12} style={{ color: '#FBBF24' }} />
                        <span style={{ fontSize: 9.5, fontWeight: 600, color: T.statLabelColor }}>Best Session</span>
                      </div>
                      <p style={{ fontSize: 12.5, fontWeight: 700, color: T.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 3 }}>
                        {data.bestSession.title}
                      </p>
                      <p style={{ fontSize: 11.5, color: T.textSecondary, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmt(data.bestSession.secs)}</p>
                    </div>
                  )}
                  {data.vsYesterday !== null && (
                    <div style={{ padding: '13px 14px', background: T.cardBg, border: `1px solid ${T.cardBorder}`, borderRadius: 14 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                        <TrendingUp size={12} style={{ color: '#60A5FA' }} />
                        <span style={{ fontSize: 9.5, fontWeight: 600, color: T.statLabelColor }}>vs Yesterday</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 3 }}>
                        <span style={{
                          fontSize: 19, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1, fontVariantNumeric: 'tabular-nums',
                          color: data.vsYesterday > 0 ? '#34D399' : data.vsYesterday < 0 ? '#F87171' : T.textMuted,
                        }}>
                          {data.vsYesterday > 0 ? '+' : ''}{data.vsYesterday}%
                        </span>
                        {data.vsYesterday > 0
                          ? <ArrowUp size={13} style={{ color: '#34D399' }} />
                          : data.vsYesterday < 0
                            ? <ArrowDown size={13} style={{ color: '#F87171' }} />
                            : <Minus size={13} style={{ color: T.textMuted }} />}
                      </div>
                      <p style={{ fontSize: 10.5, color: T.textFaint }}>Yesterday: {fmt(data.yTotal)}</p>
                    </div>
                  )}
                </div>
              )}

              {/* ── Top Apps ──────────────────────────────────────────────────── */}
              {data.topApps.length > 0 && (
                <div style={{
                  padding: '14px 16px', background: T.cardBg,
                  border: `1px solid ${T.cardBorder}`, borderRadius: 14, marginBottom: 12,
                }}>
                  <SectionHead icon={Activity} label="Top Applications" sub={`${data.topApps.length} apps`} T={T} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {data.topApps.map(({ app, secs }, idx) => {
                      const barPct  = pct(secs, data.topApps[0].secs);
                      const timePct = pct(secs, data.totalSecs || data.topApps[0].secs);
                      const color   = hashColor(app);
                      const isTop   = idx === 0;
                      return (
                        <div key={app} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ width: 14, fontSize: 10.5, fontWeight: 700, color: T.textFaint, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                            {idx + 1}
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                              <span style={{ fontSize: 11.5, fontWeight: isTop ? 700 : 500, color: isTop ? T.textPrimary : T.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {app}
                              </span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, marginLeft: 8 }}>
                                <span style={{ fontSize: 10, fontWeight: 700, color: T.textSecondary, fontVariantNumeric: 'tabular-nums' }}>{fmt(secs)}</span>
                                {timePct > 0 && <span style={{ fontSize: 9.5, color: T.textFaint }}>{timePct}%</span>}
                              </div>
                            </div>
                            <div style={{ height: 4, background: T.appBarTrack, borderRadius: 99, overflow: 'hidden' }}>
                              <div style={{
                                height: '100%', borderRadius: 99,
                                background: color,
                                width: `${barPct}%`,
                                transition: 'width 0.5s ease',
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
                background: T.nudgeBg, border: `1px solid ${T.nudgeBorder}`, borderRadius: 14,
              }}>
                <p style={{ fontSize: 11.5, fontWeight: 700, color: T.textSecondary, marginBottom: 6 }}>Tomorrow's head start</p>
                <p style={{ fontSize: 11.5, color: T.textMuted, lineHeight: 1.6, margin: 0 }}>
                  {data.goalMet
                    ? `Excellent day! Set your top 3 priorities tonight so tomorrow starts with clarity. Consider a ${data.deepSecs > 0 ? fmt(Math.min(data.deepSecs, 5400)) : '90m'} deep work block to maintain momentum.`
                    : `You're ${fmt(data.target - data.totalSecs)} short of your goal. Plan a focused morning session first thing — even 45 minutes of deep work before 10am makes a significant difference.`}
                </p>
              </div>

            </div>
          )}
        </div>

        {/* ── Footer ──────────────────────────────────────────────────────────── */}
        {!loading && (
          <div style={{
            padding: '13px 22px',
            borderTop: `1px solid ${T.footerBorder}`,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            flexShrink: 0, background: T.footerBg,
          }}>
            <p style={{ fontSize: 11, color: T.footerTextColor, margin: 0 }}>
              {data.sessionCount > 0
                ? `${data.sessionCount} session${data.sessionCount!==1?'s':''} · ${fmt(data.totalSecs)} tracked`
                : 'No sessions logged today'}
            </p>
            <button onClick={onClose} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 9,
              background: T.btnBg, border: 'none',
              cursor: 'pointer', color: '#fff',
              fontSize: 12, fontWeight: 600,
              transition: 'background 0.12s',
            }}
              onMouseOver={e => { e.currentTarget.style.background = T.btnHoverBg; }}
              onMouseOut={e  => { e.currentTarget.style.background = T.btnBg; }}>
              Done for today <ChevronRight size={13} />
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
