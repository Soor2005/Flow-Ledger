import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ChevronRight, ChevronLeft, Check, ArrowRight, Globe,
  HardDrive, Zap, BarChart2, Building2, Users, Briefcase,
  Monitor, Camera, Activity, FolderOpen, Sparkles, Clock,
  Shield, Database, CheckCircle, Timer, Target,
} from 'lucide-react';
import { useAuth } from '../../App';
import logoSrc from '../../assets/logo.png';

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const SETUP_KEY = 'fl_setup_v2';
const DRAFT_KEY = 'fl_setup_draft';
const FL_PREFS_KEY = 'fl_prefs';

export { shouldShowSetup } from './setupGuard';

const api = window.electron || {};
const callApi = (name, fallback, payload) => {
  const fn = api[name];
  return typeof fn === 'function' ? fn(payload) : Promise.resolve(fallback);
};

const STEPS = [
  { id: 'welcome',   label: 'Welcome'   },
  { id: 'workspace', label: 'Workspace' },
  { id: 'time',      label: 'Time'      },
  { id: 'storage',   label: 'Storage'   },
  { id: 'done',      label: 'Done'      },
];

const INDUSTRIES = [
  'Technology', 'Finance', 'Healthcare', 'Education',
  'Creative & Design', 'Marketing', 'Consulting',
  'Legal', 'Real Estate', 'Other',
];

const TEAM_SIZES = [
  { value: 'solo', label: 'Just me' },
  { value: '2-5',  label: '2–5'    },
  { value: '6-15', label: '6–15'   },
  { value: '16-50',label: '16–50'  },
  { value: '50+',  label: '50+'    },
];

const WORK_TYPES = [
  { value: 'individual', label: 'Individual', desc: 'Personal productivity'  },
  { value: 'freelancer', label: 'Freelancer', desc: 'Client & project work'  },
  { value: 'agency',     label: 'Agency',     desc: 'Team & multi-client'    },
  { value: 'startup',    label: 'Startup',    desc: 'Fast-paced growth'      },
  { value: 'enterprise', label: 'Enterprise', desc: 'Large organization'     },
  { value: 'student',    label: 'Student',    desc: 'Study & learning'       },
];

const STORAGE_OPTS = [
  { value: 'local',    label: 'Local Computer',    desc: 'Default app data directory', Icon: Monitor,    recommended: true },
  { value: 'external', label: 'External Drive',    desc: 'Choose a connected drive',   Icon: HardDrive,  recommended: false },
  { value: 'custom',   label: 'Custom Directory',  desc: 'Set any folder on system',   Icon: FolderOpen, recommended: false },
];

const DATA_TYPES = [
  { id: 'activity',    label: 'Activity Logs',        desc: 'App usage & window titles', size: '~10 MB/mo',  required: true,  Icon: Activity   },
  { id: 'screenshots', label: 'Screenshots',          desc: 'Periodic screen captures',  size: '~500 MB/mo', required: false, Icon: Camera     },
  { id: 'reports',     label: 'Productivity Reports', desc: 'AI insights & summaries',   size: '~2 MB/mo',   required: false, Icon: BarChart2  },
];

const defaultDraft = () => ({
  workspaceName:  '',
  company:        '',
  industry:       '',
  teamSize:       'solo',
  workType:       'individual',
  timezone:       Intl.DateTimeFormat().resolvedOptions().timeZone,
  timeFormat:     '12h',
  weekStart:      'mon',
  dateFormat:     'MMM D',
  storageLocation:'local',
  customPath:     '',
  dataTypes:      ['activity', 'reports'],
});

