/**
 * IndexedDB v1 → v2 migration (M1.5 / spec Chapter 6 §2).
 *
 * Strictly ADDITIVE and idempotent:
 *  - creates the six new stores + indexes (guarded by objectStoreNames checks),
 *  - adds by_updatedAt to `logs`,
 *  - backfills every existing log with the epoch-0 HLC + the new deviceId +
 *    deleted:false + v2 field defaults (medication [], intimacy null) — only
 *    for rows that don't already carry a stamp,
 *  - seeds meta: deviceId, hlcState, needsInitialSeed, dbSchemaVersion.
 *
 * Runs inside the versionchange transaction: if anything throws, IndexedDB
 * aborts the whole upgrade and the DB stays at v1 with its data intact
 * (forward-safe; a defective migration ships a corrective v2→v2', never a
 * downgrade). Epoch-0 stamps guarantee backfilled rows never win a merge
 * against real edits (§0.5).
 */

import type { IDBPDatabase, IDBPTransaction } from "idb";
import { epochZeroHlc, HLC_INITIAL_STATE } from "@/domain/hlc";
import {
  STORES_V2,
  META_DEVICE_ID,
  META_HLC_STATE,
  META_NEEDS_INITIAL_SEED,
  META_DB_SCHEMA_VERSION,
} from "../../schema";

type UpgradeTx = IDBPTransaction<unknown, string[], "versionchange">;

/** 128-bit random id, base64url (§0.10.K). */
export function generateDeviceId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function migrateV1toV2(
  db: IDBPDatabase,
  oldVersion: number,
  tx: UpgradeTx
): Promise<void> {
  // 1. Create every missing v2 store + its indexes (additive, idempotent).
  for (const def of STORES_V2) {
    if (!db.objectStoreNames.contains(def.name)) {
      const store = db.createObjectStore(def.name, {
        keyPath: def.keyPath ?? undefined,
        autoIncrement: def.autoIncrement ?? false,
      });
      for (const idx of def.indexes ?? []) store.createIndex(idx.name, idx.keyPath);
    } else {
      // Store exists (v1 `logs`/`meta`): add any missing index.
      const store = tx.objectStore(def.name);
      for (const idx of def.indexes ?? []) {
        if (!store.indexNames.contains(idx.name)) {
          store.createIndex(idx.name, idx.keyPath);
        }
      }
    }
  }

  // 2. Device identity + clock state (generated once, stored in meta).
  const meta = tx.objectStore("meta");
  let deviceId = (await meta.get(META_DEVICE_ID)) as string | undefined;
  if (!deviceId) {
    deviceId = generateDeviceId();
    await meta.put(deviceId, META_DEVICE_ID);
    await meta.put(HLC_INITIAL_STATE, META_HLC_STATE);
  }

  // 3. Backfill existing v1 logs with the epoch-0 stamp so they can merge
  //    without ever clobbering real data (upgrade from v1 only).
  let hadV1Logs = false;
  if (oldVersion >= 1) {
    const zero = epochZeroHlc(deviceId);
    let cursor = await tx.objectStore("logs").openCursor();
    while (cursor) {
      const row = cursor.value as Record<string, unknown>;
      if (row.updatedAt === undefined) {
        hadV1Logs = true;
        await cursor.update({
          medication: [],
          intimacy: null,
          ...row,
          updatedAt: zero,
          deviceId,
          deleted: false,
        });
      }
      cursor = await cursor.continue();
    }
  }

  // 4. First-sync gate: existing local data must be seeded into the outbox on
  //    the first authenticated sync after upgrade (merge, never overwrite).
  if (hadV1Logs && (await meta.get(META_NEEDS_INITIAL_SEED)) === undefined) {
    await meta.put(true, META_NEEDS_INITIAL_SEED);
  }
  await meta.put(2, META_DB_SCHEMA_VERSION);
}
