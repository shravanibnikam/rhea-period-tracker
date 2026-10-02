/**
 * sync/outbox.ts — durable outbox over the `outbox` store (M1.8 / spec Sync
 * ch. §1.4–1.5). Coalesces re-saves of the same (key,scope) by LWW so offline
 * bursts converge before they hit the wire; claim/lease semantics give
 * at-least-once delivery that survives a crash mid-push.
 */

import { compareHlc } from "@/domain/hlc";
import type { SyncRecord, SyncScope } from "@/data/envelope";
import type { StorageDriver, StorageTx } from "@/data/drivers/StorageDriver";
import type { OutboxEntry } from "./types";

/** Monotonic, sortable id: <epoch-ms hex 12>-<seq hex 4>-<rand>. */
let idSeq = 0;
export function makeOutboxId(nowMs: number): string {
  idSeq = (idSeq + 1) & 0xffff;
  const rand = Math.floor(Math.random() * 0xffffff)
    .toString(16)
    .padStart(6, "0");
  return `${nowMs.toString(16).padStart(12, "0")}-${idSeq
    .toString(16)
    .padStart(4, "0")}-${rand}`;
}

/** What claimDue handed out and the engine pushed: the snapshot a settle compares against. */
type Claimed = Pick<OutboxEntry, "id" | "revision" | "record">;

/**
 * The compare-and-swap token for settling a claimed entry (P0-02, P0-03): the
 * claimed snapshot's `revision` AND its `record.updatedAt`. claimDue hands out
 * snapshots; a save during the push replaces the entry's record under the same
 * id, and the entry may be settled (deleted, or charged a failure) only while
 * it still holds the snapshot's content.
 *
 * - `revision` is bumped by every coalescing replacement this build makes
 *   (lease and backoff bookkeeping never touch it). It also catches an
 *   EQUAL-HLC replacement (coalescing replaces on `>= 0`) and relies on no
 *   clock invariant, whereas an updatedAt-only token is sound only while
 *   hlcNow stays strictly monotonic: an invariant kept by other layers
 *   (domain/hlc, data/syncStamp, the persisted HLC state that tabs sharing one
 *   deviceId all advance) and enforced by nothing here.
 * - `record.updatedAt` catches a replacement by a writer that does not bump the
 *   revision: a pre-fix build still open in another tab during an update (its
 *   coalescing only ever installs a newer-or-equal HLC), or a raw put().
 *
 * Residual gap: an EQUAL-HLC replacement by such a writer, i.e. content the
 * server's stale-write guard (`<=`) would reject anyway. Entries stored before
 * the field existed read as revision 0, so no IndexedDB migration is needed.
 */
function unchangedSince(current: OutboxEntry, claimed: Claimed): boolean {
  return (
    revisionOf(current) === revisionOf(claimed) &&
    current.record.updatedAt === claimed.record.updatedAt
  );
}

function revisionOf(entry: Pick<OutboxEntry, "revision">): number {
  return entry.revision ?? 0;
}

export class Outbox {
  constructor(
    private readonly driver: StorageDriver,
    private readonly now: () => number = Date.now
  ) {}

  async put(entry: OutboxEntry): Promise<void> {
    await this.driver.put("outbox", entry);
  }

  /**
   * Coalesce (§1.4): if an undelivered entry for (key,scope) exists, replace
   * its record when the new updatedAt is >= existing (LWW at rest, §4.6).
   * Otherwise insert a fresh entry due immediately.
   */
  async enqueueCoalesced(record: SyncRecord, dest: SyncScope): Promise<void> {
    await this.driver.transaction(
      { mode: "readwrite", stores: ["outbox"] },
      (tx) => this.enqueueCoalescedTx(tx, record, dest)
    );
  }

  /**
   * Transaction-scoped variant so repositories can enqueue in the SAME
   * transaction as the domain write (atomic enqueue, §1.5).
   */
  async enqueueCoalescedTx(
    tx: StorageTx,
    record: SyncRecord,
    dest: SyncScope
  ): Promise<void> {
    const now = this.now();
    const all = await tx.getAll<OutboxEntry>("outbox");
    const existing = all.find(
      (e) => e.record.key === record.key && e.record.scope === record.scope
    );
    if (existing) {
      if (compareHlc(record.updatedAt, existing.record.updatedAt) >= 0) {
        await tx.put("outbox", {
          ...existing,
          record,
          revision: revisionOf(existing) + 1, // in-flight settles of the old record now miss
          attempts: 0, // fresh content never inherits the old content's failures
          nextAttemptAt: now, // fresh content → due immediately
          leaseUntil: undefined,
          lastError: undefined,
        });
      }
      return; // older content never replaces newer pending content
    }
    const entry: OutboxEntry = {
      id: makeOutboxId(now),
      record,
      destination: dest,
      attempts: 0,
      nextAttemptAt: now,
      enqueuedAt: now,
      revision: 0,
    };
    await tx.put("outbox", entry);
  }

