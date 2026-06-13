/**
 * Flow Ledger — Reschedule Event System
 *
 * Exports:
 *   RescheduleModal  — full-featured reschedule dialog
 *   RescheduleToast  — undo toast shown after rescheduling
 *   ContextMenu      — right-click context menu for calendar blocks
 */
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import ReactDOM from 'react-dom';
import {
  X, Calendar, Clock, AlertTriangle, CheckCircle, Zap, ChevronLeft,
  ChevronRight, ArrowRight, RotateCcw, Sparkles, RefreshCw,
  AlertCircle, Move, Copy, Layers, ChevronDown,
} from 'lucide-react';

const api = window.electron || {};

// ─── Theme hook ───────────────────────────────────────────────────────────────
function useIsLight() {
  const [isLight, setIsLight] = useState(() =>
    document.documentElement.classList.contains('theme-light')
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

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtTime(unix) {
  return new Date(unix * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function fmtDate(unix) {
  return new Date(unix * 1000).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
function fmtDateLong(date) {
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}
function fmtDur(secs) {
  if (!secs || secs <= 0) return '0m';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
function pad2(n) { return String(n).padStart(2, '0'); }

function unixToHHMM(unix) {
  const d = new Date(unix * 1000);
  return { h: d.getHours(), m: d.getMinutes() };
}

function dateToUnix(date, h, m) {
  const d = new Date(date);
  d.setHours(h, m, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function overlaps(aS, aE, bS, bE) { return aS < bE && aE > bS; }

// ─── Color ────────────────────────────────────────────────────────────────────
function blockEventColor(block) {
  if (!block) return '#7c6cf2';
  if (block._type === 'calendar') return block.color || '#60A5FA';
  const t = String(block.session_type || '').toLowerCase();
  const c = String(block.category || '').toLowerCase();
  if (t === 'meeting' || c.includes('meet')) return '#F87171';
  if (block.is_deep_work) return '#6366F1';
  if (t === 'break') return '#94A3B8';
  return '#818CF8';
}

// ─── Mini Calendar ────────────────────────────────────────────────────────────
function MiniCalendar({ value, onChange, highlightToday = true }) {
  const [viewYear, setViewYear] = useState(value.getFullYear());
  const [viewMonth, setViewMonth] = useState(value.getMonth());
  const isLight = useIsLight();

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  };

  const firstDay = new Date(viewYear, viewMonth, 1);
  const lastDay  = new Date(viewYear, viewMonth + 1, 0);
  const startDow = (firstDay.getDay()) % 7; // 0=Sun
  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= lastDay.getDate(); d++) cells.push(new Date(viewYear, viewMonth, d));

  const today = new Date();
  const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  const bg = isLight ? '#f8f5ff' : 'rgba(18,22,36,0.95)';
  const bd = isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.07)';
  const tx = isLight ? '#0f1117' : 'rgba(255,255,255,0.88)';
  const txMuted = isLight ? '#6B7280' : 'rgba(255,255,255,0.42)';
  const cellHover = isLight ? 'rgba(124,108,242,0.08)' : 'rgba(124,108,242,0.12)';

  return (
    <div style={{
      background: bg,
      border: `1px solid ${bd}`,
      borderRadius: 14,
      padding: '12px 10px',
      userSelect: 'none',
      minWidth: 220,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <button onClick={prevMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', color: txMuted, padding: '2px 4px', borderRadius: 6 }}>
          <ChevronLeft size={14} />
        </button>
        <span style={{ fontSize: 12, fontWeight: 700, color: tx }}>
          {MONTHS[viewMonth]} {viewYear}
        </span>
        <button onClick={nextMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', color: txMuted, padding: '2px 4px', borderRadius: 6 }}>
          <ChevronRight size={14} />
        </button>
      </div>
      {/* Day headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 4 }}>
        {DAYS.map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: 9, fontWeight: 700, color: txMuted, textTransform: 'uppercase', padding: '2px 0' }}>{d}</div>
        ))}
      </div>
      {/* Cells */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {cells.map((date, i) => {
          if (!date) return <div key={`e-${i}`} />;
          const isSelected = sameDay(date, value);
          const isToday = highlightToday && sameDay(date, today);
          const isPast = date < today && !sameDay(date, today);
          return (
            <button
              key={i}
              onClick={() => onChange(date)}
              style={{
                width: '100%', aspectRatio: '1', borderRadius: 7,
                background: isSelected
                  ? 'linear-gradient(135deg, #7c6cf2, #a78bfa)'
                  : isToday
                    ? isLight ? 'rgba(124,108,242,0.10)' : 'rgba(124,108,242,0.14)'
                    : 'none',
                border: isSelected
                  ? 'none'
                  : isToday
                    ? '1px solid rgba(124,108,242,0.35)'
                    : 'none',
                color: isSelected ? 'white' : isPast ? txMuted : tx,
                fontSize: 11, fontWeight: isSelected || isToday ? 700 : 400,
                cursor: 'pointer',
                boxShadow: isSelected ? '0 2px 8px rgba(124,108,242,0.38)' : 'none',
                transition: 'all 0.1s',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
              onMouseOver={e => { if (!isSelected) e.currentTarget.style.background = cellHover; }}
              onMouseOut={e => { if (!isSelected) e.currentTarget.style.background = isToday ? (isLight ? 'rgba(124,108,242,0.10)' : 'rgba(124,108,242,0.14)') : 'none'; }}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Time Picker ──────────────────────────────────────────────────────────────
function TimePicker({ value, onChange, label }) {
  const isLight = useIsLight();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const { h, m } = value;
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const slots = useMemo(() => {
    const result = [];
    for (let hh = 0; hh < 24; hh++) {
      for (const mm of [0, 15, 30, 45]) {
        result.push({ h: hh, m: mm });
      }
    }
    return result;
  }, []);

  const bg = isLight ? '#fff' : 'rgba(14,17,28,0.98)';
  const bd = isLight ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.09)';
  const tx = isLight ? '#0f1117' : 'rgba(255,255,255,0.88)';
  const txMuted = isLight ? '#6B7280' : 'rgba(255,255,255,0.45)';
  const triggerBg = isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)';
  const hoverBg = isLight ? 'rgba(124,108,242,0.07)' : 'rgba(124,108,242,0.10)';

  const displayStr = `${h12}:${pad2(m)} ${ampm}`;
  const selectedRef = useRef(null);

  const handleOpen = () => {
    setOpen(v => !v);
    // scroll selected into view on next tick
    setTimeout(() => {
      if (selectedRef.current) {
        selectedRef.current.scrollIntoView({ block: 'center', behavior: 'instant' });
      }
    }, 30);
  };

  return (
    <div ref={ref} style={{ position: 'relative', flex: 1 }}>
      {label && <p style={{ fontSize: 10, color: txMuted, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 5 }}>{label}</p>}
      <button
        onClick={handleOpen}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
          padding: '9px 12px', borderRadius: 9,
          background: triggerBg, border: `1px solid ${bd}`,
          cursor: 'pointer', transition: 'border-color 0.12s',
        }}
      >
        <Clock size={12} color="#7c6cf2" />
        <span style={{ flex: 1, textAlign: 'left', fontSize: 13, fontWeight: 600, color: tx, fontVariantNumeric: 'tabular-nums' }}>
          {displayStr}
        </span>
        <ChevronDown size={11} color={txMuted} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 200,
          background: bg, border: `1px solid ${bd}`, borderRadius: 11,
          maxHeight: 180, overflowY: 'auto', overflowX: 'hidden',
          boxShadow: isLight ? '0 8px 24px rgba(0,0,0,0.12)' : '0 8px 32px rgba(0,0,0,0.5)',
          scrollbarWidth: 'thin',
        }}>
          {slots.map((slot) => {
            const isActive = slot.h === h && slot.m === m;
            const sAmpm = slot.h < 12 ? 'AM' : 'PM';
            const sH = slot.h === 0 ? 12 : slot.h > 12 ? slot.h - 12 : slot.h;
            return (
              <button
                key={`${slot.h}-${slot.m}`}
                ref={isActive ? selectedRef : null}
                onClick={() => { onChange(slot); setOpen(false); }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center',
                  padding: '8px 12px', border: 'none', cursor: 'pointer', textAlign: 'left',
                  background: isActive ? 'rgba(124,108,242,0.15)' : 'transparent',
                  fontSize: 12, fontWeight: isActive ? 700 : 400,
                  color: isActive ? '#a78bfa' : tx,
                  fontVariantNumeric: 'tabular-nums',
                }}
                onMouseOver={e => { if (!isActive) e.currentTarget.style.background = hoverBg; }}
                onMouseOut={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
              >
                {sH}:{pad2(slot.m)} {sAmpm}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Conflict Checker ─────────────────────────────────────────────────────────
function detectConflicts(newStart, newEnd, blockId, blockType, sessions, calEvents) {
  const conflicts = [];
  for (const ev of calEvents) {
    if (blockType === 'calendar' && ev.id === blockId) continue;
    if (overlaps(newStart, newEnd, ev.start_time, ev.end_time)) {
      conflicts.push({ type: 'calendar', title: ev.title, start: ev.start_time, end: ev.end_time });
    }
  }
  for (const s of sessions) {
    if (blockType === 'session' && s.id === blockId) continue;
    const sEnd = s.ended_at || (s.started_at + (s.duration_seconds || 0));
    if (sEnd <= s.started_at) continue;
    if (overlaps(newStart, newEnd, s.started_at, sEnd)) {
      conflicts.push({ type: 'session', title: s.title || s.category || 'Session', start: s.started_at, end: sEnd });
    }
  }
  return conflicts;
}

// ─── AI Time Suggester ────────────────────────────────────────────────────────
function generateAISuggestions(block, sessions, calEvents, targetDate) {
  const durationSecs = block._type === 'calendar'
    ? (block.end_time - block.start_time)
    : (block.duration_seconds || (block.ended_at ? block.ended_at - block.started_at : 3600));
  const durMins = Math.ceil(durationSecs / 60);
  const dayStart = new Date(targetDate); dayStart.setHours(0, 0, 0, 0);
  const dayEnd   = new Date(targetDate); dayEnd.setHours(23, 59, 59, 999);
  const dayStartUnix = Math.floor(dayStart.getTime() / 1000);
  const dayEndUnix   = Math.floor(dayEnd.getTime() / 1000);

  // Collect busy intervals
  const busy = [];
  for (const ev of calEvents) {
    if (block._type === 'calendar' && ev.id === block.id) continue;
    if (ev.end_time > dayStartUnix && ev.start_time < dayEndUnix) {
      busy.push({ start: Math.max(ev.start_time, dayStartUnix), end: Math.min(ev.end_time, dayEndUnix) });
    }
  }
  for (const s of sessions) {
    if (block._type === 'session' && s.id === block.id) continue;
    const sEnd = s.ended_at || (s.started_at + (s.duration_seconds || 0));
    if (sEnd > dayStartUnix && s.started_at < dayEndUnix) {
      busy.push({ start: Math.max(s.started_at, dayStartUnix), end: Math.min(sEnd, dayEndUnix) });
    }
  }
  busy.sort((a, b) => a.start - b.start);

  // Find free windows (8 AM – 9 PM)
  const WORK_START = dayStartUnix + 8 * 3600;
  const WORK_END   = dayStartUnix + 21 * 3600;
  const suggestions = [];

  // Peak focus: 9–11 AM
  const peak1Start = dayStartUnix + 9 * 3600;
  const peak1End   = peak1Start + durMins * 60;
  if (peak1End <= dayEndUnix) {
    const hasConflict = busy.some(b => overlaps(peak1Start, peak1End, b.start, b.end));
    suggestions.push({
      start: peak1Start,
      end:   peak1End,
      label: 'Peak Focus Window',
      detail: 'High cognitive performance window',
      quality: hasConflict ? 'conflict' : 'best',
      icon: 'zap',
    });
  }

  // Afternoon: 2–4 PM
  const pm2Start = dayStartUnix + 14 * 3600;
  const pm2End   = pm2Start + durMins * 60;
  if (pm2End <= dayEndUnix) {
    const hasConflict = busy.some(b => overlaps(pm2Start, pm2End, b.start, b.end));
    suggestions.push({
      start: pm2Start,
      end:   pm2End,
      label: 'Afternoon Block',
      detail: 'Good for collaborative or admin work',
      quality: hasConflict ? 'conflict' : 'good',
      icon: 'sun',
    });
  }

  // Find first fully free slot after current time
  const nowUnix = Math.floor(Date.now() / 1000);
  const scanFrom = Math.max(WORK_START, nowUnix + 300); // start from 5 min from now
  let cursor = scanFrom;
  while (cursor + durMins * 60 <= WORK_END) {
    const slotEnd = cursor + durMins * 60;
    const conflict = busy.find(b => overlaps(cursor, slotEnd, b.start, b.end));
    if (!conflict) {
      // Round cursor to next 15-min slot
      const roundedStart = Math.ceil(cursor / 900) * 900;
      const roundedEnd   = roundedStart + durMins * 60;
      if (!busy.some(b => overlaps(roundedStart, roundedEnd, b.start, b.end))) {
        suggestions.push({
          start:  roundedStart,
          end:    roundedEnd,
          label:  'First Free Slot',
          detail: 'Earliest available opening today',
          quality: 'available',
          icon:   'clock',
        });
      }
      break;
    }
    cursor = conflict.end + 300; // skip past conflict + 5 min buffer
  }

  // Deduplicate by start time
  const seen = new Set();
  return suggestions.filter(s => {
    if (seen.has(s.start)) return false;
    seen.add(s.start);
    return s.start >= dayStartUnix && s.end <= dayEndUnix + 3600;
  }).slice(0, 4);
}

// ─── RESCHEDULE MODAL ─────────────────────────────────────────────────────────
export function RescheduleModal({ block, sessions, calEvents, onClose, onReschedule }) {
  const isLight = useIsLight();

  // Derive current values
  const origStart = block._type === 'calendar' ? block.start_time : block.started_at;
  const origEnd   = block._type === 'calendar' ? block.end_time   : (block.ended_at || (block.started_at + (block.duration_seconds || 3600)));
  const durationSecs = origEnd - origStart;

  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date(origStart * 1000); d.setHours(0, 0, 0, 0); return d;
  });
  const [startTime, setStartTime] = useState(() => unixToHHMM(origStart));
  const [endTime,   setEndTime]   = useState(() => unixToHHMM(origEnd));
  const [lockDuration, setLockDuration] = useState(true);
  const [recurringScope, setRecurringScope] = useState('this'); // 'this' | 'future' | 'all'
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState('edit'); // 'edit' | 'conflict'
  const [conflicts, setConflicts] = useState([]);
  const [showAI, setShowAI] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [bulk, setBulk] = useState(null); // null | 'day' | 'week' | 'custom'

  const isRecurring = Boolean(block.recurrence_rule || block.recurring_event_id);
  const isCalendarEvent = block._type === 'calendar';
  const color = blockEventColor(block);
  const title = block._type === 'calendar' ? block.title : (block.title || block.category || 'Session');

  // Derived new times
  const newStart = useMemo(() => dateToUnix(selectedDate, startTime.h, startTime.m), [selectedDate, startTime]);
  const newEnd   = useMemo(() => {
    if (lockDuration) {
      return newStart + durationSecs;
    }
    return dateToUnix(selectedDate, endTime.h, endTime.m);
  }, [newStart, lockDuration, durationSecs, selectedDate, endTime]);

  const newDurationSecs = newEnd - newStart;

  // Auto-update endTime display when start changes and duration is locked
  useEffect(() => {
    if (lockDuration) {
      const e = new Date(newStart * 1000 + durationSecs * 1000);
      setEndTime({ h: e.getHours(), m: e.getMinutes() });
    }
  }, [newStart, lockDuration, durationSecs]);

  // Live conflict check
  const liveConflicts = useMemo(() => {
    if (!newStart || !newEnd || newEnd <= newStart) return [];
    return detectConflicts(newStart, newEnd, block.id, block._type, sessions, calEvents);
  }, [newStart, newEnd, block.id, block._type, sessions, calEvents]);

  // AI suggestions
  const handleAISuggest = useCallback(() => {
    setAiLoading(true);
    setShowAI(true);
    setTimeout(() => {
      const suggestions = generateAISuggestions(block, sessions, calEvents, selectedDate);
      setAiSuggestions(suggestions);
      setAiLoading(false);
    }, 600);
  }, [block, sessions, calEvents, selectedDate]);

  const applyAISuggestion = (suggestion) => {
    const s = new Date(suggestion.start * 1000);
    const e = new Date(suggestion.end * 1000);
    const newDate = new Date(s); newDate.setHours(0, 0, 0, 0);
    setSelectedDate(newDate);
    setStartTime({ h: s.getHours(), m: s.getMinutes() });
    setEndTime({ h: e.getHours(), m: e.getMinutes() });
    setLockDuration(false);
    setShowAI(false);
  };

  const handleSave = async () => {
    if (newEnd <= newStart) return;
    if (liveConflicts.length > 0 && step === 'edit') {
      setConflicts(liveConflicts);
      setStep('conflict');
      return;
    }
    await doSave();
  };

  const doSave = async () => {
    setSaving(true);
    try {
      if (isCalendarEvent) {
        await api.calendarUpdateEvent?.({ eventId: block.id, startTime: newStart, endTime: newEnd });
      } else {
        await api.updateSessionTime?.({ sessionId: block.id, startedAt: newStart, endedAt: newEnd });
      }
      onReschedule({
        block,
        oldStart: origStart,
        oldEnd:   origEnd,
        newStart,
        newEnd,
        scope:    recurringScope,
      });
    } catch (err) {
      console.error('[RescheduleModal] save failed:', err);
    } finally {
      setSaving(false);
    }
  };

  // Theme
  const bg    = isLight
    ? 'linear-gradient(160deg, #ffffff 0%, #f8f5ff 100%)'
    : 'linear-gradient(160deg, rgba(14,17,28,0.99) 0%, rgba(10,13,22,0.99) 100%)';
  const bd    = isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)';
  const tx    = isLight ? '#0f1117' : 'rgba(255,255,255,0.92)';
  const txMid = isLight ? '#4a5568' : 'rgba(255,255,255,0.55)';
  const txFnt = isLight ? '#94a3b8' : 'rgba(255,255,255,0.30)';
  const divBg = isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)';
  const divBd = isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)';
  const rowBg = isLight ? 'rgba(0,0,0,0.025)' : 'rgba(255,255,255,0.03)';

  const noChange = newStart === origStart && newEnd === origEnd;
  const hasConflict = liveConflicts.length > 0;

  return ReactDOM.createPortal(
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)',
        animation: 'rs-backdrop-in 0.2s ease',
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <style>{`
        @keyframes rs-backdrop-in { from { opacity: 0 } to { opacity: 1 } }
        @keyframes rs-modal-in { from { opacity: 0; transform: scale(0.96) translateY(-10px) } to { opacity: 1; transform: scale(1) translateY(0) } }
        .rs-scroll::-webkit-scrollbar { width: 4px }
        .rs-scroll::-webkit-scrollbar-track { background: transparent }
        .rs-scroll::-webkit-scrollbar-thumb { background: rgba(124,108,242,0.25); border-radius: 99px }
      `}</style>

      <div style={{
        position: 'relative',
        width: 520,
        maxHeight: '90vh',
        background: bg,
        border: `1px solid ${bd}`,
        borderRadius: 20,
        boxShadow: isLight
          ? '0 24px 64px rgba(0,0,0,0.16), 0 0 0 1px rgba(124,108,242,0.10)'
          : '0 32px 80px rgba(0,0,0,0.75), 0 0 0 1px rgba(124,108,242,0.12)',
        animation: 'rs-modal-in 0.25s cubic-bezier(0.34,1.56,0.64,1)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>

        {/* ── Accent bar ── */}
        <div style={{ height: 3, background: `linear-gradient(90deg, ${color}, ${color}88, transparent)`, borderRadius: '20px 20px 0 0', flexShrink: 0 }} />

        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px 14px', flexShrink: 0 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 11, flexShrink: 0,
            background: `${color}18`, border: `1px solid ${color}35`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Move size={16} color={color} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: tx, margin: 0, letterSpacing: '-0.01em' }}>Reschedule Event</p>
            <p style={{
              fontSize: 11, color: txMid, margin: 0, marginTop: 2,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{title}</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: txMid, padding: 4, borderRadius: 6 }}>
            <X size={15} />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="rs-scroll" style={{ flex: 1, overflowY: 'auto', padding: '0 20px 20px' }}>

          {/* ── Current → New summary ── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: divBg, border: `1px solid ${divBd}`, borderRadius: 12, marginBottom: 18 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 9, fontWeight: 700, color: txFnt, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3 }}>Current</p>
              <p style={{ fontSize: 12, fontWeight: 600, color: txMid, fontVariantNumeric: 'tabular-nums' }}>
                {fmtDate(origStart)} · {fmtTime(origStart)} – {fmtTime(origEnd)}
              </p>
              <p style={{ fontSize: 10, color: txFnt, marginTop: 2 }}>{fmtDur(durationSecs)}</p>
            </div>
            <ArrowRight size={14} color={txFnt} style={{ flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 9, fontWeight: 700, color: '#a78bfa', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3 }}>New</p>
              <p style={{ fontSize: 12, fontWeight: 700, color: noChange ? txMid : tx, fontVariantNumeric: 'tabular-nums' }}>
                {fmtDate(newStart)} · {fmtTime(newStart)} – {fmtTime(newEnd)}
              </p>
              <p style={{ fontSize: 10, color: '#a78bfa', marginTop: 2 }}>{fmtDur(newDurationSecs)}</p>
            </div>
          </div>

          {/* ── Conflict warning (step=edit) ── */}
          {hasConflict && step === 'edit' && (
            <div style={{ display: 'flex', gap: 10, padding: '10px 14px', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)', borderRadius: 10, marginBottom: 16 }}>
              <AlertTriangle size={14} color="#FBBF24" style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <p style={{ fontSize: 12, fontWeight: 600, color: '#FBBF24', margin: 0 }}>
                  Conflicts with {liveConflicts.length} existing event{liveConflicts.length > 1 ? 's' : ''}
                </p>
                {liveConflicts.slice(0, 2).map((c, i) => (
                  <p key={i} style={{ fontSize: 10, color: txMid, margin: '2px 0 0' }}>
                    · {c.title} ({fmtTime(c.start)} – {fmtTime(c.end)})
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* ── Conflict resolution step ── */}
          {step === 'conflict' && (
            <div style={{ marginBottom: 18 }}>
              <div style={{ display: 'flex', gap: 10, padding: '12px 14px', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.22)', borderRadius: 12, marginBottom: 14 }}>
                <AlertCircle size={14} color="#F87171" style={{ flexShrink: 0, marginTop: 1 }} />
                <div>
                  <p style={{ fontSize: 12, fontWeight: 700, color: '#F87171', margin: 0 }}>
                    This event overlaps with {conflicts.length} existing event{conflicts.length > 1 ? 's' : ''}
                  </p>
                  {conflicts.map((c, i) => (
                    <p key={i} style={{ fontSize: 11, color: txMid, margin: '4px 0 0' }}>
                      · <strong style={{ color: tx }}>{c.title}</strong> — {fmtTime(c.start)} to {fmtTime(c.end)}
                    </p>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexDirection: 'column' }}>
                <button onClick={doSave} disabled={saving} style={{
                  padding: '10px 16px', borderRadius: 10, border: '1px solid rgba(248,113,113,0.3)',
                  background: 'rgba(248,113,113,0.10)', color: '#F87171',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.12s',
                }}>
                  Reschedule anyway
                </button>
                <button onClick={() => { setShowAI(true); handleAISuggest(); setStep('edit'); }} style={{
                  padding: '10px 16px', borderRadius: 10, border: '1px solid rgba(124,108,242,0.25)',
                  background: 'rgba(124,108,242,0.08)', color: '#a78bfa',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.12s',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}>
                  <Sparkles size={12} />
                  Find available slot
                </button>
                <button onClick={() => setStep('edit')} style={{
                  padding: '10px 16px', borderRadius: 10, border: `1px solid ${divBd}`,
                  background: 'transparent', color: txMid,
                  fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.12s',
                }}>
                  Go back
                </button>
              </div>
            </div>
          )}

          {step === 'edit' && (
            <>
              {/* ── Date picker ── */}
              <div style={{ marginBottom: 18 }}>
                <p style={{ fontSize: 10, color: txMid, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Select Date</p>
                <MiniCalendar value={selectedDate} onChange={setSelectedDate} />
                <p style={{ fontSize: 11, color: color, fontWeight: 600, marginTop: 8 }}>
                  {fmtDateLong(selectedDate)}
                </p>
              </div>

              {/* ── Time row ── */}
              <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                <TimePicker value={startTime} onChange={setStartTime} label="Start Time" />
                <TimePicker
                  value={endTime}
                  onChange={v => { setEndTime(v); setLockDuration(false); }}
                  label="End Time"
                />
              </div>

              {/* ── Duration lock ── */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: rowBg, border: `1px solid ${divBd}`, borderRadius: 9, marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Clock size={11} color={txMid} />
                  <span style={{ fontSize: 11, color: txMid }}>
                    Duration: <strong style={{ color: tx }}>{fmtDur(newDurationSecs)}</strong>
                  </span>
                </div>
                <button
                  onClick={() => setLockDuration(v => !v)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '3px 9px', borderRadius: 6,
                    background: lockDuration ? 'rgba(124,108,242,0.12)' : divBg,
                    border: `1px solid ${lockDuration ? 'rgba(124,108,242,0.30)' : divBd}`,
                    color: lockDuration ? '#a78bfa' : txMid,
                    fontSize: 10, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  {lockDuration ? '🔒 Locked' : '🔓 Unlock duration'}
                </button>
              </div>

              {/* ── AI Suggestions ── */}
              <div style={{ marginBottom: 18 }}>
                <button
                  onClick={handleAISuggest}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    padding: '10px', borderRadius: 11,
                    background: showAI ? 'rgba(124,108,242,0.12)' : divBg,
                    border: `1px solid ${showAI ? 'rgba(124,108,242,0.30)' : divBd}`,
                    color: showAI ? '#a78bfa' : txMid,
                    fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
                  }}
                >
                  <Sparkles size={13} />
                  {aiLoading ? 'Finding best times…' : 'Suggest Best Time (AI)'}
                  {aiLoading && <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} />}
                </button>
                <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

                {showAI && !aiLoading && aiSuggestions.length > 0 && (
                  <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {aiSuggestions.map((s, i) => {
                      const qual = s.quality;
                      const qColor = qual === 'best' ? '#34D399' : qual === 'good' ? '#60A5FA' : qual === 'available' ? '#a78bfa' : '#FBBF24';
                      return (
                        <button key={i} onClick={() => applyAISuggestion(s)} style={{
                          display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px',
                          background: `${qColor}08`, border: `1px solid ${qColor}22`, borderRadius: 10,
                          cursor: 'pointer', textAlign: 'left', width: '100%', transition: 'all 0.12s',
                        }}
                          onMouseOver={e => { e.currentTarget.style.background = `${qColor}14`; e.currentTarget.style.borderColor = `${qColor}40`; }}
                          onMouseOut={e => { e.currentTarget.style.background = `${qColor}08`; e.currentTarget.style.borderColor = `${qColor}22`; }}
                        >
                          <div style={{ width: 28, height: 28, borderRadius: 8, background: `${qColor}18`, border: `1px solid ${qColor}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <Sparkles size={12} color={qColor} />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 11, fontWeight: 700, color: qColor, margin: 0 }}>{s.label}</p>
                            <p style={{ fontSize: 12, fontWeight: 600, color: tx, margin: '2px 0 0', fontVariantNumeric: 'tabular-nums' }}>
                              {fmtTime(s.start)} – {fmtTime(s.end)}
                            </p>
                            <p style={{ fontSize: 10, color: txMid, margin: '1px 0 0' }}>{s.detail}</p>
                          </div>
                          <span style={{ fontSize: 9, fontWeight: 700, color: qColor, background: `${qColor}18`, padding: '2px 6px', borderRadius: 5, flexShrink: 0, alignSelf: 'center' }}>
                            {qual === 'conflict' ? 'OVERLAP' : qual.toUpperCase()}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* ── Recurring event options ── */}
              {isRecurring && (
                <div style={{ marginBottom: 18 }}>
                  <p style={{ fontSize: 10, color: txMid, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Apply to recurring series</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {[
                      { id: 'this', label: 'This event only' },
                      { id: 'future', label: 'This and all future events' },
                      { id: 'all', label: 'Entire series' },
                    ].map(opt => (
                      <button key={opt.id} onClick={() => setRecurringScope(opt.id)} style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
                        background: recurringScope === opt.id ? 'rgba(124,108,242,0.10)' : divBg,
                        border: `1px solid ${recurringScope === opt.id ? 'rgba(124,108,242,0.30)' : divBd}`,
                        borderRadius: 9, cursor: 'pointer', textAlign: 'left', transition: 'all 0.12s',
                      }}>
                        <div style={{
                          width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
                          border: `2px solid ${recurringScope === opt.id ? '#7c6cf2' : divBd}`,
                          background: recurringScope === opt.id ? '#7c6cf2' : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {recurringScope === opt.id && <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'white' }} />}
                        </div>
                        <span style={{ fontSize: 12, color: recurringScope === opt.id ? tx : txMid, fontWeight: recurringScope === opt.id ? 600 : 400 }}>
                          {opt.label}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Bulk reschedule options ── */}
              <div style={{ marginBottom: 18 }}>
                <p style={{ fontSize: 10, color: txFnt, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Quick Shifts</p>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[
                    { label: '+1 Day', delta: 86400 },
                    { label: '+1 Week', delta: 7 * 86400 },
                    { label: '−1 Day', delta: -86400 },
                    { label: '−1 Week', delta: -7 * 86400 },
                  ].map(opt => (
                    <button key={opt.label} onClick={() => {
                      const newD = new Date((origStart + opt.delta) * 1000);
                      newD.setHours(0, 0, 0, 0);
                      setSelectedDate(newD);
                      setStartTime(unixToHHMM(origStart + opt.delta));
                      if (!lockDuration) setEndTime(unixToHHMM(origEnd + opt.delta));
                    }} style={{
                      flex: 1, padding: '7px 4px', borderRadius: 8,
                      background: divBg, border: `1px solid ${divBd}`,
                      color: txMid, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                      transition: 'all 0.12s',
                    }}
                      onMouseOver={e => { e.currentTarget.style.background = 'rgba(124,108,242,0.08)'; e.currentTarget.style.color = '#a78bfa'; e.currentTarget.style.borderColor = 'rgba(124,108,242,0.25)'; }}
                      onMouseOut={e => { e.currentTarget.style.background = divBg; e.currentTarget.style.color = txMid; e.currentTarget.style.borderColor = divBd; }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* ── Footer ── */}
        {step === 'edit' && (
          <div style={{ padding: '14px 20px', borderTop: `1px solid ${divBd}`, display: 'flex', gap: 10, flexShrink: 0, background: isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.01)' }}>
            <button onClick={onClose} style={{
              flex: '0 0 auto', padding: '10px 16px', borderRadius: 10,
              background: 'transparent', border: `1px solid ${divBd}`,
              color: txMid, fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}>
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || noChange || newEnd <= newStart}
              style={{
                flex: 1, padding: '10px', borderRadius: 10,
                background: noChange || newEnd <= newStart
                  ? divBg
                  : hasConflict
                    ? 'linear-gradient(135deg, #f59e0b, #fbbf24)'
                    : 'linear-gradient(135deg, #7c6cf2, #a78bfa)',
                border: 'none',
                color: noChange || newEnd <= newStart ? txFnt : 'white',
                fontSize: 13, fontWeight: 700, cursor: noChange || newEnd <= newStart ? 'not-allowed' : 'pointer',
                boxShadow: noChange || newEnd <= newStart ? 'none' : '0 4px 16px rgba(124,108,242,0.30)',
                transition: 'all 0.15s', letterSpacing: '-0.01em',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              }}
            >
              {saving ? (
                <><RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</>
              ) : hasConflict ? (
                <><AlertTriangle size={13} /> Save with Conflict</>
              ) : noChange ? (
                'No changes'
              ) : (
                <><CheckCircle size={13} /> Reschedule Event</>
              )}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

// ─── RESCHEDULE TOAST ─────────────────────────────────────────────────────────
export function RescheduleToast({ data, onUndo, onDismiss }) {
  const isLight = useIsLight();
  const [visible, setVisible] = useState(true);
  const [progress, setProgress] = useState(100);
  const timerRef = useRef(null);
  const DURATION = 8000;

  useEffect(() => {
    const start = Date.now();
    const tick = () => {
      const elapsed = Date.now() - start;
      const pct = Math.max(0, 100 - (elapsed / DURATION) * 100);
      setProgress(pct);
      if (elapsed >= DURATION) {
        setVisible(false);
        setTimeout(onDismiss, 300);
      } else {
        timerRef.current = requestAnimationFrame(tick);
      }
    };
    timerRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(timerRef.current);
  }, [onDismiss]);

  const handleUndo = () => {
    cancelAnimationFrame(timerRef.current);
    setVisible(false);
    setTimeout(() => { onUndo(); onDismiss(); }, 200);
  };

  const bg = isLight
    ? 'linear-gradient(145deg, #ffffff, #f8f5ff)'
    : 'linear-gradient(145deg, rgba(18,22,36,0.98), rgba(14,17,28,0.98))';
  const bd = isLight ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.08)';
  const tx = isLight ? '#0f1117' : 'rgba(255,255,255,0.92)';
  const txMid = isLight ? '#4a5568' : 'rgba(255,255,255,0.55)';

  if (!data) return null;

  return ReactDOM.createPortal(
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : 'translateY(12px)',
      transition: 'opacity 0.25s ease, transform 0.25s ease',
      pointerEvents: visible ? 'auto' : 'none',
    }}>
      <div style={{
        background: bg, border: `1px solid ${bd}`, borderRadius: 14,
        boxShadow: isLight ? '0 8px 32px rgba(0,0,0,0.12)' : '0 8px 32px rgba(0,0,0,0.55)',
        padding: '12px 14px', minWidth: 300, maxWidth: 340,
        overflow: 'hidden', position: 'relative',
      }}>
        {/* Progress bar */}
        <div style={{
          position: 'absolute', top: 0, left: 0, height: 3,
          width: `${progress}%`, background: 'linear-gradient(90deg, #7c6cf2, #a78bfa)',
          borderRadius: '14px 0 0 0', transition: 'none',
        }} />

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          {/* Icon */}
          <div style={{ width: 32, height: 32, borderRadius: 9, background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
            <CheckCircle size={15} color="#34D399" />
          </div>

          {/* Content */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: tx, margin: 0 }}>Event rescheduled successfully</p>
            <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: txMid, textTransform: 'uppercase', letterSpacing: '0.06em', minWidth: 28 }}>Old:</span>
                <span style={{ fontSize: 11, color: txMid, fontVariantNumeric: 'tabular-nums' }}>
                  {fmtDate(data.oldStart)} · {fmtTime(data.oldStart)}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: '#a78bfa', textTransform: 'uppercase', letterSpacing: '0.06em', minWidth: 28 }}>New:</span>
                <span style={{ fontSize: 11, color: tx, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                  {fmtDate(data.newStart)} · {fmtTime(data.newStart)}
                </span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flexShrink: 0 }}>
            <button onClick={handleUndo} style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '5px 9px', borderRadius: 7,
              background: 'rgba(124,108,242,0.10)', border: '1px solid rgba(124,108,242,0.25)',
              color: '#a78bfa', fontSize: 11, fontWeight: 700, cursor: 'pointer',
            }}>
              <RotateCcw size={11} />
              Undo
            </button>
            <button onClick={() => { setVisible(false); setTimeout(onDismiss, 300); }} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '4px', borderRadius: 7,
              background: 'transparent', border: 'none',
              color: txMid, cursor: 'pointer',
            }}>
              <X size={12} />
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── CONTEXT MENU ─────────────────────────────────────────────────────────────
export function BlockContextMenu({ block, position, onClose, onReschedule, onEdit, onDelete, onDuplicate }) {
  const isLight = useIsLight();
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const escHandler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', escHandler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', escHandler);
    };
  }, [onClose]);

  // Clamp to viewport
  const vw = window.innerWidth, vh = window.innerHeight;
  const MENU_W = 190, MENU_H = 220;
  const left = Math.min(position.x, vw - MENU_W - 8);
  const top  = Math.min(position.y, vh - MENU_H - 8);

  const bg    = isLight ? '#fff' : 'rgba(14,17,28,0.99)';
  const bd    = isLight ? 'rgba(0,0,0,0.09)' : 'rgba(255,255,255,0.09)';
  const tx    = isLight ? '#0f1117' : 'rgba(255,255,255,0.88)';
  const txMid = isLight ? '#6B7280' : 'rgba(255,255,255,0.48)';
  const hov   = isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)';
  const divBd = isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)';

  const color = blockEventColor(block);
  const title = block._type === 'calendar' ? block.title : (block.title || block.category || 'Session');

  const items = [
    { icon: Move, label: 'Reschedule', action: onReschedule, accent: '#a78bfa' },
    { icon: Zap, label: 'Edit details', action: onEdit },
    { divider: true },
    { icon: Copy, label: 'Duplicate', action: onDuplicate },
    { divider: true },
    { icon: X, label: 'Delete', action: onDelete, danger: true },
  ];

  return ReactDOM.createPortal(
    <div ref={ref} style={{
      position: 'fixed', left, top, zIndex: 8500,
      background: bg, border: `1px solid ${bd}`, borderRadius: 13,
      boxShadow: isLight ? '0 8px 24px rgba(0,0,0,0.14)' : '0 8px 32px rgba(0,0,0,0.65)',
      minWidth: MENU_W, overflow: 'hidden',
      animation: 'ctx-in 0.12s cubic-bezier(0.34,1.56,0.64,1)',
    }}>
      <style>{`@keyframes ctx-in { from { opacity:0; transform:scale(0.94) } to { opacity:1; transform:scale(1) } }`}</style>

      {/* Header */}
      <div style={{ padding: '9px 12px 7px', borderBottom: `1px solid ${divBd}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
          <p style={{
            fontSize: 11, fontWeight: 700, color: tx, margin: 0,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140,
          }}>{title}</p>
        </div>
        <p style={{ fontSize: 9.5, color: txMid, margin: '2px 0 0', fontVariantNumeric: 'tabular-nums' }}>
          {fmtTime(block._type === 'calendar' ? block.start_time : block.started_at)}
          {' – '}
          {fmtTime(block._type === 'calendar' ? block.end_time : (block.ended_at || (block.started_at + (block.duration_seconds || 0))))}
        </p>
      </div>

      {/* Items */}
      <div style={{ padding: '4px' }}>
        {items.map((item, i) => {
          if (item.divider) return <div key={`div-${i}`} style={{ height: 1, background: divBd, margin: '3px 0' }} />;
          const Icon = item.icon;
          return (
            <button key={i}
              onClick={() => { item.action?.(); onClose(); }}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 9,
                padding: '8px 10px', borderRadius: 8, border: 'none',
                background: 'transparent', cursor: 'pointer', textAlign: 'left',
                color: item.danger ? '#F87171' : item.accent || tx,
                fontSize: 12, fontWeight: 600, transition: 'background 0.1s',
              }}
              onMouseOver={e => e.currentTarget.style.background = item.danger ? 'rgba(248,113,113,0.08)' : hov}
              onMouseOut={e => e.currentTarget.style.background = 'transparent'}
            >
              <Icon size={13} />
              {item.label}
            </button>
          );
        })}
      </div>
    </div>,
    document.body
  );
}

// ─── DRAG GHOST LABEL ─────────────────────────────────────────────────────────
export function DragGhostLabel({ top, text, color, isLight }) {
  return (
    <div
      className="pointer-events-none"
      style={{
        position: 'absolute',
        top: top - 22,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 999,
        background: isLight
          ? 'rgba(255,255,255,0.95)'
          : 'rgba(14,17,28,0.95)',
        border: `1px solid ${color || '#7c6cf2'}`,
        borderRadius: 6,
        padding: '3px 8px',
        fontSize: 10,
        fontWeight: 700,
        color: color || '#a78bfa',
        whiteSpace: 'nowrap',
        boxShadow: `0 4px 12px rgba(0,0,0,0.3), 0 0 0 1px ${color || '#7c6cf2'}22`,
        fontVariantNumeric: 'tabular-nums',
        pointerEvents: 'none',
      }}
    >
      {text}
    </div>
  );
}
