import { describe, it, expect } from "vitest";
import {
  recordToRow,
  rowToRecord,
  encodeServerCursor,
  decodeServerCursor,
  LEGACY_DEVICE_ID,
  type OwnerWireRow,
} from "@/sync/transports/SupabaseTransport";
import { sealPlain, openPlain } from "@/data/envelope";
import { encodeHlc, epochZeroHlc } from "@/domain/hlc";
import { emptyLog, type DailyLog } from "@/domain/types";

// M1.9 / RHEA-052 — pure wire-mapping tests (the client itself needs a live
// Supabase; the RLS/behavioral suite is authored in supabase/tests and runs
// via `supabase test db` before deployment).

const T = 1_770_000_000_000;

describe("SupabaseTransport wire mapping", () => {
  it("record → row carries every domain field + sync metadata", () => {
    const log: DailyLog = {
      ...emptyLog("2026-07-01"),
      flow: "heavy",
      symptoms: ["Cramps"],
      notes: "hi",
      medication: [{ name: "ibuprofen" }],
      intimacy: { occurred: true },
    };
    const row = recordToRow(
      {
        key: "log:2026-07-01",
        scope: "owner",
        payload: sealPlain(log),
        updatedAt: encodeHlc(T, 3, "dev-a"),
        deviceId: "dev-a",
        deleted: false,
      },
      "owner-1"
    );
    expect(row).toMatchObject({
      owner_id: "owner-1",
      date: "2026-07-01",
      flow: "heavy",
      symptoms: ["Cramps"],
      notes: "hi",
      medication: [{ name: "ibuprofen" }],
      intimacy: { occurred: true },
      updated_hlc: encodeHlc(T, 3, "dev-a"),
      device_id: "dev-a",
      deleted: false,
    });
  });

  it("tombstone record → row keeps deleted=true with empty content", () => {
    const row = recordToRow(
      {
        key: "log:2026-07-02",
        scope: "owner",
        payload: null,
        updatedAt: encodeHlc(T, 0, "dev-a"),
        deviceId: "dev-a",
        deleted: true,
      },
      "owner-1"
    );
    expect(row.deleted).toBe(true);
    expect(row.flow).toBeNull();
  });

  it("row → record round-trips the log through the envelope", () => {
    const wire: OwnerWireRow = {
      owner_id: "owner-1",
      date: "2026-07-01",
      flow: "light",
      symptoms: ["Headache"],
      mood: "Calm",
      energy: "low",
      notes: "n",
      medication: [],
      intimacy: null,
      updated_hlc: encodeHlc(T, 1, "dev-b"),
      device_id: "dev-b",
      deleted: false,
      server_updated_at: "2026-07-01T10:00:00Z",
    };
    const record = rowToRecord(wire);
    expect(record.key).toBe("log:2026-07-01");
    expect(record.updatedAt).toBe(encodeHlc(T, 1, "dev-b"));
    expect(record.deleted).toBe(false);
    const log = openPlain<DailyLog>(record.payload!);
    expect(log).toMatchObject({ date: "2026-07-01", flow: "light", mood: "Calm" });
  });

  it("pre-0003 legacy rows (no HLC) map to epoch-0 so they never win a merge", () => {
    const wire: OwnerWireRow = {
      owner_id: "owner-1",
      date: "2025-12-01",
      flow: "medium",
      symptoms: [],
      mood: null,
      energy: null,
      notes: null,
      medication: null,
      intimacy: null,
      updated_hlc: null,
      device_id: null,
      deleted: null,
      server_updated_at: null,
    };
    const record = rowToRecord(wire);
    expect(record.updatedAt).toBe(epochZeroHlc(LEGACY_DEVICE_ID));
    expect(record.deviceId).toBe(LEGACY_DEVICE_ID);
    expect(record.deleted).toBe(false);
    expect(openPlain<DailyLog>(record.payload!)?.notes).toBe("");
  });

  it("server cursor encodes/decodes the (server_updated_at, date) keyset", () => {
    const token = encodeServerCursor("2026-07-01T10:00:00Z", "2026-07-01");
    expect(decodeServerCursor(token)).toEqual({ t: "2026-07-01T10:00:00Z", d: "2026-07-01" });
    expect(decodeServerCursor("")).toBeNull();
    expect(decodeServerCursor("!!not-base64!!")).toBeNull();
  });
});
