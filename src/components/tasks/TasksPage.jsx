import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Plus, Search, X, Check, ChevronDown, CheckSquare, Clock,
  MoreHorizontal, Edit2, Trash2, ArrowUpDown, Tag, Users, Briefcase,
  Circle, CheckCircle2, Pause, AlertCircle, Calendar, Zap,
  Flag, AlertTriangle, Minus, ChevronRight, Download, Upload,
} from 'lucide-react';
import CsvImportModal from '../shared/CsvImportModal';
import { downloadCSV, normalizeValue } from '../../utils/csv';

const api = window.electron || {};

// ─── Constants ────────────────────────────────────────────────────────────────
const STATUS_OPTIONS = [
  { value: 'todo',        label: 'To Do',      color: '#6b7280', bg: 'rgba(107,114,128,0.12)', Icon: Circle },
  { value: 'in_progress', label: 'In Progress', color: '#2f81f7', bg: 'rgba(47,129,247,0.12)',  Icon: Pause },
  { value: 'done',        label: 'Done',        color: '#3fb950', bg: 'rgba(63,185,80,0.12)',   Icon: CheckCircle2 },
  { value: 'archived',    label: 'Archived',    color: '#6B7280', bg: 'rgba(107,114,128,0.08)', Icon: AlertCircle },
];

const PRIORITY_OPTIONS = [
  { value: 1, label: 'Urgent', color: '#ef4444', bg: 'rgba(239,68,68,0.12)',   short: 'P1', Icon: AlertTriangle },
  { value: 2, label: 'High',   color: '#f97316', bg: 'rgba(249,115,22,0.12)',  short: 'P2', Icon: Flag },
  { value: 3, label: 'Medium', color: '#2f81f7', bg: 'rgba(47,129,247,0.12)', short: 'P3', Icon: Minus },
  { value: 4, label: 'Low',    color: '#6b7280', bg: 'rgba(107,114,128,0.1)',  short: 'P4', Icon: ChevronRight },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(s) {
  if (!s || s <= 0) return null;
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

function fmtEst(hours) {
  if (!hours || hours <= 0) return null;
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours % 1 === 0) return `${hours}h`;
  return `${Math.floor(hours)}h ${Math.round((hours % 1) * 60)}m`;
}

function fmtDue(u) {
  if (!u) return null;
  const d       = new Date(u * 1000);
  const diffDays = Math.floor((d - Date.now()) / 86400000);
  if (diffDays < -1) return { label: `${Math.abs(diffDays)}d overdue`, color: '#ef4444', isOverdue: true };
  if (diffDays < 0)  return { label: 'Yesterday', color: '#ef4444',  isOverdue: true };
  if (diffDays === 0) return { label: 'Today',    color: '#f59e0b',  isToday: true };
  if (diffDays === 1) return { label: 'Tomorrow', color: '#f97316' };
  if (diffDays <= 7)  return { label: `${diffDays}d`,               color: '#2f81f7' };
  return { label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), color: '#6B7280' };
}

function parseTags(keywords) {
  if (!keywords) return [];
  return keywords.split(',').map(t => t.trim()).filter(Boolean);
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function PriorityDot({ priority }) {
  const opt = PRIORITY_OPTIONS.find(p => p.value === priority);
  if (!opt) return (
    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 22, height: 22, borderRadius: 6, background: 'rgba(42,47,58,0.4)', flexShrink: 0 }}>
      <Minus size={9} style={{ color: '#3A404F' }} />
    </span>
  );
  return (
    <span title={`${opt.label} priority`} style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 22, height: 22, borderRadius: 6,
      background: `${opt.color}12`,
      border: `1px solid ${opt.color}28`,
      flexShrink: 0,
    }}>
      <opt.Icon size={11} style={{ color: opt.color }} />
    </span>
  );
}

function StatusPill({ status }) {
  const opt = STATUS_OPTIONS.find(o => o.value === (status || 'todo')) || STATUS_OPTIONS[0];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 8px 3px 7px', borderRadius: 6, fontSize: 10, fontWeight: 600,
      color: opt.color, background: `${opt.color}0f`,
      border: `1px solid ${opt.color}28`,
      whiteSpace: 'nowrap', letterSpacing: '0.01em',
    }}>
      <span style={{
        width: 5, height: 5, borderRadius: '50%',
        background: opt.color, flexShrink: 0,
        boxShadow: `0 0 5px ${opt.color}90`,
      }} />
      {opt.label}
    </span>
  );
}

function TagChip({ label }) {
  const colors = ['#818CF8','#34D399','#60A5FA','#FB923C','#A78BFA','#F472B6','#7c6cf2','#FBBF24'];
  let h = 0;
  for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) >>> 0;
  const c = colors[h % colors.length];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 6px', borderRadius: 5, fontSize: 9.5, fontWeight: 500,
      color: `${c}E0`, background: `${c}0e`, border: `1px solid ${c}22`,
      letterSpacing: '0.01em',
    }}>
      <span style={{ width: 4, height: 4, borderRadius: '50%', background: `${c}CC`, flexShrink: 0 }} />
      {label}
    </span>
  );
}

function QuickActions({ onEdit, onDelete, onMarkDone, isDone }) {
  return (
    <div className="fl-quick-actions" style={{
      display: 'flex', alignItems: 'center', gap: 4,
      paddingLeft: 8, borderLeft: '1px solid rgba(255,255,255,0.06)',
      opacity: 0, transition: 'opacity 0.15s ease',
    }}>
      {!isDone && (
        <button onClick={e => { e.stopPropagation(); onMarkDone(); }} title="Mark complete"
          className="fl-qa-btn fl-qa-done"
          style={{ width: 28, height: 28, borderRadius: 7, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4B5263', transition: 'all 0.12s ease' }}>
          <CheckCircle2 size={13} />
        </button>
      )}
      <button onClick={e => { e.stopPropagation(); onEdit(); }} title="Edit task"
        className="fl-qa-btn fl-qa-edit"
        style={{ width: 28, height: 28, borderRadius: 7, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4B5263', transition: 'all 0.12s ease' }}>
        <Edit2 size={12} />
      </button>
      <button onClick={e => { e.stopPropagation(); onDelete(); }} title="Delete task"
        className="fl-qa-btn fl-qa-delete"
        style={{ width: 28, height: 28, borderRadius: 7, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4B5263', transition: 'all 0.12s ease' }}>
        <Trash2 size={12} />
      </button>
    </div>
  );
}

// ─── Subtask theme tokens ─────────────────────────────────────────────────────
function stTheme(isLight) {
  return isLight ? {
    containerBg:   'rgba(248,246,255,0.97)',
    containerBdr:  'rgba(196,181,253,0.28)',
    headerBdr:     'rgba(196,181,253,0.22)',
    treeLine:      'rgba(196,181,253,0.55)',
    rowHovBg:      'rgba(124,108,242,0.045)',
    cbBdrResting:  'rgba(196,181,253,0.7)',
    cbDoneBg:      'rgba(63,185,80,0.1)',
    titleActive:   '#1E293B',
    titleDone:     '#94A3B8',
    metaText:      '#94A3B8',
    actionC:       '#CBD5E1',
    actionHovC:    '#475569',
    editHovBg:     'rgba(124,108,242,0.08)',
    delHovBg:      'rgba(248,113,113,0.08)',
    delHovC:       '#EF4444',
    inputPlhC:     '#C4B5FD',
    inputFocusBg:  'rgba(124,108,242,0.03)',
    inputFocusBdr: 'rgba(124,108,242,0.3)',
    progressTrack: 'rgba(196,181,253,0.3)',
    hintC:         '#C4B5FD',
    sectionLabel:  '#9CA3AF',
    badgeBg:       'rgba(124,108,242,0.1)',
    badgeC:        '#7c6cf2',
    badgeBdr:      'rgba(124,108,242,0.22)',
    emptyC:        '#C4B5FD',
    addRowHovBg:   'rgba(124,108,242,0.035)',
  } : {
    containerBg:   'rgba(5,7,15,0.6)',
    containerBdr:  'rgba(42,47,58,0.65)',
    headerBdr:     'rgba(42,47,58,0.5)',
    treeLine:      'rgba(42,47,58,0.85)',
    rowHovBg:      'rgba(255,255,255,0.025)',
    cbBdrResting:  '#3A404F',
    cbDoneBg:      'rgba(63,185,80,0.12)',
    titleActive:   '#C4C8E0',
    titleDone:     '#3D4458',
    metaText:      '#4B5568',
    actionC:       '#2D3448',
    actionHovC:    '#8A96B0',
    editHovBg:     'rgba(124,108,242,0.12)',
    delHovBg:      'rgba(248,113,113,0.12)',
    delHovC:       '#F87171',
    inputPlhC:     '#2D3448',
    inputFocusBg:  'rgba(124,108,242,0.06)',
    inputFocusBdr: 'rgba(124,108,242,0.35)',
    progressTrack: 'rgba(42,47,58,0.9)',
    hintC:         '#3A404F',
    sectionLabel:  '#4B5568',
    badgeBg:       'rgba(124,108,242,0.14)',
    badgeC:        '#9D8FF5',
    badgeBdr:      'rgba(124,108,242,0.22)',
    emptyC:        '#2D3448',
    addRowHovBg:   'rgba(255,255,255,0.018)',
  };
}

// ─── Subtask Row ──────────────────────────────────────────────────────────────
function SubtaskRow({ sub, onToggle, onDelete, onUpdateTitle, isLast, T }) {
  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState(sub.title);
  const [hovered, setHovered] = useState(false);
  const inputRef = useRef(null);
  const isDone   = sub.status === 'done';

  useEffect(() => { if (editing && inputRef.current) inputRef.current.focus(); }, [editing]);

  const commitEdit = () => {
    const v = editVal.trim();
    if (v && v !== sub.title) onUpdateTitle(sub, v);
    else setEditVal(sub.title);
    setEditing(false);
  };

  const due = fmtDue(sub.due_date);
  const pri = PRIORITY_OPTIONS.find(p => p.value === sub.priority);
  const statusOpt = STATUS_OPTIONS.find(o => o.value === (sub.status || 'todo'));

  return (
    <div
      style={{ display: 'flex', alignItems: 'stretch', position: 'relative' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Tree connector column */}
      <div style={{ width: 24, flexShrink: 0, position: 'relative' }}>
        {/* Vertical trunk (doesn't reach bottom on last row) */}
        {!isLast && (
          <div style={{
            position: 'absolute', left: 10, top: 0, bottom: 0,
            width: 1.5, background: T.treeLine,
          }} />
        )}
        {isLast && (
          <div style={{
            position: 'absolute', left: 10, top: 0, bottom: '50%',
            width: 1.5, background: T.treeLine,
          }} />
        )}
        {/* Horizontal arm */}
        <div style={{
          position: 'absolute', left: 10, top: '50%',
          width: 10, height: 1.5, background: T.treeLine,
          transform: 'translateY(-50%)',
        }} />
      </div>

      {/* Row body */}
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', gap: 7,
        padding: '6px 8px 6px 2px', borderRadius: 8, margin: '1px 0',
        background: hovered ? T.rowHovBg : 'transparent',
        transition: 'background 0.1s ease',
        minWidth: 0,
      }}>
        {/* Checkbox */}
        <button
          onClick={e => { e.stopPropagation(); onToggle(sub); }}
          style={{
            width: 15, height: 15, borderRadius: 4, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: `1.5px solid ${isDone ? '#3fb950' : T.cbBdrResting}`,
            background: isDone ? T.cbDoneBg : 'transparent',
            cursor: 'pointer', transition: 'all 0.15s ease',
            boxShadow: isDone ? '0 0 6px rgba(63,185,80,0.25)' : 'none',
          }}
        >
          {isDone && <Check size={7} style={{ color: '#3fb950' }} strokeWidth={2.5} />}
        </button>

        {/* Priority micro-dot */}
        {pri && !isDone && (
          <span title={`${pri.label} priority`} style={{
            width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
            background: pri.color, boxShadow: `0 0 5px ${pri.color}80`,
          }} />
        )}

        {/* Title */}
        {editing ? (
          <input
            ref={inputRef}
            value={editVal}
            onChange={e => setEditVal(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={e => {
              if (e.key === 'Enter')  { e.preventDefault(); commitEdit(); }
              if (e.key === 'Escape') { setEditVal(sub.title); setEditing(false); }
            }}
            onClick={e => e.stopPropagation()}
            style={{
              flex: 1, background: 'transparent', border: 'none',
              borderBottom: '1px solid rgba(124,108,242,0.5)',
              outline: 'none', fontSize: 12, color: T.titleActive,
              padding: '1px 0', minWidth: 0,
            }}
          />
        ) : (
          <span
            onDoubleClick={e => { e.stopPropagation(); setEditing(true); }}
            title={`Double-click to edit`}
            style={{
              flex: 1, fontSize: 12, cursor: 'default', minWidth: 0,
              color: isDone ? T.titleDone : T.titleActive,
              fontWeight: isDone ? 400 : 500,
              textDecoration: isDone ? 'line-through' : 'none',
              textDecorationColor: T.titleDone,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              opacity: isDone ? 0.75 : 1,
              transition: 'opacity 0.1s, color 0.1s',
            }}
          >
            {sub.title}
          </span>
        )}

        {/* Meta badges — right-aligned */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, marginLeft: 4 }}>
          {due && !isDone && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 3,
              padding: '2px 6px', borderRadius: 5, fontSize: 9.5, fontWeight: 600,
              color: due.color, background: `${due.color}12`, border: `1px solid ${due.color}28`,
              whiteSpace: 'nowrap',
            }}>
              <Calendar size={8} style={{ flexShrink: 0 }} />
              {due.label}
            </span>
          )}
          {statusOpt && sub.status !== 'todo' && !isDone && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 3,
              padding: '2px 6px', borderRadius: 5, fontSize: 9.5, fontWeight: 600,
              color: statusOpt.color, background: `${statusOpt.color}0f`, border: `1px solid ${statusOpt.color}28`,
              whiteSpace: 'nowrap',
            }}>
              <span style={{ width: 4, height: 4, borderRadius: '50%', background: statusOpt.color, flexShrink: 0, boxShadow: `0 0 4px ${statusOpt.color}80` }} />
              {statusOpt.label}
            </span>
          )}
          {isDone && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 3,
              padding: '2px 6px', borderRadius: 5, fontSize: 9, fontWeight: 600,
              color: '#3fb950', background: 'rgba(63,185,80,0.08)', border: '1px solid rgba(63,185,80,0.22)',
              whiteSpace: 'nowrap',
            }}>
              <Check size={7} strokeWidth={2.5} />
              Done
            </span>
          )}
        </div>

        {/* Hover actions */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0,
          opacity: hovered ? 1 : 0,
          transition: 'opacity 0.12s ease',
        }}>
          {!isDone && (
            <button
              onClick={e => { e.stopPropagation(); setEditing(true); }}
              title="Edit subtask"
              className="fl-sub-action-btn"
              style={{
                width: 22, height: 22, borderRadius: 5, border: 'none',
                background: 'transparent', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: T.actionC, transition: 'all 0.1s ease',
              }}
              onMouseOver={e => { e.currentTarget.style.color = T.actionHovC; e.currentTarget.style.background = T.editHovBg; }}
              onMouseOut={e  => { e.currentTarget.style.color = T.actionC;    e.currentTarget.style.background = 'transparent'; }}
            >
              <Edit2 size={10} />
            </button>
          )}
          <button
            onClick={e => { e.stopPropagation(); onDelete(sub.id); }}
            title="Delete subtask"
            className="fl-sub-action-btn"
            style={{
              width: 22, height: 22, borderRadius: 5, border: 'none',
              background: 'transparent', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: T.actionC, transition: 'all 0.1s ease',
            }}
            onMouseOver={e => { e.currentTarget.style.color = T.delHovC; e.currentTarget.style.background = T.delHovBg; }}
            onMouseOut={e  => { e.currentTarget.style.color = T.actionC; e.currentTarget.style.background = 'transparent'; }}
          >
            <Trash2 size={9} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Inline Subtask Input ─────────────────────────────────────────────────────
