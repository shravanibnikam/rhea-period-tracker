/**
 * data/importer.ts — versioned backup import + third-party parsers (M1.7 /
 * RHEA-043). Replaces lib/import.ts, fixing the review-documented bugs:
 *
 *  1. CSV: RFC-4180 escaped quotes ("") and newlines inside quoted fields.
 *  2. Apple Health: real exports nest <MetadataEntry> inside <Record>…</Record>;
 *     the old regex only matched self-closing tags and yielded 0 rows.
 *  3. Generic CSV no longer FABRICATES flow:"medium" for every row when the
 *     file has no flow column — never invent health data; a warning surfaces.
 *  4. EU dd/mm/yyyy with slashes: the date convention is detected per FILE
 *     (any first-component > 12 ⇒ day-first) instead of always assuming US.
 *  5. Imports MERGE into existing logs (per-field, incoming wins where it has
 *     content) instead of silently overwriting rich local entries.
 *
 * Backups: accepts version 1 (shim: medication [] / intimacy null) and 2;
 * rejects newer versions with a clear message.
 */

import type { DailyLog, FlowLevel } from "@/domain/types";
import { emptyLog } from "@/domain/types";
import { ErrorCode } from "@/kernel";
import { StorageError } from "./errors";
import type { ExportDataV2 } from "./exporter";
import { BACKUP_EXCLUDED_META_KEYS } from "./exporter";
import type { LogRepository, MetaRepository } from "./repositories";

export type ImportSource =
  | "clue"
  | "flo"
  | "apple_health"
  | "generic_csv"
  | "rhea_backup"
  | "unknown";

export interface ImportResult {
  source: ImportSource;
  logs: DailyLog[];
  errors: string[];
}

// ─── Flow normalization ──────────────────────────────────────────────────────

function normalizeFlow(raw: string): FlowLevel {
  const lower = raw.toLowerCase().trim();
  if (lower === "heavy" || lower === "4" || lower === "5") return "heavy";
  if (lower === "medium" || lower === "3" || lower === "moderate") return "medium";
  if (lower === "light" || lower === "2" || lower === "1") return "light";
  if (lower === "spotting" || lower === "spot") return "spotting";
  if (lower === "none" || lower === "0" || lower === "") return "none";
  // If it mentions bleeding at all, treat as medium.
  if (lower.includes("bleed") || lower.includes("period") || lower.includes("menstr")) {
    return "medium";
  }
  return "none";
}

// ─── Date normalization (per-file convention detection) ─────────────────────

export type SlashOrder = "mdy" | "dmy";

/**
 * Detect whether slash dates in this file are month-first or day-first: any
 * sample whose FIRST component exceeds 12 proves day-first; any SECOND
 * component > 12 proves month-first. Ambiguous files default to US (mdy),
 * which the UI documents.
 */
export function detectSlashOrder(samples: Array<string | undefined>): SlashOrder {
  for (const s of samples) {
    const m = s?.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (!m) continue;
    if (Number(m[1]) > 12) return "dmy";
    if (Number(m[2]) > 12) return "mdy";
  }
  return "mdy";
}

