/**
 * StorageManager — account scoping + driver lifecycle (spec Chapter 6 §1).
 * Replaces the module-level dbPromise singleton: exactly one live driver at a
 * time; switching accounts closes the old driver before opening the new DB
 * (rhea-<uid> / rhea-local). Emits 'switch' so caches can drop.
 */

import type { StorageDriver, StorageIdentity } from "./drivers/StorageDriver";
import { IndexedDbDriver } from "./drivers/IndexedDbDriver";

export type StorageManagerEvent = "switch" | "blocked" | "evicted";

export function identityFor(
  uid: string | null,
  role: "owner" | "partner" | "local" = uid ? "owner" : "local"
): StorageIdentity {
  return {
    dbName: uid ? `rhea-${uid}` : "rhea-local",
    accountId: uid,
    role,
  };
}

export class StorageManager {
  private driver: StorageDriver | null = null;
  private handlers = new Map<StorageManagerEvent, Array<() => void>>();
  private readonly makeDriver: (identity: StorageIdentity) => StorageDriver;
  /** Ran once per newly-opened driver (e.g. legacy copy-forward). */
  private readonly onOpen?: (driver: StorageDriver) => Promise<void>;

  constructor(opts?: {
    makeDriver?: (identity: StorageIdentity) => StorageDriver;
    onOpen?: (driver: StorageDriver) => Promise<void>;
  }) {
    this.makeDriver = opts?.makeDriver ?? ((identity) => new IndexedDbDriver(identity));
    this.onOpen = opts?.onOpen;
  }

  current(): StorageDriver | null {
    return this.driver;
  }

  async acquire(identity: StorageIdentity): Promise<StorageDriver> {
    if (this.driver && this.driver.identity.dbName === identity.dbName) {
      return this.driver;
    }
    return this.switchAccount(identity);
  }

  async switchAccount(next: StorageIdentity): Promise<StorageDriver> {
    if (this.driver && this.driver.identity.dbName === next.dbName) {
      return this.driver;
    }
    const old = this.driver;
    this.driver = null;
    await old?.close().catch(() => {});

    const driver = this.makeDriver(next);
    driver.onBlocked(() => this.emit("blocked"));
    await driver.ready();
    if (this.onOpen) await this.onOpen(driver);
    this.driver = driver;
    this.emit("switch");
    return driver;
  }

  async closeCurrent(): Promise<void> {
    const old = this.driver;
    this.driver = null;
    await old?.close().catch(() => {});
  }

  on(event: StorageManagerEvent, handler: () => void): void {
    const list = this.handlers.get(event) ?? [];
    list.push(handler);
    this.handlers.set(event, list);
  }

  private emit(event: StorageManagerEvent): void {
    for (const h of this.handlers.get(event) ?? []) h();
  }
}
