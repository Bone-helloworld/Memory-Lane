import { createContext, useCallback, useContext, useMemo, useState } from 'react';

/*
 * Two complete looks for the same app, switchable at any time:
 *   notebook — "Sổ tay ký ức": white paper, ballpoint blue, prints taped into a journal
 *   darkroom — "Phòng tối":    charcoal, safelight red, contact sheets and edge printing
 * The choice is stored on this device only. public/theme-init.js applies it before the first
 * paint; this provider keeps React and <html data-theme> in sync afterwards.
 */
export const THEMES = ['notebook', 'darkroom'];
const STORAGE_KEY = 'ml.theme';
const THEME_COLOR = { notebook: '#f6f1e6', darkroom: '#121110' };

const ThemeContext = createContext(null);

function currentTheme() {
  const value = document.documentElement.dataset.theme;
  return THEMES.includes(value) ? value : 'notebook';
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(currentTheme);

  const setTheme = useCallback((next) => {
    if (!THEMES.includes(next)) return;
    document.documentElement.dataset.theme = next;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[next]);
    document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', next === 'darkroom' ? 'dark' : 'only light');
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // private mode: the choice lasts for this visit
    }
    setThemeState(next);
  }, []);

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside <ThemeProvider>');
  return context;
}
