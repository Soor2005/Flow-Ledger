import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Square, Trash2, Zap, Clock, Tag, Plus, X } from 'lucide-react';
import { formatDuration, formatTime, getCategoryColor, todayStart } from '../../utils/helpers';

const api = window.electron || {};

export default function TrackerPage({ user, categories, setCategories, activeSession, setActiveSession, refreshActive }) {
  const [sessions, setSessions]     = useState([]);
  const [selCat, setSelCat]         = useState('');
  const [title, setTitle]           = useState('');
  const [elapsed, setElapsed]       = useState(0);
  const [loading, setLoading]       = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatColor, setNewCatColor] = useState('#6366f1');
  const [showCatForm, setShowCatForm] = useState(false);
  const timerRef = useRef(null);

  const loadSessions = useCallback(async () => {
    const now = Math.floor(Date.now() / 1000);
    const from = todayStart() - 7 * 86400; // last 7 days
    const list = await api.listSessions?.({ userId: user.id, from, to: now });
    setSessions(list || []);
  }, [user.id]);

  useEffect(() => {
    loadSessions();
    if (categories.length > 0 && !selCat) setSelCat(categories[0]?.name || '');
  }, [loadSessions, categories, selCat]);

  // Live timer
  useEffect(() => {
    if (activeSession) {
      const tick = () => {
        const now = Math.floor(Date.now() / 1000);
        setElapsed(now - activeSession.started_at);
      };
      tick();
      timerRef.current = setInterval(tick, 1000);
    } else {
      clearInterval(timerRef.current);
      setElapsed(0);
    }
    return () => clearInterval(timerRef.current);
  }, [activeSession]);

  const startSession = async () => {
    if (!selCat) return;
    setLoading(true);
    const res = await api.startSession?.({ userId: user.id, category: selCat, title: title.trim() || null });
    if (res?.id) {
      await refreshActive();
      setTitle('');
    }
    setLoading(false);
  };

  const stopSession = async () => {
    if (!activeSession) return;
    setLoading(true);
    await api.stopSession?.({ sessionId: activeSession.id });
    setActiveSession(null);
    await loadSessions();
    setLoading(false);
  };

  const deleteSession = async (id) => {
    await api.deleteSession?.({ sessionId: id });
    setSessions(s => s.filter(x => x.id !== id));
  };

  const addCategory = async () => {
    if (!newCatName.trim()) return;
    const cat = await api.createCategory?.({ userId: user.id, name: newCatName.trim(), color: newCatColor });
    if (cat?.id) {
      setCategories(c => [...c, cat]);
      setSelCat(cat.name);
      setNewCatName('');
      setShowCatForm(false);
    }
  };

  const deepWorkThreshold = 25 * 60;
  const isDeepWorkPending = elapsed >= deepWorkThreshold;

  // Group sessions by date
  const grouped = sessions.reduce((acc, s) => {
    const date = new Date(s.started_at * 1000).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    if (!acc[date]) acc[date] = [];
    acc[date].push(s);
    return acc;
  }, {});

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 flex overflow-hidden">
        {/* Left - controls */}
        <div className="w-72 border-r border-[#1e2536] bg-[#0d1018] flex flex-col p-5 gap-5 overflow-y-auto">
          <h2 className="text-base font-bold text-white">Time Tracker</h2>

          {/* Timer display */}
          <div className={`rounded-2xl border p-6 text-center transition-all ${
            activeSession
              ? isDeepWorkPending
                ? 'bg-amber-500/10 border-amber-500/30 glow-amber'
                : 'bg-green-500/10 border-green-500/30'
              : 'bg-bg-card border-[#1e2536]'
          }`}>
            <div className="font-mono text-4xl font-bold text-white mb-1 tracking-tight">
              {formatTimer(elapsed)}
            </div>
            {activeSession && (
              <div className="space-y-1 mt-2">
                <p className="text-sm font-medium" style={{ color: getCategoryColor(activeSession.category, categories) }}>
                  {activeSession.category}
                </p>
                {activeSession.title && <p className="text-xs text-slate-500">{activeSession.title}</p>}
                {isDeepWorkPending && (
                  <div className="flex items-center justify-center gap-1 mt-2">
                    <Zap size={12} className="text-amber-400" />
                    <span className="text-xs text-amber-400 font-medium">Deep Work unlocked!</span>
                  </div>
                )}
              </div>
            )}
            {!activeSession && <p className="text-xs text-slate-600 mt-1">Ready to start</p>}
          </div>

          {/* Category picker */}
          {!activeSession && (
            <>
              <div>
                <label className="text-xs text-slate-500 uppercase tracking-wider font-medium mb-2 block">Category</label>
                <div className="flex flex-wrap gap-1.5">
                  {categories.map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => setSelCat(cat.name)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                        selCat === cat.name
                          ? 'border-transparent text-white'
                          : 'border-[#2d3748] text-slate-400 hover:text-white hover:border-[#4b5563] bg-transparent'
                      }`}
                      style={selCat === cat.name ? { background: cat.color, borderColor: cat.color } : {}}
                    >
                      {cat.name}
                    </button>
                  ))}
                  <button
                    onClick={() => setShowCatForm(v => !v)}
                    className="px-2.5 py-1.5 rounded-lg text-xs border border-dashed border-[#2d3748] text-slate-600 hover:text-slate-400 hover:border-[#4b5563] transition-colors"
                  >
                    <Plus size={12} />
                  </button>
                </div>

                {showCatForm && (
                  <div className="mt-2 p-3 bg-[#1e2536] rounded-xl space-y-2">
                    <input
                      value={newCatName}
                      onChange={e => setNewCatName(e.target.value)}
                      placeholder="Category name"
                      className="w-full bg-bg-card border border-[#2d3748] rounded-lg px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-accent"
                      onKeyDown={e => e.key === 'Enter' && addCategory()}
                    />
                    <div className="flex items-center gap-2">
                      <input type="color" value={newCatColor} onChange={e => setNewCatColor(e.target.value)} className="w-7 h-7 rounded cursor-pointer bg-transparent border-0" />
                      <button onClick={addCategory} className="flex-1 text-xs bg-accent hover:bg-teal-500 text-white py-1.5 rounded-lg transition-colors">Add</button>
                      <button onClick={() => setShowCatForm(false)} className="text-slate-500 hover:text-white"><X size={13} /></button>
                    </div>
                  </div>
                )}
              </div>

              {/* Title */}
              <div>
                <label className="text-xs text-slate-500 uppercase tracking-wider font-medium mb-2 block">What are you working on?</label>
                <input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="Optional description..."
                  className="w-full bg-bg-card border border-[#2d3748] rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-accent transition-colors"
                  onKeyDown={e => e.key === 'Enter' && startSession()}
                />
              </div>
            </>
          )}

          {/* Start / Stop */}
          {!activeSession ? (
            <button
              onClick={startSession}
              disabled={!selCat || loading}
              className="w-full flex items-center justify-center gap-2 bg-accent hover:bg-teal-500 disabled:bg-teal-800 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors text-sm"
            >
              <Play size={15} />
              Start Session
            </button>
          ) : (
            <button
              onClick={stopSession}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-red-600/80 hover:bg-red-500 text-white font-semibold py-3 rounded-xl transition-colors text-sm"
            >
              <Square size={14} fill="currentColor" />
              Stop Session
            </button>
          )}

          {/* Deep work info */}
          <div className="text-xs text-slate-600 bg-bg-card rounded-xl p-3 border border-[#1e2536]">
            <div className="flex items-center gap-1.5 mb-1">
              <Zap size={11} className="text-amber-400" />
              <span className="text-slate-400 font-medium">Deep Work</span>
            </div>
            Sessions ≥ 25 minutes are automatically tagged as deep work — your highest-leverage focus blocks.
          </div>
        </div>

        {/* Right - session log */}
        <div className="flex-1 overflow-y-auto p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Session Log</h3>
          {Object.keys(grouped).length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-slate-600">
              <Clock size={32} className="mb-3 opacity-40" />
              <p className="text-sm">No sessions yet. Start your first one!</p>
            </div>
          ) : (
            <div className="space-y-5">
              {Object.entries(grouped).map(([date, daySessions]) => (
                <div key={date}>
                  <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-2">{date}</p>
                  <div className="space-y-1.5">
                    {daySessions.map(s => (
                      <div key={s.id} className="flex items-center justify-between bg-bg-card rounded-xl px-4 py-3 border border-[#1e2536] hover:border-[#2d3748] transition-all group">
                        <div className="flex items-center gap-3">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: getCategoryColor(s.category, categories) }} />
                          <div>
                            <p className="text-sm text-white font-medium">{s.title || s.category}</p>
                            <p className="text-xs text-slate-500">
                              {formatTime(s.started_at)} → {s.ended_at ? formatTime(s.ended_at) : '...'}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-400 font-mono">{formatDuration(s.duration_seconds)}</span>
                          {s.is_deep_work ? (
                            <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-400">
                              <Zap size={9} />Deep
                            </span>
                          ) : (
                            <span className="text-xs px-2 py-0.5 rounded-md bg-[#1e2536] text-slate-500">
                              {s.category}
                            </span>
                          )}
                          <button
                            onClick={() => deleteSession(s.id)}
                            className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400 transition-all ml-1"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function formatTimer(s) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(sec)}`;
  return `${pad(m)}:${pad(sec)}`;
}
function pad(n) { return String(n).padStart(2, '0'); }
