import { beforeAll, describe, expect, it } from "vitest";
import { DOMAIN_SCENARIOS, type ScenarioId } from "../../fixtures/scenarios";
import {
  EXPECTED_OFFSETS,
  SWEEP_ZONES,
  TRANSLATION_SHIFTS,
  diffProjections,
  formatShift,
  measureOffsets,
  projectScenario,
  projectValue,
  shiftProjection,
  shiftScenario,
  type Projection,
  type SweepZone,
  type ZoneSweepPayload,
} from "../../helpers/invariance";
import { runZoneSweep } from "../../helpers/zoneSweep";

// E-13: timezone and translation invariance of everything the domain derives
// (deriveCycleState, the phase oracle on its averages, the variability label
// and the symptom patterns; see tests/helpers/evaluateScenario.ts), over every
// scenario in tests/fixtures/scenarios.ts.
//
// - TZ invariance: in every zone of the matrix, every derived date (as a date
//   key) and every scalar equals the UTC result.
// - Translation invariance: moving every log date and `today` by k days moves
//   every derived date by exactly k days and changes no scalar.
//
// Each zone is evaluated in its own Node process (tests/helpers/zoneSweep.ts).
// The harness block proves each zone took effect, and that the comparison
// sees every derived date and scalar, so the properties cannot pass vacuously
// once the ledgers below are empty. Everything is computed in beforeAll, so a
// property test body can only fail on a property mismatch.

type NonUtcZone = Exclude<SweepZone, "UTC">;
const NON_UTC_ZONES = SWEEP_ZONES.filter((z): z is NonUtcZone => z !== "UTC");

// ─── Committed RED ──────────────────────────────────────────────────────────
// The (zone, scenario) cases in which each property is violated on main. Each
// runs as it.fails, which passes only while the property FAILS; every other
// case is a plain it, a regression guard.
//
// Root cause, as measured: diffDays (src/domain/dates.ts) floors the
// millisecond difference of two local midnights. A span that contains a
// spring-forward is 60 minutes (Lord Howe: 30) short of whole days and loses a
// day; a negative span that contains a fall-back loses one too. Cycle and
// period lengths, cycleDay and the symptom day-of-cycle all go through it.
// UTC and Kolkata have no DST, so every case holds there.
//
// E-01 (civil diffDays) makes every listed case pass, which fails its it.fails:
// E-01 must empty both ledgers, flipping every case to it. If another domain
// change lands first and moves a case, re-measure: RHEA_INVARIANCE_STRICT=1
// runs every case as a plain it and prints each violation.
const KNOWN_TZ_VIOLATIONS: Record<NonUtcZone, readonly ScenarioId[]> = {
  "America/New_York": [
    "regularCycles",
    "irregularCycles",
    "singlePeriod",
    "withSymptoms",
    "straySpotting",
    "shortGapEpisodes",
    "futureDatedLog",
    "degenerateAnchor",
    "oneCompletedCycle",
    "twoCompletedCycles",
  ],
  "Europe/London": [
    "regularCycles",
    "irregularCycles",
    "singlePeriod",
    "withSymptoms",
    "straySpotting",
    "shortGapEpisodes",
    "futureDatedLog",
    "twoCompletedCycles",
  ],
  "Australia/Sydney": ["futureDatedLog", "octoberSouthernDst"],
  "Asia/Kolkata": [],
  "Australia/Lord_Howe": ["futureDatedLog", "octoberSouthernDst"],
  "Pacific/Chatham": ["futureDatedLog", "octoberSouthernDst"],
};
const KNOWN_TRANSLATION_VIOLATIONS: Record<SweepZone, readonly ScenarioId[]> = {
  UTC: [],
  "America/New_York": [
    "regularCycles",
    "irregularCycles",
    "singlePeriod",
    "withSymptoms",
    "straySpotting",
    "shortGapEpisodes",
    "futureDatedLog",
    "degenerateAnchor",
    "octoberSouthernDst",
    "gap300Days",
    "yearBoundary",
    "oneCompletedCycle",
    "twoCompletedCycles",
  ],
  "Europe/London": [
    "regularCycles",
    "irregularCycles",
    "singlePeriod",
    "withSymptoms",
    "straySpotting",
    "shortGapEpisodes",
    "futureDatedLog",
    "octoberSouthernDst",
    "gap300Days",
    "yearBoundary",
    "oneCompletedCycle",
    "twoCompletedCycles",
  ],
  "Australia/Sydney": ["futureDatedLog", "octoberSouthernDst", "gap300Days", "twoCompletedCycles"],
  "Asia/Kolkata": [],
  "Australia/Lord_Howe": ["futureDatedLog", "octoberSouthernDst", "gap300Days", "twoCompletedCycles"],
  "Pacific/Chatham": [
    "regularCycles",
    "irregularCycles",
    "singlePeriod",
    "withSymptoms",
    "straySpotting",
    "shortGapEpisodes",
    "futureDatedLog",
    "octoberSouthernDst",
    "gap300Days",
    "twoCompletedCycles",
  ],
};

