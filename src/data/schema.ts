/**
 * data/schema.ts — the local database layout, versioned (spec Chapter 6 §2,
 * canonical store set per §0.8). DB_VERSION 2 (M1.5) adds the six sync stores
 * and the by_updatedAt index over the v1 layout (logs + meta); the v1→v2
 * upgrade in data/migrations/indexeddb is strictly additive and idempotent.
 * Drivers consume this declaratively so IndexedDb and Memory stay in lockstep.
 */

/** The canonical eight logical stores (§0.8). */
export type StoreName =
  | "logs" // DailyLog rows + sync metadata (owner's own data), keyed by date
  | "meta" // settings + sync state (key → value, out-of-line keys)
  | "outbox" // pending push operations, keyed by monotonic id (Sync ch. §1.2)
  | "keyring" // wrapped key material references (used from M2.2)
  | "projections" // partner-side projection cache, keyed by ownerLinkId
  | "tombstones" // deletion records pending GC, keyed by logical key
  | "sync_cursors" // per-scope pull cursor (§0.10.I)
  | "audit"; // local audit events (used from M2.12)

export type IndexName = "by_updatedAt" | "by_nextAttemptAt" | "by_deletedAt";

export interface StoreDef {
  name: StoreName;
  /** In-line key path, or null for out-of-line (explicit) keys. */
  keyPath: string | null;
  autoIncrement?: boolean;
  indexes?: Array<{ name: IndexName; keyPath: string }>;
}

export const DB_VERSION = 2;

/** The v1 physical layout (exactly what legacy lib/db.ts created). */
export const STORES_V1: readonly StoreDef[] = [
  { name: "logs", keyPath: "date" },
  { name: "meta", keyPath: null },
];

/** v2 = v1 + by_updatedAt on logs + the six sync stores (all additive). */
export const STORES_V2: readonly StoreDef[] = [
  {
    name: "logs",
    keyPath: "date",
    indexes: [{ name: "by_updatedAt", keyPath: "updatedAt" }],
  },
  { name: "meta", keyPath: null },
  {
    name: "outbox",
    keyPath: "id",
    indexes: [{ name: "by_nextAttemptAt", keyPath: "nextAttemptAt" }],
  },
  { name: "keyring", keyPath: "keyId" },
  {
    name: "projections",
    keyPath: "ownerLinkId",
    indexes: [{ name: "by_updatedAt", keyPath: "updatedAt" }],
  },
  {
    name: "tombstones",
    keyPath: "key",
    indexes: [{ name: "by_deletedAt", keyPath: "deletedAt" }],
  },
  { name: "sync_cursors", keyPath: "scope" },
  { name: "audit", keyPath: "id" },
];

/** The store set for the current DB_VERSION. */
export const CURRENT_STORES: readonly StoreDef[] = STORES_V2;

export function storeDef(name: StoreName): StoreDef | undefined {
  return CURRENT_STORES.find((s) => s.name === name);
}

// ── Well-known meta keys (sync state) ────────────────────────────────────────
export const META_DEVICE_ID = "deviceId";
export const META_HLC_STATE = "hlcState";
export const META_NEEDS_INITIAL_SEED = "needsInitialSeed";
export const META_DB_SCHEMA_VERSION = "dbSchemaVersion";
