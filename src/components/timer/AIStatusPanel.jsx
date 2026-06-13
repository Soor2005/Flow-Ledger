/**
 * AI Status Panel — Real-time intelligence display for the Timer section.
 * Shows: workflow, flow state, focus quality, insights, recommendation.
 * Designed for the auto-focus / automatic recording mode.
 */
import React, { useState } from 'react';
import { Sparkles, ChevronDown, RefreshCw, Zap, Target, Brain, AlertTriangle } from 'lucide-react';

// ─── Score ring ───────────────────────────────────────────────────────────────
function ScoreRing({ score, color, size = 56 }) {
  const r = (size - 8) / 2;
  const C = 2 * Math.PI * r;
  const dash = (Math.max(0, Math.min(100, score)) / 100) * C;
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={6} />
        {score > 0 && (
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={6}
            strokeDasharray={`${dash} ${C}`} strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 1.2s cubic-bezier(0.4,0,0.2,1)', filter: `drop-shadow(0 0 4px ${color}80)` }} />
        )}
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: Math.round(size * 0.24), fontWeight: 800, color, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
          {score}
        </span>
      </div>
    </div>
  );
}

// ─── Confidence bar ───────────────────────────────────────────────────────────
function ConfidenceBar({ value, label }) {
  const pct = Math.round((value || 0) * 100);
  const color = pct >= 80 ? '#34D399' : pct >= 60 ? '#FBBF24' : '#94A3B8';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ flex: 1, height: 3, borderRadius: 99, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 99, transition: 'width 0.8s ease' }} />
      </div>
      <span style={{ fontSize: 9, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums', minWidth: 28, textAlign: 'right' }}>
        {pct}% {label}
      </span>
    </div>
  );
}

// ─── Insight chip ─────────────────────────────────────────────────────────────
function InsightChip({ insight }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 8,
      padding: '7px 10px', borderRadius: 9,
      background: `${insight.color}0E`,
      border: `1px solid ${insight.color}22`,
    }}>
      <span style={{ fontSize: 12, lineHeight: 1, marginTop: 1, flexShrink: 0 }}>{insight.icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 8.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: insight.color, margin: 0, lineHeight: 1 }}>
          {insight.label}
        </p>
        <p style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.88)', margin: '2px 0 0', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {insight.value}
        </p>
        {insight.sub && (
          <p style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.40)', margin: '1px 0 0', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {insight.sub}
          </p>
        )}
      </div>
      {insight.score !== undefined && (
        <span style={{ fontSize: 11, fontWeight: 800, color: insight.color, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
          {insight.score}
        </span>
      )}
    </div>
  );
}

// ─── Flow state badge ─────────────────────────────────────────────────────────
function FlowStateBadge({ flowState }) {
  if (!flowState) return null;
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 9px', borderRadius: 99,
      background: flowState.bg, border: `1px solid ${flowState.border}`,
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
        background: flowState.color,
        boxShadow: `0 0 6px ${flowState.color}`,
        animation: flowState.pulse ? 'ai-pulse 2s ease infinite' : 'none',
      }} />
      <span style={{ fontSize: 10, fontWeight: 700, color: flowState.color }}>
        {flowState.icon} {flowState.label}
      </span>
    </div>
  );
}

