import React, { useState } from 'react';
import {
  ArrowRight,
  BarChart3,
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
import supabase from '../../lib/supabase';
import logoSrc from '../../assets/logo.png';
import { isMac as IS_MAC_TB, MacControls as TrafficLights, WinControls } from '../shared/TitleBar';

const FEATURES = [
  { Icon: Clock3,    label: 'Live focus sessions',          sub: "See what you're doing in real time"  },
  { Icon: BarChart3, label: 'Private productivity analytics', sub: 'Yours only. Always.'               },
  { Icon: Target,    label: 'Goals, projects, and clients',  sub: 'Organize work that matters'         },
  { Icon: LockKeyhole, label: 'Local-first workspace',       sub: 'Your data stays with you'           },
];

export default function AuthPage({ onRegistered, onLoginSuccess, onUnverified }) {
  const [mode, setMode]       = useState('login');
  const [form, setForm]       = useState({ fullName: '', email: '', password: '', confirm: '' });
  const [showPw, setShowPw]   = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [success, setSuccess] = useState('');

  const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (mode === 'register') {
      if (!form.fullName.trim()) return setError('Full name is required');
      if (!form.email.trim())    return setError('Email address is required');
      if (form.password !== form.confirm) return setError('Passwords do not match');
    }
    if (form.password.length < 8) return setError('Password must be at least 8 characters');

    setLoading(true);
    try {
      if (mode === 'register') {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email:    form.email.trim().toLowerCase(),
          password: form.password,
          options: {
            data:            { full_name: form.fullName.trim() },
            emailRedirectTo: 'flowledger://auth/callback',
          },
        });

        if (signUpError) {
          setError(signUpError.message);
        } else if (data?.user && !data.session) {
          // Email confirmation required — session is null until verified
          setSuccess('Account created! Check your inbox for a verification email.');
          setTimeout(() => onRegistered?.(form.email.trim().toLowerCase()), 1500);
        } else if (data?.session) {
          // Email confirmation disabled in Supabase — immediate session
          onLoginSuccess?.(data.session, data.user);
        } else {
          setError('Registration failed. Please try again.');
        }
      } else {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email:    form.email.trim().toLowerCase(),
          password: form.password,
        });

        if (signInError) {
          if (signInError.message?.toLowerCase().includes('email not confirmed')) {
            onUnverified?.(form.email.trim().toLowerCase());
          } else if (signInError.message?.toLowerCase().includes('invalid login credentials')) {
            setError('Invalid email or password. Please check your credentials.');
          } else {
            setError(signInError.message);
          }
        } else if (data?.session) {
          onLoginSuccess?.(data.session, data.user);
        } else {
          setError('Sign in failed. Please try again.');
        }
      }
    } catch {
      setError('Something went wrong. Please restart Flow Ledger and try again.');
    } finally {
      setLoading(false);
    }
  };

  const switchMode = () => {
    setMode(m => m === 'login' ? 'register' : 'login');
    setError('');
    setSuccess('');
    setForm({ fullName: '', email: '', password: '', confirm: '' });
  };

  return (
    <div className="fl-auth-page flex h-full flex-col overflow-hidden">
      {/* Drag region */}
      <div className="drag-region shrink-0 flex h-9 items-center justify-between pl-3" style={{ background: 'transparent' }}>
        {IS_MAC_TB && <TrafficLights />}
        {!IS_MAC_TB && <WinControls height={36} />}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left panel */}
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

        {/* Right panel — form */}
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
                  <Field label="Full Name">
                    <div className="relative">
                      <UserRound size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-tx-muted" />
                      <input
                        type="text"
                        value={form.fullName}
                        onChange={set('fullName')}
                        required
                        autoComplete="name"
                        placeholder="Jane Smith"
                        className="fl-auth-input pl-12 pr-4"
                      />
                    </div>
                  </Field>
                )}

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

                <Field label="Password">
                  <div className="relative">
                    <LockKeyhole size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-tx-muted" />
                    <input
                      type={showPw ? 'text' : 'password'}
                      value={form.password}
                      onChange={set('password')}
                      required
                      autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                      placeholder={mode === 'register' ? 'At least 8 characters' : 'Password'}
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

                {error   && <p className="rounded-lg border border-status-red/25 bg-status-red/10 px-3 py-2 text-sm font-medium text-status-red">{error}</p>}
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
      </div>
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
