/**
 * LogRepository — the only reader/writer of the `logs` store (spec Chapter 6).
 * Every mutation stamps an HLC `updatedAt` + `deviceId` (RHEA-038) inside one
 * transaction with the row itself; deletes write a tombstone. When an outbox
 * is attached (sync enabled, M1.8+), the SyncRecord is enqueued in the SAME
 * transaction — a record is never persisted without its push intent (§1.5).
 */

import type { DailyLog } from "@/domain/types";
import type { StorageDriver, StorageTx } from "../drivers/StorageDriver";
import { logKey, sealPlain, type SyncedRow, type TombstoneRow, type SyncRecord } from "../envelope";
import { nextStamp, type SyncStamp } from "../syncStamp";

export type StoredLog = SyncedRow<DailyLog>;

/** Same-transaction enqueue seam; implemented by sync/Outbox (M1.8). */
export interface TxEnqueuer {
  enqueueCoalescedTx(
    tx: StorageTx,
    record: SyncRecord,
    dest: SyncRecord["scope"]
  ): Promise<void>;
}

export interface LogRepositoryOptions {
  /** When present, every save/delete also enqueues a SyncRecord atomically. */
  outbox?: TxEnqueuer;
  /** Wall-clock source for HLC stamping (injectable for tests). */
  now?: () => number;
}

export class LogRepository {
  constructor(
    private readonly driver: StorageDriver,
    private readonly opts: LogRepositoryOptions = {}
  ) {}

  async save(log: DailyLog): Promise<void> {
    await this.saveAll([log]);
  }

  async saveAll(logs: DailyLog[]): Promise<void> {
    const stores: Array<"logs" | "meta" | "outbox"> = this.opts.outbox
      ? ["logs", "meta", "outbox"]
      : ["logs", "meta"];
    await this.driver.transaction({ mode: "readwrite", stores }, async (tx) => {
      for (const log of logs) {
        const stamp = await nextStamp(tx, this.opts.now?.());
        const domain: DailyLog = { medication: [], intimacy: null, ...log };
        const row: StoredLog = { ...domain, ...stamp, deleted: false };
        await tx.put("logs", row);
        if (this.opts.outbox) {
          await this.opts.outbox.enqueueCoalescedTx(
            tx,
            this.toRecord(domain, stamp),
            "owner"
          );
        }
      }
    });
  }

  private toRecord(domain: DailyLog, stamp: SyncStamp): SyncRecord {
    return {
      key: logKey(domain.date),
      scope: "owner",
      payload: sealPlain(domain), // PlainEnvelope until M2.4 seals with the DEK
      updatedAt: stamp.updatedAt,
      deviceId: stamp.deviceId,
      deleted: false,
    };
  }

  async get(date: string): Promise<DailyLog | undefined> {
    return this.driver.get<StoredLog>("logs", date);
  }

  async getAll(): Promise<DailyLog[]> {
    return this.driver.getAll<StoredLog>("logs");
  }

  /** Rows including sync metadata — used by export v2 and the SyncEngine. */
  async getAllStored(): Promise<StoredLog[]> {
    return this.driver.getAll<StoredLog>("logs");
  }

  /** Delete = remove the row AND record a tombstone so the delete propagates. */
  async delete(date: string): Promise<void> {
    const stores: Array<"logs" | "meta" | "tombstones" | "outbox"> = this.opts.outbox
      ? ["logs", "meta", "tombstones", "outbox"]
      : ["logs", "meta", "tombstones"];
    await this.driver.transaction({ mode: "readwrite", stores }, async (tx) => {
      const stamp = await nextStamp(tx, this.opts.now?.());
      await tx.delete("logs", date);
      const tombstone: TombstoneRow = {
        key: logKey(date),
        scope: "owner",
        deletedAt: stamp.updatedAt,
        deviceId: stamp.deviceId,
        acked: false,
      };
      await tx.put("tombstones", tombstone);
      if (this.opts.outbox) {
        await this.opts.outbox.enqueueCoalescedTx(
          tx,
          {
            key: logKey(date),
            scope: "owner",
            payload: null,
            updatedAt: stamp.updatedAt,
            deviceId: stamp.deviceId,
            deleted: true,
          },
          "owner"
        );
      }
    });
  }

  async count(): Promise<number> {
    return this.driver.count("logs");
  }

  async clear(): Promise<void> {
    await this.driver.clear("logs");
  }
}