// ─── Main AI Status Panel ─────────────────────────────────────────────────────
export default function AIStatusPanel({
  workflow,
  flowState,
  focusQuality,
  liveInsights = [],
  recommendation,
  continuity,
  projectSuggestion,
  productivityState,
  workflowDesc,
  confidence,
  confidenceLabel,
  elapsedSecs = 0,
  isTracking = false,
  hasIntel = false,
  onAcceptProjectSuggestion,
}) {
  const [expanded, setExpanded] = useState(true);

  const isInitializing = !hasIntel && isTracking && elapsedSecs < 60;
  const isWaiting      = !isTracking && !hasIntel;

  return (
    <div style={{
      borderRadius: 14,
      background: 'linear-gradient(145deg, rgba(10,12,22,0.99), rgba(8,10,20,0.99))',
      border: hasIntel ? '1px solid rgba(124,108,242,0.24)' : '1px solid rgba(124,108,242,0.14)',
      overflow: 'hidden',
      boxShadow: hasIntel
        ? '0 4px 24px rgba(0,0,0,0.40), 0 0 0 1px rgba(124,108,242,0.08)'
        : '0 2px 12px rgba(0,0,0,0.25)',
    }}>
      <style>{`
        @keyframes ai-pulse { 0%,100%{opacity:1} 50%{opacity:0.45} }
        @keyframes ai-fade-in { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }
        .ai-fade { animation: ai-fade-in 0.3s ease }
        @keyframes ai-shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        .ai-shimmer-line {
          background: linear-gradient(90deg, rgba(124,108,242,0.5) 0%, rgba(167,139,250,0.8) 30%, rgba(99,102,241,0.5) 60%, transparent 100%);
          background-size: 200% 100%;
          animation: ai-shimmer 3s linear infinite;
        }
      `}</style>

      {/* Accent gradient line */}
      <div className={isTracking ? 'ai-shimmer-line' : ''} style={{ height: 2, background: isTracking ? undefined : 'linear-gradient(90deg, rgba(124,108,242,0.4), transparent)' }} />

      {/* ── Header ── */}
      <button
        onClick={() => setExpanded(v => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 14px', background: 'transparent', border: 'none', cursor: 'pointer',
          borderBottom: expanded ? '1px solid rgba(124,108,242,0.10)' : 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8, flexShrink: 0,
            background: hasIntel
              ? 'linear-gradient(135deg,rgba(124,108,242,0.35),rgba(99,102,241,0.18))'
              : 'rgba(124,108,242,0.10)',
            border: `1px solid rgba(124,108,242,${hasIntel ? '0.35' : '0.22'})`,
            boxShadow: hasIntel ? '0 2px 10px rgba(124,108,242,0.25)' : 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {isInitializing
              ? <RefreshCw size={12} color="#9b8ff8" style={{ animation: 'ai-pulse 1.2s ease infinite' }} />
              : <Sparkles size={12} color="#9b8ff8" />}
          </div>
          <div style={{ textAlign: 'left' }}>
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#9b8ff8', margin: 0, lineHeight: 1 }}>
              AI Intelligence
            </p>
            {workflowDesc && (
              <p style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.35)', margin: '2px 0 0', lineHeight: 1, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {workflowDesc}
              </p>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {flowState && <FlowStateBadge flowState={flowState} />}
          <ChevronDown size={12} color="rgba(255,255,255,0.25)" style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }} />
        </div>
      </button>

      {/* ── Expanded body ── */}
      {expanded && (
        <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* Initializing state */}
          {isInitializing && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0' }}>
              <RefreshCw size={12} color="#7c6cf2" style={{ animation: 'ai-pulse 1s ease infinite', flexShrink: 0 }} />
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', margin: 0 }}>
                Analyzing workflow — insights will appear shortly…
              </p>
            </div>
          )}

          {/* Waiting state */}
          {isWaiting && (
            <div style={{ padding: '8px 0', textAlign: 'center' }}>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.30)', margin: 0 }}>
                Intelligence activates when tracking begins
              </p>
            </div>
          )}

          {/* Main content when tracking + have intel */}
          {hasIntel && !isInitializing && (
            <div className="ai-fade" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

              {/* Workflow + Focus Quality row */}
              {(workflow || focusQuality) && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {/* Focus score ring */}
                  {focusQuality && (
                    <ScoreRing score={focusQuality.overall} color={focusQuality.color} size={52} />
                  )}

                  {/* Workflow info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {workflow?.label && (
                      <>
                        <p style={{ fontSize: 8.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#5A6A88', margin: '0 0 3px' }}>
                          Current Workflow
                        </p>
                        <p style={{ fontSize: 12.5, fontWeight: 700, color: 'rgba(255,255,255,0.90)', margin: 0, lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                          {workflow.label}
                        </p>
                        {workflow.projectName && (
                          <p style={{ fontSize: 10, color: '#a78bfa', margin: '2px 0 0', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            ◆ {workflow.projectName}
                          </p>
                        )}
                      </>
                    )}
                    {focusQuality && (
                      <p style={{ fontSize: 9.5, color: focusQuality.color, margin: workflow?.label ? '3px 0 0' : 0, fontWeight: 600 }}>
                        Focus: {focusQuality.label}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Confidence bar */}
              {confidence > 0 && (
                <ConfidenceBar value={confidence} label={confidenceLabel} />
              )}

              {/* Continuity banner */}
              {continuity?.isContinuation && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 7, padding: '7px 10px',
                  borderRadius: 8, background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.20)',
                }}>
                  <span style={{ fontSize: 12 }}>↩</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 9.5, fontWeight: 700, color: '#34D399', margin: 0 }}>
                      {continuity.message}
                    </p>
                    <p style={{ fontSize: 9, color: 'rgba(52,211,153,0.60)', margin: '1px 0 0' }}>
                      Last session {continuity.gapLabel}
                    </p>
                  </div>
                </div>
              )}

              {/* Live insights grid */}
              {liveInsights.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  {liveInsights.map((insight, i) => (
                    <InsightChip key={i} insight={insight} />
                  ))}
                </div>
              )}

              {/* Project suggestion */}
              {projectSuggestion && onAcceptProjectSuggestion && (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                  padding: '8px 10px', borderRadius: 9,
                  background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.22)',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 8.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#A78BFA', margin: 0 }}>
                      AI Project Suggestion
                    </p>
                    <p style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.85)', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {projectSuggestion.projectName}
                    </p>
                  </div>
                  <button
                    onClick={() => onAcceptProjectSuggestion(projectSuggestion)}
                    style={{
                      flexShrink: 0, padding: '4px 10px', borderRadius: 7,
                      background: 'rgba(167,139,250,0.15)', border: '1px solid rgba(167,139,250,0.30)',
                      color: '#A78BFA', fontSize: 10, fontWeight: 700, cursor: 'pointer',
                    }}
                  >
                    Assign
                  </button>
                </div>
              )}

              {/* Recommendation */}
              {recommendation && (
                <div style={{
                  display: 'flex', alignItems: 'flex-start', gap: 7,
                  padding: '8px 10px', borderRadius: 9,
                  background: 'rgba(124,108,242,0.07)', border: '1px solid rgba(124,108,242,0.16)',
                }}>
                  <Brain size={12} color="#7c6cf2" style={{ flexShrink: 0, marginTop: 1 }} />
                  <p style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.60)', margin: 0, lineHeight: 1.5 }}>
                    {recommendation.text}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Post-session AI card (shown after session ends) ──────────────────────────
export function PostSessionAICard({ finalizedIntel, onDismiss }) {
  if (!finalizedIntel) return null;
  const { scoreCard, postInsights, recommendation, workflow, isDeepWork } = finalizedIntel;

  return (
    <div className="ai-fade" style={{
      borderRadius: 14,
      background: 'linear-gradient(145deg, rgba(12,15,26,0.99), rgba(10,12,22,0.99))',
      border: `1px solid ${scoreCard?.color || '#818CF8'}30`,
      boxShadow: `0 8px 32px rgba(0,0,0,0.45), 0 0 0 1px ${scoreCard?.color || '#818CF8'}15`,
      overflow: 'hidden',
    }}>
      <style>{`@keyframes ai-fade-in { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} } .ai-fade{animation:ai-fade-in 0.35s ease}`}</style>

      {/* Score header */}
      <div style={{
        padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)',
        background: `linear-gradient(135deg, ${scoreCard?.color || '#818CF8'}10, transparent)`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 40, height: 40, borderRadius: 11, background: `${scoreCard?.color || '#818CF8'}18`, border: `1px solid ${scoreCard?.color || '#818CF8'}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {isDeepWork ? <Zap size={18} color={scoreCard?.color || '#818CF8'} /> : <Target size={18} color={scoreCard?.color || '#818CF8'} />}
            </div>
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.10em', color: scoreCard?.color || '#818CF8', margin: 0 }}>Session Complete</p>
              <p style={{ fontSize: 14, fontWeight: 800, color: 'rgba(255,255,255,0.90)', margin: '2px 0 0', lineHeight: 1 }}>
                {scoreCard?.score || 0}<span style={{ fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.40)' }}>/100 · {scoreCard?.label}</span>
              </p>
            </div>
          </div>
          {onDismiss && (
            <button onClick={onDismiss} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.25)', cursor: 'pointer', padding: 4, fontSize: 16, lineHeight: 1 }}>✕</button>
          )}
        </div>
        {workflow?.label && (
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', margin: '8px 0 0' }}>
            {workflow.label}
            {workflow.primaryProject ? ` — ${workflow.primaryProject}` : ''}
          </p>
        )}
      </div>

      {/* Insights */}
      {postInsights?.length > 0 && (
        <div style={{ padding: '10px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {postInsights.map((ins, i) => <InsightChip key={i} insight={ins} />)}
        </div>
      )}

      {/* Recommendation */}
      {recommendation && (
        <div style={{ padding: '0 14px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7, padding: '8px 10px', borderRadius: 9, background: 'rgba(124,108,242,0.07)', border: '1px solid rgba(124,108,242,0.16)' }}>
            <Sparkles size={11} color="#7c6cf2" style={{ flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.55)', margin: 0, lineHeight: 1.5 }}>
              {recommendation}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
