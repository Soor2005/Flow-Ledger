import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  DollarSign, Clock, TrendingUp, Zap, Brain, AlertTriangle,
  Briefcase, Users, Target, ArrowUpRight, ArrowDownRight, Layers,
  BarChart2, Activity, Shield, Download,
} from 'lucide-react';
import ExportModal from '../shared/ExportModal';
import { exportAsCSV, exportAsPDF, fmtDuration, fmtPct } from '../../utils/exportUtils';
import {
  Area, BarChart, Bar, ComposedChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, ReferenceLine,
} from 'recharts';
import { getBurnoutAnalytics, getFocusAnalytics } from '../../ai/adaptive/analyticsIntelligenceEngine.js';

const api = window.electron || {};
const callApi = (name, fallback, payload) => {
  const fn = api[name];
  return typeof fn === 'function' ? fn(payload) : Promise.resolve(fallback);
};

const RANGES = [
  { label: '7D',  days: 7   },
  { label: '30D', days: 30  },
  { label: '90D', days: 90  },
  { label: '1Y',  days: 365 },
];

const PALETTE = ['#7c6cf2','#60a5fa','#34D399','#f59e0b','#f472b6','#a78bfa','#38bdf8','#4ade80'];

const TICK  = { fill: '#7a8ba8', fontSize: 11, fontWeight: 500 };
const GRID  = 'rgba(255,255,255,0.045)';
const TT    = {
  contentStyle : { background:'rgba(11,14,22,0.98)', border:'1px solid rgba(255,255,255,0.10)', borderRadius:12, fontSize:12, color:'#eef2f8', boxShadow:'0 20px 48px rgba(0,0,0,0.60), 0 0 0 1px rgba(255,255,255,0.04)', padding:'10px 14px' },
  labelStyle   : { color:'#eef2f8', fontWeight:700, marginBottom:5, fontSize:12 },
  itemStyle    : { color:'#c8d4e4', fontWeight:600, fontSize:11 },
  cursor       : { fill:'rgba(124,108,242,0.06)', stroke:'rgba(124,108,242,0.18)', strokeWidth:1 },
  wrapperStyle : { outline:'none' },
};

const MODULES = [
  { id:'overview',      label:'Overview',       icon: BarChart2   },
  { id:'projects',      label:'Projects',        icon: Briefcase   },
  { id:'clients',       label:'Clients',         icon: Users       },
  { id:'focus-roi',     label:'Focus ROI',       icon: Brain       },
  { id:'sustainability',label:'Sustainability',  icon: Shield      },
];

/* ─── tiny helpers ──────────────────────────────────────────────── */
function fmtH(s)   { const h = (s||0)/3600; return h >= 10 ? `${h.toFixed(0)}h` : `${h.toFixed(1)}h`; }
function fmtM(s)   { const m = Math.round((s||0)/60); return m >= 60 ? `${(m/60).toFixed(1)}h` : `${m}m`; }
function fmtMoney(v, decimals=0) {
  if (v >= 1000) return `$${(v/1000).toFixed(1)}k`;
  return `$${(v||0).toFixed(decimals)}`;
}

/* ─── DonutRing ─────────────────────────────────────────────────── */
function DonutRing({ value, max=100, color, size=96, thick=9, glow=false }) {
  const r    = (size - thick) / 2;
  const circ = 2 * Math.PI * r;
  const fill = Math.min(Math.max(value,0)/max,1) * circ;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform:'rotate(-90deg)' }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={thick}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={thick}
        strokeDasharray={`${fill} ${circ}`} strokeLinecap="round"
        style={{ filter: glow ? `drop-shadow(0 0 7px ${color}77)` : 'none', transition:'stroke-dasharray 0.9s ease' }}/>
    </svg>
  );
}

