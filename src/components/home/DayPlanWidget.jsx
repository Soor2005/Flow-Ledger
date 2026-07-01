import React, { useState, useEffect, useCallback } from 'react';
import { Sun, Moon, X, Plus, Trash2, CheckCircle2, Circle, Clock } from 'lucide-react';

const api = window.electron || {};

function todayKey() {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
}

function fmtSecs(secs) {
  if (!secs || secs <= 0) return '0m';
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60);
  return h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

function PlanModal({ dateKey, userId, initialItems, onClose, onSaved }) {
  const [items, setItems] = useState(initialItems || []);
  const [label, setLabel] = useState('');
  const [mins, setMins] = useState('60');
  const [saving, setSaving] = useState(false);

  const addItem = () => {
    if (!label.trim()) return;
    setItems(prev => [...prev, { label: label.trim(), goalMinutes: parseInt(mins) || 60 }]);
    setLabel(''); setMins('60');
  };

  const save = async () => {
    setSaving(true);
    await api.saveDayPlan?.({ userId, dateKey, planItems: items });
    setSaving(false);
    onSaved(items);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-[440px] bg-bg-card border border-brd-strong rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-brd-default">
          <div className="flex items-center gap-2">
            <Sun size={14} className="text-amber-400" />
            <h3 className="text-sm font-semibold text-tx-primary">Plan Your Day</h3>
          </div>
          <button onClick={onClose} className="text-tx-faint hover:text-white"><X size={15} /></button>
        </div>
        <div className="p-5 space-y-2.5 max-h-[340px] overflow-y-auto">
          {items.map((item, i) => (
            <div key={i} className="flex items-center gap-2.5 rounded-xl bg-bg-app border border-brd-default px-3 py-2.5">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-tx-primary truncate">{item.label}</p>
                <p className="text-[10px] text-tx-faint">{item.goalMinutes}m target</p>
              </div>
              <button onClick={() => setItems(items.filter((_, j) => j !== i))}
                className="text-tx-faint hover:text-red-400 shrink-0 transition">
                <Trash2 size={13} />
              </button>
            </div>
          ))}
          <div className="flex gap-2 pt-1">
            <input value={label} onChange={e => setLabel(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addItem()}
              placeholder="What will you work on?"
              className="flex-1 rounded-xl bg-bg-app border border-brd-default px-3 py-2 text-sm text-white placeholder-tx-faint focus:outline-none focus:border-accent" />
            <input value={mins} onChange={e => setMins(e.target.value)}
              placeholder="60"
              className="w-16 rounded-xl bg-bg-app border border-brd-default px-2 py-2 text-sm text-white placeholder-tx-faint focus:outline-none focus:border-accent text-center" />
            <button onClick={addItem}
              className="flex items-center justify-center w-9 h-9 shrink-0 rounded-xl bg-accent/12 text-accent border border-accent/20 hover:bg-accent/20 transition">
              <Plus size={14} />
            </button>
          </div>
        </div>
        <div className="flex gap-2 px-5 pb-5">
          <button onClick={onClose}
            className="flex-1 rounded-xl bg-brd-default py-2.5 text-sm text-tx-secondary hover:bg-bg-hover transition">
            Cancel
          </button>
          <button onClick={save} disabled={saving || !items.length}
            className="flex-1 rounded-xl bg-accent py-2.5 text-sm font-semibold text-white hover:bg-accent-light transition disabled:opacity-50">
            {saving ? 'Saving…' : 'Save Plan'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DayPlanWidget({ user }) {
  const [plan, setPlan] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const dateKey = todayKey();
  const hour = new Date().getHours();
  const isMorning = hour < 12;
  const isEvening = hour >= 17;

  const load = useCallback(async () => {
    if (!user?.id) return;
    const p = await api.getDayPlan?.({ userId: user.id, dateKey });
    const items = p ? (() => { try { return JSON.parse(p.plan_json || '[]'); } catch { return null; } })() : null;
    setPlan(items);
    if (items && isEvening) {
      const comp = await api.compareDayPlan?.({ userId: user.id, dateKey });
      setComparison(comp);
    }
    setLoaded(true);
  }, [user?.id, dateKey, isEvening]);

  useEffect(() => { load(); }, [load]);

  if (!loaded) return null;

  // Morning with no plan → show planning prompt
  if (isMorning && !plan) {
    return (
      <>
        <button onClick={() => setShowModal(true)}
          className="flex w-full items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/05 px-4 py-3 text-left transition hover:bg-amber-500/10 hover:border-amber-500/30">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/15">
            <Sun size={14} className="text-amber-400" />
          </div>
          <div>
            <p className="text-[12px] font-semibold text-amber-300">Plan your day</p>
            <p className="text-[10.5px] text-tx-faint">Set focus goals for today's sessions</p>
          </div>
          <Plus size={13} className="ml-auto text-amber-500/60 shrink-0" />
        </button>
        {showModal && (
          <PlanModal dateKey={dateKey} userId={user.id} initialItems={[]}
            onClose={() => setShowModal(false)} onSaved={items => { setPlan(items); }} />
        )}
      </>
    );
  }

  if (!plan || !plan.length) return null;

  const totalGoalMins = plan.reduce((s, i) => s + (i.goalMinutes || 0), 0);
  const totalActualSecs = comparison ? Object.values(comparison.actual || {}).reduce((s, v) => s + v, 0) : 0;

  return (
    <>
      <div className="rounded-xl border border-brd-default bg-bg-card overflow-hidden">
        <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-brd-subtle">
          <div className="flex items-center gap-2">
            {isEvening
              ? <Moon size={12} className="text-indigo-400" />
              : <Sun size={12} className="text-amber-400" />}
            <span className="text-[10px] font-semibold uppercase tracking-wider text-tx-faint">
              {isEvening ? "Day Review" : "Today's Plan"}
            </span>
          </div>
          <button onClick={() => setShowModal(true)} className="text-[10px] text-accent hover:underline">Edit</button>
        </div>
        <div className="px-3.5 py-2.5 space-y-1.5">
          {plan.map((item, i) => {
            const actualSecs = comparison?.actual?.[item.label] || 0;
            const goalSecs   = (item.goalMinutes || 0) * 60;
            const hit        = isEvening && actualSecs >= goalSecs;
            return (
              <div key={i} className="flex items-center gap-2">
                {isEvening
                  ? (hit
                    ? <CheckCircle2 size={12} className="text-status-green shrink-0" />
                    : <Circle size={12} className="text-tx-faint shrink-0" />)
                  : <div className="h-1.5 w-1.5 rounded-full bg-tx-faint/50 shrink-0" />}
                <span className="text-[11px] text-tx-primary flex-1 truncate">{item.label}</span>
                <span className="text-[10px] text-tx-faint shrink-0">
                  {isEvening ? `${fmtSecs(actualSecs)} / ${item.goalMinutes}m` : `${item.goalMinutes}m`}
                </span>
              </div>
            );
          })}
        </div>
        {isEvening && (
          <div className="border-t border-brd-subtle px-3.5 py-2 flex items-center gap-2">
            <Clock size={10} className="text-tx-faint shrink-0" />
            <p className="text-[10px] text-tx-faint">
              Goal: {Math.floor(totalGoalMins / 60)}h {totalGoalMins % 60}m
              {totalActualSecs > 0 ? ` · Logged: ${fmtSecs(totalActualSecs)}` : ''}
            </p>
          </div>
        )}
      </div>
      {showModal && (
        <PlanModal dateKey={dateKey} userId={user.id} initialItems={plan}
          onClose={() => setShowModal(false)} onSaved={items => { setPlan(items); load(); }} />
      )}
    </>
  );
}
