import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { api } from './api.js';
import { useAuth } from './auth.jsx';

/*
 * "Data version": every list on screen re-fetches when the version changes.
 * After any save or delete we call refresh(), so the sidebar counters, the album
 * and the dashboard all update together — no stale numbers, no page reloads.
 */
const DataContext = createContext({ version: 0, refresh: () => {} });

export function DataProvider({ children }) {
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  const value = useMemo(() => ({ version, refresh }), [version, refresh]);
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export const useData = () => useContext(DataContext);

/**
 * GET `path` and keep { data, error, loading } in sync with it.
 * Pass null to skip. Old requests are cancelled when the path changes, and the
 * previous data stays visible while a refresh loads (no flashing).
 */
export function useFetch(path) {
  const { version } = useData();
  const [state, setState] = useState({ data: null, error: null, loading: Boolean(path) });
  const [attempt, setAttempt] = useState(0);
  const lastPath = useRef(path);

  useEffect(() => {
    if (!path) {
      setState({ data: null, error: null, loading: false });
      return undefined;
    }
    const controller = new AbortController();
    const samePath = lastPath.current === path;
    lastPath.current = path;
    setState((s) => ({ data: samePath ? s.data : null, error: null, loading: true }));
    api
      .get(path, { signal: controller.signal })
      .then((data) => setState({ data, error: null, loading: false }))
      .catch((error) => {
        if (error.name !== 'AbortError') setState((s) => ({ ...s, error, loading: false }));
      });
    return () => controller.abort();
  }, [path, version, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...state, retry };
}

/** Sets the browser tab title: "Album ảnh · Memory Lane". */
export function usePageTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · Memory Lane` : 'Memory Lane';
  }, [title]);
}

/*
 * Composer: the "Save a new memory" form can be opened from anywhere
 * (top bar, empty film frames, the album…). It lives once in the app layout.
 * Invites: the "invite someone" dialog, likewise opened from several pages.
 */
const ComposerContext = createContext({ openMemory: () => {}, openInvite: () => {} });
export const ComposerProvider = ComposerContext.Provider;
export const useComposer = () => useContext(ComposerContext);

/*
 * "Something new was shared with you": the server reports when the latest share happened;
 * this device remembers the newest one already seen on the Sharing page.
 */
const SEEN_SHARED_KEY = 'ml.seenShared';

export function seenSharedAt() {
  try {
    return localStorage.getItem(SEEN_SHARED_KEY) ?? '';
  } catch {
    return '';
  }
}

export function markSharedSeen(iso) {
  if (!iso || iso <= seenSharedAt()) return;
  try {
    localStorage.setItem(SEEN_SHARED_KEY, iso);
  } catch {
    // storage disabled: the dot simply comes back next visit
  }
  window.dispatchEvent(new Event('ml-shared-seen'));
}

/** The newest share this device has seen; re-renders when the Sharing page marks more as seen. */
export function useSeenShared() {
  return useSyncExternalStore(
    (onChange) => {
      window.addEventListener('ml-shared-seen', onChange);
      window.addEventListener('storage', onChange);
      return () => {
        window.removeEventListener('ml-shared-seen', onChange);
        window.removeEventListener('storage', onChange);
      };
    },
    seenSharedAt,
  );
}

/*
 * Discreet mode — blurs photos and private text until hovered or tapped (an album opened in a café, on the bus).
 * Off until the person turns it on in Settings, and remembered per account on this device: a new account, or
 * someone else signing in on the same computer, never inherits it.
 */
const LEGACY_DISCREET_KEY = 'ml.discreet'; // before: one setting for everyone on the device
const DISCREET_EVENT = 'ml-discreet';
const discreetMemory = new Map(); // when localStorage is blocked: the choice lasts for this visit only

function readDiscreet(userId) {
  if (!userId) return false;
  try {
    return localStorage.getItem(`ml.discreet.${userId}`) === '1';
  } catch {
    return discreetMemory.get(userId) ?? false;
  }
}

function subscribeDiscreet(callback) {
  window.addEventListener(DISCREET_EVENT, callback);
  window.addEventListener('storage', callback); // changed in another tab
  return () => {
    window.removeEventListener(DISCREET_EVENT, callback);
    window.removeEventListener('storage', callback);
  };
}

/** [on, setOn] for the signed-in account. Every component using it sees the same value. */
export function useDiscreetMode() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const on = useSyncExternalStore(subscribeDiscreet, () => readDiscreet(userId));
  const setOn = useCallback(
    (next) => {
      if (!userId) return;
      try {
        localStorage.setItem(`ml.discreet.${userId}`, next ? '1' : '0');
      } catch {
        discreetMemory.set(userId, next);
      }
      window.dispatchEvent(new Event(DISCREET_EVENT));
    },
    [userId],
  );
  return [on, setOn];
}

/** Mounted once inside the logged-in app: applies the blur, and removes it on logout (landing, login pages). */
export function DiscreetModeEffect() {
  const [on] = useDiscreetMode();
  useEffect(() => {
    try {
      localStorage.removeItem(LEGACY_DISCREET_KEY);
    } catch {
      // nothing to clean
    }
  }, []);
  useEffect(() => {
    if (!on) return undefined;
    document.documentElement.classList.add('discreet');
    // Phones have no hover: a tap on a blurred photo or text reveals it, a second tap hides it again.
    // (A swipe or a scroll is not a tap.)
    let start = null;
    const onDown = (event) => {
      start = { x: event.clientX, y: event.clientY };
    };
    const onTap = (event) => {
      if (event.pointerType === 'mouse' || !start) return;
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) return;
      const target = event.target.closest?.('.private');
      if (target && !target.closest('a, button')) target.classList.toggle('revealed');
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('pointerup', onTap);
    return () => {
      document.documentElement.classList.remove('discreet');
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('pointerup', onTap);
      document.querySelectorAll('.private.revealed').forEach((el) => el.classList.remove('revealed'));
    };
  }, [on]);
  return null;
}
