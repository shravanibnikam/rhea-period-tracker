/**
 * Branded primitives (spec Chapter 2). A brand makes structurally-identical
 * strings nominally distinct, so a DeviceId can never be passed where a Uid is
 * expected. Constructors are zero-cost casts; the formatted ones (DateKey,
 * Hlc) validate shape and throw INVARIANT on garbage.
 *
 * kernel-internal imports only.
 */

import { ErrorCode, rheaError } from "./errors";

declare const brand: unique symbol;
export type Brand<T, B extends string> = T & { readonly [brand]: B };

/** Supabase auth user id (uuid). */
export type Uid = Brand<string, "Uid">;
/** Stable per-device identifier, assigned on first run. */
export type DeviceId = Brand<string, "DeviceId">;
/** Key identifier per the §0.4 grammar (e.g. "dek:v1", "pair:<linkId>:v2"). */
export type KeyId = Brand<string, "KeyId">;
/** Hybrid Logical Clock string "<pt>:<c>:<deviceId>" (§0.5). */
export type Hlc = Brand<string, "Hlc">;
/** Full ISO-8601 timestamp. */
export type Iso8601 = Brand<string, "Iso8601">;
/** Calendar date key "YYYY-MM-DD" (the DailyLog primary key). */
export type DateKey = Brand<string, "DateKey">;

export const asUid = (s: string): Uid => s as Uid;
export const asDeviceId = (s: string): DeviceId => s as DeviceId;
export const asKeyId = (s: string): KeyId => s as KeyId;
export const asIso8601 = (s: string): Iso8601 => s as Iso8601;

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
/** HLC: 12 hex chars (48-bit ms) ":" 4 hex chars (16-bit counter) ":" deviceId. */
const HLC_RE = /^[0-9a-f]{12}:[0-9a-f]{4}:.+$/;

export function asDateKey(s: string): DateKey {
  if (!DATE_KEY_RE.test(s)) {
    throw rheaError(ErrorCode.INVALID_DATE, `Not a YYYY-MM-DD date key: shape mismatch`, {
      context: { length: s.length },
    });
  }
  return s as DateKey;
}

export function asHlc(s: string): Hlc {
  if (!HLC_RE.test(s)) {
    throw rheaError(ErrorCode.INVARIANT, "Not an HLC string (pt:c:deviceId)", {
      context: { length: s.length },
    });
  }
  return s as Hlc;
}

export const isDateKey = (s: string): s is DateKey => DATE_KEY_RE.test(s);
export const isHlc = (s: string): s is Hlc => HLC_RE.test(s);
