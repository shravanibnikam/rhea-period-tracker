/**
 * domain/merge.ts — LWW-per-key merge decision, PURE (M1.6 / spec Sync ch. §4).
 *
 * The reconcile decision is a pure function of stored vs incoming
 * (updatedAt, deviceId, deleted), which is what makes replaying a pulled page
 * after a crash idempotent. The I/O wrapper (Reconciler) lives in src/sync.
 *
 * Rules implemented:
 *  §4.1 LWW — higher HLC wins; exact (pt,c) tie broken by higher deviceId.
 *  §4.2 Echo suppression — a self-authored row that TIES or LOSES the compare
 *       is skipped as an echo. A self-authored row that is strictly newer than
 *       local (or missing locally) APPLIES: that is the restore/rollback path
 *       (critique H2 / risk R-OFF-1 — a pre-compare drop made resync() restore
 *       nothing for a single-device owner).
 *  §4.3 Tombstones — a winning deleted row is applied as a tombstone (payload
 *       cleared, HLC/deviceId retained) so older inserts cannot resurrect it.
 *  §4.4 Backfilled-epoch-0 — during a FULL pull, a tombstone for a key that
 *       does not exist locally is skipped; during incremental pulls it is
 *       materialized (it may delete a row arriving out of order).
 */

import { compareHlc } from "./hlc";

/** The merge-relevant metadata every synced row carries. */
export interface MergeMeta {
  updatedAt: string; // HLC
  deviceId: string;
  deleted: boolean;
}

export type MergeDecision =
  | { action: "apply"; tombstone: boolean }
  | {
      action: "skip";
      reason:
        | "echo" // authored by this device and not newer than local (§4.2)
        | "older" // local is newer — LWW loser (§4.1)
        | "tiebreak" // same (pt,c), lower deviceId (§4.1)
        | "duplicate" // identical stamp — replay of an applied row
        | "unknown-tombstone"; // full-pull tombstone for a never-seen key (§4.4)
    };

export interface MergeInput {
  remote: MergeMeta;
  /** The locally-stored row's merge metadata, or undefined if the key is new. */
  local: MergeMeta | undefined;
  /** This device's id (echo suppression). */
  selfDeviceId: string;
  /** True when pulling from an empty cursor (start()/resync()) — §4.4. */
  fullPull: boolean;
}

export function decideMerge({ remote, local, selfDeviceId, fullPull }: MergeInput): MergeDecision {
  // §4.2 — "echo" is a LABEL on the LWW outcome, never a pre-compare drop:
  // suppressing self-authored rows unconditionally made restore-after-wipe a
  // no-op for a single-device owner (critique H2 / risk R-OFF-1). In normal
  // operation an echo ties local (cmp === 0) and is skipped below anyway.
  const isEcho = remote.deviceId === selfDeviceId;

  if (local === undefined) {
    if (remote.deleted && fullPull) {
      return { action: "skip", reason: "unknown-tombstone" };
    }
    // Applies even for self-authored rows: a missing local copy of our own
    // write means the local store lost data (wipe/eviction/rollback).
    return { action: "apply", tombstone: remote.deleted };
  }

  const cmp = compareHlc(remote.updatedAt, local.updatedAt);
  if (cmp === 0) {
    // compareHlc includes the deviceId tiebreak, so 0 means the identical
    // stamp — this row was already applied; skipping keeps replay idempotent.
    return { action: "skip", reason: isEcho ? "echo" : "duplicate" };
  }
  if (cmp < 0) {
    // A stale echo of an earlier push, the deterministic tiebreak loser
    // (same (pt, c), lower deviceId), or simply an older edit.
    if (isEcho) return { action: "skip", reason: "echo" };
    const sameInstant =
      remote.updatedAt.slice(0, 17) === local.updatedAt.slice(0, 17); // "pt:c" prefix
    return { action: "skip", reason: sameInstant ? "tiebreak" : "older" };
  }
  // cmp > 0 — strictly newer HLC (including a self-authored row newer than a
  // rolled-back local copy), or the higher-deviceId tiebreak winner (§4.1).
  return { action: "apply", tombstone: remote.deleted };
}

/**
 * Convenience for tests + outbox coalescing (§4.6): given two versions of the
 * same key, return the one LWW keeps. Deterministic on every device.
 */
export function lwwWinner<T extends MergeMeta>(a: T, b: T): T {
  return compareHlc(a.updatedAt, b.updatedAt) >= 0 ? a : b;
}
