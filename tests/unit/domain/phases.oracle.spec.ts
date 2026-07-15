import { describe, it, expect } from "vitest";
import {
  anchorsFrom,
  getPhaseBoundaries,
  getPhaseForDay,
  getPhaseLengths,
  getPhaseRangeLabel,
  PHASE_ORDER,
  type PhaseAnchors,
  type PhaseName,
} from "@/domain/phases";
import { getCurrentPhase, buildPeriodLogs } from "@/domain/cycle";
import { DEFAULT_LUTEAL_LENGTH } from "@/domain/constants";

// Reference implementation: the exact branching of the pre-M1.3
// cycle.getCurrentPhase — the engine the plan promoted as canonical.
function legacyCanonical(day: number, avgCycleLength: number, avgPeriodLength: number): PhaseName {
  if (day <= avgPeriodLength) return "menstrual";
  const ovulationDay = avgCycleLength - DEFAULT_LUTEAL_LENGTH;
  const fertileStart = ovulationDay - 5;
  if (day <= fertileStart) return "follicular";
  if (day <= ovulationDay + 1) return "ovulation";
  return "luteal";
}

const ANCHOR_SETS: Array<[number, number]> = [
  [28, 5],
  [31, 4],
  [24, 6],
  [35, 7],
  [21, 5], // degenerate: fertileStart < avgPeriodLength
];

describe("phase oracle (M1.3)", () => {
  it.each(ANCHOR_SETS)(
    "parity with the canonical engine for cycle=%s period=%s on every day",
    (cycleLen, periodLen) => {
      const a = anchorsFrom(cycleLen, periodLen);
      for (let day = 1; day <= cycleLen + 3; day++) {
        expect(getPhaseForDay(day, a)).toBe(legacyCanonical(day, cycleLen, periodLen));
        expect(getCurrentPhase(day, cycleLen, periodLen)).toBe(getPhaseForDay(day, a));
      }
    }
  );

  it.each(ANCHOR_SETS)(
    "boundaries are contiguous and cover the whole cycle (%s, %s)",
    (cycleLen, periodLen) => {
      const a = anchorsFrom(cycleLen, periodLen);
      const b = getPhaseBoundaries(a);
      expect(b.menstrual.startDay).toBe(1);
      expect(b.follicular.startDay).toBe(b.menstrual.endDay + 1);
      expect(b.ovulation.startDay).toBe(b.follicular.endDay + 1);
      expect(b.luteal.startDay).toBe(b.ovulation.endDay + 1);
      expect(b.luteal.endDay).toBe(cycleLen);
    }
  );

  it("boundaries agree with getPhaseForDay on every in-range day", () => {
    for (const [cycleLen, periodLen] of ANCHOR_SETS) {
      const a = anchorsFrom(cycleLen, periodLen);
      const b = getPhaseBoundaries(a);
      for (const p of PHASE_ORDER) {
        for (let d = b[p].startDay; d <= b[p].endDay; d++) {
          expect(getPhaseForDay(d, a)).toBe(p);
        }
      }
    }
  });

  it("lengths are boundary widths and sum to the cycle length", () => {
    for (const [cycleLen, periodLen] of ANCHOR_SETS) {
      const a = anchorsFrom(cycleLen, periodLen);
      const lengths = getPhaseLengths(a);
      const total =
        lengths.menstrual + lengths.follicular + lengths.ovulation + lengths.luteal;
      expect(total).toBe(cycleLen);
      for (const p of PHASE_ORDER) expect(lengths[p]).toBeGreaterThanOrEqual(0);
    }
  });

  it("degenerate short cycles never produce negative widths", () => {
    const lengths = getPhaseLengths(anchorsFrom(21, 5));
    for (const p of PHASE_ORDER) expect(lengths[p]).toBeGreaterThanOrEqual(0);
    // The old utils.getPhaseLengths gave luteal = 21 - 16 = 5 but follicular 8 +
    // ovulation 3 overflowed the cycle; the oracle stays consistent instead.
  });

  it("range labels derive from boundaries", () => {
    const a: PhaseAnchors = anchorsFrom(28, 5);
    expect(getPhaseRangeLabel("menstrual", a)).toBe("Days 1–5");
    expect(getPhaseRangeLabel("luteal", a)).toBe("Days 16–28");
  });
});

describe("buildPeriodLogs (single write path, M1.3)", () => {
  it("creates consecutive medium-flow logs from the start key", () => {
    const logs = buildPeriodLogs("2026-03-30", 3);
    expect(logs.map((l) => l.date)).toEqual(["2026-03-30", "2026-03-31", "2026-04-01"]);
    expect(logs.every((l) => l.flow === "medium")).toBe(true);
    expect(logs.every((l) => l.symptoms.length === 0 && l.notes === "")).toBe(true);
  });

  it("keys stay on local calendar days across a DST-adjacent range", () => {
    const logs = buildPeriodLogs("2026-03-07", 4);
    expect(logs.map((l) => l.date)).toEqual([
      "2026-03-07",
      "2026-03-08",
      "2026-03-09",
      "2026-03-10",
    ]);
  });
});
