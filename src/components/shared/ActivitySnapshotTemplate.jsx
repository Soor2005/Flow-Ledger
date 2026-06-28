import React from 'react';
import {
  BarChart3, MoreHorizontal, Clock, Calendar, Target, TrendingUp, Gauge,
  Moon, Sun, Sparkles, FolderOpen,
} from 'lucide-react';
import { fmtDuration } from '../../utils/exportUtils';

/* ─────────────────────────────────────────────────────────────────────────────
   ActivitySnapshotTemplate — the dedicated, off-screen-rendered layout used
   to generate the "Activity Snapshot" shareable PNG. Not a screenshot of any
   app UI: a standalone, theme-able template built purely for export.

   Sizes (design px, captured at scale:2 by the exporter for crispness):
     square (1:1)    1600 x 1600
     portrait (4:5)  1600 x 2000
     story (9:16)    1600 x 2844
───────────────────────────────────────────────────────────────────────────── */

export const SNAPSHOT_DIMENSIONS = {
  square:   { width: 1600, height: 1600 },
  portrait: { width: 1600, height: 2000 },
  story:    { width: 1600, height: 2844 },
};

// ─── Themes ─────────────────────────────────────────────────────────────────
// Each theme is a flat token set consumed by the layout below — swapping
// `theme` re-skins the entire card without touching structure/content.
export const SNAPSHOT_THEMES = {
  midnight: {
    label: 'Midnight', isLight: false,
    bg: ['#0B0A14', '#16122E', '#090812', '#08070F'],
    glow1: 'rgba(139,92,246,0.40)', glow2: 'rgba(99,102,241,0.22)', glow3: 'rgba(168,85,247,0.14)',
    text: { primary: '#F5F3FF', secondary: '#A6A0C4', muted: '#6E6890' },
    card: { bg: 'rgba(255,255,255,0.045)', border: 'rgba(255,255,255,0.10)' },
    accent: '#A78BFA', ring: ['#8B5CF6', '#60A5FA'],
  },
  aurora: {
    label: 'Aurora', isLight: false,
    bg: ['#061018', '#0B2A33', '#06181F', '#040C10'],
    glow1: 'rgba(52,211,153,0.32)', glow2: 'rgba(99,102,241,0.22)', glow3: 'rgba(34,211,238,0.18)',
    text: { primary: '#EAFBF5', secondary: '#8FB8B0', muted: '#5C7E78' },
    card: { bg: 'rgba(255,255,255,0.045)', border: 'rgba(255,255,255,0.10)' },
    accent: '#34D399', ring: ['#34D399', '#22D3EE'],
  },
  sunset: {
    label: 'Sunset', isLight: false,
    bg: ['#2B1C22', '#7A3B28', '#3A1F18', '#140B0C'],
    glow1: 'rgba(255,176,84,0.55)', glow2: 'rgba(255,120,60,0.26)', glow3: 'rgba(180,90,200,0.14)',
    text: { primary: '#FBF5EE', secondary: '#C9BBAE', muted: '#9A8E82' },
    card: { bg: 'rgba(15,11,10,0.55)', border: 'rgba(255,255,255,0.10)' },
    accent: '#FF8A4C', ring: ['#FF8A4C', '#E8552E'],
  },
  ocean: {
    label: 'Ocean', isLight: false,
    bg: ['#03131C', '#0B3A4A', '#062430', '#021016'],
    glow1: 'rgba(34,211,238,0.32)', glow2: 'rgba(59,130,246,0.24)', glow3: 'rgba(20,184,166,0.16)',
    text: { primary: '#EAFBFF', secondary: '#8FB4C2', muted: '#587C88' },
    card: { bg: 'rgba(255,255,255,0.045)', border: 'rgba(255,255,255,0.10)' },
    accent: '#22D3EE', ring: ['#22D3EE', '#3B82F6'],
  },
  amoled: {
    label: 'AMOLED', isLight: false,
    bg: ['#000000', '#060608', '#000000', '#000000'],
    glow1: 'rgba(139,92,246,0.20)', glow2: 'rgba(99,102,241,0.10)', glow3: 'rgba(255,255,255,0.04)',
    text: { primary: '#FFFFFF', secondary: '#9A9AA5', muted: '#5C5C66' },
    card: { bg: 'rgba(255,255,255,0.035)', border: 'rgba(255,255,255,0.09)' },
    accent: '#A78BFA', ring: ['#A78BFA', '#818CF8'],
  },
  light: {
    label: 'Light Minimal', isLight: true,
    bg: ['#F7F6FB', '#FFFFFF', '#F2EFFA', '#ECE8F7'],
    glow1: 'rgba(139,92,246,0.12)', glow2: 'rgba(96,165,250,0.10)', glow3: 'rgba(244,114,182,0.08)',
    text: { primary: '#15131F', secondary: '#5B5770', muted: '#9491A8' },
    card: { bg: 'rgba(255,255,255,0.72)', border: 'rgba(20,16,40,0.09)' },
    accent: '#7C6CF2', ring: ['#7C6CF2', '#60A5FA'],
  },
};

