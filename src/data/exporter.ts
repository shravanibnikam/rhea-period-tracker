/**
 * data/exporter.ts — versioned backup export (M1.7 / RHEA-042, spec Ch6 §5).
 *
 * Plaintext export is a DOCUMENTED escape hatch (data sovereignty): losing
 * Rhea's keys must never mean losing your own data. The optional
 * passphrase-encrypted form (`encryption` + `ct`) is wired in with the crypto
 * milestone (M2.3) — the type carries the fields now so the format is stable.
 */

import type { DailyLog } from "@/domain/types";
import type { SyncedRow } from "./envelope";
import {
  META_DEVICE_ID,
  META_HLC_STATE,
  META_NEEDS_INITIAL_SEED,
  META_DB_SCHEMA_VERSION,
} from "./schema";

export const APP_VERSION = "0.2.0";

export interface ExportDataV2 {
  version: 2;
  exportedAt: string; // ISO instant
  appVersion: string;
  deviceId: string;
  /** Present when the file body is encrypted (arrives with M2.3). */
  encryption?: {
    kdf: "argon2id";
    salt: string; // b64
    ops: number;
    mem: number;
    alg: "xchacha20poly1305";
    nonce: string; // b64
  };
  /** Plaintext form: logs+meta inline. Encrypted form: omitted (see ct). */
  logs?: DailyLog[];
  meta?: Record<string, unknown>;
  /** Encrypted form only: base64 ciphertext of {logs, meta}. */
  ct?: string;
}

/**
 * Meta keys that never travel in a backup: they are per-device sync state,
 * and restoring another device's clock/identity would corrupt merging.
 */
export const BACKUP_EXCLUDED_META_KEYS: string[] = [
  META_DEVICE_ID,
  META_HLC_STATE,
  META_NEEDS_INITIAL_SEED,
  META_DB_SCHEMA_VERSION,
  "_legacyImportedTo",
];

/** Strip local sync metadata off a stored row — backups carry domain data only. */
function toDomainLog(row: DailyLog | SyncedRow<DailyLog>): DailyLog {
  const { date, flow, symptoms, mood, energy, notes, medication, intimacy } =
    row as SyncedRow<DailyLog>;
  return { date, flow, symptoms, mood, energy, notes, medication, intimacy };
}

export function buildExport(input: {
  logs: Array<DailyLog | SyncedRow<DailyLog>>;
  meta: Record<string, unknown>;
  deviceId: string;
  exportedAt?: string;
}): ExportDataV2 {
  const meta: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input.meta)) {
    if (!BACKUP_EXCLUDED_META_KEYS.includes(key)) meta[key] = value;
  }
  return {
    version: 2,
    exportedAt: input.exportedAt ?? new Date().toISOString(),
    appVersion: APP_VERSION,
    deviceId: input.deviceId,
    logs: input.logs.map(toDomainLog),
    meta,
  };
}

/** Web download path; native (Filesystem + Share) replaces this in M3.4. */
export function downloadJSON(data: ExportDataV2): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `rhea-backup-${data.exportedAt.slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
