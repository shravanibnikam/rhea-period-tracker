import { describe, it, expect } from "vitest";
import { flags } from "@/app/lib/flags";
import { getSharedNotes } from "@/app/lib/sharing";

// M0.6 / RHEA-017 — plaintext shared notes are disabled until the E2EE channel.

describe("plaintext notes sync is disabled", () => {
  it("notesSync flag is off by default", () => {
    expect(flags.notesSync).toBe(false);
  });

  it("getSharedNotes returns nothing while disabled (no fetch)", async () => {
    expect(await getSharedNotes("owner-id")).toEqual([]);
  });
});
