// domain/cycle.ts — deriveCycleState + all prediction functions. PURE: imports
// kernel/domain only; no I/O, no framework. Moved verbatim from lib/cycle.ts
// (M1.2 / RHEA-024); logic unchanged, verified by the characterization suite.
import type { DailyLog, FlowLevel, PhaseName, Period, Cycle, CycleState, PredictedCycle, FertileWindow } from "./types";
import { DEFAULT_CYCLE_LENGTH, DEFAULT_LUTEAL_LENGTH, ROLLING_AVERAGE_WINDOW } from "./constants";
import { parseDate, addDays, diffDays, toDateKey } from "./dates";
import { anchorsFrom, getOvulationDay, getPhaseForDay } from "./phases";

/**
 * Build the flow patches for a quick-added period: `durationDays` consecutive
 * medium-flow days starting at `startKey` (local calendar days). Only `date` +
 * `flow` are defined, so the merge-defined save keeps any notes, symptoms,
 * mood, etc. already logged on those days (P0-01). Pure — the write path
 * persists them via useLogger.saveMany (M1.3 single write path).
 */
export function buildPeriodLogs(
  startKey: string,
  durationDays: number
): Array<Pick<DailyLog, "date" | "flow">> {
  const start = parseDate(startKey);
  const logs: Array<Pick<DailyLog, "date" | "flow">> = [];
  for (let i = 0; i < durationDays; i++) {
    logs.push({ date: toDateKey(addDays(start, i)), flow: "medium" });
  }
  return logs;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isBleedDay(flow: FlowLevel): boolean {
  return flow !== "none";
}

// ─── Detect periods from daily logs ──────────────────────────────────────────
// Groups consecutive bleed days into runs, with 1-day gap tolerance (a single
// "none" day between two bleed days is treated as part of the same run). A run
// is a period only if it has a light, medium or heavy day (E-04): spotting on
// its own is not a period, while spotting inside or next to real flow belongs
// to that period.

export function detectPeriods(logs: DailyLog[]): Period[] {
  const bleedDays = logs
    .filter((l) => isBleedDay(l.flow))
    .sort((a, b) => a.date.localeCompare(b.date));

  const periods: Period[] = [];
  let run: DailyLog[] = [];
  const closeRun = () => {
    if (!run.some((l) => l.flow !== "spotting")) return;
    const startDate = run[0].date;
    const endDate = run[run.length - 1].date;
    periods.push({ startDate, endDate, length: diffDays(parseDate(endDate), parseDate(startDate)) + 1 });
  };

  for (const day of bleedDays) {
    const prev = run[run.length - 1];
    // Allow a 1-day gap (e.g., spotting → skip → spotting = same run)
    if (prev && diffDays(parseDate(day.date), parseDate(prev.date)) > 2) {
      closeRun();
      run = [];
    }
    run.push(day);
  }
  closeRun();

  return periods;
}

// ─── Build cycles from periods ───────────────────────────────────────────────
// A cycle runs from one period-start to the next period-start.

export function buildCycles(periods: Period[], excludedStarts: Set<string> = new Set()): Cycle[] {
  if (periods.length === 0) return [];

  const cycles: Cycle[] = [];
  for (let i = 0; i < periods.length; i++) {
    const cycleLength =
      i < periods.length - 1
        ? diffDays(parseDate(periods[i + 1].startDate), parseDate(periods[i].startDate))
        : null; // current/latest cycle has no known length yet

    cycles.push({
      periodStart: periods[i].startDate,
      periodEnd: periods[i].endDate,
      periodLength: periods[i].length,
      cycleLength,
      excluded: excludedStarts.has(periods[i].startDate),
    });
  }

  return cycles;
}

// ─── Averages ────────────────────────────────────────────────────────────────

function weightedAverage(values: number[]): number {
  if (values.length === 0) return DEFAULT_CYCLE_LENGTH;

  // More recent cycles get higher weight
  const weights = values.map((_, i) => i + 1);
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const weightedSum = values.reduce((sum, v, i) => sum + v * weights[i], 0);
  return Math.round(weightedSum / totalWeight);
}

function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

export function computeAverages(
  cycles: Cycle[],
  cycleLengthOverride: number | null
): { avgCycleLength: number; avgPeriodLength: number; stdDev: number } {
  // An excluded cycle counts toward no average, its period included.
  const periodLengths = cycles.filter((c) => !c.excluded).map((c) => c.periodLength);
  const avgPeriodLength = periodLengths.length > 0
    ? Math.round(periodLengths.reduce((a, b) => a + b, 0) / periodLengths.length)
    : 5;

  if (cycleLengthOverride) {
    return { avgCycleLength: cycleLengthOverride, avgPeriodLength, stdDev: 0 };
  }

  const completedLengths = cycles
    .filter((c) => c.cycleLength !== null && !c.excluded)
    .map((c) => c.cycleLength as number)
    .slice(-ROLLING_AVERAGE_WINDOW);

  return {
    avgCycleLength: weightedAverage(completedLengths),
    avgPeriodLength,
    stdDev: standardDeviation(completedLengths),
  };
}

// ─── Current cycle state ─────────────────────────────────────────────────────

/**
 * Delegates to the single phase oracle (M1.3). Kept as a named export because
 * it is the historical public API; the algorithm now lives in phases.ts.
 */
export function getCurrentPhase(
  cycleDay: number,
  avgCycleLength: number,
  avgPeriodLength: number
): PhaseName {
  return getPhaseForDay(cycleDay, anchorsFrom(avgCycleLength, avgPeriodLength));
}

// ─── Confidence ──────────────────────────────────────────────────────────────

function getConfidence(
  cycleCount: number,
  stdDev: number
): "early" | "building" | "good" {
  if (cycleCount < 2) return "early";
  if (cycleCount < 4 || stdDev > 5) return "building";
  return "good";
}

// ─── Fertile window ──────────────────────────────────────────────────────────

export function computeFertileWindow(
  currentCycleStart: string,
  avgCycleLength: number,
  stdDev: number,
  cycleCount: number
): FertileWindow | null {
  if (cycleCount < 1) return null;

  const cycleStart = parseDate(currentCycleStart);
  // The phase oracle's ovulation day, so the window ends with the ovulation phase.
  const ovulationDate = addDays(cycleStart, getOvulationDay(avgCycleLength, DEFAULT_LUTEAL_LENGTH) - 1);

  // Base window: ovulation -5 to +1
  let windowStart = -5;
  let windowEnd = 1;

  // Widen when variability is high
  if (stdDev > 2) {
    const extra = Math.round(stdDev - 2);
    windowStart -= extra;
    windowEnd += extra;
  }

  // Confidence: high when low stddev and enough data
  let confidence = 0.8;
  if (cycleCount < 3) confidence = 0.4;
  else if (cycleCount < 5) confidence = 0.6;
  if (stdDev > 3) confidence *= 0.7;
  if (stdDev > 5) confidence *= 0.5;

  const start = addDays(ovulationDate, windowStart);
  return {
    // Never before the cycle's first day: a short cycle's window would start in the previous cycle.
    start: start < cycleStart ? cycleStart : start,
    end: addDays(ovulationDate, windowEnd),
    ovulationDate,
    confidence: Math.round(confidence * 100) / 100,
  };
}

// ─── Predictions ─────────────────────────────────────────────────────────────

export function predictFutureCycles(
  lastPeriodStart: string,
  avgCycleLength: number,
  stdDev: number,
  startCycleNumber: number,
  count: number = 3
): PredictedCycle[] {
  const predictions: PredictedCycle[] = [];
  let nextStart = addDays(parseDate(lastPeriodStart), avgCycleLength);

  for (let i = 0; i < count; i++) {
    const uncertainty = Math.round(stdDev * (1 + i * 0.5)); // widens for further predictions
    predictions.push({
      cycleNumber: startCycleNumber + i,
      start: nextStart,
      end: addDays(nextStart, avgCycleLength - 1),
      uncertainty,
    });
    nextStart = addDays(nextStart, avgCycleLength);
  }

  return predictions;
}

// ─── Full cycle state derivation ─────────────────────────────────────────────

export function deriveCycleState(
  logs: DailyLog[],
  cycleLengthOverride: number | null = null,
  today: Date = new Date(),
  excludedStarts: Set<string> = new Set()
): CycleState {
  const periods = detectPeriods(logs);
  const cycles = buildCycles(periods, excludedStarts);
  const { avgCycleLength, avgPeriodLength, stdDev } = computeAverages(cycles, cycleLengthOverride);

  // If no data yet, return defaults
  if (cycles.length === 0) {
    return {
      cycles: [],
      currentCycleStart: null,
      cycleDay: 0,
      phase: "follicular",
      avgCycleLength,
      avgPeriodLength,
      stdDev: 0,
      daysUntilPeriod: 0,
      nextPeriodDate: null,
      confidence: "early",
      isLate: false,
      predictions: [],
      fertileWindow: null,
    };
  }

  const latestCycle = cycles[cycles.length - 1];
  const currentCycleStart = latestCycle.periodStart;
  const cycleDay = diffDays(today, parseDate(currentCycleStart)) + 1;
  const phase = getCurrentPhase(cycleDay, avgCycleLength, avgPeriodLength);
  const daysUntilPeriod = avgCycleLength - cycleDay;
  const nextPeriodDate = addDays(parseDate(currentCycleStart), avgCycleLength);

  // Delay state: predicted period date has passed with no logged bleed
  const isLate = daysUntilPeriod < 0;

  const predictions = predictFutureCycles(
    currentCycleStart,
    avgCycleLength,
    stdDev,
    cycles.length + 1,
    4
  );

  const completedCount = cycles.filter((c) => c.cycleLength !== null && !c.excluded).length;
  const confidence = getConfidence(completedCount, stdDev);

  const fertileWindow = computeFertileWindow(
    currentCycleStart,
    avgCycleLength,
    stdDev,
    completedCount
  );

  return {
    cycles,
    currentCycleStart,
    cycleDay,
    phase,
    avgCycleLength,
    avgPeriodLength,
    stdDev,
    daysUntilPeriod,
    nextPeriodDate,
    confidence,
    isLate,
    predictions,
    fertileWindow,
  };
}

// ─── Symptom pattern analysis ────────────────────────────────────────────────

export interface SymptomPattern {
  symptom: string;
  totalCount: number;
  byPhase: Record<PhaseName, number>;
  peakPhase: PhaseName;
}

export function analyzeSymptomPatterns(
  logs: DailyLog[],
  cycles: Cycle[],
  avgCycleLength: number,
  avgPeriodLength: number
): SymptomPattern[] {
  if (cycles.length === 0) return [];

  const counts: Record<string, { total: number; byPhase: Record<PhaseName, number> }> = {};

  for (const log of logs) {
    if (log.symptoms.length === 0) continue;

    // Find which cycle this log belongs to
    let cycleDay = 0;
    for (const cycle of cycles) {
      const start = parseDate(cycle.periodStart);
      const logDate = parseDate(log.date);
      const diff = diffDays(logDate, start);
      if (diff >= 0) {
        const len = cycle.cycleLength ?? avgCycleLength;
        if (diff < len) {
          cycleDay = diff + 1;
          break;
        }
      }
    }

    if (cycleDay === 0) continue;

    const phase = getCurrentPhase(cycleDay, avgCycleLength, avgPeriodLength);

    for (const symptom of log.symptoms) {
      if (!counts[symptom]) {
        counts[symptom] = {
          total: 0,
          byPhase: { menstrual: 0, follicular: 0, ovulation: 0, luteal: 0 },
        };
      }
      counts[symptom].total++;
      counts[symptom].byPhase[phase]++;
    }
  }

  return Object.entries(counts)
    .map(([symptom, data]) => {
      const phases: PhaseName[] = ["menstrual", "follicular", "ovulation", "luteal"];
      const peakPhase = phases.reduce((a, b) =>
        data.byPhase[a] >= data.byPhase[b] ? a : b
      );
      return { symptom, totalCount: data.total, byPhase: data.byPhase, peakPhase };
    })
    .sort((a, b) => b.totalCount - a.totalCount);
}

export function getVariabilityLabel(stdDev: number): string {
  if (stdDev <= 1.5) return "Very regular";
  if (stdDev <= 3) return "Regular";
  if (stdDev <= 5) return "Somewhat variable";
  return "Irregular";
}
