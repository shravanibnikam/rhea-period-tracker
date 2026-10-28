// Landing-page cycle maths, all through Rhea's own engine (domain/cycle). Pure: nothing is stored
// or sent. Two uses: the visitor's estimate (the live thing) and Maya, the sample person whose
// six logged cycles fill the interface fragments with numbers that add up.
import { buildPeriodLogs, computeFertileWindow, deriveCycleState } from "@/domain/cycle";
import { DEFAULT_CYCLE_LENGTH } from "@/domain/constants";
import { addDays, diffDays, parseDate, toDateKey } from "@/domain/dates";
import { emptyLog, type CycleState, type DailyLog, type FertileWindow, type FlowLevel, type PhaseName } from "@/domain/types";

/** Rhea's period length before any history (domain/cycle computeAverages). */
export const PERIOD_LENGTH = 5;
/** The range Settings accepts for a cycle-length override. */
export const MIN_CYCLE = 18;
export const MAX_CYCLE = 45;

/** Local midnight: day counts are calendar days (a time of day would floor one away). */
export function startOfDay(d: Date): Date {
  return parseDate(toDateKey(d));
}

/** The usual cycle length typed by the visitor, or Rhea's default when empty or out of range. */
export function cycleLengthFrom(raw: string): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= MIN_CYCLE && n <= MAX_CYCLE ? n : DEFAULT_CYCLE_LENGTH;
}

export interface Estimate {
  cycleDay: number;
  cycleLength: number;
  phase: PhaseName;
  nextPeriod: Date;
  /** Calendar days from today; negative once the estimate has passed. */
  daysToNext: number;
  fertile: FertileWindow;
}

export type EstimateResult = { estimate: Estimate } | { error: string };

/** null while the date field is empty or half typed. */
export function estimateCycle(startKey: string, cycleLength: number, now: Date): EstimateResult | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startKey)) return null;
  const today = startOfDay(now);
  const ago = diffDays(today, parseDate(startKey));
  if (Number.isNaN(ago)) return null;
  if (ago < 0) return { error: "That date is after today. Pick the first day of your most recent period." };
  if (ago >= cycleLength * 3) {
    return { error: `That was ${ago} days ago. Pick the first day of your most recent period.` };
  }
  const logs = buildPeriodLogs(startKey, PERIOD_LENGTH).map((l) => ({ ...emptyLog(l.date), ...l }));
  const state = deriveCycleState(logs, cycleLength, today);
  const nextPeriod = state.nextPeriodDate as Date; // one period is logged, so it is set
  // computeFertileWindow wants one completed cycle; the visitor's usual length stands in for it.
  const fertile = computeFertileWindow(startKey, state.avgCycleLength, 0, 1) as FertileWindow;
  return {
    estimate: {
      cycleDay: state.cycleDay,
      cycleLength: state.avgCycleLength,
      phase: state.phase,
      nextPeriod,
      daysToNext: diffDays(nextPeriod, today),
      fertile,
    },
  };
}

// ─── Maya, the sample ────────────────────────────────────────────────────────
// Five completed cycles (oldest first) and the current one, which started 17 days before the
// sample day, so she is on day 18. Sample content: listed in the landing report for review.

export const SAMPLE_TODAY = parseDate("2026-10-27");
const CYCLE_LENGTHS = [28, 30, 27, 29, 28];
const PERIOD_DAYS = [5, 5, 6, 5, 4, 5];
const FLOWS: FlowLevel[] = ["heavy", "heavy", "medium", "light", "spotting", "spotting"];
export const SAMPLE_START = addDays(SAMPLE_TODAY, -17);

/** What she logged this cycle besides flow, by days after its first day. */
const EXTRAS: Record<number, Partial<DailyLog>> = {
  0: { symptoms: ["Cramps", "Fatigue", "Back pain"], mood: "Tearful", energy: "low", notes: "Started in the morning." },
  1: { symptoms: ["Cramps", "Bloating"], mood: "Sensitive", energy: "low" },
  2: { symptoms: ["Headache"], mood: "Calm", energy: "medium" },
  9: { symptoms: ["Acne"], mood: "Energetic", energy: "high" },
  14: { symptoms: ["Breast tenderness"], mood: "Focused", energy: "high" },
  17: { symptoms: ["Bloating", "Fatigue"], mood: "Calm", energy: "medium" },
};

function buildSample(): DailyLog[] {
  const starts = [SAMPLE_START];
  for (let i = CYCLE_LENGTHS.length - 1; i >= 0; i--) starts.unshift(addDays(starts[0], -CYCLE_LENGTHS[i]));
  const byDate = new Map<string, DailyLog>();
  const at = (d: Date) => {
    const key = toDateKey(d);
    const log = byDate.get(key) ?? emptyLog(key);
    byDate.set(key, log);
    return log;
  };
  starts.forEach((s, c) => {
    for (let d = 0; d < PERIOD_DAYS[c]; d++) at(addDays(s, d)).flow = FLOWS[d];
  });
  for (const [offset, extra] of Object.entries(EXTRAS)) Object.assign(at(addDays(SAMPLE_START, Number(offset))), extra);
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export const SAMPLE_LOGS: DailyLog[] = buildSample();
export const SAMPLE_STATE: CycleState = deriveCycleState(SAMPLE_LOGS, null, SAMPLE_TODAY);
export const SAMPLE_BY_DATE = new Map(SAMPLE_LOGS.map((l) => [l.date, l]));