const STRICT = process.env.RHEA_INVARIANCE_STRICT === "1";
const caseFor = (knownViolation: boolean) => (knownViolation && !STRICT ? it.fails : it);

interface CaseResult {
  mismatches: string[];
  /** Carried in the assertion message, so every reporter shows each mismatched field. */
  report: string;
}

let sweep: Record<SweepZone, ZoneSweepPayload>;
const tzResults = new Map<string, CaseResult>();
const translationResults = new Map<string, CaseResult>();
const caseKey = (zone: SweepZone, id: ScenarioId) => `${zone} ${id}`;

function caseResult(header: string, mismatches: string[]): CaseResult {
  return { mismatches, report: [header, ...mismatches.map((m) => `  ${m}`)].join("\n") };
}

beforeAll(async () => {
  sweep = await runZoneSweep(SWEEP_ZONES);
  for (const zone of SWEEP_ZONES) {
    for (const s of DOMAIN_SCENARIOS) {
      const result = sweep[zone]?.scenarios[s.id];
      if (!result?.base || TRANSLATION_SHIFTS.some((k) => !result.shifted[String(k)])) {
        throw new Error(`zone sweep: no complete result for ${s.id} in ${zone}`);
      }
    }
  }
  for (const zone of SWEEP_ZONES) {
    for (const s of DOMAIN_SCENARIOS) {
      const result = sweep[zone].scenarios[s.id];
      const tz = diffProjections(sweep.UTC.scenarios[s.id].base, result.base);
      tzResults.set(
        caseKey(zone, s.id),
        caseResult(`TZ invariance: ${s.id} in ${zone} differs from UTC in ${tz.length} field(s)`, tz),
      );
      const failingShifts: string[] = [];
      const translated = TRANSLATION_SHIFTS.flatMap((k) => {
        const lines = diffProjections(shiftProjection(result.base, k), result.shifted[String(k)]);
        if (lines.length > 0) failingShifts.push(formatShift(k));
        return lines.map((line) => `k=${formatShift(k)} ${line}`);
      });
      translationResults.set(
        caseKey(zone, s.id),
        caseResult(
          `translation invariance: ${s.id} in ${zone}, ${translated.length} mismatch(es) for k = ${failingShifts.join(", ")}`,
          translated,
        ),
      );
    }
  }
}, 120_000);

