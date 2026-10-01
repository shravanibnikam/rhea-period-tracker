/**
 * idbSyncRig — one device for interleaving tests (G-03): a REAL IndexedDB
 * database (IndexedDbDriver on fake-indexeddb) behind the InterleavingDriver,
 * its SyncEngine on a LatchedTransport, and the LogRepository the app writes
 * through (wired as Container.logs() wires it: a save and its outbox entry
 * commit in one transaction).
 *
 * Not MemoryDriver: its rollback restores a snapshot taken when its own
 * transaction began, erasing writes other transactions committed meanwhile,
 * so a compare-and-swap test on it is false in either direction.
 */

import "fake-indexeddb/auto";
import { IndexedDbDriver } from "@/data/drivers/IndexedDbDriver";
import { LogRepository } from "@/data/repositories";
import { openPlain, type SyncRecord } from "@/data/envelope";
import { emptyLog, type DailyLog } from "@/domain/types";
import { Outbox } from "@/sync/outbox";
import { SyncEngine } from "@/sync/SyncEngine";
import type { OutboxEntry } from "@/sync/types";
import { makeFakeClock } from "./fakeClock";
import { InterleavingDriver } from "./interleavingDriver";
import { LatchedTransport } from "./latchedTransport";

export const OWNER = "owner-uid-1";
export const DATE = "2026-03-14";

let seq = 0;

export function makeIdbSyncRig() {
  const clock = makeFakeClock();
  const transport = new LatchedTransport();
  const dbName = `rhea-interleave-${++seq}-${Math.random().toString(36).slice(2, 8)}`;
  const idb = new IndexedDbDriver({ dbName, accountId: OWNER, role: "owner" });
  const driver = new InterleavingDriver(idb);
  const engine = new SyncEngine({
    deviceId: "dev-a",
    selfPeerId: OWNER,
    scopes: ["owner"],
    transport,
    driver,
    backoff: { baseMs: 1_000, capMs: 60_000, random: () => 0.5 }, // delay(n) = 1000·2^n exactly
    now: clock.now,
    wakeDebounceMs: 0,
  });
  const repo = new LogRepository(driver, { outbox: engine.outbox, now: clock.now });
  const tabs: IndexedDbDriver[] = [];

  return {
    clock,
    transport,
    driver,
    engine,
    repo,
    /**
     * A second tab: its own connection to the SAME database, writing through
     * its own Outbox (as Container.logs() does while its engine is not running).
     */
    openTab(): LogRepository {
      const tab = new IndexedDbDriver({ dbName, accountId: OWNER, role: "owner" });
      tabs.push(tab);
      return new LogRepository(tab, { outbox: new Outbox(tab, clock.now), now: clock.now });
    },
    /** The outbox as stored (read past the decorator: never trips an armed interleave). */
    entries: (): Promise<OutboxEntry[]> => idb.getAll<OutboxEntry>("outbox"),
    /** What the server holds for this owner. */
    serverRows: () => transport.server.rows(OWNER, "owner"),
    async dispose(): Promise<void> {
      transport.clearLatches();
      for (const tab of tabs) await tab.close();
      await idb.destroy();
    },
  };
}

export type IdbSyncRig = ReturnType<typeof makeIdbSyncRig>;

/** A day's log whose notes name the version under test ("v1", "v2", ...). */
export function logWithNotes(notes: string, date: string = DATE): DailyLog {
  return { ...emptyLog(date), flow: "medium", notes };
}

/** The notes a pushed or queued record carries (a PlainEnvelope until E2EE). */
export function notesOf(record: SyncRecord): string | undefined {
  return record.payload ? openPlain<DailyLog>(record.payload)?.notes : undefined;
}
