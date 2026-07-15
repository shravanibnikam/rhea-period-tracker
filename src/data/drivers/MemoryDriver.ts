/**
 * MemoryDriver — in-memory StorageDriver for unit tests (spec Chapter 6 §1).
 * Behaves like IndexedDB where it matters for the contract: key-ordered
 * getAll, keyPath extraction, out-of-line keys, atomic multi-store
 * transactions (rollback on throw), and paged by_updatedAt index reads.
 */

import { ErrorCode } from "@/kernel";
import { StorageError } from "../errors";
import {
  DB_VERSION,
  CURRENT_STORES,
  type StoreName,
  type StoreDef,
  type IndexName,
} from "../schema";
import type {
  StorageDriver,
  StorageIdentity,
  StorageTx,
  TxOptions,
  Page,
} from "./StorageDriver";

export class MemoryDriver implements StorageDriver {
  readonly identity: StorageIdentity;
  readonly schemaVersion: number;

  private stores = new Map<StoreName, Map<string, unknown>>();
  private defs = new Map<StoreName, StoreDef>();
  private autoKeys = new Map<StoreName, number>();

  constructor(identity?: Partial<StorageIdentity>, storeDefs: readonly StoreDef[] = CURRENT_STORES) {
    this.identity = {
      dbName: identity?.dbName ?? "rhea-memory",
      accountId: identity?.accountId ?? null,
      role: identity?.role ?? "local",
    };
    this.schemaVersion = DB_VERSION;
    for (const def of storeDefs) {
      this.stores.set(def.name, new Map());
      this.defs.set(def.name, def);
      this.autoKeys.set(def.name, 0);
    }
  }

  private table(store: StoreName): Map<string, unknown> {
    const t = this.stores.get(store);
    if (!t) {
      throw new StorageError(ErrorCode.STORAGE_UNAVAILABLE, `no such store: ${store}`);
    }
    return t;
  }

  private resolveKey(store: StoreName, value: unknown, key?: IDBValidKey): string {
    if (key !== undefined) return String(key);
    const def = this.defs.get(store);
    if (def?.keyPath) {
      const k = (value as Record<string, unknown>)[def.keyPath];
      if (k === undefined) {
        throw new StorageError(ErrorCode.DECODE_FAILED, `value missing keyPath ${def.keyPath}`);
      }
      return String(k);
    }
    if (def?.autoIncrement) {
      const next = (this.autoKeys.get(store) ?? 0) + 1;
      this.autoKeys.set(store, next);
      return String(next);
    }
    throw new StorageError(ErrorCode.DECODE_FAILED, "out-of-line store requires a key");
  }

  async ready(): Promise<void> {}

  async get<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
    return this.table(store).get(String(key)) as T | undefined;
  }

  async getAll<T>(store: StoreName): Promise<T[]> {
    const t = this.table(store);
    return [...t.keys()].sort().map((k) => t.get(k) as T);
  }

  async getAllKeys(store: StoreName): Promise<IDBValidKey[]> {
    return [...this.table(store).keys()].sort();
  }

  async put<T>(store: StoreName, value: T, key?: IDBValidKey): Promise<void> {
    this.table(store).set(this.resolveKey(store, value, key), value);
  }

  async delete(store: StoreName, key: IDBValidKey): Promise<void> {
    this.table(store).delete(String(key));
  }

  async clear(store: StoreName): Promise<void> {
    this.table(store).clear();
  }

  async count(store: StoreName): Promise<number> {
    return this.table(store).size;
  }

  async getByIndexSince<T>(
    store: StoreName,
    index: IndexName,
    since: string,
    limit: number,
    cursor?: string
  ): Promise<Page<T>> {
    const def = this.defs.get(store);
    const idx = def?.indexes?.find((i) => i.name === index);
    if (!idx) {
      throw new StorageError(ErrorCode.STORAGE_UNAVAILABLE, `no index ${index} on ${store}`);
    }
    const t = this.table(store);
    const rows = [...t.entries()]
      .map(([pKey, value]) => ({
        pKey,
        iKey: String((value as Record<string, unknown>)[idx.keyPath] ?? ""),
        value,
      }))
      .filter((r) => (since ? r.iKey >= since : true))
      .sort((a, b) =>
        a.iKey === b.iKey ? (a.pKey < b.pKey ? -1 : 1) : a.iKey < b.iKey ? -1 : 1
      );

    const resume = cursor ? (JSON.parse(cursor) as { i: string; p: string }) : null;
    const after = resume
      ? rows.filter(
          (r) => r.iKey > resume.i || (r.iKey === resume.i && r.pKey > resume.p)
        )
      : rows;

    const items = after.slice(0, limit);
    const exhausted = items.length === after.length;
    const last = items[items.length - 1];
    return {
      items: items.map((r) => r.value as T),
      cursor: exhausted || !last ? undefined : JSON.stringify({ i: last.iKey, p: last.pKey }),
    };
  }

  async transaction<R>(
    opts: TxOptions,
    work: (tx: StorageTx) => Promise<R>
  ): Promise<R> {
    // Snapshot participating stores for rollback-on-throw.
    const snapshots = new Map<StoreName, Map<string, unknown>>();
    for (const s of opts.stores) snapshots.set(s, new Map(this.table(s)));

    const guard = (store: StoreName) => {
      if (!opts.stores.includes(store)) {
        throw new StorageError(
          ErrorCode.STORAGE_UNAVAILABLE,
          `store ${store} not in transaction scope`
        );
      }
      if (opts.mode === "readonly") {
        throw new StorageError(ErrorCode.STORAGE_UNAVAILABLE, "readonly transaction");
      }
    };

    const handle: StorageTx = {
      get: (store, key) => this.get(store, key),
      getAll: (store) => this.getAll(store),
      put: async (store, value, key) => {
        guard(store);
        await this.put(store, value, key);
      },
      delete: async (store, key) => {
        guard(store);
        await this.delete(store, key);
      },
      getByIndexSince: (store, index, since, limit, cursor) =>
        this.getByIndexSince(store, index, since, limit, cursor),
    };

    try {
      return await work(handle);
    } catch (e) {
      for (const [name, snap] of snapshots) this.stores.set(name, snap);
      throw e;
    }
  }

  async close(): Promise<void> {}

  async destroy(): Promise<void> {
    for (const t of this.stores.values()) t.clear();
  }

  onBlocked(): void {}
  onBlocking(): void {}
  onVersionChange(): void {}
}
