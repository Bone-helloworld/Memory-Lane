import { HttpError } from './errors.js';
import { addDays, parseISODate, toISODate } from '../../shared/dates.js';
import { LIMITS } from '../../shared/limits.js';

/**
 * Tiny form validator. Each reader returns a clean value and records an error code
 * for the field when the input is invalid; check() throws all errors at once:
 *
 *   const v = validator(req.body);
 *   const title = v.text('title', { required: true, max: 120 });
 *   v.check(); // → 400 { error: 'VALIDATION', fields: { title: { code: 'REQUIRED' } } }
 */
export function validator(body) {
  const input = body ?? {};
  const fields = {};

  const fail = (name, code, extra = {}) => {
    fields[name] ??= { code, ...extra };
    return null;
  };

  const raw = (name) => {
    const value = input[name];
    return Array.isArray(value) ? value[0] : value;
  };

  return {
    fail,

    text(name, { required = false, max = 200 } = {}) {
      // Forms send line breaks as \r\n; store plain \n so every client splits paragraphs the same way.
      const value = raw(name) == null ? '' : String(raw(name)).replace(/\r\n?/g, '\n').trim();
      if (required && !value) return fail(name, 'REQUIRED');
      if (value.length > max) return fail(name, 'TOO_LONG', { max });
      return value;
    },

    int(name, { required = false, min = -Infinity, max = Infinity } = {}) {
      const value = raw(name);
      if (value === undefined || value === null || value === '') {
        return required ? fail(name, 'REQUIRED') : null;
      }
      const n = Number(value);
      if (!Number.isInteger(n) || n < min || n > max) return fail(name, 'OUT_OF_RANGE', { min, max });
      return n;
    },

    /** Optional decimal number (e.g. a video's duration in seconds). */
    number(name, { min = -Infinity, max = Infinity } = {}) {
      const value = raw(name);
      if (value === undefined || value === null || value === '') return null;
      const n = Number(value);
      if (!Number.isFinite(n) || n < min || n > max) return fail(name, 'OUT_OF_RANGE', { min, max });
      return n;
    },

    email(name) {
      const value = this.text(name, { required: true, max: LIMITS.email });
      if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return fail(name, 'INVALID_EMAIL');
      return value ? value.toLowerCase() : value;
    },

    /** Passwords are never trimmed: leading/trailing spaces are part of the secret. */
    password(name) {
      const value = raw(name) == null ? '' : String(raw(name));
      if (!value) return fail(name, 'REQUIRED');
      if (value.length < LIMITS.passwordMin) return fail(name, 'TOO_SHORT', { min: LIMITS.passwordMin });
      if (value.length > LIMITS.passwordMax) return fail(name, 'TOO_LONG', { max: LIMITS.passwordMax });
      return value;
    },

    oneOf(name, options, fallback) {
      const value = raw(name);
      if (value === undefined || value === null || value === '') {
        return fallback !== undefined ? fallback : fail(name, 'REQUIRED');
      }
      return options.includes(value) ? value : fail(name, 'INVALID_CHOICE');
    },

    /** Optional 'YYYY-MM-DD' that is a real date and not in the future. */
    pastDate(name) {
      const value = raw(name);
      if (value === undefined || value === null || value === '') return null;
      if (!parseISODate(String(value))) return fail(name, 'INVALID_DATE');
      // One day of slack: the user's "today" may already be tomorrow in UTC.
      if (String(value) > addDays(toISODate(), 1)) return fail(name, 'FUTURE_DATE');
      return String(value);
    },

    url(name, { max = 500 } = {}) {
      const value = this.text(name, { max });
      if (!value) return value;
      try {
        const url = new URL(value);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('protocol');
      } catch {
        return fail(name, 'INVALID_URL');
      }
      return value;
    },

    hasErrors: () => Object.keys(fields).length > 0,

    check() {
      if (Object.keys(fields).length) throw new HttpError(400, 'VALIDATION', fields);
    },
  };
}

/** Accepts [1,2], "[1,2]" or "1,2" (multipart forms send strings) → unique positive ints. */
export function parseIdList(value, max = 50) {
  let list = value;
  if (typeof value === 'string') {
    try {
      list = JSON.parse(value);
    } catch {
      list = value.split(',');
    }
  }
  if (!Array.isArray(list)) return [];
  const ids = list.map(Number).filter((n) => Number.isInteger(n) && n > 0);
  return [...new Set(ids)].slice(0, max);
}

/** Route params like :id → positive integer or 404. */
export function idParam(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(404, 'NOT_FOUND');
  return id;
}
