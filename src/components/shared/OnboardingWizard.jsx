import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity, ChevronRight, ChevronLeft, Check, Plus, X,
  Zap, Coffee, Users, BookOpen, Briefcase, User,
  Clock, BarChart2, Target, Sparkles, ArrowRight,
} from 'lucide-react';
import logoSrc from '../../assets/logo.png';

const api = window.electron || {};
const callApi = (name, fallback, payload) => {
  const fn = api[name];
  return typeof fn === 'function' ? fn(payload) : Promise.resolve(fallback);
};

const ONBOARD_KEY = 'fl_onboarded_v1';

// ─── Default category presets ─────────────────────────────────────────────────
const CATEGORY_PRESETS = [
  { name: 'Deep Work',    color: '#7c6cf2', Icon: Zap },
  { name: 'Meetings',     color: '#f87171', Icon: Users },
  { name: 'Admin',        color: '#60a5fa', Icon: Briefcase },
  { name: 'Learning',     color: '#34d399', Icon: BookOpen },
  { name: 'Breaks',       color: '#A8B5B2', Icon: Coffee },
];

// ─── Step indicators ──────────────────────────────────────────────────────────
function StepDots({ total, current }) {
  return (
    <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} style={{
          width: i === current ? 20 : 6,
          height: 6,
          borderRadius: 9999,
          background: i === current ? '#7c6cf2' : i < current ? '#4B5563' : '#1f2937',
          transition: 'all 0.3s cubic-bezier(0.34,1.56,0.64,1)',
        }}/>
      ))}
    </div>
  );
}

// ─── Step 0: Welcome ──────────────────────────────────────────────────────────
function StepWelcome({ onNext }) {
  return (
    <div style={{ textAlign: 'center', padding: '8px 0 16px' }}>
      {/* Logo */}
      <img
        src={logoSrc}
        alt="Flow Ledger"
        style={{ width: 72, height: 72, borderRadius: 24, objectFit: 'contain', margin: '0 auto 24px', display: 'block', boxShadow: '0 0 40px rgba(124,108,242,0.35)' }}
      />

      <h1 style={{ fontSize: 26, fontWeight: 800, color: 'white', marginBottom: 10, letterSpacing: -0.5 }}>
        Welcome to Flow Ledger
      </h1>
      <p style={{ fontSize: 14, color: '#A8B5B2', lineHeight: 1.7, maxWidth: 380, margin: '0 auto 32px' }}>
        Your AI-powered productivity companion. Let's set things up so you can start tracking your work in minutes.
      </p>

      {/* Feature highlights */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 32, textAlign: 'left' }}>
        {[
          { Icon: Clock,    color: '#60a5fa', text: 'Auto-track every app and window you use' },
          { Icon: BarChart2,color: '#4ade80', text: 'Deep insights into your focus and productivity' },
          { Icon: Target,   color: '#a78bfa', text: 'Set goals and stay on top of your work' },
        ].map(({ Icon, color, text }) => (
          <div key={text} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 12, padding: '10px 14px',
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: 10,
              background: color + '20',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <Icon size={15} color={color} />
            </div>
            <span style={{ fontSize: 13, color: '#D1D5DB' }}>{text}</span>
          </div>
        ))}
      </div>

      <button onClick={onNext} style={{
        width: '100%',
        background: 'linear-gradient(135deg, var(--color-accent), #a78bfa)',
        border: 'none', borderRadius: 14,
        padding: '14px', cursor: 'pointer',
        color: 'white', fontSize: 15, fontWeight: 700,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        boxShadow: '0 0 24px rgba(124,108,242,0.35)',
        transition: 'all 0.2s',
      }}
        onMouseEnter={e => e.currentTarget.style.boxShadow = '0 0 32px rgba(124,108,242,0.54)'}
        onMouseLeave={e => e.currentTarget.style.boxShadow = '0 0 24px rgba(124,108,242,0.35)'}
      >
        Get started <ArrowRight size={16} />
      </button>
    </div>
  );
}

