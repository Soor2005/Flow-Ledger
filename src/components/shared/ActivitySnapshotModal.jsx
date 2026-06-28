import React, { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import html2canvas from 'html2canvas';
import {
  Camera, X, Download, Copy, Share2, CheckCircle2, Loader2,
  Square, RectangleVertical, Smartphone, Sun, CalendarDays, CalendarRange,
} from 'lucide-react';
import { buildSnapshotData } from '../../utils/snapshotData';
import ActivitySnapshotTemplate, { SNAPSHOT_DIMENSIONS, SNAPSHOT_THEMES } from './ActivitySnapshotTemplate';

const PERIOD_OPTIONS = [
  { id: 'day',   label: 'Today',      Icon: Sun },
  { id: 'week',  label: 'This Week',  Icon: CalendarDays },
  { id: 'month', label: 'This Month', Icon: CalendarRange },
];

const FORMAT_OPTIONS = [
  { id: 'square',   label: 'Square',   desc: '1:1 · IG Post, LinkedIn', Icon: Square },
  { id: 'portrait', label: 'Portrait', desc: '4:5 · IG Post', Icon: RectangleVertical },
  { id: 'story',    label: 'Story',    desc: '9:16 · IG/Stories', Icon: Smartphone },
];

const THEME_OPTIONS = Object.entries(SNAPSHOT_THEMES).map(([id, t]) => ({ id, label: t.label, t }));

const GENERATING_MESSAGES = [
  'Crunching your activity data…',
  'Rendering your timeline…',
  'Polishing the visuals…',
  'Almost there…',
];

function canvasToBlob(canvas) {
  return new Promise(resolve => canvas.toBlob(resolve, 'image/png', 1));
}

function triggerDownload(blob, period) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `flow-ledger-snapshot-${period}-${Date.now()}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export default function ActivitySnapshotModal({ open, onClose, userId, accountName, initials, logoSrc }) {
  const [period, setPeriod]     = useState('day');
  const [format, setFormat]     = useState('square');
  const [theme,  setTheme]      = useState('midnight');
  const [stage,  setStage]      = useState('configure'); // configure | generating | ready | error
  const [progress, setProgress] = useState(0);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [error, setError]       = useState('');
  const [toast, setToast]       = useState(null);
  const [copying, setCopying]   = useState(false);
  const [sharing, setSharing]   = useState(false);

  const renderHostRef = useRef(null);
  const blobRef        = useRef(null);

  useEffect(() => {
    if (open) {
      setStage('configure');
      setPreviewUrl(null);
      setError('');
      blobRef.current = null;
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);

  // Premium generation animation — eases toward 92% over ~1.6s regardless of
  // how fast the real work finishes, then handleGenerate snaps it to 100%
  // once the canvas is actually ready. Never blocks on real timing, just
  // gives the action room to feel deliberate instead of instantaneous.
  useEffect(() => {
    if (stage !== 'generating') { setProgress(0); return; }
    const start = Date.now();
    let raf;
    const tick = () => {
      const elapsed = Date.now() - start;
      const pct = Math.min(92, (elapsed / 1600) * 92);
      setProgress(pct);
      if (pct < 92) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [stage]);

  const generatingMessage = GENERATING_MESSAGES[Math.min(
    GENERATING_MESSAGES.length - 1,
    Math.floor((progress / 92) * GENERATING_MESSAGES.length),
  )];

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  }, []);

  const handleGenerate = useCallback(async () => {
    setStage('generating');
    setError('');
    try {
      const data = await buildSnapshotData({ userId, period });

      // Render the dedicated off-screen template, then rasterize it.
      // Mount target lives outside the viewport (not display:none — html2canvas
      // needs real layout) so this never shows the actual interactive app UI.
      const { default: ReactDOM } = await import('react-dom/client');
      const host = renderHostRef.current;
      host.innerHTML = '';
      const root = ReactDOM.createRoot(host);

      await new Promise(resolve => {
        root.render(
          <ActivitySnapshotTemplate
            data={data}
            variant={format}
            theme={theme}
            accountName={accountName}
            initials={initials}
            logoSrc={logoSrc}
          />
        );
        // Two RAFs: one for React to commit, one for the browser to paint
        // (images like the logo need a layout pass before capture).
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      });

      const node = host.firstElementChild;
      const { width, height } = SNAPSHOT_DIMENSIONS[format] || SNAPSHOT_DIMENSIONS.story;
      const bgColor = SNAPSHOT_THEMES[theme]?.bg?.[0] || '#0A0810';
      const canvas = await html2canvas(node, {
        width, height, scale: 2, backgroundColor: bgColor,
        useCORS: true, logging: false,
      });
      root.unmount();
      host.innerHTML = '';

      const blob = await canvasToBlob(canvas);
      blobRef.current = blob;
      setPreviewUrl(URL.createObjectURL(blob));
      // Let the progress bar visibly reach 100% before switching views —
      // snapping straight from 92% to the preview feels abrupt.
      setProgress(100);
      await new Promise(r => setTimeout(r, 280));
      setStage('ready');
      // Auto-download on completion, then confirm with a toast.
      triggerDownload(blob, period);
      showToast('Snapshot generated & downloaded');
    } catch (err) {
      console.error('[ActivitySnapshot] generation failed:', err);
      setError('Could not generate the snapshot. Please try again.');
      setStage('error');
    }
  }, [userId, period, format, theme, accountName, initials, logoSrc, showToast]);

  const handleDownload = useCallback(() => {
    if (!blobRef.current) return;
    triggerDownload(blobRef.current, period);
    showToast('Snapshot downloaded');
  }, [period, showToast]);

  const handleCopy = useCallback(async () => {
    if (!blobRef.current || !navigator.clipboard?.write) {
      showToast('Copy not supported on this device — downloading instead');
      handleDownload();
      return;
    }
    setCopying(true);
    try {
      await navigator.clipboard.write([
        new window.ClipboardItem({ 'image/png': blobRef.current }),
      ]);
      showToast('Copied to clipboard');
    } catch (err) {
      console.error('[ActivitySnapshot] copy failed:', err);
      showToast('Could not copy — downloading instead');
      handleDownload();
    } finally {
      setCopying(false);
    }
  }, [handleDownload, showToast]);

  const handleShare = useCallback(async () => {
    if (!blobRef.current) return;
    const file = new File([blobRef.current], `flow-ledger-snapshot-${period}.png`, { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) {
      setSharing(true);
      try {
        await navigator.share({
          files: [file],
          title: 'My Flow Ledger Activity Snapshot',
          text: 'Check out my productivity snapshot from Flow Ledger.',
        });
      } catch (err) {
        // AbortError = user cancelled the share sheet — not a failure
        if (err?.name !== 'AbortError') {
          console.error('[ActivitySnapshot] share failed:', err);
          showToast('Could not share — downloading instead');
          handleDownload();
        }
      } finally {
        setSharing(false);
      }
    } else {
      showToast('Sharing not supported on this device — downloading instead');
      handleDownload();
    }
  }, [period, handleDownload, showToast]);

  if (!open) return null;

  return createPortal(
    <>
      {/* Off-screen render host for the export template — present in the DOM
          (so layout/measurement works for html2canvas) but positioned far
          outside the viewport, never visible to the user. */}
      <div ref={renderHostRef} style={{ position: 'fixed', top: 0, left: -99999, zIndex: -1, pointerEvents: 'none' }} />

      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Activity Snapshot">
        <div className="absolute inset-0 bg-black/[0.55] backdrop-blur-[5px]" onClick={onClose} />

        <div className="fl-export-modal-card relative z-10 w-full max-w-[460px] overflow-hidden rounded-2xl">
          {/* Header */}
          <div className="fl-export-border-b flex items-center justify-between px-6 py-5">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                style={{ background: 'rgba(139,92,246,0.16)', border: '1px solid rgba(139,92,246,0.30)' }}>
                <Camera size={15} style={{ color: '#A78BFA' }} />
              </div>
              <div>
                <h2 className="text-[15px] font-bold leading-tight text-tx-primary">Activity Snapshot</h2>
                <p className="mt-0.5 text-[11px] text-tx-faint">A shareable productivity summary image</p>
              </div>
            </div>
            <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg text-tx-faint transition-all hover:bg-bg-hover hover:text-tx-primary">
              <X size={14} />
            </button>
          </div>

          {/* Body */}
          <div className="px-6 py-5">
            {stage === 'configure' || stage === 'error' ? (
              <div className="space-y-5">
                <div>
                  <p className="fl-export-section-label">Time period</p>
                  <div className="grid grid-cols-3 gap-2">
                    {PERIOD_OPTIONS.map(({ id, label, Icon }) => {
                      const active = period === id;
                      return (
                        <button key={id} onClick={() => setPeriod(id)}
                          className={`fl-export-fmt-card${active ? ' active' : ''} flex flex-col items-center gap-2 rounded-xl p-3 text-center`}>
                          <Icon size={16} className={active ? 'text-accent' : 'text-tx-faint'} />
                          <span className={`text-[11.5px] font-semibold ${active ? 'text-tx-primary' : 'text-tx-secondary'}`}>{label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <p className="fl-export-section-label">Export format</p>
                  <div className="grid grid-cols-3 gap-2">
                    {FORMAT_OPTIONS.map(({ id, label, desc, Icon }) => {
                      const active = format === id;
                      return (
                        <button key={id} onClick={() => setFormat(id)}
                          className={`fl-export-fmt-card${active ? ' active' : ''} flex flex-col items-center gap-2 rounded-xl p-3 text-center`}>
                          {active && <div className="absolute right-2 top-2"><CheckCircle2 size={11} style={{ color: '#A78BFA' }} /></div>}
                          <Icon size={18} className={active ? 'text-accent' : 'text-tx-faint'} />
                          <span className={`text-[11.5px] font-semibold ${active ? 'text-tx-primary' : 'text-tx-secondary'}`}>{label}</span>
                          <span className="text-[9.5px] text-tx-faint leading-tight">{desc}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <p className="fl-export-section-label">Theme</p>
                  <div className="grid grid-cols-6 gap-2">
                    {THEME_OPTIONS.map(({ id, label, t }) => {
                      const active = theme === id;
                      return (
                        <button key={id} onClick={() => setTheme(id)} title={label}
                          className="flex flex-col items-center gap-1.5">
                          <span
                            className="block h-9 w-9 rounded-full transition-all"
                            style={{
                              background: `linear-gradient(135deg, ${t.bg[1]} 0%, ${t.bg[2]} 100%)`,
                              border: active ? `2px solid ${t.accent}` : '1px solid rgba(255,255,255,0.14)',
                              boxShadow: active ? `0 0 0 3px ${t.accent}33` : 'none',
                            }}
                          />
                          <span className={`text-[9px] font-semibold leading-tight ${active ? 'text-tx-primary' : 'text-tx-faint'}`}>{label.split(' ')[0]}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {error && (
                  <p className="text-[11.5px] font-medium text-red-400">{error}</p>
                )}
              </div>
            ) : stage === 'generating' ? (
              <div className="flex flex-col items-center justify-center gap-5 py-10">
                <div className="relative flex h-16 w-16 items-center justify-center">
                  <Loader2 size={32} className="animate-spin" style={{ color: '#A78BFA' }} />
                  <Camera size={14} className="absolute" style={{ color: '#A78BFA' }} />
                </div>
                <div className="w-full text-center">
                  <p className="text-[13px] font-semibold text-tx-primary">Generating your Activity Snapshot…</p>
                  <p className="mt-1 text-[11.5px] text-tx-faint">{generatingMessage}</p>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${progress}%`,
                      background: 'linear-gradient(90deg, #6D28D9, #A78BFA)',
                      transition: 'width 0.15s linear',
                    }}
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="overflow-hidden rounded-xl border border-white/10 bg-black/30">
                  <img src={previewUrl} alt="Activity snapshot preview" className="w-full" style={{ maxHeight: 360, objectFit: 'contain', display: 'block', margin: '0 auto' }} />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <button onClick={handleDownload}
                    className="flex flex-col items-center gap-1.5 rounded-xl px-3 py-3 text-[11.5px] font-semibold text-tx-primary transition-colors hover:bg-bg-hover"
                    style={{ border: '1px solid rgba(255,255,255,0.10)' }}>
                    <Download size={15} /> Download
                  </button>
                  <button onClick={handleCopy} disabled={copying}
                    className="flex flex-col items-center gap-1.5 rounded-xl px-3 py-3 text-[11.5px] font-semibold text-tx-primary transition-colors hover:bg-bg-hover disabled:opacity-60"
                    style={{ border: '1px solid rgba(255,255,255,0.10)' }}>
                    {copying ? <Loader2 size={15} className="animate-spin" /> : <Copy size={15} />} Copy
                  </button>
                  <button onClick={handleShare} disabled={sharing}
                    className="flex flex-col items-center gap-1.5 rounded-xl px-3 py-3 text-[11.5px] font-semibold text-tx-primary transition-colors hover:bg-bg-hover disabled:opacity-60"
                    style={{ border: '1px solid rgba(255,255,255,0.10)' }}>
                    {sharing ? <Loader2 size={15} className="animate-spin" /> : <Share2 size={15} />} Share
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="fl-export-border-t flex items-center justify-between px-6 py-4">
            <button onClick={onClose} className="rounded-lg px-4 py-2 text-[13px] font-medium text-tx-faint transition-colors hover:bg-bg-hover hover:text-tx-primary">
              {stage === 'ready' ? 'Close' : 'Cancel'}
            </button>

            {(stage === 'configure' || stage === 'error') && (
              <button onClick={handleGenerate}
                className="flex items-center gap-2.5 rounded-xl px-5 py-2.5 text-[13px] font-bold text-white transition-all"
                style={{ background: 'linear-gradient(135deg, #6D28D9 0%, #8B5CF6 55%, #A78BFA 100%)', boxShadow: '0 4px 20px rgba(139,92,246,0.42)' }}>
                <Camera size={14} /> Generate Snapshot
              </button>
            )}
            {stage === 'ready' && (
              <button onClick={() => setStage('configure')}
                className="flex items-center gap-2 rounded-lg px-4 py-2 text-[12.5px] font-semibold text-tx-secondary transition-colors hover:bg-bg-hover hover:text-tx-primary">
                Generate another
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="pointer-events-none fixed bottom-6 right-6 z-[10000] flex items-center gap-2.5 rounded-2xl px-4 py-3"
          style={{
            background: 'linear-gradient(145deg,rgba(18,24,38,0.97),rgba(12,16,26,0.99))',
            border: '1px solid rgba(139,92,246,0.30)',
            boxShadow: '0 16px 40px rgba(0,0,0,0.32),inset 0 1px 0 rgba(255,255,255,0.05)',
            backdropFilter: 'blur(20px)',
          }}>
          <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full" style={{ background: 'rgba(139,92,246,0.22)' }}>
            <CheckCircle2 size={12} style={{ color: '#A78BFA' }} />
          </div>
          <span className="text-[12.5px] font-semibold text-white">{toast}</span>
        </div>
      )}
    </>,
    document.body
  );
}
