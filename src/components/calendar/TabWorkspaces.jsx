/**
 * TabWorkspaces.jsx
 * Tasks, Projects, and Clients workspaces for the Calendar section.
 * Each workspace is interconnected — tasks link to projects/clients,
 * projects link to clients and calendar events, clients surface all activity.
 */
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  CheckCircle2, Circle, Plus, Search, List, Grid2x2 as Grid,
  ChevronDown, ChevronUp, Zap, Clock, Tag, Calendar, Briefcase,
  Users, X, Pencil, Trash2, Target, Flag, Star, Play, Bell,
  Repeat, Hash, Mail, Phone, FolderOpen, CheckSquare, Timer,
  ArrowRight, FileText, MoreHorizontal, ChevronRight, AlertCircle,
  TrendingUp, Layers, Activity, Globe, AlignLeft,
} from 'lucide-react';

const api = window.electron || {};

// ─── Theme system ──────────────────────────────────────────────────────────────
function useThemeLight() {
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

function makeT(L) {
  return {
    pageBg:        L ? '#F6F7F9'                    : '#0C0E16',
    panelBg:       L ? '#FAFBFC'                    : '#0C0E16',
    surfaceBg:     L ? '#FFFFFF'                    : '#111420',
    surfaceMid:    L ? '#F8FAFB'                    : '#0F1118',
    headerBg:      L ? '#FFFFFF'                    : 'rgba(17,20,32,0.6)',
    cardBg:        L ? '#FFFFFF'                    : '#111420',
    rowBg:         L ? '#F8FAFB'                    : '#0F1118',
    inputBg:       L ? '#FFFFFF'                    : '#111520',
    toggleGrpBg:   L ? '#F1F3F7'                   : '#0D0F17',
    viewSwitchBg:  L ? '#F1F3F7'                   : '#161921',
    searchBg:      L ? '#F8FAFB'                    : '#0F1118',
    trackedBg:     L ? '#F8FAFB'                    : '#0F1118',
    statCardBg:    L ? '#F8FAFB'                    : '#111420',
    progressPillBg:L ? '#FAFBFC'                    : '#111420',
    btnBg:         L ? '#F1F5F9'                    : 'rgba(255,255,255,0.04)',
    border:        L ? '#E5E9F0'                    : '#1E222E',
    borderMid:     L ? '#EEF2F7'                    : '#1A1D28',
    borderLight:   L ? '#F0F4F8'                    : '#181B24',
    headerBdr:     L ? '#E8EDF4'                    : '#1A1D28',
    cardBdr:       L ? '#E8EDF4'                    : '#1E222E',
    rowBdr:        L ? '#EEF2F7'                    : '#181B24',
    inputBdr:      L ? '#D5DCE8'                    : '#252D3E',
    toggleGrpBdr:  L ? '#E2E8F0'                   : '#1A1D28',
    viewSwitchBdr: L ? '#E2E8F0'                   : '#252932',
    searchBdr:     L ? '#E2E8F0'                    : '#1E222E',
    trackedBdr:    L ? '#EEF2F7'                    : '#1A1E2A',
    statCardBdr:   L ? '#EEF2F7'                    : '#1E222E',
    progressPillBdr: L ? '#EEF2F7'                  : '#1E222E',
    btnBdr:        L ? '#E2E8F0'                    : '#252932',
    textPrimary:   L ? '#111827'                    : '#EAEAF0',
    textSecond:    L ? '#374151'                    : '#C4C7D4',
    textMuted:     L ? '#6B7280'                    : '#7B849A',
    textFaint:     L ? '#94A3B8'                    : '#5A6480',
    textVFaint:    L ? '#CBD5E1'                    : '#4B5263',
    textDone:      L ? '#9CA3AF'                    : '#4B5263',
    toggleActiveBg: L ? '#FFFFFF'                   : '#1E2235',
    toggleActiveC:  L ? '#4F46E5'                   : '#C4B5FD',
    toggleIdleC:    L ? '#6B7280'                   : '#4B5263',
    viewActiveB:    L ? '#FFFFFF'                   : '#21253A',
    viewActiveC:    L ? '#4F46E5'                   : '#C4B5FD',
    viewIdleC:      L ? '#94A3B8'                   : '#4B5263',
    searchIcon:    L ? '#94A3B8'                    : '#4B5263',
    subtaskIdleBg: L ? '#F8FAFB'                    : 'rgba(255,255,255,0.02)',
    subtaskIdleBdr:L ? '#EEF2F7'                    : '#1A1E2A',
    kanbanEmptyTx: L ? '#94A3B8'                    : '#2E3347',
    trackedAccent: L ? '#4F46E5'                    : '#818CF8',
    btnText:       L ? '#374151'                    : '#6B7280',
    progressTrack: L ? '#EEF2F7'                    : '#1A1D28',
    emptyIconBg:   L ? 'rgba(148,163,184,0.07)'     : 'rgba(107,114,128,0.07)',
    emptyIconBdr:  L ? 'rgba(148,163,184,0.13)'     : 'rgba(107,114,128,0.10)',
    sectionText:   L ? '#64748B'                    : '#4B5263',
    sectionAccent: L ? 'rgba(99,102,241,0.35)'      : 'rgba(129,140,248,0.45)',
    addBg:    L ? 'rgba(99,102,241,0.08)'           : 'rgba(124,108,242,0.12)',
    addBdr:   L ? 'rgba(99,102,241,0.22)'           : 'rgba(124,108,242,0.28)',
    addText:  L ? '#4F46E5'                         : '#a78bfa',
    addHover: L ? 'rgba(99,102,241,0.15)'           : 'rgba(124,108,242,0.25)',
    countBg:  L ? 'rgba(99,102,241,0.07)'           : 'rgba(129,140,248,0.09)',
    countBdr: L ? 'rgba(99,102,241,0.18)'           : 'rgba(129,140,248,0.20)',
    countText:L ? '#4F46E5'                         : '#818CF8',
    iconContBg:  L ? 'rgba(99,102,241,0.07)'        : 'rgba(107,114,128,0.10)',
    iconContBdr: L ? 'rgba(99,102,241,0.14)'        : 'rgba(107,114,128,0.14)',
    schedBtnC:   L ? '#94A3B8'                      : '#3D4555',
  };
}

// ─── Shared palette & helpers ─────────────────────────────────────────────────
const PALETTE = ['#818CF8','#34D399','#F87171','#60A5FA','#FB923C','#A78BFA','#FBBF24','#7c6cf2','#F472B6','#94A3B8'];
function hashColor(str) {
  let h = 0;
  for (let i = 0; i < (str || '').length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
function fmtDur(secs = 0) {
  if (!secs) return '';
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}
function fmtDate(ts) {
  if (!ts) return '';
  const d = new Date(typeof ts === 'number' && ts < 1e12 ? ts * 1000 : ts);
  return isNaN(d) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function fmtRelative(ts) {
  if (!ts) return '';
  const d = new Date(typeof ts === 'number' && ts < 1e12 ? ts * 1000 : ts);
  if (isNaN(d)) return '';
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days === 0) return 'Today'; if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`; if (days < 30) return `${Math.floor(days/7)}w ago`;
  return fmtDate(ts);
}
const isOverdue = (ts) => ts && new Date(ts) < new Date();

const PRIORITY = {
  high:   { label: 'High',   color: '#F87171', bg: 'rgba(248,113,113,0.10)', border: 'rgba(248,113,113,0.22)' },
  medium: { label: 'Med',    color: '#FBBF24', bg: 'rgba(251,191,36,0.10)',  border: 'rgba(251,191,36,0.22)'  },
  low:    { label: 'Low',    color: '#60A5FA', bg: 'rgba(96,165,250,0.10)',  border: 'rgba(96,165,250,0.22)'  },
  none:   { label: '—',      color: '#4B5263', bg: 'rgba(75,82,99,0.08)',   border: 'rgba(75,82,99,0.18)'    },
};
const KANBAN_COLS = [
  { id: 'todo',        label: 'To Do',       color: '#6B7280', Icon: Circle      },
  { id: 'in_progress', label: 'In Progress', color: '#818CF8', Icon: Timer       },
  { id: 'done',        label: 'Done',        color: '#34D399', Icon: CheckCircle2 },
];
const PROJ_STATUS = {
  active:    { label: 'Active',    color: '#34D399', bg: 'rgba(52,211,153,0.10)',  border: 'rgba(52,211,153,0.22)'  },
  on_hold:   { label: 'On Hold',   color: '#FBBF24', bg: 'rgba(251,191,36,0.10)',  border: 'rgba(251,191,36,0.22)'  },
  completed: { label: 'Done',      color: '#6B7280', bg: 'rgba(107,114,128,0.10)', border: 'rgba(107,114,128,0.22)' },
};

// ─── Micro-components ─────────────────────────────────────────────────────────
function Badge({ color, bg, border, icon: Icon, children, style = {} }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 9, fontWeight: 700, padding: '2.5px 7px', borderRadius: 99, color, background: bg, border: `1px solid ${border}`, letterSpacing: '0.04em', flexShrink: 0, lineHeight: 1, ...style }}>
      {Icon && <Icon size={7} />}{children}
    </span>
  );
}

function EmptyState({ icon: Icon, title, sub, action, onAction }) {
  const L = useThemeLight();
  const T = makeT(L);
  return (
    <div style={{ textAlign: 'center', padding: '48px 20px' }}>
      <div style={{ width: 54, height: 54, borderRadius: '50%', background: T.emptyIconBg, border: `1px solid ${T.emptyIconBdr}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
        <Icon size={22} style={{ opacity: 0.35, color: T.textMuted }} />
      </div>
      <p style={{ fontSize: 13, fontWeight: 600, color: T.textMuted, marginBottom: 4 }}>{title}</p>
      {sub && <p style={{ fontSize: 11, color: T.textVFaint, marginBottom: action ? 14 : 0 }}>{sub}</p>}
      {action && (
        <button onClick={onAction} style={{ fontSize: 11, fontWeight: 600, padding: '6px 16px', borderRadius: 8, background: T.addBg, color: L ? '#4F46E5' : '#9D8FF5', border: `1px solid ${T.addBdr}`, cursor: 'pointer', transition: 'background 0.12s' }}
          onMouseOver={e => e.currentTarget.style.background = T.addHover}
          onMouseOut={e  => e.currentTarget.style.background = T.addBg}>
          {action}
        </button>
      )}
    </div>
  );
}

function SectionLabel({ children, accent }) {
  const L = useThemeLight();
  const T = makeT(L);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 8 }}>
      <div style={{ width: 2, height: 10, borderRadius: 99, background: accent || T.sectionAccent, flexShrink: 0 }} />
      <p style={{ fontSize: 9, fontWeight: 700, color: T.sectionText, textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>{children}</p>
    </div>
  );
}

const btnBase = {
  display: 'flex', alignItems: 'center', gap: 5,
  padding: '5px 10px', borderRadius: 8, fontSize: 10, fontWeight: 600,
  cursor: 'pointer', background: 'rgba(255,255,255,0.04)',
  border: '1px solid #252932', color: '#6B7280', transition: 'all 0.12s',
};

const inputStyle = {
  background: '#111520', border: '1px solid #252D3E', borderRadius: 9,
  padding: '8px 11px', color: '#E2E4EF', fontSize: 12, outline: 'none',
  boxSizing: 'border-box', transition: 'border-color 0.15s',
};

// ─── Color swatches ────────────────────────────────────────────────────────────
function ColorPicker({ value, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      {PALETTE.map(c => (
        <button key={c} onClick={() => onChange(c)} title={c}
          style={{
            width: 22, height: 22, borderRadius: 6, background: c, padding: 0, flexShrink: 0,
            border: value === c ? '2.5px solid rgba(255,255,255,0.9)' : '2px solid transparent',
            cursor: 'pointer',
            boxShadow: value === c ? `0 0 0 1.5px ${c}` : 'none',
            transition: 'transform 0.1s',
          }}
          onMouseOver={e => { e.currentTarget.style.transform = 'scale(1.2)'; }}
          onMouseOut={e  => { e.currentTarget.style.transform = 'scale(1)'; }}
        />
      ))}
      <input type="color" value={value} onChange={e => onChange(e.target.value)}
        title="Custom color"
        style={{ width: 22, height: 22, borderRadius: 6, border: '1px solid #252932', cursor: 'pointer', padding: 2, background: '#161921', flexShrink: 0 }} />
    </div>
  );
}

// ─── Form field wrapper ────────────────────────────────────────────────────────
function FormField({ label, required, children, error, hint, half }) {
  return (
    <div style={{ marginBottom: 14, ...(half ? { flex: '1 1 0', minWidth: 0 } : {}) }}>
      <label style={{ display: 'block', fontSize: 9.5, fontWeight: 700, color: '#5A6480', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
        {label}{required && <span style={{ color: '#F87171', marginLeft: 2 }}>*</span>}
      </label>
      {children}
      {error && <p style={{ fontSize: 10, color: '#F87171', marginTop: 4, margin: '4px 0 0' }}>{error}</p>}
      {hint && !error && <p style={{ fontSize: 10, color: '#4B5263', marginTop: 4, margin: '4px 0 0' }}>{hint}</p>}
    </div>
  );
}

// ─── Modal shell ──────────────────────────────────────────────────────────────
function CreationModal({ title, accentColor = '#7c6cf2', onClose, onSubmit, submitLabel = 'Create', submitting, canSubmit, width = 520, children }) {
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  return createPortal(
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9995,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.74)',
        backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        padding: 20,
      }}
    >
      <div style={{
        width: '100%', maxWidth: width, maxHeight: '90vh',
        background: 'rgba(9,10,20,0.99)',
        border: `1px solid ${accentColor}2E`,
        borderRadius: 18, overflow: 'hidden',
        boxShadow: `0 40px 100px rgba(0,0,0,0.85), 0 0 0 1px ${accentColor}14, inset 0 1px 0 rgba(255,255,255,0.06)`,
        display: 'flex', flexDirection: 'column',
        animation: 'fl-modal-up 0.2s cubic-bezier(0.22, 1, 0.36, 1) both',
      }}>
        {/* Header */}
        <div style={{
          padding: '15px 20px 13px', borderBottom: '1px solid #171A28',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
          background: `linear-gradient(135deg, ${accentColor}08 0%, transparent 55%)`,
        }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#E8EAF6', letterSpacing: '-0.01em' }}>{title}</span>
          <button onClick={onClose}
            style={{ padding: 5, borderRadius: 8, border: 'none', background: 'transparent', color: '#4B5263', cursor: 'pointer', display: 'flex', transition: 'all 0.12s' }}
            onMouseOver={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.color = '#EAEAF0'; }}
            onMouseOut={e  => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#4B5263'; }}>
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 20px 4px' }}>
          {children}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px 16px', borderTop: '1px solid #171A28', display: 'flex', gap: 8, flexShrink: 0 }}>
          <button onClick={onSubmit} disabled={!canSubmit || submitting}
            style={{
              flex: 1, padding: '9px 0', borderRadius: 10, fontSize: 12.5, fontWeight: 650, cursor: canSubmit && !submitting ? 'pointer' : 'not-allowed',
              background: canSubmit && !submitting ? `linear-gradient(135deg, ${accentColor}EE, ${accentColor})` : 'rgba(255,255,255,0.04)',
              border: `1px solid ${canSubmit ? accentColor + '55' : 'rgba(255,255,255,0.06)'}`,
              color: canSubmit && !submitting ? 'white' : '#3D4555',
              boxShadow: canSubmit ? `0 2px 16px ${accentColor}40, inset 0 1px 0 rgba(255,255,255,0.18)` : 'none',
              transition: 'all 0.14s',
            }}
            onMouseOver={e => { if (canSubmit && !submitting) e.currentTarget.style.filter = 'brightness(1.1)'; }}
            onMouseOut={e  => { e.currentTarget.style.filter = 'none'; }}>
            {submitting ? 'Creating…' : submitLabel}
          </button>
          <button onClick={onClose}
            style={{ padding: '9px 16px', background: 'transparent', border: '1px solid #252932', borderRadius: 10, color: '#6B7280', fontSize: 12, cursor: 'pointer', transition: 'background 0.12s' }}
            onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
            onMouseOut={e  => e.currentTarget.style.background = 'transparent'}>
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── CREATE TASK MODAL ────────────────────────────────────────────────────────
function CreateTaskModal({ projects, clients, user, onClose, onCreate }) {
  const [title,    setTitle]    = useState('');
  const [priority, setPriority] = useState('medium');
  const [projId,   setProjId]   = useState('');
  const [dueDate,  setDueDate]  = useState('');
  const [estimate, setEstimate] = useState('');
  const [labelInp, setLabelInp] = useState('');
  const [labels,   setLabels]   = useState([]);
  const [notes,    setNotes]    = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errors,   setErrors]   = useState({});

  const validate = () => {
    const e = {};
    if (!title.trim()) e.title = 'Title is required';
    setErrors(e);
    return !Object.keys(e).length;
  };

  const handleSubmit = async () => {
    if (!validate() || submitting) return;
    setSubmitting(true);
    try {
      const res = await api.createTask?.({
        userId: user?.id, title: title.trim(), priority,
        projectId: projId || null,
        estimateMinutes: estimate ? +estimate : null,
        notes, dueDate: dueDate || null, labels,
      });
      if (res?.id) { onCreate(res); onClose(); }
    } finally { setSubmitting(false); }
  };

  const addLabel = () => {
    const t = labelInp.trim();
    if (!t || labels.includes(t)) return;
    setLabels(l => [...l, t]); setLabelInp('');
  };

  const PRIOS = [
    { v: 'high',   emoji: '🔴', label: 'High',   color: '#F87171' },
    { v: 'medium', emoji: '🟡', label: 'Med',    color: '#FBBF24' },
    { v: 'low',    emoji: '🔵', label: 'Low',    color: '#60A5FA' },
    { v: 'none',   emoji: '—',  label: 'None',   color: '#4B5263' },
  ];

  return (
    <CreationModal title="Create Task" accentColor="#7c6cf2" onClose={onClose}
      onSubmit={handleSubmit} submitLabel="Create Task" submitting={submitting} canSubmit={!!title.trim()}>

      {/* Title */}
      <FormField label="Title" required error={errors.title}>
        <input value={title} onChange={e => { setTitle(e.target.value); if (errors.title) setErrors({}); }}
          onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }}
          placeholder="What needs to be done?"
          autoFocus
          style={{ ...inputStyle, width: '100%', fontSize: 13, fontWeight: 600, padding: '10px 12px', borderColor: errors.title ? '#F87171' : '#252D3E' }}
          onFocus={e => e.target.style.borderColor = 'rgba(124,108,242,0.55)'}
          onBlur={e  => e.target.style.borderColor = errors.title ? '#F87171' : '#252D3E'} />
      </FormField>

      {/* Priority */}
      <FormField label="Priority">
        <div style={{ display: 'flex', gap: 5 }}>
          {PRIOS.map(({ v, emoji, label, color }) => (
            <button key={v} onClick={() => setPriority(v)}
              style={{
                flex: 1, padding: '7px 4px', borderRadius: 9, cursor: 'pointer', fontSize: 11, fontWeight: 600,
                background: priority === v ? `${color}16` : 'rgba(255,255,255,0.03)',
                border: `1px solid ${priority === v ? color + '55' : '#252932'}`,
                color: priority === v ? color : '#4B5263', transition: 'all 0.12s',
              }}>
              {emoji} {label}
            </button>
          ))}
        </div>
      </FormField>

      {/* Project + Due date row */}
      <div style={{ display: 'flex', gap: 12 }}>
        {projects.length > 0 && (
          <FormField label="Project" half>
            <select value={projId} onChange={e => setProjId(e.target.value)}
              style={{ ...inputStyle, width: '100%', fontSize: 12, colorScheme: 'dark', cursor: 'pointer' }}>
              <option value="">No project</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </FormField>
        )}
        <FormField label="Due Date" half>
          <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
            style={{ ...inputStyle, width: '100%', fontSize: 12, colorScheme: 'dark' }} />
        </FormField>
      </div>

      {/* Estimate + Labels row */}
      <div style={{ display: 'flex', gap: 12 }}>
        <FormField label="Estimate (min)" half hint="Expected time in minutes">
          <input type="number" min="1" value={estimate} onChange={e => setEstimate(e.target.value)}
            placeholder="e.g. 60"
            style={{ ...inputStyle, width: '100%', fontSize: 12 }} />
        </FormField>
        <FormField label="Labels" half>
          <div style={{ display: 'flex', gap: 5 }}>
            <input value={labelInp} onChange={e => setLabelInp(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addLabel(); } }}
              placeholder="Tag + Enter"
              style={{ ...inputStyle, flex: 1, fontSize: 11, padding: '8px 10px' }} />
            <button onClick={addLabel}
              style={{ padding: '8px 11px', background: '#161921', border: '1px solid #252932', borderRadius: 9, color: '#818CF8', fontSize: 13, fontWeight: 700, cursor: 'pointer', lineHeight: 1 }}>+</button>
          </div>
          {labels.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
              {labels.map(lbl => (
                <span key={lbl} style={{ fontSize: 10, color: '#818CF8', background: 'rgba(129,140,248,0.10)', border: '1px solid rgba(129,140,248,0.22)', borderRadius: 99, padding: '2px 7px', display: 'flex', alignItems: 'center', gap: 4 }}>
                  {lbl}
                  <button onClick={() => setLabels(l => l.filter(x => x !== lbl))}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#818CF8', display: 'flex', lineHeight: 1 }}>
                    <X size={8} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </FormField>
      </div>

      {/* Notes */}
      <FormField label="Notes">
        <textarea value={notes} onChange={e => setNotes(e.target.value)}
          placeholder="Context, links, or details…" rows={3}
          style={{ ...inputStyle, width: '100%', resize: 'none', lineHeight: 1.6, fontSize: 11 }}
          onFocus={e => e.target.style.borderColor = 'rgba(124,108,242,0.55)'}
          onBlur={e  => e.target.style.borderColor = '#252D3E'} />
      </FormField>
    </CreationModal>
  );
}

// ─── CREATE PROJECT MODAL ─────────────────────────────────────────────────────
function CreateProjectModal({ clients, user, onClose, onCreate }) {
  const [name,    setName]    = useState('');
  const [color,   setColor]   = useState('#818CF8');
  const [clientId,setClientId]= useState('');
  const [status,  setStatus]  = useState('active');
  const [notes,   setNotes]   = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errors,  setErrors]  = useState({});

  const validate = () => {
    const e = {};
    if (!name.trim()) e.name = 'Project name is required';
    setErrors(e);
    return !Object.keys(e).length;
  };

  const handleSubmit = async () => {
    if (!validate() || submitting) return;
    setSubmitting(true);
    try {
      const res = await api.createProject?.({
        userId: user?.id, name: name.trim(), color,
        clientId: clientId || null, status, notes,
      });
      if (res?.id) { onCreate(res); onClose(); }
    } finally { setSubmitting(false); }
  };

  const STATUSES = [
    { v: 'active',    label: 'Active',   color: '#34D399' },
    { v: 'on_hold',   label: 'On Hold',  color: '#FBBF24' },
    { v: 'completed', label: 'Completed',color: '#6B7280' },
  ];

  return (
    <CreationModal title="Create Project" accentColor={color} onClose={onClose}
      onSubmit={handleSubmit} submitLabel="Create Project" submitting={submitting} canSubmit={!!name.trim()} width={480}>

      {/* Name */}
      <FormField label="Project Name" required error={errors.name}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ width: 36, height: 36, borderRadius: 9, background: `${color}20`, border: `1px solid ${color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <FolderOpen size={15} style={{ color }} />
          </div>
          <input value={name} onChange={e => { setName(e.target.value); if (errors.name) setErrors({}); }}
            onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }}
            placeholder="Project name…"
            autoFocus
            style={{ ...inputStyle, flex: 1, fontSize: 13, fontWeight: 600, padding: '9px 12px', borderColor: errors.name ? '#F87171' : '#252D3E' }}
            onFocus={e => e.target.style.borderColor = `${color}70`}
            onBlur={e  => e.target.style.borderColor = errors.name ? '#F87171' : '#252D3E'} />
        </div>
      </FormField>

      {/* Color */}
      <FormField label="Color">
        <ColorPicker value={color} onChange={setColor} />
      </FormField>

      {/* Status */}
      <FormField label="Status">
        <div style={{ display: 'flex', gap: 5 }}>
          {STATUSES.map(({ v, label, color: c }) => (
            <button key={v} onClick={() => setStatus(v)}
              style={{
                flex: 1, padding: '7px 4px', borderRadius: 9, cursor: 'pointer', fontSize: 11, fontWeight: 600,
                background: status === v ? `${c}14` : 'rgba(255,255,255,0.03)',
                border: `1px solid ${status === v ? c + '50' : '#252932'}`,
                color: status === v ? c : '#4B5263', transition: 'all 0.12s',
              }}>
              {label}
            </button>
          ))}
        </div>
      </FormField>

      {/* Client */}
      {clients.length > 0 && (
        <FormField label="Client">
          <select value={clientId} onChange={e => setClientId(e.target.value)}
            style={{ ...inputStyle, width: '100%', fontSize: 12, colorScheme: 'dark', cursor: 'pointer' }}>
            <option value="">No client</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}{c.company ? ` — ${c.company}` : ''}</option>)}
          </select>
        </FormField>
      )}

      {/* Description */}
      <FormField label="Description">
        <textarea value={notes} onChange={e => setNotes(e.target.value)}
          placeholder="Goals, milestones, or context…" rows={3}
          style={{ ...inputStyle, width: '100%', resize: 'none', lineHeight: 1.6, fontSize: 11 }}
          onFocus={e => e.target.style.borderColor = `${color}55`}
          onBlur={e  => e.target.style.borderColor = '#252D3E'} />
      </FormField>
    </CreationModal>
  );
}

// ─── CREATE CLIENT MODAL ──────────────────────────────────────────────────────
function CreateClientModal({ user, onClose, onCreate }) {
  const [name,    setName]    = useState('');
  const [company, setCompany] = useState('');
  const [email,   setEmail]   = useState('');
  const [phone,   setPhone]   = useState('');
  const [website, setWebsite] = useState('');
  const [color,   setColor]   = useState(() => PALETTE[Math.floor(Math.random() * PALETTE.length)]);
  const [notes,   setNotes]   = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errors,  setErrors]  = useState({});

  const validate = () => {
    const e = {};
    if (!name.trim()) e.name = 'Client name is required';
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = 'Invalid email address';
    setErrors(e);
    return !Object.keys(e).length;
  };

  const handleSubmit = async () => {
    if (!validate() || submitting) return;
    setSubmitting(true);
    try {
      const res = await api.createClient?.({
        userId: user?.id, name: name.trim(), company: company.trim() || null,
        email: email.trim() || null, phone: phone.trim() || null,
        website: website.trim() || null, color, notes,
      });
      if (res?.id) { onCreate(res); onClose(); }
    } finally { setSubmitting(false); }
  };

  const avatarLetter = name ? name[0].toUpperCase() : '?';

  return (
    <CreationModal title="Create Client" accentColor={color} onClose={onClose}
      onSubmit={handleSubmit} submitLabel="Create Client" submitting={submitting} canSubmit={!!name.trim()} width={480}>

      {/* Name + avatar preview */}
      <FormField label="Client Name" required error={errors.name}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: `${color}20`, border: `1px solid ${color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 15, fontWeight: 800, color }}>{avatarLetter}</span>
          </div>
          <input value={name} onChange={e => { setName(e.target.value); if (errors.name) setErrors(p => ({ ...p, name: null })); }}
            onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }}
            placeholder="Client or person name…"
            autoFocus
            style={{ ...inputStyle, flex: 1, fontSize: 13, fontWeight: 600, padding: '9px 12px', borderColor: errors.name ? '#F87171' : '#252D3E' }}
            onFocus={e => e.target.style.borderColor = `${color}70`}
            onBlur={e  => e.target.style.borderColor = errors.name ? '#F87171' : '#252D3E'} />
        </div>
      </FormField>

      {/* Color */}
      <FormField label="Color">
        <ColorPicker value={color} onChange={setColor} />
      </FormField>

      {/* Company */}
      <FormField label="Company">
        <input value={company} onChange={e => setCompany(e.target.value)}
          placeholder="Company or organisation name"
          style={{ ...inputStyle, width: '100%', fontSize: 12 }}
          onFocus={e => e.target.style.borderColor = `${color}55`}
          onBlur={e  => e.target.style.borderColor = '#252D3E'} />
      </FormField>

      {/* Email + Phone row */}
      <div style={{ display: 'flex', gap: 12 }}>
        <FormField label="Email" half error={errors.email}>
          <div style={{ position: 'relative' }}>
            <Mail size={11} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#4B5263', pointerEvents: 'none' }} />
            <input type="email" value={email} onChange={e => { setEmail(e.target.value); if (errors.email) setErrors(p => ({ ...p, email: null })); }}
              placeholder="name@example.com"
              style={{ ...inputStyle, width: '100%', fontSize: 12, paddingLeft: 28, borderColor: errors.email ? '#F87171' : '#252D3E' }}
              onFocus={e => e.target.style.borderColor = `${color}55`}
              onBlur={e  => e.target.style.borderColor = errors.email ? '#F87171' : '#252D3E'} />
          </div>
        </FormField>
        <FormField label="Phone" half>
          <div style={{ position: 'relative' }}>
            <Phone size={11} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#4B5263', pointerEvents: 'none' }} />
            <input value={phone} onChange={e => setPhone(e.target.value)}
              placeholder="+1 555 000 0000"
              style={{ ...inputStyle, width: '100%', fontSize: 12, paddingLeft: 28 }}
              onFocus={e => e.target.style.borderColor = `${color}55`}
              onBlur={e  => e.target.style.borderColor = '#252D3E'} />
          </div>
        </FormField>
      </div>

      {/* Website */}
      <FormField label="Website">
        <div style={{ position: 'relative' }}>
          <Globe size={11} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#4B5263', pointerEvents: 'none' }} />
          <input value={website} onChange={e => setWebsite(e.target.value)}
            placeholder="https://example.com"
            style={{ ...inputStyle, width: '100%', fontSize: 12, paddingLeft: 28 }}
            onFocus={e => e.target.style.borderColor = `${color}55`}
            onBlur={e  => e.target.style.borderColor = '#252D3E'} />
        </div>
      </FormField>

      {/* Notes */}
      <FormField label="Notes">
        <textarea value={notes} onChange={e => setNotes(e.target.value)}
          placeholder="Preferences, context, or notes on the relationship…" rows={3}
          style={{ ...inputStyle, width: '100%', resize: 'none', lineHeight: 1.6, fontSize: 11 }}
          onFocus={e => e.target.style.borderColor = `${color}55`}
          onBlur={e  => e.target.style.borderColor = '#252D3E'} />
      </FormField>
    </CreationModal>
  );
}

