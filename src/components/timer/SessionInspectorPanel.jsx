import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  X, Pencil, Trash2, GitMerge, Scissors, Briefcase, Users, Tag,
  Clock, Zap, Activity, Sparkles, ChevronDown,
  Gauge, Radio, MousePointer2, Coffee, Target,
} from 'lucide-react';
import { formatDuration, formatTime, formatDate, getCategoryColor } from '../../utils/helpers';
import { finalizeSessionIntelligence, detectMergeableSessionGroup } from '../../ai/timer/timerAIEngine.js';

const api = window.electron || {};

function useThemeLight() {
  const [isLight, setIsLight] = useState(() => document.documentElement.classList.contains('theme-light'));
  useEffect(() => {
    const obs = new MutationObserver(() => setIsLight(document.documentElement.classList.contains('theme-light')));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  return isLight;
}

function scoreMeta(n) {
  if (n >= 85) return { color: '#34D399', label: 'Excellent' };
  if (n >= 70) return { color: '#60a5fa', label: 'Good' };
  if (n >= 50) return { color: '#f59e0b', label: 'Fair' };
  return { color: '#f87171', label: 'Low' };
}

function productivityLabel(session) {
  const cat = (session.category || '').toLowerCase();
  if (cat.includes('meeting')) return { label: 'Meeting', color: '#f87171', Icon: Users };
  if (cat.includes('break'))   return { label: 'Break', color: '#94a3b8', Icon: Coffee };
  if (session.is_deep_work)    return { label: 'Deep Work', color: '#FBBF24', Icon: Zap };
  return { label: 'Shallow Work', color: '#60a5fa', Icon: Activity };
}

function findMergeCandidate(session, allSessions) {
  if (!session?.ended_at) return null;
  // Never merge with the currently-running session — it has no ended_at yet
  // and is tracked separately by the live timer; merging would corrupt it.
  const closed = allSessions.filter(s => !!s.ended_at);
  const groups = detectMergeableSessionGroup(closed) || [];
  for (const g of groups) {
    const idx = g.findIndex(s => s.id === session.id);
    if (idx === -1) continue;
    return g[idx + 1] || g[idx - 1] || null;
  }
  return null;
}

// ─── App timeline aggregation from overlapping auto-sessions ──────────────────
const APP_PALETTE = ['#6366f1', '#34d399', '#f59e0b', '#a78bfa', '#f87171', '#60a5fa', '#fb923c', '#38bdf8'];
function aggregateApps(autoSessions = []) {
  const byApp = new Map();
  for (const s of autoSessions) {
    const name = (s.app_name || 'Unknown').replace(/\.exe$/i, '');
    byApp.set(name, (byApp.get(name) || 0) + (s.duration_seconds || 0));
  }
  return [...byApp.entries()]
    .map(([name, secs], i) => ({ name, secs, color: APP_PALETTE[i % APP_PALETTE.length] }))
    .sort((a, b) => b.secs - a.secs)
    .slice(0, 6);
}

// ─── Inline picker (category / project / client) ──────────────────────────────
function InlinePicker({ open, onClose, options, onPick, anchorRef, isLight }) {
  if (!open) return null;
  return (
    <div
      className="absolute z-20 mt-1 max-h-56 w-56 overflow-y-auto rounded-xl border p-1 shadow-2xl"
      style={{
        background: isLight ? '#FFFFFF' : '#15181F',
        borderColor: isLight ? 'rgba(107,92,242,0.16)' : 'rgba(255,255,255,0.08)',
      }}
    >
      {options.length === 0 && (
        <p className="px-2.5 py-2 text-[11px] text-tx-faint">No options available</p>
      )}
      {options.map(opt => (
        <button
          key={opt.id ?? 'none'}
          onClick={() => { onPick(opt); onClose(); }}
          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12px] font-medium text-tx-primary hover:bg-bg-hover"
        >
          {opt.color && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: opt.color }} />}
          <span className="truncate">{opt.label}</span>
        </button>
      ))}
    </div>
  );
}

