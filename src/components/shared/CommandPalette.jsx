import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Search, Calendar, Timer, BarChart2, Briefcase, Users,
  FileText, Cpu, Settings, Play, Music, Coffee, Zap,
  ChevronRight, TrendingUp, Shield, Clock, FolderOpen,
  User, Loader2, History, CheckSquare, Ban, StickyNote,
  Flame, ArrowDownUp, CornerDownLeft, Square, LineChart,
  Activity, ListChecks,
} from 'lucide-react';

const api = window.electron || {};
const callApi = (name, fallback, payload) => {
  const fn = api[name];
  return typeof fn === 'function' ? fn(payload) : Promise.resolve(fallback);
};

const RECENT_KEY = 'fl_recent_pages';
const MAX_RECENT = 5;

const CATEGORY_META = [
  { id: 'recent', label: 'Recent', Icon: History },
  { id: 'analytics', label: 'Analytics', Icon: LineChart },
  { id: 'focus', label: 'Focus & Productivity', Icon: Zap },
  { id: 'calendar', label: 'Calendar & Sessions', Icon: Calendar },
  { id: 'projects', label: 'Projects & Tasks', Icon: ListChecks },
  { id: 'reports', label: 'Reports', Icon: FileText },
  { id: 'settings', label: 'Settings & Tools', Icon: Settings },
];

const COMMANDS = [
  { id: 'nav-blocker', label: 'Distraction Blocker', sublabel: 'Focus Suite', group: 'focus', Icon: Shield, page: 'blocker', accent: '#34D399' },
  { id: 'nav-productivity', label: 'Productivity Score', sublabel: 'Insights', group: 'focus', Icon: Zap, page: 'productivity', accent: '#A78BFA' },
  { id: 'nav-profitability', label: 'Profitability', sublabel: 'Insights', group: 'analytics', Icon: TrendingUp, page: 'profitability', accent: '#34D399' },
  { id: 'nav-heatmap', label: 'Activity Heatmap', sublabel: 'Insights', group: 'analytics', Icon: Calendar, page: 'heatmap', accent: '#8B5CF6' },
  { id: 'nav-reports', label: 'Reports', sublabel: 'Insights', group: 'reports', Icon: FileText, page: 'reports', accent: '#60A5FA' },
  { id: 'nav-calendar', label: 'Calendar', sublabel: 'Plan and compare your day', group: 'calendar', Icon: Calendar, page: 'calendar', accent: '#818CF8' },
  { id: 'nav-timer', label: 'Timer', sublabel: 'Track a session', group: 'calendar', Icon: Timer, page: 'tracker', accent: '#34D399' },
  { id: 'nav-activity', label: 'Activity', sublabel: 'Captured apps and windows', group: 'analytics', Icon: Cpu, page: 'activity', accent: '#60A5FA' },
  { id: 'nav-projects', label: 'Projects', sublabel: 'Project workspace', group: 'projects', Icon: Briefcase, page: 'projects', accent: '#5BA7FF' },
  { id: 'nav-clients', label: 'Clients', sublabel: 'Client directory', group: 'projects', Icon: Users, page: 'clients', accent: '#F27C8A' },
  { id: 'nav-tasks', label: 'Tasks', sublabel: 'Project to-dos', group: 'projects', Icon: CheckSquare, page: 'tasks', accent: '#F2B84B' },
  { id: 'nav-settings', label: 'Settings', sublabel: 'Workspace tools', group: 'settings', Icon: Settings, page: 'settings', accent: '#94A3B8' },
];

const QUICK_ACTIONS = [
  { id: 'quick-start', label: 'Start Focus Session', Icon: Play, action: 'start-session', key: 'S', accent: '#34D399' },
  { id: 'quick-task', label: 'Add Task', Icon: CheckSquare, page: 'tasks', key: 'T', accent: '#A78BFA' },
  { id: 'quick-log', label: 'Log Time', Icon: Flame, page: 'tracker', key: 'L', accent: '#F97316' },
  { id: 'quick-project', label: 'New Project', Icon: Briefcase, page: 'projects', key: 'P', accent: '#60A5FA' },
  { id: 'quick-block', label: 'Block Website', Icon: Ban, page: 'blocker', key: 'B', accent: '#F87171' },
  { id: 'quick-note', label: 'Add Note', Icon: StickyNote, action: 'take-break', key: 'N', accent: '#FACC15' },
];

