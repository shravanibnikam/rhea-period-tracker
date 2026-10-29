import { describe, it, expect } from "vitest";
import {
  detectPeriods,
  buildCycles,
  computeAverages,
  getCurrentPhase,
  computeFertileWindow,
  predictFutureCycles,
  deriveCycleState,
  analyzeSymptomPatterns,
  getVariabilityLabel,
} from "@/domain/cycle";
import { parseDate, addDays, diffDays, toDateKey } from "@/domain/dates";
import { getPhaseForDay, getPhaseLengths, anchorsFrom } from "@/domain/phases";
import {
  bleedRun,
  makeLog,
  regularCycles,
  irregularCycles,
  singlePeriod,
  emptyHistory,
  withSymptoms,
  TODAY,
} from "../../fixtures/logs";
import { EXTENDED_SCENARIOS } from "../../fixtures/scenarios";
import { evaluateScenario } from "../../helpers/evaluateScenario";

// Golden-master ("characterization") tests: they lock the CURRENT observable
// behavior of the cycle/phase engine so the Phase-1 refactor (M1.2/M1.3) can
// prove it preserves behavior — or change a snapshot with a documented diff.
// TZ is pinned to UTC (vitest.config.ts) so all date math is reproducible.

describe("period + cycle detection", () => {
  it("detects periods from regular logs", () => {
    expect(detectPeriods(regularCycles)).toMatchSnapshot();
  });

  it("detects periods from irregular logs", () => {
    expect(detectPeriods(irregularCycles)).toMatchSnapshot();
  });

  it("returns no periods for empty history", () => {
    expect(detectPeriods(emptyHistory)).toEqual([]);
  });

  it("builds cycles (current cycle has null length)", () => {
    expect(buildCycles(detectPeriods(regularCycles))).toMatchSnapshot();
  });

  it("marks excluded cycle starts", () => {
    const cycles = buildCycles(detectPeriods(regularCycles), new Set(["2026-01-29"]));
    expect(cycles.find((c) => c.periodStart === "2026-01-29")?.excluded).toBe(true);
  });

  // E-04: a run of bleed days is a period only if it has light, medium or heavy flow.
  it("a spotting day on its own mid-cycle starts no period", () => {
    const logs = [...regularCycles, makeLog("2026-04-12", "spotting")]; // day 18 of the 2026-03-26 cycle
    expect(detectPeriods(logs)).toEqual(detectPeriods(regularCycles));
    const state = deriveCycleState(logs, null, parseDate("2026-04-12"));
    expect(state.cycleDay).toBe(18);
    expect(state.cycles.map((c) => c.cycleLength)).toEqual([28, 28, 28, null]);
  });

  it("spotting just before a period belongs to it", () => {
    const logs = [makeLog("2026-03-01", "spotting"), ...bleedRun("2026-03-02", 4)];
    expect(detectPeriods(logs)).toEqual([{ startDate: "2026-03-01", endDate: "2026-03-05", length: 5 }]);
  });

  it("spotting at a period's end belongs to it, as in the sample flows", () => {
    const flows = ["heavy", "heavy", "medium", "light", "spotting", "spotting"] as const;
    const logs = flows.map((f, i) => makeLog(toDateKey(addDays(parseDate("2026-03-02"), i)), f));
    expect(detectPeriods(logs)).toEqual([{ startDate: "2026-03-02", endDate: "2026-03-07", length: 6 }]);
  });
});

describe("averages", () => {
  it("regular cycles", () => {
    expect(computeAverages(buildCycles(detectPeriods(regularCycles)), null)).toMatchSnapshot();
  });

  it("irregular cycles (non-zero stdDev)", () => {
    expect(computeAverages(buildCycles(detectPeriods(irregularCycles)), null)).toMatchSnapshot();
  });

  it("respects a manual cycle-length override", () => {
    expect(computeAverages(buildCycles(detectPeriods(irregularCycles)), 30)).toMatchSnapshot();
  });
});

describe("phase boundaries (28-day / 5-day config)", () => {
  it("maps cycle days to phases", () => {
    const map = Array.from({ length: 28 }, (_, i) => [i + 1, getCurrentPhase(i + 1, 28, 5)]);
    expect(map).toMatchSnapshot();
  });
});

describe("fertile window + predictions", () => {
  it("computes the fertile window (regular)", () => {
    expect(computeFertileWindow("2026-03-26", 28, 0, 3)).toMatchSnapshot();
  });

  it("widens the fertile window under high variability", () => {
    expect(computeFertileWindow("2026-03-26", 28, 4, 3)).toMatchSnapshot();
  });

  it("returns null with no completed cycles", () => {
    expect(computeFertileWindow("2026-03-26", 28, 0, 0)).toBeNull();
  });

  it("predicts future cycles with widening uncertainty", () => {
    expect(predictFutureCycles("2026-03-26", 28, 2, 4, 3)).toMatchSnapshot();
  });
});

