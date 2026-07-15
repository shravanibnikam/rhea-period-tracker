import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// M1.3 regression guard: UTC-based DATE KEYS (toISOString().slice(0, 10)) must
// never be used to key calendar-day data — a user logging at 11pm west of UTC
// (or 1am east) would hit the wrong day. Local toDateKey() is the only
// sanctioned date-key derivation. Full ISO timestamps (plain toISOString())
// remain fine for instants like updated_at/exportedAt.

const SRC = join(__dirname, "..", "..", "src");
const FORBIDDEN = /toISOString\(\)\s*\.\s*slice\(\s*0\s*,\s*10\s*\)/;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(name) ? [p] : [];
  });
}

describe("write-path guard: no UTC date keys", () => {
  it("no src file derives a date key via toISOString().slice(0, 10)", () => {
    const offenders = walk(SRC).filter((f) => FORBIDDEN.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
