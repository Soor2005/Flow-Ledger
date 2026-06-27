import React, { useState } from 'react';
import { Info, ArrowUp, ArrowDown } from 'lucide-react';
import useProductivityScore from '../../hooks/useProductivityScore';

const SIZE = 42;
const THICKNESS = 4;
const R = (SIZE - THICKNESS) / 2;
const CIRC = 2 * Math.PI * R;

function ScoreRing({ score }) {
  const fill = Math.min(Math.max(score, 0), 100) / 100 * CIRC;
  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} overflow="visible"
      style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      <defs>
        <linearGradient id="fl-prodscore-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#9b5cf6" />
          <stop offset="100%" stopColor="#60a5fa" />
        </linearGradient>
      </defs>
      <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={THICKNESS} />
      <circle
        cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none"
        stroke="url(#fl-prodscore-grad)" strokeWidth={THICKNESS}
        strokeDasharray={`${fill} ${CIRC}`} strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.9s cubic-bezier(0.34,1.56,0.64,1)' }}
      />
    </svg>
  );
}

export default function ProductivityScoreWidget({ userId }) {
  const { score, trend, loading } = useProductivityScore(userId);
  const [showTip, setShowTip] = useState(false);
  const [hover, setHover] = useState(false);

  const trendColor = trend ? (trend.up ? '#34d399' : '#f87171') : '#6a7a9a';
  const TrendIcon = trend?.up ? ArrowUp : ArrowDown;

  return (
    <div
      className="fl-prodscore-widget no-drag box-border flex shrink-0 items-center"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setShowTip(false); }}
      style={{
        gap: 10,
        height: 44,
        maxHeight: 44,
        flexShrink: 0,
        padding: '0 14px',
        borderRadius: 12,
        background: hover ? 'rgba(124,108,242,0.09)' : 'rgba(255,255,255,0.035)',
        border: `1px solid ${hover ? 'rgba(124,108,242,0.22)' : 'rgba(255,255,255,0.07)'}`,
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        transition: 'background 0.2s, border-color 0.2s',
        boxShadow: hover ? '0 4px 16px rgba(124,108,242,0.10)' : 'none',
      }}
    >
      <div className="relative flex shrink-0 items-center justify-center" style={{ width: SIZE, height: SIZE }}>
        <ScoreRing score={loading ? 0 : score} />
        <span className="absolute text-[13px] font-bold leading-none text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {loading ? '–' : score}
        </span>
      </div>

      <div className="fl-prodscore-text flex min-w-0 flex-col justify-center" style={{ gap: 4, height: SIZE }}>
        <div className="flex items-center gap-1.5" style={{ height: 14, lineHeight: '14px' }}>
          <span className="whitespace-nowrap text-[11px] font-semibold leading-none text-white/80">Productivity Score</span>
          <div className="relative flex items-center">
            <button
              type="button"
              aria-label="How is this calculated?"
              onMouseEnter={() => setShowTip(true)}
              onMouseLeave={() => setShowTip(false)}
              className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full text-[#5d6c89] transition-colors hover:text-white"
            >
              <Info size={11} strokeWidth={2} />
            </button>
            {showTip && (
              <div
                role="tooltip"
                className="absolute left-1/2 top-full z-50 mt-2 w-[210px] -translate-x-1/2 rounded-[10px] p-2.5 text-[11px] leading-snug text-white/80"
                style={{
                  background: 'rgba(13,17,28,0.97)',
                  border: '1px solid rgba(255,255,255,0.10)',
                  backdropFilter: 'blur(20px)',
                  boxShadow: '0 12px 30px rgba(0,0,0,0.45)',
                }}
              >
                Calculated from today's deep-focus time, total active time, and time spent in distracting apps. Updates every minute.
              </div>
            )}
          </div>
        </div>
        <div
          className="flex items-center gap-1 whitespace-nowrap text-[11px] font-medium leading-none"
          style={{ color: trendColor, height: 14, lineHeight: '14px' }}
        >
          {trend && <TrendIcon size={10} strokeWidth={2.5} />}
          <span>{trend ? `${trend.up ? '+' : '-'}${trend.pct}%` : '—'} vs Yesterday</span>
        </div>
      </div>
    </div>
  );
}
