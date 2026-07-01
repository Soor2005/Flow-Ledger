import React, { useState, useEffect, useCallback } from 'react';
import { Clock, Plus, Trash2, X, Check, Calendar, ToggleLeft, ToggleRight, Edit2 } from 'lucide-react';

const api = window.electron || {};

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function minsToTime(mins) {
  const h = Math.floor(mins / 60), m = mins % 60;
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12  = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function dayMaskLabel(mask) {
  if (mask === 62)  return 'Weekdays';
  if (mask === 65)  return 'Weekend';
  if (mask === 127) return 'Every day';
  return DAY_LABELS.filter((_, i) => mask & (1 << i)).join(', ');
}

function profileLabel(profileIds, profiles) {
  try {
    const arr = JSON.parse(profileIds || '[]');
    if (!arr.length) return 'Global rules';
    const p = profiles.find(p => p.id === arr[0]);
    return p?.name || 'Profile';
  } catch { return 'Global rules'; }
}

function ScheduleModal({ schedule, profiles, onClose, onSave }) {
  const parseProfileId = () => {
    try { return JSON.parse(schedule?.profile_ids || '[]')[0] || ''; } catch { return ''; }
  };

  const [label,      setLabel]      = useState(schedule?.label || '');
  const [profileId,  setProfileId]  = useState(parseProfileId);
  const [daysMask,   setDaysMask]   = useState(schedule?.days_mask ?? 62);
  const [startH,     setStartH]     = useState(Math.floor((schedule?.start_mins ?? 540) / 60));
  const [startM,     setStartM]     = useState((schedule?.start_mins ?? 540) % 60);
  const [endH,       setEndH]       = useState(Math.floor((schedule?.end_mins ?? 720) / 60));
  const [endM,       setEndM]       = useState((schedule?.end_mins ?? 720) % 60);
  const [saving,     setSaving]     = useState(false);

  const toggleDay = (i) => setDaysMask(m => m ^ (1 << i));

  const save = async () => {
    if (!label.trim()) return;
    setSaving(true);
    await onSave({
      label:      label.trim(),
      profileIds: profileId ? [profileId] : [],
      daysMask,
      startMins:  startH * 60 + startM,
      endMins:    endH * 60 + endM,
    });
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-[400px] bg-bg-card border border-brd-strong rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-brd-default">
          <div className="flex items-center gap-2">
            <Clock size={13} className="text-accent" />
            <h3 className="text-sm font-semibold text-tx-primary">{schedule ? 'Edit Schedule' : 'New Schedule'}</h3>
          </div>
          <button onClick={onClose} className="text-tx-faint hover:text-white"><X size={15} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-[10px] text-tx-faint uppercase tracking-wider mb-1.5 block">Label</label>
            <input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. No Social Media"
              className="w-full bg-bg-app border border-brd-default rounded-xl px-3 py-2.5 text-sm text-white placeholder-tx-faint focus:outline-none focus:border-accent" />
          </div>
          <div>
            <label className="text-[10px] text-tx-faint uppercase tracking-wider mb-1.5 block">Block profile</label>
            <select value={profileId} onChange={e => setProfileId(e.target.value)}
              className="w-full bg-bg-app border border-brd-default rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-accent">
              <option value="">Global rules only</option>
              {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-tx-faint uppercase tracking-wider mb-2 block">Active days</label>
            <div className="flex gap-1.5">
              {DAY_LABELS.map((d, i) => {
                const on = !!(daysMask & (1 << i));
                return (
                  <button key={d} onClick={() => toggleDay(i)}
                    className="flex-1 rounded-lg py-1.5 text-[10px] font-bold transition"
                    style={{
                      background:   on ? 'rgba(124,108,242,0.12)' : 'transparent',
                      border:       `1px solid ${on ? 'rgba(124,108,242,0.35)' : 'var(--color-brd-default)'}`,
                      color:        on ? '#a89cf7' : 'var(--color-tx-faint)',
                    }}>
                    {d}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[['Start time', startH, setStartH, startM, setStartM], ['End time', endH, setEndH, endM, setEndM]].map(
              ([lbl, h, setH, m, setM]) => (
                <div key={lbl}>
                  <label className="text-[10px] text-tx-faint uppercase tracking-wider mb-1.5 block">{lbl}</label>
                  <div className="flex items-center gap-1">
                    <input type="number" min="0" max="23" value={h} onChange={e => setH(Math.max(0, Math.min(23, parseInt(e.target.value) || 0)))}
                      className="w-12 bg-bg-app border border-brd-default rounded-lg px-2 py-2 text-sm text-white text-center focus:outline-none focus:border-accent" />
                    <span className="text-tx-faint text-sm">:</span>
                    <input type="number" min="0" max="59" step="15" value={m} onChange={e => setM(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))}
                      className="w-12 bg-bg-app border border-brd-default rounded-lg px-2 py-2 text-sm text-white text-center focus:outline-none focus:border-accent" />
                  </div>
                </div>
              )
            )}
          </div>
        </div>
        <div className="flex gap-2 px-5 pb-5">
          <button onClick={onClose}
            className="flex-1 rounded-xl bg-brd-default py-2.5 text-sm text-tx-secondary hover:bg-bg-hover transition">
            Cancel
          </button>
          <button onClick={save} disabled={saving || !label.trim()}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-accent py-2.5 text-sm font-semibold text-white hover:bg-accent-light transition disabled:opacity-50">
            {saving ? 'Saving…' : <><Check size={12} /> {schedule ? 'Update' : 'Create'}</>}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function BlockScheduler({ userId, profiles = [] }) {
  const [schedules, setSchedules] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editing,   setEditing]   = useState(null);

  const load = useCallback(async () => {
    const list = await api.listSchedules?.({ userId });
    setSchedules(list || []);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (data) => {
    if (editing) {
      await api.updateSchedule?.({ id: editing.id, ...data });
    } else {
      await api.createSchedule?.({ userId, ...data });
    }
    setEditing(null);
    await load();
  };

  const handleDelete = async (id) => {
    await api.deleteSchedule?.({ id });
    await load();
  };

  const handleToggle = async (s) => {
    await api.toggleSchedule?.({ id: s.id, active: !s.active });
    await load();
  };

  return (
    <section className="mb-7">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/12 text-accent">
            <Clock size={14} />
          </div>
          <div>
            <h2 className="text-[11px] font-extrabold uppercase tracking-[0.15em] text-tx-secondary">Scheduled Blocking</h2>
            <p className="text-[11px] text-tx-faint">Auto-activate blocking during set time windows</p>
          </div>
        </div>
        <button
          onClick={() => { setEditing(null); setShowModal(true); }}
          className="flex items-center gap-1.5 rounded-lg border border-accent/25 bg-accent/10 px-3.5 py-1.5 text-[12px] font-bold text-accent hover:bg-accent/18 transition">
          <Plus size={13} /> New Schedule
        </button>
      </div>

      {schedules.length === 0 ? (
        <div className="rounded-xl border border-dashed border-brd-default px-5 py-6 text-center">
          <Calendar size={20} className="mx-auto mb-2 text-tx-faint opacity-50" />
          <p className="text-[12px] text-tx-faint">No schedules yet.</p>
          <p className="text-[11px] text-tx-faint opacity-70 mt-0.5">Create one to block distractions automatically at set times.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {schedules.map(s => (
            <div key={s.id}
              className="flex items-center gap-3 rounded-xl border border-brd-default bg-bg-card px-4 py-3 transition"
              style={{ opacity: s.active ? 1 : 0.55 }}>
              <button onClick={() => handleToggle(s)} className="shrink-0 transition">
                {s.active
                  ? <ToggleRight size={20} className="text-accent" />
                  : <ToggleLeft size={20} className="text-tx-faint" />}
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-semibold text-tx-primary">{s.label}</p>
                <p className="text-[10px] text-tx-faint">
                  {minsToTime(s.start_mins)} – {minsToTime(s.end_mins)}
                  {' · '}{dayMaskLabel(s.days_mask)}
                  {' · '}{profileLabel(s.profile_ids, profiles)}
                </p>
              </div>
              <button
                onClick={() => { setEditing(s); setShowModal(true); }}
                className="text-tx-faint hover:text-white transition shrink-0">
                <Edit2 size={13} />
              </button>
              <button onClick={() => handleDelete(s.id)}
                className="text-tx-faint hover:text-red-400 transition shrink-0">
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <ScheduleModal
          schedule={editing}
          profiles={profiles}
          onClose={() => { setShowModal(false); setEditing(null); }}
          onSave={handleSave}
        />
      )}
    </section>
  );
}
