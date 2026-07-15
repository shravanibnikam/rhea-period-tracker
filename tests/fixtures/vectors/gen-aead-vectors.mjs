// Generates the pinned AEAD known-answer vectors (M2.1 / RHEA-062).
// Run from the repo root so libsodium-wrappers-sumo resolves.
import _sodium from "libsodium-wrappers-sumo";
await _sodium.ready;
const s = _sodium;
const B64 = s.base64_variants.ORIGINAL;

const canonicalAad = (f) =>
  new TextEncoder().encode(
    JSON.stringify({ keyId: f.keyId, recordKey: f.recordKey, scope: f.scope, updatedAt: f.updatedAt })
  );

function vector(name, keyHex, nonceHex, ptUtf8, aadFields) {
  const key = s.from_hex(keyHex);
  const nonce = s.from_hex(nonceHex);
  const pt = new TextEncoder().encode(ptUtf8);
  const aad = canonicalAad(aadFields);
  const ct = s.crypto_aead_xchacha20poly1305_ietf_encrypt(pt, aad, null, nonce, key);
  return {
    name,
    keyHex,
    nonceHex,
    ptUtf8,
    aadFields,
    envelope: {
      v: 1,
      alg: "xchacha20poly1305",
      keyId: aadFields.keyId,
      nonce: s.to_base64(nonce, B64),
      ct: s.to_base64(ct, B64),
      aad: s.to_base64(aad, B64),
    },
  };
}

const k1 = [...Array(32).keys()].map((i) => i.toString(16).padStart(2, "0")).join("");
const n1 = [...Array(24).keys()].map((i) => i.toString(16).padStart(2, "0")).join("");
const k2 = "80".padEnd(64, "a5");
const n2 = "ff".padEnd(48, "3c");
const k3 = "d1".padEnd(64, "0f");
const n3 = "07".padEnd(48, "e2");

const out = {
  generator: "scratchpad/gen-aead-vectors.mjs (2026-07-15, M2.1/RHEA-062)",
  library: "libsodium-wrappers-sumo@0.8.4 (libsodium.js — audited upstream implementation)",
  construction:
    "crypto_aead_xchacha20poly1305_ietf_encrypt(pt, canonicalJSON({keyId,recordKey,scope,updatedAt}), null, nonce24, key32); base64 variant ORIGINAL",
  note: "Self-generated against the audited library and PINNED: any refactor that changes these bytes changed the wire construction.",
  vectors: [
    vector("owner-log-basic", k1, n1, 'rhea-kat-1: {"flow":"medium"}', {
      keyId: "dek:1",
      recordKey: "log:2026-07-15",
      scope: "owner",
      updatedAt: "0000019c9f0a0000:0001:kat-device-a",
    }),
    vector("empty-plaintext", k2, n2, "", {
      keyId: "dek:2",
      recordKey: "meta:excludedCycles",
      scope: "meta",
      updatedAt: "000000000000:0000:kat-device-b",
    }),
    vector("unicode-projection", k3, n3, "phase→luteal · humör 🌙 · ⏱ 28d", {
      keyId: "kpair:11111111-2222-3333-4444-555555555555:1",
      recordKey: "projection:current",
      scope: "projection",
      updatedAt: "0000019c9f0affff:fffe:kat-device-c",
    }),
  ],
};

console.log(JSON.stringify(out, null, 2));
