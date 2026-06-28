import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Clock, Zap, Users, TrendingUp, ChevronLeft, ChevronRight,
  Briefcase, Activity, Calendar, ArrowRight, BarChart2, Monitor,
  Brain, Target, Sparkles, ShieldAlert, Flame, ChevronUp, ChevronDown,
  Minus, Timer, MapPin, RefreshCw, Video, Play, Coffee,
  CheckCircle2, Circle, ExternalLink, Plus, Layers, Hash,
} from 'lucide-react';
// recharts PieChart removed — replaced by CategoryDonut SVG component below
import { useAuth } from '../../App';
import AppIcon from '../shared/AppIcon';
import { pushToast } from '../shared/NotificationCentre';
import { classifyActivityApp, classifyActivitySession, SMART_CATEGORY_DEFS } from '../../utils/activityCategories';
import { getDashboardBehavioralKPIs } from '../../ai/adaptive/behaviorAnalyticsBridge.js';
import { generateAdaptiveRecommendations } from '../../ai/adaptive/adaptiveBehaviorEngine.js';
import { getWeeklyBehavioralReview } from '../../ai/adaptive/productivityInsightsAggregator.js';

const api = window.electron || {};

// ─── Utilities ──────────────────────────────────────────────────────────────────
function localDateStr(ts) {
  const d = ts ? new Date(ts * 1000) : new Date();
  return [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-');
}
function fmtDur(secs) {
  if (!secs || secs <= 0) return '0m';
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60);
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  return m > 0 ? `${m}m` : '< 1m';
}
// Zero-pads minutes (e.g. "3h 04m") for donut center label
function fmtDurCenter(secs) {
  if (!secs || secs <= 0) return '0m';
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60);
  if (h > 0) return m > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${h}h`;
  return `${m}m`;
}
function fmtTime(unix) {
  if (!unix) return '';
  return new Date(unix * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
}
function getGreeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}
function trendLabel(curr, prev) {
  if (!prev || prev === 0) return null;
  const delta = curr - prev, pct = Math.abs(Math.round((delta / prev) * 100));
  return { up: delta >= 0, pct };
}
function classifyApp(name = '') {
  return classifyActivityApp(name);
}
function isMeetingEvent(e) {
  if (e.all_day) return false;
  if (e.meeting_url) return true;
  try { const att = JSON.parse(e.attendees_json || '[]'); if (Array.isArray(att) && att.length > 1) return true; } catch {}
  return /\b(meeting|meet|sync|standup|stand-up|call|interview|review|retrospective|retro|debrief|check.?in|1.?on.?1|catch.?up|huddle|scrum|sprint|planning|kick.?off|zoom|teams|webex)\b/i.test(e.title || '');
}

// ─── AnimatedNumber ─────────────────────────────────────────────────────────────
function useAnimatedValue(target, duration = 600) {
  const [display, setDisplay] = useState(target);
  const frameRef = useRef();
  const startRef = useRef({ from: 0, to: 0, start: 0 });

  useEffect(() => {
    if (typeof target !== 'number' || isNaN(target)) { setDisplay(target); return; }
    cancelAnimationFrame(frameRef.current);
    startRef.current = { from: typeof display === 'number' ? display : 0, to: target, start: performance.now() };
    const animate = (now) => {
      const { from, to, start } = startRef.current;
      const t = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      const val = from + (to - from) * ease;
      setDisplay(t < 1 ? Math.round(val) : to);
      if (t < 1) frameRef.current = requestAnimationFrame(animate);
    };
    frameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameRef.current);
  }, [target, duration]); // eslint-disable-line

  return display;
}

// ─── Sparkline ──────────────────────────────────────────────────────────────────
function Sparkline({ data = [], color = '#7c6cf2', w = 64, h = 26 }) {
  if (data.filter(v => v > 0).length < 2) return <div style={{ width: w, height: h }}/>;
  const max = Math.max(...data, 0.01);
  const pts = data.map((v, i) => {
    const x = 2 + (i / (data.length - 1)) * (w - 4);
    const y = h - 3 - (v / max) * (h - 6);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const line = pts.join(' ');
  const area = `${pts[0].split(',')[0]},${h} ${line} ${pts[pts.length - 1].split(',')[0]},${h}`;
  const id = `sg${color.replace(/[^a-z0-9]/gi, '')}`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${id})`}/>
      <polyline points={line} fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

// ─── DonutRing ──────────────────────────────────────────────────────────────────
function DonutRing({ value, max = 100, color, size = 80, thickness = 7, glow = false }) {
  const r = (size - thickness) / 2, circ = 2 * Math.PI * r;
  const fill = Math.min(Math.max(value, 0) / max, 1) * circ;
  // SVG filter glow: feGaussianBlur follows the exact arc shape with no rectangular clipping.
  // overflow="visible" lets the bloom extend naturally past the SVG viewport boundary.
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}
      overflow="visible"
      style={{ transform: 'rotate(-90deg)', overflow: 'visible' }}>
      {glow && (
        <defs>
          <filter id="donut-glow" x="-50%" y="-50%" width="200%" height="200%" colorInterpolationFilters="sRGB">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3.5" result="blur"/>
            <feMerge>
              <feMergeNode in="blur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
      )}
      <circle className="fl-ring-track" cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={thickness}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={thickness}
        strokeDasharray={`${fill} ${circ}`} strokeLinecap="round"
        filter={glow ? 'url(#donut-glow)' : undefined}
        style={{ transition: 'stroke-dasharray 0.9s cubic-bezier(0.34,1.56,0.64,1)' }}/>
    </svg>
  );
}

// ─── CategoryDonut ───────────────────────────────────────────────────────────────
// Pure SVG multi-segment donut. No Recharts wrapper — direct shapeRendering control,
// rounded stroke caps, and zero phantom-offset issues.
function CategoryDonut({ data = [], size = 140, thickness = 7 }) {
  const cx       = size / 2;
  const cy       = size / 2;
  // Stroke is centered on r, so outer edge = r + thickness/2.
  // Keep 1px inset from the SVG edge so rounded caps are never clipped.
  const r        = cx - thickness / 2 - 1;                // 62.5 for size=140, thickness=7
  const circ     = 2 * Math.PI * r;

  const segs     = (data || []).filter(d => d.value > 0);
  const total    = segs.reduce((s, d) => s + d.value, 0);

  // Gap between segments in arc-length pixels.
  // 6 degrees gives rounded caps with a clean visible gap between slices.
  const GAP_DEG  = 6;
  const gapPx    = (GAP_DEG / 360) * circ;

  let cumLen = 0;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ display: 'block', transform: 'rotate(-90deg)' }}
      shapeRendering="geometricPrecision"
      aria-hidden
    >
      {/* Empty-state / track ring */}
      <circle
        cx={cx} cy={cy} r={r}
        fill="none"
        stroke="rgba(255,255,255,0.07)"
        strokeWidth={thickness}
        strokeLinecap="butt"
      />

      {total > 0 && segs.map((seg, i) => {
        // Full arc length this segment owns (including half the gap on each side).
        const fullLen = (seg.value / total) * circ;
        // Drawn arc is shorter — gap is shared between neighbours (half each).
        const drawLen = Math.max(2, fullLen - gapPx);
        // dashoffset = circ - cumulative positions the start of this dash correctly.
        const dashOffset = circ - cumLen;
        cumLen += fullLen;

        return (
          <circle
            key={i}
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={seg.color}
            strokeWidth={thickness}
            strokeDasharray={`${drawLen} ${circ}`}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 3px ${seg.color}55)` }}
          />
        );
      })}
    </svg>
  );
}

// ─── TrendPill ──────────────────────────────────────────────────────────────────
function TrendPill({ trend }) {
  if (!trend) return null;
  const { up, pct } = trend;
  if (pct === 0) return (
    <span className="flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9.5px] font-medium text-tx-faint border border-white/[0.06]"
      style={{ background: 'rgba(255,255,255,0.04)' }}><Minus size={7}/>{pct}%</span>
  );
  return (
    <span className="flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold"
      style={up
        ? { background: 'rgba(52,211,153,0.10)', color: '#34d399', border: '1px solid rgba(52,211,153,0.18)' }
        : { background: 'rgba(248,113,113,0.10)', color: '#f87171', border: '1px solid rgba(248,113,113,0.18)' }}>
      {up ? <ChevronUp size={8}/> : <ChevronDown size={8}/>}{pct}%
    </span>
  );
}

// ─── KpiCard ────────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, subUp, color, Icon, sparkData, trend, children }) {
  return (
    <div className="fl-kpi-card fl-home-surface fl-home-kpi group relative overflow-hidden rounded-[16px] border transition-all duration-300 cursor-default"
      style={{
        background: `linear-gradient(145deg, ${color}18 0%, ${color}0D 34%, rgba(255,255,255,0.028) 100%)`,
        border: `1px solid ${color}2B`,
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.08),0 4px 16px rgba(0,0,0,0.28),0 16px 40px rgba(0,0,0,0.18),0 0 26px ${color}0A`,
        padding: '16px',
      }}
      data-accent-color={color}>
      {/* Top shimmer */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{ background: `linear-gradient(90deg,transparent 10%,${color}55 40%,${color}99 50%,${color}55 60%,transparent 90%)` }}/>
      {/* Glow orb */}
      <div className="pointer-events-none absolute -right-5 -top-6 h-20 w-20 rounded-full opacity-[0.22] blur-3xl transition-opacity duration-300 group-hover:opacity-[0.34]"
        style={{ background: color }}/>
      <div className="pointer-events-none absolute -bottom-8 left-2 h-16 w-28 rounded-full opacity-[0.08] blur-3xl"
        style={{ background: color }}/>

      <div className="relative">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <div className="flex h-[22px] w-[22px] items-center justify-center rounded-[7px]"
              style={{ background: `${color}18`, border: `1px solid ${color}28` }}>
              <Icon size={11} style={{ color }}/>
            </div>
            <span className="text-[10px] font-semibold uppercase tracking-[0.09em] text-tx-faint">{label}</span>
          </div>
          <TrendPill trend={trend}/>
        </div>
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="num text-[26px] font-bold leading-none text-tx-primary"
              style={{ letterSpacing: '-0.025em', fontVariantNumeric: 'tabular-nums' }}>{value}</p>
            {sub && (
              <p className={`mt-1.5 text-[10.5px] font-medium leading-relaxed ${subUp === true ? 'text-emerald-400' : subUp === false ? 'text-red-400' : 'text-tx-faint'}`}>
                {sub}</p>
            )}
          </div>
          {sparkData && <Sparkline data={sparkData} color={color} w={58} h={22}/>}
          {children}
        </div>
      </div>
    </div>
  );
}

