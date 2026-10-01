import { toDateKey } from "@/domain/dates";
import type { DomainScenario } from "../fixtures/scenarios";
import { evaluateScenario } from "./evaluateScenario";

// Shared by the invariance spec (tests/unit/domain/invariance.spec.ts) and the
// zone-sweep child process (./zoneSweepChild.ts). Pure: no I/O.

/** The zone matrix (E-13). Lord Howe (30-minute DST) and Chatham (+12:45/+13:45) are deliberate. */
export const SWEEP_ZONES = [
  "UTC",
  "America/New_York",
  "Europe/London",
  "Australia/Sydney",
  "Asia/Kolkata",
  "Australia/Lord_Howe",
  "Pacific/Chatham",
] as const;
export type SweepZone = (typeof SWEEP_ZONES)[number];

export interface ZoneOffsets {
  /** new Date(2026, 0, 15).getTimezoneOffset(): minutes, positive WEST of UTC. */
  jan: number;
  /** new Date(2026, 6, 15).getTimezoneOffset(). */
  jul: number;
}

/** The offsets each zone must show, proving the zone took effect. */
export const EXPECTED_OFFSETS: Record<SweepZone, ZoneOffsets> = {
  UTC: { jan: 0, jul: 0 },
  "America/New_York": { jan: 300, jul: 240 }, // UTC-5 / UTC-4
  "Europe/London": { jan: 0, jul: -60 }, // UTC+0 / UTC+1
  "Australia/Sydney": { jan: -660, jul: -600 }, // UTC+11 / UTC+10
  "Asia/Kolkata": { jan: -330, jul: -330 }, // UTC+5:30, no DST
  "Australia/Lord_Howe": { jan: -660, jul: -630 }, // UTC+11 / UTC+10:30
  "Pacific/Chatham": { jan: -825, jul: -765 }, // UTC+13:45 / UTC+12:45
};

export function measureOffsets(): ZoneOffsets {
  return {
    jan: new Date(2026, 0, 15).getTimezoneOffset(),
    jul: new Date(2026, 6, 15).getTimezoneOffset(),
  };
}

/**
 * Shifts (in days) for the translation property. Applied to the 2025-2026
 * fixtures they cross every zone's DST transitions in both directions, month
 * ends, the year boundary (+1 on 31 Dec, +365, -300) and a leap day
 * (+730 crosses 2028-02-29).
 */
export const TRANSLATION_SHIFTS = [1, -1, 7, 31, 100, 183, 365, -300, 730] as const;

export const formatShift = (k: number) => (k > 0 ? `+${k}` : String(k));

// ─── Projection ──────────────────────────────────────────────────────────────

export type Scalar = string | number | boolean | null;
/** One derived value: a calendar date (as a date key) or anything else. */
export type Leaf = { date: string } | { scalar: Scalar };
/** Every value derived for one evaluation, flattened to `path -> leaf`. */
export type Projection = Record<string, Leaf>;

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Evaluates a scenario and flattens the result. Dates become date keys
 * (toDateKey, in the current zone): CycleState carries local-midnight Dates
 * whose UTC instants legitimately differ by zone, so instants are never
 * compared. Strings shaped like date keys (period starts and ends) are dates;
 * every other value is a scalar.
 */
export function projectScenario(s: DomainScenario): Projection {
  const out: Projection = {};
  flatten(evaluateScenario(s), "", out);
  return out;
}

function flatten(value: unknown, path: string, out: Projection): void {
  if (value instanceof Date) {
    out[path] = Number.isNaN(value.getTime()) ? { scalar: "Invalid Date" } : { date: toDateKey(value) };
  } else if (typeof value === "string") {
    out[path] = DATE_KEY.test(value) ? { date: value } : { scalar: value };
  } else if (typeof value === "number") {
    // JSON (the child-process transport) has no NaN or Infinity.
    out[path] = { scalar: Number.isFinite(value) ? value : String(value) };
  } else if (typeof value === "boolean" || value === null) {
    out[path] = { scalar: value };
  } else if (value === undefined) {
    out[path] = { scalar: "undefined" };
  } else if (Array.isArray(value)) {
    out[`${path}.length`] = { scalar: value.length };
    value.forEach((item, i) => flatten(item, `${path}[${i}]`, out));
  } else if (typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      flatten(item, path ? `${path}.${key}` : key, out);
    }
  } else {
    throw new Error(`cannot project a ${typeof value} at ${path}`);
  }
}

// ─── Translation ─────────────────────────────────────────────────────────────

/** Civil-calendar shift of a YYYY-MM-DD key by k days. UTC arithmetic: independent of the local zone. */
export function shiftDateKey(key: string, k: number): string {
  if (!DATE_KEY.test(key)) throw new Error(`not a date key: ${key}`);
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + k)).toISOString().slice(0, 10);
}

/** The scenario with every log date and `today` moved k days; nothing else changes. */
export function shiftScenario(s: DomainScenario, k: number): DomainScenario {
  return {
    ...s,
    logs: s.logs.map((log) => ({ ...log, date: shiftDateKey(log.date, k) })),
    today: shiftDateKey(s.today, k),
  };
}

/** What the translation property predicts: every date moved k days, every scalar unchanged. */
export function shiftProjection(p: Projection, k: number): Projection {
  return Object.fromEntries(
    Object.entries(p).map(([path, leaf]) => [
      path,
      "date" in leaf ? { date: shiftDateKey(leaf.date, k) } : leaf,
    ]),
  );
}

// ─── Comparison ──────────────────────────────────────────────────────────────

const has = (p: Projection, path: string) => Object.prototype.hasOwnProperty.call(p, path);
const render = (leaf: Leaf) => ("date" in leaf ? leaf.date : JSON.stringify(leaf.scalar));

/** One line per path whose value differs ("path: expected X, got Y"); empty when equal. */
export function diffProjections(expected: Projection, actual: Projection): string[] {
  const paths = [...Object.keys(expected), ...Object.keys(actual).filter((p) => !has(expected, p))];
  const lines: string[] = [];
  for (const path of paths) {
    const e = has(expected, path) ? render(expected[path]) : "(absent)";
    const a = has(actual, path) ? render(actual[path]) : "(absent)";
    if (e !== a) lines.push(`${path}: expected ${e}, got ${a}`);
  }
  return lines;
}

// ─── Child-process payload ───────────────────────────────────────────────────

/** Prefix of the single stdout line carrying a child's JSON payload. */
export const ZONE_SWEEP_MARKER = "RHEA_ZONE_SWEEP_PAYLOAD ";

export interface ScenarioSweep {
  base: Projection;
  /** Keyed by String(k), for every k in TRANSLATION_SHIFTS. */
  shifted: Record<string, Projection>;
}

export interface ZoneSweepPayload {
  /** process.env.TZ as the child saw it. */
  tz: string | null;
  /** Offsets measured before and after evaluating the scenarios. */
  offsets: { before: ZoneOffsets; after: ZoneOffsets };
  /** Keyed by scenario id. */
  scenarios: Record<string, ScenarioSweep>;
}
