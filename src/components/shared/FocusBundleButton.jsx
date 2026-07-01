import React, { useState, useEffect, useRef } from 'react';
import { Zap, X, ChevronDown } from 'lucide-react';

const api = window.electron || {};

const DURATION_PRESETS = [
  { label: '25m',  secs: 25 * 60 },
  { label: '50m',  secs: 50 * 60 },
  { label: '90m',  secs: 90 * 60 },
];

export default function FocusBundleButton({ user }) {
  const [open,            setOpen]            = useState(false);
  const [profiles,        setProfiles]        = useState([]);
  const [selectedProfile, setSelectedProfile] = useState('');
  const [duration,        setDuration]        = useState(25 * 60);
  const [useSlack,        setUseSlack]        = useState(false);
  const [slackToken,      setSlackToken]      = useState('');
  const [focusActive,     setFocusActive]     = useState(false);
  const panelRef = useRef(null);

  useEffect(() => {
    if (!user?.id) return;
    api.listBlockerProfiles?.({ userId: user.id }).then(list => setProfiles(list || []));
    api.focusModeStatus?.().then(s => setFocusActive(!!s?.active));
    const token = localStorage.getItem('fl_slack_token') || '';
    setSlackToken(token);
    if (token) setUseSlack(true);
  }, [user?.id]);

  useEffect(() => {
    const unsub = api.onFocusModeChanged?.(({ active }) => setFocusActive(!!active));
    return () => typeof unsub === 'function' && unsub();
  }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const launch = async () => {
    setOpen(false);
    await api.startFocusMode?.({
      userId:    user.id,
      profileId: selectedProfile || null,
      ruleScope: selectedProfile ? 'profile' : 'global',
    });
    if (useSlack && slackToken) {
      await api.slackSetStatus?.({
        token:       slackToken,
        statusText:  'In focus mode',
        statusEmoji: ':dart:',
        durationSecs: duration,
      });
    }
  };

  const stop = async () => {
    await api.stopFocusMode?.();
    if (useSlack && slackToken) {
      await api.slackSetStatus?.({ token: slackToken, statusText: '', statusEmoji: '', durationSecs: 0 });
    }
  };

  if (focusActive) {
    return (
      <button onClick={stop}
        className="flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-300 transition hover:bg-red-500/18">
        <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
        End Bundle
      </button>
    );
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/12 px-3 py-1.5 text-xs font-semibold text-accent transition hover:bg-accent/20">
        <Zap size={11} />
        Focus Bundle
        <ChevronDown size={10} className={`transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1.5 w-72 rounded-2xl border border-brd-strong bg-bg-card shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-brd-default">
            <div className="flex items-center gap-2">
              <Zap size={13} className="text-accent" />
              <span className="text-[12px] font-bold text-tx-primary">Focus Bundle</span>
            </div>
            <button onClick={() => setOpen(false)} className="text-tx-faint hover:text-white"><X size={13} /></button>
          </div>

          <div className="p-4 space-y-3.5">
            {/* Duration */}
            <div>
              <p className="text-[10px] text-tx-faint uppercase tracking-wider mb-1.5">Duration</p>
              <div className="flex gap-1.5">
                {DURATION_PRESETS.map(p => (
                  <button key={p.secs} onClick={() => setDuration(p.secs)}
                    className="flex-1 rounded-lg py-1.5 text-[11px] font-semibold transition"
                    style={{
                      background: duration === p.secs ? 'rgba(124,108,242,0.12)' : 'transparent',
                      border:     `1px solid ${duration === p.secs ? 'rgba(124,108,242,0.35)' : 'var(--color-brd-default)'}`,
                      color:      duration === p.secs ? '#a89cf7' : 'var(--color-tx-faint)',
                    }}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Block profile */}
            {profiles.length > 0 && (
              <div>
                <p className="text-[10px] text-tx-faint uppercase tracking-wider mb-1.5">Block profile</p>
                <select value={selectedProfile} onChange={e => setSelectedProfile(e.target.value)}
                  className="w-full bg-bg-app border border-brd-default rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-accent">
                  <option value="">None (global rules)</option>
                  {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            )}

            {/* Slack status */}
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <input type="checkbox" id="fl-slack-cb" checked={useSlack} onChange={e => setUseSlack(e.target.checked)}
                  className="accent-accent" />
                <label htmlFor="fl-slack-cb" className="text-[11px] text-tx-secondary cursor-pointer select-none">
                  Update Slack status
                </label>
              </div>
              {useSlack && (
                <input
                  value={slackToken}
                  onChange={e => { setSlackToken(e.target.value); localStorage.setItem('fl_slack_token', e.target.value); }}
                  placeholder="xoxp-… Slack user token"
                  type="password"
                  className="w-full bg-bg-app border border-brd-default rounded-xl px-3 py-2 text-xs text-white placeholder-tx-faint focus:outline-none focus:border-accent"
                />
              )}
            </div>
          </div>

          <div className="px-4 pb-4">
            <button onClick={launch}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-accent py-2.5 text-sm font-bold text-white hover:bg-accent-light transition">
              <Zap size={13} /> Launch Focus Bundle
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