// ─── Step 1: Categories ───────────────────────────────────────────────────────
function StepCategories({ selected, setSelected }) {
  const [custom, setCustom]   = useState('');
  const [color,  setColor]    = useState('#7c6cf2');

  const toggle = (name) => {
    setSelected(prev =>
      prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
    );
  };

  const addCustom = () => {
    if (!custom.trim() || selected.includes(custom.trim())) return;
    setSelected(prev => [...prev, custom.trim() + '|' + color]);
    setCustom('');
  };

  const COLORS = ['#7c6cf2','#f87171','#60a5fa','#34d399','#facc15','#fb923c','#a78bfa','#A8B5B2'];

  return (
    <div>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{
          width: 48, height: 48, borderRadius: 16,
          background: 'rgba(124,108,242,0.15)',
          border: '1px solid rgba(124,108,242,0.35)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 12px',
        }}>
          <Zap size={22} color="#7c6cf2" />
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: 'white', marginBottom: 6 }}>
          Create work categories
        </h2>
        <p style={{ fontSize: 13, color: '#A8B5B2', lineHeight: 1.6 }}>
          Categories group your sessions. Pick from presets or add your own.
        </p>
      </div>

      {/* Presets */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        {CATEGORY_PRESETS.map(({ name, color, Icon }) => {
          const isOn = selected.includes(name);
          return (
            <button key={name} onClick={() => toggle(name)} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              background: isOn ? color + '12' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${isOn ? color + '40' : 'rgba(255,255,255,0.07)'}`,
              borderRadius: 12, padding: '10px 14px', cursor: 'pointer',
              transition: 'all 0.15s', textAlign: 'left',
            }}>
              <div style={{
                width: 34, height: 34, borderRadius: 10,
                background: color + '20',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <Icon size={16} color={color} />
              </div>
              <span style={{ fontSize: 13, color: isOn ? 'white' : '#A8B5B2', fontWeight: isOn ? 600 : 400, flex: 1 }}>
                {name}
              </span>
              <div style={{
                width: 20, height: 20, borderRadius: '50%',
                border: `2px solid ${isOn ? color : '#374151'}`,
                background: isOn ? color : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.15s',
              }}>
                {isOn && <Check size={11} color="white" />}
              </div>
            </button>
          );
        })}
      </div>

      {/* Custom category */}
      <div style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 12, padding: '12px 14px',
      }}>
        <p style={{ fontSize: 11, color: '#73817F', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Custom</p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            value={custom}
            onChange={e => setCustom(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addCustom()}
            placeholder="Category name…"
            style={{
              flex: 1, background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8, padding: '7px 10px',
              color: 'white', fontSize: 13, outline: 'none',
            }}
          />
          <div style={{ display: 'flex', gap: 4 }}>
            {COLORS.map(c => (
              <button key={c} onClick={() => setColor(c)} style={{
                width: 18, height: 18, borderRadius: '50%',
                background: c, border: `2px solid ${color === c ? 'white' : 'transparent'}`,
                cursor: 'pointer', padding: 0,
                boxSizing: 'border-box',
              }}/>
            ))}
          </div>
          <button onClick={addCustom} style={{
            background: '#7c6cf2', border: 'none', borderRadius: 8,
            padding: '7px 12px', cursor: 'pointer', color: 'white', fontSize: 13,
          }}>
            <Plus size={14} />
          </button>
        </div>
        {selected.filter(s => s.includes('|')).map(s => {
          const [n, c] = s.split('|');
          return (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: c }} />
              <span style={{ fontSize: 12, color: '#A8B5B2', flex: 1 }}>{n}</span>
              <button onClick={() => setSelected(prev => prev.filter(x => x !== s))}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#73817F', padding: 2 }}>
                <X size={11} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Step 2: First project ────────────────────────────────────────────────────
function StepProject({ projectName, setProjectName, projectColor, setProjectColor, skip, setSkip }) {
  const COLORS = ['#7c6cf2','#f87171','#60a5fa','#34d399','#facc15','#fb923c','#a78bfa'];
  return (
    <div>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{
          width: 48, height: 48, borderRadius: 16,
          background: 'rgba(96,165,250,0.15)',
          border: '1px solid rgba(96,165,250,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 12px',
        }}>
          <Briefcase size={22} color="#60a5fa" />
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: 'white', marginBottom: 6 }}>Add your first project</h2>
        <p style={{ fontSize: 13, color: '#A8B5B2', lineHeight: 1.6 }}>
          Projects help you understand where your time really goes. You can always add more later.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <label style={{ fontSize: 11, color: '#73817F', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 6 }}>
            Project name
          </label>
          <input
            value={projectName}
            onChange={e => setProjectName(e.target.value)}
            placeholder="e.g. Client Website, Personal Blog…"
            disabled={skip}
            style={{
              width: '100%', background: skip ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 10, padding: '10px 14px',
              color: skip ? '#4B5563' : 'white', fontSize: 13, outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>
        <div>
          <label style={{ fontSize: 11, color: '#73817F', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 6 }}>
            Color
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            {COLORS.map(c => (
              <button key={c} onClick={() => !skip && setProjectColor(c)} style={{
                width: 26, height: 26, borderRadius: '50%',
                background: c,
                border: `2px solid ${projectColor === c ? 'white' : 'transparent'}`,
                cursor: skip ? 'default' : 'pointer', padding: 0,
                opacity: skip ? 0.3 : 1,
                boxSizing: 'border-box',
              }}/>
            ))}
          </div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginTop: 4 }}>
          <div
            onClick={() => setSkip(v => !v)}
            style={{
              width: 36, height: 20, borderRadius: 9999,
              background: skip ? '#7c6cf2' : '#1f2937',
              border: '1px solid rgba(255,255,255,0.1)',
              position: 'relative', transition: 'background 0.2s', cursor: 'pointer',
            }}
          >
            <span style={{
              position: 'absolute', top: 2,
              left: skip ? 18 : 2,
              width: 14, height: 14, borderRadius: '50%',
              background: 'white', transition: 'left 0.2s',
            }}/>
          </div>
          <span style={{ fontSize: 12, color: '#A8B5B2' }}>Skip — I'll add projects later</span>
        </label>
      </div>
    </div>
  );
}

// ─── Step 3: Tracking preference ─────────────────────────────────────────────
function StepTracking({ autoTrack, setAutoTrack }) {
  return (
    <div>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{
          width: 48, height: 48, borderRadius: 16,
          background: 'rgba(52,211,153,0.15)',
          border: '1px solid rgba(52,211,153,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 12px',
        }}>
          <Activity size={22} color="#34d399" />
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: 'white', marginBottom: 6 }}>Tracking mode</h2>
        <p style={{ fontSize: 13, color: '#A8B5B2', lineHeight: 1.6 }}>
          Choose how Flow Ledger captures your work time.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {[
          {
            value: 'auto',
            label: 'Automatic',
            desc: 'Flow Ledger silently tracks every app and session in the background. Zero effort.',
            Icon: Zap, color: '#7c6cf2', recommended: true,
          },
          {
            value: 'manual',
            label: 'Manual only',
            desc: 'You start and stop sessions yourself using the Timer page. Full control.',
            Icon: Clock, color: '#60a5fa',
          },
        ].map(opt => {
          const isOn = autoTrack === opt.value;
          return (
            <button key={opt.value} onClick={() => setAutoTrack(opt.value)} style={{
              display: 'flex', alignItems: 'flex-start', gap: 14,
              background: isOn ? opt.color + '0E' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${isOn ? opt.color + '40' : 'rgba(255,255,255,0.07)'}`,
              borderRadius: 14, padding: '14px 16px', cursor: 'pointer',
              transition: 'all 0.15s', textAlign: 'left',
            }}>
              <div style={{
                width: 38, height: 38, borderRadius: 12, flexShrink: 0,
                background: opt.color + '20',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <opt.Icon size={18} color={opt.color} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: isOn ? 'white' : '#A8B5B2' }}>{opt.label}</span>
                  {opt.recommended && (
                    <span style={{
                      fontSize: 10, fontWeight: 700,
                      background: '#7C6CF220', color: '#a78bfa',
                      border: '1px solid rgba(124,108,242,0.35)',
                      borderRadius: 9999, padding: '1px 7px',
                    }}>Recommended</span>
                  )}
                </div>
                <p style={{ fontSize: 12, color: '#73817F', lineHeight: 1.5 }}>{opt.desc}</p>
              </div>
              <div style={{
                width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                border: `2px solid ${isOn ? opt.color : '#374151'}`,
                background: isOn ? opt.color : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginTop: 2,
              }}>
                {isOn && <Check size={10} color="white" />}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Step 4: All done ─────────────────────────────────────────────────────────
function StepDone({ categoriesCreated, projectCreated, trackingMode }) {
  return (
    <div style={{ textAlign: 'center', padding: '8px 0 16px' }}>
      <div style={{
        width: 72, height: 72, borderRadius: '50%',
        background: 'linear-gradient(135deg, #4ade80, #34d399)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 24px',
        boxShadow: '0 0 40px rgba(74,222,128,0.25)',
      }}>
        <Check size={32} color="white" strokeWidth={2.5} />
      </div>

      <h2 style={{ fontSize: 24, fontWeight: 800, color: 'white', marginBottom: 8 }}>You're all set!</h2>
      <p style={{ fontSize: 14, color: '#A8B5B2', lineHeight: 1.7, maxWidth: 340, margin: '0 auto 28px' }}>
        Flow Ledger is ready to track your work. Here's what we set up:
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 28, textAlign: 'left' }}>
        {categoriesCreated > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.15)', borderRadius: 10 }}>
            <Check size={14} color="#4ade80" />
            <span style={{ fontSize: 13, color: '#D1D5DB' }}>{categoriesCreated} {categoriesCreated === 1 ? 'category' : 'categories'} created</span>
          </div>
        )}
        {projectCreated && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.15)', borderRadius: 10 }}>
            <Check size={14} color="#60a5fa" />
            <span style={{ fontSize: 13, color: '#D1D5DB' }}>Project "{projectCreated}" created</span>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'rgba(124,108,242,0.06)', border: '1px solid rgba(124,108,242,0.15)', borderRadius: 10 }}>
          <Check size={14} color="#7c6cf2" />
          <span style={{ fontSize: 13, color: '#D1D5DB' }}>Tracking set to {trackingMode === 'auto' ? 'Automatic' : 'Manual'}</span>
        </div>
      </div>

      <div style={{
        background: 'rgba(124,108,242,0.06)', border: '1px solid rgba(124,108,242,0.15)',
        borderRadius: 12, padding: '12px 16px', textAlign: 'left',
      }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <Sparkles size={14} color="#a78bfa" style={{ marginTop: 2, flexShrink: 0 }} />
          <p style={{ fontSize: 12, color: '#A8B5B2', lineHeight: 1.6, margin: 0 }}>
            Tip: Press <kbd style={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 4, padding: '1px 5px', fontSize: 10 }}>⌘K</kbd> anytime to open the command palette and quickly start a session.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Main Wizard ──────────────────────────────────────────────────────────────
