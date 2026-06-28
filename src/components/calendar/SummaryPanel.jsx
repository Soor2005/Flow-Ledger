import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  RefreshCw, Plus, Calendar, Zap,
  Briefcase, ChevronRight, Flame, X,
  Clock, Monitor, Target, BarChart2, Coffee, TrendingUp,
  Video, ExternalLink, CheckSquare, FileText, Play,
} from 'lucide-react';
const api = window.electron || {};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function localDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function fmtHM(seconds) {
  if (!seconds || seconds <= 0) return '0m';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function scoreLabel(s) {
  if (s >= 85) return 'Exceptional';
  if (s >= 70) return 'Strong focus';
  if (s >= 50) return 'Good progress';
  if (s >= 30) return 'Building up';
  return 'Just starting';
}

const PALETTE = [
  '#818CF8','#34D399','#F87171','#60A5FA','#FB923C',
  '#A78BFA','#FBBF24','#7c6cf2','#F472B6','#94A3B8',
];
function hashColor(str) {
  let h = 0;
  for (let i = 0; i < (str || '').length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

// ─── Shared AI-category color map ──────────────────────────────────────────────
// Single source of truth for this file — mirrors the Activity page's category
// colors exactly (src/components/activity/ActivityPage.jsx SMART_CATEGORY_DEFS),
// so a category (development, planning, research, distraction, communication, …)
// reads as the same color everywhere in the app. Keyed lowercase to match
// ai_category/category values coming off tracked sessions.
const AI_CAT_COLORS = {
  development:   '#6366f1',
  coding:        '#6366f1',
  design:        '#f43f5e',
  writing:       '#34d399',
  research:      '#60a5fa',
  communication: '#a78bfa',
  meeting:       '#f87171',
  planning:      '#fbbf24',
  learning:      '#2dd4bf',
  admin:         '#94a3b8',
  distraction:   '#fb923c',
  break:         '#cbd5e1',
  focus:         '#8b5cf6',
  other:         '#6b7280',
};

/**
 * Resolve a display color for an AI/category key. Checks the user's own
 * custom categories first (so a manually-colored category is never
 * overridden), then the shared AI category map, then falls back to a
 * deterministic hash color instead of one fixed fallback shade.
 */
function resolveCategoryColor(raw, categories = []) {
  const userColor = categories.find(c => c.name === raw)?.color;
  if (userColor) return userColor;
  const known = AI_CAT_COLORS[(raw || '').toLowerCase().trim()];
  if (known) return known;
  return hashColor(raw);
}

const SKIP_CATS = new Set(['GENERAL', 'general', 'null', 'undefined', '']);
function displayCatName(raw) {
  if (!raw || SKIP_CATS.has(raw.toString())) return null;
  if (raw === 'Auto-tracked') return 'Computer Time';
  return raw;
}

function formatLabel(raw = '') {
  return String(raw)
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, ch => ch.toUpperCase());
}

function getUsageLabel(row = {}) {
  if (row.url) {
    try {
      return new URL(row.url).hostname.replace(/^www\./, '');
    } catch {
      return row.url.replace(/^https?:\/\//i, '').replace(/^www\./, '').split('/')[0] || row.app_name || 'Unknown';
    }
  }
  return row.app_name || row.window_title || 'Unknown';
}

function overlapSeconds(startA, endA, startB, endB) {
  return Math.max(Math.min(endA, endB) - Math.max(startA, startB), 0);
}

// ─── Premium 48-slot activity timeline ───────────────────────────────────────
const TIMELINE_SLOTS = 48;

// Intensity → bar height px
const INTENSITY_H = [2, 7, 14, 22, 31];

// Hover tooltip data per type
const TL_LABEL = {
  deep:     'Deep Work',
  focus:    'Focus Session',
  meeting:  'Meeting',
  calendar: 'Calendar Event',
  auto:     'Active Session',
};
const TL_EFFECTIVENESS = { deep: 95, focus: 80, meeting: 45, calendar: 60, auto: 35 };

// Gradient fills per activity type
const TIMELINE_FILLS = {
  deep:     'linear-gradient(180deg, #818CF8 0%, #4F46E5 100%)',
  focus:    'linear-gradient(180deg, #A5B4FC 0%, #818CF8 100%)',
  meeting:  'linear-gradient(180deg, #FCA5A5 0%, #F87171 100%)',
  calendar: null, // per-event color
  auto:     'linear-gradient(180deg, #475569 0%, #334155 100%)',
  empty:    null,
};
const TIMELINE_GLOW = {
  deep:    'rgba(99,102,241,0.55)',
  focus:   'rgba(129,140,248,0.45)',
  meeting: 'rgba(248,113,113,0.45)',
  calendar:'rgba(96,165,250,0.4)',
  auto:    'rgba(71,85,105,0.3)',
};

// ─── Per-day activity chart (Week / Month views) ─────────────────────────────
function WeekDayChart({ sessions = [], rangeStart, rangeEnd, viewMode, selectedDate }) {
  const [hoveredKey, setHoveredKey] = useState(null);

  const days = useMemo(() => {
    const arr = [];
    const cur = new Date(rangeStart * 1000);
    cur.setHours(0, 0, 0, 0);
    const end = new Date(rangeEnd * 1000);
    while (cur < end) {
      arr.push(new Date(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return arr;
  }, [rangeStart, rangeEnd]);

  const { totals, deepTotals, meetingTotals, sessionCounts } = useMemo(() => {
    const t = {}, d = {}, m = {}, c = {};
    for (const s of sessions) {
      if (!s.duration_seconds || s.duration_seconds <= 0) continue;
      const key = localDateKey(new Date(s.started_at * 1000));
      t[key] = (t[key] || 0) + s.duration_seconds;
      c[key] = (c[key] || 0) + 1;
      if (s.is_deep_work) d[key] = (d[key] || 0) + s.duration_seconds;
      if (s.session_type === 'meeting') m[key] = (m[key] || 0) + s.duration_seconds;
    }
    return { totals: t, deepTotals: d, meetingTotals: m, sessionCounts: c };
  }, [sessions]);

  const maxSecs = useMemo(() =>
    Math.max(...days.map(d => totals[localDateKey(d)] || 0), 3600),
  [days, totals]);

  const todayKey     = localDateKey(new Date());
  const selectedKey  = localDateKey(new Date(selectedDate));
  const isMonth      = viewMode === 'Month';
  const BAR_MAX_H    = isMonth ? 34 : 46;
  const DAY_LABELS   = ['S','M','T','W','T','F','S'];

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: isMonth ? 2 : 5, height: BAR_MAX_H + (isMonth ? 0 : 20) }}>
        {days.map((day, barIdx) => {
          const key       = localDateKey(day);
          const secs      = totals[key] || 0;
          const deepSecs  = deepTotals[key] || 0;
          const meetSecs  = meetingTotals[key] || 0;
          const h         = secs > 0 ? Math.max(Math.round((secs / maxSecs) * BAR_MAX_H), 4) : 3;
          const deepH     = secs > 0 ? Math.round((deepSecs / secs) * h) : 0;
          const isToday   = key === todayKey;
          const isSel     = key === selectedKey;
          const isWeekend = day.getDay() === 0 || day.getDay() === 6;
          const hasWork   = secs > 0;
          const isHovered = key === hoveredKey;

          // Pin card to left edge on first 2 bars, right edge on last 2 bars,
          // centered otherwise — prevents overflow outside the chart container.
          const totalBars = days.length;
          const cardPos = barIdx < 2
            ? { left: 0, right: 'auto', transform: 'none' }
            : barIdx >= totalBars - 2
              ? { left: 'auto', right: 0, transform: 'none' }
              : { left: '50%', right: 'auto', transform: 'translateX(-50%)' };

          return (
            <div key={key}
              onMouseEnter={() => setHoveredKey(key)}
              onMouseLeave={() => setHoveredKey(null)}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 0, position: 'relative', cursor: hasWork ? 'default' : 'default' }}>
              {/* Hover tooltip card */}
              {isHovered && hasWork && (() => {
                const isCentered = !!(cardPos.transform && cardPos.transform.includes('translateX'));
                return (
                  <div
                    className="fl-week-bar-tooltip"
                    data-centered={isCentered ? 'true' : undefined}
                    style={{
                      position: 'absolute',
                      bottom: '100%',
                      ...cardPos,
                      marginBottom: 10,
                      background: 'rgba(11, 13, 24, 0.80)',
                      backdropFilter: 'blur(22px)',
                      WebkitBackdropFilter: 'blur(22px)',
                      border: '1px solid rgba(124,108,242,0.42)',
                      borderRadius: 15,
                      padding: '14px 16px',
                      zIndex: 200,
                      minWidth: 158,
                      boxShadow: [
                        '0 28px 56px rgba(0,0,0,0.70)',
                        '0 8px 20px rgba(0,0,0,0.45)',
                        '0 0 0 1px rgba(124,108,242,0.14)',
                        '0 0 28px rgba(124,108,242,0.09)',
                      ].join(', '),
                      pointerEvents: 'none',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {/* Date header */}
                    <p style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: '#D4CCFF',
                      marginBottom: 10,
                      paddingBottom: 9,
                      borderBottom: '1px solid rgba(255,255,255,0.08)',
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                    }}>
                      {day.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                    </p>

                    {/* Metric rows */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>

                      {/* Total */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 22 }}>
                        <span style={{ fontSize: 10, color: '#7A82A0', fontWeight: 500 }}>Total</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#C4B5FD', letterSpacing: '-0.02em' }}>{fmtHM(secs)}</span>
                      </div>

                      {/* Deep Work */}
                      {deepSecs > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 22 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <span style={{ width: 5, height: 5, borderRadius: 2, background: '#6366F1', flexShrink: 0, display: 'inline-block' }} />
                            <span style={{ fontSize: 10, color: '#7A82A0', fontWeight: 500 }}>Deep work</span>
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#818CF8', letterSpacing: '-0.02em' }}>{fmtHM(deepSecs)}</span>
                        </div>
                      )}

                      {/* Focus */}
                      {(secs - deepSecs - meetSecs) > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 22 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <span style={{ width: 5, height: 5, borderRadius: 2, background: '#A78BFA', flexShrink: 0, display: 'inline-block' }} />
                            <span style={{ fontSize: 10, color: '#7A82A0', fontWeight: 500 }}>Focus</span>
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#A78BFA', letterSpacing: '-0.02em' }}>{fmtHM(secs - deepSecs - meetSecs)}</span>
                        </div>
                      )}

                      {/* Meetings */}
                      {meetSecs > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 22 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <span style={{ width: 5, height: 5, borderRadius: 2, background: '#F87171', flexShrink: 0, display: 'inline-block' }} />
                            <span style={{ fontSize: 10, color: '#7A82A0', fontWeight: 500 }}>Meetings</span>
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#F87171', letterSpacing: '-0.02em' }}>{fmtHM(meetSecs)}</span>
                        </div>
                      )}

                      {/* Sessions count — subtler divider row */}
                      {(sessionCounts[key] || 0) > 0 && (
                        <div style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 22,
                          marginTop: 2, paddingTop: 8,
                          borderTop: '1px solid rgba(255,255,255,0.07)',
                        }}>
                          <span style={{ fontSize: 9.5, color: '#4E5670', fontWeight: 500, letterSpacing: '0.02em', textTransform: 'uppercase' }}>Sessions</span>
                          <span style={{ fontSize: 10, fontWeight: 600, color: '#6B7599' }}>{sessionCounts[key]}</span>
                        </div>
                      )}

                    </div>
                  </div>
                );
              })()}
              {/* Bar */}
              <div style={{ width: '100%', height: BAR_MAX_H, display: 'flex', alignItems: 'flex-end' }}>
                <div style={{
                  width: '100%', borderRadius: '4px 4px 2px 2px', overflow: 'hidden', position: 'relative',
                  height: h,
                  background: !hasWork
                    ? 'rgba(255,255,255,0.05)'
                    : isToday
                      ? 'linear-gradient(180deg, #9D8FF5 0%, #7c6cf2 100%)'
                      : isSel
                        ? 'linear-gradient(180deg, #C4B5FD 0%, #A78BFA 100%)'
                        : isWeekend
                          ? 'rgba(255,255,255,0.09)'
                          : 'linear-gradient(180deg, rgba(129,140,248,0.45) 0%, rgba(99,102,241,0.30) 100%)',
                  boxShadow: isHovered && hasWork
                    ? '0 0 12px rgba(124,108,242,0.6), 0 2px 6px rgba(124,108,242,0.3)'
                    : isToday && hasWork
                      ? '0 0 10px rgba(124,108,242,0.55), 0 2px 4px rgba(124,108,242,0.25)'
                      : isSel && hasWork ? '0 0 6px rgba(167,139,250,0.4)' : 'none',
                  transition: 'height 0.35s cubic-bezier(0.34,1.56,0.64,1)',
                  opacity: isHovered ? 1 : (hoveredKey && !isHovered ? 0.6 : 1),
                }}>
                  {deepH > 0 && (
                    <div style={{
                      position: 'absolute', bottom: 0, left: 0, right: 0,
                      height: deepH,
                      background: isToday
                        ? 'linear-gradient(180deg, #6366F1, #4F46E5)'
                        : 'linear-gradient(180deg, #818CF8, #6366F1)',
                    }} />
                  )}
                </div>
              </div>
              {/* Day label — week view only */}
              {!isMonth && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5 }}>
                  <span style={{
                    fontSize: 8.5, fontWeight: isToday ? 800 : 500,
                    color: isToday ? '#A78BFA' : isWeekend ? '#3A404F' : '#4B5263',
                    lineHeight: 1,
                  }}>
                    {DAY_LABELS[day.getDay()]}
                  </span>
                  {isToday && (
                    <span style={{ width: 3, height: 3, borderRadius: '50%', background: '#7c6cf2', display: 'block' }} />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Hours axis */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: isMonth ? 4 : 2 }}>
        {isMonth ? (
          <>
            <span style={{ fontSize: 7.5, color: 'var(--sp-text-faint)' }}>1</span>
            <span style={{ fontSize: 7.5, color: 'var(--sp-text-faint)' }}>
              {new Date(new Date(selectedDate).getFullYear(), new Date(selectedDate).getMonth() + 1, 0).getDate()}
            </span>
          </>
        ) : (
          days.filter((_, i) => i === 0 || i === 6).map(d => (
            <span key={localDateKey(d)} style={{ fontSize: 7.5, color: 'var(--sp-text-faint)' }}>
              {d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          ))
        )}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 8, height: 3, borderRadius: 99, background: 'rgba(129,140,248,0.4)' }} />
          <span style={{ fontSize: 8, color: 'var(--sp-text-faint)' }}>Work</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 8, height: 3, borderRadius: 99, background: '#7c6cf2' }} />
          <span style={{ fontSize: 8, color: 'var(--sp-text-faint)' }}>Deep Work</span>
        </div>
      </div>
    </div>
  );
}

// ─── Live countdown chip ──────────────────────────────────────────────────────
function Countdown({ targetTs, isNow = false }) {
  const [diff, setDiff] = useState(() => targetTs - Math.floor(Date.now() / 1000));

  useEffect(() => {
    const tick = () => {
      const d = targetTs - Math.floor(Date.now() / 1000);
      setDiff(d);
    };
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetTs]);

  if (isNow || diff <= 0)
    return <span style={{ fontSize: 9, fontWeight: 700, color: '#34D399', letterSpacing: '0.02em' }}>● Now</span>;
  if (diff < 60)
    return <span style={{ fontSize: 9, fontWeight: 700, color: '#FBBF24', fontVariantNumeric: 'tabular-nums' }}>in {diff}s</span>;
  if (diff < 3600) {
    const m = Math.floor(diff / 60);
    const s = diff % 60;
    return <span style={{ fontSize: 9, fontWeight: 600, color: '#60A5FA', fontVariantNumeric: 'tabular-nums' }}>in {m}m{s > 0 ? ` ${s}s` : ''}</span>;
  }
  if (diff < 86400) {
    const h = Math.floor(diff / 3600);
    const m = Math.floor((diff % 3600) / 60);
    return <span style={{ fontSize: 9, fontWeight: 600, color: '#9b8ff8', fontVariantNumeric: 'tabular-nums' }}>in {h}h{m > 0 ? ` ${m}m` : ''}</span>;
  }
  const days = Math.floor(diff / 86400);
  const h    = Math.floor((diff % 86400) / 3600);
  return <span style={{ fontSize: 9, fontWeight: 600, color: '#9CA3AF' }}>
    {days === 1 ? 'tomorrow' : `in ${days}d`}{h > 0 ? ` ${h}h` : ''}
  </span>;
}

