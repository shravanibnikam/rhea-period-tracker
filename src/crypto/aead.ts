/**
 * crypto/aead.ts — XChaCha20-Poly1305 seal/open (M2.1 / RHEA-061, spec Ch5 §3.1,
 * §4, §5). Every stored payload in v2 is sealed here; nothing else in the
 * codebase touches an AEAD primitive.
 *
 * Construction (frozen by the KAT vectors in tests/fixtures/vectors/):
 *   crypto_aead_xchacha20poly1305_ietf_encrypt(plaintext, aad, null, nonce, key)
 *   nonce  = 24 random bytes per message (randombytes_buf), never a counter
 *   aad    = canonicalJSON({keyId, recordKey, scope, updatedAt}) — assembled by
 *            the caller (data/envelope.buildAad); bound into the tag AND stored
 *            base64 in the envelope so open() can distinguish transplant
 *            (AAD_MISMATCH, T-3 #3) from corruption (DECRYPT_FAILED, T-3 #1)
 *   base64 = the "original" (padded, standard-alphabet) variant, matching the
 *            PlainEnvelope passthrough encoding
 */

import { ErrorCode, invariant } from "@/kernel";
import { getSodium } from "./sodium";
import { CryptoError } from "./errors";
import { ENVELOPE_VERSION, type CipherEnvelope } from "./envelope";

export const KEY_BYTES = 32;
export const NONCE_BYTES = 24; // crypto_aead_xchacha20poly1305_ietf_NPUBBYTES
export const TAG_BYTES = 16;

/** Seal `plaintext` under a raw 32-byte key, binding `aad`. Fresh random nonce. */
export async function seal(
  rawKey: Uint8Array,
  keyId: string,
  plaintext: Uint8Array,
  aad: Uint8Array
): Promise<CipherEnvelope> {
  const sodium = await getSodium();
  let nonce: Uint8Array;
  try {
    nonce = sodium.randombytes_buf(NONCE_BYTES);
  } catch (cause) {
    // T-3 #6: no secure RNG ⇒ hard-fail; never write plaintext or a zero nonce.
    throw new CryptoError(ErrorCode.RNG_UNAVAILABLE, "secure randomness unavailable", {
      cause,
      userMessage: "Secure storage isn't available on this device.",
    });
  }
  return sealWithNonce(rawKey, keyId, plaintext, aad, nonce);
}

/**
 * Deterministic seal with a caller-supplied nonce.
 * @internal Exists ONLY so the known-answer tests can pin the construction —
 * production code must use {@link seal} (fresh random nonce per message).
 */
export async function sealWithNonce(
  rawKey: Uint8Array,
  keyId: string,
  plaintext: Uint8Array,
  aad: Uint8Array,
  nonce: Uint8Array
): Promise<CipherEnvelope> {
  const sodium = await getSodium();
  invariant(rawKey.length === KEY_BYTES, "AEAD key must be 32 bytes");
  invariant(nonce.length === NONCE_BYTES, "XChaCha20 nonce must be 24 bytes");
  const ct = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    plaintext,
    aad,
    null, // nsec — unused by the IETF construction
    nonce,
    rawKey
  );
  const b64 = sodium.base64_variants.ORIGINAL;
  return {
    v: ENVELOPE_VERSION,
    alg: "xchacha20poly1305",
    keyId,
    nonce: sodium.to_base64(nonce, b64),
    ct: sodium.to_base64(ct, b64),
    aad: sodium.to_base64(aad, b64),
  };
}

/**
 * Open an envelope with a raw key. `aad` is RECOMPUTED by the caller from the
 * surrounding SyncRecord (§0.3) — never taken from the envelope, so a
 * transplanted ciphertext cannot vouch for itself.
 *
 * Throws CryptoError:
 *  - AAD_MISMATCH   stored aad ≠ recomputed aad (possible tampering, T-3 #3)
 *  - DECRYPT_FAILED tag failure / unsupported envelope version or alg (T-3 #1)
 */
export async function open(
  rawKey: Uint8Array,
  env: CipherEnvelope,
  aad: Uint8Array
): Promise<Uint8Array> {
  const sodium = await getSodium();
  invariant(rawKey.length === KEY_BYTES, "AEAD key must be 32 bytes");
  if (env.alg !== "xchacha20poly1305" || env.v !== ENVELOPE_VERSION) {
    throw new CryptoError(ErrorCode.DECRYPT_FAILED, "unsupported envelope format", {
      context: { v: env.v, alg: String(env.alg) },
    });
  }
  const b64 = sodium.base64_variants.ORIGINAL;
  // The AAD is public (stored beside the ciphertext), so a plain string
  // compare leaks nothing; the cryptographic binding is the Poly1305 tag.
  if (env.aad !== undefined && env.aad !== sodium.to_base64(aad, b64)) {
    throw new CryptoError(ErrorCode.AAD_MISMATCH, "envelope AAD does not match its record", {
      context: { keyId: env.keyId },
    });
  }
  try {
    return sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
      null,
      sodium.from_base64(env.ct, b64),
      aad,
      sodium.from_base64(env.nonce, b64),
      rawKey
    );
  } catch (cause) {
    throw new CryptoError(ErrorCode.DECRYPT_FAILED, "AEAD authentication failed", {
      cause,
      context: { keyId: env.keyId },
    });
  }
}

/** Fresh 32-byte symmetric key (crypto_aead_xchacha20poly1305_ietf_keygen). */
export async function generateKey(): Promise<Uint8Array> {
  const sodium = await getSodium();
  try {
    return sodium.crypto_aead_xchacha20poly1305_ietf_keygen();
  } catch (cause) {
    throw new CryptoError(ErrorCode.RNG_UNAVAILABLE, "secure randomness unavailable", {
      cause,
      userMessage: "Secure storage isn't available on this device.",
    });
  }
}

/** Constant-time equality (sodium.memcmp) — SAS / tag comparisons only. */
export async function equal(a: Uint8Array, b: Uint8Array): Promise<boolean> {
  const sodium = await getSodium();
  return a.length === b.length && sodium.memcmp(a, b);
}

/** Best-effort zeroing of transient key material (sodium.memzero). */
export async function zero(buf: Uint8Array): Promise<void> {
  const sodium = await getSodium();
  sodium.memzero(buf);
}
