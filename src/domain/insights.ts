// domain/insights.ts — the aggregates behind the Insights screen. PURE:
// imports domain modules only; DailyLog and derived cycles in, plain values out.
import type { Cycle, DailyLog, PhaseName } from "./types";
import { ROLLING_AVERAGE_WINDOW } from "./constants";
import { analyzeSymptomPatterns, computeAverages } from "./cycle";
import { PHASE_ORDER } from "./phases";

/** A logged label (a symptom, a mood) and the number of days it was logged on. */
export interface DayCount {
  label: string;
  days: number;
}

/** Most days first; ties in alphabetical order, so the ranking is stable. */
const byDays = (a: DayCount, b: DayCount) => b.days - a.days || a.label.localeCompare(b.label);

export interface CycleStats {
  /** Completed cycles that count toward the averages (not excluded). */
  counted: number;
  /** Completed cycles the person excluded. */
  excluded: number;
  /** The most recent counted cycles that the average, range and stdDev cover. */
  window: number;
  /** Measured from the logs, never from a cycle-length setting; null until a cycle counts. */
  avgCycleLength: number | null;
  stdDev: number;
  shortest: number | null;
  longest: number | null;
  /** Mean over every logged period; null when none is logged. */
  avgPeriodLength: number | null;
  /** Over completed cycles only: the latest period may still be going. */
  shortestPeriod: number | null;
  longestPeriod: number | null;
  confidence: "early" | "building" | "good";
}

function extremes(xs: number[]): [number | null, number | null] {
  return xs.length ? [Math.min(...xs), Math.max(...xs)] : [null, null];
}

/** "How regular am I?": the measured figures, with null wherever there is no data yet. */
export function cycleStats(cycles: Cycle[]): CycleStats {
  // No override: Insights reports what was logged, whatever predictions are set to use.
  const { avgCycleLength, avgPeriodLength, stdDev } = computeAverages(cycles, null);
  const completed = cycles.filter((c) => c.cycleLength !== null);
  const counted = completed.filter((c) => !c.excluded).map((c) => c.cycleLength as number);
  const recent = counted.slice(-ROLLING_AVERAGE_WINDOW); // the same window computeAverages uses
  const [shortest, longest] = extremes(recent);
  const [shortestPeriod, longestPeriod] = extremes(completed.map((c) => c.periodLength));
  return {
    counted: counted.length,
    excluded: completed.length - counted.length,
    window: recent.length,
    avgCycleLength: counted.length ? avgCycleLength : null,
    stdDev,
    shortest,
    longest,
    avgPeriodLength: cycles.length ? avgPeriodLength : null,
    shortestPeriod,
    longestPeriod,
    // Same thresholds as cycle.ts getConfidence (private there).
    confidence: counted.length < 2 ? "early" : counted.length < 4 || stdDev > 5 ? "building" : "good",
  };
}

/** Symptoms ranked by the number of days they were logged on, inside a cycle or not. */
export function mostLoggedSymptoms(logs: DailyLog[], limit = 6): DayCount[] {
  const days = new Map<string, number>();
  for (const log of logs) {
    for (const s of new Set(log.symptoms)) days.set(s, (days.get(s) ?? 0) + 1);
  }
  return [...days].map(([label, n]) => ({ label, days: n })).sort(byDays).slice(0, limit);
}

/**
 * The moods logged most in each phase. A log's mood is put in a phase exactly
 * as analyzeSymptomPatterns puts its symptoms, so the two views agree.
 */
export function moodByPhase(
  logs: DailyLog[],
  cycles: Cycle[],
  avgCycleLength: number,
  avgPeriodLength: number,
  limit = 3
): Record<PhaseName, DayCount[]> {
  const asTags = logs.map((l) => ({ ...l, symptoms: l.mood ? [l.mood] : [] }));
  const moods = analyzeSymptomPatterns(asTags, cycles, avgCycleLength, avgPeriodLength);
  const top = (p: PhaseName) =>
    moods
      .filter((m) => m.byPhase[p] > 0)
      .map((m) => ({ label: m.symptom, days: m.byPhase[p] }))
      .sort(byDays)
      .slice(0, limit);
  return Object.fromEntries(PHASE_ORDER.map((p) => [p, top(p)])) as Record<PhaseName, DayCount[]>;
}