export default function OnboardingWizard({ user, onComplete, onDismiss }) {
  const [step,          setStep]          = useState(0);
  const [selCategories, setSelCategories] = useState(['Deep Work', 'Meetings']);
  const [projectName,   setProjectName]   = useState('');
  const [projectColor,  setProjectColor]  = useState('#7c6cf2');
  const [skipProject,   setSkipProject]   = useState(false);
  const [autoTrack,     setAutoTrack]     = useState('auto');
  const [saving,        setSaving]        = useState(false);
  const [saved,         setSaved]         = useState({ cats: 0, project: null });

  const STEPS = ['welcome', 'categories', 'project', 'tracking', 'done'];
  const total  = STEPS.length;

  const goNext = useCallback(async () => {
    if (step === total - 2) {
      // Before "done" — persist everything
      setSaving(true);
      try {
        let catsCreated = 0;
        for (const s of selCategories) {
          let name, color;
          if (s.includes('|')) {
            [name, color] = s.split('|');
          } else {
            const preset = CATEGORY_PRESETS.find(p => p.name === s);
            name  = s;
            color = preset?.color || '#7c6cf2';
          }
          await callApi('createCategory', null, { name, color, userId: user?.id }).catch(() => {});
          catsCreated++;
        }
        let projSaved = null;
        if (!skipProject && projectName.trim()) {
          await callApi('createProject', null, {
            name:  projectName.trim(),
            color: projectColor,
            userId: user?.id,
          }).catch(() => {});
          projSaved = projectName.trim();
        }
        if (autoTrack === 'auto') {
          await callApi('updateTrackingSettings', null, { enabled: true }).catch(() => {});
          await callApi('startTracker', null, { userId: user?.id }).catch(() => {});
        } else {
          await callApi('updateTrackingSettings', null, { enabled: false }).catch(() => {});
        }
        setSaved({ cats: catsCreated, project: projSaved });
        localStorage.setItem(ONBOARD_KEY, 'true');
      } catch { /* continue regardless */ }
      setSaving(false);
    }
    setStep(s => Math.min(s + 1, total - 1));
  }, [step, selCategories, projectName, projectColor, skipProject, autoTrack, user, total]);

  const goBack = () => setStep(s => Math.max(s - 1, 0));
  const finish = () => onComplete?.();

  // Can advance?
  const canNext = (() => {
    if (step === 1) return selCategories.length > 0;
    if (step === 2) return skipProject || projectName.trim().length > 0;
    return true;
  })();

  const stepName = STEPS[step];

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 10000,
      background: 'rgba(0,0,0,0.75)',
      backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20,
    }}>
      <div style={{
        width: '100%', maxWidth: 460,
        background: '#0D0F14',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 24,
        boxShadow: '0 32px 80px rgba(0,0,0,0.8), 0 0 0 1px rgba(124,108,242,0.15)',
        overflow: 'hidden',
        animation: 'wizard-in 0.4s cubic-bezier(0.34,1.56,0.64,1)',
      }}>
        <style>{`
          @keyframes wizard-in {
            from { opacity: 0; transform: translateY(20px) scale(0.95); }
            to   { opacity: 1; transform: translateY(0) scale(1); }
          }
        `}</style>

        {/* Progress bar */}
        {stepName !== 'welcome' && stepName !== 'done' && (
          <div style={{ height: 3, background: '#1a1d24' }}>
            <div style={{
              height: '100%',
              width: `${((step) / (total - 1)) * 100}%`,
              background: 'linear-gradient(90deg, var(--color-accent), #a78bfa)',
              transition: 'width 0.4s ease',
            }}/>
          </div>
        )}

        {/* Body */}
        <div style={{ padding: '28px 28px 24px', maxHeight: '80vh', overflowY: 'auto' }}>
          {stepName === 'welcome'    && <StepWelcome onNext={goNext} />}
          {stepName === 'categories' && <StepCategories selected={selCategories} setSelected={setSelCategories} />}
          {stepName === 'project'    && (
            <StepProject
              projectName={projectName} setProjectName={setProjectName}
              projectColor={projectColor} setProjectColor={setProjectColor}
              skip={skipProject} setSkip={setSkipProject}
            />
          )}
          {stepName === 'tracking'   && <StepTracking autoTrack={autoTrack} setAutoTrack={setAutoTrack} />}
          {stepName === 'done'       && (
            <StepDone
              categoriesCreated={saved.cats}
              projectCreated={saved.project}
              trackingMode={autoTrack}
            />
          )}
        </div>

        {/* Footer */}
        {stepName !== 'welcome' && stepName !== 'done' && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '16px 28px', borderTop: '1px solid #1a1d24',
          }}>
            <StepDots total={total - 2} current={step - 1} />
            <div style={{ display: 'flex', gap: 8 }}>
              {step > 1 && (
                <button onClick={goBack} style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 10, padding: '9px 16px',
                  cursor: 'pointer', color: '#A8B5B2', fontSize: 13,
                }}>
                  <ChevronLeft size={14} /> Back
                </button>
              )}
              <button onClick={goNext} disabled={!canNext || saving} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: canNext ? '#7c6cf2' : '#263438',
                border: 'none', borderRadius: 10,
                padding: '9px 20px', cursor: canNext ? 'pointer' : 'not-allowed',
                color: canNext ? 'white' : '#4B5563', fontSize: 13, fontWeight: 600,
                transition: 'all 0.15s',
              }}>
                {saving ? 'Saving…' : 'Continue'} {!saving && <ChevronRight size={14} />}
              </button>
            </div>
          </div>
        )}

        {stepName === 'done' && (
          <div style={{ padding: '0 28px 28px' }}>
            <button onClick={finish} style={{
              width: '100%',
              background: 'linear-gradient(135deg, var(--color-accent), #a78bfa)',
              border: 'none', borderRadius: 14,
              padding: '14px', cursor: 'pointer',
              color: 'white', fontSize: 15, fontWeight: 700,
              boxShadow: '0 0 24px rgba(124,108,242,0.35)',
            }}>
              Start tracking →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Helper: should show wizard? ──────────────────────────────────────────────
export function shouldShowOnboarding() {
  return !localStorage.getItem(ONBOARD_KEY);
}
