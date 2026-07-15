import { describe, it, expect } from "vitest";
// Import from the domain barrel directly (not the lib shims): this spec runs
// in the pure Node environment with no DOM, so it passing proves domain/ has
// no browser/framework dependency (M1.2 / RHEA-024).
import {
  detectPeriods,
  buildCycles,
  deriveCycleState,
  getPhaseForDay,
  getPhaseLengths,
  anchorsFrom,
  parseDate,
  toDateKey,
  PHASES,
  PHASE_ORDER,
  DEFAULT_CYCLE_LENGTH,
  type DailyLog,
} from "@/domain";

const log = (date: string, flow: DailyLog["flow"]): DailyLog => ({
  date,
  flow,
  symptoms: [],
  mood: null,
  energy: null,
  notes: "",
});

describe("domain barrel (pure node env)", () => {
  it("cycle engine works through the domain barrel", () => {
    const logs = [
      log("2026-01-01", "medium"),
      log("2026-01-02", "medium"),
      log("2026-01-29", "medium"),
    ];
    const periods = detectPeriods(logs);
    expect(periods).toHaveLength(2);
    const cycles = buildCycles(periods);
    expect(cycles[0].cycleLength).toBe(28);
    const state = deriveCycleState(logs, parseDate("2026-02-05"));
    expect(state.cycles.length).toBeGreaterThan(0);
  });

  it("phase oracle is exported and consistent", () => {
    const anchors = anchorsFrom(DEFAULT_CYCLE_LENGTH, 5);
    expect(getPhaseForDay(1, anchors)).toBe("menstrual");
    expect(PHASE_ORDER).toHaveLength(4);
    expect(Object.keys(PHASES).sort()).toEqual([...PHASE_ORDER].sort());
    const lengths = getPhaseLengths(anchors);
    expect(lengths.menstrual + lengths.follicular + lengths.ovulation + lengths.luteal).toBe(
      DEFAULT_CYCLE_LENGTH
    );
  });

  it("date round-trip is stable", () => {
    expect(toDateKey(parseDate("2026-07-15"))).toBe("2026-07-15");
  });

  it("no DOM globals were needed to import domain (env sanity)", () => {
    expect(typeof document).toBe("undefined");
    expect(typeof window).toBe("undefined");
  });
});