export default function SessionInspectorPanel({
  session, userId, categories = [], projects = [], clients = [], recentSessions = [],
  onClose, onAfterMutate,
}) {
  const isLight = useThemeLight();
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const closeTimer = useRef(null);

  const [titleDraft, setTitleDraft]   = useState('');
  const [editingTitle, setEditingTitle] = useState(false);
  const [notesDraft, setNotesDraft]   = useState('');
  const [notesSaved, setNotesSaved]   = useState(true);
  const [openPicker, setOpenPicker]   = useState(null); // 'category' | 'project' | 'client' | null
  const [intel, setIntel]             = useState(null);
  const [autoSessions, setAutoSessions] = useState([]);
  const [intelLoading, setIntelLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const notesTimer = useRef(null);
  const panelRef = useRef(null);

  // ── Mount / slide animation ─────────────────────────────────────────────────
  useEffect(() => {
    if (session) {
      clearTimeout(closeTimer.current);
      setMounted(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
    } else if (mounted) {
      setVisible(false);
      closeTimer.current = setTimeout(() => setMounted(false), 320);
    }
    return () => clearTimeout(closeTimer.current);
  }, [session]);

  // ── Sync local draft state whenever the selected session changes ───────────
  useEffect(() => {
    if (!session) return;
    setTitleDraft(session.title || session.category || '');
    setEditingTitle(false);
    setNotesDraft(session.notes && !String(session.notes).startsWith('__') ? session.notes : '');
    setNotesSaved(true);
    setOpenPicker(null);
  }, [session?.id]);

  // ── Esc to close ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!session) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [session, onClose]);

  // ── Fetch overlapping auto-tracked activity + compute AI intelligence ──────
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    setIntel(null);
    setAutoSessions([]);
    setIntelLoading(true);
    (async () => {
      try {
        const from = session.started_at;
        const to   = session.ended_at || Math.floor(Date.now() / 1000);
        const list = await api.autoSessionsRange?.({ userId, from, to }).catch(() => []) || [];
        if (cancelled) return;
        setAutoSessions(list);
        const result = finalizeSessionIntelligence({
          session: { ...session, duration_seconds: session.duration_seconds || (to - from) },
          autoSessions: list,
          recentSessions,
        });
        if (!cancelled) setIntel(result);
      } finally {
        if (!cancelled) setIntelLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [session?.id, session?.started_at, session?.ended_at, userId, recentSessions]);

  const apps = useMemo(() => aggregateApps(autoSessions), [autoSessions]);
  const mergeCandidate = useMemo(
    () => session ? findMergeCandidate(session, recentSessions) : null,
    [session, recentSessions]
  );

  if (!mounted) return null;

  const sColor = getCategoryColor(session?.category, categories);
  const prod = session ? productivityLabel(session) : null;
  const isRunning = session && !session.ended_at;
  const fScore = intel?.focusQuality?.overall ?? null;
  const fMeta = fScore != null ? scoreMeta(fScore) : null;

  // ── Mutations ────────────────────────────────────────────────────────────────
  const saveField = async (patch) => {
    if (!session) return;
    setBusy(true);
    try {
      await api.updateSession?.({
        sessionId: session.id,
        title:     patch.title     ?? session.title     ?? null,
        category:  patch.category  ?? session.category  ?? null,
        notes:     patch.notes     ?? session.notes      ?? null,
        projectId: patch.projectId !== undefined ? patch.projectId : (session.project_id || null),
        clientId:  patch.clientId  !== undefined ? patch.clientId  : (session.client_id  || null),
      });
      onAfterMutate?.(session.id);
    } finally {
      setBusy(false);
    }
  };

  const handleNotesChange = (val) => {
    setNotesDraft(val);
    setNotesSaved(false);
    clearTimeout(notesTimer.current);
    notesTimer.current = setTimeout(async () => {
      await saveField({ notes: val });
      setNotesSaved(true);
    }, 700);
  };

  const handleDelete = async () => {
    if (!session) return;
    if (!window.confirm('Delete this session? This cannot be undone.')) return;
    setBusy(true);
    try {
      await api.deleteSession?.({ sessionId: session.id });
      onAfterMutate?.(null);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const handleMerge = async () => {
    if (!session || !mergeCandidate) return;
    setBusy(true);
    try {
      const [first, second] = session.started_at <= mergeCandidate.started_at
        ? [session, mergeCandidate] : [mergeCandidate, session];
      await api.updateSessionTime?.({ sessionId: first.id, startedAt: first.started_at, endedAt: second.ended_at });
      await api.deleteSession?.({ sessionId: second.id });
      onAfterMutate?.(first.id);
    } finally {
      setBusy(false);
    }
  };

  const handleSplit = async () => {
    if (!session || !session.ended_at) return;
    const mid = session.started_at + Math.floor((session.ended_at - session.started_at) / 2);
    if (mid <= session.started_at || mid >= session.ended_at) return;
    setBusy(true);
    try {
      await api.updateSessionTime?.({ sessionId: session.id, startedAt: session.started_at, endedAt: mid });
      await api.scheduleSession?.({
        userId, category: session.category, title: session.title,
        projectId: session.project_id || null, clientId: session.client_id || null,
        taskId: session.task_id || null, sessionType: session.session_type || 'focus',
        startedAt: mid, endedAt: session.ended_at, notes: session.notes || null,
      });
      onAfterMutate?.(session.id);
    } finally {
      setBusy(false);
    }
  };

  const canSplit = session && session.ended_at && (session.duration_seconds || 0) >= 120;

  // Inline inspector — lives as a flex sibling next to the Session Log (not a
  // portal/overlay), so it only ever occupies the Timer content area and the
  // Session Log naturally reflows to share the row instead of being covered.
  return (
    <div
      style={{
        width: visible ? 360 : 0,
        opacity: visible ? 1 : 0,
        flexShrink: 0,
        overflow: 'hidden',
        transition: 'width 260ms cubic-bezier(0.16,1,0.3,1), opacity 200ms ease',
      }}
    >
      <style>{`
        @keyframes fl-insp-pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
      `}</style>

      <div
        ref={panelRef}
        className="fl-card flex h-full flex-col overflow-hidden"
        style={{
          width: 360,
          boxShadow: isLight
            ? '-6px 0 20px rgba(83,71,199,0.06)'
            : '-6px 0 20px rgba(0,0,0,0.20)',
        }}
      >
        {!session ? null : (
          <>
            {/* ── Header ───────────────────────────────────────────────── */}
            <div className="shrink-0 border-b px-5 py-4" style={{ borderColor: isLight ? 'rgba(107,92,242,0.10)' : 'rgba(255,255,255,0.06)' }}>
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-sm font-extrabold"
                    style={{ background: `${sColor}1c`, color: sColor, border: `1px solid ${sColor}35` }}
                  >
                    {(session.category || '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: sColor }}>
                      {session.category || 'Session'}
                    </p>
                    {editingTitle ? (
                      <input
                        autoFocus
                        value={titleDraft}
                        onChange={e => setTitleDraft(e.target.value)}
                        onBlur={() => { setEditingTitle(false); if (titleDraft.trim() && titleDraft !== session.title) saveField({ title: titleDraft.trim() }); }}
                        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                        className="w-full rounded-md border border-accent/40 bg-bg-input px-1.5 py-0.5 text-[14px] font-bold text-tx-primary outline-none"
                      />
                    ) : (
                      <p
                        onClick={() => setEditingTitle(true)}
                        className="cursor-text truncate text-[14px] font-bold text-tx-primary hover:underline decoration-dotted"
                        title="Click to rename"
                      >
                        {session.title || session.category}
                      </p>
                    )}
                  </div>
                </div>
                <button onClick={onClose} className="shrink-0 rounded-lg p-1.5 text-tx-faint hover:bg-bg-hover hover:text-tx-primary transition">
                  <X size={16} />
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {isRunning && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-status-green/12 px-2 py-0.5 text-[10px] font-bold text-status-green">
                    <Radio size={9} className="animate-pulse" />Live
                  </span>
                )}
                {prod && (
                  <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold" style={{ background: `${prod.color}16`, color: prod.color }}>
                    <prod.Icon size={9} />{prod.label}
                  </span>
                )}
                <span className="inline-flex items-center gap-1 rounded-md bg-bg-hover px-2 py-0.5 text-[10px] font-bold text-tx-faint">
                  <MousePointer2 size={9} />Manual
                </span>
              </div>
            </div>

            {/* ── Quick actions ────────────────────────────────────────── */}
            <div className="shrink-0 flex items-center gap-1.5 border-b px-4 py-2.5" style={{ borderColor: isLight ? 'rgba(107,92,242,0.08)' : 'rgba(255,255,255,0.05)' }}>
              {[
                { label: 'Edit', Icon: Pencil, onClick: () => setEditingTitle(true) },
                { label: 'Category', Icon: Tag, onClick: () => setOpenPicker(p => p === 'category' ? null : 'category') },
                { label: 'Project', Icon: Briefcase, onClick: () => setOpenPicker(p => p === 'project' ? null : 'project') },
                { label: 'Split', Icon: Scissors, onClick: handleSplit, disabled: !canSplit },
                { label: 'Merge', Icon: GitMerge, onClick: handleMerge, disabled: !mergeCandidate },
              ].map(a => (
                <button
                  key={a.label}
                  disabled={busy || a.disabled}
                  onClick={a.onClick}
                  title={a.label}
                  className="flex items-center gap-1 rounded-lg border border-brd-subtle bg-bg-input px-2 py-1.5 text-[10px] font-bold text-tx-secondary transition hover:bg-bg-hover hover:text-tx-primary disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <a.Icon size={11} />{a.label}
                </button>
              ))}
              <button
                disabled={busy}
                onClick={handleDelete}
                title="Delete"
                className="ml-auto flex items-center gap-1 rounded-lg border border-status-red/25 bg-status-red/8 px-2 py-1.5 text-[10px] font-bold text-status-red transition hover:bg-status-red/15 disabled:opacity-30"
              >
                <Trash2 size={11} />Delete
              </button>
            </div>

            {/* ── Scrollable body ─────────────────────────────────────── */}
            <div className="fl-thin-scroll flex-1 overflow-y-auto px-5 py-4 space-y-5">

              {/* Key facts grid */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="relative">
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-tx-faint">Project</p>
                  <button onClick={() => setOpenPicker(p => p === 'project' ? null : 'project')}
                    className="flex w-full items-center gap-1.5 rounded-lg border border-brd-subtle bg-bg-input px-2.5 py-1.5 text-left text-[12px] font-semibold text-tx-primary hover:border-brd-hover">
                    <Briefcase size={11} className="shrink-0 text-tx-faint" />
                    <span className="truncate">{session.project_name || 'Unassigned'}</span>
                    <ChevronDown size={11} className="ml-auto shrink-0 text-tx-faint" />
                  </button>
                  <InlinePicker
                    open={openPicker === 'project'} onClose={() => setOpenPicker(null)} isLight={isLight}
                    options={[{ id: null, label: 'Unassigned' }, ...projects.map(p => ({ id: p.id, label: p.name, color: p.color }))]}
                    onPick={(opt) => saveField({ projectId: opt.id })}
                  />
                </div>

                <div className="relative">
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-tx-faint">Client</p>
                  <button onClick={() => setOpenPicker(p => p === 'client' ? null : 'client')}
                    className="flex w-full items-center gap-1.5 rounded-lg border border-brd-subtle bg-bg-input px-2.5 py-1.5 text-left text-[12px] font-semibold text-tx-primary hover:border-brd-hover">
                    <Users size={11} className="shrink-0 text-tx-faint" />
                    <span className="truncate">{session.client_name || 'Unassigned'}</span>
                    <ChevronDown size={11} className="ml-auto shrink-0 text-tx-faint" />
                  </button>
                  <InlinePicker
                    open={openPicker === 'client'} onClose={() => setOpenPicker(null)} isLight={isLight}
                    options={[{ id: null, label: 'Unassigned' }, ...clients.map(c => ({ id: c.id, label: c.name, color: c.color }))]}
                    onPick={(opt) => saveField({ clientId: opt.id })}
                  />
                </div>

                <div className="relative col-span-2">
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-tx-faint">Category</p>
                  <button onClick={() => setOpenPicker(p => p === 'category' ? null : 'category')}
                    className="flex w-full items-center gap-1.5 rounded-lg border border-brd-subtle bg-bg-input px-2.5 py-1.5 text-left text-[12px] font-semibold text-tx-primary hover:border-brd-hover">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: sColor }} />
                    <span className="truncate">{session.category}</span>
                    <ChevronDown size={11} className="ml-auto shrink-0 text-tx-faint" />
                  </button>
                  <InlinePicker
                    open={openPicker === 'category'} onClose={() => setOpenPicker(null)} isLight={isLight}
                    options={categories.map(c => ({ id: c.name, label: c.name, color: c.color }))}
                    onPick={(opt) => saveField({ category: opt.id })}
                  />
                </div>
              </div>

              {/* Timing */}
              <div className="rounded-xl border border-brd-subtle bg-bg-input p-3.5 space-y-2">
                <div className="flex items-center justify-between text-[12px]">
                  <span className="flex items-center gap-1.5 text-tx-faint"><Clock size={11} />Start</span>
                  <span className="font-semibold text-tx-primary">{formatDate(session.started_at)} · {formatTime(session.started_at)}</span>
                </div>
                <div className="flex items-center justify-between text-[12px]">
                  <span className="flex items-center gap-1.5 text-tx-faint"><Clock size={11} />End</span>
                  <span className="font-semibold text-tx-primary">
                    {session.ended_at ? `${formatDate(session.ended_at)} · ${formatTime(session.ended_at)}` : <span className="text-status-green">In progress</span>}
                  </span>
                </div>
                <div className="flex items-center justify-between border-t border-brd-subtle/60 pt-2 text-[12px]">
                  <span className="flex items-center gap-1.5 font-bold text-tx-secondary"><Gauge size={11} />Duration</span>
                  <span className="font-mono text-[13px] font-extrabold" style={{ color: sColor }}>{formatDuration(session.duration_seconds)}</span>
                </div>
              </div>

              {/* Focus score / quality */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="rounded-xl border border-brd-subtle bg-bg-input p-3.5 text-center">
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-tx-faint">Focus Score</p>
                  {intelLoading ? (
                    <div className="mx-auto h-6 w-10 rounded bg-bg-hover" style={{ animation: 'fl-insp-pulse 1.2s ease-in-out infinite' }} />
                  ) : (
                    <p className="text-xl font-extrabold" style={{ color: fMeta?.color || '#94a3b8' }}>{fScore ?? '—'}</p>
                  )}
                </div>
                <div className="rounded-xl border border-brd-subtle bg-bg-input p-3.5 text-center">
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-tx-faint">Activity Quality</p>
                  {intelLoading ? (
                    <div className="mx-auto h-6 w-16 rounded bg-bg-hover" style={{ animation: 'fl-insp-pulse 1.2s ease-in-out infinite' }} />
                  ) : (
                    <p className="text-sm font-extrabold" style={{ color: fMeta?.color || '#94a3b8' }}>{fMeta?.label || intel?.focusQuality?.label || '—'}</p>
                  )}
                </div>
              </div>

              {/* Tracked activity / timeline */}
              {apps.length > 0 && (
                <div>
                  <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-tx-faint">
                    <Activity size={11} />Tracked Activity
                  </p>
                  <div className="mb-2 flex h-2 w-full overflow-hidden rounded-full bg-bg-input">
                    {apps.map(a => (
                      <div key={a.name} style={{ width: `${Math.max(2, (a.secs / apps.reduce((s, x) => s + x.secs, 0)) * 100)}%`, background: a.color }} title={a.name} />
                    ))}
                  </div>
                  <div className="space-y-1">
                    {apps.map(a => (
                      <div key={a.name} className="flex items-center gap-2 text-[11px]">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: a.color }} />
                        <span className="truncate text-tx-secondary font-medium">{a.name}</span>
                        <span className="ml-auto shrink-0 font-mono text-tx-faint">{formatDuration(a.secs)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* AI insights */}
              {(intelLoading || intel) && (
                <div className="rounded-xl border border-accent/20 bg-accent/[0.05] p-3.5">
                  <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-accent">
                    <Sparkles size={11} />AI Insights
                  </p>
                  {intelLoading ? (
                    <div className="space-y-1.5">
                      <div className="h-2.5 w-full rounded bg-bg-hover" style={{ animation: 'fl-insp-pulse 1.2s ease-in-out infinite' }} />
                      <div className="h-2.5 w-3/4 rounded bg-bg-hover" style={{ animation: 'fl-insp-pulse 1.2s ease-in-out infinite' }} />
                    </div>
                  ) : (
                    <>
                      {intel.description && (
                        <p className="mb-2 text-[12px] leading-relaxed text-tx-secondary">{intel.description}</p>
                      )}
                      {(intel.insights || []).slice(0, 4).map((it, i) => (
                        <div key={i} className="flex items-start gap-1.5 py-0.5 text-[11.5px]">
                          <Target size={10} className="mt-0.5 shrink-0 text-accent/70" />
                          <span className="text-tx-faint">{it.label}: </span>
                          <span className="font-semibold text-tx-secondary">{it.value}</span>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}

              {/* Tags */}
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-tx-faint">
                  <Tag size={11} />Tags
                </p>
                <div className="flex flex-wrap gap-1.5">
                  <span className="rounded-md px-2 py-0.5 text-[10px] font-bold" style={{ background: `${sColor}16`, color: sColor }}>{session.category}</span>
                  {session.is_deep_work && <span className="rounded-md bg-status-amber/12 px-2 py-0.5 text-[10px] font-bold text-status-amber">Deep Work</span>}
                  {session.project_name && <span className="rounded-md bg-accent/10 px-2 py-0.5 text-[10px] font-bold text-accent">{session.project_name}</span>}
                  {session.client_name && <span className="rounded-md bg-status-blue/10 px-2 py-0.5 text-[10px] font-bold text-status-blue">{session.client_name}</span>}
                </div>
              </div>

              {/* Notes */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-tx-faint">Notes</p>
                  <span className="text-[10px] text-tx-faint">{notesSaved ? (notesDraft ? 'Saved' : '') : 'Saving…'}</span>
                </div>
                <textarea
                  value={notesDraft}
                  onChange={e => handleNotesChange(e.target.value)}
                  placeholder="Add notes about this session…"
                  rows={3}
                  className="w-full resize-none rounded-lg border border-brd-subtle bg-bg-input px-2.5 py-2 text-[12px] text-tx-primary placeholder:text-tx-faint outline-none focus:border-accent/50"
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
