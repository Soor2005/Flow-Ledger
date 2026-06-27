import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Download, X, FileText, Table2, Layers, LayoutGrid, CheckCircle2 } from 'lucide-react';

/**
 * ExportModal — export scope + format picker, fully light/dark adaptive.
 *
 * Props:
 *   open                {boolean}
 *   onClose             {() => void}
 *   reportTitle         {string}   — e.g. "Reports — Deep Work"
 *   currentSectionLabel {string}   — e.g. "Deep Work · Last 7 days"
 *   allSectionsLabel    {string}   — e.g. "All 7 modules: Deep Work, App Usage, …"
 *   onExport            {(format: 'csv'|'pdf', scope: 'current'|'full') => Promise<void>}
 */
export default function ExportModal({
  open,
  onClose,
  reportTitle,
  currentSectionLabel,
  allSectionsLabel,
  onExport,
}) {
  const [scope,   setScope]   = useState('full');
  const [format,  setFormat]  = useState('csv');
  const [loading, setLoading] = useState(false);
  const [done,    setDone]    = useState(false);

  // Reset every time the modal opens
  useEffect(() => {
    if (open) { setScope('full'); setFormat('csv'); setLoading(false); setDone(false); }
  }, [open]);

  // ESC to close
  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);

  if (!open) return null;

  const handleExport = async () => {
    setLoading(true);
    try {
      await onExport(format, scope);
      setDone(true);
      setTimeout(() => { setDone(false); onClose(); }, 900);
    } catch (err) {
      console.error('[ExportModal] export failed:', err);
      setLoading(false);
    }
  };

  const SCOPE_OPTIONS = [
    {
      id:    'current',
      label: 'Current Section Only',
      desc:  currentSectionLabel,
      Icon:  Layers,
    },
    {
      id:    'full',
      label: 'Full Page (All Sections)',
      desc:  allSectionsLabel,
      Icon:  LayoutGrid,
    },
  ];

  const FORMAT_OPTIONS = [
    {
      id:    'csv',
      label: 'CSV',
      desc:  'Excel & Sheets compatible',
      Icon:  Table2,
      color: '#34D399',
      iconBg: 'rgba(52,211,153,0.14)',
      iconBorder: 'rgba(52,211,153,0.26)',
    },
    {
      id:    'pdf',
      label: 'PDF',
      desc:  'Print-ready report',
      Icon:  FileText,
      color: '#60a5fa',
      iconBg: 'rgba(96,165,250,0.14)',
      iconBorder: 'rgba(96,165,250,0.26)',
    },
  ];

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Export report"
    >
      {/* ── Backdrop ── */}
      <div
        className="absolute inset-0 bg-black/[0.52] backdrop-blur-[5px]"
        onClick={onClose}
      />

      {/* ── Modal card ── */}
      <div className="fl-export-modal-card relative z-10 w-full max-w-[428px] overflow-hidden rounded-2xl">

        {/* ── Header ── */}
        <div className="fl-export-border-b flex items-center justify-between px-6 py-5">
          <div className="flex items-center gap-3">
            {/* Icon badge */}
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
              style={{ background: 'rgba(124,108,242,0.15)', border: '1px solid rgba(124,108,242,0.28)' }}
            >
              <Download size={15} style={{ color: '#9b8ff8' }} />
            </div>
            <div>
              <h2 className="text-[15px] font-bold leading-tight text-tx-primary">
                Export Report
              </h2>
              <p className="mt-0.5 max-w-[240px] truncate text-[11px] text-tx-faint">
                {reportTitle}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-tx-faint transition-all hover:bg-bg-hover hover:text-tx-primary"
          >
            <X size={14} />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="space-y-5 px-6 py-5">

          {/* ── Scope ── */}
          <div>
            <p className="fl-export-section-label">What to export</p>
            <div className="space-y-2">
              {SCOPE_OPTIONS.map(({ id, label, desc, Icon }) => {
                const active = scope === id;
                return (
                  <button
                    key={id}
                    onClick={() => setScope(id)}
                    className={`fl-export-scope-opt${active ? ' active' : ''} w-full flex items-start gap-3 rounded-xl px-4 py-3.5 text-left`}
                  >
                    {/* Radio dot */}
                    <div
                      className={`fl-export-radio${active ? ' active' : ''} mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full`}
                    >
                      {active && (
                        <div className="h-[6px] w-[6px] rounded-full bg-white" />
                      )}
                    </div>

                    {/* Text */}
                    <div className="min-w-0 flex-1">
                      <p className={`text-[13px] font-semibold leading-snug ${active ? 'text-tx-primary' : 'text-tx-secondary'}`}>
                        {label}
                      </p>
                      <p className="mt-1 text-[11px] leading-relaxed text-tx-faint">
                        {desc}
                      </p>
                    </div>

                    {/* Icon */}
                    <Icon
                      size={14}
                      className={`mt-0.5 shrink-0 transition-colors ${active ? 'text-accent' : 'text-tx-faint'}`}
                    />
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Format ── */}
          <div>
            <p className="fl-export-section-label">File format</p>
            <div className="grid grid-cols-2 gap-2.5">
              {FORMAT_OPTIONS.map(({ id, label, desc, Icon, color, iconBg, iconBorder }) => {
                const active = format === id;
                return (
                  <button
                    key={id}
                    onClick={() => setFormat(id)}
                    className={`fl-export-fmt-card${active ? ' active' : ''} relative flex flex-col items-center gap-3 rounded-xl p-4 text-center`}
                  >
                    {/* Selected checkmark */}
                    {active && (
                      <div className="absolute right-2.5 top-2.5">
                        <CheckCircle2 size={13} style={{ color: '#9b8ff8' }} />
                      </div>
                    )}

                    {/* Format icon */}
                    <div
                      className="flex h-11 w-11 items-center justify-center rounded-xl"
                      style={{ background: iconBg, border: `1px solid ${iconBorder}` }}
                    >
                      <Icon size={20} style={{ color }} />
                    </div>

                    <div>
                      <p className={`text-[13px] font-bold ${active ? 'text-tx-primary' : 'text-tx-secondary'}`}>
                        {label}
                      </p>
                      <p className="mt-0.5 text-[10px] text-tx-faint">{desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Format hint */}
            <p className="fl-export-hint mt-3 leading-relaxed">
              {format === 'csv'
                ? '📊 Downloads one clean, analysis-ready CSV file per dataset. Opens in Excel, Numbers, or Google Sheets.'
                : '🖨️ Generates a polished business report and prompts you to choose where to save the PDF.'}
            </p>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="fl-export-border-t flex items-center justify-between px-6 py-4">
          <button
            onClick={onClose}
            className="fl-export-cancel rounded-lg px-4 py-2 text-[13px] font-medium transition-colors"
          >
            Cancel
          </button>

          <button
            onClick={handleExport}
            disabled={loading || done}
            className="flex items-center gap-2.5 rounded-xl px-5 py-2.5 text-[13px] font-bold text-white transition-all disabled:opacity-75"
            style={{
              background: done
                ? 'linear-gradient(135deg, #059669 0%, #34D399 100%)'
                : 'linear-gradient(135deg, #5E52CC 0%, var(--color-accent) 55%, #9C8FF9 100%)',
              boxShadow: done
                ? '0 4px 20px rgba(52,211,153,0.38)'
                : '0 4px 20px rgba(124,108,242,0.48)',
            }}
          >
            {done ? (
              <><CheckCircle2 size={14} /> Exported!</>
            ) : loading ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Exporting…
              </>
            ) : (
              <><Download size={14} /> Export {format.toUpperCase()}</>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
