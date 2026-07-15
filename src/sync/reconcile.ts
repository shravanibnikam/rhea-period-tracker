/**
 * sync/reconcile.ts — apply pulled pages to local storage (M1.8 / spec Sync
 * ch. §4). The DECISION is pure (domain/merge.decideMerge); this module is
 * the I/O wrapper: it observes remote HLCs, loads local merge metadata,
 * applies winners, and writes tombstones. Idempotent — replaying a page
 * after a crash makes the same decisions and re-applies harmlessly.
 *
 * M1.8 handles the `owner` and `meta` scopes (partner `projection`/`note`
 * appliers register in M2.8/M2.10). Payloads are PlainEnvelopes until M2.4.
 */

import { hlcObserve, compareHlc, HLC_INITIAL_STATE, type HlcState } from "@/domain/hlc";
import { decideMerge, type MergeMeta } from "@/domain/merge";
import type { DailyLog } from "@/domain/types";
import type { StorageDriver, StorageTx } from "@/data/drivers/StorageDriver";
import { openPlain, type SyncScope, type TombstoneRow } from "@/data/envelope";
import type { SyncedRow } from "@/data/envelope";
import { META_HLC_STATE } from "@/data/schema";
import type { RemoteRow } from "./transports/Transport";
import type { PullResult } from "./types";

/** Bookkeeping key for merge metadata of synced meta records. */
const syncMetaKey = (logicalKey: string) => `_sync:${logicalKey}`;

export interface ReconcilerConfig {
  driver: StorageDriver;
  selfDeviceId: string;
  now?: () => number;
}

export class Reconciler {
  private readonly driver: StorageDriver;
  private readonly selfDeviceId: string;
  private readonly now: () => number;

  constructor(cfg: ReconcilerConfig) {
    this.driver = cfg.driver;
    this.selfDeviceId = cfg.selfDeviceId;
    this.now = cfg.now ?? Date.now;
  }

  /** Apply one pulled page. `fullPull` = pulling from an empty cursor (§4.4). */
  async apply(rows: RemoteRow[], scope: SyncScope, fullPull: boolean): Promise<PullResult> {
    if (scope !== "owner" && scope !== "meta") {
      // Projection/note appliers arrive with the partner milestones (M2.8+).
      return { applied: 0, skipped: rows.length, conflicts: 0 };
    }

    let applied = 0;
    let skipped = 0;
    let conflicts = 0;

    await this.driver.transaction(
      { mode: "readwrite", stores: ["logs", "meta", "tombstones"] },
      async (tx) => {
        // Fold every remote HLC BEFORE decisions (§3.3) so future local
        // stamps dominate everything seen in this page.
        let clock =
          (await tx.get<HlcState>("meta", META_HLC_STATE)) ?? HLC_INITIAL_STATE;
        for (const row of rows) {
          clock = hlcObserve(clock, row.updatedAt, this.now()).state;
        }
        await tx.put("meta", clock, META_HLC_STATE);

        for (const row of rows) {
          const local = await this.loadLocalMeta(tx, scope, row.key);
          const decision = decideMerge({
            remote: { updatedAt: row.updatedAt, deviceId: row.deviceId, deleted: row.deleted },
            local,
            selfDeviceId: this.selfDeviceId,
            fullPull,
          });

          if (decision.action === "skip") {
            skipped++;
            if (decision.reason === "older" || decision.reason === "tiebreak") conflicts++;
            continue;
          }
          if (decision.tombstone) {
            await this.applyTombstone(tx, scope, row);
          } else {
            await this.applyUpsert(tx, scope, row);
          }
          applied++;
        }
      }
    );

    return { applied, skipped, conflicts };
  }

  /** Local merge metadata: live row stamps, else tombstone, else bookkeeping. */
  private async loadLocalMeta(
    tx: StorageTx,
    scope: SyncScope,
    logicalKey: string
  ): Promise<MergeMeta | undefined> {
    const tombstone = await tx.get<TombstoneRow>("tombstones", logicalKey);
    if (scope === "owner") {
      const date = logicalKey.replace(/^log:/, "");
      const row = await tx.get<SyncedRow<DailyLog>>("logs", date);
      if (row?.updatedAt) {
        const rowMeta = {
          updatedAt: row.updatedAt,
          deviceId: row.deviceId,
          deleted: false,
        };
        // Both a live row and a tombstone may exist transiently; newest wins.
        if (tombstone && compareHlc(tombstone.deletedAt, row.updatedAt) > 0) {
          return {
            updatedAt: tombstone.deletedAt,
            deviceId: tombstone.deviceId,
            deleted: true,
          };
        }
        return rowMeta;
      }
    } else {
      const bookkeeping = await tx.get<MergeMeta>("meta", syncMetaKey(logicalKey));
      if (bookkeeping) return bookkeeping;
    }
    if (tombstone) {
      return {
        updatedAt: tombstone.deletedAt,
        deviceId: tombstone.deviceId,
        deleted: true,
      };
    }
    return undefined;
  }

  private async applyUpsert(tx: StorageTx, scope: SyncScope, row: RemoteRow): Promise<void> {
    if (!row.payload) return; // defensive: non-tombstone must carry a payload
    const value = openPlain(row.payload);
    if (value === undefined) {
      // Sealed envelope before crypto is wired (or unknown format): quarantine
      // by skipping — never crash, never advance per-key state (§4.5).
      return;
    }
    if (scope === "owner") {
      const log = value as DailyLog;
      const stored: SyncedRow<DailyLog> = {
        ...log,
        updatedAt: row.updatedAt,
        deviceId: row.deviceId,
        deleted: false,
      };
      await tx.put("logs", stored);
      // A winning live row supersedes any tombstone for the key (rebirth §6.1).
      await tx.delete("tombstones", row.key);
    } else {
      const name = row.key.replace(/^meta:/, "");
      await tx.put("meta", value, name);
      await tx.put(
        "meta",
        { updatedAt: row.updatedAt, deviceId: row.deviceId, deleted: false },
        syncMetaKey(row.key)
      );
      await tx.delete("tombstones", row.key);
    }
  }

  private async applyTombstone(tx: StorageTx, scope: SyncScope, row: RemoteRow): Promise<void> {
    const tombstone: TombstoneRow = {
      key: row.key,
      scope,
      deletedAt: row.updatedAt,
      deviceId: row.deviceId,
      acked: false,
    };
    await tx.put("tombstones", tombstone);
    if (scope === "owner") {
      await tx.delete("logs", row.key.replace(/^log:/, ""));
    } else {
      await tx.delete("meta", row.key.replace(/^meta:/, ""));
      await tx.put(
        "meta",
        { updatedAt: row.updatedAt, deviceId: row.deviceId, deleted: true },
        syncMetaKey(row.key)
      );
    }
  }
}