function InlineSubtaskInput({ parentId, onAdd, T }) {
  const [value, setValue] = useState('');
  const [focused, setFocused] = useState(false);
  const inputRef = useRef(null);

  const submit = () => {
    const v = value.trim();
    if (v) { onAdd(parentId, v); setValue(''); }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'stretch', marginTop: 3 }}>
      {/* Connector placeholder — aligns with subtask tree */}
      <div style={{ width: 24, flexShrink: 0 }} />
      {/* Input row */}
      <div
        onClick={() => inputRef.current?.focus()}
        style={{
          flex: 1, display: 'flex', alignItems: 'center', gap: 7,
          padding: '5px 8px 5px 2px', borderRadius: 8,
          background: focused ? T.inputFocusBg : 'transparent',
          border: `1px solid ${focused ? T.inputFocusBdr : 'transparent'}`,
          transition: 'all 0.15s ease', cursor: 'text',
        }}
        onMouseOver={e => { if (!focused) e.currentTarget.style.background = T.addRowHovBg; }}
        onMouseOut={e  => { if (!focused) e.currentTarget.style.background = 'transparent'; }}
      >
        <div style={{
          width: 15, height: 15, borderRadius: 4, flexShrink: 0,
          border: `1.5px dashed ${focused ? 'rgba(124,108,242,0.6)' : T.cbBdrResting}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'border-color 0.15s',
        }}>
          {focused && <Plus size={7} style={{ color: '#7c6cf2' }} strokeWidth={2.5} />}
        </div>
        <input
          ref={inputRef}
          value={value}
          onChange={e => setValue(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => { setFocused(false); submit(); }}
          onKeyDown={e => {
            if (e.key === 'Enter')  { e.preventDefault(); submit(); }
            if (e.key === 'Escape') { setValue(''); inputRef.current?.blur(); }
          }}
          placeholder="Add a subtask…"
          style={{
            flex: 1, background: 'transparent', border: 'none', outline: 'none',
            fontSize: 11.5, color: focused ? T.titleActive : T.inputPlhC,
            padding: 0, transition: 'color 0.12s',
          }}
        />
        {value.length > 0 && (
          <span style={{
            fontSize: 9, color: T.hintC, flexShrink: 0, fontWeight: 700,
            background: 'rgba(124,108,242,0.1)', border: '1px solid rgba(124,108,242,0.22)',
            borderRadius: 4, padding: '1px 5px',
          }}>↵</span>
        )}
      </div>
    </div>
  );
}

// ─── Subtask Expansion Area ───────────────────────────────────────────────────
function SubtaskArea({ subtasks, parentId, expanded, onToggle, onDelete, onUpdateTitle, onAdd }) {
  const isLight = useThemeLight();
  const T       = stTheme(isLight);

  const done   = subtasks.filter(s => s.status === 'done').length;
  const total  = subtasks.length;
  const pct    = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="subtask-expand" style={{ gridTemplateRows: expanded ? '1fr' : '0fr' }}>
      <div style={{ overflow: 'hidden', minHeight: 0 }}>
        <div style={{
          background: T.containerBg,
          borderTop: `1px solid ${T.containerBdr}`,
          padding: '10px 18px 12px 64px',
        }}>

          {/* ── Progress header ── */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            marginBottom: total > 0 ? 10 : 6,
            paddingBottom: total > 0 ? 10 : 0,
            borderBottom: total > 0 ? `1px solid ${T.headerBdr}` : 'none',
          }}>
            <span style={{
              fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '0.09em', color: T.sectionLabel,
            }}>
              Subtasks
            </span>
            {total > 0 && (
              <>
                <div style={{ flex: 1, height: 3, borderRadius: 99, background: T.progressTrack, overflow: 'hidden' }}>
                  <div style={{
                    width: `${pct}%`, height: '100%', borderRadius: 99,
                    background: pct === 100 ? '#3fb950' : 'linear-gradient(90deg,#7c6cf2,#A78BFA)',
                    transition: 'width 0.4s cubic-bezier(0.4,0,0.2,1)',
                    boxShadow: pct > 0 ? `0 0 8px ${pct === 100 ? 'rgba(63,185,80,0.45)' : 'rgba(124,108,242,0.4)'}` : 'none',
                  }} />
                </div>
                <span style={{
                  fontSize: 9.5, fontWeight: 700,
                  color: pct === 100 ? '#3fb950' : T.badgeC,
                  background: T.badgeBg, border: `1px solid ${T.badgeBdr}`,
                  borderRadius: 99, padding: '2px 8px',
                  fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
                }}>
                  {done}/{total}
                </span>
              </>
            )}
          </div>

          {/* ── Subtask tree ── */}
          {/* Trunk line runs down the left of the whole list */}
          <div style={{ position: 'relative', paddingLeft: 0 }}>
            {/* Full-height vertical trunk */}
            {(total > 0) && (
              <div style={{
                position: 'absolute', left: 10, top: 0, bottom: 22,
                width: 1.5, background: T.treeLine, borderRadius: 99,
              }} />
            )}
            {subtasks.map((sub, idx) => (
              <SubtaskRow
                key={sub.id}
                sub={sub}
                isLast={idx === subtasks.length - 1}
                T={T}
                onToggle={onToggle}
                onDelete={onDelete}
                onUpdateTitle={onUpdateTitle}
              />
            ))}
            <InlineSubtaskInput parentId={parentId} onAdd={onAdd} T={T} />
          </div>

        </div>
      </div>
    </div>
  );
}

// ─── Task Modal ───────────────────────────────────────────────────────────────
const TEMPLATES = [
  { label: 'Dev Task',  icon: '⚡', priority: 2, status: 'todo',        keywords: 'dev, backend' },
  { label: 'Design',    icon: '🎨', priority: 3, status: 'todo',        keywords: 'design, ui' },
  { label: 'Research',  icon: '🔍', priority: 3, status: 'todo',        keywords: 'research' },
  { label: 'Bug Fix',   icon: '🐛', priority: 1, status: 'in_progress', keywords: 'bug, fix' },
  { label: 'Meeting',   icon: '📅', priority: 3, status: 'todo',        keywords: 'meeting' },
  { label: 'Feature',   icon: '✨', priority: 2, status: 'todo',        keywords: 'feature' },
];

const TAG_COLORS = ['#818CF8','#34D399','#60A5FA','#FB923C','#A78BFA','#F472B6','#7c6cf2','#FBBF24','#38BDF8','#4ADE80'];
function tagColor(label) {
  let h = 0; for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) >>> 0;
  return TAG_COLORS[h % TAG_COLORS.length];
}

const PRIORITY_DISPLAY = [
  { value: 1, label: 'Critical', emoji: '🔴', color: '#ef4444', bg: 'rgba(239,68,68,0.10)' },
  { value: 2, label: 'High',     emoji: '🟠', color: '#f97316', bg: 'rgba(249,115,22,0.10)' },
  { value: 3, label: 'Medium',   emoji: '🔵', color: '#2f81f7', bg: 'rgba(47,129,247,0.10)' },
  { value: 4, label: 'Low',      emoji: '⚪', color: '#6b7280', bg: 'rgba(107,114,128,0.08)' },
];

// ── Build a complete set of theme tokens from isLight flag ──────────────────
function modalTheme(isLight) {
  return isLight ? {
    // ── Light mode ──────────────────────────────────────────────────────────
    backdrop:        'rgba(80,70,140,0.28)',
    cardBg:          'linear-gradient(160deg,#FAFBFF 0%,#F5F3FF 55%,#EDE9FF 100%)',
    cardBorder:      'rgba(124,108,242,0.28)',
    cardShadow:      '0 0 0 1px rgba(124,108,242,0.14), 0 24px 60px rgba(124,108,242,0.18), 0 8px 24px rgba(0,0,0,0.08)',
    sectionBg:       'rgba(255,255,255,0.72)',
    sectionBorder:   'rgba(124,108,242,0.16)',
    sectionTitle:    '#6B7280',
    labelColor:      '#6B7280',
    headerTitle:     '#0F172A',
    headerSub:       '#6B7280',
    iconBg:          'rgba(124,108,242,0.12)',
    iconBorder:      'rgba(124,108,242,0.25)',
    closeBtnColor:   '#9CA3AF',
    closeBtnHoverBg: 'rgba(15,23,42,0.07)', closeBtnHoverBorder: 'rgba(15,23,42,0.10)', closeBtnHoverColor: '#1E293B',
    tplLabelColor:   '#9CA3AF',
    tplBorder:       'rgba(124,108,242,0.25)', tplText: '#6B7280',
    tplHoverColor:   '#7c6cf2', tplHoverBorder: 'rgba(124,108,242,0.5)', tplHoverBg: 'rgba(124,108,242,0.08)',
    titleBg:         '#FFFFFF', titleBorder: 'rgba(124,108,242,0.3)',
    titleBgFocus:    'rgba(124,108,242,0.04)', titleText: '#0F172A',
    titleBorderBlur: 'rgba(124,108,242,0.25)',
    counterMuted:    '#9CA3AF',
    descBg:          '#FFFFFF', descBorder: 'rgba(124,108,242,0.22)',
    descText:        '#374151', descBorderBlur: 'rgba(124,108,242,0.2)',
    inputBg:         '#FFFFFF', inputBorder: 'rgba(124,108,242,0.25)',
    inputText:       '#1E293B', inputBgFocus: 'rgba(124,108,242,0.04)', inputBorderBlur: 'rgba(124,108,242,0.22)',
    iconColor:       '#9CA3AF',
    selectBg:        '#FFFFFF', selectBorder: 'rgba(124,108,242,0.25)', selectText: '#1E293B',
    colorScheme:     'light',
    btnInactiveBorder: 'rgba(124,108,242,0.22)', btnInactiveText: '#9CA3AF',
    btnHoverBg:      'rgba(124,108,242,0.07)', btnHoverText: '#374151', btnHoverBorder: 'rgba(124,108,242,0.35)',
    statusDotInactive: '#D1D5DB',
    tagHintColor:    '#9CA3AF',
    tagInputBg:      '#FFFFFF', tagInputBorder: 'rgba(124,108,242,0.22)',
    tagInputText:    '#1E293B',
    subtaskItemBg:   'rgba(124,108,242,0.04)', subtaskItemBorder: 'rgba(124,108,242,0.14)',
    subtaskCbBorder: '#D1D5DB', subtaskActiveText: '#1E293B', subtaskDoneText: '#9CA3AF',
    subtaskDeleteResting: '#D1D5DB',
    subtaskInputText: '#9CA3AF', subtaskInputTextFocus: '#1E293B',
    dashedBorder:    'rgba(124,108,242,0.35)',
    footerBg:        'rgba(255,255,255,0.8)', footerBorder: 'rgba(124,108,242,0.16)',
    cancelBorder:    'rgba(15,23,42,0.14)', cancelText: '#4B5563',
    cancelHoverBg:   'rgba(124,108,242,0.07)', cancelHoverText: '#0F172A', cancelHoverBorder: 'rgba(124,108,242,0.35)',
    createMoreText:  '#9CA3AF', createMoreActiveText: '#7c6cf2',
    toggleOffTrack:  'rgba(124,108,242,0.2)', toggleOffBorder: 'rgba(124,108,242,0.3)',
    clientAvBg:      'rgba(124,108,242,0.14)', clientAvColor: '#7c6cf2',
  } : {
    // ── Dark mode ───────────────────────────────────────────────────────────
    backdrop:        'rgba(2,4,10,0.82)',
    cardBg:          'linear-gradient(160deg,#141720 0%,#0F1219 60%,#0C0E16 100%)',
    cardBorder:      'rgba(255,255,255,0.09)',
    cardShadow:      '0 0 0 1px rgba(255,255,255,0.04), 0 40px 80px rgba(0,0,0,0.75), 0 0 80px rgba(124,108,242,0.07)',
    sectionBg:       'rgba(0,0,0,0.25)',
    sectionBorder:   'rgba(255,255,255,0.07)',
    sectionTitle:    '#4B5568',
    labelColor:      '#4B5568',
    headerTitle:     '#E4E8F4',
    headerSub:       '#4B5568',
    iconBg:          'rgba(124,108,242,0.16)',
    iconBorder:      'rgba(124,108,242,0.28)',
    closeBtnColor:   '#4B5568',
    closeBtnHoverBg: 'rgba(255,255,255,0.08)', closeBtnHoverBorder: 'rgba(255,255,255,0.12)', closeBtnHoverColor: '#E4E8F4',
    tplLabelColor:   '#3A404F',
    tplBorder:       'rgba(255,255,255,0.09)', tplText: '#6B7280',
    tplHoverColor:   '#C4B5FD', tplHoverBorder: 'rgba(124,108,242,0.4)', tplHoverBg: 'rgba(124,108,242,0.10)',
    titleBg:         'rgba(4,6,14,0.7)', titleBorder: 'rgba(255,255,255,0.10)',
    titleBgFocus:    'rgba(124,108,242,0.10)', titleText: '#E4E8F4',
    titleBorderBlur: 'rgba(255,255,255,0.09)',
    counterMuted:    '#3A404F',
    descBg:          'rgba(4,6,14,0.6)', descBorder: 'rgba(255,255,255,0.08)',
    descText:        '#C0C8DC', descBorderBlur: 'rgba(255,255,255,0.07)',
    inputBg:         'rgba(4,6,14,0.65)', inputBorder: 'rgba(255,255,255,0.09)',
    inputText:       '#E4E8F4', inputBgFocus: 'rgba(124,108,242,0.12)', inputBorderBlur: 'rgba(255,255,255,0.08)',
    iconColor:       '#4B5568',
    selectBg:        'rgba(4,6,14,0.7)', selectBorder: 'rgba(255,255,255,0.09)', selectText: '#E4E8F4',
    colorScheme:     'dark',
    btnInactiveBorder: 'rgba(255,255,255,0.08)', btnInactiveText: '#6B7280',
    btnHoverBg:      'rgba(255,255,255,0.06)', btnHoverText: '#A0A8BC', btnHoverBorder: 'rgba(255,255,255,0.14)',
    statusDotInactive: '#3A404F',
    tagHintColor:    '#3A404F',
    tagInputBg:      'rgba(4,6,14,0.6)', tagInputBorder: 'rgba(255,255,255,0.08)',
    tagInputText:    '#E4E8F4',
    subtaskItemBg:   'rgba(4,6,14,0.4)', subtaskItemBorder: 'rgba(255,255,255,0.06)',
    subtaskCbBorder: '#3A404F', subtaskActiveText: '#B0BAD0', subtaskDoneText: '#4B5568',
    subtaskDeleteResting: '#3A404F',
    subtaskInputText: '#6B7280', subtaskInputTextFocus: '#B0BAD0',
    dashedBorder:    'rgba(75,82,99,0.5)',
    footerBg:        'rgba(0,0,0,0.28)', footerBorder: 'rgba(255,255,255,0.07)',
    cancelBorder:    'rgba(255,255,255,0.10)', cancelText: '#6B7280',
    cancelHoverBg:   'rgba(255,255,255,0.06)', cancelHoverText: '#C0C8DC', cancelHoverBorder: 'rgba(255,255,255,0.16)',
    createMoreText:  '#4B5568', createMoreActiveText: '#C4B5FD',
    toggleOffTrack:  'rgba(42,47,58,0.9)', toggleOffBorder: 'rgba(255,255,255,0.07)',
    clientAvBg:      'rgba(124,108,242,0.22)', clientAvColor: '#9D8FF5',
  };
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

function TaskModal({ task, projects, clients, user, onClose, onSave }) {
  const isLight = useThemeLight();
  const T       = modalTheme(isLight);

  const [form, setForm] = useState({
    title:          task?.title           || '',
    description:    task?.description     || '',
    projectId:      task?.project_id      || '',
    clientId:       task?.client_id       || '',
    keywords:       task?.keywords        || '',
    status:         task?.status          || 'todo',
    priority:       task?.priority        || 3,
    estimatedHours: task?.estimated_hours || '',
    dueDate: task?.due_date ? new Date(task.due_date * 1000).toISOString().split('T')[0] : '',
  });
  const [createMore,   setCreateMore]   = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [tagInput,     setTagInput]     = useState('');
  const [subtaskInput, setSubtaskInput] = useState('');
  const [subtasks,     setSubtasks]     = useState([]);
  const titleRef   = useRef(null);
  const tagInputRef = useRef(null);

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleProjectChange = (e) => {
    const proj = projects.find(p => p.id === e.target.value);
    setForm(f => ({ ...f, projectId: e.target.value, clientId: proj?.client_id || f.clientId }));
  };

  const tags = form.keywords ? form.keywords.split(',').map(t => t.trim()).filter(Boolean) : [];

  const addTag = (tag) => {
    const v = tag.trim();
    if (!v || tags.includes(v)) { setTagInput(''); return; }
    setForm(f => ({ ...f, keywords: [...tags, v].join(', ') }));
    setTagInput('');
  };
  const removeTag = (tag) => setForm(f => ({ ...f, keywords: tags.filter(t => t !== tag).join(', ') }));

  const applyTemplate = (tpl) => {
    setForm(f => ({ ...f, priority: tpl.priority, status: tpl.status, keywords: tpl.keywords }));
    setTimeout(() => titleRef.current?.focus(), 50);
  };

  const addSubtask = () => {
    const v = subtaskInput.trim();
    if (!v) return;
    setSubtasks(s => [...s, { id: Date.now(), title: v, done: false }]);
    setSubtaskInput('');
  };

  const save = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    const dueUnix = form.dueDate ? Math.floor(new Date(form.dueDate).getTime() / 1000) : null;
    await onSave({ ...form, dueDate: dueUnix, subtasks });
    setSaving(false);
    if (createMore && !task) {
      setForm({ title: '', description: '', projectId: '', clientId: '', keywords: '', status: 'todo', priority: 3, estimatedHours: '', dueDate: '' });
      setSubtasks([]); setTagInput('');
      setTimeout(() => titleRef.current?.focus(), 50);
    } else {
      onClose();
    }
  };

  const selectedProject = projects.find(p => p.id === form.projectId);
  const selectedClient  = clients.find(c => c.id === form.clientId);
  const selectedStatus  = STATUS_OPTIONS.find(o => o.value === form.status) || STATUS_OPTIONS[0];
  const dispPri         = PRIORITY_DISPLAY.find(p => p.value === form.priority) || PRIORITY_DISPLAY[2];
  const hasTitle        = !!form.title.trim();

  // Shared focus/blur helpers that use T
  const inputFocus = e => { e.currentTarget.style.borderColor = 'rgba(124,108,242,0.58)'; e.currentTarget.style.background = T.inputBgFocus; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(124,108,242,0.09)'; };
  const inputBlur  = (bg, border) => e => { e.currentTarget.style.borderColor = border; e.currentTarget.style.background = bg; e.currentTarget.style.boxShadow = 'none'; };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: T.backdrop, backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', padding: '16px 16px 84px 16px' }}
      onClick={e => e.target === e.currentTarget && onClose()}>

      <div style={{ width: '100%', maxWidth: 580, maxHeight: '100%', background: T.cardBg, border: `1px solid ${T.cardBorder}`, borderRadius: 20, boxShadow: T.cardShadow, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* ── Top accent stripe ── */}
        <div style={{ height: 2, flexShrink: 0, background: 'linear-gradient(90deg, transparent, #7c6cf290 30%, #7c6cf2 50%, #7c6cf290 70%, transparent)' }} />

        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px 12px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: T.iconBg, border: `1px solid ${T.iconBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CheckSquare size={14} style={{ color: '#7c6cf2' }} />
            </div>
            <div>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: T.headerTitle, margin: 0, letterSpacing: '-0.02em' }}>{task ? 'Edit Task' : 'New Task'}</h3>
              <p style={{ fontSize: 10.5, color: T.headerSub, margin: 0, marginTop: 1 }}>{task ? 'Update task details' : 'Add to your workflow'}</p>
            </div>
          </div>
          <button onClick={onClose}
            style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, background: 'transparent', border: '1px solid transparent', cursor: 'pointer', color: T.closeBtnColor, transition: 'all 0.12s ease' }}
            onMouseOver={e => { e.currentTarget.style.color = T.closeBtnHoverColor; e.currentTarget.style.background = T.closeBtnHoverBg; e.currentTarget.style.borderColor = T.closeBtnHoverBorder; }}
            onMouseOut={e  => { e.currentTarget.style.color = T.closeBtnColor; e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; }}>
            <X size={14} />
          </button>
        </div>

        {/* ── Quick Templates ── */}
        {!task && (
          <div style={{ padding: '0 20px 12px', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflowX: 'auto' }}>
              <span style={{ fontSize: 9.5, color: T.tplLabelColor, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', flexShrink: 0 }}>Template:</span>
              {TEMPLATES.map(tpl => (
                <button key={tpl.label} onClick={() => applyTemplate(tpl)}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 6, fontSize: 10.5, fontWeight: 500, border: `1px solid ${T.tplBorder}`, background: 'transparent', color: T.tplText, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.12s ease', flexShrink: 0 }}
                  onMouseOver={e => { e.currentTarget.style.color = T.tplHoverColor; e.currentTarget.style.borderColor = T.tplHoverBorder; e.currentTarget.style.background = T.tplHoverBg; }}
                  onMouseOut={e  => { e.currentTarget.style.color = T.tplText; e.currentTarget.style.borderColor = T.tplBorder; e.currentTarget.style.background = 'transparent'; }}>
                  {tpl.icon} {tpl.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Scrollable Body ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 4px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 4 }}>

            {/* ── Title ── */}
            <div>
              <p style={{ fontSize: 9.5, fontWeight: 700, color: T.labelColor, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 4 }}>
                Task Title <span style={{ color: '#7c6cf2', fontSize: 10 }}>*</span>
              </p>
              <div style={{ position: 'relative' }}>
                <input ref={titleRef} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="What needs to be done?" autoFocus maxLength={200}
                  style={{ width: '100%', background: T.titleBg, border: `1px solid ${T.titleBorder}`, borderRadius: 11, padding: '11px 42px 11px 14px', fontSize: 15, fontWeight: 600, color: T.titleText, outline: 'none', boxSizing: 'border-box', letterSpacing: '-0.02em', transition: 'border-color 0.15s, background 0.15s, box-shadow 0.15s', colorScheme: T.colorScheme }}
                  onFocus={e => { e.currentTarget.style.borderColor = 'rgba(124,108,242,0.6)'; e.currentTarget.style.background = T.titleBgFocus; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(124,108,242,0.09)'; }}
                  onBlur={e  => { e.currentTarget.style.borderColor = T.titleBorderBlur; e.currentTarget.style.background = T.titleBg; e.currentTarget.style.boxShadow = 'none'; }}
                />
                {form.title.length > 0 && (
                  <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 9, color: form.title.length > 180 ? '#F87171' : T.counterMuted, fontVariantNumeric: 'tabular-nums', pointerEvents: 'none' }}>
                    {form.title.length}/200
                  </span>
                )}
              </div>
            </div>

            {/* ── Description ── */}
            <div>
              <p style={{ fontSize: 9.5, fontWeight: 700, color: T.labelColor, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px' }}>Description</p>
              <textarea value={form.description} onChange={set('description')}
                placeholder="Add context, acceptance criteria, or notes…" rows={3}
                style={{ width: '100%', background: T.descBg, border: `1px solid ${T.descBorder}`, borderRadius: 10, padding: '9px 12px', fontSize: 12.5, color: T.descText, outline: 'none', resize: 'vertical', boxSizing: 'border-box', lineHeight: 1.65, minHeight: 72, transition: 'border-color 0.15s, box-shadow 0.15s', colorScheme: T.colorScheme }}
                onFocus={e => { e.currentTarget.style.borderColor = 'rgba(124,108,242,0.52)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(124,108,242,0.08)'; }}
                onBlur={e  => { e.currentTarget.style.borderColor = T.descBorderBlur; e.currentTarget.style.boxShadow = 'none'; }}
              />
            </div>

            {/* ── Properties: Priority + Status ── */}
            <div style={{ background: T.sectionBg, border: `1px solid ${T.sectionBorder}`, borderRadius: 12 }}>
              <div style={{ padding: '9px 14px 0' }}>
                <span style={{ fontSize: 9.5, fontWeight: 700, color: T.sectionTitle, textTransform: 'uppercase', letterSpacing: '0.09em' }}>Properties</span>
              </div>
              <div style={{ padding: '8px 14px 12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {/* Priority */}
                <div>
                  <p style={{ fontSize: 9.5, fontWeight: 700, color: T.labelColor, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px' }}>Priority</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
                    {PRIORITY_DISPLAY.map(opt => {
                      const active = form.priority === opt.value;
                      return (
                        <button key={opt.value} onClick={() => setForm(f => ({ ...f, priority: opt.value }))}
                          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 8, fontSize: 11.5, fontWeight: active ? 600 : 400, border: `1px solid ${active ? `${opt.color}45` : T.btnInactiveBorder}`, background: active ? opt.bg : 'transparent', color: active ? opt.color : T.btnInactiveText, cursor: 'pointer', transition: 'all 0.12s ease', boxShadow: active ? `0 0 0 1px ${opt.color}20` : 'none' }}
                          onMouseOver={e => { if (!active) { e.currentTarget.style.background = T.btnHoverBg; e.currentTarget.style.color = T.btnHoverText; e.currentTarget.style.borderColor = T.btnHoverBorder; }}}
                          onMouseOut={e  => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.btnInactiveText; e.currentTarget.style.borderColor = T.btnInactiveBorder; }}}>
                          <span style={{ fontSize: 13, lineHeight: 1 }}>{opt.emoji}</span>{opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {/* Status */}
                <div>
                  <p style={{ fontSize: 9.5, fontWeight: 700, color: T.labelColor, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px' }}>Status</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {STATUS_OPTIONS.filter(o => o.value !== 'archived').map(opt => {
                      const active = form.status === opt.value;
                      return (
                        <button key={opt.value} onClick={() => setForm(f => ({ ...f, status: opt.value }))}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 8, fontSize: 11.5, fontWeight: active ? 600 : 400, border: `1px solid ${active ? `${opt.color}45` : T.btnInactiveBorder}`, background: active ? `${opt.color}0f` : 'transparent', color: active ? opt.color : T.btnInactiveText, cursor: 'pointer', transition: 'all 0.12s ease', textAlign: 'left' }}
                          onMouseOver={e => { if (!active) { e.currentTarget.style.background = T.btnHoverBg; e.currentTarget.style.color = T.btnHoverText; e.currentTarget.style.borderColor = T.btnHoverBorder; }}}
                          onMouseOut={e  => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.btnInactiveText; e.currentTarget.style.borderColor = T.btnInactiveBorder; }}}>
                          <span style={{ width: 5, height: 5, borderRadius: '50%', background: active ? opt.color : T.statusDotInactive, flexShrink: 0, boxShadow: active ? `0 0 5px ${opt.color}` : 'none', transition: 'all 0.12s' }} />
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Assignment: Project + Client ── */}
            <div style={{ background: T.sectionBg, border: `1px solid ${T.sectionBorder}`, borderRadius: 12 }}>
              <div style={{ padding: '9px 14px 0' }}>
                <span style={{ fontSize: 9.5, fontWeight: 700, color: T.sectionTitle, textTransform: 'uppercase', letterSpacing: '0.09em' }}>Assignment</span>
              </div>
              <div style={{ padding: '8px 14px 12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <p style={{ fontSize: 9.5, fontWeight: 700, color: T.labelColor, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px' }}>Project</p>
                  <div style={{ position: 'relative' }}>
                    {selectedProject && (
                      <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 8, height: 8, borderRadius: 2, background: selectedProject.color || '#818CF8', zIndex: 1, pointerEvents: 'none', boxShadow: `0 0 5px ${selectedProject.color || '#818CF8'}60` }} />
                    )}
                    <select value={form.projectId} onChange={handleProjectChange}
                      style={{ width: '100%', background: T.selectBg, border: `1px solid ${T.selectBorder}`, borderRadius: 9, padding: `8px 28px 8px ${selectedProject ? 26 : 10}px`, fontSize: 12, color: T.selectText, outline: 'none', appearance: 'none', cursor: 'pointer', boxSizing: 'border-box', transition: 'border-color 0.15s, box-shadow 0.15s', colorScheme: T.colorScheme }}
                      onFocus={e => { e.currentTarget.style.borderColor = 'rgba(124,108,242,0.55)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(124,108,242,0.08)'; }}
                      onBlur={e  => { e.currentTarget.style.borderColor = T.selectBorder; e.currentTarget.style.boxShadow = 'none'; }}>
                      <option value="">No project</option>
                      {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <ChevronDown size={10} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: T.iconColor, pointerEvents: 'none' }} />
                  </div>
                </div>
                <div>
                  <p style={{ fontSize: 9.5, fontWeight: 700, color: T.labelColor, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px' }}>Client</p>
                  <div style={{ position: 'relative' }}>
                    {selectedClient && (
                      <div style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', width: 18, height: 18, borderRadius: 5, background: T.clientAvBg, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1, pointerEvents: 'none' }}>
                        <span style={{ fontSize: 8, fontWeight: 800, color: T.clientAvColor }}>{selectedClient.name[0].toUpperCase()}</span>
                      </div>
                    )}
                    <select value={form.clientId} onChange={set('clientId')}
                      style={{ width: '100%', background: T.selectBg, border: `1px solid ${T.selectBorder}`, borderRadius: 9, padding: `8px 28px 8px ${selectedClient ? 32 : 10}px`, fontSize: 12, color: T.selectText, outline: 'none', appearance: 'none', cursor: 'pointer', boxSizing: 'border-box', transition: 'border-color 0.15s, box-shadow 0.15s', colorScheme: T.colorScheme }}
                      onFocus={e => { e.currentTarget.style.borderColor = 'rgba(124,108,242,0.55)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(124,108,242,0.08)'; }}
                      onBlur={e  => { e.currentTarget.style.borderColor = T.selectBorder; e.currentTarget.style.boxShadow = 'none'; }}>
                      <option value="">No client</option>
                      {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <ChevronDown size={10} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: T.iconColor, pointerEvents: 'none' }} />
                  </div>
                </div>
              </div>
            </div>

            {/* ── Scheduling: Due + Hours ── */}
            <div style={{ background: T.sectionBg, border: `1px solid ${T.sectionBorder}`, borderRadius: 12 }}>
              <div style={{ padding: '9px 14px 0' }}>
                <span style={{ fontSize: 9.5, fontWeight: 700, color: T.sectionTitle, textTransform: 'uppercase', letterSpacing: '0.09em' }}>Scheduling</span>
              </div>
              <div style={{ padding: '8px 14px 12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <p style={{ fontSize: 9.5, fontWeight: 700, color: T.labelColor, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px' }}>Due Date</p>
                  <div style={{ position: 'relative' }}>
                    <Calendar size={11} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: T.iconColor, pointerEvents: 'none', zIndex: 1 }} />
                    <input type="date" value={form.dueDate} onChange={set('dueDate')}
                      style={{ width: '100%', background: T.inputBg, border: `1px solid ${T.inputBorder}`, borderRadius: 9, padding: '8px 10px 8px 28px', fontSize: 12, color: form.dueDate ? T.inputText : T.iconColor, outline: 'none', boxSizing: 'border-box', colorScheme: T.colorScheme, transition: 'border-color 0.15s, box-shadow 0.15s' }}
                      onFocus={e => { e.currentTarget.style.borderColor = 'rgba(124,108,242,0.55)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(124,108,242,0.08)'; }}
                      onBlur={e  => { e.currentTarget.style.borderColor = T.inputBorderBlur; e.currentTarget.style.boxShadow = 'none'; }}
                    />
                  </div>
                </div>
                <div>
                  <p style={{ fontSize: 9.5, fontWeight: 700, color: T.labelColor, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px' }}>Estimated Hours</p>
                  <div style={{ position: 'relative' }}>
                    <Clock size={11} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: T.iconColor, pointerEvents: 'none' }} />
                    <input type="number" min="0" step="0.5" value={form.estimatedHours} onChange={set('estimatedHours')} placeholder="e.g. 2.5"
                      style={{ width: '100%', background: T.inputBg, border: `1px solid ${T.inputBorder}`, borderRadius: 9, padding: '8px 10px 8px 28px', fontSize: 12, color: T.inputText, outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s, box-shadow 0.15s', colorScheme: T.colorScheme }}
                      onFocus={inputFocus}
                      onBlur={inputBlur(T.inputBg, T.inputBorderBlur)}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* ── Tags ── */}
            <div style={{ background: T.sectionBg, border: `1px solid ${T.sectionBorder}`, borderRadius: 12 }}>
              <div style={{ padding: '9px 14px 0' }}>
                <span style={{ fontSize: 9.5, fontWeight: 700, color: T.sectionTitle, textTransform: 'uppercase', letterSpacing: '0.09em' }}>Tags</span>
              </div>
              <div style={{ padding: '8px 14px 12px' }}>
                {tags.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
                    {tags.map(tag => {
                      const c = tagColor(tag);
                      return (
                        <span key={tag} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 500, background: `${c}16`, border: `1px solid ${c}30`, color: c }}>
                          {tag}
                          <button onClick={() => removeTag(tag)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: `${c}80`, padding: 0, lineHeight: 1, fontSize: 14, display: 'flex', alignItems: 'center' }}
                            onMouseOver={e => e.currentTarget.style.color = c}
                            onMouseOut={e  => e.currentTarget.style.color = `${c}80`}>×</button>
                        </span>
                      );
                    })}
                  </div>
                )}
                <div style={{ position: 'relative' }}>
                  <Tag size={11} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: T.iconColor, pointerEvents: 'none' }} />
                  <input ref={tagInputRef} value={tagInput} onChange={e => setTagInput(e.target.value)}
                    placeholder="Type a tag and press Enter…"
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(tagInput); }
                      if (e.key === 'Backspace' && !tagInput && tags.length) removeTag(tags[tags.length - 1]);
                    }}
                    style={{ width: '100%', background: T.tagInputBg, border: `1px solid ${T.tagInputBorder}`, borderRadius: 9, padding: '7px 10px 7px 28px', fontSize: 12, color: T.tagInputText, outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s, box-shadow 0.15s' }}
                    onFocus={e => { e.currentTarget.style.borderColor = 'rgba(124,108,242,0.5)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(124,108,242,0.07)'; }}
                    onBlur={e  => { e.currentTarget.style.borderColor = T.tagInputBorder; e.currentTarget.style.boxShadow = 'none'; if (tagInput.trim()) addTag(tagInput); }}
                  />
                </div>
                <p style={{ fontSize: 10, color: T.tagHintColor, margin: '5px 0 0' }}>Press Enter or comma to add · Backspace removes last</p>
              </div>
            </div>

            {/* ── Subtasks ── */}
            <div style={{ background: T.sectionBg, border: `1px solid ${T.sectionBorder}`, borderRadius: 12 }}>
              <div style={{ padding: '9px 14px 0' }}>
                <span style={{ fontSize: 9.5, fontWeight: 700, color: T.sectionTitle, textTransform: 'uppercase', letterSpacing: '0.09em' }}>
                  Subtasks{subtasks.length > 0 ? ` · ${subtasks.filter(s => s.done).length}/${subtasks.length}` : ''}
                </span>
              </div>
              <div style={{ padding: '8px 14px 12px' }}>
                {subtasks.length > 0 && (
                  <div style={{ marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {subtasks.map((sub, i) => (
                      <div key={sub.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: 8, background: sub.done ? 'transparent' : T.subtaskItemBg, border: `1px solid ${T.subtaskItemBorder}`, transition: 'background 0.12s' }}>
                        <button onClick={() => setSubtasks(s => s.map((x, j) => j === i ? { ...x, done: !x.done } : x))}
                          style={{ width: 14, height: 14, borderRadius: 4, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1.5px solid ${sub.done ? '#3fb950' : T.subtaskCbBorder}`, background: sub.done ? 'rgba(63,185,80,0.12)' : 'transparent', cursor: 'pointer', transition: 'all 0.12s ease' }}>
                          {sub.done && <Check size={7} style={{ color: '#3fb950' }} strokeWidth={3} />}
                        </button>
                        <span style={{ flex: 1, fontSize: 11.5, color: sub.done ? T.subtaskDoneText : T.subtaskActiveText, textDecoration: sub.done ? 'line-through' : 'none' }}>{sub.title}</span>
                        <button onClick={() => setSubtasks(s => s.filter((_, j) => j !== i))}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.subtaskDeleteResting, padding: 0, display: 'flex', alignItems: 'center', transition: 'color 0.12s' }}
                          onMouseOver={e => e.currentTarget.style.color = '#F87171'}
                          onMouseOut={e  => e.currentTarget.style.color = T.subtaskDeleteResting}>
                          <X size={10} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 14, height: 14, borderRadius: 4, border: `1.5px dashed ${T.dashedBorder}`, flexShrink: 0 }} />
                  <input value={subtaskInput} onChange={e => setSubtaskInput(e.target.value)}
                    placeholder="Add a subtask…"
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSubtask(); } }}
                    style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 11.5, color: T.subtaskInputText, padding: 0, transition: 'color 0.12s' }}
                    onFocus={e => e.currentTarget.style.color = T.subtaskInputTextFocus}
                    onBlur={e  => { e.currentTarget.style.color = T.subtaskInputText; addSubtask(); }}
                  />
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* ── Footer ── */}
        <div style={{ padding: '12px 20px 18px', borderTop: `1px solid ${T.footerBorder}`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, background: T.footerBg }}>

          {/* Live summary strip */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, overflow: 'hidden', minWidth: 0 }}>
            <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 5, background: `${dispPri.color}16`, border: `1px solid ${dispPri.color}30`, color: dispPri.color, fontWeight: 600, whiteSpace: 'nowrap' }}>
              {dispPri.emoji} {dispPri.label}
            </span>
            <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 5, background: `${selectedStatus.color}12`, border: `1px solid ${selectedStatus.color}30`, color: selectedStatus.color, fontWeight: 600, whiteSpace: 'nowrap' }}>
              {selectedStatus.label}
            </span>
            {!task && (
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
            <button onClick={save} disabled={saving || !hasTitle}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', background: hasTitle ? '#7c6cf2' : (isLight ? 'rgba(124,108,242,0.15)' : 'rgba(124,108,242,0.22)'), border: `1px solid ${hasTitle ? '#9D8FF5' : 'rgba(124,108,242,0.2)'}`, borderRadius: 9, color: hasTitle ? '#fff' : (isLight ? 'rgba(124,108,242,0.45)' : 'rgba(255,255,255,0.3)'), fontSize: 12.5, fontWeight: 600, cursor: hasTitle ? 'pointer' : 'default', transition: 'all 0.12s ease', boxShadow: hasTitle ? '0 2px 12px rgba(124,108,242,0.32)' : 'none', letterSpacing: '-0.01em' }}
              onMouseOver={e => { if (hasTitle && !saving) { e.currentTarget.style.background = '#9D8FF5'; e.currentTarget.style.boxShadow = '0 4px 18px rgba(124,108,242,0.45)'; }}}
              onMouseOut={e  => { if (hasTitle) { e.currentTarget.style.background = '#7c6cf2'; e.currentTarget.style.boxShadow = '0 2px 12px rgba(124,108,242,0.32)'; }}}>
              <Check size={13} strokeWidth={2.5} />
              {saving ? 'Saving…' : task ? 'Save Changes' : 'Create Task'}
            </button>
          </div>
        </div>

      </div>

      <style>{`
        /* ── Modal body scrollbar ── */
        .fl-task-modal-backdrop div::-webkit-scrollbar { width: 4px; }
        .fl-task-modal-backdrop div::-webkit-scrollbar-thumb { background: rgba(124,108,242,0.28); border-radius: 99px; }
      `}</style>
    </div>
  );
}

// ─── Quick Filter Chip ────────────────────────────────────────────────────────
function QChip({ label, count, active, color, onClick }) {
  const c = color || '#818CF8';
  return (
    <button className={`fl-task-chip ${active ? 'fl-task-chip-active' : ''}`} onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 8,
      fontSize: 11, fontWeight: active ? 600 : 400, cursor: 'pointer', border: '1px solid',
      transition: 'all 0.15s cubic-bezier(0.4,0,0.2,1)',
      color:       active ? c : '#6B7280',
      background:  active ? `${c}18` : 'transparent',
      borderColor: active ? `${c}40` : 'rgba(42,47,58,0.8)',
      boxShadow:   active ? `0 0 0 1px ${c}18, 0 2px 8px ${c}15` : 'none',
    }}>
      {active && <span style={{ width: 5, height: 5, borderRadius: '50%', background: c, flexShrink: 0, boxShadow: `0 0 5px ${c}` }} />}
      {label}
      {count > 0 && (
        <span style={{
          fontSize: 9.5, fontWeight: 700, padding: '1px 5px', borderRadius: 99,
          background: active ? `${c}25` : 'rgba(42,47,58,0.9)',
          color: active ? c : '#4B5263',
        }}>
          {count}
        </span>
      )}
    </button>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────
function EmptyState({ onCreate, onImport }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, padding: '80px 0' }}>
      <div style={{
        width: 64, height: 64, borderRadius: 20, marginBottom: 20,
        background: 'linear-gradient(135deg, rgba(124,108,242,0.14) 0%, rgba(167,139,250,0.06) 100%)',
        border: '1px solid rgba(124,108,242,0.2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 8px 32px rgba(124,108,242,0.1)',
      }}>
        <CheckSquare size={26} style={{ color: '#7c6cf2' }} />
      </div>
      <h3 style={{ fontSize: 16, fontWeight: 700, color: '#EAEAF0', marginBottom: 8, letterSpacing: '-0.02em' }}>No tasks yet</h3>
      <p style={{ fontSize: 12.5, color: '#6B7280', textAlign: 'center', maxWidth: 300, marginBottom: 24, lineHeight: 1.65 }}>
        Break your projects into trackable tasks and log time directly against them.
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={onCreate}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 20px', background: '#7c6cf2', border: 'none', borderRadius: 10, color: '#fff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', boxShadow: '0 4px 16px rgba(124,108,242,0.32)' }}
          onMouseOver={e => { e.currentTarget.style.background = '#9D8FF5'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(124,108,242,0.42)'; }}
          onMouseOut={e  => { e.currentTarget.style.background = '#7c6cf2'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(124,108,242,0.32)'; }}>
          <Plus size={14} />Create Task
        </button>
        <button onClick={onImport}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', background: 'transparent', border: '1px solid rgba(42,47,58,0.9)', borderRadius: 10, color: '#9CA3AF', fontSize: 12.5, fontWeight: 500, cursor: 'pointer' }}
          onMouseOver={e => { e.currentTarget.style.color = '#EAEAF0'; e.currentTarget.style.borderColor = 'rgba(124,108,242,0.35)'; }}
          onMouseOut={e  => { e.currentTarget.style.color = '#9CA3AF'; e.currentTarget.style.borderColor = 'rgba(42,47,58,0.9)'; }}>
          <Upload size={13} />Import CSV
        </button>
      </div>
    </div>
  );
}

// ─── Stats Card ───────────────────────────────────────────────────────────────
function StatsCard({ label, value, color, icon: Icon, onClick, active }) {
  const c = color || '#818CF8';
  return (
    <button onClick={onClick}
      style={{
        flex: 1, minWidth: 0,
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 16px', borderRadius: 12,
        background: active ? `${c}12` : 'rgba(255,255,255,0.025)',
        border: `1px solid ${active ? `${c}38` : 'rgba(42,47,58,0.75)'}`,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.16s ease', textAlign: 'left',
        boxShadow: active ? `0 0 0 1px ${c}18, 0 4px 16px ${c}12` : 'none',
      }}
      onMouseOver={e => { if (onClick) { e.currentTarget.style.background = `${c}12`; e.currentTarget.style.borderColor = `${c}32`; e.currentTarget.style.boxShadow = `0 4px 16px ${c}12`; }}}
      onMouseOut={e  => { if (onClick) { e.currentTarget.style.background = active ? `${c}12` : 'rgba(255,255,255,0.025)'; e.currentTarget.style.borderColor = active ? `${c}38` : 'rgba(42,47,58,0.75)'; e.currentTarget.style.boxShadow = active ? `0 0 0 1px ${c}18, 0 4px 16px ${c}12` : 'none'; }}}
    >
      <div style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, background: `${c}16`, border: `1.5px solid ${c}28`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={18} style={{ color: c }} />
      </div>
      <div>
        <p style={{ fontSize: 22, fontWeight: 700, color: '#EAEAF0', margin: 0, lineHeight: 1, letterSpacing: '-0.04em', fontVariantNumeric: 'tabular-nums' }}>
          {value}
        </p>
        <p style={{ fontSize: 10.5, color: '#6B7280', margin: '4px 0 0', fontWeight: 500, letterSpacing: '0.01em' }}>{label}</p>
      </div>
    </button>
  );
}


// ─── Main Page ────────────────────────────────────────────────────────────────
export default function TasksPage({ user }) {
  const [tasks,         setTasks]         = useState([]);
  const [projects,      setProjects]      = useState([]);
  const [clients,       setClients]       = useState([]);
  const [showModal,     setShowModal]     = useState(false);
  const [editTask,      setEditTask]      = useState(null);
  const [showImport,    setShowImport]    = useState(false);
  const [search,        setSearch]        = useState('');
  const [quickFilter,   setQuickFilter]   = useState('all');
  const [statusFilter,  setStatusFilter]  = useState('');
  const [projectFilter, setProjectFilter] = useState('all');
  const [sortBy,        setSortBy]        = useState('created');
  const [sortDir,       setSortDir]       = useState('desc');
  const [loading,       setLoading]       = useState(true);
  // ── Subtask state ──────────────────────────────────────────────────────────
  const [expandedTasks, setExpandedTasks] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    const [taskList, projList, clientList] = await Promise.all([
      api.listTasks?.({ userId: user.id }),
      api.listProjects?.({ userId: user.id }),
      api.listClients?.({ userId: user.id }),
    ]);
    setTasks(taskList || []);
    setProjects(projList || []);
    setClients(clientList || []);
    setLoading(false);
  }, [user.id]);

  // Lightweight task-only reload used after subtask mutations
  const reloadTasks = useCallback(async () => {
    const list = await api.listTasks?.({ userId: user.id });
    if (list) setTasks(list);
  }, [user.id]);

  useEffect(() => { load(); }, [load]);

  const taskUpdatePayload = (task, overrides = {}) => ({
    taskId: task.id,
    title: task.title || '',
    description: task.description || '',
    projectId: task.project_id || '',
    clientId: task.client_id || '',
    keywords: task.keywords || '',
    dueDate: task.due_date || null,
    status: task.status || 'todo',
    priority: task.priority || 3,
    estimatedHours: task.estimated_hours || '',
    totalSeconds: task.total_seconds || 0,
    ...overrides,
  });

  const handleSave = async (formData) => {
    if (editTask) {
      await api.updateTask?.({ taskId: editTask.id, ...formData });
    } else {
      await api.createTask?.({ userId: user.id, ...formData });
    }
    setEditTask(null);
    await load();
  };

  const markDone = async (task) => {
    await api.updateTask?.(taskUpdatePayload(task, { status: 'done' }));
    setTasks(ts => ts.map(t => t.id === task.id ? { ...t, status: 'done' } : t));
  };

  const del = async (id) => {
    if (!window.confirm('Delete this task?')) return;
    await api.deleteTask?.({ taskId: id });
    setTasks(ts => ts.filter(t => t.id !== id));
  };

  const openEdit = (task) => { setEditTask(task); setShowModal(true); };
  const openNew  = ()     => { setEditTask(null); setShowModal(true); };

  // ── Subtask operations ─────────────────────────────────────────────────────
  const toggleExpand = (taskId) => {
    setExpandedTasks(prev => ({ ...prev, [taskId]: !prev[taskId] }));
  };

  const createSubtask = async (parentId, title) => {
    if (!title.trim()) return;
    // Optimistic add — temp ID replaced on reload
    const tempId = `temp-${Date.now()}`;
    setTasks(prev => [...prev, {
      id: tempId, title: title.trim(), status: 'todo', priority: 3,
      parent_task_id: parentId, created_at: Date.now() / 1000,
    }]);
    // Ensure parent is expanded
    setExpandedTasks(prev => ({ ...prev, [parentId]: true }));
    // Persist
    await api.createTask?.({ userId: user.id, title: title.trim(), parentTaskId: parentId, status: 'todo', priority: 3 });
    // Sync real IDs
    await reloadTasks();
  };

  const toggleSubtaskDone = async (sub) => {
    const newStatus = sub.status === 'done' ? 'todo' : 'done';
    // Optimistic: update subtask + conditionally update parent
    setTasks(prev => {
      const next = prev.map(t => t.id === sub.id ? { ...t, status: newStatus } : t);
      const parentId = sub.parent_task_id;
      if (!parentId) return next;
      const siblings = next.filter(t => t.parent_task_id === parentId);
      const allDone  = siblings.length > 0 && siblings.every(t => t.status === 'done');
      const parent   = next.find(t => t.id === parentId);
      if (!parent) return next;
      const parentNew = allDone
        ? 'done'
        : parent.status === 'done' ? 'in_progress' : parent.status;
      if (parentNew === parent.status) return next;
      return next.map(t => t.id === parentId ? { ...t, status: parentNew } : t);
    });
    // API: update subtask
    await api.updateTask?.(taskUpdatePayload(sub, { status: newStatus }));
    // API: sync parent status based on latest state
    await reloadTasks();
    setTasks(prev => {
      const parentId = sub.parent_task_id;
      if (!parentId) return prev;
      const siblings = prev.filter(t => t.parent_task_id === parentId);
      const allDone  = siblings.length > 0 && siblings.every(t => t.status === 'done');
      const parent   = prev.find(t => t.id === parentId);
      if (!parent) return prev;
      const parentNew = allDone
        ? 'done'
        : parent.status === 'done' ? 'in_progress' : parent.status;
      if (parentNew === parent.status) return prev;
      api.updateTask?.(taskUpdatePayload(parent, { status: parentNew }));
      return prev.map(t => t.id === parentId ? { ...t, status: parentNew } : t);
    });
  };

  const updateSubtaskTitle = async (sub, title) => {
    setTasks(prev => prev.map(t => t.id === sub.id ? { ...t, title } : t));
    await api.updateTask?.(taskUpdatePayload(sub, { title }));
  };

  const deleteSubtask = async (id) => {
    setTasks(prev => prev.filter(t => t.id !== id));
    await api.deleteTask?.({ taskId: id });
  };

  // ── Derived data ───────────────────────────────────────────────────────────
  // Group subtasks by their parent ID
  const subtasksByParent = useMemo(() => {
    const map = {};
    tasks.forEach(t => {
      if (t.parent_task_id) {
        if (!map[t.parent_task_id]) map[t.parent_task_id] = [];
        map[t.parent_task_id].push(t);
      }
    });
    return map;
  }, [tasks]);

  const parseDueDate = (value) => {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : Math.floor(date.getTime() / 1000);
  };

  const importTasks = async (rows) => {
    let imported = 0;
    for (const row of rows) {
      const title = row.title || row.task || row['task title'];
      if (!title) continue;
      const projectName = row.project || row['project name'];
      const clientName  = row.client || row['client name'];
      const project     = projects.find(p => normalizeValue(p.name) === normalizeValue(projectName));
      const client      = clients.find(c => normalizeValue(c.name) === normalizeValue(clientName)) ||
        clients.find(c => c.id === project?.client_id);
      await api.createTask?.({
        userId: user.id, title,
        description: row.description || row.notes || '',
        projectId: project?.id || '',
        clientId: client?.id || '',
        keywords: row.keywords || row.tags || '',
        dueDate: parseDueDate(row.due_date || row['due date'] || row.due),
        status: row.status || 'todo',
        priority: parseInt(row.priority || row.pri, 10) || 3,
        estimatedHours: parseFloat(row.estimated_hours || row['estimated hours'] || row.estimate) || '',
      });
      imported += 1;
    }
    await load();
    return imported;
  };

  const nowTs     = Math.floor(Date.now() / 1000);
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayEnd   = new Date(); todayEnd.setHours(23, 59, 59, 999);

  // Quick filter counts — only over top-level tasks
  const qCounts = useMemo(() => {
    const top = tasks.filter(t => t.status !== 'archived' && !t.parent_task_id);
    return {
      today:   top.filter(t => t.due_date && t.due_date * 1000 >= todayStart && t.due_date * 1000 <= todayEnd).length,
      overdue: top.filter(t => t.status !== 'done' && t.due_date && t.due_date < nowTs - 86400).length,
      highPri: top.filter(t => t.status !== 'done' && (t.priority === 1 || t.priority === 2)).length,
      done:    top.filter(t => t.status === 'done').length,
    };
  }, [tasks]);

  // Filter + sort — only top-level tasks
  const filtered = useMemo(() => {
    let list = [...tasks].filter(t => t.status !== 'archived' && !t.parent_task_id);

    if (quickFilter === 'today')   list = list.filter(t => t.due_date && t.due_date * 1000 >= todayStart && t.due_date * 1000 <= todayEnd);
    if (quickFilter === 'overdue') list = list.filter(t => t.status !== 'done' && t.due_date && t.due_date < nowTs - 86400);
    if (quickFilter === 'highpri') list = list.filter(t => t.status !== 'done' && (t.priority === 1 || t.priority === 2));
    if (quickFilter === 'done')    list = tasks.filter(t => t.status === 'done' && !t.parent_task_id);
    if (quickFilter === 'all' && statusFilter) list = list.filter(t => t.status === statusFilter);

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(t =>
        t.title.toLowerCase().includes(q) ||
        (t.project_name || '').toLowerCase().includes(q) ||
        (t.client_name  || '').toLowerCase().includes(q) ||
        (t.keywords     || '').toLowerCase().includes(q)
      );
    }
    if (projectFilter !== 'all') list = list.filter(t => (t.project_id || 'none') === projectFilter);

    list.sort((a, b) => {
      let va, vb;
      if (sortBy === 'title')    { va = a.title;                vb = b.title; }
      else if (sortBy === 'pri') { va = a.priority || 99;       vb = b.priority || 99; }
      else if (sortBy === 'due') { va = a.due_date || Infinity; vb = b.due_date || Infinity; }
      else if (sortBy === 'time'){ va = a.total_seconds || 0;   vb = b.total_seconds || 0; }
      else                       { va = a.created_at || 0;      vb = b.created_at || 0; }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1  : -1;
      return 0;
    });
    return list;
  }, [tasks, search, quickFilter, statusFilter, projectFilter, sortBy, sortDir]);

  const toggleSort = col => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir(col === 'pri' || col === 'due' ? 'asc' : 'desc'); }
  };

  const activeTasks = tasks.filter(t => t.status !== 'archived' && !t.parent_task_id).length;

  const exportCSV = () => {
    const rows = [[
      'Task', 'Project', 'Client', 'Status', 'Priority', 'Due Date',
      'Estimated Hours', 'Tracked Hours', 'Keywords', 'Description',
    ]];
    filtered.forEach(task => {
      rows.push([
        task.title,
        task.project_name || '',
        task.client_name || '',
        task.status || 'todo',
        task.priority || 3,
        task.due_date ? new Date(task.due_date * 1000).toISOString().slice(0, 10) : '',
        task.estimated_hours || '',
        ((task.total_seconds || 0) / 3600).toFixed(2),
        task.keywords || '',
        task.description || '',
      ]);
    });
    downloadCSV(`tasks-visualized-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  };

  return (
    <div className="fl-page fl-tasks-page fl-report-page">
      <div className="fl-work-surface flex flex-col">

      {/* ── Toolbar ── */}
      <div className="fl-page-toolbar fl-tasks-toolbar">
        <div className="mr-1 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/15 text-accent">
            <CheckSquare size={15} />
          </div>
          <div>
            <span className="block text-sm font-bold text-white">Tasks</span>
            <span className="text-[11px] text-tx-faint">{activeTasks} active</span>
          </div>
        </div>

        <div style={{ position: 'relative', flex: 1, maxWidth: 300 }}>
          <Search size={12} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#4B5568', pointerEvents: 'none' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tasks, projects, tags…"
            style={{ width: '100%', background: 'rgba(15,18,26,0.75)', border: '1px solid rgba(42,47,58,0.9)', borderRadius: 8, padding: '7px 30px 7px 30px', fontSize: 11.5, color: '#EAEAF0', outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s, box-shadow 0.15s' }}
            onFocus={e => { e.currentTarget.style.borderColor = 'rgba(124,108,242,0.55)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(124,108,242,0.09)'; }}
            onBlur={e  => { e.currentTarget.style.borderColor = 'rgba(42,47,58,0.9)'; e.currentTarget.style.boxShadow = 'none'; }} />
          {search && (
            <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', background: 'rgba(42,47,58,0.7)', border: 'none', cursor: 'pointer', color: '#7B8494', padding: '2px', borderRadius: 4, display: 'flex', alignItems: 'center' }}>
              <X size={10} />
            </button>
          )}
        </div>

        <div style={{ position: 'relative' }}>
          <select value={projectFilter} onChange={e => setProjectFilter(e.target.value)}
            style={{ background: 'rgba(15,18,26,0.75)', border: '1px solid rgba(42,47,58,0.9)', borderRadius: 8, padding: '7px 26px 7px 10px', fontSize: 11, color: projectFilter === 'all' ? '#7B8494' : '#CBD5E1', outline: 'none', appearance: 'none', cursor: 'pointer', transition: 'border-color 0.15s, box-shadow 0.15s' }}
            onFocus={e => { e.currentTarget.style.borderColor = 'rgba(124,108,242,0.55)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(124,108,242,0.08)'; }}
            onBlur={e  => { e.currentTarget.style.borderColor = 'rgba(42,47,58,0.9)'; e.currentTarget.style.boxShadow = 'none'; }}>
            <option value="all">All Projects</option>
            <option value="none">No Project</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <ChevronDown size={9} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: '#4B5568', pointerEvents: 'none' }} />
        </div>

        <div style={{ flex: 1 }} />

        {tasks.length > 0 && (
          <button onClick={exportCSV} className="fl-toolbar-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 11px', background: 'rgba(15,18,26,0.6)', border: '1px solid rgba(42,47,58,0.9)', borderRadius: 8, color: '#7B8494', fontSize: 11, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.13s ease' }}
            onMouseOver={e => { e.currentTarget.style.color = '#CBD5E1'; e.currentTarget.style.borderColor = 'rgba(124,108,242,0.32)'; e.currentTarget.style.background = 'rgba(20,24,36,0.7)'; }}
            onMouseOut={e  => { e.currentTarget.style.color = '#7B8494'; e.currentTarget.style.borderColor = 'rgba(42,47,58,0.9)'; e.currentTarget.style.background = 'rgba(15,18,26,0.6)'; }}>
            <Download size={11} />Export
          </button>
        )}
        <button onClick={() => setShowImport(true)} className="fl-toolbar-secondary"
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 11px', background: 'rgba(15,18,26,0.6)', border: '1px solid rgba(42,47,58,0.9)', borderRadius: 8, color: '#7B8494', fontSize: 11, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.13s ease' }}
          onMouseOver={e => { e.currentTarget.style.color = '#CBD5E1'; e.currentTarget.style.borderColor = 'rgba(124,108,242,0.32)'; e.currentTarget.style.background = 'rgba(20,24,36,0.7)'; }}
          onMouseOut={e  => { e.currentTarget.style.color = '#7B8494'; e.currentTarget.style.borderColor = 'rgba(42,47,58,0.9)'; e.currentTarget.style.background = 'rgba(15,18,26,0.6)'; }}>
          <Upload size={11} />Import
        </button>
        <button onClick={openNew}
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', background: '#7c6cf2', border: '1px solid rgba(157,143,245,0.5)', borderRadius: 9, color: '#fff', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', boxShadow: '0 2px 12px rgba(124,108,242,0.34)', transition: 'all 0.12s ease' }}
          onMouseOver={e => { e.currentTarget.style.background = '#9D8FF5'; e.currentTarget.style.boxShadow = '0 4px 18px rgba(124,108,242,0.46)'; }}
          onMouseOut={e  => { e.currentTarget.style.background = '#7c6cf2'; e.currentTarget.style.boxShadow = '0 2px 12px rgba(124,108,242,0.34)'; }}>
          <Plus size={12} strokeWidth={2.5} />New Task
        </button>
      </div>

      {/* ── Stats Row ── */}
      {!loading && tasks.filter(t => !t.parent_task_id).length > 0 && (
        <div className="fl-stats-row" style={{ display: 'flex', gap: 12, padding: '14px 18px 0', flexShrink: 0 }}>
          <StatsCard
            label="Total Active"
            value={tasks.filter(t => !t.parent_task_id && t.status !== 'archived').length}
            color="#7c6cf2" icon={CheckSquare}
          />
          <StatsCard
            label="In Progress"
            value={tasks.filter(t => !t.parent_task_id && t.status === 'in_progress').length}
            color="#2f81f7" icon={Pause}
            onClick={() => { setQuickFilter('all'); setStatusFilter(statusFilter === 'in_progress' ? '' : 'in_progress'); }}
            active={statusFilter === 'in_progress'}
          />
          <StatsCard
            label="Overdue"
            value={qCounts.overdue}
            color="#ef4444" icon={AlertTriangle}
            onClick={() => { setStatusFilter(''); setQuickFilter(quickFilter === 'overdue' ? 'all' : 'overdue'); }}
            active={quickFilter === 'overdue'}
          />
          <StatsCard
            label="Completed"
            value={qCounts.done}
            color="#3fb950" icon={CheckCircle2}
            onClick={() => { setStatusFilter(''); setQuickFilter(quickFilter === 'done' ? 'all' : 'done'); }}
            active={quickFilter === 'done'}
          />
        </div>
      )}

      {/* ── Quick Filters + Sort ── */}
      <div className="fl-tasks-filters" style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '10px 18px', borderBottom: '1px solid rgba(42,47,58,0.65)', flexShrink: 0 }}>
        <QChip label="All"           count={activeTasks}     active={quickFilter === 'all' && !statusFilter} onClick={() => { setQuickFilter('all'); setStatusFilter(''); }} />
        <QChip label="Today"         count={qCounts.today}   active={quickFilter === 'today'}   color="#F59E0B" onClick={() => { setStatusFilter(''); setQuickFilter(quickFilter === 'today'   ? 'all' : 'today'); }} />
        <QChip label="Overdue"       count={qCounts.overdue} active={quickFilter === 'overdue'} color="#EF4444" onClick={() => { setStatusFilter(''); setQuickFilter(quickFilter === 'overdue'  ? 'all' : 'overdue'); }} />
        <QChip label="High Priority" count={qCounts.highPri} active={quickFilter === 'highpri'} color="#F97316" onClick={() => { setStatusFilter(''); setQuickFilter(quickFilter === 'highpri'  ? 'all' : 'highpri'); }} />
        <QChip label="Done"          count={qCounts.done}    active={quickFilter === 'done'}    color="#34D399" onClick={() => { setStatusFilter(''); setQuickFilter(quickFilter === 'done'     ? 'all' : 'done'); }} />
        {quickFilter === 'all' && (
          <>
            <div style={{ width: 1, height: 14, background: 'rgba(42,47,58,0.9)', marginLeft: 4, marginRight: 4 }} />
            {STATUS_OPTIONS.filter(o => o.value !== 'archived').map(opt => (
              <QChip key={opt.value}
                label={opt.label}
                count={tasks.filter(t => t.status === opt.value && !t.parent_task_id).length}
                active={statusFilter === opt.value}
                color={opt.color}
                onClick={() => setStatusFilter(statusFilter === opt.value ? '' : opt.value)}
              />
            ))}
          </>
        )}
        <div style={{ flex: 1 }} />
        {/* Sort controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {[
            { col: 'pri', label: 'Priority' }, { col: 'due', label: 'Due' },
            { col: 'title', label: 'Name' }, { col: 'time', label: 'Time' }, { col: 'created', label: 'Created' },
          ].map(s => (
            <button key={s.col} onClick={() => toggleSort(s.col)} style={{
              display: 'flex', alignItems: 'center', gap: 3, padding: '4px 8px', borderRadius: 6,
              fontSize: 10.5, fontWeight: sortBy === s.col ? 600 : 400, cursor: 'pointer', border: '1px solid',
              background: sortBy === s.col ? 'rgba(124,108,242,0.12)' : 'transparent',
              borderColor: sortBy === s.col ? 'rgba(124,108,242,0.3)' : 'transparent',
              color: sortBy === s.col ? '#C4B5FD' : '#4B5263', transition: 'all 0.12s ease',
            }}
            onMouseOver={e => { if (sortBy !== s.col) { e.currentTarget.style.color = '#9CA3AF'; e.currentTarget.style.background = 'rgba(42,47,58,0.4)'; e.currentTarget.style.borderColor = 'rgba(42,47,58,0.8)'; }}}
            onMouseOut={e  => { if (sortBy !== s.col) { e.currentTarget.style.color = '#4B5263'; e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; }}}>
              {s.label}
              {sortBy === s.col && <ArrowUpDown size={8} style={{ color: '#7c6cf2' }} />}
            </button>
          ))}
        </div>
      </div>

      {/* ── Task List ── */}
      <div className="fl-tasks-table-wrap" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 200, gap: 14 }}>
            <div className="fl-loading-spinner" />
            <span style={{ fontSize: 12, color: '#4B5263' }}>Loading tasks…</span>
          </div>
        ) : filtered.length === 0 && !search && quickFilter === 'all' && !statusFilter ? (
          <EmptyState onCreate={openNew} onImport={() => setShowImport(true)} />
        ) : (
          <div className="fl-task-list">
            {/* ── Column Header ── */}
            <div className="fl-task-grid fl-task-list-header">
              <div style={{ gridColumn: '1 / 4' }}><span className="fl-col-label">Task</span></div>
              <div><span className="fl-col-label">Project</span></div>
              <div><span className="fl-col-label">Due</span></div>
              <div><span className="fl-col-label">Status</span></div>
              <div style={{ textAlign: 'right' }}><span className="fl-col-label">Time</span></div>
              <div />
            </div>

            {filtered.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '52px 0', color: '#4B5263', fontSize: 12.5 }}>
                No tasks match your filters.{' '}
                <button onClick={() => { setSearch(''); setQuickFilter('all'); setStatusFilter(''); setProjectFilter('all'); }}
                  style={{ color: '#7c6cf2', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 600 }}>
                  Clear filters
                </button>
              </div>
            ) : filtered.map(task => {
              const due        = fmtDue(task.due_date);
              const isDone     = task.status === 'done';
              const project    = projects.find(p => p.id === task.project_id);
              const client     = clients.find(c => c.id === task.client_id);
              const tags       = parseTags(task.keywords);
              const tracked    = fmt(task.total_seconds);
              const est        = fmtEst(task.estimated_hours);
              const subtasks   = subtasksByParent[task.id] || [];
              const subCount   = subtasks.length;
              const subDone    = subtasks.filter(s => s.status === 'done').length;
              const subDonePct = subCount > 0 ? Math.round((subDone / subCount) * 100) : 0;
              const isExpanded = !!expandedTasks[task.id];
              const hasExpand  = subCount > 0;

              const estSecs    = (task.estimated_hours || 0) * 3600;
              const actSecs    = task.total_seconds || 0;
              const timePct    = estSecs > 0 ? Math.round((actSecs / estSecs) * 100) : null;
              const tBarPct    = timePct !== null ? Math.min(100, timePct) : 0;
              const tIsOver    = timePct !== null && timePct > 100;
              const tIsWarn    = timePct !== null && timePct > 80 && !tIsOver;
              const tBarColor  = timePct === null ? '#2A2F3A' : tIsOver ? '#F87171' : tIsWarn ? '#FBBF24' : '#34D399';
              const tBarGrad   = tIsOver ? 'linear-gradient(90deg,#F87171,#FCA5A5)' : tIsWarn ? 'linear-gradient(90deg,#FBBF24,#FDE68A)' : 'linear-gradient(90deg,#34D399,#6EE7B7)';

              return (
                <React.Fragment key={task.id}>
                  <div
                    className={`fl-task-row fl-task-grid${isDone ? ' fl-task-done' : ''}`}
                    style={{ cursor: 'pointer', opacity: isDone ? 0.62 : 1 }}
                    onClick={() => openEdit(task)}
                  >
                    {/* Col 1: Expand + Check */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}
                      onClick={e => e.stopPropagation()}>
                      <button onClick={() => toggleExpand(task.id)} title={isExpanded ? 'Collapse' : 'Expand subtasks'}
                        className="expand-btn"
                        style={{ width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', cursor: 'pointer', borderRadius: 4, padding: 0, color: isExpanded ? '#7c6cf2' : (hasExpand ? '#6B7280' : '#3A404F'), opacity: (hasExpand || isExpanded) ? 1 : 0, transition: 'color 0.15s, opacity 0.15s', flexShrink: 0 }}>
                        <ChevronRight size={11} style={{ transition: 'transform 0.2s', transform: isExpanded ? 'rotate(90deg)' : 'none' }} />
                      </button>
                      <button onClick={() => { if (!isDone) markDone(task); }}
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                        {isDone
                          ? <CheckCircle2 size={16} style={{ color: '#3fb950' }} />
                          : <Circle size={16} style={{ color: '#4B5263' }} className="fl-check-circle" />}
                      </button>
                    </div>

                    {/* Col 2: Priority */}
                    <div onClick={e => e.stopPropagation()}>
                      <PriorityDot priority={task.priority} />
                    </div>

                    {/* Col 3: Title + progress + tags */}
                    <div style={{ paddingRight: 14, minWidth: 0 }}>
                      <p className="fl-task-title" style={{
                        fontSize: 13.5, fontWeight: isDone ? 400 : 600,
                        color: isDone ? '#4B5575' : '#E4E8F4',
                        textDecoration: isDone ? 'line-through' : 'none',
                        textDecorationColor: '#3A404F', margin: '0 0 3px',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        letterSpacing: '-0.02em',
                      }}>
                        {task.title}
                      </p>
                      {task.description && !subCount && !tags.length && (
                        <p style={{ fontSize: 10.5, color: '#4B5575', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {task.description}
                        </p>
                      )}
                      {(subCount > 0 || tags.length > 0) && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                          {subCount > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                              <div style={{ width: 52, height: 3, borderRadius: 99, background: 'rgba(42,47,58,0.9)', overflow: 'hidden' }}>
                                <div style={{
                                  width: `${subDonePct}%`, height: '100%', borderRadius: 99,
                                  background: subDonePct === 100 ? '#3fb950' : 'linear-gradient(90deg, #7c6cf2, #A78BFA)',
                                  transition: 'width 0.45s ease',
                                  boxShadow: subDonePct > 0 ? `0 0 6px ${subDonePct === 100 ? '#3fb95060' : '#7c6cf260'}` : 'none',
                                }} />
                              </div>
                              <span style={{ fontSize: 9.5, fontWeight: 600, color: subDonePct === 100 ? '#3fb950' : '#6B7280', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                                {subDone}/{subCount}
                              </span>
                            </div>
                          )}
                          {tags.length > 0 && (
                            <div style={{ display: 'flex', gap: 3, overflow: 'hidden' }}>
                              {tags.slice(0, 3).map(tag => <TagChip key={tag} label={tag} />)}
                              {tags.length > 3 && <span style={{ fontSize: 9, color: '#4B5263', alignSelf: 'center' }}>+{tags.length - 3}</span>}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Col 4: Project + Client */}
                    <div style={{ paddingRight: 10, minWidth: 0 }}>
                      {project ? (
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: client ? 2 : 0 }}>
                            <span style={{ width: 6, height: 6, borderRadius: 2, background: project.color || '#818CF8', flexShrink: 0, boxShadow: `0 0 4px ${project.color || '#818CF8'}60` }} />
                            <span className="fl-proj-name" style={{ fontSize: 11.5, color: '#B0BAD0', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.name}</span>
                          </div>
                          {client && <span style={{ fontSize: 10, color: '#5A6278', paddingLeft: 11, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{client.name}</span>}
                        </div>
                      ) : client ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <Users size={9} style={{ color: '#5A6278', flexShrink: 0 }} />
                          <span style={{ fontSize: 11, color: '#5A6278', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{client.name}</span>
                        </div>
                      ) : (
                        <span style={{ fontSize: 11, color: '#2A2F3A' }}>—</span>
                      )}
                    </div>

                    {/* Col 5: Due */}
                    <div>
                      {due ? (
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          padding: '3px 8px', borderRadius: 6, fontSize: 10.5, fontWeight: 600,
                          color: due.color, background: `${due.color}12`, border: `1px solid ${due.color}28`,
                          whiteSpace: 'nowrap',
                        }}>
                          {due.isOverdue && <AlertTriangle size={9} />}
                          {due.isToday   && <Calendar size={9} />}
                          {due.label}
                        </span>
                      ) : <span style={{ fontSize: 11, color: '#2A2F3A' }}>—</span>}
                    </div>

                    {/* Col 6: Status */}
                    <div onClick={e => e.stopPropagation()}>
                      <StatusPill status={task.status} />
                    </div>

                    {/* Col 7: Time */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
                        <span style={{ fontSize: 12, color: tracked ? '#C4C4D4' : '#3A404F', fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>{tracked || '—'}</span>
                        {est && <span style={{ fontSize: 9.5, color: tIsOver ? '#F87171' : '#4B5263', fontVariantNumeric: 'tabular-nums' }}>/{est}</span>}
                      </div>
                      {estSecs > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <div style={{ width: 48, height: 3, borderRadius: 99, background: 'rgba(42,47,58,0.9)', overflow: 'hidden' }}>
                            <div style={{ width: `${tBarPct}%`, height: '100%', borderRadius: 99, background: tBarGrad, transition: 'width 0.35s ease', boxShadow: tBarPct > 0 ? `0 0 6px ${tBarColor}60` : 'none' }} />
                          </div>
                          <span style={{ fontSize: 9, fontWeight: 700, color: tBarColor, fontVariantNumeric: 'tabular-nums', minWidth: 22, textAlign: 'right' }}>{timePct}%</span>
                        </div>
                      )}
                    </div>

                    {/* Col 8: Quick Actions */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
                      <QuickActions isDone={isDone} onMarkDone={() => markDone(task)} onEdit={() => openEdit(task)} onDelete={() => del(task.id)} />
                    </div>
                  </div>

                  {/* Subtask expansion */}
                  <div style={{ borderBottom: '1px solid rgba(42,47,58,0.45)' }}>
                    <SubtaskArea subtasks={subtasks} parentId={task.id} expanded={isExpanded}
                      onToggle={toggleSubtaskDone} onDelete={deleteSubtask} onUpdateTitle={updateSubtaskTitle} onAdd={createSubtask} />
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        )}
      </div>

      <style>{`
        /* ── Grid layout shared by header + all rows ── */
        /* col1: expand+check | col2: priority | col3: title(flex) | col4: project | col5: due | col6: status | col7: time | col8: actions */
        .fl-task-grid {
          display: grid;
          grid-template-columns: 44px 28px 1fr 160px 88px 112px 108px 100px;
          align-items: center;
          gap: 0 6px;
        }

        /* ── Column label ── */
        .fl-col-label {
          font-size: 10px; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.08em; color: #4B5568;
        }

        /* ── Sticky header ── */
        .fl-task-list-header {
          min-height: 38px;
          padding: 0 18px;
          position: sticky; top: 0; z-index: 10;
          background: linear-gradient(to bottom, #0D1019 0%, #0A0D15 100%);
          border-bottom: 1px solid rgba(42,47,58,0.85);
          box-shadow: 0 4px 22px rgba(0,0,0,0.48);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }

        /* ── Task row ── */
        .fl-task-row {
          min-height: 56px;
          padding: 11px 18px;
          border-bottom: 1px solid rgba(42,47,58,0.45);
          transition: background 0.14s ease, box-shadow 0.14s ease;
          animation: fl-row-in 0.18s ease both;
          position: relative;
        }
        .fl-task-row:hover {
          background: color-mix(in srgb, var(--color-accent) 6%, transparent) !important;
          box-shadow: inset 3px 0 0 var(--color-accent-a28), 0 2px 16px rgba(0,0,0,0.12);
        }
        .fl-task-row:hover .fl-quick-actions { opacity: 1 !important; }
        .fl-task-row:hover .expand-btn { opacity: 1 !important; }
        .fl-task-row:hover .fl-check-circle { color: rgba(124,108,242,0.6) !important; }
        .fl-task-done:hover {
          background: rgba(63,185,80,0.04) !important;
          box-shadow: inset 3px 0 0 rgba(63,185,80,0.28), 0 2px 12px rgba(0,0,0,0.1);
        }

        /* ── Quick actions ── */
        .fl-qa-btn { transition: all 0.12s ease; }
        .fl-qa-done:hover  { color: #34D399 !important; background: rgba(52,211,153,0.12) !important; box-shadow: 0 0 0 1px rgba(52,211,153,0.2); }
        .fl-qa-edit:hover  { color: #A78BFA !important; background: rgba(167,139,250,0.12) !important; box-shadow: 0 0 0 1px rgba(167,139,250,0.2); }
        .fl-qa-delete:hover { color: #F87171 !important; background: rgba(248,113,113,0.12) !important; box-shadow: 0 0 0 1px rgba(248,113,113,0.2); }

        /* ── Subtask action buttons ── */
        .fl-sub-action-btn { transition: all 0.1s ease !important; }

        /* ── Row entry animation ── */
        @keyframes fl-row-in {
          from { opacity: 0; transform: translateY(3px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* ── Subtask expand/collapse ── */
        .subtask-expand {
          display: grid;
          transition: grid-template-rows 0.22s cubic-bezier(0.4,0,0.2,1);
          overflow: hidden;
        }

        /* ── Loading spinner ── */
        .fl-loading-spinner {
          width: 28px; height: 28px;
          border: 2.5px solid rgba(124,108,242,0.15);
          border-top-color: #7c6cf2;
          border-radius: 50%;
          animation: fl-spin 0.7s linear infinite;
        }
        @keyframes fl-spin { to { transform: rotate(360deg); } }

        /* ── Filter chip hover ── */
        .fl-task-chip:hover:not(.fl-task-chip-active) {
          color: #9CA3AF !important;
          border-color: rgba(42,47,58,1) !important;
          background: rgba(42,47,58,0.5) !important;
        }

        /* ── Scrollbar ── */
        .fl-tasks-table-wrap::-webkit-scrollbar { width: 5px; }
        .fl-tasks-table-wrap::-webkit-scrollbar-track { background: transparent; }
        .fl-tasks-table-wrap::-webkit-scrollbar-thumb { background: rgba(42,47,58,0.9); border-radius: 99px; }
        .fl-tasks-table-wrap::-webkit-scrollbar-thumb:hover { background: rgba(124,108,242,0.44); }

        /* ── Light mode ── */
        .theme-light .fl-task-list-header {
          background: linear-gradient(to bottom,#F8F7FF,#F3F0FF);
          border-bottom: 1px solid rgba(196,181,253,0.4);
          box-shadow: 0 4px 12px rgba(124,108,242,0.07);
        }
        .theme-light .fl-col-label { color: #9CA3AF; }
        .theme-light .fl-task-row {
          border-bottom-color: rgba(196,181,253,0.18);
        }
        .theme-light .fl-task-row:hover {
          background: color-mix(in srgb, var(--color-accent) 5%, rgba(255,255,255,0.95)) !important;
          box-shadow: inset 3px 0 0 var(--color-accent-a28), 0 2px 14px rgba(124,108,242,0.09);
        }
        .theme-light .fl-task-done:hover {
          background: rgba(63,185,80,0.04) !important;
          box-shadow: inset 3px 0 0 rgba(63,185,80,0.24), 0 2px 10px rgba(0,0,0,0.04);
        }
        .theme-light .fl-tasks-filters {
          border-bottom-color: rgba(196,181,253,0.28);
        }
        .theme-light .fl-task-chip:hover:not(.fl-task-chip-active) {
          background: rgba(124,108,242,0.06) !important;
          border-color: rgba(124,108,242,0.2) !important;
          color: #4B5563 !important;
        }
        .theme-light .fl-qa-btn:hover { background: rgba(0,0,0,0.05) !important; }
        .theme-light .fl-quick-actions { border-left-color: rgba(0,0,0,0.07) !important; }
      `}</style>

      {/* ── Modals ── */}
      {showModal && (
        <TaskModal
          task={editTask} projects={projects} clients={clients} user={user}
          onClose={() => { setShowModal(false); setEditTask(null); }}
          onSave={handleSave}
        />
      )}
      {showImport && (
        <CsvImportModal
          title="Import Tasks"
          description="Upload a CSV with one task per row. Project and client are matched by name when present."
          columns={[
            { key: 'title', required: true, hint: 'Task title' },
            { key: 'project', hint: 'Existing project name, optional' },
            { key: 'client', hint: 'Existing client name, optional' },
            { key: 'status', hint: 'todo, in_progress, or done' },
            { key: 'priority', hint: '1 urgent, 2 high, 3 medium, 4 low' },
            { key: 'due_date', hint: 'YYYY-MM-DD date' },
            { key: 'estimated_hours', hint: 'Numeric hour estimate' },
            { key: 'keywords', hint: 'Comma-separated tags' },
            { key: 'description', hint: 'Optional task notes' },
          ]}
          sampleRows={[
            ['Design landing page mockup', 'Website Redesign', 'Acme Corporation', 'todo', '2', '2026-05-31', '3.5', 'design, frontend', 'Create first pass mockup'],
          ]}
          onClose={() => setShowImport(false)}
          onImport={importTasks}
        />
      )}
      </div>
    </div>
  );
}