/* ─── Sparkline ─────────────────────────────────────────────────── */
function Sparkline({ data = [], color = '#7c6cf2', height = 32, width = 80 }) {
  if (!data.length) return <div style={{ width, height }} />;
  const vals = data.map(Number).filter(isFinite);
  const mn = Math.min(...vals), mx = Math.max(...vals);
  const range = mx - mn || 1;
  const pts = vals.map((v, i) => [
    (i / Math.max(vals.length - 1, 1)) * width,
    height - ((v - mn) / range) * (height - 4) - 2,
  ]);
  const poly  = pts.map(p => p.join(',')).join(' ');
  const area  = `M${pts[0][0]},${pts[0][1]} ${pts.slice(1).map(p=>`L${p[0]},${p[1]}`).join(' ')} L${pts[pts.length-1][0]},${height} L${pts[0][0]},${height} Z`;
  const id = `sg-${color.replace('#','')}`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`}/>
      <polyline points={poly} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

/* ─── KpiCard ───────────────────────────────────────────────────── */
function KpiCard({ label, value, sub, color='#7c6cf2', Icon, trend, sparkData }) {
  const [hov, setHov] = useState(false);
  const up = trend >= 0;
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      className="fl-profit-kpi fl-kpi-card relative overflow-hidden rounded-2xl border p-4"
      style={{
        background: hov
          ? `linear-gradient(150deg,${color}16 0%,${color}0b 55%,rgba(14,17,26,0.99) 100%)`
          : 'linear-gradient(150deg,rgba(22,26,38,0.97),rgba(14,17,26,0.99))',
        borderColor: hov ? `${color}55` : 'rgba(255,255,255,0.07)',
        boxShadow: hov
          ? `0 0 0 1px ${color}28, 0 22px 52px rgba(0,0,0,0.30), 0 8px 24px ${color}28, inset 0 1px 0 rgba(255,255,255,0.10)`
          : '0 10px 30px rgba(0,0,0,0.22),inset 0 1px 0 rgba(255,255,255,0.04)',
        transform: hov ? 'translateY(-3px) scale(1.018)' : 'translateY(0) scale(1)',
        transition: 'all 0.22s cubic-bezier(0.4,0,0.2,1)',
      }}
    >
      {/* Top accent line — brightens on hover */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{
          background:`linear-gradient(90deg,transparent 10%,${color}${hov?'cc':'77'} 45%,${color}${hov?'ff':'cc'} 50%,${color}${hov?'cc':'77'} 55%,transparent 90%)`,
          transition:'background 0.22s ease',
        }}/>
      {/* Ambient glow orb — always visible, expands on hover */}
      <div className="pointer-events-none absolute right-0 top-0 rounded-full"
        style={{
          width: hov ? 120 : 96,
          height: hov ? 120 : 96,
          background:`radial-gradient(circle,${color}${hov?'2a':'14'} 0%,transparent 70%)`,
          transform:'translate(30%,-30%)',
          transition:'all 0.30s ease',
        }}/>
      {/* Bottom-left accent shimmer on hover */}
      {hov && (
        <div className="pointer-events-none absolute bottom-0 left-0 h-16 w-16 rounded-full"
          style={{ background:`radial-gradient(circle,${color}12 0%,transparent 70%)`, transform:'translate(-30%,30%)' }}/>
      )}
      <div className="mb-3 flex items-start justify-between">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl"
          style={{
            background: hov ? `${color}30` : `${color}18`,
            border:`1px solid ${hov ? color+'66' : color+'30'}`,
            transition:'all 0.22s ease',
          }}>
          <Icon size={14} style={{ color, filter: hov ? `drop-shadow(0 0 5px ${color}88)` : 'none', transition:'filter 0.22s ease' }}/>
        </div>
        {trend !== undefined && (
          <span className={`flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold ${
            up ? 'bg-emerald-500/12 text-emerald-400' : 'bg-red-500/12 text-red-400'
          }`}>
            {up ? <ArrowUpRight size={9}/> : <ArrowDownRight size={9}/>}{Math.abs(trend)}%
          </span>
        )}
      </div>
      <p style={{ color: hov ? 'rgba(200,210,230,0.95)' : '#7a8ba8', transition:'color 0.20s ease' }}
        className="fl-kpi-label text-[11px] font-semibold uppercase tracking-[0.08em]">{label}</p>
      <p className="fl-kpi-value mt-1 text-2xl font-extrabold leading-tight text-white" style={{ textShadow: hov ? `0 0 20px ${color}55` : 'none', transition:'text-shadow 0.22s ease' }}>{value}</p>
      <div className="mt-2 flex items-end justify-between">
        {sub && <p style={{ color: hov ? 'rgba(180,190,210,0.85)' : '#6b7a96', transition:'color 0.20s ease' }} className="fl-kpi-sub text-[11px]">{sub}</p>}
        {sparkData && <Sparkline data={sparkData} color={color} height={28} width={72}/>}
      </div>
    </div>
  );
}

/* ─── SectionCard ───────────────────────────────────────────────── */
function SectionCard({ children, className = '', noPad = false }) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      className={`fl-profit-card fl-section-card relative overflow-hidden rounded-2xl border ${noPad ? '' : 'p-5'} ${className}`}
      style={{
        background: 'linear-gradient(160deg,rgba(20,24,36,0.98),rgba(13,16,24,0.99))',
        borderColor: hov ? 'rgba(255,255,255,0.13)' : 'rgba(255,255,255,0.07)',
        boxShadow: hov
          ? '0 0 0 1px rgba(255,255,255,0.06), 0 20px 50px rgba(0,0,0,0.28), 0 8px 20px var(--color-accent-a10), inset 0 1px 0 rgba(255,255,255,0.06)'
          : '0 12px 32px rgba(0,0,0,0.2),inset 0 1px 0 rgba(255,255,255,0.035)',
        transform: hov ? 'translateY(-1px)' : 'translateY(0)',
        transition: 'all 0.22s cubic-bezier(0.4,0,0.2,1)',
      }}
    >
      {/* Top shimmer line */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{
          background: hov
            ? 'linear-gradient(90deg,transparent,var(--color-accent-a35) 35%,var(--color-accent-a60) 50%,var(--color-accent-a35) 65%,transparent)'
            : 'linear-gradient(90deg,transparent,rgba(255,255,255,0.07) 50%,transparent)',
          opacity: hov ? 1 : 0.4,
          transition: 'all 0.25s ease',
        }}/>
      {/* Corner glow — expands on hover */}
      <div className="pointer-events-none absolute right-0 top-0 rounded-full"
        style={{
          width: hov ? 160 : 112,
          height: hov ? 160 : 112,
          background: hov
            ? 'radial-gradient(circle, var(--color-accent-a14) 0%, transparent 68%)'
            : 'radial-gradient(circle, var(--color-accent-a08) 0%, transparent 70%)',
          transform: 'translate(28%,-34%)',
          transition: 'all 0.30s ease',
        }}/>
      {children}
    </div>
  );
}

/* ─── CardHeader ────────────────────────────────────────────────── */
function CardHeader({ icon: Icon, color, title, sub, right }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="flex items-center gap-2.5">
        <div className="fl-profit-icon-wrap flex h-7 w-7 items-center justify-center rounded-lg"
          style={{ background:`${color}18`, border:`1px solid ${color}28` }}>
          <Icon size={13} style={{ color }}/>
        </div>
        <div>
          <p className="fl-profit-title text-[13px] font-bold text-white">{title}</p>
          {sub && <p className="fl-profit-support text-[11px] text-[#6b7a96]">{sub}</p>}
        </div>
      </div>
      {right}
    </div>
  );
}

/* ─── ModuleTabs ────────────────────────────────────────────────── */
function ModuleTabs({ active, onChange }) {
  return (
    <div className="fl-profit-tabs flex items-center gap-0.5 rounded-xl border border-white/[0.06] bg-white/[0.025] p-1">
      {MODULES.map(({ id, label, icon: Icon }) => {
        const isActive = active === id;
        return (
          <button key={id} onClick={() => onChange(id)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold${isActive ? ' fl-tab-active' : ''}`}
            style={{
              background: isActive ? 'linear-gradient(135deg,var(--color-accent-a22),var(--color-accent-a14))' : 'transparent',
              color: isActive ? '#ffffff' : '#8090b0',
              border: isActive ? '1px solid var(--color-accent-a35)' : '1px solid transparent',
              boxShadow: isActive ? '0 2px 12px var(--color-accent-a20), inset 0 1px 0 rgba(255,255,255,0.10)' : 'none',
              transition: 'all 0.18s cubic-bezier(0.4,0,0.2,1)',
            }}
            onMouseEnter={e => { if (!isActive) { e.currentTarget.style.color='#c8d4e8'; e.currentTarget.style.background='rgba(255,255,255,0.05)'; } }}
            onMouseLeave={e => { if (!isActive) { e.currentTarget.style.color='#8090b0'; e.currentTarget.style.background='transparent'; } }}
          >
            <Icon size={12} style={{ color: isActive ? 'var(--color-accent-light)' : 'currentColor', transition:'color 0.18s ease' }}/>
            {label}
          </button>
        );
      })}
    </div>
  );
}

/* ─── RangePicker ───────────────────────────────────────────────── */
function RangePicker({ range, onChange }) {
  return (
    <div className="fl-profit-ranges flex items-center gap-0.5 rounded-lg border border-white/[0.06] bg-white/[0.02] p-0.5">
      {RANGES.map(r => {
        const isActive = range === r.days;
        return (
          <button key={r.days} onClick={() => onChange(r.days)}
            className={`rounded-md px-2.5 py-1 text-[11px] font-bold${isActive ? ' fl-range-active' : ''}`}
            style={{
              background: isActive ? 'linear-gradient(135deg,var(--color-accent-a20),var(--color-accent-a12))' : 'transparent',
              color: isActive ? '#ffffff' : '#6b7a96',
              border: isActive ? '1px solid var(--color-accent-a30)' : '1px solid transparent',
              boxShadow: isActive ? '0 1px 8px var(--color-accent-a18)' : 'none',
              transition: 'all 0.18s ease',
            }}
            onMouseEnter={e => { if (!isActive) { e.currentTarget.style.color='#c8d4e4'; e.currentTarget.style.background='rgba(255,255,255,0.06)'; } }}
            onMouseLeave={e => { if (!isActive) { e.currentTarget.style.color='#6b7a96'; e.currentTarget.style.background='transparent'; } }}
          >
            {r.label}
          </button>
        );
      })}
    </div>
  );
}

