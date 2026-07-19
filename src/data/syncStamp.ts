/**
 * data/syncStamp.ts — HLC/deviceId stamping for repository writes (M1.5 /
 * RHEA-038). Runs INSIDE the caller's transaction so a row is never persisted
 * without its stamp, and the clock state can't tear across concurrent writes.
 * The pure clock lives in domain/hlc; this is the thin stateful wrapper.
 */

import { hlcNow, hlcObserve, isValidHlc, HLC_INITIAL_STATE, type HlcState } from "@/domain/hlc";
import { META_DEVICE_ID, META_HLC_STATE } from "./schema";
import { generateDeviceId } from "./migrations/indexeddb";
import type { StorageTx } from "./drivers/StorageDriver";

export interface SyncStamp {
  updatedAt: string; // HLC
  deviceId: string;
}

/** Get (or lazily create) this database's stable device id. */
export async function ensureDeviceId(tx: StorageTx): Promise<string> {
  let deviceId = await tx.get<string>("meta", META_DEVICE_ID);
  if (!deviceId) {
    deviceId = generateDeviceId();
    await tx.put("meta", deviceId, META_DEVICE_ID);
  }
  return deviceId;
}

/**
 * Advance the persisted HLC and return a fresh edit stamp. Must be called
 * inside a readwrite transaction that includes the `meta` store.
 *
 * `dominate` = the HLC of the row this stamp supersedes (its current
 * `updated_hlc`). Folding it in guarantees the new stamp is STRICTLY GREATER
 * than the version being edited/deleted — even when another device authored
 * that version or the local clock has lagged behind it (RHEA delete-sync fix:
 * a tombstone/edit must win LWW against the row it replaces). Far-future values
 * are still clamped by hlcObserve's anti-poison drift guard.
 */
export async function nextStamp(
  tx: StorageTx,
  physicalMs: number = Date.now(),
  dominate?: string
): Promise<SyncStamp> {
  const deviceId = await ensureDeviceId(tx);
  let state = (await tx.get<HlcState>("meta", META_HLC_STATE)) ?? HLC_INITIAL_STATE;
  if (dominate && isValidHlc(dominate)) {
    state = hlcObserve(state, dominate, physicalMs).state;
  }
  const { state: next, hlc } = hlcNow(state, physicalMs, deviceId);
  await tx.put("meta", next, META_HLC_STATE);
  return { updatedAt: hlc, deviceId };
}
