/**
 * sync/ — the sync engine (M1.8). Imports kernel/domain/data only; talks to
 * the wire exclusively through the Transport seam.
 */

export * from "./types";
export { SyncEngine, type SyncEngineConfig } from "./SyncEngine";
export { Outbox, makeOutboxId } from "./outbox";
export { CursorStore } from "./cursor";
export { Reconciler } from "./reconcile";
export * from "./transports/Transport";
export { NullTransport } from "./transports/NullTransport";
export {
  SupabaseTransport,
  recordToRow,
  rowToRecord,
  encodeServerCursor,
  decodeServerCursor,
  LEGACY_DEVICE_ID,
  type OwnerWireRow,
} from "./transports/SupabaseTransport";
export { seedInitialOutbox } from "./initialSeed";
