import React, { useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Mail,
  RefreshCw,
  Send,
} from 'lucide-react';
import supabase from '../../lib/supabase';
import logoSrc from '../../assets/logo.png';

export default function EmailVerificationPage({ email, onBack, onVerified }) {
  const [resending,      setResending]      = useState(false);
  const [resendMessage,  setResendMessage]  = useState('');
  const [checking,       setChecking]       = useState(false);
  const [checkMessage,   setCheckMessage]   = useState('');
  const [changingEmail,  setChangingEmail]  = useState(false);
  const [newEmail,       setNewEmail]       = useState('');
  const [changeLoading,  setChangeLoading]  = useState(false);
  const [changeMessage,  setChangeMessage]  = useState('');

  const handleResend = async () => {
    if (!email) return;
    setResending(true);
    setResendMessage('');
    try {
      const { error } = await supabase.auth.resend({ type: 'signup', email });
      if (error) setResendMessage(`error:${error.message}`);
      else        setResendMessage('success:Verification email sent! Check your inbox.');
    } catch {
      setResendMessage('error:Something went wrong. Please try again.');
    } finally {
      setResending(false);
    }
  };

  const handleCheckStatus = async () => {
    setChecking(true);
    setCheckMessage('');
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error) {
        setCheckMessage('error:Could not check status. Please try signing in again.');
      } else if (user?.email_confirmed_at) {
        setCheckMessage('success:Email verified! Redirecting…');
        setTimeout(() => onVerified?.(), 1200);
      } else {
        setCheckMessage('error:Email not yet verified. Please check your inbox and click the link.');
      }
    } catch {
      setCheckMessage('error:Could not reach server. Check your connection.');
    } finally {
      setChecking(false);
    }
  };

  const handleChangeEmail = async (e) => {
    e.preventDefault();
    if (!newEmail.trim()) return;
    setChangeLoading(true);
    setChangeMessage('');
    try {
      const { error } = await supabase.auth.updateUser({ email: newEmail.trim().toLowerCase() });
      if (error) setChangeMessage(`error:${error.message}`);
      else        setChangeMessage(`success:Verification email sent to ${newEmail.trim()}. Check your inbox.`);
    } catch {
      setChangeMessage('error:Something went wrong. Please try again.');
    } finally {
      setChangeLoading(false);
    }
  };

  const msg = (raw) => {
    if (!raw) return null;
    const isError = raw.startsWith('error:');
    const text    = raw.replace(/^(error|success):/, '');
    return (
      <p className={`mt-2 rounded-lg border px-3 py-2 text-sm font-medium ${
        isError
          ? 'border-status-red/25 bg-status-red/10 text-status-red'
          : 'border-status-green/25 bg-status-green/10 text-status-green'
      }`}>{text}</p>
    );
  };

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

          <div className="rounded-[18px] border border-white/[0.10] bg-white/[0.035] px-8 py-10 shadow-[0_28px_90px_rgba(0,0,0,0.38),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-xl">
            {/* Icon + heading */}
            <div className="mb-8 flex flex-col items-center text-center">
              <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-accent/30 bg-accent/15 shadow-[0_0_32px_rgba(124,108,242,0.25)]">
                <Mail size={28} className="text-accent-light" />
              </div>
              <p className="mb-2 text-xs font-extrabold uppercase tracking-widest text-accent-light">
                Verify Your Email
              </p>
              <h2 className="text-2xl font-extrabold text-white">Check your inbox</h2>
              <p className="mt-3 text-sm leading-relaxed text-tx-secondary">
                We sent a verification link to{' '}
                <span className="font-semibold text-white">{email || 'your email address'}</span>.
                Click the link to activate your account.
              </p>
            </div>

            <div className="space-y-3">
              {/* Refresh status */}
              <button
                onClick={handleCheckStatus}
                disabled={checking}
                className="group flex h-12 w-full items-center justify-center gap-3 rounded-xl bg-gradient-to-r from-accent-light to-accent text-sm font-bold text-white shadow-[0_12px_28px_rgba(124,108,242,0.28)] transition hover:brightness-110 disabled:opacity-70"
              >
                {checking
                  ? <Loader2 size={17} className="animate-spin" />
                  : <RefreshCw size={17} className="transition group-hover:rotate-180 duration-500" />
                }
                {checking ? 'Checking…' : 'Refresh Verification Status'}
              </button>
              {msg(checkMessage)}

              {/* Resend */}
              <button
                onClick={handleResend}
                disabled={resending}
                className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-white/[0.12] bg-white/[0.04] text-sm font-semibold text-white transition hover:border-white/[0.22] hover:bg-white/[0.07] disabled:opacity-60"
              >
                {resending
                  ? <Loader2 size={17} className="animate-spin" />
                  : <Send size={17} />
                }
                {resending ? 'Sending…' : 'Resend Verification Email'}
              </button>
              {msg(resendMessage)}
            </div>

            {/* Divider */}
            <div className="my-7 flex items-center gap-4 text-xs text-tx-muted">
              <span className="h-px flex-1 bg-white/[0.08]" />
              Wrong email address?
              <span className="h-px flex-1 bg-white/[0.08]" />
            </div>

            {/* Change email toggle */}
            {!changingEmail ? (
              <button
                onClick={() => setChangingEmail(true)}
                className="w-full text-center text-sm font-semibold text-accent-light transition hover:text-white"
              >
                Change Email Address
              </button>
            ) : (
              <form onSubmit={handleChangeEmail} className="space-y-3">
                <label className="block">
                  <span className="mb-2 block text-xs font-bold uppercase text-tx-secondary">New Email</span>
                  <div className="relative">
                    <Mail size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-tx-muted" />
                    <input
                      type="email"
                      value={newEmail}
                      onChange={e => setNewEmail(e.target.value)}
                      required
                      placeholder="new@example.com"
                      className="fl-auth-input pl-11 pr-4"
                    />
                  </div>
                </label>
                {msg(changeMessage)}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setChangingEmail(false); setNewEmail(''); setChangeMessage(''); }}
                    className="flex h-10 flex-1 items-center justify-center rounded-lg border border-white/[0.10] text-sm font-semibold text-tx-secondary transition hover:border-white/[0.20] hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={changeLoading}
                    className="flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-accent text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-60"
                  >
                    {changeLoading && <Loader2 size={15} className="animate-spin" />}
                    Update Email
                  </button>
                </div>
              </form>
            )}

            {/* Back to sign in */}
            <button
              onClick={onBack}
              className="mt-7 flex w-full items-center justify-center gap-2 text-sm font-semibold text-tx-muted transition hover:text-white"
            >
              <ArrowLeft size={15} />
              Back to Sign In
            </button>
          </div>

          <p className="mt-6 text-center text-xs text-tx-faint">
            Having trouble?{' '}
            <a
              href="mailto:support@flowledger.app"
              onClick={e => { e.preventDefault(); window.electron?.openExternal?.('mailto:support@flowledger.app'); }}
              className="font-semibold text-accent-light transition hover:text-white"
            >
              Contact support
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
