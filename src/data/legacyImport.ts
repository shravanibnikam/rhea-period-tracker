/**
 * One-time, idempotent import from the pre-scoping `rhea` database into a
 * freshly-opened, still-empty scoped database (M0.4 behavior, rehosted on the
 * StorageDriver seam in M1.4). Non-destructive: the legacy DB is left intact —
 * only a "consumed" marker is written — so rollback stays lossless.
 */

import type { DailyLog } from "@/domain/types";
import type { StorageDriver } from "./drivers/StorageDriver";
import { IndexedDbDriver, applySchema } from "./drivers/IndexedDbDriver";
import { STORES_V1 } from "./schema";

export const LEGACY_DB_NAME = "rhea";
// Meta key marking the legacy DB as imported into exactly one account.
export const LEGACY_CONSUMED_KEY = "_legacyImportedTo";

export async function copyForwardFromLegacy(target: StorageDriver): Promise<void> {
  if (target.identity.dbName === LEGACY_DB_NAME) return; // never import into itself
  if ((await target.count("logs")) > 0) return; // already populated → no-op

  // Avoid materializing a phantom empty legacy DB if it does not exist.
  const existing = (await indexedDB.databases?.()) ?? [];
  if (!existing.some((d) => d.name === LEGACY_DB_NAME)) return;

  // The legacy DB stays at v1 forever — never migrated, only read + marked.
  const legacy = new IndexedDbDriver(
    { dbName: LEGACY_DB_NAME, accountId: null, role: "local" },
    { version: 1, upgrade: (db) => applySchema(db, STORES_V1) }
  );
  try {
    await legacy.ready();
    if (await legacy.get("meta", LEGACY_CONSUMED_KEY)) return; // imported already

    const logs = await legacy.getAll<DailyLog>("logs");
    if (logs.length === 0) return;

    const metaKeys = (await legacy.getAllKeys("meta")).map(String);
    await target.transaction(
      { mode: "readwrite", stores: ["logs", "meta"] },
      async (tx) => {
        for (const log of logs) await tx.put("logs", log);
        for (const key of metaKeys) {
          if (key === LEGACY_CONSUMED_KEY) continue;
          await tx.put("meta", await legacy.get("meta", key), key);
        }
      }
    );

    await legacy.put("meta", target.identity.dbName, LEGACY_CONSUMED_KEY);
  } catch {
    // Copy-forward is best-effort: a failure leaves both DBs untouched and the
    // next open retries. (No logging of contents — health data.)
  } finally {
    await legacy.close().catch(() => {});
  }
}
