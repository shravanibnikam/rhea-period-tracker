/**
 * MetaRepository — the only reader/writer of the `meta` store (settings +
 * sync state, key → value). M1.4 preserves current behavior exactly.
 */

import type { StorageDriver } from "../drivers/StorageDriver";

export class MetaRepository {
  constructor(private readonly driver: StorageDriver) {}

  async get<T>(key: string): Promise<T | undefined> {
    return this.driver.get<T>("meta", key);
  }

  async set(key: string, value: unknown): Promise<void> {
    await this.driver.put("meta", value, key);
  }

  async delete(key: string): Promise<void> {
    await this.driver.delete("meta", key);
  }

  async keys(): Promise<string[]> {
    return (await this.driver.getAllKeys("meta")).map(String);
  }

  async entries(): Promise<Record<string, unknown>> {
    const out: Record<string, unknown> = {};
    for (const key of await this.keys()) {
      out[key] = await this.get(key);
    }
    return out;
  }

  async clear(): Promise<void> {
    await this.driver.clear("meta");
  }
}
