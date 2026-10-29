/**
 * Exports (CSV, .ics, clinician summary). Predictions come from the same
 * deriveCycleState call the app makes (useCycleData), so the calendar file
 * shows the dates the app shows.
 */
import { describe, it, expect } from "vitest";
import type { DailyLog } from "@/domain/types";
import { emptyLog } from "@/domain/types";
import { addDays, parseDate, toDateKey } from "@/domain/dates";
import { deriveCycleState } from "@/domain/cycle";
import { parseCSV, parseImportFile } from "@/data/importer";
import { CALENDAR_EVENTS, foldLine, logsToCSV, predictionsToICS, summarizeCycles } from "@/app/lib/exports";

/** `days` bleed days from `start`. */
function period(start: Date, days: number, extra: Partial<DailyLog> = {}): DailyLog[] {
  return Array.from({ length: days }, (_, i) => ({
    ...emptyLog(toDateKey(addDays(start, i))),
    flow: "medium" as const,
    ...extra,
  }));
}

/** Periods starting `lengths` days apart from `first`; returns the logs and each start. */
function history(first: string, lengths: number[], periodDays = 5) {
  const starts = [parseDate(first)];
  for (const n of lengths) starts.push(addDays(starts[starts.length - 1], n));
  return { starts, logs: starts.flatMap((s) => period(s, periodDays)) };
}

const octets = (s: string) => new TextEncoder().encode(s).length;
const unfold = (ics: string) => ics.replace(/\r\n /g, "").split("\r\n");
const values = (ics: string, name: string) =>
  unfold(ics)
    .filter((l) => l.startsWith(name))
    .map((l) => l.slice(l.indexOf(":") + 1));

describe("logsToCSV", () => {
  const logs: DailyLog[] = [
    {
      date: "2026-03-02",
      flow: "heavy",
      symptoms: ["Cramps", "Back pain"],
      mood: "Tearful",
      energy: "low",
      notes: 'Took the day off, "worst" one\nin months',
      medication: [{ name: "Ibuprofen", dose: "400mg", takenAt: "08:30" }, { name: "Heat pad" }],
      intimacy: null,
    },
    { ...emptyLog("2026-03-01"), flow: "spotting", intimacy: { occurred: true, protected: true } },
    { ...emptyLog("2026-03-10"), symptoms: ["Headache"], mood: "Calm", energy: "high", notes: "Café, then bed" },
  ];
  const csv = logsToCSV(logs);

  it("starts with a UTF-8 BOM and ends every record with CRLF", () => {
    expect(csv.startsWith("﻿date,flow,symptoms,mood,energy,medication,intimacy,notes\r\n")).toBe(true);
    expect(csv.endsWith("\r\n")).toBe(true);
    // The only bare LF is the one inside the quoted note.
    expect(csv.replace(/\r\n/g, "").match(/\n/g)).toHaveLength(1);
  });

  it("quotes fields per RFC 4180, joins lists with '; ' and sorts by date", () => {
    const records = csv.slice(1).split("\r\n");
    expect(records[1]).toBe("2026-03-01,spotting,,,,,\"yes, protected\",");
    expect(records[2]).toBe(
      '2026-03-02,heavy,Cramps; Back pain,Tearful,low,Ibuprofen 400mg at 08:30; Heat pad,,' +
        '"Took the day off, ""worst"" one\nin months"'
    );
    expect(records[3]).toBe('2026-03-10,none,Headache,Calm,high,,,"Café, then bed"');
  });

  it("reads back through Rhea's own RFC 4180 parser and CSV import", () => {
    const { headers, rows } = parseCSV(csv);
    expect(headers).toEqual(["date", "flow", "symptoms", "mood", "energy", "medication", "intimacy", "notes"]);
    expect(rows[1][7]).toBe('Took the day off, "worst" one\nin months');

    const imported = parseImportFile(csv, "rhea-logs-2026-03-10.csv");
    expect(imported.source).toBe("generic_csv");
    expect(imported.errors).toEqual([]);
    expect(imported.logs.map((l) => [l.date, l.flow, l.symptoms, l.mood, l.notes])).toEqual([
      ["2026-03-01", "spotting", [], null, ""],
      ["2026-03-02", "heavy", ["Cramps", "Back pain"], "Tearful", 'Took the day off, "worst" one\nin months'],
      ["2026-03-10", "none", ["Headache"], "Calm", "Café, then bed"],
    ]);
  });

  it("is only the header for no logs", () => {
    expect(logsToCSV([])).toBe("﻿date,flow,symptoms,mood,energy,medication,intimacy,notes\r\n");
  });
});

