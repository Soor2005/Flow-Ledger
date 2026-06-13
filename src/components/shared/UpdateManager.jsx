import React, {
  createContext, useContext, useState, useEffect,
  useCallback, useRef,
} from 'react';
import ReactDOM from 'react-dom';
import {
  Download, X, AlertCircle, CheckCircle2, Zap,
  ArrowRight, RotateCcw, ChevronDown, ChevronUp,
} from 'lucide-react';

const api = window.electron || {};

// ─── Context ──────────────────────────────────────────────────────────────────
export const UpdateContext = createContext(null);
export const useUpdater = () => useContext(UpdateContext);

// ─── Utilities ────────────────────────────────────────────────────────────────
function fmtBytes(bytes) {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtSpeed(bps) {
  if (!bps) return '';
  if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(0)} KB/s`;
  return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`;
}

export function fmtCheckTime(iso) {
  if (!iso) return 'Never';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000)        return 'Just now';
  if (diff < 3_600_000)     return `${Math.floor(diff / 60_000)} min ago`;
  if (diff < 86_400_000)    return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(iso).toLocaleDateString();
}

// ─── Inject keyframe animations once ─────────────────────────────────────────
let _animationsInjected = false;
function injectAnimations() {
  if (_animationsInjected || typeof document === 'undefined') return;
  _animationsInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    @keyframes fl-slide-up-in {
      from { opacity: 0; transform: translateY(18px) scale(0.97); }
      to   { opacity: 1; transform: translateY(0)    scale(1);    }
    }
    @keyframes fl-fade-in {
      from { opacity: 0; }
      to   { opacity: 1; }
    }
    @keyframes fl-pulse-dot {
      0%, 100% { opacity: 1; }
      50%       { opacity: 0.4; }
    }
    .fl-upd-card {
      animation: fl-slide-up-in 0.28s cubic-bezier(0.22, 1, 0.36, 1) forwards;
    }
    .fl-upd-overlay {
      animation: fl-fade-in 0.18s ease forwards;
    }
    .fl-upd-progress-fill {
      transition: width 0.45s ease;
    }
    @keyframes fl-upd-shimmer {
      0%, 100% { transform: translateX(-100%); }
      50%       { transform: translateX(100%); }
    }
  `;
  document.head.appendChild(style);
}

// ─── Provider ─────────────────────────────────────────────────────────────────
export function UpdateProvider({ children }) {
  const [phase, setPhase]           = useState('idle');
  const [updateInfo, setUpdateInfo] = useState(null);
  const [progress, setProgress]     = useState(null);
  const [error, setError]           = useState(null);
  const [currentVersion, setCurrentVersion] = useState('');
  const [channel, setChannelState]  = useState('stable');
  const [lastCheckAt, setLastCheckAt] = useState(null);
  const [dismissed, setDismissed]   = useState(false);

  useEffect(() => { injectAnimations(); }, []);

  // Load initial info from main process
  useEffect(() => {
    api.updaterGetInfo?.().then((info) => {
      if (!info) return;
      setCurrentVersion(info.currentVersion || '');
      setChannelState(info.channel || 'stable');
      if (info.lastCheckAt) setLastCheckAt(info.lastCheckAt);
    }).catch(() => {});
  }, []);

  // Subscribe to IPC push events
  useEffect(() => {
    const subs = [
      api.onUpdaterChecking?.((d) => {
        setPhase('checking');
        setError(null);
        if (d?.lastCheckAt) setLastCheckAt(d.lastCheckAt);
      }),
      api.onUpdaterAvailable?.((info) => {
        setUpdateInfo(info);
        setDismissed(false);
        setPhase('available');
      }),
      api.onUpdaterNotAvailable?.((d) => {
        if (d?.lastCheckAt) setLastCheckAt(d.lastCheckAt);
        setPhase('idle');
      }),
      api.onUpdaterProgress?.((p) => {
        setProgress(p);
        setPhase('downloading');
      }),
      api.onUpdaterDownloaded?.((info) => {
        setUpdateInfo(prev => ({ ...prev, ...info }));
        setProgress(null);
        setPhase('downloaded');
      }),
      api.onUpdaterError?.((d) => {
        setError(d?.message || 'Update failed');
        setPhase('error');
      }),
    ];
    return () => subs.forEach(unsub => unsub?.());
  }, []);

  const check = useCallback(async () => {
    setPhase('checking');
    setError(null);
    const result = await api.updaterCheck?.().catch(() => ({ ok: false, error: 'IPC unavailable' }));
    if (result?.dev) {
      // dev mode: simulate check completion
      setTimeout(() => setPhase('idle'), 1200);
    } else if (!result?.ok) {
      setError(result?.error || 'Check failed');
      setPhase('error');
    }
    return result;
  }, []);

  const download = useCallback(async () => {
    setPhase('downloading');
    setProgress({ percent: 0, transferred: 0, total: 0, bytesPerSecond: 0 });
    const result = await api.updaterDownload?.().catch(() => ({ ok: false, error: 'IPC unavailable' }));
    if (!result?.ok) {
      setError(result?.error || 'Download failed');
      setPhase('error');
    }
  }, []);

  const install = useCallback(() => {
    api.updaterInstall?.();
  }, []);

  const setChannel = useCallback(async (ch) => {
    const result = await api.updaterSetChannel?.({ channel: ch }).catch(() => null);
    if (result?.ok) setChannelState(result.channel);
    return result;
  }, []);

  const dismiss = useCallback(() => setDismissed(true), []);

  const ctx = {
    phase, updateInfo, progress, error,
    currentVersion, channel, lastCheckAt, dismissed,
    check, download, install, setChannel, dismiss,
  };

  const showFloating = ['available', 'downloading', 'downloaded', 'error'].includes(phase) && !dismissed;

  return (
    <UpdateContext.Provider value={ctx}>
      {children}
      {showFloating && ReactDOM.createPortal(<FloatingCard />, document.body)}
    </UpdateContext.Provider>
  );
}

// ─── Floating notification card ───────────────────────────────────────────────
function FloatingCard() {
  const { phase, updateInfo, progress, error, check, download, install, dismiss } = useUpdater();
  const [showNotes, setShowNotes] = useState(false);

  const cardBase = {
    position: 'fixed', bottom: 24, right: 24, zIndex: 99999,
    width: 348,
    borderRadius: 16,
    backdropFilter: 'blur(28px)', WebkitBackdropFilter: 'blur(28px)',
  };

  // ── Available ──────────────────────────────────────────────────────────────
  if (phase === 'available') {
    const mandatory = updateInfo?.mandatory;
    const hasNotes  = updateInfo?.releaseNotes?.length > 0;
    const longNotes = hasNotes && updateInfo.releaseNotes.length > 120;

    return (
      <div className="fl-upd-card" style={{
        ...cardBase,
        background: 'linear-gradient(150deg, rgba(19,22,36,0.98) 0%, rgba(13,15,24,0.99) 100%)',
        border: '1px solid rgba(124,108,242,0.30)',
        boxShadow: '0 32px 80px rgba(0,0,0,0.60), 0 0 0 1px rgba(124,108,242,0.08) inset',
        overflow: 'hidden',
      }}>
        {/* Accent stripe */}
        <div style={{ height: 3, background: 'linear-gradient(90deg, #7c6cf2, #a78bfa, #60a5fa)', opacity: 0.9 }} />

        <div style={{ padding: '15px 17px 17px' }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 13 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <div style={{ width: 36, height: 36, borderRadius: 11, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(124,108,242,0.18)', border: '1px solid rgba(124,108,242,0.35)', boxShadow: '0 0 14px rgba(124,108,242,0.20)' }}>
                <Zap size={17} style={{ color: '#a78bfa' }} />
              </div>
              <div>
                <p style={{ fontSize: 13, fontWeight: 700, color: '#EAEAF0', letterSpacing: '-0.01em', lineHeight: 1.2 }}>Update Available</p>
                <p style={{ fontSize: 10.5, color: '#6B7280', marginTop: 2 }}>Flow Ledger {updateInfo?.version}</p>
              </div>
            </div>
            {!mandatory && (
              <button onClick={dismiss} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4B5263', padding: '3px 3px', borderRadius: 7, display: 'flex', lineHeight: 1, transition: 'color 0.12s' }}
                onMouseOver={e => e.currentTarget.style.color = '#9CA3AF'}
                onMouseOut={e => e.currentTarget.style.color = '#4B5263'}>
                <X size={14} />
              </button>
            )}
          </div>

          {/* Meta chips */}
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: hasNotes ? 12 : 14 }}>
            <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 11px', borderRadius: 99, background: 'rgba(124,108,242,0.18)', color: '#c4b5fd', border: '1px solid rgba(124,108,242,0.32)' }}>
              v{updateInfo?.version}
            </span>
            {updateInfo?.sizeBytes > 0 && (
              <span style={{ fontSize: 10.5, color: '#6B7280', padding: '3px 9px', borderRadius: 99, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                {fmtBytes(updateInfo.sizeBytes)}
              </span>
            )}
            {updateInfo?.releaseDate && (
              <span style={{ fontSize: 10.5, color: '#6B7280', padding: '3px 9px', borderRadius: 99, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                {new Date(updateInfo.releaseDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            )}
            {mandatory && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 99, background: 'rgba(239,68,68,0.16)', color: '#f87171', border: '1px solid rgba(239,68,68,0.30)', letterSpacing: '0.03em' }}>
                REQUIRED
              </span>
            )}
          </div>

          {/* Release notes */}
          {hasNotes && (
            <div style={{ marginBottom: 14 }}>
              <div style={{
                fontSize: 11, color: '#9CA3AF', lineHeight: 1.65,
                background: 'rgba(255,255,255,0.028)', borderRadius: 10,
                padding: '9px 11px',
                border: '1px solid rgba(255,255,255,0.055)',
                maxHeight: showNotes ? 220 : 64, overflow: 'hidden',
                transition: 'max-height 0.22s ease',
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}>
                {updateInfo.releaseNotes}
              </div>
              {longNotes && (
                <button onClick={() => setShowNotes(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 10.5, color: '#7c6cf2', marginTop: 5, padding: 0, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3, transition: 'color 0.12s' }}
                  onMouseOver={e => e.currentTarget.style.color = '#a78bfa'}
                  onMouseOut={e => e.currentTarget.style.color = '#7c6cf2'}>
                  {showNotes ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                  {showNotes ? 'Show less' : 'Read more'}
                </button>
              )}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={download} style={{
              flex: 1, height: 38, borderRadius: 11, border: 'none', cursor: 'pointer',
              background: 'linear-gradient(135deg, #7c6cf2 0%, #9D8FF5 100%)',
              color: 'white', fontSize: 12.5, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              boxShadow: '0 5px 18px rgba(124,108,242,0.38)',
              transition: 'filter 0.12s',
            }}
              onMouseOver={e => e.currentTarget.style.filter = 'brightness(1.13)'}
              onMouseOut={e => e.currentTarget.style.filter = ''}>
              <Download size={13} strokeWidth={2.5} />
              Update Now
            </button>
            {!mandatory && (
              <button onClick={dismiss} style={{
                height: 38, padding: '0 15px', borderRadius: 11, cursor: 'pointer',
                background: 'rgba(255,255,255,0.045)',
                border: '1px solid rgba(255,255,255,0.09)',
                color: '#6B7280', fontSize: 12, fontWeight: 600,
                transition: 'all 0.12s', whiteSpace: 'nowrap',
              }}
                onMouseOver={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = '#9CA3AF'; }}
                onMouseOut={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.045)'; e.currentTarget.style.color = '#6B7280'; }}>
                Later
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Downloading ────────────────────────────────────────────────────────────
  if (phase === 'downloading') {
    const pct   = progress?.percent ?? 0;
    const speed = fmtSpeed(progress?.bytesPerSecond);
    const done  = fmtBytes(progress?.transferred);
    const total = fmtBytes(progress?.total);

    return (
      <div className="fl-upd-card" style={{
        ...cardBase,
        background: 'linear-gradient(150deg, rgba(19,22,36,0.98) 0%, rgba(13,15,24,0.99) 100%)',
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 28px 72px rgba(0,0,0,0.55)',
        overflow: 'hidden',
      }}>
        {/* Animated progress stripe at top */}
        <div style={{ height: 3, background: 'rgba(255,255,255,0.05)', position: 'relative', overflow: 'hidden' }}>
          <div className="fl-upd-progress-fill" style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg, #7c6cf2, #9D8FF5)', boxShadow: '0 0 8px rgba(124,108,242,0.55)' }} />
        </div>

        <div style={{ padding: '15px 17px 17px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 14 }}>
            <div style={{ width: 36, height: 36, borderRadius: 11, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(124,108,242,0.15)', border: '1px solid rgba(124,108,242,0.28)' }}>
              <Download size={16} style={{ color: '#a78bfa', animation: 'fl-pulse-dot 1.6s ease-in-out infinite' }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#EAEAF0', marginBottom: 2 }}>Downloading update…</p>
              <p style={{ fontSize: 10.5, color: '#6B7280', fontVariantNumeric: 'tabular-nums' }}>
                {done && total ? `${done} / ${total}` : done || '…'}
                {speed ? ` · ${speed}` : ''}
              </p>
            </div>
            <span style={{ fontSize: 13, fontWeight: 800, color: '#a78bfa', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
              {pct.toFixed(0)}%
            </span>
          </div>

          {/* Progress bar */}
          <div style={{ height: 5, borderRadius: 99, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
            <div className="fl-upd-progress-fill" style={{ height: '100%', borderRadius: 99, width: `${pct}%`, background: 'linear-gradient(90deg, #7c6cf2, #9D8FF5)', boxShadow: '0 0 10px rgba(124,108,242,0.50)' }} />
          </div>

          <p style={{ fontSize: 10, color: '#4B5263', marginTop: 8 }}>
            Flow Ledger will restart automatically after installation.
          </p>
        </div>
      </div>
    );
  }

  // ── Downloaded — ready to install ──────────────────────────────────────────
  if (phase === 'downloaded') {
    const mandatory = updateInfo?.mandatory;

    return (
      <div className="fl-upd-card" style={{
        ...cardBase,
        background: 'linear-gradient(150deg, rgba(10,26,22,0.98) 0%, rgba(7,18,16,0.99) 100%)',
        border: '1px solid rgba(16,185,129,0.30)',
        boxShadow: '0 32px 80px rgba(0,0,0,0.60), 0 0 0 1px rgba(16,185,129,0.07) inset',
        overflow: 'hidden',
      }}>
        <div style={{ height: 3, background: 'linear-gradient(90deg, #10b981, #34d399)', opacity: 0.85 }} />

        <div style={{ padding: '15px 17px 17px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 15 }}>
            <div style={{ width: 36, height: 36, borderRadius: 11, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(16,185,129,0.18)', border: '1px solid rgba(16,185,129,0.35)', boxShadow: '0 0 14px rgba(16,185,129,0.22)' }}>
              <CheckCircle2 size={18} style={{ color: '#34d399' }} />
            </div>
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#EAEAF0', marginBottom: 2 }}>Ready to install</p>
              <p style={{ fontSize: 10.5, color: '#6B7280' }}>v{updateInfo?.version} — restart to finish updating</p>
            </div>
          </div>

          <div style={{ fontSize: 10.5, color: '#4B5263', background: 'rgba(16,185,129,0.07)', borderRadius: 9, padding: '8px 11px', border: '1px solid rgba(16,185,129,0.14)', marginBottom: 14, lineHeight: 1.55 }}>
            Your data, settings, and sessions are preserved automatically.
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={install} style={{
              flex: 1, height: 38, borderRadius: 11, border: 'none', cursor: 'pointer',
              background: 'linear-gradient(135deg, #10b981 0%, #34d399 100%)',
              color: 'white', fontSize: 12.5, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              boxShadow: '0 5px 18px rgba(16,185,129,0.36)',
              transition: 'filter 0.12s',
            }}
              onMouseOver={e => e.currentTarget.style.filter = 'brightness(1.1)'}
              onMouseOut={e => e.currentTarget.style.filter = ''}>
              <ArrowRight size={14} strokeWidth={2.5} />
              Restart & Install
            </button>
            {!mandatory && (
              <button onClick={dismiss} style={{
                height: 38, padding: '0 15px', borderRadius: 11, cursor: 'pointer',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#6B7280', fontSize: 12, fontWeight: 600,
                transition: 'all 0.12s', whiteSpace: 'nowrap',
              }}
                onMouseOver={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = '#9CA3AF'; }}
                onMouseOut={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = '#6B7280'; }}>
                Later
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (phase === 'error') {
    return (
      <div className="fl-upd-card" style={{
        ...cardBase,
        background: 'linear-gradient(150deg, rgba(22,10,10,0.98) 0%, rgba(15,7,7,0.99) 100%)',
        border: '1px solid rgba(239,68,68,0.24)',
        boxShadow: '0 24px 64px rgba(0,0,0,0.55)',
        overflow: 'hidden',
      }}>
        <div style={{ height: 3, background: 'linear-gradient(90deg, #ef4444, #f87171)', opacity: 0.8 }} />

        <div style={{ padding: '15px 17px 17px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 13 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flex: 1, minWidth: 0 }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(239,68,68,0.16)', border: '1px solid rgba(239,68,68,0.30)' }}>
                <AlertCircle size={16} style={{ color: '#f87171' }} />
              </div>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: '#fca5a5', marginBottom: 4 }}>Update failed</p>
                <p style={{ fontSize: 10.5, color: '#6B7280', lineHeight: 1.55, wordBreak: 'break-word' }}>
                  {error || 'An unexpected error occurred while checking for updates.'}
                </p>
              </div>
            </div>
            <button onClick={dismiss} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4B5263', padding: 3, borderRadius: 6, flexShrink: 0, lineHeight: 1, transition: 'color 0.12s' }}
              onMouseOver={e => e.currentTarget.style.color = '#9CA3AF'}
              onMouseOut={e => e.currentTarget.style.color = '#4B5263'}>
              <X size={13} />
            </button>
          </div>

          <button onClick={check} style={{
            width: '100%', height: 34, borderRadius: 9, cursor: 'pointer',
            background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.26)',
            color: '#f87171', fontSize: 11.5, fontWeight: 600,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            transition: 'background 0.12s',
          }}
            onMouseOver={e => e.currentTarget.style.background = 'rgba(239,68,68,0.22)'}
            onMouseOut={e => e.currentTarget.style.background = 'rgba(239,68,68,0.12)'}>
            <RotateCcw size={11} />
            Retry
          </button>
        </div>
      </div>
    );
  }

  return null;
}
