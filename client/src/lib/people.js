import { fullMonthsBetween, toISODate } from '@shared/dates.js';

/**
 * How long since you were last in touch → which label and colour to show.
 * tone: long (≥3 years, teal) · mid (6 months–3 years, amber) · soft (1–6 months)
 *       recent (< 1 month) · none (never logged)
 */
export function contactStatus(lastContact, today = toISODate()) {
  if (!lastContact) return { tone: 'none', key: 'people.status.none' };
  const months = fullMonthsBetween(lastContact, today);
  if (months >= 12) {
    const years = Math.floor(months / 12);
    return { tone: years >= 3 ? 'long' : 'mid', key: 'people.status.years', count: years };
  }
  if (months >= 1) return { tone: months >= 6 ? 'mid' : 'soft', key: 'people.status.months', count: months };
  return { tone: 'recent', key: 'people.status.recent' };
}

/** "Thu Hà" → "TH", "An" → "AN" */
export function initials(name = '') {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  const letters = words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[words.length - 1][0];
  return letters.toLocaleUpperCase('vi');
}

const SORTERS = {
  longest: (a, b) =>
    (a.lastContact === null) - (b.lastContact === null) ||
    String(a.lastContact).localeCompare(String(b.lastContact)) ||
    a.name.localeCompare(b.name, 'vi'),
  name: (a, b) => a.name.localeCompare(b.name, 'vi'),
  recent: (a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id,
};

export function sortPeople(people, by) {
  return [...people].sort(SORTERS[by] ?? SORTERS.longest);
}
