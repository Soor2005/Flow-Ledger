import React, { useState, useEffect, useCallback } from 'react';
import { Target, Plus, X, Check } from 'lucide-react';

const api = window.electron || {};

function fmtHrs(secs) {
  if (!secs || secs <= 0) return '0m';
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60);
  return h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

function AddGoalModal({ onClose, onCreated, userId }) {
  const [title, setTitle] = useState('');
  const [hours, setHours] = useState('');
  const [period, setPeriod] = useState('weekly');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!title.trim() || !hours) return;
    setSaving(true);
    const g = await api.createGoal?.({ userId, title: title.trim(), targetHours: parseFloat(hours), period, category: null });
    if (g?.id) await api.updateStreak?.({ userId, goalId: g.id });
    setSaving(false);
    onCreated();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-[380px] bg-bg-card border border-brd-strong rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-brd-default">
          <div className="flex items-center gap-2">
            <Target size={13} className="text-accent" />
            <h3 className="text-sm font-semibold text-tx-primary">New Target</h3>
          </div>
          <button onClick={onClose} className="text-tx-faint hover:text-white"><X size={15} /></button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="text-[10px] text-tx-faint uppercase tracking-wider mb-1.5 block">Goal name</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Code for 40 hours"
              className="w-full bg-bg-app border border-brd-default rounded-xl px-3 py-2.5 text-sm text-white placeholder-tx-faint focus:outline-none focus:border-accent" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-tx-faint uppercase tracking-wider mb-1.5 block">Hours target</label>
              <input value={hours} onChange={e => setHours(e.target.value)} type="number" min="1" placeholder="40"
                className="w-full bg-bg-app border border-brd-default rounded-xl px-3 py-2.5 text-sm text-white placeholder-tx-faint focus:outline-none focus:border-accent" />
            </div>
            <div>
              <label className="text-[10px] text-tx-faint uppercase tracking-wider mb-1.5 block">Period</label>
              <select value={period} onChange={e => setPeriod(e.target.value)}
                className="w-full bg-bg-app border border-brd-default rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-accent">
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
          </div>
        </div>
        <div className="flex gap-2 px-5 pb-5">
          <button onClick={onClose} className="flex-1 rounded-xl bg-brd-default py-2.5 text-sm text-tx-secondary hover:bg-bg-hover transition">Cancel</button>
          <button onClick={save} disabled={saving || !title.trim() || !hours}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-accent py-2.5 text-sm font-semibold text-white hover:bg-accent-light transition disabled:opacity-50">
            {saving ? 'Saving…' : <><Check size={12} /> Create</>}
          </button>
        </div>
      </div>
    </div>
  );
}

const PERIOD_COLORS  = { weekly: '#7c6cf2', monthly: '#34d399' };
const PERIOD_LABELS  = { weekly: 'This Week', monthly: 'This Month' };

export default function GoalProgressWidget({ user }) {
  const [goals, setGoals] = useState([]);
  const [progress, setProgress] = useState({});
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const all = await api.listGoals?.({ userId: user.id });
      const periodic = (all || []).filter(g => g.period === 'weekly' || g.period === 'monthly');
      setGoals(periodic);
      const prog = {};
      await Promise.all(periodic.map(async g => {
        const p = await api.goalProgress?.({ userId: user.id, goalId: g.id });
        if (p) prog[g.id] = p;
      }));
      setProgress(prog);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  if (loading) return null;

  if (!goals.length) {
    return (
      <>
        <button onClick={() => setShowAdd(true)}
          className="flex w-full items-center gap-2 rounded-xl border border-dashed border-brd-default px-3.5 py-2.5 text-left transition hover:border-accent/40 hover:bg-accent/05">
          <Target size={13} className="shrink-0 text-tx-faint" />
          <span className="text-[11px] text-tx-faint">Set weekly or monthly targets</span>
          <Plus size={11} className="ml-auto text-tx-faint" />
        </button>
        {showAdd && <AddGoalModal userId={user.id} onClose={() => setShowAdd(false)} onCreated={load} />}
      </>
    );
  }

  return (
    <>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(goals.length, 2)}, minmax(0,1fr))` }}>
        {goals.map(g => {
          const p = progress[g.id];
          const pct = p ? Math.min(Math.round(p.progress), 100) : 0;
          const color = PERIOD_COLORS[g.period] || '#7c6cf2';
          return (
            <div key={g.id} className="rounded-xl border border-brd-default bg-bg-card px-3.5 py-2.5">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color }}>
                  {PERIOD_LABELS[g.period]}
                </p>
                <span className="text-[10px] font-bold" style={{ color }}>{pct}%</span>
              </div>
              <p className="text-[12px] font-semibold text-tx-primary mb-2 leading-tight truncate">{g.title}</p>
              <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
                <div className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${pct}%`, background: color }} />
              </div>
              {p && (
                <p className="mt-1.5 text-[10px] text-tx-faint">
                  {fmtHrs(p.achievedSeconds)} of {g.target_hours}h
                </p>
              )}
            </div>
          );
        })}
        <button onClick={() => setShowAdd(true)}
          className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-brd-default py-2.5 text-[11px] text-tx-faint transition hover:border-accent/40 hover:text-accent hover:bg-accent/05">
          <Plus size={12} /> Add target
        </button>
      </div>
      {showAdd && <AddGoalModal userId={user.id} onClose={() => setShowAdd(false)} onCreated={load} />}
    </>
  );
}
