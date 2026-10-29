import { fmt } from "@/app/lib/format";

const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** Calendar days from `from` to `to` (local days; DST-safe, times of day ignored). */
export function daysFrom(from: Date, to: Date): number {
  return Math.round((midnight(to) - midnight(from)) / 86_400_000);
}

/** "today", "tomorrow", "in 5 days", "yesterday", "3 days ago". */
export function inDays(n: number): string {
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  return n > 1 ? `in ${n} days` : `${-n} days ago`;
}

/** "Oct 19–25", or "Oct 30 – Nov 5" across months; one day is "Oct 19". */
export function fmtSpan(start: Date, end: Date): string {
  if (daysFrom(start, end) === 0) return fmt(start);
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return `${fmt(start)}–${end.getDate()}`;
  }
  return `${fmt(start)} – ${fmt(end)}`;
}
