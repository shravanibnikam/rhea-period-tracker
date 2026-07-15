import { describe, it, expect } from "vitest";
import {
  parseCSV,
  parseImportFile,
  parseBackup,
  mergeLog,
  applyImportedLogs,
  applyBackup,
  normalizeDate,
  detectSlashOrder,
} from "@/data/importer";
import { buildExport } from "@/data/exporter";
import { emptyLog } from "@/domain/types";
import { makeContainer } from "../../helpers/makeContainer";
import {
  CSV_ESCAPED_QUOTES,
  CSV_EU_DATES,
  CSV_US_DATES,
  CSV_NO_FLOW,
  APPLE_HEALTH_NESTED,
  RHEA_BACKUP_V1,
  RHEA_BACKUP_V3,
} from "../../fixtures/importFiles";

// M1.7 / RHEA-045 — each previously-broken input now parses correctly.

describe("CSV parser (bug fix #1: RFC-4180)", () => {
  it("handles escaped quotes and newlines inside quoted fields", () => {
    const { headers, rows } = parseCSV(CSV_ESCAPED_QUOTES);
    expect(headers).toEqual(["date", "flow", "notes"]);
    expect(rows).toHaveLength(2);
    expect(rows[0][2]).toBe('she said "ouch", then rested');
    expect(rows[1][2]).toBe("line one\nline two");
  });

  it("imports both rows through the full pipeline", () => {
    const r = parseImportFile(CSV_ESCAPED_QUOTES, "export.csv");
    expect(r.logs.map((l) => l.date)).toEqual(["2026-01-01", "2026-01-02"]);
    expect(r.logs[0].notes).toContain('"ouch"');
  });
});

describe("date convention detection (bug fix #4)", () => {
  it("detects day-first files from any component > 12", () => {
    expect(detectSlashOrder(["25/03/2026"])).toBe("dmy");
    expect(detectSlashOrder(["03/25/2026"])).toBe("mdy");
    expect(detectSlashOrder(["03/04/2026"])).toBe("mdy"); // ambiguous → US default
  });

  it("EU dates land on the right calendar days", () => {
    const r = parseImportFile(CSV_EU_DATES, "cycle.csv");
    expect(r.logs.map((l) => l.date)).toEqual(["2026-03-25", "2026-03-26", "2026-04-01"]);
    expect(r.errors).toEqual([]);
  });

  it("US files still parse month-first", () => {
    const r = parseImportFile(CSV_US_DATES, "cycle.csv");
    expect(r.logs[0].date).toBe("2026-03-04");
  });

  it("normalizeDate rejects impossible dates instead of guessing", () => {
    expect(normalizeDate("13/13/2026", "mdy")).toBeNull();
  });
});

describe("generic CSV without a flow column (bug fix #3)", () => {
  it("never fabricates flow data and surfaces a warning", () => {
    const r = parseImportFile(CSV_NO_FLOW, "journal.csv");
    expect(r.logs).toHaveLength(2);
    expect(r.logs.every((l) => l.flow === "none")).toBe(true);
    expect(r.logs[0].mood).toBe("Happy");
    expect(r.errors.some((e) => e.includes("without flow data"))).toBe(true);
  });
});

describe("Apple Health XML (bug fix #2: nested Record elements)", () => {
  it("parses non-self-closing Record tags", () => {
    const r = parseImportFile(APPLE_HEALTH_NESTED, "export.xml");
    expect(r.logs).toHaveLength(2);
    expect(r.logs[0]).toMatchObject({ date: "2026-01-05", flow: "heavy" });
    expect(r.logs[1]).toMatchObject({ date: "2026-01-06", flow: "light" });
  });
});