/* ─── EmptyState ────────────────────────────────────────────────── */
function EmptyState({ icon: Icon, msg, hint }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-xl bg-white/[0.04]">
        <Icon size={22} className="text-[#4a5568]"/>
      </div>
      <p className="text-[13px] font-semibold text-[#4a5568]">{msg}</p>
      {hint && <p className="max-w-xs text-[11px] text-[#374151]">{hint}</p>}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   OVERVIEW MODULE
══════════════════════════════════════════════════════════════════ */
function OverviewModule({ data, range }) {
  const { profSummary, billSummary, dailyStats } = data;

  const totalRevenue  = profSummary?.totalRevenue  || 0;
  const billH         = (billSummary?.billableHours    || 0);
  const nonBillH      = (billSummary?.nonBillableHours || 0);
  const totalH        = (billSummary?.totalHours       || 0);
  const utilization   = billSummary?.utilization || 0;
  const avgRate       = billSummary?.avgRate     || 0;
  const revenuePerH   = billH > 0 ? totalRevenue / billH : 0;

  const revenueTimeline = useMemo(() => {
    const arr = Array.isArray(dailyStats) ? dailyStats : [];
    if (!arr.length) return [];
    return arr.slice(-range).map(d => ({
      date    : new Date(d.date * 1000).toLocaleDateString('en-US', { month:'short', day:'numeric' }),
      revenue : Math.round((d.revenue || 0) * 100) / 100,
      hours   : Math.round((d.totalSec || 0) / 360) / 10,
    }));
  }, [dailyStats, range]);

  const billablePie = [
    { name:'Billable',     value: Math.round(billH  *10)/10, color:'#34D399' },
    { name:'Non-Billable', value: Math.round(nonBillH*10)/10, color:'#374151' },
  ].filter(d => d.value > 0);

  const sparkRevenue = revenueTimeline.map(d => d.revenue);

  return (
    <div className="space-y-4">
      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Total Revenue"    value={fmtMoney(totalRevenue)}     sub={`${range}d period`}           color="#34D399" Icon={DollarSign}  trend={18}  sparkData={sparkRevenue}/>
        <KpiCard label="Billable Hours"   value={`${billH.toFixed(1)}h`}     sub={`of ${totalH.toFixed(1)}h`}   color="#7c6cf2" Icon={Clock}       trend={12}  />
        <KpiCard label="Utilization"      value={`${utilization}%`}          sub="billable share"               color="#60a5fa" Icon={Target}      trend={utilization >= 60 ? 6 : -4} />
        <KpiCard label="Avg Rate / Hr"    value={`$${avgRate.toFixed(0)}`}   sub="revenue per hour"             color="#f59e0b" Icon={TrendingUp}  trend={10}  />
      </div>

      {/* Revenue timeline */}
      <SectionCard>
        <CardHeader icon={TrendingUp} color="#34D399" title="Revenue Timeline" sub={`Daily revenue · last ${range} days`}/>
        {revenueTimeline.length > 0 ? (
          <ResponsiveContainer width="100%" height={180}>
            <ComposedChart data={revenueTimeline} margin={{ top:4, right:8, left:0, bottom:0 }}>
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#34D399" stopOpacity="0.28"/>
                  <stop offset="100%" stopColor="#34D399" stopOpacity="0"/>
                </linearGradient>
              </defs>
              <XAxis dataKey="date" tick={TICK} axisLine={false} tickLine={false} interval="preserveStartEnd"/>
              <YAxis yAxisId="r" tick={TICK} axisLine={false} tickLine={false} width={46} tickFormatter={v=>`$${v}`}/>
              <YAxis yAxisId="h" orientation="right" tick={TICK} axisLine={false} tickLine={false} width={32} tickFormatter={v=>`${v}h`}/>
              <Tooltip {...TT} formatter={(v,n) => [n==='revenue' ? `$${v}` : `${v}h`, n==='revenue' ? 'Revenue' : 'Hours']}/>
              <Area yAxisId="r" type="monotone" dataKey="revenue" stroke="#34D399" strokeWidth={2} fill="url(#revGrad)"/>
              <Line yAxisId="h" type="monotone" dataKey="hours"   stroke="#60a5fa" strokeWidth={1.5} dot={false}/>
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState icon={TrendingUp} msg="No revenue data" hint="Assign hourly rates to projects and track sessions to see revenue."/>
        )}
      </SectionCard>

      {/* Billable split + ROI */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard>
          <CardHeader icon={Clock} color="#7c6cf2" title="Billable vs Non-Billable" sub="Time allocation breakdown"/>
          <div className="flex items-center gap-6">
            <div className="relative shrink-0">
              <DonutRing value={utilization} color="#34D399" size={100} thick={10} glow/>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-extrabold text-white">{utilization}%</span>
                <span className="text-[10px] text-[#6b7a96]">billable</span>
              </div>
            </div>
            <div className="flex-1 space-y-3">
              {billablePie.map(item => {
                const pct = totalH > 0 ? Math.round((item.value / totalH) * 100) : 0;
                return (
                  <div key={item.name}>
                    <div className="mb-1 flex justify-between text-[12px]">
                      <span className="flex items-center gap-1.5 font-medium text-tx-secondary">
                        <span className="h-2 w-2 rounded-full" style={{ background:item.color }}/>
                        {item.name}
                      </span>
                      <span className="font-bold text-white">{item.value}h <span className="font-normal text-[#6b7a96]">({pct}%)</span></span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                      <div className="h-full rounded-full" style={{ width:`${pct}%`, background:`linear-gradient(90deg,${item.color},${item.color}cc)`, boxShadow:`0 0 8px ${item.color}66`, transition:'width 0.7s cubic-bezier(0.4,0,0.2,1)' }}/>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          {utilization < 50 && (
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/8 px-3 py-2.5">
              <AlertTriangle size={12} className="shrink-0 text-amber-400"/>
              <p className="text-[11px] text-amber-300">Low utilization — link more sessions to billable projects to improve revenue tracking.</p>
            </div>
          )}
        </SectionCard>

        <SectionCard>
          <CardHeader icon={Zap} color="#f59e0b" title="Revenue ROI" sub="Value per hour worked"/>
          <div className="flex flex-col items-center justify-center gap-4 py-3">
            <div className="relative">
              <DonutRing value={Math.min(revenuePerH / 200 * 100, 100)} color="#f59e0b" size={108} thick={10} glow/>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-extrabold text-white">${revenuePerH.toFixed(0)}</span>
                <span className="text-[10px] text-[#6b7a96]">per hour</span>
              </div>
            </div>
            <div className="grid w-full grid-cols-3 gap-2 text-center">
              {[
                { l:'Total Revenue',  v: fmtMoney(totalRevenue), c:'#34D399' },
                { l:'Billable Hours', v:`${billH.toFixed(1)}h`,  c:'#7c6cf2' },
                { l:'Avg Rate',       v:`$${avgRate.toFixed(0)}`,c:'#f59e0b' },
              ].map(s => (
                <div key={s.l}
                  className="rounded-xl border py-2.5"
                  style={{ borderColor:'rgba(255,255,255,0.06)', background:'rgba(255,255,255,0.03)', transition:'all 0.20s ease', cursor:'default' }}
                  onMouseEnter={e => { e.currentTarget.style.background=`${s.c}12`; e.currentTarget.style.borderColor=`${s.c}38`; e.currentTarget.style.transform='scale(1.04) translateY(-1px)'; e.currentTarget.style.boxShadow=`0 6px 18px ${s.c}22`; }}
                  onMouseLeave={e => { e.currentTarget.style.background='rgba(255,255,255,0.03)'; e.currentTarget.style.borderColor='rgba(255,255,255,0.06)'; e.currentTarget.style.transform=''; e.currentTarget.style.boxShadow=''; }}
                >
                  <p className="text-[15px] font-extrabold" style={{ color:s.c }}>{s.v}</p>
                  <p className="mt-0.5 text-[10px] text-[#6b7a96]">{s.l}</p>
                </div>
              ))}
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   PROJECTS MODULE
══════════════════════════════════════════════════════════════════ */
function ProjectsModule({ data }) {
  const { profSummary, billSummary } = data;
  const totalRevenue = profSummary?.totalRevenue || 0;

  const rows = useMemo(() => {
    const byP = profSummary?.byProject || {};
    return Object.entries(byP)
      .map(([name, v], i) => ({
        name,
        revenue : v.revenue || 0,
        hours   : v.hours   || 0,
        rate    : v.hours > 0 ? (v.revenue||0) / v.hours : 0,
        share   : totalRevenue > 0 ? ((v.revenue||0) / totalRevenue) * 100 : 0,
        color   : PALETTE[i % PALETTE.length],
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [profSummary, totalRevenue]);

  const chartData = rows.slice(0, 8);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Projects Tracked" value={rows.length}                              color="#7c6cf2" Icon={Briefcase} sub="with revenue data"/>
        <KpiCard label="Top Project Rev"  value={fmtMoney(rows[0]?.revenue || 0)}         color="#34D399" Icon={DollarSign} sub={rows[0]?.name || '—'}/>
        <KpiCard label="Best Rate"        value={`$${(rows[0]?.rate||0).toFixed(0)}/h`}   color="#f59e0b" Icon={TrendingUp} sub="highest $/hr project"/>
        <KpiCard label="Total Hours"      value={`${(billSummary?.totalHours||0).toFixed(1)}h`} color="#60a5fa" Icon={Clock} sub="across all projects"/>
      </div>

      {chartData.length > 0 && (
        <SectionCard>
          <CardHeader icon={BarChart2} color="#7c6cf2" title="Revenue by Project" sub="Top 8 projects by revenue"/>
          <ResponsiveContainer width="100%" height={210}>
            <BarChart data={chartData} margin={{ top:4, right:8, left:0, bottom:0 }} barCategoryGap="40%">
              <XAxis dataKey="name" tick={TICK} axisLine={false} tickLine={false} interval={0}
                tickFormatter={v => v.length > 10 ? v.slice(0,10)+'…' : v}/>
              <YAxis tick={TICK} axisLine={false} tickLine={false} width={48} tickFormatter={v=>`$${v}`}/>
              <Tooltip {...TT} formatter={(v,n) => [n==='revenue'?`$${v.toFixed(2)}`:v, n==='revenue'?'Revenue':'Hours']}/>
              <Bar dataKey="revenue" radius={[5,5,0,0]}>
                {chartData.map((e,i) => <Cell key={i} fill={e.color}/>)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </SectionCard>
      )}

      <SectionCard noPad>
        <div className="border-b border-white/[0.06] p-4">
          <p className="text-[13px] font-bold text-white">Project P&L Breakdown</p>
        </div>
        {rows.length === 0 ? (
          <div className="p-5">
            <EmptyState icon={Briefcase} msg="No project data" hint="Assign tracked sessions to projects with hourly rates."/>
          </div>
        ) : (
          <div>
            <div className="grid grid-cols-5 gap-2 border-b border-white/[0.05] px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-[#5a6880]">
              <span className="col-span-2">Project</span>
              <span className="text-right">Hours</span>
              <span className="text-right">Revenue</span>
              <span className="text-right">Rate</span>
            </div>
            {rows.map((r, i) => (
              <div key={r.name}
                className="fl-profit-row grid grid-cols-5 gap-2 border-b border-white/[0.04] px-4 py-3"
                style={{ transition:'background 0.18s ease, border-color 0.18s ease' }}
                onMouseEnter={e => { e.currentTarget.style.background=`${r.color}12`; e.currentTarget.style.borderColor=`${r.color}25`; e.currentTarget.querySelectorAll('.row-dim').forEach(el => { el.style.color='rgba(200,212,228,0.9)'; }); }}
                onMouseLeave={e => { e.currentTarget.style.background=''; e.currentTarget.style.borderColor=''; e.currentTarget.querySelectorAll('.row-dim').forEach(el => { el.style.color=''; }); }}
              >
                <div className="col-span-2 flex min-w-0 items-center gap-2.5">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background:r.color }}/>
                  <span className="truncate text-[12px] font-semibold text-white">{r.name}</span>
                </div>
                <span className="row-dim text-right text-[12px] text-[#8090b0]" style={{ transition:'color 0.18s ease' }}>{r.hours.toFixed(1)}h</span>
                <span className="text-right text-[12px] font-bold text-[#34D399]">{fmtMoney(r.revenue,2)}</span>
                <span className="row-dim text-right text-[12px] text-[#6b7a96]" style={{ transition:'color 0.18s ease' }}>{r.rate > 0 ? `$${r.rate.toFixed(0)}/h` : '—'}</span>
              </div>
            ))}
            <div className="grid grid-cols-5 gap-2 px-4 py-3">
              <span className="col-span-2 text-[12px] font-bold text-white">Total</span>
              <span className="text-right text-[12px] font-bold text-white">{(billSummary?.totalHours||0).toFixed(1)}h</span>
              <span className="text-right text-[12px] font-extrabold text-[#34D399]">{fmtMoney(profSummary?.totalRevenue||0,2)}</span>
              <span className="text-right text-[12px] font-bold text-[#8090b0]">${(billSummary?.avgRate||0).toFixed(0)}/h</span>
            </div>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   CLIENTS MODULE
══════════════════════════════════════════════════════════════════ */
function ClientsModule({ data }) {
  const { profSummary, billSummary } = data;
  const totalRevenue = profSummary?.totalRevenue || 0;

  const rows = useMemo(() => {
    const byC = profSummary?.byClient || {};
    return Object.entries(byC)
      .map(([name, v], i) => ({
        name,
        revenue : v.revenue || 0,
        hours   : v.hours   || 0,
        rate    : v.hours > 0 ? (v.revenue||0) / v.hours : 0,
        share   : totalRevenue > 0 ? ((v.revenue||0) / totalRevenue) * 100 : 0,
        color   : PALETTE[i % PALETTE.length],
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [profSummary, totalRevenue]);

  const pieData = rows.slice(0, 6).filter(r => r.revenue > 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Active Clients"  value={rows.length}                          color="#60a5fa" Icon={Users}     sub="with billable work"/>
        <KpiCard label="Top Client Rev"  value={fmtMoney(rows[0]?.revenue||0)}       color="#34D399" Icon={DollarSign} sub={rows[0]?.name || '—'}/>
        <KpiCard label="Revenue Share"   value={`${(rows[0]?.share||0).toFixed(0)}%`} color="#f59e0b" Icon={Layers}    sub="top client concentration"/>
        <KpiCard label="Avg Client Rate" value={`$${(billSummary?.avgRate||0).toFixed(0)}/h`} color="#7c6cf2" Icon={TrendingUp} sub="blended hourly rate"/>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {pieData.length > 0 && (
          <SectionCard>
            <CardHeader icon={Users} color="#60a5fa" title="Revenue by Client" sub="Share of total revenue"/>
            <div className="flex items-center gap-4">
              <PieChart width={140} height={140}>
                <Pie data={pieData} cx={70} cy={70} innerRadius={44} outerRadius={66}
                  dataKey="value" paddingAngle={2} strokeWidth={0}>
                  {pieData.map((e,i) => <Cell key={i} fill={e.color}/>)}
                </Pie>
                <Tooltip contentStyle={TT.contentStyle} labelStyle={TT.labelStyle} itemStyle={TT.itemStyle}
                  formatter={v => [`$${v.toFixed(2)}`, 'Revenue']}/>
              </PieChart>
              <div className="flex-1 space-y-2">
                {pieData.map(r => (
                  <div key={r.name} className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background:r.color }}/>
                      <span className="truncate text-[12px] text-tx-secondary">{r.name}</span>
                    </div>
                    <span className="text-[12px] font-bold text-white">{r.share.toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </div>
          </SectionCard>
        )}

        <SectionCard>
          <CardHeader icon={Target} color="#34D399" title="Client Health" sub="Revenue concentration risk"/>
          <div className="space-y-3">
            {rows.length === 0 ? (
              <EmptyState icon={Users} msg="No client data" hint="Assign sessions to clients to track client-level profitability."/>
            ) : rows.slice(0, 5).map((r, i) => (
              <div key={r.name}
                className="rounded-xl px-2.5 py-2"
                style={{ transition:'background 0.18s ease, box-shadow 0.18s ease', cursor:'default' }}
                onMouseEnter={e => { e.currentTarget.style.background=`${r.color}0e`; e.currentTarget.style.boxShadow=`inset 0 0 0 1px ${r.color}22`; }}
                onMouseLeave={e => { e.currentTarget.style.background=''; e.currentTarget.style.boxShadow=''; }}
              >
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-[12px] font-semibold text-tx-secondary">
                    <span className="h-2 w-2 rounded-full" style={{ background:r.color }}/>
                    {r.name}
                  </span>
                  <span className="text-[12px] font-bold text-white">{fmtMoney(r.revenue,2)}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                  <div className="h-full rounded-full" style={{ width:`${r.share}%`, background:`linear-gradient(90deg,${r.color},${r.color}bb)`, boxShadow:`0 0 8px ${r.color}55`, transition:'width 0.6s cubic-bezier(0.4,0,0.2,1)' }}/>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <SectionCard noPad>
        <div className="border-b border-white/[0.06] p-4">
          <p className="text-[13px] font-bold text-white">Client Profitability Table</p>
        </div>
        {rows.length === 0 ? (
          <div className="p-5">
            <EmptyState icon={Users} msg="No client data" hint="Link sessions to clients with hourly rates to track client profitability."/>
          </div>
        ) : (
          <div>
            <div className="grid grid-cols-5 gap-2 border-b border-white/[0.05] px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-[#5a6880]">
              <span className="col-span-2">Client</span>
              <span className="text-right">Hours</span>
              <span className="text-right">Revenue</span>
              <span className="text-right">Share</span>
            </div>
            {rows.map((r) => (
              <div key={r.name}
                className="fl-profit-row grid grid-cols-5 gap-2 border-b border-white/[0.04] px-4 py-3"
                style={{ transition:'background 0.18s ease, border-color 0.18s ease' }}
                onMouseEnter={e => { e.currentTarget.style.background=`${r.color}12`; e.currentTarget.style.borderColor=`${r.color}25`; e.currentTarget.querySelectorAll('.row-dim').forEach(el => { el.style.color='rgba(200,212,228,0.9)'; }); }}
                onMouseLeave={e => { e.currentTarget.style.background=''; e.currentTarget.style.borderColor=''; e.currentTarget.querySelectorAll('.row-dim').forEach(el => { el.style.color=''; }); }}
              >
                <div className="col-span-2 flex min-w-0 items-center gap-2.5">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background:r.color }}/>
                  <span className="truncate text-[12px] font-semibold text-white">{r.name}</span>
                </div>
                <span className="row-dim text-right text-[12px] text-[#8090b0]" style={{ transition:'color 0.18s ease' }}>{r.hours.toFixed(1)}h</span>
                <span className="text-right text-[12px] font-bold text-[#34D399]">{fmtMoney(r.revenue,2)}</span>
                <span className="row-dim text-right text-[12px] text-[#6b7a96]" style={{ transition:'color 0.18s ease' }}>{r.share.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   FOCUS ROI MODULE
══════════════════════════════════════════════════════════════════ */
function FocusRoiModule({ data }) {
  const { profSummary, billSummary, deepWork, distRatio, intensity } = data;

  const totalRevenue  = profSummary?.totalRevenue || 0;
  const billH         = billSummary?.billableHours || 0;
  const deepWorkSec   = deepWork?.totalDeepSec  || deepWork?.deepWorkSeconds || 0;
  const deepWorkH     = deepWorkSec / 3600;
  const deepSessions  = deepWork?.sessions?.length || deepWork?.count || 0;
  const focusPct      = distRatio?.focusPct   || distRatio?.focusRatio   || 0;
  const distractPct   = distRatio?.distractPct || distRatio?.distractionRatio || 0;
  const contextSwitches = intensity?.contextSwitches || intensity?.switches || 0;
  const switchCostMin   = contextSwitches * 23; // ~23 min recovery per switch (Gloria Mark research)

  const deepValuePerH   = deepWorkH > 0 ? totalRevenue / deepWorkH : 0;
  const focusROI        = focusPct > 0 ? (totalRevenue / (focusPct / 100)) : 0;
  const switchCostEst   = billSummary?.avgRate ? (switchCostMin / 60) * (billSummary.avgRate) : 0;

  const focusTimeline = useMemo(() => {
    const days = Array.isArray(data.dailyStats) ? data.dailyStats : [];
    return days.slice(-14).map(d => ({
      date     : new Date(d.date * 1000).toLocaleDateString('en-US', { month:'short', day:'numeric' }),
      focusSec : d.focusSec  || d.deepSec  || 0,
      revenue  : d.revenue   || 0,
    }));
  }, [data.dailyStats]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Deep Work Hours"    value={`${deepWorkH.toFixed(1)}h`}        color="#7c6cf2" Icon={Brain}       sub={`${deepSessions} sessions`}/>
        <KpiCard label="Deep Work Value"    value={`$${deepValuePerH.toFixed(0)}/h`}  color="#34D399" Icon={DollarSign}  sub="revenue per deep work hour"/>
        <KpiCard label="Focus Ratio"        value={`${focusPct}%`}                    color="#60a5fa" Icon={Shield}       sub={`${distractPct}% distracted`}/>
        <KpiCard label="Switch Cost Est."   value={`$${switchCostEst.toFixed(0)}`}    color="#f87171" Icon={AlertTriangle} sub={`${contextSwitches} switches · ${switchCostMin}min lost`}/>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard>
          <CardHeader icon={Brain} color="#7c6cf2" title="Deep Work → Revenue Correlation" sub="Focus session hours vs daily revenue"/>
          {focusTimeline.length > 0 ? (
            <ResponsiveContainer width="100%" height={170}>
              <ComposedChart data={focusTimeline} margin={{ top:4, right:8, left:0, bottom:0 }}>
                <defs>
                  <linearGradient id="focusGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#7c6cf2" stopOpacity="0.3"/>
                    <stop offset="100%" stopColor="#7c6cf2" stopOpacity="0"/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={TICK} axisLine={false} tickLine={false} interval="preserveStartEnd"/>
                <YAxis yAxisId="f" tick={TICK} axisLine={false} tickLine={false} width={44} tickFormatter={v=>fmtM(v)}/>
                <YAxis yAxisId="r" orientation="right" tick={TICK} axisLine={false} tickLine={false} width={36} tickFormatter={v=>`$${v}`}/>
                <Tooltip {...TT} formatter={(v,n) => [n==='focusSec'?fmtM(v):`$${v}`, n==='focusSec'?'Focus':'Revenue']}/>
                <Area yAxisId="f" type="monotone" dataKey="focusSec" stroke="#7c6cf2" strokeWidth={2} fill="url(#focusGrad)"/>
                <Line yAxisId="r" type="monotone" dataKey="revenue"  stroke="#34D399" strokeWidth={1.5} dot={false}/>
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState icon={Brain} msg="No focus data" hint="Start deep work sessions to see correlation with revenue."/>
          )}
        </SectionCard>

        <SectionCard>
          <CardHeader icon={Activity} color="#f59e0b" title="Context Switching Cost" sub="Estimated productivity lost to task switching"/>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {[
                { l:'Switches', v:contextSwitches, c:'#f87171' },
                { l:'Time Lost', v:`${switchCostMin}m`, c:'#f59e0b' },
                { l:'Cost Est.', v:`$${switchCostEst.toFixed(0)}`, c:'#f87171' },
                { l:'Recovery', v:'~23m each', c:'#8090b0' },
              ].map(s => (
                <div key={s.l}
                  className="fl-profit-inline-card rounded-xl border p-3"
                  style={{ borderColor:'rgba(255,255,255,0.06)', background:'rgba(255,255,255,0.03)', transition:'all 0.20s ease', cursor:'default' }}
                  onMouseEnter={e => { e.currentTarget.style.background=`${s.c}12`; e.currentTarget.style.borderColor=`${s.c}38`; e.currentTarget.style.transform='scale(1.03) translateY(-1px)'; e.currentTarget.style.boxShadow=`0 6px 18px ${s.c}22`; }}
                  onMouseLeave={e => { e.currentTarget.style.background='rgba(255,255,255,0.03)'; e.currentTarget.style.borderColor='rgba(255,255,255,0.06)'; e.currentTarget.style.transform=''; e.currentTarget.style.boxShadow=''; }}
                >
                  <p className="text-[18px] font-extrabold" style={{ color:s.c }}>{s.v}</p>
                  <p className="text-[10px] text-[#6b7a96]">{s.l}</p>
                </div>
              ))}
            </div>
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/8 px-3 py-2.5">
              <p className="text-[11px] text-amber-300">
                Context switching costs ~23 minutes of recovery per switch. Minimizing interruptions directly increases your billable output and revenue per hour.
              </p>
            </div>
          </div>
        </SectionCard>
      </div>

      <SectionCard>
        <CardHeader icon={Zap} color="#34D399" title="Focus ROI Insights"/>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            {
              icon: Brain,   color:'#7c6cf2',
              title: 'Deep Work Value',
              body: `Your deep work sessions generate ${deepValuePerH > 0 ? `$${deepValuePerH.toFixed(0)}/hr` : 'no tracked revenue yet'}. High-focus blocks are your highest-value time.`,
            },
            {
              icon: Shield,  color:'#60a5fa',
              title: 'Focus Allocation',
              body: `${focusPct}% of your tracked time is classified as focused work. ${focusPct >= 60 ? 'Strong focus discipline.' : 'Reducing distractions could significantly increase revenue per day.'}`,
            },
            {
              icon: AlertTriangle, color:'#f87171',
              title: 'Switch Overhead',
              body: `${contextSwitches} context switches estimated. At $${(billSummary?.avgRate||0).toFixed(0)}/hr, the recovery cost is ~$${switchCostEst.toFixed(0)} in lost productivity.`,
            },
          ].map(({ icon:Icon, color, title, body }) => (
            <div key={title}
              className="fl-profit-inline-card relative overflow-hidden rounded-xl border p-3.5"
              style={{ borderColor:'rgba(255,255,255,0.06)', background:'rgba(255,255,255,0.025)', transition:'all 0.22s cubic-bezier(0.4,0,0.2,1)', cursor:'default' }}
              onMouseEnter={e => {
                const el = e.currentTarget;
                el.style.background=`${color}10`;
                el.style.borderColor=`${color}40`;
                el.style.transform='translateY(-2px) scale(1.015)';
                el.style.boxShadow=`0 10px 28px rgba(0,0,0,0.24), 0 4px 14px ${color}22, inset 0 1px 0 rgba(255,255,255,0.08)`;
                const bar = el.querySelector('.insight-bar');
                if (bar) bar.style.opacity='1';
                const bodyEl = el.querySelector('.insight-body');
                if (bodyEl) bodyEl.style.color='rgba(190,204,222,0.92)';
                const iconWrap = el.querySelector('.insight-icon');
                if (iconWrap) iconWrap.style.background=`${color}28`;
              }}
              onMouseLeave={e => {
                const el = e.currentTarget;
                el.style.background='rgba(255,255,255,0.025)';
                el.style.borderColor='rgba(255,255,255,0.06)';
                el.style.transform='';
                el.style.boxShadow='';
                const bar = el.querySelector('.insight-bar');
                if (bar) bar.style.opacity='0.7';
                const bodyEl = el.querySelector('.insight-body');
                if (bodyEl) bodyEl.style.color='';
                const iconWrap = el.querySelector('.insight-icon');
                if (iconWrap) iconWrap.style.background=`${color}18`;
              }}
            >
              <div className="insight-bar absolute inset-y-0 left-0 w-0.5 rounded-full" style={{ background:`linear-gradient(180deg,${color},${color}33)`, opacity:0.7, transition:'opacity 0.22s ease' }}/>
              <div className="flex items-center gap-2 mb-2">
                <div className="insight-icon flex h-6 w-6 items-center justify-center rounded-lg" style={{ background:`${color}18`, transition:'background 0.22s ease' }}>
                  <Icon size={11} style={{ color }}/>
                </div>
                <p className="text-[12px] font-bold text-white">{title}</p>
              </div>
              <p className="insight-body text-[11px] leading-relaxed text-[#8090b0]" style={{ transition:'color 0.20s ease' }}>{body}</p>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   SUSTAINABILITY MODULE
══════════════════════════════════════════════════════════════════ */
function SustainabilityModule({ data, range }) {
  const { profSummary, billSummary, intensity, dailyStats } = data;

  const totalH      = billSummary?.totalHours    || 0;
  const avgDailyH   = range > 0 ? totalH / range : 0;
  const overworkDays= (Array.isArray(dailyStats) ? dailyStats : []).filter(d => (d.totalSec||0) > 9 * 3600).length;
  const workIntense = intensity?.avgIntensity    || intensity?.intensity || 0;
  const burnoutRisk = avgDailyH > 8 ? 'High' : avgDailyH > 6 ? 'Moderate' : 'Low';
  const burnoutColor= burnoutRisk === 'High' ? '#f87171' : burnoutRisk === 'Moderate' ? '#f59e0b' : '#34D399';

  // Adaptive behavioral burnout & focus analytics
  const adaptiveBurnout = useMemo(() => { try { return getBurnoutAnalytics(); } catch { return null; } }, []);
  const adaptiveFocus   = useMemo(() => { try { return getFocusAnalytics(); } catch { return null; } }, []);

  const weeklyTrend = useMemo(() => {
    const days = Array.isArray(dailyStats) ? dailyStats : [];
    const weeks = [];
    for (let i = 0; i < days.length; i += 7) {
      const chunk = days.slice(i, i + 7);
      const totalSec = chunk.reduce((s, d) => s + (d.totalSec || 0), 0);
      weeks.push({
        week    : `Wk ${Math.floor(i/7)+1}`,
        hours   : Math.round(totalSec / 360) / 10,
        revenue : chunk.reduce((s, d) => s + (d.revenue || 0), 0),
      });
    }
    return weeks;
  }, [dailyStats]);

  const dailyHours = useMemo(() =>
    (Array.isArray(dailyStats) ? dailyStats : []).slice(-14).map(d => ({
      date  : new Date(d.date * 1000).toLocaleDateString('en-US', { weekday:'short' }),
      hours : Math.round((d.totalSec||0) / 360) / 10,
    })),
  [dailyStats]);

  return (
    <div className="space-y-4">
      {/* Adaptive behavioral sustainability intelligence */}
      {adaptiveBurnout?.observations > 5 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border px-3.5 py-2.5" style={{ background:'rgba(52,211,153,0.05)', borderColor:'rgba(52,211,153,0.18)' }}>
            <p className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color:'#34D399' }}>Adaptive Baseline</p>
            <p className="text-[13px] font-bold text-white">{Math.round(adaptiveBurnout.sustainableHoursPerWeek)}h/week</p>
            <p className="text-[9.5px] mt-0.5" style={{ color:'#5A6A88' }}>Your learned sustainable pace</p>
          </div>
          <div className="rounded-xl border px-3.5 py-2.5" style={{ background: adaptiveBurnout.riskLevel === 'low' ? 'rgba(52,211,153,0.05)' : 'rgba(251,191,36,0.05)', borderColor: adaptiveBurnout.riskLevel === 'low' ? 'rgba(52,211,153,0.18)' : 'rgba(251,191,36,0.2)' }}>
            <p className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: adaptiveBurnout.riskLevel === 'low' ? '#34D399' : '#FBBF24' }}>Fatigue Tracker</p>
            <p className="text-[13px] font-bold capitalize" style={{ color: adaptiveBurnout.riskLevel === 'low' ? '#34D399' : '#FBBF24' }}>{Math.round(adaptiveBurnout.fatigue)}%</p>
            <p className="text-[9.5px] mt-0.5" style={{ color:'#5A6A88' }}>{adaptiveBurnout.riskLevel} risk · {Math.round(adaptiveBurnout.currentWeekHours * 10) / 10}h this week</p>
          </div>
          {adaptiveFocus?.peakWindow && (
            <div className="rounded-xl border px-3.5 py-2.5" style={{ background:'rgba(129,140,248,0.05)', borderColor:'rgba(129,140,248,0.18)' }}>
              <p className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color:'#818CF8' }}>Peak Profitability Window</p>
              <p className="text-[13px] font-bold text-white">{adaptiveFocus.peakWindow}</p>
              <p className="text-[9.5px] mt-0.5" style={{ color:'#5A6A88' }}>{adaptiveFocus.deepWorkRatioPct}% deep work avg</p>
            </div>
          )}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Avg Daily Hours"  value={`${avgDailyH.toFixed(1)}h`}   color={avgDailyH > 9 ? '#f87171' : '#34D399'} Icon={Clock}        sub="per working day"/>
        <KpiCard label="Overwork Days"    value={overworkDays}                  color="#f87171"  Icon={AlertTriangle} sub={`>9h days in period`}/>
        <KpiCard label="Work Intensity"   value={`${workIntense}%`}             color="#f59e0b"  Icon={Zap}           sub="avg session intensity"/>
        <KpiCard label="Burnout Risk"     value={burnoutRisk}                   color={burnoutColor} Icon={Activity}  sub="based on hours pattern"/>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard>
          <CardHeader icon={Activity} color="#60a5fa" title="Daily Hours (Last 14 Days)" sub="Workload pattern — ideal is 6–8h"/>
          {dailyHours.length > 0 ? (
            <ResponsiveContainer width="100%" height={170}>
              <BarChart data={dailyHours} margin={{ top:4, right:8, left:0, bottom:0 }} barCategoryGap="35%">
                <XAxis dataKey="date" tick={TICK} axisLine={false} tickLine={false}/>
                <YAxis tick={TICK} axisLine={false} tickLine={false} width={32} tickFormatter={v=>`${v}h`}/>
                <Tooltip {...TT} formatter={v => [`${v}h`, 'Hours']}/>
                <ReferenceLine y={8} stroke="#f59e0b" strokeDasharray="3 3" strokeOpacity={0.6}/>
                <Bar dataKey="hours" radius={[4,4,0,0]}>
                  {dailyHours.map((e,i) => (
                    <Cell key={i} fill={e.hours > 9 ? '#f87171' : e.hours > 7 ? '#f59e0b' : '#60a5fa'}/>
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState icon={Activity} msg="No daily data" hint="Track time sessions to see your workload patterns."/>
          )}
        </SectionCard>

        <SectionCard>
          <CardHeader icon={TrendingUp} color="#34D399" title="Weekly Revenue vs Hours" sub="Efficiency trend by week"/>
          {weeklyTrend.length > 0 ? (
            <ResponsiveContainer width="100%" height={170}>
              <ComposedChart data={weeklyTrend} margin={{ top:4, right:8, left:0, bottom:0 }}>
                <XAxis dataKey="week" tick={TICK} axisLine={false} tickLine={false}/>
                <YAxis yAxisId="h" tick={TICK} axisLine={false} tickLine={false} width={32} tickFormatter={v=>`${v}h`}/>
                <YAxis yAxisId="r" orientation="right" tick={TICK} axisLine={false} tickLine={false} width={44} tickFormatter={v=>`$${v}`}/>
                <Tooltip {...TT} formatter={(v,n) => [n==='hours'?`${v}h`:`$${v.toFixed(0)}`, n==='hours'?'Hours':'Revenue']}/>
                <Bar yAxisId="h" dataKey="hours" fill="#60a5fa" radius={[4,4,0,0]} fillOpacity={0.8}/>
                <Line yAxisId="r" type="monotone" dataKey="revenue" stroke="#34D399" strokeWidth={2} dot={{ fill:'#34D399', r:3 }}/>
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState icon={TrendingUp} msg="Need multiple weeks of data" hint="Track sessions over several weeks to see weekly trends."/>
          )}
        </SectionCard>
      </div>

      <SectionCard>
        <CardHeader icon={Shield} color={burnoutColor} title="Workload Sustainability Report"/>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            {
              icon: Clock,  color: avgDailyH > 9 ? '#f87171' : '#34D399',
              title: 'Work Volume',
              body: avgDailyH > 9
                ? `Averaging ${avgDailyH.toFixed(1)}h/day is unsustainable. Consider reducing tracked hours or redistributing work.`
                : avgDailyH > 6
                ? `${avgDailyH.toFixed(1)}h/day is healthy. Maintain this range for long-term sustainability.`
                : `${avgDailyH.toFixed(1)}h/day tracked — ensure sessions are being captured correctly.`,
            },
            {
              icon: AlertTriangle, color: overworkDays > 3 ? '#f87171' : '#f59e0b',
              title: 'Overwork Pattern',
              body: overworkDays > 3
                ? `${overworkDays} days over 9 hours detected. Chronic overwork leads to diminishing returns and burnout.`
                : overworkDays > 0
                ? `${overworkDays} overwork day${overworkDays>1?'s':''} this period. Monitor to prevent it becoming a pattern.`
                : 'No overwork days detected. Good work-life balance.',
            },
            {
              icon: Zap, color: '#60a5fa',
              title: 'Revenue Efficiency',
              body: `${fmtMoney(profSummary?.totalRevenue||0)} over ${range} days = ${fmtMoney((profSummary?.totalRevenue||0)/Math.max(range,1))}/day average. ${avgDailyH > 0 ? `Your effective rate: $${((profSummary?.totalRevenue||0)/Math.max(totalH,1)).toFixed(0)}/hr.` : ''}`,
            },
          ].map(({ icon:Icon, color, title, body }) => (
            <div key={title}
              className="fl-profit-inline-card relative overflow-hidden rounded-xl border p-3.5"
              style={{ borderColor:'rgba(255,255,255,0.06)', background:'rgba(255,255,255,0.025)', transition:'all 0.22s cubic-bezier(0.4,0,0.2,1)', cursor:'default' }}
              onMouseEnter={e => {
                const el = e.currentTarget;
                el.style.background=`${color}10`;
                el.style.borderColor=`${color}40`;
                el.style.transform='translateY(-2px) scale(1.015)';
                el.style.boxShadow=`0 10px 28px rgba(0,0,0,0.24), 0 4px 14px ${color}22, inset 0 1px 0 rgba(255,255,255,0.08)`;
                const bar = el.querySelector('.insight-bar');
                if (bar) bar.style.opacity='1';
                const bodyEl = el.querySelector('.insight-body');
                if (bodyEl) bodyEl.style.color='rgba(190,204,222,0.92)';
                const iconWrap = el.querySelector('.insight-icon');
                if (iconWrap) iconWrap.style.background=`${color}28`;
              }}
              onMouseLeave={e => {
                const el = e.currentTarget;
                el.style.background='rgba(255,255,255,0.025)';
                el.style.borderColor='rgba(255,255,255,0.06)';
                el.style.transform='';
                el.style.boxShadow='';
                const bar = el.querySelector('.insight-bar');
                if (bar) bar.style.opacity='0.7';
                const bodyEl = el.querySelector('.insight-body');
                if (bodyEl) bodyEl.style.color='';
                const iconWrap = el.querySelector('.insight-icon');
                if (iconWrap) iconWrap.style.background=`${color}18`;
              }}
            >
              <div className="insight-bar absolute inset-y-0 left-0 w-0.5 rounded-full" style={{ background:`linear-gradient(180deg,${color},${color}33)`, opacity:0.7, transition:'opacity 0.22s ease' }}/>
              <div className="flex items-center gap-2 mb-2">
                <div className="insight-icon flex h-6 w-6 items-center justify-center rounded-lg" style={{ background:`${color}18`, transition:'background 0.22s ease' }}>
                  <Icon size={11} style={{ color }}/>
                </div>
                <p className="text-[12px] font-bold text-white">{title}</p>
              </div>
              <p className="insight-body text-[11px] leading-relaxed text-[#8090b0]" style={{ transition:'color 0.20s ease' }}>{body}</p>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   ROOT PAGE
══════════════════════════════════════════════════════════════════ */
export default function ProfitabilityPage({ user }) {
  const [mod,        setMod]       = useState('overview');
  const [range,      setRange]     = useState(30);
  const [loading,    setLoading]   = useState(true);
  const [exportOpen, setExportOpen]= useState(false);
  const [data,      setData]      = useState({
    profSummary : null,
    billSummary : null,
    dailyStats  : [],
    deepWork    : null,
    distRatio   : null,
    intensity   : null,
  });

  const { fromTs, toTs } = useMemo(() => {
    const now = Math.floor(Date.now() / 1000);
    return { fromTs: now - range * 86400, toTs: now };
  }, [range]);

  const load = useCallback(async () => {
    setLoading(true);
    const p = { userId: user.id, from: fromTs, to: toTs };
    const [profSummary, billSummary, dailyStats, deepWork, distRatio, intensity] = await Promise.all([
      callApi('profitabilitySummary', null,  p),
      callApi('billableSummary',      null,  p),
      callApi('statsDaily',           [],    p),
      callApi('deepWorkBlocks',       null,  p),
      callApi('distractionRatio',     null,  p),
      callApi('workIntensity',        null,  p),
    ]);
    setData({ profSummary, billSummary, dailyStats: Array.isArray(dailyStats) ? dailyStats : [], deepWork, distRatio, intensity });
    setLoading(false);
  }, [user.id, fromTs, toTs]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="fl-profit-page flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="fl-profit-page-header shrink-0 border-b border-white/[0.06] px-6 py-4"
        style={{ background:'linear-gradient(180deg,rgba(16,20,30,0.98),rgba(12,15,23,0.98))' }}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <div className="flex h-5 w-5 items-center justify-center rounded-md bg-emerald-500/15">
                <TrendingUp size={11} className="text-emerald-400"/>
              </div>
              <p className="text-[11px] font-bold uppercase tracking-[0.09em] text-emerald-400/80">Profitability Intelligence</p>
            </div>
            <h1 className="text-[22px] font-extrabold leading-tight tracking-tight text-white">Revenue & Value Analytics</h1>
            <p className="mt-0.5 text-[12px] text-[#6b7a96]">Connect time, focus, projects, and clients into actionable profitability insights</p>
          </div>
          <div className="flex items-center gap-3">
            <RangePicker range={range} onChange={setRange}/>
            <button
              onClick={() => setExportOpen(true)}
              className="fl-profit-export flex items-center gap-2 rounded-[10px] border px-3.5 py-2 text-[12px] font-semibold"
              style={{ background:'rgba(255,255,255,0.03)', borderColor:'rgba(255,255,255,0.08)', color:'#8090b0', transition:'all 0.20s cubic-bezier(0.4,0,0.2,1)' }}
              onMouseEnter={e => { e.currentTarget.style.background='rgba(52,211,153,0.09)'; e.currentTarget.style.borderColor='rgba(52,211,153,0.36)'; e.currentTarget.style.color='#34D399'; e.currentTarget.style.boxShadow='0 4px 16px rgba(52,211,153,0.18)'; e.currentTarget.style.transform='translateY(-1px)'; }}
              onMouseLeave={e => { e.currentTarget.style.background='rgba(255,255,255,0.03)'; e.currentTarget.style.borderColor='rgba(255,255,255,0.08)'; e.currentTarget.style.color='#8090b0'; e.currentTarget.style.boxShadow=''; e.currentTarget.style.transform=''; }}
            >
              <Download size={13}/> Export
            </button>
            {loading && (
              <div className="flex h-7 w-7 items-center justify-center">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/[0.1] border-t-accent"/>
              </div>
            )}
          </div>
        </div>
        <div className="mt-4">
          <ModuleTabs active={mod} onChange={setMod}/>
        </div>
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5" style={{ scrollbarWidth:'thin', scrollbarColor:'rgba(255,255,255,0.1) transparent' }}>
        {mod === 'overview'       && <OverviewModule       data={data} range={range}/>}
        {mod === 'projects'       && <ProjectsModule       data={data}/>}
        {mod === 'clients'        && <ClientsModule        data={data}/>}
        {mod === 'focus-roi'      && <FocusRoiModule       data={data}/>}
        {mod === 'sustainability' && <SustainabilityModule data={data} range={range}/>}
      </div>

      {/* ── Export modal ── */}
      <ExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        reportTitle="Revenue & Value Analytics"
        currentSectionLabel={`${MODULES.find(m => m.id === mod)?.label || 'Current'} · Last ${range} days`}
        allSectionsLabel={`All ${MODULES.length} modules: ${MODULES.map(m => m.label).join(', ')}`}
        onExport={async (format, scope) => {
          const { profSummary, billSummary, dailyStats } = data;
          const modIds = scope === 'current' ? [mod] : MODULES.map(m => m.id);
          const sections = modIds.map(id => {
            const label = MODULES.find(m => m.id === id)?.label || id;
            if (id === 'overview') {
              return {
                title: 'Profitability Overview',
                subtitle: `Last ${range} days revenue and value summary`,
                kpis: [
                  { label: 'Total Tracked',   value: fmtH(profSummary?.totalSeconds || 0) },
                  { label: 'Deep Work',        value: fmtH(profSummary?.deepWorkSeconds || 0) },
                  { label: 'Est. Revenue',     value: fmtMoney(billSummary?.estimatedRevenue || 0) },
                  { label: 'Billable Hours',   value: fmtH(billSummary?.billableSeconds || 0) },
                  { label: 'Utilization',      value: profSummary?.totalSeconds ? fmtPct(billSummary?.billableSeconds || 0, profSummary.totalSeconds) : '—' },
                ],
                headers: ['Date', 'Total Hours', 'Deep Work', 'Focus %'],
                rows: (Array.isArray(dailyStats) ? dailyStats : []).map(d => [
                  d.date || '—',
                  fmtH(d.total || 0),
                  fmtH(d.deepWork || 0),
                  (d.total || 0) > 0 ? fmtPct(d.focus || 0, d.total) : '0%',
                ]),
                summary: [
                  ['Total Tracked',     fmtH(profSummary?.totalSeconds || 0)],
                  ['Deep Work',         fmtH(profSummary?.deepWorkSeconds || 0)],
                  ['Est. Revenue',      fmtMoney(billSummary?.estimatedRevenue || 0)],
                  ['Billable Hours',    fmtH(billSummary?.billableSeconds || 0)],
                ],
              };
            }
            // Generic fallback section for other modules
            return {
              title: label,
              subtitle: `${label} data · Last ${range} days`,
              summary: [
                ['Module',      label],
                ['Period',      `Last ${range} days`],
                ['Data Status', 'See app for full charts and interactive analysis'],
              ],
            };
          }).filter(Boolean);

          const meta = {
            dateRange:  `Last ${range} days`,
            period:     `${range}-day analysis`,
            reportType: 'Profitability Intelligence',
          };
          const title    = 'Flow Ledger — Revenue & Value Analytics';
          const filename = `flow-ledger-profitability-${range}d-${new Date().toISOString().split('T')[0]}.csv`;
          if (format === 'csv') exportAsCSV(title, meta, sections, filename);
          else exportAsPDF(title, meta, sections);
        }}
      />
    </div>
  );
}
