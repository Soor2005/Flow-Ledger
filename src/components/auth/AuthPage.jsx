import React, { useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  Check,
  Clock3,
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Target,
  UserRound,
} from 'lucide-react';
import { useAuth } from '../../App';
import logoSrc from '../../assets/logo.png';

const api = window.electron || {};

const FEATURES = [
  { Icon: Clock3, label: 'Live focus sessions', sub: "See what you're doing in real time" },
  { Icon: BarChart3, label: 'Private productivity analytics', sub: 'Yours only. Always.' },
  { Icon: Target, label: 'Goals, projects, and clients', sub: 'Organize work that matters' },
  { Icon: LockKeyhole, label: 'Local-first workspace', sub: 'Your data stays with you' },
];

export default function AuthPage() {
  const { login } = useAuth();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ firstName: '', lastName: '', username: '', email: '', password: '', confirm: '' });
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (mode === 'register') {
      if (!form.firstName.trim()) return setError('First name is required');
      if (!form.email.trim())     return setError('Email address is required');
      if (form.password !== form.confirm) return setError('Passwords do not match');
    }
    if (form.password.length < 6) return setError('Password must be at least 6 characters');

    setLoading(true);
    try {
      if (mode === 'login') {
        const res = await api.login?.({ username: form.username, password: form.password });
        if (res?.success) login(res.user);
        else setError(res?.error || 'Login failed');
      } else {
        const res = await api.register?.({
          username:  form.username,
          email:     form.email.trim(),
          password:  form.password,
          firstName: form.firstName.trim(),
          lastName:  form.lastName.trim(),
        });
        if (res?.success) {
          setSuccess('Account created. Signing you in...');
          setTimeout(() => login(res.user), 800);
        } else setError(res?.error || 'Registration failed');
      }
    } catch (err) {
      setError('Something went wrong. Please restart Flow Ledger and try again.');
    } finally {
      setLoading(false);
    }
  };

  const switchMode = () => {
    setMode(m => m === 'login' ? 'register' : 'login');
    setError('');
    setSuccess('');
    setForm({ firstName: '', lastName: '', username: '', email: '', password: '', confirm: '' });
  };

  return (
    <div className="fl-auth-page flex h-full flex-col overflow-hidden">
      {/* Minimal drag strip with window controls for the auth screen */}
      <div className="drag-region shrink-0 flex h-9 items-center px-3 gap-[6px]" style={{ background: 'transparent' }}>
        <div className="no-drag flex items-center gap-[6px]">
          <button onClick={() => api.close?.()}    className="h-3 w-3 rounded-full" style={{ background: '#ff5f57' }} title="Close" />
          <button onClick={() => api.minimize?.()}  className="h-3 w-3 rounded-full" style={{ background: '#febc2e' }} title="Minimize" />
          <button onClick={() => api.maximize?.()}  className="h-3 w-3 rounded-full" style={{ background: '#28c840' }} title="Maximize" />
        </div>
      </div>
      <div className="flex flex-1 overflow-hidden">
      <section className="relative hidden min-w-[520px] flex-1 overflow-hidden border-r border-white/[0.07] px-11 py-8 lg:flex lg:flex-col">
        <div className="relative z-10 flex items-center gap-4">
          <img src={logoSrc} alt="Flow Ledger" className="h-11 w-11 shrink-0 rounded-xl object-contain shadow-[0_0_30px_rgba(124,108,242,0.35)]" />
          <div className="min-w-0">
            <p className="text-xl font-extrabold text-white">Flow Ledger</p>
            <p className="mt-1 text-xs font-semibold uppercase text-tx-muted">Personal operating system</p>
          </div>
        </div>

        <div className="pointer-events-none absolute inset-0">
          <div className="fl-auth-orbit fl-auth-orbit-one" />
          <div className="fl-auth-orbit fl-auth-orbit-two" />
          <div className="fl-auth-planet" />
          <FloatingIcon className="left-[16%] top-[22%]" Icon={Clock3} />
          <FloatingIcon className="right-[14%] top-[24%]" Icon={BarChart3} />
          <FloatingIcon className="left-[5%] bottom-[24%]" Icon={Clock3} />
          <FloatingIcon className="right-[7%] bottom-[34%]" Icon={LockKeyhole} />
        </div>

        <div className="relative z-20 mt-auto max-w-[680px] pb-8">
          <p className="mb-5 text-sm font-extrabold uppercase text-accent-light">Time, work, signal</p>
          <h1 className="max-w-[600px] text-[46px] font-extrabold leading-[1.18] text-white xl:text-[54px]">
            Make your day <span className="bg-gradient-to-r from-pink-400 via-accent-light to-accent bg-clip-text text-transparent">visible</span>
            <br />before it disappears.
          </h1>
          <p className="mt-6 max-w-[440px] text-base leading-7 text-tx-secondary">
            Track sessions, connect them to real work, and read the patterns without sending your attention data anywhere else.
          </p>
        </div>

        <div className="relative z-10 grid grid-cols-2 gap-3 pb-7">
          {FEATURES.map(({ Icon, label, sub }) => (
            <div key={label} className="flex min-h-[86px] items-center gap-4 rounded-xl border border-white/[0.08] bg-white/[0.035] px-5 py-4 shadow-inner backdrop-blur-xl">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-accent/35 bg-accent/10 text-accent-light">
                <Icon size={18} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white">{label}</p>
                <p className="mt-1 truncate text-xs text-tx-muted">{sub}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="relative z-10 mb-3 flex items-center gap-2 text-sm text-tx-muted">
          <ShieldCheck size={16} className="text-accent-light" />
          Privacy by design. Local by default.
        </div>
      </section>

      <section className="flex flex-1 items-center justify-center px-5 py-7 sm:px-8">
        <div className="w-full max-w-[520px]">
          <div className="mb-7 flex items-center justify-center gap-2 lg:hidden">
            <img src={logoSrc} alt="Flow Ledger" className="h-8 w-8 shrink-0 rounded-lg object-contain" />
            <span className="text-lg font-extrabold text-white">Flow Ledger</span>
          </div>

          <div className="rounded-[18px] border border-white/[0.10] bg-white/[0.035] px-6 py-8 shadow-[0_28px_90px_rgba(0,0,0,0.38),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-xl sm:px-11 sm:py-12">
            <div className="mb-8">
              <p className="mb-4 text-sm font-extrabold uppercase text-accent-light">
                {mode === 'login' ? 'Welcome back' : 'Create workspace'}
              </p>
              <h2 className="text-[32px] font-extrabold leading-tight text-white">
                {mode === 'login' ? 'Sign in to continue' : 'Start tracking cleanly'}
              </h2>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {mode === 'register' && (
                <div className="flex gap-3">
                  <Field label="First Name" className="flex-1">
                    <input
                      type="text"
                      value={form.firstName}
                      onChange={set('firstName')}
                      required
                      autoComplete="given-name"
                      placeholder="Jane"
                      className="fl-auth-input px-4"
                    />
                  </Field>
                  <Field label="Last Name" className="flex-1">
                    <input
                      type="text"
                      value={form.lastName}
                      onChange={set('lastName')}
                      autoComplete="family-name"
                      placeholder="Smith"
                      className="fl-auth-input px-4"
                    />
                  </Field>
                </div>
              )}

              <Field label="Username">
                <div className="relative">
                  <UserRound size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-tx-muted" />
                  <input
                    type="text"
                    value={form.username}
                    onChange={set('username')}
                    required
                    autoComplete="username"
                    placeholder="your_username"
                    className="fl-auth-input pl-12 pr-4"
                  />
                </div>
              </Field>

              {mode === 'register' && (
                <Field label="Email">
                  <div className="relative">
                    <Mail size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-tx-muted" />
                    <input
                      type="email"
                      value={form.email}
                      onChange={set('email')}
                      required
                      autoComplete="email"
                      placeholder="you@example.com"
                      className="fl-auth-input pl-12 pr-4"
                    />
                  </div>
                </Field>
              )}

              <Field label="Password">
                <div className="relative">
                  <LockKeyhole size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-tx-muted" />
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={form.password}
                    onChange={set('password')}
                    required
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    placeholder="Password"
                    className="fl-auth-input pl-12 pr-12"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(v => !v)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 rounded-md p-1 text-tx-muted transition hover:bg-white/[0.06] hover:text-white"
                    title={showPw ? 'Hide password' : 'Show password'}
                  >
                    {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </Field>

              {mode === 'register' && (
                <Field label="Confirm Password">
                  <div className="relative">
                    <LockKeyhole size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-tx-muted" />
                    <input
                      type="password"
                      value={form.confirm}
                      onChange={set('confirm')}
                      required
                      autoComplete="new-password"
                      placeholder="Confirm password"
                      className="fl-auth-input pl-12 pr-4"
                    />
                  </div>
                </Field>
              )}

              {mode === 'login' && (
                <div className="flex items-center justify-between gap-3 text-sm">
                  <label className="flex min-w-0 items-center gap-2 text-tx-secondary">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-accent text-bg-app">
                      <Check size={14} strokeWidth={3} />
                    </span>
                    Remember me
                  </label>
                  <button
                    type="button"
                    onClick={() => setError('Password reset is not available for local-only accounts yet.')}
                    className="shrink-0 font-semibold text-accent-light transition hover:text-white"
                  >
                    Forgot password?
                  </button>
                </div>
              )}

              {error && <p className="rounded-lg border border-status-red/25 bg-status-red/10 px-3 py-2 text-sm font-medium text-status-red">{error}</p>}
              {success && <p className="rounded-lg border border-status-green/25 bg-status-green/10 px-3 py-2 text-sm font-medium text-status-green">{success}</p>}

              <button
                type="submit"
                disabled={loading}
                className="group relative mt-2 flex h-14 w-full items-center justify-center gap-3 rounded-lg bg-gradient-to-r from-accent-light to-accent text-sm font-bold text-white shadow-[0_18px_40px_rgba(124,108,242,0.32)] transition hover:brightness-110 disabled:opacity-70"
              >
                {loading && <Loader2 size={18} className="animate-spin" />}
                {mode === 'login' ? 'Sign In' : 'Create Account'}
                {!loading && <ArrowRight size={20} className="absolute right-6 transition group-hover:translate-x-1" />}
              </button>

              {mode === 'login' && (
                <>
                  <div className="flex items-center gap-4 py-3 text-xs text-tx-muted">
                    <span className="h-px flex-1 bg-white/[0.09]" />
                    or
                    <span className="h-px flex-1 bg-white/[0.09]" />
                  </div>
                  <button
                    type="button"
                    onClick={() => setError('Google sign-in is not connected yet. Use your local Flow Ledger account.')}
                    className="flex h-14 w-full items-center justify-center gap-3 rounded-lg border border-white/[0.10] bg-white/[0.025] text-sm font-semibold text-white transition hover:border-white/[0.18] hover:bg-white/[0.045]"
                  >
                    <span className="text-lg font-extrabold text-[#4285F4]">G</span>
                    Continue with Google
                  </button>
                </>
              )}
            </form>

            <p className="mt-7 text-center text-sm font-medium text-tx-muted">
              {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
              <button onClick={switchMode} className="font-bold text-accent-light transition hover:text-white">
                {mode === 'login' ? 'Create one' : 'Sign in'}
              </button>
            </p>
          </div>
        </div>
      </section>
      </div>{/* end flex-1 content row */}
    </div>
  );
}

function FloatingIcon({ Icon, className }) {
  return (
    <div className={`absolute flex h-14 w-14 rotate-[-10deg] items-center justify-center rounded-xl border border-accent/25 bg-accent/10 text-accent-light shadow-[0_0_40px_rgba(124,108,242,0.16)] backdrop-blur-md ${className}`}>
      <Icon size={22} />
    </div>
  );
}

function Field({ label, hint, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-3 block text-sm font-bold uppercase text-tx-secondary">
        {label}
        {hint && <span className="ml-1 normal-case text-tx-faint">({hint})</span>}
      </span>
      {children}
    </label>
  );
}
