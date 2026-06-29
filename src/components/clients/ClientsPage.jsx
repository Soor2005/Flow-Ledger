import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Plus, Search, X, Check, ChevronDown, Users, Upload, DollarSign,
  Clock, MoreHorizontal, Edit2, Trash2, ToggleLeft, ToggleRight,
  Building2, Mail, Filter, ArrowUpDown, ExternalLink, Tag, Download,
} from 'lucide-react';
import DetailAnalyticsModal from '../shared/DetailAnalyticsModal';
import CsvImportModal from '../shared/CsvImportModal';
import { downloadCSV } from '../../utils/csv';
import { CURRENCIES, currencySymbol, fmtMoneyCompact } from '../../utils/currency';

const api = window.electron || {};

const COLORS = ['#6366f1','#7c6cf2','#2f81f7','#3fb950','#d29922','#f87171','#06b6d4','#f97316','#ec4899','#7c6cf2'];

const BILLING_OPTIONS = [
  { value: 'none',     label: 'None',     color: '#6b7280' },
  { value: 'hourly',   label: 'Hourly',   color: '#3fb950' },
  { value: 'retainer', label: 'Retainer', color: '#2f81f7' },
  { value: 'hybrid',   label: 'Hybrid',   color: '#f97316' },
];

const STATUS_OPTIONS = [
  { value: 'active',   label: 'Active',   color: '#3fb950', bg: '#3fb95015' },
  { value: 'inactive', label: 'Inactive', color: '#6b7280', bg: '#6b728015' },
  { value: 'paused',   label: 'Paused',   color: '#d29922', bg: '#d2992215' },
];

