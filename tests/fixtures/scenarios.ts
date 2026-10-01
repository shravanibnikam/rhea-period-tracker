import type { DailyLog } from "@/domain/types";
import {
  bleedRun,
  makeLog,
  regularCycles,
  irregularCycles,
  singlePeriod,
  emptyHistory,
  withSymptoms,
} from "./logs";

// Domain scenarios: a log fixture plus the other inputs the domain needs to
// evaluate it (the evaluation day and the manual cycle-length override). The
// characterization (golden-master) spec snapshots the extended ones, and the
// timezone / translation invariance properties (E-13) evaluate every one of
// them in several zones and shifted by k days.
//
// `today` is a date KEY, not a Date. The domain receives parseDate(today)
// (local midnight), built in whichever zone the evaluation runs in, so a
// module-level Date (which keeps the instant of the zone it was created in)
// is never reused across zones.

export interface ScenarioInputs {
  /** What the scenario covers. */
  title: string;
  logs: DailyLog[];
  /** The evaluation day, as a YYYY-MM-DD key. */
  today: string;
  cycleLengthOverride: number | null;
}

/** The evaluation day of the original fixtures (= TODAY in ./logs). */
export const TODAY_KEY = "2026-03-30";

/** The original fixtures (./logs), each with the inputs it was characterized with. */
const BASE = {
  regularCycles: {
    title: "three 28-day cycles plus a current period",
    logs: regularCycles,
    today: TODAY_KEY,
    cycleLengthOverride: null,
  },
  irregularCycles: {
    title: "cycles of 26, 31 and 27 days",
    logs: irregularCycles,
    today: TODAY_KEY,
    cycleLengthOverride: null,
  },
  singlePeriod: {
    title: "a single period, no completed cycle",
    logs: singlePeriod,
    today: TODAY_KEY,
    cycleLengthOverride: null,
  },
  emptyHistory: {
    title: "no logs at all",
    logs: emptyHistory,
    today: TODAY_KEY,
    cycleLengthOverride: null,
  },
  withSymptoms: {
    title: "two periods with symptoms",
    logs: withSymptoms,
    today: TODAY_KEY,
    cycleLengthOverride: null,
  },
} satisfies Record<string, ScenarioInputs>;

