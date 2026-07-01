import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Shield, Plus, Trash2, X, Check, Smartphone, Globe, Zap, ZapOff,
  Timer, Edit2, Search, Settings, Bell, Puzzle, Instagram, Clapperboard,
  Gamepad2, MessageCircle, Newspaper, GripVertical, ChevronRight,
  BadgePlus, Trophy, BarChart3, Clock3, ListFilter, CheckCircle2,
  Maximize2, FolderKanban, ChevronDown, ChevronUp, Layers, Play,
  StopCircle, Pencil, Palette,
} from 'lucide-react';
import FocusModeOverlay from '../timer/FocusModeOverlay';
import AppIcon from '../shared/AppIcon';
import BlockScheduler from './BlockScheduler';

const api = window.electron || {};

const PRESETS = [
  { label: 'Social Media', pattern: 'twitter\\.com|facebook\\.com|instagram\\.com|tiktok\\.com|reddit\\.com', type: 'url', Icon: Instagram, color: '#F43F8C' },
  { label: 'Video',        pattern: 'youtube\\.com|netflix\\.com|twitch\\.tv|hulu\\.com',                    type: 'url', Icon: Clapperboard, color: '#A78BFA' },
  { label: 'Games',        pattern: 'Steam|Epic Games|Battle\\.net|Origin',                                   type: 'app', Icon: Gamepad2, color: '#A78BFA' },
  { label: 'Chat',         pattern: 'discord\\.com|Discord|Slack|WhatsApp|Telegram',                          type: 'url', Icon: MessageCircle, color: '#CBD5E1' },
  { label: 'News',         pattern: 'cnn\\.com|bbc\\.com|foxnews\\.com|nytimes\\.com|news\\.google\\.com',   type: 'url', Icon: Newspaper, color: '#CBD5E1' },
];

const PROFILE_COLORS = [
  '#7c6cf2', '#34D399', '#F87171', '#FBBF24', '#60A5FA',
  '#F472B6', '#4ADE80', '#FB923C', '#818CF8', '#2DD4BF',
];

// Extract the first meaningful token from a pipe-separated pattern and strip regex escapes.
// e.g. "twitter\\.com|reddit\\.com" → "twitter.com"
//      "Discord|Steam|Spotify"       → "Discord"
function firstPatternToken(pattern) {
  return (pattern || '').split('|')[0].trim()
    .replace(/\\\./g, '.').replace(/\\\+/g, '+').replace(/\\\*/g, '*');
}

// Build AppIcon props from a distraction rule.
function ruleIconProps(rule) {
  const token = firstPatternToken(rule.pattern);
  if (rule.rule_type === 'url') {
    // Treat as a domain — prefix with https:// so AppIcon can extract the hostname.
    const url = token.startsWith('http') ? token : `https://${token}`;
    return { appName: token.replace(/^www\./, '').split('.')[0], url };
  }
  // App rule — pass the name; AppIcon tries native icon → clearbit → google → initial.
  return { appName: token };
}

