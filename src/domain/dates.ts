// domain/dates.ts — pure calendar-date math used by the cycle engine. Moved
// verbatim from lib/utils.ts (M1.2). NOTE: parseDate/toDateKey intentionally
// use LOCAL time — a period logged "2026-07-15" means that calendar day in the
// user's life, not UTC. The known cross-midnight toDateKey inconsistency in
// the WRITE path is fixed in M1.3, not here (unchanged move).
// Presentation formatting (Intl) stays out of domain/ — see lib/utils.ts fmt().

export function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

/**
 * Whole calendar days from `b` to `a`, by their local dates (E-01). Times of
 * day are ignored, so a time-of-day "now" against a local-midnight start
 * counts as before, and a span across a DST change (23- or 25-hour local
 * days) still counts every day once.
 */
export function diffDays(a: Date, b: Date): number {
  const day = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return (day(a) - day(b)) / 86400000;
}

export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