describe("predictionsToICS", () => {
  // Cycles of 28, 30, 27 and 29 days: the weighted average the app predicts with is 29
  // (285/10 = 28.5, rounded). The latest period started 2026-04-25.
  const { logs } = history("2026-01-01", [28, 30, 27, 29]);
  const state = deriveCycleState(logs, null, new Date("2026-05-01T12:00:00Z"));
  const ics = predictionsToICS(state, new Date("2026-05-01T12:00:00Z"));

  it("is null with no period logged", () => {
    expect(predictionsToICS(deriveCycleState([], null))).toBeNull();
  });

  it("has the next six periods as all-day events lasting the average period", () => {
    expect(state.avgCycleLength).toBe(29);
    expect(values(ics!, "DTSTART;VALUE=DATE")).toEqual([
      "20260524", "20260622", "20260721", "20260819", "20260917", "20261016",
    ]);
    expect(values(ics!, "DTEND;VALUE=DATE")[0]).toBe("20260529");
    expect(values(ics!, "SUMMARY")).toEqual(Array(CALENDAR_EVENTS).fill("Period expected (Rhea estimate)"));
    expect(values(ics!, "DTSTAMP")).toEqual(Array(CALENDAR_EVENTS).fill("20260501T120000Z"));
  });

  it("asks for a reminder the day before each event", () => {
    expect(values(ics!, "TRIGGER")).toEqual(Array(CALENDAR_EVENTS).fill("-PT15H"));
    expect(values(ics!, "ACTION")).toEqual(Array(CALENDAR_EVENTS).fill("DISPLAY"));
  });

  it("keeps the same UIDs for the same predictions, whenever it is exported", () => {
    const later = predictionsToICS(state, new Date("2026-05-20T08:00:00Z"));
    expect(values(ics!, "UID")).toEqual([6, 7, 8, 9, 10, 11].map((n) => `rhea-cycle-${n}@rhea`));
    expect(values(later!, "UID")).toEqual(values(ics!, "UID"));
  });

  it("skips a prediction already past (a late period)", () => {
    const late = predictionsToICS(state, new Date("2026-06-01T12:00:00Z"));
    expect(values(late!, "DTSTART;VALUE=DATE")[0]).toBe("20260622");
    expect(values(late!, "DTSTART;VALUE=DATE")).toHaveLength(CALENDAR_EVENTS);
    expect(values(late!, "UID")[0]).toBe("rhea-cycle-7@rhea");
  });

  it("predicts with the user's cycle length override, as the app does", () => {
    const fixed = predictionsToICS(deriveCycleState(logs, 30), new Date("2026-05-01T12:00:00Z"));
    expect(values(fixed!, "DTSTART;VALUE=DATE")[0]).toBe("20260525");
  });

  it("uses CRLF line endings, folds at 75 octets and escapes text", () => {
    expect(ics!.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics!.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics!.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
    const physical = ics!.split("\r\n");
    expect(physical.every((l) => octets(l) <= 75)).toBe(true);
    expect(physical.some((l) => l.startsWith(" "))).toBe(true); // the description folds
    expect(unfold(ics!)).toContain(
      "DESCRIPTION:Estimated by Rhea from your logged cycles (average cycle 29 days\\, period 5 days). " +
        "An estimate\\, not a diagnosis."
    );
    expect(unfold(ics!).filter((l) => l === "BEGIN:VEVENT")).toHaveLength(CALENDAR_EVENTS);
  });
});

describe("foldLine", () => {
  it("never splits a multi-octet character", () => {
    const line = "DESCRIPTION:" + "é".repeat(40) + "😀".repeat(20);
    const folded = foldLine(line);
    const parts = folded.split("\r\n");
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((p) => octets(p) <= 75)).toBe(true);
    expect(parts.slice(1).every((p) => p.startsWith(" "))).toBe(true);
    expect(folded.replace(/\r\n /g, "")).toBe(line);
    for (const p of parts) expect(p).not.toMatch(/[\uD800-\uDBFF]$|^ ?[\uDC00-\uDFFF]/);
  });

  it("leaves a short line alone", () => {
    expect(foldLine("SUMMARY:Period expected (Rhea estimate)")).toBe("SUMMARY:Period expected (Rhea estimate)");
  });
});

