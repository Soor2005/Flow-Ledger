import React, { useState, useRef, useEffect } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  KeyRound,
  Loader2,
  LogOut,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import logoSrc from '../../assets/logo.png';

const ERROR_MESSAGES = {
  invalid_key:                    { icon: ShieldAlert, title: 'Invalid Key',                body: 'This activation key does not exist. Check for typos and try again.' },
  already_used:                   { icon: ShieldAlert, title: 'Already Redeemed',           body: 'This key has already been used by another account.' },
  expired_key:                    { icon: Clock,       title: 'Key Expired',                body: 'This activation key has expired. Please contact support for a new key.' },
  disabled_key:                   { icon: ShieldAlert, title: 'Key Disabled',               body: 'This activation key has been disabled. Please contact support.' },
  activation_failed:              { icon: AlertCircle, title: 'Activation Failed',          body: 'Something went wrong. Please try again or contact support.' },
  service_down:                   { icon: AlertCircle, title: 'Activation Request Failed',  body: 'Network request failed' },
  missing_supabase_service_role:  { icon: AlertCircle, title: 'Configuration Error',        body: 'Missing SUPABASE_SERVICE_ROLE' },
  missing_supabase_url:           { icon: AlertCircle, title: 'Configuration Error',        body: 'Missing SUPABASE_URL' },
  invalid_api_key:                { icon: AlertCircle, title: 'Invalid API Key',            body: 'Invalid API Key' },
  failed_to_connect_supabase:     { icon: AlertCircle, title: 'Connection Failed',          body: 'Failed to connect to Supabase' },
  activation_key_not_found:       { icon: ShieldAlert, title: 'Key Not Found',              body: 'Activation key not found' },
  activation_key_already_used:    { icon: ShieldAlert, title: 'Already Redeemed',           body: 'Activation key already used' },
  rls_access_denied:              { icon: AlertCircle, title: 'Access Denied',              body: 'RLS policy denied access' },
  profile_update_failed:          { icon: AlertCircle, title: 'Profile Update Failed',      body: 'Profile update failed' },
  network_request_failed:         { icon: AlertCircle, title: 'Network Request Failed',     body: 'Network request failed' },
};

function formatKey(raw) {
  const clean = raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 16);
  return clean.match(/.{1,4}/g)?.join('-') ?? clean;
}