function getRecent() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); }
  catch { return []; }
}

export function pushRecentPage(page, label) {
  const list = getRecent().filter(r => r.page !== page);
  list.unshift({ page, label, ts: Date.now() });
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, MAX_RECENT))); }
  catch { /* ignore storage failures */ }
}

function CommandIcon({ Icon, accent, active }) {
  return (
    <div
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border"
      style={{
        color: accent,
        background: active ? `${accent}24` : `${accent}16`,
        borderColor: active ? `${accent}42` : `${accent}22`,
        boxShadow: active ? `0 0 24px ${accent}16` : 'none',
      }}
    >
      <Icon size={18} />
    </div>
  );
}

function Keycap({ children }) {
  return (
    <kbd className="flex h-7 min-w-7 items-center justify-center rounded-md border border-white/[0.10] bg-white/[0.055] px-2 text-[11px] font-bold text-tx-secondary shadow-inner">
      {children}
    </kbd>
  );
}

export default function CommandPalette({ user, onNavigate, onAction, activeSession, onClose }) {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(0);
  const [activeCategory, setActiveCategory] = useState('recent');
  const [liveResults, setLiveResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const searchTimer = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { setFocused(0); }, [query, activeCategory]);

  const recentCommands = useMemo(() => {
    const recent = getRecent()
      .map(r => {
        const match = COMMANDS.find(c => c.page === r.page);
        return match ? { ...match, id: `recent-${match.id}`, group: 'recent' } : null;
      })
      .filter(Boolean);
    return recent.length ? recent : COMMANDS.slice(0, 5).map(c => ({ ...c, group: 'recent' }));
  }, []);

  useEffect(() => {
    clearTimeout(searchTimer.current);
    if (query.trim().length < 2 || !user?.id) {
      setLiveResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const q = query.trim().toLowerCase();
        const now = Math.floor(Date.now() / 1000);
        const [sessions, projects, clients] = await Promise.all([
          callApi('listSessions', [], { userId: user.id, from: now - 30 * 86400, to: now }).catch(() => []),
          callApi('listProjects', [], { userId: user.id }).catch(() => []),
          callApi('listClients', [], { userId: user.id }).catch(() => []),
        ]);

        const results = [];
        (sessions || [])
          .filter(s => (s.title || s.category || '').toLowerCase().includes(q))
          .slice(0, 4)
          .forEach(s => results.push({
            id: `session-${s.id}`,
            label: s.title || s.category || 'Session',
            sublabel: s.project_name || 'Session',
            group: 'calendar',
            Icon: Clock,
            page: 'activity',
            accent: '#94A3B8',
          }));

        (projects || [])
          .filter(p => (p.name || '').toLowerCase().includes(q))
          .slice(0, 4)
          .forEach(p => results.push({
            id: `project-${p.id}`,
            label: p.name,
            sublabel: p.client_name || 'Project',
            group: 'projects',
            Icon: FolderOpen,
            page: 'projects',
            accent: p.color || '#60A5FA',
          }));

        (clients || [])
          .filter(c => (c.name || '').toLowerCase().includes(q))
          .slice(0, 4)
          .forEach(c => results.push({
            id: `client-${c.id}`,
            label: c.name,
            sublabel: c.email || 'Client',
            group: 'projects',
            Icon: User,
            page: 'clients',
            accent: c.color || '#F27C8A',
          }));

        setLiveResults(results);
      } catch {
        setLiveResults([]);
      } finally {
        setSearching(false);
      }
    }, 180);

    return () => clearTimeout(searchTimer.current);
  }, [query, user?.id]);

  const filteredCommands = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length >= 2) {
      const staticMatches = COMMANDS.filter(c =>
        c.label.toLowerCase().includes(q) ||
        c.sublabel.toLowerCase().includes(q) ||
        CATEGORY_META.find(cat => cat.id === c.group)?.label.toLowerCase().includes(q)
      );
      return [...liveResults, ...staticMatches];
    }
    if (activeCategory === 'recent') return recentCommands;
    return COMMANDS.filter(c => c.group === activeCategory);
  }, [query, liveResults, activeCategory, recentCommands]);

  const visibleQuickActions = query.trim().length >= 2
    ? QUICK_ACTIONS.filter(a => a.label.toLowerCase().includes(query.trim().toLowerCase()))
    : QUICK_ACTIONS;

  const keyboardItems = useMemo(
    () => [...filteredCommands, ...visibleQuickActions],
    [filteredCommands, visibleQuickActions]
  );

  const execute = useCallback((item) => {
    if (!item) return;
    if (item.action) onAction?.(item.action);
    if (item.page) {
      pushRecentPage(item.page, item.label);
      onNavigate?.(item.page);
    }
    onClose();
  }, [onAction, onNavigate, onClose]);

  const handleKey = (e) => {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (keyboardItems.length > 0) setFocused(f => Math.min(f + 1, keyboardItems.length - 1));
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (keyboardItems.length > 0) setFocused(f => Math.max(f - 1, 0));
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      execute(keyboardItems[focused]);
    }
  };

  useEffect(() => {
    const el = listRef.current?.querySelector('[data-focused="true"]');
    el?.scrollIntoView({ block: 'nearest' });
  }, [focused]);

  const resultCount = keyboardItems.length;

  return (
    <div className="fixed inset-0 z-[9998] flex items-start justify-center px-4 pt-8">
      <div className="cp-backdrop-overlay absolute inset-0 bg-black/65 backdrop-blur-md" onClick={onClose} />

      <div
        className="fl-command-palette relative z-10 w-full max-w-[640px] overflow-hidden rounded-2xl border border-[#273044] bg-[#0B1019]/95 text-white scale-in"
        style={{
          boxShadow: '0 28px 90px rgba(0,0,0,0.68), 0 0 0 1px rgba(124,108,242,0.20), inset 0 1px 0 rgba(255,255,255,0.06)',
          backgroundImage: 'radial-gradient(circle at 18% 8%, rgba(124,108,242,0.18), transparent 22rem), radial-gradient(circle at 86% 26%, rgba(96,165,250,0.08), transparent 18rem), linear-gradient(145deg, rgba(12,17,27,0.98), rgba(8,13,21,0.98))',
        }}
      >
        <div className="flex h-[58px] items-center gap-3 border-b border-white/[0.075] px-5">
          {searching
            ? <Loader2 size={18} className="shrink-0 animate-spin text-accent" />
            : <Search size={18} className="shrink-0 text-[#A8B3C7]" />
          }
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Search commands, projects, sessions..."
            className="min-w-0 flex-1 bg-transparent text-[14px] font-medium text-white placeholder-[#A8B3C7] outline-none"
          />
          <button
            onClick={onClose}
            className="flex h-8 min-w-8 items-center justify-center rounded-lg border border-white/[0.10] bg-white/[0.055] px-2 text-[10px] font-bold text-[#C8D0E0] shadow-inner transition hover:bg-white/[0.09] hover:text-white"
          >
            ESC
          </button>
        </div>

        {activeSession && (
          <div className="flex items-center gap-2 border-b border-white/[0.075] bg-green-400/[0.08] px-5 py-2 text-[11px] font-semibold text-green-200">
            <span className="h-1.5 w-1.5 rounded-full bg-green-300 pulse-dot" />
            Recording: {activeSession.title || activeSession.category || 'Active session'}
            <button onClick={() => execute({ action: 'stop-session' })} className="ml-auto rounded-md border border-red-400/20 bg-red-400/10 px-2 py-1 text-red-200 hover:bg-red-400/15">
              <Square size={10} className="mr-1 inline" /> Stop
            </button>
          </div>
        )}

        <div className="grid min-h-[398px] grid-cols-[190px_1fr]">
          <aside className="border-r border-white/[0.075] px-3 py-4">
            <p className="mb-3 px-2 text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#A8B3C7]">Categories</p>
            <div className="space-y-1">
              {CATEGORY_META.map(cat => {
                const isActive = activeCategory === cat.id && query.trim().length < 2;
                return (
                  <button
                    key={cat.id}
                    onClick={() => { setActiveCategory(cat.id); setQuery(''); }}
                    className={`flex h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left transition ${
                      isActive
                        ? 'bg-[#211D4B]/85 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
                        : 'text-[#A8B3C7] hover:bg-white/[0.045] hover:text-white'
                    }`}
                  >
                    <span className={`flex h-7 w-7 items-center justify-center rounded-lg border ${
                      isActive ? 'border-[#8B7CF6]/35 bg-[#7c6cf2]/25 text-[#A78BFA]' : 'border-white/[0.08] bg-white/[0.055] text-[#A8B3C7]'
                    }`}>
                      <cat.Icon size={14} />
                    </span>
                    <span className="truncate text-[12px] font-bold">{cat.label}</span>
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="min-w-0 px-3.5 py-4">
            <div ref={listRef} className="max-h-[252px] overflow-y-auto pr-1">
              <p className="mb-2.5 px-1 text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#A8B3C7]">
                {query.trim().length >= 2 ? 'Results' : CATEGORY_META.find(c => c.id === activeCategory)?.label}
              </p>

              <div className="space-y-1">
                {filteredCommands.map((cmd, index) => {
                  const active = focused === index;
                  return (
                    <button
                      key={cmd.id}
                      data-focused={active ? 'true' : undefined}
                      onClick={() => execute(cmd)}
                      onMouseEnter={() => setFocused(index)}
                        className={`group flex min-h-[48px] w-full items-center gap-3 rounded-lg px-2.5 text-left transition ${
                        active ? 'bg-[#211D4B]/85 text-white' : 'hover:bg-white/[0.045]'
                      }`}
                    >
                      <CommandIcon Icon={cmd.Icon} accent={cmd.accent} active={active} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-extrabold text-white">{cmd.label}</span>
                        <span className="mt-0.5 block truncate text-[11px] font-medium text-[#A8B3C7]">{cmd.sublabel}</span>
                      </span>
                      {active ? (
                        <ChevronRight size={16} className="text-[#B69CFF]" />
                      ) : cmd.page ? (
                        <CornerDownLeft size={13} className="mr-1 opacity-0 text-[#A8B3C7] transition group-hover:opacity-100" />
                      ) : null}
                    </button>
                  );
                })}

                {filteredCommands.length === 0 && (
                  <div className="flex h-36 flex-col items-center justify-center text-center">
                    <Search size={28} className="mb-3 text-[#A8B3C7] opacity-45" />
                    <p className="text-sm font-semibold text-[#D7DEEA]">No results found</p>
                    <p className="mt-1 text-xs text-[#A8B3C7]">Try a page, project, client, or session name.</p>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4">
              <p className="mb-2.5 px-1 text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#A8B3C7]">Quick Actions</p>
              <div className="grid grid-cols-3 gap-2">
                {visibleQuickActions.map((action, i) => {
                  const index = filteredCommands.length + i;
                  const active = focused === index;
                  return (
                    <button
                      key={action.id}
                      data-focused={active ? 'true' : undefined}
                      onClick={() => execute(action)}
                      onMouseEnter={() => setFocused(index)}
                      className={`flex h-9 items-center gap-2 rounded-lg border px-2.5 text-left transition ${
                        active
                          ? 'border-[#7c6cf2]/45 bg-[#211D4B]/70'
                          : 'border-white/[0.09] bg-white/[0.035] hover:border-white/[0.16] hover:bg-white/[0.055]'
                      }`}
                    >
                      <action.Icon size={14} style={{ color: action.accent }} />
                      <span className="min-w-0 flex-1 truncate text-[11px] font-bold text-white">{action.label}</span>
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-md border border-white/[0.10] bg-white/[0.055] px-1 text-[10px] font-bold text-[#A8B3C7]">
                        {action.key}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>
        </div>

        <div className="flex h-[44px] items-center gap-4 border-t border-white/[0.075] px-5 text-[11px] font-semibold text-[#A8B3C7]">
          <span className="flex items-center gap-2"><Keycap><ArrowDownUp size={14} /></Keycap> navigate</span>
          <span className="flex items-center gap-2"><Keycap><CornerDownLeft size={14} /></Keycap> select</span>
          <span className="flex items-center gap-2"><Keycap>ESC</Keycap> close</span>
          <span className="ml-auto">{resultCount} results</span>
        </div>
      </div>
    </div>
  );
}
