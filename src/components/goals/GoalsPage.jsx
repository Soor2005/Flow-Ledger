import React, { useState, useEffect, useCallback } from 'react';
import { Target, Plus, Flame, Trophy, X, CheckCircle2, Loader2, Zap, Calendar, Clock, TrendingUp, Edit2, Check } from 'lucide-react';
import DetailAnalyticsModal from '../shared/DetailAnalyticsModal';

const api = window.electron || {};

function fmt(secs) {
  if (!secs) return '0m';
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// SVG ring progress
function ProgressRing({ pct, size = 72, stroke = 6, color = '#6366f1' }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (Math.min(pct, 100) / 100) * circ;
  return (
    <svg width={size} height={size} style={{ transform:'rotate(-90deg)' }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#263438" strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.7s ease' }} />
    </svg>
  );
}

const PERIOD_LABELS = { daily: 'Today', weekly: 'This Week', monthly: 'This Month' };
const PERIOD_ICONS  = { daily: Calendar, weekly: TrendingUp, monthly: Clock };

function GoalModal({ goal, categories, onClose, onSave }) {
  const [form, setForm] = useState({
    title: goal?.title || '',
    targetHours: goal?.target_hours || '',
    period: goal?.period || 'daily',
    category: goal?.category || '',
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.title.trim() || !form.targetHours) return;
    setSaving(true);
    await onSave({ ...form, targetHours: parseFloat(form.targetHours) });
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={e => e.target===e.currentTarget && onClose()}>
      <div className="w-[420px] bg-bg-card border border-brd-strong rounded-2xl overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-brd-default">
          <h3 className="text-sm font-semibold text-white">{goal ? 'Edit Goal' : 'New Goal'}</h3>
          <button onClick={onClose} className="text-tx-faint hover:text-white"><X size={15} /></button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="text-[10px] text-tx-faint uppercase tracking-wider mb-1.5 block">Goal Name *</label>
            <input value={form.title} onChange={e => setForm(f=>({...f,title:e.target.value}))} placeholder="e.g. Code for 3 hours"
              className="w-full bg-bg-app border border-brd-default rounded-xl px-3 py-2.5 text-sm text-white placeholder-tx-faint focus:outline-none focus:border-accent" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-tx-faint uppercase tracking-wider mb-1.5 block">Target Hours *</label>
              <input type="number" value={form.targetHours} onChange={e => setForm(f=>({...f,targetHours:e.target.value}))}
                placeholder="e.g. 3" min="0.25" step="0.25"
                className="w-full bg-bg-app border border-brd-default rounded-xl px-3 py-2.5 text-sm text-white placeholder-tx-faint focus:outline-none focus:border-accent" />
            </div>
            <div>
              <label className="text-[10px] text-tx-faint uppercase tracking-wider mb-1.5 block">Period *</label>
              <select value={form.period} onChange={e => setForm(f=>({...f,period:e.target.value}))}
                className="w-full bg-bg-app border border-brd-default rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-accent">
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-[10px] text-tx-faint uppercase tracking-wider mb-1.5 block">Category <span className="normal-case text-tx-faint">(optional — leave blank for all time)</span></label>
            <select value={form.category} onChange={e => setForm(f=>({...f,category:e.target.value}))}
              className="w-full bg-bg-app border border-brd-default rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-accent">
              <option value="">All activity (sessions + auto-tracked)</option>
              {(categories||[]).map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
          </div>
        </div>
        <div className="flex gap-2 px-5 pb-5">
          <button onClick={onClose} className="flex-1 bg-brd-default hover:bg-bg-hover text-tx-secondary py-2.5 rounded-xl text-sm">Cancel</button>
          <button onClick={save} disabled={saving || !form.title.trim() || !form.targetHours}
            className="flex-1 flex items-center justify-center gap-2 bg-accent hover:bg-teal-500 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-semibold">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {goal ? 'Save' : 'Create Goal'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function GoalsPage({ user, categories }) {
  const [goals,       setGoals]       = useState([]);
  const [progress,    setProgress]    = useState({});
  const [showModal,   setShowModal]   = useState(false);
  const [editGoal,    setEditGoal]    = useState(null);
  const [detailGoal,  setDetailGoal]  = useState(null);
  const [loading,     setLoading]     = useState(false);

  const loadGoals = useCallback(async () => {
    setLoading(true);
    const list = await api.listGoals?.({ userId: user.id });
    setGoals(list || []);
    if (list?.length) {
      const progs = await Promise.all(list.map(g => api.goalProgress?.({ userId: user.id, goalId: g.id })));
      const map = {};
      progs.forEach(p => { if (p) map[p.goal.id] = p; });
      setProgress(map);
    }
    setLoading(false);
  }, [user.id]);

  useEffect(() => { loadGoals(); }, [loadGoals]);

  // Auto-update streaks for completed goals
  useEffect(() => {
    if (!goals.length) return;
    goals.forEach(g => {
      const p = progress[g.id];
      if (p && p.progress >= 100) api.updateStreak?.({ userId: user.id, goalId: g.id });
    });
  }, [goals, progress]); // eslint-disable-line

  const handleSave = async (formData) => {
    await api.createGoal?.({ userId: user.id, ...formData });
    setShowModal(false);
    setEditGoal(null);
    await loadGoals();
  };

  const deleteGoal = async (id) => {
    await api.deleteGoal?.({ goalId: id });
    setGoals(g => g.filter(x => x.id !== id));
  };

  // Summary stats
  const completedToday = goals.filter(g => (progress[g.id]?.progress || 0) >= 100 && g.period === 'daily').length;
  const totalStreakDays = goals.reduce((a, g) => a + (progress[g.id]?.streak?.current_streak || 0), 0);
  const bestStreak = Math.max(0, ...goals.map(g => progress[g.id]?.streak?.longest_streak || 0));

  return (
    <div className="h-full overflow-y-auto bg-bg-app">
      <div className="px-8 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <Target size={18} className="text-teal-400" />Goals & Streaks
            </h1>
            <p className="text-tx-faint text-sm mt-0.5">Track your focus targets and build habits</p>
          </div>
          <button onClick={() => { setEditGoal(null); setShowModal(true); }}
            className="flex items-center gap-2 bg-accent hover:bg-teal-500 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors">
            <Plus size={14} />New Goal
          </button>
        </div>

        {/* Summary strip */}
        {goals.length > 0 && (
          <div className="grid grid-cols-4 gap-3 mb-6">
            {[
              { label: 'Active Goals', value: goals.length, Icon: Target, color: '#6366f1' },
              { label: 'Completed Today', value: completedToday, Icon: CheckCircle2, color: '#10b981' },
              { label: 'Total Streak Days', value: totalStreakDays, Icon: Flame, color: '#f97316' },
              { label: 'Best Streak', value: `${bestStreak}d`, Icon: Trophy, color: '#d29922' },
            ].map(s => (
              <div key={s.label} className="fl-card rounded-xl p-4 flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: s.color + '15' }}>
                  <s.Icon size={14} style={{ color: s.color }} />
                </div>
                <div>
                  <p className="text-[10px] text-tx-faint uppercase tracking-wider">{s.label}</p>
                  <p className="text-lg font-bold text-white">{s.value}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Goals */}
        {loading && goals.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-tx-faint">
            <Loader2 size={20} className="animate-spin mr-2" />Loading...
          </div>
        ) : goals.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-tx-faint">
            <Target size={48} className="mb-4 opacity-15" />
            <p className="text-sm text-tx-secondary mb-1">No goals yet</p>
            <p className="text-xs mb-4">Set daily, weekly, or monthly time targets to build focus habits</p>
            <button onClick={() => setShowModal(true)}
              className="flex items-center gap-2 bg-accent/20 hover:bg-accent/30 border border-teal-500/30 text-teal-300 text-sm px-4 py-2 rounded-xl transition-colors">
              <Plus size={13} />Create your first goal
            </button>
          </div>
        ) : (
          <>
            {/* Group by period */}
            {['daily','weekly','monthly'].map(period => {
              const periodGoals = goals.filter(g => g.period === period);
              if (!periodGoals.length) return null;
              const PIcon = PERIOD_ICONS[period];
              return (
                <div key={period} className="mb-6">
                  <div className="flex items-center gap-2 mb-3">
                    <PIcon size={13} className="text-tx-faint" />
                    <h3 className="text-xs text-tx-faint uppercase tracking-widest font-semibold">{PERIOD_LABELS[period]}</h3>
                    <div className="flex-1 h-px bg-brd-default" />
                    <span className="text-xs text-tx-faint">{periodGoals.length} goal{periodGoals.length!==1?'s':''}</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {periodGoals.map(goal => {
                      const p = progress[goal.id];
                      const pct = p ? Math.min(Math.round(p.progress), 100) : 0;
                      const done = pct >= 100;
                      const streak = p?.streak;
                      const ringColor = done ? '#10b981' : pct > 50 ? '#6366f1' : pct > 25 ? '#f59e0b' : '#73817F';

                      return (
                        <div key={goal.id}
                          onClick={() => setDetailGoal(goal)}
                          className={`bg-bg-card rounded-2xl border p-5 relative transition-all group cursor-pointer ${
                            done ? 'border-green-500/30' : 'border-brd-default hover:border-brd-strong'
                          } ${done ? 'bg-green-500/3' : ''}`}>

                          <button onClick={e => { e.stopPropagation(); deleteGoal(goal.id); }}
                            className="absolute top-3 right-3 text-tx-faint hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all">
                            <X size={13} />
                          </button>

                          {/* Ring + info row */}
                          <div className="flex items-center gap-4 mb-4 pr-5">
                            <div className="relative shrink-0">
                              <ProgressRing pct={pct} size={72} stroke={6} color={ringColor} />
                              <div className="absolute inset-0 flex items-center justify-center">
                                {done
                                  ? <CheckCircle2 size={20} className="text-green-400" />
                                  : <span className="text-sm font-bold text-white">{pct}%</span>
                                }
                              </div>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-white leading-tight">{goal.title}</p>
                              <div className="flex items-center gap-1.5 mt-1">
                                <span className="text-xs text-tx-faint">{goal.target_hours}h target</span>
                                {goal.category && <>
                                  <span className="text-brd-default">·</span>
                                  <span className="text-xs text-teal-400">{goal.category}</span>
                                </>}
                              </div>
                              {done && <span className="text-[10px] text-green-400 font-semibold mt-0.5 block">✓ Goal achieved!</span>}
                            </div>
                          </div>

                          {/* Progress detail */}
                          <div className="bg-bg-app rounded-xl p-3 mb-3">
                            <div className="flex justify-between text-xs mb-1.5">
                              <span className="text-tx-secondary font-medium">{fmt(p?.achievedSeconds || 0)}</span>
                              <span className="text-tx-faint">of {goal.target_hours}h</span>
                            </div>
                            <div className="h-2 bg-brd-default rounded-full overflow-hidden">
                              <div className="h-full rounded-full transition-all duration-700"
                                style={{ width: `${pct}%`, background: done ? '#10b981' : '#6366f1' }} />
                            </div>
                            {p && !done && (
                              <p className="text-[10px] text-tx-faint mt-1">
                                {fmt(Math.max(0, (p.targetSeconds || 0) - (p.achievedSeconds || 0)))} remaining
                              </p>
                            )}
                          </div>

                          {/* Streak row */}
                          <div className="flex items-center gap-3 pt-2 border-t border-brd-default">
                            <div className="flex items-center gap-1.5">
                              <Flame size={12} className={streak?.current_streak > 0 ? 'text-orange-400' : 'text-tx-faint'} />
                              <span className={`text-sm font-bold ${streak?.current_streak > 0 ? 'text-orange-400' : 'text-tx-faint'}`}>
                                {streak?.current_streak || 0}
                              </span>
                              <span className="text-xs text-tx-faint">day streak</span>
                            </div>
                            <div className="flex items-center gap-1.5 ml-auto">
                              <Trophy size={11} className="text-amber-500" />
                              <span className="text-xs text-tx-faint">Best: {streak?.longest_streak || 0}d</span>
                            </div>
                            {streak?.current_streak > 0 && (
                              <div className="flex gap-0.5">
                                {Array.from({ length: Math.min(streak.current_streak, 7) }).map((_, i) => (
                                  <div key={i} className="w-2 h-2 rounded-sm bg-orange-400/70" />
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Motivational footer */}
            <div className="mt-2 p-4 rounded-xl bg-bg-card border border-brd-default flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-orange-500/15 flex items-center justify-center shrink-0">
                <Flame size={18} className="text-orange-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Keep your streak alive</p>
                <p className="text-xs text-tx-faint">
                  {completedToday > 0
                    ? `You've completed ${completedToday} goal${completedToday>1?'s':''} today — great work!`
                    : 'Hit your goals consistently to build lasting focus habits.'}
                </p>
              </div>
              {completedToday > 0 && (
                <div className="ml-auto shrink-0">
                  <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center">
                    <Zap size={14} className="text-green-400" />
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {showModal && (
        <GoalModal
          goal={editGoal}
          categories={categories}
          onClose={() => { setShowModal(false); setEditGoal(null); }}
          onSave={handleSave}
        />
      )}

      {detailGoal && (
        <DetailAnalyticsModal
          type="goal"
          item={detailGoal}
          user={user}
          onClose={() => setDetailGoal(null)}
        />
      )}
    </div>
  );
}
