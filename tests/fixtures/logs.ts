import type { DailyLog } from "@/domain/types";
import { parseDate, addDays, toDateKey } from "@/domain/dates";

// Deterministic DailyLog fixtures for domain characterization + future tests.
// Dates run Jan–Mar 2026 and deliberately span the US spring-forward date
// (2026-03-08); tests pin TZ=UTC so behavior is reproducible.

export function makeLog(
  date: string,
  flow: DailyLog["flow"] = "medium",
  extra: Partial<DailyLog> = {},
): DailyLog {
  return { date, flow, symptoms: [], mood: null, energy: null, notes: "", ...extra };
}

/** Consecutive bleed days starting at `start` (inclusive). */
export function bleedRun(
  start: string,
  days: number,
  flow: DailyLog["flow"] = "medium",
): DailyLog[] {
  const out: DailyLog[] = [];
  for (let i = 0; i < days; i++) {
    out.push(makeLog(toDateKey(addDays(parseDate(start), i)), flow));
  }
  return out;
}

/** Three clean 28-day cycles (5-day periods) plus a current period. */
export const regularCycles: DailyLog[] = [
  ...bleedRun("2026-01-01", 5),
  ...bleedRun("2026-01-29", 5),
  ...bleedRun("2026-02-26", 5),
  ...bleedRun("2026-03-26", 5),
];

/** Cycle lengths 26 / 31 / 27 days → non-zero stdDev, exercises widened windows. */
export const irregularCycles: DailyLog[] = [
  ...bleedRun("2026-01-01", 6),
  ...bleedRun("2026-01-27", 4),
  ...bleedRun("2026-02-27", 5),
  ...bleedRun("2026-03-26", 5),
];

/** A single period → one cycle with unknown length (no prediction basis). */
export const singlePeriod: DailyLog[] = [...bleedRun("2026-01-01", 5)];

/** No history at all. */
export const emptyHistory: DailyLog[] = [];

/** Two periods with symptoms, for analyzeSymptomPatterns. */
export const withSymptoms: DailyLog[] = [
  ...bleedRun("2026-01-01", 5).map((l, i) =>
    i < 2 ? { ...l, symptoms: ["Cramps", "Fatigue"] } : l,
  ),
  makeLog("2026-01-15", "none", { symptoms: ["Headache"] }),
  ...bleedRun("2026-01-29", 5).map((l, i) =>
    i < 1 ? { ...l, symptoms: ["Cramps"] } : l,
  ),
];

/** Fixed "today" used across characterization so results are deterministic. */
export const TODAY = parseDate("2026-03-30");
