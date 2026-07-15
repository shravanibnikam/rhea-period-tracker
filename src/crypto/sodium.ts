/**
 * crypto/sodium.ts — the libsodium initialization singleton (M2.1 / RHEA-060).
 *
 * libsodium.js (the audited Emscripten build of libsodium) initializes
 * asynchronously; every primitive is unusable until `ready` resolves. This
 * module owns that lifecycle so callers never race it: `getSodium()` awaits
 * the (module-level, hence once-only) ready promise and returns the API.
 *
 * The SUMO build is required: the standard `libsodium-wrappers` package omits
 * `crypto_pwhash` (Argon2id), which the recovery KEK depends on (ADR-0005).
 *
 * NO module outside src/crypto/ may import libsodium directly (ADR-0005;
 * lint-enforced: crypto/ is the only zone allowed to touch it).
 */

import _sodium from "libsodium-wrappers-sumo";

export type Sodium = typeof _sodium;

/** Resolves once libsodium is initialized; the same instance every call. */
export async function getSodium(): Promise<Sodium> {
  await _sodium.ready; // idempotent — a settled promise after first await
  return _sodium;
}