function MiniTimeline({ sessions = [], calEvents = [], autoSessions = [] }) {
  const slots = useMemo(() => {
    // Each slot: { type, color, fill, glow, intensity }
    const arr = Array(TIMELINE_SLOTS).fill(null).map(() => ({
      type: 'empty', color: null, fill: null, glow: null, intensity: 0,
    }));

    const markTs = (startTs, endTs, type, color, intensity) => {
      if (!startTs) return;
      // timestamps may be unix seconds or ISO string
      const toMs = v => typeof v === 'number' ? v * 1000 : new Date(v).getTime();
      const sMs = toMs(startTs);
      const eMs = endTs ? toMs(endTs) : Date.now();
      if (isNaN(sMs) || isNaN(eMs)) return;
      const sD = new Date(sMs), eD = new Date(eMs);
      const sSlot = Math.floor((sD.getHours() * 60 + sD.getMinutes()) / 30);
      const eSlot = Math.ceil((eD.getHours() * 60 + eD.getMinutes()) / 30);
      for (let i = Math.max(0, sSlot); i < Math.min(TIMELINE_SLOTS, eSlot); i++) {
        if (intensity >= arr[i].intensity) {
          const baseColor = color || '#818CF8';
          arr[i] = {
            type,
            color: baseColor,
            fill: TIMELINE_FILLS[type] || `linear-gradient(180deg, ${baseColor}DD, ${baseColor}99)`,
            glow: TIMELINE_GLOW[type] || `${baseColor}44`,
            intensity,
          };
        }
      }
    };

    // Auto sessions (lowest priority = 1)
    for (const s of autoSessions) {
      if (s.is_idle || !s.duration_seconds) continue;
      markTs(s.started_at, s.started_at + s.duration_seconds, 'auto', '#475569', 1);
    }
    // Calendar events (priority = 2)
    for (const e of calEvents) {
      const ec = e.color || '#60A5FA';
      markTs(e.start_time, e.end_time, 'calendar', ec, 2);
    }
    // Focus sessions (priority 3 or 4)
    for (const s of sessions) {
      if (s.session_type === 'meeting') {
        markTs(s.started_at, s.ended_at, 'meeting', '#F87171', 3);
      } else if (s.is_deep_work) {
        markTs(s.started_at, s.ended_at, 'deep', '#818CF8', 4);
      } else {
        markTs(s.started_at, s.ended_at, 'focus', '#A5B4FC', 3);
      }
    }
    return arr;
  }, [sessions, calEvents, autoSessions]);

  // Detect peak regions: 3+ consecutive intensity-4 slots
  const peakRegions = useMemo(() => {
    const regions = [];
    let run = -1;
    for (let i = 0; i < TIMELINE_SLOTS; i++) {
      if (slots[i].intensity === 4) {
        if (run < 0) run = i;
      } else {
        if (run >= 0 && i - run >= 3) regions.push({ start: run, end: i - 1 });
        run = -1;
      }
    }
    if (run >= 0 && TIMELINE_SLOTS - run >= 3) regions.push({ start: run, end: TIMELINE_SLOTS - 1 });
    return regions;
  }, [slots]);

  // Detect runs for rounded corners (first/last of a consecutive same-type run)
  const runInfo = useMemo(() => {
    const info = Array(TIMELINE_SLOTS).fill(null).map(() => ({ first: false, last: false }));
    let runType = null, runStart = 0;
    const closeRun = (end) => {
      if (runType && runType !== 'empty') {
        info[runStart].first = true;
        info[end].last = true;
      }
    };
    for (let i = 0; i < TIMELINE_SLOTS; i++) {
      const t = slots[i].type;
      if (t !== runType) {
        closeRun(i - 1);
        runType = t; runStart = i;
      }
    }
    closeRun(TIMELINE_SLOTS - 1);
    return info;
  }, [slots]);

  // Now-line position
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const nowPct = (nowMinutes / (24 * 60)) * 100;

  // hoverState captures both the slot index AND the track rect at the moment of hover,
  // so positioning is always based on a fresh layout measurement.
  const [hoverState, setHoverState] = useState(null); // { slot, rect } | null
  const trackRef = useRef(null);

  const TRACK_H = 38; // total track height px

  // Work hours zone: 9am–5pm = slots 18–34
  const WORK_START_PCT = (18 / TIMELINE_SLOTS) * 100;
  const WORK_END_PCT   = (34 / TIMELINE_SLOTS) * 100;

  return (
    <div style={{ userSelect: 'none' }}>
      {/* Track */}
      <div ref={trackRef} style={{
        position: 'relative',
        height: TRACK_H,
        borderRadius: 10,
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.045)',
        overflow: 'visible',
      }}>
        {/* Work hours zone tint */}
        <div style={{
          position: 'absolute', top: 0, bottom: 0,
          left: `${WORK_START_PCT}%`,
          width: `${WORK_END_PCT - WORK_START_PCT}%`,
          background: 'rgba(129,140,248,0.025)',
          borderLeft: '1px solid rgba(129,140,248,0.07)',
          borderRight: '1px solid rgba(129,140,248,0.07)',
          pointerEvents: 'none',
          zIndex: 0,
        }} />

        {/* Peak glow regions */}
        {peakRegions.map((r, ri) => (
          <div key={ri} style={{
            position: 'absolute', top: 0, bottom: 0,
            left: `${(r.start / TIMELINE_SLOTS) * 100}%`,
            width: `${((r.end - r.start + 1) / TIMELINE_SLOTS) * 100}%`,
            background: 'radial-gradient(ellipse at 50% 100%, rgba(99,102,241,0.18) 0%, transparent 70%)',
            pointerEvents: 'none', zIndex: 1,
          }} />
        ))}

        {/* Hour grid lines at 6a / 12p / 6p */}
        {[12, 24, 36].map(s => (
          <div key={s} style={{
            position: 'absolute', top: 4, bottom: 4, width: 1,
            left: `${(s / TIMELINE_SLOTS) * 100}%`,
            background: 'rgba(255,255,255,0.055)',
            pointerEvents: 'none', zIndex: 2,
          }} />
        ))}

        {/* Bars */}
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'flex-end',
          gap: '1.5px', padding: '0 2px 3px',
          zIndex: 3,
        }}>
          {slots.map((seg, i) => {
            const h = INTENSITY_H[seg.intensity];
            const ri = runInfo[i];
            const isActive = seg.type !== 'empty';
            const showGlow = seg.intensity >= 3 && isActive;
            const borderRadius = ri.first && ri.last ? '3px 3px 2px 2px'
                               : ri.first           ? '3px 0 0 2px'
                               : ri.last            ? '0 3px 2px 0'
                               :                      '0 0 2px 2px';

            if (!isActive) {
              return <div key={i} style={{ flex: 1, minWidth: 0 }} />;
            }
            const isHovered = hoverState?.slot === i;
            return (
              <div key={i}
                style={{ flex: 1, height: isHovered ? Math.min(h + 4, INTENSITY_H[4] + 4) : h, minWidth: 0, borderRadius,
                  background: seg.fill,
                  boxShadow: isHovered
                    ? `0 -3px 10px ${seg.glow}, 0 0 14px ${seg.glow}`
                    : showGlow
                      ? `0 -2px 6px ${seg.glow}, 0 0 8px ${seg.glow}`
                      : `0 0 3px ${seg.glow || 'rgba(0,0,0,0.2)'}`,
                  transition: 'height 0.18s ease, box-shadow 0.18s ease',
                  cursor: 'default',
                }}
                onMouseEnter={() => {
                  // Capture the track rect NOW — most accurate, avoids stale layout reads
                  const rect = trackRef.current?.getBoundingClientRect() ?? null;
                  setHoverState({ slot: i, rect });
                }}
                onMouseLeave={() => setHoverState(null)}
              />
            );
          })}
        </div>

        {/* Hover tooltip — rendered via portal at document.body so it is NEVER
            clipped by overflow:auto containers or trapped by ancestor transforms */}
        {hoverState !== null && slots[hoverState.slot]?.type !== 'empty' && (() => {
          const { slot, rect } = hoverState;
          const seg = slots[slot];
          const eff = TL_EFFECTIVENESS[seg.type] ?? 50;

          // Time label from slot index (each slot = 30 min)
          const slotMins = slot * 30;
          const fmtT = (m) => {
            const hh   = Math.floor(m / 60) % 24;
            const mm   = m % 60;
            const ampm = hh < 12 ? 'AM' : 'PM';
            const h12  = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh;
            return `${h12}:${String(mm).padStart(2, '0')} ${ampm}`;
          };
          const timeLabel = `${fmtT(slotMins)} – ${fmtT(Math.min(slotMins + 30, 24 * 60))}`;

          const TOOLTIP_W   = 154;
          const TOOLTIP_H   = 106;   // conservative estimated rendered height
          const TOOLTIP_GAP = 12;
          const NAV_H       = 56;    // Electron chrome + app top nav

          // Center the tooltip horizontally over the hovered bar
          const rawPct     = ((slot + 0.5) / TIMELINE_SLOTS) * 100;
          const clampedPct = Math.min(Math.max(rawPct, 7), 93);

          const trackLeft  = rect?.left  ?? 0;
          const trackWidth = rect?.width ?? 0;
          const trackTop   = rect?.top   ?? window.innerHeight / 2;
          const trackBot   = rect?.bottom ?? (trackTop + TRACK_H);

          // Flip direction: prefer above; show below only when not enough space above
          const spaceAbove = trackTop - NAV_H;
          const showBelow  = spaceAbove < TOOLTIP_H + TOOLTIP_GAP;

          // Horizontal: centered on bar, hard-clamped to viewport
          const leftRaw    = trackLeft + trackWidth * clampedPct / 100;
          const leftVal    = Math.max(TOOLTIP_W / 2 + 8, Math.min(window.innerWidth - TOOLTIP_W / 2 - 8, leftRaw));

          // Vertical: above or below track, safety-clamped so it never overlaps nav or exits bottom
          const topRaw     = showBelow ? trackBot + TOOLTIP_GAP : trackTop - TOOLTIP_H - TOOLTIP_GAP;
          const topVal     = Math.max(NAV_H + 4, Math.min(window.innerHeight - TOOLTIP_H - 8, topRaw));

          const effColor = eff >= 80 ? '#34D399' : eff >= 50 ? '#FBBF24' : '#9CA3AF';
          const effGrad  = eff >= 80
            ? 'linear-gradient(90deg, #34D399, #10B981)'
            : eff >= 50
              ? 'linear-gradient(90deg, #FBBF24, #F59E0B)'
              : 'linear-gradient(90deg, #9CA3AF, #6B7280)';

          const tooltip = (
            <div
              className="fl-timeline-tooltip"
              data-below={showBelow ? 'true' : undefined}
              style={{
                position: 'fixed',
                top:  topVal,
                left: leftVal,
                transform: 'translateX(-50%)',
                zIndex: 99999,          /* above Electron chrome overlays */
                pointerEvents: 'none',
                background: '#1A1D2B',
                borderTop:    '1px solid rgba(255,255,255,0.07)',
                borderRight:  '1px solid rgba(255,255,255,0.07)',
                borderBottom: '1px solid rgba(255,255,255,0.07)',
                borderLeft:   `3px solid ${seg.color}`,
                borderRadius: 10,
                padding: '9px 12px 10px',
                boxShadow: `0 16px 40px rgba(0,0,0,0.70), 0 4px 14px rgba(0,0,0,0.42), 0 0 0 1px rgba(255,255,255,0.05)`,
                whiteSpace: 'nowrap',
                minWidth: TOOLTIP_W,
              }}
            >
              {/* Caret pointing toward the track */}
              <div style={{
                position: 'absolute',
                ...(showBelow ? { top: -5 } : { bottom: -5 }),
                left: '50%',
                transform: 'translateX(-50%)',
                width: 8, height: 5,
                overflow: 'hidden',
              }}>
                <div className="fl-tl-caret-inner" style={{
                  width: 8, height: 8,
                  background: '#1A1D2B',
                  border: '1px solid rgba(255,255,255,0.07)',
                  transform: 'rotate(45deg)',
                  transformOrigin: 'center',
                  marginTop: showBelow ? -4 : 1,
                }} />
              </div>

              {/* Row 1: colored dot + activity type */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={{
                  width: 7, height: 7, borderRadius: 2, flexShrink: 0,
                  background: seg.color,
                  boxShadow: `0 0 5px ${seg.color}60`,
                }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: seg.color, lineHeight: 1 }}>
                  {TL_LABEL[seg.type] || 'Activity'}
                </span>
              </div>

              {/* Row 2: time range */}
              <p className="fl-tl-time" style={{
                fontSize: 9.5, color: '#8A93A8',
                marginBottom: 8, lineHeight: 1,
                fontVariantNumeric: 'tabular-nums',
              }}>
                {timeLabel}
              </p>

              {/* Row 3: effectiveness */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span className="fl-tl-eff-label" style={{
                    fontSize: 8, color: '#5A6478', fontWeight: 700,
                    textTransform: 'uppercase', letterSpacing: '0.07em',
                  }}>
                    Effectiveness
                  </span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: effColor, fontVariantNumeric: 'tabular-nums' }}>
                    {eff}%
                  </span>
                </div>
                <div className="fl-tl-eff-track" style={{
                  height: 3, borderRadius: 99,
                  background: 'rgba(255,255,255,0.08)',
                  overflow: 'hidden',
                }}>
                  <div style={{
                    width: `${eff}%`, height: '100%', borderRadius: 99,
                    background: effGrad,
                  }} />
                </div>
              </div>
            </div>
          );

          // Portal to document.body — guaranteed above all stacking contexts,
          // immune to ancestor overflow:hidden / transform containment.
          return createPortal(tooltip, document.body);
        })()}

        {/* Now-line */}
        {nowPct >= 0 && nowPct <= 100 && (
          <div style={{
            position: 'absolute', top: 2, bottom: 0, zIndex: 10,
            left: `${nowPct}%`, transform: 'translateX(-50%)',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            pointerEvents: 'none',
          }}>
            {/* Pulsing dot at top */}
            <div style={{
              width: 5, height: 5, borderRadius: '50%', background: '#ef4444', flexShrink: 0,
              boxShadow: '0 0 0 2px rgba(239,68,68,0.25), 0 0 8px rgba(239,68,68,0.6)',
            }} />
            {/* Gradient fade line */}
            <div style={{
              flex: 1, width: 1.5, marginTop: 1,
              background: 'linear-gradient(180deg, #ef4444CC 0%, #ef444422 80%, transparent 100%)',
            }} />
          </div>
        )}
      </div>

      {/* Time labels */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5, padding: '0 2px' }}>
        {['12a', '6a', '12p', '6p', '12a'].map((l, i) => (
          <span key={i} style={{
            fontSize: 8, color: 'var(--sp-text-faint)',
            fontVariantNumeric: 'tabular-nums', letterSpacing: '0.01em',
          }}>{l}</span>
        ))}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 10, marginTop: 7, flexWrap: 'wrap' }}>
        {[
          { label: 'Deep Work', fill: TIMELINE_FILLS.deep,    dot: '#818CF8' },
          { label: 'Focus',     fill: TIMELINE_FILLS.focus,   dot: '#A5B4FC' },
          { label: 'Meeting',   fill: TIMELINE_FILLS.meeting, dot: '#F87171' },
          { label: 'Event',     fill: null,                   dot: '#60A5FA' },
        ].map(({ label, dot }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{
              width: 8, height: 3, borderRadius: 99,
              background: dot,
              opacity: 0.75,
            }} />
            <span style={{ fontSize: 8, color: 'var(--sp-text-faint)', letterSpacing: '0.02em' }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Donut chart — interactive SVG ───────────────────────────────────────────
// hoveredIdx / onHover enable bidirectional sync with the legend list.
// Hit detection: onMouseMove reads the angle + radial distance to find which
// arc the cursor is over, so pointer events work on the actual visible ring.
//
// Glow strategy: SVG-native <filter> elements are used instead of CSS
// `filter: drop-shadow`. CSS drop-shadow composites outside the SVG layout box
// and causes glow to bleed through the card boundary; SVG filters stay entirely
// within the declared filter region and are clipped by the SVG viewport.
function DonutChart({ data, size = 80, stroke = 9, hoveredIdx, onHover }) {
  // Inset arc from SVG boundary so the stroke never clips.
  // Without the inset: r + stroke/2 = size/2 exactly — arc outer edge is flush
  // with the viewport. On hover the stroke widens (+1.5px) pushing the outer
  // edge 0.75px outside, which gets hard-clipped by the SVG viewport.
  // With 2px inset: outer edge at rest = size/2 − 2; on hover = size/2 − 1.25.
  const r = (size - stroke) / 2 - 2;
  const C = 2 * Math.PI * r;
  const total = data.reduce((s, d) => s + d.value, 0);

  // Stable unique ID so filter defs don't collide if multiple charts exist
  const uid = useRef(`dc${Math.random().toString(36).slice(2, 7)}`).current;

  const arcs = useMemo(() => {
    if (!total) return [];
    let offset = 0;
    return data.map((d, i) => {
      const dash = (d.value / total) * C;
      const arc  = { ...d, idx: i, offset, dash };
      offset += dash;
      return arc;
    });
  }, [data, total, C]);

  const handleMouseMove = useCallback((e) => {
    const svg  = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const cx   = size / 2;
    const cy   = size / 2;
    const mx   = (e.clientX - rect.left)  - cx;
    const my   = (e.clientY - rect.top)   - cy;
    const dist = Math.sqrt(mx * mx + my * my);

    // Only trigger on the actual ring (add ±3px tolerance)
    if (dist < r - stroke / 2 - 3 || dist > r + stroke / 2 + 3) {
      onHover(null);
      return;
    }
    // Compute clockwise angle from top (0° = 12 o'clock)
    let angle = Math.atan2(my, mx) * 180 / Math.PI + 90;
    if (angle < 0) angle += 360;
    const linearPos = (angle / 360) * C;

    for (let i = 0; i < arcs.length; i++) {
      if (linearPos <= arcs[i].offset + arcs[i].dash) {
        onHover(i);
        return;
      }
    }
    onHover(null);
  }, [arcs, r, stroke, size, C, onHover]);

  if (!total) return (
    <div style={{ width: size, height: size, flexShrink: 0 }} className="flex items-center justify-center">
      <div style={{ width: size - stroke * 2 - 4, height: size - stroke * 2 - 4, borderRadius: '50%', border: `${stroke}px solid var(--sp-track-empty)` }} />
    </div>
  );

  const hovered = hoveredIdx != null ? arcs[hoveredIdx] : null;
  const hovPct  = hovered ? Math.round((hovered.value / total) * 100) : null;

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg
        width={size} height={size}
        overflow="hidden"
        style={{ transform: 'rotate(-90deg)', display: 'block', cursor: 'default' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => onHover(null)}
      >
        <defs>
          {/*
           * Per-segment glow filters — SVG-native, rendered within the
           * declared filter region. x/y/width/height are percentages of the
           * arc's bounding box; the 25% padding gives the blur room to spread
           * without escaping the SVG viewport.
           *
           * Pipeline:
           *   1. feGaussianBlur on SourceAlpha  → tight soft halo
           *   2. feFlood with segment color     → colorise the halo
           *   3. feComposite "in"               → mask flood to halo shape
           *   4. feMerge                        → layer: glow below, arc on top
           */}
          {arcs.map((arc, i) => (
            <filter
              key={i}
              id={`${uid}-g${i}`}
              x="-25%" y="-25%" width="150%" height="150%"
              colorInterpolationFilters="sRGB"
            >
              <feGaussianBlur in="SourceAlpha" stdDeviation="1.6" result="blur" />
              <feFlood floodColor={arc.color} floodOpacity="0.48" result="col" />
              <feComposite in="col" in2="blur" operator="in" result="glow" />
              <feMerge>
                <feMergeNode in="glow" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          ))}
        </defs>

        {/* Empty track ring */}
        <circle cx={size/2} cy={size/2} r={r} fill="none"
          stroke="var(--sp-track-empty)" strokeWidth={stroke} />

        {/* Segment arcs */}
        {arcs.map((arc, i) => {
          const isHov = hoveredIdx === i;
          const isDim = hoveredIdx != null && !isHov;
          return (
            <circle key={i}
              cx={size/2} cy={size/2} r={r}
              fill="none"
              stroke={arc.color}
              strokeWidth={isHov ? stroke + 1.5 : stroke}
              strokeDasharray={`${arc.dash} ${C}`}
              strokeDashoffset={-arc.offset}
              strokeLinecap="butt"
              filter={isHov ? `url(#${uid}-g${i})` : undefined}
              style={{
                opacity: isDim ? 0.22 : 1,
                transition: 'opacity 0.14s ease, stroke-width 0.12s ease',
              }}
            />
          );
        })}
      </svg>

      {/* Center: idle shows nothing; hover shows % in segment color */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        pointerEvents: 'none',
        transition: 'opacity 0.15s ease',
        opacity: hovered ? 1 : 0,
      }}>
        {hovered && (
          <span style={{
            fontSize: 14, fontWeight: 800, lineHeight: 1,
            color: hovered.color,
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: '-0.03em',
            textShadow: `0 0 6px ${hovered.color}40`,
          }}>
            {hovPct}%
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Segment hover tooltip ────────────────────────────────────────────────────
// Compact floating detail card. Slides in below the chart+legend row when a
// segment (or legend row) is hovered. Shows: name, time, %, count, progress.
// Retains the last visible item during the exit transition so opacity fades out
// smoothly instead of snapping away when the cursor leaves a segment.
function DonutSegTooltip({ item, total, visible }) {
  const lastItem = useRef(item);
  if (item) lastItem.current = item;
  const display = lastItem.current;
  if (!display) return null;
  const pct    = total > 0 ? Math.round((display.value / total) * 100) : 0;
  const avgSec = display.count > 0 ? Math.round(display.value / display.count) : 0;
  const avgStr = avgSec >= 3600
    ? `${Math.floor(avgSec / 3600)}h ${Math.round((avgSec % 3600) / 60)}m avg`
    : avgSec >= 60
      ? `${Math.round(avgSec / 60)}m avg`
      : null;

  return (
    <div className="fl-calendar-donut-tooltip" style={{
      position: 'absolute',
      top: 'calc(100% + 4px)',
      left: 0,
      right: 0,
      zIndex: 20,
      borderRadius: 10,
      background: 'linear-gradient(135deg, #161B28 0%, #111520 100%)',
      border: `1px solid ${display.color}28`,
      borderLeft: `3px solid ${display.color}`,
      padding: '8px 10px 9px',
      boxShadow: `0 8px 24px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.03), inset 0 1px 0 rgba(255,255,255,0.04)`,
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : 'translateY(-4px)',
      transition: 'opacity 0.16s ease, transform 0.16s ease',
      pointerEvents: 'none',
    }}>
      {/* Row 1: color dot · name ····· time */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 5 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
          <span style={{
            width: 7, height: 7, borderRadius: 2, flexShrink: 0,
            background: display.color,
            boxShadow: `0 0 4px ${display.color}50`,
          }} />
          <span style={{
            fontSize: 11, fontWeight: 700,
            color: 'var(--sp-text)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {display.name}
          </span>
        </div>
        <span style={{
          fontSize: 12, fontWeight: 800,
          color: display.color, flexShrink: 0,
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '-0.02em',
          textShadow: `0 0 6px ${display.color}30`,
        }}>
          {fmtHM(display.value)}
        </span>
      </div>

      {/* Row 2: percentage pill · session count · avg duration */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7 }}>
        <span style={{
          fontSize: 9, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
          color: display.color, background: `${display.color}18`,
          padding: '1px 5px', borderRadius: 4,
        }}>
          {pct}%
        </span>
        {display.count > 0 && (
          <span style={{ fontSize: 9, color: 'var(--sp-text-faint)', fontVariantNumeric: 'tabular-nums' }}>
            {display.count} {display.count === 1 ? 'session' : 'sessions'}
          </span>
        )}
        {avgStr && (
          <span style={{ fontSize: 9, color: 'var(--sp-text-faint)', marginLeft: 'auto' }}>
            {avgStr}
          </span>
        )}
      </div>

      {/* Progress bar */}
      <div style={{ height: 3, borderRadius: 99, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
        <div style={{
          width: `${pct}%`, height: '100%', borderRadius: 99,
          background: `linear-gradient(90deg, ${display.color}CC, ${display.color}77)`,
          transition: 'width 0.3s cubic-bezier(0.4,0,0.2,1)',
        }} />
      </div>
    </div>
  );
}

// ─── Stacked activity bar ─────────────────────────────────────────────────────
function SegBar({ segments, total }) {
  if (!total) return <div style={{ height: 3, borderRadius: 99, background: 'var(--sp-bar-empty)' }} />;
  return (
    <div style={{ height: 3, borderRadius: 99, overflow: 'hidden', display: 'flex', gap: 1 }}>
      {segments.filter(s => s.value > 0).map(s => (
        <div key={s.label} style={{ width: `${(s.value / total) * 100}%`, background: s.color, height: '100%' }} />
      ))}
    </div>
  );
}

// ─── Section label ────────────────────────────────────────────────────────────
// Shared heading colour — noticeably brighter than --sp-text-faint (#748297)
// but not as heavy as body text. Hits the sweet spot for uppercase labels.
const SL_COLOR = '#96A3B5';

function SL({ icon: Icon, children }) {
  return (
    <div className="fl-sp-sh" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {Icon && (
        <div className="fl-sp-sh-icon" style={{
          width: 18, height: 18, borderRadius: 5, flexShrink: 0,
          background: 'linear-gradient(135deg, rgba(124,108,242,0.16), rgba(124,108,242,0.06))',
          border: '1px solid rgba(124,108,242,0.22)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={9} className="fl-sp-sh-icon-svg" style={{ color: '#9b8ff8' }} />
        </div>
      )}
      <span className="fl-sp-sh-label" style={{
        fontSize: 9.5, fontWeight: 700,
        textTransform: 'uppercase', letterSpacing: '0.11em',
        color: SL_COLOR, lineHeight: 1,
      }}>
        {children}
      </span>
    </div>
  );
}

// ─── Shared section-header row style ─────────────────────────────────────────
const SH_ROW = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  paddingBottom: 10,
  marginBottom: 12,
  borderBottom: '1px solid var(--sp-border)',
};

// ─── Metric cell ──────────────────────────────────────────────────────────────
function MetricCell({ label, value, sub, accent, bg }) {
  return (
    <div style={{ background: bg || 'var(--sp-bg-cell)', padding: '9px 12px' }}>
      <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: SL_COLOR, marginBottom: 4 }}>{label}</p>
      <p style={{ fontSize: 15, fontWeight: 700, color: accent || 'var(--sp-text)', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{value}</p>
      <p style={{ fontSize: 9, color: 'var(--sp-text-muted)', marginTop: 3 }}>{sub}</p>
    </div>
  );
}

// ─── AI INSIGHTS PANEL v2 ─────────────────────────────────────────────────────
// Premium contextual productivity intelligence panel.
// Hierarchical, narrative-driven, adaptive intelligence system.
// No static cards. No warning dumps. Living AI productivity assistant.

// ── Intelligence derivation helpers ──────────────────────────────────────────

function deriveProductivityState(aiInsights, aiProductivity, aiDailySummary) {
  const focusQ   = aiProductivity?.focusQuality    || 0;
  const ctxQ     = aiProductivity?.contextSwitching || 0;
  const burnout  = aiProductivity?.burnoutRisk?.level || 'low';
  const dwPct    = aiInsights?.deepWorkRatio?.ratio || 0;
  const workType = aiInsights?.summary?.currentWorkType || '';
  const aiPct    = aiInsights?.aiToolUsage?.aiPct  || 0;
  const totalMins= aiDailySummary?.totalMins || 0;

  if (burnout === 'high')                         return { id:'recovery',   label:'Recovery Needed',    color:'#F87171', bg:'rgba(248,113,113,0.1)',  border:'rgba(248,113,113,0.28)', pulse:true,
    reason: 'Calendar-derived burnout signal is high — sustained work with limited recovery breaks today.' };
  if (focusQ >= 80 && ctxQ >= 70 && dwPct >= 40) return { id:'deep_flow',  label:'Deep Flow',           color:'#818CF8', bg:'rgba(129,140,248,0.12)', border:'rgba(129,140,248,0.32)', pulse:true,
    reason: `${Math.round(focusQ)}% focus quality with ${Math.round(dwPct)}% deep work and minimal context switching.` };
  if (focusQ >= 65 && dwPct >= 25)               return { id:'momentum',   label:'High Momentum',       color:'#34D399', bg:'rgba(52,211,153,0.1)',   border:'rgba(52,211,153,0.28)',  pulse:false,
    reason: `${Math.round(focusQ)}% focus quality and ${Math.round(dwPct)}% deep work — strong but not yet at peak-flow thresholds.` };
  if (aiPct >= 50)                               return { id:'ai_research','label':'AI Research Mode',  color:'#60A5FA', bg:'rgba(96,165,250,0.1)',   border:'rgba(96,165,250,0.28)',  pulse:false,
    reason: `${Math.round(aiPct)}% of tracked time today was spent in AI tools.` };
  if (ctxQ < 40 && totalMins > 60)               return { id:'fragmented', label:'Context Switching',   color:'#FBBF24', bg:'rgba(251,191,36,0.1)',   border:'rgba(251,191,36,0.28)',  pulse:false,
    reason: `Focus continuity score is only ${Math.round(ctxQ)}/100 across ${Math.round(totalMins / 60 * 10) / 10}h tracked — frequent app/window switching.` };
  if (workType.includes('Planning'))             return { id:'planning',   label:'Planning State',      color:'#A78BFA', bg:'rgba(167,139,250,0.1)',  border:'rgba(167,139,250,0.28)', pulse:false,
    reason: "Today's dominant tracked activity is planning/organizing tools and tasks." };
  if (workType.includes('Design'))               return { id:'design',     label:'Design Workflow',     color:'#F472B6', bg:'rgba(244,114,182,0.1)',  border:'rgba(244,114,182,0.28)', pulse:false,
    reason: "Today's dominant tracked activity is design tools." };
  if (burnout === 'medium')                      return { id:'high_output','label':'High Output',       color:'#FB923C', bg:'rgba(251,146,60,0.1)',   border:'rgba(251,146,60,0.28)',  pulse:false,
    reason: 'Elevated work pace today — moderate burnout signal, not yet critical.' };
  if (focusQ >= 50)                              return { id:'focused',    label:'Focused Work',        color:'#7c6cf2', bg:'rgba(124,108,242,0.1)',  border:'rgba(124,108,242,0.28)', pulse:false,
    reason: `${Math.round(focusQ)}% focus quality — steady, consistent work.` };
  return                                           { id:'building',   label:'Building Up',         color:'#94A3B8', bg:'rgba(148,163,184,0.07)', border:'rgba(148,163,184,0.18)', pulse:false,
    reason: 'Not enough tracked activity yet today to score focus quality.' };
}

function deriveHeroNarrative(aiInsights, aiDailySummary, aiProductivity, aiSelectedRecap) {
  if (aiSelectedRecap?.description?.length > 30)                                       return aiSelectedRecap.description;
  if (aiDailySummary?.narrative?.length > 20 && aiDailySummary.totalMins > 10)        return aiDailySummary.narrative;
  if (aiInsights?.workflowObjective?.insight)                                          return aiInsights.workflowObjective.insight;
  if (aiInsights?.focusTrend?.insight && aiInsights.focusTrend.trend !== 'insufficient_data') return aiInsights.focusTrend.insight;
  const q = aiProductivity?.focusQuality || 0;
  if (q >= 75) return 'Strong focus indicators detected across tracked sessions. Productive workflow confirmed.';
  if (q >= 50) return 'Steady work progress with moderate focus consistency across sessions.';
  return 'Start tracking work sessions to activate AI intelligence and productivity insights.';
}

function deriveDetectedWorkflow(aiInsights) {
  const wt  = aiInsights?.summary?.currentWorkType;
  const obj = aiInsights?.workflowObjective?.description;
  const ft  = aiInsights?.featureProgress?.primaryFeature;
  const ph  = aiInsights?.implementationPhase?.workTypeLabel;
  if (wt)  return wt;
  if (obj) return obj.charAt(0).toUpperCase() + obj.slice(1);
  if (ft)  return `${ft} Development`;
  if (ph)  return ph;
  return null;
}

// Category icon map for the rich preview card
const CATEGORY_ICONS = {
  meeting: '🤝', call: '📞', focus: '⚡', deep_work: '🧠',
  planning: '📋', review: '🔍', research: '🔬', design: '🎨',
  writing: '✍️', break: '☕', lunch: '🍽️', learning: '📚',
  email: '📧', admin: '🗂️', default: '📅',
};

function fmtPreviewDate(d) {
  if (!d) return '';
  const now = new Date();
  const tom = new Date(); tom.setDate(tom.getDate() + 1);
  if (d.toDateString() === now.toDateString()) return 'Today';
  if (d.toDateString() === tom.toDateString()) return 'Tomorrow';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
function fmtPreviewTime(d) {
  if (!d) return '';
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
function fmtDurLabel(mins) {
  if (!mins) return '';
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function AIInsightsPanel({
  aiInsights, aiProductivity, aiConflictReport, aiAdherence,
  aiFocusForecast, aiIsLoading,
  aiLiveSuggestions = [], aiDailySummary = null, aiSelectedRecap = null,
  aiCommandInput, aiCommandPreview, aiCommandResult, aiCommandLoading,
  onPreviewCommand, onProcessCommand, onClearCommand,
  // Adaptive behavioral intelligence
  aiBehavioral = null,
  aiFlowState = null,
  aiBurnoutRisk = 'low',
  aiBurnoutFatigue = 0,
  aiPeakWindow = null,
  aiProductivityTrend = 'insufficient_data',
  aiFragmentation = 0,
  aiMaturityLevel = 'learning',
  aiRecommendations = [],
  aiForecast = [],
  // Predictive Intelligence (src/ai/predictive/) — forward-looking forecasts,
  // layered on top of the adaptive behavioral snapshot above.
  aiPredictive = null,
}) {
  const [localCmd, setLocalCmd] = useState('');
  // Auto-execute countdown (seconds remaining, 0 = cancelled/done)
  const [countdown, setCountdown] = useState(0);
  const countdownRef = useRef(null);
  const pendingCmdRef = useRef(null);

  // Start a 3-second countdown that auto-fires the command
  const startAutoExecute = useCallback((cmd) => {
    pendingCmdRef.current = cmd;
    setCountdown(3);
  }, []);

  const cancelAutoExecute = useCallback(() => {
    clearInterval(countdownRef.current);
    setCountdown(0);
    pendingCmdRef.current = null;
  }, []);

  // Tick the countdown
  useEffect(() => {
    if (countdown <= 0) { clearInterval(countdownRef.current); return; }
    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countdownRef.current);
          // Fire the command
          const cmd = pendingCmdRef.current;
          if (cmd) { onProcessCommand?.(cmd); setLocalCmd(''); pendingCmdRef.current = null; }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(countdownRef.current);
  }, [countdown, onProcessCommand]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && localCmd.trim()) {
      cancelAutoExecute();
      onProcessCommand?.(localCmd.trim());
      setLocalCmd('');
    }
    if (e.key === 'Escape') { cancelAutoExecute(); setLocalCmd(''); onClearCommand?.(); }
  };

  const handleInput = (e) => {
    const v = e.target.value;
    setLocalCmd(v);
    cancelAutoExecute(); // reset countdown on any edit
    onPreviewCommand?.(v);
  };

  // When preview arrives with autoExecute=true, start countdown.
  // startAutoExecute and cancelAutoExecute are stable (useCallback with no deps),
  // so they don't need to be in the dep array to be safe.
  const autoExecuteKey = `${aiCommandPreview?.autoExecute}-${aiCommandPreview?.confidence}-${!!aiCommandResult}`;
  useEffect(() => {
    if (
      aiCommandPreview?.autoExecute &&
      aiCommandPreview.confidence >= 0.85 &&
      !aiCommandResult &&
      localCmd.trim()
    ) {
      startAutoExecute(localCmd.trim());
    } else {
      cancelAutoExecute();
    }
  }, [autoExecuteKey]); // derived string keeps deps stable without the lint rule

  // ── Intelligence derivation ───────────────────────────────────────────────

  // Adaptive flow state must be declared FIRST — used by pState below.
  // description/recommendation already exist on aiFlowState (FLOW_STATE_META
  // in adaptiveBehaviorEngine.js) but were never surfaced in this UI before.
  const adaptiveFlowMeta = aiFlowState ? {
    id: aiFlowState.state, label: aiFlowState.label,
    color: aiFlowState.color, bg: `${aiFlowState.color}18`,
    border: `${aiFlowState.color}38`, pulse: aiFlowState.state === 'deep_flow',
    reason: aiFlowState.description, recommendation: aiFlowState.recommendation,
  } : null;

  // Prefer adaptive (learned) flow state; fall back to calendar-derived state
  const calPState = deriveProductivityState(aiInsights, aiProductivity, aiDailySummary);
  const pState    = adaptiveFlowMeta || calPState;
  const hero      = deriveHeroNarrative(aiInsights, aiDailySummary, aiProductivity, aiSelectedRecap);
  const workflow  = deriveDetectedWorkflow(aiInsights);

  // Merge behavioral + calendar recommendations, then rank by their own
  // `priority` field (lower = more urgent) across BOTH sources combined.
  // Previously this just concatenated the two arrays, so a calendar rec with
  // priority 1 could be silently buried behind 4 lower-priority behavioral
  // ones — recommendations were never actually impact-ranked despite each
  // one already carrying a priority value.
  const calRecs     = aiInsights?.recommendations || [];
  const mergedRecs  = [...aiRecommendations, ...calRecs]
    .sort((a, b) => (a.priority ?? 9) - (b.priority ?? 9));
  const recs        = mergedRecs.slice(0, 3);

  // Impact band derived from the same priority value — High/Medium/Low
  // instead of showing every recommendation as equally weighted.
  function impactBand(priority) {
    if (priority == null) return null;
    if (priority <= 2) return { label: 'High Impact',   color: '#F87171' };
    if (priority <= 4) return { label: 'Medium Impact', color: '#FBBF24' };
    return { label: 'Low Impact', color: '#94A3B8' };
  }

  const prod      = aiProductivity;
  const trend     = aiInsights?.focusTrend;
  const dw        = aiInsights?.deepWorkRatio;
  const sq        = aiInsights?.scheduleQuality;
  const missed    = aiInsights?.missedSessions || [];
  const conflicts = aiConflictReport;
  const aiUsage   = aiInsights?.aiToolUsage;

  const hasData   = !!(aiInsights || aiProductivity || aiDailySummary);
  const scoreColor = (s) => s >= 75 ? '#34D399' : s >= 50 ? '#FBBF24' : '#F87171';

  // ── Category color map ────────────────────────────────────────────────────────
  // Shares the module-level AI_CAT_COLORS (mirrors the Activity page exactly)
  // plus a few extras this panel alone uses that aren't Activity page categories.
  const CAT_COLORS = {
    ...AI_CAT_COLORS,
    data:      '#22D3EE',  // cyan-400 — not an Activity page category
    deep_work: '#7C3AED',  // violet-600 — not an Activity page category
    general:   '#475569',  // slate-600 — not an Activity page category
  };

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (aiIsLoading && !hasData) return (
    <div style={{ display:'flex', flexDirection:'column', gap:9, paddingTop:4 }}>
      <div style={{ height:72, borderRadius:12, background:'rgba(124,108,242,0.07)', border:'1px solid rgba(124,108,242,0.14)', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ width:16, height:16, borderRadius:'50%', border:'2px solid #7c6cf2', borderTopColor:'transparent', animation:'spin 0.8s linear infinite' }} />
          <span style={{ fontSize:10, color:'var(--sp-text-faint)' }}>Analyzing workflow…</span>
        </div>
      </div>
      {[90,65,80].map((w,i) => (
        <div key={i} style={{ height:36, borderRadius:10, background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.055)', width:`${w}%` }} />
      ))}
    </div>
  );

  // ── Empty state ───────────────────────────────────────────────────────────
  if (!hasData) return (
    <div style={{ padding:'24px 0', display:'flex', flexDirection:'column', alignItems:'center', gap:10 }}>
      <div style={{ width:38, height:38, borderRadius:11, background:'rgba(124,108,242,0.08)', border:'1px solid rgba(124,108,242,0.16)', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <span style={{ fontSize:16, color:'#7c6cf2' }}>✦</span>
      </div>
      <p style={{ fontSize:11, color:'var(--sp-text-muted)', lineHeight:1.55, maxWidth:180, margin:0, textAlign:'center' }}>
        AI intelligence activates as you track work sessions
      </p>
    </div>
  );

  return (
    <div className="fl-sp-ai-section" style={{ display:'flex', flexDirection:'column', gap:8, paddingTop:2, paddingBottom:2 }}>

      {/* ── 1. HERO NARRATIVE ─────────────────────────────────────────────── */}
      <div className="fl-sp-ai-hero" style={{
        padding:'12px 13px', borderRadius:12, position:'relative', overflow:'hidden',
        background:'linear-gradient(135deg, rgba(124,108,242,0.11) 0%, rgba(99,102,241,0.05) 100%)',
        border:'1px solid rgba(124,108,242,0.22)', borderLeft:'3px solid #7c6cf2',
      }}>
        <div style={{ position:'absolute', top:0, left:0, right:0, height:36, background:'radial-gradient(ellipse at 50% 0%, rgba(124,108,242,0.16) 0%, transparent 70%)', pointerEvents:'none' }} />
        <div style={{ display:'flex', alignItems:'flex-start', gap:9, position:'relative' }}>
          <div style={{ width:22, height:22, borderRadius:7, flexShrink:0, background:'linear-gradient(135deg, rgba(124,108,242,0.32), rgba(99,102,241,0.16))', border:'1px solid rgba(124,108,242,0.38)', display:'flex', alignItems:'center', justifyContent:'center', marginTop:1 }}>
            <span style={{ fontSize:11, color:'#b8acff' }}>✦</span>
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <p style={{ fontSize:8.5, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.12em', color:'#9b8ff8', margin:'0 0 5px', lineHeight:1 }}>
              AI Intelligence
            </p>
            <p style={{ fontSize:12.5, color:'var(--sp-text-sec)', margin:0, lineHeight:1.62, fontWeight:400 }}>
              {hero}
            </p>
          </div>
        </div>
      </div>

      {/* ── 2. PRODUCTIVITY STATE + WORKFLOW ──────────────────────────────── */}
      <div style={{ display:'flex', gap:6 }}>
        {/* State chip */}
        <div className="fl-sp-ai-state" style={{ flex:1, padding:'8px 10px', borderRadius:10, background:pState.bg, border:`1px solid ${pState.border}`, minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:5, marginBottom:3 }}>
            <span style={{
              width:6, height:6, borderRadius:'50%', flexShrink:0,
              background:pState.color, boxShadow:`0 0 7px ${pState.color}`,
              animation: pState.pulse ? 'pulse 2s ease infinite' : 'none',
            }} />
            <span style={{ fontSize:7.5, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.1em', color:pState.color, lineHeight:1 }}>State</span>
          </div>
          <p style={{ fontSize:11, fontWeight:700, color:pState.color, margin:0, lineHeight:1.2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {pState.label}
          </p>
        </div>

        {/* Workflow chip — uses today's dominant category as fallback */}
        {(() => {
          const topWorkCat = aiDailySummary?.categoryBreakdown?.find(c => c.category !== 'break' && c.category !== 'idle');
          const chipLabel  = workflow || topWorkCat?.label || null;
          if (!chipLabel) return null;
          const chipColor  = topWorkCat ? (CAT_COLORS[topWorkCat.category] || '#818CF8') : '#818CF8';
          return (
            <div className="fl-sp-ai-workflow" style={{ flex:1, padding:'8px 10px', borderRadius:10, background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.08)', minWidth:0 }}>
              <span style={{ fontSize:7.5, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.1em', color:'#5A6A88', display:'block', marginBottom:3 }}>Workflow</span>
              <p style={{ fontSize:10.5, fontWeight:600, margin:0, lineHeight:1.3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', color:chipColor }} title={chipLabel}>
                {chipLabel}
              </p>
            </div>
          );
        })()}
      </div>

      {/* Why this state — small supporting label, not a new card, so the
          chip row above stays exactly as designed. */}
      {pState.reason && (
        <p style={{ fontSize:9, color:'var(--sp-text-faint)', margin:'-3px 0 0', lineHeight:1.45, paddingLeft:1 }}>
          {pState.reason}
        </p>
      )}

      {/* ── 3. SESSION RECAP ────────────────────────────────────────────────── */}

      {/* Session intelligence recap */}
      {aiSelectedRecap && (
        <div className="fl-sp-ai-recap" style={{ padding:'10px 12px', borderRadius:11, background:'rgba(124,108,242,0.06)', border:'1px solid rgba(124,108,242,0.18)', borderLeft:'3px solid rgba(124,108,242,0.55)' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
            <span style={{ fontSize:8, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.1em', color:'#9b8ff8' }}>Session Intelligence</span>
            {aiSelectedRecap.deepWorkLabel && (
              <span style={{ fontSize:8, fontWeight:700, padding:'2px 7px', borderRadius:5, background: aiSelectedRecap.isDeepWork ? 'rgba(52,211,153,0.14)' : 'rgba(129,140,248,0.14)', color: aiSelectedRecap.isDeepWork ? '#34D399' : '#818CF8', border:`1px solid ${aiSelectedRecap.isDeepWork ? 'rgba(52,211,153,0.28)' : 'rgba(129,140,248,0.28)'}` }}>
                {aiSelectedRecap.isDeepWork ? '⚡' : '●'} {aiSelectedRecap.deepWorkLabel}
              </span>
            )}
          </div>
          <p style={{ fontSize:12, fontWeight:700, color:'var(--sp-text)', margin:'0 0 3px', lineHeight:1.3 }}>{aiSelectedRecap.title}</p>
          {aiSelectedRecap.productivityNote && (
            <p style={{ fontSize:9.5, color:'var(--sp-text-muted)', margin:'0 0 6px', lineHeight:1.45, fontStyle:'italic' }}>{aiSelectedRecap.productivityNote}</p>
          )}
          {aiSelectedRecap.topApps?.length > 0 && (
            <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
              {aiSelectedRecap.topApps.slice(0,3).map((a,i) => (
                <span key={i} style={{ padding:'2px 7px', borderRadius:5, fontSize:9, background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.08)', color:'var(--sp-text-muted)' }}>
                  {a.name}{a.pct > 0 ? ` ${a.pct}%` : ''}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── 4. PERFORMANCE METRICS ─────────────────────────────────────────── */}
      {prod && (
        <div className="fl-sp-ai-perf" style={{ padding:'10px 12px', borderRadius:11, background:'rgba(255,255,255,0.025)', border:'1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
            <span style={{ fontSize:8, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.11em', color:'#5A6A88' }}>Performance</span>
            {aiDailySummary?.totalLabel && aiDailySummary.totalMins > 0 && (
              <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                <span style={{ fontSize:9, fontWeight:700, color:'#7c6cf2', fontVariantNumeric:'tabular-nums' }}>{aiDailySummary.totalLabel}</span>
                {aiDailySummary.deepWorkPct >= 30 && (
                  <span style={{ fontSize:8, color:'#34D399', fontWeight:600 }}>· {aiDailySummary.deepWorkPct}% deep</span>
                )}
              </div>
            )}
          </div>

          <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
            {[
              // "Flow Score" (a raw contextSwitching number with no explanation,
              // overlapping conceptually with Focus Quality) was dropped here —
              // it's now folded into the context-switch anomaly callout in
              // Predictive Intelligence below, where it comes with an explanation
              // and a recommendation instead of a bare unexplained percentage.
              { label:'Focus Quality',  value:prod.focusQuality,    max:100 },
              { label:'Deep Work',      value:dw?.ratio ?? (prod.deepWork?.deepWorkPercent || 0), max:100, suffix:'%', sub: aiBehavioral?.deepWorkInsight },
            ].filter(m => m.value != null).map(m => {
              const pct  = Math.min(Math.round((m.value / m.max) * 100), 100);
              const col  = scoreColor(m.value);
              return (
                <div key={m.label}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                    <span style={{ fontSize:9.5, color:'var(--sp-text-muted)', fontWeight:500 }}>{m.label}</span>
                    <span style={{ fontSize:10.5, fontWeight:700, color:col, fontVariantNumeric:'tabular-nums' }}>
                      {Math.round(m.value)}{m.suffix || ''}
                    </span>
                  </div>
                  <div style={{ height:3, borderRadius:99, background:'rgba(255,255,255,0.07)', overflow:'hidden' }}>
                    <div style={{ width:`${pct}%`, height:'100%', borderRadius:99, background:`linear-gradient(90deg, ${col}CC, ${col}66)`, transition:'width 0.7s cubic-bezier(0.4,0,0.2,1)' }} />
                  </div>
                  {m.sub && (
                    <p style={{ fontSize:8.5, color:'var(--sp-text-faint)', margin:'3px 0 0', lineHeight:1.4 }}>{m.sub}</p>
                  )}
                </div>
              );
            })}
          </div>

          {/* Workload composition */}
          {(() => {
            const cats = (aiDailySummary?.categoryBreakdown || [])
              .filter(c => c.category !== 'break' && c.category !== 'idle' && c.mins > 0)
              .slice(0, 6);
            const total = cats.reduce((s, c) => s + c.mins, 0);
            if (!total || cats.length < 2) return null;
            return (
              <div style={{ marginTop:10, paddingTop:9, borderTop:'1px solid rgba(255,255,255,0.05)' }}>
                <p style={{ fontSize:7.5, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.1em', color:'#5A6A88', margin:'0 0 7px' }}>Workload Composition</p>
                {/* Stacked bar */}
                <div style={{ display:'flex', height:6, borderRadius:99, overflow:'hidden', gap:1.5, marginBottom:8 }}>
                  {cats.map(c => {
                    const color = CAT_COLORS[c.category] || hashColor(c.category);
                    return (
                      <div key={c.category} style={{
                        height: '100%',
                        flex: c.mins,
                        background: color,
                        minWidth: 3,
                      }} />
                    );
                  })}
                </div>
                {/* Legend */}
                <div style={{ display:'flex', flexWrap:'wrap', gap:'4px 10px' }}>
                  {cats.map(c => {
                    const color = CAT_COLORS[c.category] || hashColor(c.category);
                    const pct = Math.round(c.mins / total * 100);
                    return (
                      <div key={c.category} style={{ display:'flex', alignItems:'center', gap:5 }}>
                        <div style={{ width:7, height:7, borderRadius:3, background:color, flexShrink:0 }} />
                        <span style={{ fontSize:8.5, color:'var(--sp-text-sec)', fontWeight:500 }}>
                          {c.label}
                          <span style={{ color:'var(--sp-text-muted)', fontWeight:400, marginLeft:3 }}>{pct}%</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ── 5. WORKFLOW INTELLIGENCE ────────────────────────────────────────── */}
      {(() => {
        // Derive entirely from reliable current-session data (not stale localStorage engines)
        const topSession    = aiDailySummary?.highlights?.[0];
        const topCat        = aiDailySummary?.categoryBreakdown?.find(c => c.category !== 'break' && c.category !== 'idle');
        const deepPct       = aiDailySummary?.deepWorkPct || 0;
        const totalMinsDay  = aiDailySummary?.totalMins || 0;
        const adaptiveWork  = aiBehavioral?.currentWorkflow;
        const contInsight   = aiBehavioral?.workflowInsight;
        const isContinuing  = aiBehavioral?.isContinuing;
        const switchInsight = aiBehavioral?.fragmentation > 40 ? aiBehavioral?.switchInsight : null;

        // Only render when we have at least one real data point
        const hasWorkflowData = topSession || topCat || aiUsage || contInsight;
        if (!hasWorkflowData) return null;

        // Determine work mode label from today's dominant category
        const WORK_MODE_LABELS = {
          development: 'Deep Implementation', coding: 'Deep Implementation',
          design: 'Design Work', writing: 'Writing & Docs',
          research: 'Research Mode', planning: 'Planning & Strategy',
          communication: 'Communication', meeting: 'Meeting Mode',
          learning: 'Learning', data: 'Data Analysis',
          focus: 'Focused Work', deep_work: 'Deep Work Session',
          admin: 'Admin Tasks',
        };
        const workModeLabel = WORK_MODE_LABELS[topCat?.category] || (topCat ? topCat.label : null);
        const workColor     = topCat ? (CAT_COLORS[topCat.category] || hashColor(topCat.category)) : '#818CF8';

        // Work session summary from actual highlights
        const focusTitle = topSession?.title || adaptiveWork?.title || null;

        return (
          <div className="fl-sp-ai-workflow-intel" style={{ padding:'10px 12px', borderRadius:11, background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.065)' }}>
            <span style={{ fontSize:8, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.11em', color:'#5A6A88', display:'block', marginBottom:8 }}>Workflow Intelligence</span>

            {/* Current work mode — derived from today's actual sessions */}
            {workModeLabel && (
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: focusTitle || contInsight ? 8 : 0 }}>
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <div style={{ width:8, height:8, borderRadius:3, background:workColor, flexShrink:0 }} />
                  <span style={{ fontSize:10.5, fontWeight:600, color:'var(--sp-text)', lineHeight:1.3 }}>{workModeLabel}</span>
                </div>
                {deepPct >= 30 && (
                  <span style={{ fontSize:8.5, color:'#34D399', fontWeight:600, padding:'2px 7px', borderRadius:5, background:'rgba(52,211,153,0.1)', border:'1px solid rgba(52,211,153,0.18)' }}>
                    {deepPct}% deep
                  </span>
                )}
              </div>
            )}

            {/* Top session / focus title */}
            {focusTitle && (
              <p style={{ fontSize:9.5, color:'var(--sp-text-sec)', margin:'0 0 6px', lineHeight:1.4, fontStyle:'italic' }}>
                "{focusTitle}"
              </p>
            )}

            {/* Continuity insight from adaptive engine */}
            {contInsight && (
              <>
                <div style={{ height:1, background:'rgba(255,255,255,0.04)', margin:'6px 0' }} />
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <span style={{ fontSize:9, color: isContinuing ? '#34D399' : 'var(--sp-text-muted)' }}>
                    {isContinuing ? '↩' : '◈'}
                  </span>
                  <span style={{ fontSize:9.5, color:'var(--sp-text-muted)', lineHeight:1.4 }}>{contInsight}</span>
                </div>
              </>
            )}

            {/* Context switching alert (only if fragmentation is high) */}
            {switchInsight && (
              <div style={{ marginTop:6, display:'flex', alignItems:'center', gap:6 }}>
                <span style={{ fontSize:9, color:'#FBBF24' }}>⚡</span>
                <span style={{ fontSize:9, color:'var(--sp-text-muted)', lineHeight:1.4 }}>{switchInsight}</span>
              </div>
            )}

            {/* AI Tool usage — derived from actual auto-sessions */}
            {aiUsage && aiUsage.aiPct >= 15 && (
              <div style={{ marginTop:8, paddingTop:8, borderTop:'1px solid rgba(255,255,255,0.04)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <span style={{ fontSize:9, color:'var(--sp-text-muted)' }}>AI Workspace</span>
                <span style={{ fontSize:9.5, fontWeight:600, color:'#60A5FA' }}>{aiUsage.usageLabel} · {aiUsage.aiMins}m</span>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── 6. AI RECOMMENDATIONS ───────────────────────────────────────────── */}
      {recs.length > 0 && (
        <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
          {recs.map((r, i) => {
            const isWarn = r.type === 'alert' || r.type === 'warning';
            const isOk   = r.type === 'success';
            const ac     = isWarn ? '#FBBF24' : isOk ? '#34D399' : '#7c6cf2';
            const bg     = isWarn ? 'rgba(251,191,36,0.07)' : isOk ? 'rgba(52,211,153,0.07)' : 'rgba(124,108,242,0.07)';
            const br     = isWarn ? 'rgba(251,191,36,0.22)' : isOk ? 'rgba(52,211,153,0.22)' : 'rgba(124,108,242,0.2)';
            const impact = impactBand(r.priority);
            return (
              <div key={i} className="fl-sp-ai-rec-item" style={{ padding:'8px 10px', borderRadius:10, background:bg, border:`1px solid ${br}`, borderLeft:`3px solid ${ac}`, display:'flex', alignItems:'flex-start', gap:9, transition:'background 0.15s' }}
                onMouseOver={e => e.currentTarget.style.filter='brightness(1.15)'}
                onMouseOut={e => e.currentTarget.style.filter=''}>
                <span style={{ fontSize:13, lineHeight:1, flexShrink:0, marginTop:0.5 }}>{r.icon}</span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:2, gap:6 }}>
                    <p style={{ fontSize:10.5, fontWeight:700, color:'var(--sp-text)', margin:0, lineHeight:1.2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.title}</p>
                    {r.action && <span style={{ fontSize:8.5, color:ac, fontWeight:600, flexShrink:0, marginLeft:6 }}>{r.action} →</span>}
                  </div>
                  <p style={{ fontSize:9.5, color:'var(--sp-text-sec)', margin:'0 0 4px', lineHeight:1.45 }}>{r.message}</p>
                  {(impact || r.confidence) && (
                    <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                      {impact && (
                        <span style={{ fontSize:7.5, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:impact.color }}>
                          {impact.label}
                        </span>
                      )}
                      {r.confidence && (
                        <span style={{ fontSize:8, color:'var(--sp-text-faint)' }}>{r.confidence} confidence</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── 7. RECOVERY INTELLIGENCE (adaptive + calendar merged) ───────────── */}
      {(() => {
        // Adaptive burnout: only show if engine has enough observations to be confident
        const adaptiveBurnout = aiBurnoutRisk !== 'low' && aiBurnoutRisk !== 'medium';
        const calBurnout      = prod?.burnoutRisk && prod.burnoutRisk.level !== 'low';
        if (!adaptiveBurnout && !calBurnout) return null;

        // Prefer calendar-derived level (real session data) over adaptive if both active
        const level    = calBurnout ? prod.burnoutRisk.level
                       : adaptiveBurnout ? aiBurnoutRisk
                       : 'medium';
        const isCrit   = level === 'critical';
        const isHigh   = level === 'high';
        const accent   = isCrit ? '#EF4444' : isHigh ? '#F87171' : '#FBBF24';
        const bg       = isCrit ? 'rgba(239,68,68,0.08)' : isHigh ? 'rgba(239,68,68,0.07)' : 'rgba(251,191,36,0.06)';
        const border   = isCrit ? 'rgba(239,68,68,0.3)' : isHigh ? 'rgba(239,68,68,0.22)' : 'rgba(251,191,36,0.22)';

        // Pick the most informative reason message
        const calReason = prod?.burnoutRisk?.reasons?.[0];
        const fallback  = isCrit ? 'High fatigue this week — consider ending early or taking a long break.'
          : isHigh ? 'Extended deep work with limited recovery detected today.'
          : 'Elevated work pace. Schedule short recovery breaks.';

        return (
          <div className="fl-sp-ai-recovery" style={{ padding:'9px 11px', borderRadius:10, background:bg, border:`1px solid ${border}`, borderLeft:`3px solid ${accent}` }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:5 }}>
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <Flame size={11} color={accent} />
                <span style={{ fontSize:8, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.1em', color:accent }}>Recovery Intelligence</span>
              </div>
              {/* Adaptive fatigue gauge — only show when meaningful */}
              {adaptiveBurnout && aiBurnoutFatigue >= 50 && (
                <span style={{ fontSize:9.5, color:accent, fontWeight:700, fontVariantNumeric:'tabular-nums' }}>
                  {Math.round(aiBurnoutFatigue)}% fatigue
                </span>
              )}
            </div>
            <p style={{ fontSize:10.5, color:'var(--sp-text-sec)', margin:'0 0 3px', lineHeight:1.48 }}>
              {calReason || fallback}
            </p>
            {/* Adaptive learned insight — only when it adds information beyond the main message */}
            {adaptiveBurnout && aiBehavioral?.burnoutInsight && !calReason && (
              <p style={{ fontSize:9.5, color:`${accent}CC`, margin:'3px 0 0', fontStyle:'italic', lineHeight:1.4 }}>
                {aiBehavioral.burnoutInsight}
              </p>
            )}
          </div>
        );
      })()}

      {/* ── 7b. BEHAVIORAL PEAK WINDOW + TREND ──────────────────────────────── */}
      {(aiPeakWindow || (aiProductivityTrend !== 'insufficient_data' && aiMaturityLevel !== 'learning')) && (
        <div className="fl-sp-ai-learned" style={{ padding:'9px 11px', borderRadius:10, background:'rgba(52,211,153,0.05)', border:'1px solid rgba(52,211,153,0.14)' }}>
          <span style={{ fontSize:8, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.1em', color:'#34D399', display:'block', marginBottom:6 }}>Learned Patterns</span>
          {aiPeakWindow && (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:3 }}>
              <span style={{ fontSize:9.5, color:'var(--sp-text-muted)' }}>Peak focus window</span>
              <span style={{ fontSize:9.5, fontWeight:700, color:'#34D399' }}>{aiPeakWindow}</span>
            </div>
          )}
          {aiProductivityTrend !== 'insufficient_data' && (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:3 }}>
              <span style={{ fontSize:9.5, color:'var(--sp-text-muted)' }}>7-day trend</span>
              <span style={{ fontSize:9.5, fontWeight:700, color: aiProductivityTrend === 'improving' ? '#34D399' : aiProductivityTrend === 'declining' ? '#F87171' : '#818CF8' }}>
                {aiProductivityTrend === 'improving' ? '↑ Improving' : aiProductivityTrend === 'declining' ? '↓ Declining' : '→ Stable'}
              </span>
            </div>
          )}
          {aiFragmentation > 50 && (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:3 }}>
              <span style={{ fontSize:9.5, color:'var(--sp-text-muted)' }}>Context switching</span>
              <span style={{ fontSize:9.5, fontWeight:700, color:'#FBBF24' }}>High ({Math.round(aiFragmentation)}%)</span>
            </div>
          )}
          {/* Typical interruption rate — already computed by adaptiveBehaviorEngine
              (intel.contextSwitch.baseline, per 10 min) but never surfaced before. */}
          {aiBehavioral?.switchBaseline > 0 && (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:3 }}>
              <span style={{ fontSize:9.5, color:'var(--sp-text-muted)' }}>Typical switching pace</span>
              <span style={{ fontSize:9.5, fontWeight:700, color:'var(--sp-text)' }}>~{Math.round(aiBehavioral.switchBaseline * 6)}/hr</span>
            </div>
          )}
          {/* Day-to-day consistency — already computed (intel.history.consistency)
              but never surfaced before; distinct from the trend direction above. */}
          {aiBehavioral?.consistency > 0 && (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <span style={{ fontSize:9.5, color:'var(--sp-text-muted)' }}>Day-to-day consistency</span>
              <span style={{ fontSize:9.5, fontWeight:700, color: aiBehavioral.consistency >= 70 ? '#34D399' : aiBehavioral.consistency >= 40 ? '#FBBF24' : '#F87171' }}>
                {Math.round(aiBehavioral.consistency)}%
              </span>
            </div>
          )}
          {aiForecast.length > 0 && (() => {
            const best = aiForecast.reduce((a, b) => a.predictedScore > b.predictedScore ? a : b, aiForecast[0]);
            if (!best || best.predictedScore < 65) return null;
            return (
              <p style={{ fontSize:9, color:'rgba(52,211,153,0.7)', margin:'5px 0 0', lineHeight:1.4 }}>
                ⚡ Best upcoming window: {best.label} (score {best.predictedScore}/100)
              </p>
            );
          })()}
        </div>
      )}

      {/* ── 8. SCHEDULE INTELLIGENCE ────────────────────────────────────────── */}
      {(() => {
        const adherencePct = aiAdherence?.adherence ?? null;
        const completed    = aiAdherence?.completed  ?? 0;
        const missedCount  = aiAdherence?.missed     ?? 0;
        const partial      = aiAdherence?.partial    ?? 0;
        const totalEvents  = aiAdherence?.total      ?? 0;
        const varianceMins = aiAdherence?.varianceMins ?? 0;
        const plannedMins  = aiAdherence?.totalPlannedMins ?? 0;
        const actualMins   = aiAdherence?.totalActualMins  ?? 0;
        const conflictCount  = conflicts?.totalConflicts ?? 0;
        const nextFocus      = aiFocusForecast?.nextFocusBlock;
        const sqScore        = sq?.score ?? null;
        const sqGrade        = sq?.grade ?? null;

        // Compute health status
        let healthStatus, healthColor, healthBg, healthBorder, healthIcon;
        if (conflictCount > 0) {
          healthStatus = 'Conflicts Detected';
          healthColor  = '#F87171'; healthBg = 'rgba(248,113,113,0.08)';
          healthBorder = 'rgba(248,113,113,0.22)'; healthIcon = '⚠';
        } else if (missedCount > 0) {
          healthStatus = 'Behind Schedule';
          healthColor  = '#FBBF24'; healthBg = 'rgba(251,191,36,0.08)';
          healthBorder = 'rgba(251,191,36,0.22)'; healthIcon = '↓';
        } else if (adherencePct !== null && adherencePct >= 80) {
          healthStatus = 'On Track';
          healthColor  = '#34D399'; healthBg = 'rgba(52,211,153,0.07)';
          healthBorder = 'rgba(52,211,153,0.20)'; healthIcon = '✓';
        } else if (adherencePct !== null && adherencePct >= 50) {
          healthStatus = 'In Progress';
          healthColor  = '#818CF8'; healthBg = 'rgba(129,140,248,0.08)';
          healthBorder = 'rgba(129,140,248,0.22)'; healthIcon = '→';
        } else {
          healthStatus = 'Schedule Clear';
          healthColor  = '#60A5FA'; healthBg = 'rgba(96,165,250,0.07)';
          healthBorder = 'rgba(96,165,250,0.20)'; healthIcon = '○';
        }

        // Only render if there's something meaningful to show
        const hasAnyData = totalEvents > 0 || conflictCount > 0 || missed.length > 0 ||
          sqScore !== null || nextFocus || aiFocusForecast?.bestWindow;
        if (!hasAnyData) return null;

        return (
          <div className="fl-sp-ai-schedule" style={{
            padding: '10px 12px', borderRadius: 11,
            background: healthBg, border: `1px solid ${healthBorder}`,
            borderLeft: `3px solid ${healthColor}`,
          }}>
            {/* Header row */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 9 }}>
              <div style={{ display:'flex', alignItems:'center', gap: 6 }}>
                <span style={{ fontSize: 13, lineHeight: 1, color: healthColor }}>{healthIcon}</span>
                <span style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.10em', color: healthColor }}>Schedule Intelligence</span>
              </div>
              <span style={{
                fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 5,
                background: `${healthColor}18`, color: healthColor, letterSpacing: '0.03em',
              }}>{healthStatus}</span>
            </div>

            {/* Adherence meter (only when we have event data) */}
            {adherencePct !== null && totalEvents > 0 && (
              <div style={{ marginBottom: 9 }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 9, color: 'var(--sp-text-muted)' }}>Adherence</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: adherencePct >= 80 ? '#34D399' : adherencePct >= 50 ? '#FBBF24' : '#F87171', fontVariantNumeric: 'tabular-nums' }}>
                    {adherencePct}%
                  </span>
                </div>
                <div style={{ height: 4, borderRadius: 99, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 99,
                    width: `${Math.min(adherencePct, 100)}%`,
                    background: adherencePct >= 80 ? 'linear-gradient(90deg,#34D399,#6EE7B7)' : adherencePct >= 50 ? 'linear-gradient(90deg,#FBBF24,#FDE68A)' : 'linear-gradient(90deg,#F87171,#FCA5A5)',
                    transition: 'width 0.5s ease',
                  }} />
                </div>
              </div>
            )}

            {/* Event stat pills */}
            {totalEvents > 0 && (
              <div style={{ display:'flex', gap: 5, marginBottom: 9, flexWrap:'wrap' }}>
                {completed > 0 && (
                  <span style={{ fontSize: 9, fontWeight: 600, padding: '2px 7px', borderRadius: 5, background: 'rgba(52,211,153,0.10)', color: '#34D399', border: '1px solid rgba(52,211,153,0.18)' }}>
                    ✓ {completed} done
                  </span>
                )}
                {partial > 0 && (
                  <span style={{ fontSize: 9, fontWeight: 600, padding: '2px 7px', borderRadius: 5, background: 'rgba(251,191,36,0.10)', color: '#FBBF24', border: '1px solid rgba(251,191,36,0.18)' }}>
                    ◑ {partial} partial
                  </span>
                )}
                {missedCount > 0 && (
                  <span style={{ fontSize: 9, fontWeight: 600, padding: '2px 7px', borderRadius: 5, background: 'rgba(248,113,113,0.10)', color: '#F87171', border: '1px solid rgba(248,113,113,0.18)' }}>
                    ✗ {missedCount} missed
                  </span>
                )}
                {conflictCount > 0 && (
                  <span style={{ fontSize: 9, fontWeight: 600, padding: '2px 7px', borderRadius: 5, background: 'rgba(248,113,113,0.10)', color: '#F87171', border: '1px solid rgba(248,113,113,0.18)' }}>
                    ↔ {conflictCount} conflict{conflictCount > 1 ? 's' : ''}
                  </span>
                )}
              </div>
            )}

            {/* Variance insight */}
            {plannedMins > 0 && Math.abs(varianceMins) >= 5 && (
              <p style={{ fontSize: 9.5, color: 'var(--sp-text-muted)', margin: '0 0 7px', lineHeight: 1.45 }}>
                {varianceMins > 0
                  ? `Running ${Math.round(varianceMins)}m ahead of schedule`
                  : `Running ${Math.round(Math.abs(varianceMins))}m behind plan`}
                {plannedMins > 0 && ` · ${Math.round(actualMins)}m of ${Math.round(plannedMins)}m planned`}
              </p>
            )}

            {/* Conflicts list */}
            {conflictCount > 0 && (
              <div style={{ marginBottom: missed.length > 0 ? 7 : 0 }}>
                {conflicts.conflicts.slice(0, 2).map((c, i) => (
                  <p key={i} style={{ fontSize: 9.5, color: '#FCA5A5', margin: '0 0 3px', lineHeight: 1.45 }}>
                    ↔ {c.message}
                  </p>
                ))}
              </div>
            )}

            {/* Missed sessions */}
            {missed.length > 0 && (
              <div style={{ marginTop: conflictCount > 0 ? 5 : 0 }}>
                {conflictCount > 0 && <div style={{ height: 1, background: 'rgba(248,113,113,0.10)', marginBottom: 5 }} />}
                {missed.slice(0, 2).map((m, i) => (
                  <div key={i} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 2 }}>
                    <span style={{ fontSize: 9.5, color: 'var(--sp-text-muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex: 1 }}>
                      ✗ {m.title}
                    </span>
                    <span style={{ fontSize: 9, color: '#FBBF24', flexShrink: 0, marginLeft: 6 }}>
                      {m.plannedMins}m
                    </span>
                  </div>
                ))}
                {/* Recovery suggestion — answers "what should I do about it",
                    not just "here's what you missed". */}
                <p style={{ fontSize: 9, color: 'var(--sp-text-faint)', margin: '4px 0 0', lineHeight: 1.4 }}>
                  → Reschedule "{missed[0].title}" into your next open slot, or fold its goal into your current block to avoid losing the work entirely.
                </p>
              </div>
            )}

            {/* Schedule quality score */}
            {sqScore !== null && (
              <div style={{ marginTop: (totalEvents > 0 || conflictCount > 0) ? 7 : 0, paddingTop: (totalEvents > 0 || conflictCount > 0) ? 7 : 0, borderTop: (totalEvents > 0 || conflictCount > 0) ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <span style={{ fontSize: 9, color: 'var(--sp-text-muted)' }}>Schedule quality</span>
                  <div style={{ display:'flex', alignItems:'center', gap: 5 }}>
                    {sqGrade && <span style={{ fontSize: 9, fontWeight: 700, color: healthColor }}>{sqGrade}</span>}
                    <span style={{ fontSize: 10, fontWeight: 800, color: healthColor, fontVariantNumeric: 'tabular-nums' }}>{sqScore}<span style={{ fontSize: 7, opacity: 0.7 }}>/100</span></span>
                  </div>
                </div>
                {/* What's causing the score + one practical fix — only when it's
                    actually worth explaining (a perfect/near-perfect score needs
                    no justification). Schedule quality = conflictScore*0.4 +
                    adherence*0.6 (calendarInsightsEngine.getScheduleQualityInsight),
                    so the dominant cause is whichever term is weakest. */}
                {sqScore < 70 && (() => {
                  const cause = conflictCount > 0
                    ? `${conflictCount} scheduling conflict${conflictCount > 1 ? 's' : ''} today`
                    : adherencePct !== null && adherencePct < 70
                    ? `only ${adherencePct}% of planned events were completed as scheduled`
                    : missedCount > 0
                    ? `${missedCount} planned event${missedCount > 1 ? 's' : ''} missed`
                    : 'a mix of timing variance across today\'s events';
                  const fix = conflictCount > 0
                    ? 'Resolve the conflict above first — it counts for 40% of this score.'
                    : 'Build in 5-10min buffers between blocks so a slow start doesn\'t cascade into the next one.';
                  return (
                    <p style={{ fontSize: 9, color: 'var(--sp-text-faint)', margin: '5px 0 0', lineHeight: 1.45 }}>
                      Lower because {cause}. {fix}
                    </p>
                  );
                })()}
              </div>
            )}

            {/* Next focus recommendation */}
            {nextFocus && !conflictCount && (
              <div style={{ marginTop: 7, paddingTop: 7, borderTop: '1px solid rgba(255,255,255,0.05)', display:'flex', alignItems:'center', gap: 6 }}>
                <span style={{ fontSize: 10 }}>⚡</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#818CF8', margin: '0 0 2px' }}>Next Focus Window</p>
                  <p style={{ fontSize: 9.5, color: 'var(--sp-text-sec)', margin: 0 }}>
                    {nextFocus.label || nextFocus.timeLabel || 'Recommended slot available'}
                  </p>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── 9. PEAK COGNITIVE WINDOW + FOCUS TREND ──────────────────────────── */}
      {(aiFocusForecast?.bestWindow || (trend && trend.trend !== 'insufficient_data')) && (
        <div className="fl-sp-ai-peak" style={{ padding:'9px 11px', borderRadius:10, background:'rgba(255,255,255,0.025)', border:'1px solid rgba(255,255,255,0.07)' }}>
          {aiFocusForecast?.bestWindow && (
            <div style={{ marginBottom: trend && trend.trend !== 'insufficient_data' ? 9 : 0 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
                <span style={{ fontSize:8, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.1em', color:'#5A6A88' }}>Peak Cognitive Window</span>
                <span style={{ fontSize:10, fontWeight:800, color:'#818CF8', fontVariantNumeric:'tabular-nums' }}>{aiFocusForecast.bestWindow.avgScore}<span style={{ fontSize:8, fontWeight:600, opacity:0.7 }}>/100</span></span>
              </div>
              <p style={{ fontSize:11.5, fontWeight:700, color:'var(--sp-text)', margin:'0 0 2px', lineHeight:1.3 }}>{aiFocusForecast.bestWindow.label}</p>
              <p style={{ fontSize:9.5, color:'var(--sp-text-muted)', margin:0 }}>{aiFocusForecast.bestWindow.suitableForDeepWork ? 'Optimal deep work window' : 'High focus probability'}</p>
            </div>
          )}

          {trend && trend.trend !== 'insufficient_data' && (
            <div style={{
              paddingTop: aiFocusForecast?.bestWindow ? 8 : 0,
              borderTop: aiFocusForecast?.bestWindow ? '1px solid rgba(255,255,255,0.05)' : 'none',
              display:'flex', alignItems:'center', justifyContent:'space-between',
            }}>
              <div>
                <p style={{ fontSize:8, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.1em', color:'#5A6A88', margin:'0 0 3px' }}>Focus Trend</p>
                <p style={{ fontSize:11, fontWeight:700, margin:'0 0 2px', color: trend.direction === 'up' ? '#34D399' : trend.direction === 'down' ? '#F87171' : '#818CF8' }}>
                  {trend.trendLabel}
                </p>
                {trend.goodStreak >= 2 && (
                  <p style={{ fontSize:9, color:'#34D399', margin:0 }}>{trend.goodStreak}-day focus streak</p>
                )}
              </div>
              <div style={{ textAlign:'right' }}>
                <p style={{ fontSize:20, fontWeight:800, color:'var(--sp-text)', margin:0, lineHeight:1, fontVariantNumeric:'tabular-nums' }}>{trend.weekAvg}</p>
                <p style={{ fontSize:8, color:'var(--sp-text-faint)', margin:'2px 0 0' }}>avg / week</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── 9b. PREDICTIVE INTELLIGENCE ─────────────────────────────────────────
           Forward-looking forecasts (src/ai/predictive/), layered on top of the
           adaptive behavioral snapshot above — burnout trajectory, workload
           forecast, next-event risk, anomalies, and a likely-next-action nudge. */}
      {aiPredictive?.isReady && (() => {
        const { burnoutTrajectory, workloadForecast, scheduleRisk, anomalies, nextAction, topAlert } = aiPredictive.brief;
        const RISK_COLOR = { low: '#34D399', medium: '#FBBF24', moderate: '#FBBF24', high: '#F87171', critical: '#EF4444' };
        const pct = (c) => c != null ? `${Math.round(c * 100)}%` : null;

        // Small "Nm confidence" tag — reused across every prediction row so a
        // forecast is never shown bare; every number here is a real computed
        // confidence from src/ai/predictive/, not a placeholder.
        const ConfidenceTag = ({ value }) => value == null ? null : (
          <span style={{ fontSize:7.5, color:'var(--sp-text-faint)', fontVariantNumeric:'tabular-nums' }}>{pct(value)} confidence</span>
        );

        const rows = [];

        if (topAlert) {
          rows.push(
            <div key="alert" style={{
              display:'flex', alignItems:'flex-start', gap:7, padding:'8px 10px', borderRadius:9,
              background: `${RISK_COLOR[topAlert.severity] || '#818CF8'}14`,
              border: `1px solid ${RISK_COLOR[topAlert.severity] || '#818CF8'}30`,
            }}>
              <span style={{ fontSize:11, lineHeight:'14px' }}>⚡</span>
              <div style={{ flex:1, minWidth:0 }}>
                <p style={{ fontSize:10.5, color:'var(--sp-text)', margin:0, lineHeight:1.4, fontWeight:600 }}>{topAlert.message}</p>
                {topAlert.confidence != null && <div style={{ marginTop:3 }}><ConfidenceTag value={topAlert.confidence} /></div>}
              </div>
            </div>
          );
        }

        if (burnoutTrajectory?.available) {
          const elevated = burnoutTrajectory.crossesCriticalOn || burnoutTrajectory.crossesHighOn;
          rows.push(
            <div key="burnout">
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <span style={{ fontSize:9.5, color:'var(--sp-text-muted)' }}>Burnout trajectory (7d)</span>
                <span style={{ fontSize:10, fontWeight:700, color: RISK_COLOR[burnoutTrajectory.crossesCriticalOn ? 'critical' : burnoutTrajectory.crossesHighOn ? 'high' : 'low'] }}>
                  {burnoutTrajectory.crossesCriticalOn ? `Critical by ${burnoutTrajectory.crossesCriticalOn}`
                    : burnoutTrajectory.crossesHighOn ? `High by ${burnoutTrajectory.crossesHighOn}`
                    : 'On track'}
                </span>
              </div>
              {/* Explanation only when it's worth justifying — a clean "on track"
                  result doesn't need a paragraph under it. */}
              {elevated && (
                <p style={{ fontSize:8.5, color:'var(--sp-text-faint)', margin:'3px 0 0', lineHeight:1.4 }}>
                  {burnoutTrajectory.insight} <ConfidenceTag value={burnoutTrajectory.confidence} />
                </p>
              )}
            </div>
          );
        }

        if (workloadForecast?.available) {
          rows.push(
            <div key="workload">
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <span style={{ fontSize:9.5, color:'var(--sp-text-muted)' }}>Tomorrow's projected load</span>
                <span style={{ fontSize:10, fontWeight:700, color: workloadForecast.tomorrowOverload ? RISK_COLOR.high : 'var(--sp-text)' }}>
                  {workloadForecast.tomorrow.projectedHours}h
                </span>
              </div>
              {workloadForecast.overloadRisk && (
                <p style={{ fontSize:8.5, color:'var(--sp-text-faint)', margin:'3px 0 0', lineHeight:1.4 }}>
                  {workloadForecast.insight} <ConfidenceTag value={workloadForecast.confidence} />
                </p>
              )}
            </div>
          );
        }

        if (scheduleRisk) {
          rows.push(
            <div key="schedule">
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <span style={{ fontSize:9.5, color:'var(--sp-text-muted)' }}>Next event risk{scheduleRisk.label ? ` — ${scheduleRisk.label}` : ''}</span>
                <span style={{ fontSize:10, fontWeight:700, color: RISK_COLOR[scheduleRisk.riskLevel] || 'var(--sp-text)', textTransform:'capitalize' }}>
                  {scheduleRisk.riskLevel}
                </span>
              </div>
              {/* Recommended action + estimated impact — never just a risk label. */}
              {scheduleRisk.riskLevel !== 'low' && (
                <p style={{ fontSize:8.5, color:'var(--sp-text-faint)', margin:'3px 0 0', lineHeight:1.4 }}>
                  {scheduleRisk.recommendation}
                  {scheduleRisk.overrunMinutesEstimate >= 10 && ` (~${scheduleRisk.overrunMinutesEstimate}m estimated impact)`}
                  {' '}<ConfidenceTag value={scheduleRisk.confidence} />
                </p>
              )}
            </div>
          );
        }

        if (nextAction) {
          rows.push(
            <div key="next" style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <span style={{ fontSize:9.5, color:'var(--sp-text-muted)' }}>Likely next</span>
              <span style={{ display:'flex', alignItems:'center', gap:5 }}>
                <span style={{ fontSize:10, fontWeight:700, color:'#818CF8' }}>{nextAction.label}</span>
                <ConfidenceTag value={nextAction.confidence} />
              </span>
            </div>
          );
        }

        if (anomalies?.length) {
          for (const a of anomalies.slice(0, 2)) {
            rows.push(
              <div key={a.type}>
                <p style={{ fontSize:9.5, color: RISK_COLOR[a.severity] || 'var(--sp-text-muted)', margin:0, lineHeight:1.4 }}>
                  {a.message}
                </p>
                {(a.recommendation || a.estimatedFocusLossMins >= 10) && (
                  <p style={{ fontSize:8.5, color:'var(--sp-text-faint)', margin:'2px 0 0', lineHeight:1.4 }}>
                    {a.recommendation}
                    {a.estimatedFocusLossMins >= 10 && ` Estimated impact: ~${a.estimatedFocusLossMins}m of focus.`}
                  </p>
                )}
              </div>
            );
          }
        }

        if (!rows.length) return null;

        return (
          <div className="fl-sp-ai-predictive" style={{ padding:'10px 12px', borderRadius:11, background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.065)', display:'flex', flexDirection:'column', gap:7 }}>
            <span style={{ fontSize:8, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.11em', color:'#5A6A88' }}>Predictive Intelligence</span>
            {rows}
          </div>
        );
      })()}

      {/* ── 10. AI COMMAND BAR ──────────────────────────────────────────────── */}
      <div>

        {/* Rich command preview card */}
        {aiCommandPreview?.confidence >= 0.5 && !aiCommandResult && (() => {
          const p = aiCommandPreview;
          const catIcon = CATEGORY_ICONS[p.category] || CATEGORY_ICONS.default;
          const isHighConf = p.confidence >= 0.85;
          const accentColor = isHighConf ? '#34D399' : '#818CF8';
          const accentBg    = isHighConf ? 'rgba(52,211,153,0.07)' : 'rgba(129,140,248,0.07)';
          const accentBorder= isHighConf ? 'rgba(52,211,153,0.25)' : 'rgba(129,140,248,0.22)';

          return (
            <div style={{
              marginBottom:6,
              padding:'10px 12px',
              borderRadius:10,
              background: accentBg,
              border: `1px solid ${accentBorder}`,
              borderLeft: `3px solid ${accentColor}`,
            }}>
              {/* Event title + category */}
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:7 }}>
                <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                  <span style={{ fontSize:14 }}>{catIcon}</span>
                  <span style={{ fontSize:11.5, fontWeight:700, color:'var(--sp-text)', lineHeight:1.2 }}>
                    {p.title}
                  </span>
                </div>
                <span style={{
                  fontSize:8, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em',
                  color: accentColor, background:`${accentColor}18`, padding:'2px 7px', borderRadius:5,
                }}>
                  {p.category || 'event'}
                </span>
              </div>

              {/* Date · Time · Duration tokens */}
              <div style={{ display:'flex', gap:5, flexWrap:'wrap', marginBottom:8 }}>
                {p.tokens?.hasDate !== false && (
                  <span style={{ fontSize:9.5, color:'#60A5FA', background:'rgba(96,165,250,0.1)', padding:'3px 8px', borderRadius:6, fontWeight:500 }}>
                    📅 {fmtPreviewDate(p.startTime)}
                  </span>
                )}
                {p.tokens?.hasTime && (
                  <span style={{ fontSize:9.5, color:'#34D399', background:'rgba(52,211,153,0.1)', padding:'3px 8px', borderRadius:6, fontWeight:500 }}>
                    🕐 {fmtPreviewTime(p.startTime)}
                  </span>
                )}
                <span style={{ fontSize:9.5, color:'#FBBF24', background:'rgba(251,191,36,0.1)', padding:'3px 8px', borderRadius:6, fontWeight:500 }}>
                  ⏱ {fmtDurLabel(p.durationMins)}
                </span>
                {p.recurrence && (
                  <span style={{ fontSize:9.5, color:'#C084FC', background:'rgba(192,132,252,0.1)', padding:'3px 8px', borderRadius:6, fontWeight:500 }}>
                    🔁 {p.recurrence.label}
                  </span>
                )}
              </div>

              {/* Auto-execute countdown or Enter hint */}
              {countdown > 0 ? (
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <span style={{ fontSize:9, color:'#34D399', fontWeight:600 }}>
                    Creating in {countdown}s…
                  </span>
                  <button
                    onClick={cancelAutoExecute}
                    style={{ fontSize:8.5, color:'#F87171', background:'rgba(248,113,113,0.08)', border:'1px solid rgba(248,113,113,0.25)', borderRadius:5, padding:'2px 9px', cursor:'pointer' }}>
                    Cancel
                  </button>
                </div>
              ) : (
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <span style={{ fontSize:9, color:'rgba(255,255,255,0.3)' }}>↵ Enter to create</span>
                  {isHighConf && (
                    <button
                      onClick={() => { onProcessCommand?.(localCmd.trim()); setLocalCmd(''); }}
                      style={{
                        fontSize:9, fontWeight:600, color:'#34D399',
                        background:'rgba(52,211,153,0.12)', border:'1px solid rgba(52,211,153,0.3)',
                        borderRadius:5, padding:'3px 10px', cursor:'pointer', transition:'all 0.15s',
                      }}
                      onMouseOver={e => { e.currentTarget.style.background='rgba(52,211,153,0.22)'; }}
                      onMouseOut={e  => { e.currentTarget.style.background='rgba(52,211,153,0.12)'; }}>
                      Create Event ✓
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })()}

        {/* Command result — success, conflict block, or error */}
        {aiCommandResult && (() => {
          const r = aiCommandResult.result;
          if (!r) return null;

          // ── Success ───────────────────────────────────────────────────────
          if (r.success) return (
            <div style={{ marginBottom:6, padding:'8px 11px', borderRadius:9, background:'rgba(52,211,153,0.08)', border:'1px solid rgba(52,211,153,0.22)' }}>
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <span style={{ fontSize:11, color:'#34D399' }}>✓</span>
                <p style={{ fontSize:10, color:'#34D399', margin:0, fontWeight:600, lineHeight:1.4 }}>
                  {r.message || 'Event created'}
                </p>
              </div>
              {r.conflicts?.length > 0 && (
                <p style={{ fontSize:9, color:'#FBBF24', margin:'4px 0 0', lineHeight:1.4 }}>
                  ⚠ {r.conflicts[0].message}
                </p>
              )}
            </div>
          );

          // ── Hard conflict / blocked ────────────────────────────────────────
          if (r.blocked) return (
            <div style={{ marginBottom:6, padding:'9px 11px', borderRadius:9, background:'rgba(248,113,113,0.08)', border:'1px solid rgba(248,113,113,0.25)', borderLeft:'3px solid #F87171' }}>
              <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:5 }}>
                <span style={{ fontSize:11, color:'#F87171', flexShrink:0 }}>✗</span>
                <p style={{ fontSize:10, color:'#F87171', margin:0, fontWeight:600, lineHeight:1.3 }}>
                  {r.error || 'Time conflict detected'}
                </p>
              </div>

              {/* Alternatives */}
              {r.alternatives?.length > 0 && (
                <div>
                  <p style={{ fontSize:8.5, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.09em', color:'#9b8ff8', margin:'0 0 5px' }}>
                    Available times
                  </p>
                  <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                    {r.alternatives.slice(0, 3).map((alt, i) => (
                      <button key={i}
                        onClick={() => {
                          // Re-run command with the alternative time
                          if (aiCommandResult.command) {
                            const altText = aiCommandResult.command.raw.replace(
                              /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/gi,
                              alt.label.split('–')[0].trim()
                            );
                            onProcessCommand?.(altText);
                          }
                        }}
                        style={{
                          padding:'5px 9px', borderRadius:7, textAlign:'left', cursor:'pointer',
                          background:'rgba(124,108,242,0.08)', border:'1px solid rgba(124,108,242,0.2)',
                          display:'flex', alignItems:'center', justifyContent:'space-between',
                          transition:'all 0.14s',
                        }}
                        onMouseOver={e => { e.currentTarget.style.background='rgba(124,108,242,0.16)'; }}
                        onMouseOut={e  => { e.currentTarget.style.background='rgba(124,108,242,0.08)'; }}>
                        <span style={{ fontSize:10, color:'var(--sp-text-sec)', fontWeight:500 }}>{alt.label}</span>
                        {alt.focusScore > 0 && (
                          <span style={{ fontSize:8.5, color:'#9b8ff8', fontWeight:600 }}>
                            {alt.focusScore}/100
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {r.suggestion && !r.alternatives?.length && (
                <p style={{ fontSize:9.5, color:'#9b8ff8', margin:'4px 0 0' }}>{r.suggestion}</p>
              )}
            </div>
          );

          // ── Generic error ────────────────────────────────────────────────
          return (
            <div style={{ marginBottom:6, padding:'7px 11px', borderRadius:9, background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.22)' }}>
              <p style={{ fontSize:9.5, color:'#F87171', margin:0, lineHeight:1.4 }}>
                ✗ {r.error || 'Command failed. Please try again.'}
              </p>
            </div>
          );
        })()}

        {/* Input */}
        <div style={{ position:'relative' }}>
          <input value={localCmd} onChange={handleInput} onKeyDown={handleKeyDown}
            placeholder='e.g. "Standup tomorrow 9:30am 15min" · "3-4pm Deep focus"'
            style={{ width:'100%', padding:'8px 32px 8px 11px', borderRadius:9, fontSize:10, background:'rgba(124,108,242,0.07)', border:'1px solid rgba(124,108,242,0.22)', color:'var(--sp-text)', outline:'none', boxSizing:'border-box', transition:'border-color 0.15s, background 0.15s' }}
            onFocus={e => { e.target.style.borderColor='rgba(124,108,242,0.52)'; e.target.style.background='rgba(124,108,242,0.11)'; }}
            onBlur={e => { e.target.style.borderColor='rgba(124,108,242,0.22)'; e.target.style.background='rgba(124,108,242,0.07)'; }}
          />
          {localCmd
            ? <button onClick={() => { setLocalCmd(''); onClearCommand?.(); }} style={{ position:'absolute', right:8, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', color:'#5A6A88', cursor:'pointer', padding:3, display:'flex', borderRadius:4 }}><X size={10} /></button>
            : <span style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', fontSize:11, color:'rgba(124,108,242,0.45)', pointerEvents:'none' }}>✦</span>
          }
        </div>

        {/* Quick example chips */}
        {!localCmd && !aiCommandResult && (() => {
          const now = new Date();
          const hr  = now.getHours();
          // Context-aware chip selection based on time of day
          const chips = hr < 10
            ? ['Standup today 9:30am 15min', 'Deep work tomorrow 9am 2h', 'Planning this Friday 10am 1h']
            : hr < 14
            ? ['Lunch today 12pm 1h', 'Call today 3pm 30min', 'Focus block tomorrow 9am 2h']
            : hr < 18
            ? ['Meeting tomorrow 9am 30min', 'Deep focus tomorrow 10am 2h', '1:1 this Friday 4pm 45min']
            : ['Deep work tomorrow 9am 2h', 'Review meeting Monday 10am 1h', 'Focus block next week 9am 90min'];
          return (
            <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginTop:6 }}>
              {chips.map((ex, i) => (
                <button key={i}
                  onClick={() => { setLocalCmd(ex); onPreviewCommand?.(ex); }}
                  style={{ padding:'3px 9px', borderRadius:6, fontSize:9, color:'#5A6A88', background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', cursor:'pointer', transition:'all 0.13s', lineHeight:1.5 }}
                  onMouseOver={e => { e.currentTarget.style.color='var(--sp-text-sec)'; e.currentTarget.style.background='rgba(124,108,242,0.08)'; e.currentTarget.style.borderColor='rgba(124,108,242,0.2)'; }}
                  onMouseOut={e  => { e.currentTarget.style.color='#5A6A88'; e.currentTarget.style.background='rgba(255,255,255,0.03)'; e.currentTarget.style.borderColor='rgba(255,255,255,0.07)'; }}>
                  {ex}
                </button>
              ))}
            </div>
          );
        })()}

      </div>

    </div>
  );
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────
export default function SummaryPanel({
  user, categories, selectedDate, activeSession, onStopSession,
  sessions = [], calEvents = [], sources = [], autoSessions = [],
  selectedBlock = null, selectedBehavior = null, dayBehavior = null,
  onAddSource, onRemoveSource, onSync, syncing, showActivity = true,
  viewMode = 'Day',
  weekStartDay = 1,   // 1 = Monday (app default), 0 = Sunday
  onAddEvent, onStartFocus, onAddTask, onAddNote,
  // AI Engine props
  aiInsights = null,
  aiProductivity = null,
  aiConflictReport = null,
  aiAdherence = null,
  aiFocusForecast = null,
  aiIsLoading = false,
  aiLiveSuggestions = [],
  aiDailySummary = null,
  aiSelectedRecap = null,
  aiCommandInput = '',
  aiCommandPreview = null,
  aiCommandResult = null,
  aiCommandLoading = false,
  onAIPreviewCommand,
  onAIProcessCommand,
  onAIClearCommand,
  // Adaptive Behavioral Intelligence props
  aiBehavioral = null,
  aiBehavioralKPIs = null,
  aiFlowState = null,
  aiBurnoutRisk = 'low',
  aiBurnoutFatigue = 0,
  aiPeakWindow = null,
  aiProductivityTrend = 'insufficient_data',
  aiFragmentation = 0,
  aiMaturityLevel = 'learning',
  aiRecommendations = [],
  aiForecast = [],
  // Predictive Intelligence props (src/ai/predictive/)
  aiPredictive = null,
}) {
  const [tab,           setTab]           = useState('projects');
  const [hoveredPieIdx, setHoveredPieIdx] = useState(null);
  const [summary,       setSummary]       = useState(null);
  const [appUsage,      setAppUsage]      = useState([]);
  const [focusScore,    setFocusScore]    = useState(0);
  const [projects,      setProjects]      = useState([]);
  const [streak,        setStreak]        = useState(0);
  const [liveElapsed,   setLiveElapsed]   = useState(0);
  const [yesterdaySecs, setYesterdaySecs] = useState(null);
  const targetHrs = user.daily_target_hours || 6;

  // Live timer
  useEffect(() => {
    if (!activeSession) { setLiveElapsed(0); return; }
    const tick = () => setLiveElapsed(Math.floor(Date.now() / 1000) - activeSession.started_at);
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [activeSession]);

  useEffect(() => {
    // Day view: fetch per-day stats from API
    if (viewMode !== 'Day') {
      // For Week / Month we derive stats from the sessions prop — just refresh projects/streak
      Promise.all([
        api.listProjects?.({ userId: user.id }),
        api.statsStreak?.({ userId: user.id }),
      ]).then(([projs, streakData]) => {
        setProjects(projs || []);
        setStreak(streakData?.streak || 0);
      });
      return;
    }
    const date = new Date(selectedDate);
    date.setHours(0, 0, 0, 0);
    const from    = Math.floor(date.getTime() / 1000);
    const to      = from + 86400;
    const dateKey = localDateKey(date);
    const yDate = new Date(date); yDate.setDate(yDate.getDate() - 1);
    const yFrom = Math.floor(yDate.getTime() / 1000);
    Promise.all([
      api.statsSummary?.({ userId: user.id, from, to }),
      api.appUsageByDate?.({ userId: user.id, dateKey }),
      api.focusScore?.({ userId: user.id, dateKey }),
      api.listProjects?.({ userId: user.id }),
      api.statsStreak?.({ userId: user.id }),
      api.statsSummary?.({ userId: user.id, from: yFrom, to: yFrom + 86400 }),
    ]).then(([sum, usage, score, projs, streakData, ySum]) => {
      setSummary(sum);
      setAppUsage(usage || []);
      setFocusScore(score?.score || 0);
      setProjects(projs || []);
      setStreak(streakData?.streak || 0);
      setYesterdaySecs(ySum?.totalSeconds ?? null);
    });
  // Include sessions.length so the Day-view summary refetches whenever sessions
  // are added or removed (e.g. after scheduling a new session via the calendar).
  }, [user.id, selectedDate, activeSession, viewMode, sessions.length]);

  // ── Multi-day stats derived from sessions prop (Week / Month) ────────────────
  // Categories are EXCLUSIVE: a deep-work session is deep-work only, not also focus.
  const rangeStats = useMemo(() => {
    if (viewMode === 'Day') return null;
    const nowSec = Math.floor(Date.now() / 1000);
    let totalSecs = 0, deepWorkSecs = 0, meetingSecs = 0, breakSecs = 0, focusSecs = 0, count = 0;
    for (const s of sessions) {
      // Skip sessions whose start time is in the future — these are calendar events
      // that were pre-converted but haven't actually occurred yet.
      if ((s.started_at || 0) > nowSec) continue;
      const dur = s.duration_seconds || 0;
      if (!dur) continue;
      totalSecs += dur;
      count++;
      // Mutually exclusive buckets — deep work wins over plain focus
      if (s.is_deep_work) {
        deepWorkSecs += dur;
      } else if (s.session_type === 'meeting') {
        meetingSecs += dur;
      } else if (s.session_type === 'break') {
        breakSecs += dur;
      } else {
        focusSecs += dur;
      }
    }
    // Also count past calendar events (Google Calendar, iCal) as meeting time,
    // but only if they look like actual meetings and haven't already been
    // auto-converted to sessions (which are already counted in the loop above).
    const linkedCalEventIds = new Set();
    for (const s of sessions) {
      for (const line of String(s.notes || '').split('\n')) {
        const t = line.trim();
        if (t.startsWith('__cal_event:')) linkedCalEventIds.add(t.slice('__cal_event:'.length));
      }
    }
    for (const e of calEvents) {
      if (!e.start_time || !e.end_time) continue;
      if (e.all_day) continue;                    // skip all-day events (holidays, OOO)
      if (e.end_time > nowSec) continue;           // not yet ended
      if (linkedCalEventIds.has(e.id)) continue;   // already counted via linked session
      // Only count events that genuinely look like meetings.
      // Primary signal: attendees present (any invited person = it's a meeting)
      // or a video/conference URL. Fall back to title keywords for events without
      // attendee data (some calendar providers don't sync attendees).
      let attendeeCount = 0;
      try { attendeeCount = JSON.parse(e.attendees_json || '[]').length; } catch { /**/ }
      const title = (e.title || '').toLowerCase();
      const looksLikeMeeting = attendeeCount > 0 || e.meeting_url ||
        title.includes('meeting') || title.includes('standup') || title.includes('stand-up') ||
        title.includes('sync') || title.includes('interview') || title.includes('call') ||
        title.includes('1:1') || title.includes('1-on-1');
      if (!looksLikeMeeting) continue;
      const dur = Math.max(e.end_time - e.start_time, 0);
      if (!dur) continue;
      meetingSecs += dur;
      totalSecs += dur;
      count++;
    }
    // Also count auto-tracked sessions that were classified as meetings
    // (e.g. Zoom/Teams/Meet detected by the app tracker). This mirrors the
    // stats:summary backend handler which adds autoMeet to meetingSeconds
    // for the Day view — without this the Week/Month views would always show 0
    // for meetings that were auto-detected rather than manually logged.
    for (const a of autoSessions) {
      if (a.is_idle) continue;
      const dur = a.duration_seconds || 0;
      if (!dur) continue;
      const n   = ((a.app_name || '') + ' ' + (a.window_title || '')).toLowerCase();
      const u   = (a.url || '').toLowerCase();
      const cat = (a.ai_category || '').toLowerCase();
      // 'communication' is intentionally excluded — email/Slack/etc. share that
      // category but are not meetings. Only classify as meeting if the app is a
      // known video-call tool OR the AI explicitly labelled it meeting/call/standup.
      const MEET_AI = ['meeting', 'call', 'standup', 'sync'];
      const isMeeting =
        MEET_AI.some(c => cat === c || cat.startsWith(c + ' ') || cat.endsWith(' ' + c)) ||
        /zoom|teams|meet\.google|webex|whereby|jitsi|gotomeeting/.test(n + ' ' + u);
      if (!isMeeting) continue;
      meetingSecs += dur;
      totalSecs   += dur;
      count++;
    }
    return { totalSecs, deepWorkSecs, meetingSecs, breakSecs, focusSecs, count };
  }, [viewMode, sessions, calEvents, autoSessions]);

  // Working-day target multiplier for Week / Month
  const targetMultiplier = useMemo(() => {
    if (viewMode === 'Week')  return 5;
    if (viewMode === 'Month') {
      const d = new Date(selectedDate);
      const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      return Math.round(daysInMonth * 5 / 7); // approx working days
    }
    return 1;
  }, [viewMode, selectedDate]);

  // ── Derived ──────────────────────────────────────────────────────────────────
  const isMulti   = viewMode !== 'Day';
  const total     = isMulti ? (rangeStats?.totalSecs    || 0) : (summary?.totalSeconds    || 0);
  const focus     = isMulti ? (rangeStats?.focusSecs    || 0) : (summary?.focusSeconds    || 0);
  const deepWork  = isMulti ? (rangeStats?.deepWorkSecs || 0) : (summary?.deepWorkSeconds || 0);
  const meetings  = isMulti ? (rangeStats?.meetingSecs  || 0) : (summary?.meetingSeconds  || 0);
  const breaks    = isMulti ? (rangeStats?.breakSecs    || 0) : (summary?.breakSeconds    || 0);
  const sessCount = isMulti ? (rangeStats?.count        || 0) : (summary?.sessionCount    || 0);
  // In multi-day views all time is already accounted for in the exclusive buckets
  // (deepWork + focus + meetings + breaks = total), so "other" is always 0.
  // In Day view the API may leave untracked time; compute it normally.
  const other     = isMulti ? 0 : Math.max(total - focus - meetings - breaks, 0);
  const targetSec = targetHrs * 3600 * (isMulti ? targetMultiplier : 1);
  const targetPct = targetSec > 0 ? Math.min(Math.round((total / targetSec) * 100), 999) : 0;
  const deepPct   = total > 0 ? Math.round((deepWork / total) * 100) : 0;
  const focusPct  = total > 0 ? Math.round((focus / total) * 100) : 0;
  const isToday   = new Date().toDateString() === new Date(selectedDate).toDateString();

  // In Week / Month views the per-day API focus score is 0 (not fetched).
  // Derive a synthetic "productivity score" from the session breakdown instead:
  // deep-work share contributes heavily; general focus share contributes lightly.
  const displayFocusScore = useMemo(() => {
    if (!isMulti) return focusScore;
    if (!total)   return 0;
    return Math.min(Math.round(deepPct * 1.0 + focusPct * 0.4), 100);
  }, [isMulti, focusScore, deepPct, focusPct, total]);

  const scoreColor = displayFocusScore >= 70 ? '#34D399' : displayFocusScore >= 45 ? '#FBBF24' : '#818CF8';
  const nowTs     = Math.floor(Date.now() / 1000);
  const vsYesterday = (!isMulti && yesterdaySecs !== null && yesterdaySecs > 0)
    ? Math.round(((total - yesterdaySecs) / yesterdaySecs) * 100)
    : null;

  const dayStart = useMemo(() => {
    const d = new Date(selectedDate); d.setHours(0,0,0,0);
    return Math.floor(d.getTime() / 1000);
  }, [selectedDate]);

  // ── View-range bounds: mirror CalendarView's dateRange() exactly ─────────────
  // Uses weekStartDay prop (1=Monday default) so both panels are always in sync.
  const rangeStart = useMemo(() => {
    const d = new Date(selectedDate);
    d.setHours(0, 0, 0, 0);
    if (viewMode === 'Week') {
      // Same formula as CalendarView: (getDay() - weekStartDay + 7) % 7
      const daysSinceStart = (d.getDay() - weekStartDay + 7) % 7;
      d.setDate(d.getDate() - daysSinceStart);
    } else if (viewMode === 'Month') {
      d.setDate(1);
    }
    return Math.floor(d.getTime() / 1000);
  }, [selectedDate, viewMode, weekStartDay]);

  const rangeEnd = useMemo(() => {
    if (viewMode === 'Day')  return rangeStart + 86400;
    if (viewMode === 'Week') return rangeStart + 7 * 86400;
    // Month: last moment of the last day of the month
    const d = new Date(selectedDate);
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
    return Math.floor(lastDay.getTime() / 1000);
  }, [rangeStart, viewMode, selectedDate]);

  // todayEvents: always the single selected day — used for "live" features only
  // (active session banner, next-event pill, calendarSlots day map)
  const todayEvents = useMemo(() =>
    calEvents
      .filter(e => e.start_time >= dayStart && e.start_time < dayStart + 86400)
      .sort((a, b) => a.start_time - b.start_time),
    [calEvents, dayStart]
  );

  // viewEvents: all calendar events inside the active view window
  const viewEvents = useMemo(() =>
    calEvents
      .filter(e => e.start_time >= rangeStart && e.start_time < rangeEnd)
      .sort((a, b) => a.start_time - b.start_time),
    [calEvents, rangeStart, rangeEnd]
  );

  const selectedRange = useMemo(() => {
    if (selectedBlock) {
      const start = selectedBlock._type === 'calendar' ? selectedBlock.start_time : selectedBlock.started_at;
      const end = selectedBlock._type === 'calendar'
        ? selectedBlock.end_time
        : (selectedBlock.ended_at || Math.floor(Date.now() / 1000));
      return { start, end };
    }
    // Default: the full active view window so charts always reflect the current period
    return { start: rangeStart, end: rangeEnd };
  }, [selectedBlock, rangeStart, rangeEnd]);

  const rangeSessions = useMemo(() =>
    sessions.filter(s => overlapSeconds(
      s.started_at,
      s.ended_at || (s.started_at + (s.duration_seconds || 0)),
      selectedRange.start,
      selectedRange.end
    ) > 0),
  [sessions, selectedRange]);

  const rangeAutoSessions = useMemo(() =>
    autoSessions.filter(a => !a.is_idle && overlapSeconds(
      a.started_at,
      a.ended_at || (a.started_at + (a.duration_seconds || 0)),
      selectedRange.start,
      selectedRange.end
    ) > 0),
  [autoSessions, selectedRange]);

  // currentEvent: an event that is actively happening RIGHT NOW
  const currentEvent = useMemo(() =>
    todayEvents.find(e => e.start_time <= nowTs && e.end_time > nowTs),
    [todayEvents, nowTs]
  );

  // nextEvent: the NEXT future event (start_time strictly in the future)
  const nextEvent = useMemo(() =>
    todayEvents.find(e => e.start_time > nowTs),
    [todayEvents, nowTs]
  );

  const calendarSummary = useMemo(() => {
    // Use viewEvents for totals/first/last so Week/Month show the full range.
    // "Scheduled" = events that haven't ended yet (upcoming + in-progress).
    // Past events that have already elapsed are NOT counted — they are either
    // already reflected as actual tracked sessions (if converted) or simply done.
    const evList = isMulti ? viewEvents : todayEvents;
    const upcoming = evList.filter(e => e.end_time > nowTs);
    const scheduledSeconds = upcoming.reduce((sum, e) =>
      sum + Math.max((e.end_time || 0) - Math.max(e.start_time || 0, nowTs), 0), 0);
    const current  = todayEvents.find(e => nowTs >= e.start_time && nowTs < e.end_time);
    const first    = upcoming[0] || null;
    const last     = upcoming[upcoming.length - 1] || null;
    return { scheduledSeconds, current, upcoming, first, last };
  }, [viewEvents, todayEvents, isMulti, nowTs]);

  // Next upcoming events across ALL cal events (used in the empty-day state)
  const upcomingEvents = useMemo(() => {
    const ts = Math.floor(Date.now() / 1000);
    return [...calEvents]
      .filter(e => e.end_time > ts)
      .sort((a, b) => a.start_time - b.start_time)
      .slice(0, 3);
  }, [calEvents]);

  // ── Colour helper for sessions (mirrors CalendarView's blockColor logic) ──────
  const sessionColor = useCallback((s) => {
    if (s.project_color) return s.project_color;
    const t = (s.session_type || '').toLowerCase();
    const c = (s.category    || '').toLowerCase();
    if (t === 'meeting'  || c.includes('meet'))  return '#F87171';
    if (s.is_deep_work   || c.includes('deep'))  return '#7c6cf2';
    if (t === 'break')                           return '#94A3B8';
    if (c.includes('focus') || c.includes('scheduled')) return '#818CF8';
    if (c.includes('admin') || c.includes('email'))     return '#FBBF24';
    return hashColor(s.category || s.title || 'work');
  }, []);

  // ── Schedule-section window: always TODAY → today + 7 days ──────────────────
  // This is independent of the calendar view's rangeStart/rangeEnd (which drive
  // the stats/charts).  The schedule list should:
  //   • Always start from the current day — never from a past weekday.
  //   • Show exactly 7 days ahead so the user sees what's coming up.
  //   • Exclude items that ended before midnight today (completed past days).
  //   • Keep items in progress right now even if they "started" in the past.
  const scheduleWindowStart = useMemo(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0);
    return Math.floor(d.getTime() / 1000);
  }, [nowTs]); // nowTs changes every tick — recalculate at midnight

  const scheduleWindowEnd = scheduleWindowStart + 7 * 86400; // today + 7 days

  const scheduleEvents = useMemo(() => {
    // Normalise a session into the same shape as a calendar event card so the
    // render loop can handle both uniformly.
    const normaliseSess = (s) => ({
      _itemType:    'session',
      id:           `sess-${s.id}`,
      title:        s.title || s.category || 'Scheduled Work',
      start_time:   s.started_at,
      end_time:     s.ended_at || (s.started_at + (s.duration_seconds || 3600)),
      color:        sessionColor(s),
      category:     s.category,
      session_type: s.session_type,
      is_deep_work: s.is_deep_work,
      project_name: s.project_name,
      meeting_url:  null,
    });

    // For Day view: use the selected day as the window (if it's today or future).
    // For Week/Month: always use the rolling 7-day window from today.
    const winStart = !isMulti
      ? Math.max(dayStart, scheduleWindowStart)   // selected day, but not before today
      : scheduleWindowStart;
    const winEnd = !isMulti
      ? winStart + 86400                           // just that one day
      : scheduleWindowEnd;

    // Include an item if:
    //   a) It starts within the window, OR
    //   b) It is currently in progress (started before now, ends after midnight today).
    const inWindow = (startTs, endTs) =>
      (startTs >= winStart && startTs < winEnd) ||          // starts in window
      (startTs < winStart && (endTs ?? nowTs) > winStart);  // in-progress at window start

    // Sessions
    const viewSessions = sessions
      .filter(s => {
        if (!s.started_at || (!s.ended_at && !s.duration_seconds)) return false;
        const endTs = s.ended_at || (s.started_at + (s.duration_seconds || 0));
        return inWindow(s.started_at, endTs);
      })
      .map(normaliseSess);

    // Calendar events
    const viewCalEvs = calEvents
      .filter(e => inWindow(e.start_time, e.end_time))
      .map(e => ({ ...e, _itemType: 'calendar' }));

    // Merge, sort chronologically.
    const all = [...viewCalEvs, ...viewSessions]
      .sort((a, b) => a.start_time - b.start_time);

    if (!isMulti) return all; // Day view — all items for that day

    if (viewMode === 'Month') {
      // Month view: one representative item per calendar day
      const byDay = [];
      const seenDays = new Set();
      for (const ev of all) {
        const d = new Date(ev.start_time * 1000); d.setHours(0, 0, 0, 0);
        const key = d.getTime();
        if (!seenDays.has(key)) { seenDays.add(key); byDay.push(ev); }
      }
      return byDay;
    }

    // Week view — all items across the 7-day window
    return all;
  }, [
    calEvents, sessions, isMulti, viewMode,
    dayStart, scheduleWindowStart, scheduleWindowEnd,
    nowTs, sessionColor,
  ]);

  const [noteOpen,         setNoteOpen]         = useState(false);
  const [noteText,         setNoteText]         = useState('');

  const calendarSlots = useMemo(() => {
    const slots = Array(24).fill(null);
    for (const e of todayEvents) {
      const sHour = new Date(e.start_time * 1000).getHours();
      const end = new Date(e.end_time * 1000);
      const eHour = Math.max(sHour, end.getHours() + (end.getMinutes() > 0 ? 1 : 0));
      for (let i = Math.max(0, sHour); i < Math.min(24, eHour); i++) slots[i] = e.color || '#60A5FA';
    }
    return slots;
  }, [todayEvents]);

  const projectPieData = useMemo(() => {
    if (!rangeSessions.length) return [];
    // Key by project_id for reliable deduplication; fall back to trimmed project_name.
    // This prevents the same project from appearing multiple times when sessions have
    // slightly different project_name values (case, whitespace, or pre-hydration rows).
    const tally   = {};  // key → { secs, count, name, pid }
    const seenIds = new Set();
    for (const s of rangeSessions) {
      // Skip duplicate session rows (can occur with optimistic + server rows)
      if (s.id != null) {
        if (seenIds.has(s.id)) continue;
        seenIds.add(s.id);
      }
      const pid  = s.project_id;
      const pname = (s.project_name || '').trim();
      const key  = pid ?? pname;   // prefer id; fall back to trimmed name
      if (!key) continue;
      const dur = overlapSeconds(
        s.started_at,
        s.ended_at || (s.started_at + (s.duration_seconds || 0)),
        selectedRange.start,
        selectedRange.end
      );
      if (!dur) continue;
      if (!tally[key]) tally[key] = { secs: 0, count: 0, name: pname, pid };
      tally[key].secs  += dur;
      tally[key].count += 1;
      // Prefer the most recently seen non-empty name in case early rows lacked it
      if (pname) tally[key].name = pname;
    }
    return Object.values(tally)
      .sort((a, b) => b.secs - a.secs)
      .slice(0, 7)
      .map((entry, i) => {
        const proj  = entry.pid ? projects.find(p => p.id === entry.pid) : null;
        const name  = proj?.name || entry.name || String(entry.pid || '');
        const color = proj?.color || PALETTE[i % PALETTE.length];
        return { name, value: entry.secs, count: entry.count, color };
      });
  }, [rangeSessions, selectedRange, projects]);

  const focusCategoryData = useMemo(() => {
    // Build a lowercase set of project names so we can exclude them from the
    // Focus tab — a category whose name equals a project name (e.g. "Development")
    // belongs in the Projects tab, not here.
    const projectNameSet = new Set(
      projects.map(p => (p.name || '').toLowerCase().trim())
    );
    const isProjectName = (label) =>
      label && projectNameSet.size > 0 && projectNameSet.has(label.toLowerCase().trim());

    const tally  = {};
    const counts = {};
    for (const row of rangeAutoSessions) {
      const key = row.ai_category || row.category || '';
      const secs = overlapSeconds(
        row.started_at,
        row.ended_at || (row.started_at + (row.duration_seconds || 0)),
        selectedRange.start,
        selectedRange.end
      );
      if (!key || !secs) continue;
      tally[key]  = (tally[key]  || 0) + secs;
      counts[key] = (counts[key] || 0) + 1;
    }
    const autoData = Object.entries(tally)
      .map(([raw, value]) => ({
        raw,
        name: formatLabel(displayCatName(raw) || raw),
        value,
        count: counts[raw] || 0,
        color: resolveCategoryColor(raw, categories),
      }))
      .filter(item => item.name && !isProjectName(item.name))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
    if (autoData.length > 0) return autoData;
    if (!summary?.byCategory) return [];
    return Object.entries(summary.byCategory)
      .map(([raw, secs]) => {
        const name = displayCatName(raw);
        if (!name) return null;
        const formatted = formatLabel(name);
        if (isProjectName(formatted)) return null;
        return { raw, name: formatted, value: secs, count: 0, color: resolveCategoryColor(raw, categories) };
      })
      .filter(Boolean)
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [rangeAutoSessions, selectedRange, summary, categories, projects]);

  const visibleAppUsage = useMemo(() => {
    const tally = {};
    for (const row of rangeAutoSessions) {
      const secs = overlapSeconds(
        row.started_at,
        row.ended_at || (row.started_at + (row.duration_seconds || 0)),
        selectedRange.start,
        selectedRange.end
      );
      if (!secs) continue;
      const label = getUsageLabel(row);
      tally[label] = (tally[label] || 0) + secs;
    }
    const selectedWindowApps = Object.entries(tally)
      .sort((a, b) => b[1] - a[1])
      .map(([app_name, total]) => ({ app_name, total }));
    // In multi-day views never fall back to the stale Day-view appUsage API result
    return selectedWindowApps.length > 0 ? selectedWindowApps : (isMulti ? [] : appUsage);
  }, [rangeAutoSessions, selectedRange, appUsage, isMulti]);

  const appTotal  = visibleAppUsage.reduce((s, a) => s + (a.total || 0), 0);

  const barSegments = [
    { label: 'Deep Work', value: deepWork,                       color: '#34D399' },
    // Day view: API focusSeconds may overlap deepWork — subtract to avoid double-count.
    // Multi-day: focus bucket is already exclusive (no deepWork inside it).
    { label: 'Focus',     value: isMulti ? focus : Math.max(focus - deepWork, 0), color: '#818CF8' },
    { label: 'Meetings',  value: meetings,                       color: '#F87171' },
    { label: 'Breaks',    value: breaks,                         color: '#FBBF24' },
    { label: 'Other',     value: other,                          color: '#374151' },
  ];

  const activePieData = tab === 'projects' ? projectPieData : focusCategoryData;

  // ── AI-derived insights — prefer AI pipeline data, fall back to local heuristics ──
  const insights = useMemo(() => {
    // Day view: use AI daily summary insights (most accurate)
    if (viewMode === 'Day' && aiDailySummary?.insights?.length > 0) {
      return aiDailySummary.insights.slice(0, 3);
    }

    // Week/Month: build week-level insights from AI data + local metrics
    if (!total) return [];
    const list = [];
    const meetPct    = total > 0 ? Math.round((meetings / total) * 100) : 0;
    const avgMins    = sessCount > 0 ? Math.round(total / sessCount / 60) : 0;
    const periodLabel = viewMode === 'Week' ? 'this week' : viewMode === 'Month' ? 'this month' : 'today';
    const targetLabel = viewMode === 'Week' ? `${targetHrs}h/day × 5` : viewMode === 'Month' ? `${targetHrs}h/day goal` : `${targetHrs}h target`;

    // Use AI focus trend for week/month narrative
    const trend = aiInsights?.focusTrend;
    if (trend && trend.trend !== 'insufficient_data') {
      if (trend.direction === 'up') {
        list.push({ type: 'positive', icon: '↑', text: trend.insight || `Focus improving — ${trend.weekAvg} avg score` });
      } else if (trend.direction === 'down' && trend.change < -8) {
        list.push({ type: 'warning', icon: '↓', text: trend.insight || `Focus declining vs last week` });
      } else if (trend.goodStreak >= 3) {
        list.push({ type: 'positive', icon: '🔥', text: `${trend.goodStreak}-day focus streak — excellent consistency` });
      }
    }

    // Use AI workflow objective for context
    const objective = aiInsights?.workflowObjective;
    if (objective?.isEstablishedWork && viewMode !== 'Day') {
      list.push({ type: 'info', icon: '✦', text: objective.insight || `Consistent work on ${objective.label}` });
    }

    // Local heuristic fallbacks
    if (deepPct >= 40 && !list.some(i => i.type === 'positive'))
      list.push({ type: 'positive', icon: '⚡', text: `Deep work at ${deepPct}% — exceptional focus ${periodLabel}` });
    else if (total > 7200 && deepPct < 20 && !list.some(i => i.icon === '⚡'))
      list.push({ type: 'tip', icon: '💡', text: 'Schedule 90-min deep work blocks before noon for better output' });
    if (meetPct > 55)
      list.push({ type: 'warning', icon: '⚠', text: `${meetPct}% in meetings — protect focus windows ${periodLabel}` });
    if (avgMins > 0 && avgMins < 22 && sessCount > 4)
      list.push({ type: 'warning', icon: '🔄', text: `${sessCount} short sessions detected — high context-switching` });
    if (targetPct >= 100)
      list.push({ type: 'positive', icon: '✅', text: `Goal achieved — ${targetPct}% of ${targetLabel}` });
    if (viewMode === 'Day' && displayFocusScore >= 80)
      list.push({ type: 'positive', icon: '🎯', text: `Focus score ${displayFocusScore} — outstanding session depth` });

    return list.slice(0, 3);
  }, [deepPct, total, meetings, sessCount, targetPct, displayFocusScore, targetHrs, viewMode,
      aiDailySummary, aiInsights]);

  // ── Burnout risk — prefer AI engine data over local heuristics ────────────────
  const burnoutRisk = useMemo(() => {
    // AI engine gives more accurate burnout assessment
    if (aiProductivity?.burnoutRisk?.level) return aiProductivity.burnoutRisk.level;
    if (!total) return null;
    const hrs = total / 3600;
    const mPct = total > 0 ? meetings / total : 0;
    // For week/month views, use per-day average rather than total
    const effectiveHrs = isMulti && targetMultiplier > 0 ? hrs / targetMultiplier : hrs;
    if (effectiveHrs > 10 || mPct > 0.7) return 'high';
    if (effectiveHrs > 8  || mPct > 0.5) return 'medium';
    return 'low';
  }, [total, meetings, aiProductivity, isMulti, targetMultiplier]);

  const selectedLens = useMemo(() => {
    if (!selectedBlock || !selectedBehavior) return null;
    const title = selectedBlock._type === 'calendar'
      ? selectedBlock.title
      : selectedBlock.title || selectedBlock.category || 'Selected session';
    const prompts = [];
    if (selectedBehavior.continuity >= 2) prompts.push('Strong continuity: this block stayed connected to adjacent work.');
    if (selectedBehavior.usage.switches >= 4) prompts.push('High tool-switching inside the block suggests heavier cognitive overhead.');
    if (selectedBehavior.usage.dominantApps[0]) prompts.push(`Primary workspace: ${selectedBehavior.usage.dominantApps[0].app}.`);
    if (selectedBehavior.gapAfter !== null && selectedBehavior.gapAfter > 20 * 60) prompts.push('The work trail cooled off after this session, so it may have been an endpoint.');
    return {
      title,
      prompts: prompts.slice(0, 3),
    };
  }, [selectedBlock, selectedBehavior]);

  return (
    <div className="fl-calendar-summary" style={{
      width: 284, minWidth: 284, maxWidth: 284, flexBasis: 284, flexShrink: 0, alignSelf: 'stretch', height: '100%', minHeight: 0,
      borderLeft: '1px solid rgba(255,255,255,0.052)',
      background: 'linear-gradient(170deg, rgba(11,13,21,0.97) 0%, rgba(8,10,17,0.99) 100%)',
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
      display: 'flex', flexDirection: 'column',
      overflowY: 'auto', overflowX: 'hidden',
    }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="fl-calendar-summary-header" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '11px 14px',
        borderBottom: '1px solid rgba(255,255,255,0.058)',
        flexShrink: 0, height: 52,
        background: 'linear-gradient(180deg, rgba(18,20,32,0.94) 0%, rgba(12,14,24,0.88) 100%)',
        backdropFilter: 'blur(12px) saturate(1.3)',
        WebkitBackdropFilter: 'blur(12px) saturate(1.3)',
        boxShadow: '0 1px 0 rgba(255,255,255,0.022), inset 0 1px 0 rgba(255,255,255,0.032)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: 'rgba(124,108,242,0.15)', border: '1px solid rgba(124,108,242,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <Calendar size={12} style={{ color: '#9D8FF5' }} />
          </div>
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--sp-text)', lineHeight: 1, letterSpacing: '-0.01em' }}>
              {viewMode === 'Week'
                ? 'This Week'
                : viewMode === 'Month'
                  ? new Date(selectedDate).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
                  : isToday ? 'Today' : new Date(selectedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </p>
            <p style={{ fontSize: 9, color: 'var(--sp-text-faint)', marginTop: 2, lineHeight: 1 }}>
              {viewMode === 'Week'
                ? (() => {
                    const s = new Date(selectedDate); s.setDate(s.getDate() - s.getDay());
                    const e = new Date(s); e.setDate(e.getDate() + 6);
                    return `${s.toLocaleDateString('en-US',{month:'short',day:'numeric'})} – ${e.toLocaleDateString('en-US',{month:'short',day:'numeric'})}`;
                  })()
                : viewMode === 'Month'
                  ? `${sessCount} session${sessCount !== 1 ? 's' : ''} tracked`
                  : isToday
                    ? new Date(selectedDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
                    : new Date(selectedDate).toLocaleDateString('en-US', { weekday: 'long' })}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          {isToday && viewMode === 'Day' && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '3px 8px', borderRadius: 99,
              background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.18)',
            }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#34D399', animation: 'pulse 2s infinite' }} />
              <span style={{ fontSize: 9, fontWeight: 700, color: '#34D399', letterSpacing: '0.04em' }}>Live</span>
            </div>
          )}
          {viewMode !== 'Day' && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '3px 8px', borderRadius: 99,
              background: 'rgba(124,108,242,0.08)', border: '1px solid rgba(124,108,242,0.25)',
            }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: '#9D8FF5', letterSpacing: '0.04em' }}>{viewMode}</span>
            </div>
          )}
          {streak > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '3px 8px', borderRadius: 99, background: 'rgba(251,146,60,0.08)', border: '1px solid rgba(251,146,60,0.2)' }}>
              <Flame size={9} style={{ color: '#FB923C' }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: '#FB923C' }}>{streak}d</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Work Hours Hero ─────────────────────────────────────────────────── */}
      {selectedLens && (
        <div className="fl-calendar-summary-section" style={{ padding: '10px 16px 12px', borderBottom: '1px solid var(--sp-border)' }}>
          <div style={{ ...SH_ROW }}>
            <SL icon={Target}>Behavior Lens</SL>
            <span style={{ fontSize: 9, color: selectedBehavior?.theme?.color || 'var(--sp-text-faint)', fontWeight: 700 }}>
              {selectedBehavior?.theme?.label || 'Focused Work'}
            </span>
          </div>
          <div className="fl-calendar-summary-banner" style={{ borderRadius: 12, padding: '10px 11px', background: 'linear-gradient(135deg, rgba(124,108,242,0.08), rgba(124,108,242,0.03))', border: '1px solid rgba(124,108,242,0.18)' }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--sp-text)', lineHeight: 1.25 }}>{selectedLens.title}</p>
            <p style={{ fontSize: 9, color: 'var(--sp-text-muted)', marginTop: 4, lineHeight: 1.45 }}>{selectedBehavior.narrative}</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 9 }}>
              <div>
                <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: SL_COLOR }}>Recovery</p>
                <p style={{ fontSize: 10, color: 'var(--sp-text-sec)', marginTop: 3 }}>{selectedBehavior.recovery}</p>
              </div>
              <div>
                <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: SL_COLOR }}>App Switching</p>
                <p style={{ fontSize: 10, color: 'var(--sp-text-sec)', marginTop: 3 }}>{selectedBehavior.usage.switches} shifts</p>
              </div>
            </div>
            {selectedBehavior.usage.dominantApps.length > 0 && (
              <div style={{ marginTop: 9, display: 'flex', flexDirection: 'column', gap: 5 }}>
                {selectedBehavior.usage.dominantApps.slice(0, 2).map(app => (
                  <div key={app.app} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontSize: 10, color: 'var(--sp-text-sec)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{app.app}</span>
                    <span style={{ fontSize: 9, color: 'var(--sp-text-muted)', fontVariantNumeric: 'tabular-nums' }}>{fmtHM(app.seconds)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          {selectedLens.prompts.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 8 }}>
              {selectedLens.prompts.map((prompt, idx) => (
                <div key={idx} className="fl-sp-prompt-item" style={{ display: 'flex', alignItems: 'flex-start', gap: 7, padding: '7px 9px', borderRadius: 9, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--sp-border)' }}>
                  <span style={{ fontSize: 10, color: selectedBehavior?.theme?.color || '#818CF8', lineHeight: 1.4 }}>•</span>
                  <span style={{ fontSize: 9, color: 'var(--sp-text-sec)', lineHeight: 1.45 }}>{prompt}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showActivity && <div className="fl-calendar-summary-section fl-calendar-summary-hero" style={{ padding: '14px 16px 12px', borderBottom: '1px solid var(--sp-border)' }}>
        {/* Score ring + hours side by side */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          {/* Focus score ring */}
          <div style={{ position: 'relative', width: 70, height: 70, flexShrink: 0 }}>
            {/*
             * Single SVG for track + score arc. The previous approach used a
             * separate absolute-positioned glow SVG with CSS filter:drop-shadow
             * and overflow:visible — the 22px CSS blur bled far outside the
             * 70×70 container through card borders. Replaced with one SVG and
             * an SVG-native <filter>; glow is rendered within the filter region
             * and clipped by the SVG viewport with no CSS overflow.
             *
             * Geometry: cx=cy=35, r=28, stroke=6 → outer arc edge at 31px
             * from center; SVG half = 35px → 4px buffer for glow spread.
             * stdDeviation=2 → effective spread ~5px; at 4px the intensity is
             * ~1% opacity — invisible before the viewport edge.
             */}
            <svg viewBox="0 0 70 70" style={{ width: 70, height: 70, transform: 'rotate(-90deg)' }}>
              <defs>
                {displayFocusScore > 0 && (
                  <filter id="sp-score-glow" x="-20%" y="-20%" width="140%" height="140%" colorInterpolationFilters="sRGB">
                    <feGaussianBlur in="SourceAlpha" stdDeviation="2" result="blur" />
                    <feFlood floodColor={scoreColor} floodOpacity="0.52" result="col" />
                    <feComposite in="col" in2="blur" operator="in" result="glow" />
                    <feMerge>
                      <feMergeNode in="glow" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                )}
              </defs>
              {/* Track ring */}
              <circle cx="35" cy="35" r="28" fill="none" stroke="var(--sp-track-empty)" strokeWidth="6" />
              {/* Score arc with contained native glow */}
              {displayFocusScore > 0 && (
                <circle cx="35" cy="35" r="28" fill="none" stroke={scoreColor} strokeWidth="6"
                  strokeDasharray={`${(displayFocusScore / 100) * 175.9} 175.9`}
                  strokeLinecap="round"
                  filter="url(#sp-score-glow)"
                  style={{ transition: 'stroke-dasharray 0.8s cubic-bezier(0.4,0,0.2,1)' }} />
              )}
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--sp-text)', lineHeight: 1, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.03em' }}>{displayFocusScore}</span>
              <span style={{ fontSize: 8, color: 'var(--sp-text-faint)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {isMulti ? 'Score' : 'Focus'}
              </span>
            </div>
          </div>

          {/* Right: hours */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: SL_COLOR, marginBottom: 4 }}>Work Hours</p>
            <p style={{ fontSize: 30, fontWeight: 800, color: 'var(--sp-text)', lineHeight: 1, letterSpacing: '-0.04em', fontVariantNumeric: 'tabular-nums' }}>
              {fmtHM(total)}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 7, flexWrap: 'wrap' }}>
              <span className="fl-calendar-summary-goal-pill" style={{ fontSize: 10, fontWeight: 700, color: targetPct >= 100 ? '#34D399' : '#818CF8', padding: '4px 8px', borderRadius: 999, background: targetPct >= 100 ? 'rgba(52,211,153,0.12)' : 'rgba(99,102,241,0.12)', border: `1px solid ${targetPct >= 100 ? 'rgba(52,211,153,0.24)' : 'rgba(99,102,241,0.18)'}` }}>
                {targetPct >= 100 ? '✓ Goal hit' : `${targetPct}%`}
              </span>
              <span style={{ fontSize: 9, color: 'var(--sp-text-faint)' }}>
                {targetPct >= 100 ? `+${targetPct - 100}% over target` : `of ${targetHrs}h target`}
              </span>
              {vsYesterday !== null && (
                <span style={{ fontSize: 9, fontWeight: 600, color: vsYesterday >= 0 ? '#34D399' : '#F87171', display: 'flex', alignItems: 'center', gap: 2 }}>
                  {vsYesterday >= 0 ? '↑' : '↓'}{Math.abs(vsYesterday)}% vs yesterday
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Stacked progress bar */}
        <div style={{ marginBottom: 2 }}>
          <div style={{ height: 7, background: 'var(--sp-track-empty)', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 99, transition: 'width 0.8s cubic-bezier(0.4,0,0.2,1)',
              width: `${Math.min(targetPct, 100)}%`,
              background: targetPct >= 100
                ? 'linear-gradient(90deg, #34D399, #10B981)'
                : 'linear-gradient(135deg, #6366F1, #9D8FF5)',
              boxShadow: `0 0 8px ${targetPct >= 100 ? 'rgba(52,211,153,0.5)' : 'rgba(99,102,241,0.45)'}`,
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#6366F1', flexShrink: 0 }} />
              <span style={{ fontSize: 8, color: 'var(--sp-text-faint)' }}>{scoreLabel(displayFocusScore)}</span>
            </div>
            <span style={{ fontSize: 8, color: 'var(--sp-text-faint)', fontVariantNumeric: 'tabular-nums' }}>{sessCount} session{sessCount !== 1 ? 's' : ''} · {fmtHM(deepWork)} deep</span>
          </div>
        </div>
      </div>}

      {/* ── Activity Timeline / Day chart ───────────────────────────────────── */}
      {showActivity && <div className="fl-calendar-summary-section" style={{ padding: '14px 16px 16px', borderBottom: '1px solid var(--sp-border)' }}>
        <div style={{ ...SH_ROW }}>
          <SL icon={BarChart2}>
            {isMulti ? (viewMode === 'Week' ? 'Week Activity' : 'Month Activity') : 'Activity'}
          </SL>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {isMulti && sessions.length > 0 && (
              <span style={{ fontSize: 8.5, fontWeight: 600, color: 'var(--sp-text-faint)', background: 'var(--sp-bg-cell)', border: '1px solid var(--sp-border)', borderRadius: 99, padding: '2px 7px', fontVariantNumeric: 'tabular-nums' }}>
                {sessions.length} sess
              </span>
            )}
            <span style={{ fontSize: 9, fontWeight: 700, color: '#9D8FF5', fontVariantNumeric: 'tabular-nums', background: 'rgba(124,108,242,0.15)', border: '1px solid rgba(124,108,242,0.25)', borderRadius: 99, padding: '2px 8px' }}>
              {fmtHM(total)}
            </span>
          </div>
        </div>
        {isMulti ? (
          <WeekDayChart
            sessions={sessions}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            viewMode={viewMode}
            selectedDate={selectedDate}
          />
        ) : (
          <MiniTimeline sessions={sessions} calEvents={calEvents} autoSessions={autoSessions} />
        )}
      </div>}

      {/* ── Active Session Banner ───────────────────────────────────────────── */}
      {showActivity && activeSession && isToday && (
        <div className="fl-calendar-summary-banner fl-calendar-summary-banner-active" style={{ margin: '8px 14px 0', borderRadius: 11, padding: '9px 12px', background: 'linear-gradient(135deg, rgba(52,211,153,0.09), rgba(52,211,153,0.04))', border: '1px solid rgba(52,211,153,0.2)', flexShrink: 0, boxShadow: '0 0 16px rgba(52,211,153,0.06) inset' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#34D399', flexShrink: 0, animation: 'pulse 2s infinite' }} />
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--sp-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1 }}>
                  {activeSession.title || activeSession.category}
                </p>
                <p style={{ fontSize: 8, color: 'var(--sp-text-faint)', marginTop: 2, lineHeight: 1 }}>In progress</p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#34D399', fontVariantNumeric: 'tabular-nums' }}>{fmtHM(liveElapsed)}</span>
              <button className="fl-calendar-summary-action-btn" onClick={onStopSession}
                style={{ fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: 'rgba(248,113,113,0.12)', color: '#F87171', border: '1px solid rgba(248,113,113,0.2)', cursor: 'pointer', letterSpacing: '0.02em' }}>
                Stop
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Current / Next Event pill ───────────────────────────────────────── */}
      {isToday && (currentEvent || nextEvent) && !activeSession && (() => {
        const ev        = currentEvent || nextEvent;
        const isNow     = !!currentEvent;
        const col       = ev.color || '#60A5FA';
        const timeLabel = isNow
          ? `Ends ${new Date(ev.end_time * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
          : new Date(ev.start_time * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return (
          <div className="fl-calendar-summary-banner fl-calendar-summary-banner-next"
            style={{
              margin: '8px 14px 0', borderRadius: 8, padding: '8px 10px', flexShrink: 0,
              background: isNow ? `${col}18` : `${col}0C`,
              border: `1px solid ${col}${isNow ? '38' : '20'}`,
              boxShadow: isNow ? `0 0 14px ${col}18` : 'none',
            }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              {/* Animated bar for live; static bar for next */}
              <div style={{
                width: 3, alignSelf: 'stretch', borderRadius: 99, flexShrink: 0,
                background: col,
                boxShadow: isNow ? `0 0 6px ${col}80` : 'none',
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 9, color: isNow ? col : 'var(--sp-text-faint)', fontWeight: 700, marginBottom: 2, letterSpacing: '0.03em' }}>
                  {isNow ? '● Now' : 'Next up'}
                </p>
                <p style={{ fontSize: 10, fontWeight: 700, color: col, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {ev.title}
                </p>
              </div>
              <span style={{ fontSize: 9, color: 'var(--sp-text-muted)', flexShrink: 0, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                {timeLabel}
              </span>
            </div>
          </div>
        );
      })()}

      {/* ── Tabs ──────────────────────────────────────────────────────────────── */}
      {!showActivity && (
        <div className="fl-calendar-summary-section" style={{ padding: '12px 16px 10px', borderBottom: '1px solid var(--sp-border)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
            <MetricCell
              label="Events"
              value={todayEvents.length}
              sub={calendarSummary.current ? 'one happening now' : `${calendarSummary.upcoming.length} upcoming`}
              accent={todayEvents.length > 0 ? '#60A5FA' : null}
            />
            <MetricCell
              label="Scheduled"
              value={fmtHM(calendarSummary.scheduledSeconds)}
              sub={calendarSummary.first && calendarSummary.last
                ? `${new Date(calendarSummary.first.start_time * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} to ${new Date(calendarSummary.last.end_time * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                : 'nothing planned'}
              accent={calendarSummary.scheduledSeconds > 0 ? '#818CF8' : null}
            />
          </div>
          <div>
            <div style={{ ...SH_ROW }}>
              <SL icon={Clock}>Day Map</SL>
              <span style={{ fontSize: 9, color: 'var(--sp-text-faint)', fontVariantNumeric: 'tabular-nums' }}>12a-12a</span>
            </div>
            <div style={{ display: 'flex', gap: 1, height: 8, overflow: 'hidden', borderRadius: 4, background: 'var(--sp-track-empty)' }}>
              {calendarSlots.map((color, i) => (
                <div key={i} style={{ flex: 1, background: color ? `${color}B8` : 'transparent' }} />
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
              {['12a','6a','12p','6p','12a'].map(label => (
                <span key={label} style={{ fontSize: 8, color: 'var(--sp-text-faint)', fontVariantNumeric: 'tabular-nums' }}>{label}</span>
              ))}
            </div>
          </div>
        </div>
      )}

      {showActivity && <div className="fl-calendar-summary-tabs" style={{ padding: '10px 14px 0', flexShrink: 0, borderBottom: '1px solid var(--sp-border)' }}>
        <div className="fl-sp-tab-group" style={{ display: 'flex', gap: 2, background: 'var(--sp-bg-cell)', borderRadius: 10, padding: 3, border: '1px solid var(--sp-border)', marginBottom: 10 }}>
          {[
            { id: 'projects', label: 'Projects' },
            { id: 'focus',    label: 'Focus'    },
            { id: 'apps',     label: 'Apps'     },
            { id: 'ai',       label: '✦ AI'     },
          ].map(t => (
            <button className="fl-calendar-summary-tab" key={t.id} onClick={() => { setTab(t.id); setHoveredPieIdx(null); }}
              style={{
                flex: 1, padding: '5px 4px', borderRadius: 7,
                fontSize: 10, fontWeight: tab === t.id ? 700 : 600, cursor: 'pointer',
                background: tab === t.id
                  ? t.id === 'ai'
                    ? 'linear-gradient(135deg, rgba(52,211,153,0.22), rgba(99,102,241,0.12))'
                    : 'linear-gradient(135deg, rgba(124,108,242,0.22), rgba(124,108,242,0.12))'
                  : 'transparent',
                color: tab === t.id
                  ? t.id === 'ai' ? '#34D399' : '#C4B5FD'
                  : 'var(--sp-text-muted)',
                border: tab === t.id
                  ? t.id === 'ai' ? '1px solid rgba(52,211,153,0.30)' : '1px solid rgba(124,108,242,0.30)'
                  : '1px solid transparent',
                boxShadow: tab === t.id
                  ? t.id === 'ai' ? '0 1px 6px rgba(52,211,153,0.18)' : '0 1px 6px rgba(124,108,242,0.18)'
                  : 'none',
                transition: 'all 0.18s cubic-bezier(0.4,0,0.2,1)',
                letterSpacing: '0.01em',
              }}
              onMouseOver={e => { if (tab !== t.id) { e.currentTarget.style.color = 'var(--sp-text-sec)'; e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; } }}
              onMouseOut={e  => { if (tab !== t.id) { e.currentTarget.style.color = 'var(--sp-text-muted)'; e.currentTarget.style.background = 'transparent'; } }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>}

      {/* ── Tab Content ───────────────────────────────────────────────────────── */}
      {showActivity && <div className="fl-calendar-summary-section" style={{ padding: '12px 14px 14px', borderBottom: '1px solid var(--sp-border)' }}>
        {(tab === 'projects' || tab === 'focus') && activePieData.length > 0 ? (() => {
          const pieTotal   = activePieData.reduce((s, d) => s + d.value, 0);
          const hovItem    = hoveredPieIdx != null ? activePieData[hoveredPieIdx] : null;
          const visibleRows = activePieData.slice(0, 5);
          return (
            <div style={{ position: 'relative' }}>
              {/* Chart + legend row */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <DonutChart
                  data={activePieData} size={76} stroke={8}
                  hoveredIdx={hoveredPieIdx}
                  onHover={setHoveredPieIdx}
                />
                <div style={{ flex: 1, minWidth: 0, paddingTop: 2, display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {visibleRows.map((d, idx) => {
                    const isHov = hoveredPieIdx === idx;
                    const isDim = hoveredPieIdx != null && !isHov;
                    const pct   = pieTotal > 0 ? Math.round((d.value / pieTotal) * 100) : 0;
                    return (
                      <div
                        key={`${tab}-${idx}-${d.name}`}
                        onMouseEnter={() => setHoveredPieIdx(idx)}
                        onMouseLeave={() => setHoveredPieIdx(null)}
                        style={{
                          display: 'flex', alignItems: 'center',
                          justifyContent: 'space-between', gap: 6,
                          borderRadius: 8,
                          padding: '4px 7px 4px 5px',
                          marginLeft: -5, marginRight: -7,
                          background: isHov ? `${d.color}14` : 'transparent',
                          border: isHov ? `1px solid ${d.color}20` : '1px solid transparent',
                          opacity: isDim ? 0.35 : 1,
                          cursor: 'default',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                          <span style={{
                            width: 8, height: 8,
                            borderRadius: 3,
                            background: d.color, flexShrink: 0,
                            boxShadow: isHov ? `0 0 6px ${d.color}70` : 'none',
                            transition: 'box-shadow 0.15s ease',
                          }} />
                          <span style={{
                            fontSize: 10,
                            color: isHov ? 'var(--sp-text)' : 'var(--sp-text-sec)',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            fontWeight: isHov ? 700 : 500,
                            transition: 'color 0.12s ease',
                          }}>
                            {d.name}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                          <span style={{
                            fontSize: 8.5, fontWeight: 600, color: isHov ? d.color : 'var(--sp-text-faint)',
                            background: isHov ? `${d.color}16` : 'var(--sp-bg-cell)',
                            border: `1px solid ${isHov ? d.color + '30' : 'var(--sp-border)'}`,
                            borderRadius: 99, padding: '1px 5px',
                            fontVariantNumeric: 'tabular-nums',
                            transition: 'all 0.12s ease',
                          }}>{pct}%</span>
                          <span style={{
                            fontSize: 9.5, fontWeight: 700,
                            color: isHov ? d.color : 'var(--sp-text-muted)',
                            fontVariantNumeric: 'tabular-nums',
                            transition: 'color 0.12s ease',
                          }}>
                            {fmtHM(d.value)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Tooltip card */}
              <DonutSegTooltip
                item={hovItem}
                total={pieTotal}
                visible={hovItem != null}
              />
            </div>
          );
        })() : tab === 'apps' ? (
          visibleAppUsage.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {visibleAppUsage.slice(0, 6).map((app, idx) => {
                const pct = appTotal > 0 ? Math.round((app.total / appTotal) * 100) : 0;
                const appColor = PALETTE[idx % PALETTE.length];
                return (
                  <div key={app.app_name}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
                        <span style={{ width: 6, height: 6, borderRadius: 2, background: appColor, flexShrink: 0 }} />
                        <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--sp-text-sec)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{app.app_name}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        <span style={{ fontSize: 8.5, color: 'var(--sp-text-faint)', fontVariantNumeric: 'tabular-nums' }}>{fmtHM(app.total)}</span>
                        <span style={{ fontSize: 8.5, fontWeight: 700, color: appColor, background: `${appColor}16`, border: `1px solid ${appColor}30`, borderRadius: 99, padding: '1px 6px', fontVariantNumeric: 'tabular-nums' }}>{pct}%</span>
                      </div>
                    </div>
                    <div style={{ height: 5, background: 'var(--sp-track-empty)', borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{
                        width: `${pct}%`, height: '100%', borderRadius: 99,
                        background: `linear-gradient(90deg, ${appColor}CC, ${appColor}88)`,
                        boxShadow: `0 0 6px ${appColor}50`,
                        transition: 'width 0.65s cubic-bezier(0.4,0,0.2,1)',
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ padding: '16px 0', textAlign: 'center' }}>
              <Monitor size={20} style={{ margin: '0 auto 8px', opacity: 0.15, color: '#6B7280', display: 'block' }} />
              <p style={{ fontSize: 10, color: 'var(--sp-text-faint)', fontStyle: 'italic' }}>No app or website activity</p>
            </div>
          )
        ) : (
          <div style={{ padding: '16px 0', textAlign: 'center' }}>
            <Briefcase size={20} style={{ margin: '0 auto 8px', opacity: 0.15, color: '#6B7280', display: 'block' }} />
            <p style={{ fontSize: 10, color: 'var(--sp-text-faint)' }}>{tab === 'projects' ? 'No projects in this time range' : 'No categories in this time range'}</p>
          </div>
        )}

        {/* ── AI Intelligence Tab ──────────────────────────────────────────── */}
        {tab === 'ai' && (
          <AIInsightsPanel
            aiInsights={aiInsights}
            aiProductivity={aiProductivity}
            aiConflictReport={aiConflictReport}
            aiAdherence={aiAdherence}
            aiFocusForecast={aiFocusForecast}
            aiIsLoading={aiIsLoading}
            aiLiveSuggestions={aiLiveSuggestions}
            aiDailySummary={aiDailySummary}
            aiSelectedRecap={aiSelectedRecap}
            aiCommandInput={aiCommandInput}
            aiCommandPreview={aiCommandPreview}
            aiCommandResult={aiCommandResult}
            aiCommandLoading={aiCommandLoading}
            onPreviewCommand={onAIPreviewCommand}
            onProcessCommand={onAIProcessCommand}
            onClearCommand={onAIClearCommand}
            aiBehavioral={aiBehavioral}
            aiFlowState={aiFlowState}
            aiBurnoutRisk={aiBurnoutRisk}
            aiBurnoutFatigue={aiBurnoutFatigue}
            aiPeakWindow={aiPeakWindow}
            aiProductivityTrend={aiProductivityTrend}
            aiFragmentation={aiFragmentation}
            aiMaturityLevel={aiMaturityLevel}
            aiRecommendations={aiRecommendations}
            aiForecast={aiForecast}
            aiPredictive={aiPredictive}
          />
        )}
      </div>}

      {/* ── Productivity Metrics bar ────────────────────────── */}
      {showActivity && total > 0 && (
        <div className="fl-calendar-summary-section" style={{ padding: '14px 14px 16px', borderBottom: '1px solid var(--sp-border)' }}>
          <div style={{ ...SH_ROW, marginBottom: 10 }}>
            <SL icon={TrendingUp}>Productivity Mix</SL>
            <span style={{ fontSize: 8.5, fontWeight: 700, color: '#9D8FF5', fontVariantNumeric: 'tabular-nums', background: 'rgba(124,108,242,0.15)', border: '1px solid rgba(124,108,242,0.25)', borderRadius: 99, padding: '2px 8px' }}>{fmtHM(total)}</span>
          </div>
          {/* Stacked bar — rounded pill, gradient fills */}
          <div style={{ height: 18, borderRadius: 99, overflow: 'hidden', display: 'flex', gap: 2, marginBottom: 14, background: 'var(--sp-track-empty)', padding: 2, boxSizing: 'border-box' }}>
            {barSegments.filter(s => s.value > 0).map((s, i, arr) => {
              const gradients = {
                'Deep Work': 'linear-gradient(90deg, #34D399, #10B981)',
                'Focus':     'linear-gradient(135deg, #9D8FF5, #818CF8)',
                'Meetings':  'linear-gradient(90deg, #F87171, #EF4444)',
                'Breaks':    'linear-gradient(90deg, #FBBF24, #F59E0B)',
                'Other':     'linear-gradient(90deg, #4B5563, #374151)',
              };
              const isFirst = i === 0;
              const isLast  = i === arr.length - 1;
              return (
                <div key={s.label} style={{
                  width: `${(s.value / total) * 100}%`, height: '100%',
                  background: gradients[s.label] || s.color,
                  minWidth: 4,
                  borderRadius: isFirst ? '99px 4px 4px 99px' : isLast ? '4px 99px 99px 4px' : 4,
                  boxShadow: `0 0 8px ${s.color}60`,
                  transition: 'width 0.5s cubic-bezier(0.4,0,0.2,1)',
                }} />
              );
            })}
          </div>
          {/* Legend grid */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {barSegments.filter(s => s.value > 0).map(s => {
              const pct = Math.round((s.value / total) * 100);
              return (
                <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 3, background: s.color, flexShrink: 0, boxShadow: `0 0 5px ${s.color}60` }} />
                  <span style={{ fontSize: 10.5, fontWeight: 500, color: 'var(--sp-text-sec)', flex: 1, minWidth: 0 }}>{s.label}</span>
                  <span style={{ fontSize: 9, color: 'var(--sp-text-faint)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{fmtHM(s.value)}</span>
                  <span style={{ fontSize: 9, fontWeight: 700, color: s.color, background: `${s.color}15`, border: `1px solid ${s.color}28`, borderRadius: 99, padding: '1.5px 7px', fontVariantNumeric: 'tabular-nums', flexShrink: 0, minWidth: 34, textAlign: 'center' }}>{pct}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Metrics 2×2 grid ────────────────────────────────────────────────── */}
      {showActivity && total > 0 && (
        <div className="fl-calendar-summary-section" style={{ padding: '14px 14px 16px', borderBottom: '1px solid var(--sp-border)', flexShrink: 0 }}>
          <div style={{ ...SH_ROW }}>
            <SL icon={Clock}>Key Metrics</SL>
            <span style={{ fontSize: 8.5, fontWeight: 600, color: 'var(--sp-text-faint)', background: 'var(--sp-bg-cell)', border: '1px solid var(--sp-border)', borderRadius: 99, padding: '2px 7px' }}>
              {viewMode === 'Week' ? 'This week' : viewMode === 'Month' ? 'This month' : 'Today'}
            </span>
          </div>
          <div className="fl-calendar-metrics-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {(() => {
              const avgDaySecs = isMulti && targetMultiplier > 0 ? Math.round(total / targetMultiplier) : 0;
              const avgSessionMins = sessCount > 0 ? Math.round(total / sessCount / 60) : 0;
              const periodWord = viewMode === 'Week' ? 'week' : viewMode === 'Month' ? 'month' : 'today';
              const deepOnlyPct = total > 0 ? Math.round((deepWork / total) * 100) : 0;
              // "Focus" here is purely non-deep/non-meeting/non-break sessions
              const pureFocusPct = total > 0 ? Math.round((focus / total) * 100) : 0;

              return [
                {
                  label: isMulti ? 'Deep Work' : 'Focus Time',
                  value: isMulti ? `${deepOnlyPct}%` : `${focusPct}%`,
                  sub: isMulti
                    ? (deepWork > 0 ? `${fmtHM(deepWork)} · ${fmtHM(Math.round(deepWork / targetMultiplier))}/day` : 'none this ' + periodWord)
                    : fmtHM(focus),
                  accent: isMulti ? (deepOnlyPct > 30 ? '#34D399' : null) : (focusPct > 50 ? '#818CF8' : null),
                },
                {
                  label: isMulti ? 'Focus' : 'Deep Work',
                  value: isMulti ? `${pureFocusPct}%` : `${deepPct}%`,
                  sub: isMulti
                    ? (focus > 0 ? fmtHM(focus) : '—')
                    : (fmtHM(deepWork) || '—'),
                  accent: isMulti ? (pureFocusPct > 30 ? '#818CF8' : null) : (deepPct > 40 ? '#34D399' : null),
                },
                {
                  label: 'Sessions',
                  value: sessCount,
                  sub: isMulti && targetMultiplier > 0
                    ? `${Math.round(sessCount / targetMultiplier * 10) / 10}/day · ${avgSessionMins > 0 ? avgSessionMins + 'm avg' : '—'}`
                    : (avgSessionMins > 0 ? `${avgSessionMins}m avg` : '—'),
                  accent: null,
                },
                {
                  label: 'Meetings',
                  value: meetings > 0 ? fmtHM(meetings) : '0m',
                  sub: meetings > 0
                    ? `${Math.round(meetings / total * 100)}% of ${periodWord}${isMulti ? ` · ${fmtHM(Math.round(meetings / targetMultiplier))}/day` : ''}`
                    : `none this ${periodWord}`,
                  accent: meetings > 0 && (meetings / total) > 0.4 ? '#F87171' : null,
                },
              ];
            })().map((m, i) => (
              <div className="fl-calendar-metric-card" key={i} style={{
                padding: '11px 12px 12px',
                border: `1px solid ${m.accent ? m.accent + '28' : 'var(--sp-border)'}`,
                borderRadius: 14,
                background: m.accent
                  ? `linear-gradient(145deg, ${m.accent}0D, var(--sp-bg-cell))`
                  : 'var(--sp-bg-cell)',
                boxShadow: m.accent ? `0 0 18px ${m.accent}10` : 'none',
                position: 'relative',
                overflow: 'hidden',
                transition: 'border-color 0.2s',
              }}>
                {/* Accent top stripe */}
                {m.accent && (
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${m.accent}90, ${m.accent}20)`, borderRadius: '14px 14px 0 0' }} />
                )}
                <p style={{ fontSize: 8.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.11em', color: m.accent || SL_COLOR, marginBottom: 5, marginTop: m.accent ? 4 : 0 }}>{m.label}</p>
                <p style={{ fontSize: 20, fontWeight: 800, color: m.accent || 'var(--sp-text)', lineHeight: 1, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.03em' }}>{m.value}</p>
                <p style={{ fontSize: 9.5, color: 'var(--sp-text-faint)', marginTop: 5, lineHeight: 1.4 }}>{m.sub}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Calendar Events ──────────────────────────────────────────────────── */}
      <div className="fl-calendar-summary-section" style={{ padding: '14px 16px 18px' }}>
        <div style={{ ...SH_ROW, marginTop: showActivity && total > 0 ? 0 : 4 }}>
          <SL icon={Calendar}>
            {!isMulti ? 'Today\'s Schedule' : 'Next 7 Days'}
          </SL>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {scheduleEvents.length > 0 && (
              <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--sp-text-faint)', fontVariantNumeric: 'tabular-nums' }}>
                {scheduleEvents.length} item{scheduleEvents.length !== 1 ? 's' : ''}
              </span>
            )}
            {sources.length > 0 && (
              <button className="fl-calendar-summary-icon-btn" onClick={onSync} disabled={syncing}
                style={{ width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--sp-text-faint)', opacity: syncing ? 0.4 : 1 }}>
                <RefreshCw size={9} style={syncing ? { animation: 'spin 1s linear infinite' } : {}} />
              </button>
            )}
            <button className="fl-calendar-summary-icon-btn" onClick={onAddSource}
              style={{ width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--sp-text-faint)' }}
              onMouseOver={e => e.currentTarget.style.color = '#7c6cf2'}
              onMouseOut={e  => e.currentTarget.style.color = 'var(--sp-text-faint)'}>
              <Plus size={9} />
            </button>
          </div>
        </div>

        {/* Connected calendar sources — shown always when sources exist */}
        {sources.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 10 }}>
            {sources.map(src => {
              const isGoogle = src.provider === 'google';
              const c = src.color || (isGoogle ? '#4285f4' : '#6366f1');
              const displayName = isGoogle && src.account_email ? src.account_email : src.label;
              const lastSync = (() => {
                if (!src.last_synced) return null;
                const d = new Date(src.last_synced * 1000);
                const isToday = d.toDateString() === new Date().toDateString();
                return isToday
                  ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              })();
              return (
                <div key={src.id} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 10px', borderRadius: 9, background: `${c}08`, border: `1px solid ${c}18` }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: c, flexShrink: 0, boxShadow: `0 0 5px ${c}80` }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 10.5, fontWeight: 600, color: '#DADAE8', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName}</p>
                    <p style={{ fontSize: 9, color: '#4B5263', margin: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
                      {isGoogle ? (
                        <span style={{ fontSize: 8.5, background: 'rgba(66,133,244,0.14)', color: '#60a5fa', border: '1px solid rgba(66,133,244,0.25)', borderRadius: 3, padding: '1px 4px', fontWeight: 700 }}>OAuth</span>
                      ) : (
                        <span style={{ fontSize: 8.5, background: 'rgba(99,102,241,0.10)', color: '#818CF8', border: '1px solid rgba(99,102,241,0.20)', borderRadius: 3, padding: '1px 4px', fontWeight: 700 }}>iCal</span>
                      )}
                      {lastSync && <span>Synced {lastSync}</span>}
                    </p>
                  </div>
                  <button onClick={() => onRemoveSource?.(src.id)} title="Disconnect"
                    style={{ width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4, background: 'transparent', border: 'none', cursor: 'pointer', color: '#3A404F', flexShrink: 0 }}
                    onMouseOver={e => e.currentTarget.style.color = '#F87171'}
                    onMouseOut={e  => e.currentTarget.style.color = '#3A404F'}>
                    <X size={10} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* "Connect calendar" CTA — only when no sources AND no manually scheduled sessions */}
        {sources.length === 0 && scheduleEvents.length === 0 && (
          <button className="fl-calendar-summary-empty-btn" onClick={onAddSource}
            style={{ width: '100%', padding: '9px 0', fontSize: 10, color: 'var(--sp-text-faint)', background: 'transparent', border: '1px dashed var(--sp-border-dash)', borderRadius: 8, cursor: 'pointer', transition: 'all 0.15s', fontWeight: 500, marginBottom: 8 }}
            onMouseOver={e => { e.currentTarget.style.color = '#7c6cf2'; e.currentTarget.style.borderColor = 'rgba(124,108,242,0.44)'; }}
            onMouseOut={e  => { e.currentTarget.style.color = 'var(--sp-text-faint)'; e.currentTarget.style.borderColor = 'var(--sp-border-dash)'; }}>
            + Connect Google / Outlook
          </button>
        )}
        {scheduleEvents.length === 0 ? (
          /* ── No events in the current view range → show next upcoming ── */
          upcomingEvents.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px 0 8px' }}>
              <Calendar size={22} style={{ margin: '0 auto 8px', opacity: 0.15, color: '#6B7280' }} />
              <p style={{ fontSize: 10, color: 'var(--sp-text-faint)', fontStyle: 'italic' }}>Nothing scheduled</p>
            </div>
          ) : (
            <div>
              <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.10em', color: SL_COLOR, marginBottom: 9 }}>
                Upcoming
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {upcomingEvents.map(ev => {
                  const col    = ev.color || '#60A5FA';
                  const isNow  = nowTs >= ev.start_time && nowTs < ev.end_time;
                  const evDate = new Date(ev.start_time * 1000);
                  const todayD = new Date(); todayD.setHours(0,0,0,0);
                  const tomD   = new Date(todayD); tomD.setDate(todayD.getDate() + 1);
                  const evDay  = new Date(evDate); evDay.setHours(0,0,0,0);
                  const dateLabel = evDay.getTime() === todayD.getTime() ? 'Today'
                    : evDay.getTime() === tomD.getTime() ? 'Tomorrow'
                    : evDate.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
                  const timeLabel = evDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                  const dur = Math.round((ev.end_time - ev.start_time) / 60);
                  return (
                    <div key={ev.id} style={{
                      display: 'flex', alignItems: 'stretch', borderRadius: 9, overflow: 'hidden',
                      background: isNow ? `${col}14` : `${col}0C`,
                      border: `1px solid ${col}${isNow ? '35' : '20'}`,
                      boxShadow: isNow ? `0 0 16px ${col}22` : `0 4px 12px ${col}0A`,
                      transition: 'all 0.2s',
                    }}>
                      <div style={{ width: isNow ? 4 : 3, background: isNow ? col : `${col}80`, flexShrink: 0, boxShadow: isNow ? `0 0 10px ${col}60` : 'none' }} />
                      <div style={{ padding: '10px 11px', flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 11, fontWeight: isNow ? 700 : 600, color: isNow ? '#EAF2FF' : 'var(--sp-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.2, margin: 0, marginBottom: 4 }}>
                              {ev.title}
                            </p>
                            <p style={{ fontSize: 9, color: 'var(--sp-text-muted)', display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', margin: 0 }}>
                              <span style={{ color: col, fontWeight: 700 }}>{dateLabel}</span>
                              <span style={{ opacity: 0.4 }}>·</span>
                              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{timeLabel}</span>
                              {dur > 0 && <><span style={{ opacity: 0.4 }}>·</span><span>{dur < 60 ? `${dur}m` : `${Math.floor(dur/60)}h${dur%60>0?` ${dur%60}m`:''}`}</span></>}
                            </p>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5, flexShrink: 0 }}>
                            <Countdown targetTs={ev.start_time} isNow={isNow} />
                            {(ev.meeting_url || isNow) && (
                              <button
                                onClick={() => ev.meeting_url && window.open(ev.meeting_url, '_blank')}
                                title={ev.meeting_url ? 'Join meeting' : 'In progress'}
                                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 7px', borderRadius: 6,
                                  background: isNow ? `${col}25` : `${col}18`,
                                  border: `1px solid ${col}35`,
                                  color: col, fontSize: 9, fontWeight: 700, cursor: ev.meeting_url ? 'pointer' : 'default',
                                  transition: 'all 0.15s' }}
                                onMouseOver={e => { if (ev.meeting_url) e.currentTarget.style.background = `${col}35`; }}
                                onMouseOut={e  => { if (ev.meeting_url) e.currentTarget.style.background = isNow ? `${col}25` : `${col}18`; }}>
                                {isNow ? <Video size={8} /> : <ExternalLink size={8} />}
                                {isNow ? 'Join' : 'Open'}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )
        ) : (
          /* ── Events in the active view range ── */
          <div className="fl-calendar-summary-schedule-list" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(() => {
              // In multi-day views always show all items (window is already capped at 7 days).
              // In Day view cap at 6 so the panel doesn't overflow.
              const evs = scheduleEvents.slice(0, isMulti ? 50 : 6);
              const items = [];
              let lastDayKey = null;
              const todayMid = new Date(); todayMid.setHours(0,0,0,0);
              const tomMid   = new Date(todayMid); tomMid.setDate(todayMid.getDate() + 1);

              for (const ev of evs) {
                // Always show day separators (even in Day view for clarity)
                {
                  const evMid = new Date(ev.start_time * 1000); evMid.setHours(0,0,0,0);
                  const dKey  = evMid.getTime();
                  if (dKey !== lastDayKey) {
                    lastDayKey = dKey;
                    const dayStr = dKey === todayMid.getTime() ? 'Today'
                      : dKey === tomMid.getTime() ? 'Tomorrow'
                      : evMid.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
                    const isToday = dKey === todayMid.getTime();
                    items.push(
                      <div key={`sep-${dKey}`} style={{
                        display: 'flex', alignItems: 'center', gap: 7,
                        marginTop: items.length > 0 ? 14 : 2, marginBottom: 5,
                      }}>
                        <p style={{
                          fontSize: 9.5, fontWeight: 700, color: isToday ? '#9D8FF5' : SL_COLOR,
                          textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0,
                          flexShrink: 0,
                        }}>{dayStr}</p>
                        {isToday && (
                          <span style={{
                            fontSize: 7.5, fontWeight: 700, color: '#9b8ff8',
                            background: 'rgba(124,108,242,0.14)', border: '1px solid rgba(124,108,242,0.28)',
                            borderRadius: 4, padding: '1px 5px', letterSpacing: '0.04em',
                          }}>NOW</span>
                        )}
                        <div style={{ flex: 1, height: 1, background: 'var(--sp-border)', opacity: 0.5 }} />
                      </div>
                    );
                  }
                }

                const isNow       = nowTs >= ev.start_time && nowTs < ev.end_time;
                const isPast      = nowTs >= ev.end_time;
                const isSess      = ev._itemType === 'session';
                const isUpcoming  = !isPast && ev.start_time > nowTs;
                const col         = ev.color || (isSess ? '#818CF8' : '#60A5FA');
                const dur         = Math.round((ev.end_time - ev.start_time) / 60);

                // Session-specific sub-label (category or project)
                const sessSubLabel = isSess
                  ? (ev.project_name || ev.category || 'Focus Session')
                  : null;

                // Badge text for session cards
                const sessBadge = isSess
                  ? (ev.is_deep_work ? 'Deep Work'
                    : ev.session_type === 'meeting' ? 'Meeting'
                    : ev.session_type === 'break'   ? 'Break'
                    : isPast ? 'Completed' : isNow ? 'In Progress' : 'Scheduled')
                  : null;

                items.push(
                <div
                  className="fl-calendar-summary-event-card"
                  key={ev.id}
                  style={{
                    display: 'flex', alignItems: 'stretch', borderRadius: 9, overflow: 'hidden',
                    background: isNow
                      ? `${col}14`
                      : isSess && isUpcoming
                        ? `${col}0D`
                        : `${col}${isPast ? '07' : '0B'}`,
                    border: `1px solid ${col}${isNow ? '32' : isPast ? '10' : isUpcoming && isSess ? '28' : '1C'}`,
                    // Upcoming scheduled sessions get a subtle dashed border to signal "planned"
                    borderStyle: isSess && isUpcoming ? 'dashed' : 'solid',
                    opacity: isPast ? 0.48 : 1,
                    transition: 'all 0.2s',
                    boxShadow: isNow ? `0 0 16px ${col}20` : `0 8px 18px ${col}0E`,
                  }}>
                  <div style={{
                    width: isNow ? 4 : 3,
                    background: isNow ? col : isSess && isUpcoming ? `${col}90` : `${col}75`,
                    flexShrink: 0,
                    boxShadow: isNow ? `0 0 12px ${col}66` : 'none',
                    // Dashed left bar for upcoming sessions
                    backgroundImage: isSess && isUpcoming
                      ? `repeating-linear-gradient(180deg, ${col} 0px, ${col} 4px, transparent 4px, transparent 8px)`
                      : 'none',
                  }} />
                  <div style={{ padding: '10px 12px', flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      {/* Title row */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                        <p style={{
                          fontSize: 11, fontWeight: isNow ? 700 : 600,
                          color: isNow ? '#EAF2FF' : isPast ? 'var(--sp-text-muted)' : 'var(--sp-text)',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          lineHeight: 1.2, margin: 0, flex: 1, minWidth: 0,
                        }}>{ev.title}</p>
                        {/* Session type badge */}
                        {sessBadge && (
                          <span style={{
                            fontSize: 7.5, fontWeight: 700, flexShrink: 0,
                            padding: '1.5px 5px', borderRadius: 4,
                            background: `${col}18`,
                            border: `1px solid ${col}30`,
                            color: col,
                            letterSpacing: '0.04em', textTransform: 'uppercase',
                          }}>{sessBadge}</span>
                        )}
                      </div>
                      {/* Time + duration + sub-label */}
                      <p style={{ fontSize: 9, color: 'var(--sp-text-muted)', fontVariantNumeric: 'tabular-nums', lineHeight: 1.3, display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', margin: 0 }}>
                        {new Date(ev.start_time * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        {' – '}
                        {new Date(ev.end_time * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        {dur > 0 && <span style={{ color: 'var(--sp-border-dash)' }}>· {dur < 60 ? `${dur}m` : `${Math.floor(dur/60)}h${dur%60 > 0 ? ` ${dur%60}m` : ''}`}</span>}
                        {sessSubLabel && <span style={{ color: col, fontWeight: 600 }}>· {sessSubLabel}</span>}
                      </p>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5, flexShrink: 0 }}>
                      {isPast ? (
                        <span style={{ fontSize: 9, color: 'var(--sp-text-faint)', fontVariantNumeric: 'tabular-nums' }}>
                          {new Date(ev.start_time * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      ) : (
                        <Countdown targetTs={ev.start_time} isNow={isNow} />
                      )}
                      {/* Join button for calendar events with meeting URLs */}
                      {!isSess && (ev.meeting_url || isNow) && !isPast && (
                        <button
                          onClick={() => ev.meeting_url && window.open(ev.meeting_url, '_blank')}
                          title={ev.meeting_url ? 'Join meeting' : 'In progress'}
                          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 7px', borderRadius: 6,
                            background: isNow ? `${col}25` : `${col}18`,
                            border: `1px solid ${col}35`,
                            color: col, fontSize: 9, fontWeight: 700, cursor: ev.meeting_url ? 'pointer' : 'default',
                            transition: 'all 0.15s' }}
                          onMouseOver={e => { if (ev.meeting_url) e.currentTarget.style.background = `${col}35`; }}
                          onMouseOut={e  => { if (ev.meeting_url) e.currentTarget.style.background = isNow ? `${col}25` : `${col}18`; }}>
                          {isNow ? <Video size={8} /> : <Play size={8} />}
                          {isNow ? 'Join' : 'Start'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                );
              }
              return items;
            })()}
            {/* Day view: overflow indicator (cap is 6) */}
            {!isMulti && scheduleEvents.length > 6 && (
              <p style={{ fontSize: 9, color: 'var(--sp-text-faint)', paddingTop: 2 }}>
                +{scheduleEvents.length - 6} more
              </p>
            )}
          </div>
        )}
      </div>


      {/* ── AI Period Intelligence ─────────────────────────────────────────────
           Replaces static burnout card with adaptive AI-driven analysis.
           Renders differently for Day / Week / Month views.
        ─────────────────────────────────────────────────────────────────────── */}
      {showActivity && total > 0 && (
        <div className="fl-calendar-summary-section" style={{ padding: '8px 16px 14px' }}>

          {/* Pace / load indicator — AI-powered when available */}
          {burnoutRisk && (
            <div style={{
              padding: '8px 11px', borderRadius: 9,
              display: 'flex', alignItems: 'center', gap: 9, marginBottom: insights.length > 0 ? 8 : 0,
              background: burnoutRisk === 'high' ? 'rgba(248,113,113,0.05)' : burnoutRisk === 'medium' ? 'rgba(251,191,36,0.05)' : 'rgba(52,211,153,0.05)',
              border: `1px solid ${burnoutRisk === 'high' ? 'rgba(248,113,113,0.15)' : burnoutRisk === 'medium' ? 'rgba(251,191,36,0.15)' : 'rgba(52,211,153,0.15)'}`,
            }}>
              <div style={{
                width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                background: burnoutRisk === 'high' ? '#F87171' : burnoutRisk === 'medium' ? '#FBBF24' : '#34D399',
                boxShadow: `0 0 6px ${burnoutRisk === 'high' ? 'rgba(248,113,113,0.5)' : burnoutRisk === 'medium' ? 'rgba(251,191,36,0.5)' : 'rgba(52,211,153,0.5)'}`,
              }} />
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: burnoutRisk === 'high' ? '#F87171' : burnoutRisk === 'medium' ? '#FBBF24' : '#34D399', marginBottom: 1 }}>
                  {burnoutRisk === 'high' ? 'Recovery Needed' : burnoutRisk === 'medium' ? 'High Output Mode' : 'Sustainable Pace'}
                </p>
                <p style={{ fontSize: 9, color: 'var(--sp-text-faint)', lineHeight: 1.4 }}>
                  {burnoutRisk === 'high'
                    ? (aiProductivity?.burnoutRisk?.reasons?.[0] || 'Extended work detected. Schedule a recovery break.')
                    : burnoutRisk === 'medium'
                    ? 'Elevated work pace. Monitor focus quality and rest intervals.'
                    : viewMode === 'Week' ? 'Weekly workload is well-balanced.' : viewMode === 'Month' ? 'Monthly work pattern is sustainable.' : 'Workload looks well-balanced.'}
                </p>
              </div>
            </div>
          )}

          {/* AI intelligence insights — period-aware */}
          {insights.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {insights.map((ins, i) => (
                <div key={i} style={{
                  padding: '7px 10px', borderRadius: 9,
                  background: ins.type === 'positive' ? 'rgba(52,211,153,0.05)' : ins.type === 'warning' ? 'rgba(251,191,36,0.05)' : ins.type === 'info' ? 'rgba(124,108,242,0.05)' : 'rgba(96,165,250,0.05)',
                  border: `1px solid ${ins.type === 'positive' ? 'rgba(52,211,153,0.15)' : ins.type === 'warning' ? 'rgba(251,191,36,0.15)' : ins.type === 'info' ? 'rgba(124,108,242,0.15)' : 'rgba(96,165,250,0.12)'}`,
                  display: 'flex', alignItems: 'flex-start', gap: 7,
                }}>
                  <span style={{ fontSize: 11, lineHeight: 1, marginTop: 0.5, flexShrink: 0 }}>{ins.icon}</span>
                  <span style={{ fontSize: 10, color: 'var(--sp-text-sec)', lineHeight: 1.45 }}>{ins.text}</span>
                </div>
              ))}
            </div>
          )}

          {/* Week/Month: show AI narrative if available */}
          {isMulti && (aiDailySummary?.narrative || aiInsights?.workflowObjective?.description) && (
            <div style={{ marginTop: insights.length > 0 || burnoutRisk ? 8 : 0, padding: '8px 10px', borderRadius: 9, background: 'rgba(124,108,242,0.05)', border: '1px solid rgba(124,108,242,0.12)', borderLeft: '3px solid rgba(124,108,242,0.4)' }}>
              <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#9b8ff8', margin: '0 0 4px' }}>
                {viewMode === 'Week' ? 'Weekly Intelligence' : 'Period Intelligence'}
              </p>
              <p style={{ fontSize: 10, color: 'var(--sp-text-sec)', margin: 0, lineHeight: 1.55 }}>
                {aiDailySummary?.narrative || `Consistent work on ${aiInsights.workflowObjective.description}.`}
              </p>
            </div>
          )}

        </div>
      )}


      {/* ── Quick Add Actions ───────────────────────────────────────────────── */}
      <div style={{ padding: '12px 16px 18px', borderTop: '1px solid var(--sp-border)', flexShrink: 0 }}>
        {/* Header */}
        <div style={{ ...SH_ROW }}>
          <SL icon={Zap}>Quick Add</SL>
        </div>

        {/* Two full-width action buttons (Task + Note removed) */}
        {(() => {
          const focusBlocked = !!activeSession;
          const actions = [
            {
              label: focusBlocked ? 'Session Active' : 'Start Focus',
              Icon:  Zap,
              color:  focusBlocked ? '#4B5568' : '#818CF8',
              bg:     focusBlocked ? 'rgba(75,82,99,0.06)'  : 'rgba(129,140,248,0.09)',
              border: focusBlocked ? 'rgba(75,82,99,0.14)'  : 'rgba(129,140,248,0.20)',
              disabled: focusBlocked,
              action: focusBlocked ? null : onStartFocus,
              title: focusBlocked ? 'A session is already running' : 'Start a 90-min focus block',
            },
            {
              label: 'Add Event',
              Icon:  Calendar,
              color: '#60A5FA',
              bg:    'rgba(96,165,250,0.09)',
              border:'rgba(96,165,250,0.20)',
              action: onAddEvent,
              title: 'Schedule a new session or event',
            },
          ];
          return (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {actions.map(({ label, Icon, color, bg, border, action, disabled, title }) => (
                <button
                  key={label}
                  title={title}
                  onClick={action ?? undefined}
                  disabled={disabled}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 7,
                    padding: '11px 13px', borderRadius: 10,
                    background: bg, border: `1px solid ${border}`,
                    color, fontSize: 10.5, fontWeight: 600, textAlign: 'left',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    opacity: disabled ? 0.55 : 1,
                    transition: 'all 0.15s',
                  }}
                  onMouseOver={e => { if (!disabled && action) e.currentTarget.style.filter = 'brightness(1.35)'; }}
                  onMouseOut={e  => { e.currentTarget.style.filter = 'none'; }}
                >
                  <Icon size={12} style={{ flexShrink: 0 }} />
                  {label}
                </button>
              ))}
            </div>
          );
        })()}

      </div>

      <div style={{ height: 6, flexShrink: 0 }} />
    </div>
  );
}