describe("backup versioning (RHEA-043)", () => {
  it("accepts v1 via the shim with v2 field defaults", () => {
    const data = parseBackup(RHEA_BACKUP_V1);
    expect(data.version).toBe(2);
    expect(data.logs).toHaveLength(1);
    expect(data.logs![0]).toMatchObject({
      date: "2026-01-01",
      medication: [],
      intimacy: null,
      notes: "v1 note",
    });
    expect(data.meta).toEqual({ cycleLengthOverride: 29 });
  });

  it("rejects a newer version with clear user copy", () => {
    expect(() => parseBackup(RHEA_BACKUP_V3)).toThrowError(/version 3/);
    try {
      parseBackup(RHEA_BACKUP_V3);
    } catch (e) {
      expect((e as { userMessage: string }).userMessage).toMatch(/newer version/);
    }
  });

  it("rejects garbage clearly", () => {
    expect(() => parseBackup("not json")).toThrow();
    expect(() => parseBackup("{}")).toThrow();
  });
});

describe("export → import round-trip identity (RHEA-042/045)", () => {
  it("v2 export applies back losslessly and idempotently", async () => {
    const src = makeContainer();
    await src.logs.save({ ...emptyLog("2026-04-01"), flow: "heavy", notes: "hi" });
    await src.logs.save({
      ...emptyLog("2026-04-02"),
      symptoms: ["Cramps"],
      medication: [{ name: "ibuprofen", dose: "200mg" }],
    });
    await src.meta.set("cycleLengthOverride", 31);

    const file = buildExport({
      logs: await src.logs.getAllStored(),
      meta: await src.meta.entries(),
      deviceId: "dev-src",
      exportedAt: "2026-07-15T00:00:00.000Z",
    });

    // Sync state must not travel.
    expect(file.meta).not.toHaveProperty("deviceId");
    expect(file.meta).not.toHaveProperty("hlcState");
    // Rows are domain-only (no updatedAt/deviceId/deleted).
    expect(file.logs![0]).not.toHaveProperty("updatedAt");

    const dst = makeContainer();
    const first = await applyBackup(dst.logs, dst.meta, parseBackup(JSON.stringify(file)));
    expect(first.imported).toBe(2);
    expect((await dst.logs.get("2026-04-01"))?.notes).toBe("hi");
    expect((await dst.logs.get("2026-04-02"))?.medication).toEqual([
      { name: "ibuprofen", dose: "200mg" },
    ]);
    expect(await dst.meta.get("cycleLengthOverride")).toBe(31);

    // Idempotent: re-applying the same file imports nothing new.
    const second = await applyBackup(dst.logs, dst.meta, parseBackup(JSON.stringify(file)));
    expect(second.imported).toBe(0);
    expect(second.skipped).toBe(2);
  });
});

describe("merge-on-import (bug fix #5)", () => {
  it("a flow-only import never wipes an existing rich log", () => {
    const existing = {
      ...emptyLog("2026-05-01"),
      flow: "light" as const,
      symptoms: ["Cramps"],
      mood: "Calm",
      notes: "rich note",
    };
    const incoming = { ...emptyLog("2026-05-01"), flow: "heavy" as const };
    const merged = mergeLog(existing, incoming);
    expect(merged.flow).toBe("heavy"); // incoming carries content → wins
    expect(merged.symptoms).toEqual(["Cramps"]); // preserved
    expect(merged.mood).toBe("Calm");
    expect(merged.notes).toBe("rich note");
  });

  it("applyImportedLogs counts merges and skips duplicates", async () => {
    const { logs } = makeContainer();
    await logs.save({ ...emptyLog("2026-05-01"), notes: "keep me" });

    const parsed = [
      { ...emptyLog("2026-05-01"), flow: "medium" as const },
      { ...emptyLog("2026-05-02"), flow: "light" as const },
    ];
    const r1 = await applyImportedLogs(logs, parsed);
    expect(r1).toEqual({ imported: 2, skipped: 0 });
    expect((await logs.get("2026-05-01"))?.notes).toBe("keep me");
    expect((await logs.get("2026-05-01"))?.flow).toBe("medium");

    const r2 = await applyImportedLogs(logs, parsed);
    expect(r2).toEqual({ imported: 0, skipped: 2 });
  });
});