function fmtClock(unixSecs) {
  if (!unixSecs) return '';
  return new Date(unixSecs * 1000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
function fmtHourTick(unixSecs) {
  return new Date(unixSecs * 1000).toLocaleTimeString('en-US', { hour: 'numeric' }).replace(/\s/g, '');
}
function fmtSignedPct(pct) {
  if (pct === null || pct === undefined) return null;
  return pct > 0 ? `+${pct}%` : pct < 0 ? `${pct}%` : '±0%';
}
function fmtSignedCount(n) {
  if (!n) return null;
  return n > 0 ? `+${n}` : `${n}`;
}
function trendUp(n) { return n > 0; }

// ─── Backdrop ───────────────────────────────────────────────────────────────
// Layered radial "aurora" glows + linear base + a faint diagonal hairline
// texture standing in for grain (true noise filters aren't reliably
// rasterized by the canvas exporter).
function Backdrop({ t }) {
  const [c0, c1, c2, c3] = t.bg;
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 0, overflow: 'hidden' }}>
      <div style={{
        position: 'absolute', inset: 0,
        background: `linear-gradient(165deg, ${c0} 0%, ${c1} 38%, ${c2} 70%, ${c3} 100%)`,
      }} />
      <div style={{
        position: 'absolute', top: '-15%', left: '-10%', width: '85%', height: '60%',
        background: `radial-gradient(ellipse, ${t.glow1} 0%, transparent 68%)`, filter: 'blur(2px)',
      }} />
      <div style={{
        position: 'absolute', top: '-10%', right: '-15%', width: '70%', height: '55%',
        background: `radial-gradient(ellipse, ${t.glow2} 0%, transparent 70%)`,
      }} />
      <div style={{
        position: 'absolute', bottom: '-20%', left: '10%', width: '80%', height: '50%',
        background: `radial-gradient(ellipse, ${t.glow3} 0%, transparent 70%)`,
      }} />
      {/* Faint diagonal hairline texture */}
      <div style={{
        position: 'absolute', inset: 0, opacity: t.isLight ? 0.5 : 0.12,
        backgroundImage: 'repeating-linear-gradient(135deg, rgba(255,255,255,0.6) 0px, rgba(255,255,255,0.6) 1px, transparent 1px, transparent 7px)',
        mixBlendMode: t.isLight ? 'multiply' : 'overlay',
      }} />
      {!t.isLight && (
        <div style={{
          position: 'absolute', inset: 0,
          boxShadow: 'inset 0 0 220px rgba(0,0,0,0.55)',
        }} />
      )}
    </div>
  );
}