function fmt(s) {
  if (!s) return '—';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtDate(u) {
  if (!u) return '—';
  const d = new Date(u * 1000);
  const now = new Date();
  const diffDays = Math.floor((now - d) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7)  return `${diffDays}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function BillingBadge({ type }) {
  const opt = BILLING_OPTIONS.find(o => o.value === (type || 'none')) || BILLING_OPTIONS[0];
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider"
      style={{ color: opt.color, background: opt.color + '18', border: `1px solid ${opt.color}30` }}>
      {opt.label}
    </span>
  );
}

function StatusBadge({ status }) {
  const opt = STATUS_OPTIONS.find(o => o.value === (status || 'active')) || STATUS_OPTIONS[0];
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold tracking-wide"
      style={{ color: opt.color, background: opt.bg, border: `1px solid ${opt.color}35` }}>
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: opt.color, boxShadow: `0 0 4px ${opt.color}90` }} />
      {opt.label}
    </span>
  );
}

// ─── Modal theme tokens ────────────────────────────────────────────────────────
function modalTheme(isLight) {
  return isLight ? {
    // ── Light mode ────────────────────────────────────────────────────────
    backdrop: 'rgba(80,70,140,0.28)',
    cardBg: 'linear-gradient(160deg,#FAFBFF 0%,#F5F3FF 55%,#EDE9FF 100%)',
    cardBorder: 'rgba(124,108,242,0.28)', cardShadow: '0 0 0 1px rgba(124,108,242,0.14), 0 24px 60px rgba(124,108,242,0.18), 0 8px 24px rgba(0,0,0,0.08)',
    sectionBg: 'rgba(255,255,255,0.72)', sectionBorder: 'rgba(124,108,242,0.16)', sectionTitle: '#6B7280',
    labelColor: '#6B7280', headerTitle: '#0F172A', headerSub: '#6B7280',
    iconBg: 'rgba(124,108,242,0.12)', iconBorder: 'rgba(124,108,242,0.25)',
    closeBtnColor: '#9CA3AF', closeBtnHoverBg: 'rgba(15,23,42,0.07)', closeBtnHoverBorder: 'rgba(15,23,42,0.10)', closeBtnHoverColor: '#1E293B',
    inputBg: '#FFFFFF', inputBorder: 'rgba(124,108,242,0.25)', inputText: '#1E293B', inputBgFocus: 'rgba(124,108,242,0.04)', inputBorderBlur: 'rgba(124,108,242,0.22)',
    titleBg: '#FFFFFF', titleBorder: 'rgba(124,108,242,0.3)', titleBgFocus: 'rgba(124,108,242,0.04)', titleText: '#0F172A', titleBorderBlur: 'rgba(124,108,242,0.25)',
    selectBg: '#FFFFFF', selectBorder: 'rgba(124,108,242,0.25)', selectText: '#1E293B',
    iconColor: '#9CA3AF', colorScheme: 'light',
    btnInactiveBorder: 'rgba(124,108,242,0.22)', btnInactiveText: '#9CA3AF',
    btnHoverBg: 'rgba(124,108,242,0.07)', btnHoverText: '#374151', btnHoverBorder: 'rgba(124,108,242,0.35)',
    statusDotInactive: '#D1D5DB', tagHintColor: '#9CA3AF',
    footerBg: 'rgba(255,255,255,0.8)', footerBorder: 'rgba(124,108,242,0.16)',
    cancelBorder: 'rgba(15,23,42,0.14)', cancelText: '#4B5563',
    cancelHoverBg: 'rgba(124,108,242,0.07)', cancelHoverText: '#0F172A', cancelHoverBorder: 'rgba(124,108,242,0.35)',
    createMoreText: '#9CA3AF', createMoreActiveText: '#7c6cf2',
    toggleOffTrack: 'rgba(124,108,242,0.2)', toggleOffBorder: 'rgba(124,108,242,0.3)',
    swatchSelectedBorder: '#1E293B', customSwatchBg: 'rgba(15,23,42,0.07)', customSwatchBorder: 'rgba(15,23,42,0.18)', customSwatchPlus: 'rgba(15,23,42,0.4)',
  } : {
    // ── Dark mode ─────────────────────────────────────────────────────────
    backdrop: 'rgba(2,4,10,0.82)',
    cardBg: 'linear-gradient(160deg,#141720 0%,#0F1219 60%,#0C0E16 100%)',
    cardBorder: 'rgba(255,255,255,0.09)', cardShadow: '0 0 0 1px rgba(255,255,255,0.04), 0 40px 80px rgba(0,0,0,0.75), 0 0 80px rgba(124,108,242,0.07)',
    sectionBg: 'rgba(0,0,0,0.25)', sectionBorder: 'rgba(255,255,255,0.07)', sectionTitle: '#4B5568',
    labelColor: '#4B5568', headerTitle: '#E4E8F4', headerSub: '#4B5568',
    iconBg: 'rgba(124,108,242,0.16)', iconBorder: 'rgba(124,108,242,0.28)',
    closeBtnColor: '#4B5568', closeBtnHoverBg: 'rgba(255,255,255,0.08)', closeBtnHoverBorder: 'rgba(255,255,255,0.12)', closeBtnHoverColor: '#E4E8F4',
    inputBg: 'rgba(4,6,14,0.65)', inputBorder: 'rgba(255,255,255,0.09)', inputText: '#E4E8F4', inputBgFocus: 'rgba(124,108,242,0.12)', inputBorderBlur: 'rgba(255,255,255,0.08)',
    titleBg: 'rgba(4,6,14,0.7)', titleBorder: 'rgba(255,255,255,0.10)', titleBgFocus: 'rgba(124,108,242,0.12)', titleText: '#E4E8F4', titleBorderBlur: 'rgba(255,255,255,0.09)',
    selectBg: 'rgba(4,6,14,0.7)', selectBorder: 'rgba(255,255,255,0.09)', selectText: '#E4E8F4',
    iconColor: '#4B5568', colorScheme: 'dark',
    btnInactiveBorder: 'rgba(255,255,255,0.08)', btnInactiveText: '#6B7280',
    btnHoverBg: 'rgba(255,255,255,0.06)', btnHoverText: '#A0A8BC', btnHoverBorder: 'rgba(255,255,255,0.14)',
    statusDotInactive: '#3A404F', tagHintColor: '#3A404F',
    footerBg: 'rgba(0,0,0,0.28)', footerBorder: 'rgba(255,255,255,0.07)',
    cancelBorder: 'rgba(255,255,255,0.10)', cancelText: '#6B7280',
    cancelHoverBg: 'rgba(255,255,255,0.06)', cancelHoverText: '#C0C8DC', cancelHoverBorder: 'rgba(255,255,255,0.16)',
    createMoreText: '#4B5568', createMoreActiveText: '#C4B5FD',
    toggleOffTrack: 'rgba(42,47,58,0.9)', toggleOffBorder: 'rgba(255,255,255,0.07)',
    swatchSelectedBorder: 'white', customSwatchBg: 'rgba(255,255,255,0.08)', customSwatchBorder: 'rgba(255,255,255,0.16)', customSwatchPlus: 'rgba(255,255,255,0.55)',
  };
}

// ─── Create/Edit Modal ────────────────────────────────────────────────────────
function useThemeLight() {
  const [isLight, setIsLight] = useState(() => document.documentElement.classList.contains('theme-light'));
  useEffect(() => {
    const obs = new MutationObserver(() => setIsLight(document.documentElement.classList.contains('theme-light')));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  return isLight;
}

function ClientModal({ client, onClose, onSave }) {
  const isLight = useThemeLight();
  const T       = modalTheme(isLight);

  const [form, setForm] = useState({
    name:            client?.name             || '',
    email:           client?.email            || '',
    company:         client?.company          || '',
    color:           client?.color            || '#7c6cf2',
    hourlyRate:      client?.hourly_rate      || '',
    monthlyRetainer: client?.monthly_retainer || '',
    includedHours:   client?.included_hours   || '',
    keywords:        client?.keywords         || '',
    billingType:     client?.billing_type     || 'none',
    status:          client?.status           || 'active',
    currency:        client?.currency         || 'USD',
  });
  const [createMore, setCreateMore] = useState(false);
  const [saving,     setSaving]     = useState(false);
  const set     = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  const hasName = !!form.name.trim();

  const selectedStatus  = STATUS_OPTIONS.find(o => o.value === form.status) || STATUS_OPTIONS[0];
  const selectedBilling = BILLING_OPTIONS.find(o => o.value === form.billingType) || BILLING_OPTIONS[0];

  const save = async () => {
    if (!hasName) return;
    setSaving(true);
    await onSave({ ...form, hourlyRate: parseFloat(form.hourlyRate) || 0, monthlyRetainer: parseFloat(form.monthlyRetainer) || 0, includedHours: parseFloat(form.includedHours) || 0 });
    setSaving(false);
    if (createMore && !client) {
      setForm({ name: '', email: '', company: '', color: '#7c6cf2', hourlyRate: '', monthlyRetainer: '', includedHours: '', keywords: '', billingType: 'none', status: 'active', currency: 'USD' });
    } else {
      onClose();
    }
  };

  const inputFocus = e => { e.currentTarget.style.borderColor = 'rgba(124,108,242,0.58)'; e.currentTarget.style.background = T.inputBgFocus; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(124,108,242,0.09)'; };
  const inputBlur  = e => { e.currentTarget.style.borderColor = T.inputBorderBlur; e.currentTarget.style.background = T.inputBg; e.currentTarget.style.boxShadow = 'none'; };

  const showRetainer = form.billingType === 'retainer' || form.billingType === 'hybrid';
  const showHourly   = form.billingType === 'hourly'   || form.billingType === 'hybrid';

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: T.backdrop, backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', padding: '16px 16px 84px 16px' }}
      onClick={e => e.target === e.currentTarget && onClose()}>

      <div style={{ width: '100%', maxWidth: 560, maxHeight: '100%', background: T.cardBg, border: `1px solid ${T.cardBorder}`, borderRadius: 20, boxShadow: T.cardShadow, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* ── Accent stripe ── */}
        <div style={{ height: 2, flexShrink: 0, background: 'linear-gradient(90deg, transparent, #7c6cf290 30%, #7c6cf2 50%, #7c6cf290 70%, transparent)' }} />

        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px 12px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: T.iconBg, border: `1px solid ${T.iconBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Users size={14} style={{ color: '#7c6cf2' }} />
            </div>
            <div>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: T.headerTitle, margin: 0, letterSpacing: '-0.02em' }}>{client ? 'Edit Client' : 'New Client'}</h3>
              <p style={{ fontSize: 10.5, color: T.headerSub, margin: 0, marginTop: 1 }}>{client ? 'Update client information' : 'Add a client to your workspace'}</p>
            </div>
          </div>
          <button onClick={onClose}
            style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, background: 'transparent', border: '1px solid transparent', cursor: 'pointer', color: T.closeBtnColor, transition: 'all 0.12s ease' }}
            onMouseOver={e => { e.currentTarget.style.color = T.closeBtnHoverColor; e.currentTarget.style.background = T.closeBtnHoverBg; e.currentTarget.style.borderColor = T.closeBtnHoverBorder; }}
            onMouseOut={e  => { e.currentTarget.style.color = T.closeBtnColor; e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; }}>
            <X size={14} />
          </button>
        </div>

        {/* ── Scrollable Body ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 4px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 4 }}>

            {/* ── Client Name (primary focus) ── */}
            <div>
              <p style={{ fontSize: 9.5, fontWeight: 700, color: T.labelColor, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 4 }}>
                Client Name <span style={{ color: '#7c6cf2', fontSize: 10 }}>*</span>
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, background: form.color + '20', border: `1.5px solid ${form.color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color: form.color }}>{form.name ? form.name[0].toUpperCase() : <Users size={14} style={{ color: form.color }} />}</span>
                </div>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Acme Corporation" autoFocus maxLength={120}
                  style={{ flex: 1, background: T.titleBg, border: `1px solid ${T.titleBorder}`, borderRadius: 11, padding: '10px 14px', fontSize: 14, fontWeight: 600, color: T.titleText, outline: 'none', letterSpacing: '-0.02em', transition: 'border-color 0.15s, background 0.15s, box-shadow 0.15s' }}
                  onFocus={e => { e.currentTarget.style.borderColor = 'rgba(124,108,242,0.6)'; e.currentTarget.style.background = T.titleBgFocus; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(124,108,242,0.09)'; }}
                  onBlur={e  => { e.currentTarget.style.borderColor = T.titleBorderBlur; e.currentTarget.style.background = T.titleBg; e.currentTarget.style.boxShadow = 'none'; }}
                />
              </div>
            </div>

            {/* ── Contact ── */}
            <div style={{ background: T.sectionBg, border: `1px solid ${T.sectionBorder}`, borderRadius: 12 }}>
              <div style={{ padding: '9px 14px 0' }}><span style={{ fontSize: 9.5, fontWeight: 700, color: T.sectionTitle, textTransform: 'uppercase', letterSpacing: '0.09em' }}>Contact</span></div>
              <div style={{ padding: '8px 14px 12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <p style={{ fontSize: 9.5, fontWeight: 700, color: T.labelColor, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px' }}>Company</p>
                  <div style={{ position: 'relative' }}>
                    <Building2 size={11} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: T.iconColor, pointerEvents: 'none' }} />
                    <input value={form.company} onChange={set('company')} placeholder="Company name"
                      style={{ width: '100%', background: T.inputBg, border: `1px solid ${T.inputBorder}`, borderRadius: 9, padding: '8px 10px 8px 28px', fontSize: 12, color: T.inputText, outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s, box-shadow 0.15s' }}
                      onFocus={inputFocus} onBlur={inputBlur} />
                  </div>
                </div>
                <div>
                  <p style={{ fontSize: 9.5, fontWeight: 700, color: T.labelColor, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px' }}>Email</p>
                  <div style={{ position: 'relative' }}>
                    <Mail size={11} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: T.iconColor, pointerEvents: 'none' }} />
                    <input value={form.email} onChange={set('email')} placeholder="contact@client.com" type="email"
                      style={{ width: '100%', background: T.inputBg, border: `1px solid ${T.inputBorder}`, borderRadius: 9, padding: '8px 10px 8px 28px', fontSize: 12, color: T.inputText, outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s, box-shadow 0.15s' }}
                      onFocus={inputFocus} onBlur={inputBlur} />
                  </div>
                </div>
              </div>
            </div>

            {/* ── Billing Model ── */}
            <div style={{ background: T.sectionBg, border: `1px solid ${T.sectionBorder}`, borderRadius: 12 }}>
              <div style={{ padding: '9px 14px 0' }}><span style={{ fontSize: 9.5, fontWeight: 700, color: T.sectionTitle, textTransform: 'uppercase', letterSpacing: '0.09em' }}>Billing Model</span></div>
              <div style={{ padding: '8px 14px 12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {BILLING_OPTIONS.map(o => {
                  const active = form.billingType === o.value;
                  return (
                    <button key={o.value} onClick={() => setForm(f => ({ ...f, billingType: o.value }))}
                      style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 12px', borderRadius: 9, fontSize: 12, fontWeight: active ? 600 : 400, border: `1px solid ${active ? `${o.color}45` : T.btnInactiveBorder}`, background: active ? `${o.color}12` : 'transparent', color: active ? o.color : T.btnInactiveText, cursor: 'pointer', transition: 'all 0.12s ease', textAlign: 'left' }}
                      onMouseOver={e => { if (!active) { e.currentTarget.style.background = T.btnHoverBg; e.currentTarget.style.color = T.btnHoverText; e.currentTarget.style.borderColor = T.btnHoverBorder; }}}
                      onMouseOut={e  => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.btnInactiveText; e.currentTarget.style.borderColor = T.btnInactiveBorder; }}}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: active ? o.color : T.statusDotInactive, flexShrink: 0, boxShadow: active ? `0 0 6px ${o.color}` : 'none', transition: 'all 0.12s' }} />
                      {o.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ── Billing Rates (conditional) ── */}
            {(showRetainer || showHourly) && (
              <div style={{ background: T.sectionBg, border: `1px solid ${T.sectionBorder}`, borderRadius: 12 }}>
                <div style={{ padding: '9px 14px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 9.5, fontWeight: 700, color: T.sectionTitle, textTransform: 'uppercase', letterSpacing: '0.09em' }}>Billing Rates</span>
                  <select value={form.currency} onChange={set('currency')}
                    style={{ background: T.inputBg, border: `1px solid ${T.inputBorder}`, borderRadius: 7, padding: '3px 6px', fontSize: 10.5, fontWeight: 600, color: T.inputText, outline: 'none', colorScheme: T.colorScheme }}>
                    {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code} ({c.symbol})</option>)}
                  </select>
                </div>
                <div style={{ padding: '8px 14px 12px', display: 'grid', gridTemplateColumns: showRetainer && showHourly ? '1fr 1fr 1fr' : showRetainer ? '1fr 1fr' : '1fr', gap: 10 }}>
                  {showRetainer && (
                    <div>
                      <p style={{ fontSize: 9.5, fontWeight: 700, color: T.labelColor, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px' }}>Monthly Retainer</p>
                      <div style={{ position: 'relative' }}>
                        <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: T.iconColor, pointerEvents: 'none' }}>{currencySymbol(form.currency)}</span>
                        <input type="number" min="0" value={form.monthlyRetainer} onChange={set('monthlyRetainer')} placeholder="0.00"
                          style={{ width: '100%', background: T.inputBg, border: `1px solid ${T.inputBorder}`, borderRadius: 9, padding: '8px 10px 8px 22px', fontSize: 12, color: T.inputText, outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s, box-shadow 0.15s', colorScheme: T.colorScheme }}
                          onFocus={inputFocus} onBlur={inputBlur} />
                      </div>
                    </div>
                  )}
                  {showRetainer && (
                    <div>
                      <p style={{ fontSize: 9.5, fontWeight: 700, color: T.labelColor, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px' }}>Included Hrs/mo</p>
                      <div style={{ position: 'relative' }}>
                        <input type="number" min="0" value={form.includedHours} onChange={set('includedHours')} placeholder="e.g. 40"
                          style={{ width: '100%', background: T.inputBg, border: `1px solid ${T.inputBorder}`, borderRadius: 9, padding: '8px 32px 8px 10px', fontSize: 12, color: T.inputText, outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s, box-shadow 0.15s', colorScheme: T.colorScheme }}
                          onFocus={inputFocus} onBlur={inputBlur} />
                        <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 9.5, color: T.iconColor, pointerEvents: 'none' }}>hrs</span>
                      </div>
                    </div>
                  )}
                  {showHourly && (
                    <div>
                      <p style={{ fontSize: 9.5, fontWeight: 700, color: T.labelColor, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px' }}>
                        {form.billingType === 'hybrid' ? 'Overage Rate' : 'Hourly Rate'}
                      </p>
                      <div style={{ position: 'relative' }}>
                        <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: T.iconColor, pointerEvents: 'none' }}>{currencySymbol(form.currency)}</span>
                        <input type="number" min="0" value={form.hourlyRate} onChange={set('hourlyRate')} placeholder="0.00"
                          style={{ width: '100%', background: T.inputBg, border: `1px solid ${T.inputBorder}`, borderRadius: 9, padding: '8px 32px 8px 22px', fontSize: 12, color: T.inputText, outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s, box-shadow 0.15s', colorScheme: T.colorScheme }}
                          onFocus={inputFocus} onBlur={inputBlur} />
                        <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 9.5, color: T.iconColor, pointerEvents: 'none' }}>/hr</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Keywords ── */}
            <div style={{ background: T.sectionBg, border: `1px solid ${T.sectionBorder}`, borderRadius: 12 }}>
              <div style={{ padding: '9px 14px 0' }}><span style={{ fontSize: 9.5, fontWeight: 700, color: T.sectionTitle, textTransform: 'uppercase', letterSpacing: '0.09em' }}>Keywords</span></div>
              <div style={{ padding: '8px 14px 12px' }}>
                <div style={{ position: 'relative' }}>
                  <Tag size={11} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: T.iconColor, pointerEvents: 'none' }} />
                  <input value={form.keywords} onChange={set('keywords')} placeholder="acme, client-portal, acmecorp…"
                    style={{ width: '100%', background: T.inputBg, border: `1px solid ${T.inputBorder}`, borderRadius: 9, padding: '8px 10px 8px 28px', fontSize: 12, color: T.inputText, outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s, box-shadow 0.15s' }}
                    onFocus={inputFocus} onBlur={inputBlur} />
                </div>
                <p style={{ fontSize: 10, color: T.tagHintColor, margin: '5px 0 0' }}>Window titles & URLs matching these are auto-attributed to this client.</p>
              </div>
            </div>

            {/* ── Settings: Color + Status ── */}
            <div style={{ background: T.sectionBg, border: `1px solid ${T.sectionBorder}`, borderRadius: 12 }}>
              <div style={{ padding: '9px 14px 0' }}><span style={{ fontSize: 9.5, fontWeight: 700, color: T.sectionTitle, textTransform: 'uppercase', letterSpacing: '0.09em' }}>Settings</span></div>
              <div style={{ padding: '8px 14px 12px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* Color */}
                <div>
                  <p style={{ fontSize: 9.5, fontWeight: 700, color: T.labelColor, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px' }}>Color</p>
                  <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
                    {COLORS.map(c => (
                      <button key={c} onClick={() => setForm(f => ({ ...f, color: c }))}
                        style={{ width: 26, height: 26, borderRadius: 8, background: c, border: `2px solid ${form.color === c ? T.swatchSelectedBorder : 'transparent'}`, cursor: 'pointer', transition: 'all 0.12s ease', flexShrink: 0 }}
                        onMouseOver={e => { if (form.color !== c) e.currentTarget.style.transform = 'scale(1.15)'; }}
                        onMouseOut={e  => { e.currentTarget.style.transform = 'scale(1)'; }} />
                    ))}
                  </div>
                </div>
                {/* Status */}
                <div>
                  <p style={{ fontSize: 9.5, fontWeight: 700, color: T.labelColor, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px' }}>Status</p>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {STATUS_OPTIONS.map(opt => {
                      const active = form.status === opt.value;
                      return (
                        <button key={opt.value} onClick={() => setForm(f => ({ ...f, status: opt.value }))}
                          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: active ? 600 : 400, border: `1px solid ${active ? `${opt.color}45` : T.btnInactiveBorder}`, background: active ? opt.bg : 'transparent', color: active ? opt.color : T.btnInactiveText, cursor: 'pointer', transition: 'all 0.12s ease' }}
                          onMouseOver={e => { if (!active) { e.currentTarget.style.background = T.btnHoverBg; e.currentTarget.style.color = T.btnHoverText; e.currentTarget.style.borderColor = T.btnHoverBorder; }}}
                          onMouseOut={e  => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.btnInactiveText; e.currentTarget.style.borderColor = T.btnInactiveBorder; }}}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: active ? opt.color : T.statusDotInactive, flexShrink: 0, boxShadow: active ? `0 0 5px ${opt.color}` : 'none', transition: 'all 0.12s' }} />
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* ── Footer ── */}
        <div style={{ padding: '12px 20px 18px', borderTop: `1px solid ${T.footerBorder}`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, background: T.footerBg }}>
          {/* Live summary */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0, overflow: 'hidden' }}>
            <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 5, background: `${selectedStatus.color}16`, border: `1px solid ${selectedStatus.color}30`, color: selectedStatus.color, fontWeight: 600, whiteSpace: 'nowrap' }}>
              <span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: selectedStatus.color, marginRight: 5, verticalAlign: 'middle' }} />{selectedStatus.label}
            </span>
            {form.billingType !== 'none' && (
              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 5, background: `${selectedBilling.color}14`, border: `1px solid ${selectedBilling.color}28`, color: selectedBilling.color, fontWeight: 600, whiteSpace: 'nowrap' }}>
                {selectedBilling.label}
              </span>
            )}
            {!client && (
              <button onClick={() => setCreateMore(v => !v)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, color: createMore ? T.createMoreActiveText : T.createMoreText, background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 0', flexShrink: 0, transition: 'color 0.15s' }}>
                <div style={{ width: 26, height: 14, borderRadius: 99, background: createMore ? 'rgba(124,108,242,0.55)' : T.toggleOffTrack, transition: 'background 0.15s', position: 'relative', flexShrink: 0, border: `1px solid ${createMore ? 'rgba(124,108,242,0.65)' : T.toggleOffBorder}` }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#fff', position: 'absolute', top: 1, left: createMore ? 13 : 1, transition: 'left 0.15s', boxShadow: '0 1px 3px rgba(0,0,0,0.25)' }} />
                </div>
                Create more
              </button>
            )}
          </div>
          {/* Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
            <button onClick={onClose}
              style={{ padding: '8px 15px', background: 'transparent', border: `1px solid ${T.cancelBorder}`, borderRadius: 9, color: T.cancelText, fontSize: 12, cursor: 'pointer', transition: 'all 0.12s ease', fontWeight: 500 }}
              onMouseOver={e => { e.currentTarget.style.color = T.cancelHoverText; e.currentTarget.style.borderColor = T.cancelHoverBorder; e.currentTarget.style.background = T.cancelHoverBg; }}
              onMouseOut={e  => { e.currentTarget.style.color = T.cancelText; e.currentTarget.style.borderColor = T.cancelBorder; e.currentTarget.style.background = 'transparent'; }}>
              Cancel
            </button>
            <button onClick={save} disabled={saving || !hasName}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', background: hasName ? '#7c6cf2' : (isLight ? 'rgba(124,108,242,0.15)' : 'rgba(124,108,242,0.22)'), border: `1px solid ${hasName ? '#9D8FF5' : 'rgba(124,108,242,0.2)'}`, borderRadius: 9, color: hasName ? '#fff' : (isLight ? 'rgba(124,108,242,0.45)' : 'rgba(255,255,255,0.3)'), fontSize: 12.5, fontWeight: 600, cursor: hasName ? 'pointer' : 'default', transition: 'all 0.12s ease', boxShadow: hasName ? '0 2px 12px rgba(124,108,242,0.32)' : 'none', letterSpacing: '-0.01em' }}
              onMouseOver={e => { if (hasName && !saving) { e.currentTarget.style.background = '#9D8FF5'; e.currentTarget.style.boxShadow = '0 4px 18px rgba(124,108,242,0.45)'; }}}
              onMouseOut={e  => { if (hasName) { e.currentTarget.style.background = '#7c6cf2'; e.currentTarget.style.boxShadow = '0 2px 12px rgba(124,108,242,0.32)'; }}}>
              <Check size={13} strokeWidth={2.5} />
              {saving ? 'Saving…' : client ? 'Save Changes' : 'Create Client'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Row Actions Dropdown ─────────────────────────────────────────────────────
function RowMenu({ client, onEdit, onDelete }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={e => { e.stopPropagation(); setOpen(v => !v); }}
        className="w-6 h-6 flex items-center justify-center rounded-md text-tx-faint hover:text-white hover:bg-brd-default transition-all opacity-0 group-hover:opacity-100">
        <MoreHorizontal size={13} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="fl-row-menu absolute right-0 top-7 z-50 w-36 bg-bg-card border border-brd-strong rounded-xl shadow-xl overflow-hidden">
            <button onClick={e => { e.stopPropagation(); setOpen(false); onEdit(); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-tx-secondary hover:text-white hover:bg-bg-hover transition-all">
              <Edit2 size={11} />Edit
            </button>
            <button onClick={e => { e.stopPropagation(); setOpen(false); onDelete(); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-all">
              <Trash2 size={11} />Archive
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────
function EmptyState({ onCreate, onImport }) {
  return (
    <div className="flex flex-col items-center justify-center flex-1 py-24">
      <div className="w-16 h-16 rounded-2xl bg-bg-card border border-brd-default flex items-center justify-center mb-4">
        <Users size={26} className="text-tx-faint" />
      </div>
      <h3 className="text-sm font-semibold text-white mb-1">No clients yet</h3>
      <p className="text-xs text-tx-faint text-center max-w-xs mb-6">
        Add your first client to start tracking time, revenue, and profitability by relationship.
      </p>
      <div className="flex items-center gap-3">
        <button onClick={onCreate}
          className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-all">
          <Plus size={14} />Create Client
        </button>
        <button onClick={onImport}
          className="flex items-center gap-2 bg-bg-card hover:bg-bg-hover border border-brd-default text-tx-secondary hover:text-white text-sm px-4 py-2.5 rounded-xl transition-all">
          <Upload size={14} />Import
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ClientsPage({ user }) {
  const [clients,    setClients]    = useState([]);
  const [projects,   setProjects]   = useState([]);
  const [statsMap,   setStatsMap]   = useState({});
  const [showModal,    setShowModal]    = useState(false);
  const [editClient,   setEditClient]   = useState(null);
  const [detailClient, setDetailClient] = useState(null);
  const [showImport,   setShowImport]   = useState(false);
  const [search,     setSearch]     = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [billingFilter, setBillingFilter] = useState('all');
  const [sortBy,     setSortBy]     = useState('name');
  const [sortDir,    setSortDir]    = useState('asc');
  const [loading,    setLoading]    = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [list, projList] = await Promise.all([
      api.listClients?.({ userId: user.id }),
      api.listProjects?.({ userId: user.id }),
    ]);
    setClients(list || []);
    setProjects(projList || []);

    // Load stats for all clients
    if (list?.length) {
      const now = Math.floor(Date.now() / 1000), from = now - 30 * 86400;
      const results = await Promise.all(
        list.map(c => api.clientStats?.({ userId: user.id, clientId: c.id, from, to: now })
          .then(s => ({ id: c.id, s })))
      );
      const sm = {};
      results.forEach(({ id, s }) => { sm[id] = s; });
      setStatsMap(sm);
    }
    setLoading(false);
  }, [user.id]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (formData) => {
    if (editClient) {
      await api.updateClient?.({ clientId: editClient.id, ...formData });
    } else {
      await api.createClient?.({ userId: user.id, ...formData });
    }
    setEditClient(null);
    await load();
  };

  const remove = async (id, e) => {
    e?.stopPropagation();
    if (!window.confirm('Archive this client?')) return;
    await api.deleteClient?.({ clientId: id });
    load();
  };

  const openEdit = (client) => { setEditClient(client); setShowModal(true); };

  const importClients = async (rows) => {
    let imported = 0;
    for (const row of rows) {
      const name = row.name || row.client || row['client name'];
      if (!name) continue;
      await api.createClient?.({
        userId: user.id,
        name,
        email: row.email || '',
        company: row.company || '',
        color: row.color || '#6366f1',
        hourlyRate: parseFloat(row.hourly_rate || row['hourly rate'] || row.rate) || 0,
        monthlyRetainer: parseFloat(row.monthly_retainer || row['monthly retainer']) || 0,
        includedHours: parseFloat(row.included_hours || row['included hours']) || 0,
        keywords: row.keywords || row.tags || '',
        billingType: row.billing_type || row['billing type'] || 'none',
        status: row.status || 'active',
      });
      imported += 1;
    }
    await load();
    return imported;
  };

  // ── Derived data ────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = [...clients];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        c.name.toLowerCase().includes(q) ||
        (c.company || '').toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q)
      );
    }
    if (statusFilter !== 'all') list = list.filter(c => (c.status || 'active') === statusFilter);
    if (billingFilter !== 'all') list = list.filter(c => (c.billing_type || 'none') === billingFilter);

    list.sort((a, b) => {
      let va, vb;
      if (sortBy === 'name')    { va = a.name; vb = b.name; }
      else if (sortBy === 'revenue') {
        va = statsMap[a.id]?.revenue || 0;
        vb = statsMap[b.id]?.revenue || 0;
      } else if (sortBy === 'time') {
        va = statsMap[a.id]?.totalSeconds || 0;
        vb = statsMap[b.id]?.totalSeconds || 0;
      } else if (sortBy === 'activity') {
        va = statsMap[a.id]?.sessions?.[0]?.started_at || 0;
        vb = statsMap[b.id]?.sessions?.[0]?.started_at || 0;
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [clients, search, statusFilter, billingFilter, sortBy, sortDir, statsMap]);

  const toggleSort = (col) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('asc'); }
  };

  const exportCSV = () => {
    const rows = [
      ['Client', 'Company', 'Email', 'Status', 'Billing Type', 'Hourly Rate ($)', 'Monthly Retainer ($)', 'Included Hours', 'Hours Logged (30d)', 'Revenue (30d)', 'Projects'],
    ];
    filtered.forEach(client => {
      const stats     = statsMap[client.id];
      const hoursLog  = ((stats?.totalSeconds || 0) / 3600).toFixed(2);
      const revenue   = (stats?.revenue || 0).toFixed(2);
      const projCount = projects.filter(p => p.client_id === client.id).length;
      rows.push([
        client.name,
        client.company || '',
        client.email   || '',
        client.status  || 'active',
        client.billing_type || 'none',
        client.hourly_rate      || 0,
        client.monthly_retainer || 0,
        client.included_hours   || 0,
        hoursLog,
        revenue,
        projCount,
      ]);
    });
    downloadCSV(`clients-visualized-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  };

  const TH = "px-4 py-3.5 border-b-2 border-brd-strong/60";
  const TD = "px-4 py-3.5";

  const SortHeader = ({ col, children }) => (
    <button onClick={() => toggleSort(col)}
      className="flex items-center gap-1 text-tx-muted hover:text-tx-primary transition-colors uppercase tracking-wider text-[10px] font-semibold">
      {children}
      <ArrowUpDown size={9} className={sortBy === col ? 'text-accent' : 'opacity-50'} />
    </button>
  );

  // Summary totals
  const totalRevenue = Object.values(statsMap).reduce((a, s) => a + (s?.revenue || 0), 0);
  const totalHours   = Object.values(statsMap).reduce((a, s) => a + (s?.totalSeconds || 0), 0) / 3600;

  return (
    <div className="fl-page fl-clients-page fl-report-page">
      <div className="fl-work-surface flex flex-col">

      {/* ── Top bar ── */}
      <div className="fl-page-toolbar">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/15 text-accent">
            <Users size={15} />
          </div>
          <div>
            <h1 className="text-sm font-bold text-white">Clients</h1>
            <p className="text-[11px] text-tx-faint">{clients.length} relationships tracked</p>
          </div>
        </div>

        {/* Search */}
        <div className="relative flex-1 max-w-xs ml-4">
          <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-tx-faint" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search clients…"
            className="fl-search" />
          {search && <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-tx-faint hover:text-white"><X size={10} /></button>}
        </div>

        {/* Status filter */}
        <div className="relative">
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="rounded-lg border border-brd-default bg-bg-input pl-3 pr-7 py-2 text-xs text-tx-secondary focus:outline-none focus:border-accent appearance-none cursor-pointer transition-colors">
            <option value="all">All Status</option>
            {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <ChevronDown size={10} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-tx-faint pointer-events-none" />
        </div>

        {/* Billing filter */}
        <div className="relative">
          <select value={billingFilter} onChange={e => setBillingFilter(e.target.value)}
            className="rounded-lg border border-brd-default bg-bg-input pl-3 pr-7 py-2 text-xs text-tx-secondary focus:outline-none focus:border-accent appearance-none cursor-pointer transition-colors">
            <option value="all">All Billing</option>
            {BILLING_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <ChevronDown size={10} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-tx-faint pointer-events-none" />
        </div>

        <div className="flex-1" />

        {/* Summary pills */}
        {clients.length > 0 && (
          <div className="hidden lg:flex items-center gap-4 border-r border-brd-default pr-4 mr-1">
            <div className="text-right">
              <p className="text-[9px] text-tx-faint uppercase tracking-wider">Revenue (30d)</p>
              <p className="text-xs font-bold text-green-400">${Math.round(totalRevenue).toLocaleString()}</p>
            </div>
            <div className="text-right">
              <p className="text-[9px] text-tx-faint uppercase tracking-wider">Hours (30d)</p>
              <p className="text-xs font-bold text-white">{totalHours.toFixed(1)}h</p>
            </div>
          </div>
        )}

        {/* CTAs */}
        {clients.length > 0 && (
          <button onClick={exportCSV}
            className="flex items-center gap-1.5 bg-bg-input hover:bg-bg-hover border border-brd-default text-tx-secondary hover:text-white text-xs px-3 py-2 rounded-lg transition-all"
            title="Export billing report as CSV">
            <Download size={11} />Export CSV
          </button>
        )}
        <button onClick={() => setShowImport(true)}
          className="flex items-center gap-1.5 bg-bg-input hover:bg-bg-hover border border-brd-default text-tx-secondary hover:text-white text-xs px-3 py-2 rounded-lg transition-all">
          <Upload size={11} />Import
        </button>
        <button onClick={() => { setEditClient(null); setShowModal(true); }}
          className="flex items-center gap-1.5 bg-accent hover:bg-accent-light text-white text-xs font-semibold px-3.5 py-2 rounded-lg transition-all">
          <Plus size={12} />Create Client
        </button>
      </div>

      {/* ── Table ── */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-tx-faint text-sm">Loading…</div>
        ) : filtered.length === 0 && !search ? (
          <EmptyState
            onCreate={() => { setEditClient(null); setShowModal(true); }}
            onImport={() => setShowImport(true)}
          />
        ) : (
          <table className="w-full border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="fl-table-head">
                <th className={`${TH} text-left w-52`}><SortHeader col="name">Client</SortHeader></th>
                <th className={`${TH} text-left w-24`}>
                  <span className="text-tx-muted uppercase tracking-wider text-[10px] font-semibold">Projects</span>
                </th>
                <th className={`${TH} text-left w-32`}><SortHeader col="activity">Last Activity</SortHeader></th>
                <th className={`${TH} text-left w-24`}>
                  <span className="text-tx-muted uppercase tracking-wider text-[10px] font-semibold">Status</span>
                </th>
                <th className={`${TH} text-left w-28`}>
                  <span className="text-tx-muted uppercase tracking-wider text-[10px] font-semibold">Billing</span>
                </th>
                <th className={`${TH} text-right w-28`}><SortHeader col="revenue">Revenue</SortHeader></th>
                <th className={`${TH} text-right w-24`}>
                  <span className="text-tx-muted uppercase tracking-wider text-[10px] font-semibold">Cost</span>
                </th>
                <th className={`${TH} text-right w-24`}>
                  <span className="text-tx-muted uppercase tracking-wider text-[10px] font-semibold">Margin</span>
                </th>
                <th className={`${TH} text-right w-28`}><SortHeader col="time">Time Spent</SortHeader></th>
                <th className={`${TH} text-center w-20`}>
                  <span className="text-tx-muted uppercase tracking-wider text-[10px] font-semibold">Reports</span>
                </th>
                <th className={`${TH} w-10`} />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={11} className="text-center py-16 text-tx-faint text-sm">
                    No clients match your filters.
                    <button onClick={() => { setSearch(''); setStatusFilter('all'); setBillingFilter('all'); }}
                      className="ml-2 text-violet-400 hover:text-violet-300">Clear filters</button>
                  </td>
                </tr>
              ) : filtered.map((client, i) => {
                const stats     = statsMap[client.id];
                const revenue   = stats?.revenue || 0;
                const cost      = 0; // Future: expenses
                const margin    = revenue > 0 ? ((revenue - cost) / revenue * 100).toFixed(0) : null;
                const timeSecs  = stats?.totalSeconds || 0;
                const lastSess  = stats?.sessions?.[0]?.started_at;
                const projCount = projects.filter(p => p.client_id === client.id).length;

                return (
                  <tr key={client.id}
                    onClick={() => setDetailClient(client)}
                    className="group fl-table-row fl-entity-row cursor-pointer">

                    {/* Client */}
                    <td className={TD}>
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-xs font-bold"
                             style={{ background: client.color + '20', border: `1.5px solid ${client.color}30`, color: client.color }}>
                          {client.name[0].toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-[13px] font-semibold text-white truncate leading-tight tracking-tight">{client.name}</p>
                          {client.company && <p className="text-[10px] text-tx-faint truncate mt-0.5">{client.company}</p>}
                        </div>
                      </div>
                    </td>

                    {/* Projects */}
                    <td className={TD}>
                      <span className="text-xs text-tx-secondary tabular-nums">{projCount} project{projCount !== 1 ? 's' : ''}</span>
                    </td>

                    {/* Last Activity */}
                    <td className={TD}>
                      <span className="text-xs text-tx-secondary">{fmtDate(lastSess)}</span>
                    </td>

                    {/* Status */}
                    <td className={TD}>
                      <StatusBadge status={client.status || 'active'} />
                    </td>

                    {/* Billing */}
                    <td className={TD}>
                      <div className="flex flex-col gap-0.5">
                        <BillingBadge type={client.billing_type || 'none'} />
                        {(client.billing_type === 'retainer' || client.billing_type === 'hybrid') && client.monthly_retainer > 0 && (
                          <p className="text-[9px] text-tx-faint mt-0.5">{currencySymbol(client.currency)}{client.monthly_retainer.toLocaleString()}/mo
                            {client.included_hours > 0 && ` · ${client.included_hours}h incl.`}
                          </p>
                        )}
                        {(client.billing_type === 'hourly' || client.billing_type === 'hybrid') && client.hourly_rate > 0 && (
                          <p className="text-[9px] text-tx-faint">{currencySymbol(client.currency)}{client.hourly_rate}/hr</p>
                        )}
                      </div>
                    </td>

                    {/* Revenue */}
                    <td className={`${TD} text-right`}>
                      <span className={`text-[12px] font-semibold tabular-nums ${revenue > 0 ? 'text-emerald-400' : 'text-tx-faint'}`}>
                        {revenue > 0 ? fmtMoneyCompact(revenue, client.currency) : '—'}
                      </span>
                    </td>

                    {/* Cost */}
                    <td className={`${TD} text-right`}>
                      <span className="text-xs text-tx-faint">—</span>
                    </td>

                    {/* Margin */}
                    <td className={`${TD} text-right`}>
                      {margin !== null ? (
                        <span className={`text-xs font-semibold tabular-nums ${Number(margin) >= 70 ? 'text-emerald-400' : Number(margin) >= 40 ? 'text-amber-400' : 'text-red-400'}`}>
                          {margin}%
                        </span>
                      ) : <span className="text-xs text-tx-faint">—</span>}
                    </td>

                    {/* Time Spent */}
                    <td className={`${TD} text-right`}>
                      <span className="text-[12px] font-semibold tabular-nums text-tx-secondary">{timeSecs > 0 ? fmt(timeSecs) : '—'}</span>
                    </td>

                    {/* Reports */}
                    <td className={`${TD} text-center`}>
                      <button className="inline-flex items-center justify-center w-6 h-6 rounded-md text-tx-faint hover:text-accent hover:bg-accent/10 transition-all opacity-0 group-hover:opacity-100"
                        title="View reports">
                        <ExternalLink size={11} />
                      </button>
                    </td>

                    {/* Actions */}
                    <td className="px-3 py-3.5" onClick={e => e.stopPropagation()}>
                      <RowMenu
                        client={client}
                        onEdit={() => openEdit(client)}
                        onDelete={() => remove(client.id)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Create/Edit Modal ── */}
      {showModal && (
        <ClientModal
          client={editClient}
          onClose={() => { setShowModal(false); setEditClient(null); }}
          onSave={handleSave}
        />
      )}

      {/* ── Detail Analytics Modal ── */}
      {detailClient && (
        <DetailAnalyticsModal
          type="client"
          item={detailClient}
          user={user}
          onClose={() => setDetailClient(null)}
        />
      )}
      {showImport && (
        <CsvImportModal
          title="Import Clients"
          description="Upload a CSV with one client per row. Billing fields are optional."
          columns={[
            { key: 'name', required: true, hint: 'Client or relationship name' },
            { key: 'company', hint: 'Company name' },
            { key: 'email', hint: 'Contact email' },
            { key: 'billing_type', hint: 'none, hourly, retainer, or hybrid' },
            { key: 'hourly_rate', hint: 'Hourly or overage rate' },
            { key: 'monthly_retainer', hint: 'Monthly retainer amount' },
            { key: 'included_hours', hint: 'Hours included each month' },
            { key: 'keywords', hint: 'Comma-separated tracking keywords' },
            { key: 'status', hint: 'active, inactive, or paused' },
            { key: 'color', hint: 'Hex color, for example #6366f1' },
          ]}
          sampleRows={[
            ['Acme Corporation', 'Acme Inc.', 'ops@acme.com', 'hybrid', '90', '2500', '30', 'acme, portal', 'active', '#6366f1'],
          ]}
          onClose={() => setShowImport(false)}
          onImport={importClients}
        />
      )}
      </div>
    </div>
  );
}
