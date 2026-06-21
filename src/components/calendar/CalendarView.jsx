import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { usePrefs } from '../../hooks/usePrefs';
import ReactDOM from 'react-dom';
import {
  ChevronLeft, ChevronRight, Plus, RefreshCw, Calendar,
  Trash2, X, Video, MapPin, Users, Clock, ExternalLink,
  Zap, Coffee, Briefcase, AlertCircle, Tag, FolderOpen,
  Monitor, Target, CheckCircle2, ChevronDown, Mail, FileText,
} from 'lucide-react';
import SummaryPanel from './SummaryPanel';
import SessionDetailPopup from './SessionDetailPopup';
import { TasksWorkspace, ProjectsWorkspace, ClientsWorkspace } from './TabWorkspaces';
import { useCalendarAI } from '../../hooks/useCalendarAI';
import { useAdaptiveIntelligence } from '../../hooks/useAdaptiveIntelligence';
import { RescheduleModal, RescheduleToast, BlockContextMenu } from './RescheduleModal';
import { pushToast } from '../shared/NotificationCentre';
import { mergeWorkflowSessions } from '../../utils/workflowSessionMerge';

const api = window.electron || {};

// ─── Theme hook ───────────────────────────────────────────────────────────────
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

// ─── Timeline constants ───────────────────────────────────────────────────────
const PX_PER_HOUR = 96;
const DAY_HEADER_HEIGHT = 48;
const HOURS       = Array.from({ length: 24 }, (_, i) => i);
const NON_BILLABLE_MARKER = '[non-billable]';
const CAL_EVENT_MARKER_PREFIX = '__cal_event:';
const AUTO_BLOCK_MARKER_PREFIX = '__auto_block:';

// ─── Color palette ────────────────────────────────────────────────────────────
const RIZE_COLORS = {
  focus:    '#818CF8',
  deep:     '#6366F1',
  meeting:  '#F87171',
  break:    '#94A3B8',
  design:   '#34D399',
  coding:   '#60A5FA',
  writing:  '#FB923C',
  research: '#A78BFA',
  admin:    '#FBBF24',
  planning: '#7c6cf2',
  other:    '#94A3B8',
};

const PROJ_PALETTE = [
  '#818CF8','#34D399','#F87171','#60A5FA','#FB923C',
  '#A78BFA','#FBBF24','#7c6cf2','#F472B6','#94A3B8',
];

function hashColor(str) {
  let h = 0;
  for (let i = 0; i < (str || '').length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return PROJ_PALETTE[h % PROJ_PALETTE.length];
}

function hexToRgbTriplet(hex) {
  const raw = String(hex || '').trim();
  const normalized = raw.startsWith('#') ? raw.slice(1) : raw;
  if (/^[0-9a-fA-F]{3}$/.test(normalized)) {
    return normalized.split('').map(ch => parseInt(ch + ch, 16)).join(' ');
  }
  if (/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return [
      parseInt(normalized.slice(0, 2), 16),
      parseInt(normalized.slice(2, 4), 16),
      parseInt(normalized.slice(4, 6), 16),
    ].join(' ');
  }
  return '124 108 242';
}

function getCatColor(cat = '') {
  const c = cat.toLowerCase();
  if (c.includes('focus'))                               return RIZE_COLORS.focus;
  if (c.includes('deep'))                                return RIZE_COLORS.deep;
  if (c.includes('meet'))                                return RIZE_COLORS.meeting;
  if (c.includes('break'))                               return RIZE_COLORS.break;
  if (c.includes('design'))                              return RIZE_COLORS.design;
  if (c.includes('cod') || c.includes('dev') || c.includes('eng')) return RIZE_COLORS.coding;
  if (c.includes('writ') || c.includes('doc'))           return RIZE_COLORS.writing;
  if (c.includes('research'))                            return RIZE_COLORS.research;
  if (c.includes('admin'))                               return RIZE_COLORS.admin;
  if (c.includes('plan'))                                return RIZE_COLORS.planning;
  return hashColor(cat);
}

function blockColor(block, laneMode) {
  // Project / client color mode applies to ALL block types (sessions + calendar events)
  if (laneMode === 'project' && block.project_name) {
    return block.project_color || hashColor(block.project_name);
  }
  if (laneMode === 'client' && block.client_name) {
    return hashColor(block.client_name);
  }
  // Calendar events: use their own color (or meeting fallback)
  if (block._type === 'calendar') {
    return block.color || RIZE_COLORS.meeting;
  }
  // Sessions: derive from type / category
  if (block.session_type === 'meeting') return RIZE_COLORS.meeting;
  if (block.session_type === 'break')   return RIZE_COLORS.break;
  if (block.is_deep_work)               return RIZE_COLORS.deep;
  return getCatColor(block.category);
}

function getSessionIndicatorColor(block) {
  if (!block) return '#818CF8';
  if (block._type === 'calendar') return '#60A5FA';

  const sessionType = String(block.session_type || '').toLowerCase();
  const category = String(block.category || '').toLowerCase();
  const title = String(block.title || '').toLowerCase();

  if (sessionType === 'meeting' || category.includes('meet') || title.includes('meet') || title.includes('call') || title.includes('sync')) {
    return '#F87171';
  }
  if (block.is_deep_work || category.includes('deep') || title.includes('deep work')) {
    return '#34D399';
  }
  return '#8B5CF6';
}

function hasBlockLabel(block) {
  if (!block) return false;
  return Boolean(
    String(
      block.title ||
      block.category ||
      block.project_name ||
      block.client_name ||
      block.source_label ||
      block.app_name ||
      block.window_title ||
      ''
    ).trim()
  );
}

function isRenderableCalendarBlock(block) {
  if (!block?.id) return false;
  if (!Number.isFinite(block.start_time) || !Number.isFinite(block.end_time)) return false;
  if (block.end_time <= block.start_time) return false;
  return hasBlockLabel(block);
}

function isRenderableSessionBlock(block) {
  if (!block?.id) return false;
  // Drop __auto_block: and __cal_event: rows from the calendar grid.
  // __cal_event: linked sessions exist only for project-hour accounting;
  // the actual visual block is already rendered via the calEvents array.
  const notes = String(block.notes || '');
  if (notes.startsWith(AUTO_BLOCK_MARKER_PREFIX) || notes.startsWith(CAL_EVENT_MARKER_PREFIX)) return false;
  const start = block.started_at;
  if (!Number.isFinite(start) || start <= 0) return false;
  // Require an explicit positive ended_at OR a positive duration_seconds.
  // Explicitly treat ended_at = 0 as "no end recorded" (not midnight epoch).
  const end = (Number.isFinite(block.ended_at) && block.ended_at > start)
    ? block.ended_at
    : (block.duration_seconds > 0 ? start + block.duration_seconds : 0);
  if (!end || end <= start) return false;
  return hasBlockLabel(block);
}

// ─── Block type icon ──────────────────────────────────────────────────────────
function getBlockTypeIcon(block) {
  if (!block) return Monitor;
  const t     = (block.session_type || '').toLowerCase();
  const c     = (block.category    || '').toLowerCase();
  const title = (block.title       || '').toLowerCase();

  if (t === 'meeting' || c.includes('meet') || title.includes('meet') ||
      title.includes('standup') || title.includes('call') || title.includes('sync'))
    return Users;
  if (block.is_deep_work || c.includes('deep') || title.includes('deep work'))
    return Zap;
  if (t === 'break')                                            return Coffee;
  if (c.includes('admin') || c.includes('email') ||
      title.includes('admin') || title.includes('email'))       return Mail;
  if (c.includes('doc') || c.includes('writ') || c.includes('research') ||
      title.includes('doc') || title.includes('research'))      return FileText;
  if (c.includes('brief') || c.includes('project') ||
      title.includes('project'))                                return Briefcase;
  if (block._type === 'calendar')                               return Calendar;
  return Monitor;
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

function parseSessionNotes(rawNotes, fallbackDescription = '') {
  const lines = String(rawNotes || '').replace(/\r\n/g, '\n').split('\n');
  const hiddenMarkers = [];
  const descriptionLines = [];
  let isNonBillable = false;
  let linkedCalendarEventId = null;

  for (const rawLine of lines) {
    const line = String(rawLine || '');
    const trimmed = line.trim();
    if (!trimmed) {
      descriptionLines.push('');
      continue;
    }
    if (trimmed === NON_BILLABLE_MARKER) {
      isNonBillable = true;
      continue;
    }
    if (trimmed.startsWith(CAL_EVENT_MARKER_PREFIX) || trimmed.startsWith(AUTO_BLOCK_MARKER_PREFIX)) {
      hiddenMarkers.push(trimmed);
      if (!linkedCalendarEventId && trimmed.startsWith(CAL_EVENT_MARKER_PREFIX)) {
        linkedCalendarEventId = trimmed.slice(CAL_EVENT_MARKER_PREFIX.length);
      }
      continue;
    }
    descriptionLines.push(line);
  }

  const description = descriptionLines.join('\n').trim() || String(fallbackDescription || '').trim();
  return { description, isNonBillable, hiddenMarkers, linkedCalendarEventId };
}

function serializeSessionNotes({ description = '', isNonBillable = false, hiddenMarkers = [] }) {
  const noteLines = [...new Set((hiddenMarkers || []).filter(Boolean))];
  if (isNonBillable) noteLines.push(NON_BILLABLE_MARKER);
  const cleanDescription = String(description || '').trim();
  if (cleanDescription) noteLines.push(cleanDescription);
  return noteLines.length ? noteLines.join('\n') : null;
}

// ─── Timeline position ────────────────────────────────────────────────────────
function blockPos(startUnix, endUnix) {
  const start = new Date(startUnix * 1000);
  const end   = endUnix ? new Date(endUnix * 1000) : new Date();

  const sMins = start.getHours() * 60 + start.getMinutes();

  // If the session crosses midnight into a new calendar day, cap the rendered
  // end at 23:59 of the start day so the block fills to the bottom of the
  // column rather than becoming a tiny 8-minute sliver.
  const startMidnight = new Date(start); startMidnight.setHours(0, 0, 0, 0);
  const endMidnight   = new Date(end);   endMidnight.setHours(0, 0, 0, 0);
  const crossesMidnight = endMidnight > startMidnight;
  const eMins = crossesMidnight ? 23 * 60 + 59 : end.getHours() * 60 + end.getMinutes();

  const durMins = Math.max(eMins - sMins, 8);
  return {
    top:    (sMins / 60) * PX_PER_HOUR,
    height: Math.max((durMins / 60) * PX_PER_HOUR, 20),
  };
}

function overlaps(aS, aE, bS, bE) { return aS < bE && aE > bS; }

const WORKFLOW_THEMES = [
  { id: 'code',      label: 'Coding Sprint',     color: '#60A5FA', terms: ['code', 'dev', 'github', 'cursor', 'vscode', 'terminal', 'react', 'bug'] },
  { id: 'writing',   label: 'Writing Pass',      color: '#FB923C', terms: ['doc', 'write', 'notion', 'google docs', 'draft', 'brief', 'research'] },
  { id: 'comms',     label: 'Communication',     color: '#F87171', terms: ['slack', 'mail', 'gmail', 'outlook', 'meet', 'zoom', 'call', 'sync'] },
  { id: 'planning',  label: 'Planning Loop',     color: '#A78BFA', terms: ['calendar', 'linear', 'figma', 'plan', 'roadmap', 'task', 'project'] },
  { id: 'analysis',  label: 'Analysis Window',   color: '#34D399', terms: ['excel', 'sheet', 'dashboard', 'analytics', 'report', 'data', 'sql'] },
];

function getBlockWindow(block) {
  if (!block) return { start: null, end: null };
  if (block._type === 'calendar') return { start: block.start_time, end: block.end_time };
  if (block._type === 'session') return { start: block.started_at, end: block.ended_at || Math.floor(Date.now() / 1000) };
  if (block._type === 'auto') return { start: block.started_at, end: block.ended_at || (block.started_at + (block.duration_seconds || 0)) };
  return { start: null, end: null };
}

function blockDisplayTitle(block) {
  if (!block) return '';
  if (block._type === 'calendar') return block.title || 'Calendar event';
  if (block._type === 'session') return block.title || block.category || 'Session';
  return block.ai_recommended_title || block.ai_workflow_name || block.ai_label || block.app_name || block.window_title || 'Activity';
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

function aggregateAutoUsage(rows = [], { start = null, end = null, limit = 5 } = {}) {
  const totals = {};
  for (const row of rows) {
    if (row?.is_idle) continue;
    const rowStart = row.started_at;
    const rowEnd = row.ended_at || (row.started_at + (row.duration_seconds || 0));
    const overlapStart = start === null ? rowStart : Math.max(start, rowStart);
    const overlapEnd = end === null ? rowEnd : Math.min(end, rowEnd);
    const seconds = Math.max(overlapEnd - overlapStart, 0);
    if (!seconds) continue;
    const label = getUsageLabel(row);
    totals[label] = (totals[label] || 0) + seconds;
  }
  return Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, seconds]) => ({ label, seconds }));
}

function inferWorkflowTheme(parts = []) {
  const text = parts.filter(Boolean).join(' ').toLowerCase();
  let best = null;
  for (const theme of WORKFLOW_THEMES) {
    const score = theme.terms.reduce((sum, term) => sum + (text.includes(term) ? 1 : 0), 0);
    if (!best || score > best.score) best = { ...theme, score };
  }
  return best?.score > 0 ? best : { id: 'focus', label: 'Focused Work', color: '#818CF8', score: 0 };
}

function getThemeForBlock(block) {
  return inferWorkflowTheme([
    block?.title,
    block?.category,
    block?.project_name,
    block?.client_name,
    block?.source_label,
    block?.app_name,
    block?.window_title,
  ]);
}

function summarizeAutoUsage(rows = []) {
  const filtered = rows.filter(r => !r?.is_idle && (r?.duration_seconds || 0) > 0);
  const appTotals = {};
  let switches = 0;
  let prevApp = null;
  for (const row of filtered.sort((a, b) => a.started_at - b.started_at)) {
    const app = getUsageLabel(row);
    appTotals[app] = (appTotals[app] || 0) + (row.duration_seconds || 0);
    if (prevApp && prevApp !== app) switches += 1;
    prevApp = app;
  }
  const dominantApps = Object.entries(appTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([app, seconds]) => ({ app, seconds }));
  return {
    totalSeconds: filtered.reduce((sum, row) => sum + (row.duration_seconds || 0), 0),
    dominantApps,
    switches,
  };
}

function buildFocusChains(sessions = []) {
  const focusLike = sessions
    .filter(s => (s.ended_at || s.started_at) && s.session_type !== 'meeting' && s.session_type !== 'break')
    .sort((a, b) => a.started_at - b.started_at);
  const chains = [];
  for (const session of focusLike) {
    const start = session.started_at;
    const end = session.ended_at || session.started_at + (session.duration_seconds || 0);
    const prev = chains[chains.length - 1];
    if (prev && start - prev.end <= 20 * 60) {
      prev.end = Math.max(prev.end, end);
      prev.sessions.push(session);
      prev.totalSeconds += session.duration_seconds || Math.max(end - start, 0);
      prev.theme = inferWorkflowTheme([...prev.sessions.map(s => `${s.title || ''} ${s.category || ''} ${s.project_name || ''}`)]);
      continue;
    }
    chains.push({
      start,
      end,
      sessions: [session],
      totalSeconds: session.duration_seconds || Math.max(end - start, 0),
      theme: getThemeForBlock(session),
    });
  }
  return chains;
}

function buildInterruptionMarkers(sessions = []) {
  const focusLike = sessions
    .filter(s => s.started_at && (s.ended_at || s.duration_seconds) && s.session_type !== 'meeting' && s.session_type !== 'break')
    .sort((a, b) => a.started_at - b.started_at);
  const markers = [];
  for (let i = 1; i < focusLike.length; i++) {
    const prev = focusLike[i - 1];
    const next = focusLike[i];
    const prevEnd = prev.ended_at || (prev.started_at + (prev.duration_seconds || 0));
    const gap = next.started_at - prevEnd;
    if (gap >= 8 * 60 && gap <= 40 * 60) {
      markers.push({
        start: prevEnd,
        end: next.started_at,
        gap,
        recoveryLabel: gap <= 15 * 60 ? 'Fast recovery' : gap <= 25 * 60 ? 'Recovered' : 'Long reset',
      });
    }
  }
  return markers;
}

// ─── CALENDAR CONNECT DIALOG ──────────────────────────────────────────────────
const PROVIDER_META = {
  google:  { label: 'Google Calendar', Icon: Calendar, color: '#4285f4' },
  outlook: { label: 'Outlook',         Icon: Monitor,  color: '#0072c6' },
  apple:   { label: 'Apple Calendar',  Icon: Target,   color: '#888888' },
  ical:    { label: 'iCal / Other',    Icon: Tag,      color: '#6366f1' },
};
const ICAL_INSTRUCTIONS = {
  outlook: ['Go to outlook.live.com → Calendar', 'Click Share → Get a link → View only', 'Copy the ICS link'],
  apple:   ['Open icloud.com → Calendar', 'Click Share icon → Enable Public Calendar', 'Copy the URL (webcal://)'],
  ical:    ['Find the iCal/ICS feed URL for your service', 'It usually ends in .ics', 'Paste the full URL below'],
};

