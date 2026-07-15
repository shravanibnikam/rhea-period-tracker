/**
 * domain/hlc.ts — Hybrid Logical Clock, PURE (M1.6 / spec §0.5, Sync ch. §3).
 *
 * Format: "<pt>:<c>:<deviceId>"
 *   pt = 48-bit physical ms since epoch, zero-padded lowercase hex (12 chars)
 *   c  = 16-bit logical counter, zero-padded lowercase hex (4 chars)
 *   deviceId = stable per-device id, tiebreak only
 *
 * Lexicographic string order == causal order on (pt, c), with deviceId as a
 * deterministic total-order tiebreak. All functions are pure: clock state is
 * passed in and returned; the stateful engine wrapper (persistence, Date.now)
 * lives in src/sync (M1.8).
 */

import { ErrorCode, rheaError } from "@/kernel";

export interface HlcState {
  /** Last physical ms used in a stamp. */
  pt: number;
  /** Logical counter within that ms. */
  c: number;
}

export const HLC_INITIAL_STATE: HlcState = { pt: 0, c: 0 };

/** Max counter before spilling into the next millisecond (16-bit). */
export const HLC_MAX_COUNTER = 0xffff;

/**
 * A remote pt further than this ahead of local wall-clock is clamped, so a
 * corrupt/malicious future timestamp cannot poison the clock forever.
 */
export const HLC_MAX_DRIFT_MS = 24 * 60 * 60 * 1000;

const PT_HEX_LEN = 12;
const C_HEX_LEN = 4;
const HLC_RE = /^[0-9a-f]{12}:[0-9a-f]{4}:(.+)$/;

export function encodeHlc(pt: number, c: number, deviceId: string): string {
  return `${pt.toString(16).padStart(PT_HEX_LEN, "0")}:${c
    .toString(16)
    .padStart(C_HEX_LEN, "0")}:${deviceId}`;
}

export interface DecodedHlc {
  pt: number;
  c: number;
  deviceId: string;
}

export function decodeHlc(hlc: string): DecodedHlc {
  const m = HLC_RE.exec(hlc);
  if (!m) {
    throw rheaError(ErrorCode.INVARIANT, "Malformed HLC string", {
      context: { length: hlc.length },
    });
  }
  return {
    pt: parseInt(hlc.slice(0, PT_HEX_LEN), 16),
    c: parseInt(hlc.slice(PT_HEX_LEN + 1, PT_HEX_LEN + 1 + C_HEX_LEN), 16),
    deviceId: m[1],
  };
}

export function isValidHlc(hlc: string): boolean {
  return HLC_RE.test(hlc);
}

/** Epoch-0 sentinel — backfilled pre-v2 rows never win a merge (§0.5). */
export function epochZeroHlc(deviceId: string): string {
  return encodeHlc(0, 0, deviceId);
}

/** Compare by (pt, c, deviceId) — equals lexicographic order of the strings. */
export function compareHlc(a: string, b: string): number {
  const da = decodeHlc(a);
  const db = decodeHlc(b);
  if (da.pt !== db.pt) return da.pt < db.pt ? -1 : 1;
  if (da.c !== db.c) return da.c < db.c ? -1 : 1;
  return da.deviceId < db.deviceId ? -1 : da.deviceId > db.deviceId ? 1 : 0;
}

export interface StampResult {
  state: HlcState;
  hlc: string;
}

/**
 * Stamp a new local mutation at wall-clock `physicalMs` (spec §3.2):
 * never goes backwards; same-ms edits bump the counter; counter overflow
 * spills into the next millisecond.
 */
export function hlcNow(
  state: HlcState,
  physicalMs: number,
  deviceId: string
): StampResult {
  let pt = Math.max(physicalMs, state.pt);
  let c = pt === state.pt ? state.c + 1 : 0;
  if (c > HLC_MAX_COUNTER) {
    pt += 1;
    c = 0;
  }
  return { state: { pt, c }, hlc: encodeHlc(pt, c, deviceId) };
}

export interface ObserveResult {
  state: HlcState;
  /** True when the remote pt exceeded local wall-clock by more than MAX_DRIFT. */
  drifted: boolean;
}

/**
 * Fold a remote HLC seen on pull (spec §3.3) so future local stamps dominate
 * it. Clamped: pt never advances beyond `physicalMs + HLC_MAX_DRIFT_MS`.
 */
export function hlcObserve(
  state: HlcState,
  remote: string,
  physicalMs: number
): ObserveResult {
  const r = decodeHlc(remote);
  const drifted = r.pt > physicalMs + HLC_MAX_DRIFT_MS;
  const rPt = Math.min(r.pt, physicalMs + HLC_MAX_DRIFT_MS);

  let pt = Math.max(physicalMs, state.pt, rPt);
  let c: number;
  if (pt === state.pt && pt === rPt) c = Math.max(state.c, r.c) + 1;
  else if (pt === state.pt) c = state.c + 1;
  else if (pt === rPt) c = r.c + 1;
  else c = 0;

  if (c > HLC_MAX_COUNTER) {
    pt += 1;
    c = 0;
  }
  return { state: { pt, c }, drifted };
}
