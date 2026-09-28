/**
 * LogRepository — the only reader/writer of the `logs` store (spec Chapter 6).
 * Every mutation stamps an HLC `updatedAt` + `deviceId` (RHEA-038) inside one
 * transaction with the row itself; deletes write a tombstone. When an outbox
 * is attached (sync enabled, M1.8+), the SyncRecord is enqueued in the SAME
 * transaction — a record is never persisted without its push intent (§1.5).
 */

import { emptyLog, type DailyLog } from "@/domain/types";
import type { StorageDriver, StorageTx } from "../drivers/StorageDriver";
import { logKey, sealPlain, type SyncedRow, type TombstoneRow, type SyncRecord } from "../envelope";
import { nextStamp, type SyncStamp } from "../syncStamp";

export type StoredLog = SyncedRow<DailyLog>;

/** A merge-defined input: the date key plus only the fields to overwrite. */
export type DailyLogPatch = Pick<DailyLog, "date"> & Partial<DailyLog>;

/**
 * saveAll's arguments (P0-01). "replace" (default) writes each log as the
 * whole record — DailyLogSheet / the symptom toggles save a log they just
 * rendered. "merge-defined" overlays only the patch's defined fields onto the
 * stored row, so Quick Add sets flow without wiping notes, symptoms, etc.
 */
export type SaveLogsArgs =
  | [logs: DailyLog[], opts?: { mode?: "replace" }]
  | [logs: DailyLogPatch[], opts: { mode: "merge-defined" }];

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

  /** Save a batch in ONE transaction; resolves to the persisted domain records. */
  async saveAll(...[logs, opts]: SaveLogsArgs): Promise<DailyLog[]> {
    const merge = opts?.mode === "merge-defined";
    return this.driver.transaction({ mode: "readwrite", stores: this.writeStores() }, async (tx) => {
      const saved: DailyLog[] = [];
      for (const log of logs) {
        const prior = await tx.get<StoredLog>("logs", log.date);
        // merge-defined keeps every stored field the patch leaves undefined;
        // replace-mode inputs are whole DailyLogs (SaveLogsArgs), as before.
        const domain: DailyLog = merge
          ? mergeDefined(prior, log)
          : { medication: [], intimacy: null, ...(log as DailyLog) };
        await this.writeRow(tx, domain, prior);
        saved.push(domain);
      }
      return saved;
    });
  }

  /**
   * Add or remove exactly one symptom on a day's STORED row, in ONE
   * transaction: read, change that symptom only, write, enqueue (P0-N2). Every
   * other field and symptom is kept, including ones another device added, so
   * a view that has not caught up with a sync can never clobber the row.
   * Resolves to the stored record, or undefined when the day has no log and
   * there was nothing to remove. A symptom already in that state writes nothing.
   */
  async setSymptom(date: string, symptom: string, present: boolean): Promise<DailyLog | undefined> {
    return this.driver.transaction({ mode: "readwrite", stores: this.writeStores() }, async (tx) => {
      const prior = await tx.get<StoredLog>("logs", date);
      const current = mergeDefined(prior, { date });
      const symptoms = current.symptoms ?? [];
      if (symptoms.includes(symptom) === present) return prior ? current : undefined;
      const domain: DailyLog = {
        ...current,
        symptoms: present ? [...symptoms, symptom] : symptoms.filter((s) => s !== symptom),
      };
      await this.writeRow(tx, domain, prior);
      return domain;
    });
  }

  private writeStores(): Array<"logs" | "meta" | "outbox"> {
    return this.opts.outbox ? ["logs", "meta", "outbox"] : ["logs", "meta"];
  }

  /** Stamp, store and (with an outbox) enqueue one row, inside the caller's transaction. */
  private async writeRow(tx: StorageTx, domain: DailyLog, prior: StoredLog | undefined): Promise<void> {
    // Fold the row's own current HLC so an edit strictly dominates the
    // version it replaces (even if authored by another device / lagging clock).
    const stamp = await nextStamp(tx, this.opts.now?.(), prior?.updatedAt);
    const row: StoredLog = { ...domain, ...stamp, deleted: false };
    await tx.put("logs", row);
    if (this.opts.outbox) {
      await this.opts.outbox.enqueueCoalescedTx(tx, this.toRecord(domain, stamp), "owner");
    }
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
      // Fold the row's own current HLC so the tombstone strictly dominates the
      // row it deletes — otherwise a lagging local clock produces a stale HLC
      // the server LWW guard silently drops (RHEA delete-sync fix).
      const prior = await tx.get<StoredLog>("logs", date);
      const stamp = await nextStamp(tx, this.opts.now?.(), prior?.updatedAt);
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

/**
 * merge-defined (P0-01): the defaults an absent row gets under replace, then
 * the stored row's DOMAIN fields, then only the patch fields that are defined
 * (`undefined` = leave as is). The result is what gets stored AND enqueued.
 */
function mergeDefined(prior: StoredLog | undefined, patch: DailyLogPatch): DailyLog {
  let stored: DailyLog | undefined;
  if (prior) {
    // Sync metadata is not domain data: saveAll re-stamps the row.
    const { updatedAt: _updatedAt, deviceId: _deviceId, deleted: _deleted, ...domain } = prior;
    stored = domain;
  }
  const defined = Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined)
  );
  return { medication: [], intimacy: null, ...emptyLog(patch.date), ...stored, ...defined };
}
