import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AuthPage from './components/auth/AuthPage';
import Dashboard from './components/dashboard/Dashboard';
import AppLoader from './components/shared/AppLoader';
import { UpdateProvider } from './components/shared/UpdateManager';

// ─── AUTH CONTEXT ─────────────────────────────────────────────────────────────
export const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

const USER_STORAGE_KEY = 'fl_user';
const THEME_STORAGE_KEY = 'fl_theme';

export default function App() {
  const [appReady, setAppReady] = useState(false);
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem(USER_STORAGE_KEY) || sessionStorage.getItem(USER_STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch { return null; }
  });
  const [theme, setThemeState] = useState(() => {
    try {
      const t = localStorage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark';
      // Apply synchronously so every useIsLight() hook reads the correct class
      // on its first render — avoids a dark-flash when light mode is persisted.
      const root = document.documentElement;
      root.classList.toggle('theme-light', t === 'light');
      root.classList.toggle('theme-dark', t !== 'light');
      root.dataset.theme = t;
      root.style.colorScheme = t;
      return t;
    } catch { return 'dark'; }
  });

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.classList.toggle('theme-light', theme === 'light');
    root.classList.toggle('theme-dark', theme !== 'light');
    root.style.colorScheme = theme;
  }, [theme]);

  // useCallback gives setTheme a stable reference so useEffects that list
  // it as a dependency don't fire on every App re-render.
  const setTheme = useCallback((nextTheme) => {
    const value = nextTheme === 'light' ? 'light' : 'dark';
    localStorage.setItem(THEME_STORAGE_KEY, value);
    setThemeState(value);
  }, []);

  const toggleTheme = useCallback(
    () => setTheme(theme === 'light' ? 'dark' : 'light'),
    [theme, setTheme],
  );

  const login = (userData) => {
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(userData));
    sessionStorage.removeItem(USER_STORAGE_KEY);
    setUser(userData);
  };

  const updateUser = (patch) => {
    setUser(prev => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const logout = () => {
    localStorage.removeItem(USER_STORAGE_KEY);
    sessionStorage.removeItem(USER_STORAGE_KEY);
    setUser(null);
  };

  useEffect(() => {
    if (!user?.id || !window.electron?.restoreSession) return;

    let cancelled = false;
    window.electron.restoreSession({ userId: user.id }).then((res) => {
      if (cancelled) return;
      if (res?.success && res.user) {
        localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(res.user));
        setUser(res.user);
      } else {
        logout();
      }
    }).catch(() => {
      if (!cancelled) logout();
    });

    return () => { cancelled = true; };
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, logout, updateUser, theme, setTheme, toggleTheme }}>
      <UpdateProvider>
        {!appReady && <AppLoader onComplete={() => setAppReady(true)} />}
        <div
          className="flex h-screen w-screen flex-col overflow-hidden bg-bg-app text-tx-primary"
          style={{
            opacity:    appReady ? 1 : 0,
            transition: appReady ? 'opacity 0.3s ease-out' : 'none',
          }}
        >
          {user ? <Dashboard /> : <AuthPage />}
        </div>
      </UpdateProvider>
    </AuthContext.Provider>
  );
}
