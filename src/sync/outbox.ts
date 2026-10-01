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

/**
 * The compare-and-swap token for settling a claimed entry (P0-02).
 *
 * claimDue hands out snapshots; a save during the push replaces the entry's
 * record under the same id. Every such replacement bumps `revision` (lease and
 * backoff bookkeeping never do), so settling against the claimed snapshot's
 * revision detects it however the two records' HLCs compare.
 *
 * Why a counter rather than `record.updatedAt`: coalescing also replaces on an
 * EQUAL HLC (`>= 0`), and an updatedAt token is sound only while hlcNow stays
 * strictly monotonic — an invariant kept by other layers (domain/hlc,
 * data/syncStamp and the persisted HLC state that tabs sharing one deviceId
 * all advance) and enforced by nothing here. The counter depends on nothing
 * but this file. Entries stored before the field existed read as revision 0,
 * so no IndexedDB migration is needed. Limitation: a writer that replaces a
 * record without bumping it (a pre-fix build still open in another tab, or a
 * raw put()) is invisible to the token.
 */
function revisionOf(entry: OutboxEntry): number {
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
   * Settle a claimed entry against the revision that was pushed, in ONE
   * readwrite transaction. While the entry still holds `expectedRevision`,
   * `onMatch` writes the outcome. Otherwise a save replaced it while the push
   * was in flight: keep the newer content and clear the lease explicitly, so
   * the next round sends it now rather than after a lease runs out.
   */
  private settle(
    id: string,
    expectedRevision: number,
    onMatch: (tx: StorageTx, current: OutboxEntry) => Promise<void>
  ): Promise<void> {
    return this.driver.transaction({ mode: "readwrite", stores: ["outbox"] }, async (tx) => {
      const current = await tx.get<OutboxEntry>("outbox", id);
      if (!current) return; // already settled elsewhere (another tab) or cleared
      if (revisionOf(current) !== expectedRevision) {
        await tx.put("outbox", { ...current, leaseUntil: undefined });
        return;
      }
      await onMatch(tx, current);
    });
  }

  /**
   * Compare-and-delete on delivery (P0-02): deletes the entry only if it
   * still holds `expectedRevision`, the claimed snapshot's revision (absent =
   * 0, as for a stored entry). A newer save that replaced it is kept.
   */
  async ack(id: string, expectedRevision = 0): Promise<void> {
    await this.settle(id, expectedRevision, (tx) => tx.delete("outbox", id));
  }

  /** Record a failure and schedule the retry. */
  async fail(id: string, err: string, nextAttemptAt: number): Promise<void> {
    const entry = await this.driver.get<OutboxEntry>("outbox", id);
    if (!entry) return;
    await this.driver.put("outbox", {
      ...entry,
      attempts: entry.attempts + 1,
      lastError: err,
      nextAttemptAt,
      leaseUntil: undefined,
    });
  }

  async releaseLease(id: string): Promise<void> {
    const entry = await this.driver.get<OutboxEntry>("outbox", id);
    if (!entry) return;
    await this.driver.put("outbox", { ...entry, leaseUntil: undefined });
  }

  async depth(): Promise<number> {
    return this.driver.count("outbox");
  }

  async peekOldest(): Promise<OutboxEntry | undefined> {
    const all = await this.driver.getAll<OutboxEntry>("outbox");
    return all.sort((a, b) => (a.id < b.id ? -1 : 1))[0];
  }
}
