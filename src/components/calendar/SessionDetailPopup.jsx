import React, { useState, useEffect, useRef } from 'react';
import {
  X, Trash2, Tag, Clock, Zap, Monitor, Pencil,
  Calendar, Users, Coffee, Target, Briefcase,
  MapPin, Video, ExternalLink, FileText,
  FolderOpen, ChevronDown, CheckCircle2, Save,
  AlertCircle, Move, Sparkles, Gauge,
} from 'lucide-react';
import { computeFocusQuality } from '../../ai/timer/focusQualityEngine.js';
function useThemeLight() {
  const [isLight, setIsLight] = useState(() => document.documentElement.classList.contains('theme-light'));
  useEffect(() => {
    const obs = new MutationObserver(() => setIsLight(document.documentElement.classList.contains('theme-light')));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  return isLight;
}

const api = window.electron || {};

// ─── Colour helpers ───────────────────────────────────────────────────────────
const RIZE_COLORS = {
  focus: '#818CF8', deep: '#6366F1', meeting: '#F87171', break: '#94A3B8',
  design: '#34D399', coding: '#60A5FA', writing: '#FB923C',
  research: '#A78BFA', admin: '#FBBF24', planning: '#7c6cf2', other: '#94A3B8',
};
const PALETTE = [
  '#818CF8','#34D399','#F87171','#60A5FA','#FB923C',
  '#A78BFA','#FBBF24','#7c6cf2','#F472B6','#94A3B8',
];
function hashColor(str) {
  let h = 0;
  for (let i = 0; i < (str || '').length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
function getCatColor(cat = '') {
  const c = cat.toLowerCase();
  if (c.includes('focus'))                                       return RIZE_COLORS.focus;
  if (c.includes('deep'))                                        return RIZE_COLORS.deep;
  if (c.includes('meet'))                                        return RIZE_COLORS.meeting;
  if (c.includes('break'))                                       return RIZE_COLORS.break;
  if (c.includes('design'))                                      return RIZE_COLORS.design;
  if (c.includes('cod') || c.includes('dev') || c.includes('eng')) return RIZE_COLORS.coding;
  if (c.includes('writ') || c.includes('doc'))                   return RIZE_COLORS.writing;
  if (c.includes('research'))                                    return RIZE_COLORS.research;
  if (c.includes('admin'))                                       return RIZE_COLORS.admin;
  if (c.includes('plan'))                                        return RIZE_COLORS.planning;
  return hashColor(cat);
}

// ─── Formatters ───────────────────────────────────────────────────────────────
function fmtTime(unix) {
  return new Date(unix * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function fmtDur(secs) {
  if (!secs || secs < 0) return '';
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
function unixToTimeInput(unix) {
  if (!unix) return '00:00';
  const d = new Date(unix * 1000);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function applyTimeInput(baseUnix, timeStr) {
  const d = new Date(baseUnix * 1000);
  const [h, m] = timeStr.split(':').map(Number);
  d.setHours(h, m, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

const NON_BILLABLE_MARKER = '[non-billable]';
function serializeSessionNotes({ description = '', isNonBillable = false, hiddenMarkers = [] }) {
  const noteLines = [...new Set((hiddenMarkers || []).filter(Boolean))];
  if (isNonBillable) noteLines.push(NON_BILLABLE_MARKER);
  const clean = String(description || '').trim();
  if (clean) noteLines.push(clean);
  return noteLines.length ? noteLines.join('\n') : null;
}

// ─── App avatar ───────────────────────────────────────────────────────────────
const APP_PALETTE = [
  '#818CF8','#34D399','#60A5FA','#FB923C','#F472B6',
  '#A78BFA','#FBBF24','#38BDF8','#4ADE80','#F87171',
];
function hashAppColor(str) {
  let h = 0;
  for (let i = 0; i < (str || '').length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return APP_PALETTE[h % APP_PALETTE.length];
}
function AppAvatar({ name }) {
  const c = hashAppColor(name);
  return (
    <div style={{
      width: 26, height: 26, borderRadius: 7, flexShrink: 0,
      background: `${c}18`, border: `1px solid ${c}2E`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <span style={{ fontSize: 11, fontWeight: 800, color: c, lineHeight: 1 }}>
        {(name || '?')[0].toUpperCase()}
      </span>
    </div>
  );
}

// ─── Shared icon button ───────────────────────────────────────────────────────
function IconBtn({ onClick, title, hoverColor = '#C8CCE0', hoverBg = 'rgba(255,255,255,0.07)', disabled = false, children }) {
  return (
    <button
      onClick={onClick} title={title} disabled={disabled}
      style={{
        width: 30, height: 30, borderRadius: 8,
        background: 'transparent', border: 'none',
        color: '#7A8BA8', cursor: disabled ? 'default' : 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'color 0.12s ease, background 0.12s ease', flexShrink: 0,
        opacity: disabled ? 0.4 : 1,
      }}
      onMouseOver={e => { if (!disabled) { e.currentTarget.style.color = hoverColor; e.currentTarget.style.background = hoverBg; }}}
      onMouseOut={e  => { e.currentTarget.style.color = '#7A8BA8'; e.currentTarget.style.background = 'transparent'; }}
    >
      {children}
    </button>
  );
}

// ─── Project picker ───────────────────────────────────────────────────────────
// ─── AI Project Suggestion Chip ───────────────────────────────────────────────
// Shown above ProjectPicker when AI detects a likely project match from telemetry.

function AISuggestedProject({ suggestion, onAccept }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed || !suggestion?.projectId) return null;

  const color    = suggestion.projectColor || '#7c6cf2';
  const pctLabel = suggestion.confidence >= 0.75 ? 'High confidence'
    : suggestion.confidence >= 0.5 ? 'Good match'
    : 'Possible match';

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 7,
      padding: '7px 9px', marginBottom: 7, borderRadius: 9,
      background: `${color}0E`,
      border: `1px solid ${color}28`,
    }}>
      {/* Spark icon */}
      <span style={{ fontSize: 10, flexShrink: 0, color, lineHeight: 1 }}>✦</span>
      {/* Label */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 9, fontWeight: 700, color: `${color}99`, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 2 }}>
          AI suggestion · {pctLabel}
        </p>
        <p style={{ margin: 0, fontSize: 11.5, fontWeight: 600, color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {suggestion.projectName}
        </p>
      </div>
      {/* Accept button */}
      <button
        onClick={onAccept}
        style={{
          flexShrink: 0, padding: '4px 9px', borderRadius: 7,
          background: `${color}20`, border: `1px solid ${color}35`,
          color, fontSize: 10.5, fontWeight: 700, cursor: 'pointer',
          transition: 'background 0.13s ease',
        }}
        onMouseOver={e => { e.currentTarget.style.background = `${color}35`; }}
        onMouseOut={e  => { e.currentTarget.style.background = `${color}20`; }}
        title="Accept AI project suggestion"
      >
        Accept
      </button>
      {/* Dismiss */}
      <button
        onClick={() => setDismissed(true)}
        style={{
          flexShrink: 0, width: 20, height: 20, borderRadius: 5,
          background: 'transparent', border: 'none',
          color: '#5A6A88', fontSize: 13, cursor: 'pointer', lineHeight: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
        onMouseOver={e => { e.currentTarget.style.color = '#9090A8'; }}
        onMouseOut={e  => { e.currentTarget.style.color = '#5A6A88'; }}
        title="Dismiss suggestion"
      >
        ×
      </button>
    </div>
  );
}

function ProjectPicker({ projects, currentProjectId, onAssign, disabled = false }) {
  const [open, setOpen] = useState(false);
  const current = projects.find(p => p.id === currentProjectId);

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => !disabled && setOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '6px 10px', borderRadius: 9, width: '100%',
          background: current ? `${current.color}12` : 'rgba(255,255,255,0.03)',
          border: `1px solid ${current ? current.color + '28' : 'rgba(255,255,255,0.08)'}`,
          cursor: disabled ? 'default' : 'pointer',
          transition: 'filter 0.12s ease',
          opacity: disabled ? 0.6 : 1,
        }}
        onMouseOver={e => { if (!disabled) e.currentTarget.style.filter = 'brightness(1.2)'; }}
        onMouseOut={e  => { e.currentTarget.style.filter = ''; }}
      >
        {current ? (
          <>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: current.color, flexShrink: 0 }} />
            <span style={{ fontSize: 11.5, fontWeight: 600, color: current.color, flex: 1, textAlign: 'left' }}>{current.name}</span>
          </>
        ) : (
          <>
            <FolderOpen size={11} style={{ color: '#6B7A9A', flexShrink: 0 }} />
            <span style={{ fontSize: 11.5, color: '#6B7A9A', flex: 1, textAlign: 'left' }}>Assign project…</span>
          </>
        )}
        <ChevronDown size={10} style={{ color: '#6B7A9A', flexShrink: 0 }} />
      </button>

      {open && (
        <div className="fl-sdp-project-dropdown" style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 60,
          background: '#131824', border: '1px solid rgba(255,255,255,0.09)',
          borderRadius: 11, boxShadow: '0 12px 32px rgba(0,0,0,0.6)',
          overflow: 'hidden', maxHeight: 200, overflowY: 'auto',
        }}>
          {currentProjectId && (
            <button
              onClick={() => { onAssign(null); setOpen(false); }}
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 12px', background: 'transparent', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', color: '#8090A8', fontSize: 11 }}
              onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
              onMouseOut={e  => e.currentTarget.style.background = 'transparent'}
            >
              <X size={10} /><span>Remove assignment</span>
            </button>
          )}
          {projects.map(p => (
            <button key={p.id}
              onClick={() => { onAssign(p.id); setOpen(false); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                padding: '7px 12px', border: 'none', cursor: 'pointer',
                background: p.id === currentProjectId ? `${p.color}12` : 'transparent',
              }}
              onMouseOver={e => e.currentTarget.style.background = `${p.color}18`}
              onMouseOut={e  => e.currentTarget.style.background = p.id === currentProjectId ? `${p.color}12` : 'transparent'}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: p.id === currentProjectId ? p.color : '#C4C8E0', fontWeight: p.id === currentProjectId ? 700 : 400, flex: 1, textAlign: 'left' }}>{p.name}</span>
              {p.id === currentProjectId && <CheckCircle2 size={10} style={{ color: p.color, marginLeft: 'auto', flexShrink: 0 }} />}
            </button>
          ))}
          {projects.length === 0 && (
            <p style={{ fontSize: 10, color: '#6B7A9A', padding: '9px 12px', fontStyle: 'italic', margin: 0 }}>No projects yet</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Section panel wrapper ────────────────────────────────────────────────────
function Panel({ children, style, highlight = false }) {
  return (
    <div className="fl-sdp-panel" style={{
      borderRadius: 13,
      background: highlight ? 'rgba(124,108,242,0.04)' : 'rgba(255,255,255,0.022)',
      border: highlight ? '1px solid rgba(124,108,242,0.18)' : '1px solid rgba(255,255,255,0.07)',
      overflow: 'visible',
      transition: 'background 0.15s ease, border-color 0.15s ease',
      ...style,
    }}>
      {children}
    </div>
  );
}

// ─── Section header inside a panel ───────────────────────────────────────────
function PanelHeader({ icon: Icon, label, right }) {
  return (
    <div className="fl-sdp-panel-header" style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '10px 13px 9px',
      borderBottom: '1px solid rgba(255,255,255,0.055)',
      background: 'rgba(255,255,255,0.018)',
      borderRadius: '13px 13px 0 0',
    }}>
      <div style={{
        width: 20, height: 20, borderRadius: 6, flexShrink: 0,
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.09)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={10} style={{ color: '#7A8BA8' }} />
      </div>
      <span style={{ fontSize: 10, fontWeight: 700, color: '#7A8BA8', textTransform: 'uppercase', letterSpacing: '0.09em', flex: 1 }}>
        {label}
      </span>
      {right}
    </div>
  );
}

// ─── Focus score — round circular progress ring ──────────────────────────────
// Exported so the calendar hover tooltip can render the same ring, keeping
// the focus score visually consistent between hover and the detail view.
export function FocusScoreRing({ score = 0, color = '#6366F1', size = 56, stroke = 5 }) {
  const r = (size - stroke) / 2;
  const c = r * 2 * Math.PI;
  const offset = c - (Math.min(Math.max(score, 0), 100) / 100) * c;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0, transform: 'rotate(-90deg)' }}>
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke}
      />
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={c} strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.6s cubic-bezier(0.4,0,0.2,1), stroke 0.3s ease' }}
      />
      <text
        x="50%" y="50%" textAnchor="middle" dominantBaseline="central"
        transform={`rotate(90 ${size / 2} ${size / 2})`}
        style={{ fontSize: size * 0.27, fontWeight: 800, fill: color, fontVariantNumeric: 'tabular-nums' }}
      >
        {Math.round(score)}
      </text>
    </svg>
  );
}

// ─── Edit field label ─────────────────────────────────────────────────────────
function FieldLabel({ children }) {
  return (
    <p style={{ fontSize: 9.5, color: '#6B7A9A', marginBottom: 5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 5px' }}>
      {children}
    </p>
  );
}

// ─── Delete confirmation dialog ───────────────────────────────────────────────
function DeleteConfirm({ label, onConfirm, onCancel }) {
  const isLight = useThemeLight();
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 20, borderRadius: 22,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: isLight ? 'rgba(15,23,42,0.32)' : 'rgba(7,10,18,0.82)',
      backdropFilter: 'blur(10px)',
      WebkitBackdropFilter: 'blur(10px)',
    }}>
      <div style={{
        background: isLight ? '#FFFFFF' : '#131824',
        border: `1px solid ${isLight ? 'rgba(239,68,68,0.20)' : 'rgba(248,113,113,0.25)'}`,
        borderRadius: 18,
        padding: '24px 24px 20px',
        width: 272,
        textAlign: 'center',
        boxShadow: isLight
          ? '0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.10)'
          : '0 20px 60px rgba(0,0,0,0.7)',
      }}>
        {/* Icon */}
        <div style={{
          width: 44, height: 44, borderRadius: 14, margin: '0 auto 16px',
          background: isLight ? 'rgba(239,68,68,0.08)' : 'rgba(248,113,113,0.12)',
          border: `1px solid ${isLight ? 'rgba(239,68,68,0.18)' : 'rgba(248,113,113,0.22)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Trash2 size={18} style={{ color: '#EF4444' }} />
        </div>

        {/* Title */}
        <p style={{
          fontSize: 15, fontWeight: 700, margin: '0 0 8px',
          color: isLight ? '#0F172A' : '#EEF0FC',
          letterSpacing: '-0.01em',
        }}>
          Delete {label}?
        </p>

        {/* Description */}
        <p style={{
          fontSize: 11.5, margin: '0 0 22px', lineHeight: 1.55,
          color: isLight ? '#64748B' : '#8090A8',
        }}>
          This removes it from Flow Ledger only.{' '}The original calendar event is not affected.
        </p>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onCancel}
            style={{
              flex: 1, padding: '9px 0', borderRadius: 10, cursor: 'pointer',
              background: isLight ? '#F1F5F9' : 'transparent',
              border: `1px solid ${isLight ? '#E2E8F0' : 'rgba(255,255,255,0.09)'}`,
              color: isLight ? '#475569' : '#8090A8',
              fontSize: 12, fontWeight: 600,
              transition: 'all 0.12s',
            }}
            onMouseOver={e => { e.currentTarget.style.background = isLight ? '#E2E8F0' : 'rgba(255,255,255,0.06)'; }}
            onMouseOut={e  => { e.currentTarget.style.background = isLight ? '#F1F5F9' : 'transparent'; }}>
            Cancel
          </button>
          <button onClick={onConfirm}
            style={{
              flex: 1, padding: '9px 0', borderRadius: 10, cursor: 'pointer',
              background: isLight
                ? 'linear-gradient(135deg, #EF4444, #F87171)'
                : 'rgba(248,113,113,0.18)',
              border: `1px solid ${isLight ? 'rgba(239,68,68,0.35)' : 'rgba(248,113,113,0.32)'}`,
              color: isLight ? '#FFFFFF' : '#F87171',
              fontSize: 12, fontWeight: 700,
              boxShadow: isLight ? '0 2px 10px rgba(239,68,68,0.28)' : 'none',
              transition: 'all 0.12s',
            }}
            onMouseOver={e => { e.currentTarget.style.filter = 'brightness(1.08)'; }}
            onMouseOut={e  => { e.currentTarget.style.filter = 'none'; }}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
// Vague title patterns — same set as eventWritingEngine
const VAGUE_TITLE_RE = /^(general|work|task|untitled|session|focus|focus session|focus block|deep work|new event|scheduled work|auto[- ]?tracked|computer time|tracked|auto:.*)$/i;
function isVagueTitle(title = '') {
  return !title || VAGUE_TITLE_RE.test(title.trim()) || title.trim().length < 4;
}

// Noise patterns that indicate a bad AI-generated title (system notification leak, etc.)
const NOISE_SUGGESTION_RE = [
  /your .+ is running/i,    // "Your Claude is Running at 30%"
  /running at \d+\s*%/i,   // "Running at 30%"
  /\d+\s*%/,                // any percentage in title
  /^auto\s*:/i,             // still "Auto: ..."
  /[\u{1F300}-\u{1FFFF}\u{2600}-\u{27BF}]/u, // emoji
  /\s[–—-]\s*$/,            // trailing dash (truncated)
  /update available/i,
];
function isSuggestionQualityTitle(title = '') {
  if (!title || title.length < 6) return false;
  if (isVagueTitle(title)) return false;
  if (NOISE_SUGGESTION_RE.some(re => re.test(title))) return false;
  return true;
}

// ─── AI Suggestion Banner ─────────────────────────────────────────────────────
function AISuggestionBanner({ recap, color, isLight, onApply, onEdit }) {
  const [dismissed, setDismissed] = useState(false);
  const [applying,  setApplying]  = useState(false);

  // Hide if no title, already dismissed, or generated title is noise/low-quality
  if (dismissed || !recap?.title) return null;
  if (!isSuggestionQualityTitle(recap.title)) return null;

  const handleApply = async () => {
    setApplying(true);
    await onApply?.(recap.title, recap.description || '');
    setApplying(false);
  };

  // Theme-aware tokens
  const border    = isLight ? '1px solid rgba(16,185,129,0.28)' : '1px solid rgba(52,211,153,0.20)';
  const titleClr  = isLight ? '#0F172A' : '#EEF0FC';
  const descClr   = isLight ? 'rgba(30,41,59,0.68)' : 'rgba(180,200,230,0.68)';
  const chipBg    = isLight ? 'rgba(15,23,42,0.05)' : 'rgba(255,255,255,0.05)';
  const chipBd    = isLight ? '1px solid rgba(15,23,42,0.10)' : '1px solid rgba(255,255,255,0.08)';
  const chipClr   = isLight ? 'rgba(30,41,59,0.58)' : 'rgba(180,200,220,0.58)';
  const dismissClr = isLight ? 'rgba(15,23,42,0.28)' : 'rgba(255,255,255,0.22)';
  const applyBg   = applying ? 'rgba(16,185,129,0.06)' : (isLight ? 'rgba(16,185,129,0.10)' : 'rgba(52,211,153,0.15)');
  const applyClr  = isLight ? '#059669' : '#34D399';
  const editBg    = isLight ? 'rgba(15,23,42,0.03)' : 'transparent';
  const editBd    = isLight ? '1px solid rgba(15,23,42,0.12)' : '1px solid rgba(255,255,255,0.08)';
  const editClr   = isLight ? 'rgba(30,41,59,0.60)' : 'rgba(160,180,210,0.65)';

  // Filter description — skip if it contains vague/auto content
  const cleanDesc = recap.description
    && !NOISE_SUGGESTION_RE.some(re => re.test(recap.description))
    && !/auto\s*:/i.test(recap.description)
    ? recap.description
    : null;

  // Only show top non-browser apps with meaningful time
  const topApps = (recap.topApps || [])
    .filter(a => a.mins > 0 && !/chrome|firefox|safari|arc|brave|edge/i.test(a.name))
    .slice(0, 3);

  return (
    /* ── Root: NO overflow:hidden — prevents flex height collapse ── */
    <div style={{
      borderRadius: 11,
      border,
      background: isLight
        ? 'linear-gradient(135deg, rgba(16,185,129,0.06) 0%, rgba(99,102,241,0.04) 100%)'
        : 'linear-gradient(135deg, rgba(52,211,153,0.07) 0%, rgba(99,102,241,0.05) 100%)',
      position: 'relative',
      flexShrink: 0,            /* never squish inside a flex column */
    }}>
      {/* Accent top stripe — uses border-radius on its own element, no overflow:hidden needed */}
      <div style={{
        height: 2,
        background: 'linear-gradient(90deg, #10B981 0%, #6366F1 100%)',
        borderRadius: '11px 11px 0 0',
      }} />

      {/* Content area */}
      <div style={{ padding: '10px 13px 12px' }}>

        {/* ── Row 1: label + label chip + dismiss ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ fontSize: 9, color: '#10B981', lineHeight: 1 }}>✦</span>
            <span style={{ fontSize: 9.5, fontWeight: 700, color: '#10B981', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              AI Suggestion
            </span>
            {recap.deepWorkLabel && (
              <span style={{
                fontSize: 8.5, fontWeight: 700, padding: '1px 5px', borderRadius: 4,
                background: recap.isDeepWork ? 'rgba(16,185,129,0.13)' : 'rgba(99,102,241,0.13)',
                color: recap.isDeepWork ? '#10B981' : '#818CF8',
                border: `1px solid ${recap.isDeepWork ? 'rgba(16,185,129,0.25)' : 'rgba(99,102,241,0.25)'}`,
                lineHeight: '16px',
              }}>
                {recap.deepWorkLabel}
              </span>
            )}
          </div>
          <button
            onClick={() => setDismissed(true)}
            style={{ background: 'none', border: 'none', color: dismissClr, cursor: 'pointer', padding: '0 1px', lineHeight: 1, fontSize: 15, fontWeight: 300, flexShrink: 0 }}
            aria-label="Dismiss suggestion"
          >
            ×
          </button>
        </div>

        {/* ── Row 2: Suggested title ── */}
        <p style={{
          fontSize: 13, fontWeight: 700, color: titleClr,
          margin: '0 0 6px', lineHeight: 1.35, letterSpacing: '-0.01em',
        }}>
          {recap.title}
        </p>

        {/* ── Row 3: Description (conditional, max 2 lines) ── */}
        {cleanDesc && (
          <p style={{
            fontSize: 10.5, color: descClr,
            margin: '0 0 8px', lineHeight: 1.5,
            display: '-webkit-box', WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>
            {cleanDesc}
          </p>
        )}

        {/* ── Row 4: App chips (only if meaningful apps exist) ── */}
        {topApps.length > 0 && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 9 }}>
            {topApps.map((a, i) => (
              <span key={i} style={{
                fontSize: 9, padding: '2px 6px', borderRadius: 4,
                background: chipBg, border: chipBd, color: chipClr,
                lineHeight: '14px',
              }}>
                {a.name} · {a.mins}m
              </span>
            ))}
          </div>
        )}

        {/* ── Row 5: Action buttons ── */}
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={handleApply}
            disabled={applying}
            style={{
              flex: 1, padding: '6px 10px', borderRadius: 7, fontSize: 10.5, fontWeight: 700,
              background: applyBg,
              border: isLight ? '1px solid rgba(16,185,129,0.32)' : '1px solid rgba(52,211,153,0.30)',
              color: applyClr, cursor: applying ? 'default' : 'pointer',
              transition: 'all 0.13s ease', opacity: applying ? 0.65 : 1,
              whiteSpace: 'nowrap',
            }}
            onMouseOver={e => { if (!applying) e.currentTarget.style.background = isLight ? 'rgba(16,185,129,0.18)' : 'rgba(52,211,153,0.22)'; }}
            onMouseOut={e  => { if (!applying) e.currentTarget.style.background = applyBg; }}
          >
            {applying ? 'Saving…' : '✓ Apply'}
          </button>
          <button
            onClick={() => onEdit?.(recap.title, recap.description || '')}
            style={{
              padding: '6px 10px', borderRadius: 7, fontSize: 10.5, fontWeight: 600,
              background: editBg, border: editBd, color: editClr,
              cursor: 'pointer', transition: 'all 0.13s ease', whiteSpace: 'nowrap',
            }}
            onMouseOver={e => { e.currentTarget.style.background = isLight ? 'rgba(15,23,42,0.07)' : 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = isLight ? '#1E293B' : '#C0CEDE'; }}
            onMouseOut={e  => { e.currentTarget.style.background = editBg; e.currentTarget.style.color = editClr; }}
          >
            Edit first
          </button>
        </div>

      </div>{/* /content area */}
    </div>
  );
}

export default function SessionDetailPopup({
  block, popupApps = [], popupTags = [], projects = [],
  autoSessions = [],
  aiRecap = null,
  aiSuggestedProject = null,
  aiBannerForced = false,
  aiRewriting = false,
  onRewriteAI,
  onClose, onDelete, onAssignProject, onUpdate, onReschedule,
}) {
  const isLight = useThemeLight();

  // ── Edit mode state ──────────────────────────────────────────────────────────
  const [editMode,       setEditMode]       = useState(false);
  const [saving,         setSaving]         = useState(false);
  const [timeError,      setTimeError]      = useState('');
  const [titleError,     setTitleError]     = useState('');
  const [draftTitle,     setDraftTitle]     = useState('');
  const [draftDesc,      setDraftDesc]      = useState('');
  const [draftStart,     setDraftStart]     = useState('');
  const [draftEnd,       setDraftEnd]       = useState('');
  const [draftLocation,  setDraftLocation]  = useState('');
  const [confirmDelete,  setConfirmDelete]  = useState(false);
  const [hoveredApp,     setHoveredApp]     = useState(null);
  const titleInputRef = useRef(null);

  // Reset draft state whenever the block changes or edit mode is toggled off
  const resetDrafts = (b) => {
    if (!b) return;
    const isCalendar = b._type === 'calendar';
    setDraftTitle(b.title || '');
    setDraftDesc(b.description || '');
    setDraftStart(unixToTimeInput(isCalendar ? b.start_time : b.started_at));
    setDraftEnd(unixToTimeInput(isCalendar ? b.end_time : (b.ended_at || (b.started_at + 3600))));
    setDraftLocation(b.location || '');
    setTimeError('');
    setTitleError('');
  };

  useEffect(() => {
    resetDrafts(block);
    setEditMode(false);
    setConfirmDelete(false);
  }, [block?.id]); // eslint-disable-line

  // Focus title input when entering edit mode
  useEffect(() => {
    if (editMode) setTimeout(() => titleInputRef.current?.focus(), 50);
  }, [editMode]);

  if (!block) return null;

  const isCalendar = block._type === 'calendar';
  const isSession  = block._type === 'session';

  const color = isCalendar
    ? (block.color || '#60A5FA')
    : block.session_type === 'meeting' ? '#F87171'
    : block.is_deep_work               ? '#6366F1'
    : getCatColor(block.category);

  const startTs = isCalendar ? block.start_time  : block.started_at;
  const endTs   = isCalendar ? block.end_time    : (block.ended_at || Math.floor(Date.now() / 1000));
  const dur     = Math.max(0, endTs - startTs);

  // Focus score — same engine the Timer uses for completed sessions, so the
  // number here matches whatever's reported elsewhere for this session.
  const focusQuality = (isSession && dur > 0)
    ? computeFocusQuality(autoSessions.filter(a => !a.is_idle), dur)
    : null;

  const appTotal = popupApps.reduce((s, a) => s + (a.seconds || 0), 0);

  const attendees = isCalendar && block.attendees_json
    ? (() => { try { return JSON.parse(block.attendees_json); } catch { return []; } })()
    : [];

  const tags = [];
  if (block.client_name)  tags.push({ label: block.client_name,  color: '#60A5FA' });
  if (block.project_name) tags.push({ label: block.project_name, color });
  for (const t of (popupTags || [])) tags.push({ label: t.name, color: t.color || '#818CF8' });

  const TypeIcon = isCalendar                                   ? Calendar
    : isSession && block.session_type === 'meeting'             ? Users
    : isSession && block.is_deep_work                           ? Zap
    : isSession && block.session_type === 'break'               ? Coffee
    :                                                             Target;

  const typeName = isCalendar                                   ? (block.source_label || 'Calendar Event')
    : isSession && block.session_type === 'meeting'             ? 'Meeting'
    : isSession && block.is_deep_work                           ? 'Deep Work'
    : isSession && block.session_type === 'break'               ? 'Break'
    :                                                             'Focus Session';

  // ── Shared input style ───────────────────────────────────────────────────────
  const fieldBase = {
    width: '100%', background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.09)',
    borderRadius: 9, padding: '8px 10px', color: '#E4E8F4', fontSize: 13,
    outline: 'none', boxSizing: 'border-box',
    transition: 'border-color 0.14s ease, background 0.14s ease',
    colorScheme: 'dark',
  };
  const focusStyle = (e) => { e.target.style.borderColor = `${color}60`; e.target.style.background = 'rgba(255,255,255,0.06)'; };
  const blurStyle  = (e) => { e.target.style.borderColor = 'rgba(255,255,255,0.09)'; e.target.style.background = 'rgba(255,255,255,0.04)'; };

  // ── Enter edit mode ──────────────────────────────────────────────────────────
  const enterEditMode = () => {
    resetDrafts(block);
    setEditMode(true);
  };

  // ── Cancel edit ──────────────────────────────────────────────────────────────
  const cancelEdit = () => {
    setEditMode(false);
    setTimeError('');
    setTitleError('');
  };

  // ── Save all changes ─────────────────────────────────────────────────────────
  const saveAll = async () => {
    const newTitle = draftTitle.trim();
    if (!newTitle) { setTitleError('Event name is required'); return; }

    const newStart = applyTimeInput(startTs, draftStart);
    const newEnd   = applyTimeInput(startTs, draftEnd);
    if (newEnd <= newStart) { setTimeError('End time must be after start time'); return; }

    setSaving(true);
    try {
      const patch = {};

      if (isCalendar) {
        const updates = {};
        if (newTitle !== (block.title || '').trim()) {
          updates.title = newTitle;
          patch.title   = newTitle;
        }
        const newDesc = draftDesc.trim();
        if (newDesc !== String(block.description || '').trim()) {
          updates.description = newDesc;
          patch.description   = newDesc || null;
        }
        if (newStart !== block.start_time) {
          updates.startTime  = newStart;
          patch.start_time   = newStart;
        }
        if (newEnd !== block.end_time) {
          updates.endTime = newEnd;
          patch.end_time  = newEnd;
        }
        const newLoc = draftLocation.trim();
        if (newLoc !== (block.location || '').trim()) {
          updates.location = newLoc;
          patch.location   = newLoc || null;
        }
        if (Object.keys(updates).length > 0) {
          await api.calendarUpdateEvent?.({ eventId: block.id, ...updates });
        }

      } else {
        // Focus/manual session
        const newDesc = draftDesc.trim();
        const titleChanged = newTitle !== (block.title || '').trim();
        const descChanged  = newDesc  !== String(block.description || '').trim();

        if (titleChanged || descChanged) {
          await api.updateSession?.({
            sessionId: block.id,
            title:     newTitle,
            category:  block.category || '',
            notes:     serializeSessionNotes({
              description:    newDesc,
              isNonBillable:  !!block.is_non_billable,
              hiddenMarkers:  block._hiddenNoteMarkers,
            }),
            projectId: block.project_id  || '',
            clientId:  block.client_id   || '',
          });
          if (titleChanged) patch.title       = newTitle;
          if (descChanged)  patch.description = newDesc || null;
        }

        const timeChanged = newStart !== block.started_at || newEnd !== (block.ended_at || 0);
        if (timeChanged) {
          await api.updateSessionTime?.({ sessionId: block.id, startedAt: newStart, endedAt: newEnd });
          patch.started_at        = newStart;
          patch.ended_at          = newEnd;
          patch.duration_seconds  = newEnd - newStart;
        }
      }

      if (Object.keys(patch).length > 0) {
        onUpdate?.(block.id, block._type, patch);
      }
      setEditMode(false);
    } catch (err) {
      console.error('[SessionDetailPopup] saveAll failed:', err);
    } finally {
      setSaving(false);
    }
  };

  // ── Handle delete ────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    setConfirmDelete(false);
    onDelete?.(block.id);
  };

  // ── Key shortcuts in edit mode ────────────────────────────────────────────────
  const handleKeyDown = (e) => {
    if (e.key === 'Escape') cancelEdit();
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') saveAll();
  };

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center fl-calendar-overlay"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div
        className="fl-calendar-overlay-backdrop"
        style={{
          position: 'absolute', inset: 0,
          background: isLight ? 'rgba(180,170,230,0.28)' : 'rgba(4,6,13,0.68)',
          backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        }}
      />

      {/* ── Card ── */}
      <div
        className="fl-session-popup-card"
        style={{
          position: 'relative', zIndex: 1,
          width: 'min(420px, calc(100vw - 32px))',
          maxHeight: '88vh',
          borderRadius: 22,
          background: isLight
            ? 'linear-gradient(160deg, #FFFFFF 0%, #F9F7FF 52%, #F4F1FF 100%)'
            : 'linear-gradient(160deg, #131824 0%, #0D1118 55%, #0B0E16 100%)',
          border: isLight
            ? (editMode ? `1px solid ${color}55` : '1px solid rgba(196,181,253,0.65)')
            : (editMode ? `1px solid ${color}35` : '1px solid rgba(255,255,255,0.08)'),
          boxShadow: isLight
            ? [
                `0 0 0 1px rgba(124,108,242,0.12)`,
                '0 48px 96px rgba(107,92,242,0.16)',
                '0 16px 40px rgba(107,92,242,0.10)',
                `0 0 60px ${color}12`,
              ].join(', ')
            : [
                '0 0 0 1px rgba(255,255,255,0.03)',
                '0 48px 120px rgba(0,0,0,0.82)',
                '0 20px 40px rgba(0,0,0,0.55)',
                `0 0 80px ${color}0D`,
              ].join(', '),
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          transition: 'border-color 0.2s ease',
        }}
        onClick={e => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Delete confirm overlay */}
        {confirmDelete && (
          <DeleteConfirm
            label={isCalendar ? 'event' : 'session'}
            onConfirm={handleDelete}
            onCancel={() => setConfirmDelete(false)}
          />
        )}

        {/* Ambient color bloom */}
        <div style={{
          position: 'absolute', top: -80, left: '50%', transform: 'translateX(-50%)',
          width: 300, height: 160, pointerEvents: 'none', zIndex: 0,
          background: `radial-gradient(ellipse, ${color}1C 0%, transparent 68%)`,
        }} />

        {/* Top accent line */}
        <div style={{
          height: 2, flexShrink: 0, position: 'relative', zIndex: 1,
          background: editMode
            ? `linear-gradient(90deg, transparent 0%, ${color}70 25%, ${color}CC 50%, ${color}70 75%, transparent 100%)`
            : `linear-gradient(90deg, transparent 0%, ${color}55 25%, ${color}90 50%, ${color}55 75%, transparent 100%)`,
          transition: 'background 0.2s ease',
        }} />

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div style={{
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          gap: 12, padding: '16px 18px 14px',
          borderBottom: '1px solid rgba(255,255,255,0.055)',
          flexShrink: 0, position: 'relative', zIndex: 1,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Type badge + duration */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 9, flexWrap: 'wrap' }}>
              <div style={{
                width: 26, height: 26, borderRadius: 8, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: `linear-gradient(145deg, ${color}22 0%, ${color}0D 100%)`,
                border: `1px solid ${color}2E`,
                boxShadow: `0 2px 10px ${color}18, inset 0 1px 0 ${color}15`,
              }}>
                <TypeIcon size={11} style={{ color }} />
              </div>
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.10em', color }}>
                {typeName}
              </span>
              <span style={{
                fontSize: 11, fontWeight: 700, color,
                fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em',
                padding: '2px 7px', borderRadius: 6,
                background: `${color}14`, border: `1px solid ${color}28`,
              }}>
                {fmtDur(dur)}
              </span>
            </div>

            {/* Title — input in edit mode, text in view mode */}
            {editMode ? (
              <div>
                <input
                  ref={titleInputRef}
                  value={draftTitle}
                  onChange={e => { setDraftTitle(e.target.value); if (e.target.value.trim()) setTitleError(''); }}
                  placeholder="Event name"
                  style={{
                    ...fieldBase,
                    fontSize: 15, fontWeight: 700, padding: '7px 10px',
                    borderColor: titleError ? '#F87171' : 'rgba(255,255,255,0.09)',
                  }}
                  onFocus={e => { if (!titleError) focusStyle(e); }}
                  onBlur={e => { if (!titleError) blurStyle(e); }}
                />
                {titleError && (
                  <p style={{ fontSize: 10, color: '#F87171', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <AlertCircle size={9} />{titleError}
                  </p>
                )}
              </div>
            ) : (
              <h2 style={{
                fontSize: 16, fontWeight: 700, color: '#EEF0FC',
                lineHeight: 1.28, margin: 0, letterSpacing: '-0.02em',
              }}>
                {isVagueTitle(block.title) ? (
                  isSuggestionQualityTitle(aiRecap?.title)
                    ? <span style={{ color: '#9CA8C0', fontStyle: 'italic', fontWeight: 500, fontSize: 15 }}>{aiRecap.title}</span>
                    : <span style={{ color: '#4A5A78', fontStyle: 'italic', fontWeight: 400, fontSize: 15 }}>Untitled session</span>
                ) : block.title}
              </h2>
            )}
          </div>

          {/* Header action buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, paddingTop: 2 }}>
            {editMode ? (
              <>
                <button
                  onClick={cancelEdit} disabled={saving}
                  style={{
                    padding: '5px 11px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                    background: 'transparent', border: '1px solid rgba(255,255,255,0.12)',
                    color: '#8090A8', cursor: saving ? 'default' : 'pointer',
                    opacity: saving ? 0.5 : 1, transition: 'all 0.12s ease',
                  }}
                  onMouseOver={e => { if (!saving) { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = '#B0BDCF'; }}}
                  onMouseOut={e  => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#8090A8'; }}
                >
                  Cancel
                </button>
                <button
                  onClick={saveAll} disabled={saving}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '5px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700,
                    background: saving ? `${color}30` : `${color}22`,
                    border: `1px solid ${color}45`,
                    color: saving ? `${color}80` : color,
                    cursor: saving ? 'default' : 'pointer',
                    boxShadow: saving ? 'none' : `0 2px 10px ${color}20`,
                    transition: 'all 0.12s ease',
                  }}
                  onMouseOver={e => { if (!saving) { e.currentTarget.style.background = `${color}30`; e.currentTarget.style.boxShadow = `0 4px 16px ${color}30`; }}}
                  onMouseOut={e  => { if (!saving) { e.currentTarget.style.background = `${color}22`; e.currentTarget.style.boxShadow = `0 2px 10px ${color}20`; }}}
                >
                  <Save size={10} />
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <IconBtn onClick={onClose} title="Close" disabled={saving}>
                  <X size={14} />
                </IconBtn>
              </>
            ) : (
              <>
                {/* Rewrite with AI — re-rolls title/description from scratch,
                    even if the current title already looks meaningful */}
                {!isCalendar && onRewriteAI && (
                  <button
                    onClick={() => onRewriteAI(block)}
                    disabled={aiRewriting}
                    title="Regenerate the title & description from tracked activity"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '5px 11px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                      background: aiRewriting ? 'rgba(52,211,153,0.08)' : 'transparent',
                      border: '1px solid rgba(52,211,153,0.30)',
                      color: '#34D399', cursor: aiRewriting ? 'default' : 'pointer',
                      opacity: aiRewriting ? 0.7 : 1,
                      transition: 'all 0.12s ease',
                    }}
                    onMouseOver={e => { if (!aiRewriting) e.currentTarget.style.background = 'rgba(52,211,153,0.12)'; }}
                    onMouseOut={e  => { if (!aiRewriting) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <Sparkles size={10} />
                    {aiRewriting ? 'Rewriting…' : 'Rewrite with AI'}
                  </button>
                )}

                {/* Edit Event / Edit Session button */}
                <button
                  onClick={enterEditMode}
                  title={isCalendar ? 'Edit event details' : 'Edit session details'}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '5px 11px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                    background: 'transparent',
                    border: '1px solid rgba(255,255,255,0.12)',
                    color: '#8090A8', cursor: 'pointer',
                    transition: 'all 0.12s ease',
                  }}
                  onMouseOver={e => { e.currentTarget.style.color = color; e.currentTarget.style.borderColor = `${color}45`; e.currentTarget.style.background = `${color}12`; }}
                  onMouseOut={e  => { e.currentTarget.style.color = '#8090A8'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; e.currentTarget.style.background = 'transparent'; }}
                >
                  <Pencil size={10} />
                  {isCalendar ? 'Edit Event' : 'Edit Session'}
                </button>

                {/* Reschedule — icon-only to avoid crowding the header */}
                {onReschedule && (
                  <IconBtn
                    onClick={() => { onClose(); onReschedule(block); }}
                    title="Reschedule to a different time"
                    hoverColor="#a78bfa"
                    hoverBg="rgba(124,108,242,0.12)"
                  >
                    <Move size={13} />
                  </IconBtn>
                )}

                {/* Delete button — available for both calendar events and sessions */}
                {onDelete && (
                  <IconBtn
                    onClick={() => setConfirmDelete(true)}
                    title={isCalendar ? 'Delete event' : 'Delete session'}
                    hoverColor="#F87171"
                    hoverBg="rgba(248,113,113,0.11)"
                  >
                    <Trash2 size={13} />
                  </IconBtn>
                )}

                <IconBtn onClick={onClose} title="Close">
                  <X size={14} />
                </IconBtn>
              </>
            )}
          </div>
        </div>

        {/* ── Scrollable body ──────────────────────────────────────────────── */}
        <div
          className="fl-sdp-body"
          style={{ flex: 1, overflowY: 'auto', padding: '14px 18px 20px', display: 'flex', flexDirection: 'column', gap: 12, position: 'relative', zIndex: 1 }}
        >

          {/* ── AI WRITING SUGGESTION BANNER ──
               Shows automatically for vague titles, or on demand after the
               user clicks "Rewrite with AI" (aiBannerForced) even if the
               current title already looks meaningful. Keyed by recap.title
               so a rewrite remounts the banner and clears its dismissed state. */}
          {aiRecap && (isVagueTitle(block.title || block.category) || aiBannerForced) && !editMode && (
            <AISuggestionBanner
              key={aiRecap.title}
              recap={aiRecap}
              color={color}
              isLight={isLight}
              onApply={async (suggestedTitle, suggestedDesc) => {
                // Directly save without manual edit mode
                setSaving(true);
                try {
                  const newNotes = serializeSessionNotes({
                    description:   suggestedDesc || '',
                    isNonBillable: !!block.is_non_billable,
                    hiddenMarkers: block._hiddenNoteMarkers || [],
                  });
                  await api.updateSession?.({
                    sessionId: block.id,
                    title:     suggestedTitle,
                    category:  block.category || '',
                    notes:     newNotes,
                    projectId: block.project_id || '',
                    clientId:  block.client_id  || '',
                  });
                  onUpdate?.(block.id, block._type, {
                    title:       suggestedTitle,
                    description: suggestedDesc || null,
                  });
                } catch (err) {
                  console.error('[AI Apply] failed:', err);
                } finally {
                  setSaving(false);
                }
              }}
              onEdit={(suggestedTitle, suggestedDesc) => {
                // Pre-fill edit mode
                setDraftTitle(suggestedTitle || draftTitle);
                setDraftDesc(suggestedDesc  || draftDesc);
                setEditMode(true);
              }}
            />
          )}

          {/* ── EDIT MODE FIELDS ── */}
          {editMode ? (
            <>
              {/* Time pickers */}
              <Panel highlight>
                <div style={{ padding: '13px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 11 }}>
                    <Clock size={11} style={{ color: '#7A8BA8' }} />
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#7A8BA8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      Timing
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <FieldLabel>Start time</FieldLabel>
                      <input
                        type="time" value={draftStart}
                        onChange={e => { setDraftStart(e.target.value); setTimeError(''); }}
                        style={{ ...fieldBase, fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}
                        onFocus={focusStyle} onBlur={blurStyle}
                      />
                    </div>
                    <span style={{ color: '#5A6A88', fontSize: 18, paddingBottom: 8, flexShrink: 0 }}>→</span>
                    <div style={{ flex: 1 }}>
                      <FieldLabel>End time</FieldLabel>
                      <input
                        type="time" value={draftEnd}
                        onChange={e => { setDraftEnd(e.target.value); setTimeError(''); }}
                        style={{ ...fieldBase, fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}
                        onFocus={focusStyle} onBlur={blurStyle}
                      />
                    </div>
                  </div>
                  {timeError && (
                    <p style={{ fontSize: 10, color: '#F87171', marginTop: 7, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <AlertCircle size={9} />{timeError}
                    </p>
                  )}
                </div>
              </Panel>

              {/* Location — calendar events only */}
              {isCalendar && (
                <Panel highlight>
                  <div style={{ padding: '13px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 11 }}>
                      <MapPin size={11} style={{ color: '#7A8BA8' }} />
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#7A8BA8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                        Location
                      </span>
                    </div>
                    <input
                      value={draftLocation}
                      onChange={e => setDraftLocation(e.target.value)}
                      placeholder="Add location or conference room…"
                      style={{ ...fieldBase, fontSize: 12 }}
                      onFocus={focusStyle} onBlur={blurStyle}
                    />
                  </div>
                </Panel>
              )}

              {/* Description */}
              <Panel highlight>
                <div style={{ padding: '13px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 11 }}>
                    <FileText size={11} style={{ color: '#7A8BA8' }} />
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#7A8BA8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      Description
                    </span>
                  </div>
                  <textarea
                    value={draftDesc}
                    onChange={e => setDraftDesc(e.target.value)}
                    placeholder="Add context, intent, or meeting notes…"
                    style={{ ...fieldBase, minHeight: 86, resize: 'vertical', lineHeight: 1.6, fontSize: 12 }}
                    onFocus={focusStyle} onBlur={blurStyle}
                  />
                </div>
              </Panel>

              {/* Project — always interactive */}
              {onAssignProject && (
                <div>
                  <p style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#6B7A9A', marginBottom: 7, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Briefcase size={9} />Project
                  </p>
                  {/* AI project suggestion — show when no project assigned */}
                  {!block.project_id && aiSuggestedProject && (
                    <AISuggestedProject
                      suggestion={aiSuggestedProject}
                      onAccept={async () => {
                        const proj = (projects || []).find(p => p.id === aiSuggestedProject.projectId);
                        const newClientId = proj?.client_id || block.client_id || '';
                        if (isSession) {
                          await api.updateSession?.({ sessionId: block.id, title: block.title || '', category: block.category || '', notes: block.notes || null, projectId: aiSuggestedProject.projectId, clientId: newClientId });
                        }
                        onAssignProject(block.id, aiSuggestedProject.projectId, block._type);
                      }}
                    />
                  )}
                  <ProjectPicker
                    projects={projects || []}
                    currentProjectId={block.project_id}
                    onAssign={async (projectId) => {
                      if (isSession) {
                        const proj = (projects || []).find(p => p.id === projectId);
                        const newClientId = proj?.client_id || block.client_id || '';
                        await api.updateSession?.({ sessionId: block.id, title: block.title || '', category: block.category || '', notes: block.notes || null, projectId: projectId || '', clientId: newClientId });
                      }
                      onAssignProject(block.id, projectId, block._type);
                    }}
                  />
                </div>
              )}

              {/* Kb shortcut hint */}
              <p style={{ textAlign: 'center', fontSize: 9.5, color: '#4A5A78', margin: 0 }}>
                ⌘ Enter to save · Esc to cancel
              </p>
            </>
          ) : (
            <>
              {/* ── VIEW MODE FIELDS ── */}

              {/* Tags */}
              {tags.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  {tags.map((t, i) => (
                    <span key={i} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      fontSize: 10, fontWeight: 600,
                      padding: '3px 9px', borderRadius: 6,
                      background: `${t.color}12`, color: t.color, border: `1px solid ${t.color}22`,
                    }}>
                      <Tag size={7} />{t.label}
                    </span>
                  ))}
                </div>
              )}

              {/* Time */}
              <Panel>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 13px' }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 9, flexShrink: 0,
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Clock size={13} style={{ color: '#7A8BA8' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 12.5, fontWeight: 600, color: '#D4D8EE', fontVariantNumeric: 'tabular-nums', margin: 0 }}>
                      {fmtTime(startTs)} – {fmtTime(endTs)}
                    </p>
                    <p style={{ fontSize: 10, color: '#7A8BA8', margin: '2px 0 0' }}>{fmtDur(dur)} total</p>
                  </div>
                </div>
              </Panel>

              {/* Description */}
              {(() => {
                // Use stored description unless it's vague/auto-generated noise.
                // In that case, fall back to the AI recap description if it's clean.
                const VAGUE_DESC_RE = /^researched auto\s*:|^auto\s*:|including https|including google.*gmail/i;
                const storedDesc = (block.description || '').trim();
                const isVagueDesc = !storedDesc || VAGUE_DESC_RE.test(storedDesc);
                const aiDesc = aiRecap?.description
                  && !NOISE_SUGGESTION_RE.some(re => re.test(aiRecap.description))
                  && !/auto\s*:/i.test(aiRecap.description)
                  ? aiRecap.description : null;
                const displayDesc = isVagueDesc ? aiDesc : storedDesc;

                return (
                  <Panel>
                    <div style={{ padding: '11px 13px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: displayDesc ? 9 : 0 }}>
                        <div style={{
                          width: 20, height: 20, borderRadius: 6,
                          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        }}>
                          <FileText size={10} style={{ color: '#7A8BA8' }} />
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#7A8BA8', textTransform: 'uppercase', letterSpacing: '0.09em' }}>Description</span>
                        {displayDesc && isVagueDesc && aiDesc && (
                          <span style={{ fontSize: 8.5, color: '#10B981', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>AI</span>
                        )}
                      </div>
                      {displayDesc ? (
                        <p style={{ fontSize: 12, color: '#A8B4CC', lineHeight: 1.65, whiteSpace: 'pre-line', margin: 0 }}>
                          {displayDesc}
                        </p>
                      ) : (
                        <p style={{ fontSize: 11, color: '#5A6A88', fontStyle: 'italic', margin: 0 }}>
                          No description — click <span style={{ color: '#7A8BA8' }}>Edit {isCalendar ? 'Event' : 'Session'}</span> to add one.
                        </p>
                      )}
                    </div>
                  </Panel>
                );
              })()}

              {/* Project assignment */}
              {onAssignProject && (
                <div>
                  <p style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#6B7A9A', marginBottom: 7, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Briefcase size={9} />Project
                  </p>
                  {/* AI project suggestion — show when no project assigned */}
                  {!block.project_id && aiSuggestedProject && (
                    <AISuggestedProject
                      suggestion={aiSuggestedProject}
                      onAccept={async () => {
                        const proj = (projects || []).find(p => p.id === aiSuggestedProject.projectId);
                        const newClientId = proj?.client_id || block.client_id || '';
                        if (isSession) {
                          await api.updateSession?.({ sessionId: block.id, title: block.title || '', category: block.category || '', notes: block.notes || null, projectId: aiSuggestedProject.projectId, clientId: newClientId });
                        }
                        onAssignProject(block.id, aiSuggestedProject.projectId, block._type);
                      }}
                    />
                  )}
                  <ProjectPicker
                    projects={projects || []}
                    currentProjectId={block.project_id}
                    onAssign={async (projectId) => {
                      if (isSession) {
                        const proj = (projects || []).find(p => p.id === projectId);
                        const newClientId = proj?.client_id || block.client_id || '';
                        await api.updateSession?.({ sessionId: block.id, title: block.title || '', category: block.category || '', notes: block.notes || null, projectId: projectId || '', clientId: newClientId });
                      }
                      onAssignProject(block.id, projectId, block._type);
                    }}
                  />
                  {isSession && block.client_name && (
                    <p style={{ fontSize: 10, color: '#7A8BA8', marginTop: 6 }}>
                      <span style={{ color: '#5A6A88' }}>Client: </span>{block.client_name}
                    </p>
                  )}
                </div>
              )}

              {/* Static project display when no onAssignProject callback */}
              {!onAssignProject && isSession && block.project_name && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Briefcase size={11} style={{ color: '#7A8BA8', flexShrink: 0 }} />
                  <p style={{ fontSize: 12, color: '#A8B4CC', margin: 0 }}>
                    {block.project_name}{block.client_name && ` · ${block.client_name}`}
                  </p>
                </div>
              )}

              {/* Calendar: location / attendees / meeting URL */}
              {isCalendar && (block.location || attendees.length > 0 || block.meeting_url) && (
                <Panel>
                  <div style={{ padding: '11px 13px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {block.location && (
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
                        <MapPin size={12} style={{ color: '#7A8BA8', marginTop: 1, flexShrink: 0 }} />
                        <p style={{ fontSize: 12, color: '#A8B4CC', margin: 0 }}>{block.location}</p>
                      </div>
                    )}
                    {attendees.length > 0 && (
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
                        <Users size={12} style={{ color: '#7A8BA8', marginTop: 1, flexShrink: 0 }} />
                        <div>
                          <p style={{ fontSize: 9, color: '#6B7A9A', marginBottom: 6, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                            Attendees ({attendees.length})
                          </p>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                            {attendees.slice(0, 6).map((a, i) => (
                              <span key={i} style={{ fontSize: 10, background: 'rgba(255,255,255,0.06)', color: '#8E9AB8', borderRadius: 6, padding: '3px 8px', border: '1px solid rgba(255,255,255,0.08)' }}>
                                {a}
                              </span>
                            ))}
                            {attendees.length > 6 && (
                              <span style={{ fontSize: 10, color: '#7A8BA8' }}>+{attendees.length - 6}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                    {block.meeting_url && (
                      <a href={block.meeting_url} target="_blank" rel="noopener noreferrer"
                        style={{
                          display: 'flex', alignItems: 'center', gap: 9,
                          background: 'rgba(124,108,242,0.09)', border: '1px solid rgba(124,108,242,0.22)',
                          borderRadius: 10, padding: '9px 12px', textDecoration: 'none',
                          transition: 'background 0.14s ease',
                        }}
                        onMouseOver={e => e.currentTarget.style.background = 'rgba(124,108,242,0.16)'}
                        onMouseOut={e  => e.currentTarget.style.background = 'rgba(124,108,242,0.09)'}
                      >
                        <Video size={12} style={{ color: '#9D8FF5', flexShrink: 0 }} />
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#9D8FF5', flex: 1 }}>Join Meeting</span>
                        <ExternalLink size={10} style={{ color: '#9D8FF5', flexShrink: 0 }} />
                      </a>
                    )}
                  </div>
                </Panel>
              )}
            </>
          )}

          {/* ── Focus Score — round circular progress ring ── */}
          {!editMode && focusQuality && (
            <Panel>
              <PanelHeader icon={Gauge} label="Focus Score" />
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '11px 13px 13px' }}>
                <FocusScoreRing score={focusQuality.overall} color={focusQuality.color} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: focusQuality.color, margin: '0 0 3px' }}>
                    {focusQuality.label}
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 10px' }}>
                    {focusQuality.breakdown?.deepPct > 0 && (
                      <span style={{ fontSize: 10, color: '#7A8BA8' }}>
                        Deep work <b style={{ color: '#9AA6C4', fontWeight: 700 }}>{focusQuality.breakdown.deepPct}%</b>
                      </span>
                    )}
                    {focusQuality.switchesPerHour > 0 && (
                      <span style={{ fontSize: 10, color: '#7A8BA8' }}>
                        Switches <b style={{ color: '#9AA6C4', fontWeight: 700 }}>{focusQuality.switchesPerHour}/hr</b>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </Panel>
          )}

          {/* ── Apps & Websites — hidden in edit mode to avoid layout collapse ── */}
          {!editMode && <Panel>
            <PanelHeader
              icon={Monitor}
              label="Apps & Websites"
              right={
                popupApps.length > 0 && (
                  <span style={{ fontSize: 10, color: '#6B7A9A', fontVariantNumeric: 'tabular-nums' }}>
                    {Math.min(popupApps.length, 6)} tracked
                  </span>
                )
              }
            />
            <div style={{ padding: '5px 8px 8px' }}>
              {popupApps.length > 0 ? (
                popupApps.slice(0, 6).map((app, idx) => {
                  const pct     = appTotal > 0 ? Math.round(((app.seconds || 0) / appTotal) * 100) : 0;
                  const secs    = app.seconds || 0;
                  const timeStr = secs >= 3600
                    ? `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`
                    : secs >= 60 ? `${Math.floor(secs / 60)}m` : `${secs}s`;
                  const appColor = hashAppColor(app.label || '');
                  const isHov    = hoveredApp === idx;

                  return (
                    <div
                      key={idx}
                      onMouseEnter={() => setHoveredApp(idx)}
                      onMouseLeave={() => setHoveredApp(null)}
                      style={{
                        padding: '7px 6px 8px', borderRadius: 9,
                        background: isHov ? 'rgba(255,255,255,0.04)' : 'transparent',
                        cursor: 'default', transition: 'background 0.12s ease',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 6 }}>
                        <AppAvatar name={app.label || 'App'} />
                        <span style={{
                          flex: 1, fontSize: 12, fontWeight: 500,
                          color: isHov ? '#D0D4EE' : '#8E96B4',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          transition: 'color 0.12s ease',
                        }}>
                          {app.label}
                        </span>
                        <span style={{
                          fontSize: 11, fontWeight: 600,
                          color: isHov ? '#BCC0D8' : '#7A8BA8',
                          fontVariantNumeric: 'tabular-nums', flexShrink: 0,
                          transition: 'color 0.12s ease',
                        }}>
                          {timeStr}
                        </span>
                        <span style={{
                          fontSize: 10, fontWeight: 700,
                          color: isHov ? appColor : '#5A6A88',
                          fontVariantNumeric: 'tabular-nums',
                          width: 32, textAlign: 'right', flexShrink: 0,
                          transition: 'color 0.12s ease',
                        }}>
                          {pct}%
                        </span>
                      </div>
                      <div style={{ marginLeft: 35, height: 3, borderRadius: 99, background: 'rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                        <div style={{
                          height: '100%', width: `${pct}%`, borderRadius: 99,
                          background: `linear-gradient(90deg, ${appColor}CC 0%, ${appColor}66 100%)`,
                          boxShadow: isHov ? `0 0 7px ${appColor}55` : 'none',
                          transition: 'width 0.55s cubic-bezier(0.4,0,0.2,1), box-shadow 0.12s ease',
                        }} />
                      </div>
                    </div>
                  );
                })
              ) : (
                <p style={{ fontSize: 11, color: '#5A6A88', fontStyle: 'italic', padding: '10px 6px 6px', margin: 0 }}>
                  No app tracking data for this period
                </p>
              )}
            </div>
          </Panel>}

        </div>
      </div>
    </div>
  );
}
