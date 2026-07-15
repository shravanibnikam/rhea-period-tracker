/**
 * sync/cursor.ts — per-scope pull cursor persistence (M1.8 / spec §2.5,
 * §0.10.I). The server cursor advances ONLY after a pulled page has been
 * durably reconciled, so a crash re-pulls the last page (reconcile is
 * idempotent by §4).
 */

import type { StorageDriver } from "@/data/drivers/StorageDriver";
import type { SyncScope } from "@/data/envelope";
import type { SyncCursor } from "./types";

export class CursorStore {
  constructor(private readonly driver: StorageDriver) {}

  async get(scope: SyncScope, peerId: string): Promise<SyncCursor> {
    const stored = await this.driver.get<SyncCursor>("sync_cursors", scope);
    if (stored && stored.peerId === peerId) return stored;
    // Fresh scope (or the peer changed — e.g. re-pair): start from epoch-0.
    return {
      scope,
      peerId,
      serverCursor: "",
      highWater: "",
      updatedAt: 0,
    };
  }

  async set(cursor: SyncCursor): Promise<void> {
    await this.driver.put("sync_cursors", cursor);
  }

  async reset(scope: SyncScope): Promise<void> {
    await this.driver.delete("sync_cursors", scope);
  }
}
