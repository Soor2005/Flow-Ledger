/**
 * Local-time date helpers for the Predictive Intelligence layer.
 *
 * `Date#toISOString()` is UTC-based — for anyone west of UTC, projecting
 * "tomorrow" via `new Date(now + 86400000).toISOString()` can silently land
 * on the wrong calendar day once local time has passed midnight UTC. This
 * codebase has hit that exact bug class before (see DetailAnalyticsModal's
 * localDateKey); these helpers keep all day-forward math in local time.
 */

export function localISODate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Add `days` to `date` using local calendar arithmetic (handles month/year rollover). */
export function addDaysLocal(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}
