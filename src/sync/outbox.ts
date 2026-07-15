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

  /** Delete on delivery success. */
  async ack(id: string): Promise<void> {
    await this.driver.delete("outbox", id);
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