// E-19: the cases the original fixtures could not see. Each one pins what the
// domain computes on main TODAY, bugs included (a golden master, not a spec),
// so a fix that changes the result moves a snapshot entry.
const EXTENDED = {
  // Every flow other than "none" is a bleed day, so one spotting tap becomes a
  // one-day period that splits a 28-day cycle in two (E-04).
  straySpotting: {
    title: "a stray spotting day in the middle of a regular history",
    logs: [
      ...bleedRun("2026-01-01", 5),
      ...bleedRun("2026-01-29", 5),
      makeLog("2026-02-09", "spotting"),
      ...bleedRun("2026-02-26", 5),
      ...bleedRun("2026-03-26", 5),
    ],
    today: TODAY_KEY,
    cycleLengthOverride: null,
  },
  // A multi-day bleed that starts 18 days after the previous period start:
  // nothing enforces a minimum cycle length (E-04).
  shortGapEpisodes: {
    title: "two bleed episodes under 21 days apart",
    logs: [
      ...bleedRun("2026-01-01", 5),
      ...bleedRun("2026-01-19", 4, "light"),
      ...bleedRun("2026-02-16", 5),
      ...bleedRun("2026-03-16", 5),
    ],
    today: TODAY_KEY,
    cycleLengthOverride: null,
  },
  // A bleed logged 21 days after `today`. The latest period start anchors the
  // current cycle and enters the averages even when it is in the future
  // (E-08).
  futureDatedLog: {
    title: "a bleed log dated after today",
    logs: [...regularCycles, makeLog("2026-04-20", "medium")],
    today: TODAY_KEY,
    cycleLengthOverride: null,
  },
  // Override 18 with a 20-day bleed: anchorsFrom(18, 20), a period longer than
  // the cycle, so the luteal band ends before it starts (E-07). Today is the
  // bleed's last day.
  degenerateAnchor: {
    title: "cycle-length override 18 with a 20-day bleed",
    logs: bleedRun("2026-03-01", 20),
    today: "2026-03-20",
    cycleLengthOverride: 18,
  },
  // The regular history's shape in the Southern-Hemisphere DST season: the
  // 2026-09-21 -> 2026-10-19 cycle spans the spring-forward in Chatham (27 Sep)
  // and in Sydney and Lord Howe (4 Oct), and today follows London's fall-back
  // (25 Oct).
  octoberSouthernDst: {
    title: "28-day cycles across October (Southern-Hemisphere DST)",
    logs: [
      ...bleedRun("2026-07-27", 5),
      ...bleedRun("2026-08-24", 5),
      ...bleedRun("2026-09-21", 5),
      ...bleedRun("2026-10-19", 5),
    ],
    today: "2026-10-28",
    cycleLengthOverride: null,
  },
  // Tracking resumes 300 days after the previous period start, so a 300-day
  // cycle enters the rolling average.
  gap300Days: {
    title: "a 300-day gap between two period starts",
    logs: [
      ...bleedRun("2025-01-06", 5),
      ...bleedRun("2025-02-03", 5),
      ...bleedRun("2025-11-30", 5),
    ],
    today: "2025-12-10",
    cycleLengthOverride: null,
  },
  // A period that starts on 31 December and is still in progress on 1 January
  // (two days logged). The in-progress period also enters avgPeriodLength
  // (E-03).
  yearBoundary: {
    title: "a period in progress across the year boundary",
    logs: [
      ...bleedRun("2025-10-08", 5),
      ...bleedRun("2025-11-05", 5),
      ...bleedRun("2025-12-03", 5),
      ...bleedRun("2025-12-31", 2),
    ],
    today: "2026-01-01",
    cycleLengthOverride: null,
  },
  // Two periods: the smallest history with a cycle length. stdDev needs two
  // lengths, so it is still 0.
  oneCompletedCycle: {
    title: "exactly one completed cycle",
    logs: [...bleedRun("2026-02-02", 5), ...bleedRun("2026-03-02", 5)],
    today: "2026-03-16",
    cycleLengthOverride: null,
  },
  // Three periods (cycles of 28 and 29 days): the smallest history with a
  // non-zero stdDev. Today is day 35, past the predicted date, and the
  // symptoms logged on the overdue days are the ones analyzeSymptomPatterns
  // drops (E-14).
  twoCompletedCycles: {
    title: "exactly two completed cycles, now overdue with symptoms",
    logs: [
      ...bleedRun("2026-01-05", 4),
      ...bleedRun("2026-02-02", 6).map((l, i) => (i < 2 ? { ...l, symptoms: ["Cramps"] } : l)),
      ...bleedRun("2026-03-03", 5),
      makeLog("2026-03-28", "none", { symptoms: ["Bloating"] }),
      makeLog("2026-04-01", "none", { symptoms: ["Cramps", "Bloating"] }),
      makeLog("2026-04-05", "none", { symptoms: ["Bloating"] }),
    ],
    today: "2026-04-06",
    cycleLengthOverride: null,
  },
} satisfies Record<string, ScenarioInputs>;

export type ScenarioId = keyof typeof BASE | keyof typeof EXTENDED;

export interface DomainScenario extends ScenarioInputs {
  /** Stable id, used in test names, snapshot keys and the zone-sweep payload. */
  id: ScenarioId;
}

function listOf(scenarios: Record<string, ScenarioInputs>): DomainScenario[] {
  return Object.entries(scenarios).map(([id, inputs]) => ({ id: id as ScenarioId, ...inputs }));
}

/** The original fixtures, in ./logs order. */
export const BASE_SCENARIOS: DomainScenario[] = listOf(BASE);

/** The E-19 extensions. */
export const EXTENDED_SCENARIOS: DomainScenario[] = listOf(EXTENDED);

/** Every scenario: the original fixtures, then the E-19 extensions. */
export const DOMAIN_SCENARIOS: DomainScenario[] = [...BASE_SCENARIOS, ...EXTENDED_SCENARIOS];
