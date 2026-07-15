/**
 * The IndexedDB migration chain (M1.5). IndexedDbDriver delegates its idb
 * `upgrade` callback here; each step is additive and guarded, so replaying on
 * an already-migrated database is a no-op.
 */

import type { IDBPDatabase, IDBPTransaction } from "idb";
import { migrateV1toV2 } from "./v1_to_v2";

export { migrateV1toV2, generateDeviceId } from "./v1_to_v2";

export async function upgradeRhea(
  db: IDBPDatabase,
  oldVersion: number,
  _newVersion: number | null,
  tx: IDBPTransaction<unknown, string[], "versionchange">
): Promise<void> {
  // v0 → v2 (fresh DB) and v1 → v2 share the same additive step; the backfill
  // only touches rows lacking a stamp, so both paths are safe.
  if (oldVersion < 2) {
    await migrateV1toV2(db, oldVersion, tx);
  }
}