function loadDraft() {
  try { return { ...defaultDraft(), ...JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}') }; }
  catch { return defaultDraft(); }
}

// ─── THEME HELPER ─────────────────────────────────────────────────────────────

function useIsLight() {
  const [isLight, setIsLight] = useState(
    () => document.documentElement.classList.contains('theme-light')
  );
  useEffect(() => {
    const obs = new MutationObserver(() =>
      setIsLight(document.documentElement.classList.contains('theme-light'))
    );
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  return isLight;
}

// ─── ILLUSTRATIONS ────────────────────────────────────────────────────────────

function IllustrationWelcome() {
  return (
    <svg viewBox="0 0 320 300" fill="none" xmlns="http://www.w3.org/2000/svg"
         style={{ width: '100%', maxWidth: 320, display: 'block', margin: '0 auto' }}>
      <defs>
        <radialGradient id="wglow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#7C6CF2" stopOpacity="0.25"/>
          <stop offset="100%" stopColor="#7C6CF2" stopOpacity="0"/>
        </radialGradient>
      </defs>
      <circle cx="160" cy="150" r="130" fill="url(#wglow)"/>
      <circle cx="160" cy="150" r="108" stroke="#7C6CF2" strokeOpacity="0.10" strokeWidth="1" strokeDasharray="6 4"/>
      <circle cx="160" cy="150" r="78"  stroke="#7C6CF2" strokeOpacity="0.18" strokeWidth="1.5" strokeDasharray="3 5"/>
      <circle cx="160" cy="150" r="50"  stroke="#7C6CF2" strokeOpacity="0.28" strokeWidth="1.5"/>
      <circle cx="160" cy="150" r="28"  fill="#7C6CF2" fillOpacity="0.12"/>
      {/* Top pill — Timer */}
      <rect x="130" y="26" width="60" height="30" rx="8" fill="#181c2c" stroke="#7C6CF2" strokeOpacity="0.45" strokeWidth="1"/>
      <rect x="139" y="35" width="12" height="12" rx="3" fill="#7C6CF2" fillOpacity="0.7"/>
      <rect x="156" y="37" width="24" height="3" rx="1.5" fill="#7C6CF2" fillOpacity="0.35"/>
      <rect x="156" y="43" width="16" height="3" rx="1.5" fill="#7C6CF2" fillOpacity="0.2"/>
      {/* Right pill — Chart */}
      <rect x="245" y="135" width="60" height="30" rx="8" fill="#181c2c" stroke="#60a5fa" strokeOpacity="0.45" strokeWidth="1"/>
      <rect x="256" y="144" width="8"  height="12" rx="1.5" fill="#60a5fa" fillOpacity="0.4"/>
      <rect x="268" y="140" width="8"  height="16" rx="1.5" fill="#60a5fa" fillOpacity="0.6"/>
      <rect x="280" y="136" width="8"  height="20" rx="1.5" fill="#60a5fa" fillOpacity="0.8"/>
      {/* Bottom pill — Check */}
      <rect x="130" y="248" width="60" height="30" rx="8" fill="#181c2c" stroke="#34d399" strokeOpacity="0.45" strokeWidth="1"/>
      <circle cx="150" cy="263" r="8"  fill="#34d399" fillOpacity="0.15" stroke="#34d399" strokeOpacity="0.4" strokeWidth="1"/>
      <path d="M146 263 L149 267 L155 259" stroke="#34d399" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <rect x="163" y="259" width="18" height="3"  rx="1.5" fill="#34d399" fillOpacity="0.4"/>
      <rect x="163" y="265" width="12" height="3"  rx="1.5" fill="#34d399" fillOpacity="0.25"/>
      {/* Left pill — Target */}
      <rect x="15" y="135" width="60" height="30" rx="8" fill="#181c2c" stroke="#a78bfa" strokeOpacity="0.45" strokeWidth="1"/>
      <circle cx="38" cy="150" r="10" stroke="#a78bfa" strokeOpacity="0.4" strokeWidth="1"/>
      <circle cx="38" cy="150" r="5"  stroke="#a78bfa" strokeOpacity="0.6" strokeWidth="1"/>
      <circle cx="38" cy="150" r="2"  fill="#a78bfa" fillOpacity="0.8"/>
      <rect x="54" y="146" width="14" height="3"  rx="1.5" fill="#a78bfa" fillOpacity="0.4"/>
      <rect x="54" y="152" width="10" height="3"  rx="1.5" fill="#a78bfa" fillOpacity="0.25"/>
      {/* Connecting dots on rings */}
      <circle cx="160" cy="42"  r="3.5" fill="#7C6CF2" fillOpacity="0.7"/>
      <circle cx="160" cy="258" r="3.5" fill="#34d399" fillOpacity="0.7"/>
      <circle cx="268" cy="150" r="3.5" fill="#60a5fa" fillOpacity="0.7"/>
      <circle cx="52"  cy="150" r="3.5" fill="#a78bfa" fillOpacity="0.7"/>
      {/* Center mark */}
      <path d="M152 150 L158 157 L170 142" stroke="#c4b5fd" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function IllustrationWorkspace({ isLight }) {
  const card = isLight ? '#EDE9FF' : '#181c2c';
  return (
    <svg viewBox="0 0 280 240" fill="none" xmlns="http://www.w3.org/2000/svg"
         style={{ width: '100%', maxWidth: 280, display: 'block', margin: '0 auto' }}>
      {/* Building base */}
      <rect x="55" y="60" width="170" height="148" rx="6" fill={card} stroke="#7C6CF2" strokeOpacity="0.28" strokeWidth="1.5"/>
      {[92, 122, 152, 182].map(y => (
        <line key={y} x1="55" y1={y} x2="225" y2={y} stroke="#7C6CF2" strokeOpacity="0.10" strokeWidth="1"/>
      ))}
      {/* Windows grid 4×3 */}
      {[0,1,2,3].map(row => [0,1,2].map(col => {
        const lit = row * 3 + col;
        const colors = ['#7C6CF2','#60a5fa','#a78bfa','#34d399','#7C6CF2','#60a5fa','#a78bfa','#7C6CF2'];
        return (
          <rect key={`${row}-${col}`}
            x={76 + col * 44} y={68 + row * 30}
            width={28} height={20} rx="3"
            fill={colors[lit % colors.length]}
            fillOpacity={lit < 7 ? 0.22 + lit * 0.04 : 0.10}
          />
        );
      }))}
      {/* Door */}
      <rect x="122" y="184" width="36" height="24" rx="3"
        fill="#7C6CF2" fillOpacity="0.18" stroke="#7C6CF2" strokeOpacity="0.35" strokeWidth="1"/>
      <circle cx="154" cy="197" r="2" fill="#a78bfa" fillOpacity="0.7"/>
      {/* Ground */}
      <line x1="35" y1="208" x2="245" y2="208" stroke={isLight ? 'rgba(124,108,242,0.25)' : 'rgba(255,255,255,0.08)'} strokeWidth="1.5" strokeLinecap="round"/>
      {/* Flag */}
      <line x1="140" y1="60" x2="140" y2="38" stroke="#a78bfa" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M140 38 L158 44 L140 50 Z" fill="#a78bfa" fillOpacity="0.75"/>
      {/* Left tree */}
      <rect x="34" y="182" width="6" height="26" rx="3" fill="#34d399" fillOpacity="0.4"/>
      <ellipse cx="37" cy="176" rx="12" ry="14" fill="#34d399" fillOpacity="0.22" stroke="#34d399" strokeOpacity="0.3" strokeWidth="1"/>
      {/* Right tree */}
      <rect x="238" y="182" width="6" height="26" rx="3" fill="#34d399" fillOpacity="0.4"/>
      <ellipse cx="241" cy="176" rx="12" ry="14" fill="#34d399" fillOpacity="0.22" stroke="#34d399" strokeOpacity="0.3" strokeWidth="1"/>
      {/* Cloud badge top-right */}
      <circle cx="218" cy="48" r="18" fill={card} stroke="#60a5fa" strokeOpacity="0.35" strokeWidth="1"/>
      <circle cx="218" cy="48" r="5"  fill="#60a5fa" fillOpacity="0.3" stroke="#60a5fa" strokeOpacity="0.5" strokeWidth="1"/>
      <path d="M215 48 L217.5 51 L222 45" stroke="#60a5fa" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function IllustrationTime({ isLight }) {
  const bg2 = isLight ? '#EDE9FF' : '#181c2c';
  return (
    <svg viewBox="0 0 280 240" fill="none" xmlns="http://www.w3.org/2000/svg"
         style={{ width: '100%', maxWidth: 280, display: 'block', margin: '0 auto' }}>
      <defs>
        <radialGradient id="tglow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.15"/>
          <stop offset="100%" stopColor="#60a5fa" stopOpacity="0"/>
        </radialGradient>
      </defs>
      <circle cx="140" cy="122" r="90"  fill="url(#tglow)"/>
      <circle cx="140" cy="122" r="88"  stroke="#60a5fa" strokeOpacity="0.20" strokeWidth="1.5"/>
      <circle cx="140" cy="122" r="88"  stroke="#60a5fa" strokeOpacity="0.08" strokeWidth="1" strokeDasharray="5 7"/>
      {/* Meridians */}
      <ellipse cx="140" cy="122" rx="42" ry="88" stroke="#60a5fa" strokeOpacity="0.15" strokeWidth="1"/>
      <ellipse cx="140" cy="122" rx="72" ry="88" stroke="#60a5fa" strokeOpacity="0.10" strokeWidth="1"/>
      {/* Parallels */}
      <path d="M52 122 Q140 108 228 122"  stroke="#60a5fa" strokeOpacity="0.18" strokeWidth="1"/>
      <path d="M56 90  Q140 76  224 90"   stroke="#60a5fa" strokeOpacity="0.12" strokeWidth="1"/>
      <path d="M56 154 Q140 140 224 154"  stroke="#60a5fa" strokeOpacity="0.12" strokeWidth="1"/>
      {/* Timezone highlight band */}
      <rect x="118" y="34" width="20" height="176" rx="3" fill="#7C6CF2" fillOpacity="0.09"/>
      {/* Pin */}
      <circle cx="140" cy="122" r="20" fill="#7C6CF2" fillOpacity="0.08"/>
      <circle cx="140" cy="122" r="12" fill="#7C6CF2" fillOpacity="0.18"/>
      <circle cx="140" cy="122" r="6"  fill="#7C6CF2" fillOpacity="0.85"/>
      {/* Clock badge */}
      <circle cx="196" cy="66" r="28" fill={bg2} stroke="#60a5fa" strokeOpacity="0.40" strokeWidth="1.5"/>
      <circle cx="196" cy="66" r="2"  fill="#60a5fa"/>
      {/* Hour hand */}
      <line x1="196" y1="66" x2="196" y2="50" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round"/>
      {/* Minute hand */}
      <line x1="196" y1="66" x2="208" y2="72" stroke="#a78bfa" strokeWidth="1.5" strokeLinecap="round"/>
      {/* Tick marks */}
      {[0,30,60,90,120,150,180,210,240,270,300,330].map(deg => {
        const r = deg % 90 === 0 ? 22 : 24;
        const rad = (deg - 90) * Math.PI / 180;
        const x1 = 196 + r * Math.cos(rad);
        const y1 = 66  + r * Math.sin(rad);
        const x2 = 196 + 26 * Math.cos(rad);
        const y2 = 66  + 26 * Math.sin(rad);
        return <line key={deg} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#60a5fa" strokeOpacity={deg % 90 === 0 ? 0.5 : 0.2} strokeWidth={deg % 90 === 0 ? 1.5 : 1} strokeLinecap="round"/>;
      })}
    </svg>
  );
}

function IllustrationStorage({ isLight }) {
  const bg2 = isLight ? '#EDE9FF' : '#181c2c';
  return (
    <svg viewBox="0 0 280 240" fill="none" xmlns="http://www.w3.org/2000/svg"
         style={{ width: '100%', maxWidth: 280, display: 'block', margin: '0 auto' }}>
      {/* Drive chassis */}
      <rect x="50" y="72" width="180" height="104" rx="12" fill={bg2} stroke="#34d399" strokeOpacity="0.35" strokeWidth="1.5"/>
      {/* Dividers */}
      <line x1="50" y1="107" x2="230" y2="107" stroke="#34d399" strokeOpacity="0.15" strokeWidth="1"/>
      <line x1="50" y1="142" x2="230" y2="142" strokeOpacity="0.15" stroke="#34d399" strokeWidth="1"/>
      {/* LEDs */}
      <circle cx="210" cy="88"  r="5" fill="#34d399" fillOpacity="0.75"/>
      <circle cx="196" cy="88"  r="5" fill="#60a5fa" fillOpacity="0.55"/>
      {/* Row 1 - Activity bar */}
      <rect x="66" y="117" width="110" height="7" rx="3.5" fill="rgba(255,255,255,0.06)"/>
      <rect x="66" y="117" width="72"  height="7" rx="3.5" fill="#34d399" fillOpacity="0.7"/>
      <text x="182" y="124" fill="#34d399" fillOpacity="0.6" fontSize="8" fontFamily="monospace">72%</text>
      {/* Row 2 - Screenshots bar */}
      <rect x="66" y="152" width="110" height="7" rx="3.5" fill="rgba(255,255,255,0.06)"/>
      <rect x="66" y="152" width="28"  height="7" rx="3.5" fill="#60a5fa" fillOpacity="0.6"/>
      <text x="182" y="159" fill="#60a5fa" fillOpacity="0.6" fontSize="8" fontFamily="monospace">25%</text>
      {/* Row labels */}
      <text x="66" y="113" fill={isLight ? '#6B7280' : '#6B7280'} fontSize="8" fontFamily="monospace">ACTIVITY</text>
      <text x="66" y="148" fill={isLight ? '#6B7280' : '#6B7280'} fontSize="8" fontFamily="monospace">SCREENSHOTS</text>
      {/* Floating file cards */}
      <rect x="28"  y="44" width="44" height="52" rx="5" fill={bg2} stroke="#a78bfa" strokeOpacity="0.38" strokeWidth="1"/>
      <rect x="28"  y="44" width="44" height="12" rx="5" fill="#a78bfa" fillOpacity="0.25"/>
      <rect x="34"  y="62" width="32" height="3"  rx="1.5" fill="#a78bfa" fillOpacity="0.3"/>
      <rect x="34"  y="68" width="22" height="3"  rx="1.5" fill="#a78bfa" fillOpacity="0.2"/>
      <rect x="34"  y="74" width="28" height="3"  rx="1.5" fill="#a78bfa" fillOpacity="0.15"/>
      <rect x="208" y="40" width="44" height="52" rx="5" fill={bg2} stroke="#7C6CF2" strokeOpacity="0.38" strokeWidth="1"/>
      <rect x="208" y="40" width="44" height="12" rx="5" fill="#7C6CF2" fillOpacity="0.25"/>
      <rect x="214" y="58" width="32" height="3"  rx="1.5" fill="#7C6CF2" fillOpacity="0.3"/>
      <rect x="214" y="64" width="22" height="3"  rx="1.5" fill="#7C6CF2" fillOpacity="0.2"/>
      <rect x="214" y="70" width="28" height="3"  rx="1.5" fill="#7C6CF2" fillOpacity="0.15"/>
      {/* Connectors */}
      <path d="M72 96 Q70 82 72 72" stroke="#a78bfa" strokeOpacity="0.25" strokeWidth="1" strokeDasharray="3 2"/>
      <path d="M208 96 Q208 82 210 68" stroke="#7C6CF2" strokeOpacity="0.25" strokeWidth="1" strokeDasharray="3 2"/>
      {/* Bottom connector to DB */}
      <line x1="140" y1="176" x2="140" y2="196" stroke="#34d399" strokeOpacity="0.35" strokeWidth="1.5" strokeDasharray="3 2"/>
      <rect x="108" y="196" width="64" height="28" rx="7" fill={bg2} stroke="#34d399" strokeOpacity="0.30" strokeWidth="1"/>
      <circle cx="127" cy="210" r="6" fill="#34d399" fillOpacity="0.15" stroke="#34d399" strokeOpacity="0.4" strokeWidth="1"/>
      <path d="M124 210 L126.5 213 L131 207" stroke="#34d399" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <rect x="137" y="206" width="26" height="3" rx="1.5" fill="#34d399" fillOpacity="0.35"/>
      <rect x="137" y="212" width="18" height="3" rx="1.5" fill="#34d399" fillOpacity="0.2"/>
    </svg>
  );
}

function IllustrationDone({ isLight }) {
  const bg2 = isLight ? '#EDE9FF' : '#181c2c';
  return (
    <svg viewBox="0 0 280 240" fill="none" xmlns="http://www.w3.org/2000/svg"
         style={{ width: '100%', maxWidth: 280, display: 'block', margin: '0 auto' }}>
      <defs>
        <radialGradient id="dglow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#34d399" stopOpacity="0.25"/>
          <stop offset="100%" stopColor="#34d399" stopOpacity="0"/>
        </radialGradient>
      </defs>
      <circle cx="140" cy="120" r="100" fill="url(#dglow)"/>
      <circle cx="140" cy="120" r="72"  stroke="#34d399" strokeOpacity="0.18" strokeWidth="1.5" strokeDasharray="5 4"/>
      <circle cx="140" cy="120" r="56"  stroke="#34d399" strokeOpacity="0.25" strokeWidth="1.5"/>
      <circle cx="140" cy="120" r="40"  fill="#34d399" fillOpacity="0.12" stroke="#34d399" strokeOpacity="0.35" strokeWidth="1.5"/>
      <path d="M122 120 L134 133 L160 106" stroke="#34d399" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/>
      {/* Confetti dots */}
      {[
        { cx:70,  cy:55,  r:4, c:'#7C6CF2' },
        { cx:205, cy:50,  r:3, c:'#60a5fa' },
        { cx:220, cy:165, r:4, c:'#a78bfa' },
        { cx:60,  cy:175, r:3, c:'#34d399' },
        { cx:90,  cy:35,  r:2.5, c:'#fbbf24' },
        { cx:185, cy:30,  r:2.5, c:'#f87171' },
        { cx:240, cy:105, r:3, c:'#34d399'  },
        { cx:40,  cy:120, r:2.5, c:'#60a5fa'},
      ].map((d,i) => <circle key={i} cx={d.cx} cy={d.cy} r={d.r} fill={d.c} fillOpacity="0.75"/>)}
      {/* Small stars */}
      {[[115,50],[170,55],[55,145],[222,140]].map(([x,y],i) => (
        <g key={i} transform={`translate(${x},${y})`}>
          <line x1="-5" y1="0" x2="5" y2="0" stroke="#a78bfa" strokeOpacity="0.55" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="0" y1="-5" x2="0" y2="5" stroke="#a78bfa" strokeOpacity="0.55" strokeWidth="1.5" strokeLinecap="round"/>
        </g>
      ))}
    </svg>
  );
}

// ─── STEP PROGRESS INDICATOR ──────────────────────────────────────────────────

function StepProgress({ current, isLight }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', gap: 0 }}>
      {STEPS.slice(0, -1).map((s, i) => (
        <React.Fragment key={s.id}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
            <div style={{
              width: 30, height: 30, borderRadius: '50%',
              background: i < current
                ? 'linear-gradient(135deg, #7C6CF2, #a78bfa)'
                : i === current
                  ? 'rgba(124,108,242,0.12)'
                  : isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)',
              border: `2px solid ${i <= current ? '#7C6CF2' : isLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.10)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.35s cubic-bezier(0.34,1.56,0.64,1)',
              boxShadow: i === current ? '0 0 14px rgba(124,108,242,0.35)' : 'none',
            }}>
              {i < current
                ? <Check size={13} color="white" strokeWidth={3}/>
                : <span style={{
                    fontSize: 11, fontWeight: 700,
                    color: i === current ? '#7C6CF2' : isLight ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.25)',
                  }}>{i + 1}</span>
              }
            </div>
            <span style={{
              fontSize: 10.5, fontWeight: i === current ? 600 : 400, whiteSpace: 'nowrap',
              color: i === current ? '#7C6CF2'
                : i < current ? (isLight ? '#7C6CF2' : '#6B6CF2')
                : isLight ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.22)',
              transition: 'color 0.3s',
            }}>
              {s.label}
            </span>
          </div>
          {i < STEPS.length - 2 && (
            <div style={{
              width: 52, height: 2, flexShrink: 0, margin: '14px 0 0 0',
              background: i < current
                ? 'linear-gradient(90deg, #7C6CF2, #a78bfa)'
                : isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.07)',
              borderRadius: 1, transition: 'background 0.4s',
            }}/>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// ─── STEP: WELCOME ────────────────────────────────────────────────────────────

function StepWelcome({ username, isLight, onNext, onSkip }) {
  const [entered, setEntered] = useState(false);
  useEffect(() => { const t = setTimeout(() => setEntered(true), 80); return () => clearTimeout(t); }, []);

  const feats = [
    { Icon: Activity, color: '#7C6CF2', text: 'Auto-track every app and window you use — zero effort'         },
    { Icon: BarChart2, color: '#60a5fa', text: 'Deep AI insights into your focus patterns and productivity'   },
    { Icon: Target,   color: '#34d399', text: 'Set goals, block distractions, and hit peak focus daily'      },
  ];

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '12px 0 8px', textAlign: 'center',
      opacity: entered ? 1 : 0, transform: entered ? 'translateY(0)' : 'translateY(16px)',
      transition: 'opacity 0.5s ease, transform 0.5s ease',
    }}>
      <div style={{ marginBottom: 32 }}>
        <IllustrationWelcome />
      </div>

      <div style={{ marginBottom: 8 }}>
        <span style={{
          fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
          color: '#7C6CF2', background: 'rgba(124,108,242,0.1)',
          border: '1px solid rgba(124,108,242,0.25)',
          borderRadius: 999, padding: '3px 12px',
        }}>
          2–3 minutes to setup
        </span>
      </div>

      <h1 style={{
        fontSize: 32, fontWeight: 800, letterSpacing: '-0.03em', marginBottom: 10,
        color: isLight ? '#111827' : '#ffffff',
      }}>
        Welcome{username ? `, ${username}` : ''}!
      </h1>

      <p style={{
        fontSize: 15, lineHeight: 1.65, maxWidth: 440, marginBottom: 32,
        color: isLight ? '#6B7280' : '#9CA3AF',
      }}>
        Flow Ledger is your AI-powered productivity platform. Let's get everything set up so you're ready to track, focus, and grow.
      </p>

      <div style={{
        display: 'flex', flexDirection: 'column', gap: 8,
        width: '100%', maxWidth: 440, marginBottom: 32, textAlign: 'left',
      }}>
        {feats.map(({ Icon, color, text }) => (
          <div key={text} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            background: isLight ? 'rgba(0,0,0,0.025)' : 'rgba(255,255,255,0.03)',
            border: `1px solid ${isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)'}`,
            borderRadius: 12, padding: '11px 14px',
          }}>
            <div style={{
              width: 34, height: 34, borderRadius: 10, flexShrink: 0,
              background: color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon size={16} color={color}/>
            </div>
            <span style={{ fontSize: 13.5, color: isLight ? '#374151' : '#D1D5DB' }}>{text}</span>
          </div>
        ))}
      </div>

      <button onClick={onNext} style={{
        width: '100%', maxWidth: 440, padding: '14px',
        background: 'linear-gradient(135deg, #7C6CF2, #a78bfa)',
        border: 'none', borderRadius: 14, cursor: 'pointer',
        color: 'white', fontSize: 15, fontWeight: 700,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        boxShadow: '0 4px 24px rgba(124,108,242,0.38)',
        transition: 'box-shadow 0.2s, transform 0.15s',
      }}
        onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 6px 32px rgba(124,108,242,0.55)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
        onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 4px 24px rgba(124,108,242,0.38)'; e.currentTarget.style.transform = 'translateY(0)'; }}
      >
        Get Started <ArrowRight size={16}/>
      </button>

      <button onClick={onSkip} style={{
        marginTop: 14, background: 'none', border: 'none', cursor: 'pointer',
        color: isLight ? '#9CA3AF' : '#4B5563',
        fontSize: 12.5, fontWeight: 500,
        transition: 'color 0.15s',
      }}
        onMouseEnter={e => e.currentTarget.style.color = isLight ? '#6B7280' : '#9CA3AF'}
        onMouseLeave={e => e.currentTarget.style.color = isLight ? '#9CA3AF' : '#4B5563'}
      >
        Skip setup — configure later in Settings
      </button>
    </div>
  );
}

// ─── STEP: WORKSPACE ──────────────────────────────────────────────────────────

function StepWorkspace({ draft, setDraft, isLight }) {
  const field = (key, val) => setDraft(d => ({ ...d, [key]: val }));

  const inputStyle = {
    width: '100%', boxSizing: 'border-box',
    padding: '10px 14px', borderRadius: 10,
    background: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)',
    border: `1px solid ${isLight ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.10)'}`,
    color: isLight ? '#111827' : '#ffffff', fontSize: 13.5, outline: 'none',
    fontFamily: 'inherit', transition: 'border-color 0.2s',
  };

  const labelStyle = {
    display: 'block', marginBottom: 6,
    fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
    color: isLight ? '#6B7280' : '#6B7280',
  };

  const chipBase = (active) => ({
    padding: '7px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600,
    border: `1px solid ${active ? '#7C6CF2' : isLight ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.09)'}`,
    background: active ? 'rgba(124,108,242,0.12)' : isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.04)',
    color: active ? '#a78bfa' : isLight ? '#6B7280' : '#9CA3AF',
    transition: 'all 0.15s',
  });

  return (
    <div style={{ display: 'flex', gap: 28, height: '100%' }}>
      {/* Left: Illustration */}
      <div style={{
        width: 220, flexShrink: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 16,
      }}>
        <IllustrationWorkspace isLight={isLight}/>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: isLight ? '#111827' : '#ffffff', marginBottom: 4 }}>
            Your Workspace
          </p>
          <p style={{ fontSize: 11.5, color: isLight ? '#9CA3AF' : '#6B7280', lineHeight: 1.5 }}>
            Personalise Flow Ledger<br/>to fit how you work
          </p>
        </div>
      </div>

      {/* Right: Form */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
        {/* Workspace name */}
        <div>
          <label style={labelStyle}>Workspace Name <span style={{ color: '#f87171' }}>*</span></label>
          <input value={draft.workspaceName} onChange={e => field('workspaceName', e.target.value)}
            placeholder="e.g. Surya's Workspace"
            style={inputStyle}
            onFocus={e  => e.target.style.borderColor = '#7C6CF2'}
            onBlur={e   => e.target.style.borderColor = isLight ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.10)'}
          />
        </div>

        {/* Company */}
        <div>
          <label style={labelStyle}>Company / Organization <span style={{ color: isLight ? '#9CA3AF' : '#4B5563', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>optional</span></label>
          <input value={draft.company} onChange={e => field('company', e.target.value)}
            placeholder="e.g. Acme Inc."
            style={inputStyle}
            onFocus={e  => e.target.style.borderColor = '#7C6CF2'}
            onBlur={e   => e.target.style.borderColor = isLight ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.10)'}
          />
        </div>

        {/* Industry */}
        <div>
          <label style={labelStyle}>Industry</label>
          <select value={draft.industry} onChange={e => field('industry', e.target.value)}
            style={{
              ...inputStyle,
              appearance: 'none',
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L6 7L11 1' stroke='%236B7280' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', paddingRight: 36,
              cursor: 'pointer',
            }}
            onFocus={e  => e.target.style.borderColor = '#7C6CF2'}
            onBlur={e   => e.target.style.borderColor = isLight ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.10)'}
          >
            <option value="">Select your industry…</option>
            {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
          </select>
        </div>

        {/* Team size */}
        <div>
          <label style={labelStyle}>Team Size</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {TEAM_SIZES.map(t => (
              <button key={t.value} onClick={() => field('teamSize', t.value)}
                style={chipBase(draft.teamSize === t.value)}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Work type */}
        <div>
          <label style={labelStyle}>Work Type</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
            {WORK_TYPES.map(t => {
              const active = draft.workType === t.value;
              return (
                <button key={t.value} onClick={() => field('workType', t.value)} style={{
                  padding: '9px 8px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                  border: `1px solid ${active ? '#7C6CF2' : isLight ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.09)'}`,
                  background: active ? 'rgba(124,108,242,0.10)' : isLight ? 'rgba(0,0,0,0.025)' : 'rgba(255,255,255,0.03)',
                  transition: 'all 0.15s',
                }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: active ? '#a78bfa' : isLight ? '#374151' : '#D1D5DB', margin: 0 }}>{t.label}</p>
                  <p style={{ fontSize: 10, color: isLight ? '#9CA3AF' : '#6B7280', margin: '2px 0 0' }}>{t.desc}</p>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── STEP: TIME ───────────────────────────────────────────────────────────────

function StepTime({ draft, setDraft, isLight }) {
  const field = (key, val) => setDraft(d => ({ ...d, [key]: val }));

  const SegBtn = ({ options, value, onChange }) => (
    <div style={{
      display: 'inline-flex', background: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)',
      border: `1px solid ${isLight ? 'rgba(0,0,0,0.09)' : 'rgba(255,255,255,0.08)'}`,
      borderRadius: 9, padding: 3, gap: 2,
    }}>
      {options.map(o => (
        <button key={o.value} onClick={() => onChange(o.value)} style={{
          padding: '6px 14px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
          background: value === o.value ? (isLight ? '#ffffff' : 'rgba(255,255,255,0.1)') : 'transparent',
          color: value === o.value ? (isLight ? '#111827' : '#ffffff') : isLight ? '#9CA3AF' : '#6B7280',
          boxShadow: value === o.value ? (isLight ? '0 1px 3px rgba(0,0,0,0.10)' : '0 1px 3px rgba(0,0,0,0.3)') : 'none',
          transition: 'all 0.15s',
        }}>
          {o.label}
        </button>
      ))}
    </div>
  );

  return (
    <div style={{ display: 'flex', gap: 28, height: '100%' }}>
      {/* Left: Illustration */}
      <div style={{
        width: 220, flexShrink: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16,
      }}>
        <IllustrationTime isLight={isLight}/>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: isLight ? '#111827' : '#ffffff', marginBottom: 4 }}>
            Time & Location
          </p>
          <p style={{ fontSize: 11.5, color: isLight ? '#9CA3AF' : '#6B7280', lineHeight: 1.5 }}>
            Your timezone is auto-detected<br/>from your device
          </p>
        </div>
      </div>

      {/* Right: Form */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Detected timezone card */}
        <div style={{
          padding: '14px 16px', borderRadius: 12,
          background: isLight ? 'rgba(124,108,242,0.06)' : 'rgba(124,108,242,0.08)',
          border: '1px solid rgba(124,108,242,0.25)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Globe size={14} color="#7C6CF2"/>
            <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#7C6CF2' }}>
              Detected Timezone
            </span>
          </div>
          <p style={{ fontSize: 16, fontWeight: 700, color: isLight ? '#111827' : '#ffffff', margin: 0 }}>
            {draft.timezone}
          </p>
          <p style={{ fontSize: 11.5, color: isLight ? '#9CA3AF' : '#6B7280', margin: '4px 0 0' }}>
            Auto-detected from your system clock. You can change this in Settings anytime.
          </p>
        </div>

        {/* Time format */}
        <div>
          <p style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: isLight ? '#6B7280' : '#6B7280', marginBottom: 8 }}>
            Time Format
          </p>
          <SegBtn value={draft.timeFormat} onChange={v => field('timeFormat', v)} options={[
            { value: '12h', label: '12-hour (2:30 PM)' },
            { value: '24h', label: '24-hour (14:30)' },
          ]}/>
        </div>

        {/* Week starts on */}
        <div>
          <p style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: isLight ? '#6B7280' : '#6B7280', marginBottom: 8 }}>
            Week Starts On
          </p>
          <SegBtn value={draft.weekStart} onChange={v => field('weekStart', v)} options={[
            { value: 'mon', label: 'Monday' },
            { value: 'sun', label: 'Sunday' },
          ]}/>
        </div>

        {/* Date format */}
        <div>
          <p style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: isLight ? '#6B7280' : '#6B7280', marginBottom: 8 }}>
            Date Format
          </p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[
              { value: 'MMM D',    label: 'Jun 10' },
              { value: 'DD/MM',   label: '10/06'  },
              { value: 'MM/DD',   label: '06/10'  },
              { value: 'YYYY-MM-DD', label: '2026-06-10' },
            ].map(o => {
              const active = draft.dateFormat === o.value;
              return (
                <button key={o.value} onClick={() => field('dateFormat', o.value)} style={{
                  padding: '7px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                  border: `1px solid ${active ? '#7C6CF2' : isLight ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.09)'}`,
                  background: active ? 'rgba(124,108,242,0.12)' : isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.04)',
                  color: active ? '#a78bfa' : isLight ? '#6B7280' : '#9CA3AF',
                  transition: 'all 0.15s',
                }}>
                  {o.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Info note */}
        <div style={{
          padding: '11px 14px', borderRadius: 10,
          background: isLight ? 'rgba(0,0,0,0.025)' : 'rgba(255,255,255,0.03)',
          border: `1px solid ${isLight ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.06)'}`,
          display: 'flex', alignItems: 'flex-start', gap: 10,
        }}>
          <Sparkles size={13} color="#a78bfa" style={{ marginTop: 1, flexShrink: 0 }}/>
          <p style={{ fontSize: 12, color: isLight ? '#9CA3AF' : '#6B7280', lineHeight: 1.5, margin: 0 }}>
            These preferences sync with your calendar view and all time displays across Flow Ledger.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── STEP: STORAGE ────────────────────────────────────────────────────────────

function StepStorage({ draft, setDraft, isLight }) {
  const field = (key, val) => setDraft(d => ({ ...d, [key]: val }));
  const [permOk, setPermOk] = useState(null);

  useEffect(() => {
    const check = async () => {
      try {
        const result = await callApi('checkStoragePermissions', null, { path: draft.customPath || null });
        setPermOk(result?.ok !== false);
      } catch { setPermOk(true); }
    };
    const t = setTimeout(check, 600);
    return () => clearTimeout(t);
  }, [draft.storageLocation, draft.customPath]);

  const toggleDataType = (id) => {
    if (id === 'activity') return; // required, cannot toggle
    setDraft(d => ({
      ...d,
      dataTypes: d.dataTypes.includes(id)
        ? d.dataTypes.filter(x => x !== id)
        : [...d.dataTypes, id],
    }));
  };

  const estimatedMB = draft.dataTypes.reduce((sum, id) => {
    const dt = DATA_TYPES.find(d => d.id === id);
    if (!dt) return sum;
    return sum + (id === 'screenshots' ? 500 : id === 'activity' ? 10 : 2);
  }, 0);

  const handleBrowse = async () => {
    try {
      const result = await callApi('openDirectoryPicker', null, {});
      if (result?.path) field('customPath', result.path);
    } catch { /* silently ignore */ }
  };

  return (
    <div style={{ display: 'flex', gap: 28, height: '100%' }}>
      {/* Left: Illustration */}
      <div style={{
        width: 220, flexShrink: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16,
      }}>
        <IllustrationStorage isLight={isLight}/>
        {/* Storage estimate */}
        <div style={{
          width: '100%', padding: '12px 14px', borderRadius: 10,
          background: isLight ? 'rgba(52,211,153,0.06)' : 'rgba(52,211,153,0.07)',
          border: '1px solid rgba(52,211,153,0.22)',
        }}>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#34d399', margin: '0 0 4px' }}>
            Est. Storage
          </p>
          <p style={{ fontSize: 20, fontWeight: 800, color: isLight ? '#111827' : '#ffffff', margin: 0 }}>
            {estimatedMB >= 1000 ? `${(estimatedMB / 1000).toFixed(1)} GB` : `${estimatedMB} MB`}
            <span style={{ fontSize: 10, fontWeight: 500, color: '#6B7280', marginLeft: 4 }}>/mo</span>
          </p>
          <p style={{ fontSize: 10.5, color: '#6B7280', margin: '3px 0 0' }}>
            {draft.dataTypes.length} data type{draft.dataTypes.length !== 1 ? 's' : ''} selected
          </p>
        </div>
      </div>

      {/* Right: Form */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 18, overflowY: 'auto' }}>
        {/* Storage location */}
        <div>
          <p style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: isLight ? '#6B7280' : '#6B7280', marginBottom: 8 }}>
            Storage Location
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {STORAGE_OPTS.map(opt => {
              const active = draft.storageLocation === opt.value;
              return (
                <button key={opt.value} onClick={() => field('storageLocation', opt.value)} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '11px 14px', borderRadius: 11, cursor: 'pointer', textAlign: 'left',
                  border: `1px solid ${active ? '#7C6CF2' : isLight ? 'rgba(0,0,0,0.09)' : 'rgba(255,255,255,0.08)'}`,
                  background: active ? 'rgba(124,108,242,0.09)' : isLight ? 'rgba(0,0,0,0.025)' : 'rgba(255,255,255,0.025)',
                  transition: 'all 0.15s',
                }}>
                  <div style={{
                    width: 34, height: 34, borderRadius: 9, flexShrink: 0,
                    background: active ? 'rgba(124,108,242,0.15)' : isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.06)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <opt.Icon size={16} color={active ? '#a78bfa' : isLight ? '#9CA3AF' : '#6B7280'}/>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: active ? (isLight ? '#4C1D95' : '#c4b5fd') : isLight ? '#374151' : '#D1D5DB' }}>
                        {opt.label}
                      </span>
                      {opt.recommended && (
                        <span style={{
                          fontSize: 9.5, fontWeight: 700, padding: '1px 7px', borderRadius: 999,
                          background: 'rgba(124,108,242,0.15)', color: '#a78bfa',
                          border: '1px solid rgba(124,108,242,0.30)',
                        }}>Recommended</span>
                      )}
                    </div>
                    <p style={{ fontSize: 11, color: isLight ? '#9CA3AF' : '#6B7280', margin: 0 }}>{opt.desc}</p>
                  </div>
                  <div style={{
                    width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                    border: `2px solid ${active ? '#7C6CF2' : isLight ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.18)'}`,
                    background: active ? '#7C6CF2' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {active && <Check size={9} color="white" strokeWidth={3}/>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Custom path input */}
        {(draft.storageLocation === 'external' || draft.storageLocation === 'custom') && (
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={draft.customPath}
              onChange={e => field('customPath', e.target.value)}
              placeholder={draft.storageLocation === 'external' ? '/Volumes/MyDrive/flow-ledger' : '/Users/you/Documents/flow-ledger'}
              style={{
                flex: 1, padding: '9px 12px', borderRadius: 9, outline: 'none',
                background: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${isLight ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.10)'}`,
                color: isLight ? '#111827' : '#ffffff', fontSize: 12.5, fontFamily: 'monospace',
              }}
              onFocus={e => e.target.style.borderColor = '#7C6CF2'}
              onBlur={e  => e.target.style.borderColor = isLight ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.10)'}
            />
            <button onClick={handleBrowse} style={{
              padding: '9px 14px', borderRadius: 9, cursor: 'pointer', fontSize: 12, fontWeight: 600,
              background: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.07)',
              border: `1px solid ${isLight ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.10)'}`,
              color: isLight ? '#374151' : '#D1D5DB',
              display: 'flex', alignItems: 'center', gap: 5,
            }}>
              <FolderOpen size={13}/> Browse
            </button>
          </div>
        )}

        {/* Data types */}
        <div>
          <p style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: isLight ? '#6B7280' : '#6B7280', marginBottom: 8 }}>
            Data to Capture
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {DATA_TYPES.map(dt => {
              const on = draft.dataTypes.includes(dt.id);
              return (
                <div key={dt.id} onClick={() => toggleDataType(dt.id)} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', borderRadius: 10,
                  background: on ? (isLight ? 'rgba(0,0,0,0.025)' : 'rgba(255,255,255,0.03)') : 'transparent',
                  border: `1px solid ${on ? (isLight ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.06)') : 'transparent'}`,
                  cursor: dt.required ? 'default' : 'pointer',
                  transition: 'all 0.15s',
                }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: 5, flexShrink: 0,
                    background: on ? (dt.id === 'activity' ? 'rgba(124,108,242,0.25)' : 'rgba(96,165,250,0.2)') : isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)',
                    border: `1.5px solid ${on ? (dt.id === 'activity' ? '#7C6CF2' : '#60a5fa') : isLight ? 'rgba(0,0,0,0.14)' : 'rgba(255,255,255,0.14)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {on && <Check size={10} color={dt.id === 'activity' ? '#a78bfa' : '#60a5fa'} strokeWidth={3}/>}
                  </div>
                  <dt.Icon size={13} color={on ? (dt.id === 'activity' ? '#a78bfa' : '#60a5fa') : isLight ? '#9CA3AF' : '#6B7280'} style={{ flexShrink: 0 }}/>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: isLight ? '#374151' : '#D1D5DB' }}>{dt.label}</span>
                    {dt.required && (
                      <span style={{ fontSize: 9.5, color: '#6B7280', marginLeft: 6 }}>required</span>
                    )}
                    <p style={{ fontSize: 11, color: isLight ? '#9CA3AF' : '#6B7280', margin: 0 }}>{dt.desc}</p>
                  </div>
                  <span style={{ fontSize: 10.5, color: isLight ? '#9CA3AF' : '#4B5563', fontFamily: 'monospace', flexShrink: 0 }}>{dt.size}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Permission indicator */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '9px 12px', borderRadius: 9,
          background: permOk === null
            ? isLight ? 'rgba(0,0,0,0.025)' : 'rgba(255,255,255,0.025)'
            : permOk
              ? 'rgba(52,211,153,0.07)'
              : 'rgba(248,113,113,0.07)',
          border: `1px solid ${permOk === null ? 'transparent' : permOk ? 'rgba(52,211,153,0.22)' : 'rgba(248,113,113,0.22)'}`,
        }}>
          {permOk === null
            ? <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#6B7280' }}/>
            : permOk
              ? <CheckCircle size={13} color="#34d399"/>
              : <Shield size={13} color="#f87171"/>
          }
          <span style={{ fontSize: 11.5, color: permOk === null ? isLight ? '#9CA3AF' : '#6B7280' : permOk ? '#34d399' : '#f87171' }}>
            {permOk === null ? 'Checking permissions…' : permOk ? 'Read/write permissions verified' : 'Cannot write to selected path — please choose another'}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── STEP: DONE ───────────────────────────────────────────────────────────────

function StepDone({ draft, username, isLight, onFinish }) {
  const [entered, setEntered] = useState(false);
  useEffect(() => { const t = setTimeout(() => setEntered(true), 100); return () => clearTimeout(t); }, []);

  const summaryItems = [
    { label: 'Workspace', value: draft.workspaceName || `${username}'s Workspace`, color: '#7C6CF2' },
    { label: 'Industry',  value: draft.industry || 'Not specified', color: '#60a5fa' },
    { label: 'Timezone',  value: draft.timezone,                    color: '#34d399' },
    { label: 'Storage',   value: STORAGE_OPTS.find(o => o.value === draft.storageLocation)?.label || 'Local', color: '#a78bfa' },
    { label: 'Tracking',  value: `${draft.dataTypes.length} data types enabled`, color: '#fbbf24' },
  ];

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '8px 0', textAlign: 'center',
      opacity: entered ? 1 : 0, transform: entered ? 'translateY(0)' : 'translateY(16px)',
      transition: 'opacity 0.5s ease, transform 0.5s ease',
    }}>
      <div style={{ marginBottom: 24 }}>
        <IllustrationDone isLight={isLight}/>
      </div>

      <h2 style={{
        fontSize: 30, fontWeight: 800, letterSpacing: '-0.03em', marginBottom: 8,
        color: isLight ? '#111827' : '#ffffff',
      }}>
        You're all set!
      </h2>
      <p style={{ fontSize: 14, color: isLight ? '#6B7280' : '#9CA3AF', maxWidth: 380, marginBottom: 28, lineHeight: 1.6 }}>
        Flow Ledger is configured and ready to go. Here's a summary of your setup:
      </p>

      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8,
        width: '100%', maxWidth: 480, marginBottom: 28, textAlign: 'left',
      }}>
        {summaryItems.map(item => (
          <div key={item.label} style={{
            padding: '11px 14px', borderRadius: 11,
            background: `${item.color}0d`,
            border: `1px solid ${item.color}28`,
          }}>
            <p style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: item.color, margin: '0 0 3px' }}>
              {item.label}
            </p>
            <p style={{ fontSize: 12.5, fontWeight: 600, color: isLight ? '#111827' : '#E5E7EB', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.value}
            </p>
          </div>
        ))}
      </div>

      <button onClick={onFinish} style={{
        width: '100%', maxWidth: 480, padding: '14px',
        background: 'linear-gradient(135deg, #34d399, #10b981)',
        border: 'none', borderRadius: 14, cursor: 'pointer',
        color: 'white', fontSize: 15, fontWeight: 700,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        boxShadow: '0 4px 22px rgba(52,211,153,0.36)',
        transition: 'box-shadow 0.2s, transform 0.15s',
      }}
        onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 6px 30px rgba(52,211,153,0.52)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
        onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 4px 22px rgba(52,211,153,0.36)'; e.currentTarget.style.transform = 'translateY(0)'; }}
      >
        Start Using Flow Ledger <ArrowRight size={16}/>
      </button>

      <div style={{
        marginTop: 16, display: 'flex', alignItems: 'flex-start', gap: 8,
        padding: '10px 14px', borderRadius: 10, maxWidth: 480,
        background: isLight ? 'rgba(124,108,242,0.05)' : 'rgba(124,108,242,0.07)',
        border: '1px solid rgba(124,108,242,0.18)',
      }}>
        <Sparkles size={12} color="#a78bfa" style={{ marginTop: 1, flexShrink: 0 }}/>
        <p style={{ fontSize: 11.5, color: isLight ? '#6B7280' : '#9CA3AF', lineHeight: 1.55, margin: 0 }}>
          All settings are editable anytime in <strong style={{ color: '#a78bfa' }}>Settings → Workspace</strong>. Press <kbd style={{
            background: isLight ? '#EDE9FF' : '#1f2937', border: `1px solid ${isLight ? 'rgba(124,108,242,0.3)' : '#374151'}`,
            borderRadius: 4, padding: '1px 5px', fontSize: 10, color: '#a78bfa',
          }}>Ctrl+K</kbd> anytime to access the command palette.
        </p>
      </div>
    </div>
  );
}

// ─── MAIN WIZARD ──────────────────────────────────────────────────────────────

export default function SetupWizard({ onComplete }) {
  const { user, updateUser } = useAuth();
  const isLight = useIsLight();
  const [step, setStep]     = useState(0);
  const [dir, setDir]       = useState(1);   // 1 = forward, -1 = backward
  const [draft, setDraft]   = useState(() => {
    const d = loadDraft();
    if (!d.workspaceName && user?.username) d.workspaceName = `${user.username}'s Workspace`;
    return d;
  });
  const [saving, setSaving] = useState(false);
  const prevStep = useRef(0);

  // Auto-save draft on every change
  useEffect(() => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }, [draft]);

  const username = user?.username || '';
  const isWelcome = step === 0;
  const isDone    = step === 4;
  const totalContent = STEPS.length; // 5

  const canContinue = (() => {
    if (step === 1) return draft.workspaceName.trim().length > 0;
    return true;
  })();

  const goNext = useCallback(() => {
    if (!canContinue || saving) return;
    setDir(1);
    setStep(s => Math.min(s + 1, totalContent - 1));
  }, [canContinue, saving, totalContent]);

  const goBack = useCallback(() => {
    setDir(-1);
    setStep(s => Math.max(s - 1, 0));
  }, []);

  const handleSkip = useCallback(() => {
    localStorage.setItem(SETUP_KEY, 'done');
    localStorage.setItem('fl_onboarded_v1', 'true');
    localStorage.removeItem(DRAFT_KEY);
    onComplete?.();
  }, [onComplete]);

  const handleFinish = useCallback(async () => {
    setSaving(true);
    try {
      // Save workspace to user account
      const workspacePatch = {
        workspace_name: draft.workspaceName.trim() || `${username}'s Workspace`,
        company:        draft.company.trim(),
        industry:       draft.industry,
        team_size:      draft.teamSize,
        work_type:      draft.workType,
      };
      updateUser?.(workspacePatch);
      await callApi('updateProfile', null, {
        userId:        user?.id,
        workspaceName: workspacePatch.workspace_name,
        company:       workspacePatch.company,
        industry:      workspacePatch.industry,
        teamSize:      workspacePatch.team_size,
        workType:      workspacePatch.work_type,
      }).catch(() => {});

      // Save workspace to dedicated key for Settings display
      localStorage.setItem('fl_workspace', JSON.stringify(workspacePatch));

      // Merge time prefs into fl_prefs
      const existing = JSON.parse(localStorage.getItem(FL_PREFS_KEY) || '{}');
      const prefs = {
        ...existing,
        timezone:   draft.timezone === '' ? 'auto' : 'auto',
        _detectedTz: draft.timezone,
        timeFormat: draft.timeFormat,
        weekStart:  draft.weekStart,
        dateFormat: draft.dateFormat,
      };
      localStorage.setItem(FL_PREFS_KEY, JSON.stringify(prefs));
      window.dispatchEvent(new Event('fl-prefs-change'));

      // Save storage preferences
      localStorage.setItem('fl_storage', JSON.stringify({
        location:   draft.storageLocation,
        customPath: draft.customPath,
        dataTypes:  draft.dataTypes,
      }));

      // Mark setup done + suppress old onboarding wizard
      localStorage.setItem(SETUP_KEY, 'done');
      localStorage.setItem('fl_onboarded_v1', 'true');
      localStorage.removeItem(DRAFT_KEY);

      // Start auto-tracker if activity logs enabled
      if (draft.dataTypes.includes('activity')) {
        await callApi('updateTrackingSettings', null, { enabled: true }).catch(() => {});
        await callApi('startTracker', null, { userId: user?.id }).catch(() => {});
      }
    } catch { /* continue regardless */ }
    setSaving(false);
    onComplete?.();
  }, [draft, username, user, updateUser, onComplete]);

  // Theme-aware colors
  const bgPage   = isLight ? '#F0ECFF' : '#07090F';
  const cardBg   = isLight ? '#FFFFFF' : '#0D0F16';
  const cardBrd  = isLight ? 'rgba(124,108,242,0.18)' : 'rgba(255,255,255,0.07)';
  const divider  = isLight ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.06)';

  const stepKey = `step-${step}`;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 10000,
      background: bgPage,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '20px',
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
    }}>
      <style>{`
        @keyframes sw-fade-in {
          from { opacity: 0; transform: translateX(var(--sw-dx)); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes sw-card-in {
          from { opacity: 0; transform: translateY(20px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        .sw-step-content {
          animation: sw-fade-in 0.32s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
        .sw-card {
          animation: sw-card-in 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }
      `}</style>

      {/* Decorative bg blobs */}
      <div style={{
        position: 'absolute', top: '-10%', left: '-5%',
        width: 480, height: 480, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(124,108,242,0.08) 0%, transparent 70%)',
        pointerEvents: 'none',
      }}/>
      <div style={{
        position: 'absolute', bottom: '-8%', right: '-4%',
        width: 380, height: 380, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(52,211,153,0.06) 0%, transparent 70%)',
        pointerEvents: 'none',
      }}/>

      {/* Main card */}
      <div className="sw-card" style={{
        position: 'relative', zIndex: 1,
        width: '100%', maxWidth: isWelcome || isDone ? 540 : 860,
        background: cardBg, borderRadius: 24,
        border: `1px solid ${cardBrd}`,
        boxShadow: isLight
          ? '0 20px 60px rgba(124,108,242,0.12), 0 1px 2px rgba(0,0,0,0.06)'
          : '0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(124,108,242,0.12)',
        overflow: 'hidden',
        transition: 'max-width 0.4s cubic-bezier(0.22,1,0.36,1)',
      }}>
        {/* Top bar */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 24px',
          borderBottom: `1px solid ${divider}`,
        }}>
          {/* Logo + brand */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src={logoSrc} alt="Flow Ledger" style={{ width: 28, height: 28, borderRadius: 8, objectFit: 'contain' }}/>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: isLight ? '#111827' : '#ffffff', letterSpacing: '-0.01em' }}>
              Flow Ledger
            </span>
          </div>

          {/* Step progress (hidden on welcome/done) */}
          {!isWelcome && !isDone && <StepProgress current={step} isLight={isLight}/>}

          {/* Skip */}
          {!isDone && (
            <button onClick={handleSkip} style={{
              display: 'flex', alignItems: 'center', gap: 4,
              background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px',
              color: isLight ? '#9CA3AF' : '#4B5563', fontSize: 12, fontWeight: 500,
              borderRadius: 6, transition: 'color 0.15s',
            }}
              onMouseEnter={e => e.currentTarget.style.color = isLight ? '#6B7280' : '#9CA3AF'}
              onMouseLeave={e => e.currentTarget.style.color = isLight ? '#9CA3AF' : '#4B5563'}
            >
              Skip setup
            </button>
          )}
        </div>

        {/* Body */}
        <div style={{
          padding: isWelcome || isDone ? '24px 48px 20px' : '24px 28px',
          minHeight: isWelcome || isDone ? 'auto' : 360,
          maxHeight: 'calc(100vh - 200px)', overflowY: 'auto',
        }}>
          <div key={stepKey} className="sw-step-content"
            style={{ '--sw-dx': `${dir * 24}px` }}>
            {step === 0 && <StepWelcome username={username} isLight={isLight} onNext={goNext} onSkip={handleSkip}/>}
            {step === 1 && <StepWorkspace draft={draft} setDraft={setDraft} isLight={isLight}/>}
            {step === 2 && <StepTime      draft={draft} setDraft={setDraft} isLight={isLight}/>}
            {step === 3 && <StepStorage   draft={draft} setDraft={setDraft} isLight={isLight}/>}
            {step === 4 && <StepDone      draft={draft} username={username} isLight={isLight} onFinish={handleFinish}/>}
          </div>
        </div>

        {/* Footer nav (steps 1–3 only) */}
        {!isWelcome && !isDone && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 28px',
            borderTop: `1px solid ${divider}`,
          }}>
            <button onClick={goBack} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '9px 18px', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600,
              background: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${isLight ? 'rgba(0,0,0,0.09)' : 'rgba(255,255,255,0.09)'}`,
              color: isLight ? '#6B7280' : '#9CA3AF', transition: 'all 0.15s',
            }}
              onMouseEnter={e => e.currentTarget.style.color = isLight ? '#374151' : '#D1D5DB'}
              onMouseLeave={e => e.currentTarget.style.color = isLight ? '#6B7280' : '#9CA3AF'}
            >
              <ChevronLeft size={14}/> Back
            </button>

            <span style={{ fontSize: 11.5, color: isLight ? '#9CA3AF' : '#4B5563' }}>
              Step {step} of {totalContent - 1}
            </span>

            <button onClick={goNext} disabled={!canContinue || saving} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '9px 22px', borderRadius: 10, cursor: canContinue ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 700,
              background: canContinue
                ? 'linear-gradient(135deg, #7C6CF2, #a78bfa)'
                : isLight ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.06)',
              border: 'none',
              color: canContinue ? 'white' : isLight ? '#D1D5DB' : '#374151',
              boxShadow: canContinue ? '0 2px 14px rgba(124,108,242,0.32)' : 'none',
              transition: 'all 0.15s',
            }}
              onMouseEnter={e => canContinue && (e.currentTarget.style.boxShadow = '0 4px 20px rgba(124,108,242,0.48)')}
              onMouseLeave={e => canContinue && (e.currentTarget.style.boxShadow = '0 2px 14px rgba(124,108,242,0.32)')}
            >
              {saving ? 'Saving…' : 'Continue'} {!saving && <ChevronRight size={14}/>}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
