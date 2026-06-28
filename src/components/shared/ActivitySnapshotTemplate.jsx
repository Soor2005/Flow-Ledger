import React from 'react';
import {
  BarChart3, MoreHorizontal, Clock, Calendar, Target, TrendingUp,
  Moon, Sun, Sparkles,
} from 'lucide-react';
import { fmtDuration } from '../../utils/exportUtils';

/* ─────────────────────────────────────────────────────────────────────────────
   ActivitySnapshotTemplate — the dedicated, off-screen-rendered layout used
   to generate the "Activity Snapshot" shareable PNG.

   This is NOT a screenshot of any app UI — it's a standalone template built
   purely for export: a single content card centered over a generated warm
   "golden hour" backdrop, sized to an exact target canvas per aspect ratio.

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

const PERIOD_DATE_FMT = { day: 'date', week: 'range', month: 'range' };

function fmtClock(unixSecs) {
  if (!unixSecs) return '';
  return new Date(unixSecs * 1000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function fmtSignedPct(pct) {
  if (pct === null || pct === undefined) return null;
  const sign = pct > 0 ? '+' : pct < 0 ? '' : '±';
  return `${sign}${pct}%`;
}

function fmtSignedCount(n) {
  if (n === 0) return null;
  return n > 0 ? `+${n}` : `${n}`;
}

function deltaColor(n) {
  if (!n) return '#8B8478';
  return n > 0 ? '#86EFAC' : '#FCA5A5';
}

// ─── Warm "golden hour" backdrop — generated entirely in CSS so the feature
// never depends on bundling/licensing a stock photo. Swap in a real photo by
// passing `backgroundImage` and this gradient becomes the fallback. ──────────
function Backdrop() {
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 0,
      background: [
        'radial-gradient(ellipse 70% 45% at 50% 28%, rgba(255,176,84,0.55) 0%, rgba(255,120,60,0.28) 35%, transparent 70%)',
        'radial-gradient(ellipse 90% 60% at 80% 10%, rgba(255,140,90,0.20) 0%, transparent 60%)',
        'radial-gradient(ellipse 90% 60% at 15% 15%, rgba(180,90,200,0.16) 0%, transparent 60%)',
        'linear-gradient(180deg, #2b1c22 0%, #4a2a24 22%, #7a3b28 38%, #5c2c22 58%, #2a1714 78%, #140b0c 100%)',
      ].join(', '),
    }}>
      {/* Implied horizon / tree line */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, height: '22%',
        background: 'linear-gradient(180deg, transparent 0%, rgba(10,6,7,0.85) 60%, rgba(8,5,6,0.97) 100%)',
      }} />
    </div>
  );
}

function StatColumn({ Icon, iconColor, iconBg, label, value, deltaText, deltaColorOverride }) {
  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12, padding: '0 28px' }}>
      <div style={{
        width: 52, height: 52, borderRadius: '50%', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: iconBg,
      }}>
        <Icon size={22} style={{ color: iconColor }} />
      </div>
      <span style={{ fontSize: 17, fontWeight: 700, color: '#B8AFA0', textTransform: 'uppercase', letterSpacing: '0.09em' }}>
        {label}
      </span>
      <span style={{ fontSize: 44, fontWeight: 800, color: '#FBF5EE', letterSpacing: '-0.01em', fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </span>
      {deltaText && (
        <span style={{ fontSize: 18, fontWeight: 600, color: deltaColorOverride || '#B8AFA0' }}>
          {deltaText}
        </span>
      )}
    </div>
  );
}

/**
 * @param {Object} props
 * @param {Object} props.data      - output of buildSnapshotData()
 * @param {string} props.variant   - 'square' | 'portrait' | 'story'
 * @param {string} props.accountName
 * @param {string} props.logoSrc
 * @param {string} [props.backgroundImage] - optional real photo URL; falls
 *   back to the generated gradient backdrop when omitted.
 */