  /** Entries due now with no live lease, oldest first, leased for `leaseMs`. */
  async claimDue(now: number, limit: number, leaseMs: number): Promise<OutboxEntry[]> {
    return this.driver.transaction(
      { mode: "readwrite", stores: ["outbox"] },
      async (tx) => {
        const all = await tx.getAll<OutboxEntry>("outbox");
        const due = all
          .filter(
            (e) =>
              e.nextAttemptAt <= now &&
              (e.leaseUntil === undefined || e.leaseUntil <= now)
          )
          .sort((a, b) => (a.id < b.id ? -1 : 1))
          .slice(0, limit);
        const claimed: OutboxEntry[] = [];
        for (const e of due) {
          const leased = { ...e, leaseUntil: now + leaseMs };
          await tx.put("outbox", leased);
          claimed.push(leased);
        }
        return claimed;
      }
    );
  }

  /**
   * Settle a claimed entry against `claimed`, in ONE readwrite transaction.
   * While the stored entry still holds the claimed content (unchangedSince),
   * `onMatch` writes the outcome and settle returns true. Otherwise a save
   * replaced it while the push was in flight: keep the newer content and clear
   * the lease explicitly, so the next round sends it now rather than after a
   * lease runs out, and return false. (If another tab re-claimed it meanwhile,
   * clearing that lease costs at most one duplicate push, which upsert-by-key
   * and LWW make harmless.)
   */
  private settle(
    claimed: Claimed,
    onMatch: (tx: StorageTx, current: OutboxEntry) => Promise<void>
  ): Promise<boolean> {
    return this.driver.transaction({ mode: "readwrite", stores: ["outbox"] }, async (tx) => {
      const current = await tx.get<OutboxEntry>("outbox", claimed.id);
      if (!current) return false; // already settled elsewhere (another tab) or cleared
      if (!unchangedSince(current, claimed)) {
        await tx.put("outbox", { ...current, leaseUntil: undefined });
        return false;
      }
      await onMatch(tx, current);
      return true;
    });
  }

  /**
   * Compare-and-delete on delivery (P0-02): deletes the entry only if it still
   * holds the content of `claimed`, the snapshot claimDue returned and the
   * engine pushed. A newer save that replaced it is kept. Returns whether the
   * entry was deleted.
   */
  async ack(claimed: Claimed): Promise<boolean> {
    return this.settle(claimed, (tx) => tx.delete("outbox", claimed.id));
  }

  /**
   * Compare-and-swap failure (P0-03): records the failure and schedules the
   * retry only if the entry still holds the content of `claimed` (as for ack).
   * If a save replaced it, the failure belonged to the old content: no attempt
   * is counted, no backoff or lastError set, and the newer content is left
   * claimable now. Returns whether the failure was recorded.
   */
  async fail(claimed: Claimed, err: string, nextAttemptAt: number): Promise<boolean> {
    return this.settle(claimed, (tx, current) =>
      tx.put("outbox", {
        ...current,
        attempts: current.attempts + 1,
        lastError: err,
        nextAttemptAt,
        leaseUntil: undefined,
      })
    );
  }

  /** Make an entry claimable again — in one transaction, so it never writes back a stale record. */
  async releaseLease(id: string): Promise<void> {
    await this.driver.transaction({ mode: "readwrite", stores: ["outbox"] }, async (tx) => {
      const current = await tx.get<OutboxEntry>("outbox", id);
      if (current) await tx.put("outbox", { ...current, leaseUntil: undefined });
    });
  }

  async depth(): Promise<number> {
    return this.driver.count("outbox");
  }

  async peekOldest(): Promise<OutboxEntry | undefined> {
    const all = await this.driver.getAll<OutboxEntry>("outbox");
    return all.sort((a, b) => (a.id < b.id ? -1 : 1))[0];
  }
}
