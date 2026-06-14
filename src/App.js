import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import supabase from './lib/supabase';
import AuthPage              from './components/auth/AuthPage';
import EmailVerificationPage from './components/auth/EmailVerificationPage';
import ActivationPage        from './components/auth/ActivationPage';
import Dashboard             from './components/dashboard/Dashboard';
import AppLoader             from './components/shared/AppLoader';
import { UpdateProvider }    from './components/shared/UpdateManager';

// ─── AUTH CONTEXT ─────────────────────────────────────────────────────────────
export const AuthContext = createContext(null);
export const useAuth    = () => useContext(AuthContext);

const USER_STORAGE_KEY  = 'fl_user';
const THEME_STORAGE_KEY = 'fl_theme';

/*
 * Auth state machine:
 *   'loading'            → AppLoader / splash
 *   'unauthenticated'    → AuthPage (login / register)
 *   'unverified'         → EmailVerificationPage
 *   'pending_activation' → ActivationPage
 *   'active'             → Dashboard
 */

export default function App() {
  const [appReady,       setAppReady]       = useState(false);
  const [authState,      setAuthState]      = useState('loading');
  const [supabaseSession, setSupabaseSession] = useState(null);
  const [profile,        setProfile]        = useState(null);
  const [pendingEmail,   setPendingEmail]   = useState('');  // for EmailVerificationPage
  const [user,           setUser]           = useState(() => {
    try {
      const stored = localStorage.getItem(USER_STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch { return null; }
  });

  // ─── Theme ────────────────────────────────────────────────────────────────
  const [theme, setThemeState] = useState(() => {
    try {
      const t = localStorage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark';
      const root = document.documentElement;
      root.classList.toggle('theme-light', t === 'light');
      root.classList.toggle('theme-dark',  t !== 'light');
      root.dataset.theme    = t;
      root.style.colorScheme = t;
      return t;
    } catch { return 'dark'; }
  });

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme    = theme;
    root.classList.toggle('theme-light', theme === 'light');
    root.classList.toggle('theme-dark',  theme !== 'light');
    root.style.colorScheme = theme;
  }, [theme]);

  const setTheme = useCallback((nextTheme) => {
    const value = nextTheme === 'light' ? 'light' : 'dark';
    localStorage.setItem(THEME_STORAGE_KEY, value);
    setThemeState(value);
  }, []);

  const toggleTheme = useCallback(
    () => setTheme(theme === 'light' ? 'dark' : 'light'),
    [theme, setTheme],
  );

  // ─── Helpers ──────────────────────────────────────────────────────────────

  const fetchProfile = useCallback(async (userId) => {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .single();
      return data ?? null;
    } catch { return null; }
  }, []);

  const syncLocalUser = useCallback(async (supabaseUser) => {
    if (!window.electron?.supabaseLogin) return null;
    try {
      const res = await window.electron.supabaseLogin({ supabaseUser });
      if (res?.success) {
        localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(res.user));
        return res.user;
      }
      return null;
    } catch { return null; }
  }, []);

  // ─── Core session handler ─────────────────────────────────────────────────

  const handleSession = useCallback(async (session) => {
    if (!session?.user) {
      setAuthState('unauthenticated');
      setSupabaseSession(null);
      setProfile(null);
      setUser(null);
      localStorage.removeItem(USER_STORAGE_KEY);
      return;
    }

    setSupabaseSession(session);

    // Email not yet verified
    if (!session.user.email_confirmed_at) {
      setPendingEmail(session.user.email || '');
      setAuthState('unverified');
      return;
    }

    // Fetch cloud profile
    const profileData = await fetchProfile(session.user.id);
    setProfile(profileData);

    if (!profileData || profileData.account_status === 'pending_activation') {
      setAuthState('pending_activation');
      return;
    }

    if (profileData.account_status === 'active') {
      const localUser = await syncLocalUser(session.user);
      if (localUser) {
        setUser(localUser);
        setAuthState('active');
      } else {
        // Local DB sync failed — keep trying at next session refresh
        setAuthState('pending_activation');
      }
      return;
    }

    // suspended / banned / unknown
    setAuthState('unauthenticated');
  }, [fetchProfile, syncLocalUser]);

  // ─── Supabase auth subscription ───────────────────────────────────────────

  const initialised = useRef(false);

  useEffect(() => {
    if (initialised.current) return;
    initialised.current = true;

    // Resolve initial session first
    supabase.auth.getSession().then(({ data: { session } }) => {
      handleSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => { handleSession(session); }
    );

    return () => subscription.unsubscribe();
  }, [handleSession]);

  // ─── Deep-link handler (flowledger://auth/callback) ───────────────────────
  // Fired by Electron main when the OS opens the app via the custom protocol.
  // Supabase appends the session tokens in the URL hash (implicit flow) or a
  // code param (PKCE flow) — we handle both and establish the local session.
  useEffect(() => {
    if (!window.electron?.onAuthDeepLink) return;

    const cleanup = window.electron.onAuthDeepLink(async (url) => {
      try {
        const urlObj = new URL(url);

        // PKCE flow: ?code=
        const code = urlObj.searchParams.get('code');
        if (code) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(url);
          if (!error && data?.session) handleSession(data.session);
          return;
        }

        // Implicit flow: #access_token=...&refresh_token=...
        const params       = new URLSearchParams(urlObj.hash.replace(/^#/, ''));
        const accessToken  = params.get('access_token');
        const refreshToken = params.get('refresh_token');
        if (accessToken && refreshToken) {
          const { data, error } = await supabase.auth.setSession({
            access_token:  accessToken,
            refresh_token: refreshToken,
          });
          if (!error && data?.session) handleSession(data.session);
        }
      } catch (err) {
        console.error('[deepLink] failed to process auth URL:', err);
      }
    });

    return cleanup;
  }, [handleSession]);

  // ─── Auth actions ─────────────────────────────────────────────────────────

  const logout = useCallback(async () => {
    await supabase.auth.signOut().catch(() => {});
    if (window.electron?.supabaseLogout) {
      await window.electron.supabaseLogout().catch(() => {});
    }
    localStorage.removeItem(USER_STORAGE_KEY);
    setUser(null);
    setSupabaseSession(null);
    setProfile(null);
    setAuthState('unauthenticated');
  }, []);

  const updateUser = useCallback((patch) => {
    setUser(prev => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  // ─── Callbacks for child pages ────────────────────────────────────────────

  const handleRegistered = useCallback((email) => {
    setPendingEmail(email);
    setAuthState('unverified');
  }, []);

  const handleLoginSuccess = useCallback(async (session, supabaseUser) => {
    // Update the supabase client session then run the full session handler
    await handleSession(session);
  }, [handleSession]);

  const handleUnverified = useCallback((email) => {
    setPendingEmail(email);
    setAuthState('unverified');
  }, []);

  const handleVerified = useCallback(() => {
    // Re-check session — user verified email in browser then clicked Refresh
    supabase.auth.getSession().then(({ data: { session } }) => {
      handleSession(session);
    });
  }, [handleSession]);

  const handleActivated = useCallback(async () => {
    // Re-fetch profile which should now be 'active'
    if (!supabaseSession?.user) return;
    const profileData = await fetchProfile(supabaseSession.user.id);
    setProfile(profileData);
    if (profileData?.account_status === 'active') {
      const localUser = await syncLocalUser(supabaseSession.user);
      if (localUser) {
        // Clear any stale onboarding flags from previous sessions so the
        // setup wizard always runs for a newly activated account.
        localStorage.removeItem('fl_setup_v2');
        localStorage.removeItem('fl_onboarded_v1');
        setUser(localUser);
        setAuthState('active');
      }
    }
  }, [supabaseSession, fetchProfile, syncLocalUser]);

  // ─── Render ───────────────────────────────────────────────────────────────

  const renderContent = () => {
    switch (authState) {
      case 'unauthenticated':
        return (
          <AuthPage
            onRegistered={handleRegistered}
            onLoginSuccess={handleLoginSuccess}
            onUnverified={handleUnverified}
          />
        );
      case 'unverified':
        return (
          <EmailVerificationPage
            email={pendingEmail}
            onBack={() => setAuthState('unauthenticated')}
            onVerified={handleVerified}
          />
        );
      case 'pending_activation':
        return (
          <ActivationPage
            supabaseUser={supabaseSession?.user}
            onActivated={handleActivated}
            onLogout={logout}
          />
        );
      case 'active':
        return <Dashboard />;
      default:
        return null; // 'loading' — AppLoader covers this
    }
  };

  return (
    <AuthContext.Provider value={{
      user, updateUser, logout, theme, setTheme, toggleTheme,
      supabaseSession, profile, authState,
      // Legacy shim — Dashboard and sub-components read user.id, etc.
      login: (userData) => {
        localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(userData));
        setUser(userData);
      },
    }}>
      <UpdateProvider>
        {!appReady && <AppLoader onComplete={() => setAppReady(true)} />}
        <div
          className="flex h-screen w-screen flex-col overflow-hidden bg-bg-app text-tx-primary"
          style={{
            opacity:    appReady ? 1 : 0,
            transition: appReady ? 'opacity 0.3s ease-out' : 'none',
          }}
        >
          {renderContent()}
        </div>
      </UpdateProvider>
    </AuthContext.Provider>
  );
}
