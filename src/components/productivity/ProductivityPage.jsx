import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Brain, Zap, Shield, Activity, Clock, Coffee, ArrowUpRight, ArrowDownRight,
  BarChart2, Target, AlertTriangle, Layers, TrendingUp, TrendingDown,
  Monitor, Flame, Sparkles, Download,
} from 'lucide-react';
import ExportModal from '../shared/ExportModal';
import { exportAsCSV, exportAsPDF, fmtDuration, fmtPct } from '../../utils/exportUtils';
import {
  AreaChart, Area, BarChart, Bar, ComposedChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts';
import { getFocusAnalytics, getBurnoutAnalytics, getContextSwitchAnalytics } from '../../ai/adaptive/analyticsIntelligenceEngine.js';
import { classifyActivityApp, SMART_CATEGORY_DEFS } from '../../utils/activityCategories.js';

const api    = window.electron || {};
const callApi = (name, fallback, payload) => {
  const fn = api[name];
  return typeof fn === 'function' ? fn(payload) : Promise.resolve(fallback);
};

/* ─── constants ──────────────────────────────────────────────────── */
const RANGES  = [{ l:'7D', d:7 }, { l:'14D', d:14 }, { l:'30D', d:30 }, { l:'90D', d:90 }];
const TICK    = { fill:'#6a7a96', fontSize:11, fontWeight:500 };
const TT      = {
  contentStyle : { background:'rgba(12,16,26,0.98)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:10, fontSize:12, color:'#e2e8f0', boxShadow:'0 20px 48px rgba(0,0,0,0.55)' },
  labelStyle   : { color:'#f1f5f9', fontWeight:700, marginBottom:3 },
  itemStyle    : { color:'#cbd5e1', fontWeight:600 },
  cursor       : { fill:'rgba(124,108,242,0.06)' },
};
// Maps a canonical category "type" (from utils/activityCategories.js, which
// mirrors the Activity → Apps source of truth) to this module's 3-bucket view.
const TYPE_TO_BUCKET = {
  deep: 'productive', meeting: 'neutral', shallow: 'neutral',
  neutral: 'neutral', distraction: 'distracting',
};
const MODULES = [
  { id:'overview',  label:'Overview',        icon: BarChart2 },
  { id:'deepwork',  label:'Deep Work',        icon: Brain     },
  { id:'focus',     label:'Focus & Apps',     icon: Shield    },
  { id:'context',   label:'Context',          icon: Layers    },
  { id:'patterns',  label:'Patterns',         icon: Activity  },
];

/* ─── helpers ────────────────────────────────────────────────────── */
function normArr(v) { return Array.isArray(v) ? v : []; }
function normDaily(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  return Object.entries(v).map(([date, d]) => ({ date, ...d }));
}
function fmtH(s) {
  const h = (s || 0) / 3600;
  return h >= 10 ? `${h.toFixed(0)}h` : h >= 1 ? `${h.toFixed(1)}h` : `${Math.round((s||0)/60)}m`;
}
function hexToRgbTriplet(hex = '#7c6cf2') {
  const safe = /^#[0-9A-Fa-f]{6}$/.test(hex) ? hex : '#7c6cf2';
  const r = parseInt(safe.slice(1, 3), 16);
  const g = parseInt(safe.slice(3, 5), 16);
  const b = parseInt(safe.slice(5, 7), 16);
  return `${r} ${g} ${b}`;
}
function scoreMeta(n) {
  if (n >= 85) return { color:'#34D399', label:'Excellent', bg:'rgba(52,211,153,0.12)' };
  if (n >= 70) return { color:'#60a5fa', label:'Good',      bg:'rgba(96,165,250,0.12)' };
  if (n >= 50) return { color:'#f59e0b', label:'Fair',      bg:'rgba(245,158,11,0.12)' };
  return                { color:'#f87171', label:'Low',      bg:'rgba(248,113,113,0.12)' };
}
function sessionQuality(block) {
  const min = (block.durationSec || block.duration_seconds || 0) / 60;
  const sw  = block.switches || block.context_switches || 0;
  const dScore = min >= 90 ? 100 : min >= 45 ? 78 : min >= 20 ? 52 : 28;
  const sScore = sw === 0 ? 100 : sw <= 2 ? 75 : sw <= 5 ? 45 : 20;
  return Math.round(dScore * 0.6 + sScore * 0.4);
}
// Respects the category assigned on the Activity → Apps page (ai_category)
// first; only falls back to the shared heuristic classifier when an app has
// no explicit override yet. Never recomputes category independently.
function classifyApp(name = '', aiCategory = '') {
  const key = (aiCategory || '').toLowerCase().trim();
  const type = (key && SMART_CATEGORY_DEFS[key])
    ? SMART_CATEGORY_DEFS[key].type
    : classifyActivityApp(name).type;
  return TYPE_TO_BUCKET[type] || 'neutral';
}
function cleanAppName(raw = '') {
  return (raw || '')
    .replace(/\.exe$/i, '')
    .replace(/\s+\d+(\.\d+)*\s*$/, '')
    .replace(/^(com\.|org\.|io\.)\S+\s*/i, '')
    .trim() || raw;
}
function computeFocusQuality({ deepWorkSec, effectiveDays, focusPct, contextScore, dailyArr }) {
  const targetPerDay = 3 * 3600;
  const deepH        = (deepWorkSec || 0);
  const deepFactor   = Math.min(deepH / Math.max(effectiveDays * targetPerDay, 1), 1);
  const focusFactor  = Math.min((focusPct || 0) / 100, 1);
  const ctxFactor    = Math.min((contextScore || 0) / 100, 1);
  const activeDays   = dailyArr.filter(d => (d.totalSec || d.focus || 0) > 1800).length;
  const consFactor   = effectiveDays > 0 ? Math.min(activeDays / effectiveDays, 1) : 0;
  return Math.round(deepFactor * 35 + focusFactor * 30 + ctxFactor * 20 + consFactor * 15);
}

/* ─── ScoreRing ──────────────────────────────────────────────────── */
function ScoreRing({ score, size = 108, thick = 8 }) {
  const meta = scoreMeta(score);
  const r    = (size - thick) / 2;
  const circ = 2 * Math.PI * r;
  const fill = Math.min(score, 100) / 100 * circ;
  return (
    <div className="fl-product-ring relative flex items-center justify-center"
         style={{ width:size, height:size, '--ring-accent':meta.color }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}
           style={{ transform:'rotate(-90deg)', position:'absolute', top:0, left:0 }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none"
                stroke="rgba(255,255,255,0.07)" strokeWidth={thick}/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={meta.color}
                strokeWidth={thick} strokeDasharray={`${fill} ${circ}`} strokeLinecap="round"
                style={{ filter:`drop-shadow(0 0 8px ${meta.color}55)`,
                         transition:'stroke-dasharray 1.2s cubic-bezier(0.22,1,0.36,1)' }}/>
      </svg>
      <div className="relative flex flex-col items-center gap-0.5">
        <p className="fl-product-value leading-none text-white"
           style={{ fontSize:'2rem', fontWeight:800, letterSpacing:'-0.04em' }}>{score}</p>
        <span className="text-[10px] font-bold tracking-wide" style={{ color:meta.color }}>{meta.label}</span>
      </div>
    </div>
  );
}

/* ─── DonutRing ──────────────────────────────────────────────────── */
function DonutRing({ value, color, size=88, thick=8, glow=false }) {
  const r    = (size - thick) / 2;
  const circ = 2 * Math.PI * r;
  const fill = Math.min(Math.max(value,0),100) / 100 * circ;
  return (
    <svg className="fl-product-donut" width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform:'rotate(-90deg)', '--ring-accent':color }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={thick}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={thick}
        strokeDasharray={`${fill} ${circ}`} strokeLinecap="round"
        style={{ filter:glow?`drop-shadow(0 0 7px ${color}77)`:'none', transition:'stroke-dasharray 0.9s ease' }}/>
    </svg>
  );
}

/* ─── MiniSparkline ──────────────────────────────────────────────── */
function MiniSpark({ data=[], color='#7c6cf2', w=64, h=24 }) {
  const vals = data.map(Number).filter(isFinite);
  if (vals.length < 2) return <div style={{ width:w, height:h }}/>;
  const mn = Math.min(...vals), mx = Math.max(...vals), rng = mx - mn || 1;
  const pts = vals.map((v,i) => [
    (i / (vals.length-1)) * w,
    h - ((v-mn)/rng) * (h-4) - 2,
  ]);
  const id   = `ms-${color.replace('#','')}`;
  const poly = pts.map(p => p.join(',')).join(' ');
  const area = `M${pts[0].join(',')} ${pts.slice(1).map(p=>`L${p.join(',')}`).join(' ')} L${pts[pts.length-1][0]},${h} L${pts[0][0]},${h} Z`;
  return (
    <svg className="fl-product-spark" width={w} height={h} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`}/>
      <polyline points={poly} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

/* ─── KpiCard ────────────────────────────────────────────────────── */
function KpiCard({ label, value, sub, color='#7c6cf2', Icon, trend, spark=[] }) {
  const up = (trend || 0) >= 0;
  return (
    <div
      className="fl-product-card fl-product-kpi group relative flex h-full flex-col overflow-hidden rounded-[24px] p-[15px]"
      style={{ '--metric-accent':color, '--metric-rgb':hexToRgbTriplet(color) }}
    >
      <div className="fl-product-card-topline pointer-events-none absolute inset-x-0 top-0 h-px"/>
      <div className="fl-product-card-glow pointer-events-none absolute right-0 top-0 h-24 w-24 rounded-full"
        style={{ transform:'translate(28%,-30%)' }}/>
      <div className="mb-2.5 flex items-start justify-between gap-2.5">
        <div className="fl-product-icon-wrap flex h-9 w-9 items-center justify-center rounded-xl">
          <Icon size={13} style={{ color }}/>
        </div>
        {trend !== undefined && (
          <span className={`fl-product-trend flex items-center gap-0.5 rounded-full px-2 py-1 text-[10px] font-bold ${up ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
            {up ? <ArrowUpRight size={8}/> : <ArrowDownRight size={8}/>}{Math.abs(trend)}%
          </span>
        )}
      </div>
      <div className="fl-product-kpi-body flex min-h-0 flex-1 flex-col justify-between gap-2.5">
        <div>
        <p className="fl-product-label text-[11px] font-semibold uppercase tracking-[0.11em]">{label}</p>
        <p className="fl-product-value mt-0.5 text-[1.45rem] font-extrabold leading-tight">{value}</p>
        {sub && <p className="fl-product-support mt-1 text-[10px] leading-snug">{sub}</p>}
        </div>
        {spark.length > 1 && (
          <div className="fl-product-kpi-spark flex items-end justify-end">
            <MiniSpark data={spark} color={color} w={60} h={22}/>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── SectionCard ────────────────────────────────────────────────── */
function SCard({ children, className='', noPad=false }) {
  return (
    <div className={`fl-product-card fl-product-panel relative overflow-hidden rounded-[26px] ${noPad?'':'p-[18px]'} ${className}`}>
      <div className="fl-product-card-topline pointer-events-none absolute inset-x-0 top-0 h-px opacity-60"/>
      <div className="fl-product-card-glow pointer-events-none absolute right-0 top-0 h-28 w-28 rounded-full"
        style={{ transform:'translate(24%,-35%)' }}/>
      {children}
    </div>
  );
}

/* ─── CardHead ───────────────────────────────────────────────────── */
function CardHead({ icon:Icon, color, title, sub, right }) {
  return (
    <div className="fl-product-cardhead mb-4 flex items-start justify-between gap-3" style={{ '--metric-accent':color, '--metric-rgb':hexToRgbTriplet(color) }}>
      <div className="flex items-center gap-3">
        <div className="fl-product-icon-wrap flex h-9 w-9 shrink-0 items-center justify-center rounded-xl">
          <Icon size={13} style={{ color }}/>
        </div>
        <div>
          <p className="fl-product-title text-[13px] font-bold">{title}</p>
          {sub && <p className="fl-product-support mt-1 text-[11px]">{sub}</p>}
        </div>
      </div>
      {right}
    </div>
  );
}

/* ─── ScoreFactorRow ─────────────────────────────────────────────── */
function ScoreFactorRow({ label, value, color, weight }) {
  return (
    <div className="fl-score-factor-row">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="fl-product-support text-[11px] font-medium tracking-wide">{label}</span>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-bold text-white">{value}%</span>
          <span className="fl-score-weight-badge rounded px-1 py-px text-[9px] font-bold tracking-wider"
                style={{ background:`${color}22`, color }}>×{weight}</span>
        </div>
      </div>
      <div className="fl-product-progress-track h-[5px] overflow-hidden rounded-full">
        <div className="fl-product-progress-fill h-full rounded-full transition-all duration-700"
             style={{ width:`${value}%`, background:`linear-gradient(90deg, ${color}99, ${color})` }}/>
      </div>
    </div>
  );
}

/* ─── EmptyState ─────────────────────────────────────────────────── */
function EmptyState({ icon:Icon, msg, hint }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-xl bg-white/[0.04]">
        <Icon size={20} className="text-[#3a4558]"/>
      </div>
      <p className="text-[12px] font-semibold text-[#3a4558]">{msg}</p>
      {hint && <p className="max-w-xs text-[11px] text-[#2d3748]">{hint}</p>}
    </div>
  );
}

/* ─── ModuleTabs ─────────────────────────────────────────────────── */
function ModuleTabs({ active, onChange }) {
  return (
    <div className="fl-product-filterbar flex items-center gap-0.5 rounded-xl border border-white/[0.06] bg-white/[0.02] p-1">
      {MODULES.map(({ id, label, icon:Icon }) => {
        const on = active === id;
        return (
          <button key={id} onClick={() => onChange(id)}
            className={`fl-product-filterchip flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-all duration-200 whitespace-nowrap ${
              on ? 'bg-white/[0.1] text-white shadow-sm' : 'text-[#6a7a96] hover:text-white'
            }`}>
            <Icon size={11} className={on ? 'text-accent' : ''}/>
            {label}
          </button>
        );
      })}
    </div>
  );
}

/* ─── RangePicker ────────────────────────────────────────────────── */
function RangePicker({ range, onChange }) {
  return (
    <div className="fl-product-filterbar flex items-center gap-0.5 rounded-lg border border-white/[0.06] bg-white/[0.02] p-0.5">
      {RANGES.map(r => (
        <button key={r.d} onClick={() => onChange(r.d)}
          className={`fl-product-filterchip rounded-md px-2.5 py-1 text-[11px] font-bold transition-all duration-200 ${
            range === r.d ? 'bg-white/[0.1] text-white' : 'text-[#5a6a82] hover:text-white'
          }`}>
          {r.l}
        </button>
      ))}
    </div>
  );
}

/* ─── InsightPill ────────────────────────────────────────────────── */
function InsightPill({ icon:Icon, color, children }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-white/[0.05] bg-white/[0.025] px-3 py-2">
      <div className="absolute inset-y-0 left-0 w-0.5 rounded-full" style={{ background:`linear-gradient(180deg,${color},${color}22)` }}/>
      <div className="flex items-start gap-2">
        <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md" style={{ background:`${color}18` }}>
          <Icon size={10} style={{ color }}/>
        </div>
        <p className="text-[11px] leading-relaxed text-[#7a8ba8]">{children}</p>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   OVERVIEW MODULE
══════════════════════════════════════════════════════════════════ */
function OverviewModule({ D, behavioralFocus, behavioralBurnout }) {
  const { summary, dailyArr, distRatio, weekComp, contextScore, effectiveDays } = D;

  const deepWorkSec  = summary?.deepWorkSeconds || 0;
  const focusSec     = summary?.focusSeconds    || 0;
  const meetSec      = summary?.meetingSeconds  || 0;
  const breakSec     = summary?.breakSeconds    || 0;
  const focusPct     = distRatio?.focusPct      || 0;
  const ctxScore     = contextScore?.score      ?? 0;

  const quality = useMemo(() => computeFocusQuality({
    deepWorkSec, effectiveDays, focusPct, contextScore: ctxScore, dailyArr,
  }), [deepWorkSec, effectiveDays, focusPct, ctxScore, dailyArr]);

  const meta = scoreMeta(quality);

  const factors = useMemo(() => {
    const dw = Math.min(deepWorkSec / Math.max(effectiveDays * 3 * 3600, 1), 1) * 100;
    const fp = focusPct;
    const ct = ctxScore;
    const ac = effectiveDays > 0 ? (dailyArr.filter(d => (d.totalSec||d.focus||0) > 1800).length / effectiveDays) * 100 : 0;
    return [
      { label:'Deep Work Volume', value:Math.round(dw), color:'#7C6CF2', weight:'0.35' },
      { label:'Focus Ratio',      value:Math.round(fp), color:'#34D399', weight:'0.30' },
      { label:'Context Control',  value:Math.round(ct), color:'#60a5fa', weight:'0.20' },
      { label:'Consistency',      value:Math.round(ac), color:'#f59e0b', weight:'0.15' },
    ];
  }, [deepWorkSec, effectiveDays, focusPct, ctxScore, dailyArr]);

  const focusTrend = weekComp
    ? Math.round(((weekComp.thisWeek?.focusSecs||0)-(weekComp.lastWeek?.focusSecs||0)) / Math.max(weekComp.lastWeek?.focusSecs||1,1) * 100)
    : 0;
  const deepTrend = weekComp
    ? Math.round(((weekComp.thisWeek?.deepWorkSecs||0)-(weekComp.lastWeek?.deepWorkSecs||0)) / Math.max(weekComp.lastWeek?.deepWorkSecs||1,1) * 100)
    : 0;

  const sparkFocus = dailyArr.slice(-14).map(d => (d.focus||d.focusSec||d.totalSec||0)/3600);
  const sparkDeep  = dailyArr.slice(-14).map(d => (d.deepWork||d.deepWorkSec||0)/3600);

  const chartData = useMemo(() =>
    dailyArr.slice(-effectiveDays).map(d => {
      const date = d.date ? new Date(isNaN(d.date) ? d.date : d.date * 1000)
        .toLocaleDateString('en-US', { month:'short', day:'numeric' }) : '—';
      return {
        date,
        focus    : Math.round((d.focus||d.focusSec||0)/360)/10,
        deepWork : Math.round((d.deepWork||d.deepWorkSec||0)/360)/10,
        meetings : Math.round((d.meetings||d.meetingSec||0)/360)/10,
      };
    }),
  [dailyArr, effectiveDays]);

  const wowCmp = useMemo(() => [
    { label:'Focus',     this:(weekComp?.thisWeek?.focusSecs||0),     last:(weekComp?.lastWeek?.focusSecs||0),     color:'#34D399', Icon:Zap      },
    { label:'Deep Work', this:(weekComp?.thisWeek?.deepWorkSecs||0),   last:(weekComp?.lastWeek?.deepWorkSecs||0),  color:'#7c6cf2', Icon:Brain    },
    { label:'Meetings',  this:(weekComp?.thisWeek?.meetingSecs||0),    last:(weekComp?.lastWeek?.meetingSecs||0),   color:'#f87171', Icon:Clock    },
  ], [weekComp]);

  return (
    <div className="space-y-3.5">
      {/* Adaptive behavioral summary row */}
      {(behavioralFocus?.peakWindow || behavioralBurnout?.riskLevel) && (
        <div className="grid grid-cols-3 gap-3">
          {behavioralFocus?.peakWindow && (
            <div className="rounded-xl border px-3.5 py-2.5" style={{ background:'rgba(52,211,153,0.05)', borderColor:'rgba(52,211,153,0.18)' }}>
              <p className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color:'#34D399' }}>Learned Peak Window</p>
              <p className="text-sm font-bold text-white">{behavioralFocus.peakWindow}</p>
              <p className="text-[10px] mt-0.5" style={{ color:'#5A6A88' }}>{behavioralFocus.deepWorkRatioPct}% deep work avg</p>
            </div>
          )}
          {behavioralBurnout?.riskLevel && (
            <div className="rounded-xl border px-3.5 py-2.5" style={{ background:'rgba(129,140,248,0.05)', borderColor:'rgba(129,140,248,0.18)' }}>
              <p className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color:'#818CF8' }}>Burnout Tracker</p>
              <p className="text-sm font-bold capitalize" style={{ color: behavioralBurnout.riskLevel === 'low' ? '#34D399' : '#FBBF24' }}>{behavioralBurnout.riskLevel} risk</p>
              <p className="text-[10px] mt-0.5" style={{ color:'#5A6A88' }}>{Math.round(behavioralBurnout.fatigue)}% fatigue · {Math.round(behavioralBurnout.currentWeekHours * 10) / 10}h this week</p>
            </div>
          )}
          {behavioralFocus?.confidence > 0 && (
            <div className="rounded-xl border px-3.5 py-2.5" style={{ background:'rgba(96,165,250,0.05)', borderColor:'rgba(96,165,250,0.18)' }}>
              <p className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color:'#60A5FA' }}>AI Confidence</p>
              <p className="text-sm font-bold text-white">{behavioralFocus.confidence}%</p>
              <p className="text-[10px] mt-0.5 capitalize" style={{ color:'#5A6A88' }}>{behavioralFocus.confidenceLabel}</p>
            </div>
          )}
        </div>
      )}
      {/* Score + KPIs */}
      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[288px_1fr]">
        {/* Focus Quality Score card */}
        <SCard className="flex flex-col gap-0">
          {/* Header */}
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="fl-score-icon-wrap flex h-6 w-6 items-center justify-center rounded-lg"
                   style={{ background:`${meta.color}1a` }}>
                <Target size={12} style={{ color:meta.color }}/>
              </div>
              <p className="text-[11px] font-bold uppercase tracking-[0.09em] text-[#5a6a82]">Focus Quality</p>
            </div>
            <span className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                  style={{ background:meta.bg, color:meta.color }}>{meta.label}</span>
          </div>

          {/* Ring + description */}
          <div className="flex flex-col items-center pb-3 pt-1">
            <ScoreRing score={quality}/>
            <p className="mt-2.5 text-center text-[10px] font-medium text-[#5a6a82]">
              {quality >= 70 ? 'Strong focus discipline' : quality >= 50 ? 'Focus improving' : 'Build deep work habits'}
            </p>
          </div>

          {/* Divider */}
          <div className="mb-3 h-px bg-white/[0.06]"/>

          {/* Factor rows */}
          <div className="space-y-3">
            {factors.map(f => <ScoreFactorRow key={f.label} {...f}/>)}
          </div>

          {/* Insight footer */}
          <div className="mt-3 rounded-xl border border-white/[0.05] bg-white/[0.025] px-3 py-2 text-center">
            <p className="text-[11px] leading-relaxed text-[#6a7a96]">
              {quality >= 70 ? '↑ Strong focus discipline this period' : quality >= 50 ? '~ Focus showing improvement' : '↓ Increase deep work time to improve score'}
            </p>
          </div>
        </SCard>

        {/* KPI grid */}
        <div className="grid grid-cols-2 gap-3">
          <KpiCard label="Deep Work"   value={fmtH(deepWorkSec)} sub={`${effectiveDays}d period`}  color="#7c6cf2" Icon={Brain}    trend={deepTrend}  spark={sparkDeep}/>
          <KpiCard label="Focus Time"  value={fmtH(focusSec)}    sub="total focused"               color="#34D399" Icon={Zap}      trend={focusTrend} spark={sparkFocus}/>
          <KpiCard label="Meetings"    value={fmtH(meetSec)}     sub="calendar time"               color="#f87171" Icon={Clock}    trend={Math.round(((weekComp?.thisWeek?.meetingSecs||0)-(weekComp?.lastWeek?.meetingSecs||0))/Math.max(weekComp?.lastWeek?.meetingSecs||1,1)*100)}/>
          <KpiCard label="Breaks"      value={fmtH(breakSec)}    sub="recovery time"               color="#f59e0b" Icon={Coffee}/>
        </div>
      </div>

      {/* Trend chart */}
      <SCard>
        <CardHead icon={TrendingUp} color="#34D399" title="Focus · Deep Work · Meetings" sub="Daily hours breakdown"/>
        {chartData.length > 0 ? (
          <>
            <ResponsiveContainer width="100%" height={172}>
              <AreaChart data={chartData} margin={{ top:4, right:8, left:0, bottom:0 }}>
                <defs>
                  {[['f','#34D399'],['d','#7c6cf2'],['m','#f87171']].map(([id,c]) => (
                    <linearGradient key={id} id={`og_${id}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={c} stopOpacity="0.28"/>
                      <stop offset="100%" stopColor={c} stopOpacity="0"/>
                    </linearGradient>
                  ))}
                </defs>
                <XAxis dataKey="date" tick={TICK} axisLine={false} tickLine={false} interval="preserveStartEnd"/>
                <YAxis tick={TICK} axisLine={false} tickLine={false} width={32} tickFormatter={v=>`${v}h`}/>
                <Tooltip {...TT} formatter={(v,n) => [`${v}h`, n]}/>
                <Area type="monotone" dataKey="focus"    stroke="#34D399" strokeWidth={2}   fill="url(#og_f)" name="Focus"/>
                <Area type="monotone" dataKey="deepWork" stroke="#7c6cf2" strokeWidth={1.8} fill="url(#og_d)" name="Deep Work"/>
                <Area type="monotone" dataKey="meetings" stroke="#f87171" strokeWidth={1.5} fill="url(#og_m)" name="Meetings"/>
              </AreaChart>
            </ResponsiveContainer>
            <div className="mt-1.5 flex items-center gap-4">
              {[['Focus','#34D399'],['Deep Work','#7c6cf2'],['Meetings','#f87171']].map(([l,c]) => (
                <div key={l} className="flex items-center gap-1.5">
                  <span className="h-0.5 w-3.5 rounded-full" style={{ background:c }}/>
                  <span className="text-[11px] text-[#5a6a82]">{l}</span>
                </div>
              ))}
            </div>
          </>
        ) : <EmptyState icon={BarChart2} msg="No daily data yet" hint="Track sessions across multiple days to see trend data."/>}
      </SCard>

      {/* Week-over-week */}
      {weekComp && (
        <SCard>
          <CardHead icon={Activity} color="#60a5fa" title="Week-over-Week" sub="This week vs last week"/>
          <div className="grid grid-cols-3 gap-2.5">
            {wowCmp.map(({ label, this:tw, last:lw, color, Icon }) => {
              const pct = lw > 0 ? Math.round((tw - lw) / lw * 100) : 0;
              const up  = pct >= 0;
              return (
                <div key={label} className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3 text-center">
                  <div className="mx-auto mb-2 flex h-7 w-7 items-center justify-center rounded-lg" style={{ background:`${color}15` }}>
                    <Icon size={13} style={{ color }}/>
                  </div>
                  <p className="text-[12px] font-semibold text-[#8090b0]">{label}</p>
                  <p className="mt-1 text-[15px] font-extrabold text-white">{fmtH(tw)}</p>
                  <span className={`mt-1 inline-flex items-center gap-0.5 text-[11px] font-bold ${up ? 'text-emerald-400' : 'text-red-400'}`}>
                    {up ? <ArrowUpRight size={10}/> : <ArrowDownRight size={10}/>}{Math.abs(pct)}%
                  </span>
                  <p className="mt-0.5 text-[10px] text-[#4a5a72]">prev {fmtH(lw)}</p>
                </div>
              );
            })}
          </div>
        </SCard>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   DEEP WORK MODULE
══════════════════════════════════════════════════════════════════ */
function DeepWorkModule({ D, behavioralFocus }) {
  const { deepBlocks, effectiveDays } = D;
  const blocks = normArr(deepBlocks);

  const stats = useMemo(() => {
    if (!blocks.length) return { total:0, avgMin:0, longestMin:0, avgQuality:0, activeDays:0 };
    const durations = blocks.map(b => (b.durationSec||0)/60);
    const total     = blocks.length;
    const avgMin    = Math.round(durations.reduce((s,v)=>s+v,0)/total);
    const longestMin= Math.round(Math.max(...durations));
    const avgQuality= Math.round(blocks.map(sessionQuality).reduce((s,v)=>s+v,0)/total);
    const days      = new Set(blocks.map(b => b.startTs ? new Date(b.startTs*1000).toDateString() : null).filter(Boolean));
    return { total, avgMin, longestMin, avgQuality, activeDays:days.size };
  }, [blocks]);

  const durationBuckets = useMemo(() => {
    const buckets = [
      { label:'<20m',   range:[0,20],   color:'#f87171' },
      { label:'20-45m', range:[20,45],  color:'#f59e0b' },
      { label:'45-90m', range:[45,90],  color:'#60a5fa' },
      { label:'>90m',   range:[90,999], color:'#34D399' },
    ];
    return buckets.map(b => ({
      ...b,
      count: blocks.filter(bl => (bl.durationSec||0)/60 >= b.range[0] && (bl.durationSec||0)/60 < b.range[1]).length,
    }));
  }, [blocks]);

  const consistencyData = useMemo(() => {
    if (!blocks.length) return [];
    const byDay = {};
    blocks.forEach(b => {
      if (!b.startTs) return;
      const key = new Date(b.startTs*1000).toLocaleDateString('en-US',{month:'short',day:'numeric'});
      byDay[key] = (byDay[key]||0) + (b.durationSec||0)/3600;
    });
    return Object.entries(byDay).slice(-14).map(([date,hours]) => ({ date, hours:Math.round(hours*10)/10 }));
  }, [blocks]);

  const recentBlocks = useMemo(() =>
    blocks.slice().sort((a,b)=>(b.startTs||0)-(a.startTs||0)).slice(0,8),
  [blocks]);

  return (
    <div className="space-y-3.5">
      {/* Adaptive behavioral insight banner */}
      {behavioralFocus?.peakWindow && (
        <div className="flex items-center gap-3 rounded-xl border px-4 py-2.5"
          style={{ background:'rgba(52,211,153,0.06)', borderColor:'rgba(52,211,153,0.2)' }}>
          <Sparkles size={13} className="shrink-0" style={{ color:'#34D399' }} />
          <div className="min-w-0 flex-1">
            <span className="text-[10px] font-semibold" style={{ color:'#34D399' }}>Learned pattern · </span>
            <span className="text-[10px]" style={{ color:'#6B8099' }}>{behavioralFocus.insights?.[0] || `Peak focus window: ${behavioralFocus.peakWindow}`}</span>
          </div>
          <span className="shrink-0 rounded-lg px-2.5 py-1 text-[9px] font-bold" style={{ background:'rgba(52,211,153,0.12)', color:'#34D399' }}>
            {behavioralFocus.peakWindow}
          </span>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <KpiCard label="Sessions"      value={stats.total}          sub={`${effectiveDays}d period`}  color="#7c6cf2" Icon={Brain}   />
        <KpiCard label="Avg Duration"  value={`${stats.avgMin}m`}   sub="per session"                  color="#60a5fa" Icon={Clock}   />
        <KpiCard label="Longest Block" value={`${stats.longestMin}m`} sub="single session"             color="#34D399" Icon={Flame}   />
        <KpiCard label="Avg Quality"   value={`${stats.avgQuality}`} sub="session score /100"          color="#f59e0b" Icon={Target}  />
      </div>

      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
        {/* Duration distribution */}
        <SCard>
          <CardHead icon={BarChart2} color="#60a5fa" title="Session Duration Distribution" sub="How long your deep work blocks run"/>
          {blocks.length > 0 ? (
            <div className="space-y-2.5">
              {durationBuckets.map(b => {
                const pct = blocks.length > 0 ? (b.count/blocks.length)*100 : 0;
                return (
                  <div key={b.label}>
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-[12px] font-semibold" style={{ color:b.color }}>{b.label}</span>
                      <span className="text-[12px] font-bold text-white">{b.count} <span className="text-[#4a5568] font-normal">sessions</span></span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
                      <div className="h-full rounded-full transition-all duration-700" style={{ width:`${pct}%`, background:b.color }}/>
                    </div>
                  </div>
                );
              })}
              <div className="pt-1 text-center">
                <p className="text-[11px] text-[#5a6a82]">
                  {blocks.filter(b=>(b.durationSec||0)>=2700).length} sessions ≥ 45min
                  {' '}({blocks.length > 0 ? Math.round(blocks.filter(b=>(b.durationSec||0)>=2700).length/blocks.length*100) : 0}% of total)
                </p>
              </div>
            </div>
          ) : <EmptyState icon={Brain} msg="No deep work sessions" hint="Sessions longer than 25 min with low app-switching are tracked as deep work."/>}
        </SCard>

        {/* Consistency trend */}
        <SCard>
          <CardHead icon={TrendingUp} color="#34D399" title="Daily Deep Work Hours" sub="Consistency across the period"/>
          {consistencyData.length > 0 ? (
            <ResponsiveContainer width="100%" height={148}>
              <BarChart data={consistencyData} margin={{ top:4, right:4, left:0, bottom:0 }} barCategoryGap="30%">
                <XAxis dataKey="date" tick={TICK} axisLine={false} tickLine={false} interval="preserveStartEnd"/>
                <YAxis tick={TICK} axisLine={false} tickLine={false} width={28} tickFormatter={v=>`${v}h`}/>
                <Tooltip {...TT} formatter={v => [`${v}h`, 'Deep Work']}/>
                <ReferenceLine y={2} stroke="#34D399" strokeDasharray="3 3" strokeOpacity={0.35} label={{ value:'2h target', position:'insideTopRight', fill:'#34D399', fontSize:10, opacity:0.6 }}/>
                <Bar dataKey="hours" radius={[4,4,0,0]}>
                  {consistencyData.map((e,i) => <Cell key={i} fill={e.hours >= 2 ? '#34D399' : e.hours >= 1 ? '#60a5fa' : '#374151'}/>)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyState icon={TrendingUp} msg="No data yet" hint="Start tracking to see daily deep work patterns."/>}
        </SCard>
      </div>

      {/* Recent sessions */}
      <SCard noPad>
        <div className="border-b border-white/[0.06] px-4 py-3">
          <p className="text-[13px] font-bold text-white">Recent Deep Work Sessions</p>
        </div>
        {recentBlocks.length === 0 ? (
          <div className="p-4"><EmptyState icon={Brain} msg="No sessions recorded" hint="Complete at least a 25-minute uninterrupted work block to log a deep work session."/></div>
        ) : (
          <div>
            <div className="grid grid-cols-4 gap-2 border-b border-white/[0.05] px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-[#4a5568]">
              <span className="col-span-2">Session</span><span className="text-right">Duration</span><span className="text-right">Quality</span>
            </div>
            {recentBlocks.map((b, i) => {
              const q    = sessionQuality(b);
              const qm   = scoreMeta(q);
              const min  = Math.round((b.durationSec||0)/60);
              const sw   = b.context_switches||b.switches||0;
              const time = b.startTs ? new Date(b.startTs*1000).toLocaleString('en-US',{ month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' }) : '—';
              return (
                <div key={i} className="grid grid-cols-4 gap-2 border-b border-white/[0.04] px-4 py-3 transition-all hover:bg-white/[0.025]">
                  <div className="col-span-2 min-w-0">
                    <p className="text-[12px] font-semibold text-white truncate">{b.title || b.category || `Block ${i+1}`}</p>
                    <p className="text-[10px] text-[#4a5568]">{time} · {sw} switches</p>
                  </div>
                  <span className="text-right text-[12px] text-[#8090b0]">{min}m</span>
                  <div className="flex items-center justify-end gap-1.5">
                    <span className="text-[12px] font-bold" style={{ color:qm.color }}>{q}</span>
                    <span className="rounded px-1 py-0.5 text-[9px] font-bold" style={{ background:qm.bg, color:qm.color }}>{qm.label}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SCard>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   FOCUS & APPS MODULE
══════════════════════════════════════════════════════════════════ */
function FocusModule({ D, behavioralFocus }) {
  const { distRatio, topApps: rawApps, summary } = D;

  const focusPct     = distRatio?.focusPct      || 0;
  const distractPct  = distRatio?.distractedPct  || Math.max(0, 100 - focusPct - (distRatio?.meetingPct || 0));
  const meetingPct   = distRatio?.meetingPct     || 0;
  const focusSec     = distRatio?.focusSecs      || summary?.focusSeconds   || 0;
  const distractSec  = distRatio?.distractedSecs || 0;
  const meetingSec   = distRatio?.meetingSecs    || 0;

  const apps = useMemo(() => {
    const arr = normArr(rawApps);
    return arr
      .map(a => ({ ...a, class: classifyApp(a.name || '', a.category || '') }))
      .sort((a,b) => b.seconds - a.seconds)
      .slice(0, 15);
  }, [rawApps]);

  const [filter, setFilter] = useState('all');
  const visApps = useMemo(() =>
    filter === 'all' ? apps : apps.filter(a => a.class === filter),
  [apps, filter]);

  const classGroups = useMemo(() => {
    const g = { productive:0, neutral:0, distracting:0 };
    apps.forEach(a => { g[a.class] += a.seconds; });
    const total = Object.values(g).reduce((s,v) => s+v, 0) || 1;
    return [
      { key:'productive',  label:'Productive',  color:'#34D399', sec:g.productive,  pct:Math.round(g.productive/total*100)  },
      { key:'neutral',     label:'Neutral',     color:'#60a5fa', sec:g.neutral,     pct:Math.round(g.neutral/total*100)     },
      { key:'distracting', label:'Distracting', color:'#f87171', sec:g.distracting, pct:Math.round(g.distracting/total*100) },
    ];
  }, [apps]);

  const classColor = { productive:'#34D399', neutral:'#60a5fa', distracting:'#f87171' };

  return (
    <div className="space-y-4">
      {/* Adaptive insight: distraction baseline vs learned average */}
      {behavioralFocus?.confidence > 20 && (
        <div className="flex items-center gap-3 rounded-xl border px-4 py-2.5"
          style={{ background:'rgba(96,165,250,0.06)', borderColor:'rgba(96,165,250,0.2)' }}>
          <Shield size={13} className="shrink-0" style={{ color:'#60A5FA' }} />
          <span className="text-[10px]" style={{ color:'#6B8099' }}>
            {behavioralFocus.insights?.[0] || 'Behavioral focus patterns are being learned from your sessions.'}
            {behavioralFocus.deepWorkRatioPct > 0 && ` · Learned deep work ratio: ${behavioralFocus.deepWorkRatioPct}%`}
          </span>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Focus Time"      value={fmtH(focusSec)}    sub={`${focusPct}% of tracked`}      color="#34D399" Icon={Shield}       />
        <KpiCard label="Meetings"        value={fmtH(meetingSec)}  sub={`${meetingPct}% of tracked`}     color="#60a5fa" Icon={Clock}        />
        <KpiCard label="Productive Apps" value={classGroups[0].pct+'%'} sub="of app screen time"        color="#34D399" Icon={Monitor}      />
        <KpiCard label="Distracting Apps"value={classGroups[2].pct+'%'} sub="of app screen time"        color="#f87171" Icon={TrendingDown} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Ratio donut */}
        <SCard>
          <CardHead icon={Shield} color="#34D399" title="Focus vs Distraction" sub="Time classification breakdown"/>
          <div className="flex items-center gap-6">
            <div className="relative shrink-0">
              <DonutRing value={focusPct} color="#34D399" size={104} thick={10} glow/>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-extrabold text-white">{focusPct}%</span>
                <span className="text-[10px] text-[#5a6a82]">focused</span>
              </div>
            </div>
            <div className="flex-1 space-y-3">
              {[
                { label:'Focused',    sec:focusSec,    pct:focusPct,   color:'#34D399' },
                { label:'Meetings',   sec:meetingSec,  pct:meetingPct, color:'#60a5fa' },
                { label:'Distracted', sec:distractSec, pct:distractPct,color:'#f87171' },
              ].map(r => (
                <div key={r.label}>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-[12px] font-semibold text-tx-secondary">
                      <span className="h-2 w-2 rounded-full" style={{ background:r.color }}/>
                      {r.label}
                    </span>
                    <span className="text-[12px] font-bold text-white">{fmtH(r.sec)} <span className="font-normal text-[#5a6a82]">({r.pct}%)</span></span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                    <div className="h-full rounded-full" style={{ width:`${r.pct}%`, background:r.color }}/>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-4 space-y-2">
            {focusPct >= 70
              ? <InsightPill icon={Sparkles} color="#34D399">Strong focus discipline. {focusPct}% of your tracked time is productive — keep it up.</InsightPill>
              : <InsightPill icon={AlertTriangle} color="#f59e0b">Focus is at {focusPct}%. Reducing distractions by just 10% could meaningfully increase your deep work output.</InsightPill>}
          </div>
        </SCard>

        {/* App class breakdown */}
        <SCard>
          <CardHead icon={Monitor} color="#60a5fa" title="App Productivity Mix" sub="Screen time by classification"/>
          <div className="space-y-3">
            {classGroups.map(g => (
              <div key={g.key}>
                <div className="mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-[12px] font-semibold text-tx-secondary">
                    <span className="h-2 w-2 rounded-full" style={{ background:g.color }}/>
                    {g.label}
                  </span>
                  <span className="text-[12px] font-bold text-white">{fmtH(g.sec)} <span className="text-[#4a5568]">({g.pct}%)</span></span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
                  <div className="h-full rounded-full" style={{ width:`${g.pct}%`, background:g.color }}/>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {classGroups.map(g => (
              <div key={g.key} className="rounded-xl border border-white/[0.05] bg-white/[0.025] p-2.5 text-center">
                <p className="text-[16px] font-extrabold" style={{ color:g.color }}>{g.pct}%</p>
                <p className="text-[10px] text-[#5a6a82]">{g.label}</p>
              </div>
            ))}
          </div>
        </SCard>
      </div>

      {/* App list */}
      <SCard noPad>
        <div className="flex items-center justify-between border-b border-white/[0.06] p-4">
          <div className="flex items-center gap-2">
            <p className="text-[13px] font-bold text-white">App Usage Detail</p>
            <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold text-[#6a7a96]">{visApps.length}</span>
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-white/[0.06] bg-white/[0.02] p-0.5">
            {[
              ['all','All', apps.length],
              ['productive','Productive', apps.filter(a=>a.class==='productive').length],
              ['neutral','Neutral', apps.filter(a=>a.class==='neutral').length],
              ['distracting','Distracting', apps.filter(a=>a.class==='distracting').length],
            ].map(([k, l, cnt]) => (
              <button key={k} onClick={() => setFilter(k)}
                className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-[10px] font-bold transition-all ${filter===k ? 'bg-white/[0.1] text-white' : 'text-[#5a6a82] hover:text-white'}`}>
                {l}
                {cnt > 0 && <span className={`rounded-full px-1 py-px text-[9px] ${filter===k ? 'bg-white/[0.12] text-white/70' : 'bg-white/[0.05] text-[#4a5568]'}`}>{cnt}</span>}
              </button>
            ))}
          </div>
        </div>
        {visApps.length === 0 ? (
          <div className="p-5"><EmptyState icon={Monitor} msg={filter === 'all' ? 'No app data' : `No ${filter} apps in this period`} hint="App usage is tracked automatically when sessions are active."/></div>
        ) : (
          <div>
            {(() => {
              const allTotal = apps.reduce((s, x) => s + x.seconds, 0) || 1;
              const maxSec   = Math.max(...visApps.map(x => x.seconds), 1);
              return visApps.map((a, i) => {
                const pctOfAll  = Math.round(a.seconds / allTotal * 100);
                const barWidth  = Math.round(a.seconds / maxSec * 100);
                const color     = classColor[a.class];
                const letter    = (a.name || '?')[0].toUpperCase();
                const rank      = i + 1;
                return (
                  <div key={i} className="group flex items-center gap-3 border-b border-white/[0.04] px-4 py-2.5 transition-all hover:bg-white/[0.025]">
                    {/* Rank + letter icon */}
                    <div className="flex shrink-0 flex-col items-center gap-0.5">
                      <span className="text-[9px] font-bold text-[#3a4558] tabular-nums">#{rank}</span>
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg text-[11px] font-extrabold"
                        style={{ background:`${color}18`, border:`1px solid ${color}28`, color }}>
                        {letter}
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <span className="truncate text-[12px] font-semibold text-white">{a.name || `App ${i+1}`}</span>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="text-[10px] text-[#4a5568]">{pctOfAll}%</span>
                          <span className="text-[12px] font-bold text-[#8090b0]">{fmtH(a.seconds)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                          <div className="h-full rounded-full transition-all duration-700" style={{ width:`${barWidth}%`, background:`linear-gradient(90deg,${color}88,${color})` }}/>
                        </div>
                        <span className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold capitalize" style={{ background:`${color}15`, color, border:`1px solid ${color}22` }}>{a.class}</span>
                      </div>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        )}
      </SCard>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   CONTEXT SWITCHING MODULE
══════════════════════════════════════════════════════════════════ */
function ContextModule({ D, behavioralSwitch }) {
  const { contextScore: ctxData, deepBlocks, effectiveDays } = D;
  const score      = ctxData?.score      ?? 0;
  const avgSwitch  = ctxData?.avgSwitches ?? 0;
  const blocks     = normArr(deepBlocks);
  const meta       = scoreMeta(score);

  const switchDist = useMemo(() => {
    const buckets = [
      { label:'0',    range:[0,1],   color:'#34D399', desc:'Perfect' },
      { label:'1–2',  range:[1,3],   color:'#60a5fa', desc:'Good'    },
      { label:'3–5',  range:[3,6],   color:'#f59e0b', desc:'Fair'    },
      { label:'6–10', range:[6,11],  color:'#fb923c', desc:'High'    },
      { label:'10+',  range:[11,999],color:'#f87171', desc:'Severe'  },
    ];
    return buckets.map(b => ({
      ...b,
      count: blocks.filter(bl => {
        const sw = bl.context_switches||bl.switches||0;
        return sw >= b.range[0] && sw < b.range[1];
      }).length,
    }));
  }, [blocks]);

  const fragScore = useMemo(() => {
    if (!blocks.length) return 0;
    const totalSw = blocks.reduce((s,b) => s+(b.context_switches||b.switches||0),0);
    const rawFrag = totalSw / blocks.length;
    return Math.max(0, Math.round(100 - Math.min(rawFrag * 10, 100)));
  }, [blocks]);

  const switchesByDay = useMemo(() => {
    const byDay = {};
    blocks.forEach(b => {
      if (!b.startTs) return;
      const key = new Date(b.startTs*1000).toLocaleDateString('en-US',{month:'short',day:'numeric'});
      byDay[key] = (byDay[key]||0) + (b.context_switches||b.switches||0);
    });
    return Object.entries(byDay).slice(-14).map(([date,switches]) => ({ date, switches }));
  }, [blocks]);

  const costMin  = Math.round(avgSwitch * 23 * effectiveDays);
  const cleanPct = blocks.length ? Math.round(blocks.filter(b=>(b.context_switches||b.switches||0)===0).length/blocks.length*100) : 0;

  return (
    <div className="space-y-4">
      {/* Adaptive baseline: compare session switching vs learned personal baseline */}
      {behavioralSwitch?.observations > 5 && (
        <div className="flex items-center gap-3 rounded-xl border px-4 py-2.5"
          style={{ background: behavioralSwitch.isHighSwitcher ? 'rgba(248,113,113,0.06)' : 'rgba(52,211,153,0.06)', borderColor: behavioralSwitch.isHighSwitcher ? 'rgba(248,113,113,0.22)' : 'rgba(52,211,153,0.18)' }}>
          <Layers size={13} className="shrink-0" style={{ color: behavioralSwitch.isHighSwitcher ? '#F87171' : '#34D399' }} />
          <span className="text-[10px] flex-1" style={{ color:'#6B8099' }}>
            {behavioralSwitch.insight} · Learned baseline: {behavioralSwitch.baseline} switches/10min
          </span>
          <span className="shrink-0 rounded px-2 py-0.5 text-[9px] font-bold"
            style={{ background: behavioralSwitch.isHighSwitcher ? 'rgba(248,113,113,0.12)' : 'rgba(52,211,153,0.12)', color: behavioralSwitch.isHighSwitcher ? '#F87171' : '#34D399' }}>
            {Math.round(behavioralSwitch.fragmentation)}% frag
          </span>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Context Score"   value={score}            color={meta.color} Icon={Layers}        sub={meta.label}/>
        <KpiCard label="Avg Switches"    value={`${avgSwitch}/session`} color="#f59e0b" Icon={Activity}  sub="context switches"/>
        <KpiCard label="Clean Sessions"  value={`${cleanPct}%`}   color="#34D399" Icon={Target}           sub="zero interruptions"/>
        <KpiCard label="Est. Time Lost"  value={`${costMin}m`}    color="#f87171" Icon={AlertTriangle}    sub={`~23m recovery/switch`}/>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Score ring */}
        <SCard>
          <CardHead icon={Layers} color={meta.color} title="Context Score" sub="Focus fragmentation index"/>
          <div className="flex flex-col items-center gap-4 py-2">
            <div className="relative">
              <DonutRing value={score} color={meta.color} size={104} thick={10} glow/>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-extrabold text-white">{score}</span>
                <span className="text-[10px]" style={{ color:meta.color }}>{meta.label}</span>
              </div>
            </div>
            <div className="w-full space-y-2">
              {[
                { l:'Context Score',    v:score,    c:meta.color },
                { l:'Fragmentation',    v:fragScore, c:fragScore>70?'#34D399':'#f59e0b' },
                { l:'Clean Sessions',  v:cleanPct,  c:'#60a5fa'  },
              ].map(s => (
                <div key={s.l} className="flex items-center justify-between text-[11px]">
                  <span className="text-[#6a7a82]">{s.l}</span>
                  <div className="flex items-center gap-2">
                    <div className="h-1 w-24 overflow-hidden rounded-full bg-white/[0.06]">
                      <div className="h-full rounded-full" style={{ width:`${s.v}%`, background:s.c }}/>
                    </div>
                    <span className="w-8 text-right font-bold text-white">{s.v}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </SCard>

        {/* Switch distribution */}
        <SCard>
          <CardHead icon={BarChart2} color="#f59e0b" title="Switches per Session" sub="Distribution across deep work blocks"/>
          {blocks.length > 0 ? (
            <div className="space-y-3 mt-1">
              {switchDist.map(b => {
                const pct = blocks.length > 0 ? (b.count/blocks.length)*100 : 0;
                return (
                  <div key={b.label} className="grid grid-cols-[36px_1fr_48px_52px] items-center gap-2">
                    <span className="text-[12px] font-bold" style={{ color:b.color }}>{b.label}</span>
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                      <div className="h-full rounded-full" style={{ width:`${pct}%`, background:b.color }}/>
                    </div>
                    <span className="text-right text-[11px] text-[#6a7a96]">{b.count}</span>
                    <span className="text-right text-[10px] text-[#4a5568]">{b.desc}</span>
                  </div>
                );
              })}
            </div>
          ) : <EmptyState icon={Layers} msg="No session data" hint="Deep work session data needed to show switching patterns."/>}
        </SCard>
      </div>

      {/* Daily switches trend */}
      {switchesByDay.length > 0 && (
        <SCard>
          <CardHead icon={TrendingUp} color="#60a5fa" title="Daily Context Switches" sub="Interruptions per day · last 14 days"/>
          <ResponsiveContainer width="100%" height={150}>
            <BarChart data={switchesByDay} margin={{ top:4, right:4, left:0, bottom:0 }} barCategoryGap="35%">
              <XAxis dataKey="date" tick={TICK} axisLine={false} tickLine={false} interval="preserveStartEnd"/>
              <YAxis tick={TICK} axisLine={false} tickLine={false} width={28}/>
              <Tooltip {...TT} formatter={v => [v, 'Switches']}/>
              <ReferenceLine y={3} stroke="#f59e0b" strokeDasharray="3 3" strokeOpacity={0.4}/>
              <Bar dataKey="switches" radius={[4,4,0,0]}>
                {switchesByDay.map((e,i) => <Cell key={i} fill={e.switches > 5 ? '#f87171' : e.switches > 2 ? '#f59e0b' : '#34D399'}/>)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </SCard>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <InsightPill icon={Layers} color="#60a5fa">
          Avg {avgSwitch} context switches per session. {avgSwitch <= 1 ? 'Excellent focus discipline.' : avgSwitch <= 3 ? 'Moderate fragmentation — try longer uninterrupted blocks.' : 'High fragmentation is reducing your deep work quality significantly.'}
        </InsightPill>
        <InsightPill icon={AlertTriangle} color="#f59e0b">
          Estimated {costMin} minutes of recovery time lost to context switching at ~23 min per switch (based on UC Irvine research).
        </InsightPill>
        <InsightPill icon={Target} color="#34D399">
          {cleanPct}% of your sessions had zero context switches — these are your highest-quality deep work blocks.
        </InsightPill>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   PATTERNS MODULE
══════════════════════════════════════════════════════════════════ */
function PatternsModule({ D, behavioralBurnout }) {
  const { deepBlocks, dailyArr, summary, effectiveDays } = D;
  const blocks = normArr(deepBlocks);

  /* Peak hours: bucket by hour-of-day */
  const hourBuckets = useMemo(() => {
    const hrs = Array.from({ length:24 }, (_,h) => ({ hour:h, sec:0, count:0 }));
    blocks.forEach(b => {
      if (!b.startTs) return;
      const h = new Date(b.startTs*1000).getHours();
      hrs[h].sec   += b.durationSec || 0;
      hrs[h].count += 1;
    });
    return hrs;
  }, [blocks]);

  const peakHour = useMemo(() => {
    const best = hourBuckets.reduce((m,h) => h.sec > m.sec ? h : m, hourBuckets[0]);
    return best;
  }, [hourBuckets]);

  const workingHrs = hourBuckets.filter(h => h.sec > 0);
  const chartHours = hourBuckets.filter((h,i) => i >= 6 && i <= 22);
  const maxSec     = Math.max(...chartHours.map(h => h.sec), 1);

  /* Break analysis */
  const breakSec   = summary?.breakSeconds || 0;
  const totalSec   = summary?.totalSeconds || (summary?.focusSeconds||0) + (summary?.deepWorkSeconds||0) + (summary?.meetingSeconds||0) + breakSec;
  const breakPct   = totalSec > 0 ? Math.round(breakSec/totalSec*100) : 0;
  const avgBreakH  = effectiveDays > 0 ? breakSec/effectiveDays/3600 : 0;

  /* Work rhythm: days with >1h deep work */
  const rhythmDays = dailyArr.filter(d => (d.deepWork||d.deepWorkSec||0) > 3600).length;
  const rhythmScore= effectiveDays > 0 ? Math.round(rhythmDays/effectiveDays*100) : 0;

  /* Avg session start time */
  const avgStartHr = useMemo(() => {
    if (!blocks.length) return null;
    const starts = blocks.filter(b=>b.startTs).map(b => new Date(b.startTs*1000).getHours() + new Date(b.startTs*1000).getMinutes()/60);
    if (!starts.length) return null;
    const avg = starts.reduce((s,v)=>s+v,0)/starts.length;
    const h   = Math.floor(avg);
    const m   = Math.round((avg-h)*60);
    return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}`;
  }, [blocks]);

  const dailyHoursChart = useMemo(() =>
    dailyArr.slice(-effectiveDays).map(d => {
      const date = d.date ? new Date(isNaN(d.date)?d.date:d.date*1000).toLocaleDateString('en-US',{month:'short',day:'numeric'}) : '—';
      const h    = (d.totalSec||d.focus||0)/3600;
      return { date, hours:Math.round(h*10)/10 };
    }),
  [dailyArr, effectiveDays]);

  const fmt12 = (h) => {
    if (h === null) return '—';
    const [hr,mn] = h.split(':');
    const n  = parseInt(hr);
    const am = n < 12 ? 'AM' : 'PM';
    return `${n%12||12}:${mn}${am}`;
  };

  return (
    <div className="space-y-4">
      {/* Adaptive burnout & sustainability insight */}
      {behavioralBurnout?.observations > 5 && (
        <div className="flex items-start gap-3 rounded-xl border px-4 py-3"
          style={{ background: behavioralBurnout.riskLevel === 'low' ? 'rgba(52,211,153,0.05)' : 'rgba(251,191,36,0.06)', borderColor: behavioralBurnout.riskLevel === 'low' ? 'rgba(52,211,153,0.18)' : 'rgba(251,191,36,0.22)' }}>
          <Flame size={13} className="shrink-0 mt-0.5" style={{ color: behavioralBurnout.riskLevel === 'low' ? '#34D399' : '#FBBF24' }} />
          <div>
            <p className="text-[10px] font-semibold mb-0.5" style={{ color: behavioralBurnout.riskLevel === 'low' ? '#34D399' : '#FBBF24' }}>
              Adaptive Sustainability · {Math.round(behavioralBurnout.sustainableHoursPerWeek)}h/week sustainable · {Math.round(behavioralBurnout.currentWeekHours * 10) / 10}h this week
            </p>
            <p className="text-[10px] leading-relaxed" style={{ color:'#6B8099' }}>
              {behavioralBurnout.insights?.[0]}
            </p>
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Peak Hour"       value={fmt12(peakHour.hour+':00')} sub={`${Math.round(peakHour.sec/3600*10)/10}h avg deep work`} color="#7c6cf2" Icon={Flame}  />
        <KpiCard label="Avg Start Time"  value={fmt12(avgStartHr)}          sub="first deep work block"                                   color="#60a5fa" Icon={Clock}  />
        <KpiCard label="Rhythm Score"    value={`${rhythmScore}%`}          sub={`${rhythmDays}/${effectiveDays} days with deep work`}    color="#34D399" Icon={Activity}/>
        <KpiCard label="Avg Break/Day"   value={`${avgBreakH.toFixed(1)}h`} sub={`${breakPct}% of total time`}                           color="#f59e0b" Icon={Coffee} />
      </div>

      {/* Peak hours heatmap */}
      <SCard>
        <CardHead icon={Flame} color="#7c6cf2" title="Peak Productivity Hours" sub="Deep work intensity by hour of day (6AM – 10PM)"/>
        {blocks.length > 0 ? (
          <div>
            <div className="mb-3 flex items-end gap-1">
              {chartHours.map((h) => {
                const pct = h.sec / maxSec;
                const col = pct > 0.7 ? '#7c6cf2' : pct > 0.4 ? '#60a5fa' : pct > 0.1 ? '#374986' : '#1a2035';
                return (
                  <div key={h.hour} className="group relative flex flex-1 flex-col items-center gap-1" title={`${h.hour}:00 — ${Math.round(h.sec/60)}m`}>
                    <div className="w-full rounded-sm transition-all duration-300"
                      style={{ height:`${Math.max(pct * 72, 2)}px`, background:col, minHeight:2 }}/>
                    {h.hour % 3 === 0 && (
                      <span className="text-[9px] text-[#3a4a60]">{h.hour === 0 ? '12A' : h.hour < 12 ? `${h.hour}A` : h.hour === 12 ? '12P' : `${h.hour-12}P`}</span>
                    )}
                    <div className="pointer-events-none absolute bottom-full mb-1 hidden whitespace-nowrap rounded-md border border-white/[0.08] bg-[rgba(12,16,26,0.97)] px-2 py-1 text-[10px] font-semibold text-white shadow-xl group-hover:block z-10">
                      {h.hour}:00 · {Math.round(h.sec/60)}m · {h.count} sessions
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-between text-[10px] text-[#3a4a60]">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-sm" style={{ background:'#1a2035' }}/> Low
                <span className="inline-block h-2 w-2 rounded-sm ml-1" style={{ background:'#374986' }}/> Moderate
                <span className="inline-block h-2 w-2 rounded-sm ml-1" style={{ background:'#60a5fa' }}/> High
                <span className="inline-block h-2 w-2 rounded-sm ml-1" style={{ background:'#7c6cf2' }}/> Peak
              </span>
              <span>Peak window: <span className="text-[#7c6cf2] font-bold">{fmt12(peakHour.hour+':00')}</span></span>
            </div>
          </div>
        ) : <EmptyState icon={Flame} msg="No session data for peak analysis" hint="Start tracking deep work sessions to discover your productive hours."/>}
      </SCard>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Work rhythm */}
        <SCard>
          <CardHead icon={Activity} color="#34D399" title="Daily Work Hours" sub={`Last ${effectiveDays} days · orange line = 8h`}/>
          {dailyHoursChart.length > 0 ? (
            <ResponsiveContainer width="100%" height={150}>
              <ComposedChart data={dailyHoursChart} margin={{ top:4, right:4, left:0, bottom:0 }}>
                <defs>
                  <linearGradient id="rg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#34D399" stopOpacity="0.25"/>
                    <stop offset="100%" stopColor="#34D399" stopOpacity="0"/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={TICK} axisLine={false} tickLine={false} interval="preserveStartEnd"/>
                <YAxis tick={TICK} axisLine={false} tickLine={false} width={28} tickFormatter={v=>`${v}h`}/>
                <Tooltip {...TT} formatter={v => [`${v}h`, 'Hours']}/>
                <ReferenceLine y={8} stroke="#f59e0b" strokeDasharray="3 3" strokeOpacity={0.5}/>
                <Area type="monotone" dataKey="hours" stroke="#34D399" strokeWidth={2} fill="url(#rg)"/>
              </ComposedChart>
            </ResponsiveContainer>
          ) : <EmptyState icon={Activity} msg="No daily data" hint="Track sessions to see your work rhythm."/>}
        </SCard>

        {/* Break analysis */}
        <SCard>
          <CardHead icon={Coffee} color="#f59e0b" title="Break & Recovery" sub="Sustainable work monitoring"/>
          <div className="space-y-4">
            <div className="flex items-center gap-5">
              <div className="relative shrink-0">
                <DonutRing value={breakPct} color="#f59e0b" size={80} thick={8}/>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-[16px] font-extrabold text-white">{breakPct}%</span>
                </div>
              </div>
              <div className="space-y-2">
                <div>
                  <p className="text-[12px] text-[#6a7a96]">Total break time</p>
                  <p className="text-[16px] font-extrabold text-white">{fmtH(breakSec)}</p>
                </div>
                <div>
                  <p className="text-[12px] text-[#6a7a96]">Avg per day</p>
                  <p className="text-[14px] font-bold text-white">{avgBreakH.toFixed(1)}h</p>
                </div>
              </div>
            </div>
            {breakPct < 10
              ? <InsightPill icon={AlertTriangle} color="#f87171">Break time is very low ({breakPct}%). Regular breaks improve sustained focus and prevent cognitive fatigue.</InsightPill>
              : breakPct > 40
              ? <InsightPill icon={AlertTriangle} color="#f59e0b">Break time is high ({breakPct}%). Consider structuring breaks intentionally using techniques like Pomodoro.</InsightPill>
              : <InsightPill icon={Sparkles} color="#34D399">Break balance looks healthy at {breakPct}% of total work time. Recovery supports sustained deep work.</InsightPill>}
          </div>
        </SCard>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <InsightPill icon={Flame} color="#7c6cf2">
          Your most productive hour is <strong className="text-white">{fmt12(peakHour.hour+':00')}</strong> based on deep work session starts. Schedule demanding work in this window.
        </InsightPill>
        <InsightPill icon={Activity} color="#34D399">
          {rhythmScore}% daily work rhythm consistency. {rhythmScore >= 70 ? 'Strong habit — you\'re consistently doing deep work.' : 'Building a more consistent daily deep work habit will compound your output over time.'}
        </InsightPill>
        <InsightPill icon={Clock} color="#60a5fa">
          {avgStartHr ? `Average first deep work block starts at ${fmt12(avgStartHr)}. ${parseInt(avgStartHr) < 10 ? 'Early start — excellent for capturing peak cognitive hours.' : 'Consider starting focus work earlier to extend your productive window.'}` : 'Start logging deep work sessions to detect your natural work rhythm.'}
        </InsightPill>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   ROOT PAGE
══════════════════════════════════════════════════════════════════ */
export default function ProductivityPage({ user }) {
  const [mod,        setMod]       = useState('overview');
  const [range,      setRange]     = useState(14);
  const [loading,    setLoading]   = useState(true);
  const [exportOpen, setExportOpen]= useState(false);

  // Adaptive behavioral analytics — read once on mount (localStorage, synchronous)
  const behavioralFocus   = useMemo(() => { try { return getFocusAnalytics(); } catch { return null; } }, []);
  const behavioralBurnout = useMemo(() => { try { return getBurnoutAnalytics(); } catch { return null; } }, []);
  const behavioralSwitch  = useMemo(() => { try { return getContextSwitchAnalytics(); } catch { return null; } }, []);
  const [raw, setRaw] = useState({
    summary:null, dailyRaw:null, contextScore:null,
    deepBlocks:[], distRatio:null, weekComp:null,
    topApps:[], workIntensity:null,
  });

  const { fromTs, toTs } = useMemo(() => {
    const now = Math.floor(Date.now() / 1000);
    return { fromTs: now - range * 86400, toTs: now };
  }, [range]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = { userId:user.id, from:fromTs, to:toTs };
      const [summary, dailyRaw, contextScore, deepBlocks, distRatio, weekComp, topApps, workIntensity] = await Promise.all([
        callApi('statsSummary',    null, p),
        callApi('statsDaily',      null, { userId:user.id, days:range }),
        callApi('contextScore',    null, p),
        callApi('deepWorkBlocks',  null, p),
        callApi('distractionRatio',null, p),
        callApi('weekComparison',  null, { userId:user.id }),
        callApi('topApps',         null, { ...p, limit: 20 }),
        callApi('workIntensity',   null, p),
      ]);
      setRaw({ summary, dailyRaw, contextScore, deepBlocks, distRatio, weekComp, topApps, workIntensity });
    } catch (err) {
      console.error('[Productivity] load failed:', err);
    } finally {
      setLoading(false);
    }
  }, [user.id, fromTs, toTs, range]);

  useEffect(() => { load(); }, [load]);

  const dailyArr = useMemo(() => normDaily(raw.dailyRaw), [raw.dailyRaw]);

  const D = useMemo(() => ({
    ...raw,
    dailyArr,
    // Normalize deepBlocks: backend returns started_at / duration_seconds / context_switches
    deepBlocks: normArr(raw.deepBlocks).map(b => ({
      ...b,
      startTs     : b.started_at      || b.startTs      || 0,
      durationSec : b.duration_seconds || b.durationSec  || 0,
      switches    : b.context_switches || b.switches     || 0,
    })),
    // Normalize topApps: backend returns app_name / total (not name / seconds),
    // plus the authoritative ai_category set on the Activity → Apps page.
    topApps: normArr(raw.topApps).map(a => ({
      ...a,
      name    : cleanAppName(a.app_name || a.name || a.app || ''),
      seconds : a.total || a.seconds || a.totalSec || 0,
      category: a.ai_category || a.category || '',
    })),
    effectiveDays: range,
  }), [raw, dailyArr, range]);

  return (
    <div className="fl-product-page flex h-full flex-col overflow-hidden">
      {/* ── Header ── */}
      <div className="fl-product-page-header shrink-0 border-b border-white/[0.055] px-6 py-4"
        style={{ background:'linear-gradient(180deg,rgba(14,18,28,0.99),rgba(10,13,21,0.99))' }}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <div className="flex h-5 w-5 items-center justify-center rounded-md" style={{ background:'rgba(124,108,242,0.18)' }}>
                <Brain size={11} className="text-accent"/>
              </div>
              <p className="text-[11px] font-bold uppercase tracking-[0.09em] text-accent/70">Productivity Intelligence</p>
            </div>
            <h1 className="text-[22px] font-extrabold leading-tight tracking-tight text-white">Focus & Deep Work</h1>
            <p className="mt-0.5 text-[12px] text-[#5a6a82]">Work quality, patterns, and sustainable performance intelligence</p>
          </div>
          <div className="flex items-center gap-2.5 mt-1">
            <RangePicker range={range} onChange={setRange}/>
            <button
              onClick={() => setExportOpen(true)}
              className="fl-product-filterbar flex items-center gap-2 rounded-[12px] border border-white/[0.08] px-3.5 py-2 text-[12px] font-semibold text-tx-secondary transition-all duration-200 hover:border-accent/40 hover:bg-accent/[0.07] hover:text-accent"
              style={{ background: 'rgba(255,255,255,0.03)' }}
            >
              <Download size={13}/> Export
            </button>
            {loading && (
              <div className="flex h-7 w-7 items-center justify-center">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/[0.08] border-t-accent"/>
              </div>
            )}
          </div>
        </div>
        <div className="mt-4 overflow-x-auto" style={{ scrollbarWidth:'none' }}>
          <ModuleTabs active={mod} onChange={setMod}/>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5"
        style={{ scrollbarWidth:'thin', scrollbarColor:'rgba(255,255,255,0.08) transparent' }}>
        {mod === 'overview'  && <OverviewModule  D={D} behavioralFocus={behavioralFocus} behavioralBurnout={behavioralBurnout}/>}
        {mod === 'deepwork'  && <DeepWorkModule  D={D} behavioralFocus={behavioralFocus}/>}
        {mod === 'focus'     && <FocusModule     D={D} behavioralFocus={behavioralFocus}/>}
        {mod === 'context'   && <ContextModule   D={D} behavioralSwitch={behavioralSwitch}/>}
        {mod === 'patterns'  && <PatternsModule  D={D} behavioralBurnout={behavioralBurnout}/>}
      </div>

      {/* ── Export modal ── */}
      <ExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        reportTitle="Focus & Deep Work Analytics"
        currentSectionLabel={`${MODULES.find(m => m.id === mod)?.label || 'Current'} · Last ${range} days`}
        allSectionsLabel={`All ${MODULES.length} modules: ${MODULES.map(m => m.label).join(', ')}`}
        onExport={async (format, scope) => {
          const { summary, dailyArr, deepBlocks, topApps, distRatio, effectiveDays } = D;
          const totalSecs = summary?.totalSeconds || 0;
          const deepSecs  = summary?.deepWorkSeconds || 0;
          const modIds    = scope === 'current' ? [mod] : MODULES.map(m => m.id);

          const sections = modIds.map(id => {
            const label = MODULES.find(m => m.id === id)?.label || id;

            if (id === 'overview') {
              return {
                title: 'Productivity Overview',
                subtitle: `Last ${range} days — focus quality and deep work summary`,
                kpis: [
                  { label: 'Total Tracked',   value: fmtH(totalSecs) },
                  { label: 'Deep Work',        value: fmtH(deepSecs) },
                  { label: 'Deep Work %',      value: fmtPct(deepSecs, totalSecs) },
                  { label: 'Sessions',         value: String(summary?.sessionCount || 0) },
                  { label: 'Focus Score',      value: String(D.contextScore?.overallScore ?? '—') },
                ],
                headers: ['Date', 'Total (h)', 'Deep Work (h)', 'Focus (h)', 'Sessions'],
                rows: dailyArr.map(d => [
                  d.date || '—',
                  fmtH(d.total || 0),
                  fmtH(d.deepWork || 0),
                  fmtH(d.focus || 0),
                  d.sessions || 0,
                ]),
                summary: [
                  ['Total Tracked',   fmtH(totalSecs)],
                  ['Deep Work',        fmtH(deepSecs)],
                  ['Deep Work %',      fmtPct(deepSecs, totalSecs)],
                  ['Total Sessions',   String(summary?.sessionCount || 0)],
                  ['Avg per Day',      `${(totalSecs / 3600 / Math.max(range, 1)).toFixed(1)}h`],
                ],
              };
            }

            if (id === 'deepwork') {
              const blocks = deepBlocks || [];
              const avgDur = blocks.length
                ? Math.round(blocks.reduce((s, b) => s + (b.durationSec || 0), 0) / blocks.length / 60) : 0;
              return {
                title: 'Deep Work Blocks',
                subtitle: `${blocks.length} deep work sessions in ${range}-day period`,
                kpis: [
                  { label: 'Total Deep Work', value: fmtH(deepSecs) },
                  { label: 'Deep Blocks',      value: String(blocks.length) },
                  { label: 'Avg Block',         value: `${avgDur}m` },
                  { label: 'Longest Block',     value: blocks.length ? fmtDuration(Math.max(...blocks.map(b => b.durationSec || 0))) : '—' },
                ],
                headers: ['Date', 'Start Time', 'Duration', 'Category', 'Context Switches', 'Quality'],
                rows: blocks.slice(0, 200).map(b => {
                  const dt  = new Date((b.startTs || 0) * 1000);
                  const min = Math.round((b.durationSec || 0) / 60);
                  return [
                    dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
                    dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
                    fmtDuration(b.durationSec || 0),
                    b.category || '—',
                    b.switches || 0,
                    min >= 90 ? 'Elite (90m+)' : min >= 60 ? 'Deep (60m+)' : min >= 25 ? 'Good (25m+)' : 'Short',
                  ];
                }),
                summary: [
                  ['Total Deep Work', fmtH(deepSecs)],
                  ['Total Blocks',    String(blocks.length)],
                  ['Avg Block',        `${avgDur} minutes`],
                  ['Blocks per Day',  (blocks.length / Math.max(range, 1)).toFixed(1)],
                ],
              };
            }

            if (id === 'focus') {
              const apps = topApps || [];
              const appTotal = apps.reduce((s, a) => s + (a.seconds || 0), 0);
              return {
                title: 'Focus & App Usage',
                subtitle: `Attention quality and top applications`,
                kpis: [
                  { label: 'Focus %',         value: `${distRatio?.focusPct ?? 0}%` },
                  { label: 'Distraction %',   value: `${distRatio?.distractedPct ?? 0}%` },
                  { label: 'Top App',          value: apps[0]?.name || '—' },
                  { label: 'Apps Tracked',     value: String(apps.length) },
                ],
                headers: ['Rank', 'Application', 'Time Used', 'Hours', '% of Total'],
                rows: apps.slice(0, 30).map((a, i) => [
                  i + 1, a.name, fmtDuration(a.seconds),
                  (a.seconds / 3600).toFixed(1) + 'h',
                  appTotal ? `${Math.round(a.seconds / appTotal * 100)}%` : '0%',
                ]),
                summary: [
                  ['Focus %',       `${distRatio?.focusPct ?? 0}%`],
                  ['Distraction %', `${distRatio?.distractedPct ?? 0}%`],
                  ['Apps Tracked',  String(apps.length)],
                  ['Total App Time',fmtH(appTotal)],
                ],
              };
            }

            // Generic fallback for context + patterns
            return {
              title: label,
              subtitle: `${label} analysis · Last ${range} days`,
              kpis: [
                { label: 'Total Tracked', value: fmtH(totalSecs) },
                { label: 'Deep Work',     value: fmtH(deepSecs) },
              ],
              summary: [
                ['Module',  label],
                ['Period',  `Last ${range} days`],
                ['Note',    'Full chart data available in the app'],
              ],
            };
          }).filter(Boolean);

          const meta = {
            dateRange:  `Last ${range} days`,
            period:     `${range}-day analysis`,
            reportType: 'Productivity Intelligence',
          };
          const title    = 'Flow Ledger — Focus & Deep Work Analytics';
          const filename = `flow-ledger-productivity-${mod}-${range}d-${new Date().toISOString().split('T')[0]}.csv`;
          if (format === 'csv') exportAsCSV(title, meta, sections, filename);
          else await exportAsPDF(title, meta, sections);
        }}
      />
    </div>
  );
}
