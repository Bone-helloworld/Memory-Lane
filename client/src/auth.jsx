import { createContext, startTransition, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { api, setUnauthorizedHandler } from './api.js';
import { hasExplicitLocale, useI18n } from './i18n/index.jsx';

/**
 * Who is logged in. `user` is:
 *   undefined → still asking the server
 *   null      → logged out
 *   {…}       → logged in
 */
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined);
  const [demoEnabled, setDemoEnabled] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState(false); // "Continue with Google" set up on the server?
  // Upload limits announced by the server (checked again there).
  const [limits, setLimits] = useState({ maxImageMb: 15, maxVideoMb: 100 });
  const { locale, setLocale } = useI18n();
  const navigate = useNavigate();
  const localeRef = useRef(locale);
  localeRef.current = locale;

  // Language rule: a choice made on this device wins (and is saved to the account);
  // otherwise the account's saved language is used, so it follows you across devices.
  const adopt = useCallback(
    (nextUser) => {
      setUser(nextUser);
      if (!nextUser) return;
      if (hasExplicitLocale()) {
        if (nextUser.locale !== localeRef.current) {
          api.patch('/api/me', { locale: localeRef.current }).then((r) => setUser(r.user)).catch(() => {});
        }
      } else {
        setLocale(nextUser.locale, { remember: false });
      }
    },
    [setLocale],
  );

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    api
      .get('/api/auth/session')
      .then((r) => {
        setDemoEnabled(Boolean(r.demo));
        setGoogleEnabled(Boolean(r.google));
        if (r.limits) setLimits(r.limits);
        adopt(r.user);
      })
      .catch(() => setUser(null));
  }, [adopt]);

  /**
   * Leave the private area. React Router applies navigation as a transition (low priority);
   * putting "go home" and "forget the user" in the same transition renders them together,
   * so the route guard never sees "no user on a private page" and bounces us to /login.
   */
  const signedOut = useCallback(() => {
    startTransition(() => {
      navigate('/', { replace: true });
      setUser(null);
    });
  }, [navigate]);

  const value = useMemo(
    () => ({
      user,
      demoEnabled,
      googleEnabled,
      limits,
      signedOut,
      async login(email, password) {
        const r = await api.post('/api/auth/login', { email, password });
        adopt(r.user);
        return r.user;
      },
      async register(fields) {
        const r = await api.post('/api/auth/register', { ...fields, locale: localeRef.current });
        setUser(r.user);
        return r.user;
      },
      /** who: 'owner' → An's album · 'friend' → Thu Hà, to see sharing from the other side. */
      async demo(who = 'owner') {
        const r = await api.post('/api/auth/demo', who === 'friend' ? { as: 'friend' } : {});
        setUser(r.user);
        // The demo account follows whatever language the visitor is reading in.
        if (r.user.locale !== localeRef.current) {
          api.patch('/api/me', { locale: localeRef.current }).then((res) => setUser(res.user)).catch(() => {});
        }
        return r.user;
      },
      async logout() {
        await api.post('/api/auth/logout').catch(() => {});
        signedOut();
      },
      saveLocale(next) {
        api.patch('/api/me', { locale: next }).then((r) => setUser(r.user)).catch(() => {});
      },
      setUser,
    }),
    [user, demoEnabled, googleEnabled, limits, adopt, signedOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
