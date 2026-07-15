/**
 * IndexedDbDriver — the web StorageDriver over `idb` (spec Chapter 6 §1).
 * M1.4: opens the EXACT v1 layout the legacy lib/db.ts created (logs + meta);
 * the v2 upgrade (new stores + by_updatedAt index) arrives in M1.5 through
 * data/migrations. The upgrade callback is delegated so migrations own it.
 */

import { openDB, deleteDB, type IDBPDatabase, type IDBPTransaction } from "idb";
import { ErrorCode } from "@/kernel";
import { StorageError } from "../errors";
import {
  DB_VERSION,
  type StoreName,
  type StoreDef,
  type IndexName,
} from "../schema";
import { upgradeRhea } from "../migrations/indexeddb";
import type {
  StorageDriver,
  StorageIdentity,
  StorageTx,
  TxOptions,
  Page,
} from "./StorageDriver";

type UpgradeFn = (
  db: IDBPDatabase,
  oldVersion: number,
  newVersion: number | null,
  tx: IDBPTransaction<unknown, string[], "versionchange">
) => void;

/** Default upgrade: create any missing store/index declared for this version. */
export function applySchema(db: IDBPDatabase, stores: readonly StoreDef[]): void {
  for (const def of stores) {
    if (!db.objectStoreNames.contains(def.name)) {
      const store = db.createObjectStore(def.name, {
        keyPath: def.keyPath ?? undefined,
        autoIncrement: def.autoIncrement ?? false,
      });
      for (const idx of def.indexes ?? []) {
        store.createIndex(idx.name, idx.keyPath);
      }
    }
  }
}

export class IndexedDbDriver implements StorageDriver {
  readonly identity: StorageIdentity;
  readonly schemaVersion: number;

  private db: IDBPDatabase | null = null;
  private opening: Promise<IDBPDatabase> | null = null;
  private blockedHandlers: Array<() => void> = [];
  private blockingHandlers: Array<() => void> = [];
  private versionChangeHandlers: Array<() => void> = [];
  private readonly upgrade: UpgradeFn;

  constructor(
    identity: StorageIdentity,
    opts?: { version?: number; upgrade?: UpgradeFn }
  ) {
    this.identity = identity;
    this.schemaVersion = opts?.version ?? DB_VERSION;
    // Default upgrade path is the versioned migration chain (M1.5+); tests may
    // inject a custom schema via opts.upgrade.
    this.upgrade = opts?.upgrade ?? upgradeRhea;
  }

  private open(): Promise<IDBPDatabase> {
    if (this.db) return Promise.resolve(this.db);
    if (!this.opening) {
      this.opening = openDB(this.identity.dbName, this.schemaVersion, {
        upgrade: (db, oldV, newV, tx) => this.upgrade(db, oldV, newV, tx),
        blocked: () => this.blockedHandlers.forEach((h) => h()),
        blocking: () => this.blockingHandlers.forEach((h) => h()),
        terminated: () => {
          this.db = null;
          this.opening = null;
        },
      }).then((db) => {
        db.onversionchange = () => this.versionChangeHandlers.forEach((h) => h());
        this.db = db;
        return db;
      });
    }
    return this.opening;
  }

  async ready(): Promise<void> {
    await this.open();
  }