export function normalizeDate(raw: string, order: SlashOrder = "mdy"): string | null {
  const s = raw.trim();
  // ISO (YYYY-MM-DD), possibly with a time suffix.
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // Slash dates — convention decided per file (bug fix #4).
  const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const [a, b] = [slash[1], slash[2]];
    const [month, day] = order === "dmy" ? [b, a] : [a, b];
    if (Number(month) > 12 || Number(day) > 31) return null;
    return `${slash[3]}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  // Dotted dates are DD.MM.YYYY (EU convention).
  const dotted = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (dotted) {
    return `${dotted[3]}-${dotted[2].padStart(2, "0")}-${dotted[1].padStart(2, "0")}`;
  }

  // Fallback: Date parser (named months etc.), local calendar day.
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, "0");
    const d = String(parsed.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return null;
}

// ─── CSV parser (RFC-4180: escaped quotes + newlines in quoted fields) ──────

export function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  const pushField = () => {
    row.push(field.trim());
    field = "";
  };
  const pushRow = () => {
    pushField();
    if (row.some((f) => f.length > 0)) rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'; // escaped quote (bug fix #1)
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch; // includes commas and newlines inside quotes
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      pushField();
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      pushRow();
    } else {
      field += ch;
    }
  }
  pushRow();

  const headers = rows.shift() ?? [];
  return { headers, rows };
}

// ─── Source detection ────────────────────────────────────────────────────────

export function detectSource(text: string, filename: string): ImportSource {
  const lower = filename.toLowerCase();

  if (text.includes('"version":') && text.includes('"exportedAt":')) {
    return "rhea_backup";
  }
  if (
    text.includes("HKQuantityTypeIdentifier") ||
    text.includes("HKCategoryTypeIdentifier") ||
    lower.endsWith(".xml")
  ) {
    return "apple_health";
  }
  if (lower.includes("clue")) return "clue";
  if (lower.includes("flo")) return "flo";

  const { headers } = parseCSV(text);
  const headerStr = headers.join(" ").toLowerCase();
  if (headerStr.includes("menstrual flow") || headerStr.includes("period intensity")) return "clue";
  if (headerStr.includes("cycle_day") || headerStr.includes("period_day")) return "flo";

  if (lower.endsWith(".csv")) return "generic_csv";
  return "unknown";
}

// ─── Clue CSV ────────────────────────────────────────────────────────────────

function parseClueCSV(text: string): ImportResult {
  const { headers, rows } = parseCSV(text);
  const errors: string[] = [];
  const logs: DailyLog[] = [];

  const dateIdx = headers.findIndex((h) => /date/i.test(h));
  const flowIdx = headers.findIndex((h) => /period|menstrual.*flow|flow/i.test(h));

  if (dateIdx === -1) {
    return { source: "clue", logs: [], errors: ["No date column found"] };
  }

  const order = detectSlashOrder(rows.map((r) => r[dateIdx]));
  for (const row of rows) {
    const dateRaw = row[dateIdx];
    const date = normalizeDate(dateRaw ?? "", order);
    if (!date) {
      errors.push(`Skipped: invalid date "${dateRaw}"`);
      continue;
    }
    const flow = flowIdx !== -1 ? normalizeFlow(row[flowIdx] ?? "") : "none";
    if (flow === "none") continue; // Clue exports every day; keep period days only
    logs.push({ ...emptyLog(date), flow });
  }
  return { source: "clue", logs, errors };
}

// ─── Flo (JSON or CSV) ───────────────────────────────────────────────────────

function parseFloExport(text: string): ImportResult {
  const errors: string[] = [];
  const logs: DailyLog[] = [];
  try {
    const json = JSON.parse(text);
    const entries = Array.isArray(json) ? json : (json.periods ?? json.data ?? []);
    for (const entry of entries) {
      const date = normalizeDate(String(entry.date ?? entry.start_date ?? ""));
      if (!date) continue;
      const flow = normalizeFlow(String(entry.flow ?? entry.intensity ?? "medium"));
      logs.push({ ...emptyLog(date), flow });
    }
    return { source: "flo", logs, errors };
  } catch {
    return parseGenericCSV(text, "flo");
  }
}

// ─── Apple Health XML ────────────────────────────────────────────────────────

function parseAppleHealthXML(text: string): ImportResult {
  const errors: string[] = [];
  const logs: DailyLog[] = [];

  // Match the OPENING tag whether or not it self-closes (bug fix #2): real
  // exports nest <MetadataEntry> children, so `<Record ...>` is common.
  const recordRegex =
    /<Record\b[^>]*type="HKCategoryTypeIdentifierMenstrualFlow"[^>]*?\/?>/g;
  const dateRegex = /startDate="([^"]+)"/;
  const valueRegex = /value="([^"]+)"/;

  let match: RegExpExecArray | null;
  while ((match = recordRegex.exec(text)) !== null) {
    const record = match[0];
    const dateMatch = record.match(dateRegex);
    const valueMatch = record.match(valueRegex);
    if (!dateMatch) continue;

    const date = normalizeDate(dateMatch[1].split(" ")[0]);
    if (!date) continue;

    let flow: FlowLevel = "medium";
    if (valueMatch) {
      const val = valueMatch[1].toLowerCase();
      if (val.includes("light")) flow = "light";
      else if (val.includes("heavy")) flow = "heavy";
      else if (val.includes("none") || val.includes("unspecified")) flow = "spotting";
    }
    logs.push({ ...emptyLog(date), flow });
  }

  if (logs.length === 0) {
    errors.push("No menstrual flow records found in Apple Health export");
  }
  return { source: "apple_health", logs, errors };
}

// ─── Generic CSV ─────────────────────────────────────────────────────────────

function parseGenericCSV(text: string, sourceOverride?: ImportSource): ImportResult {
  const { headers, rows } = parseCSV(text);
  const errors: string[] = [];
  const logs: DailyLog[] = [];
  const source = sourceOverride ?? "generic_csv";

  const dateIdx = headers.findIndex((h) => /date|day|start/i.test(h));
  const flowIdx = headers.findIndex((h) => /flow|period|bleed|menstr|intensity/i.test(h));
  const sympIdx = headers.findIndex((h) => /symptom/i.test(h));
  const moodIdx = headers.findIndex((h) => /mood/i.test(h));
  const energyIdx = headers.findIndex((h) => /energy/i.test(h));
  const notesIdx = headers.findIndex((h) => /note/i.test(h));

  if (dateIdx === -1) {
    return {
      source,
      logs: [],
      errors: ["No date column found. Expected a column named 'date', 'day', or 'start'."],
    };
  }
  if (flowIdx === -1) {
    // Bug fix #3: never fabricate flow. Import what the file actually says.
    errors.push(
      "No flow/period column found — days were imported without flow data."
    );
  }

  const order = detectSlashOrder(rows.map((r) => r[dateIdx]));
  for (const row of rows) {
    const date = normalizeDate(row[dateIdx] ?? "", order);
    if (!date) {
      errors.push(`Skipped row: invalid date "${row[dateIdx]}"`);
      continue;
    }
    const flow = flowIdx !== -1 ? normalizeFlow(row[flowIdx] ?? "") : "none";
    const symptoms =
      sympIdx !== -1 && row[sympIdx]
        ? row[sympIdx].split(/[;|,]/).map((s) => s.trim()).filter(Boolean)
        : [];
    const mood = moodIdx !== -1 ? row[moodIdx] || null : null;
    const energy = energyIdx !== -1 ? row[energyIdx] || null : null;
    const notes = notesIdx !== -1 ? row[notesIdx] || "" : "";

    logs.push({ date, flow, symptoms, mood, energy, notes });
  }
  return { source, logs, errors };
}

// ─── Third-party entry point ─────────────────────────────────────────────────

export function parseImportFile(text: string, filename: string): ImportResult {
  const source = detectSource(text, filename);
  switch (source) {
    case "clue":
      return parseClueCSV(text);
    case "flo":
      return parseFloExport(text);
    case "apple_health":
      return parseAppleHealthXML(text);
    case "generic_csv":
      return parseGenericCSV(text);
    case "rhea_backup":
      return { source: "rhea_backup", logs: [], errors: ["Use the Rhea backup import instead"] };
    default:
      return parseGenericCSV(text);
  }
}

export function sourceLabel(source: ImportSource): string {
  switch (source) {
    case "clue":
      return "Clue";
    case "flo":
      return "Flo";
    case "apple_health":
      return "Apple Health";
    case "generic_csv":
      return "CSV";
    case "rhea_backup":
      return "Rhea Backup";
    default:
      return "Unknown";
  }
}

// ─── Rhea backup parsing (version 1|2 shim; reject newer) ───────────────────

export function parseBackup(text: string): ExportDataV2 {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new StorageError(ErrorCode.DECODE_FAILED, "backup is not valid JSON", {
      cause: e,
      userMessage: "That file isn't a valid Rhea backup.",
    });
  }
  const data = raw as Omit<Partial<ExportDataV2>, "version"> & { version?: number };

  if (typeof data.version !== "number" || !Array.isArray(data.logs)) {
    throw new StorageError(ErrorCode.DECODE_FAILED, "backup missing version/logs", {
      userMessage: "That file isn't a valid Rhea backup.",
    });
  }
  if (data.version > 2) {
    throw new StorageError(ErrorCode.DECODE_FAILED, `backup version ${data.version} unsupported`, {
      userMessage:
        "This backup was exported by a newer version of Rhea. Update the app, then try again.",
    });
  }
  if (data.encryption) {
    throw new StorageError(ErrorCode.DECODE_FAILED, "encrypted backup not yet supported", {
      userMessage:
        "Passphrase-protected backups aren't supported yet in this version.",
    });
  }

  // v1 shim: new fields default (medication [], intimacy null); meta as-is.
  const logs = (data.logs as DailyLog[]).map((l) => ({
    medication: [],
    intimacy: null,
    ...l,
  }));

  return {
    version: 2,
    exportedAt: String(data.exportedAt ?? ""),
    appVersion: String(data.appVersion ?? (data.version === 1 ? "0.1.0" : "unknown")),
    deviceId: String(data.deviceId ?? "unknown"),
    logs,
    meta: (data.meta as Record<string, unknown>) ?? {},
  };
}

// ─── Apply (merge, never blind-overwrite) ────────────────────────────────────

/** Per-field merge: incoming wins where it carries content (bug fix #5). */
export function mergeLog(existing: DailyLog | undefined, incoming: DailyLog): DailyLog {
  if (!existing) return incoming;
  return {
    date: incoming.date,
    flow: incoming.flow !== "none" ? incoming.flow : existing.flow,
    symptoms:
      incoming.symptoms.length > 0
        ? Array.from(new Set([...existing.symptoms, ...incoming.symptoms]))
        : existing.symptoms,
    mood: incoming.mood ?? existing.mood,
    energy: incoming.energy ?? existing.energy,
    notes: incoming.notes || existing.notes,
    medication:
      incoming.medication && incoming.medication.length > 0
        ? incoming.medication
        : existing.medication,
    intimacy: incoming.intimacy ?? existing.intimacy,
  };
}

function sameLog(a: DailyLog, b: DailyLog): boolean {
  const norm = (l: DailyLog) =>
    JSON.stringify([
      l.date,
      l.flow,
      [...l.symptoms].sort(),
      l.mood,
      l.energy,
      l.notes,
      l.medication ?? [],
      l.intimacy ?? null,
    ]);
  return norm(a) === norm(b);
}

export interface ApplyResult {
  imported: number;
  skipped: number;
}

/** Idempotent keyed-by-date MERGE upsert of parsed third-party/backup logs. */
export async function applyImportedLogs(
  logRepo: LogRepository,
  logs: DailyLog[]
): Promise<ApplyResult> {
  let imported = 0;
  let skipped = 0;
  for (const incoming of logs) {
    const existing = await logRepo.get(incoming.date);
    const merged = mergeLog(existing, incoming);
    if (existing && sameLog(existing, merged)) {
      skipped++;
      continue;
    }
    await logRepo.save(merged);
    imported++;
  }
  return { imported, skipped };
}

/** Apply a parsed backup: merge logs; restore meta minus sync-state keys. */
export async function applyBackup(
  logRepo: LogRepository,
  metaRepo: MetaRepository,
  data: ExportDataV2
): Promise<ApplyResult> {
  const result = await applyImportedLogs(logRepo, data.logs ?? []);
  for (const [key, value] of Object.entries(data.meta ?? {})) {
    if (BACKUP_EXCLUDED_META_KEYS.includes(key)) continue;
    await metaRepo.set(key, value);
  }
  return result;
}