// ─── TASK CARD ────────────────────────────────────────────────────────────────
function TaskCard({ task, selected, onSelect, onToggleStatus, onSchedule, compact, isLight = false }) {
  const T   = makeT(isLight);
  const p   = PRIORITY[task.priority] || PRIORITY.none;
  const col = task._proj?.color || (task.priority !== 'none' ? PRIORITY[task.priority]?.color : null) || '#3D4555';
  const doneCount  = (task._subtasks || []).filter(s => s.status === 'done').length;
  const totalCount = (task._subtasks || []).length;
  const hasProgress = totalCount > 0;

  const baseBg = selected ? `${col}${isLight ? '09' : '0D'}` : T.cardBg;
  const baseBdr = selected ? col + '55' : T.cardBdr;

  return (
    <div
      className={`fl-task-card${selected ? ' fl-task-card--selected' : ''}`}
      onClick={() => onSelect(task.id)}
      style={{
        background: baseBg,
        border: `1px solid ${baseBdr}`,
        borderLeft: `3px solid ${selected ? col : col + '66'}`,
        borderRadius: 10, overflow: 'hidden',
        cursor: 'pointer',
        transition: 'border-color 0.15s, background 0.15s, box-shadow 0.15s',
        boxShadow: selected
          ? isLight
            ? `0 2px 8px rgba(0,0,0,0.07), 0 0 0 1px ${col}18`
            : `0 0 0 1px ${col}18, 0 2px 10px rgba(0,0,0,0.25)`
          : 'none',
      }}
      onMouseOver={e => { if (!selected) { e.currentTarget.style.background = `${col}${isLight ? '06' : '07'}`; e.currentTarget.style.boxShadow = isLight ? '0 1px 4px rgba(0,0,0,0.07)' : '0 1px 6px rgba(0,0,0,0.18)'; }}}
      onMouseOut={e  => { if (!selected) { e.currentTarget.style.background = T.cardBg; e.currentTarget.style.boxShadow = 'none'; }}}
    >
      <div style={{ padding: compact ? '8px 10px' : '10px 12px', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        {/* Status circle */}
        <button onClick={e => { e.stopPropagation(); onToggleStatus(task); }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '1px 0', flexShrink: 0, marginTop: 1,
            color: task.status === 'done' ? '#34D399' : task.status === 'in_progress' ? '#818CF8' : T.textVFaint }}>
          {task.status === 'done' ? <CheckCircle2 size={14} /> : task.status === 'in_progress' ? <Timer size={14} /> : <Circle size={14} />}
        </button>

        {/* Text */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 5, marginBottom: 3 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: task.status === 'done' ? T.textDone : T.textPrimary, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: task.status === 'done' ? 'line-through' : 'none', margin: 0 }}>
              {task.title}
            </p>
            {task.priority !== 'none' && (
              <Badge color={p.color} bg={p.bg} border={p.border} icon={Flag}>{p.label}</Badge>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {task._proj && (
              <span style={{ fontSize: 9, fontWeight: 600, color: task._proj.color, display: 'flex', alignItems: 'center', gap: 3 }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: task._proj.color, flexShrink: 0 }} />{task._proj.name}
              </span>
            )}
            {task._trackedSecs > 0 && (
              <span style={{ fontSize: 9, color: T.textFaint, display: 'flex', alignItems: 'center', gap: 2 }}><Clock size={8} />{fmtDur(task._trackedSecs)}</span>
            )}
            {task.estimate_minutes > 0 && (
              <span style={{ fontSize: 9, color: T.textFaint, display: 'flex', alignItems: 'center', gap: 2 }}><Target size={8} />{task.estimate_minutes}m</span>
            )}
            {task.due_date && (
              <span style={{ fontSize: 9, color: isOverdue(task.due_date) ? '#F87171' : T.textFaint, display: 'flex', alignItems: 'center', gap: 2 }}>
                <Calendar size={8} />{fmtDate(task.due_date)}
              </span>
            )}
            {hasProgress && (
              <span style={{ fontSize: 9, color: T.textFaint, display: 'flex', alignItems: 'center', gap: 2 }}>
                <CheckSquare size={8} />{doneCount}/{totalCount}
              </span>
            )}
            {(task.labels || []).map(lbl => (
              <span key={lbl} style={{ fontSize: 8, color: '#818CF8', background: 'rgba(129,140,248,0.08)', border: '1px solid rgba(129,140,248,0.18)', borderRadius: 99, padding: '1px 5px' }}>{lbl}</span>
            ))}
          </div>
        </div>

        {/* Schedule action */}
        <button onClick={e => { e.stopPropagation(); onSchedule(task); }} title="Schedule"
          style={{ padding: 5, borderRadius: 6, border: 'none', background: 'transparent', color: T.schedBtnC, cursor: 'pointer', display: 'flex', flexShrink: 0, transition: 'all 0.12s' }}
          onMouseOver={e => { e.currentTarget.style.color = '#818CF8'; e.currentTarget.style.background = 'rgba(129,140,248,0.1)'; }}
          onMouseOut={e  => { e.currentTarget.style.color = T.schedBtnC; e.currentTarget.style.background = 'transparent'; }}>
          <Calendar size={11} />
        </button>
      </div>

      {/* Subtask progress bar */}
      {hasProgress && (
        <div style={{ height: 2, marginLeft: 38, marginRight: 12, marginBottom: 7, background: T.progressTrack, borderRadius: 99, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${(doneCount / totalCount) * 100}%`, background: selected ? col : '#34D399', borderRadius: 99, transition: 'background 0.2s' }} />
        </div>
      )}
    </div>
  );
}

// ─── REMIND MODAL ─────────────────────────────────────────────────────────────
function RemindModal({ task, currentReminderAt, onSave, onClose, isLight = false }) {
  const now = new Date();
  const defaultDate = currentReminderAt
    ? new Date(currentReminderAt * 1000)
    : new Date(now.getTime() + 60 * 60 * 1000);

  const toLocalDateStr = d => d.toLocaleDateString('en-CA');
  const toLocalTimeStr = d => d.toTimeString().slice(0, 5);

  const [date,   setDate]   = useState(toLocalDateStr(defaultDate));
  const [time,   setTime]   = useState(toLocalTimeStr(defaultDate));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  const handleSave = async () => {
    setSaving(true);
    const ts = Math.floor(new Date(`${date}T${time}:00`).getTime() / 1000);
    await api.updateTask?.({ taskId: task.id, reminderAt: ts });
    onSave(ts);
    onClose();
  };

  const handleClear = async () => {
    await api.updateTask?.({ taskId: task.id, reminderAt: null });
    onSave(null);
    onClose();
  };

  // Theme tokens
  const M = isLight ? {
    overlay:      'rgba(15,23,42,0.40)',
    bg:           '#FFFFFF',
    border:       'rgba(251,191,36,0.30)',
    divider:      '#E8EDF5',
    headerBg:     'rgba(251,191,36,0.06)',
    title:        '#0F172A',
    closeC:       '#94A3B8',
    closeHov:     '#475569',
    closeHovBg:   'rgba(0,0,0,0.06)',
    desc:         '#64748B',
    taskName:     '#0F172A',
    label:        '#94A3B8',
    inputBg:      '#F1F5F9',
    inputBdr:     '#CBD5E1',
    inputC:       '#0F172A',
    scheme:       'light',
    cancelBdr:    '#CBD5E1',
    cancelC:      '#64748B',
    shadow:       '0 20px 60px rgba(0,0,0,0.12), 0 4px 16px rgba(0,0,0,0.08)',
  } : {
    overlay:      'rgba(0,0,0,0.74)',
    bg:           'rgba(9,10,20,0.99)',
    border:       'rgba(251,191,36,0.25)',
    divider:      '#171A28',
    headerBg:     'rgba(251,191,36,0.05)',
    title:        '#E8EAF6',
    closeC:       '#4B5263',
    closeHov:     '#EAEAF0',
    closeHovBg:   'rgba(255,255,255,0.07)',
    desc:         '#9CA3AF',
    taskName:     '#E8EAF6',
    label:        '#6B7280',
    inputBg:      'rgba(255,255,255,0.04)',
    inputBdr:     'rgba(255,255,255,0.10)',
    inputC:       '#E8EAF6',
    scheme:       'dark',
    cancelBdr:    '#252932',
    cancelC:      '#6B7280',
    shadow:       '0 40px 100px rgba(0,0,0,0.85)',
  };

  const inputStyle = {
    width: '100%', boxSizing: 'border-box', padding: '8px 11px',
    background: M.inputBg, border: `1px solid ${M.inputBdr}`,
    borderRadius: 9, fontSize: 12, color: M.inputC, outline: 'none',
    colorScheme: M.scheme, transition: 'border-color 0.15s',
  };
  const labelStyle = {
    fontSize: 10, fontWeight: 700, color: M.label,
    textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5, display: 'block',
  };

  return createPortal(
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 9996, display: 'flex', alignItems: 'center', justifyContent: 'center', background: M.overlay, backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 340, background: M.bg, border: `1px solid ${M.border}`, borderRadius: 16, overflow: 'hidden', boxShadow: M.shadow, display: 'flex', flexDirection: 'column', animation: 'fl-modal-up 0.2s cubic-bezier(0.22,1,0.36,1) both' }}>

        {/* Header */}
        <div style={{ padding: '14px 18px 12px', borderBottom: `1px solid ${M.divider}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: M.headerBg }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Bell size={13} style={{ color: '#F59E0B' }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: M.title }}>Set Reminder</span>
          </div>
          <button onClick={onClose}
            style={{ padding: 4, borderRadius: 6, border: 'none', background: 'transparent', color: M.closeC, cursor: 'pointer', display: 'flex', transition: 'all 0.12s' }}
            onMouseOver={e => { e.currentTarget.style.color = M.closeHov; e.currentTarget.style.background = M.closeHovBg; }}
            onMouseOut={e  => { e.currentTarget.style.color = M.closeC;   e.currentTarget.style.background = 'transparent'; }}>
            <X size={13} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '16px 18px' }}>
          <p style={{ fontSize: 11, color: M.desc, margin: '0 0 14px', lineHeight: 1.5 }}>
            Remind me about <span style={{ color: M.taskName, fontWeight: 600 }}>{task.title}</span>
          </p>
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle}
              onFocus={e  => e.target.style.borderColor = 'rgba(245,158,11,0.55)'}
              onBlur={e   => e.target.style.borderColor = M.inputBdr} />
          </div>
          <div style={{ marginBottom: 18 }}>
            <label style={labelStyle}>Time</label>
            <input type="time" value={time} onChange={e => setTime(e.target.value)} style={inputStyle}
              onFocus={e  => e.target.style.borderColor = 'rgba(245,158,11,0.55)'}
              onBlur={e   => e.target.style.borderColor = M.inputBdr} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleSave} disabled={saving}
              style={{ flex: 1, padding: '9px 0', borderRadius: 10, fontSize: 12, fontWeight: 650, cursor: saving ? 'not-allowed' : 'pointer', background: 'linear-gradient(135deg, #F59E0B, #FBB924)', border: '1px solid rgba(245,158,11,0.4)', color: '#111', boxShadow: '0 2px 12px rgba(245,158,11,0.28)', opacity: saving ? 0.7 : 1, transition: 'opacity 0.12s' }}>
              {saving ? 'Saving…' : 'Set Reminder'}
            </button>
            {currentReminderAt && (
              <button onClick={handleClear}
                style={{ padding: '9px 14px', borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: 'transparent', border: '1px solid rgba(239,68,68,0.35)', color: '#F87171', transition: 'background 0.12s' }}
                onMouseOver={e => e.currentTarget.style.background = 'rgba(239,68,68,0.08)'}
                onMouseOut={e  => e.currentTarget.style.background = 'transparent'}>
                Clear
              </button>
            )}
            <button onClick={onClose}
              style={{ padding: '9px 14px', borderRadius: 10, fontSize: 12, cursor: 'pointer', background: 'transparent', border: `1px solid ${M.cancelBdr}`, color: M.cancelC, transition: 'background 0.12s' }}
              onMouseOver={e => e.currentTarget.style.background = isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)'}
              onMouseOut={e  => e.currentTarget.style.background = 'transparent'}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── RECURRING MODAL ──────────────────────────────────────────────────────────
const RECUR_OPTIONS = [
  { id: 'daily',    label: 'Daily',    desc: 'Repeats every day' },
  { id: 'weekdays', label: 'Weekdays', desc: 'Mon – Fri only' },
  { id: 'weekly',   label: 'Weekly',   desc: 'Same day each week' },
  { id: 'monthly',  label: 'Monthly',  desc: 'Same day each month' },
];

function RecurringModal({ task, currentRule, onSave, onClose, isLight = false }) {
  const [selected, setSelected] = useState(currentRule || null);
  const [saving,   setSaving]   = useState(false);

  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  const handleSave = async () => {
    setSaving(true);
    await api.updateTask?.({ taskId: task.id, recurrenceRule: selected });
    onSave(selected);
    onClose();
  };

  const handleClear = async () => {
    await api.updateTask?.({ taskId: task.id, recurrenceRule: null });
    onSave(null);
    onClose();
  };

  const M = isLight ? {
    overlay:       'rgba(15,23,42,0.40)',
    bg:            '#FFFFFF',
    border:        'rgba(16,185,129,0.28)',
    divider:       '#E8EDF5',
    headerBg:      'rgba(16,185,129,0.05)',
    title:         '#0F172A',
    closeC:        '#94A3B8',
    closeHov:      '#475569',
    closeHovBg:    'rgba(0,0,0,0.06)',
    desc:          '#64748B',
    taskName:      '#0F172A',
    optIdleBg:     '#F8FAFC',
    optIdleBdr:    '#E2E8F0',
    optIdleLabel:  '#334155',
    optIdleDesc:   '#94A3B8',
    optActBg:      'rgba(16,185,129,0.09)',
    optActBdr:     'rgba(16,185,129,0.35)',
    optActLabel:   '#059669',
    cancelBdr:     '#CBD5E1',
    cancelC:       '#64748B',
    shadow:        '0 20px 60px rgba(0,0,0,0.12), 0 4px 16px rgba(0,0,0,0.08)',
    disabledBg:    'rgba(0,0,0,0.05)',
    disabledBdr:   '#E2E8F0',
    disabledC:     '#94A3B8',
  } : {
    overlay:       'rgba(0,0,0,0.74)',
    bg:            'rgba(9,10,20,0.99)',
    border:        'rgba(52,211,153,0.22)',
    divider:       '#171A28',
    headerBg:      'rgba(52,211,153,0.04)',
    title:         '#E8EAF6',
    closeC:        '#4B5263',
    closeHov:      '#EAEAF0',
    closeHovBg:    'rgba(255,255,255,0.07)',
    desc:          '#9CA3AF',
    taskName:      '#E8EAF6',
    optIdleBg:     'rgba(255,255,255,0.03)',
    optIdleBdr:    'rgba(255,255,255,0.07)',
    optIdleLabel:  '#C4C9D4',
    optIdleDesc:   '#6B7280',
    optActBg:      'rgba(52,211,153,0.12)',
    optActBdr:     'rgba(52,211,153,0.35)',
    optActLabel:   '#34D399',
    cancelBdr:     '#252932',
    cancelC:       '#6B7280',
    shadow:        '0 40px 100px rgba(0,0,0,0.85)',
    disabledBg:    'rgba(255,255,255,0.04)',
    disabledBdr:   'rgba(255,255,255,0.06)',
    disabledC:     '#3D4555',
  };

  return createPortal(
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 9996, display: 'flex', alignItems: 'center', justifyContent: 'center', background: M.overlay, backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 340, background: M.bg, border: `1px solid ${M.border}`, borderRadius: 16, overflow: 'hidden', boxShadow: M.shadow, display: 'flex', flexDirection: 'column', animation: 'fl-modal-up 0.2s cubic-bezier(0.22,1,0.36,1) both' }}>

        {/* Header */}
        <div style={{ padding: '14px 18px 12px', borderBottom: `1px solid ${M.divider}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: M.headerBg }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Repeat size={13} style={{ color: '#10B981' }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: M.title }}>Set Recurrence</span>
          </div>
          <button onClick={onClose}
            style={{ padding: 4, borderRadius: 6, border: 'none', background: 'transparent', color: M.closeC, cursor: 'pointer', display: 'flex', transition: 'all 0.12s' }}
            onMouseOver={e => { e.currentTarget.style.color = M.closeHov; e.currentTarget.style.background = M.closeHovBg; }}
            onMouseOut={e  => { e.currentTarget.style.color = M.closeC;   e.currentTarget.style.background = 'transparent'; }}>
            <X size={13} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '16px 18px' }}>
          <p style={{ fontSize: 11, color: M.desc, margin: '0 0 14px', lineHeight: 1.5 }}>
            When <span style={{ color: M.taskName, fontWeight: 600 }}>{task.title}</span> is completed, it resets automatically for the next occurrence.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 18 }}>
            {RECUR_OPTIONS.map(opt => {
              const active = selected === opt.id;
              return (
                <button key={opt.id} onClick={() => setSelected(opt.id)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 13px', borderRadius: 10, cursor: 'pointer', transition: 'all 0.12s', textAlign: 'left', border: `1px solid ${active ? M.optActBdr : M.optIdleBdr}`, background: active ? M.optActBg : M.optIdleBg }}
                  onMouseOver={e => { if (!active) { e.currentTarget.style.background = isLight ? '#F1F5F9' : 'rgba(255,255,255,0.05)'; e.currentTarget.style.borderColor = isLight ? '#CBD5E1' : 'rgba(255,255,255,0.12)'; }}}
                  onMouseOut={e  => { if (!active) { e.currentTarget.style.background = M.optIdleBg; e.currentTarget.style.borderColor = M.optIdleBdr; }}}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: active ? M.optActLabel : M.optIdleLabel }}>{opt.label}</div>
                    <div style={{ fontSize: 10, color: active ? (isLight ? '#6EE7B7' : M.optIdleDesc) : M.optIdleDesc, marginTop: 1 }}>{opt.desc}</div>
                  </div>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: active ? '#10B981' : (isLight ? '#CBD5E1' : '#374151'), transition: 'background 0.15s', flexShrink: 0 }} />
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleSave} disabled={!selected || saving}
              style={{ flex: 1, padding: '9px 0', borderRadius: 10, fontSize: 12, fontWeight: 650, cursor: selected && !saving ? 'pointer' : 'not-allowed', background: selected ? 'linear-gradient(135deg, #10B981, #34D399)' : M.disabledBg, border: `1px solid ${selected ? 'rgba(16,185,129,0.4)' : M.disabledBdr}`, color: selected ? '#fff' : M.disabledC, boxShadow: selected ? '0 2px 12px rgba(16,185,129,0.25)' : 'none', opacity: saving ? 0.7 : 1, transition: 'all 0.14s' }}>
              {saving ? 'Saving…' : 'Set Recurrence'}
            </button>
            {currentRule && (
              <button onClick={handleClear}
                style={{ padding: '9px 14px', borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: 'transparent', border: '1px solid rgba(239,68,68,0.35)', color: '#F87171', transition: 'background 0.12s' }}
                onMouseOver={e => e.currentTarget.style.background = 'rgba(239,68,68,0.08)'}
                onMouseOut={e  => e.currentTarget.style.background = 'transparent'}>
                Clear
              </button>
            )}
            <button onClick={onClose}
              style={{ padding: '9px 14px', borderRadius: 10, fontSize: 12, cursor: 'pointer', background: 'transparent', border: `1px solid ${M.cancelBdr}`, color: M.cancelC, transition: 'background 0.12s' }}
              onMouseOver={e => e.currentTarget.style.background = isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)'}
              onMouseOut={e  => e.currentTarget.style.background = 'transparent'}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── SUBTASKS PANEL (right-side detail panel) ─────────────────────────────────
// Subtasks are real task records linked via parent_task_id — read-only in Calendar.
// Creation and deletion happen exclusively on the Tasks page.
function SubtasksPanel({ task, sessions, onUpdate, onClose, onNavigate, isLight = false, user }) {
  const T = makeT(isLight);
  const [notes,         setNotes]         = useState(task.notes || '');
  const [subs,          setSubs]          = useState(task._subtasks || []);
  const [saving,        setSaving]        = useState(false);
  const [reminderAt,    setReminderAt]    = useState(task.reminder_at || null);
  const [recurrenceRule, setRecurrenceRule] = useState(task.recurrence_rule || null);
  const [showRemind,    setShowRemind]    = useState(false);
  const [showRecurring, setShowRecurring] = useState(false);
  // 'idle' | 'starting' | 'started' | 'error'
  const [focusState,    setFocusState]   = useState('idle');

  // Sync when the selected task changes
  useEffect(() => {
    setSubs(task._subtasks || []);
    setNotes(task.notes || '');
    setReminderAt(task.reminder_at || null);
    setRecurrenceRule(task.recurrence_rule || null);
  }, [task.id, task._subtasks]);

  const linkedSessions = useMemo(() =>
    sessions.filter(s => s.task_id === task.id || (task.title && s.title === task.title)),
    [sessions, task]);
  const trackedSecs = linkedSessions.reduce((s, x) => s + (x.duration_seconds || 0), 0);

  const col      = task._proj?.color || (task.priority !== 'none' ? PRIORITY[task.priority]?.color : null) || '#818CF8';
  const p        = PRIORITY[task.priority] || PRIORITY.none;
  const doneCount = subs.filter(s => s.status === 'done').length;
  const pct       = subs.length > 0 ? Math.round((doneCount / subs.length) * 100) : 0;

  // Toggle a subtask between 'done' and 'todo' — updates the real task record
  const toggleSub = useCallback(async (subId) => {
    const sub = subs.find(s => s.id === subId);
    if (!sub) return;
    const nextStatus = sub.status === 'done' ? 'todo' : 'done';
    setSubs(prev => prev.map(s => s.id === subId ? { ...s, status: nextStatus } : s));
    await api.updateTask?.({ taskId: subId, status: nextStatus });
  }, [subs]);

  const saveNotes = useCallback(async () => {
    setSaving(true);
    await api.updateTask?.({ taskId: task.id, notes });
    onUpdate?.({ ...task, notes });
    setSaving(false);
  }, [task, notes, onUpdate]);

  const startFocus = async () => {
    if (focusState === 'starting') return;
    setFocusState('starting');
    try {
      const res = await api.startSession?.({ userId: user?.id, taskId: task.id, title: task.title, projectId: task.project_id, category: 'Focus' });
      if (res?.id) {
        setFocusState('started');
        setTimeout(() => setFocusState('idle'), 2500);
      } else {
        setFocusState('error');
        setTimeout(() => setFocusState('idle'), 2000);
      }
    } catch (_) {
      setFocusState('error');
      setTimeout(() => setFocusState('idle'), 2000);
    }
  };

  const panelStyle = {
    display: 'flex', flexDirection: 'column', height: '100%',
    borderLeft: `1px solid ${T.border}`, background: T.panelBg,
    overflow: 'hidden',
  };

  return (
    <div className="fl-subtasks-panel" style={panelStyle}>
      {/* ── Panel header ── */}
      <div style={{
        padding: '12px 14px 11px',
        borderBottom: `1px solid ${T.border}`,
        flexShrink: 0,
        background: `linear-gradient(135deg, ${col}${isLight ? '06' : '08'} 0%, transparent 60%)`,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
          <div style={{ width: 3, borderRadius: 99, alignSelf: 'stretch', background: col, flexShrink: 0, minHeight: 14 }} />
          <p style={{ flex: 1, fontSize: 13, fontWeight: 700, margin: 0, lineHeight: 1.35,
            textDecoration: task.status === 'done' ? 'line-through' : 'none',
            color: task.status === 'done' ? T.textDone : T.textPrimary }}>
            {task.title}
          </p>
          <button onClick={onClose}
            style={{ padding: 4, borderRadius: 6, border: 'none', background: 'transparent', color: T.textVFaint, cursor: 'pointer', flexShrink: 0, display: 'flex', transition: 'all 0.12s' }}
            onMouseOver={e => { e.currentTarget.style.color = T.textPrimary; e.currentTarget.style.background = isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)'; }}
            onMouseOut={e  => { e.currentTarget.style.color = T.textVFaint; e.currentTarget.style.background = 'transparent'; }}>
            <X size={12} />
          </button>
        </div>

        {/* Meta badges row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', paddingLeft: 11 }}>
          {task.status === 'in_progress' && <Badge color="#818CF8" bg="rgba(129,140,248,0.10)" border="rgba(129,140,248,0.25)" icon={Timer}>Active</Badge>}
          {task.status === 'done'        && <Badge color="#34D399" bg="rgba(52,211,153,0.10)"  border="rgba(52,211,153,0.25)"  icon={CheckCircle2}>Done</Badge>}
          {task.status === 'todo'        && <Badge color="#6B7280" bg="rgba(107,114,128,0.10)" border="rgba(107,114,128,0.25)" icon={Circle}>Todo</Badge>}
          {task.priority !== 'none' && <Badge color={p.color} bg={p.bg} border={p.border} icon={Flag}>{p.label}</Badge>}
          {task._proj && (
            <span style={{ fontSize: 9, fontWeight: 600, color: task._proj.color, display: 'flex', alignItems: 'center', gap: 3 }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: task._proj.color }} />{task._proj.name}
            </span>
          )}
          {task.due_date && (
            <span style={{ fontSize: 9, color: isOverdue(task.due_date) ? '#F87171' : T.textFaint, display: 'flex', alignItems: 'center', gap: 2 }}>
              <Calendar size={8} />{fmtDate(task.due_date)}
            </span>
          )}
        </div>

        {/* Progress bar (only when subtasks exist) */}
        {subs.length > 0 && (
          <div style={{ marginTop: 10, paddingLeft: 11 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: T.sectionText, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                Progress
              </span>
              <span style={{ fontSize: 10, fontWeight: 700, color: pct === 100 ? '#34D399' : col }}>
                {doneCount}/{subs.length} · {pct}%
              </span>
            </div>
            <div style={{ height: 4, background: T.progressTrack, borderRadius: 99, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? '#34D399' : col, borderRadius: 99, transition: 'width 0.3s ease' }} />
            </div>
          </div>
        )}
      </div>

      {/* ── Scrollable body ── */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '12px 14px' }}>

        {/* Quick actions */}
        <div style={{ display: 'flex', gap: 5, marginBottom: 16, flexWrap: 'wrap' }}>
          <button onClick={startFocus} disabled={focusState === 'starting'}
            style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 8,
              fontSize: 10.5, fontWeight: 700, cursor: focusState === 'starting' ? 'not-allowed' : 'pointer', transition: 'all 0.12s',
              background: focusState === 'started'
                ? (isLight ? 'rgba(52,211,153,0.12)' : 'rgba(52,211,153,0.15)')
                : focusState === 'error'
                ? (isLight ? 'rgba(239,68,68,0.08)' : 'rgba(239,68,68,0.12)')
                : (isLight ? 'rgba(99,102,241,0.09)' : 'rgba(129,140,248,0.12)'),
              border: `1px solid ${focusState === 'started' ? 'rgba(52,211,153,0.35)' : focusState === 'error' ? 'rgba(239,68,68,0.30)' : (isLight ? 'rgba(99,102,241,0.28)' : 'rgba(129,140,248,0.28)')}`,
              color: focusState === 'started' ? '#34D399' : focusState === 'error' ? '#F87171' : (isLight ? '#4F46E5' : '#A5B4FC'),
              opacity: focusState === 'starting' ? 0.65 : 1,
              boxShadow: '0 1px 4px rgba(129,140,248,0.08)',
            }}
            onMouseOver={e => { if (focusState === 'idle') { e.currentTarget.style.background = isLight ? 'rgba(99,102,241,0.16)' : 'rgba(129,140,248,0.22)'; e.currentTarget.style.boxShadow = '0 1px 8px rgba(129,140,248,0.18)'; }}}
            onMouseOut={e  => { if (focusState === 'idle') { e.currentTarget.style.background = isLight ? 'rgba(99,102,241,0.09)' : 'rgba(129,140,248,0.12)'; e.currentTarget.style.boxShadow = '0 1px 4px rgba(129,140,248,0.08)'; }}}>
            {focusState === 'starting' ? <Clock size={9} /> : focusState === 'started' ? <CheckCircle2 size={9} /> : focusState === 'error' ? <AlertCircle size={9} /> : <Play size={9} fill="currentColor" strokeWidth={0} />}
            {focusState === 'starting' ? 'Starting…' : focusState === 'started' ? 'Started!' : focusState === 'error' ? 'Failed' : 'Start focus'}
          </button>
          <button onClick={() => setShowRemind(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 8, fontSize: 10, fontWeight: 600, cursor: 'pointer', transition: 'all 0.12s',
              background: reminderAt ? (isLight ? 'rgba(251,191,36,0.10)' : 'rgba(251,191,36,0.12)') : T.btnBg,
              border: `1px solid ${reminderAt ? 'rgba(251,191,36,0.35)' : T.btnBdr}`,
              color: reminderAt ? '#FBB924' : T.btnText }}
            onMouseOver={e => { e.currentTarget.style.background = isLight ? '#E8EFF8' : 'rgba(255,255,255,0.06)'; }}
            onMouseOut={e  => { e.currentTarget.style.background = reminderAt ? (isLight ? 'rgba(251,191,36,0.10)' : 'rgba(251,191,36,0.12)') : T.btnBg; }}>
            <Bell size={9} />
            {reminderAt
              ? new Date(reminderAt * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : 'Remind'}
          </button>
          <button onClick={() => setShowRecurring(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 8, fontSize: 10, fontWeight: 600, cursor: 'pointer', transition: 'all 0.12s',
              background: recurrenceRule ? (isLight ? 'rgba(52,211,153,0.10)' : 'rgba(52,211,153,0.12)') : T.btnBg,
              border: `1px solid ${recurrenceRule ? 'rgba(52,211,153,0.35)' : T.btnBdr}`,
              color: recurrenceRule ? '#34D399' : T.btnText }}
            onMouseOver={e => { e.currentTarget.style.background = isLight ? '#E8EFF8' : 'rgba(255,255,255,0.06)'; }}
            onMouseOut={e  => { e.currentTarget.style.background = recurrenceRule ? (isLight ? 'rgba(52,211,153,0.10)' : 'rgba(52,211,153,0.12)') : T.btnBg; }}>
            <Repeat size={9} />
            {recurrenceRule
              ? recurrenceRule.charAt(0).toUpperCase() + recurrenceRule.slice(1)
              : 'Recurring'}
          </button>
        </div>

        {/* Remind modal */}
        {showRemind && (
          <RemindModal task={task} currentReminderAt={reminderAt} isLight={isLight}
            onSave={ts => { setReminderAt(ts); onUpdate?.({ ...task, reminder_at: ts }); }}
            onClose={() => setShowRemind(false)} />
        )}

        {/* Recurring modal */}
        {showRecurring && (
          <RecurringModal task={task} currentRule={recurrenceRule} isLight={isLight}
            onSave={rule => { setRecurrenceRule(rule); onUpdate?.({ ...task, recurrence_rule: rule }); }}
            onClose={() => setShowRecurring(false)} />
        )}

        {/* Subtasks */}
        <div style={{ marginBottom: 16 }}>
          <SectionLabel>
            Subtasks{subs.length > 0 ? ` — ${doneCount} of ${subs.length} done` : ''}
          </SectionLabel>

          {subs.length === 0 ? (
            <div style={{ padding: '10px 10px 12px', borderRadius: 8, background: isLight ? 'rgba(99,102,241,0.04)' : 'rgba(129,140,248,0.04)', border: `1px dashed ${isLight ? 'rgba(99,102,241,0.18)' : 'rgba(129,140,248,0.16)'}`, textAlign: 'center' }}>
              <p style={{ fontSize: 11, color: T.textVFaint, marginBottom: 6, lineHeight: 1.5 }}>
                No subtasks yet.
              </p>
              <button
                onClick={() => onNavigate?.('tasks')}
                style={{ fontSize: 10, fontWeight: 600, padding: '4px 12px', borderRadius: 7, background: T.addBg, border: `1px solid ${T.addBdr}`, color: T.addText, cursor: 'pointer', transition: 'background 0.12s' }}
                onMouseOver={e => e.currentTarget.style.background = T.addHover}
                onMouseOut={e  => e.currentTarget.style.background = T.addBg}>
                Add subtasks in Tasks page →
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {subs.map(sub => {
                const isDone = sub.status === 'done';
                const subCol = PRIORITY[sub.priority]?.color || T.textVFaint;
                return (
                  <div key={sub.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '6px 8px', borderRadius: 8,
                      background: isDone ? 'transparent' : T.subtaskIdleBg,
                      border: `1px solid ${isDone ? 'transparent' : T.subtaskIdleBdr}`,
                      transition: 'background 0.12s',
                    }}>
                    <button onClick={() => toggleSub(sub.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', flexShrink: 0,
                        color: isDone ? '#34D399' : T.textVFaint, transition: 'color 0.12s' }}
                      title={isDone ? 'Mark todo' : 'Mark done'}>
                      {isDone ? <CheckCircle2 size={13} /> : <Circle size={13} />}
                    </button>
                    <span style={{ flex: 1, fontSize: 11.5, color: isDone ? T.textDone : T.textSecond,
                      textDecoration: isDone ? 'line-through' : 'none', lineHeight: 1.4 }}>
                      {sub.title}
                    </span>
                    {sub.priority && sub.priority !== 'none' && (
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: subCol, flexShrink: 0 }} />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* "Manage in Tasks" footer nudge when subtasks exist */}
          {subs.length > 0 && (
            <button
              onClick={() => onNavigate?.('tasks')}
              style={{ marginTop: 8, width: '100%', fontSize: 10, fontWeight: 600, padding: '5px 0', borderRadius: 7, background: 'transparent', border: `1px solid ${T.subtaskIdleBdr}`, color: T.textVFaint, cursor: 'pointer', transition: 'all 0.12s' }}
              onMouseOver={e => { e.currentTarget.style.background = isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)'; e.currentTarget.style.color = T.textMuted; }}
              onMouseOut={e  => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.textVFaint; }}>
              Manage subtasks in Tasks page →
            </button>
          )}
        </div>

        {/* Notes */}
        <div style={{ marginBottom: 14 }}>
          <SectionLabel>Notes</SectionLabel>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            onBlur={saveNotes}
            placeholder="Context, links, or details…"
            rows={3}
            style={{ width: '100%', resize: 'none', lineHeight: 1.6, fontSize: 11, boxSizing: 'border-box',
              background: T.inputBg, border: `1px solid ${T.inputBdr}`, borderRadius: 9,
              padding: '8px 11px', color: T.textSecond, outline: 'none', transition: 'border-color 0.15s' }}
            onFocus={e => e.target.style.borderColor = isLight ? 'rgba(99,102,241,0.45)' : 'rgba(124,108,242,0.50)'}
            onBlur={e  => { e.target.style.borderColor = T.inputBdr; saveNotes(); }}
          />
        </div>

        {/* Tracked time */}
        {trackedSecs > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: T.textVFaint, padding: '8px 10px', borderRadius: 8, background: T.trackedBg, border: `1px solid ${T.trackedBdr}` }}>
            <Clock size={10} style={{ color: T.textFaint }} />
            <span><span style={{ color: T.trackedAccent, fontWeight: 600 }}>{fmtDur(trackedSecs)}</span> tracked across {linkedSessions.length} session{linkedSessions.length !== 1 ? 's' : ''}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── TASKS WORKSPACE ─────────────────────────────────────────────────────────
export function TasksWorkspace({ tasks = [], projects = [], clients = [], sessions = [], calEvents = [], user, onScheduleTask, onNavigate }) {
  const isLight = useThemeLight();
  const T = makeT(isLight);
  const [view,       setView]       = useState('list');   // 'list' | 'kanban'
  const [status,     setStatus]     = useState('all');
  const [projId,     setProjId]     = useState('');
  const [priority,   setPriority]   = useState('');
  const [search,     setSearch]     = useState('');
  const [selectedId, setSelectedId] = useState(null);    // task open in subtasks panel
  const [showNew,    setShowNew]    = useState(false);
  const [local,      setLocal]      = useState(tasks);

  useEffect(() => setLocal(tasks), [tasks]);

  const normalized = useMemo(() => local
    .filter(t => !t.parent_task_id)          // top-level tasks only
    .map(t => ({
      ...t,
      priority:     t.priority || 'none',
      status:       t.status   || 'todo',
      // real child task records from DB (parent_task_id FK model)
      _subtasks:    local
        .filter(s => s.parent_task_id === t.id)
        .map(s => ({ ...s, priority: s.priority || 'none', status: s.status || 'todo' })),
      labels:         Array.isArray(t.labels) ? t.labels : [],
      _proj:          projects.find(p => p.id === t.project_id) || null,
      _client:        clients.find(c => c.id === t.client_id)   || null,
      _trackedSecs:   t.total_seconds || 0,
      notes:          t.notes || '',
      reminder_at:    t.reminder_at || null,
      recurrence_rule: t.recurrence_rule || null,
    })), [local, projects, clients]);

  const filtered = useMemo(() => {
    const pOrder = { high: 0, medium: 1, low: 2, none: 3 };
    return normalized
      .filter(t => status === 'all'  || t.status     === status)
      .filter(t => !projId           || t.project_id === projId)
      .filter(t => !priority         || t.priority   === priority)
      .filter(t => !search           || t.title?.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => (pOrder[a.priority] ?? 3) - (pOrder[b.priority] ?? 3));
  }, [normalized, status, projId, priority, search]);

  const selectedTask = useMemo(() => normalized.find(t => t.id === selectedId) || null, [normalized, selectedId]);

  const toggleStatus = async (task) => {
    const next = task.status === 'done' ? 'todo' : task.status === 'todo' ? 'in_progress' : 'done';
    setLocal(p => p.map(t => t.id === task.id ? { ...t, status: next } : t));
    await api.updateTask?.({ taskId: task.id, status: next });
  };

  const handleUpdate  = (updated) => setLocal(p => p.map(t => t.id === updated.id ? { ...t, ...updated } : t));
  const handleSelect  = (id) => setSelectedId(v => v === id ? null : id);
  const handleClose   = () => setSelectedId(null);

  const counts = { all: normalized.length, todo: normalized.filter(t=>t.status==='todo').length, in_progress: normalized.filter(t=>t.status==='in_progress').length, done: normalized.filter(t=>t.status==='done').length };

  const panelOpen = !!selectedTask;

  const handleTaskCreated = (newTask) => {
    setLocal(p => [newTask, ...p]);
    setSelectedId(newTask.id);
  };

  return (
    <div className="fl-tasks-workspace" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0, background: T.pageBg }}>

      {/* Task creation modal */}
      {showNew && (
        <CreateTaskModal
          projects={projects} clients={clients} user={user}
          onClose={() => setShowNew(false)}
          onCreate={handleTaskCreated}
        />
      )}

      {/* ══ Top header (full width) ══════════════════════════════════════════ */}
      <div className="fl-tasks-workspace-header" style={{ padding: '12px 14px 10px', borderBottom: `1px solid ${T.headerBdr}`, flexShrink: 0, background: T.headerBg, boxShadow: isLight ? '0 1px 0 rgba(0,0,0,0.04)' : 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{ width: 26, height: 26, borderRadius: 7, background: T.iconContBg, border: `1px solid ${T.iconContBdr}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CheckSquare size={12} style={{ color: '#818CF8' }} />
            </div>
            <span style={{ fontSize: 13, fontWeight: 700, color: T.textPrimary }}>Tasks</span>
            <span style={{ fontSize: 9, fontWeight: 600, padding: '2px 7px', borderRadius: 99, background: T.countBg, color: T.countText, border: `1px solid ${T.countBdr}` }}>{filtered.length}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ display: 'flex', background: T.viewSwitchBg, border: `1px solid ${T.viewSwitchBdr}`, borderRadius: 7, padding: 2, gap: 1 }}>
              {[{ id: 'list', I: List }, { id: 'kanban', I: Grid }].map(({ id, I }) => (
                <button key={id} onClick={() => setView(id)}
                  style={{ padding: '3px 7px', borderRadius: 5, border: 'none', background: view === id ? T.viewActiveB : 'transparent', color: view === id ? T.viewActiveC : T.viewIdleC, cursor: 'pointer', display: 'flex', alignItems: 'center', transition: 'all 0.12s', boxShadow: view === id && isLight ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}>
                  <I size={11} />
                </button>
              ))}
            </div>
            <button onClick={() => onNavigate ? onNavigate('tasks') : setShowNew(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 8, background: T.addBg, border: `1px solid ${T.addBdr}`, color: T.addText, fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'background 0.12s' }}
              onMouseOver={e => e.currentTarget.style.background = T.addHover}
              onMouseOut={e  => e.currentTarget.style.background = T.addBg}>
              <Plus size={11} />Task
            </button>
          </div>
        </div>

        {/* Filter bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: T.searchBg, border: `1px solid ${T.searchBdr}`, borderRadius: 8, padding: '4px 8px', flex: '1 1 120px', maxWidth: 180 }}>
            <Search size={9} style={{ color: T.searchIcon, flexShrink: 0 }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
              style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: 11, color: T.textPrimary, width: '100%', minWidth: 0 }} />
          </div>
          <div style={{ display: 'flex', gap: 1, background: T.toggleGrpBg, border: `1px solid ${T.toggleGrpBdr}`, borderRadius: 9, padding: '2px' }}>
            {['all','todo','in_progress','done'].map(s => {
              const lbl = s === 'all' ? `All` : s === 'in_progress' ? `Active` : s.charAt(0).toUpperCase()+s.slice(1);
              const cnt = s === 'all' ? counts.all : counts[s] ?? counts.in_progress;
              const active = status === s;
              return (
                <button key={s} onClick={() => setStatus(s)}
                  style={{ fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 7, cursor: 'pointer',
                    border: 'none',
                    background: active ? T.toggleActiveBg : 'transparent',
                    color: active ? T.toggleActiveC : T.toggleIdleC,
                    transition: 'background 0.12s, color 0.12s',
                    display: 'flex', alignItems: 'center', gap: 4,
                    boxShadow: active && isLight ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  }}>
                  {lbl}
                  <span style={{ fontSize: 8.5, fontWeight: 700, opacity: active ? 0.85 : 0.5 }}>{cnt}</span>
                </button>
              );
            })}
          </div>
          {projects.length > 0 && (
            <select value={projId} onChange={e => setProjId(e.target.value)}
              style={{ fontSize: 10, padding: '3px 7px', background: T.viewSwitchBg, border: `1px solid ${T.viewSwitchBdr}`, borderRadius: 7, color: projId ? T.toggleActiveC : T.toggleIdleC, outline: 'none', colorScheme: isLight ? 'light' : 'dark', cursor: 'pointer' }}>
              <option value="">All projects</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          <select value={priority} onChange={e => setPriority(e.target.value)}
            style={{ fontSize: 10, padding: '3px 7px', background: T.viewSwitchBg, border: `1px solid ${T.viewSwitchBdr}`, borderRadius: 7, color: priority ? PRIORITY[priority]?.color : T.toggleIdleC, outline: 'none', colorScheme: isLight ? 'light' : 'dark', cursor: 'pointer' }}>
            <option value="">Priority</option>
            <option value="high">🔴 High</option>
            <option value="medium">🟡 Medium</option>
            <option value="low">🔵 Low</option>
          </select>
        </div>
      </div>

      {/* ══ Split content area ═══════════════════════════════════════════════ */}
      <div className="fl-tasks-workspace-split" style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0, background: T.pageBg }}>

        {/* ── LEFT: Task list ─────────────────────────────────────────────── */}
        <div className="fl-tasks-list-pane" style={{
          flex: panelOpen ? '0 0 55%' : '1 1 100%',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden', minHeight: 0,
          transition: 'flex 0.22s ease',
          background: T.pageBg,
        }}>
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {filtered.length === 0 ? (
              <EmptyState icon={CheckSquare}
                title={search || status !== 'all' || projId ? 'No matching tasks' : 'No tasks yet'}
                sub={search || status !== 'all' || projId ? '' : 'Create a task to start focused work'}
                action={search || status !== 'all' || projId ? '' : '+ New task'}
                onAction={() => onNavigate ? onNavigate('tasks') : setShowNew(true)} />
            ) : view === 'list' ? (
              <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                {filtered.map(task => (
                  <TaskCard key={task.id} task={task} isLight={isLight}
                    selected={selectedId === task.id}
                    onSelect={handleSelect}
                    onToggleStatus={toggleStatus}
                    onSchedule={onScheduleTask}
                  />
                ))}
              </div>
            ) : (
              /* Kanban */
              <div style={{ display: 'flex', gap: 8, padding: '8px 10px', height: '100%', alignItems: 'flex-start', overflowX: 'auto' }}>
                {KANBAN_COLS.map(col => {
                  const colTasks = filtered.filter(t => t.status === col.id);
                  return (
                    <div key={col.id} style={{ flex: '0 0 200px', display: 'flex', flexDirection: 'column' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 6px 8px', borderBottom: `1px solid ${col.color}18`, marginBottom: 6 }}>
                        <div style={{ width: 20, height: 20, borderRadius: 6, background: `${col.color}12`, border: `1px solid ${col.color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <col.Icon size={10} style={{ color: col.color }} />
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: col.color, flex: 1 }}>{col.label}</span>
                        <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 99, background: `${col.color}10`, color: col.color, border: `1px solid ${col.color}22` }}>{colTasks.length}</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {colTasks.map(task => (
                          <TaskCard key={task.id} task={task} compact isLight={isLight}
                            selected={selectedId === task.id}
                            onSelect={handleSelect}
                            onToggleStatus={toggleStatus}
                            onSchedule={onScheduleTask}
                          />
                        ))}
                        {colTasks.length === 0 && (
                          <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 10, color: T.kanbanEmptyTx, border: `1px dashed ${col.color}${isLight ? '18' : '20'}`, borderRadius: 8, background: `${col.color}${isLight ? '03' : '04'}` }}>No tasks</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT: Subtasks panel ────────────────────────────────────────── */}
        <div className="fl-tasks-detail-pane" style={{
          flex: panelOpen ? '0 0 45%' : '0 0 0%',
          overflow: 'hidden',
          transition: 'flex 0.22s ease',
          minWidth: 0,
        }}>
          {selectedTask ? (
            <SubtasksPanel
              key={selectedTask.id}
              task={selectedTask}
              sessions={sessions}
              onUpdate={handleUpdate}
              onClose={handleClose}
              onNavigate={onNavigate}
              isLight={isLight}
              user={user}
            />
          ) : (
            /* Empty state — shown briefly during transition */
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 10, borderLeft: `1px solid ${T.border}`, background: T.panelBg }}>
              <CheckSquare size={26} style={{ color: isLight ? '#CBD5E1' : '#252932', opacity: 0.5 }} />
              <p style={{ fontSize: 11, color: T.textVFaint, textAlign: 'center', lineHeight: 1.5, margin: 0 }}>
                Select a task<br />to view subtasks
              </p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

// ─── PROJECT DETAIL PANEL ────────────────────────────────────────────────────
function ProjectDetailPanel({ proj, allTasks, sessions, calEvents, onClose, onStatusChange, onUpdate }) {
  const isLight = useThemeLight();
  const T = makeT(isLight);
  const [notes, setNotes]   = useState(proj.notes || '');
  const [saving, setSaving] = useState(false);

  const projTasks    = allTasks.filter(t => t.project_id === proj.id);
  const projEvents   = calEvents.filter(e => e.project_id === proj.id);
  const projSessions = sessions.filter(s => s.project_id === proj.id).sort((a, b) => (b.started_at || 0) - (a.started_at || 0));
  const todoT   = projTasks.filter(t => !t.status || t.status === 'todo');
  const activeT = projTasks.filter(t => t.status === 'in_progress');
  const doneT   = projTasks.filter(t => t.status === 'done');

  const saveNotes = async () => {
    setSaving(true);
    try { await api.updateProject?.({ projectId: proj.id, notes }); onUpdate?.({ ...proj, notes }); }
    finally { setSaving(false); }
  };

  return (
    <div className="fl-calendar-project-detail" style={{ flex: 1, overflowY: 'auto', padding: '14px 14px', background: T.panelBg, borderLeft: `1px solid ${proj.color}22` }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: proj.color }} />
            <p style={{ fontSize: 14, fontWeight: 700, color: T.textPrimary, margin: 0 }}>{proj.name}</p>
          </div>
          {proj._client && <p style={{ fontSize: 10, color: T.textFaint }}>{proj._client.name}</p>}
        </div>
        <button onClick={onClose} style={{ padding: 4, borderRadius: 6, border: 'none', background: 'transparent', color: T.textVFaint, cursor: 'pointer', display: 'flex', transition: 'all 0.12s' }}
          onMouseOver={e => { e.currentTarget.style.color = T.textPrimary; e.currentTarget.style.background = isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.06)'; }}
          onMouseOut={e  => { e.currentTarget.style.color = T.textVFaint; e.currentTarget.style.background = 'transparent'; }}>
          <X size={14} />
        </button>
      </div>

      {/* Status toggle */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
        {Object.entries(PROJ_STATUS).map(([key, st]) => (
          <button key={key} onClick={() => onStatusChange(proj.id, key)}
            style={{ fontSize: 9, fontWeight: 600, padding: '3px 9px', borderRadius: 99, cursor: 'pointer',
              background: (proj.status || 'active') === key ? st.bg : 'transparent',
              color:      (proj.status || 'active') === key ? st.color : T.textVFaint,
              border: `1px solid ${(proj.status || 'active') === key ? st.border : 'transparent'}`, transition: 'all 0.12s' }}>
            {st.label}
          </button>
        ))}
      </div>

      {/* Progress block */}
      {projTasks.length > 0 && (
        <div style={{ padding: '10px 12px', background: T.progressPillBg, borderRadius: 10, border: `1px solid ${T.progressPillBdr}`, marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: T.textPrimary }}>Progress</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: proj.color }}>{proj.progress}%</span>
          </div>
          <div style={{ height: 5, background: T.progressTrack, borderRadius: 99, overflow: 'hidden', marginBottom: 6 }}>
            <div style={{ height: '100%', width: `${proj.progress}%`, background: `linear-gradient(90deg, ${proj.color}, ${proj.color}AA)`, borderRadius: 99, transition: 'width 0.4s' }} />
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            {[['Todo', todoT.length, T.textVFaint], ['Active', activeT.length, '#818CF8'], ['Done', doneT.length, '#34D399']].map(([l, n, c]) => (
              <span key={l} style={{ fontSize: 9, color: c, fontWeight: 600 }}>{n} {l}</span>
            ))}
          </div>
        </div>
      )}

      {/* Tasks */}
      {projTasks.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <SectionLabel>Tasks ({projTasks.length})</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {projTasks.slice(0, 7).map(t => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 8px', background: T.surfaceBg, borderRadius: 7, border: `1px solid ${T.borderMid}` }}>
                {t.status === 'done' ? <CheckCircle2 size={11} style={{ color: '#34D399', flexShrink: 0 }} />
                  : t.status === 'in_progress' ? <Timer size={11} style={{ color: '#818CF8', flexShrink: 0 }} />
                  : <Circle size={11} style={{ color: T.textVFaint, flexShrink: 0 }} />}
                <span style={{ fontSize: 11, color: t.status === 'done' ? T.textDone : T.textSecond, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: t.status === 'done' ? 'line-through' : 'none' }}>{t.title}</span>
                {t.priority && t.priority !== 'none' && <span style={{ width: 5, height: 5, borderRadius: '50%', background: PRIORITY[t.priority]?.color, flexShrink: 0 }} />}
              </div>
            ))}
            {projTasks.length > 7 && <p style={{ fontSize: 9, color: T.textVFaint, paddingLeft: 2, marginTop: 2 }}>+{projTasks.length - 7} more</p>}
          </div>
        </div>
      )}

      {/* Calendar events */}
      {projEvents.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <SectionLabel>Events ({projEvents.length})</SectionLabel>
          {projEvents.slice(0, 4).map(e => (
            <div className="fl-calendar-workspace-event-row" key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', borderBottom: `1px solid ${T.borderLight}` }}>
              <Calendar size={9} style={{ color: e.color || '#60A5FA', flexShrink: 0 }} />
              <span style={{ fontSize: 10, color: T.textMuted, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.title}</span>
              <span style={{ fontSize: 9, color: T.textVFaint, flexShrink: 0 }}>{fmtRelative(e.start_time)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Recent sessions */}
      {projSessions.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <SectionLabel accent={proj.color + '80'}>Sessions — {fmtDur(projSessions.reduce((s, x) => s + (x.duration_seconds || 0), 0))}</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {projSessions.slice(0, 4).map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 8px', background: T.rowBg, borderRadius: 7, border: `1px solid ${T.rowBdr}` }}>
                <span style={{ fontSize: 10, color: T.textMuted, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title || s.category}</span>
                <span style={{ fontSize: 9, fontWeight: 600, color: T.textFaint, marginLeft: 8, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{fmtDur(s.duration_seconds)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notes */}
      <SectionLabel>Notes</SectionLabel>
      <textarea value={notes} onChange={e => setNotes(e.target.value)} onBlur={saveNotes}
        placeholder="Context, links, milestones…" rows={4}
        style={{ width: '100%', resize: 'vertical', lineHeight: 1.55, fontSize: 11, boxSizing: 'border-box',
          background: T.inputBg, border: `1px solid ${T.inputBdr}`, borderRadius: 9,
          padding: '8px 11px', color: T.textMuted, outline: 'none', transition: 'border-color 0.15s' }}
        onFocus={e => e.target.style.borderColor = isLight ? 'rgba(99,102,241,0.45)' : 'rgba(124,108,242,0.50)'}
        onBlur={e => e.target.style.borderColor = T.inputBdr} />
    </div>
  );
}

// ─── PROJECTS WORKSPACE ──────────────────────────────────────────────────────
export function ProjectsWorkspace({ projects = [], tasks = [], clients = [], sessions = [], calEvents = [], user, onNavigate }) {
  const isLight = useThemeLight();
  const T = makeT(isLight);
  const [selected, setSelected] = useState(null);
  const [view,     setView]     = useState('grid');
  const [showNew,  setShowNew]  = useState(false);
  const [local,    setLocal]    = useState(projects);

  useEffect(() => setLocal(projects), [projects]);

  const enriched = useMemo(() => local.map(p => {
    const projTasks    = tasks.filter(t => t.project_id === p.id);
    const doneCount    = projTasks.filter(t => t.status === 'done').length;
    const activeCount  = projTasks.filter(t => t.status === 'in_progress').length;
    const trackedSecs  = sessions.filter(s => s.project_id === p.id).reduce((s, x) => s + (x.duration_seconds || 0), 0);
    const progress     = projTasks.length > 0 ? Math.round((doneCount / projTasks.length) * 100) : 0;
    const _client      = clients.find(c => c.id === p.client_id) || null;
    const lastSess     = sessions.filter(s => s.project_id === p.id).sort((a, b) => (b.started_at || 0) - (a.started_at || 0))[0];
    return { ...p, _projTasks: projTasks, _doneCount: doneCount, _activeCount: activeCount, _trackedSecs: trackedSecs, progress, _client, _lastSess: lastSess, totalTasks: projTasks.length };
  }), [local, tasks, clients, sessions]);

  const updateStatus = (projId, status) => {
    setLocal(p => p.map(x => x.id === projId ? { ...x, status } : x));
    api.updateProject?.({ projectId: projId, status: status || 'active' });
  };

  const handleUpdate = (updated) => setLocal(p => p.map(x => x.id === updated.id ? { ...x, ...updated } : x));
  const handleProjectCreated = (newProj) => { setLocal(p => [...p, newProj]); setSelected(newProj.id); };
  const selProj = enriched.find(p => p.id === selected);

  return (
    <div className="fl-calendar-projects-workspace" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0, background: T.pageBg }}>

      {/* Project creation modal */}
      {showNew && (
        <CreateProjectModal
          clients={clients} user={user}
          onClose={() => setShowNew(false)}
          onCreate={handleProjectCreated}
        />
      )}

      {/* Header */}
      <div style={{ padding: '12px 14px 10px', borderBottom: `1px solid ${T.headerBdr}`, flexShrink: 0, background: T.headerBg, boxShadow: isLight ? '0 1px 0 rgba(0,0,0,0.04)' : 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{ width: 26, height: 26, borderRadius: 7, background: T.iconContBg, border: `1px solid ${T.iconContBdr}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Briefcase size={12} style={{ color: '#818CF8' }} />
            </div>
            <span style={{ fontSize: 13, fontWeight: 700, color: T.textPrimary }}>Projects</span>
            <span style={{ fontSize: 9, fontWeight: 600, padding: '2px 7px', borderRadius: 99, background: T.countBg, color: T.countText, border: `1px solid ${T.countBdr}` }}>{enriched.length}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ display: 'flex', background: T.viewSwitchBg, border: `1px solid ${T.viewSwitchBdr}`, borderRadius: 7, padding: 2, gap: 1 }}>
              {[{ id: 'grid', I: Grid }, { id: 'list', I: List }].map(({ id, I }) => (
                <button key={id} onClick={() => setView(id)}
                  style={{ padding: '3px 7px', borderRadius: 5, border: 'none', background: view === id ? T.viewActiveB : 'transparent', color: view === id ? T.viewActiveC : T.viewIdleC, cursor: 'pointer', display: 'flex', alignItems: 'center', transition: 'all 0.12s', boxShadow: view === id && isLight ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}>
                  <I size={11} />
                </button>
              ))}
            </div>
            <button onClick={() => onNavigate ? onNavigate('projects') : setShowNew(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 8, background: T.addBg, border: `1px solid ${T.addBdr}`, color: T.addText, fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'background 0.12s' }}
              onMouseOver={e => e.currentTarget.style.background = T.addHover}
              onMouseOut={e  => e.currentTarget.style.background = T.addBg}>
              <Plus size={11} />Project
            </button>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0, background: T.pageBg }}>
        {/* Grid/list */}
        <div style={{ flex: selProj ? '0 0 auto' : 1, overflowY: 'auto', borderRight: selProj ? `1px solid ${T.border}` : 'none',
          ...(selProj ? { width: view === 'grid' ? 300 : '100%', maxWidth: 320 } : {}) }}>
          {enriched.length === 0 ? (
            <EmptyState icon={Briefcase} title="No projects yet" sub="Create a project to organise your work" action="+ New project" onAction={() => onNavigate ? onNavigate('projects') : setShowNew(true)} />
          ) : (
            <div style={{
              display: view === 'grid' ? 'grid' : 'flex',
              gridTemplateColumns: view === 'grid' ? 'repeat(auto-fill, minmax(220px, 1fr))' : undefined,
              flexDirection: 'column',
              gap: 7, padding: '8px 10px',
            }}>
              {enriched.map(proj => {
                const st = PROJ_STATUS[proj.status || 'active'] || PROJ_STATUS.active;
                const isSel = selected === proj.id;
                const cardBg = isSel ? `${proj.color}${isLight ? '09' : '0D'}` : T.cardBg;
                return (
                  <div className="fl-calendar-project-card" key={proj.id} onClick={() => setSelected(isSel ? null : proj.id)}
                    style={{ background: cardBg, border: `1px solid ${isSel ? proj.color+'45' : proj.color+(isLight ? '18' : '20')}`, borderLeft: `3px solid ${proj.color}`, borderRadius: 11, padding: '11px 13px', cursor: 'pointer', transition: 'all 0.15s', boxShadow: isSel ? (isLight ? `0 2px 8px rgba(0,0,0,0.07), 0 0 0 1px ${proj.color}10` : `0 2px 12px rgba(0,0,0,0.25), 0 0 0 1px ${proj.color}10`) : 'none' }}
                    onMouseOver={e => { if (!isSel) { e.currentTarget.style.background = `${proj.color}${isLight ? '06' : '07'}`; e.currentTarget.style.boxShadow = isLight ? '0 1px 4px rgba(0,0,0,0.07)' : '0 2px 8px rgba(0,0,0,0.2)'; }}}
                    onMouseOut={e  => { if (!isSel) { e.currentTarget.style.background = T.cardBg; e.currentTarget.style.boxShadow = 'none'; }}}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 7 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flex: 1, minWidth: 0 }}>
                        <div style={{ width: 26, height: 26, borderRadius: 7, background: `${proj.color}18`, border: `1px solid ${proj.color}28`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <FolderOpen size={12} style={{ color: proj.color }} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 12, fontWeight: 700, color: T.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0, marginBottom: 1 }}>{proj.name}</p>
                          {proj._client && <span style={{ fontSize: 9, color: T.textFaint }}>{proj._client.name}</span>}
                        </div>
                      </div>
                      <Badge color={st.color} bg={st.bg} border={st.border}>{st.label}</Badge>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 7 }}>
                      <span style={{ fontSize: 10, color: T.textFaint, display: 'flex', alignItems: 'center', gap: 3 }}>
                        <CheckSquare size={9} />{proj._doneCount}/{proj.totalTasks}
                      </span>
                      {proj._trackedSecs > 0 && <span style={{ fontSize: 10, color: T.textFaint, display: 'flex', alignItems: 'center', gap: 3 }}><Clock size={9} />{fmtDur(proj._trackedSecs)}</span>}
                      {proj._activeCount > 0 && <Badge color="#818CF8" bg="rgba(129,140,248,0.1)" border="rgba(129,140,248,0.2)">{proj._activeCount} active</Badge>}
                    </div>
                    {proj.totalTasks > 0 && (
                      <>
                        <div style={{ height: 4, background: T.progressTrack, borderRadius: 99, overflow: 'hidden', marginTop: 2 }}>
                          <div style={{ height: '100%', width: `${proj.progress}%`, background: `linear-gradient(90deg, ${proj.color}CC, ${proj.color})`, borderRadius: 99, transition: 'width 0.4s ease', boxShadow: `0 0 6px ${proj.color}40` }} />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                          <span style={{ fontSize: 8.5, fontWeight: 600, color: proj.progress === 100 ? '#34D399' : T.textVFaint }}>{proj.progress}%{proj.progress === 100 ? ' ✓' : ''}</span>
                          {proj._lastSess && <span style={{ fontSize: 8, color: T.textVFaint }}>{fmtRelative(proj._lastSess.started_at)}</span>}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Detail */}
        {selProj && (
          <ProjectDetailPanel proj={selProj} allTasks={tasks} sessions={sessions} calEvents={calEvents}
            onClose={() => setSelected(null)} onStatusChange={updateStatus} onUpdate={handleUpdate} />
        )}
      </div>
    </div>
  );
}

// ─── CLIENT DETAIL PANEL ─────────────────────────────────────────────────────
function ClientDetailPanel({ client, projects, sessions, calEvents, onClose, onUpdate }) {
  const isLight = useThemeLight();
  const T = makeT(isLight);
  const [notes, setNotes] = useState(client.notes || '');

  const linkedProjects  = projects.filter(p => p.client_id === client.id);
  const clientSessions  = sessions.filter(s => s.client_id === client.id || linkedProjects.some(p => p.id === s.project_id)).sort((a, b) => (b.started_at || 0) - (a.started_at || 0));
  const meetings        = calEvents.filter(e => e.client_id === client.id || linkedProjects.some(p => p.id === e.project_id)).sort((a, b) => (b.start_time || 0) - (a.start_time || 0));
  const trackedSecs     = clientSessions.reduce((s, x) => s + (x.duration_seconds || 0), 0);

  const saveNotes = async () => {
    await api.updateClient?.({ clientId: client.id, notes });
    onUpdate?.({ ...client, notes });
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '14px 14px', background: T.panelBg, borderLeft: `1px solid ${client.color}22` }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 38, height: 38, borderRadius: 11, background: `${client.color}18`, border: `1px solid ${client.color}28`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 15, fontWeight: 800, color: client.color }}>{(client.name || '?')[0].toUpperCase()}</span>
          </div>
          <div>
            <p style={{ fontSize: 14, fontWeight: 700, color: T.textPrimary, margin: 0, marginBottom: 2 }}>{client.name}</p>
            {client.company && <p style={{ fontSize: 11, color: T.textFaint, margin: 0 }}>{client.company}</p>}
          </div>
        </div>
        <button onClick={onClose} style={{ padding: 4, borderRadius: 6, border: 'none', background: 'transparent', color: T.textVFaint, cursor: 'pointer', display: 'flex', transition: 'all 0.12s' }}
          onMouseOver={e => { e.currentTarget.style.color = T.textPrimary; e.currentTarget.style.background = isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.06)'; }}
          onMouseOut={e  => { e.currentTarget.style.color = T.textVFaint; e.currentTarget.style.background = 'transparent'; }}>
          <X size={14} />
        </button>
      </div>

      {/* Contact */}
      {(client.email || client.phone || client.website) && (
        <div style={{ padding: '9px 11px', background: T.surfaceBg, borderRadius: 10, border: `1px solid ${T.border}`, marginBottom: 12 }}>
          {[{ icon: Mail, val: client.email }, { icon: Phone, val: client.phone }].filter(x => x.val).map(({ icon: Icon, val }, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
              <Icon size={10} style={{ color: T.textFaint, flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: T.textMuted }}>{val}</span>
            </div>
          ))}
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'flex', gap: 7, marginBottom: 13 }}>
        {[
          { label: 'Tracked', val: fmtDur(trackedSecs) || '—', color: client.color },
          { label: 'Projects', val: linkedProjects.length, color: '#818CF8' },
          { label: 'Meetings', val: meetings.length, color: '#60A5FA' },
        ].map(({ label, val, color }) => (
          <div key={label} style={{ flex: 1, background: T.statCardBg, border: `1px solid ${T.statCardBdr}`, borderTop: `2px solid ${color}50`, borderRadius: 9, padding: '9px 6px 8px', textAlign: 'center' }}>
            <p style={{ fontSize: 15, fontWeight: 700, color, margin: 0, marginBottom: 3, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{val}</p>
            <p style={{ fontSize: 8, color: T.sectionText, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>{label}</p>
          </div>
        ))}
      </div>

      {/* Projects */}
      {linkedProjects.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <SectionLabel>Projects</SectionLabel>
          {linkedProjects.map(p => {
            const pColor = p.color || hashColor(p.name || '');
            const st = PROJ_STATUS[p.status || 'active'] || PROJ_STATUS.active;
            return (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 9px', background: T.surfaceBg, borderRadius: 8, border: `1px solid ${pColor}22`, borderLeft: `3px solid ${pColor}`, marginBottom: 4 }}>
                <FolderOpen size={11} style={{ color: pColor, flexShrink: 0 }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: T.textPrimary, flex: 1 }}>{p.name}</span>
                <Badge color={st.color} bg={st.bg} border={st.border}>{st.label}</Badge>
              </div>
            );
          })}
        </div>
      )}

      {/* Meetings */}
      {meetings.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <SectionLabel>Meeting history ({meetings.length})</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {meetings.slice(0, 5).map(e => (
              <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 8px', background: T.rowBg, borderRadius: 7, border: `1px solid ${T.rowBdr}` }}>
                <Calendar size={9} style={{ color: e.color || '#60A5FA', flexShrink: 0 }} />
                <span style={{ fontSize: 10, color: T.textMuted, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.title}</span>
                <span style={{ fontSize: 9, color: T.textVFaint, flexShrink: 0 }}>{fmtRelative(e.start_time)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent sessions */}
      {clientSessions.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <SectionLabel accent={client.color + '80'}>Recent work</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {clientSessions.slice(0, 4).map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 8px', background: T.rowBg, borderRadius: 7, border: `1px solid ${T.rowBdr}` }}>
                <span style={{ fontSize: 10, color: T.textMuted, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title || s.category}</span>
                <span style={{ fontSize: 9, fontWeight: 600, color: T.textFaint, marginLeft: 8, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{fmtDur(s.duration_seconds)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notes */}
      <SectionLabel>Notes</SectionLabel>
      <textarea value={notes} onChange={e => setNotes(e.target.value)} onBlur={saveNotes}
        placeholder="Preferences, context, notes on interactions…" rows={4}
        style={{ width: '100%', resize: 'vertical', lineHeight: 1.55, fontSize: 11, boxSizing: 'border-box',
          background: T.inputBg, border: `1px solid ${T.inputBdr}`, borderRadius: 9,
          padding: '8px 11px', color: T.textMuted, outline: 'none', transition: 'border-color 0.15s' }}
        onFocus={e => e.target.style.borderColor = isLight ? 'rgba(99,102,241,0.45)' : 'rgba(124,108,242,0.50)'}
        onBlur={e => e.target.style.borderColor = T.inputBdr} />
    </div>
  );
}

// ─── CLIENTS WORKSPACE ────────────────────────────────────────────────────────
export function ClientsWorkspace({ clients = [], projects = [], tasks = [], sessions = [], calEvents = [], user, onNavigate }) {
  const isLight = useThemeLight();
  const T = makeT(isLight);
  const [selected, setSelected] = useState(null);
  const [local,    setLocal]    = useState(clients);
  const [showNew,  setShowNew]  = useState(false);

  useEffect(() => setLocal(clients), [clients]);

  const enriched = useMemo(() => local.map(c => {
    const color = c.color || hashColor(c.name || '');
    const linkedProjects = projects.filter(p => p.client_id === c.id);
    const clientSessions = sessions.filter(s => s.client_id === c.id || linkedProjects.some(p => p.id === s.project_id));
    const trackedSecs    = clientSessions.reduce((s, x) => s + (x.duration_seconds || 0), 0);
    const lastActivity   = clientSessions.sort((a, b) => (b.started_at || 0) - (a.started_at || 0))[0];
    const activeProjs    = linkedProjects.filter(p => p.status !== 'completed').length;
    return { ...c, color, _linkedProjects: linkedProjects, _clientSessions: clientSessions, _trackedSecs: trackedSecs, _lastActivity: lastActivity, _activeProjs: activeProjs };
  }), [local, projects, sessions]);

  const selClient = enriched.find(c => c.id === selected);
  const handleUpdate = (updated) => setLocal(p => p.map(c => c.id === updated.id ? { ...c, ...updated } : c));
  const handleClientCreated = (newClient) => { setLocal(p => [...p, newClient]); setSelected(newClient.id); };

  return (
    <div className="fl-calendar-clients-workspace" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0, background: T.pageBg }}>

      {/* Client creation modal */}
      {showNew && (
        <CreateClientModal
          user={user}
          onClose={() => setShowNew(false)}
          onCreate={handleClientCreated}
        />
      )}

      {/* Header */}
      <div style={{ padding: '12px 14px 10px', borderBottom: `1px solid ${T.headerBdr}`, flexShrink: 0, background: T.headerBg, boxShadow: isLight ? '0 1px 0 rgba(0,0,0,0.04)' : 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{ width: 26, height: 26, borderRadius: 7, background: T.iconContBg, border: `1px solid ${T.iconContBdr}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Users size={12} style={{ color: '#818CF8' }} />
            </div>
            <span style={{ fontSize: 13, fontWeight: 700, color: T.textPrimary }}>Clients</span>
            <span style={{ fontSize: 9, fontWeight: 600, padding: '2px 7px', borderRadius: 99, background: T.countBg, color: T.countText, border: `1px solid ${T.countBdr}` }}>{enriched.length}</span>
          </div>
          <button onClick={() => onNavigate ? onNavigate('clients') : setShowNew(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 8, background: T.addBg, border: `1px solid ${T.addBdr}`, color: T.addText, fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'background 0.12s' }}
            onMouseOver={e => e.currentTarget.style.background = T.addHover}
            onMouseOut={e  => e.currentTarget.style.background = T.addBg}>
            <Plus size={11} />Client
          </button>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0, background: T.pageBg }}>
        {/* Client list */}
        <div style={{ flex: selClient ? '0 0 300px' : 1, overflowY: 'auto', borderRight: selClient ? `1px solid ${T.border}` : 'none' }}>
          {enriched.length === 0 ? (
            <EmptyState icon={Users} title="No clients yet" sub="Add a client to link projects and track work" action="+ New client" onAction={() => onNavigate ? onNavigate('clients') : setShowNew(true)} />
          ) : (
            <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 5 }}>
              {enriched.map(c => {
                const isSel = selected === c.id;
                const rowBg = isSel ? `${c.color}${isLight ? '09' : '0D'}` : T.cardBg;
                return (
                  <div key={c.id} onClick={() => setSelected(isSel ? null : c.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, background: rowBg, border: `1px solid ${isSel ? c.color+'45' : T.cardBdr}`, borderLeft: `3px solid ${c.color}`, borderRadius: 11, padding: '10px 11px', cursor: 'pointer', transition: 'all 0.15s', boxShadow: isSel ? (isLight ? `0 2px 8px rgba(0,0,0,0.07), 0 0 0 1px ${c.color}10` : `0 2px 10px rgba(0,0,0,0.22), 0 0 0 1px ${c.color}10`) : 'none' }}
                    onMouseOver={e => { if (!isSel) { e.currentTarget.style.background = `${c.color}${isLight ? '06' : '07'}`; e.currentTarget.style.boxShadow = isLight ? '0 1px 4px rgba(0,0,0,0.07)' : '0 1px 6px rgba(0,0,0,0.18)'; }}}
                    onMouseOut={e  => { if (!isSel) { e.currentTarget.style.background = T.cardBg; e.currentTarget.style.boxShadow = 'none'; }}}>
                    <div style={{ width: 32, height: 32, borderRadius: 9, background: `${c.color}18`, border: `1px solid ${c.color}28`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ fontSize: 13, fontWeight: 800, color: c.color }}>{(c.name || '?')[0].toUpperCase()}</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 12, fontWeight: 700, color: T.textPrimary, margin: 0, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        {c.company && <span style={{ fontSize: 10, color: T.textFaint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.company}</span>}
                        {c._activeProjs > 0 && <Badge color="#818CF8" bg="rgba(129,140,248,0.1)" border="rgba(129,140,248,0.18)">{c._activeProjs} project{c._activeProjs !== 1 ? 's' : ''}</Badge>}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      {c._trackedSecs > 0 && <p style={{ fontSize: 11, fontWeight: 700, color: c.color, fontVariantNumeric: 'tabular-nums', margin: 0, marginBottom: 2 }}>{fmtDur(c._trackedSecs)}</p>}
                      {c._lastActivity && <p style={{ fontSize: 9, color: T.textVFaint, margin: 0 }}>{fmtRelative(c._lastActivity.started_at)}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Detail */}
        {selClient && (
          <ClientDetailPanel client={selClient} projects={projects} sessions={sessions} calEvents={calEvents}
            onClose={() => setSelected(null)} onUpdate={handleUpdate} />
        )}
      </div>
    </div>
  );
}