function BlockedToast({ items, onDismiss }) {
  if (!items.length) return null;
  return (
    <div className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2 pointer-events-none">
      {items.map(item => (
        <div key={item.id} className="flex items-center gap-3 rounded-xl border border-red-500/30 bg-bg-card px-4 py-3 shadow-2xl pointer-events-auto">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-500/15 text-red-300">
            <X size={15} />
          </div>
          <div className="flex-1">
            <p className="text-xs font-semibold text-red-300">Distraction blocked</p>
            <p className="max-w-[180px] truncate text-xs text-tx-secondary">{item.url}</p>
          </div>
          <button onClick={() => onDismiss(item.id)} className="text-tx-faint hover:text-white">
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}

function ManualTimerModal({ onClose, onSet }) {
  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(25);

  const apply = () => {
    const secs = hours * 3600 + minutes * 60;
    if (secs > 0) onSet(secs);
    onClose();
  };

  return (
    <div className="fl-focus-timer-modal fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="fl-focus-timer-card w-80 rounded-2xl border border-brd-strong bg-bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-brd-default px-5 py-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
            <Timer size={14} className="text-accent" /> Set Focus Duration
          </h3>
          <button onClick={onClose} className="text-tx-faint hover:text-white"><X size={14} /></button>
        </div>
        <div className="space-y-4 p-5">
          <p className="text-xs text-tx-secondary">Set the target duration for your focus session timer.</p>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-tx-faint">Hours</label>
              <input type="number" min="0" max="12" value={hours}
                onChange={e => setHours(Math.max(0, parseInt(e.target.value, 10) || 0))}
                className="w-full rounded-xl border border-brd-default bg-bg-app px-3 py-2.5 text-center font-mono text-sm text-white outline-none focus:border-accent" />
            </div>
            <span className="pt-4 text-xl text-tx-faint">:</span>
            <div className="flex-1">
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-tx-faint">Minutes</label>
              <input type="number" min="0" max="59" value={minutes}
                onChange={e => setMinutes(Math.max(0, Math.min(59, parseInt(e.target.value, 10) || 0)))}
                className="w-full rounded-xl border border-brd-default bg-bg-app px-3 py-2.5 text-center font-mono text-sm text-white outline-none focus:border-accent" />
            </div>
          </div>
          <div className="flex gap-2">
            {[25, 45, 90].map(m => (
              <button key={m} onClick={() => { setHours(0); setMinutes(m); }}
                className="fl-focus-preset-btn flex-1 rounded-lg bg-brd-default py-1.5 text-xs text-tx-secondary transition hover:bg-bg-hover hover:text-white">
                {m}m
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2 px-5 pb-5">
          <button onClick={onClose} className="fl-focus-cancel-btn flex-1 rounded-xl bg-brd-default py-2.5 text-sm text-tx-secondary transition hover:bg-bg-hover">
            Cancel
          </button>
          <button onClick={apply} disabled={hours === 0 && minutes === 0}
            className="fl-focus-apply-btn flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent py-2.5 text-sm font-semibold text-white transition hover:bg-accent-light disabled:opacity-50">
            <Check size={13} /> Apply
          </button>
        </div>
      </div>
    </div>
  );
}

function PanelCard({ children, className = '', style }) {
  return (
    <div
      className={`fl-blocker-panel rounded-xl border border-white/[0.09] bg-white/[0.035] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] ${className}`}
      style={style}
    >
      {children}
    </div>
  );
}

function RuleIcon({ rule }) {
  return <AppIcon {...ruleIconProps(rule)} size={40} radius={8} />;
}

function ToggleSwitch({ checked, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`relative h-7 w-12 rounded-full border transition ${checked ? 'border-green-400/30 bg-green-500' : 'border-white/[0.12] bg-white/[0.08]'}`}
      aria-pressed={checked}
    >
      <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${checked ? 'left-6' : 'left-1'}`} />
    </button>
  );
}

// ─── NEW PROFILE MODAL ────────────────────────────────────────────────────────
function NewProfileModal({ onClose, onSave }) {
  const [name,   setName]   = useState('');
  const [color,  setColor]  = useState(PROFILE_COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const submit = async () => {
    if (!name.trim()) return;
    setError('');
    setSaving(true);
    try {
      await onSave({ name: name.trim(), color });
      onClose();
    } catch (e) {
      setError(e?.message || 'Failed to create profile. Please try again.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-96 overflow-hidden rounded-2xl border border-brd-strong bg-bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-brd-default px-5 py-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
            <FolderKanban size={14} className="text-accent" /> New Focus Profile
          </h3>
          <button onClick={onClose} className="text-tx-faint hover:text-white"><X size={15} /></button>
        </div>
        <div className="space-y-4 p-5">
          <div>
            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-tx-faint">Profile Name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submit()}
              placeholder="e.g. Deep Work, Client Project, Design Sprint…"
              autoFocus
              className="w-full rounded-xl border border-brd-default bg-bg-app px-3 py-2.5 text-sm text-white placeholder-tx-faint outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-tx-faint">Color</label>
            <div className="flex flex-wrap gap-2">
              {PROFILE_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className="h-7 w-7 rounded-full border-2 transition-all"
                  style={{ background: c, borderColor: color === c ? '#fff' : 'transparent', transform: color === c ? 'scale(1.15)' : 'scale(1)' }}
                />
              ))}
            </div>
          </div>
          {error && <p className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-300">{error}</p>}
        </div>
        <div className="flex gap-2 px-5 pb-5">
          <button onClick={onClose} disabled={saving} className="flex-1 rounded-xl bg-brd-default py-2.5 text-sm text-tx-secondary transition hover:bg-bg-hover disabled:opacity-50">
            Cancel
          </button>
          <button onClick={submit} disabled={!name.trim() || saving}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent py-2.5 text-sm font-semibold text-white transition hover:bg-accent-light disabled:opacity-50">
            {saving ? 'Creating…' : <><Check size={13} /> Create Profile</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── ADD APP TO PROFILE MODAL ─────────────────────────────────────────────────
function AddAppModal({ profile, onClose, onAdded }) {
  const [ruleType,         setRuleType]         = useState('app');
  const [pattern,          setPattern]          = useState('');
  const [label,            setLabel]            = useState('');
  const [saving,           setSaving]           = useState(false);
  const [error,            setError]            = useState('');
  const [showProcessGuide, setShowProcessGuide] = useState(false);

  const submit = async () => {
    if (!pattern.trim()) return;
    setError('');
    setSaving(true);
    try {
      const rule = await api.addProfileRule?.({
        profileId: profile.id,
        userId: profile.user_id,
        ruleType,
        pattern: pattern.trim(),
        label: label.trim() || null,
      });
      if (!rule) throw new Error('No response from backend');
      onAdded(rule);
      onClose();
    } catch (e) {
      setError(e?.message || 'Failed to add. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-96 overflow-hidden rounded-2xl border border-brd-strong bg-bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-brd-default px-5 py-4">
          <div>
            <h3 className="text-sm font-semibold text-white">Add App / Website</h3>
            <p className="text-xs text-tx-secondary mt-0.5">to <span className="font-bold" style={{ color: profile.color }}>{profile.name}</span></p>
          </div>
          <button onClick={onClose} className="text-tx-faint hover:text-white"><X size={15} /></button>
        </div>
        <div className="space-y-3 p-5">
          <div className="flex gap-2">
            {[{ v: 'app', label: 'App', Icon: Smartphone }, { v: 'url', label: 'Website', Icon: Globe }].map(t => (
              <button key={t.v} onClick={() => setRuleType(t.v)}
                className={`flex flex-1 items-center justify-center gap-2 rounded-lg border py-2 text-sm font-medium transition-all ${
                  ruleType === t.v ? 'border-accent/50 bg-accent/20 text-accent-light' : 'border-brd-strong bg-bg-app text-tx-faint hover:text-white'
                }`}>
                <t.Icon size={13} /> {t.label}
              </button>
            ))}
          </div>
          <input value={label} onChange={e => setLabel(e.target.value)}
            placeholder="Label (e.g. Twitter, Slack)"
            className="w-full rounded-xl border border-brd-default bg-bg-app px-3 py-2.5 text-sm text-white placeholder-tx-faint outline-none focus:border-accent" />
          <input
            value={pattern}
            onChange={e => setPattern(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()}
            placeholder={ruleType === 'url' ? 'twitter.com|reddit.com' : 'PowerPoint|Discord|Steam'}
            className="w-full rounded-xl border border-brd-default bg-bg-app px-3 py-2.5 font-mono text-sm text-white placeholder-tx-faint outline-none focus:border-accent"
          />
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs text-tx-secondary">
              {ruleType === 'url'
                ? 'Enter domain names separated by |. These URLs will be blocked during focus.'
                : 'Enter app names separated by |. Use friendly names — PowerPoint, Excel, Discord, Spotify, Steam all work.'}
            </p>
            {ruleType === 'app' && (
              <button
                type="button"
                onClick={() => setShowProcessGuide(true)}
                className="shrink-0 flex items-center gap-1 text-[11px] font-semibold text-accent hover:text-accent-light transition-colors"
              >
                <Search size={10} /> How?
              </button>
            )}
          </div>
          {error && <p className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-300">{error}</p>}
        </div>
        <div className="flex gap-2 px-5 pb-5">
          <button onClick={onClose} disabled={saving} className="flex-1 rounded-xl bg-brd-default py-2.5 text-sm text-tx-secondary transition hover:bg-bg-hover disabled:opacity-50">
            Cancel
          </button>
          <button onClick={submit} disabled={!pattern.trim() || saving}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent py-2.5 text-sm font-semibold text-white transition hover:bg-accent-light disabled:opacity-50">
            {saving ? 'Adding…' : <><Plus size={13} /> Add</>}
          </button>
        </div>
      </div>
    </div>
    {showProcessGuide && <ProcessNameGuideModal onClose={() => setShowProcessGuide(false)} />}
    </>
  );
}

// ─── PROFILE CARD ─────────────────────────────────────────────────────────────
function ProfileCard({ profile, focusActive, activeProfileId, onActivate, onDeactivate, onDelete, onRuleRemoved, onRuleAdded, userId }) {
  const [expanded,    setExpanded]    = useState(false);
  const [rules,       setRules]       = useState([]);
  const [loadingRules,setLoadingRules]= useState(false);
  const [showAddApp,  setShowAddApp]  = useState(false);

  const isThisActive = focusActive && activeProfileId === profile.id;
  const color = profile.color || '#7c6cf2';

  const loadRules = useCallback(async () => {
    setLoadingRules(true);
    const r = await api.listProfileRules?.({ profileId: profile.id });
    setRules(r || []);
    setLoadingRules(false);
  }, [profile.id]);

  const handleExpand = () => {
    const next = !expanded;
    setExpanded(next);
    if (next && rules.length === 0) loadRules();
  };

  const removeRule = async (ruleId) => {
    await api.removeProfileRule?.({ ruleId });
    setRules(r => r.filter(x => x.id !== ruleId));
    onRuleRemoved?.(profile.id);
  };

  const handleRuleAdded = (rule) => {
    setRules(r => [...r, rule]);
    onRuleAdded?.(profile.id);
    if (!expanded) setExpanded(true);
  };

  return (
    <>
      <div
        className={`fl-profile-card rounded-xl border overflow-hidden transition-all ${isThisActive ? 'fl-profile-card-active' : ''}`}
        style={{ borderColor: isThisActive ? `${color}44` : 'rgba(255,255,255,0.09)', background: isThisActive ? `${color}09` : 'rgba(255,255,255,0.03)' }}
      >
        {/* Active focus stripe */}
        {isThisActive && (
          <div className="h-0.5 w-full" style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }} />
        )}

        {/* Profile header row */}
        <div className="flex items-center gap-3.5 px-5 py-3.5">
          {/* Icon */}
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-sm"
               style={{ background: `${color}20`, border: `1.5px solid ${color}38` }}>
            <FolderKanban size={17} style={{ color }} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-[14px] font-extrabold text-white truncate">{profile.name}</p>
              {isThisActive && (
                <span className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold" style={{ background: `${color}20`, color }}>
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: color }} />
                  ACTIVE
                </span>
              )}
              {(profile.rule_count ?? 0) > 0 && (
                <span className="rounded-md bg-white/[0.07] px-2 py-0.5 text-[10px] font-bold text-tx-secondary">
                  {profile.rule_count} blocked
                </span>
              )}
            </div>
            <p className="text-[11px] text-tx-faint mt-0.5">
              {(profile.rule_count ?? 0) === 0 ? 'No apps added yet — click Add App to start' : `${profile.rule_count} app${(profile.rule_count ?? 0) === 1 ? '' : 's'} blocked during focus`}
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1.5 shrink-0">
            {isThisActive ? (
              <button onClick={() => onDeactivate(profile)}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-bold text-red-200 bg-red-500/14 border border-red-500/22 hover:bg-red-500/22 transition">
                <StopCircle size={12} /> Stop
              </button>
            ) : (
              <button onClick={() => onActivate(profile)}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-bold text-white transition"
                style={{ background: color, boxShadow: `0 2px 14px ${color}44` }}
                onMouseOver={e => e.currentTarget.style.opacity = '0.85'}
                onMouseOut={e  => e.currentTarget.style.opacity = '1'}>
                <Play size={11} /> Focus
              </button>
            )}
            <button onClick={() => setShowAddApp(true)}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.09] bg-white/[0.05] text-tx-secondary hover:text-white hover:bg-white/[0.10] transition"
              title="Add app or website">
              <Plus size={14} />
            </button>
            <button onClick={handleExpand}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.09] bg-white/[0.05] text-tx-secondary hover:text-white transition">
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            <button onClick={() => onDelete(profile.id)}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.06] bg-transparent text-tx-faint hover:text-red-300 hover:border-red-400/25 hover:bg-red-400/08 transition"
              title="Delete profile">
              <Trash2 size={13} />
            </button>
          </div>
        </div>

        {/* Expanded app list */}
        {expanded && (
          <div className="border-t px-5 pb-4 pt-3" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
            {loadingRules ? (
              <p className="text-[12px] text-tx-faint py-2">Loading…</p>
            ) : rules.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.04] text-tx-faint">
                  <Layers size={18} />
                </div>
                <p className="text-[13px] font-semibold text-tx-secondary">No apps yet</p>
                <p className="max-w-xs text-[11px] text-tx-faint">Add apps or websites that should be blocked when this profile's focus mode is active.</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {rules.map(rule => {
                  return (
                    <div key={rule.id}
                      className="group flex items-center gap-3 rounded-lg border border-white/[0.07] bg-white/[0.03] px-3.5 py-2.5 transition hover:bg-white/[0.06]">
                      <AppIcon {...ruleIconProps(rule)} size={28} radius={6} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-bold text-white truncate">{rule.label || rule.pattern}</p>
                        {rule.label && <p className="text-[11px] font-mono text-tx-faint truncate">{rule.pattern}</p>}
                      </div>
                      <span className={`text-[10px] font-bold rounded px-1.5 py-0.5 ${rule.rule_type === 'url' ? 'bg-blue-400/12 text-blue-300' : 'bg-amber-400/12 text-amber-300'}`}>
                        {rule.rule_type === 'url' ? 'Web' : 'App'}
                      </span>
                      <button onClick={() => removeRule(rule.id)}
                        className="text-tx-faint opacity-0 group-hover:opacity-100 hover:text-red-300 transition">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            {/* Inline "Add App" shortcut at bottom of list */}
            {rules.length > 0 && (
              <button onClick={() => setShowAddApp(true)}
                className="mt-1 flex w-full items-center gap-2 rounded-lg border border-dashed border-white/[0.09] px-3.5 py-2 text-[12px] font-medium text-tx-faint hover:text-white hover:border-white/[0.20] transition">
                <Plus size={12} /> Add another app or website…
              </button>
            )}
          </div>
        )}
      </div>

      {showAddApp && (
        <AddAppModal
          profile={{ ...profile, user_id: userId }}
          onClose={() => setShowAddApp(false)}
          onAdded={handleRuleAdded}
        />
      )}
    </>
  );
}

// ─── CHROME EXTENSION INSTALL GUIDE MODAL ────────────────────────────────────
function InstallGuideModal({ onClose }) {
  const isLight = document.documentElement.classList.contains('theme-light');

  const surface = isLight
    ? { bg: '#FFFFFF', border: '1px solid rgba(15,23,42,0.10)', shadow: '0 32px 80px rgba(15,23,42,0.18)' }
    : { bg: '#0C1829', border: '1px solid rgba(255,255,255,0.10)', shadow: '0 32px 80px rgba(0,0,0,0.70)' };

  const divider = isLight ? '1px solid rgba(15,23,42,0.08)' : '1px solid rgba(255,255,255,0.07)';
  const heading = isLight ? '#0F172A' : '#FFFFFF';
  const sub     = isLight ? '#64748B' : 'rgba(255,255,255,0.42)';
  const body    = isLight ? '#334155' : 'rgba(255,255,255,0.56)';
  const codeBg  = isLight ? 'rgba(15,23,42,0.05)' : 'rgba(255,255,255,0.07)';
  const codeClr = isLight ? '#1D4ED8' : '#93C5FD';
  const codeBrd = isLight ? 'rgba(15,23,42,0.10)' : 'rgba(255,255,255,0.10)';

  const steps = [
    {
      num: '01',
      icon: <Settings size={15} />,
      color: '#60A5FA',
      title: 'Enable Developer Mode',
      desc: 'Open Chrome and navigate to the extensions page. Toggle "Developer mode" on in the top-right corner.',
      code: 'chrome://extensions',
    },
    {
      num: '02',
      icon: <Puzzle size={15} />,
      color: '#A78BFA',
      title: 'Load Unpacked Extension',
      desc: 'Click "Load unpacked" and select the chrome-extension folder from your Flow Ledger install directory.',
      code: 'chrome-extension/',
    },
    {
      num: '03',
      icon: <BadgePlus size={15} />,
      color: '#34D399',
      title: 'Pin to Toolbar',
      desc: 'Click the puzzle-piece icon in Chrome\'s toolbar, find Flow Ledger, and click the pin icon for quick access.',
    },
    {
      num: '04',
      icon: <Zap size={15} />,
      color: '#FBBF24',
      title: 'Start Blocking',
      desc: 'Make sure Flow Ledger Desktop is running, then start a Focus Session — blocked sites will redirect automatically.',
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-[480px] overflow-hidden rounded-2xl"
        style={{ background: surface.bg, border: surface.border, boxShadow: surface.shadow }}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: divider }}>
          <div className="flex items-center gap-3.5">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
              style={{ background: 'rgba(96,165,250,0.12)', border: '1.5px solid rgba(96,165,250,0.24)', color: '#60A5FA' }}
            >
              <Puzzle size={20} />
            </div>
            <div>
              <h2 className="text-[15px] font-extrabold leading-tight" style={{ color: heading }}>Chrome Extension Setup</h2>
              <p className="text-[12px] mt-0.5" style={{ color: sub }}>Install in 4 steps · takes ~2 minutes</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg transition"
            style={{ color: sub }}
            onMouseOver={e => e.currentTarget.style.background = isLight ? 'rgba(15,23,42,0.06)' : 'rgba(255,255,255,0.07)'}
            onMouseOut={e  => e.currentTarget.style.background = 'transparent'}
          >
            <X size={16} />
          </button>
        </div>

        {/* ── Steps ── */}
        <div className="px-6 py-5 space-y-1">
          {steps.map((step, i) => (
            <div key={i} className="flex gap-4">
              {/* Left: number + connector line */}
              <div className="flex flex-col items-center">
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold"
                  style={{ background: `${step.color}16`, border: `1.5px solid ${step.color}36`, color: step.color }}
                >
                  {step.num}
                </div>
                {i < steps.length - 1 && (
                  <div className="mt-1 mb-1 w-px flex-1" style={{ background: isLight ? 'rgba(15,23,42,0.08)' : 'rgba(255,255,255,0.08)', minHeight: 20 }} />
                )}
              </div>

              {/* Right: content */}
              <div className="flex-1 pb-4">
                <div className="flex items-center gap-2 mb-1">
                  <span style={{ color: step.color }}>{step.icon}</span>
                  <p className="text-[13px] font-bold" style={{ color: heading }}>{step.title}</p>
                </div>
                <p className="text-[12.5px] leading-relaxed" style={{ color: body }}>{step.desc}</p>
                {step.code && (
                  <code
                    className="mt-2 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px] font-mono"
                    style={{ background: codeBg, color: codeClr, border: `1px solid ${codeBrd}` }}
                  >
                    {step.code}
                  </code>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* ── Info banner ── */}
        <div
          className="mx-6 rounded-xl px-4 py-3"
          style={{
            background: isLight ? 'rgba(59,130,246,0.06)' : 'rgba(59,130,246,0.09)',
            border: isLight ? '1px solid rgba(59,130,246,0.16)' : '1px solid rgba(59,130,246,0.18)',
          }}
        >
          <p className="text-[12px] leading-relaxed" style={{ color: isLight ? '#1D4ED8' : '#93C5FD' }}>
            <span className="font-bold">Note:</span> The extension communicates with Flow Ledger Desktop on{' '}
            <code className="rounded px-1 font-mono text-[11px]"
              style={{ background: isLight ? 'rgba(29,78,216,0.08)' : 'rgba(147,197,253,0.12)' }}>
              localhost:27314
            </code>
            . Keep the desktop app running while browsing.
          </p>
        </div>

        {/* ── Footer ── */}
        <div className="flex gap-2.5 px-6 py-5">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl py-2.5 text-[13px] font-semibold transition"
            style={{
              background: isLight ? 'rgba(15,23,42,0.05)' : 'rgba(255,255,255,0.07)',
              color: isLight ? '#475569' : 'rgba(255,255,255,0.55)',
              border: divider,
            }}
            onMouseOver={e => e.currentTarget.style.background = isLight ? 'rgba(15,23,42,0.09)' : 'rgba(255,255,255,0.11)'}
            onMouseOut={e  => e.currentTarget.style.background = isLight ? 'rgba(15,23,42,0.05)' : 'rgba(255,255,255,0.07)'}
          >
            Close
          </button>
          <button
            onClick={onClose}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-bold text-white transition"
            style={{ background: '#3B82F6', boxShadow: '0 4px 18px rgba(59,130,246,0.32)' }}
            onMouseOver={e => e.currentTarget.style.background = '#2563EB'}
            onMouseOut={e  => e.currentTarget.style.background = '#3B82F6'}
          >
            <Check size={14} /> Got it
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── PROCESS NAME GUIDE MODAL ────────────────────────────────────────────────
function ProcessNameGuideModal({ onClose }) {
  const isLight = document.documentElement.classList.contains('theme-light');

  const surface  = isLight
    ? { bg: '#FFFFFF', border: '1px solid rgba(15,23,42,0.10)', shadow: '0 32px 80px rgba(15,23,42,0.18)' }
    : { bg: '#0C1829', border: '1px solid rgba(255,255,255,0.10)', shadow: '0 32px 80px rgba(0,0,0,0.70)' };

  const divider  = isLight ? '1px solid rgba(15,23,42,0.08)'  : '1px solid rgba(255,255,255,0.07)';
  const heading  = isLight ? '#0F172A'                         : '#FFFFFF';
  const sub      = isLight ? '#64748B'                         : 'rgba(255,255,255,0.42)';
  const body     = isLight ? '#475569'                         : 'rgba(255,255,255,0.56)';
  const codeBg   = isLight ? 'rgba(15,23,42,0.05)'            : 'rgba(255,255,255,0.07)';
  const codeClr  = isLight ? '#1D4ED8'                         : '#93C5FD';
  const codeBrd  = isLight ? 'rgba(15,23,42,0.12)'            : 'rgba(255,255,255,0.10)';
  const rowBd    = isLight ? 'rgba(15,23,42,0.06)'            : 'rgba(255,255,255,0.06)';
  const altRow   = isLight ? 'rgba(15,23,42,0.025)'           : 'rgba(255,255,255,0.025)';
  const kbdBg    = isLight ? 'rgba(15,23,42,0.07)'            : 'rgba(255,255,255,0.09)';
  const kbdBrd   = isLight ? 'rgba(15,23,42,0.18)'            : 'rgba(255,255,255,0.15)';
  const tipBg    = isLight ? 'rgba(124,108,242,0.06)'         : 'rgba(124,108,242,0.10)';
  const tipBrd   = isLight ? 'rgba(124,108,242,0.16)'         : 'rgba(124,108,242,0.20)';
  const tipClr   = isLight ? '#4C1D95'                         : '#C4B5FD';
  const tipCode  = isLight ? 'rgba(124,108,242,0.10)'         : 'rgba(196,181,253,0.14)';

  const commonApps = [
    { name: 'PowerPoint', process: 'POWERPNT',  note: 'Microsoft Office' },
    { name: 'Word',       process: 'WINWORD',   note: 'Microsoft Office' },
    { name: 'Excel',      process: 'EXCEL',     note: 'Microsoft Office' },
    { name: 'Outlook',    process: 'OUTLOOK',   note: 'Microsoft Office' },
    { name: 'Teams',      process: 'Teams',     note: 'Microsoft'        },
    { name: 'Discord',    process: 'Discord',   note: 'Chat'             },
    { name: 'Spotify',    process: 'Spotify',   note: 'Music'            },
    { name: 'Steam',      process: 'steam',     note: 'Games'            },
    { name: 'Zoom',       process: 'Zoom',      note: 'Meetings'         },
    { name: 'Edge',       process: 'msedge',    note: 'Browser'          },
  ];

  const steps = [
    {
      num: '01', color: '#60A5FA',
      title: 'Open Task Manager',
      desc: 'Press the keyboard shortcut, or right-click the taskbar and choose "Task Manager".',
      kbd: ['Ctrl', 'Shift', 'Esc'],
    },
    {
      num: '02', color: '#A78BFA',
      title: 'Switch to the Details tab',
      desc: 'Click the "Details" tab at the top of Task Manager — it shows the exact .exe filename for every running process.',
    },
    {
      num: '03', color: '#34D399',
      title: 'Find your app in the list',
      desc: 'Locate the app in the Name column. The filename is the process name, e.g.',
      code: 'POWERPNT.exe',
    },
    {
      num: '04', color: '#FBBF24',
      title: 'Add it — without the .exe',
      desc: 'Paste the process name into the App field. Drop the .exe suffix.',
      code: 'POWERPNT.exe  →  POWERPNT',
    },
  ];

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.60)', backdropFilter: 'blur(8px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-[520px] overflow-hidden rounded-2xl"
        style={{ background: surface.bg, border: surface.border, boxShadow: surface.shadow }}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: divider }}>
          <div className="flex items-center gap-3.5">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
              style={{ background: 'rgba(124,108,242,0.12)', border: '1.5px solid rgba(124,108,242,0.26)', color: '#7c6cf2' }}
            >
              <Search size={19} />
            </div>
            <div>
              <h2 className="text-[15px] font-extrabold leading-tight" style={{ color: heading }}>
                Finding App Process Names
              </h2>
              <p className="text-[12px] mt-0.5" style={{ color: sub }}>
                2 methods · works for any Windows app
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg transition"
            style={{ color: sub }}
            onMouseOver={e => e.currentTarget.style.background = isLight ? 'rgba(15,23,42,0.06)' : 'rgba(255,255,255,0.07)'}
            onMouseOut={e  => e.currentTarget.style.background = 'transparent'}
          >
            <X size={16} />
          </button>
        </div>

        {/* ── Scrollable body ── */}
        <div className="overflow-y-auto" style={{ maxHeight: '62vh' }}>

          {/* Method 1: common apps */}
          <div className="px-6 pt-5 pb-2">
            <div className="flex items-center gap-2 mb-3">
              <span
                className="rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider"
                style={{ background: 'rgba(52,211,153,0.11)', color: '#34D399', border: '1px solid rgba(52,211,153,0.24)' }}
              >
                Method 1
              </span>
              <p className="text-[12.5px] font-bold" style={{ color: heading }}>
                Common apps — just type the friendly name
              </p>
            </div>

            {/* Reference table */}
            <div className="overflow-hidden rounded-xl" style={{ border: `1px solid ${rowBd}` }}>
              {/* Table header */}
              <div
                className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-2"
                style={{ background: altRow, borderBottom: `1px solid ${rowBd}` }}
              >
                <span className="text-[10px] font-extrabold uppercase tracking-wider" style={{ color: sub }}>You type</span>
                <span className="text-[10px] font-extrabold uppercase tracking-wider" style={{ color: sub }}></span>
                <span className="text-[10px] font-extrabold uppercase tracking-wider" style={{ color: sub }}>Windows process</span>
              </div>
              {commonApps.map((app, i) => (
                <div
                  key={app.name}
                  className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-4 py-2.5"
                  style={{
                    background: i % 2 === 1 ? altRow : 'transparent',
                    borderTop: i > 0 ? `1px solid ${rowBd}` : 'none',
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold" style={{ color: heading }}>{app.name}</span>
                    <span className="text-[10px]" style={{ color: sub }}>{app.note}</span>
                  </div>
                  <ChevronRight size={11} style={{ color: sub }} />
                  <code
                    className="rounded-md px-2 py-0.5 text-[12px] font-mono"
                    style={{ background: codeBg, color: codeClr, border: `1px solid ${codeBrd}` }}
                  >
                    {app.process}
                  </code>
                </div>
              ))}
            </div>

            <p className="mt-2.5 text-[11.5px] leading-relaxed" style={{ color: body }}>
              Flow Ledger maps these automatically — just type the friendly name and it will block the correct process.
            </p>
          </div>

          {/* OR divider */}
          <div className="flex items-center gap-3 px-6 py-4">
            <div className="flex-1 h-px" style={{ background: rowBd }} />
            <span className="text-[10px] font-extrabold uppercase tracking-widest px-1" style={{ color: sub }}>
              or, for any other app
            </span>
            <div className="flex-1 h-px" style={{ background: rowBd }} />
          </div>

          {/* Method 2: Task Manager steps */}
          <div className="px-6 pb-4">
            <div className="flex items-center gap-2 mb-4">
              <span
                className="rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider"
                style={{ background: 'rgba(96,165,250,0.11)', color: '#60A5FA', border: '1px solid rgba(96,165,250,0.24)' }}
              >
                Method 2
              </span>
              <p className="text-[12.5px] font-bold" style={{ color: heading }}>
                Look it up in Task Manager
              </p>
            </div>

            <div className="space-y-0">
              {steps.map((step, i) => (
                <div key={i} className="flex gap-4">
                  {/* Step number + connector */}
                  <div className="flex flex-col items-center">
                    <div
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold"
                      style={{
                        background: `${step.color}16`,
                        border: `1.5px solid ${step.color}38`,
                        color: step.color,
                      }}
                    >
                      {step.num}
                    </div>
                    {i < steps.length - 1 && (
                      <div
                        className="mt-1.5 mb-1 w-px flex-1"
                        style={{ background: isLight ? 'rgba(15,23,42,0.09)' : 'rgba(255,255,255,0.08)', minHeight: 18 }}
                      />
                    )}
                  </div>

                  {/* Step content */}
                  <div className="flex-1 pb-4">
                    <p className="text-[13px] font-bold leading-tight" style={{ color: heading }}>{step.title}</p>
                    <p className="text-[12.5px] leading-relaxed mt-0.5" style={{ color: body }}>{step.desc}</p>

                    {/* Keyboard shortcut chips */}
                    {step.kbd && (
                      <div className="mt-2 flex items-center gap-1.5">
                        {step.kbd.map((k, ki) => (
                          <React.Fragment key={k}>
                            <span
                              className="inline-flex items-center justify-center rounded-md px-2 py-0.5 text-[11px] font-bold"
                              style={{ background: kbdBg, border: `1px solid ${kbdBrd}`, color: heading }}
                            >
                              {k}
                            </span>
                            {ki < step.kbd.length - 1 && (
                              <span className="text-[11px] font-bold" style={{ color: sub }}>+</span>
                            )}
                          </React.Fragment>
                        ))}
                      </div>
                    )}

                    {/* Code snippet */}
                    {step.code && (
                      <code
                        className="mt-2 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px] font-mono"
                        style={{ background: codeBg, color: codeClr, border: `1px solid ${codeBrd}` }}
                      >
                        {step.code}
                      </code>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Tip banner */}
          <div
            className="mx-6 mb-5 rounded-xl px-4 py-3"
            style={{ background: tipBg, border: `1px solid ${tipBrd}` }}
          >
            <p className="text-[12px] leading-relaxed" style={{ color: tipClr }}>
              <span className="font-bold">Tip:</span> Separate multiple apps with{' '}
              <code className="rounded px-1 font-mono text-[11px]" style={{ background: tipCode }}>|</code>
              {' '}to block them together — e.g.{' '}
              <code className="rounded px-1 font-mono text-[11px]" style={{ background: tipCode }}>
                Discord|Steam|Spotify
              </code>
              . Patterns are always case-insensitive.
            </p>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="flex gap-2.5 px-6 py-5" style={{ borderTop: divider }}>
          <button
            onClick={onClose}
            className="flex-1 rounded-xl py-2.5 text-[13px] font-semibold transition"
            style={{
              background: isLight ? 'rgba(15,23,42,0.05)' : 'rgba(255,255,255,0.07)',
              color: isLight ? '#475569' : 'rgba(255,255,255,0.55)',
              border: divider,
            }}
            onMouseOver={e => e.currentTarget.style.background = isLight ? 'rgba(15,23,42,0.09)' : 'rgba(255,255,255,0.11)'}
            onMouseOut={e  => e.currentTarget.style.background = isLight ? 'rgba(15,23,42,0.05)' : 'rgba(255,255,255,0.07)'}
          >
            Close
          </button>
          <button
            onClick={onClose}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-bold text-white transition"
            style={{ background: '#7c6cf2', boxShadow: '0 4px 18px rgba(124,108,242,0.32)' }}
            onMouseOver={e => e.currentTarget.style.background = '#6d5ee0'}
            onMouseOut={e  => e.currentTarget.style.background = '#7c6cf2'}
          >
            <Check size={14} /> Got it
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function DistractionBlocker({ user }) {
  const [rules,           setRules]           = useState([]);
  const [profiles,        setProfiles]        = useState([]);
  const [activeProfileId, setActiveProfileId] = useState(null);
  const [showForm,        setShowForm]        = useState(false);
  const [showTimerModal,  setShowTimerModal]  = useState(false);
  const [showNewProfile,  setShowNewProfile]  = useState(false);
  const [form,            setForm]            = useState({ pattern: '', label: '', ruleType: 'url' });
  const [focusActive,     setFocusActive]     = useState(false);
  const [blockedToasts,   setBlockedToasts]   = useState([]);
  const [blockedCount,    setBlockedCount]    = useState(0);
  const [focusElapsed,    setFocusElapsed]    = useState(0);
  const [showOverlay,     setShowOverlay]     = useState(false);
  const [focusTarget,     setFocusTarget]     = useState(25 * 60);
  const [query,            setQuery]            = useState('');
  const [filter,           setFilter]           = useState('all');
  const [showInstallGuide, setShowInstallGuide] = useState(false);
  const [showProcessGuide, setShowProcessGuide] = useState(false);

  const focusStartRef = useRef(null);
  const timerRef      = useRef(null);

  const load = useCallback(async () => {
    const list = await api.listDistractions?.({ userId: user.id });
    setRules(list || []);
  }, [user.id]);

  const loadProfiles = useCallback(async () => {
    const list = await api.listBlockerProfiles?.({ userId: user.id });
    setProfiles(list || []);
  }, [user.id]);

  const loadFocusStatus = useCallback(async () => {
    const status = await api.focusModeStatus?.();
    if (status?.active) {
      setFocusActive(true);
      focusStartRef.current = status.startedAt ?? Date.now();
      setActiveProfileId(status.profileId ?? null);
    } else {
      setFocusActive(false);
      focusStartRef.current = null;
      setActiveProfileId(null);
    }
    const settings = await api.getTrackingSettings?.({ userId: user.id });
    setBlockedCount(settings?.blocked_attempts ?? 0);
  }, [user.id]);

  useEffect(() => {
    load();
    loadProfiles();
    loadFocusStatus();
  }, [load, loadProfiles, loadFocusStatus]);

  useEffect(() => {
    if (!focusActive) {
      clearInterval(timerRef.current);
      setFocusElapsed(0);
      return;
    }
    const tick = () => {
      if (focusStartRef.current) setFocusElapsed(Math.floor((Date.now() - focusStartRef.current) / 1000));
    };
    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => clearInterval(timerRef.current);
  }, [focusActive]);

  useEffect(() => {
    const unsub = api.onFocusModeChanged?.((data) => {
      if (data?.active) {
        setFocusActive(true);
        focusStartRef.current = data.startedAt ?? Date.now();
        setActiveProfileId(data.profileId ?? null);
      } else {
        setFocusActive(false);
        focusStartRef.current = null;
        setActiveProfileId(null);
      }
    });
    return () => unsub?.();
  }, []);

  useEffect(() => {
    const unsub = api.onTrackerBlocked?.((data) => {
      const toast = { id: Date.now(), url: data?.url || data?.appName || 'unknown' };
      setBlockedToasts(prev => [...prev.slice(-3), toast]);
      setBlockedCount(c => c + 1);
      setTimeout(() => setBlockedToasts(prev => prev.filter(t => t.id !== toast.id)), 5000);
    });
    return () => { if (typeof unsub === 'function') unsub(); };
  }, []);

  const toggleFocusMode = async () => {
    if (focusActive) {
      await api.stopFocusMode?.();
      setFocusActive(false);
      setShowOverlay(false);
      setActiveProfileId(null);
      focusStartRef.current = null;
    } else {
      const res = await api.startFocusMode?.({ userId: user.id });
      setFocusActive(true);
      setShowOverlay(true);
      setActiveProfileId(null);
      focusStartRef.current = res?.startedAt ?? Date.now();
    }
  };

  const activateProfile = async (profile) => {
    // If another focus session is running, stop it first
    if (focusActive) await api.stopFocusMode?.();
    // Keep profile focus exclusive so common/global rules do not bleed into profile sessions.
    await Promise.all(
      profiles
        .filter(p => p.id !== profile.id && p.active)
        .map(p => api.toggleBlockerProfile?.({ profileId: p.id, active: false }))
    );
    await api.toggleBlockerProfile?.({ profileId: profile.id, active: true });
    // Start focus mode tied to this profile
    const res = await api.startFocusMode?.({ userId: user.id, profileId: profile.id, ruleScope: 'profile' });
    if (res?.ruleScope !== 'profile' || res?.profileId !== profile.id) {
      await api.stopFocusMode?.();
      throw new Error('Could not start this profile cleanly. Please try again.');
    }
    setProfiles(prev => prev.map(p => ({ ...p, active: p.id === profile.id ? 1 : 0 })));
    setFocusActive(true);
    setShowOverlay(true);
    setActiveProfileId(profile.id);
    focusStartRef.current = res?.startedAt ?? Date.now();
  };

  const deactivateProfile = async (profile) => {
    await api.stopFocusMode?.();
    await api.toggleBlockerProfile?.({ profileId: profile.id, active: false });
    setFocusActive(false);
    setShowOverlay(false);
    setActiveProfileId(null);
    focusStartRef.current = null;
  };

  const createProfile = async ({ name, color }) => {
    const p = await api.createBlockerProfile?.({ userId: user.id, name, color });
    if (!p) throw new Error('No response from backend');
    // Include user_id so AddAppModal can pass it immediately without a reload
    setProfiles(prev => [...prev, { ...p, user_id: user.id, rule_count: 0 }]);
  };

  const deleteProfile = async (profileId) => {
    await api.deleteBlockerProfile?.({ profileId });
    setProfiles(prev => prev.filter(p => p.id !== profileId));
    if (activeProfileId === profileId) {
      setFocusActive(false);
      setActiveProfileId(null);
    }
  };

  // Update rule_count badge without full reload
  const bumpProfileCount = (profileId, delta) => {
    setProfiles(prev => prev.map(p => p.id === profileId ? { ...p, rule_count: Math.max(0, (p.rule_count ?? 0) + delta) } : p));
  };

  const applyManualOffset = (targetSecs) => {
    setFocusTarget(targetSecs);
    if (focusActive) { focusStartRef.current = Date.now(); setFocusElapsed(0); }
  };

  const create = async () => {
    if (!form.pattern.trim()) return;
    await api.createDistraction?.({
      userId: user.id,
      ruleType: form.ruleType,
      pattern: form.pattern.trim(),
      label: form.label.trim() || null,
    });
    setForm({ pattern: '', label: '', ruleType: 'url' });
    setShowForm(false);
    load();
  };

  const addPreset = async (preset) => {
    await api.createDistraction?.({ userId: user.id, ruleType: preset.type, pattern: preset.pattern, label: preset.label });
    load();
  };

  const toggle = async (rule) => {
    await api.toggleDistraction?.({ ruleId: rule.id, active: !rule.active });
    setRules(r => r.map(x => x.id === rule.id ? { ...x, active: !x.active } : x));
  };

  const remove = async (id) => {
    await api.deleteDistraction?.({ ruleId: id });
    setRules(r => r.filter(x => x.id !== id));
  };

  const dismissToast = (id) => setBlockedToasts(prev => prev.filter(t => t.id !== id));

  // Only count global rules (no profile_id) for the stats
  const globalRules = rules.filter(r => !r.profile_id);
  const activeCount = globalRules.filter(r => r.active).length;
  const protectionPct = globalRules.length ? Math.round((activeCount / globalRules.length) * 100) : 0;

  const filteredRules = useMemo(() => {
    const q = query.trim().toLowerCase();
    return globalRules.filter(rule => {
      const matchesQuery = !q || `${rule.label || ''} ${rule.pattern || ''}`.toLowerCase().includes(q);
      const matchesFilter =
        filter === 'all' ||
        (filter === 'enabled' && rule.active) ||
        (filter === 'web' && rule.rule_type === 'url') ||
        (filter === 'app' && rule.rule_type === 'app');
      return matchesQuery && matchesFilter;
    });
  }, [globalRules, query, filter]);

  function fmtElapsed(secs) {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
    return `${m}m`;
  }

  return (
    <div className="fl-blocker-page h-full overflow-y-auto bg-[#070D16] text-white">
      <div className="fl-blocker-shell min-h-full px-7 py-6" style={{
        backgroundImage: 'radial-gradient(circle at 14% 0%, rgba(52,211,153,0.11), transparent 24rem), radial-gradient(circle at 88% 3%, rgba(124,108,242,0.12), transparent 25rem), linear-gradient(180deg, rgba(7,13,22,0.98), rgba(7,12,20,1))',
      }}>
        {/* ── Header ── */}
        <div className="fl-blocker-header mb-6 flex items-start justify-between gap-5 border-b border-white/[0.07] pb-5">
          <div className="flex items-start gap-4">
            {/* Status-reactive shield icon */}
            <div className={`relative flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border transition-all ${
              focusActive
                ? 'border-accent/35 bg-accent/14 text-accent shadow-[0_0_34px_rgba(124,108,242,0.22)]'
                : activeCount > 0
                  ? 'border-green-400/25 bg-green-400/12 text-green-300 shadow-[0_0_34px_rgba(52,211,153,0.14)]'
                  : 'border-white/[0.09] bg-white/[0.05] text-tx-secondary'
            }`}>
              <Shield size={28} />
              {focusActive && (
                <span className="fl-status-pulse absolute -right-1 -top-1 h-3 w-3 rounded-full bg-accent" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-[22px] font-extrabold leading-tight text-white">Distraction Blocker</h1>
                <span className={`flex items-center gap-1.5 rounded-lg px-2.5 py-0.5 text-[11px] font-bold tracking-wide ${
                  focusActive ? 'bg-accent/18 text-accent' : activeCount > 0 ? 'bg-green-400/14 text-green-300' : 'bg-white/[0.06] text-tx-secondary'
                }`}>
                  {focusActive && <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />}
                  {focusActive ? 'FOCUS ACTIVE' : activeCount > 0 ? 'PROTECTED' : 'INACTIVE'}
                </span>
              </div>
              <p className="mt-1 text-[13px] text-tx-secondary">
                <span className="font-semibold text-white/80">{globalRules.length}</span> global rule{globalRules.length === 1 ? '' : 's'}
                <span className="mx-2 text-tx-faint">·</span>
                <span className="font-semibold text-white/80">{profiles.length}</span> profile{profiles.length === 1 ? '' : 's'}
                {focusActive && (
                  <><span className="mx-2 text-tx-faint">·</span>
                  <span className="font-semibold text-accent">{fmtElapsed(focusElapsed)} elapsed</span></>
                )}
              </p>
              {/* Focus progress bar */}
              {focusActive && (
                <div className="mt-2 h-1 w-56 overflow-hidden rounded-full bg-white/[0.08]">
                  <div className="h-full rounded-full bg-accent transition-all duration-1000"
                       style={{ width: `${Math.min(100, (focusElapsed / focusTarget) * 100)}%` }} />
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => setShowForm(true)}
              className="flex h-9 items-center gap-1.5 rounded-lg border border-white/[0.09] bg-white/[0.05] px-3.5 text-[13px] font-semibold text-tx-secondary transition hover:bg-white/[0.09] hover:text-white">
              <Plus size={14} /> Add Rule
            </button>
            <button onClick={() => setShowTimerModal(true)}
              className="flex h-9 items-center gap-1.5 rounded-lg border border-white/[0.09] bg-white/[0.05] px-3.5 text-[13px] font-semibold text-tx-secondary transition hover:bg-white/[0.09] hover:text-white">
              <Settings size={14} /> Timer
            </button>
            {focusActive && (
              <button onClick={() => setShowOverlay(true)}
                className="flex h-9 items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/10 px-3.5 text-[13px] font-semibold text-accent transition hover:bg-accent/18">
                <Maximize2 size={14} /> Timer
              </button>
            )}
            <button onClick={toggleFocusMode} className={`flex h-10 items-center gap-2 rounded-xl px-5 text-[13px] font-extrabold text-white transition ${
              focusActive
                ? 'bg-red-500/18 text-red-200 border border-red-400/20 hover:bg-red-500/28'
                : 'bg-accent border border-accent/50 shadow-[0_0_28px_rgba(124,108,242,0.35)] hover:bg-accent-light hover:shadow-[0_0_38px_rgba(124,108,242,0.45)]'
            }`}>
              {focusActive ? <ZapOff size={15} /> : <Zap size={15} />}
              {focusActive ? 'End Focus' : 'Start Focus'}
            </button>
          </div>
        </div>

        {/* ── Stat cards ── */}
        <div className="mb-6 grid grid-cols-3 gap-4">
          {/* Card 1 — Protection coverage */}
          <PanelCard className="p-5" style={{ background: 'linear-gradient(145deg, rgba(16,80,55,0.32), rgba(9,24,23,0.90))', borderColor: 'rgba(52,211,153,0.20)' }}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-green-400/70">Protection Coverage</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-extrabold leading-none text-green-300">{protectionPct}%</span>
                </div>
                <p className="text-[12px] text-tx-secondary">
                  <span className="font-bold text-white/80">{activeCount}</span> of <span className="font-bold text-white/80">{globalRules.length}</span> rules active
                </p>
              </div>
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-green-400/20 bg-green-400/10 text-green-300">
                <Shield size={22} />
              </div>
            </div>
            {/* Mini coverage bar */}
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
              <div className="h-full rounded-full bg-green-400 transition-all duration-700"
                   style={{ width: `${protectionPct}%` }} />
            </div>
            <button onClick={focusActive ? () => setShowOverlay(true) : toggleFocusMode}
              className="mt-3 flex items-center gap-1 text-[12px] font-bold text-green-300 hover:text-green-200 transition">
              {focusActive ? 'View Focus Timer' : 'Start Focus Session'} <ChevronRight size={13} />
            </button>
          </PanelCard>

          {/* Card 2 — Blocked attempts */}
          <PanelCard className="p-5" style={{ background: 'linear-gradient(145deg, rgba(95,64,9,0.28), rgba(20,18,15,0.92))', borderColor: 'rgba(245,158,11,0.22)' }}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-amber-400/70">Blocked Attempts</p>
                <div className="flex items-baseline gap-2">
                  <span className="num text-4xl font-extrabold leading-none text-amber-300">{blockedCount}</span>
                  <span className="text-sm text-tx-secondary">total</span>
                </div>
                <p className="text-[12px] text-tx-secondary">distractions intercepted</p>
              </div>
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-amber-400/20 bg-amber-400/10 text-amber-300">
                <Bell size={20} />
              </div>
            </div>
            <div className="mt-4 flex h-8 items-end gap-px">
              {[35, 48, 28, 40, 32, 26, 44, 58, 73, 46, 35, 30, 67, 41, 36, 50, 76, 44, 32, 57, 70, 45, 38, 62].map((h, i) => (
                <span key={i} className="flex-1 rounded-sm bg-amber-400/30 transition-all"
                      style={{ height: `${h}%`, background: i >= 20 ? 'rgba(251,191,36,0.65)' : undefined }} />
              ))}
            </div>
          </PanelCard>

          {/* Card 3 — Chrome extension */}
          <PanelCard className="p-5" style={{ background: 'linear-gradient(145deg, rgba(14,50,91,0.32), rgba(8,18,33,0.92))', borderColor: 'rgba(96,165,250,0.22)' }}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-blue-400/70">Web Blocking</p>
                <p className="text-[15px] font-extrabold text-blue-200">Chrome Extension</p>
                <p className="text-[12px] leading-5 text-tx-secondary">
                  Load from <span className="rounded bg-white/[0.08] px-1 font-mono text-[11px] text-white">chrome-extension/</span> to enable site blocking.
                </p>
              </div>
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-blue-400/20 bg-blue-400/10 text-blue-300">
                <Puzzle size={20} />
              </div>
            </div>
            <button
              onClick={() => setShowInstallGuide(true)}
              className="mt-3 flex items-center gap-1 text-[12px] font-bold text-blue-300 hover:text-blue-200 transition cursor-pointer bg-transparent border-none p-0"
            >
              View Install Guide <ChevronRight size={13} />
            </button>
          </PanelCard>
        </div>

        {/* ── FOCUS PROFILES ── */}
        <section className="mb-7">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/12 text-accent">
                <FolderKanban size={14} />
              </div>
              <div>
                <h2 className="text-[11px] font-extrabold uppercase tracking-[0.15em] text-tx-secondary">Focus Profiles</h2>
                <p className="text-[11px] text-tx-faint">Activate a profile to block its apps &amp; start a focused session</p>
              </div>
            </div>
            <button
              onClick={() => setShowNewProfile(true)}
              className="flex items-center gap-1.5 rounded-lg border border-accent/25 bg-accent/10 px-3.5 py-1.5 text-[12px] font-bold text-accent hover:bg-accent/18 transition"
            >
              <Plus size={13} /> New Profile
            </button>
          </div>

          {profiles.length === 0 ? (
            <div
              onClick={() => setShowNewProfile(true)}
              className="flex cursor-pointer flex-col items-center gap-3 rounded-xl border border-dashed border-white/[0.12] bg-white/[0.02] py-10 text-center transition hover:border-accent/35 hover:bg-accent/[0.035]"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10 text-accent shadow-[0_0_28px_rgba(124,108,242,0.15)]">
                <FolderKanban size={26} />
              </div>
              <div>
                <p className="text-sm font-bold text-white">Create your first focus profile</p>
                <p className="mt-1 max-w-sm text-[12px] text-tx-faint">Group distracting apps by project — e.g. "Deep Work" blocks social + games, "Design Sprint" blocks Slack.</p>
              </div>
              <span className="flex items-center gap-1.5 rounded-lg bg-accent/15 px-4 py-1.5 text-sm font-bold text-accent">
                <Plus size={13} /> New Profile
              </span>
            </div>
          ) : (
            <div className="space-y-2.5">
              {profiles.map(profile => (
                <ProfileCard
                  key={profile.id}
                  profile={profile}
                  userId={user.id}
                  focusActive={focusActive}
                  activeProfileId={activeProfileId}
                  onActivate={activateProfile}
                  onDeactivate={deactivateProfile}
                  onDelete={deleteProfile}
                  onRuleAdded={(pid) => bumpProfileCount(pid, 1)}
                  onRuleRemoved={(pid) => bumpProfileCount(pid, -1)}
                />
              ))}
              {/* Add another profile */}
              <button
                onClick={() => setShowNewProfile(true)}
                className="flex w-full items-center gap-3 rounded-xl border border-dashed border-white/[0.09] bg-transparent px-5 py-3 text-left transition hover:border-accent/30 hover:bg-accent/[0.03]"
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/10 text-accent">
                  <Plus size={14} />
                </div>
                <p className="text-[13px] font-semibold text-tx-secondary hover:text-white">New Focus Profile</p>
              </button>
            </div>
          )}
        </section>

        {/* ── Quick Add Presets ── */}
        <section className="mb-7">
          <div className="mb-3.5 flex items-center gap-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/[0.06] text-tx-secondary">
              <Zap size={13} />
            </div>
            <h2 className="text-[11px] font-extrabold uppercase tracking-[0.15em] text-tx-secondary">Quick Add Global Rules</h2>
          </div>
          <div className="grid grid-cols-5 gap-3">
            {PRESETS.map(preset => {
              const exists = globalRules.some(r => r.label === preset.label);
              return (
                <button key={preset.label} onClick={() => !exists && addPreset(preset)} disabled={exists}
                  className={`fl-preset-card group flex flex-col items-center gap-2.5 rounded-xl border p-4 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition ${
                    exists
                      ? 'border-green-400/20 bg-green-400/[0.06] cursor-default'
                      : 'border-white/[0.09] bg-white/[0.04] hover:border-white/[0.16] hover:bg-white/[0.07] cursor-pointer'
                  }`}>
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border transition"
                       style={{ color: exists ? '#34D399' : preset.color, background: exists ? 'rgba(52,211,153,0.12)' : `${preset.color}14`, borderColor: exists ? 'rgba(52,211,153,0.20)' : `${preset.color}22` }}>
                    {exists ? <Check size={18} /> : <preset.Icon size={18} />}
                  </div>
                  <div>
                    <p className="text-[13px] font-bold text-white">{preset.label}</p>
                    <p className={`text-[11px] font-semibold ${exists ? 'text-green-300' : 'text-tx-faint'}`}>
                      {exists ? 'Added' : preset.type === 'url' ? 'Website' : 'App'}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* ── Global Rules ── */}
        <section>
          <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/[0.06] text-tx-secondary">
                <Layers size={13} />
              </div>
              <div>
                <h2 className="text-[11px] font-extrabold uppercase tracking-[0.15em] text-tx-secondary">
                  Global Rules <span className="normal-case tracking-normal text-tx-faint">({globalRules.length})</span>
                </h2>
                <p className="text-[11px] text-tx-faint">Blocked during every focus session, regardless of profile</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Search */}
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-tx-faint" />
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search rules…"
                  className="h-9 w-52 rounded-lg border border-white/[0.09] bg-white/[0.045] pl-8 pr-3 text-[13px] text-white placeholder-tx-faint outline-none focus:border-accent/50"
                />
              </div>
              {/* Filter pill tabs */}
              <div className="fl-filter-pills flex items-center gap-0.5 rounded-lg border border-white/[0.09] bg-white/[0.04] p-1">
                {[{ v: 'all', label: 'All' }, { v: 'enabled', label: 'On' }, { v: 'web', label: 'Web' }, { v: 'app', label: 'App' }].map(f => (
                  <button key={f.v} onClick={() => setFilter(f.v)}
                    className={`rounded-md px-3 py-1 text-[12px] font-bold transition ${filter === f.v ? 'bg-white/[0.12] text-white shadow-sm' : 'text-tx-faint hover:text-tx-secondary'}`}>
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            {filteredRules.length === 0 && globalRules.length === 0 && (
              <div className="flex flex-col items-center gap-2.5 rounded-xl border border-dashed border-white/[0.09] bg-white/[0.02] py-10 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/[0.05] text-tx-faint">
                  <Shield size={22} />
                </div>
                <p className="text-sm font-bold text-tx-secondary">No global rules yet</p>
                <p className="text-[12px] text-tx-faint">Add rules above using Quick Add, or click "Add Rule" to create a custom one.</p>
              </div>
            )}
            {filteredRules.map(rule => (
              <div key={rule.id}
                className="fl-global-rule-row group flex items-center gap-3.5 rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition hover:border-white/[0.14] hover:bg-white/[0.06]">
                {/* Left accent stripe */}
                <div className="h-8 w-0.5 shrink-0 rounded-full" style={{
                  background: rule.active ? (rule.rule_type === 'url' ? '#60A5FA' : '#F59E0B') : 'rgba(255,255,255,0.10)'
                }} />
                <RuleIcon rule={rule} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-bold text-white">{rule.label || rule.pattern}</p>
                  <p className="mt-0.5 truncate font-mono text-[11px] text-tx-faint">{rule.pattern}</p>
                </div>
                <span className={`rounded-md px-2.5 py-0.5 text-[11px] font-bold ${rule.rule_type === 'url' ? 'bg-blue-400/12 text-blue-300' : 'bg-amber-400/12 text-amber-300'}`}>
                  {rule.rule_type === 'url' ? 'Web' : 'App'}
                </span>
                <ToggleSwitch checked={!!rule.active} onClick={() => toggle(rule)} />
                <button onClick={() => remove(rule.id)} className="text-tx-faint opacity-0 transition hover:text-red-300 group-hover:opacity-100">
                  <Trash2 size={15} />
                </button>
              </div>
            ))}

            <button onClick={() => setShowForm(true)}
              className="flex w-full items-center gap-3.5 rounded-xl border border-dashed border-white/[0.08] bg-transparent px-4 py-3.5 text-left transition hover:border-accent/30 hover:bg-accent/[0.03]">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-accent/20 bg-accent/08 text-accent">
                <BadgePlus size={18} />
              </div>
              <div>
                <p className="text-[13px] font-bold text-white">Add Global Rule</p>
                <p className="text-[11px] text-tx-faint">Block an app or website in every focus session</p>
              </div>
              <ChevronRight size={16} className="ml-auto text-tx-faint" />
            </button>
          </div>
        </section>

        {/* ── Scheduled Blocking ── */}
        <BlockScheduler userId={user.id} profiles={profiles} />

        {/* ── Stats footer ── */}
        <PanelCard className="mt-5 grid grid-cols-4 divide-x divide-white/[0.07]" style={{ padding: 0 }}>
          {[
            { Icon: Shield, color: '#34D399', value: `${protectionPct}%`, label: 'Protection', sub: activeCount === globalRules.length && globalRules.length > 0 ? 'All rules active' : `${activeCount}/${globalRules.length} active` },
            { Icon: BarChart3, color: '#A78BFA', value: blockedCount, label: 'Blocked', sub: 'Distraction attempts' },
            { Icon: Clock3, color: '#60A5FA', value: fmtElapsed(focusElapsed || 0), label: 'Focus Time', sub: focusActive ? '↑ Keep it up!' : 'Start a session' },
            { Icon: Trophy, color: '#FBBF24', value: profiles.length, label: 'Profiles', sub: activeProfileId ? `${profiles.find(p => p.id === activeProfileId)?.name ?? ''} active` : 'None active' },
          ].map((stat) => (
            <div key={stat.label} className="flex items-center gap-3.5 px-5 py-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border"
                   style={{ color: stat.color, background: `${stat.color}14`, borderColor: `${stat.color}20` }}>
                <stat.Icon size={20} />
              </div>
              <div>
                <p className="num text-xl font-extrabold leading-tight text-white">{stat.value}</p>
                <p className="text-[11px] font-bold text-tx-secondary">{stat.label}</p>
                <p className="text-[11px] text-tx-faint">{stat.sub}</p>
              </div>
            </div>
          ))}
        </PanelCard>
      </div>

      {/* ── Modals ── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-96 overflow-hidden rounded-2xl border border-brd-strong bg-bg-card shadow-2xl">
            <div className="flex items-center justify-between border-b border-brd-default px-5 py-4">
              <h3 className="text-sm font-semibold text-white">New Global Block Rule</h3>
              <button onClick={() => setShowForm(false)} className="text-tx-faint hover:text-white"><X size={15} /></button>
            </div>
            <div className="space-y-3 p-5">
              <div className="flex gap-2">
                {[{ v: 'url', label: 'Website', Icon: Globe }, { v: 'app', label: 'App', Icon: Smartphone }].map(t => (
                  <button key={t.v} onClick={() => setForm(f => ({ ...f, ruleType: t.v }))}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-lg border py-2 text-sm font-medium transition-all ${
                      form.ruleType === t.v ? 'border-accent/50 bg-accent/20 text-accent-light' : 'border-brd-strong bg-bg-app text-tx-faint hover:text-white'
                    }`}>
                    <t.Icon size={13} /> {t.label}
                  </button>
                ))}
              </div>
              <input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                placeholder="Label (e.g. Social Media)"
                className="w-full rounded-xl border border-brd-default bg-bg-app px-3 py-2.5 text-sm text-white placeholder-tx-faint outline-none focus:border-accent" />
              <input value={form.pattern} onChange={e => setForm(f => ({ ...f, pattern: e.target.value }))}
                placeholder={form.ruleType === 'url' ? 'twitter.com|instagram.com' : 'PowerPoint|Discord|Spotify'}
                className="w-full rounded-xl border border-brd-default bg-bg-app px-3 py-2.5 font-mono text-sm text-white placeholder-tx-faint outline-none focus:border-accent" />
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs text-tx-secondary">
                  {form.ruleType === 'url'
                    ? 'Enter domain names separated by |, for example twitter.com|reddit.com.'
                    : 'Enter app names separated by |. Use friendly names — PowerPoint, Excel, Discord, Spotify, Steam all work.'}
                </p>
                {form.ruleType === 'app' && (
                  <button
                    type="button"
                    onClick={() => setShowProcessGuide(true)}
                    className="shrink-0 flex items-center gap-1 text-[11px] font-semibold text-accent hover:text-accent-light transition-colors"
                  >
                    <Search size={10} /> How?
                  </button>
                )}
              </div>
            </div>
            <div className="flex gap-2 px-5 pb-5">
              <button onClick={() => setShowForm(false)} className="flex-1 rounded-xl bg-brd-default py-2.5 text-sm text-tx-secondary transition hover:bg-bg-hover">
                Cancel
              </button>
              <button onClick={create} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent py-2.5 text-sm font-semibold text-white transition hover:bg-accent-light">
                <Check size={14} /> Add Rule
              </button>
            </div>
          </div>
        </div>
      )}

      {showTimerModal && <ManualTimerModal onClose={() => setShowTimerModal(false)} onSet={applyManualOffset} />}
      {showNewProfile && <NewProfileModal onClose={() => setShowNewProfile(false)} onSave={createProfile} />}
      {showInstallGuide && <InstallGuideModal onClose={() => setShowInstallGuide(false)} />}
      {showProcessGuide && <ProcessNameGuideModal onClose={() => setShowProcessGuide(false)} />}
      <BlockedToast items={blockedToasts} onDismiss={dismissToast} />

      {showOverlay && focusActive && (
        <FocusModeOverlay
          activeSession={{ id: 'focus-mode', title: activeProfileId ? (profiles.find(p => p.id === activeProfileId)?.name ?? 'Focus Session') : 'Focus Session', user_id: user.id }}
          elapsed={focusElapsed}
          focusScore={Math.min(100, Math.round((focusElapsed / Math.max(focusTarget, 1)) * 100))}
          isIdle={false}
          heartbeat={null}
          focusData={{ totalSecs: focusElapsed, idleSecs: 0, switches: 0 }}
          ringProgress={focusElapsed / Math.max(focusTarget, 1)}
          onClose={() => setShowOverlay(false)}
        />
      )}
    </div>
  );
}
