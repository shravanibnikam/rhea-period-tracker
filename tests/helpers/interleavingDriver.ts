/**
 * InterleavingDriver — the storage half of the interleaving harness (G-03).
 *
 * A StorageDriver decorator (over the real IndexedDbDriver) that runs a test's
 * concurrent write at the exact moment the code under test touches one keyed
 * entry: just after it READS that key (before it sees the value), or just
 * before it WRITES or DELETES it. That is the window a read-modify-write or a
 * blind delete is exposed in. One-shot: arm it, then trigger the operation.
 *
 * Two schedules, matching what IndexedDB itself permits:
 * - Primitive access (driver.get/put/delete, each its own transaction): the
 *   concurrent write runs to completion first, so it commits strictly inside
 *   the caller's read→write window — the worst case a non-transactional
 *   read-modify-write can meet.
 * - Access through a transaction handle: the concurrent write is started but
 *   not awaited. Its readwrite transaction queues behind the active one
 *   (awaiting it from inside would deadlock) and IndexedDB commits it after —
 *   the only order IndexedDB allows.
 */

import type {
  StorageDriver,
  StorageIdentity,
  StorageTx,
  TxOptions,
  Page,
} from "@/data/drivers/StorageDriver";
import { storeDef, type StoreName, type IndexName } from "@/data/schema";

export interface InterleaveHit {
  op: "get" | "put" | "delete";
  inTransaction: boolean;
}

export interface Interleave {
  /** How the armed key was first touched; null until it was. */
  readonly hit: InterleaveHit | null;
  /** Settles once the concurrent write has finished (rejects if it threw). */
  readonly done: Promise<void>;
}

interface Armed {
  store: StoreName;
  key: IDBValidKey;
  fire(hit: InterleaveHit): Promise<void>;
}

/** The key a put() addresses: explicit, else the store's in-line keyPath. */
function keyOf(store: StoreName, value: unknown, key?: IDBValidKey): IDBValidKey | undefined {
  if (key !== undefined) return key;
  const path = storeDef(store)?.keyPath;
  return path ? ((value as Record<string, unknown>)[path] as IDBValidKey | undefined) : undefined;
}

export class InterleavingDriver implements StorageDriver {
  private armed: Armed | null = null;

  constructor(readonly inner: StorageDriver) {}

  get identity(): StorageIdentity {
    return this.inner.identity;
  }

  get schemaVersion(): number {
    return this.inner.schemaVersion;
  }

  /**
   * Arm: the next get/put/delete of `key` in `store` — through this driver or
   * a transaction it opened — runs `concurrent` in that access's window.
   */
  interleaveAt(store: StoreName, key: IDBValidKey, concurrent: () => Promise<unknown>): Interleave {
    if (this.armed) throw new Error("InterleavingDriver: already armed");
    let resolveDone!: () => void;
    let rejectDone!: (e: unknown) => void;
    const done = new Promise<void>((resolve, reject) => {
      resolveDone = resolve;
      rejectDone = reject;
    });
    done.catch(() => {}); // a detached failure must surface via `done`, not as unhandled
    const handle: { hit: InterleaveHit | null; done: Promise<void> } = { hit: null, done };
    this.armed = {
      store,
      key,
      fire: (hit) => {
        handle.hit = hit;
        // Called synchronously: in the transaction schedule, the concurrent
        // write's transaction must be REQUESTED before the active one commits.
        return concurrent().then(
          () => resolveDone(),
          (e: unknown) => {
            rejectDone(e);
            throw e;
          }
        );
      },
    };
    return handle;
  }

  /** Disarm (one-shot), returning the hook when `store`/`key` is the armed entry. */
  private take(store: StoreName, key: IDBValidKey | undefined): Armed | null {
    const a = this.armed;
    if (!a || a.store !== store || a.key !== key) return null;
    this.armed = null;
    return a;
  }

  // ── Primitive ops: the concurrent write completes inside the window ──────

  async get<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
    const value = await this.inner.get<T>(store, key);
    await this.take(store, key)?.fire({ op: "get", inTransaction: false });
    return value;
  }

  async put<T>(store: StoreName, value: T, key?: IDBValidKey): Promise<void> {
    await this.take(store, keyOf(store, value, key))?.fire({ op: "put", inTransaction: false });
    await this.inner.put(store, value, key);
  }

  async delete(store: StoreName, key: IDBValidKey): Promise<void> {
    await this.take(store, key)?.fire({ op: "delete", inTransaction: false });
    await this.inner.delete(store, key);
  }

  // ── Transactions: the concurrent write queues behind the active one ──────

  transaction<R>(opts: TxOptions, work: (tx: StorageTx) => Promise<R>): Promise<R> {
    return this.inner.transaction(opts, (tx) => work(this.wrap(tx)));
  }

  private wrap(tx: StorageTx): StorageTx {
    const detached = (a: Armed | null, hit: InterleaveHit): void => {
      if (a) void a.fire(hit).catch(() => {}); // observed through `done`
    };
    return {
      get: async <T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> => {
        const value = await tx.get<T>(store, key);
        detached(this.take(store, key), { op: "get", inTransaction: true });
        return value;
      },
      getAll: <T>(store: StoreName): Promise<T[]> => tx.getAll<T>(store),
      put: async <T>(store: StoreName, value: T, key?: IDBValidKey): Promise<void> => {
        detached(this.take(store, keyOf(store, value, key)), { op: "put", inTransaction: true });
        await tx.put(store, value, key);
      },
      delete: async (store: StoreName, key: IDBValidKey): Promise<void> => {
        detached(this.take(store, key), { op: "delete", inTransaction: true });
        await tx.delete(store, key);
      },
      getByIndexSince: <T>(
        store: StoreName,
        index: IndexName,
        since: string,
        limit: number,
        cursor?: string
      ): Promise<Page<T>> => tx.getByIndexSince<T>(store, index, since, limit, cursor),
    };
  }

  // ── Everything else delegates unchanged ──────────────────────────────────

  ready(): Promise<void> {
    return this.inner.ready();
  }
  getAll<T>(store: StoreName): Promise<T[]> {
    return this.inner.getAll<T>(store);
  }
  getAllKeys(store: StoreName): Promise<IDBValidKey[]> {
    return this.inner.getAllKeys(store);
  }
  clear(store: StoreName): Promise<void> {
    return this.inner.clear(store);
  }
  count(store: StoreName): Promise<number> {
    return this.inner.count(store);
  }
  getByIndexSince<T>(
    store: StoreName,
    index: IndexName,
    since: string,
    limit: number,
    cursor?: string
  ): Promise<Page<T>> {
    return this.inner.getByIndexSince<T>(store, index, since, limit, cursor);
  }
  close(): Promise<void> {
    return this.inner.close();
  }
  destroy(): Promise<void> {
    return this.inner.destroy();
  }
  onBlocked(handler: () => void): void {
    this.inner.onBlocked(handler);
  }
  onBlocking(handler: () => void): void {
    this.inner.onBlocking(handler);
  }
  onVersionChange(handler: () => void): void {
    this.inner.onVersionChange(handler);
  }
}
