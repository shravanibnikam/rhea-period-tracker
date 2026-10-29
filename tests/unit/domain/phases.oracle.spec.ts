import { describe, it, expect } from "vitest";
import {
  anchorsFrom,
  getOvulationDay,
  getPhaseBoundaries,
  getPhaseForDay,
  getPhaseLengths,
  getPhaseRangeLabel,
  PHASE_ORDER,
  type PhaseAnchors,
  type PhaseName,
} from "@/domain/phases";
import { getCurrentPhase, buildPeriodLogs, computeFertileWindow } from "@/domain/cycle";
import { diffDays, parseDate, toDateKey } from "@/domain/dates";
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
  });

  it("defines only date + flow, so a merge-defined save keeps every other field (P0-01)", () => {
    expect(buildPeriodLogs("2026-03-30", 2)).toEqual([
      { date: "2026-03-30", flow: "medium" },
      { date: "2026-03-31", flow: "medium" },
    ]);
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

describe("short cycles: labels and the fertile window follow getPhaseForDay", () => {
  const PERIOD = 5;
  // Normal cycles (25 days and up) keep their exact labels; shorter ones squeeze phases out.
  const EXPECTED: Record<number, Record<PhaseName, string>> = {
    18: { menstrual: "Days 1–5", follicular: "No days", ovulation: "No days", luteal: "Days 6–18" },
    21: { menstrual: "Days 1–5", follicular: "No days", ovulation: "Days 6–8", luteal: "Days 9–21" },
    24: { menstrual: "Days 1–5", follicular: "No days", ovulation: "Days 6–11", luteal: "Days 12–24" },
    28: { menstrual: "Days 1–5", follicular: "Days 6–9", ovulation: "Days 10–15", luteal: "Days 16–28" },
    35: { menstrual: "Days 1–5", follicular: "Days 6–16", ovulation: "Days 17–22", luteal: "Days 23–35" },
  };

  it.each(Object.keys(EXPECTED).map(Number))("%s-day cycle: exact labels", (len) => {
    const a = anchorsFrom(len, PERIOD);
    for (const p of PHASE_ORDER) expect(getPhaseRangeLabel(p, a)).toBe(EXPECTED[len][p]);
  });

  it("every label is exactly the days getPhaseForDay gives that phase, 18 to 45 days", () => {
    for (let len = 18; len <= 45; len++) {
      const a = anchorsFrom(len, PERIOD);
      for (const p of PHASE_ORDER) {
        const days = Array.from({ length: len }, (_, i) => i + 1).filter((d) => getPhaseForDay(d, a) === p);
        expect(getPhaseRangeLabel(p, a)).toBe(days.length ? `Days ${days[0]}–${days[days.length - 1]}` : "No days");
      }
    }
  });

  it("the fertile window starts no earlier than the cycle and ends with the ovulation phase, 18 to 45 days", () => {
    const start = "2026-03-02";
    const cycleDay = (d: Date) => diffDays(d, parseDate(start)) + 1;
    for (let len = 18; len <= 45; len++) {
      const a = anchorsFrom(len, PERIOD);
      const ov = getPhaseBoundaries(a).ovulation;
      const fw = computeFertileWindow(start, len, 0, 1)!;
      // Within the ovulation phase plus the 5 days before it, never before day 1 or in the luteal phase.
      expect(cycleDay(fw.start)).toBe(Math.max(1, getOvulationDay(len) - 5));
      expect(cycleDay(fw.start)).toBeGreaterThanOrEqual(Math.max(1, ov.startDay - 5));
      expect(cycleDay(fw.end)).toBe(getOvulationDay(len) + 1);
      expect(cycleDay(fw.end)).toBeLessThanOrEqual(Math.max(ov.endDay, PERIOD));
      expect(getPhaseForDay(cycleDay(fw.end), a)).not.toBe("luteal");
      expect(cycleDay(fw.ovulationDate)).toBe(getOvulationDay(len));
    }
  });

  it("an 18-day cycle's window no longer starts before its period", () => {
    const fw = computeFertileWindow("2026-03-02", 18, 0, 1)!;
    expect(toDateKey(fw.start)).toBe("2026-03-02");
    expect(toDateKey(fw.end)).toBe("2026-03-06");
  });
});
