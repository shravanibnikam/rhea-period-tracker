/**
 * AEAD known-answer tests (M2.1 / RHEA-062). The fixture pins the exact wire
 * construction — key/nonce/plaintext/AAD → envelope bytes — so a refactor
 * (library swap, base64 variant change, AAD field drift) cannot silently
 * change ciphertext compatibility. Regenerate ONLY deliberately via
 * tests/fixtures/vectors/gen-aead-vectors.mjs (and bump ENVELOPE_VERSION if
 * the construction truly changes).
 */
import { describe, it, expect } from "vitest";
import {
  seal,
  open,
  sealWithNonce,
  generateKey,
  equal,
  zero,
  NONCE_BYTES,
} from "@/crypto/aead";
import { CryptoError } from "@/crypto/errors";
import { ErrorCode } from "@/kernel";
import { buildAad, type AadFields } from "@/data/envelope";
import type { CipherEnvelope } from "@/crypto/envelope";
import fixture from "../../fixtures/vectors/aead.json";

const hexToBytes = (hex: string): Uint8Array =>
  new Uint8Array(hex.match(/.{2}/g)!.map((b) => parseInt(b, 16)));

const flipCtByte = (env: CipherEnvelope): CipherEnvelope => {
  const ct = Buffer.from(env.ct, "base64");
  ct[0] ^= 0x01;
  return { ...env, ct: ct.toString("base64") };
};

describe("AEAD known-answer vectors (construction pinned)", () => {
  for (const v of fixture.vectors) {
    const key = hexToBytes(v.keyHex);
    const nonce = hexToBytes(v.nonceHex);
    const pt = new TextEncoder().encode(v.ptUtf8);
    const aadFields = v.aadFields as AadFields;
    const aad = buildAad(aadFields);
    const pinned = v.envelope as CipherEnvelope;

    it(`${v.name}: sealWithNonce reproduces the pinned envelope byte-for-byte`, async () => {
      expect(await sealWithNonce(key, pinned.keyId, pt, aad, nonce)).toEqual(pinned);
    });

    it(`${v.name}: open() returns the exact plaintext`, async () => {
      expect(new TextDecoder().decode(await open(key, pinned, aad))).toBe(v.ptUtf8);
    });

    it(`${v.name}: a single flipped ciphertext byte fails as DECRYPT_FAILED`, async () => {
      const e = await open(key, flipCtByte(pinned), aad).catch((err) => err);
      expect(e).toBeInstanceOf(CryptoError);
      expect((e as CryptoError).code).toBe(ErrorCode.DECRYPT_FAILED);
    });

    it(`${v.name}: any mutated AAD field fails as AAD_MISMATCH`, async () => {
      for (const field of ["keyId", "recordKey", "scope", "updatedAt"] as const) {
        const mutated = buildAad({ ...aadFields, [field]: aadFields[field] + "x" });
        const e = await open(key, pinned, mutated).catch((err) => err);
        expect((e as CryptoError).code).toBe(ErrorCode.AAD_MISMATCH);
      }
    });

    it(`${v.name}: without a stored aad, a wrong AAD still fails the tag (DECRYPT_FAILED)`, async () => {
      const { aad: _stored, ...bare } = pinned;
      const wrong = buildAad({ ...aadFields, updatedAt: "tampered" });
      const e = await open(key, bare as CipherEnvelope, wrong).catch((err) => err);
      expect((e as CryptoError).code).toBe(ErrorCode.DECRYPT_FAILED);
    });
  }

  it("rejects unknown envelope versions and algorithms (quarantine class)", async () => {
    const key = hexToBytes(fixture.vectors[0].keyHex);
    const aad = buildAad(fixture.vectors[0].aadFields as AadFields);
    const pinned = fixture.vectors[0].envelope as CipherEnvelope;
    for (const bad of [
      { ...pinned, v: 2 },
      { ...pinned, alg: "aes-gcm" as never },
    ]) {
      const e = await open(key, bad, aad).catch((err) => err);
      expect((e as CryptoError).code).toBe(ErrorCode.DECRYPT_FAILED);
    }
  });

  it("buildAad emits canonical JSON (sorted keys, no whitespace)", () => {
    const aad = buildAad({
      keyId: "dek:1",
      recordKey: "log:2026-07-15",
      scope: "owner",
      updatedAt: "0000019c9f0a0000:0001:kat-device-a",
    });
    const text = new TextDecoder().decode(aad);
    expect(text).toBe(
      '{"keyId":"dek:1","recordKey":"log:2026-07-15","scope":"owner","updatedAt":"0000019c9f0a0000:0001:kat-device-a"}'
    );
    const keys = [...text.matchAll(/"(\w+)":/g)].map((m) => m[1]);
    expect(keys).toEqual([...keys].sort());
  });
});

describe("AEAD live behavior", () => {
  const aad = buildAad({
    keyId: "dek:1",
    recordKey: "log:2026-01-01",
    scope: "owner",
    updatedAt: "0000019c00000000:0000:dev-live",
  });

  it("seal→open round-trips under a fresh key", async () => {
    const key = await generateKey();
    const pt = new TextEncoder().encode("round-trip");
    const env = await seal(key, "dek:1", pt, aad);
    expect(env.alg).toBe("xchacha20poly1305");
    expect(new TextDecoder().decode(await open(key, env, aad))).toBe("round-trip");
  });

  it("every seal draws a fresh 24-byte nonce (uniqueness over 300 seals)", async () => {
    const key = await generateKey();
    const pt = new TextEncoder().encode("n");
    const nonces = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const env = await seal(key, "dek:1", pt, aad);
      expect(Buffer.from(env.nonce, "base64").length).toBe(NONCE_BYTES);
      nonces.add(env.nonce);
    }
    expect(nonces.size).toBe(300);
  });

  it("a different key fails to open (DECRYPT_FAILED)", async () => {
    const env = await seal(await generateKey(), "dek:1", new Uint8Array([1, 2, 3]), aad);
    const e = await open(await generateKey(), env, aad).catch((err) => err);
    expect((e as CryptoError).code).toBe(ErrorCode.DECRYPT_FAILED);
  });

  it("equal() is true only for identical bytes; zero() wipes key material", async () => {
    const a = new Uint8Array([1, 2, 3, 4]);
    expect(await equal(a, new Uint8Array([1, 2, 3, 4]))).toBe(true);
    expect(await equal(a, new Uint8Array([1, 2, 3, 5]))).toBe(false);
    expect(await equal(a, new Uint8Array([1, 2, 3]))).toBe(false);
    await zero(a);
    expect([...a]).toEqual([0, 0, 0, 0]);
  });
});