export default function ActivationPage({ supabaseUser, onActivated, onLogout }) {
  const [key,      setKey]      = useState('');
  const [loading,  setLoading]  = useState(false);
  const [success,  setSuccess]  = useState(false);
  const [errorKey, setErrorKey] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [debugInfo, setDebugInfo] = useState({
    supabaseConnectionStatus: 'not_checked',
    currentUserId: supabaseUser?.id || 'Unavailable',
    activationKeyLookupStatus: 'not_started',
    exactActivationError: '',
    logFile: '',
  });
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    setDebugInfo((current) => ({
      ...current,
      currentUserId: supabaseUser?.id || 'Unavailable',
    }));
  }, [supabaseUser?.id]);

  const handleKeyChange = (e) => {
    const formatted = formatKey(e.target.value);
    setKey(formatted);
    setErrorKey('');
    setErrorMessage('');
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text');
    setKey(formatKey(pasted));
    setErrorKey('');
    setErrorMessage('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const rawKey = key.replace(/-/g, '').toUpperCase();
    if (rawKey.length < 4) {
      setErrorKey('activation_key_not_found');
      setErrorMessage('Activation key not found');
      setDebugInfo((current) => ({
        ...current,
        activationKeyLookupStatus: 'invalid_input',
        exactActivationError: 'Activation key not found',
      }));
      return;
    }

    setLoading(true);
    setErrorKey('');
    setErrorMessage('');
    setDebugInfo((current) => ({
      ...current,
      currentUserId: supabaseUser?.id || 'Unavailable',
      supabaseConnectionStatus: 'checking',
      activationKeyLookupStatus: 'starting',
      exactActivationError: '',
    }));
    try {
      const res = await window.electron?.validateActivationKey?.({
        key:    rawKey,
        userId: supabaseUser?.id,
      });

      if (res?.success) {
        setDebugInfo((current) => ({
          ...current,
          ...res?.debug,
          currentUserId: supabaseUser?.id || current.currentUserId,
          exactActivationError: '',
        }));
        setSuccess(true);
        setTimeout(() => onActivated?.(), 1800);
      } else {
        setErrorKey(res?.error || 'activation_failed');
        setErrorMessage(res?.message || '');
        setDebugInfo((current) => ({
          ...current,
          ...res?.debug,
          currentUserId: supabaseUser?.id || current.currentUserId,
          exactActivationError: res?.message || res?.debug?.exactActivationError || 'Activation failed',
        }));
      }
    } catch (err) {
      const message = err?.message || 'Network request failed';
      setErrorKey('network_request_failed');
      setErrorMessage(message);
      setDebugInfo((current) => ({
        ...current,
        supabaseConnectionStatus: 'renderer_request_failed',
        activationKeyLookupStatus: 'request_failed',
        exactActivationError: message,
      }));
    } finally {
      setLoading(false);
    }
  };

  const errorInfo = errorKey ? (ERROR_MESSAGES[errorKey] ?? ERROR_MESSAGES.activation_failed) : null;
  const ErrorIcon = errorInfo?.icon;
  const resolvedErrorBody = errorMessage || errorInfo?.body;

  return (
    <div className="fl-auth-page flex h-full flex-col overflow-hidden">
      {/* Drag region */}
      <div className="drag-region shrink-0 flex h-9 items-center px-3 gap-[6px]" style={{ background: 'transparent' }}>
        <div className="no-drag flex items-center gap-[6px]">
          <button onClick={() => window.electron?.close?.()}    className="h-3 w-3 rounded-full" style={{ background: '#ff5f57' }} title="Close" />
          <button onClick={() => window.electron?.minimize?.()}  className="h-3 w-3 rounded-full" style={{ background: '#febc2e' }} title="Minimize" />
          <button onClick={() => window.electron?.maximize?.()}  className="h-3 w-3 rounded-full" style={{ background: '#28c840' }} title="Maximize" />
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center overflow-hidden px-5 py-8">
        <div className="w-full max-w-[480px]">
          {/* Logo */}
          <div className="mb-8 flex items-center justify-center gap-3">
            <img src={logoSrc} alt="Flow Ledger" className="h-10 w-10 shrink-0 rounded-xl object-contain shadow-[0_0_24px_rgba(124,108,242,0.35)]" />
            <span className="text-lg font-extrabold text-white">Flow Ledger</span>
          </div>

          {/* Account status badge */}
          <div className="mb-5 flex justify-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-amber-400">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
              Pending Activation
            </div>
          </div>

          <div className="rounded-[18px] border border-white/[0.10] bg-white/[0.035] px-8 py-10 shadow-[0_28px_90px_rgba(0,0,0,0.38),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-xl">
            {success ? (
              /* ── Success state ── */
              <div className="flex flex-col items-center py-4 text-center">
                <div className="relative mb-6">
                  <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-status-green/40 bg-status-green/15 shadow-[0_0_40px_rgba(52,211,153,0.35)]">
                    <CheckCircle2 size={40} className="text-status-green" />
                  </div>
                  <div className="absolute -right-1 -top-1 flex h-7 w-7 items-center justify-center rounded-full border border-accent/40 bg-accent/20">
                    <Sparkles size={14} className="text-accent-light" />
                  </div>
                </div>
                <h2 className="mb-2 text-2xl font-extrabold text-white">Account Activated!</h2>
                <p className="text-sm text-tx-secondary">Your account is now active. Loading your workspace…</p>
                <div className="mt-6 flex items-center gap-2 text-xs text-tx-muted">
                  <Loader2 size={14} className="animate-spin" />
                  Preparing your workspace
                </div>
              </div>
            ) : (
              /* ── Activation form ── */
              <>
                <div className="mb-8 flex flex-col items-center text-center">
                  <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-accent/30 bg-accent/15 shadow-[0_0_32px_rgba(124,108,242,0.25)]">
                    <KeyRound size={28} className="text-accent-light" />
                  </div>
                  <p className="mb-2 text-xs font-extrabold uppercase tracking-widest text-accent-light">
                    Activation Required
                  </p>
                  <h2 className="text-2xl font-extrabold text-white">Enter your key</h2>
                  <p className="mt-2 text-sm leading-relaxed text-tx-secondary">
                    Enter the activation key provided with your license to unlock Flow Ledger.
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                  <label className="block">
                    <span className="mb-2 block text-xs font-bold uppercase text-tx-secondary">Activation Key</span>
                    <div className="relative">
                      <KeyRound size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-tx-muted" />
                      <input
                        ref={inputRef}
                        type="text"
                        value={key}
                        onChange={handleKeyChange}
                        onPaste={handlePaste}
                        placeholder="XXXX-XXXX-XXXX-XXXX"
                        spellCheck={false}
                        autoComplete="off"
                        maxLength={19}
                        className="fl-auth-input pl-12 pr-4 font-mono tracking-[0.2em] uppercase"
                      />
                    </div>
                    <p className="mt-1.5 text-xs text-tx-faint">
                      Format: XXXX-XXXX-XXXX-XXXX — dashes are inserted automatically
                    </p>
                  </label>

                  {/* Error state */}
                  {errorInfo && (
                    <div className="flex items-start gap-3 rounded-xl border border-status-red/25 bg-status-red/8 px-4 py-3.5">
                      <ErrorIcon size={18} className="mt-0.5 shrink-0 text-status-red" />
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-status-red">{errorInfo.title}</p>
                        <p className="mt-0.5 text-xs leading-relaxed text-tx-secondary">{resolvedErrorBody}</p>
                      </div>
                    </div>
                  )}

                  <div className="rounded-xl border border-cyan-400/20 bg-cyan-500/6 px-4 py-3 text-xs text-cyan-100">
                    <div className="mb-2 flex items-center gap-2">
                      <AlertCircle size={14} className="shrink-0 text-cyan-300" />
                      <p className="font-bold uppercase tracking-[0.2em] text-cyan-300">Developer Debug Panel</p>
                    </div>
                    <div className="space-y-1.5 font-mono leading-relaxed">
                      <p>Supabase connection: {debugInfo.supabaseConnectionStatus || 'not_checked'}</p>
                      <p>Current user id: {debugInfo.currentUserId || 'Unavailable'}</p>
                      <p>Activation lookup: {debugInfo.activationKeyLookupStatus || 'not_started'}</p>
                      <p>Exact activation error: {debugInfo.exactActivationError || 'None'}</p>
                      <p>Activation log file: {debugInfo.logFile || 'Pending first activation attempt'}</p>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading || key.replace(/-/g, '').length < 4}
                    className="group relative mt-1 flex h-14 w-full items-center justify-center gap-3 rounded-xl bg-gradient-to-r from-accent-light to-accent text-sm font-bold text-white shadow-[0_18px_40px_rgba(124,108,242,0.32)] transition hover:brightness-110 disabled:opacity-60"
                  >
                    {loading ? (
                      <>
                        <Loader2 size={18} className="animate-spin" />
                        Validating…
                      </>
                    ) : (
                      <>
                        <ShieldCheck size={18} />
                        Activate Account
                      </>
                    )}
                  </button>
                </form>
              </>
            )}
          </div>

          {/* Sign out + support links */}
          {!success && (
            <div className="mt-6 flex items-center justify-between text-xs text-tx-muted">
              <button
                onClick={onLogout}
                className="flex items-center gap-1.5 font-semibold transition hover:text-white"
              >
                <LogOut size={13} />
                Sign out
              </button>
              <a
                href="mailto:support@flowledger.app"
                onClick={e => { e.preventDefault(); window.electron?.openExternal?.('mailto:support@flowledger.app'); }}
                className="font-semibold text-accent-light transition hover:text-white"
              >
                Need help? Contact support
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