// ─── Score ring ─────────────────────────────────────────────────────────────
function ScoreRing({ score, t, size = 168, stroke = 14 }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const fill = Math.min(Math.max(score, 0), 100) / 100 * circ;
  const gradId = 'snapshotRingGrad';
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={t.ring[0]} />
            <stop offset="100%" stopColor={t.ring[1]} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={t.card.border} strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={`url(#${gradId})`} strokeWidth={stroke}
          strokeDasharray={`${fill} ${circ}`} strokeLinecap="round"
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 2,
      }}>
        <span style={{ fontSize: 52, fontWeight: 800, color: t.text.primary, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
          {score}
        </span>
        <span style={{ fontSize: 13, fontWeight: 700, color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Score
        </span>
      </div>
    </div>
  );
}

function TrendBadge({ text, up, t }) {
  if (!text) return null;
  const color = up === undefined ? t.text.muted : up ? '#6EE7A8' : '#F8A6A6';
  return (
    <span style={{ fontSize: 18, fontWeight: 700, color, display: 'flex', alignItems: 'center', gap: 5 }}>
      {up !== undefined && <span style={{ fontSize: 14 }}>{up ? '▲' : '▼'}</span>}
      {text}
    </span>
  );
}

function StatTile({ Icon, iconColor, iconBg, label, value, trendText, trendUp: up, t }) {
  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{
        width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center', background: iconBg,
      }}>
        <Icon size={20} style={{ color: iconColor }} />
      </div>
      <span style={{ fontSize: 15, fontWeight: 700, color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {label}
      </span>
      <span style={{ fontSize: 34, fontWeight: 800, color: t.text.primary, letterSpacing: '-0.01em', fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </span>
      <TrendBadge text={trendText} up={up} t={t} />
    </div>
  );
}

function SectionLabel({ children, t }) {
  return (
    <p style={{
      margin: '0 0 20px', fontSize: 18, fontWeight: 700, color: t.text.muted,
      textTransform: 'uppercase', letterSpacing: '0.09em',
    }}>
      {children}
    </p>
  );
}

function Card({ children, t, style }) {
  return (
    <div style={{
      background: t.card.bg, border: `1px solid ${t.card.border}`,
      borderRadius: 24, padding: '30px 32px',
      boxShadow: t.isLight ? '0 8px 24px rgba(20,16,40,0.06)' : '0 8px 24px rgba(0,0,0,0.20)',
      ...style,
    }}>
      {children}
    </div>
  );
}

function ActivityTimeline({ data, t }) {
  const span = Math.max(1, data.axisEnd - data.axisStart);
  const tickCount = 5;
  const ticks = Array.from({ length: tickCount }, (_, i) => data.axisStart + (i / (tickCount - 1)) * span);
  return (
    <Card t={t}>
      <SectionLabel t={t}>Activity Timeline</SectionLabel>
      <div style={{
        position: 'relative', height: 60, borderRadius: 14, overflow: 'hidden',
        background: t.isLight ? 'rgba(20,16,40,0.05)' : 'rgba(255,255,255,0.05)', display: 'flex', gap: 2,
      }}>
        {data.timelineBlocks.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 16, color: t.text.muted, fontWeight: 600 }}>No tracked activity yet</span>
          </div>
        ) : data.timelineBlocks.map((b, i) => {
          const left  = Math.max(0, ((b.start - data.axisStart) / span) * 100);
          const width = Math.max(0.35, ((b.end - b.start) / span) * 100);
          return (
            <div key={i} style={{
              position: 'absolute', top: 7, bottom: 7,
              left: `${left}%`, width: `${width}%`, minWidth: 3,
              background: b.color, borderRadius: 5,
            }} />
          );
        })}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <Moon size={15} style={{ color: t.text.muted }} />
          <span style={{ fontSize: 16, fontWeight: 600, color: t.text.secondary }}>{fmtHourTick(data.axisStart)}</span>
        </div>
        {ticks.slice(1, -1).map((tk, i) => (
          <span key={i} style={{ fontSize: 15, fontWeight: 600, color: t.text.muted }}>{fmtHourTick(tk)}</span>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ fontSize: 16, fontWeight: 600, color: t.text.secondary }}>{fmtHourTick(data.axisEnd)}</span>
          <Sun size={15} style={{ color: t.accent }} />
        </div>
      </div>
    </Card>
  );
}

function BreakdownBars({ items, t }) {
  return (
    <Card t={t}>
      <SectionLabel t={t}>Productivity Breakdown</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {items.map((d, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: d.color, flexShrink: 0 }} />
            <span style={{ width: 180, flexShrink: 0, fontSize: 19, fontWeight: 600, color: t.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {d.label}
            </span>
            <div style={{ flex: 1, height: 13, borderRadius: 7, background: t.isLight ? 'rgba(20,16,40,0.06)' : 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.max(2, d.pct)}%`, background: d.color, borderRadius: 7 }} />
            </div>
            <span style={{ width: 96, flexShrink: 0, textAlign: 'right', fontSize: 18, fontWeight: 700, color: t.text.primary, fontVariantNumeric: 'tabular-nums' }}>
              {fmtDuration(d.secs)}
            </span>
            <span style={{ width: 54, flexShrink: 0, textAlign: 'right', fontSize: 17, fontWeight: 600, color: t.text.muted, fontVariantNumeric: 'tabular-nums' }}>
              {d.pct}%
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function InsightsCard({ insights, t }) {
  return (
    <Card t={t}>
      <SectionLabel t={t}>AI Insights</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {insights.map((text, i) => (
          <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <span style={{ fontSize: 19, lineHeight: 1.3, flexShrink: 0, color: t.accent }}>✦</span>
            <span style={{ fontSize: 19, fontWeight: 500, color: t.text.secondary, lineHeight: 1.4 }}>{text}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function TopProjects({ items, t }) {
  return (
    <Card t={t}>
      <SectionLabel t={t}>Top Projects</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {items.map((p, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 9, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: t.isLight ? 'rgba(124,108,242,0.12)' : 'rgba(167,139,250,0.16)',
            }}>
              <FolderOpen size={15} style={{ color: t.accent }} />
            </div>
            <span style={{ flex: 1, fontSize: 19, fontWeight: 600, color: t.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {p.name}
            </span>
            <span style={{ fontSize: 19, fontWeight: 700, color: t.text.primary, fontVariantNumeric: 'tabular-nums' }}>{fmtDuration(p.secs)}</span>
            <span style={{ width: 54, textAlign: 'right', fontSize: 17, fontWeight: 600, color: t.text.muted, fontVariantNumeric: 'tabular-nums' }}>{p.pct}%</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function TopApps({ items, t }) {
  return (
    <Card t={t}>
      <SectionLabel t={t}>Top Applications</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {items.map((app, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10, flexShrink: 0, overflow: 'hidden',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: t.isLight ? 'rgba(124,108,242,0.10)' : 'rgba(167,139,250,0.14)',
            }}>
              {app.icon
                ? <img src={app.icon} alt="" width={22} height={22} style={{ objectFit: 'contain' }} />
                : <span style={{ fontSize: 16, fontWeight: 800, color: t.accent }}>{(app.name || '?').charAt(0).toUpperCase()}</span>}
            </div>
            <span style={{ flex: 1, fontSize: 19, fontWeight: 600, color: t.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {app.name}
            </span>
            <span style={{ fontSize: 19, fontWeight: 700, color: t.text.primary, fontVariantNumeric: 'tabular-nums' }}>{fmtDuration(app.secs)}</span>
            <span style={{ width: 54, textAlign: 'right', fontSize: 17, fontWeight: 600, color: t.text.muted, fontVariantNumeric: 'tabular-nums' }}>{app.pct}%</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function SessionSummary({ rows, t }) {
  const shown = rows.slice(0, 6);
  const overflow = rows.length - shown.length;
  return (
    <Card t={t}>
      <SectionLabel t={t}>Session Summary</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
        {shown.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 18, fontWeight: 600, color: t.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {s.title}
            </span>
            <span style={{ fontSize: 16, fontWeight: 500, color: t.text.muted, fontVariantNumeric: 'tabular-nums' }}>
              {fmtClock(s.start)} – {fmtClock(s.end)}
            </span>
            <span style={{ width: 70, textAlign: 'right', fontSize: 17, fontWeight: 700, color: t.text.secondary, fontVariantNumeric: 'tabular-nums' }}>
              {fmtDuration(s.durationSecs)}
            </span>
          </div>
        ))}
        {overflow > 0 && (
          <span style={{ fontSize: 15, fontWeight: 600, color: t.text.muted, marginTop: 4 }}>+{overflow} more session{overflow === 1 ? '' : 's'}</span>
        )}
      </div>
    </Card>
  );
}

function AchievementCard({ achievement, t }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 20,
      background: `linear-gradient(120deg, ${t.glow1.replace(/[\d.]+\)$/, '0.22)')} 0%, ${t.card.bg} 60%)`,
      border: `1px solid ${t.card.border}`, borderRadius: 24, padding: '26px 32px',
    }}>
      <span style={{ fontSize: 48, lineHeight: 1, flexShrink: 0 }}>{achievement.icon}</span>
      <div style={{ minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 23, fontWeight: 800, color: t.text.primary }}>{achievement.title}</p>
        <p style={{ margin: '4px 0 0', fontSize: 17, fontWeight: 500, color: t.text.secondary }}>{achievement.detail}</p>
      </div>
    </div>
  );
}

function Footer({ data, accountName, logoSrc, t }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Sparkles size={16} style={{ color: t.text.muted }} />
        <span style={{ fontSize: 16, fontWeight: 500, color: t.text.muted, fontStyle: 'italic' }}>Focus. Plan. Build.</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <span style={{ fontSize: 14, fontWeight: 500, color: t.text.muted, fontVariantNumeric: 'tabular-nums' }}>
          {data.generatedAt.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
        </span>
        <div style={{ width: 1, height: 16, background: t.card.border }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {logoSrc && <img src={logoSrc} alt="" width={18} height={18} style={{ objectFit: 'contain' }} />}
          <span style={{ fontSize: 15, fontWeight: 700, color: t.text.primary }}>Made with Flow Ledger</span>
        </div>
      </div>
    </div>
  );
}

/**
 * @param {Object} props
 * @param {Object} props.data       - output of buildSnapshotData()
 * @param {string} props.variant    - 'square' | 'portrait' | 'story'
 * @param {string} [props.theme]    - key of SNAPSHOT_THEMES (default 'midnight')
 * @param {string} [props.accountName]
 * @param {string} [props.logoSrc]
 */
export default function ActivitySnapshotTemplate({ data, variant = 'square', theme = 'midnight', accountName, logoSrc }) {
  const { width, height } = SNAPSHOT_DIMENSIONS[variant] || SNAPSHOT_DIMENSIONS.square;
  const t = SNAPSHOT_THEMES[theme] || SNAPSHOT_THEMES.midnight;
  const { comparison } = data;

  const dateLine = data.period === 'day'
    ? new Date(data.rangeStart * 1000).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    : data.rangeLabel;

  const showBreakdown   = true;
  const showTopProjects = variant === 'story';
  const showTopApps     = variant === 'story';
  const showSessions    = variant === 'story';
  const insightCount    = variant === 'square' ? 2 : variant === 'portrait' ? 2 : 3;
  const breakdownCount  = variant === 'story' ? 7 : variant === 'portrait' ? 4 : 3;

  return (
    <div style={{
      width, height, boxSizing: 'border-box', position: 'relative', overflow: 'hidden',
      fontFamily: "-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',sans-serif",
      padding: '64px 72px', display: 'flex', flexDirection: 'column', gap: 32,
    }}>
      <Backdrop t={t} />

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{
            width: 50, height: 50, borderRadius: 15, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: `linear-gradient(140deg, ${t.ring[0]} 0%, ${t.ring[1]} 100%)`,
            boxShadow: `0 6px 18px ${t.glow1}`,
          }}>
            <BarChart3 size={24} style={{ color: t.isLight ? '#fff' : '#fff' }} />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 24, fontWeight: 800, color: t.text.primary, letterSpacing: '0.03em', fontFamily: "'SF Mono','JetBrains Mono','Menlo',monospace" }}>
              ACTIVITY SNAPSHOT
            </p>
            <p style={{ margin: '5px 0 0', fontSize: 18, fontWeight: 500, color: t.text.secondary }}>{dateLine}</p>
          </div>
        </div>
        <div style={{
          width: 40, height: 40, borderRadius: 11, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: t.card.bg, border: `1px solid ${t.card.border}`,
        }}>
          <MoreHorizontal size={18} style={{ color: t.text.muted }} />
        </div>
      </div>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 48 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 18, fontWeight: 700, color: t.text.muted, textTransform: 'uppercase', letterSpacing: '0.09em' }}>
            Total Time Tracked
          </span>
          <div style={{ fontSize: 104, fontWeight: 800, color: t.text.primary, lineHeight: 1, letterSpacing: '-0.02em', marginTop: 8, fontVariantNumeric: 'tabular-nums' }}>
            {fmtDuration(data.totalSecs)}
          </div>
          <div style={{ marginTop: 14 }}>
            <TrendBadge
              text={fmtSignedPct(comparison.totalPct) ? `${fmtSignedPct(comparison.totalPct)} ${comparison.label}` : null}
              up={trendUp(comparison.totalPct)} t={t}
            />
          </div>
        </div>
        <ScoreRing score={data.productivityScore} t={t} />
      </div>

      {/* ── Secondary stats ─────────────────────────────────────────────── */}
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', gap: 28 }}>
        <StatTile t={t} Icon={Gauge} iconColor="#C4B5FD" iconBg="rgba(167,139,250,0.18)"
          label="Deep Work" value={fmtDuration(data.deepWorkSecs)}
          trendText={`${data.deepWorkPct}% of tracked time`} />
        <StatTile t={t} Icon={Calendar} iconColor="#7DC4FF" iconBg="rgba(125,196,255,0.18)"
          label="Meetings" value={fmtDuration(data.meetingSecs)}
          trendText={`${comparison.meetingsCount} meeting${comparison.meetingsCount === 1 ? '' : 's'}`} />
        <StatTile t={t} Icon={Target} iconColor="#FFB35C" iconBg="rgba(255,179,92,0.18)"
          label="Sessions" value={String(data.sessionsCompleted)}
          trendText={fmtSignedCount(comparison.sessionsDelta) ? `${fmtSignedCount(comparison.sessionsDelta)} ${comparison.label}` : null}
          trendUp={trendUp(comparison.sessionsDelta)} />
        <StatTile t={t} Icon={TrendingUp} iconColor="#7CE6B0" iconBg="rgba(124,230,176,0.18)"
          label="Focus Score" value={String(data.focusScore)}
          trendText={fmtSignedPct(comparison.focusScorePct) ? `${fmtSignedPct(comparison.focusScorePct)} ${comparison.label}` : null}
          trendUp={trendUp(comparison.focusScorePct)} />
      </div>

      {/* ── Timeline ─────────────────────────────────────────────────────── */}
      <div style={{ position: 'relative', zIndex: 1 }}>
        <ActivityTimeline data={data} t={t} />
      </div>

      {/* ── Achievement ──────────────────────────────────────────────────── */}
      <div style={{ position: 'relative', zIndex: 1 }}>
        <AchievementCard achievement={data.achievement} t={t} />
      </div>

      {/* ── AI insights ──────────────────────────────────────────────────── */}
      {data.insights.length > 0 && (
        <div style={{ position: 'relative', zIndex: 1 }}>
          <InsightsCard insights={data.insights.slice(0, insightCount)} t={t} />
        </div>
      )}

      {/* ── Productivity breakdown ───────────────────────────────────────── */}
      {showBreakdown && data.distribution.length > 0 && (
        <div style={{ position: 'relative', zIndex: 1 }}>
          <BreakdownBars items={data.distribution.slice(0, breakdownCount)} t={t} />
        </div>
      )}

      {/* ── Top projects ─────────────────────────────────────────────────── */}
      {showTopProjects && data.topProjects.length > 0 && (
        <div style={{ position: 'relative', zIndex: 1 }}>
          <TopProjects items={data.topProjects} t={t} />
        </div>
      )}

      {/* ── Top applications ─────────────────────────────────────────────── */}
      {showTopApps && data.topApps.length > 0 && (
        <div style={{ position: 'relative', zIndex: 1 }}>
          <TopApps items={data.topApps} t={t} />
        </div>
      )}

      {/* ── Session summary ──────────────────────────────────────────────── */}
      {showSessions && data.sessionRows.length > 0 && (
        <div style={{ position: 'relative', zIndex: 1 }}>
          <SessionSummary rows={data.sessionRows} t={t} />
        </div>
      )}

      <div style={{ flex: 1 }} />

      <div style={{ position: 'relative', zIndex: 1, borderTop: `1px solid ${t.card.border}`, paddingTop: 28 }}>
        <Footer data={data} accountName={accountName} logoSrc={logoSrc} t={t} />
      </div>
    </div>
  );
}