export default function ActivitySnapshotTemplate({ data, variant = 'square', accountName, logoSrc, backgroundImage }) {
  const { width, height } = SNAPSHOT_DIMENSIONS[variant] || SNAPSHOT_DIMENSIONS.square;
  const { comparison } = data;

  const dateLine = PERIOD_DATE_FMT[data.period] === 'date'
    ? new Date(data.rangeStart * 1000).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : data.rangeLabel;

  const tickCount = 3;
  const ticks = Array.from({ length: tickCount }, (_, i) => {
    const t = data.rangeStart + ((i + 1) / (tickCount + 1)) * (data.rangeEnd - data.rangeStart);
    return new Date(t * 1000).toLocaleTimeString('en-US', { hour: 'numeric' }).replace(' ', ' ');
  });

  return (
    <div style={{
      width, height, boxSizing: 'border-box', position: 'relative', overflow: 'hidden',
      fontFamily: "-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',sans-serif",
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 64,
    }}>
      {backgroundImage
        ? <div style={{ position: 'absolute', inset: 0, zIndex: 0, backgroundImage: `url(${backgroundImage})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
        : <Backdrop />}

      {/* ── Content card ─────────────────────────────────────────────────── */}
      <div style={{
        position: 'relative', zIndex: 1, width: '100%', maxWidth: 1360,
        background: 'rgba(15,11,10,0.62)', border: '1px solid rgba(255,255,255,0.10)',
        borderRadius: 32, padding: '44px 48px', boxShadow: '0 32px 80px rgba(0,0,0,0.45)',
        display: 'flex', flexDirection: 'column', gap: 36,
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <div style={{
              width: 56, height: 56, borderRadius: 16, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'linear-gradient(140deg, #FF8A4C 0%, #E8552E 100%)',
              boxShadow: '0 6px 18px rgba(230,90,40,0.35)',
            }}>
              <BarChart3 size={26} style={{ color: '#fff' }} />
            </div>
            <div>
              <p style={{
                margin: 0, fontSize: 26, fontWeight: 800, color: '#FBF5EE', letterSpacing: '0.04em',
                fontFamily: "'SF Mono','JetBrains Mono','Menlo',monospace",
              }}>
                ACTIVITY SNAPSHOT
              </p>
              <p style={{ margin: '6px 0 0', fontSize: 19, fontWeight: 500, color: '#B8AFA0' }}>{dateLine}</p>
            </div>
          </div>
          <div style={{
            width: 44, height: 44, borderRadius: 12, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)',
          }}>
            <MoreHorizontal size={20} style={{ color: '#B8AFA0' }} />
          </div>
        </div>

        {/* Stats row */}
        <div style={{
          display: 'flex', alignItems: 'stretch',
          background: 'rgba(255,255,255,0.045)', border: '1px solid rgba(255,255,255,0.09)',
          borderRadius: 22, padding: '32px 0',
        }}>
          <StatColumn
            Icon={Clock} iconColor="#FFB35C" iconBg="rgba(255,179,92,0.18)"
            label="Total Time" value={fmtDuration(data.totalSecs)}
            deltaText={fmtSignedPct(comparison.totalPct) ? `${fmtSignedPct(comparison.totalPct)} ${comparison.label}` : null}
            deltaColorOverride={deltaColor(comparison.totalPct)}
          />
          <Divider />
          <StatColumn
            Icon={Calendar} iconColor="#C9A6FF" iconBg="rgba(201,166,255,0.18)"
            label="Meetings" value={fmtDuration(data.meetingSecs)}
            deltaText={`${comparison.meetingsCount} meeting${comparison.meetingsCount === 1 ? '' : 's'}`}
          />
          <Divider />
          <StatColumn
            Icon={Target} iconColor="#7DC4FF" iconBg="rgba(125,196,255,0.18)"
            label="Sessions" value={String(data.sessionsCompleted)}
            deltaText={fmtSignedCount(comparison.sessionsDelta) ? `${fmtSignedCount(comparison.sessionsDelta)} ${comparison.label}` : null}
            deltaColorOverride={deltaColor(comparison.sessionsDelta)}
          />
          <Divider />
          <StatColumn
            Icon={TrendingUp} iconColor="#7CE6B0" iconBg="rgba(124,230,176,0.18)"
            label="Productivity Score" value={String(data.productivityScore)}
            deltaText={fmtSignedPct(comparison.scorePct) ? `${fmtSignedPct(comparison.scorePct)} ${comparison.label}` : null}
            deltaColorOverride={deltaColor(comparison.scorePct)}
          />
        </div>

        {/* Timeline */}
        <div style={{
          background: 'rgba(255,255,255,0.045)', border: '1px solid rgba(255,255,255,0.09)',
          borderRadius: 22, padding: '28px 32px',
        }}>
          <p style={{
            margin: '0 0 22px', fontSize: 17, fontWeight: 700, color: '#B8AFA0',
            textTransform: 'uppercase', letterSpacing: '0.09em',
          }}>
            Timeline of Your Day
          </p>
          <div style={{
            position: 'relative', height: 52, borderRadius: 12, overflow: 'hidden',
            background: 'rgba(255,255,255,0.05)', display: 'flex', gap: 2,
          }}>
            {data.timelineBlocks.length === 0 ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 16, color: '#8B8478', fontWeight: 600 }}>No tracked activity yet</span>
              </div>
            ) : data.timelineBlocks.map((b, i) => {
              const span = Math.max(1, data.rangeEnd - data.rangeStart);
              const width = Math.max(0.6, ((b.end - b.start) / span) * 100);
              return (
                <div key={i} style={{
                  width: `${width}%`, minWidth: 4, borderRadius: 4,
                  background: b.warmColor || b.color,
                }} />
              );
            })}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Moon size={16} style={{ color: '#8B8478' }} />
              <span style={{ fontSize: 18, fontWeight: 600, color: '#D8CFC2' }}>{fmtClock(data.rangeStart)}</span>
            </div>
            {ticks.map((t, i) => (
              <span key={i} style={{ fontSize: 16, fontWeight: 600, color: '#8B8478' }}>{t}</span>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 18, fontWeight: 600, color: '#D8CFC2' }}>{fmtClock(data.rangeEnd)}</span>
              <Sun size={16} style={{ color: '#FFB35C' }} />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Sparkles size={16} style={{ color: '#B8AFA0' }} />
            <span style={{ fontSize: 17, fontWeight: 500, color: '#B8AFA0', fontStyle: 'italic' }}>
              Focus. Plan. Track. Achieve.
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 17, fontWeight: 500, color: '#8B8478' }}>Made with</span>
            {logoSrc && <img src={logoSrc} alt="" width={20} height={20} style={{ objectFit: 'contain' }} />}
            <span style={{ fontSize: 18, fontWeight: 800, color: '#FBF5EE' }}>Flow Ledger</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Divider() {
  return <div style={{ width: 1, alignSelf: 'stretch', background: 'rgba(255,255,255,0.10)', flexShrink: 0 }} />;
}