// Google OAuth sub-flow: either prompt for credentials setup or launch OAuth
function GoogleConnectStep({ userId, onSuccess, onCancel }) {
  const [phase, setPhase] = useState('ready');
  const [error, setError] = useState('');

  const launchOAuth = async () => {
    setPhase('connecting'); setError('');
    try {
      const result = await api.calendarGoogleConnect?.({ userId });
      if (result?.success) onSuccess(result);
      else throw new Error('Auth did not complete');
    } catch (e) {
      setError(e?.message || 'Authentication failed. Please try again.');
      setPhase('ready');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Google branding header */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '20px 0 8px' }}>
        <div style={{ width: 52, height: 52, borderRadius: 14, background: 'rgba(66,133,244,0.12)', border: '1px solid rgba(66,133,244,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Calendar size={22} style={{ color: '#4285f4' }} />
        </div>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: '#EAEAF0', marginBottom: 4 }}>Google Calendar</p>
          <p style={{ fontSize: 12, color: '#6B7280', lineHeight: 1.5 }}>
            Connect your Google account to automatically sync all your calendars.
          </p>
        </div>
      </div>

      <button onClick={launchOAuth} disabled={phase === 'connecting'}
        style={{ width: '100%', padding: '12px 0', borderRadius: 11, background: phase === 'connecting' ? 'rgba(66,133,244,0.1)' : 'rgba(66,133,244,0.18)', border: '1px solid rgba(66,133,244,0.35)', color: '#60a5fa', fontSize: 13, fontWeight: 700, cursor: phase === 'connecting' ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, transition: 'all 0.15s', opacity: phase === 'connecting' ? 0.8 : 1 }}>
        {phase === 'connecting'
          ? <><RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> Opening Google sign-in…</>
          : <><Calendar size={13} /> Connect with Google</>}
      </button>

      {error && (
        <div style={{ display: 'flex', gap: 7, background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.22)', borderRadius: 8, padding: '9px 11px' }}>
          <AlertCircle size={12} style={{ color: '#F87171', flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 11, color: '#FCA5A5' }}>{error}</p>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, paddingTop: 4 }}>
        <button onClick={onCancel}
          style={{ flex: 1, padding: '9px 0', borderRadius: 9, background: 'transparent', border: '1px solid #252932', color: '#6B7280', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
          ← Back
        </button>
      </div>
    </div>
  );
}

function ConnectDialog({ userId, onClose, onSave }) {
  const providers = [
    { id: 'google',  name: 'Google Calendar',  color: '#4285f4', badge: 'Native OAuth' },
    { id: 'outlook', name: 'Outlook / Office',  color: '#0072c6', badge: 'iCal' },
    { id: 'apple',   name: 'Apple Calendar',    color: '#888888', badge: 'iCal' },
    { id: 'ical',    name: 'Custom iCal URL',   color: '#6366f1', badge: 'iCal' },
  ];
  const [provider, setProvider] = useState('google');
  const [step,     setStep]     = useState(1); // 1=pick provider, 2=google OAuth | 2=ical url
  const [label,    setLabel]    = useState('');
  const [icsUrl,   setIcsUrl]   = useState('');
  const [color,    setColor]    = useState('#4285f4');
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');

  const goNext = () => {
    setError(''); setStep(2);
  };

  const saveIcal = async () => {
    if (!icsUrl.trim()) return;
    setSaving(true); setError('');
    try {
      const url = icsUrl.trim().replace(/^webcal:\/\//i, 'https://');
      await onSave({ provider, label: label || providers.find(p => p.id === provider)?.name, icsUrl: url, color });
      onClose();
    } catch (err) {
      setError(err?.message || 'Could not connect. Check the URL and try again.');
      setSaving(false);
    }
  };

  const handleGoogleSuccess = async (result) => {
    // Google connection was already persisted + synced by main process; reload sources.
    await onSave(null); // null signals "Google OAuth already handled"
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div style={{ width: 460, background: '#0D0F16', border: '1px solid #1E2230', borderRadius: 20, boxShadow: '0 32px 80px rgba(0,0,0,0.7)', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #1E2230' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Calendar size={14} style={{ color: '#7c6cf2' }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: '#EAEAF0' }}>Connect Calendar</span>
          </div>
          <button onClick={onClose} style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 7, background: 'transparent', border: 'none', cursor: 'pointer', color: '#4B5263' }}
            onMouseOver={e => { e.currentTarget.style.color = '#EAEAF0'; e.currentTarget.style.background = '#1A1D24'; }}
            onMouseOut={e  => { e.currentTarget.style.color = '#4B5263'; e.currentTarget.style.background = 'transparent'; }}>
            <X size={13} />
          </button>
        </div>

        <div style={{ padding: 20 }}>
          {/* Step 1: Pick provider */}
          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <p style={{ fontSize: 12, color: '#6B7280' }}>Choose your calendar provider to get started.</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {providers.map(p => {
                  const meta = PROVIDER_META[p.id];
                  const ProvIcon = meta?.Icon;
                  const isSelected = provider === p.id;
                  return (
                    <button key={p.id} onClick={() => { setProvider(p.id); setColor(p.color); }}
                      style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '12px 14px', borderRadius: 12, border: `1px solid ${isSelected ? `${p.color}40` : '#1E2230'}`, background: isSelected ? `${p.color}0D` : '#111419', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s', boxShadow: isSelected ? `0 0 0 1px ${p.color}20` : 'none' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <ProvIcon size={15} style={{ color: isSelected ? p.color : '#4B5263' }} />
                        <span style={{ fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 4, background: isSelected ? `${p.color}18` : '#1A1D24', color: isSelected ? p.color : '#4B5263', border: `1px solid ${isSelected ? `${p.color}25` : '#252932'}` }}>
                          {p.badge}
                        </span>
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 600, color: isSelected ? '#EAEAF0' : '#9CA3AF' }}>{p.name}</span>
                    </button>
                  );
                })}
              </div>
              <button onClick={goNext}
                style={{ width: '100%', padding: '11px 0', borderRadius: 11, background: 'rgba(124,108,242,0.18)', border: '1px solid rgba(124,108,242,0.35)', color: '#A78BFA', fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s' }}
                onMouseOver={e => { e.currentTarget.style.background = 'rgba(124,108,242,0.26)'; }}
                onMouseOut={e  => { e.currentTarget.style.background = 'rgba(124,108,242,0.18)'; }}>
                Continue →
              </button>
            </div>
          )}

          {/* Step 2: Google OAuth */}
          {step === 2 && provider === 'google' && (
            <GoogleConnectStep userId={userId} onSuccess={handleGoogleSuccess} onCancel={() => setStep(1)} />
          )}

          {/* Step 2: iCal URL input */}
          {step === 2 && provider !== 'google' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Instructions */}
              <div style={{ background: '#111419', border: '1px solid #1E2230', borderRadius: 10, padding: 14 }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: '#4B5263', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
                  How to get your {PROVIDER_META[provider]?.label} iCal URL
                </p>
                <ol style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(ICAL_INSTRUCTIONS[provider] || []).map((s, i) => (
                    <li key={i} style={{ display: 'flex', gap: 9, fontSize: 12, color: '#6B7280' }}>
                      <span style={{ width: 18, height: 18, borderRadius: '50%', background: '#1A1D24', border: '1px solid #252932', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#9CA3AF', fontWeight: 700, flexShrink: 0, marginTop: 1 }}>{i + 1}</span>
                      {s}
                    </li>
                  ))}
                </ol>
              </div>
              {/* Name */}
              <div>
                <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#4B5263', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Calendar Name (optional)</label>
                <input value={label} onChange={e => setLabel(e.target.value)} placeholder={PROVIDER_META[provider]?.label}
                  style={{ width: '100%', background: '#111419', border: '1px solid #1E2230', borderRadius: 8, padding: '8px 10px', color: '#E2E4EF', fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
              </div>
              {/* URL */}
              <div>
                <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#4B5263', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>iCal / ICS URL *</label>
                <input value={icsUrl} onChange={e => setIcsUrl(e.target.value)} placeholder="https://calendar.example.com/feed.ics"
                  style={{ width: '100%', background: '#111419', border: '1px solid #1E2230', borderRadius: 8, padding: '8px 10px', color: '#E2E4EF', fontSize: 12, outline: 'none', boxSizing: 'border-box', fontFamily: 'monospace' }} />
              </div>
              {error && (
                <div style={{ display: 'flex', gap: 7, background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.22)', borderRadius: 8, padding: '9px 11px' }}>
                  <AlertCircle size={12} style={{ color: '#F87171', flexShrink: 0, marginTop: 1 }} />
                  <p style={{ fontSize: 11, color: '#FCA5A5' }}>{error}</p>
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setStep(1)}
                  style={{ flex: 1, padding: '10px 0', borderRadius: 9, background: 'transparent', border: '1px solid #252932', color: '#6B7280', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  ← Back
                </button>
                <button onClick={saveIcal} disabled={!icsUrl.trim() || saving}
                  style={{ flex: 2, padding: '10px 0', borderRadius: 9, background: saving || !icsUrl.trim() ? 'rgba(124,108,242,0.08)' : 'rgba(124,108,242,0.18)', border: '1px solid rgba(124,108,242,0.35)', color: '#9b8ff8', fontSize: 12, fontWeight: 700, cursor: !icsUrl.trim() || saving ? 'not-allowed' : 'pointer', opacity: !icsUrl.trim() || saving ? 0.5 : 1, transition: 'all 0.15s' }}>
                  {saving ? 'Connecting…' : 'Connect & Sync'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── EVENT BLOCK ──────────────────────────────────────────────────────────────
function RizeBlock({
  block,
  title, timeStr, duration, color,
  top, height, left, right,
  isCompact, isActive, isCalendar,
  isOverlay,      // floats on top of a primary event — elevated card treatment
  isUnderlay,     // primary event with an overlay card sitting on its right side
  stackCount,     // number of overlay cards stacked above this underlay (for the count badge)
  indicatorOverride, // explicit indicator colour; when undefined falls back to getSessionIndicatorColor
  typeIcon: TypeIcon,
  onClick, onMouseEnter, onMouseLeave, onContextMenu, zIndex,
}) {
  if (!block) return null;

  // A session is "upcoming" when its start time is in the future (not yet started).
  // Calendar events are never flagged as upcoming — they represent external invites.
  const nowSec = Math.floor(Date.now() / 1000);
  const isUpcoming = !isCalendar && block._type === 'session' && block.started_at > nowSec;

  // Height buckets (based on PX_PER_HOUR = 96; 1h = 96px, 30m = 48px, 15m = 24px)
  const isTiny   = height < 26;   // < ~16 min — just a color sliver
  const isShort  = height < 42;   // 16–26 min  — title only, no wrap
  const isSmall  = height < 64;   // 26–40 min  — title + time, tight
  const isMed    = height < 90;   // 40–56 min  — title + time, 1-line clamp
  const showMeta = height >= 90;  // 56+ min    — full: icon + duration badge

  const displayHeight = Math.max(height - 2, isTiny ? 12 : 20);
  // indicatorOverride is set by DayColumn when laneMode forces a specific colour
  // (project / client). Fall back to type-based colour otherwise.
  const indicatorColor = indicatorOverride || getSessionIndicatorColor(block);
  const resolvedTitle = String(title || blockDisplayTitle(block) || '').trim();

  if (!resolvedTitle || !Number.isFinite(top) || !Number.isFinite(height) || height <= 0) {
    return null;
  }

  // Normalise color to a valid 7-char hex (#RRGGBB).
  // Calendar events can carry non-hex values (named colors, rgba, etc.) from provider APIs.
  // Appending hex opacity suffixes to a non-hex string produces invalid CSS which causes the
  // browser to silently drop the background → transparent "ghost block" appearance.
  const safeColor = (/^#[0-9a-fA-F]{6}$/.test(color || ''))
    ? color
    : (/^#[0-9a-fA-F]{3}$/.test(color || ''))
      ? `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`
      : '#7c6cf2'; // universal fallback — accent purple

  // Two-layer background: gradient on top + solid base beneath.
  // Upcoming sessions use a lighter, desaturated fill with a dashed border
  // to visually distinguish planned (not-yet-started) blocks from completed ones.
  const bgFill = isUpcoming
    ? `linear-gradient(165deg, ${safeColor}90 0%, ${safeColor}70 100%), ${safeColor}50`
    : isOverlay
      ? `linear-gradient(150deg, ${safeColor}F8 0%, ${safeColor}EC 50%, ${safeColor}E0 100%), ${safeColor}C0`
      : `linear-gradient(165deg, ${safeColor}F0 0%, ${safeColor}DD 100%), ${safeColor}B0`;

  // Overlay: deep multi-layer floating shadow + accent ring for premium lift
  // Underlay: muted shadow to yield depth visually to the overlay card above it
  const baseShadow = isOverlay
    ? [
        `0 8px 24px rgba(0,0,0,0.60)`,
        `0 2px 8px rgba(0,0,0,0.35)`,
        `0 0 0 1px ${safeColor}60`,
        `0 0 0 3px ${safeColor}1E`,
        `inset 0 1px 0 rgba(255,255,255,0.32)`,
        `inset 0 -1px 0 rgba(0,0,0,0.18)`,
      ].join(', ')
    : isUnderlay
      ? `0 1px 6px ${safeColor}22, inset 0 1px 0 rgba(255,255,255,0.10)`
      : `0 2px 12px ${safeColor}30, inset 0 1px 0 rgba(255,255,255,0.16)`;

  const hoverShadow = isOverlay
    ? [
        `0 14px 36px rgba(0,0,0,0.72)`,
        `0 4px 12px rgba(0,0,0,0.42)`,
        `0 0 0 1px ${safeColor}80`,
        `0 0 0 3.5px ${safeColor}30`,
        `inset 0 1px 0 rgba(255,255,255,0.36)`,
      ].join(', ')
    : `0 6px 20px ${safeColor}50, 0 0 0 1.5px ${safeColor}, inset 0 1px 0 rgba(255,255,255,0.2)`;

  // Overlay card: sharp left edge (emerges from behind the primary) + rounded right.
  // Underlay: slightly softer radius to look "deeper" / more background.
  const borderRadius = isTiny ? 6
    : isOverlay  ? '3px 10px 10px 3px'
    : isUnderlay ? 9
    : 10;

  const defaultZIndex = isOverlay ? 22 : (isCalendar ? 10 : 20);

  // Overlay cards have tighter, slightly scaled-down type to feel compact + secondary.
  // fontScale < 1 keeps them clearly subordinate without being unreadable.
  const fontScale = isOverlay ? 0.88 : 1;
  const rgbTriplet = hexToRgbTriplet(safeColor);

  return (
    <button
      className={`fl-calendar-block${isOverlay ? ' fl-calendar-block--overlay' : ''}${isUnderlay ? ' fl-calendar-block--underlay' : ''}${isCalendar ? ' fl-calendar-block--calendar' : ' fl-calendar-block--session'}${isUpcoming ? ' fl-calendar-block--upcoming' : ''}`}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onContextMenu={onContextMenu}
      style={{
        '--fl-block-color': safeColor,
        '--fl-block-rgb': rgbTriplet,
        '--fl-block-indicator': indicatorColor,
        position: 'absolute',
        top: top + 1, height: displayHeight,
        left, right,
        background: bgFill,
        // Upcoming: dashed border signals "planned, not yet started"
        // Overlay: stronger, richer border for clear card separation
        // Underlay: subtly muted border so it reads as "background"
        // Normal: standard accent border
        border: isUpcoming
          ? `1.5px dashed ${safeColor}CC`
          : isOverlay
            ? `1px solid ${safeColor}70`
            : isUnderlay
              ? `1px solid ${safeColor}90`
              : `1px solid ${safeColor}CC`,
        borderLeft: isUpcoming ? `3px dashed ${indicatorColor}` : `4px solid ${indicatorColor}`,
        borderTop: isOverlay ? `1px solid ${safeColor}AA` : undefined,
        borderRadius, overflow: 'hidden',
        zIndex: zIndex || defaultZIndex,
        cursor: 'pointer', textAlign: 'left',
        boxShadow: baseShadow,
        // Overlay cards rest at natural position; hover lifts them with a Y shift
        transform: 'translateZ(0)',
        transition: 'filter 0.13s ease, box-shadow 0.15s ease, transform 0.15s cubic-bezier(0.34,1.56,0.64,1)',
        willChange: 'transform, box-shadow',
      }}
      onMouseOver={e => {
        e.currentTarget.style.filter = isUnderlay ? '' : 'brightness(1.08)';
        e.currentTarget.style.zIndex = '50';
        e.currentTarget.style.boxShadow = hoverShadow;
        e.currentTarget.style.transform = isOverlay
          ? 'translateY(-3px) translateX(2px) translateZ(0)'
          : isUnderlay
            ? 'translateZ(0)'
            : 'translateY(-1px) translateZ(0)';
      }}
      onMouseOut={e => {
        e.currentTarget.style.filter = '';
        e.currentTarget.style.zIndex = String(zIndex || defaultZIndex);
        e.currentTarget.style.boxShadow = baseShadow;
        e.currentTarget.style.transform = 'translateZ(0)';
      }}
    >
      <div style={{
        // Overlay: tighter padding (compact secondary card)
        // Underlay: right padding ~50% so text stays in the visible left zone
        padding: isTiny ? '1px 5px'
          : isOverlay
            ? (isShort ? '3px 6px 2px' : isSmall ? '4px 7px 3px' : isMed ? '4px 7px 3px' : '5px 8px 4px')
            : isUnderlay
              ? (isShort ? '3px 52% 2px 7px' : isSmall ? '4px 52% 3px 8px' : isMed ? '5px 52% 4px 8px' : '6px 52% 5px 9px')
              : (isShort ? '3px 7px 2px' : isSmall ? '4px 8px 3px' : isMed ? '5px 8px 4px' : '6px 9px 5px'),
        height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden',
        gap: (isTiny || isShort) ? 0 : isSmall ? 1 : 2,
        position: 'relative',
      }}>

        {/* Active pulse dot */}
        {isActive && (
          <span style={{
            position: 'absolute', top: 4, right: 4,
            width: 5, height: 5, borderRadius: '50%',
            background: '#34D399', flexShrink: 0,
            boxShadow: '0 0 6px rgba(52,211,153,0.7)',
            animation: 'pulse 2s infinite',
          }} />
        )}

        {/* Underlay depth layer — right-side scrim + stacked-card edge details.
            Dims the right zone to carve out visual space for the overlay card above.
            Used for both calendar event underlays and session primary cards. */}
        {isUnderlay && !isTiny && (
          <div className="fl-calendar-block__underlay-depth" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1, borderRadius: 'inherit', overflow: 'hidden' }}>
            {/* Right-zone gradient scrim — fades from dark at edge to transparent */}
            <div style={{
              position: 'absolute', top: 0, right: 0, bottom: 0, width: '52%',
              background: 'linear-gradient(to left, rgba(0,0,0,0.38) 0%, rgba(0,0,0,0.18) 45%, rgba(0,0,0,0.06) 70%, transparent 100%)',
              borderRadius: '0 inherit inherit 0',
            }} />
            {/* Inset stacked-card edge highlights — two fine lines suggest layered depth */}
            <div style={{
              position: 'absolute', inset: 0,
              boxShadow: 'inset -2px 0 0 rgba(255,255,255,0.20), inset -6px 0 0 rgba(255,255,255,0.06)',
            }} />
            {/* Vertical separator at 52% — faint boundary line between zones */}
            <div style={{
              position: 'absolute', top: '8%', bottom: '8%',
              left: 'calc(52% - 0.5px)', width: 1,
              background: 'linear-gradient(to bottom, transparent 0%, rgba(255,255,255,0.18) 20%, rgba(255,255,255,0.18) 80%, transparent 100%)',
            }} />
            {/* Stack count badge — "+N stacked" hint in the right zone corner */}
            {stackCount > 0 && !isShort && (
              <div style={{
                position: 'absolute',
                top: isMed ? 4 : 6,
                right: 5,
                display: 'flex', alignItems: 'center', gap: 2,
                background: 'rgba(0,0,0,0.30)',
                border: '1px solid rgba(255,255,255,0.18)',
                borderRadius: 5, padding: '1px 4px',
                backdropFilter: 'blur(4px)',
              }}>
                <span style={{ fontSize: 7.5, fontWeight: 700, color: 'rgba(255,255,255,0.85)', letterSpacing: '0.02em', lineHeight: 1 }}>
                  +{stackCount}
                </span>
              </div>
            )}
          </div>
        )}

        {/* ── Title ── */}
        <p className="fl-calendar-block__title" style={{
          fontSize: (isTiny ? 8 : isShort ? 9 : isSmall ? 10 : isMed ? 10.5 : 11) * fontScale,
          fontWeight: 700,
          lineHeight: isTiny ? 1 : 1.25,
          color: isUnderlay ? 'rgba(255,255,255,0.92)' : '#FFFFFF',
          // Overlay: stronger shadow for elevated card; underlay: softer (background card)
          textShadow: isOverlay
            ? '0 1px 4px rgba(0,0,0,0.60)'
            : isUnderlay
              ? '0 1px 2px rgba(0,0,0,0.28)'
              : '0 1px 3px rgba(0,0,0,0.35)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          // single-line for tiny/short/small; 2-line clamp for taller
          display: (isTiny || isShort || isSmall) ? 'block' : '-webkit-box',
          WebkitLineClamp: isMed ? 1 : 2,
          WebkitBoxOrient: 'vertical',
          whiteSpace: (isTiny || isShort || isSmall) ? 'nowrap' : 'normal',
          maxWidth: '100%',
          margin: 0, letterSpacing: '-0.01em', flexShrink: 0,
          position: 'relative', zIndex: 2,
        }}>{title}</p>

        {/* ── Time ── */}
        {!isShort && !isTiny && timeStr && (
          <p className="fl-calendar-block__time" style={{
            fontSize: (isSmall ? 8.5 : 9) * fontScale,
            lineHeight: 1.2,
            color: isOverlay ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.88)',
            textShadow: '0 1px 2px rgba(0,0,0,0.3)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            fontVariantNumeric: 'tabular-nums', margin: 0,
            letterSpacing: '-0.005em', flexShrink: 0,
            position: 'relative', zIndex: 2,
          }}>{timeStr}</p>
        )}

        {/* ── Bottom row: type icon + duration badge (tall blocks only) ── */}
        {showMeta && (
          <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 3, position: 'relative', zIndex: 2 }}>
            {TypeIcon
              ? <TypeIcon className="fl-calendar-block__icon" size={isOverlay ? 8 : 9} style={{ color: 'rgba(255,255,255,0.82)', flexShrink: 0 }} />
              : <span />}
            {duration && (
              <span className="fl-calendar-block__badge" style={{
                fontSize: isOverlay ? 7.5 : 8, fontWeight: 700,
                padding: isOverlay ? '1px 4px' : '1px 5px', borderRadius: 4,
                background: isOverlay ? 'rgba(0,0,0,0.28)' : 'rgba(0,0,0,0.2)',
                color: 'rgba(255,255,255,0.92)',
                border: `1px solid rgba(255,255,255,${isOverlay ? '0.28' : '0.2'})`,
                fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em', flexShrink: 0,
              }}>{duration}</span>
            )}
          </div>
        )}

        {/* ── Compact: just duration badge (medium blocks) ── */}
        {!showMeta && !isSmall && !isTiny && duration && (
          <p className="fl-calendar-block__duration" style={{
            fontSize: 8 * fontScale, color: 'rgba(255,255,255,0.84)',
            textShadow: '0 1px 2px rgba(0,0,0,0.3)',
            fontVariantNumeric: 'tabular-nums', margin: 0, marginTop: 'auto',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            letterSpacing: '-0.01em', flexShrink: 0,
            position: 'relative', zIndex: 2,
          }}>{duration}</p>
        )}
      </div>
    </button>
  );
}

// ─── PROJECT PICKER ───────────────────────────────────────────────────────────
function ProjectPicker({ projects, currentProjectId, onAssign }) {
  const [open, setOpen] = useState(false);
  const current = projects.find(p => p.id === currentProjectId);

  return (
    <div className="fl-calendar-project-picker" style={{ position: 'relative' }}>
      <button
        className="fl-calendar-project-trigger"
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '5px 10px', borderRadius: 8,
          background: current ? `${current.color}15` : '#1A1D24',
          border: `1px solid ${current ? current.color + '30' : '#2A2F3A'}`,
          cursor: 'pointer', width: '100%',
        }}
        onMouseOver={e => e.currentTarget.style.filter = 'brightness(1.15)'}
        onMouseOut={e  => e.currentTarget.style.filter = ''}
      >
        {current ? (
          <>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: current.color, flexShrink: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: current.color, flex: 1, textAlign: 'left' }}>{current.name}</span>
          </>
        ) : (
          <>
            <FolderOpen size={11} style={{ color: '#4B5263', flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: '#4B5263', flex: 1, textAlign: 'left' }}>Assign project…</span>
          </>
        )}
        <ChevronDown size={10} style={{ color: '#4B5263', flexShrink: 0 }} />
      </button>

      {open && (
        <div className="fl-calendar-project-menu" style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 60, marginTop: 4,
          background: '#1A1D24', border: '1px solid #2A2F3A', borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)', overflow: 'hidden',
          maxHeight: 200, overflowY: 'auto',
        }}>
          {currentProjectId && (
            <button
              onClick={() => { onAssign(null); setOpen(false); }}
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 12px', background: 'transparent', border: 'none', borderBottom: '1px solid #2A2F3A', cursor: 'pointer', color: '#6B7280' }}
              onMouseOver={e => e.currentTarget.style.background = '#2A2F3A'}
              onMouseOut={e  => e.currentTarget.style.background = 'transparent'}
            >
              <X size={10} />
              <span style={{ fontSize: 11 }}>Remove assignment</span>
            </button>
          )}
          {projects.map(p => (
            <button
              key={p.id}
              onClick={() => { onAssign(p.id); setOpen(false); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                padding: '7px 12px', background: p.id === currentProjectId ? `${p.color}12` : 'transparent',
                border: 'none', cursor: 'pointer',
              }}
              onMouseOver={e => e.currentTarget.style.background = `${p.color}18`}
              onMouseOut={e  => e.currentTarget.style.background = p.id === currentProjectId ? `${p.color}12` : 'transparent'}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: p.id === currentProjectId ? p.color : '#EAEAF0', fontWeight: p.id === currentProjectId ? 700 : 400 }}>{p.name}</span>
              {p.id === currentProjectId && <CheckCircle2 size={10} style={{ color: p.color, marginLeft: 'auto' }} />}
            </button>
          ))}
          {projects.length === 0 && (
            <p style={{ fontSize: 10, color: '#4B5263', padding: '8px 12px', fontStyle: 'italic' }}>No projects yet</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Helpers for time editing ─────────────────────────────────────────────────
function unixToTimeInput(unix) {
  const d = new Date(unix * 1000);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function applyTimeInput(unix, timeStr) {
  // Returns a new unix timestamp on the same calendar day, at the given HH:MM
  const d = new Date(unix * 1000);
  const [h, m] = timeStr.split(':').map(Number);
  d.setHours(h, m, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

// ─── SESSION DETAIL POPUP — rendered via SessionDetailPopup.jsx ───────────────
const SessionPopup = SessionDetailPopup;
// ─── DAY COLUMN ───────────────────────────────────────────────────────────────
function DayColumn({ sessions, calEvents, autoSessions = [], activeSession, isToday, nowTop, onHover, onSelect, onContextMenu, compact, laneMode, date, onRangeSelect, selectedBlockId = null, calEventStacking = true, aiTitleMap = {} }) {
  const visibleCalEvents = useMemo(() => calEvents.filter(isRenderableCalendarBlock), [calEvents]);
  const visibleSessions = useMemo(() => sessions.filter(isRenderableSessionBlock), [sessions]);
  const focusChains = useMemo(() => buildFocusChains(visibleSessions), [visibleSessions]);
  const interruptionMarkers = useMemo(() => buildInterruptionMarkers(visibleSessions), [visibleSessions]);
  const [dragRange, setDragRange] = useState(null);
  // Stable ref for the column container — used by drag handlers to get a fresh
  // bounding rect on every event (avoids stale closure over the mousedown rect).
  const containerRef = useRef(null);

  const calColumnLayout = useMemo(() => {
    if (!visibleCalEvents.length) return {};
    const sorted = [...visibleCalEvents].sort((a, b) => a.start_time - b.start_time);
    const layout = {};
    const groups = [];
    for (const ev of sorted) {
      let placed = false;
      for (const grp of groups) {
        if (ev.start_time < grp.end) { grp.items.push(ev); grp.end = Math.max(grp.end, ev.end_time); placed = true; break; }
      }
      if (!placed) groups.push({ items: [ev], end: ev.end_time });
    }
    for (const grp of groups) {
      const gS = Math.min(...grp.items.map(e => e.start_time));
      const gE = Math.max(...grp.items.map(e => e.end_time));
      // Mark whether any session overlaps this group — used to render the "underlay" depth treatment
      const hasSessionOverlay = visibleSessions.some(s =>
        Number.isFinite(s.ended_at) && s.ended_at > s.started_at &&
        overlaps(gS, gE, s.started_at, s.ended_at)
      );
      grp.items.forEach((ev, idx) => {
        layout[ev.id] = { col: idx, total: grp.items.length, hasSessionOverlay };
      });
    }
    return layout;
  }, [visibleCalEvents, visibleSessions]);

  const sessionColumnLayout = useMemo(() => {
    if (!visibleSessions.length) return {};
    // Only sessions with a real ended_at participate in overlap layout
    const sorted = [...visibleSessions]
      .filter(s => Number.isFinite(s.ended_at) && s.ended_at > s.started_at)
      .sort((a, b) => a.started_at - b.started_at || a.ended_at - b.ended_at);
    const layout = {};
    const groups = [];

    // Group overlapping sessions into clusters
    for (const session of sorted) {
      let placed = false;
      for (const grp of groups) {
        if (session.started_at < grp.end) {
          grp.items.push(session);
          grp.end = Math.max(grp.end, session.ended_at);
          placed = true;
          break;
        }
      }
      if (!placed) groups.push({ items: [session], end: session.ended_at });
    }

    for (const grp of groups) {
      if (grp.items.length === 1) {
        // No overlap — solo card, full width
        layout[grp.items[0].id] = { role: 'solo', total: 1, overlayIndex: 0, hasSiblingOverlay: false };
        continue;
      }

      if (grp.items.length === 2) {
        // ── Stacked overlay (exactly 2 sessions that directly overlap) ──────────
        // Groups of 2 are always guaranteed to directly overlap since the second
        // session was added because its started_at < group.end (the first session's ended_at).
        const [a, b] = grp.items;
        const durA = a.ended_at - a.started_at;
        const durB = b.ended_at - b.started_at;
        // Primary = longer duration; ties broken by earlier start
        const primary = (durA > durB || (durA === durB && a.started_at <= b.started_at)) ? a : b;
        const overlay = primary === a ? b : a;
        layout[primary.id] = { role: 'primary',  total: 2, overlayIndex: 0, hasSiblingOverlay: true };
        layout[overlay.id] = { role: 'overlay',  total: 2, overlayIndex: 0, hasSiblingOverlay: false };
        continue;
      }

      // ── 3+ sessions: fall back to original lane/column splitting ─────────────
      // The transitive grouping algorithm can put non-directly-overlapping sessions
      // in the same cluster (e.g. A-B overlap, B-C overlap but A-C do not).
      // Stacking non-overlapping pairs creates "orphaned overlay" ghost cards, so
      // we use the safe side-by-side column layout for clusters of 3+.
      const lanes = [];
      const sorted3 = [...grp.items].sort((a, b) => a.started_at - b.started_at);
      sorted3.forEach(session => {
        let lane = lanes.findIndex(laneEnd => session.started_at >= laneEnd);
        if (lane === -1) lane = lanes.length;
        lanes[lane] = session.ended_at;
        layout[session.id] = { role: 'column', col: lane, total: 0, overlayIndex: 0, hasSiblingOverlay: false };
      });
      const totalLanes = lanes.length;
      sorted3.forEach(s => { if (layout[s.id]?.role === 'column') layout[s.id].total = totalLanes; });
    }

    return layout;
  }, [visibleSessions]);

  const getCalPos = useCallback((ev) => {
    const g = compact ? 2 : 3;
    // When stacking is disabled, always show events full-width with no overlap layout
    if (!calEventStacking) return { left: g, right: g, hasSessionOverlay: false };
    const info = calColumnLayout[ev.id];
    if (!info) return { left: g, right: g, hasSessionOverlay: false };
    const { col, total, hasSessionOverlay } = info;
    if (total === 1) return { left: g, right: g, hasSessionOverlay };
    const slotPct = 100 / total;
    const lPct = col * slotPct;
    const rPct = 100 - (col + 1) * slotPct;
    return { left: `${lPct}%`, right: `${rPct}%`, hasSessionOverlay };
  }, [calColumnLayout, compact, calEventStacking]);

  const getSessPos = useCallback((s) => {
    const sEnd = (Number.isFinite(s.ended_at) && s.ended_at > s.started_at)
      ? s.ended_at
      : (s.duration_seconds > 0 ? s.started_at + s.duration_seconds : s.started_at + 1);
    const gutter = compact ? 2 : 3;

    // When event stacking is disabled, every session renders full-width with no overlap treatment
    if (!calEventStacking) {
      return { left: compact ? 3 : 5, right: compact ? 2 : 3, isOverlay: false, isUnderlay: false };
    }

    // Only consider cal-overlap when we have a real ended_at (not a synthesised one)
    const hasCalOverlap = (Number.isFinite(s.ended_at) && s.ended_at > s.started_at) &&
      visibleCalEvents.some(e => overlaps(s.started_at, sEnd, e.start_time, e.end_time));

    if (!hasCalOverlap) {
      const info = sessionColumnLayout[s.id];
      const role = info?.role ?? 'solo';

      // Solo or primary card — full width
      if (!info || role === 'solo') {
        return { left: compact ? 3 : 5, right: compact ? 2 : 3, isOverlay: false, isUnderlay: false };
      }

      // ── Column split (3+ sessions, original lane algorithm) ──────────────────
      if (role === 'column') {
        const { col, total } = info;
        const slot    = 100 / total;
        const leftPct = col * slot;
        const rightPct = 100 - (col + 1) * slot;
        return {
          left:  `calc(${leftPct}%  + ${gutter}px)`,
          right: `calc(${rightPct}% + ${gutter}px)`,
          isOverlay: false,
          isUnderlay: false,
        };
      }

      if (role === 'primary') {
        return {
          left: compact ? 3 : 5, right: compact ? 2 : 3,
          isOverlay: false,
          // Activate the right-side depth scrim on the primary to show overlay card's zone
          isUnderlay: info.hasSiblingOverlay,
        };
      }

      // ── Stacked overlay card (session floating above a primary session) ────────
      // Mirrors the cal-session overlay system so both use the same visual treatment.
      // STACK_START aligns with the underlay depth scrim separator line (52%).
      // PEEK_PX: how many px the overlay card's left edge overlaps the primary
      //          (creates the intentional "card-on-card" connection).
      const STACK_START = 52;  // % — matches underlay separator at 52%
      const PEEK_PX     = 8;   // px into primary card (stronger peek than cal overlays)
      const CASCADE_PX  = 4;   // each additional overlay card cascades slightly right
      const idx         = info.overlayIndex; // 0 for first overlay, 1 for second, etc.

      if (info.total <= 2) {
        // Single overlay — takes the full right zone
        return {
          left:  `calc(${STACK_START}% - ${PEEK_PX}px)`,
          right: `${gutter}px`,
          isOverlay: true,
          isUnderlay: false,
        };
      }

      // Multiple overlay cards — split the overlay zone with cascade offset
      const slotPct = (100 - STACK_START) / (info.total - 1);
      const lPct    = STACK_START + idx * slotPct;
      const rPct    = 100 - (STACK_START + (idx + 1) * slotPct);
      return {
        left:  `calc(${lPct}%  - ${idx === 0 ? PEEK_PX : CASCADE_PX}px)`,
        right: `calc(${rPct}% + ${gutter}px)`,
        isOverlay: true,
        isUnderlay: false,
      };
    }

    // ── Overlay card layout ───────────────────────────────────────────────────
    // The session floats on top-right of the calendar event it overlaps.
    // OVERLAY_START aligns with the separator line drawn on the underlay (52%).
    // PEEK_PX: how many px the overlay card's left edge intrudes into the primary,
    //          creating the intentional "card-on-card" visual connection.
    const OVERLAY_START = 52; // % — aligns with underlay separator line
    const PEEK_PX       = 6;  // px the overlay peeks into the primary (≥ separator line offset)

    // Build an ordered list of all sessions that (a) overlap this session AND
    // (b) themselves overlap a calendar event — so sibling overlays are split consistently.
    const siblings = visibleSessions
      .filter(sib => {
        if (!sib.ended_at) return false;
        return (
          overlaps(s.started_at, sEnd, sib.started_at, sib.ended_at) &&
          visibleCalEvents.some(e => overlaps(sib.started_at, sib.ended_at, e.start_time, e.end_time))
        );
      })
      .sort((a, b) => a.id - b.id); // stable sort keeps column assignment deterministic

    const myIdx = siblings.findIndex(sib => sib.id === s.id);
    const total = siblings.length;

    if (total <= 1) {
      // Single overlay card — takes the full overlay zone
      return {
        left: `calc(${OVERLAY_START}% - ${PEEK_PX}px)`,
        right: `${gutter}px`,
        isOverlay: true,
        isUnderlay: false,
      };
    }

    // Multiple overlay cards — split the overlay zone among siblings
    const slotPct = (100 - OVERLAY_START) / total;
    const leftPct  = OVERLAY_START + myIdx * slotPct;
    const rightPct = 100 - (OVERLAY_START + (myIdx + 1) * slotPct);
    return {
      left:  `calc(${leftPct}%  - ${myIdx === 0 ? PEEK_PX : 2}px)`,
      right: `calc(${rightPct}% + ${gutter}px)`,
      isOverlay: true,
      isUnderlay: false,
    };
  }, [visibleCalEvents, visibleSessions, compact, sessionColumnLayout, calEventStacking]);

  const g = compact ? 2 : 3;

  // Derive the left-indicator colour for a block given the current laneMode.
  // This keeps the indicator stripe in sync whenever the user switches "Color By".
  const getIndicatorForBlock = useCallback((block) => {
    if (laneMode === 'project' && block.project_color) return block.project_color;
    if (laneMode === 'project' && block.project_name)  return hashColor(block.project_name);
    if (laneMode === 'client'  && block.client_name)   return hashColor(block.client_name);
    return getSessionIndicatorColor(block); // category-based fallback
  }, [laneMode]);

  const handlePointerDown = useCallback((e) => {
    if (!onRangeSelect || !date || e.target !== e.currentTarget) return;
    const container = containerRef.current;
    if (!container) return;

    // Full layout height — 24h worth of pixels. We clamp Y to this, not to the
    // visible viewport height, so users can drag through a scroll-and-drag gesture.
    const FULL_H = 24 * PX_PER_HOUR;

    // Raw Y relative to the container's top (clamped to [0, FULL_H]).
    const getRawY = (clientY) => {
      const r = container.getBoundingClientRect();
      return Math.min(FULL_H, Math.max(0, clientY - r.top));
    };

    // Snap a raw Y to the nearest 15-minute grid line so the live preview
    // aligns with the time grid while dragging — not just on mouseup.
    const snapY = (rawY) => {
      const mins = rawY / PX_PER_HOUR * 60;
      return Math.round(mins / 15) * 15 / 60 * PX_PER_HOUR;
    };

    const startYRaw = getRawY(e.clientY);
    const startY    = snapY(startYRaw);
    const startMinuteBlock = Math.round((startYRaw / PX_PER_HOUR * 60) / 15) * 15;
    const startUnix = Math.floor(new Date(new Date(date).setHours(0, startMinuteBlock, 0, 0)).getTime() / 1000);
    setDragRange({ startY, currentY: startY, startUnix });

    const move = (evt) => {
      // Keep the live preview snapped to the grid for visual alignment.
      setDragRange(prev => prev ? { ...prev, currentY: snapY(getRawY(evt.clientY)) } : prev);
    };
    const up = (evt) => {
      const finalY  = getRawY(evt.clientY);
      const minY    = Math.min(startYRaw, finalY);
      const maxY    = Math.max(startYRaw, finalY);
      const fromMinutes   = Math.round(((minY / PX_PER_HOUR) * 60) / 15) * 15;
      const toMinutesRaw  = Math.round(((maxY / PX_PER_HOUR) * 60) / 15) * 15;
      const toMinutes     = Math.max(fromMinutes + 15, toMinutesRaw);
      const startDate = new Date(date); startDate.setHours(0, fromMinutes, 0, 0);
      const endDate   = new Date(date); endDate.setHours(0, toMinutes,   0, 0);
      setDragRange(null);
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup',   up);
      onRangeSelect(Math.floor(startDate.getTime() / 1000), Math.floor(endDate.getTime() / 1000), date);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup',   up);
  }, [onRangeSelect, date]);

  return (
    <div
      ref={containerRef}
      className="flex-1 min-w-0"
      onMouseDown={handlePointerDown}
      style={{
        // Explicit containment — absolute children (blocks, drag preview) cannot
        // overflow into adjacent day columns or outside the column bounds.
        position: 'relative',
        overflow: 'hidden',
        // isolation: isolate creates a new stacking context so internal z-indices
        // (blocks at 10–22, drag preview at 70) are confined within DayColumn.
        // The DayColumn itself sits at z-index: auto in the parent, meaning the
        // sticky week-day header (z-index: 40) always visually sits on top of it —
        // preventing drag previews from bleeding over the header row.
        isolation: 'isolate',
        cursor: onRangeSelect ? 'crosshair' : 'default',
      }}
    >
      {/* Alternating row tint — even hours get a barely-there fill */}
      {HOURS.filter(h => h % 2 === 0).map(h => (
        <div key={`altrow-${h}`} className="absolute left-0 right-0 pointer-events-none"
          style={{ top: h * PX_PER_HOUR, height: PX_PER_HOUR, background: 'rgba(255,255,255,0.009)', zIndex: 0 }} />
      ))}

      {/* Grid: hour + 30-min lines — explicit zIndex: 1 keeps them strictly below
          event blocks (zIndex 10–22) within the isolation:isolate stacking context */}
      {HOURS.map(h => (
        <React.Fragment key={h}>
          <div className="absolute left-0 right-0 pointer-events-none fl-calendar-grid-line"
            style={{ top: h * PX_PER_HOUR, borderTop: '1px solid rgba(255,255,255,0.07)', zIndex: 1 }} />
          <div className="absolute left-0 right-0 pointer-events-none fl-calendar-grid-line fl-calendar-grid-line-half"
            style={{ top: h * PX_PER_HOUR + PX_PER_HOUR * 0.5, borderTop: '1px solid rgba(255,255,255,0.032)', zIndex: 1 }} />
        </React.Fragment>
      ))}

      {/* Ambient workflow chain halos — only shown for long deep-work chains (≥45 min) */}
      {focusChains.filter(c => c.totalSeconds >= 2700).map((chain, idx) => {
        const { top, height } = blockPos(chain.start, chain.end);
        const color = chain.theme.color;
        return (
          <div
            key={`chain-${idx}`}
            className="pointer-events-none fl-flow-chain"
            style={{
              position: 'absolute',
              top: top,
              left: compact ? 1 : 2,
              right: compact ? 1 : 2,
              height: Math.max(height, 18),
              borderRadius: 14,
              background: `linear-gradient(180deg, ${color}06, transparent)`,
              border: `1px solid ${color}0E`,
              zIndex: 0,
            }}
          />
        );
      })}

      {/* Focus interruption + recovery markers */}
      {interruptionMarkers.map((marker, idx) => {
        const mid = marker.start + Math.floor(marker.gap / 2);
        const { top } = blockPos(mid, mid + 60);
        return (
          <div
            key={`gap-${idx}`}
            className="pointer-events-none fl-interruption-marker"
            style={{
              position: 'absolute',
              top: top - 5,
              right: compact ? 4 : 6,
              width: marker.gap <= 15 * 60 ? 8 : 10,
              height: 8,
              borderRadius: 99,
              background: marker.gap <= 15 * 60 ? '#34D399' : marker.gap <= 25 * 60 ? '#FBBF24' : '#F87171',
              boxShadow: `0 0 0 3px ${marker.gap <= 15 * 60 ? 'rgba(52,211,153,0.10)' : marker.gap <= 25 * 60 ? 'rgba(251,191,36,0.12)' : 'rgba(248,113,113,0.12)'}`,
              zIndex: 2,
            }}
          />
        );
      })}

      {dragRange && (() => {
        // Both startY and currentY are already snapped to the 15-min grid.
        const topY   = Math.min(dragRange.startY, dragRange.currentY);
        const botY   = Math.max(dragRange.startY, dragRange.currentY);
        // Minimum slot height = 1 × 15-minute block (PX_PER_HOUR / 4)
        const SLOT_H = PX_PER_HOUR / 4; // 24px
        const h      = Math.max(SLOT_H, botY - topY);

        // Compute displayed time range from snapped pixel positions
        const fromMins   = Math.round((topY / PX_PER_HOUR * 60) / 15) * 15;
        const rawToMins  = Math.round(((topY + h) / PX_PER_HOUR * 60) / 15) * 15;
        const toMins     = Math.max(fromMins + 15, rawToMins);
        const durMins    = toMins - fromMins;

        const fmtM = (m) => {
          const hh = Math.floor(m / 60) % 24;
          const mm = m % 60;
          const ampm = hh < 12 ? 'am' : 'pm';
          return `${hh === 0 ? 12 : hh > 12 ? hh - 12 : hh}:${String(mm).padStart(2, '0')}${ampm}`;
        };
        const durLabel = durMins >= 60
          ? `${Math.floor(durMins / 60)}h${durMins % 60 ? ` ${durMins % 60}m` : ''}`
          : `${durMins}m`;
        const showLabel = h >= SLOT_H; // always true given our minimum

        return (
          <div
            className="pointer-events-none fl-calendar-draft-block"
            style={{
              position: 'absolute',
              top: topY,
              left: compact ? 2 : 4,
              right: compact ? 2 : 4,
              height: h,
              borderRadius: 10,
              background: 'linear-gradient(160deg, rgba(124,108,242,0.92) 0%, rgba(108,90,220,0.88) 100%)',
              border: '1px solid rgba(196,181,253,0.85)',
              borderLeft: '3px solid #9D8FF5',
              boxShadow: '0 6px 20px rgba(124,108,242,0.38), 0 0 0 1px rgba(124,108,242,0.18)',
              zIndex: 70,
              overflow: 'hidden',
            }}
          >
            {showLabel && (
              <div style={{
                padding: h < 40 ? '3px 7px' : '5px 8px',
                height: '100%',
                display: 'flex',
                alignItems: h < 40 ? 'center' : 'flex-start',
                justifyContent: 'space-between',
                gap: 4,
              }}>
                {/* Start time or compact duration */}
                <span style={{
                  fontSize: h < 40 ? 8.5 : 9.5,
                  fontWeight: 700,
                  color: 'rgba(255,255,255,0.97)',
                  textShadow: '0 1px 3px rgba(0,0,0,0.45)',
                  fontVariantNumeric: 'tabular-nums',
                  letterSpacing: '-0.01em',
                  lineHeight: 1,
                  whiteSpace: 'nowrap',
                }}>
                  {h < 40 ? durLabel : `${fmtM(fromMins)} – ${fmtM(toMins)}`}
                </span>
                {/* Duration badge — only when tall enough */}
                {h >= 40 && (
                  <span style={{
                    fontSize: 8,
                    fontWeight: 600,
                    color: 'rgba(255,255,255,0.78)',
                    background: 'rgba(0,0,0,0.22)',
                    border: '1px solid rgba(255,255,255,0.18)',
                    padding: '1px 5px',
                    borderRadius: 4,
                    fontVariantNumeric: 'tabular-nums',
                    letterSpacing: '-0.01em',
                    flexShrink: 0,
                    lineHeight: 1.4,
                  }}>
                    {durLabel}
                  </span>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* Layer 1: Calendar events (primary) */}
      {visibleCalEvents.map(ev => {
        const { top, height } = blockPos(ev.start_time, ev.end_time);
        const pos      = getCalPos(ev);
        // In Project/Client mode use the block color so the indicator matches.
        // In Category mode keep the calendar event's own color.
        const color    = blockColor({ ...ev, _type: 'calendar' }, laneMode);
        const TypeIcon = getBlockTypeIcon({ ...ev, _type: 'calendar' });
        return (
          <RizeBlock key={`cal-${ev.id}`}
            block={{ ...ev, _type: 'calendar' }}
            title={ev.title}
            timeStr={`${fmtTime(ev.start_time)} – ${fmtTime(ev.end_time)}`}
            duration={fmtDur(ev.end_time - ev.start_time)}
            color={color} top={top} height={height}
            left={pos.left} right={pos.right}
            isCalendar isCompact={compact}
            isUnderlay={pos.hasSessionOverlay}
            indicatorOverride={getIndicatorForBlock({ ...ev, _type: 'calendar' })}
            typeIcon={TypeIcon}
            onClick={e => { e.stopPropagation(); onSelect({ ...ev, _type: 'calendar' }); }}
            onMouseEnter={e => { const r = e.currentTarget.getBoundingClientRect(); onHover({ ...ev, _type: 'calendar' }, { top: r.top, bottom: r.bottom, left: r.left, right: r.right, clientY: e.clientY }); }}
            onMouseLeave={() => onHover(null)}
            onContextMenu={onContextMenu ? (e => { e.preventDefault(); e.stopPropagation(); onContextMenu({ ...ev, _type: 'calendar' }, { x: e.clientX, y: e.clientY }); }) : undefined}
          />
        );
      })}

      {/* Layer 2: Manual sessions (primary cards full-width; overlapping ones stack as elevated cards) */}
      {visibleSessions.map(s => {
        // Compute the authoritative end time the same way isRenderableSessionBlock does —
        // this prevents blockPos from falling back to new Date() for sessions without ended_at.
        const sessEnd = (Number.isFinite(s.ended_at) && s.ended_at > s.started_at)
          ? s.ended_at
          : (s.duration_seconds > 0 ? s.started_at + s.duration_seconds : null);
        const { top, height } = blockPos(s.started_at, sessEnd);
        const pos      = getSessPos(s);
        const color    = blockColor({ ...s, _type: 'session' }, laneMode);
        const TypeIcon = getBlockTypeIcon({ ...s, _type: 'session' });
        const selected = selectedBlockId === s.id;
        const info     = sessionColumnLayout[s.id];
        const stackCount  = (pos.isUnderlay && info) ? (info.total - 1) : 0;
        const aiData      = aiTitleMap[s.id];
        const displayTitle = aiData?.title || s.title || s.category;
        const isAITitle   = !!(aiData?.titleWasGenerated && !s.title);
        return (
          <RizeBlock key={`sess-${s.id}`}
            block={{ ...s, _type: 'session', _aiGenerated: isAITitle }}
            title={displayTitle}
            timeStr={`${fmtTime(s.started_at)}${s.ended_at ? ` – ${fmtTime(s.ended_at)}` : ''}`}
            duration={fmtDur(s.duration_seconds)}
            color={color} top={top} height={height}
            left={pos.left} right={pos.right}
            isCompact={compact} typeIcon={TypeIcon}
            isOverlay={pos.isOverlay}
            isUnderlay={pos.isUnderlay}
            stackCount={stackCount}
            indicatorOverride={getIndicatorForBlock({ ...s, _type: 'session' })}
            onClick={e => { e.stopPropagation(); onSelect({ ...s, _type: 'session', _aiTitle: aiData?.title, _aiDescription: aiData?.description }); }}
            onMouseEnter={e => { const r = e.currentTarget.getBoundingClientRect(); onHover({ ...s, _type: 'session', _aiTitle: aiData?.title }, { top: r.top, bottom: r.bottom, left: r.left, right: r.right, clientY: e.clientY }); }}
            onMouseLeave={() => onHover(null)}
            onContextMenu={onContextMenu ? (e => { e.preventDefault(); e.stopPropagation(); onContextMenu({ ...s, _type: 'session' }, { x: e.clientX, y: e.clientY }); }) : undefined}
            zIndex={selected ? 42 : undefined}
          />
        );
      })}

      {/* Layer 3: Active session (floats as overlay card if a calendar event is underneath) */}
      {isToday && activeSession && isRenderableSessionBlock({
        ...activeSession,
        ended_at: activeSession.ended_at || Math.floor(Date.now() / 1000),
      }) && (() => {
        const nowTs = Math.floor(Date.now() / 1000);
        const { top, height } = blockPos(activeSession.started_at, nowTs);
        const color    = blockColor({ ...activeSession, _type: 'session' }, laneMode);
        const TypeIcon = getBlockTypeIcon({ ...activeSession, _type: 'session' });
        const hasCalOverlap = visibleCalEvents.some(e => overlaps(activeSession.started_at, nowTs, e.start_time, e.end_time));
        const OVERLAY_START = 52;
        const PEEK_PX       = 6;
        const gutter        = compact ? 2 : 3;
        const left  = hasCalOverlap ? `calc(${OVERLAY_START}% - ${PEEK_PX}px)` : (compact ? 3 : 5);
        const right = hasCalOverlap ? `${gutter}px` : (compact ? 2 : 3);
        return (
          <RizeBlock
            block={{ ...activeSession, _type: 'session' }}
            title={activeSession.title || activeSession.category}
            timeStr={`${fmtTime(activeSession.started_at)} – now`}
            duration={fmtDur(nowTs - activeSession.started_at)}
            color={color} top={top} height={Math.max(height, 32)}
            left={left} right={right}
            isActive isCompact={compact} zIndex={30}
            isOverlay={hasCalOverlap}
            indicatorOverride={getIndicatorForBlock({ ...activeSession, _type: 'session' })}
            typeIcon={TypeIcon}
            onClick={() => {}} onMouseEnter={() => {}} onMouseLeave={() => {}}
          />
        );
      })()}

      {/* Now-line is rendered at the parent timeline level for full-width coverage */}
    </div>
  );
}

// ─── Focus Block Picker ────────────────────────────────────────────────────────
const FOCUS_DURATIONS = [
  { label: '25 min', mins: 25, desc: 'Pomodoro' },
  { label: '52 min', mins: 52, desc: 'Ultradian' },
  { label: '90 min', mins: 90, desc: 'Deep Work' },
  { label: '2 h',    mins: 120,desc: 'Flow State' },
];

function unixToModalTime(unix) {
  const d = new Date(unix * 1000);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function dayUnixWithTime(date, timeStr) {
  const d = new Date(date);
  const [h, m] = String(timeStr || '00:00').split(':').map(Number);
  d.setHours(h || 0, m || 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

function FocusBlockPicker({ startUnix, date, categories, onConfirm, onClose }) {
  const [duration, setDuration] = useState(52);
  const [label,    setLabel]    = useState('');
  const [catId,    setCatId]    = useState('');
  const [saving,   setSaving]   = useState(false);

  const startTime = new Date(startUnix * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const endUnix   = startUnix + duration * 60;
  const endTime   = new Date(endUnix * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const save = async () => {
    setSaving(true);
    try { await onConfirm({ startUnix, endUnix, label, catId, duration }); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[9990] flex items-center justify-center fl-calendar-overlay" onClick={onClose}>
      <div className="fl-calendar-overlay-backdrop" style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }} />
      <div
        className="fl-calendar-focus-picker fl-calendar-schedule-modal"
        onClick={e => e.stopPropagation()}
        style={{
          position: 'relative', zIndex: 1,
          background: 'rgba(11,13,20,0.97)',
          border: '1px solid rgba(255,255,255,0.09)',
          borderRadius: 20,
          padding: '20px',
          width: 328,
          boxShadow: '0 32px 80px rgba(0,0,0,0.75), 0 0 0 1px rgba(124,108,242,0.14)',
          backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
          animation: 'focus-picker-in 0.25s cubic-bezier(0.34,1.56,0.64,1)',
        }}
      >
        <style>{`
          @keyframes focus-picker-in {
            from { opacity:0; transform:scale(0.95) translateY(-8px); }
            to   { opacity:1; transform:scale(1) translateY(0); }
          }
        `}</style>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 30, height: 30, borderRadius: 10,
              background: 'rgba(124,108,242,0.15)', border: '1px solid rgba(124,108,242,0.35)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Zap size={14} color="#7c6cf2" />
            </div>
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: 'white', lineHeight: 1 }}>Schedule Focus Block</p>
              <p style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>{startTime} → {endTime}</p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280', padding: 4 }}>
            <X size={14} />
          </button>
        </div>

        {/* Duration pills */}
        <div style={{ marginBottom: 14 }}>
          <p style={{ fontSize: 10, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Duration</p>
          <div style={{ display: 'flex', gap: 6 }}>
            {FOCUS_DURATIONS.map(d => (
              <button key={d.mins} onClick={() => setDuration(d.mins)} style={{
                flex: 1, padding: '7px 4px',
                background: duration === d.mins ? 'rgba(124,108,242,0.15)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${duration === d.mins ? 'rgba(124,108,242,0.44)' : 'rgba(255,255,255,0.07)'}`,
                borderRadius: 10, cursor: 'pointer', transition: 'all 0.15s',
              }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: duration === d.mins ? '#a78bfa' : '#9CA3AF', marginBottom: 2 }}>{d.label}</p>
                <p style={{ fontSize: 9, color: '#6B7280' }}>{d.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Label */}
        <div style={{ marginBottom: 14 }}>
          <p style={{ fontSize: 10, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Label (optional)</p>
          <input
            value={label}
            onChange={e => setLabel(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && save()}
            placeholder="e.g. Write proposal, Review PR…"
            style={{
              width: '100%', background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8, padding: '8px 12px',
              color: 'white', fontSize: 13, outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Category */}
        {categories.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 10, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Category (optional)</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {categories.map(c => (
                <button key={c.id} onClick={() => setCatId(catId === c.id ? '' : c.id)} style={{
                  padding: '4px 10px',
                  background: catId === c.id ? c.color + '20' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${catId === c.id ? c.color + '50' : 'rgba(255,255,255,0.07)'}`,
                  borderRadius: 9999, cursor: 'pointer',
                  fontSize: 11, color: catId === c.id ? 'white' : '#6B7280',
                  display: 'flex', alignItems: 'center', gap: 5,
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.color, display: 'inline-block' }}/>
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Confirm */}
        <button onClick={save} disabled={saving} style={{
          width: '100%',
          background: 'linear-gradient(135deg, #7c6cf2, #a78bfa)',
          border: 'none', borderRadius: 11,
          padding: '11px', cursor: saving ? 'not-allowed' : 'pointer',
          color: 'white', fontSize: 13, fontWeight: 700,
          boxShadow: '0 0 20px rgba(124,108,242,0.44), inset 0 1px 0 rgba(255,255,255,0.15)',
          opacity: saving ? 0.7 : 1,
          transition: 'all 0.15s',
          letterSpacing: '-0.01em',
        }}>
          {saving ? 'Saving…' : `Add Focus Block · ${Math.floor(duration/60) > 0 ? Math.floor(duration/60)+'h ' : ''}${duration%60 > 0 ? (duration%60)+'m' : ''}`}
        </button>
      </div>
    </div>
  );
}

// ─── Custom themed select (used inside ScheduleSessionModal) ─────────────────
function CustomSelect({ value, onChange, options, placeholder = '— None —' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selected = options.find(o => o.value === value);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* Trigger */}
      <button
        className={`fl-csel-trigger${open ? ' fl-csel-trigger--open' : ''}`}
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          borderRadius: 9, padding: '9px 12px', cursor: 'pointer',
          boxSizing: 'border-box', outline: 'none', transition: 'border-color 0.12s ease',
        }}
      >
        {selected?.dot && (
          <span className="fl-csel-dot" style={{ background: selected.dot }} />
        )}
        <span className={`fl-csel-value${!selected ? ' fl-csel-placeholder' : ''}`}
          style={{ flex: 1, textAlign: 'left', fontSize: 13, fontWeight: selected ? 500 : 400,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected ? selected.label : placeholder}
        </span>
        {selected?.sublabel && (
          <span className="fl-csel-sublabel" style={{ fontSize: 10, fontWeight: 600, flexShrink: 0,
            color: selected.dot || undefined }}>
            {selected.sublabel}
          </span>
        )}
        <ChevronDown size={12} className="fl-csel-chevron" style={{ flexShrink: 0,
          transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }} />
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="fl-csel-panel" style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 100,
          borderRadius: 11, maxHeight: 220, overflowY: 'auto', overflowX: 'hidden',
        }}>
          {/* "None" option */}
          <button
            className={`fl-csel-item fl-csel-none${!value ? ' fl-csel-item--active' : ''}`}
            onClick={() => { onChange(''); setOpen(false); }}
            style={{ width: '100%', display: 'flex', alignItems: 'center', padding: '9px 12px',
              border: 'none', cursor: 'pointer', fontSize: 12, textAlign: 'left' }}
          >
            {placeholder}
          </button>

          {options.map(o => (
            <button
              key={o.value}
              className={`fl-csel-item${o.value === value ? ' fl-csel-item--active' : ''}`}
              onClick={() => { onChange(o.value); setOpen(false); }}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                padding: '9px 12px', border: 'none', cursor: 'pointer', textAlign: 'left' }}
            >
              {o.dot && (
                <span className="fl-csel-dot" style={{ background: o.dot, flexShrink: 0 }} />
              )}
              <span className="fl-csel-item-label" style={{ flex: 1, fontSize: 12,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                color: o.value === value ? (o.dot || undefined) : undefined }}>
                {o.label}
              </span>
              {o.sublabel && (
                <span className="fl-csel-item-sub" style={{
                  fontSize: 10, fontWeight: 600, flexShrink: 0,
                  borderRadius: 5, padding: '1px 6px',
                  color: o.dot || undefined,
                  background: o.dot ? `${o.dot}15` : undefined,
                  border: o.dot ? `1px solid ${o.dot}28` : undefined,
                }}>
                  {o.sublabel}
                </span>
              )}
              {o.value === value && (
                <CheckCircle2 size={12} style={{ color: o.dot || '#7c6cf2', flexShrink: 0 }} />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Hierarchical task picker (parent tasks → subtasks tree) ──────────────────
function HierarchicalTaskSelect({ tasks, projects, value, onChange, isLight = false }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // Split into parents and a parentId → subtasks map
  const parentTasks = useMemo(() => tasks.filter(t => !t.parent_task_id), [tasks]);
  const subtaskMap  = useMemo(() => {
    const m = {};
    tasks.forEach(t => {
      if (t.parent_task_id) {
        if (!m[t.parent_task_id]) m[t.parent_task_id] = [];
        m[t.parent_task_id].push(t);
      }
    });
    return m;
  }, [tasks]);
  // Subtasks whose parent was filtered out — show at top level as fallback
  const orphans = useMemo(
    () => tasks.filter(t => t.parent_task_id && !tasks.find(p => p.id === t.parent_task_id)),
    [tasks]
  );

  const getProj = t => projects.find(p => p.id === t.project_id);
  const selected = tasks.find(t => t.id === value) || null;

  // Trigger label: "Parent › Subtask" for subtasks, plain title for parents
  const triggerLabel = selected ? (() => {
    if (selected.parent_task_id) {
      const par = tasks.find(p => p.id === selected.parent_task_id);
      return par ? `${par.title} › ${selected.title}` : selected.title;
    }
    return selected.title;
  })() : null;

  const pick = id => { onChange(id); setOpen(false); };

  // Theme tokens
  const M = isLight ? {
    trigBg:        '#FFFFFF',
    trigBdr:       '#D7DFEB',
    trigBdrOpen:   'rgba(124,108,242,0.45)',
    trigShadowOpen:'0 0 0 3px rgba(124,108,242,0.09)',
    trigVal:       '#1E1B2E',
    trigPlh:       '#9CA3AF',
    chevron:       '#9CA3AF',
    panelBg:       '#FFFFFF',
    panelBdr:      '#DDE4EE',
    panelShadow:   '0 8px 28px rgba(15,23,42,0.14), 0 2px 6px rgba(15,23,42,0.06)',
    noneBdr:       'rgba(15,23,42,0.07)',
    noneC:         '#9CA3AF',
    noneActiveBg:  'rgba(124,108,242,0.07)',
    noneActiveC:   '#4F46E5',
    parentC:       '#1E293B',
    parentActC:    '#4F46E5',
    parentHovBg:   'rgba(15,23,42,0.03)',
    metaC:         '#94A3B8',
    subC:          '#475569',
    subActC:       '#4F46E5',
    subHovBg:      'rgba(15,23,42,0.035)',
    activeBg:      'rgba(124,108,242,0.08)',
    connectorC:    '#CBD5E1',
    divider:       'rgba(15,23,42,0.06)',
    emptyC:        '#94A3B8',
    defaultDot:    '#CBD5E1',
  } : {
    trigBg:        '#1A1D24',
    trigBdr:       '#2D3242',
    trigBdrOpen:   'rgba(124,108,242,0.54)',
    trigShadowOpen:'0 0 0 3px rgba(124,108,242,0.09)',
    trigVal:       '#E2E4EF',
    trigPlh:       '#5A6480',
    chevron:       '#5A6480',
    panelBg:       '#1A1E2E',
    panelBdr:      '#252D42',
    panelShadow:   '0 8px 28px rgba(0,0,0,0.45)',
    noneBdr:       'rgba(255,255,255,0.07)',
    noneC:         '#5A6480',
    noneActiveBg:  'rgba(124,108,242,0.14)',
    noneActiveC:   '#A5B4FC',
    parentC:       '#C4C8E0',
    parentActC:    '#A5B4FC',
    parentHovBg:   'rgba(255,255,255,0.04)',
    metaC:         '#5A6A88',
    subC:          '#8A96B0',
    subActC:       '#A5B4FC',
    subHovBg:      'rgba(255,255,255,0.03)',
    activeBg:      'rgba(124,108,242,0.14)',
    connectorC:    '#2D3648',
    divider:       'rgba(255,255,255,0.05)',
    emptyC:        '#5A6480',
    defaultDot:    '#3D4A62',
  };

  const projDot = (t, size = 7) => {
    const proj = getProj(t);
    return (
      <span style={{
        width: size, height: size, borderRadius: '50%', flexShrink: 0,
        background: proj?.color || M.defaultDot,
      }} />
    );
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* ── Trigger ── */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          borderRadius: 9, padding: '9px 12px', cursor: 'pointer',
          boxSizing: 'border-box', outline: 'none', transition: 'border-color 0.12s, box-shadow 0.12s',
          background: M.trigBg,
          border: `1px solid ${open ? M.trigBdrOpen : M.trigBdr}`,
          boxShadow: open ? M.trigShadowOpen : 'inset 0 1px 2px rgba(15,23,42,0.03)',
        }}
      >
        {selected && projDot(selected)}
        <span style={{
          flex: 1, textAlign: 'left', fontSize: 13,
          fontWeight: selected ? 500 : 400,
          color: selected ? M.trigVal : M.trigPlh,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {triggerLabel || '— No task linked —'}
        </span>
        <ChevronDown size={12} style={{
          flexShrink: 0, color: M.chevron,
          transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s',
        }} />
      </button>

      {/* ── Dropdown panel ── */}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 200,
          background: M.panelBg, border: `1px solid ${M.panelBdr}`,
          borderRadius: 11, boxShadow: M.panelShadow,
          maxHeight: 280, overflowY: 'auto', overflowX: 'hidden',
        }}>
          {/* None / clear */}
          <button
            onClick={() => pick('')}
            style={{
              width: '100%', display: 'flex', alignItems: 'center',
              padding: '9px 13px', border: 'none', cursor: 'pointer', textAlign: 'left',
              borderBottom: `1px solid ${M.noneBdr}`,
              background: !value ? M.noneActiveBg : 'transparent',
              color: !value ? M.noneActiveC : M.noneC,
              fontSize: 12, transition: 'background 0.1s',
            }}
            onMouseOver={e => { if (value) e.currentTarget.style.background = M.subHovBg; }}
            onMouseOut={e  => { if (value) e.currentTarget.style.background = 'transparent'; }}
          >
            — No task linked —
          </button>

          {/* Parent tasks + nested subtasks */}
          {parentTasks.map((parent, pIdx) => {
            const subs       = subtaskMap[parent.id] || [];
            const isParSel   = value === parent.id;
            const hasSubSel  = subs.some(s => s.id === value);
            const showDivider = pIdx < parentTasks.length - 1 || orphans.length > 0;

            return (
              <div key={parent.id}>
                {/* Parent row */}
                <button
                  onClick={() => pick(parent.id)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                    padding: '9px 13px', border: 'none', cursor: 'pointer', textAlign: 'left',
                    background: isParSel ? M.activeBg : 'transparent',
                    transition: 'background 0.1s',
                  }}
                  onMouseOver={e => { if (!isParSel) e.currentTarget.style.background = M.parentHovBg; }}
                  onMouseOut={e  => { if (!isParSel) e.currentTarget.style.background = 'transparent'; }}
                >
                  {projDot(parent)}
                  <span style={{
                    flex: 1, fontSize: 12.5, fontWeight: 600,
                    color: isParSel ? M.parentActC : M.parentC,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {parent.title}
                  </span>
                  {subs.length > 0 && !isParSel && (
                    <span style={{ fontSize: 9, fontWeight: 700, color: M.metaC, flexShrink: 0 }}>
                      {subs.length}
                    </span>
                  )}
                  {isParSel && <CheckCircle2 size={11} style={{ color: '#7c6cf2', flexShrink: 0 }} />}
                </button>

                {/* Subtask rows */}
                {subs.map((sub, sIdx) => {
                  const isLast  = sIdx === subs.length - 1;
                  const isSel   = value === sub.id;
                  const connector = isLast ? '└─' : '├─';
                  return (
                    <button
                      key={sub.id}
                      onClick={() => pick(sub.id)}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 6,
                        padding: '6px 13px 6px 26px', border: 'none', cursor: 'pointer', textAlign: 'left',
                        background: isSel ? M.activeBg : 'transparent',
                        transition: 'background 0.1s',
                      }}
                      onMouseOver={e => { if (!isSel) e.currentTarget.style.background = M.subHovBg; }}
                      onMouseOut={e  => { if (!isSel) e.currentTarget.style.background = 'transparent'; }}
                    >
                      <span style={{
                        fontSize: 10, color: M.connectorC, flexShrink: 0,
                        lineHeight: 1, fontFamily: 'monospace', letterSpacing: '-0.02em',
                        userSelect: 'none',
                      }}>
                        {connector}
                      </span>
                      <span style={{
                        flex: 1, fontSize: 11.5,
                        fontWeight: isSel ? 600 : 400,
                        color: isSel ? M.subActC : M.subC,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {sub.title}
                      </span>
                      {isSel && <CheckCircle2 size={10} style={{ color: '#7c6cf2', flexShrink: 0 }} />}
                    </button>
                  );
                })}

                {/* Thin divider between parent groups */}
                {showDivider && (
                  <div style={{ height: 1, background: M.divider, margin: '2px 0' }} />
                )}
              </div>
            );
          })}

          {/* Orphaned subtasks (parent filtered out) */}
          {orphans.map(sub => {
            const isSel = value === sub.id;
            return (
              <button
                key={sub.id}
                onClick={() => pick(sub.id)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                  padding: '9px 13px', border: 'none', cursor: 'pointer', textAlign: 'left',
                  background: isSel ? M.activeBg : 'transparent',
                  transition: 'background 0.1s',
                }}
                onMouseOver={e => { if (!isSel) e.currentTarget.style.background = M.parentHovBg; }}
                onMouseOut={e  => { if (!isSel) e.currentTarget.style.background = 'transparent'; }}
              >
                {projDot(sub)}
                <span style={{
                  flex: 1, fontSize: 12.5, color: isSel ? M.subActC : M.subC,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {sub.title}
                </span>
                {isSel && <CheckCircle2 size={11} style={{ color: '#7c6cf2', flexShrink: 0 }} />}
              </button>
            );
          })}

          {tasks.length === 0 && (
            <div style={{ padding: '16px 13px', textAlign: 'center', fontSize: 11.5, color: M.emptyC }}>
              No tasks found
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ScheduleSessionModal({ draft, projects, clients, tasks, onConfirm, onClose }) {
  const isLight = useThemeLight();
  const [fromTime, setFromTime] = useState(unixToModalTime(draft.startUnix));
  const [toTime, setToTime] = useState(unixToModalTime(draft.endUnix));
  const [projectId, setProjectId] = useState('');
  const [clientId, setClientId] = useState('');
  const [taskId, setTaskId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [billable, setBillable] = useState('billable');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const filteredTasks = useMemo(() => {
    return tasks.filter(t => {
      if (projectId && t.project_id !== projectId) return false;
      if (clientId && t.client_id !== clientId) return false;
      return true;
    });
  }, [tasks, projectId, clientId]);

  const selectedProject = projects.find(p => p.id === projectId);
  const selectedTask = tasks.find(t => t.id === taskId);

  useEffect(() => {
    if (selectedProject?.client_id && !clientId) setClientId(selectedProject.client_id);
  }, [selectedProject, clientId]);

  useEffect(() => {
    if (!filteredTasks.find(t => t.id === taskId)) setTaskId('');
  }, [filteredTasks, taskId]);

  useEffect(() => {
    setFromTime(unixToModalTime(draft.startUnix));
    setToTime(unixToModalTime(draft.endUnix));
    setProjectId('');
    setClientId('');
    setTaskId('');
    setTitle('');
    setDescription('');
    setBillable('billable');
    setError('');
  }, [draft]);

  const save = async () => {
    const startUnix = dayUnixWithTime(draft.date, fromTime);
    const endUnix = dayUnixWithTime(draft.date, toTime);
    if (endUnix <= startUnix) {
      setError('To time must be after from time.');
      return;
    }
    setError('');
    setSaving(true);
    try {
      await onConfirm({
        startUnix,
        endUnix,
        title: title.trim() || selectedTask?.title || 'Scheduled Work',
        description: description.trim(),
        taskId: taskId || null,
        projectId: projectId || null,
        clientId: clientId || selectedProject?.client_id || null,
        billable,
      });
    } catch (err) {
      console.error('[ScheduleModal] save failed:', err);
      setError('Failed to schedule — please try again.');
    } finally {
      setSaving(false);
    }
  };

  // Build option arrays for custom selects
  const projectOptions = projects.map(p => ({ value: p.id, label: p.name, dot: p.color || '#818CF8' }));
  const clientOptions  = clients.map(c => ({ value: c.id, label: c.name }));

  // Theme tokens for inline styles the CSS can't reach
  const M = isLight ? {
    overlay:       'rgba(15,23,42,0.38)',
    title:         '#0F172A',
    dateText:      '#64748B',
    closeBg:       'rgba(15,23,42,0.05)',
    closeBdr:      'rgba(15,23,42,0.12)',
    closeC:        '#64748B',
    closeHovBg:    'rgba(15,23,42,0.10)',
    closeHovC:     '#1E293B',
    arrow:         '#94A3B8',
    label:         '#64748B',
    inputBdrBlur:  '#D7DFEB',
    divider:       'rgba(15,23,42,0.07)',
    hintText:      '#94A3B8',
    linkText:      '#64748B',
    nonBillHint:   '#94A3B8',
  } : {
    overlay:       'rgba(0,0,0,0.55)',
    title:         '#EEF0FC',
    dateText:      '#6B7A9A',
    closeBg:       'rgba(255,255,255,0.05)',
    closeBdr:      'rgba(255,255,255,0.09)',
    closeC:        '#7A8BA8',
    closeHovBg:    'rgba(255,255,255,0.09)',
    closeHovC:     '#C0CCDE',
    arrow:         '#4A5A78',
    label:         '#8090A8',
    inputBdrBlur:  '#2D3242',
    divider:       'rgba(255,255,255,0.06)',
    hintText:      '#5A6A88',
    linkText:      '#6B7A9A',
    nonBillHint:   '#5A6A88',
  };

  // Shared field label style
  const fLabel = { fontSize: 10, fontWeight: 700, color: M.label, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 7 };
  // Shared text input style — CSS overrides bg/border/color in light mode via .fl-calendar-schedule-modal
  const fInput = {
    width: '100%',
    background: '#1A1D24', border: '1px solid #2D3242',
    borderRadius: 9, padding: '10px 12px', color: '#E2E4EF',
    fontSize: 13, outline: 'none', boxSizing: 'border-box',
    colorScheme: isLight ? 'light' : 'dark',
    transition: 'border-color 0.12s ease',
  };

  return (
    <div className="fixed inset-0 z-[9990] flex items-center justify-center fl-calendar-overlay" onClick={onClose}>
      <div className="fl-calendar-overlay-backdrop" style={{ position: 'absolute', inset: 0, background: M.overlay, backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }} />
      <div
        className="fl-calendar-focus-picker fl-calendar-schedule-modal"
        onClick={e => e.stopPropagation()}
        style={{
          position: 'relative', zIndex: 1, width: 440,
          background: 'linear-gradient(160deg, #131824 0%, #0D1020 100%)',
          border: '1px solid rgba(255,255,255,0.09)',
          borderRadius: 22, padding: '22px 22px 20px',
          boxShadow: '0 0 0 1px rgba(255,255,255,0.03), 0 40px 100px rgba(0,0,0,0.8)',
          maxHeight: '90vh', overflowY: 'auto',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <div style={{
                width: 28, height: 28, borderRadius: 8,
                background: 'rgba(124,108,242,0.15)', border: '1px solid rgba(124,108,242,0.28)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Clock size={13} style={{ color: '#9b8ff8' }} />
              </div>
              <p style={{ fontSize: 15, fontWeight: 700, color: M.title, lineHeight: 1, margin: 0 }}>Schedule Work Block</p>
            </div>
            <p style={{ fontSize: 11, color: M.dateText, margin: '2px 0 0 36px' }}>
              {draft.date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ background: M.closeBg, border: `1px solid ${M.closeBdr}`, borderRadius: 8, cursor: 'pointer', color: M.closeC, padding: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.12s ease' }}
            onMouseOver={e => { e.currentTarget.style.background = M.closeHovBg; e.currentTarget.style.color = M.closeHovC; }}
            onMouseOut={e  => { e.currentTarget.style.background = M.closeBg;    e.currentTarget.style.color = M.closeC; }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Time row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 10, alignItems: 'end', marginBottom: 16 }}>
          <div>
            <p style={fLabel}>From</p>
            <input type="time" value={fromTime} onChange={e => setFromTime(e.target.value)}
              style={{ ...fInput, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}
              onFocus={e => e.target.style.borderColor = 'rgba(124,108,242,0.54)'}
              onBlur={e  => e.target.style.borderColor = M.inputBdrBlur}
            />
          </div>
          <span style={{ color: M.arrow, fontSize: 18, paddingBottom: 10, textAlign: 'center' }}>→</span>
          <div>
            <p style={fLabel}>To</p>
            <input type="time" value={toTime} onChange={e => setToTime(e.target.value)}
              style={{ ...fInput, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}
              onFocus={e => e.target.style.borderColor = 'rgba(124,108,242,0.54)'}
              onBlur={e  => e.target.style.borderColor = M.inputBdrBlur}
            />
          </div>
        </div>

        {/* Title */}
        <div style={{ marginBottom: 14 }}>
          <p style={fLabel}>Title</p>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder={selectedTask ? selectedTask.title : 'What are you planning to work on?'}
            style={fInput}
            onFocus={e => e.target.style.borderColor = 'rgba(124,108,242,0.54)'}
            onBlur={e  => e.target.style.borderColor = M.inputBdrBlur}
          />
        </div>

        {/* Description */}
        <div style={{ marginBottom: 14 }}>
          <p style={fLabel}>Description</p>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="What should this block cover?"
            style={{ ...fInput, minHeight: 68, resize: 'vertical', lineHeight: 1.55 }}
            onFocus={e => e.target.style.borderColor = 'rgba(124,108,242,0.54)'}
            onBlur={e  => e.target.style.borderColor = M.inputBdrBlur}
          />
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: M.divider, margin: '4px 0 14px' }} />

        {/* Project + Client row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
          <div>
            <p style={fLabel}>Project</p>
            <CustomSelect
              value={projectId}
              onChange={setProjectId}
              options={projectOptions}
              placeholder="— No project —"
            />
          </div>
          <div>
            <p style={fLabel}>Client</p>
            <CustomSelect
              value={clientId}
              onChange={setClientId}
              options={clientOptions}
              placeholder="— No client —"
            />
          </div>
        </div>

        {/* Task Link */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
            <p style={{ ...fLabel, marginBottom: 0 }}>Task Link</p>
            {filteredTasks.length === 0 && tasks.length > 0 && (
              <span style={{ fontSize: 9.5, color: M.hintText, fontStyle: 'italic' }}>
                No tasks for selected project
              </span>
            )}
            {filteredTasks.length > 0 && (
              <span style={{ fontSize: 9.5, color: M.hintText }}>
                {filteredTasks.length} task{filteredTasks.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <HierarchicalTaskSelect
            tasks={filteredTasks}
            projects={projects}
            value={taskId}
            onChange={setTaskId}
            isLight={isLight}
          />
          {selectedTask && (
            <p style={{ fontSize: 10, color: M.linkText, marginTop: 5, display: 'flex', alignItems: 'center', gap: 4 }}>
              <CheckCircle2 size={9} style={{ color: '#7c6cf2' }} />
              Session will be linked to this task
            </p>
          )}
        </div>

        {/* Billing */}
        <div style={{ marginBottom: 16 }}>
          <p style={fLabel}>Billing</p>
          <div style={{ display: 'flex', gap: 6 }}>
            {[
              { id: 'billable', label: 'Billable' },
              { id: 'non-billable', label: 'Non-Billable' },
            ].map(opt => (
              <button
                key={opt.id}
                className={`fl-sched-billing-btn${billable === opt.id ? ' fl-sched-billing-btn--active' : ''}`}
                onClick={() => setBillable(opt.id)}
                style={{
                  flex: 1, padding: '8px 10px',
                  background: billable === opt.id ? 'rgba(124,108,242,0.15)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${billable === opt.id ? 'rgba(124,108,242,0.38)' : 'rgba(255,255,255,0.08)'}`,
                  borderRadius: 10, color: billable === opt.id ? '#C4B5FD' : '#6B7A9A',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  transition: 'all 0.12s ease',
                }}
                onMouseOver={e => { if (billable !== opt.id) { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = '#A0AEC0'; }}}
                onMouseOut={e  => { if (billable !== opt.id) { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.color = '#6B7A9A'; }}}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {billable === 'non-billable' && (
            <p style={{ fontSize: 10, color: M.nonBillHint, marginTop: 6, lineHeight: 1.5 }}>
              Saved with a non-billable marker — excluded from profitability reports.
            </p>
          )}
        </div>

        {error && (
          <p style={{ fontSize: 11, color: '#F87171', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
            <AlertCircle size={10} />{error}
          </p>
        )}

        <button onClick={save} disabled={saving} style={{
          width: '100%',
          background: saving ? 'rgba(124,108,242,0.44)' : 'linear-gradient(135deg, #7c6cf2, #a78bfa)',
          border: 'none', borderRadius: 12, padding: '12px',
          cursor: saving ? 'not-allowed' : 'pointer',
          color: 'white', fontSize: 13, fontWeight: 700,
          opacity: saving ? 0.7 : 1,
          boxShadow: saving ? 'none' : '0 4px 20px rgba(124,108,242,0.35)',
          transition: 'all 0.15s ease', letterSpacing: '-0.01em',
        }}>
          {saving ? 'Scheduling…' : 'Schedule on Timeline'}
        </button>
      </div>
    </div>
  );
}

// ─── MAIN CALENDAR VIEW ───────────────────────────────────────────────────────
export default function CalendarView({ user, categories, activeSession, setActiveSession, refreshActive, onNavigate }) {
  const isLight = useThemeLight();
  const prefs = usePrefs();
  // weekStartDay: 1 = Monday (default), 0 = Sunday (opt-in via prefs)
  // App standard is Monday → Sunday; Sunday-start is the exception.
  const weekStartDay = prefs.weekStart === 'sun' ? 0 : 1;

  // Initialize viewMode from user preference (read once on mount)
  const [viewMode, setViewMode] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('fl_prefs') || '{}');
      const map = { day: 'Day', week: 'Week', month: 'Month' };
      return map[stored.calDefaultView] || 'Week';
    } catch { return 'Week'; }
  });
  const [mainTab,         setMainTab]         = useState('entries');
  const [laneMode,        setLaneMode]        = useState('category');
  const [selectedDate,    setSelectedDate]    = useState(new Date());
  const [sessions,        setSessions]        = useState([]);
  const [calEvents,       setCalEvents]       = useState([]);
  const [autoSessions,    setAutoSessions]    = useState([]);
  const [sources,         setSources]         = useState([]);
  const [projects,        setProjects]        = useState([]);
  const [tasks,           setTasks]           = useState([]);
  const [clients,         setClients]         = useState([]);
  const [hoveredBlock,    setHoveredBlock]    = useState(null);
  const [hoverRect,       setHoverRect]       = useState(null);
  const [selectedBlock,   setSelectedBlock]   = useState(null);
  const [popupApps,       setPopupApps]       = useState([]);
  const [popupTags,       setPopupTags]       = useState([]);
  const [showConnect,     setShowConnect]     = useState(false);
  const [syncing,         setSyncing]         = useState(false);
  const [scheduleDraft,   setScheduleDraft]   = useState(null);
  // ─── Reschedule system ──────────────────────────────────────────────────────
  const [rescheduleTarget, setRescheduleTarget] = useState(null);
  const [contextMenu,      setContextMenu]      = useState(null); // { block, position }
  const [rescheduleUndo,   setRescheduleUndo]   = useState(null); // { block, oldStart, oldEnd, newStart, newEnd }
  const scrollRef = useRef(null);
  // Set of session IDs that have been explicitly deleted locally.
  // loadData()'s optimistic-preserve merge checks this before resurrecting sessions.
  const deletedIdsRef = useRef(new Set());

  const workflowAutoSessions = useMemo(
    () => mergeWorkflowSessions(autoSessions, { trace: true }),
    [autoSessions]
  );

  // ─── AI Intelligence Engine ───────────────────────────────────────────────
  const calendarAI = useCalendarAI({
    userId: user.id,
    date: selectedDate,
    sessions,
    calEvents,
    autoSessions: workflowAutoSessions,
    projects,
    clients,
    enabled: true,
  });

  // ─── Adaptive Behavioral Intelligence ────────────────────────────────────
  // Learns continuously from sessions and provides personalized insights.
  const adaptiveAI = useAdaptiveIntelligence({
    sessions,
    autoSessions: workflowAutoSessions,
    calendarInsights:    calendarAI.insights,
    productivityAnalysis: calendarAI.productivity,
    liveSession: activeSession ? {
      durationMins: activeSession.duration_seconds ? activeSession.duration_seconds / 60 : 0,
      category:     activeSession.category || 'general',
      isDeepWork:   !!activeSession.is_deep_work,
      switchRate:   0,
    } : null,
  });

  // AI-generated titles for sessions that have vague/blank titles.
  // Keyed by session ID. Visual overlay only — not auto-saved.
  const [aiTitleMap, setAiTitleMap] = useState({});
  // AI recap for the currently selected block (shown in popup)
  const [popupAIRecap, setPopupAIRecap] = useState(null);
  // AI suggested project for the currently selected session (when unassigned)
  const [popupAISuggestedProject, setPopupAISuggestedProject] = useState(null);
  // Live title suggestions for the active session
  const [aiLiveSuggestions, setAiLiveSuggestions] = useState([]);

  // Fill missing titles after sessions or auto-sessions update
  useEffect(() => {
    if (!sessions.length) return;
    const results = calendarAI.fillMissingTitles();
    if (!results?.length) return;
    const map = {};
    for (const { session, written } of results) {
      if (written?.titleWasGenerated && written.title) {
        map[session.id] = written;
      }
    }
    setAiTitleMap(map);
  }, [sessions.length, workflowAutoSessions.length]);

  // Update live suggestions when active session or auto-sessions change
  useEffect(() => {
    if (!activeSession) { setAiLiveSuggestions([]); return; }
    const nowTs = Math.floor(Date.now() / 1000);
    const sessionStart = activeSession.started_at || nowTs - 60;
    const recentAuto = workflowAutoSessions.filter(a =>
      !a.is_idle && a.started_at >= sessionStart - 300
    );
    const project = projects.find(p => p.id === activeSession.project_id) || null;
    const client  = clients.find(c => c.id === activeSession.client_id)   || null;
    const suggestions = calendarAI.getLiveTitleSuggestions(recentAuto, project, client);
    setAiLiveSuggestions(suggestions);
  }, [activeSession?.id, workflowAutoSessions.length]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 7 * PX_PER_HOUR;
  }, []);

  const dateRange = useCallback(() => {
    const d = new Date(selectedDate);
    if (viewMode === 'Day') {
      d.setHours(0, 0, 0, 0);
      const from = Math.floor(d.getTime() / 1000);
      return { from, to: from + 86400 };
    }
    if (viewMode === 'Month') {
      d.setDate(1); d.setHours(0, 0, 0, 0);
      const from = Math.floor(d.getTime() / 1000);
      const toD  = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
      return { from, to: Math.floor(toD.getTime() / 1000) };
    }
    // Week — go back to the start of the week (respects weekStartDay: 0=Sun, 1=Mon)
    const day = (d.getDay() - weekStartDay + 7) % 7;
    d.setDate(d.getDate() - day); d.setHours(0, 0, 0, 0);
    const from = Math.floor(d.getTime() / 1000);
    return { from, to: from + 7 * 86400 };
  }, [selectedDate, viewMode, weekStartDay]);

  const loadData = useCallback(async () => {
    const { from, to } = dateRange();
    const [sessList, evList, autoList, srcList, projList, taskList, clientList] = await Promise.all([
      api.listSessions?.({ userId: user.id, from, to }).catch(e => { console.error('[loadData] listSessions failed:', e); return []; }),
      api.calendarList?.({ userId: user.id, from, to }).catch(e => { console.error('[loadData] calendarList failed:', e); return []; }),
      api.autoSessionsRange?.({ userId: user.id, from, to }).catch(e => { console.error('[loadData] autoSessionsRange failed:', e); return []; }),
      api.calendarSources?.({ userId: user.id }).catch(e => { console.error('[loadData] calendarSources failed:', e); return []; }),
      api.listProjects?.({ userId: user.id }).catch(e => { console.error('[loadData] listProjects failed:', e); return []; }),
      api.listTasks?.({ userId: user.id }).catch(e => { console.error('[loadData] listTasks failed:', e); return []; }),
      api.listClients?.({ userId: user.id }).catch(e => { console.error('[loadData] listClients failed:', e); return []; }),
    ]);
    const nextCalendarEvents = evList || [];
    const calendarDescriptions = Object.fromEntries(nextCalendarEvents.map(ev => [ev.id, ev.description || '']));
    const nextSessions = (sessList || [])
      // Belt-and-suspenders: discard any __auto_block: rows that slipped through
      // the server-side filter (e.g. rows created before the fix was applied).
      // These rows have category='General' and would render as duplicate placeholder
      // events in the calendar grid.
      .filter(s => !String(s.notes || '').startsWith(AUTO_BLOCK_MARKER_PREFIX))
      .map(session => {
        const parsed = parseSessionNotes(session.notes, '');
        const fallbackDescription = parsed.linkedCalendarEventId ? (calendarDescriptions[parsed.linkedCalendarEventId] || '') : '';
        const normalized = parseSessionNotes(session.notes, fallbackDescription);
        return {
          ...session,
          description: normalized.description,
          is_non_billable: normalized.isNonBillable,
          _hiddenNoteMarkers: normalized.hiddenMarkers,
        };
      });

    // Preserve locally-created optimistic sessions the server hasn't confirmed yet
    // (old binary may still run the unfixed SQL that excludes future sessions).
    // Never resurrect IDs that were explicitly deleted — deletedIdsRef is the guard.
    const serverIds  = new Set(nextSessions.map(s => s.id));
    // Snapshot BEFORE any mutation so the filter uses consistent data.
    const deletedIds = new Set(deletedIdsRef.current);
    // Housekeeping: if the server now returns an ID we thought was deleted, it
    // means the delete was rolled back — stop blocking it.
    deletedIds.forEach(id => { if (serverIds.has(id)) deletedIdsRef.current.delete(id); });
    setSessions(prev => {
      const pendingLocal = prev.filter(
        s => s._isOptimistic && !serverIds.has(s.id) && !deletedIds.has(s.id)
      );
      return pendingLocal.length ? [...nextSessions, ...pendingLocal] : nextSessions;
    });
    setCalEvents(nextCalendarEvents);
    setAutoSessions(autoList || []);
    setSources(srcList     || []);
    setProjects(projList   || []);
    setTasks(taskList      || []);
    setClients(clientList  || []);
  }, [user.id, dateRange]);

  const handleAssignProject = useCallback(async (eventId, projectId) => {
    const proj     = projects.find(p => p.id === projectId) || null;
    const newClientId = proj?.client_id || null;
    const cl       = newClientId ? (clients.find(c => c.id === newClientId) || null) : null;
    await api.calendarAssignProject?.({ eventId, projectId, clientId: newClientId });
    const patch = {
      project_id:    projectId       || null,
      project_name:  proj?.name      || null,
      project_color: proj?.color     || null,
      client_id:     newClientId,
      client_name:   cl?.name        || null,
    };
    setCalEvents(prev => prev.map(ev => ev.id === eventId ? { ...ev, ...patch } : ev));
    setSelectedBlock(prev => prev?.id === eventId ? { ...prev, ...patch } : prev);
  }, [projects, clients]);

  // Assign project to a tracked focus session — the popup already calls
  // api.updateSession internally, so here we only patch local state so the
  // calendar block and detail popup both reflect the change immediately.
  const handleAssignSessionProject = useCallback((sessionId, projectId) => {
    const proj     = projects.find(p => p.id === projectId) || null;
    const clientId = proj?.client_id || null;
    const cl       = clientId ? (clients.find(c => c.id === clientId) || null) : null;
    const patch = {
      project_id:    projectId   || null,
      project_name:  proj?.name  || null,
      project_color: proj?.color || null,
      client_id:     clientId,
      client_name:   cl?.name    || null,
    };
    setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, ...patch } : s));
    setSelectedBlock(prev => prev?.id === sessionId ? { ...prev, ...patch } : prev);
  }, [projects, clients]);

  // Unified update handler — applies any patch from the detail popup to local state
  const handleUpdateBlock = useCallback((id, type, patch) => {
    if (type === 'calendar') {
      setCalEvents(prev => prev.map(ev => ev.id === id ? { ...ev, ...patch } : ev));
    } else {
      setSessions(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
    }
    setSelectedBlock(prev => prev?.id === id ? { ...prev, ...patch } : prev);
  }, []);

  useEffect(() => { loadData(); }, [loadData, activeSession]);

  const syncCalendars = async () => {
    if (syncing || !sources.length) return;
    setSyncing(true);
    try {
      const result = await api.calendarSync?.({ userId: user.id });
      if (result?.errors?.length) {
        result.errors.forEach(e => {
          console.error('[calendar:sync] source error', e);
          const title = e.invalidGrant ? 'Google Calendar disconnected' : 'Calendar sync failed';
          const msg   = e.invalidGrant
            ? `${e.label}: token expired or revoked — remove and reconnect in Calendar Settings`
            : `${e.label}: ${e.error}`;
          pushToast(`cal_sync_err_${e.sourceId}`, title, msg, { priority: 'high' });
        });
      }
    } catch (err) {
      console.error('[syncCalendars] unexpected error:', err);
      pushToast('cal_sync_err', 'Calendar sync failed',
        err?.message || 'Unknown error — check your connection', { priority: 'high' });
    }
    await loadData();
    setSyncing(false);
  };

  const addSource = async (data) => {
    // data===null means Google OAuth already handled everything in main process
    if (data !== null) {
      await api.calendarAddSource?.({ userId: user.id, ...data });
      setSyncing(true);
      try { await api.calendarSync?.({ userId: user.id }); } catch {}
    }
    await loadData();
    setSyncing(false);
  };

  const removeSource = async (id) => {
    await api.calendarRemoveSource?.({ connectionId: id });
    await loadData();
  };

  const stopSession = async () => {
    if (!activeSession) return;
    await api.stopSession?.({ sessionId: activeSession.id });
    setActiveSession(null);
    await loadData();
  };

  const handleSelect = useCallback(async (block) => {
    setSelectedBlock(block);
    setPopupApps([]);
    setPopupTags([]);
    setPopupAIRecap(null);
    setPopupAISuggestedProject(null);
    const from = block._type === 'calendar' ? block.start_time : block.started_at;
    const to   = block._type === 'calendar' ? block.end_time   : (block.ended_at || Math.floor(Date.now() / 1000));
    try {
      const [autos, tags] = await Promise.all([
        api.autoSessionsRange?.({ userId: user.id, from, to }),
        block._type === 'session' ? api.tagsForSession?.({ sessionId: block.id }) : Promise.resolve([]),
      ]);
      const autoList = autos || [];
      setPopupApps(aggregateAutoUsage(autoList, { start: from, end: to, limit: 5 }));
      setPopupTags(tags || []);

      // Generate AI recap for session blocks
      if (block._type === 'session') {
        const project = projects.find(p => p.id === block.project_id) || null;
        const client  = clients.find(c => c.id === block.client_id)   || null;
        const recap = calendarAI.getSessionRecap(block, autoList, project, client);
        setPopupAIRecap(recap);

        // Auto-suggest a project when none is assigned
        if (!block.project_id && projects.length > 0 && autoList.length > 0) {
          const suggestion = calendarAI.suggestProject(block, autoList);
          if (suggestion && suggestion.confidence >= 0.35) {
            setPopupAISuggestedProject(suggestion);
          }
        }
      }
    } catch {}
  }, [user.id, projects, clients]);

  const deleteSession = async (id) => {
    // Mark as explicitly deleted so the optimistic-preserve merge in loadData()
    // never resurrects this session, even if it still has _isOptimistic: true.
    deletedIdsRef.current.add(id);
    // Remove from local state immediately for instant UI feedback.
    setSessions(prev => prev.filter(s => s.id !== id));
    setSelectedBlock(null);
    try {
      await api.deleteSession?.({ sessionId: id });
    } catch (err) {
      console.error('[deleteSession] API call failed:', err);
    }
    await loadData();
  };

  const deleteCalendarEvent = async (id) => {
    await api.calendarDeleteEvent?.({ eventId: id });
    setCalEvents(prev => prev.filter(ev => ev.id !== id));
    setSelectedBlock(null);
  };

  // ─── Reschedule handlers ──────────────────────────────────────────────────
  const handleContextMenu = useCallback((block, position) => {
    setHoveredBlock(null);
    setContextMenu({ block, position });
  }, []);

  const handleRescheduleComplete = useCallback(({ block, oldStart, oldEnd, newStart, newEnd, scope }) => {
    // Optimistic update
    if (block._type === 'calendar') {
      setCalEvents(prev => prev.map(ev =>
        ev.id === block.id ? { ...ev, start_time: newStart, end_time: newEnd } : ev
      ));
    } else {
      const durSecs = newEnd - newStart;
      setSessions(prev => prev.map(s =>
        s.id === block.id ? { ...s, started_at: newStart, ended_at: newEnd, duration_seconds: durSecs } : s
      ));
    }
    setSelectedBlock(null);
    setRescheduleTarget(null);

    // Store undo data
    setRescheduleUndo({ block, oldStart, oldEnd, newStart, newEnd });

    // Show notification
    try {
      pushToast('calendar_sync', 'Event rescheduled', `${block.title || block.category || 'Event'} moved to ${new Date(newStart * 1000).toLocaleString('en-US', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}`, { priority: 'normal' });
    } catch {}

    // Background reload to sync any server-side changes
    loadData().catch(() => {});
  }, [loadData]);

  const handleRescheduleUndo = useCallback(async () => {
    if (!rescheduleUndo) return;
    const { block, oldStart, oldEnd } = rescheduleUndo;
    try {
      if (block._type === 'calendar') {
        await api.calendarUpdateEvent?.({ eventId: block.id, startTime: oldStart, endTime: oldEnd });
        setCalEvents(prev => prev.map(ev =>
          ev.id === block.id ? { ...ev, start_time: oldStart, end_time: oldEnd } : ev
        ));
      } else {
        await api.updateSessionTime?.({ sessionId: block.id, startedAt: oldStart, endedAt: oldEnd });
        const durSecs = oldEnd - oldStart;
        setSessions(prev => prev.map(s =>
          s.id === block.id ? { ...s, started_at: oldStart, ended_at: oldEnd, duration_seconds: durSecs } : s
        ));
      }
    } catch {}
    setRescheduleUndo(null);
    loadData().catch(() => {});
  }, [rescheduleUndo, loadData]);

  const handleRangeSelect = useCallback((startUnix, endUnix, date) => {
    setScheduleDraft({ startUnix, endUnix, date: new Date(date) });
  }, []);

  const handleScheduleTask = useCallback((task) => {
    const now = Math.floor(Date.now() / 1000);
    setScheduleDraft({ startUnix: now, endUnix: now + 3600, label: task.title, prefillTaskId: task.id, date: new Date() });
  }, []);

  // ── Quick Add callbacks (wired to SummaryPanel) ─────────────────────────────
  const handleQuickAddEvent = useCallback(() => {
    const now = Math.floor(Date.now() / 1000);
    setMainTab('entries');
    setScheduleDraft({ startUnix: now, endUnix: now + 3600, date: new Date() });
  }, []);

  const handleQuickStartFocus = useCallback(async () => {
    if (activeSession) return; // already running — button is disabled in SummaryPanel
    try {
      const sess = await api.startSession?.({
        userId: user.id,
        category: 'Focus Session',
        title: 'Focus Block',
      });
      if (sess?.id) {
        // Fetch the full DB row so activeSession carries title, category, user_id, etc.
        const full = await api.activeSession?.({ userId: user.id });
        setActiveSession(
          full ?? { ...sess, category: 'Focus Session', title: 'Focus Block', user_id: user.id },
        );
        await loadData();
      }
    } catch (err) {
      console.error('[QuickAdd] start focus failed:', err);
    }
  }, [activeSession, user.id, loadData]);

  const handleQuickAddTask = useCallback(() => {
    setMainTab('tasks');
  }, []);

  const handleQuickAddNote = useCallback(async (text) => {
    if (!text?.trim()) return;
    try {
      const now = Math.floor(Date.now() / 1000);
      // startedAt must be > 60 s in the past so the backend does NOT treat this
      // as a live recording — otherwise it would auto-stop any currently running session.
      const startedAt = now - 62;
      const sess = await api.startSession?.({
        userId: user.id,
        category: 'Note',
        title: text.trim(),
        startedAt,
      });
      if (sess?.id) {
        await api.stopSession?.({ sessionId: sess.id, endedAt: now });
      }
      await loadData();
    } catch (err) {
      console.error('[QuickAdd] save note failed:', err);
    }
  }, [user.id, loadData]);

  const handleScheduleConfirm = useCallback(async ({ startUnix, endUnix, title, description, taskId, projectId, clientId, billable }) => {
    // ── AI title generation for blank/vague titles ────────────────────────────
    let resolvedTitle = title;
    if (calendarAI.isVagueTitle(title || '')) {
      const project = projects.find(p => p.id === projectId) || null;
      const client  = clients.find(c => c.id === clientId)   || null;
      // Use auto-sessions active at the time of this scheduled block for context
      const blockAuto = autoSessions.filter(a =>
        !a.is_idle &&
        a.started_at < endUnix &&
        (a.ended_at || a.started_at + (a.duration_seconds || 0)) > startUnix
      );
      const generated = calendarAI.generateSessionTitle(
        { started_at: startUnix, ended_at: endUnix, project_id: projectId, client_id: clientId },
        blockAuto,
        project,
        client,
      );
      if (generated?.title) resolvedTitle = generated.title;
    }

    const notes = serializeSessionNotes({
      description,
      isNonBillable: billable === 'non-billable',
    });

    // Use the atomic 'sessions:schedule' IPC which creates AND closes the session in
    // a single main-process call — no risk of the session being left open if the
    // second IPC (stopSession) fails or is never received.
    let result = null;
    try {
      result = await api.scheduleSession?.({
        userId:      user.id,
        category:    'Scheduled Work',
        title:       resolvedTitle || 'Scheduled Work',
        projectId:   projectId   || null,
        clientId:    clientId    || null,
        taskId:      taskId      || null,
        sessionType: 'focus',
        startedAt:   startUnix,
        endedAt:     endUnix,
        notes,
      });
    } catch (err) {
      console.error('[schedule] scheduleSession IPC failed:', err);
    }

    // Fallback: if the atomic handler is unavailable (old Electron build not yet reloaded),
    // fall back to the legacy two-step start+stop.
    if (!result?.id) {
      console.warn('[schedule] Falling back to legacy start+stop flow');
      try {
        const newSess = await api.startSession?.({
          userId: user.id, category: 'Scheduled Work', title: resolvedTitle || 'Scheduled Work',
          projectId: projectId||null, clientId: clientId||null, taskId: taskId||null,
          sessionType: 'focus', startedAt: startUnix, notes,
        });
        if (newSess?.id) {
          await api.stopSession?.({ sessionId: newSess.id, endedAt: endUnix });
          result = { id: newSess.id, started_at: startUnix, ended_at: endUnix,
                     duration_seconds: Math.max(0, endUnix - startUnix) };
        }
      } catch (err) {
        console.error('[schedule] Fallback start+stop also failed:', err);
      }
    }

    if (!result?.id) {
      // Both approaches failed — still close the modal and reload so the user
      // can see current state (and the error will be visible in the console).
      setScheduleDraft(null);
      loadData().catch(() => {});
      return;
    }

    // ── Optimistic update: inject the new session into local state IMMEDIATELY ──
    // The block appears in the calendar grid RIGHT AWAY without waiting for the
    // loadData() round-trip. loadData() then replaces it with the fully hydrated row.
    const newId       = result.id;
    const durationSecs = Math.max(0, endUnix - startUnix);
    const projObj     = projects.find(p => p.id === projectId) || null;
    const clientObj   = clients.find(c => c.id === clientId)   || null;
    const optimisticSession = {
      id:               newId,
      user_id:          user.id,
      category:         'Scheduled Work',
      title:            resolvedTitle || 'Scheduled Work',
      started_at:       startUnix,
      ended_at:         endUnix,
      duration_seconds: durationSecs,
      is_deep_work:     durationSecs >= 1500 ? 1 : 0,
      session_type:     'focus',
      notes:            notes || null,
      project_id:       projectId        || null,
      project_name:     projObj?.name    || null,
      project_color:    projObj?.color   || null,
      client_id:        clientId         || null,
      client_name:      clientObj?.name  || null,
      task_id:          taskId      || null,
      description:      description || '',
      is_non_billable:  billable === 'non-billable',
      _hiddenNoteMarkers: [],
      // Flag so loadData() knows to preserve this if the server hasn't returned it yet
      _isOptimistic:    true,
    };
    setSessions(prev => {
      if (prev.some(s => s.id === newId)) return prev; // deduplicate
      return [...prev, optimisticSession];
    });

    setScheduleDraft(null);

    // Auto-scroll the calendar so the newly created block is visible.
    // We do this in a rAF so the DOM has updated with the new session before we read positions.
    requestAnimationFrame(() => {
      if (scrollRef.current) {
        const blockTopPx = (new Date(startUnix * 1000).getHours() * 60 + new Date(startUnix * 1000).getMinutes()) / 60 * PX_PER_HOUR;
        const viewH = scrollRef.current.clientHeight;
        const targetScroll = Math.max(0, blockTopPx - viewH / 3);
        scrollRef.current.scrollTo({ top: targetScroll, behavior: 'smooth' });
      }
    });

    // If the scheduled event is on a different day from the current view, navigate there.
    const eventDate = new Date(startUnix * 1000);
    const eventDay  = eventDate.toDateString();
    if (viewMode === 'Day' && eventDay !== selectedDate.toDateString()) {
      setSelectedDate(new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate()));
    }

    // Background reload to get the fully hydrated row (project_name, task_title, etc.)
    loadData().catch(err => console.error('[schedule] loadData failed:', err));
  }, [user.id, loadData, scrollRef, viewMode, selectedDate, projects, clients]);

  const navigate = (dir) => {
    const d = new Date(selectedDate);
    if (viewMode === 'Day')        d.setDate(d.getDate() + dir);
    else if (viewMode === 'Month') d.setMonth(d.getMonth() + dir);
    else                           d.setDate(d.getDate() + dir * 7);
    setSelectedDate(d);
  };

  const goToday  = () => setSelectedDate(new Date());
  const isToday  = () => new Date().toDateString() === selectedDate.toDateString();
  const nowTop   = () => {
    const t = new Date();
    return ((t.getHours() * 60 + t.getMinutes()) / 60) * PX_PER_HOUR;
  };
  const nowTimeStr = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const dateLabel = () => {
    if (viewMode === 'Day')   return selectedDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    if (viewMode === 'Month') return selectedDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const s = new Date(selectedDate);
    s.setDate(s.getDate() - (s.getDay() - weekStartDay + 7) % 7);
    const e = new Date(s); e.setDate(e.getDate() + 6);
    return `${s.toLocaleDateString('en-US',{month:'short',day:'numeric'})} – ${e.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}`;
  };

  const getWeekDays = () => {
    const days = [], s = new Date(selectedDate);
    // Go back to the start of the week (Sun or Mon depending on pref)
    s.setDate(s.getDate() - (s.getDay() - weekStartDay + 7) % 7);
    for (let i = 0; i < 7; i++) { const d = new Date(s); d.setDate(d.getDate() + i); days.push(d); }
    return days;
  };

  const getMonthDays = () => {
    const year = selectedDate.getFullYear(), month = selectedDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay  = new Date(year, month + 1, 0);
    const days = [];
    // Offset so the grid starts on the correct weekday (Sun or Mon)
    const startDow = (firstDay.getDay() - weekStartDay + 7) % 7;
    for (let i = 0; i < startDow; i++) days.push({ date: new Date(year, month, 1 - (startDow - i)), currentMonth: false });
    for (let i = 1; i <= lastDay.getDate(); i++) days.push({ date: new Date(year, month, i), currentMonth: true });
    while (days.length % 7 !== 0) days.push({ date: new Date(year, month + 1, days.length - startDow - lastDay.getDate() + 1), currentMonth: false });
    return days;
  };

  const forDay = (date, list, sKey, eKey) => {
    const s0 = new Date(date); s0.setHours(0,0,0,0);
    const e0 = new Date(date); e0.setHours(23,59,59,999);
    const s = Math.floor(s0/1000), e = Math.floor(e0/1000);
    return eKey
      ? list.filter(x => x[sKey] < e && x[eKey] > s)
      : list.filter(x => x[sKey] >= s && x[sKey] <= e);
  };

  const sessionsForDay  = d => forDay(d, sessions, 'started_at', null);
  const calEventsForDay = d => forDay(d, calEvents, 'start_time', 'end_time');
  const autoForDay      = d => forDay(d, workflowAutoSessions, 'started_at', null);

  // ── Derived data for tab views ─────────────────────────────────────────
  const sessionsByDate = useMemo(() => {
    const map = {};
    for (const s of sessions) {
      const d = new Date(s.started_at * 1000);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!map[key]) map[key] = { secs: 0, count: 0 };
      map[key].secs += s.duration_seconds || 0;
      map[key].count++;
    }
    return map;
  }, [sessions]);

  const projectTimeSecs = useMemo(() => {
    const map = {};
    for (const s of sessions) {
      if (!s.project_id) continue;
      map[s.project_id] = (map[s.project_id] || 0) + (s.duration_seconds || 0);
    }
    return map;
  }, [sessions]);

  const clientTimeSecs = useMemo(() => {
    const map = {};
    for (const s of sessions) {
      if (!s.client_id) continue;
      map[s.client_id] = (map[s.client_id] || 0) + (s.duration_seconds || 0);
    }
    return map;
  }, [sessions]);

  const selectedDaySessions = useMemo(() => sessionsForDay(selectedDate), [sessions, selectedDate]);
  const selectedDayAuto = useMemo(() => autoForDay(selectedDate), [workflowAutoSessions, selectedDate]);
  const selectedDayChains = useMemo(() => buildFocusChains(selectedDaySessions), [selectedDaySessions]);
  const selectedDayInterruptions = useMemo(() => buildInterruptionMarkers(selectedDaySessions), [selectedDaySessions]);

  const selectedBehavior = useMemo(() => {
    if (!selectedBlock) return null;
    const { start, end } = getBlockWindow(selectedBlock);
    if (!start || !end) return null;
    const relatedAuto = workflowAutoSessions.filter(a =>
      !a.is_idle &&
      (a.duration_seconds || 0) > 0 &&
      overlaps(start, end, a.started_at, a.ended_at || (a.started_at + (a.duration_seconds || 0)))
    );
    const usage = summarizeAutoUsage(relatedAuto);
    const sortedDaySessions = selectedDaySessions
      .map(s => ({ ...s, end: s.ended_at || (s.started_at + (s.duration_seconds || 0)) }))
      .sort((a, b) => a.started_at - b.started_at);
    const currentIndex = selectedBlock._type === 'session'
      ? sortedDaySessions.findIndex(s => s.id === selectedBlock.id)
      : -1;
    const prev = currentIndex > 0 ? sortedDaySessions[currentIndex - 1] : null;
    const next = currentIndex >= 0 && currentIndex < sortedDaySessions.length - 1 ? sortedDaySessions[currentIndex + 1] : null;
    const gapBefore = prev ? Math.max(0, start - prev.end) : null;
    const gapAfter = next ? Math.max(0, next.started_at - end) : null;
    const continuity = (gapBefore !== null && gapBefore <= 20 * 60 ? 1 : 0) + (gapAfter !== null && gapAfter <= 20 * 60 ? 1 : 0);
    const theme = inferWorkflowTheme([
      blockDisplayTitle(selectedBlock),
      selectedBlock.category,
      selectedBlock.project_name,
      ...usage.dominantApps.map(a => a.app),
    ]);
    const narrative = continuity >= 2
      ? `This looks like part of a sustained ${theme.label.toLowerCase()} chain.`
      : continuity === 1
        ? `This session connects into nearby work and likely served as a transition point.`
        : usage.switches >= 4
          ? `This block was more fragmented, with frequent tool switching inside the window.`
          : `This reads as a more self-contained work block with a clear start and finish.`;
    const recovery = gapBefore === null
      ? 'Started cold'
      : gapBefore <= 8 * 60
        ? 'Immediate continuation'
        : gapBefore <= 20 * 60
          ? 'Recovered quickly'
          : 'Needed a reset before re-entry';
    return {
      start,
      end,
      usage,
      theme,
      prev,
      next,
      gapBefore,
      gapAfter,
      continuity,
      recovery,
      narrative,
    };
  }, [selectedBlock, workflowAutoSessions, selectedDaySessions]);

  const dayBehavior = useMemo(() => {
    const activeAuto = selectedDayAuto.filter(a => !a.is_idle && (a.duration_seconds || 0) > 0);
    const usage = summarizeAutoUsage(activeAuto);
    const longestChain = selectedDayChains.reduce((best, chain) => !best || chain.totalSeconds > best.totalSeconds ? chain : best, null);
    const review = [];
    if (longestChain?.totalSeconds >= 2 * 3600) review.push(`Longest focus chain ran ${fmtDur(longestChain.totalSeconds)} with ${longestChain.sessions.length} linked sessions.`);
    if (selectedDayInterruptions.length >= 3) review.push(`${selectedDayInterruptions.length} recovery moments suggest repeated context resets through the day.`);
    if (usage.switches <= 4 && usage.totalSeconds > 2 * 3600) review.push('Tool-switching stayed low, which usually maps to stronger cognitive continuity.');
    if (usage.dominantApps[0]) review.push(`${usage.dominantApps[0].app} was the dominant workspace for this day.`);
    return {
      usage,
      longestChain,
      interruptions: selectedDayInterruptions,
      review,
    };
  }, [selectedDayAuto, selectedDayChains, selectedDayInterruptions]);

  const renderTooltip = () => {
    if (!hoveredBlock || !hoverRect) return null;
    const vpW      = window.innerWidth;
    const tooltipW  = 284;
    const isLight   = document.documentElement.classList.contains('theme-light');
    // Clamp tooltip: prefer right side; flip left when it would overflow, accounting
    // for the summary panel (~260 px) on the right edge.
    const left = (hoverRect.right + 8 + tooltipW > vpW - 260)
      ? Math.max(4, hoverRect.left - tooltipW - 4)
      : hoverRect.right + 8;
    // Use cursor Y (clientY) for vertical placement so the tooltip appears right
    // next to wherever the user is hovering — not locked to the card's top edge,
    // which creates a large visual gap on tall multi-hour blocks.
    const cursorY = hoverRect.clientY ?? hoverRect.top;
    const top  = Math.min(Math.max(8, cursorY - 12), window.innerHeight - 320);
    const b        = hoveredBlock;
    const col      = b._type === 'calendar' ? (b.color || '#60A5FA') : b._type === 'session' ? blockColor({ ...b, _type: 'session' }, laneMode) : '#4B5563';
    const title    = b._type === 'calendar' ? b.title : b._type === 'session' ? (b.title || b.category) : (b.apps?.[0] || 'Activity');
    const start    = b._type === 'calendar' ? b.start_time : b.started_at;
    const end      = b._type === 'calendar' ? b.end_time   : b.ended_at;
    const desc     = b.description || b.notes || null;
    const hoverAuto = workflowAutoSessions.filter(a =>
      !a.is_idle &&
      (a.duration_seconds || 0) > 0 &&
      start &&
      end &&
      overlaps(start, end, a.started_at, a.ended_at || (a.started_at + (a.duration_seconds || 0)))
    );
    const hoverUsage = summarizeAutoUsage(hoverAuto);
    const hoverTheme = inferWorkflowTheme([
      title,
      b.category,
      b.project_name,
      ...hoverUsage.dominantApps.map(a => a.app),
    ]);
    const durSecs    = (start && end) ? (end - start) : 0;
    const clientName = b.client_name  || null;
    const projName   = b.project_name || null;
    const projColor  = b.project_color || col;
    // Score: use focus score proxy from hoverUsage switches (fewer = better)
    const scoreVal   = hoverUsage.totalSeconds > 0
      ? Math.max(10, Math.min(99, 100 - hoverUsage.switches * 7))
      : null;
    const tx    = isLight ? '#0F0D1F'                : '#EAEAF0';
    const txMid = isLight ? 'rgba(15,23,42,0.52)'   : '#6B7A96';
    const txFnt = isLight ? 'rgba(15,23,42,0.36)'   : '#4B5263';
    const divBg = isLight ? 'rgba(15,23,42,0.06)'   : 'rgba(255,255,255,0.06)';
    const divBd = isLight ? 'rgba(15,23,42,0.09)'   : 'rgba(255,255,255,0.07)';

    return (
      <div className="fixed pointer-events-none z-[999] fl-calendar-tooltip"
        style={{
          left, top, width: tooltipW,
          background:   isLight ? '#FFFFFF' : '#13151F',
          border:       isLight ? '1px solid rgba(210,202,255,0.80)' : '1px solid rgba(255,255,255,0.09)',
          borderRadius: 14,
          boxShadow:    isLight
            ? '0 12px 40px rgba(15,23,42,0.14), inset 0 1px 0 rgba(255,255,255,0.9)'
            : '0 16px 48px rgba(0,0,0,0.72), 0 4px 16px rgba(0,0,0,0.40)',
          overflow: 'hidden',
        }}>

        {/* ── Top info bar ── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '9px 12px 8px',
          borderBottom: `1px solid ${divBg}`,
          background: isLight ? 'rgba(15,23,42,0.025)' : 'rgba(255,255,255,0.025)',
        }}>
          {/* Type icon badge */}
          {(() => {
            const IconComponent =
              b._type === 'calendar'          ? Calendar
              : b.session_type === 'meeting'  ? Users
              : b.session_type === 'break'    ? Coffee
              : b.is_deep_work                ? Zap
              : b.session_type === 'focus'    ? Briefcase
              : Monitor;
            return (
              <div style={{
                width: 24, height: 24, borderRadius: 7, flexShrink: 0,
                background: `${col}22`, border: `1px solid ${col}38`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <IconComponent size={12} style={{ color: col, flexShrink: 0 }} />
              </div>
            );
          })()}
          {/* Project / client name */}
          <span style={{
            fontSize: 10.5, fontWeight: 700, color: tx,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
          }}>
            {projName || clientName || hoverTheme.label}
          </span>
          {/* Duration badge */}
          {durSecs > 0 && (
            <span style={{
              fontSize: 9, fontWeight: 700, color: txMid,
              background: divBg, border: `1px solid ${divBd}`,
              borderRadius: 5, padding: '2px 6px',
              fontVariantNumeric: 'tabular-nums', flexShrink: 0,
            }}>{fmtDur(durSecs)}</span>
          )}
          {/* Score ring */}
          {scoreVal && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0,
              background: `${col}18`, border: `1px solid ${col}30`,
              borderRadius: 5, padding: '2px 6px',
            }}>
              <span style={{ fontSize: 9, fontWeight: 800, color: col, fontVariantNumeric: 'tabular-nums' }}>
                {scoreVal}%
              </span>
            </div>
          )}
        </div>

        {/* ── Main body ── */}
        <div style={{ padding: '10px 12px' }}>
          {/* Event title + time range */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 7 }}>
            <p style={{
              fontSize: 12.5, fontWeight: 700, lineHeight: 1.3,
              color: tx, flex: 1, minWidth: 0,
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
              margin: 0,
            }}>{title}</p>
            {start && (
              <span style={{
                fontSize: 9, color: txMid, flexShrink: 0, marginTop: 2,
                fontVariantNumeric: 'tabular-nums', fontWeight: 600,
              }}>
                {fmtTime(start)}{end ? `–${fmtTime(end)}` : ''}
              </span>
            )}
          </div>

          {/* Pills row — client + project */}
          {(clientName || projName) && (
            <div style={{ display: 'flex', gap: 5, marginBottom: 8, flexWrap: 'wrap' }}>
              {clientName && (
                <span style={{
                  fontSize: 9.5, fontWeight: 600, padding: '3px 8px', borderRadius: 6,
                  background: divBg, border: `1px solid ${divBd}`, color: txMid,
                }}>
                  {clientName}
                </span>
              )}
              {projName && (
                <span style={{
                  fontSize: 9.5, fontWeight: 600, padding: '3px 8px', borderRadius: 6,
                  background: `${projColor}22`, border: `1px solid ${projColor}40`, color: projColor,
                }}>
                  {projName}
                </span>
              )}
            </div>
          )}

          {/* Description */}
          {desc && (
            <p style={{
              fontSize: 9.5, color: txMid, lineHeight: 1.5, marginBottom: 8,
              display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
              margin: '0 0 8px',
            }}>{desc}</p>
          )}

          {/* Apps & Websites */}
          {hoverUsage.dominantApps.length > 0 && (
            <>
              <p style={{
                fontSize: 9, fontWeight: 700, color: txFnt, textTransform: 'uppercase',
                letterSpacing: '0.08em', marginBottom: 7,
              }}>Apps &amp; Websites</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {hoverUsage.dominantApps.slice(0, 4).map((app) => {
                  const appPct = hoverUsage.totalSeconds > 0
                    ? Math.round((app.seconds / hoverUsage.totalSeconds) * 100) : 0;
                  return (
                    <div key={app.app} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {/* Percentage */}
                      <span style={{
                        fontSize: 9.5, fontWeight: 700, color: txMid,
                        fontVariantNumeric: 'tabular-nums', minWidth: 28, flexShrink: 0,
                      }}>{appPct}%</span>
                      {/* Bar */}
                      <div style={{ flex: 1, height: 3, borderRadius: 99, background: divBg, overflow: 'hidden' }}>
                        <div style={{
                          width: `${appPct}%`, height: '100%', borderRadius: 99,
                          background: col, opacity: isLight ? 0.85 : 0.75,
                        }} />
                      </div>
                      {/* App name */}
                      <span style={{
                        fontSize: 10, color: tx, fontWeight: 500,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        minWidth: 50, maxWidth: 80, flex: 1,
                      }}>{app.app}</span>
                      {/* Duration */}
                      <span style={{
                        fontSize: 9.5, color: txMid,
                        fontVariantNumeric: 'tabular-nums', flexShrink: 0,
                      }}>{fmtDur(app.seconds)}</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  // ── Sub-views ────────────────────────────────────────────────────────────
  const renderMonthGrid = () => {
    const days = getMonthDays();
    const numWeeks = days.length / 7;
    // Rotate day-of-week header to match weekStartDay (1=Mon, 0=Sun)
    const DOW_ALL = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const DOW = [...DOW_ALL.slice(weekStartDay), ...DOW_ALL.slice(0, weekStartDay)];

    const cellBg     = (isT, cur) => isT ? 'rgba(124,108,242,0.07)' : cur ? (isLight ? '#FFFFFF' : '#111420') : (isLight ? '#F4F6FA' : '#0D0F16');
    const cellBorder = (isT)      => isT ? 'rgba(124,108,242,0.28)' : (isLight ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.04)');

    return (
      // flex:1 + minHeight:0 lets this div shrink to fit the remaining column space
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '0 14px 14px', minHeight: 0 }}>
        {/* Day-of-week header */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', flexShrink: 0 }}>
          {DOW.map(d => (
            <div key={d} style={{ textAlign: 'center', fontSize: 9, fontWeight: 700, color: isLight ? '#9CA3AF' : '#4B5263', textTransform: 'uppercase', letterSpacing: '0.07em', padding: '10px 0 6px' }}>{d}</div>
          ))}
        </div>
        {/* Calendar grid — rows take equal 1fr slices of the remaining height */}
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gridTemplateRows: `repeat(${numWeeks}, 1fr)`, gap: 3, minHeight: 0 }}>
          {days.map(({ date, currentMonth }, i) => {
            const isT     = date.toDateString() === new Date().toDateString();
            const key     = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
            const dayData = sessionsByDate[key] || { secs: 0, count: 0 };
            const dayEvs  = calEvents.filter(e => new Date(e.start_time * 1000).toDateString() === date.toDateString());
            const daySess = sessions.filter(s => isRenderableSessionBlock(s) && new Date(s.started_at * 1000).toDateString() === date.toDateString());
            const allDayItems = [
              ...dayEvs.map(e => ({ id: `cal-${e.id}`, label: e.title, color: e.color || '#60A5FA' })),
              ...daySess.map(s => ({ id: `sess-${s.id}`, label: s.title || s.category, color: blockColor({ ...s, _type: 'session' }, 'default') })),
            ];
            const bg  = cellBg(isT, currentMonth);
            const bdr = cellBorder(isT);
            return (
              <div key={i}
                onClick={() => { setSelectedDate(date); setViewMode('Day'); setMainTab('entries'); }}
                className={`fl-calendar-month-cell${isT ? ' fl-calendar-month-cell-today' : ''}`}
                style={{
                  borderRadius: 10, padding: 7,
                  background: bg,
                  border: `1px solid ${bdr}`,
                  cursor: 'pointer', transition: 'all 0.15s',
                  opacity: currentMonth ? 1 : 0.3,
                  boxShadow: isT ? '0 0 0 1px rgba(124,108,242,0.15) inset' : 'none',
                  overflow: 'hidden',
                  display: 'flex', flexDirection: 'column',
                }}
                onMouseOver={e => {
                  e.currentTarget.style.background    = isT ? 'rgba(124,108,242,0.12)' : (isLight ? '#ECEEF5' : 'rgba(255,255,255,0.02)');
                  e.currentTarget.style.borderColor   = isT ? 'rgba(124,108,242,0.44)' : (isLight ? 'rgba(0,0,0,0.14)' : 'rgba(255,255,255,0.08)');
                }}
                onMouseOut={e => {
                  e.currentTarget.style.background  = bg;
                  e.currentTarget.style.borderColor = bdr;
                }}
              >
                {/* Date number + duration */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, flexShrink: 0 }}>
                  <span style={{ width: 22, height: 22, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: isT ? 800 : 600, background: isT ? 'linear-gradient(135deg, #7c6cf2, #9D8FF5)' : 'transparent', color: isT ? 'white' : currentMonth ? (isLight ? '#374151' : '#9CA3AF') : (isLight ? '#9CA3AF' : '#4B5263'), boxShadow: isT ? '0 0 8px rgba(124,108,242,0.35)' : 'none' }}>
                    {date.getDate()}
                  </span>
                  {dayData.secs > 0 && (
                    <span style={{ fontSize: 8, color: '#9D8FF5', fontWeight: 600, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em' }}>
                      {fmtDur(dayData.secs)}
                    </span>
                  )}
                </div>
                {/* Event / session pills */}
                <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
                  {allDayItems.slice(0, 2).map(item => (
                    <div key={item.id} style={{ fontSize: 9, color: item.color, background: `${item.color}14`, borderRadius: 4, padding: '1.5px 5px', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', border: `1px solid ${item.color}18` }}>
                      {item.label}
                    </div>
                  ))}
                  {allDayItems.length > 2 && (
                    <div style={{ fontSize: 8, color: '#6B7280', marginLeft: 1 }}>+{allDayItems.length - 2} more</div>
                  )}
                </div>
                {/* Progress bar pinned to bottom */}
                {dayData.secs > 0 && (
                  <div style={{ marginTop: 4, height: 2.5, borderRadius: 99, overflow: 'hidden', background: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.05)', flexShrink: 0 }}>
                    <div style={{ height: '100%', borderRadius: 99, width: `${Math.min((dayData.secs / 28800) * 100, 100)}%`, background: 'linear-gradient(90deg, #7c6cf2, #9D8FF5)', opacity: 0.7 + (dayData.secs / 28800) * 0.3 }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };


  const todayIsVisible = isToday() && (viewMode === 'Day' || viewMode === 'Week');
  const gridHeaderOffset = viewMode === 'Day' ? 0 : DAY_HEADER_HEIGHT;
  const timelineHeight = gridHeaderOffset + 24 * PX_PER_HOUR;

  const TAB_ITEMS = [
    { id: 'entries',  label: 'Time entries' },
    { id: 'tasks',    label: 'Tasks'        },
    { id: 'projects', label: 'Projects'     },
    { id: 'clients',  label: 'Clients'      },
  ];

  return (
    <div className="fl-calendar-page fl-calendar-shell" style={{ display: 'flex', height: '100%', overflow: 'hidden', background: isLight ? '#F1F3F7' : 'radial-gradient(ellipse at 20% 0%, rgba(124,108,242,0.04) 0%, #0D0F16 50%)' }}>

      {/* ── MAIN AREA ─────────────────────────────────────────────────────── */}
      <div className="fl-calendar-main" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

        {/* ── Primary toolbar ── */}
        <div className="fl-calendar-toolbar" style={{ height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', borderBottom: isLight ? '1px solid #E5E9F0' : '1px solid rgba(255,255,255,0.055)', flexShrink: 0, background: isLight ? '#FFFFFF' : 'linear-gradient(180deg, rgba(17,20,32,0.95) 0%, rgba(13,15,23,0.90) 100%)', backdropFilter: isLight ? 'none' : 'blur(12px) saturate(1.4)', WebkitBackdropFilter: isLight ? 'none' : 'blur(12px) saturate(1.4)', boxShadow: isLight ? '0 1px 0 rgba(0,0,0,0.05)' : '0 1px 0 rgba(255,255,255,0.022), 0 4px 20px rgba(0,0,0,0.14)' }}>
          {/* Left */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div className="fl-calendar-toolbar-group" style={{ display: 'flex', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, overflow: 'hidden', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)' }}>
              <button onClick={() => navigate(-1)}
                style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', borderRight: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', color: '#6B7280', transition: 'all 0.12s' }}
                onMouseOver={e => { e.currentTarget.style.color = '#EAEAF0'; e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                onMouseOut={e => { e.currentTarget.style.color = '#6B7280'; e.currentTarget.style.background = 'transparent'; }}>
                <ChevronLeft size={13} />
              </button>
              <button onClick={() => navigate(1)}
                style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', cursor: 'pointer', color: '#6B7280', transition: 'all 0.12s' }}
                onMouseOver={e => { e.currentTarget.style.color = '#EAEAF0'; e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                onMouseOut={e => { e.currentTarget.style.color = '#6B7280'; e.currentTarget.style.background = 'transparent'; }}>
                <ChevronRight size={13} />
              </button>
            </div>
            <button onClick={goToday}
              style={{ height: 30, padding: '0 11px', borderRadius: 8, background: isToday() ? 'rgba(124,108,242,0.14)' : (isLight ? '#F4F6FA' : '#161921'), border: `1px solid ${isToday() ? 'rgba(124,108,242,0.35)' : (isLight ? '#DDE3EE' : '#252932')}`, color: isToday() ? (isLight ? '#4F46E5' : '#a78bfa') : (isLight ? '#374151' : '#9CA3AF'), fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s', boxShadow: isToday() ? '0 0 12px rgba(124,108,242,0.18)' : 'none' }}
              onMouseOver={e => { e.currentTarget.style.background = 'rgba(124,108,242,0.14)'; e.currentTarget.style.color = isLight ? '#4F46E5' : '#c4b5fd'; e.currentTarget.style.borderColor = 'rgba(124,108,242,0.35)'; }}
              onMouseOut={e  => { e.currentTarget.style.background = isToday() ? 'rgba(124,108,242,0.14)' : (isLight ? '#F4F6FA' : '#161921'); e.currentTarget.style.color = isToday() ? (isLight ? '#4F46E5' : '#a78bfa') : (isLight ? '#374151' : '#9CA3AF'); e.currentTarget.style.borderColor = isToday() ? 'rgba(124,108,242,0.35)' : (isLight ? '#DDE3EE' : '#252932'); }}>
              Today
            </button>
            <span style={{ fontSize: 14, fontWeight: 700, color: isLight ? '#1F2937' : '#EAEAF0', letterSpacing: '-0.01em' }}>{dateLabel()}</span>
            {sources.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                {sources.slice(0, 2).map(src => {
                  const isGoogle = src.provider === 'google';
                  const c = src.color || (isGoogle ? '#4285f4' : '#6366f1');
                  return (
                    <div key={src.id} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 6, fontSize: 10, fontWeight: 500, background: `${c}0D`, color: `${c}CC`, border: `1px solid ${c}22` }}>
                      <Calendar size={9} style={{ color: c }} />
                      <span style={{ maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {isGoogle && src.account_email ? src.account_email : src.label}
                      </span>
                      {isGoogle && (
                        <span style={{ fontSize: 8, background: `${c}18`, border: `1px solid ${c}25`, borderRadius: 3, padding: '1px 4px', fontWeight: 700, letterSpacing: '0.03em' }}>OAuth</span>
                      )}
                    </div>
                  );
                })}
                {sources.length > 2 && (
                  <span style={{ fontSize: 10, color: '#4B5263', fontWeight: 600 }}>+{sources.length - 2}</span>
                )}
                <button onClick={syncCalendars} disabled={syncing}
                  className="fl-calendar-toolbar-icon-btn"
                  style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, background: isLight ? '#F4F6FA' : '#161921', border: isLight ? '1px solid #DDE3EE' : '1px solid #252932', cursor: 'pointer', color: '#6B7280', opacity: syncing ? 0.5 : 1 }}
                  onMouseOver={e => { e.currentTarget.style.color = isLight ? '#374151' : '#EAEAF0'; e.currentTarget.style.background = isLight ? '#E8EDF6' : '#1E2230'; }}
                  onMouseOut={e  => { e.currentTarget.style.color = '#6B7280'; e.currentTarget.style.background = isLight ? '#F4F6FA' : '#161921'; }}>
                  <RefreshCw size={10} style={syncing ? { animation: 'spin 1s linear infinite' } : {}} />
                </button>
              </div>
            )}
          </div>
          {/* Right */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div className="fl-calendar-toolbar-group" style={{ display: 'flex', borderRadius: 10, padding: 2.5, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)' }}>
              {['Day', 'Week', 'Month'].map(m => (
                <button key={m} onClick={() => setViewMode(m)}
                  style={{ padding: '4px 12px', borderRadius: 7, fontSize: 11, fontWeight: 600, background: viewMode === m ? 'rgba(124,108,242,0.20)' : 'transparent', color: viewMode === m ? (isLight ? '#4F46E5' : '#C4B5FD') : (isLight ? '#4B5563' : '#6B7280'), border: `1px solid ${viewMode === m ? 'rgba(124,108,242,0.25)' : 'transparent'}`, cursor: 'pointer', transition: 'all 0.15s', boxShadow: viewMode === m ? (isLight ? '0 1px 4px rgba(99,102,241,0.12)' : '0 0 8px rgba(124,108,242,0.15)') : 'none' }}>
                  {m}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Tab bar ── */}
        <div className="fl-calendar-tabbar" style={{ height: 44, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', borderBottom: isLight ? '1px solid #E5E9F0' : '1px solid rgba(255,255,255,0.045)', flexShrink: 0, background: isLight ? '#FFFFFF' : 'rgba(9,11,18,0.90)', backdropFilter: isLight ? 'none' : 'blur(8px)', WebkitBackdropFilter: isLight ? 'none' : 'blur(8px)', boxShadow: isLight ? '0 1px 0 rgba(0,0,0,0.04)' : '0 1px 0 rgba(255,255,255,0.018)' }}>
          <div style={{ display: 'flex', alignItems: 'stretch', height: '100%' }}>
            {TAB_ITEMS.map(tab => (
              <button key={tab.id} onClick={() => setMainTab(tab.id)}
                style={{ height: '100%', padding: '0 16px', background: 'transparent', border: 'none', borderBottom: mainTab === tab.id ? `2px solid ${isLight ? '#6366F1' : '#9D8FF5'}` : '2px solid transparent', color: mainTab === tab.id ? (isLight ? '#4F46E5' : '#E4E0FF') : (isLight ? '#6B7280' : '#4D5568'), fontSize: 12, fontWeight: mainTab === tab.id ? 700 : 400, cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap', textShadow: mainTab === tab.id && !isLight ? '0 0 12px rgba(157,143,245,0.4)' : 'none', letterSpacing: mainTab === tab.id ? 'normal' : '0.01em' }}
                onMouseOver={e => { if (mainTab !== tab.id) e.currentTarget.style.color = isLight ? '#374151' : '#8B95A8'; }}
                onMouseOut={e  => { if (mainTab !== tab.id) e.currentTarget.style.color = isLight ? '#6B7280' : '#4D5568'; }}>
                {tab.label}
              </button>
            ))}
          </div>
          {mainTab === 'entries' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {/* AI conflict badge */}
              {calendarAI.conflictReport?.hasCritical && (
                <div title={calendarAI.conflictReport.topConflict?.message || 'Scheduling conflict detected'}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 6, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)', cursor: 'default' }}>
                  <AlertCircle size={9} color="#F87171" />
                  <span style={{ fontSize: 9, fontWeight: 700, color: '#F87171', letterSpacing: '0.04em' }}>CONFLICT</span>
                </div>
              )}
              {calendarAI.conflictReport?.hasHigh && !calendarAI.conflictReport.hasCritical && (
                <div title={calendarAI.conflictReport.topConflict?.message}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 6, background: 'rgba(251,146,60,0.10)', border: '1px solid rgba(251,146,60,0.22)', cursor: 'default' }}>
                  <AlertCircle size={9} color="#FB923C" />
                  <span style={{ fontSize: 9, fontWeight: 700, color: '#FB923C', letterSpacing: '0.04em' }}>WARNING</span>
                </div>
              )}
              {/* Schedule quality dot */}
              {calendarAI.scheduleQuality && (
                <div title={`Schedule quality: ${calendarAI.scheduleQuality.score}/100 — ${calendarAI.scheduleQuality.label}`}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'default' }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: calendarAI.scheduleQuality.score >= 80 ? '#34D399' : calendarAI.scheduleQuality.score >= 60 ? '#FBBF24' : '#F87171' }} />
                  <span style={{ fontSize: 9, color: '#4B5263', fontWeight: 500 }}>{calendarAI.scheduleQuality.score}/100</span>
                </div>
              )}
              <span style={{ fontSize: 9, color: '#4B5263', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Color by</span>
              <div className="fl-calendar-toolbar-group" style={{ display: 'flex', background: '#161921', border: '1px solid #252932', borderRadius: 6, padding: 2, gap: 1 }}>
                {[{ id: 'category', label: 'Category' }, { id: 'project', label: 'Project' }, { id: 'client', label: 'Client' }].map(m => (
                  <button key={m.id} onClick={() => setLaneMode(m.id)}
                    style={{ padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: laneMode === m.id ? '#21253A' : 'transparent', color: laneMode === m.id ? '#C4B5FD' : '#6B7280', border: 'none', cursor: 'pointer', transition: 'all 0.15s' }}>
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Content area ── */}
        {mainTab !== 'entries' ? (
          mainTab === 'tasks' ? (
            <TasksWorkspace
              tasks={tasks}
              projects={projects}
              clients={clients}
              sessions={sessions}
              calEvents={calEvents}
              user={user}
              onScheduleTask={handleScheduleTask}
              onNavigate={onNavigate}
            />
          ) : mainTab === 'projects' ? (
            <ProjectsWorkspace
              projects={projects}
              tasks={tasks}
              clients={clients}
              sessions={sessions}
              calEvents={calEvents}
              user={user}
              onNavigate={onNavigate}
            />
          ) : (
            <ClientsWorkspace
              clients={clients}
              projects={projects}
              tasks={tasks}
              sessions={sessions}
              calEvents={calEvents}
              user={user}
              onNavigate={onNavigate}
            />
          )
        ) : viewMode === 'Month' ? renderMonthGrid() : (

        /* Timeline */
        <div ref={scrollRef} data-scroll className="fl-calendar-scroll" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
          <div className="fl-calendar-timeline" style={{ display: 'flex', height: `${timelineHeight}px`, position: 'relative', minHeight: '100%' }}>

            {/* ── Full-width current-time line ── */}
            {todayIsVisible && (
              <div className="pointer-events-none" style={{
                position: 'absolute', left: 0, right: 0, zIndex: 45,
                top: gridHeaderOffset + nowTop(),
                display: 'flex', alignItems: 'center',
              }}>
                {/* Time label sits inside the gutter */}
                <div style={{ width: 52, flexShrink: 0, display: 'flex', justifyContent: 'flex-end', paddingRight: 5 }}>
                  <span className="fl-calendar-now-label" style={{ fontSize: 8, fontWeight: 700, color: '#ef4444', fontVariantNumeric: 'tabular-nums', background: '#0D0F16', paddingLeft: 2, lineHeight: 1 }}>
                    {nowTimeStr()}
                  </span>
                </div>
                {/* Dot at the column boundary */}
                <div className="fl-calendar-now-dot" style={{ width: 9, height: 9, borderRadius: '50%', background: '#ef4444', flexShrink: 0, marginLeft: -4, boxShadow: '0 0 0 3px rgba(239,68,68,0.20), 0 0 12px rgba(239,68,68,0.65), 0 0 24px rgba(239,68,68,0.25)' }} />
                {/* Line spans all day columns */}
                <div className="fl-calendar-now-line" style={{ flex: 1, height: 2, background: 'linear-gradient(90deg, #ef4444EE, #ef444499, #ef444430, #ef444400)', boxShadow: '0 0 6px rgba(239,68,68,0.35)' }} />
              </div>
            )}

            {/* Hour gutter */}
            <div className="fl-calendar-gutter" style={{ width: 52, flexShrink: 0, position: 'relative', borderRight: '1px solid rgba(255,255,255,0.042)', userSelect: 'none', background: 'rgba(9,11,18,0.80)' }}>
              {HOURS.map(h => (
                <div key={h} style={{ position: 'absolute', left: 0, right: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', top: gridHeaderOffset + h * PX_PER_HOUR - 8, height: PX_PER_HOUR, paddingRight: 8 }}>
                  {h > 0 && (
                    <span style={{ fontSize: 9, color: h === new Date().getHours() && isToday() ? 'rgba(239,68,68,0.7)' : '#5B6480', fontWeight: 500, fontVariantNumeric: 'tabular-nums', lineHeight: 1, letterSpacing: '-0.01em' }}>
                      {h < 12 ? `${h}` : h === 12 ? '12' : `${h - 12}`}
                      <span style={{ fontSize: 7, marginLeft: 1, opacity: 0.75 }}>{h < 12 ? 'am' : 'pm'}</span>
                    </span>
                  )}
                </div>
              ))}
              {/* Now-time label is rendered in the full-width overlay above */}
            </div>

            {/* Day columns */}
            {viewMode === 'Day' ? (
              <DayColumn
                sessions={sessionsForDay(selectedDate)}
                calEvents={calEventsForDay(selectedDate)}
                autoSessions={autoForDay(selectedDate)}
                activeSession={activeSession}
                isToday={isToday()} nowTop={isToday() ? nowTop() : null}
                onHover={(b, r) => { setHoveredBlock(b); setHoverRect(r || null); }}
                onSelect={handleSelect}
                onContextMenu={handleContextMenu}
                laneMode={laneMode}
                date={selectedDate}
                onRangeSelect={handleRangeSelect}
                selectedBlockId={selectedBlock?.id}
                calEventStacking={prefs.calEventStacking}
                aiTitleMap={aiTitleMap}
              />
            ) : (
              /* Week view */
              <div className="fl-calendar-week" style={{ display: 'flex', flex: 1 }}>
                {getWeekDays().map((day, i) => {
                  const dayIsToday = day.toDateString() === new Date().toDateString();
                  const daySecs    = sessionsForDay(day).reduce((s, x) => s + (x.duration_seconds || 0), 0);
                  return (
                    <div className={`fl-calendar-week-day${dayIsToday ? ' is-today' : ''}`} key={i} style={{ flex: 1, position: 'relative', minWidth: 0, display: 'flex', flexDirection: 'column', borderLeft: i > 0 ? '1px solid rgba(255,255,255,0.042)' : 'none' }}>
                      {/* Day header */}
                      <div
                        className={`fl-calendar-day-header${dayIsToday ? ' is-today' : ''}`}
                        onClick={() => { setSelectedDate(new Date(day)); setViewMode('Day'); }}
                        style={{ position: prefs.calStickyHeader ? 'sticky' : 'relative', top: 0, zIndex: 40, height: DAY_HEADER_HEIGHT, textAlign: 'center', padding: '8px 4px 6px', borderBottom: dayIsToday ? '1px solid rgba(124,108,242,0.18)' : '1px solid rgba(255,255,255,0.042)', cursor: 'pointer', background: dayIsToday ? 'linear-gradient(180deg, rgba(124,108,242,0.12) 0%, rgba(124,108,242,0.05) 100%)' : 'transparent', transition: 'background 0.16s ease-out', boxShadow: dayIsToday ? 'inset 0 1px 0 rgba(124,108,242,0.12)' : 'none' }}
                        onMouseOver={e => e.currentTarget.style.background = dayIsToday ? 'linear-gradient(180deg, rgba(124,108,242,0.16) 0%, rgba(124,108,242,0.08) 100%)' : 'rgba(255,255,255,0.025)'}
                        onMouseOut={e  => e.currentTarget.style.background = dayIsToday ? 'linear-gradient(180deg, rgba(124,108,242,0.12) 0%, rgba(124,108,242,0.05) 100%)' : 'transparent'}>
                        <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: dayIsToday ? '#9D8FF5' : '#3D4555', margin: 0 }}>
                          {day.toLocaleDateString('en-US', { weekday: 'short' })}
                        </p>
                        <div style={{ width: 26, height: 26, borderRadius: '50%', margin: '2px auto 0', display: 'flex', alignItems: 'center', justifyContent: 'center', background: dayIsToday ? 'linear-gradient(135deg, #7c6cf2, #9D8FF5)' : 'transparent', boxShadow: dayIsToday ? '0 0 0 2.5px rgba(124,108,242,0.25), 0 0 12px rgba(124,108,242,0.25)' : 'none' }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: dayIsToday ? 'white' : '#9CA3AF', lineHeight: 1 }}>{day.getDate()}</span>
                        </div>
                        {daySecs > 0 && (
                          <div style={{ marginTop: 3, height: 2, background: 'rgba(255,255,255,0.05)', borderRadius: 99, overflow: 'hidden', marginLeft: 4, marginRight: 4 }}>
                            <div style={{ width: `${Math.min((daySecs / 3600 / 8) * 100, 100)}%`, height: '100%', borderRadius: 99, background: dayIsToday ? 'linear-gradient(90deg, #7c6cf2, #9D8FF5)' : '#4B5263' }} />
                          </div>
                        )}
                      </div>
                      <DayColumn
                        sessions={sessionsForDay(day)}
                        calEvents={calEventsForDay(day)}
                        autoSessions={autoForDay(day)}
                        activeSession={dayIsToday ? activeSession : null}
                        isToday={dayIsToday} nowTop={dayIsToday ? nowTop() : null}
                        onHover={(b, r) => { setHoveredBlock(b); setHoverRect(r || null); }}
                        onSelect={handleSelect}
                        onContextMenu={handleContextMenu}
                        laneMode={laneMode}
                        compact
                        date={day}
                        onRangeSelect={handleRangeSelect}
                        selectedBlockId={selectedBlock?.id}
                        calEventStacking={prefs.calEventStacking}
                        aiTitleMap={aiTitleMap}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        /* end timeline */
        )}
        {/* end content area */}
      </div>
      {/* end main area */}

      {/* ── SUMMARY PANEL ── */}
      <SummaryPanel
        user={user} categories={categories}
        selectedDate={selectedDate} activeSession={activeSession}
        onStopSession={stopSession} sessions={sessions}
        calEvents={calEvents} sources={sources}
        autoSessions={workflowAutoSessions}
        selectedBlock={selectedBlock}
        selectedBehavior={selectedBehavior}
        dayBehavior={dayBehavior}
        onAddSource={() => setShowConnect(true)}
        onRemoveSource={removeSource} onSync={syncCalendars} syncing={syncing}
        viewMode={viewMode}
        weekStartDay={weekStartDay}
        onAddEvent={handleQuickAddEvent}
        onStartFocus={handleQuickStartFocus}
        onAddTask={handleQuickAddTask}
        onAddNote={handleQuickAddNote}
        aiInsights={calendarAI.insights}
        aiProductivity={calendarAI.productivity}
        aiConflictReport={calendarAI.conflictReport}
        aiAdherence={calendarAI.adherence}
        aiFocusForecast={calendarAI.focusForecast}
        aiIsLoading={calendarAI.isLoading}
        aiLiveSuggestions={aiLiveSuggestions}
        aiDailySummary={calendarAI.dailySummary}
        aiSelectedRecap={popupAIRecap}
        aiBehavioral={adaptiveAI.summaryInsights}
        aiBehavioralKPIs={adaptiveAI.dashboardKPIs}
        aiFlowState={adaptiveAI.currentFlowState}
        aiBurnoutRisk={adaptiveAI.burnoutRisk}
        aiBurnoutFatigue={adaptiveAI.burnoutFatigue}
        aiPeakWindow={adaptiveAI.peakWindow}
        aiProductivityTrend={adaptiveAI.productivityTrend}
        aiFragmentation={adaptiveAI.fragmentation}
        aiMaturityLevel={adaptiveAI.maturityLevel}
        aiRecommendations={adaptiveAI.recommendations}
        aiForecast={adaptiveAI.forecast}
        aiCommandInput={calendarAI.commandInput}
        aiCommandPreview={calendarAI.commandPreview}
        aiCommandResult={calendarAI.commandResult}
        aiCommandLoading={calendarAI.commandLoading}
        onAIPreviewCommand={calendarAI.previewCommand}
        onAIProcessCommand={(text) => calendarAI.processCommand(text, {
          onCreateEvent: async (eventData) => {
            const startUnix     = Math.floor(new Date(eventData.start_time).getTime() / 1000);
            const endUnix       = Math.floor(new Date(eventData.end_time).getTime() / 1000);
            const durationSecs  = Math.max(0, endUnix - startUnix);
            const sessionType   = eventData.session_type ||
              (eventData.ai_category === 'meeting'   ? 'meeting'   :
               eventData.ai_category === 'deep_work' ? 'deep_work' :
               eventData.ai_category === 'break'     ? 'break'     : 'focus');
            const category      = eventData.ai_category || 'Scheduled Work';
            const title         = eventData.title || 'Scheduled Work';

            // ── Step 1: Create the session ───────────────────────────────
            let createdId = null;
            try {
              const result = await api.scheduleSession?.({
                userId: user.id, category, title, sessionType,
                startedAt: startUnix, endedAt: endUnix,
              });
              createdId = result?.id;
            } catch {}

            // Fallback: two-step start/stop if atomic handler unavailable
            if (!createdId) {
              try {
                const sess = await api.startSession?.({
                  userId: user.id, category, title, sessionType, startedAt: startUnix,
                });
                if (sess?.id) {
                  await api.stopSession?.({ sessionId: sess.id, endedAt: endUnix });
                  createdId = sess.id;
                }
              } catch {}
            }

            if (!createdId) {
              throw new Error('Event could not be saved — please use the "Add Event" button instead.');
            }

            // ── Step 2: Optimistic update — session appears immediately ──
            const optimisticSession = {
              id:               createdId,
              user_id:          user.id,
              category,
              title,
              started_at:       startUnix,
              ended_at:         endUnix,
              duration_seconds: durationSecs,
              is_deep_work:     sessionType === 'deep_work' ? 1 : 0,
              session_type:     sessionType,
              notes:            null,
              project_id:       null,
              project_name:     null,
              _isOptimistic:    true,
            };
            setSessions(prev => {
              if (prev.some(s => s.id === createdId)) return prev;
              return [...prev, optimisticSession];
            });

            // ── Step 3: Navigate to the event's date if outside view ─────
            const eventDate   = new Date(startUnix * 1000);
            const { from, to } = dateRange();
            if (startUnix < from || startUnix >= to) {
              // Outside current view — navigate there
              setSelectedDate(new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate()));
            }

            // ── Step 4: Scroll the calendar to the new block ─────────────
            requestAnimationFrame(() => {
              if (scrollRef.current) {
                const blockTopPx = (eventDate.getHours() * 60 + eventDate.getMinutes()) / 60 * PX_PER_HOUR;
                const viewH = scrollRef.current.clientHeight;
                scrollRef.current.scrollTo({ top: Math.max(0, blockTopPx - viewH / 3), behavior: 'smooth' });
              }
            });

            // ── Step 5: Background reload to hydrate the full row ────────
            loadData().catch(() => {});

            return { ...eventData, id: createdId };
          },
        })}
        onAIClearCommand={calendarAI.clearCommand}
      />

      {/* Hover tooltip — rendered via portal so it escapes any parent
          CSS transform (PageTransition) that would shift fixed positioning */}
      {hoveredBlock && hoverRect && ReactDOM.createPortal(renderTooltip(), document.body)}

      {/* Session detail popup */}
      {selectedBlock && ReactDOM.createPortal(
        <SessionPopup
          block={selectedBlock} popupApps={popupApps} popupTags={popupTags}
          projects={projects}
          aiRecap={popupAIRecap}
          aiSuggestedProject={popupAISuggestedProject}
          onClose={() => { setSelectedBlock(null); setPopupApps([]); setPopupTags([]); setPopupAIRecap(null); setPopupAISuggestedProject(null); }}
          onDelete={
            selectedBlock._type === 'session'  ? deleteSession :
            selectedBlock._type === 'calendar' ? deleteCalendarEvent :
            null
          }
          onAssignProject={
            selectedBlock._type === 'calendar' ? handleAssignProject :
            selectedBlock._type === 'session'  ? handleAssignSessionProject :
            null
          }
          onUpdate={handleUpdateBlock}
          onReschedule={(block) => { setRescheduleTarget(block); }}
        />,
        document.body
      )}

      {/* Connect dialog */}
      {showConnect && <ConnectDialog userId={user.id} onClose={() => setShowConnect(false)} onSave={addSource} />}

      {/* Schedule session modal */}
      {scheduleDraft && ReactDOM.createPortal(
        <ScheduleSessionModal
          draft={scheduleDraft}
          projects={projects}
          clients={clients}
          tasks={tasks}
          onConfirm={handleScheduleConfirm}
          onClose={() => setScheduleDraft(null)}
        />,
        document.body
      )}

      {/* ── Reschedule modal ── */}
      {rescheduleTarget && (
        <RescheduleModal
          block={rescheduleTarget}
          sessions={sessions}
          calEvents={calEvents}
          onClose={() => setRescheduleTarget(null)}
          onReschedule={handleRescheduleComplete}
        />
      )}

      {/* ── Right-click context menu ── */}
      {contextMenu && (
        <BlockContextMenu
          block={contextMenu.block}
          position={contextMenu.position}
          onClose={() => setContextMenu(null)}
          onReschedule={() => { setRescheduleTarget(contextMenu.block); setContextMenu(null); }}
          onEdit={() => { handleSelect(contextMenu.block); setContextMenu(null); }}
          onDelete={() => {
            if (contextMenu.block._type === 'session') deleteSession(contextMenu.block.id);
            else if (contextMenu.block._type === 'calendar') deleteCalendarEvent(contextMenu.block.id);
            setContextMenu(null);
          }}
          onDuplicate={() => {
            const b = contextMenu.block;
            setContextMenu(null);
            // Open schedule draft with same title/time for easy duplication
            const start = b._type === 'calendar' ? b.start_time : b.started_at;
            const end   = b._type === 'calendar' ? b.end_time   : (b.ended_at || (b.started_at + (b.duration_seconds || 3600)));
            setScheduleDraft({ startUnix: start, endUnix: end, label: b.title || b.category || '', date: new Date(start * 1000) });
          }}
        />
      )}

      {/* ── Reschedule undo toast ── */}
      {rescheduleUndo && (
        <RescheduleToast
          data={rescheduleUndo}
          onUndo={handleRescheduleUndo}
          onDismiss={() => setRescheduleUndo(null)}
        />
      )}
    </div>
  );
}