// ─── ScoreBar ───────────────────────────────────────────────────────────────────
function ScoreBar({ label, value, icon: Icon }) {
  const color = value >= 80 ? '#34d399' : value >= 55 ? '#7c6cf2' : value >= 35 ? '#fbbf24' : '#f87171';
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          {Icon && <Icon size={10} style={{ color }} className="opacity-70"/>}
          <span className="text-[10.5px] font-medium text-tx-faint">{label}</span>
        </div>
        <span className="num text-[11px] font-bold tabular-nums" style={{ color, letterSpacing: '-0.01em' }}>{value}</span>
      </div>
      <div className="h-[3px] w-full overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
        <div className="h-full rounded-full transition-all duration-700"
          style={{ width: `${value}%`, background: `linear-gradient(90deg,${color}70,${color})`, boxShadow: `0 0 6px ${color}40` }}/>
      </div>
    </div>
  );
}

// ─── SectionHeader ──────────────────────────────────────────────────────────────
function SectionHeader({ icon: Icon, title, action, onAction, accent = '#7c6cf2', extra }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className="flex h-[20px] w-[20px] items-center justify-center rounded-[6px]"
          style={{ background: `${accent}14`, border: `1px solid ${accent}22` }}>
          <Icon size={10} style={{ color: accent }}/>
        </div>
        <span className="text-[10.5px] font-semibold tracking-[0.05em] text-tx-faint">{title}</span>
        {extra}
      </div>
      {action && (
        <button onClick={onAction}
          className="group/btn flex items-center gap-1 rounded-[8px] px-2.5 py-[4px] text-[10.5px] font-semibold transition-all duration-150"
          style={{ background: `${accent}14`, border: `1px solid ${accent}28`, color: accent }}
          onMouseEnter={e => { e.currentTarget.style.background = `${accent}22`; e.currentTarget.style.boxShadow = `0 0 14px ${accent}20`; }}
          onMouseLeave={e => { e.currentTarget.style.background = `${accent}14`; e.currentTarget.style.boxShadow = 'none'; }}>
          {action}
          <ArrowRight size={8} className="transition-transform duration-150 group-hover/btn:translate-x-0.5"/>
        </button>
      )}
    </div>
  );
}

// ─── Reactive theme hook — re-renders whenever the html class changes ─────────
function useIsLight() {
  const [isLight, setIsLight] = useState(() => document.documentElement.classList.contains('theme-light'));
  useEffect(() => {
    const obs = new MutationObserver(() =>
      setIsLight(document.documentElement.classList.contains('theme-light'))
    );
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  return isLight;
}

// ─── Card ────────────────────────────────────────────────────────────────────────
function Card({ children, className = '', noPad = false, accentColor }) {
  const isLight = useIsLight();
  return (
    <div className={`fl-home-card fl-home-surface fl-home-chart-card relative overflow-hidden rounded-[16px] ${noPad ? '' : 'p-5'} ${className}`}
      style={isLight ? {
        background: '#FFFFFF',
        backdropFilter: 'none',
        WebkitBackdropFilter: 'none',
        borderRadius: '18px',
      } : {
        background: 'linear-gradient(160deg,rgba(255,255,255,0.050) 0%,rgba(255,255,255,0.018) 100%)',
        backdropFilter: 'blur(24px) saturate(1.3)',
        WebkitBackdropFilter: 'blur(24px) saturate(1.3)',
      }}
      data-accent-color={accentColor || ''}>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{ background: isLight
          ? 'linear-gradient(90deg,transparent 5%,rgba(91,76,240,0.12) 40%,rgba(91,76,240,0.12) 60%,transparent 95%)'
          : 'linear-gradient(90deg,transparent 5%,rgba(255,255,255,0.09) 40%,rgba(255,255,255,0.09) 60%,transparent 95%)' }}/>
      {children}
    </div>
  );
}

// ─── TypeBadge ──────────────────────────────────────────────────────────────────
function TypeBadge({ label, color }) {
  return (
    <span className="rounded-[5px] px-1.5 py-0.5 text-[8.5px] font-semibold uppercase tracking-[0.06em]"
      style={{ background: `${color}14`, border: `1px solid ${color}22`, color }}>
      {label}
    </span>
  );
}

// ─── Skeleton ───────────────────────────────────────────────────────────────────
function Skeleton({ className = '' }) {
  return <div className={`animate-pulse rounded-lg ${className}`} style={{ background: 'rgba(255,255,255,0.05)' }}/>;
}

// ─── EmptyState ─────────────────────────────────────────────────────────────────
function EmptyState({ icon: Icon, title, hint, onAction, actionLabel, color = '#7c6cf2' }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-[10px] border border-white/[0.07]"
        style={{ background: `${color}0E` }}>
        <Icon size={16} style={{ color, opacity: 0.55 }}/>
      </div>
      <p className="text-[11.5px] font-semibold text-tx-faint">{title}</p>
      {hint && <p className="mt-1 text-[10.5px] max-w-[160px] leading-relaxed text-tx-faint opacity-55">{hint}</p>}
      {onAction && (
        <button onClick={onAction}
          className="mt-3 flex items-center gap-1 rounded-[8px] px-3 py-1.5 text-[10.5px] font-semibold transition-all duration-150"
          style={{ background: `${color}14`, border: `1px solid ${color}28`, color }}
          onMouseEnter={e => { e.currentTarget.style.background = `${color}22`; }}
          onMouseLeave={e => { e.currentTarget.style.background = `${color}14`; }}>
          <Plus size={9}/>{actionLabel}
        </button>
      )}
    </div>
  );
}

// ─── QuickAction ────────────────────────────────────────────────────────────────
function QuickAction({ icon: Icon, label, onClick, color = '#7c6cf2', compact = false }) {
  return (
    <button onClick={onClick}
      className="flex items-center gap-1.5 rounded-[8px] transition-all duration-150"
      style={{
        padding: compact ? '4px 8px' : '5px 10px',
        fontSize: compact ? '10px' : '10.5px',
        fontWeight: 600,
        background: `${color}12`,
        border: `1px solid ${color}25`,
        color,
      }}
      onMouseEnter={e => { e.currentTarget.style.background = `${color}22`; e.currentTarget.style.boxShadow = `0 0 12px ${color}1A`; }}
      onMouseLeave={e => { e.currentTarget.style.background = `${color}12`; e.currentTarget.style.boxShadow = 'none'; }}>
      <Icon size={compact ? 9 : 10}/>
      {label}
    </button>
  );
}

// ─── InsightCard ────────────────────────────────────────────────────────────────
function InsightCard({ icon: Icon, color, children }) {
  return (
    <div className="group/insight relative overflow-hidden rounded-[10px] border border-white/[0.06] px-3 py-2.5 transition-all hover:border-white/[0.10]"
      style={{ background: 'rgba(255,255,255,0.018)' }}>
      <div className="absolute inset-y-0 left-0 w-[2px] rounded-r-full"
        style={{ background: `linear-gradient(180deg,${color}dd,${color}22)` }}/>
      <div className="flex items-start gap-2.5 pl-0.5">
        <div className="mt-0.5 flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-[6px]"
          style={{ background: `${color}14`, border: `1px solid ${color}22` }}>
          <Icon size={9} style={{ color }}/>
        </div>
        <p className="text-[11px] leading-[1.6] font-medium text-tx-faint">{children}</p>
      </div>
    </div>
  );
}

