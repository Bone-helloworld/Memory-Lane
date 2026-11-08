import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { LOCALES } from '@shared/limits.js';
import { fullMonthsBetween, toISODate } from '@shared/dates.js';
import en from './en.js';
import vi from './vi.js';

/*
 * A small, dependency-free i18n layer:
 *   t('album.count', { count: 3 })  → "3 memories" / "3 ký ức"
 * Dictionaries are plain nested objects (en.js, vi.js). A value can be a string or,
 * for words that change with a number, { one, other } chosen by Intl.PluralRules.
 * Dates and numbers always go through Intl, so each language gets its own format.
 */

const DICTIONARIES = { vi, en };
const INTL_LOCALE = { vi: 'vi-VN', en: 'en-US' };
const STORAGE_KEY = 'ml.locale';

/** Native names: a language is always shown in its own words. */
export const LANGUAGE_NAMES = { vi: 'Tiếng Việt', en: 'English' };

function lookup(dictionary, key) {
  return key.split('.').reduce((node, part) => (node == null ? undefined : node[part]), dictionary);
}

export function translate(locale, key, vars) {
  let entry = lookup(DICTIONARIES[locale], key);
  if (entry === undefined) entry = lookup(DICTIONARIES.en, key); // fall back to English
  if (entry === undefined) {
    if (import.meta.env?.DEV) console.warn(`[i18n] missing key "${key}"`);
    return key;
  }
  if (entry && typeof entry === 'object' && typeof vars?.count === 'number') {
    const category = new Intl.PluralRules(INTL_LOCALE[locale]).select(vars.count);
    entry = entry[category] ?? entry.other;
  }
  if (typeof entry !== 'string') return key;
  if (!vars) return entry;
  return entry.replace(/\{(\w+)\}/g, (match, name) => {
    const value = vars[name];
    if (value === undefined || value === null) return match;
    return name === 'count' ? new Intl.NumberFormat(INTL_LOCALE[locale]).format(value) : String(value);
  });
}

function savedLocale() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return LOCALES.includes(value) ? value : null;
  } catch {
    return null;
  }
}

/** True when the visitor picked a language themselves on this device. */
export const hasExplicitLocale = () => savedLocale() !== null;

function detectLocale() {
  const saved = savedLocale();
  if (saved) return saved;
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language ?? ''];
  return languages.some((lang) => lang?.toLowerCase().startsWith('vi')) ? 'vi' : 'en';
}

/** Locale-aware formatters. Calendar dates ('YYYY-MM-DD') are formatted in UTC so they never shift. */
function createFormatters(locale) {
  const intl = INTL_LOCALE[locale];
  const dateFormat = (options) => new Intl.DateTimeFormat(intl, { timeZone: 'UTC', ...options });
  const fromISO = (iso) => {
    const [year, month, day] = iso.split('-').map(Number);
    return Date.UTC(year, month - 1, day);
  };
  const relative = new Intl.RelativeTimeFormat(intl, { numeric: 'auto' });

  return {
    number: (value) => new Intl.NumberFormat(intl).format(value),

    monthName: (month) => dateFormat({ month: 'long' }).format(Date.UTC(2000, month - 1, 1)),

    fullDate: (iso) => dateFormat({ day: 'numeric', month: 'long', year: 'numeric' }).format(fromISO(iso)),

    monthYear: (iso) => dateFormat({ month: 'long', year: 'numeric' }).format(fromISO(iso)),

    /** A memory may know only its year, or year + month, or the full date. */
    memoryDate({ year, month, day }) {
      if (month && day) return dateFormat({ day: 'numeric', month: 'long', year: 'numeric' }).format(Date.UTC(year, month - 1, day));
      if (month) return dateFormat({ month: 'long', year: 'numeric' }).format(Date.UTC(year, month - 1, 1));
      return String(year);
    },

    /** Timestamps from the server (UTC ISO) shown in the viewer's own time zone. */
    timestamp: (iso) => new Intl.DateTimeFormat(intl, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso)),

    /** "20 thg 10, 2026, 21:05" — when the exact moment matters (an invite link expiring). */
    dateTime: (iso) =>
      `${new Intl.DateTimeFormat(intl, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso))}, ` +
      new Intl.DateTimeFormat(intl, { hour: '2-digit', minute: '2-digit' }).format(new Date(iso)),

    /** Whole days until a moment, rounded up: 23 hours left is "1 day left". */
    daysLeft: (iso) => Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000)),

    /** "SUNDAY · 11.10.2026" (vi) / "SUNDAY · OCT 11, 2026" (en) */
    todayLine(date = new Date()) {
      const weekday = new Intl.DateTimeFormat(intl, { weekday: 'long' }).format(date);
      if (locale === 'vi') {
        const pad = (n) => String(n).padStart(2, '0');
        return `${weekday} · ${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`;
      }
      return `${weekday} · ${new Intl.DateTimeFormat(intl, { month: 'short', day: 'numeric', year: 'numeric' }).format(date)}`;
    },

    /** '2021-03-14' → "5 years ago" / "5 năm trước" */
    ago(iso, today = toISODate()) {
      const months = fullMonthsBetween(iso, today);
      if (months >= 12) return relative.format(-Math.floor(months / 12), 'year');
      if (months >= 1) return relative.format(-months, 'month');
      const days = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${iso}T00:00:00Z`)) / 86_400_000);
      return relative.format(-Math.max(0, days), 'day');
    },
  };
}

const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  const [locale, setLocaleState] = useState(detectLocale);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next, { remember = true } = {}) => {
    if (!LOCALES.includes(next)) return;
    setLocaleState(next);
    if (remember) {
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // Private mode / storage disabled: the choice simply lasts for this visit.
      }
    }
  }, []);

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      t: (key, vars) => translate(locale, key, vars),
      ...createFormatters(locale),
    }),
    [locale, setLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used inside <I18nProvider>');
  return context;
}

/** Field error from the API ({ code, max?, min? }) → translated sentence. */
export function fieldMessage(t, error) {
  if (!error) return null;
  return t(`errors.field.${error.code}`, error);
}
