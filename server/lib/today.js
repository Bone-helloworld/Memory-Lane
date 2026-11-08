import { parseISODate, toISODate } from '../../shared/dates.js';

/**
 * "Today" as the user sees it. The browser sends its local date (?today=2026-10-11)
 * because a server in UTC and a user in Vietnam (UTC+7) disagree for 7 hours a day.
 * Anything malformed or more than a day away from the server clock is ignored.
 */
export function clientToday(value) {
  const serverToday = toISODate();
  if (typeof value !== 'string' || !parseISODate(value)) return serverToday;
  const diffDays = Math.abs(Date.parse(`${value}T00:00:00Z`) - Date.parse(`${serverToday}T00:00:00Z`)) / 86_400_000;
  return diffDays <= 1 ? value : serverToday;
}
