/**
 * sync/initialSeed.ts — the one-time outbox seed after the v1→v2 upgrade
 * (M1.9 / spec Ch6 §2 "first-sync rule"). Replaces the legacy
 * pull-then-overwrite flow: every local log is enqueued (epoch-0 rows lose
 * LWW against any real server row but fill keys the server lacks), so the
 * first authenticated sync is a MERGE, never an overwrite.
 */

import type { StorageDriver } from "@/data/drivers/StorageDriver";
import type { DailyLog } from "@/domain/types";
import type { SyncedRow } from "@/data/envelope";
import { logKey, sealPlain } from "@/data/envelope";
import { META_NEEDS_INITIAL_SEED } from "@/data/schema";
import type { Outbox } from "./outbox";

export async function seedInitialOutbox(driver: StorageDriver, outbox: Outbox): Promise<number> {
  const needsSeed = await driver.get<boolean>("meta", META_NEEDS_INITIAL_SEED);
  if (!needsSeed) return 0;

  const rows = await driver.getAll<SyncedRow<DailyLog>>("logs");
  for (const row of rows) {
    const { updatedAt, deviceId, deleted: _d, ...domain } = row;
    await outbox.enqueueCoalesced(
      {
        key: logKey(domain.date),
        scope: "owner",
        payload: sealPlain(domain),
        updatedAt,
        deviceId,
        deleted: false,
      },
      "owner"
    );
  }
  await driver.put("meta", false, META_NEEDS_INITIAL_SEED);
  return rows.length;
}
