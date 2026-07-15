/**
 * StorageDriver — THE persistence contract (spec Chapter 6 §1; canonical
 * signature per §0.10.A). Implemented by IndexedDbDriver (web), MemoryDriver
 * (tests), and SqliteDriver (Capacitor, Phase 3). Repositories are the ONLY
 * callers; hooks talk to repositories, never to a driver.
 */

import type { StoreName, IndexName } from "../schema";

/** Uniquely identifies the physical store this driver is bound to. */
export interface StorageIdentity {
  /** 'rhea-<uid>' for a signed-in account, 'rhea-local' for no-account mode. */
  dbName: string;
  /** auth.uid() or null in local-only mode. */
  accountId: string | null;
  role: "owner" | "partner" | "local";
}

export interface TxOptions {
  mode: "readonly" | "readwrite";
  /** Stores participating in the transaction (IDB requires this up front). */
  stores: StoreName[];
}

/** A cursor page for bounded reads over an index (used by reconcile). */
export interface Page<T> {
  items: T[];
  /** Opaque continuation token; undefined when exhausted. */
  cursor?: string;
}

/** Transaction-bound handle passed to StorageDriver.transaction(). */
export interface StorageTx {
  get<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined>;
  getAll<T>(store: StoreName): Promise<T[]>;
  put<T>(store: StoreName, value: T, key?: IDBValidKey): Promise<void>;
  delete(store: StoreName, key: IDBValidKey): Promise<void>;
  getByIndexSince<T>(
    store: StoreName,
    index: IndexName,
    since: string,
    limit: number,
    cursor?: string
  ): Promise<Page<T>>;
}

export interface StorageDriver {
  readonly identity: StorageIdentity;
  /** Read-only schema version this driver opened at. */
  readonly schemaVersion: number;

  /** Resolves once the DB is open and at the target schema version. */
  ready(): Promise<void>;

  // ── Primitive KV ops (single-store, auto-transaction) ────────────────────
  get<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined>;
  getAll<T>(store: StoreName): Promise<T[]>;
  getAllKeys(store: StoreName): Promise<IDBValidKey[]>;
  put<T>(store: StoreName, value: T, key?: IDBValidKey): Promise<void>;
  delete(store: StoreName, key: IDBValidKey): Promise<void>;
  clear(store: StoreName): Promise<void>;
  count(store: StoreName): Promise<number>;

  // ── Indexed reads (reconcile depends on the updatedAt index) ─────────────
  /** Rows with index value in [since, +inf), HLC-ordered, paged. '' = epoch-0. */
  getByIndexSince<T>(
    store: StoreName,
    index: IndexName,
    since: string,
    limit: number,
    cursor?: string
  ): Promise<Page<T>>;

  // ── Multi-store atomic transactions ───────────────────────────────────────
  /**
   * Runs `work` inside one transaction. All puts/deletes commit atomically or
   * roll back together (a throw from `work` aborts the transaction).
   */
  transaction<R>(opts: TxOptions, work: (tx: StorageTx) => Promise<R>): Promise<R>;

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  /** Closes the underlying connection so a versionchange/delete can proceed. */
  close(): Promise<void>;
  /** Deletes the entire physical DB (erase + partner sign-out wipe). */
  destroy(): Promise<void>;

  // ── Observability for error handling (spec Chapter 9) ────────────────────
  onBlocked(handler: () => void): void; // upgrade blocked by another tab
  onBlocking(handler: () => void): void; // this tab blocks another's upgrade
  onVersionChange(handler: () => void): void; // DB deleted/upgraded elsewhere
}