describe("deriveCycleState (full golden master)", () => {
  it("regular history", () => {
    expect(deriveCycleState(regularCycles, null, TODAY)).toMatchSnapshot();
  });

  it("irregular history", () => {
    expect(deriveCycleState(irregularCycles, null, TODAY)).toMatchSnapshot();
  });

  it("single period (no completed cycle)", () => {
    expect(deriveCycleState(singlePeriod, null, TODAY)).toMatchSnapshot();
  });

  it("empty history returns the documented defaults", () => {
    expect(deriveCycleState(emptyHistory, null, TODAY)).toMatchSnapshot();
  });

  it("flags a late period when the predicted date has passed", () => {
    // current period started 2026-01-01; by TODAY it is far overdue
    expect(deriveCycleState(singlePeriod, null, TODAY).isLate).toBe(true);
  });
});

// ── E-19 EXTENDED FIXTURES ─────────────────────────────────────────────────
// The original fixtures contain no spotting day, no gap under 21 days, no
// future-dated log and no degenerate anchor, so fixes to those paths moved no
// snapshot entry. These entries pin what main computes for each case, bugs
// included: a golden master, not a spec. A domain fix that changes a result
// must move its entry (and enumerate it in review); see
// tests/fixtures/scenarios.ts for what each scenario covers.
describe("extended fixtures (E-19)", () => {
  for (const s of EXTENDED_SCENARIOS) {
    it(`${s.id}: ${s.title}`, () => {
      expect(evaluateScenario(s)).toMatchSnapshot();
    });
  }
});

describe("symptom patterns + variability label", () => {
  it("analyzes symptom patterns by phase", () => {
    const cycles = buildCycles(detectPeriods(withSymptoms));
    const { avgCycleLength, avgPeriodLength } = computeAverages(cycles, null);
    expect(analyzeSymptomPatterns(withSymptoms, cycles, avgCycleLength, avgPeriodLength)).toMatchSnapshot();
  });

  it("labels variability by stdDev threshold", () => {
    expect([0, 1.5, 3, 5, 8].map(getVariabilityLabel)).toMatchSnapshot();
  });
});

describe("date utils characterization (TZ-independent invariants preserved by M1.3)", () => {
  it("round-trips date keys, including DST-boundary dates", () => {
    // parseDate builds local midnight; toDateKey reads local components, so the
    // round-trip is stable regardless of TZ/DST. M1.3 must preserve this.
    for (const d of ["2026-01-01", "2026-03-08", "2026-11-01", "2026-12-31"]) {
      expect(toDateKey(parseDate(d))).toBe(d);
    }
  });

  it("adds and diffs whole days", () => {
    expect(toDateKey(addDays(parseDate("2026-03-07"), 3))).toBe("2026-03-10");
    expect(diffDays(parseDate("2026-03-10"), parseDate("2026-03-07"))).toBe(3);
  });

  it("counts calendar days across a DST change (E-01)", () => {
    const tz = process.env.TZ;
    process.env.TZ = "America/Los_Angeles"; // springs forward on 2026-03-08
    try {
      expect(new Date(2026, 0, 1).getTimezoneOffset()).toBe(480); // the zone took effect
      expect(diffDays(parseDate("2026-04-03"), parseDate("2026-03-06"))).toBe(28);
      expect(diffDays(parseDate("2026-03-06"), parseDate("2026-04-03"))).toBe(-28);
      // A time-of-day "now" against a local-midnight start counts as before.
      expect(diffDays(new Date(2026, 3, 2, 0, 30), parseDate("2026-03-06"))).toBe(27);
      expect(diffDays(new Date(2026, 2, 30, 15), parseDate("2026-04-20"))).toBe(-21);

      // Starts 28 days apart: two 28-day cycles, and the period across the change keeps its 5 days.
      const logs = ["2026-02-06", "2026-03-06", "2026-04-03"].flatMap((d) => bleedRun(d, 5));
      const state = deriveCycleState(logs, null, new Date(2026, 3, 10, 15));
      expect(state.cycles.map((c) => [c.cycleLength, c.periodLength])).toEqual([[28, 5], [28, 5], [null, 5]]);
      expect(state.avgCycleLength).toBe(28);
      expect(state.cycleDay).toBe(8);
    } finally {
      process.env.TZ = tz;
    }
  });

  // ── M1.3 DOCUMENTED SNAPSHOT CHANGE ─────────────────────────────────────
  // The legacy engines were DELETED and replaced by the single oracle:
  //   legacy getPhase(d):            1..5 menstrual · 6..13 follicular · 14..16 ovulation · 17+ luteal
  //   oracle  getPhaseForDay(d,28,5): 1..5 menstrual · 6..9  follicular · 10..15 ovulation · 16+ luteal
  //   legacy getPhaseLengths(28):    {menstrual:5, follicular:8, ovulation:3, luteal:12}
  //   oracle  getPhaseLengths(28,5): {menstrual:5, follicular:4, ovulation:6, luteal:13}
  // The oracle matches getCurrentPhase (the canonical engine the hero always
  // used); the deleted helpers were the ones that disagreed with it. Owner and
  // partner segment bars now derive from the SAME boundaries.
  it("documents the oracle replacing the legacy engines (M1.3)", () => {
    const a = anchorsFrom(28, 5);
    expect([1, 5, 6, 13, 14, 16, 17, 28].map((d) => getPhaseForDay(d, a))).toMatchSnapshot();
    expect(getPhaseLengths(a)).toMatchSnapshot();
    // The oracle agrees with getCurrentPhase on every day of the cycle.
    for (let d = 1; d <= 28; d++) {
      expect(getPhaseForDay(d, a)).toBe(getCurrentPhase(d, 28, 5));
    }
  });
});
