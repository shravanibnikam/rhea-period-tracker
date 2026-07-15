/**
 * data/envelope.ts — the canonical envelope + sync record (M1.5 / spec §0.2).
 * These two types cross every module boundary; they are defined here once.
 *
 * Until M2.4 flips owner E2EE on, payloads travel as a PlainEnvelope
 * (alg "none", ct = base64(JSON)) so the record/outbox/merge machinery is
 * exercised with the exact final shapes while `xchacha20poly1305` is reserved
 * for src/crypto (produced/consumed ONLY there from M2.1 on).
 */

import { ENVELOPE_VERSION, type CipherEnvelope } from "@/crypto/envelope";

export type SyncScope = "owner" | "projection" | "note" | "meta";

// The sealed unit (spec §0.2) is DECLARED in crypto/envelope.ts (crypto may
// import only kernel + libsodium; data may import crypto for envelope types —
// spec Ch3 §3.1). Re-exported here so data/sync consumers keep one import.
export { ENVELOPE_VERSION, type CipherEnvelope };

/** Pre-E2EE passthrough (M1.5 → M2.4 cutover): same slot, no confidentiality. */
export interface PlainEnvelope {
  v: 1;
  alg: "none";
  keyId: "plain";
  nonce: "";
  ct: string; // base64(JSON(payload))
}

export type Envelope = CipherEnvelope | PlainEnvelope;

/** The row that crosses the wire and the outbox (spec §0.2). */
export interface SyncRecord {
  key: string; // logical record key (hashed on the wire from M2.4 — §0.6)
  scope: SyncScope;
  payload: Envelope | null; // null === tombstone
  updatedAt: string; // HLC, stamped at EDIT time (§0.5), NOT server-receive time
  deviceId: string; // authoring device (echo-suppression + LWW tiebreak)
  deleted: boolean; // true === tombstone
}

/** Sync metadata every locally-stored synced row carries (v2 schema). */
export interface SyncMeta {
  updatedAt: string; // HLC
  deviceId: string;
  deleted: boolean; // always false in `logs`; deletes live in `tombstones`
}

export type SyncedRow<T> = T & SyncMeta;

/** A `tombstones` store row (spec Chapter 6 §2). */
export interface TombstoneRow {
  key: string; // logical key of the deleted record, e.g. "log:2026-07-15"
  scope: SyncScope;
  deletedAt: string; // HLC, indexed for GC
  deviceId: string;
  acked: boolean; // all-devices-acked flag for GC
}

/** Logical key for a daily log (local form; hashed on the wire from M2.4). */
export function logKey(date: string): string {
  return `log:${date}`;
}

// ── AAD assembly (spec §0.3 / §0.10.G) ──────────────────────────────────────

/** The four fields every seal binds. A mismatch on ANY of them fails open(). */
export interface AadFields {
  keyId: string;
  recordKey: string; // SyncRecord.key
  scope: SyncScope;
  updatedAt: string; // HLC edit-time
}

/**
 * canonicalJSON of the 4-field AAD: keys sorted lexicographically, no
 * whitespace, UTF-8. The literal below IS canonical — its insertion order
 * (keyId < recordKey < scope < updatedAt) is already sorted and
 * JSON.stringify emits no whitespace; the guard test pins this.
 */
export function buildAad(f: AadFields): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify({
      keyId: f.keyId,
      recordKey: f.recordKey,
      scope: f.scope,
      updatedAt: f.updatedAt,
    })
  );
}

/** AAD for a SyncRecord about to be sealed/opened under `keyId` (§0.3). */
export function aadForRecord(
  rec: Pick<SyncRecord, "key" | "scope" | "updatedAt">,
  keyId: string
): Uint8Array {
  return buildAad({ keyId, recordKey: rec.key, scope: rec.scope, updatedAt: rec.updatedAt });
}

// ── base64 helpers (UTF-8 safe, browser + node) ─────────────────────────────

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Wrap a JSON-serializable payload in the pre-E2EE passthrough envelope. */
export function sealPlain(payload: unknown): PlainEnvelope {
  return {
    v: 1,
    alg: "none",
    keyId: "plain",
    nonce: "",
    ct: bytesToBase64(new TextEncoder().encode(JSON.stringify(payload))),
  };
}

/** Open a passthrough envelope. Returns undefined for sealed/unknown formats. */
export function openPlain<T = unknown>(env: Envelope): T | undefined {
  if (env.alg !== "none") return undefined;
  return JSON.parse(new TextDecoder().decode(base64ToBytes(env.ct))) as T;
}
