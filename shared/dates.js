// Calendar helpers shared by server and client.
// Dates travel as plain 'YYYY-MM-DD' strings so time zones never shift a birthday by a day.

const pad = (n) => String(n).padStart(2, '0');
const DAY_MS = 86_400_000;

/** Local calendar date of `date` as 'YYYY-MM-DD'. */
export function toISODate(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function isValidDate(year, month, day) {
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

/** 'YYYY-MM-DD' → { year, month, day }, or null when malformed / impossible (e.g. 2021-02-30). */
export function parseISODate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? '');
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  return isValidDate(year, month, day) ? { year, month, day } : null;
}

export function addDays(iso, days) {
  const { year, month, day } = parseISODate(iso);
  const d = new Date(Date.UTC(year, month - 1, day) + days * DAY_MS);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Whole months from `from` to `to` (both 'YYYY-MM-DD'); never negative. */
export function fullMonthsBetween(from, to) {
  const a = parseISODate(from);
  const b = parseISODate(to);
  if (!a || !b) return 0;
  let months = (b.year - a.year) * 12 + (b.month - a.month);
  if (b.day < a.day) months -= 1;
  return Math.max(0, months);
}

export function fullYearsBetween(from, to) {
  return Math.floor(fullMonthsBetween(from, to) / 12);
}

/**
 * Distance in days between two month/day pairs on a circular calendar,
 * so Dec 30 and Jan 2 are 3 days apart. Uses leap year 2000 so Feb 29 is valid.
 */
export function dayOfYearDistance(month1, day1, month2, day2) {
  const dayOfYear = (m, d) => (Date.UTC(2000, m - 1, d) - Date.UTC(2000, 0, 1)) / DAY_MS;
  const diff = Math.abs(dayOfYear(month1, day1) - dayOfYear(month2, day2));
  return Math.min(diff, 366 - diff);
}
