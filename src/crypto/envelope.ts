/**
 * crypto/envelope.ts — the sealed-envelope CONTRACT (spec §0.2).
 *
 * The type lives here (not in data/) because crypto/ may import only kernel +
 * libsodium while data/ is explicitly allowed to import crypto for envelope
 * types (spec Ch3 §3.1). data/envelope.ts re-exports it alongside the
 * PlainEnvelope passthrough and the SyncRecord shapes.
 */

/** The sealed unit. Produced by crypto/aead.seal, opened by crypto/aead.open. */
export interface CipherEnvelope {
  v: number; // envelope format version (starts at 1); unknown v ⇒ quarantine
  alg: "xchacha20poly1305"; // the only sealed value in v2
  keyId: string; // which symmetric key opens this — §0.4 grammar (dek:<epoch> …)
  nonce: string; // base64, 24 random bytes (fresh per message, never a counter)
  ct: string; // base64, ciphertext || 16-byte Poly1305 tag
  aad?: string; // base64, canonical 4-field AAD (§0.3, §0.10.G)
}

export const ENVELOPE_VERSION = 1;
