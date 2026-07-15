import { describe, it, expect, afterEach } from "vitest";
import { setSyncReadOnly, isSyncReadOnly, pushAllLogs } from "@/app/lib/sync";

// M0.4 / RHEA-014 — a partner is read-only and must never push owner data.

afterEach(() => setSyncReadOnly(false));

describe("partner write guard", () => {
  it("defaults to read-write and toggles", () => {
    expect(isSyncReadOnly()).toBe(false);
    setSyncReadOnly(true);
    expect(isSyncReadOnly()).toBe(true);
  });

  it("short-circuits pushAllLogs when read-only (before any DB/network access)", async () => {
    setSyncReadOnly(true);
    expect(await pushAllLogs("owner-id")).toBe(0);
  });
});
