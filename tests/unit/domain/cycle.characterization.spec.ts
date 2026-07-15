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
  regularCycles,
  irregularCycles,
  singlePeriod,
  emptyHistory,
  withSymptoms,
  TODAY,
} from "../../fixtures/logs";

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
