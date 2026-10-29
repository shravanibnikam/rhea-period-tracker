import { describe, it, expect } from "vitest";
import { cycleStats, mostLoggedSymptoms, moodByPhase } from "@/domain/insights";
import { buildCycles, detectPeriods } from "@/domain/cycle";
import type { DailyLog } from "@/domain/types";
import { bleedRun, makeLog, regularCycles, irregularCycles, singlePeriod } from "../../fixtures/logs";

const cyclesOf = (logs: DailyLog[], excluded: string[] = []) =>
  buildCycles(detectPeriods(logs), new Set(excluded));

describe("cycleStats", () => {
  it("has no figures at all without a logged period", () => {
    expect(cycleStats([])).toMatchObject({
      counted: 0,
      excluded: 0,
      window: 0,
      avgCycleLength: null,
      avgPeriodLength: null,
      shortest: null,
      longest: null,
      shortestPeriod: null,
      longestPeriod: null,
      confidence: "early",
    });
  });

  it("one period: no cycle length (never the 28-day default) and no period figures yet", () => {
    const s = cycleStats(cyclesOf(singlePeriod));
    expect(s).toMatchObject({ counted: 0, avgCycleLength: null, avgPeriodLength: null, confidence: "early" });
    expect(s.shortestPeriod).toBeNull(); // the only period belongs to the current cycle
  });

  it("period figures cover completed, counted cycles only, average and range alike", () => {
    // Periods of 9 (excluded), 3, 3 and 9 days (still in progress).
    const logs = ["2026-01-01", "2026-01-29", "2026-02-26", "2026-03-26"].flatMap((d, i) =>
      bleedRun(d, i % 3 === 0 ? 9 : 3)
    );
    const s = cycleStats(cyclesOf(logs, ["2026-01-01"]));
    expect(s).toMatchObject({ avgPeriodLength: 3, shortestPeriod: 3, longestPeriod: 3 });
  });

  it("measures a regular history", () => {
    expect(cycleStats(cyclesOf(regularCycles))).toMatchObject({
      counted: 3,
      window: 3,
      avgCycleLength: 28,
      stdDev: 0,
      shortest: 28,
      longest: 28,
      avgPeriodLength: 5,
      shortestPeriod: 5,
      longestPeriod: 5,
      confidence: "building", // fewer than 4 counted cycles
    });
  });

  it("ranges over the measured cycles and periods of an irregular history", () => {
    const s = cycleStats(cyclesOf(irregularCycles)); // 26 / 31 / 27, periods 6 / 4 / 5 (+5)
    expect([s.shortest, s.longest]).toEqual([26, 31]);
    expect([s.shortestPeriod, s.longestPeriod]).toEqual([4, 6]);
    expect(s.stdDev).toBeGreaterThan(2);
  });

  it("an excluded cycle is reported but leaves the average and range", () => {
    const s = cycleStats(cyclesOf(irregularCycles, ["2026-01-27"])); // drops the 31
    expect(s).toMatchObject({ counted: 2, excluded: 1, shortest: 26, longest: 27 });
  });

  it("covers the same recent window as the average (the last six counted cycles)", () => {
    // Eight cycles: a 40-day one first, then seven of 28 days.
    const starts = ["2025-01-01", "2025-02-10", "2025-03-10", "2025-04-07", "2025-05-05", "2025-06-02", "2025-06-30", "2025-07-28", "2025-08-25"];
    const s = cycleStats(cyclesOf(starts.flatMap((d) => bleedRun(d, 4))));
    expect(s).toMatchObject({ counted: 8, window: 6, shortest: 28, longest: 28, avgCycleLength: 28, confidence: "good" });
  });

  it("says 'building' while cycles vary by more than five days", () => {
    const starts = ["2025-01-01", "2025-01-23", "2025-03-05", "2025-03-27", "2025-05-08"]; // 22 / 41 / 22 / 42
    expect(cycleStats(cyclesOf(starts.flatMap((d) => bleedRun(d, 4)))).confidence).toBe("building");
  });
});

describe("mostLoggedSymptoms", () => {
  const logs = [
    makeLog("2026-01-01", "medium", { symptoms: ["Cramps", "Fatigue"] }),
    makeLog("2026-01-02", "medium", { symptoms: ["Cramps", "Cramps"] }), // counted once that day
    makeLog("2026-01-10", "none", { symptoms: ["Acne", "Fatigue"] }),
    makeLog("2026-01-11", "none", { symptoms: ["Headache"] }),
  ];

  it("ranks by days logged, ties alphabetically", () => {
    expect(mostLoggedSymptoms(logs)).toEqual([
      { label: "Cramps", days: 2 },
      { label: "Fatigue", days: 2 },
      { label: "Acne", days: 1 },
      { label: "Headache", days: 1 },
    ]);
  });

  it("keeps only the top entries, and is empty with nothing logged", () => {
    expect(mostLoggedSymptoms(logs, 1)).toEqual([{ label: "Cramps", days: 2 }]);
    expect(mostLoggedSymptoms([makeLog("2026-01-01")])).toEqual([]);
  });
});

describe("moodByPhase", () => {
  // Periods on Jan 1 and Jan 29 (5 days each): days 1–5 are menstrual.
  const base = regularCycles.slice(0, 10);
  const mood = (date: string, m: string) => makeLog(date, "none", { mood: m });
  const logs: DailyLog[] = [
    ...base.map((l, i) => (i === 0 || i === 1 ? { ...l, mood: "Tired" } : i === 5 ? { ...l, mood: "Calm" } : l)),
    mood("2026-01-12", "Happy"), // day 12: ovulation
    mood("2026-01-24", "Irritable"), // day 24: luteal
    mood("2026-01-25", "Irritable"),
    mood("2026-01-26", "Anxious"),
    mood("2025-12-20", "Happy"), // before the first period: in no cycle
  ];
  const cycles = cyclesOf(logs);

  it("puts each mood in its phase, most days first", () => {
    const byPhase = moodByPhase(logs, cycles, 28, 5);
    expect(byPhase.menstrual).toEqual([
      { label: "Tired", days: 2 },
      { label: "Calm", days: 1 },
    ]);
    expect(byPhase.ovulation).toEqual([{ label: "Happy", days: 1 }]);
    expect(byPhase.luteal).toEqual([
      { label: "Irritable", days: 2 },
      { label: "Anxious", days: 1 },
    ]);
    expect(byPhase.follicular).toEqual([]);
  });

  it("limits each phase, and is empty without cycles", () => {
    expect(moodByPhase(logs, cycles, 28, 5, 1).luteal).toEqual([{ label: "Irritable", days: 2 }]);
    expect(moodByPhase(logs, [], 28, 5)).toEqual({ menstrual: [], follicular: [], ovulation: [], luteal: [] });
  });
});
