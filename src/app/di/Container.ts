/**
 * app/di/Container.ts — THE composition root (M1.10 / RHEA-056). Owns account
 * scoping (StorageManager), repository construction, and the sync-engine
 * lifecycle. Everything the deleted lib/db.ts + lib/syncBootstrap.ts glue did
 * now lives here, injected instead of imported ad hoc.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { DailyLog } from "@/domain/types";
import { StorageManager, identityFor } from "@/data/storageManager";
import { LogRepository, MetaRepository } from "@/data/repositories";
import { copyForwardFromLegacy } from "@/data/legacyImport";
import type { StorageDriver } from "@/data/drivers/StorageDriver";
import { ensureDeviceId } from "@/data/syncStamp";
import { buildExport, type ExportDataV2 } from "@/data/exporter";
import {
  parseBackup,
  applyBackup,
  applyImportedLogs,
  type ApplyResult,
} from "@/data/importer";
import {
  SyncEngine,
  SupabaseTransport,
  NullTransport,
  seedInitialOutbox,
} from "@/sync";

export class Container {
  private readonly manager = new StorageManager({ onOpen: copyForwardFromLegacy });
  private uid: string | null = null;
  private engine: SyncEngine | null = null;

  // ── Account scoping (per-account DB name; M0.4 semantics) ─────────────────
  /**
   * Point the store at a specific account. Call on session change BEFORE
   * reading or writing. Switching closes the previous handle; the next access
   * opens the new database (rhea-<uid> / rhea-local).
   */
  setAccount(uid: string | null): void {
    if (uid === this.uid && this.manager.current()) return;
    this.uid = uid;
    void this.manager.closeCurrent();
  }

  async closeDB(): Promise<void> {
    await this.manager.closeCurrent();
  }

  // ── Wiring ────────────────────────────────────────────────────────────────
  async driver(): Promise<StorageDriver> {
    return this.manager.acquire(identityFor(this.uid));
  }

  async logs(): Promise<LogRepository> {
    return new LogRepository(await this.driver(), { outbox: this.engine?.outbox });
  }

  async meta(): Promise<MetaRepository> {
    return new MetaRepository(await this.driver());
  }

  async getDeviceId(): Promise<string> {
    const d = await this.driver();
    return d.transaction({ mode: "readwrite", stores: ["meta"] }, (tx) =>
      ensureDeviceId(tx)
    );
  }

  // ── Daily logs / meta (the app-facing persistence API) ───────────────────
  async saveLog(log: DailyLog): Promise<void> {
    await (await this.logs()).save(log);
    void this.engine?.flush("enqueue").catch(() => {});
  }

  async getLog(date: string): Promise<DailyLog | undefined> {
    return (await this.logs()).get(date);
  }

  async getAllLogs(): Promise<DailyLog[]> {
    return (await this.logs()).getAll();
  }

  async deleteLog(date: string): Promise<void> {
    await (await this.logs()).delete(date);
    void this.engine?.flush("enqueue").catch(() => {});
  }

  async getMeta<T>(key: string): Promise<T | undefined> {
    return (await this.meta()).get<T>(key);
  }

  async setMeta(key: string, value: unknown): Promise<void> {
    await (await this.meta()).set(key, value);
  }

  // ── Backup / erase ────────────────────────────────────────────────────────
  async exportBackup(): Promise<ExportDataV2> {
    const logRepo = await this.logs();
    const metaRepo = await this.meta();
    return buildExport({
      logs: await logRepo.getAllStored(),
      meta: await metaRepo.entries(),
      deviceId: await this.getDeviceId(),
    });
  }

  async importBackup(text: string): Promise<ApplyResult> {
    return applyBackup(await this.logs(), await this.meta(), parseBackup(text));
  }

  async importParsedLogs(parsed: DailyLog[]): Promise<ApplyResult> {
    return applyImportedLogs(await this.logs(), parsed);
  }

  async eraseAllData(): Promise<void> {
    const d = await this.driver();
    for (const store of [
      "logs",
      "meta",
      "outbox",
      "keyring",
      "projections",
      "tombstones",
      "sync_cursors",
      "audit",
    ] as const) {
      await d.clear(store);
    }
  }

  /** Wipe the active account's local store (partner sign-out policy, M0.4). */
  async wipeLocalData(): Promise<void> {
    await this.eraseAllData();
  }

  // ── Sync lifecycle (M1.9) ─────────────────────────────────────────────────
  syncEngine(): SyncEngine | null {
    return this.engine;
  }

  isSyncEngineActive(): boolean {
    return this.engine !== null;
  }

  /**
   * Compose + start the owner SyncEngine. Owner scope only — partners keep
   * the legacy read-only pull until the E2EE projection path (M2.9).
   */
  async startOwnerSync(uid: string, client: SupabaseClient | null): Promise<SyncEngine> {
    if (this.engine) return this.engine;
    const driver = await this.driver();
    const engine = new SyncEngine({
      deviceId: await this.getDeviceId(),
      selfPeerId: uid,
      scopes: ["owner"],
      transport: client ? new SupabaseTransport(client) : new NullTransport(),
      driver,
    });
    await seedInitialOutbox(driver, engine.outbox); // one-time post-upgrade merge-up
    this.engine = engine; // repository writes now enqueue atomically
    await engine.start();
    return engine;
  }

  async stopOwnerSync(): Promise<void> {
    const engine = this.engine;
    this.engine = null;
    await engine?.stop();
  }
}
