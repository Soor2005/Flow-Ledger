import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, FileText, Check, AlertCircle, Clock } from 'lucide-react';

const api = window.electron || {};

function fmtTime(d) {
  const h = d.getHours(), m = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
}

// ─── Light / dark mode hook ───────────────────────────────────────────────────
function useIsLight() {
  const [isLight, setIsLight] = useState(
    () => document.documentElement.classList.contains('theme-light')
  );
  useEffect(() => {
    const obs = new MutationObserver(() =>
      setIsLight(document.documentElement.classList.contains('theme-light'))
    );
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  return isLight;
}

// ─── Per-theme palette ────────────────────────────────────────────────────────
function makeNT(isLight) {
  if (isLight) return {
    // Card surface
    cardBg:          'rgba(255,255,255,0.98)',
    cardBackdrop:    'blur(24px) saturate(160%)',
    cardBorder:      'rgba(107,92,242,0.14)',
    cardShadow:      '0 -6px 40px rgba(83,71,199,0.12), 0 8px 32px rgba(0,0,0,0.06), 0 0 0 1px rgba(107,92,242,0.07)',
    // Header
    headerBorder:    'rgba(107,92,242,0.08)',
    iconBg:          'rgba(107,92,242,0.10)',
    iconBorder:      'rgba(107,92,242,0.18)',
    iconColor:       '#5347C7',
    titleColor:      '#1A1730',
    metaColor:       'rgba(26,23,48,0.45)',
    // Close button
    closeBg:         'transparent',
    closeColor:      'rgba(26,23,48,0.35)',
    closeHoverBg:    'rgba(107,92,242,0.08)',
    closeHoverColor: '#1A1730',
    // Textarea
    textColor:       '#1A1730',
    placeholderColor:'rgba(26,23,48,0.32)',
    caretColor:      '#5347C7',
    // Footer
    footerBorder:    'rgba(107,92,242,0.07)',
    hintColor:       'rgba(26,23,48,0.30)',
    charCountColor:  'rgba(26,23,48,0.25)',
    // Save states
    savingColor:     '#5347C7',
    savedColor:      '#059669',
    errorColor:      '#DC2626',
  };

  // Dark mode
  return {
    cardBg:          'rgba(8,9,18,0.97)',
    cardBackdrop:    'blur(48px) saturate(200%)',
    cardBorder:      'rgba(255,255,255,0.09)',
    cardShadow:      '0 -8px 48px rgba(0,0,0,0.72), 0 0 0 1px rgba(124,108,242,0.07)',
    headerBorder:    'rgba(255,255,255,0.06)',
    iconBg:          'rgba(168,156,247,0.12)',
    iconBorder:      'rgba(168,156,247,0.20)',
    iconColor:       '#A89CF7',
    titleColor:      '#DDE2F4',
    metaColor:       'rgba(255,255,255,0.28)',
    closeBg:         'transparent',
    closeColor:      'rgba(255,255,255,0.32)',
    closeHoverBg:    'rgba(255,255,255,0.07)',
    closeHoverColor: '#fff',
    textColor:       '#C8D0E8',
    placeholderColor:'rgba(255,255,255,0.22)',
    caretColor:      '#A89CF7',
    footerBorder:    'rgba(255,255,255,0.05)',
    hintColor:       'rgba(255,255,255,0.20)',
    charCountColor:  'rgba(255,255,255,0.16)',
    savingColor:     '#A89CF7',
    savedColor:      '#34D399',
    errorColor:      '#F87171',
  };
}

export default function SessionNotesModal({ session, onClose }) {
  const isLight = useIsLight();
  const NT = makeNT(isLight);

  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const [saveError, setSaveError] = useState(false);
  const textareaRef = useRef(null);
  const savedRef = useRef('');
  const saveTimerRef = useRef(null);

  // ── Load existing notes on mount ────────────────────────────────────────────
  useEffect(() => {
    const raw = session?.notes || '';
    setText(raw);
    savedRef.current = raw;
  }, [session?.id]);

  // ── Auto-focus ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => textareaRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, []);

  // ── Escape to close ─────────────────────────────────────────────────────────
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') handleClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  const save = useCallback(async (t) => {
    if (!session?.id) return;
    setSaving(true);
    setSaveError(false);
    try {
      await api.updateSession?.({
        sessionId: session.id,
        title:     session.title    || '',
        category:  session.category || 'General',
        notes:     t,
        projectId: session.project_id || null,
        clientId:  session.client_id  || null,
      });
      savedRef.current = t;
      setLastSaved(new Date());
    } catch {
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  }, [session]);

  // ── Debounced autosave — 600ms after last keystroke ─────────────────────────
  const handleChange = useCallback((e) => {
    const val = e.target.value;
    setText(val);
    setSaveError(false);
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => save(val), 600);
  }, [save]);

  // ── Ctrl/Cmd+S — immediate save ─────────────────────────────────────────────
  const handleKeyDown = useCallback((e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      clearTimeout(saveTimerRef.current);
      save(text);
    }
  }, [text, save]);

  const handleClose = useCallback(() => {
    clearTimeout(saveTimerRef.current);
    if (text !== savedRef.current) save(text);
    onClose();
  }, [text, save, onClose]);

  useEffect(() => () => clearTimeout(saveTimerRef.current), []);

  const sessionLabel = session?.title || session?.category || 'Focus Session';
  const startedLabel = session?.started_at
    ? fmtTime(new Date(session.started_at * 1000))
    : '';

  return createPortal(
    <div style={{
      position: 'fixed', bottom: 76, right: 24, zIndex: 9995,
      width: 364, maxWidth: 'calc(100vw - 48px)',
    }}>
      <div
        className="fl-session-notes-modal"
        style={{
          background:          NT.cardBg,
          backdropFilter:      NT.cardBackdrop,
          WebkitBackdropFilter:NT.cardBackdrop,
          border:              `1px solid ${NT.cardBorder}`,
          borderRadius:        16,
          boxShadow:           NT.cardShadow,
          overflow:            'hidden',
          animation:           'fl-notes-appear 0.20s cubic-bezier(0.34,1.2,0.64,1) both',
        }}
      >
        {/* ── Header ── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 9,
          padding: '11px 13px 9px',
          borderBottom: `1px solid ${NT.headerBorder}`,
        }}>
          {/* Icon */}
          <div style={{
            width: 28, height: 28, borderRadius: 8, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: NT.iconBg, border: `1px solid ${NT.iconBorder}`,
          }}>
            <FileText size={13} style={{ color: NT.iconColor }} />
          </div>

          {/* Session info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 12, fontWeight: 600,
              color: NT.titleColor,
              lineHeight: 1.2,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {sessionLabel}
            </div>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 4,
              fontSize: 9.5, color: NT.metaColor,
              lineHeight: 1.2, marginTop: 2,
            }}>
              <Clock size={8} />
              <span>Session notes{startedLabel ? ` · started ${startedLabel}` : ''}</span>
            </div>
          </div>

          {/* Close */}
          <button
            onClick={handleClose}
            style={{
              width: 26, height: 26, borderRadius: 7, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: NT.closeBg, border: 'none',
              color: NT.closeColor, cursor: 'pointer', transition: 'all 0.13s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.color = NT.closeHoverColor;
              e.currentTarget.style.background = NT.closeHoverBg;
            }}
            onMouseLeave={e => {
              e.currentTarget.style.color = NT.closeColor;
              e.currentTarget.style.background = NT.closeBg;
            }}
          >
            <X size={12} />
          </button>
        </div>

        {/* ── Textarea ── */}
        <div style={{ padding: '10px 13px 6px' }}>
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Add context, goals, blockers, or reminders for this session…"
            rows={5}
            style={{
              width: '100%', minHeight: 110, maxHeight: 260,
              background: 'transparent', border: 'none', outline: 'none',
              resize: 'vertical',
              color:      NT.textColor,
              fontSize: 12.5, lineHeight: 1.65, fontFamily: 'inherit',
              caretColor: NT.caretColor,
              /* placeholder color is set via a CSS class below */
            }}
            className={isLight ? 'fl-notes-textarea-light' : 'fl-notes-textarea-dark'}
          />
        </div>

        {/* ── Footer ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '5px 13px 10px',
          borderTop: `1px solid ${NT.footerBorder}`,
        }}>
          {/* Save status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10 }}>
            {saving ? (
              <>
                <div style={{
                  width: 8, height: 8, borderRadius: '50%',
                  border: '1.5px solid transparent',
                  borderTopColor: NT.savingColor,
                  animation: 'fl-spin 0.7s linear infinite', flexShrink: 0,
                }} />
                <span style={{ color: NT.savingColor }}>Saving…</span>
              </>
            ) : saveError ? (
              <>
                <AlertCircle size={10} style={{ color: NT.errorColor }} />
                <span style={{ color: NT.errorColor }}>Save failed — retry Ctrl+S</span>
              </>
            ) : lastSaved ? (
              <>
                <Check size={10} style={{ color: NT.savedColor }} />
                <span style={{ color: NT.savedColor }}>Saved at {fmtTime(lastSaved)}</span>
              </>
            ) : (
              <span style={{ color: NT.hintColor }}>Ctrl+S to save · Esc to close</span>
            )}
          </div>

          {/* Char count */}
          {text.length > 0 && (
            <span style={{
              fontSize: 10, color: NT.charCountColor,
              fontVariantNumeric: 'tabular-nums',
            }}>
              {text.length} chars
            </span>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