describe("zone sweep harness", () => {
  it("this worker is pinned to UTC, the in-process reference", () => {
    expect(measureOffsets()).toEqual(EXPECTED_OFFSETS.UTC);
  });

  it.each(SWEEP_ZONES)("the %s child ran in that zone (Jan/Jul offsets, before and after evaluating)", (zone) => {
    expect(sweep[zone].tz).toBe(zone);
    expect(sweep[zone].offsets).toEqual({ before: EXPECTED_OFFSETS[zone], after: EXPECTED_OFFSETS[zone] });
  });

  it("the UTC child derives exactly what the domain derives in this process", () => {
    for (const s of DOMAIN_SCENARIOS) {
      expect(sweep.UTC.scenarios[s.id].base, s.id).toEqual(projectScenario(s));
      for (const k of TRANSLATION_SHIFTS) {
        expect(sweep.UTC.scenarios[s.id].shifted[String(k)], `${s.id} k=${formatShift(k)}`).toEqual(
          projectScenario(shiftScenario(s, k)),
        );
      }
    }
  });

  // The guards below keep the properties meaningful once E-01 empties the
  // ledgers: a comparator or projection that saw nothing would otherwise turn
  // every property case green.
  it("the comparison sees every derived date: a one-day shift changes each date leaf", () => {
    for (const s of DOMAIN_SCENARIOS) {
      const base = projectScenario(s);
      const dateLeaves = Object.values(base).filter((leaf) => "date" in leaf).length;
      expect(diffProjections(base, base), s.id).toEqual([]);
      expect(diffProjections(base, shiftProjection(base, 1)), s.id).toHaveLength(dateLeaves);
    }
    const regular = DOMAIN_SCENARIOS.find((s) => s.id === "regularCycles");
    if (!regular) throw new Error("the regularCycles scenario is missing");
    const base = projectScenario(regular);
    expect(Object.keys(base)).toContain("state.nextPeriodDate");
    const lines = diffProjections(base, shiftProjection(base, 1));
    expect(lines.filter((line) => line.startsWith("state.nextPeriodDate: "))).toHaveLength(1);
  });

  it("the comparator reports a changed scalar, a date that became a scalar, and a missing field", () => {
    const p: Projection = {
      "state.cycleDay": { scalar: 5 },
      "state.phase": { scalar: "menstrual" },
      "state.nextPeriodDate": { date: "2026-04-23" },
    };
    expect(diffProjections(p, { ...p, "state.cycleDay": { scalar: 4 } })).toEqual([
      "state.cycleDay: expected 5, got 4",
    ]);
    expect(diffProjections(p, { ...p, "state.phase": { scalar: "luteal" } })).toEqual([
      'state.phase: expected "menstrual", got "luteal"',
    ]);
    expect(diffProjections(p, { ...p, "state.nextPeriodDate": { scalar: null } })).toEqual([
      "state.nextPeriodDate: expected 2026-04-23, got null",
    ]);
    const { "state.cycleDay": _dropped, ...withoutCycleDay } = p;
    expect(diffProjections(p, withoutCycleDay)).toEqual(["state.cycleDay: expected 5, got (absent)"]);
    expect(diffProjections(withoutCycleDay, p)).toEqual(["state.cycleDay: expected (absent), got 5"]);
  });

  it("the projection refuses a Map or a Set instead of flattening it to nothing", () => {
    expect(() => projectValue({ starts: new Set(["2026-01-01"]) })).toThrow("cannot project a Set at starts");
    expect(() => projectValue({ byDay: new Map([["2026-01-01", 1]]) })).toThrow("cannot project a Map at byDay");
    expect(projectValue({ day: new Date(2026, 2, 30), n: 1, keys: ["2026-03-31"] })).toEqual({
      day: { date: "2026-03-30" },
      n: { scalar: 1 },
      "keys.length": { scalar: 1 },
      "keys[0]": { date: "2026-03-31" },
    });
  });
});

describe("TZ invariance: every derived date key and scalar equals the UTC result", () => {
  for (const zone of NON_UTC_ZONES) {
    describe(zone, () => {
      for (const s of DOMAIN_SCENARIOS) {
        caseFor(KNOWN_TZ_VIOLATIONS[zone].includes(s.id))(s.id, () => {
          const r = tzResults.get(caseKey(zone, s.id));
          expect(r?.mismatches.length, r?.report).toBe(0);
        });
      }
    });
  }
});

describe(`translation invariance: shifting every date by k days (k = ${TRANSLATION_SHIFTS.map(formatShift).join(", ")}) shifts every derived date by k and changes no scalar`, () => {
  for (const zone of SWEEP_ZONES) {
    describe(zone, () => {
      for (const s of DOMAIN_SCENARIOS) {
        caseFor(KNOWN_TRANSLATION_VIOLATIONS[zone].includes(s.id))(s.id, () => {
          const r = translationResults.get(caseKey(zone, s.id));
          expect(r?.mismatches.length, r?.report).toBe(0);
        });
      }
    });
  }
});
