import { MemoryDriver } from "@/data/drivers/MemoryDriver";
import { LogRepository, MetaRepository } from "@/data/repositories";
import type { StorageIdentity } from "@/data/drivers/StorageDriver";
import type { StoreDef } from "@/data/schema";
import { CURRENT_STORES } from "@/data/schema";

/**
 * Test container: repositories over a fresh MemoryDriver. The seam means unit
 * tests never need fake-indexeddb unless they are testing IndexedDbDriver
 * itself (driver-contract / migration suites).
 */
export function makeContainer(
  identity?: Partial<StorageIdentity>,
  stores: readonly StoreDef[] = CURRENT_STORES
) {
  const driver = new MemoryDriver(identity, stores);
  return {
    driver,
    logs: new LogRepository(driver),
    meta: new MetaRepository(driver),
  };
}
