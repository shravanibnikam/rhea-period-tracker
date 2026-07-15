import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

// M0.5 / RHEA-016 — guard against re-introducing privacy claims that are not yet
// true. Each affirmative claim is re-enabled here when the feature that makes it
// true actually ships. Describing a feature as PLANNED (e.g. "not yet end-to-end
// encrypted") is allowed; asserting it as fact is not.

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const SRC = join(process.cwd(), "src");
const corpus = walk(SRC)
  .filter((f) => /\.(ts|tsx)$/.test(f))
  .map((f) => readFileSync(f, "utf8"))
  .join("\n");

const FORBIDDEN: { pattern: RegExp; until: string }[] = [
  { pattern: /\b(is|are)\s+end-to-end\s+encrypted\b/i, until: "Phase 2 E2EE (M2.4)" },
  { pattern: /zero-knowledge/i, until: "Phase 2 E2EE (M2.4)" },
  { pattern: /wipes\s+their\s+(synced\s+)?copy/i, until: "partner projection + purge (M2.9/M2.13)" },
  { pattern: /data is encrypted and synced securely/i, until: "Phase 2 E2EE (M2.4)" },
];

describe("no not-yet-true privacy claims in UI copy", () => {
  for (const { pattern, until } of FORBIDDEN) {
    it(`does not affirmatively claim ${pattern} (allowed once: ${until})`, () => {
      expect(corpus).not.toMatch(pattern);
    });
  }
});
