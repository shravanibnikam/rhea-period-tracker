import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import { SHARE_KEYS } from "@/app/lib/sharing";

// M0.5 / RHEA-016, extended by P0-10: guard against privacy claims that are not
// true of the code as shipped. Each affirmative claim is re-enabled here only
// when the feature that makes it true actually ships. Describing a feature as
// PLANNED (e.g. "not yet end-to-end encrypted") is allowed; asserting it as fact
// is not.
//
// Corpus:
//   - src/**/*.{ts,tsx}: always scanned. No exemptions.
//   - README.md and docs/**/*.md: scanned unless the document opts out with the
//     historical marker (see HISTORICAL_MARKER). A single line may also suppress
//     ONE named pattern with an inline allow-marker (see allowMarker), for text
//     that quotes a claim in order to debunk it.

interface Forbidden {
  /** Stable id, used by the inline allow-marker. */
  id: string;
  pattern: RegExp;
  /** What must ship before this claim may appear. */
  until: string;
}

const FORBIDDEN: Forbidden[] = [
  { id: "is-e2ee", pattern: /\b(is|are)\s+end-to-end\s+encrypted\b/i, until: "Phase 2 E2EE (M2.4)" },
  { id: "zero-knowledge", pattern: /zero-knowledge/i, until: "Phase 2 E2EE (M2.4)" },
  { id: "wipes-their-copy", pattern: /wipes\s+their\s+(synced\s+)?copy/i, until: "partner projection + purge (M2.9/M2.13)" },
  { id: "encrypted-and-synced", pattern: /data is encrypted and synced securely/i, until: "Phase 2 E2EE (M2.4)" },
  // Affirmative "end-to-end encrypted" in any grammatical frame the (is|are)
  // anchor misses ("travels end-to-end encrypted", "stays end-to-end
  // encrypted"). A negation or planned-future word up to 20 characters earlier
  // in the same sentence ("not yet", "isn't", "never", "without", "until",
  // "once", "before") keeps negative/planned phrasing legal.
  {
    id: "affirmative-e2ee",
    pattern: /(?<!(?:\bnot|n't|\bnever|\bno|\bwithout|\buntil|\bonce|\bbefore)\b[^.!?]{0,20})\bend-to-end[\s-]+encrypted\b/i,
    until: "Phase 2 E2EE (M2.4)",
  },
  // Notes are in the partner's RLS grant (0001_baseline.sql "partner read linked logs").
  { id: "never-shared-regardless", pattern: /never\s+shared\s+regardless/i, until: "server-side partner projection (SEC-01)" },
  // Broader form of the same claim (e.g. the daily-log "Notes (private, never
  // shared)" label): notes sync in plaintext and a linked partner's account can read them.
  { id: "never-shared", pattern: /\bnever\s+shared\b/i, until: "server-side partner projection (SEC-01)" },
  { id: "shared-fields-only", pattern: /shared\s+fields\s+only/i, until: "server-side partner projection (SEC-01)" },
  // Container.eraseAllData clears local stores only (P0-09a); the server half is P0-09b.
  { id: "erase-server", pattern: /from\s+your\s+device\s+and\s+the\s+server/i, until: "server erase with tombstones (P0-09b)" },
  // unpair() deletes the link; the partner's downloaded copy stays, and
  // outstanding invite codes stay valid (N12).
  { id: "immediately-revokes", pattern: /immediately\s+revokes/i, until: "partner purge on unpair + invite invalidation (M2.13, N12)" },
  { id: "revoke-is-immediate", pattern: /revok\w*\s+(partner\s+)?access\s+is\s+immediate/i, until: "partner purge on unpair + invite invalidation (M2.13, N12)" },
  { id: "stops-all-future-sharing", pattern: /stops\s+all\s+future\s+sharing/i, until: "invite invalidation on unpair (N12)" },
  // No UI path switches role in either direction (N9).
  { id: "change-role-later", pattern: /\bchange\s+(this|it|your\s+role)\s+later\b/i, until: "a real role-switch flow (N9)" },
  // Cloud data is plaintext on the server; toggles are presentation-level.
  { id: "private-and-secure", pattern: /private\s+and\s+secure/i, until: "Phase 2 E2EE (M2.4)" },
  { id: "synced-securely", pattern: /\bsynced\s+securely\b/i, until: "Phase 2 E2EE (M2.4)" },
  { id: "control-exactly", pattern: /control\s+exactly\s+what\s+your\s+partner/i, until: "server-side partner projection (SEC-01)" },
  // The hosted build requires sign-in and syncs logs to the server.
  { id: "no-account-required", pattern: /no\s+account\s+required/i, until: "a local-only mode in the hosted build" },
];

/** A document opts out of the scan with this exact line near its top. */
const HISTORICAL_MARKER = "<!-- copy-guard: historical -->";
/** The marker only counts within the first N lines (a stray mention deeper in a file does not exempt it). */
const MARKER_WINDOW = 10;

/** Inline allow-marker: suppresses exactly one named pattern on exactly one line. */
function allowMarker(id: string): string {
  return `<!-- copy-guard: allow ${id} -->`;
}

function isHistorical(text: string): boolean {
  return text
    .split("\n")
    .slice(0, MARKER_WINDOW)
    .some((line) => line.trim() === HISTORICAL_MARKER);
}

/** Collapse JSX/markdown line wrapping and entities so a phrase split across lines still matches. */
function normalize(text: string): string {
  return text
    .replace(/&apos;|&#39;|&rsquo;|\u2019/g, "'")
    .replace(/&mdash;|&ndash;/g, "-")
    .replace(/\s+/g, " ");
}

function excerpt(text: string, index: number): string {
  return text.slice(Math.max(0, index - 50), index + 70).trim();
}

/**
 * Violations of one pattern in one text. With `allowInline`, a line carrying
 * that pattern's allow-marker is skipped (docs only; src has no escape hatch).
 */
function violationsIn(text: string, rule: Forbidden, allowInline = true): string[] {
  const marker = allowMarker(rule.id);
  const lines = text.split("\n");
  const scanned = normalize((allowInline ? lines.filter((line) => !line.includes(marker)) : lines).join("\n"));
  const global = new RegExp(rule.pattern.source, `${rule.pattern.flags.replace("g", "")}g`);
  return [...scanned.matchAll(global)].map((m) => excerpt(scanned, m.index ?? 0));
}

interface Doc {
  path: string;
  text: string;
}

/** All violations across a document corpus; historical documents are skipped. */
function docViolations(docs: Doc[], rule: Forbidden): string[] {
  return docs
    .filter((d) => !isHistorical(d.text))
    .flatMap((d) => violationsIn(d.text, rule).map((e) => `${d.path}: …${e}…`));
}

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};

const TOGGLE_COUNT = /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(?:independent\s+)?(?:sharing|share)\s+toggles\b/gi;

/** Every "<N> sharing toggles" claim whose N is not the real number of share keys. */
function wrongToggleCounts(text: string, actual: number): string[] {
  const scanned = normalize(text);
  return [...scanned.matchAll(TOGGLE_COUNT)]
    .filter((m) => {
      const raw = m[1].toLowerCase();
      const n = /^\d+$/.test(raw) ? Number(raw) : NUMBER_WORDS[raw];
      return n !== actual;
    })
    .map((m) => excerpt(scanned, m.index ?? 0));
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const ROOT = process.cwd();
const read = (p: string): Doc => ({ path: relative(ROOT, p), text: readFileSync(p, "utf8") });

const SRC: Doc[] = walk(join(ROOT, "src"))
  .filter((f) => /\.(ts|tsx)$/.test(f))
  .map(read);

const DOCS: Doc[] = [join(ROOT, "README.md"), ...walk(join(ROOT, "docs")).filter((f) => f.endsWith(".md"))].map(read);

describe("no not-yet-true privacy claims in UI copy (src/**)", () => {
  for (const rule of FORBIDDEN) {
    it(`does not claim ${rule.pattern} (allowed once: ${rule.until})`, () => {
      // src has no exemption and no allow-marker: every match is a violation.
      const hits = SRC.flatMap((d) => violationsIn(d.text, rule, false).map((e) => `${d.path}: …${e}…`));
      expect(hits, `[${rule.id}] ${hits.join(" | ")}`).toEqual([]);
    });
  }

  it(`any "<N> sharing toggles" claim matches SHARE_KEYS.length (${SHARE_KEYS.length})`, () => {
    const wrong = SRC.flatMap((d) => wrongToggleCounts(d.text, SHARE_KEYS.length).map((e) => `${d.path}: …${e}…`));
    expect(wrong, `[toggle-count] ${wrong.join(" | ")}`).toEqual([]);
  });
});

describe("no not-yet-true privacy claims in current docs (README.md, docs/**)", () => {
  it("scans at least the README and one non-historical doc", () => {
    const live = DOCS.filter((d) => !isHistorical(d.text)).map((d) => d.path);
    expect(live).toContain("README.md");
    expect(live.length).toBeGreaterThan(1);
  });

  for (const rule of FORBIDDEN) {
    it(`does not claim ${rule.pattern} outside historical docs`, () => {
      const hits = docViolations(DOCS, rule);
      expect(hits, `[${rule.id}] ${hits.join(" | ")}`).toEqual([]);
    });
  }

  it(`any "<N> sharing toggles" claim outside historical docs matches SHARE_KEYS.length`, () => {
    const wrong = DOCS.filter((d) => !isHistorical(d.text)).flatMap((d) =>
      wrongToggleCounts(d.text, SHARE_KEYS.length).map((e) => `${d.path}: …${e}…`),
    );
    expect(wrong, `[toggle-count] ${wrong.join(" | ")}`).toEqual([]);
  });
});

describe("copy guard mechanism (self-test)", () => {
  const rule = (id: string): Forbidden => {
    const found = FORBIDDEN.find((r) => r.id === id);
    if (!found) throw new Error(`no rule ${id}`);
    return found;
  };
  const CLAIM = "Your notes travel end-to-end encrypted to your partner.";

  it("flags an unbannered doc that makes a forbidden claim", () => {
    const docs = [{ path: "mem/live.md", text: `# Live\n\n${CLAIM}\n` }];
    expect(docViolations(docs, rule("affirmative-e2ee"))).toHaveLength(1);
  });

  it("exempts a doc whose historical marker is near the top", () => {
    const docs = [{ path: "mem/old.md", text: `# Old\n${HISTORICAL_MARKER}\n> Frozen snapshot.\n\n${CLAIM}\n` }];
    expect(docViolations(docs, rule("affirmative-e2ee"))).toEqual([]);
  });

  it("does not exempt a doc whose marker appears only deep in the file", () => {
    const filler = Array.from({ length: MARKER_WINDOW }, (_, i) => `line ${i}`).join("\n");
    const docs = [{ path: "mem/stray.md", text: `# Stray\n${filler}\n${HISTORICAL_MARKER}\n${CLAIM}\n` }];
    expect(docViolations(docs, rule("affirmative-e2ee"))).toHaveLength(1);
  });

  it("does not exempt a doc that merely mentions the marker inside a sentence", () => {
    const docs = [{ path: "mem/quoted.md", text: `# Q\nAdd ${HISTORICAL_MARKER} to exempt a doc.\n${CLAIM}\n` }];
    expect(docViolations(docs, rule("affirmative-e2ee"))).toHaveLength(1);
  });

  it("an inline allow-marker suppresses only its named pattern, only on its line", () => {
    const debunk = `The "zero-knowledge server" is not deployed. ${allowMarker("zero-knowledge")}`;
    const docs = [{ path: "mem/debunk.md", text: `# D\n${debunk}\n` }];
    expect(docViolations(docs, rule("zero-knowledge"))).toEqual([]);

    const nextLine = [{ path: "mem/next.md", text: `# D\n${debunk}\nIt is a zero-knowledge server.\n` }];
    expect(docViolations(nextLine, rule("zero-knowledge"))).toHaveLength(1);

    const otherRule = [{ path: "mem/other.md", text: `# D\nNotes are end-to-end encrypted. ${allowMarker("zero-knowledge")}\n` }];
    expect(docViolations(otherRule, rule("is-e2ee"))).toHaveLength(1);
  });

  it("src copy cannot use the inline allow-marker", () => {
    const line = `It is a zero-knowledge server. ${allowMarker("zero-knowledge")}`;
    expect(violationsIn(line, rule("zero-knowledge"), false)).not.toEqual([]);
  });

  it("allows negated or planned end-to-end phrasing and flags affirmative phrasing", () => {
    const e2ee = rule("affirmative-e2ee");
    for (const ok of [
      "They are not yet end-to-end encrypted.",
      "Synced data isn't end-to-end encrypted yet.",
      "Cloud data is not\n  end-to-end encrypted.",
      "Your data is never end-to-end encrypted today.",
      "End-to-end encryption is a planned improvement.",
      "Disabled until the end-to-end-encrypted notes channel ships.",
    ]) {
      expect(violationsIn(ok, e2ee)).toEqual([]);
    }
    for (const bad of [CLAIM, "Everything stays end-to-end encrypted.", "Logs are stored end-to-end-encrypted."]) {
      expect(violationsIn(bad, e2ee)).toHaveLength(1);
    }
  });

  it("checks toggle counts written as digits or words", () => {
    expect(wrongToggleCounts("You control five independent sharing toggles.", 7)).toHaveLength(1);
    expect(wrongToggleCounts("You control 7 sharing toggles.", 7)).toEqual([]);
    expect(wrongToggleCounts("the seven share\n toggles", 7)).toEqual([]);
    expect(wrongToggleCounts("the 3 share toggles", 7)).toHaveLength(1);
  });
});
