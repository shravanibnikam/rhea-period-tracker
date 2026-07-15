/**
 * sync/types.ts — engine-facing types (M1.8 / spec Sync ch. §1.2). The wire
 * types (SyncRecord, Envelope) live in data/envelope.ts and are re-exported
 * here so sync code has one import surface.
 */

export type {
  SyncRecord,
  SyncScope,
  Envelope,
  CipherEnvelope,
  PlainEnvelope,
} from "@/data/envelope";
import type { SyncRecord, SyncScope } from "@/data/envelope";

/** Durable outbox entry. Stored in the `outbox` store, keyed by `id`. */
export interface OutboxEntry {
  id: string; // monotonic insertion-ordered id
  record: SyncRecord; // exactly what will be pushed
  destination: SyncScope; // routes to a transport table (§2.4)
  attempts: number; // retry count
  nextAttemptAt: number; // epoch ms; backoff gate (§7.3)
  lastError?: string; // last transport error message
  enqueuedAt: number; // epoch ms
  leaseUntil?: number; // epoch ms; in-flight lock (§1.5)
}

/**
 * Per-scope pull cursor, stored in `sync_cursors` keyed by scope (§0.10.I).
 * Two cursor spaces (§2.5): `highWater` is the max APPLIED edit-time HLC
 * (merge diagnostics); `serverCursor` is the opaque keyset token that drives
 * fetch continuation — advanced only after a page is durably reconciled.
 */
export interface SyncCursor {
  scope: SyncScope;
  peerId: string; // ownerId (own uid) or linkId for projection/note
  serverCursor: string; // '' = from epoch-0 (full pull)
  highWater: string; // HLC of the newest applied remote row
  serverTimeSkewMs?: number; // observed clock delta for diagnostics
  updatedAt: number; // epoch ms of last successful pull
}

export type SyncPhase =
  | "idle"
  | "syncing"
  | "offline"
  | "error"
  | "paused"
  | "conflict-blocked";

export interface SyncStatus {
  phase: SyncPhase;
  online: boolean;
  outboxDepth: number;
  lastSyncedAt: number | null; // epoch ms
  lastError: string | null;
  scopes: Partial<Record<SyncScope, { cursor: string; pending: number }>>;
}

export type FlushReason =
  | "enqueue"
  | "online"
  | "visibility"
  | "resume"
  | "realtime"
  | "timer"
  | "manual";

export interface FlushResult {
  pushed: number;
  failed: number;
  remaining: number;
}

export interface PullResult {
  applied: number;
  skipped: number;
  conflicts: number;
}

/** Backoff policy (§7.3): exponential with jitter, reset on success. */
export interface BackoffPolicy {
  baseMs: number;
  capMs: number;
  /** jitter factor source in [0,1); injectable for determinism in tests. */
  random(): number;
}

export const DEFAULT_BACKOFF: BackoffPolicy = {
  baseMs: 1_000,
  capMs: 60_000,
  random: Math.random,
};

/** min(base·2^attempts, cap) · (0.5..1.5) */
export function nextBackoffDelay(policy: BackoffPolicy, attempts: number): number {
  const exp = Math.min(policy.baseMs * 2 ** attempts, policy.capMs);
  return Math.round(exp * (0.5 + policy.random()));
}