// ─── HourBar (24-hour activity heatmap strip) ───────────────────────────────────
function HourBar({ buckets = [], color = '#7c6cf2' }) {
  const now = new Date().getHours();
  const max = Math.max(...buckets, 1);
  return (
    <div className="flex items-end gap-px h-6">
      {buckets.map((v, h) => {
        const intensity = v / max;
        const isPast    = h < now;
        const isCurrent = h === now;
        return (
          <div key={h}
            title={`${h}:00 — ${fmtDur(v)}`}
            className="flex-1 rounded-[2px] transition-all duration-300"
            style={{
              height: `${Math.max(3, intensity * 100)}%`,
              background: v > 0
                ? (isCurrent ? color : `${color}${Math.round(isPast ? 40 + intensity * 80 : 30).toString(16).padStart(2,'0')}`)
                : 'rgba(255,255,255,0.04)',
              boxShadow: isCurrent && v > 0 ? `0 0 6px ${color}66` : 'none',
            }}/>
        );
      })}
    </div>
  );
}

// ─── ActiveSessionBanner ────────────────────────────────────────────────────────
function ActiveSessionBanner({ session, onStop, onNavigate }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!session) return;
    const tick = () => setElapsed(Math.floor(Date.now()/1000) - session.started_at);
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [session]);
  if (!session) return null;
  return (
    <div className="relative overflow-hidden rounded-[12px] border px-4 py-2.5 flex items-center gap-3"
      style={{ background: 'rgba(52,211,153,0.07)', borderColor: 'rgba(52,211,153,0.22)', boxShadow: '0 0 24px rgba(52,211,153,0.08)' }}>
      <div className="absolute inset-x-0 top-0 h-px"
        style={{ background: 'linear-gradient(90deg,transparent 5%,rgba(52,211,153,0.5) 50%,transparent 95%)' }}/>
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px]"
        style={{ background: 'rgba(52,211,153,0.14)', border: '1px solid rgba(52,211,153,0.25)' }}>
        <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"/>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-semibold text-emerald-400 truncate">
          {session.title || session.category || 'Focus Session'} — Live
        </p>
        <p className="num text-[10px] font-mono text-tx-faint">
          {fmtTime(session.started_at)} · {fmtDur(elapsed)} elapsed
        </p>
      </div>
      <div className="flex items-center gap-2">
        <QuickAction icon={BarChart2} label="View" onClick={() => onNavigate?.('tracker')} color="#34d399" compact/>
        {onStop && (
          <button onClick={onStop}
            className="rounded-[7px] px-2.5 py-1 text-[10.5px] font-semibold transition-all"
            style={{ background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.24)', color: '#f87171' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(248,113,113,0.22)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(248,113,113,0.12)'; }}>
            Stop
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────────
export default function HomePage({ user, onNavigate }) {
  const { profile } = useAuth() || {};
  const accountName =
    [profile?.first_name || user.first_name, profile?.last_name || user.last_name].filter(Boolean).join(' ')
    || profile?.full_name
    || user.full_name
    || user.username
    || user.email
    || 'there';

  const [dateKey,        setDateKey]        = useState(localDateStr());
  const [autoSessions,   setAutoSessions]   = useState([]);
  const [prevAuto,       setPrevAuto]       = useState([]);
  const [manualSessions, setManualSessions] = useState([]);
  const [projects,       setProjects]       = useState([]);
  const [clients,        setClients]        = useState([]);
  const [calEvents,      setCalEvents]      = useState([]);
  const [activeSession,  setActiveSession]  = useState(null);

  // Adaptive behavioral intelligence — synchronous, localStorage reads
  const behavioralKPIs  = useMemo(() => { try { return getDashboardBehavioralKPIs(); } catch { return null; } }, []);
  const weeklyReview    = useMemo(() => { try { return getWeeklyBehavioralReview(); } catch { return null; } }, []);
  const topRec          = useMemo(() => { try { return generateAdaptiveRecommendations()[0] || null; } catch { return null; } }, []);
  const [loading,        setLoading]        = useState(true);
  const [refreshing,     setRefreshing]     = useState(false);
  const lastLoadRef = useRef(0);

  const isToday  = dateKey === localDateStr();
  const todayStr = localDateStr();

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    const dayStart = new Date(dateKey); dayStart.setHours(0, 0, 0, 0);
    const from = Math.floor(dayStart.getTime() / 1000);
    const to   = isToday ? Math.floor(Date.now() / 1000) : from + 86399;
    try {
      const [auto, manual, prev, projs, clientList, calEvs, activeSess] = await Promise.all([
        api.autoSessionsByDate?.({ userId: user.id, dateKey }).catch(() => []),
        api.listSessions?.({ userId: user.id, from, to }).catch(() => []),
        api.autoSessionsRange?.({ userId: user.id, from: from - 86400, to: from }).catch(() => []),
        api.listProjects?.({ userId: user.id }).catch(() => []),
        api.listClients?.({ userId: user.id }).catch(() => []),
        api.calendarList?.({ userId: user.id, from, to }).catch(() => []),
        isToday ? api.activeSession?.({ userId: user.id }).catch(() => null) : Promise.resolve(null),
      ]);
      setAutoSessions(auto || []);
      setManualSessions(manual || []);
      setPrevAuto(prev || []);
      setProjects(projs || []);
      setClients(clientList || []);
      setCalEvents(calEvs || []);
      setActiveSession(activeSess || null);
      lastLoadRef.current = Date.now();
    } finally { setLoading(false); setRefreshing(false); }
  }, [user.id, dateKey, isToday]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!isToday) return;
    const t = setInterval(() => load(true), 30_000);
    return () => clearInterval(t);
  }, [isToday, load]);

  const handleRefresh = useCallback(async () => {
    if (refreshing) return;
    await load(true);
    pushToast('info', 'Home refreshed', 'Latest dashboard data loaded.', {
      duration: 1800,
      relatedPage: 'home',
    });
  }, [load, refreshing]);

  // ── Derived ────────────────────────────────────────────────────────────────────
  const active      = useMemo(() => autoSessions.filter(s => !s.is_idle && (s.duration_seconds || 0) > 0), [autoSessions]);
  const prevActive  = useMemo(() => prevAuto.filter(s => !s.is_idle && (s.duration_seconds || 0) > 0), [prevAuto]);
  const totalSecs   = useMemo(() => active.reduce((a, s) => a + (s.duration_seconds || 0), 0), [active]);
  const prevTotal   = useMemo(() => prevActive.reduce((a, s) => a + (s.duration_seconds || 0), 0), [prevActive]);

  const byType = useMemo(() => {
    const map = {};
    active.forEach(s => { const t = classifyApp(s.app_name || '').type; map[t] = (map[t] || 0) + (s.duration_seconds || 0); });
    return map;
  }, [active]);
  const deepSecs = byType.deep || 0;
  const meetingSecs = byType.meeting || 0;
  const distractSecs = byType.distraction || 0;

  const prodScore   = useMemo(() => !totalSecs ? 0 : Math.max(0, Math.min(100, Math.round((deepSecs/totalSecs)*100 - (distractSecs/totalSecs)*50 + Math.min(totalSecs/3600,4)*2))), [totalSecs, deepSecs, distractSecs]);
  const focusScore  = totalSecs > 0 ? Math.min(100, Math.round((deepSecs/totalSecs)*140)) : 0;
  const timeScore   = Math.min(100, Math.round((Math.min(totalSecs/3600,8)/8)*100));
  const distractScore = totalSecs > 0 ? Math.max(0, Math.round(100-(distractSecs/totalSecs)*160)) : 100;

  const appsBreakdown = useMemo(() => {
    const map = {};
    active.forEach(s => {
      const key = (s.app_name || 'Unknown').trim();
      if (!map[key]) map[key] = { name: key, secs: 0, cls: classifyActivitySession(s), url: s.url || '' };
      if (!map[key].url && s.url) map[key].url = s.url;
      map[key].secs += s.duration_seconds || 0;
    });
    const tot = Object.values(map).reduce((a, v) => a + v.secs, 0) || 1;
    return Object.values(map).sort((a, b) => b.secs - a.secs).slice(0, 7)
      .map(a => ({ ...a, pct: Math.round((a.secs/tot)*100) }));
  }, [active]);

  // Aggregate apps into categories — keyed by categoryKey so each category gets
  // exactly one entry with the canonical color from SMART_CATEGORY_DEFS.
  const categoryBreakdown = useMemo(() => {
    const map = {};
    appsBreakdown.forEach(a => {
      const key = a.cls.categoryKey || a.cls.label;
      if (!map[key]) map[key] = {
        label: a.cls.label,
        color: SMART_CATEGORY_DEFS[key]?.color ?? a.cls.color,
        secs: 0,
      };
      map[key].secs += a.secs;
    });
    const tot = appsBreakdown.reduce((s, a) => s + a.secs, 0) || 1;
    return Object.values(map)
      .sort((a, b) => b.secs - a.secs)
      .map(c => ({ ...c, pct: Math.round((c.secs / tot) * 100) }));
  }, [appsBreakdown]);

  // Donut uses category data → one slice per category, no duplicates
  const pieData = categoryBreakdown.map(c => ({ name: c.label, value: c.secs, color: c.color }));

  const timeline = useMemo(() => {
    const map = {};
    active.forEach(s => {
      const dur = (s.duration_seconds > 0) ? s.duration_seconds : (s.ended_at && s.started_at ? Math.max(0, s.ended_at - s.started_at) : 0);
      const key = (s.app_name || 'Unknown').trim();
      if (!map[key]) map[key] = { ...s, totalDur: 0 };
      map[key].totalDur += dur;
    });
    return Object.values(map).sort((a, b) => b.totalDur - a.totalDur).slice(0, 5)
      .map(s => ({ ...s, duration_seconds: s.totalDur }));
  }, [active]);

  const hourlyBuckets = useMemo(() => {
    const b = Array(24).fill(0);
    active.forEach(s => { const h = new Date((s.started_at||0)*1000).getHours(); if (h >= 0 && h < 24) b[h] += s.duration_seconds || 0; });
    return b;
  }, [active]);

  const peakHour = useMemo(() => {
    const max = Math.max(...hourlyBuckets);
    if (!max) return null;
    const idx = hourlyBuckets.indexOf(max);
    const s = new Date(); s.setHours(idx, 0, 0, 0);
    const e = new Date(); e.setHours(idx + 1, 0, 0, 0);
    return { label: `${s.toLocaleTimeString([], { hour:'numeric', hour12:true })} – ${e.toLocaleTimeString([], { hour:'numeric', hour12:true })}`, idx };
  }, [hourlyBuckets]);

  const focusSessions = useMemo(() =>
    manualSessions.filter(s => (s.category || '').toLowerCase() !== 'meeting')
      .sort((a, b) => b.started_at - a.started_at).slice(0, 3),
  [manualSessions]);
  const focusSecs = useMemo(() => focusSessions.reduce((a, s) => a + (s.ended_at&&s.started_at ? Math.max(0,s.ended_at-s.started_at) : 0), 0), [focusSessions]);

  const meetings = useMemo(() => {
    const nowTs = Math.floor(Date.now() / 1000);
    const calMtgs = (calEvents || []).filter(isMeetingEvent).map(e => ({
      _key: `cal_${e.id}`, title: e.title || 'Calendar Event', started_at: e.start_time, ended_at: e.end_time,
      source: 'calendar', color: e.color || '#a78bfa', location: e.location || null, meeting_url: e.meeting_url || null,
      isUpcoming: e.start_time > nowTs,
    }));
    const sessMtgs = (manualSessions || []).filter(s => (s.category||'').toLowerCase() === 'meeting').map(s => ({
      _key: `sess_${s.id}`, title: s.title || 'Meeting', started_at: s.started_at, ended_at: s.ended_at,
      source: 'manual', color: '#f87171', location: null, meeting_url: null, isUpcoming: false,
    }));
    const usedTitles = new Set(calMtgs.map(m => (m.title||'').toLowerCase()));
    return [...calMtgs, ...sessMtgs.filter(s => !usedTitles.has((s.title||'').toLowerCase()))]
      .sort((a, b) => (a.started_at||0) - (b.started_at||0));
  }, [calEvents, manualSessions]);

  const totalMeetingsSecs = useMemo(() => meetings.reduce((a, m) => a + (m.ended_at&&m.started_at ? Math.max(0,m.ended_at-m.started_at) : 0), 0), [meetings]);

  const projectsWithTime = useMemo(() => {
    const timeMap = {};
    manualSessions.forEach(s => { if (s.project_id && s.ended_at && s.started_at) timeMap[s.project_id] = (timeMap[s.project_id]||0) + Math.max(0,s.ended_at-s.started_at); });
    const todayTotal = Object.values(timeMap).reduce((a, v) => a+v, 0) || 1;
    return (projects || []).map(p => {
      const client = (clients||[]).find(c => c.id === p.client_id);
      const secs   = timeMap[p.id] || 0;
      return { ...p, secs, pct: secs > 0 ? Math.round((secs/todayTotal)*100) : 0, clientName: client?.name || null };
    }).sort((a, b) => (b.secs - a.secs) || (a.name||'').localeCompare(b.name||'')).slice(0, 5);
  }, [projects, manualSessions, clients]);

  const spark4h = [0, 4, 8, 12, 16, 20].map(h => hourlyBuckets.slice(h, h+4).reduce((a,v)=>a+v,0));
  const totalTrend = trendLabel(totalSecs, prevTotal);

  const yestDate = new Date(); yestDate.setDate(yestDate.getDate()-1);
  const yestStr  = localDateStr(Math.floor(yestDate.getTime()/1000));
  const dateLabel = dateKey === todayStr
    ? `Today · ${new Date().toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })}`
    : dateKey === yestStr
      ? `Yesterday · ${new Date(dateKey+'T12:00').toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })}`
      : new Date(dateKey+'T12:00').toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric', year:'numeric' });

  const goDay = delta => {
    const d = new Date(dateKey); d.setDate(d.getDate() + delta);
    const n = localDateStr(Math.floor(d.getTime()/1000));
    if (n <= todayStr) setDateKey(n);
  };

  const PROJ_COLORS = ['#818cf8','#60a5fa','#34d399','#fbbf24','#f87171','#a78bfa'];
  const scoreColor  = prodScore >= 70 ? '#34d399' : prodScore >= 40 ? '#fbbf24' : '#f87171';
  const scoreName   = prodScore >= 80 ? 'Excellent' : prodScore >= 60 ? 'Solid' : prodScore >= 40 ? 'Building' : 'Light day';

  const upcomingMeeting = useMemo(() => {
    const nowTs = Math.floor(Date.now() / 1000);
    return meetings.find(m => m.started_at > nowTs && m.started_at - nowTs < 1800);
  }, [meetings]);

  const nowTs = Math.floor(Date.now() / 1000);

  // ─── Animated KPI values ──────────────────────────────────────────────────────
  const animTotal = useAnimatedValue(loading ? 0 : Math.round(totalSecs / 60));
  const animDeep  = useAnimatedValue(loading ? 0 : Math.round(deepSecs / 60));
  const animScore = useAnimatedValue(loading ? 0 : prodScore);

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="fl-home-page flex h-full flex-col overflow-hidden">

      {/* ── Header ─────────────────────────────────────────────────────────────── */}
      <div className="fl-home-header drag-region relative shrink-0 border-b border-white/[0.04] px-6 py-4"
        style={{ background: 'linear-gradient(180deg,rgba(11,13,21,0.88) 0%,rgba(10,12,19,0.72) 100%)', backdropFilter: 'blur(24px)' }}>
        {/* Top hairline — soft, not neon */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px"
          style={{ background: 'linear-gradient(90deg,transparent 10%,rgba(124,108,242,0.22) 38%,rgba(139,92,246,0.28) 50%,rgba(96,165,250,0.14) 62%,transparent 90%)' }}/>
        {/* Ambient glow — tight to the greeting, not a wide block */}
        <div className="fl-home-header-ambient pointer-events-none absolute inset-x-0 -top-2 h-16"
          style={{ background: 'radial-gradient(ellipse at 28% 60%,rgba(124,108,242,0.15),transparent 52%),radial-gradient(ellipse at 58% 20%,rgba(96,165,250,0.07),transparent 44%)' }}/>
        {/* Feather into page — very short, barely perceptible */}
        <div className="pointer-events-none absolute inset-x-0 bottom-[-10px] h-[10px]"
          style={{ background: 'linear-gradient(180deg,rgba(124,108,242,0.03),transparent)' }}/>

        <div className="no-drag relative flex items-center justify-between gap-6">
          <div className="min-w-0 flex items-center gap-3">
            <div>
              <h1 className="text-[22px] font-semibold leading-tight text-tx-primary" style={{ letterSpacing: '-0.025em' }}>
                {getGreeting()},{' '}
                <span style={{
                  background: 'linear-gradient(130deg,#e2d9ff 0%,#c4b5fd 45%,#a78bfa 100%)',
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', fontWeight: 700,
                }}>
                  {accountName.split(' ')[0]}
                </span>
              </h1>
              <p className="mt-0.5 text-[11.5px] font-medium text-tx-faint">
                {isToday ? 'Your productivity command center.' : `Reviewing ${dateLabel}.`}
              </p>
            </div>
            {/* Live status badges */}
            <div className="flex items-center gap-2 flex-wrap">
              {!loading && totalSecs > 0 && (
                <span className="rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold"
                  style={{ background: 'rgba(124,108,242,0.12)', border: '1px solid rgba(124,108,242,0.22)', color: 'rgba(124,108,242,0.95)' }}>
                  {fmtDur(totalSecs)} tracked
                </span>
              )}
              {upcomingMeeting && (
                <span className="flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold"
                  style={{ background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.24)', color: '#f87171' }}>
                  <Video size={9}/>
                  {upcomingMeeting.title} in {Math.round((upcomingMeeting.started_at - nowTs)/60)}m
                </span>
              )}
            </div>
          </div>

          <div className="no-drag flex items-center gap-2">
            <button onClick={handleRefresh} disabled={refreshing}
              className="flex h-7 w-7 items-center justify-center rounded-[8px] text-tx-faint transition hover:bg-white/[0.07] hover:text-tx-primary disabled:opacity-40"
              style={{ border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.025)' }}
              title="Refresh">
              <RefreshCw size={11} className={refreshing ? 'animate-spin' : ''}/>
            </button>
            <div className="flex items-center overflow-hidden rounded-[10px] border border-white/[0.07]"
              style={{ background: 'rgba(255,255,255,0.025)' }}>
              <button onClick={() => goDay(-1)} className="flex h-7 w-7 items-center justify-center text-tx-faint transition hover:bg-white/[0.06] hover:text-tx-primary">
                <ChevronLeft size={13}/>
              </button>
              <span className="px-2.5 text-[11.5px] font-medium whitespace-nowrap text-tx-primary" style={{ letterSpacing: '-0.01em' }}>{dateLabel}</span>
              <button onClick={() => goDay(1)} disabled={isToday}
                className="flex h-7 w-7 items-center justify-center text-tx-faint transition hover:bg-white/[0.06] hover:text-tx-primary disabled:pointer-events-none disabled:opacity-20">
                <ChevronRight size={13}/>
              </button>
            </div>
            {!isToday && (
              <button onClick={() => setDateKey(todayStr)}
                className="rounded-[10px] px-3 py-1.5 text-[11.5px] font-semibold transition-all"
                style={{ background: 'rgba(124,108,242,0.14)', border: '1px solid rgba(124,108,242,0.24)', color: '#8B7CF6' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(124,108,242,0.22)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(124,108,242,0.14)'; }}>
                Today
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-6 pb-8" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.07) transparent' }}>

        {/* Active session banner */}
        {isToday && activeSession && (
          <div className="pt-5">
            <ActiveSessionBanner session={activeSession} onNavigate={onNavigate}/>
          </div>
        )}

        {/* ── KPI strip ──────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-5 gap-3 pt-5">
          <KpiCard label="Total Time" Icon={Clock} color="#8B7CF6" trend={totalTrend}
            value={loading ? '—' : fmtDur(totalSecs)}
            sub={totalTrend ? `${totalTrend.up?'+':'-'}${totalTrend.pct}% vs yesterday` : (loading ? 'Loading…' : 'First data point')}
            subUp={totalTrend?.up} sparkData={spark4h}/>

          <KpiCard label="Deep Focus" Icon={Zap} color="#818cf8"
            value={loading ? '—' : fmtDur(deepSecs)}
            sub={loading ? 'Loading…' : totalSecs > 0 ? `${Math.round((deepSecs/totalSecs)*100)}% of tracked` : 'Start tracking'}
            subUp={totalSecs > 0 ? deepSecs/totalSecs > 0.4 : undefined}
            sparkData={spark4h.map(v => v * 0.55)}/>

          <KpiCard label="Meetings" Icon={Users} color="#f87171"
            value={loading ? '—' : meetings.length > 0 ? String(meetings.length) : fmtDur(meetingSecs)}
            sub={loading ? 'Loading…' : meetings.length > 0 ? `${fmtDur(totalMeetingsSecs)} · ${meetings.length} total` : 'No meetings today'}
            sparkData={spark4h.map(v => v * 0.2)}/>

          <KpiCard label="Sessions" Icon={Timer} color="#34d399"
            value={loading ? '—' : focusSessions.length || '—'}
            sub={loading ? 'Loading…' : focusSecs > 0 ? `${fmtDur(focusSecs)} logged` : 'No sessions yet'}
            sparkData={spark4h.map(v => v * 0.3)}/>

          {/* Score KPI */}
          <div className="fl-home-surface fl-home-kpi relative overflow-hidden rounded-[16px] transition-all duration-300 cursor-default"
            style={{ background: `linear-gradient(145deg, ${scoreColor}18 0%, ${scoreColor}0D 36%, rgba(255,255,255,0.026) 100%)`, border: `1px solid ${scoreColor}2D`, backdropFilter: 'blur(24px)', padding: '16px', boxShadow: `inset 0 1px 0 rgba(255,255,255,0.08),0 4px 16px rgba(0,0,0,0.28),0 16px 40px rgba(0,0,0,0.18),0 0 28px ${scoreColor}0B` }}
            data-accent-color={scoreColor}>
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px" style={{ background: `linear-gradient(90deg,transparent 10%,${scoreColor}55 40%,${scoreColor}99 50%,${scoreColor}55 60%,transparent 90%)` }}/>
            <div className="pointer-events-none absolute -right-4 -top-5 h-20 w-20 rounded-full blur-3xl opacity-[0.26]" style={{ background: scoreColor }}/>
            <div className="pointer-events-none absolute -bottom-8 left-3 h-16 w-28 rounded-full blur-3xl opacity-[0.08]" style={{ background: scoreColor }}/>
            <div className="relative flex items-center justify-between gap-2">
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-[0.09em] text-tx-faint">Prod. Score</span>
                <p className="num mt-2 text-[26px] font-bold leading-none text-tx-primary" style={{ letterSpacing: '-0.025em' }}>
                  {loading ? '—' : animScore}<span className="text-[13px] font-normal text-tx-faint">/100</span>
                </p>
                <p className="mt-1 text-[10.5px] font-semibold" style={{ color: scoreColor }}>{loading ? 'Calculating…' : scoreName}</p>
              </div>
              <div className="relative shrink-0">
                <DonutRing value={loading ? 0 : prodScore} color={scoreColor} size={52} thickness={5} glow/>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="num text-[11px] font-bold" style={{ color: scoreColor }}>{loading ? '—' : animScore}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Adaptive behavioral intelligence strip ────────────────────────── */}
        {behavioralKPIs && behavioralKPIs.maturityLevel !== 'learning' && (
          <div className="mt-3 grid grid-cols-3 gap-3">
            {/* Peak window */}
            <div className="rounded-xl border px-3.5 py-2.5 flex items-start gap-3"
              style={{ background:'rgba(52,211,153,0.05)', borderColor:'rgba(52,211,153,0.18)' }}>
              <Zap size={13} className="shrink-0 mt-0.5" style={{ color:'#34D399' }}/>
              <div className="min-w-0">
                <p className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color:'#34D399' }}>Peak Focus Window</p>
                <p className="text-[12px] font-bold text-white">{behavioralKPIs.peakWindow || 'Learning…'}</p>
                <p className="text-[9.5px] mt-0.5" style={{ color:'#5A6A88' }}>Learned from your patterns</p>
              </div>
            </div>
            {/* Burnout status */}
            <div className="rounded-xl border px-3.5 py-2.5 flex items-start gap-3"
              style={{ background: behavioralKPIs.burnoutRisk === 'low' ? 'rgba(52,211,153,0.05)' : 'rgba(251,191,36,0.05)', borderColor: behavioralKPIs.burnoutRisk === 'low' ? 'rgba(52,211,153,0.18)' : 'rgba(251,191,36,0.2)' }}>
              <Flame size={13} className="shrink-0 mt-0.5" style={{ color: behavioralKPIs.burnoutRisk === 'low' ? '#34D399' : '#FBBF24' }}/>
              <div className="min-w-0">
                <p className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: behavioralKPIs.burnoutRisk === 'low' ? '#34D399' : '#FBBF24' }}>Energy Status</p>
                <p className="text-[12px] font-bold capitalize" style={{ color: behavioralKPIs.burnoutRisk === 'low' ? '#34D399' : '#FBBF24' }}>{behavioralKPIs.burnoutRisk} risk · {Math.round(behavioralKPIs.burnoutFatigue)}% fatigue</p>
                <p className="text-[9.5px] mt-0.5" style={{ color:'#5A6A88' }}>{Math.round(behavioralKPIs.weeklyHours * 10) / 10}h of {Math.round(behavioralKPIs.sustainableHours)}h sustainable</p>
              </div>
            </div>
            {/* Top recommendation */}
            {topRec ? (
              <div className="rounded-xl border px-3.5 py-2.5 flex items-start gap-3"
                style={{ background:'rgba(129,140,248,0.05)', borderColor:'rgba(129,140,248,0.2)' }}>
                <span className="text-[14px] shrink-0 mt-0.5">{topRec.icon || '💡'}</span>
                <div className="min-w-0">
                  <p className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color:'#818CF8' }}>AI Recommendation</p>
                  <p className="text-[10.5px] font-semibold text-white leading-tight">{topRec.title}</p>
                  <p className="text-[9.5px] mt-0.5 leading-snug" style={{ color:'#5A6A88' }}>{topRec.message}</p>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border px-3.5 py-2.5 flex items-start gap-3"
                style={{ background:'rgba(129,140,248,0.05)', borderColor:'rgba(129,140,248,0.2)' }}>
                <Brain size={13} className="shrink-0 mt-0.5" style={{ color:'#818CF8' }}/>
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color:'#818CF8' }}>Intelligence</p>
                  <p className="text-[10.5px] font-semibold text-white">{behavioralKPIs.maturityLevel} · {behavioralKPIs.overallConfidence}% confident</p>
                  <p className="text-[9.5px] mt-0.5" style={{ color:'#5A6A88' }}>{behavioralKPIs.observations} sessions learned</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── 3-column grid ──────────────────────────────────────────────────── */}
        <div className="mt-4 grid gap-3.5" style={{ gridTemplateColumns: '1.1fr 1fr 288px' }}>

          {/* ══ LEFT ══ */}
          <div className="flex flex-col gap-3.5 min-w-0">

            {/* ── Productivity Score + AI Insights ── */}
            <div className="grid grid-cols-2 gap-3.5">

              {/* Productivity Score */}
              <Card accentColor={scoreColor} className="flex flex-col">
                <SectionHeader icon={TrendingUp} title="Productivity Score" accent={scoreColor}
                  action="Details" onAction={() => onNavigate?.('productivity')}/>
                <div className="mb-3 flex items-center gap-3">
                  <div className="relative shrink-0">
                    <DonutRing value={loading ? 0 : prodScore} color={scoreColor} size={68} thickness={6} glow/>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="num text-[17px] font-extrabold leading-none" style={{ color: scoreColor }}>{loading ? '—' : animScore}</span>
                      <span className="text-[7.5px] font-semibold text-tx-faint">/100</span>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11.5px] font-semibold leading-tight text-tx-primary" style={{ letterSpacing: '-0.01em' }}>
                      {prodScore >= 80 ? 'Excellent momentum' : prodScore >= 60 ? 'Solid progress' : prodScore >= 40 ? 'Room to sharpen' : 'Building consistency'}
                    </p>
                    <div className="mt-1.5">
                      <span className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
                        style={{ background: `${scoreColor}12`, border: `1px solid ${scoreColor}22`, color: scoreColor }}>
                        {scoreName} · {Math.round((deepSecs/Math.max(totalSecs,1))*100)}% deep
                      </span>
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <ScoreBar label="Focus depth"            value={focusScore}    icon={Brain}/>
                  <ScoreBar label="Time volume"            value={timeScore}     icon={Clock}/>
                  <ScoreBar label="Distraction resistance" value={distractScore} icon={ShieldAlert}/>
                </div>
              </Card>

              {/* AI Insights */}
              <Card accentColor="#7c6cf2" className="flex flex-col">
                <div className="mb-3 flex items-center gap-2">
                  <div className="flex h-[20px] w-[20px] items-center justify-center rounded-[6px]"
                    style={{ background: 'rgba(124,108,242,0.14)', border: '1px solid rgba(124,108,242,0.22)' }}>
                    <Brain size={10} style={{ color: '#a78bfa' }}/>
                  </div>
                  <span className="text-[10.5px] font-semibold tracking-[0.04em] text-tx-secondary">AI Insights</span>
                  <span className="ml-auto rounded-full px-2 py-0.5 text-[8.5px] font-bold"
                    style={{ background: 'rgba(124,108,242,0.12)', border: '1px solid rgba(124,108,242,0.20)', color: 'rgba(167,139,250,0.90)' }}>AI</span>
                </div>
                <div className="flex flex-col gap-1.5 flex-1">
                  {loading ? (
                    <><Skeleton className="h-[38px] rounded-[10px]"/><Skeleton className="h-[38px] rounded-[10px]"/><Skeleton className="h-[38px] rounded-[10px]"/></>
                  ) : (
                    <>
                      {peakHour && (
                        <InsightCard icon={Sparkles} color="#a78bfa">
                          Peak focus: <span className="font-bold text-tx-primary">{peakHour.label}</span>
                        </InsightCard>
                      )}
                      {deepSecs > 0 && totalSecs > 0 && (
                        <InsightCard icon={Flame} color="#34d399">
                          <span className="font-bold text-tx-primary">{Math.round((deepSecs/totalSecs)*100)}%</span>
                          {deepSecs/totalSecs > 0.5 ? ' deep work — excellent.' : ' deep work. Aim for 50%+.'}
                        </InsightCard>
                      )}
                      {distractSecs > 0 && totalSecs > 0 && (
                        <InsightCard icon={ShieldAlert} color="#f59e0b">
                          <span className="font-bold text-tx-primary">{fmtDur(distractSecs)}</span> in distractions.
                          {distractSecs/totalSecs > 0.15 ? ' Try Focus Blocker.' : ' Well controlled.'}
                        </InsightCard>
                      )}
                      {meetings.length > 0 && (
                        <InsightCard icon={Calendar} color="#f87171">
                          <span className="font-bold text-tx-primary">{meetings.length} meeting{meetings.length!==1?'s':''}</span>
                          {totalMeetingsSecs > 0 ? ` · ${fmtDur(totalMeetingsSecs)} total.` : ' today.'}
                        </InsightCard>
                      )}
                      {!peakHour && deepSecs === 0 && (
                        <InsightCard icon={Sparkles} color="#7c6cf2">
                          <span className="text-tx-faint">Track your work to unlock AI insights.</span>
                        </InsightCard>
                      )}
                      <button onClick={() => onNavigate?.('productivity')}
                        className="group/btn mt-auto flex w-full items-center justify-center gap-1 rounded-[10px] border border-white/[0.06] py-1.5 text-[10.5px] font-medium text-tx-faint transition-all hover:border-accent/25 hover:bg-accent/[0.06] hover:text-accent"
                        style={{ background: 'rgba(255,255,255,0.018)' }}>
                        View all insights<ArrowRight size={8} className="opacity-60 transition-transform group-hover/btn:translate-x-0.5"/>
                      </button>
                    </>
                  )}
                </div>
              </Card>

            </div>

            {/* Focus Sessions */}
            <Card accentColor="#34d399">
              <SectionHeader icon={Target} title="Focus Sessions" accent="#34d399"
                action="Timer" onAction={() => onNavigate?.('tracker')}/>

              <div className="mb-4 grid grid-cols-3 gap-2">
                {[
                  { label: 'Total',    value: loading ? '—' : fmtDur(focusSecs),   color: '#34d399' },
                  { label: 'Sessions', value: loading ? '—' : focusSessions.length || 0, color: '#818cf8' },
                  { label: 'Quality',  value: loading ? '—' : `${Math.min(99,Math.round(focusScore*0.88))}%`, color: '#fbbf24' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="flex flex-col items-center rounded-[10px] border border-white/[0.06] py-2.5 px-2 text-center transition hover:border-white/[0.10]"
                    style={{ background: 'rgba(255,255,255,0.02)' }}>
                    <p className="num text-[17px] font-bold leading-tight" style={{ color, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>{value}</p>
                    <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.07em] text-tx-faint">{label}</p>
                  </div>
                ))}
              </div>

              {loading ? (
                <div className="space-y-2">{[1,2].map(i => <Skeleton key={i} className="h-[66px] rounded-[10px]"/>)}</div>
              ) : focusSessions.length === 0 ? (
                <EmptyState icon={Timer} title="No sessions logged" color="#34d399"
                  hint="Use the Timer to start a focus session."
                  onAction={() => onNavigate?.('tracker')} actionLabel="Start Timer"/>
              ) : (
                <div className="space-y-2">
                  {focusSessions.map((s, i) => {
                    const dur   = s.ended_at&&s.started_at ? s.ended_at-s.started_at : 0;
                    const score = Math.max(55, Math.min(99, focusScore - 5 + i * 6));
                    const sc    = score >= 85 ? '#34d399' : score >= 65 ? '#818cf8' : '#fbbf24';
                    const isDeep = dur >= 1500;
                    return (
                      <div key={s.id||i}
                        className="group/sess relative overflow-hidden rounded-[10px] border border-white/[0.06] px-3.5 py-2.5 transition-all hover:border-white/[0.10] hover:bg-white/[0.025] cursor-pointer"
                        style={{ background: 'rgba(255,255,255,0.018)' }}
                        onClick={() => onNavigate?.('tracker')}>
                        <div className="absolute left-0 inset-y-0 w-[2.5px] rounded-r-full"
                          style={{ background: `linear-gradient(180deg,${sc},${sc}33)` }}/>
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span className="num text-[9.5px] font-mono text-tx-faint">
                            {fmtTime(s.started_at)}{s.ended_at ? ` – ${fmtTime(s.ended_at)}` : ''}
                          </span>
                          <div className="flex items-center gap-1.5">
                            {isDeep && <TypeBadge label="deep" color="#818cf8"/>}
                            <span className="num text-[11px] font-bold text-tx-secondary">{Math.round(dur/60)}m</span>
                          </div>
                        </div>
                        <p className="text-[12.5px] font-semibold text-tx-primary truncate mb-2">
                          {s.title || s.category || 'Focus session'}
                        </p>
                        <div className="flex items-center gap-2.5">
                          <div className="flex-1 h-[2.5px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                            <div className="h-full rounded-full transition-all duration-700"
                              style={{ width: `${score}%`, background: `linear-gradient(90deg,${sc}55,${sc})` }}/>
                          </div>
                          <span className="num text-[11px] font-extrabold shrink-0 tabular-nums" style={{ color: sc }}>{score}</span>
                        </div>
                        {/* Hover quick action */}
                        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 opacity-0 group-hover/sess:opacity-100 transition-opacity duration-150">
                          <ArrowRight size={12} style={{ color: sc }}/>
                        </div>
                      </div>
                    );
                  })}

                  {isToday && (
                    <button onClick={() => onNavigate?.('tracker')}
                      className="group/start mt-1 flex w-full items-center justify-center gap-1.5 rounded-[10px] border border-white/[0.07] py-2 text-[10.5px] font-semibold text-tx-faint transition-all hover:border-emerald-500/25 hover:bg-emerald-500/[0.07] hover:text-emerald-400"
                      style={{ background: 'rgba(255,255,255,0.018)' }}>
                      <Play size={9} className="opacity-70"/>Start focus session
                      <ArrowRight size={8} className="opacity-50 transition-transform group-hover/start:translate-x-0.5"/>
                    </button>
                  )}
                </div>
              )}
            </Card>
          </div>

          {/* ══ CENTER ══ */}
          <div className="flex flex-col gap-3.5 min-w-0">

            {/* Apps & Websites */}
            <Card className="fl-home-apps-card" accentColor="#818cf8">
              <SectionHeader icon={BarChart2} title="Apps & Websites" accent="#818cf8"
                action="Full report" onAction={() => onNavigate?.('activity')}/>
              {loading ? (
                <div className="space-y-3">
                  <Skeleton className="h-[110px] w-[110px] rounded-full mx-auto"/>
                  <div className="space-y-2">{[1,2,3,4].map(i => (<div key={i} className="space-y-1"><div className="flex gap-2"><Skeleton className="h-2.5 flex-1 rounded"/><Skeleton className="h-2.5 w-10 rounded"/></div><Skeleton className="h-[2px] w-full rounded-full"/></div>))}</div>
                </div>
              ) : appsBreakdown.length === 0 ? (
                <EmptyState icon={Monitor} title="No app data yet" color="#818cf8"
                  hint="Enable auto-tracking to see your app usage."/>
              ) : (
                <>
                  {/* ── Analytics row: donut left │ categories right ── */}
                  <div className="fl-home-apps-analytics-row">

                    {/* Left — donut chart */}
                    <div className="fl-home-apps-donut-col">
                      {/*
                        Outer shell: explicit 140×140 box that both layers share.
                        flexShrink:0 stops the flex column from squeezing it.
                      */}
                      {/* Donut + centered label — single relative container, no Recharts wrapper */}
                      <div style={{ position: 'relative', width: 140, height: 140, flexShrink: 0 }}>

                        {/* SVG donut — sits flush at inset 0, no phantom gap */}
                        <CategoryDonut data={pieData} size={140} thickness={7} />

                        {/* Center label — flex-centered over the same 140×140 area.
                            gap replaces marginTop so flexbox measures the true group height. */}
                        <div style={{
                          position: 'absolute',
                          inset: 0,
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 4,
                          pointerEvents: 'none',
                        }}>
                          <span className="num text-tx-primary" style={{
                            fontSize: 18, fontWeight: 600,
                            letterSpacing: '-0.02em',
                            lineHeight: 1, whiteSpace: 'nowrap',
                          }}>
                            {fmtDurCenter(totalSecs)}
                          </span>
                          <span style={{
                            fontSize: 11, fontWeight: 500,
                            lineHeight: 1, whiteSpace: 'nowrap',
                            color: 'var(--tx-secondary, #94a3b8)',
                          }}>
                            Tracked Today
                          </span>
                        </div>

                      </div>
                    </div>

                    {/* Right — category breakdown */}
                    <div className="fl-home-apps-cat-col">
                      {categoryBreakdown.map((c, i) => (
                        <div key={i} style={{ minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, minWidth: 0 }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: c.color, boxShadow: `0 0 5px ${c.color}55` }}/>
                            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 10.5, fontWeight: 600, color: 'var(--tx-secondary, #94a3b8)' }}>{c.label}</span>
                            <span className="num" style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 700, color: c.color }}>{c.pct}%</span>
                          </div>
                          {/* Track: natural block width; fill uses scaleX so it never depends on containing-block resolution */}
                          <div style={{ position: 'relative', height: 3, borderRadius: 99, overflow: 'hidden', background: 'rgba(255,255,255,0.09)' }}>
                            <div style={{
                              position: 'absolute', top: 0, left: 0,
                              height: '100%', width: '100%',
                              borderRadius: 99,
                              background: `linear-gradient(90deg, ${c.color}66, ${c.color})`,
                              transformOrigin: 'left center',
                              transform: `scaleX(${c.pct / 100})`,
                              transition: 'transform 500ms cubic-bezier(0.22,1,0.36,1)',
                            }}/>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* ── Application usage list ── */}
                  <div className="fl-home-apps-list">
                    {appsBreakdown.slice(0, 6).map((a, i) => (
                      <button key={i} onClick={() => onNavigate?.('activity')}
                        className="fl-home-app-row group/app" style={{ '--app-color': a.cls.color }}>
                        {/* Line 1: rank + icon + name */}
                        <div className="flex items-center gap-2">
                          <div className="fl-home-app-rank shrink-0">{i + 1}</div>
                          <AppIcon appName={a.name} url={a.url} size={22} radius={5}/>
                          <span className="min-w-0 flex-1 truncate text-[11.5px] font-bold text-tx-primary">{a.name}</span>
                        </div>
                        {/* Line 2: usage bar */}
                        <div className="mt-1.5" style={{ paddingLeft: 50 }}>
                          <div style={{ width: '100%', height: 3, borderRadius: 99, overflow: 'hidden', background: 'rgba(255,255,255,0.09)' }}>
                            <div style={{
                              height: '100%',
                              width: `${a.pct}%`,
                              borderRadius: 99,
                              background: `linear-gradient(90deg, ${a.cls.color}66, ${a.cls.color})`,
                              transition: 'width 500ms cubic-bezier(0.22,1,0.36,1)',
                            }}/>
                          </div>
                        </div>
                        {/* Line 3: duration · percentage */}
                        <div className="mt-1 flex items-center gap-1" style={{ paddingLeft: 50 }}>
                          <span className="num text-[10px] font-semibold text-tx-secondary">{fmtDur(a.secs)}</span>
                          <span className="text-[9px] text-tx-faint">·</span>
                          <span className="num text-[10px] font-extrabold" style={{ color: a.cls.color }}>{a.pct}%</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </Card>

          </div>

          {/* ══ RIGHT ══ */}
          <div className="flex flex-col gap-3.5 min-w-0">

            {/* Projects */}
            <Card accentColor="#60a5fa">
              <SectionHeader icon={Briefcase} title="Projects" accent="#60a5fa"
                action="All" onAction={() => onNavigate?.('projects')}
                extra={!loading && projects.length > 0 && (
                  <span className="ml-1.5 rounded-full px-1.5 py-0.5 text-[8.5px] font-bold"
                    style={{ background: 'rgba(96,165,250,0.12)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.20)' }}>
                    {projects.length}
                  </span>
                )}/>
              {loading ? (
                <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-[62px] rounded-[10px]"/>)}</div>
              ) : projects.length === 0 ? (
                <EmptyState icon={Briefcase} title="No projects yet" color="#60a5fa"
                  hint="Create a project to track time against it."
                  onAction={() => onNavigate?.('projects')} actionLabel="New Project"/>
              ) : (
                <div className="space-y-1.5">
                  {projectsWithTime.map((p, i) => {
                    const color  = p.color || PROJ_COLORS[i % PROJ_COLORS.length];
                    const maxSec = projectsWithTime.find(x => x.secs > 0)?.secs || 1;
                    const barW   = p.secs > 0 ? Math.max(6, Math.round((p.secs/maxSec)*100)) : 0;
                    return (
                      <div key={p.id}
                        className="group/proj relative rounded-[10px] border border-white/[0.05] p-2.5 transition-all hover:border-white/[0.11] hover:bg-white/[0.03] cursor-pointer"
                        style={{ background: 'rgba(255,255,255,0.018)' }}
                        onClick={() => onNavigate?.('projects')}>
                        <div className="mb-2 flex items-center gap-2">
                          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] text-[9px] font-extrabold"
                            style={{ background: `${color}20`, color }}>
                            {(p.name||'P').slice(0,2).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="truncate text-[11.5px] font-semibold text-tx-primary">{p.name}</p>
                            {p.clientName && <p className="truncate text-[9.5px] text-tx-faint">{p.clientName}</p>}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="num text-[10.5px] font-bold shrink-0"
                              style={{ color: p.secs > 0 ? 'var(--tx-secondary,#94a3b8)' : 'rgba(148,163,184,0.3)' }}>
                              {p.secs > 0 ? fmtDur(p.secs) : '—'}
                            </span>
                            <ArrowRight size={10} className="text-tx-faint opacity-0 group-hover/proj:opacity-60 transition-opacity duration-150"/>
                          </div>
                        </div>
                        {p.secs > 0 ? (
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-[2px] overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
                              <div className="h-full rounded-full transition-all duration-700"
                                style={{ width: `${barW}%`, background: `linear-gradient(90deg,${color}55,${color})` }}/>
                            </div>
                            <span className="num shrink-0 text-[9.5px] font-semibold text-tx-faint">{p.pct}%</span>
                          </div>
                        ) : (
                          <div className="h-[2px] w-full rounded-full" style={{ background: 'rgba(255,255,255,0.04)' }}/>
                        )}
                      </div>
                    );
                  })}
                  {projectsWithTime.some(p => p.secs > 0) && (
                    <div className="flex items-center justify-between border-t border-white/[0.05] pt-2 mt-1">
                      <span className="text-[9.5px] font-medium text-tx-faint">Project time today</span>
                      <span className="num text-[11.5px] font-bold text-tx-secondary">{fmtDur(projectsWithTime.reduce((a,p)=>a+p.secs,0))}</span>
                    </div>
                  )}
                </div>
              )}
            </Card>

            {/* Meetings */}
            <Card accentColor="#f87171">
              <SectionHeader icon={Calendar} title="Meetings" accent="#f87171"
                action="Calendar" onAction={() => onNavigate?.('calendar')}
                extra={!loading && meetings.length > 0 && (
                  <span className="ml-1.5 rounded-full px-1.5 py-0.5 text-[8.5px] font-bold"
                    style={{ background: 'rgba(248,113,113,0.12)', color: '#f87171', border: '1px solid rgba(248,113,113,0.20)' }}>
                    {meetings.length}
                  </span>
                )}/>
              {loading ? (
                <div className="space-y-1.5">
                  {[1,2].map(i => (
                    <div key={i} className="flex items-center gap-2.5 px-2.5 py-2 rounded-[10px] border border-white/[0.05]" style={{ background: 'rgba(255,255,255,0.018)' }}>
                      <Skeleton className="h-6 w-6 shrink-0 rounded-[7px]"/>
                      <div className="flex-1 space-y-1.5"><Skeleton className="h-2.5 w-3/4 rounded"/><Skeleton className="h-2 w-1/2 rounded"/></div>
                      <Skeleton className="h-2.5 w-8 shrink-0 rounded"/>
                    </div>
                  ))}
                </div>
              ) : meetings.length === 0 ? (
                <EmptyState icon={Calendar} title="No meetings today" color="#f87171"
                  hint="Connect a calendar or log a meeting session."
                  onAction={() => onNavigate?.('calendar')} actionLabel="Open Calendar"/>
              ) : (
                <div className="space-y-1.5">
                  {meetings.slice(0, 5).map((m, i) => {
                    const dur       = m.ended_at&&m.started_at ? Math.max(0,m.ended_at-m.started_at) : 0;
                    const isPast    = m.ended_at && m.ended_at < nowTs;
                    const isOngoing = m.started_at <= nowTs && (!m.ended_at || m.ended_at > nowTs);
                    const isFuture  = m.started_at > nowTs;
                    const minsUntil = isFuture ? Math.round((m.started_at - nowTs)/60) : 0;
                    return (
                      <div key={m._key||i}
                        className="relative flex items-center gap-2.5 rounded-[10px] border px-2.5 py-2 transition-all hover:bg-white/[0.03] cursor-pointer"
                        style={{ background: 'rgba(255,255,255,0.018)', borderColor: isOngoing ? 'rgba(248,113,113,0.30)' : isFuture ? 'rgba(167,139,250,0.18)' : 'rgba(255,255,255,0.05)' }}
                        onClick={() => onNavigate?.('calendar')}>
                        {isOngoing && <div className="absolute left-0 inset-y-0 w-[2.5px] rounded-r-full" style={{ background: 'linear-gradient(180deg,#f87171,#f8717133)' }}/>}
                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px]"
                          style={{ background: m.source === 'calendar' ? 'rgba(167,139,250,0.14)' : 'rgba(248,113,113,0.12)', border: m.source === 'calendar' ? '1px solid rgba(167,139,250,0.22)' : '1px solid rgba(248,113,113,0.18)' }}>
                          <Calendar size={10} style={{ color: m.source === 'calendar' ? '#a78bfa' : '#f87171' }}/>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1">
                            <p className="truncate text-[11.5px] font-semibold text-tx-primary">{m.title}</p>
                            {isOngoing && <span className="shrink-0 flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[8px] font-bold" style={{ background: 'rgba(248,113,113,0.14)', color: '#f87171', border: '1px solid rgba(248,113,113,0.24)' }}><span className="h-1 w-1 rounded-full bg-red-400 animate-pulse"/>Live</span>}
                            {isFuture && minsUntil <= 30 && <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[8px] font-bold" style={{ background: 'rgba(167,139,250,0.12)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.20)' }}>Soon</span>}
                          </div>
                          <p className="num text-[9.5px] font-mono text-tx-faint mt-0.5">
                            {fmtTime(m.started_at)}{m.ended_at ? ` – ${fmtTime(m.ended_at)}` : ''}
                          </p>
                        </div>
                        <div className="shrink-0 flex flex-col items-end gap-1">
                          <span className="num text-[10.5px] font-bold"
                            style={{ color: isOngoing ? '#f87171' : isFuture ? '#a78bfa' : 'rgba(148,163,184,0.5)' }}>
                            {isFuture ? `${minsUntil}m` : dur > 0 ? fmtDur(dur) : '—'}
                          </span>
                          {m.meeting_url && !isPast && (
                            <button onClick={e => { e.stopPropagation(); window.open(m.meeting_url,'_blank'); }}
                              className="flex items-center gap-0.5 rounded-[5px] px-1.5 py-0.5 text-[8.5px] font-bold transition-all"
                              style={{ background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.22)', color: '#f87171' }}
                              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(248,113,113,0.22)'; }}
                              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(248,113,113,0.12)'; }}>
                              <Video size={7}/>Join
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {totalMeetingsSecs > 0 && (
                    <div className="flex items-center justify-between border-t border-white/[0.05] pt-2 mt-0.5">
                      <span className="text-[9.5px] font-medium text-tx-faint">Total meeting time</span>
                      <span className="num text-[11.5px] font-bold text-tx-secondary">{fmtDur(totalMeetingsSecs)}</span>
                    </div>
                  )}
                </div>
              )}
            </Card>

            {/* Quick actions card */}
            <Card accentColor="#7c6cf2">
              <div className="mb-3 flex items-center gap-2">
                <div className="flex h-[20px] w-[20px] items-center justify-center rounded-[6px]"
                  style={{ background: 'rgba(124,108,242,0.14)', border: '1px solid rgba(124,108,242,0.22)' }}>
                  <Zap size={10} style={{ color: '#7c6cf2' }}/>
                </div>
                <span className="text-[10.5px] font-semibold tracking-[0.05em] text-tx-faint">Quick Actions</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'Start Focus', icon: Play,      color: '#34d399', action: () => onNavigate?.('tracker')       },
                  { label: 'Projects',   icon: Briefcase,  color: '#60a5fa', action: () => onNavigate?.('projects')      },
                  { label: 'Calendar',   icon: Calendar,   color: '#a78bfa', action: () => onNavigate?.('calendar')      },
                  { label: 'Reports',    icon: BarChart2,  color: '#fbbf24', action: () => onNavigate?.('reports')       },
                  { label: 'Activity',   icon: Activity,   color: '#818cf8', action: () => onNavigate?.('activity')      },
                  { label: 'Settings',   icon: Layers,     color: '#6b7280', action: () => onNavigate?.('settings')      },
                ].map(({ label, icon: Icon, color, action }) => (
                  <button key={label} onClick={action}
                    className="group/qa flex items-center gap-2 rounded-[9px] px-3 py-2 text-left transition-all duration-150"
                    style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}
                    onMouseEnter={e => { e.currentTarget.style.background = `${color}12`; e.currentTarget.style.borderColor = `${color}28`; e.currentTarget.style.boxShadow = `0 0 16px ${color}10`; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.025)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; e.currentTarget.style.boxShadow = 'none'; }}>
                    <div className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[6px]"
                      style={{ background: `${color}14`, border: `1px solid ${color}22` }}>
                      <Icon size={10} style={{ color }}/>
                    </div>
                    <span className="text-[10.5px] font-semibold text-tx-faint group-hover/qa:text-tx-primary transition-colors duration-150">{label}</span>
                    <ArrowRight size={8} className="ml-auto text-tx-faint opacity-0 group-hover/qa:opacity-50 transition-opacity duration-150"/>
                  </button>
                ))}
              </div>
            </Card>

          </div>
        </div>
      </div>
    </div>
  );
}