  async get<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
    return (await this.open()).get(store, key) as Promise<T | undefined>;
  }

  async getAll<T>(store: StoreName): Promise<T[]> {
    return (await this.open()).getAll(store) as Promise<T[]>;
  }

  async getAllKeys(store: StoreName): Promise<IDBValidKey[]> {
    return (await this.open()).getAllKeys(store);
  }

  async put<T>(store: StoreName, value: T, key?: IDBValidKey): Promise<void> {
    await (await this.open()).put(store, value, key);
  }

  async delete(store: StoreName, key: IDBValidKey): Promise<void> {
    await (await this.open()).delete(store, key);
  }

  async clear(store: StoreName): Promise<void> {
    await (await this.open()).clear(store);
  }

  async count(store: StoreName): Promise<number> {
    return (await this.open()).count(store);
  }

  async getByIndexSince<T>(
    store: StoreName,
    index: IndexName,
    since: string,
    limit: number,
    cursor?: string
  ): Promise<Page<T>> {
    const db = await this.open();
    const tx = db.transaction(store, "readonly");
    return readIndexSince<T>(tx.objectStore(store), index, since, limit, cursor);
  }

  async transaction<R>(
    opts: TxOptions,
    work: (tx: StorageTx) => Promise<R>
  ): Promise<R> {
    const db = await this.open();
    const tx = db.transaction(opts.stores, opts.mode);
    const handle: StorageTx = {
      get: (store, key) => tx.objectStore(store).get(key),
      getAll: (store) => tx.objectStore(store).getAll(),
      put: async (store, value, key) => {
        // idb types put/delete as possibly-undefined on a generic-mode tx;
        // they exist whenever the tx was opened readwrite.
        await tx.objectStore(store).put!(value, key);
      },
      delete: async (store, key) => {
        await tx.objectStore(store).delete!(key);
      },
      getByIndexSince: (store, index, since, limit, cursor) =>
        readIndexSince(tx.objectStore(store), index, since, limit, cursor),
    };
    try {
      const result = await work(handle);
      await tx.done;
      return result;
    } catch (e) {
      // Observe tx.done BEFORE aborting: abort() rejects it with AbortError,
      // which would otherwise surface as an unhandled rejection.
      tx.done.catch(() => {});
      try {
        tx.abort();
      } catch {
        /* already aborted/committed */
      }
      if (e instanceof StorageError) throw e;
      throw new StorageError(ErrorCode.STORAGE_UNAVAILABLE, "transaction failed", {
        cause: e,
      });
    }
  }

  async close(): Promise<void> {
    const db = this.db ?? (this.opening ? await this.opening : null);
    db?.close();
    this.db = null;
    this.opening = null;
  }

  async destroy(): Promise<void> {
    await this.close();
    await deleteDB(this.identity.dbName, {
      blocked: () => this.blockedHandlers.forEach((h) => h()),
    });
  }

  onBlocked(handler: () => void): void {
    this.blockedHandlers.push(handler);
  }
  onBlocking(handler: () => void): void {
    this.blockingHandlers.push(handler);
  }
  onVersionChange(handler: () => void): void {
    this.versionChangeHandlers.push(handler);
  }
}

/**
 * Paged ascending read over an index from `since` (inclusive). The opaque
 * continuation token encodes the last (indexKey, primaryKey) pair so pages
 * resume exactly where they stopped even when index values repeat.
 */
async function readIndexSince<T>(
  store: {
    index: (name: string) => {
      openCursor: (
        range: IDBKeyRange | null
      ) => Promise<{
        key: IDBValidKey;
        primaryKey: IDBValidKey;
        value: unknown;
        continue: () => Promise<unknown | null>;
      } | null>;
    };
  },
  index: string,
  since: string,
  limit: number,
  cursorToken?: string
): Promise<Page<T>> {
  const range = since ? IDBKeyRange.lowerBound(since) : null;
  const resume = cursorToken
    ? (JSON.parse(cursorToken) as { i: string; p: string })
    : null;

  const items: T[] = [];
  let last: { i: string; p: string } | null = null;

  // idb cursors: iterate and filter past the resume point.
  let cur = (await store.index(index).openCursor(range)) as {
    key: IDBValidKey;
    primaryKey: IDBValidKey;
    value: unknown;
    continue: () => Promise<unknown | null>;
  } | null;

  while (cur && items.length < limit) {
    const iKey = String(cur.key);
    const pKey = String(cur.primaryKey);
    const beforeResume =
      resume !== null &&
      (iKey < resume.i || (iKey === resume.i && pKey <= resume.p));
    if (!beforeResume) {
      items.push(cur.value as T);
      last = { i: iKey, p: pKey };
    }
    cur = (await cur.continue()) as typeof cur;
  }

  const exhausted = cur === null;
  return {
    items,
    cursor: exhausted || !last ? undefined : JSON.stringify(last),
  };
}