describe("summarizeCycles", () => {
  // 14 periods: 13 completed cycles and the one in progress. The summary lists the last 12.
  const lengths = [30, 26, 28, 28, 29, 27, 31, 28, 27, 29, 28, 30, 26];
  const { starts, logs } = history("2025-06-01", lengths);
  const excludedStart = toDateKey(starts[6]); // the 31-day cycle
  const symptomLogs: DailyLog[] = [
    { ...emptyLog(toDateKey(addDays(starts[0], 10))), symptoms: ["Acne"] }, // before the listed cycles
    ...[10, 11, 12].map((i) => ({ ...emptyLog(toDateKey(addDays(starts[i], 12))), symptoms: ["Cramps", "Bloating"] })),
    { ...emptyLog(toDateKey(addDays(starts[13], 1))), flow: "medium" as const, symptoms: ["Headache", "Cramps"] },
  ];
  const all = [...logs.filter((l) => !symptomLogs.some((s) => s.date === l.date)), ...symptomLogs];
  const state = deriveCycleState(all, null, addDays(starts[13], 3), new Set([excludedStart]));
  const summary = summarizeCycles(state.cycles, all);

  it("lists the last 12 cycles, newest first, the excluded one marked", () => {
    expect(state.cycles).toHaveLength(14);
    expect(summary.cycles).toHaveLength(12);
    expect(summary.cycles[0].periodStart).toBe(toDateKey(starts[13]));
    expect(summary.cycles[0].cycleLength).toBeNull();
    expect(summary.cycles[11].periodStart).toBe(toDateKey(starts[2]));
    expect(summary.since).toBe(toDateKey(starts[2]));
    expect(summary.cycles.filter((c) => c.excluded).map((c) => c.periodStart)).toEqual([excludedStart]);
  });

  it("averages completed, counted cycles only: plain mean, range and sample deviation", () => {
    // 28 28 29 27 28 27 29 28 30 26 (the 31 is excluded, the latest has no length yet)
    expect(summary.counted).toBe(10);
    expect(summary.averageCycle).toBe(28);
    expect(summary.shortestCycle).toBe(26);
    expect(summary.longestCycle).toBe(30);
    expect(summary.stdDev).toBeCloseTo(Math.sqrt(12 / 9), 10);
    expect(summary.averagePeriod).toBe(5);
  });

  it("ranks the most-logged symptoms since the oldest listed cycle", () => {
    expect(summary.symptoms).toEqual([
      { name: "Cramps", days: 4 },
      { name: "Bloating", days: 3 },
      { name: "Headache", days: 1 },
    ]);
  });

  it("has nothing to average without completed cycles", () => {
    const empty = summarizeCycles([], []);
    expect(empty).toMatchObject({ cycles: [], counted: 0, averageCycle: null, stdDev: null, since: null, symptoms: [] });
    const one = summarizeCycles(deriveCycleState(period(parseDate("2026-01-01"), 4), null).cycles, []);
    expect(one).toMatchObject({ counted: 0, averageCycle: null, shortestCycle: null, averagePeriod: null });
  });

  it("averages the periods of the counted cycles only, not an excluded one or the one in progress", () => {
    // Periods of 9 (excluded), 3, 3 and 9 days (in progress).
    const starts = ["2026-01-01", "2026-01-29", "2026-02-26", "2026-03-26"].map(parseDate);
    const logs = starts.flatMap((s, i) => period(s, i % 3 === 0 ? 9 : 3));
    const cycles = deriveCycleState(logs, null, parseDate("2026-04-04"), new Set(["2026-01-01"])).cycles;
    expect(summarizeCycles(cycles, logs)).toMatchObject({ counted: 2, averagePeriod: 3 });
  });
});
