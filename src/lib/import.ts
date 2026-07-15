import type { DailyLog, FlowLevel } from "@/types";
import { emptyLog } from "@/lib/db";

export type ImportSource = "clue" | "flo" | "apple_health" | "generic_csv" | "rhea_backup" | "unknown";

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
  // Default: if it mentions bleeding at all, treat as medium
  if (lower.includes("bleed") || lower.includes("period") || lower.includes("menstr")) return "medium";
  return "none";
}

// ─── Date normalization ──────────────────────────────────────────────────────

function normalizeDate(raw: string): string | null {
  // Try ISO format first (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  // Try MM/DD/YYYY
  const mdy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) {
    return `${mdy[3]}-${mdy[1].padStart(2, "0")}-${mdy[2].padStart(2, "0")}`;
  }

  // Try DD/MM/YYYY (common in EU exports)
  const dmy = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  }

  // Try Date.parse as fallback
  const parsed = new Date(raw);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, "0");
    const d = String(parsed.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  return null;
}

// ─── CSV parser ──────────────────────────────────────────────────────────────

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) return { headers: [], rows: [] };

  const headers = parseCSVLine(lines[0]);
  const rows = lines.slice(1).map(parseCSVLine);
  return { headers, rows };
}

// ─── Source detection ────────────────────────────────────────────────────────

export function detectSource(text: string, filename: string): ImportSource {
  const lower = filename.toLowerCase();

  // Rhea backup
  if (text.includes('"version":') && text.includes('"exportedAt":') && text.includes('"logs":')) {
    return "rhea_backup";
  }

  // Apple Health XML
  if (text.includes("HKQuantityTypeIdentifier") || text.includes("HKCategoryTypeIdentifier") || lower.endsWith(".xml")) {
    return "apple_health";
  }

  // Clue CSV: typically has "Date", "Period" or "Menstrual flow" columns
  if (lower.includes("clue")) return "clue";

  // Flo: JSON or CSV
  if (lower.includes("flo")) return "flo";

  // Try to detect from CSV headers
  const { headers } = parseCSV(text);
  const headerStr = headers.join(" ").toLowerCase();
  if (headerStr.includes("menstrual flow") || headerStr.includes("period intensity")) return "clue";
  if (headerStr.includes("cycle_day") || headerStr.includes("period_day")) return "flo";

  if (lower.endsWith(".csv")) return "generic_csv";

  return "unknown";
}

// ─── Clue CSV parser ─────────────────────────────────────────────────────────

function parseClueCSV(text: string): ImportResult {
  const { headers, rows } = parseCSV(text);
  const errors: string[] = [];
  const logs: DailyLog[] = [];

  // Find relevant column indices
  const dateIdx = headers.findIndex((h) => /date/i.test(h));
  const flowIdx = headers.findIndex((h) => /period|menstrual.*flow|flow/i.test(h));

  if (dateIdx === -1) {
    return { source: "clue", logs: [], errors: ["No date column found"] };
  }

  for (const row of rows) {
    const dateRaw = row[dateIdx];
    const date = normalizeDate(dateRaw);
    if (!date) {
      errors.push(`Skipped: invalid date "${dateRaw}"`);
      continue;
    }

    const flow = flowIdx !== -1 ? normalizeFlow(row[flowIdx] ?? "") : "none";
    if (flow === "none") continue; // Clue exports all days; skip non-period days

    logs.push({ ...emptyLog(date), flow });
  }

  return { source: "clue", logs, errors };
}

// ─── Flo parser ──────────────────────────────────────────────────────────────

function parseFloExport(text: string): ImportResult {
  const errors: string[] = [];
  const logs: DailyLog[] = [];

  // Flo can export as JSON or CSV
  try {
    const json = JSON.parse(text);
    // Flo JSON format: array of cycle/period objects
    const entries = Array.isArray(json) ? json : json.periods ?? json.data ?? [];
    for (const entry of entries) {
      const date = normalizeDate(entry.date ?? entry.start_date ?? "");
      if (!date) continue;
      const flow = normalizeFlow(entry.flow ?? entry.intensity ?? "medium");
      logs.push({ ...emptyLog(date), flow });
    }
    return { source: "flo", logs, errors };
  } catch {
    // Fall back to CSV
    return parseGenericCSV(text, "flo");
  }
}

// ─── Apple Health XML parser ─────────────────────────────────────────────────

function parseAppleHealthXML(text: string): ImportResult {
  const errors: string[] = [];
  const logs: DailyLog[] = [];

  // Parse menstrual flow records
  const recordRegex = /<Record[^>]*type="HKCategoryTypeIdentifierMenstrualFlow"[^>]*\/>/g;
  const dateRegex = /startDate="([^"]+)"/;
  const valueRegex = /value="([^"]+)"/;

  let match;
  while ((match = recordRegex.exec(text)) !== null) {
    const record = match[0];
    const dateMatch = record.match(dateRegex);
    const valueMatch = record.match(valueRegex);

    if (!dateMatch) continue;

    const date = normalizeDate(dateMatch[1].split(" ")[0]);
    if (!date) continue;

    // Apple Health values: HKCategoryValueMenstrualFlowLight, Medium, Heavy, Unspecified
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

// ─── Generic CSV parser ──────────────────────────────────────────────────────

function parseGenericCSV(text: string, sourceOverride?: ImportSource): ImportResult {
  const { headers, rows } = parseCSV(text);
  const errors: string[] = [];
  const logs: DailyLog[] = [];
  const source = sourceOverride ?? "generic_csv";

  // Auto-detect columns
  const dateIdx = headers.findIndex((h) => /date|day|start/i.test(h));
  const flowIdx = headers.findIndex((h) => /flow|period|bleed|menstr|intensity/i.test(h));
  const sympIdx = headers.findIndex((h) => /symptom/i.test(h));
  const moodIdx = headers.findIndex((h) => /mood/i.test(h));
  const energyIdx = headers.findIndex((h) => /energy/i.test(h));
  const notesIdx = headers.findIndex((h) => /note/i.test(h));

  if (dateIdx === -1) {
    return { source, logs: [], errors: ["No date column found. Expected a column named 'date', 'day', or 'start'."] };
  }

  for (const row of rows) {
    const date = normalizeDate(row[dateIdx] ?? "");
    if (!date) {
      errors.push(`Skipped row: invalid date "${row[dateIdx]}"`);
      continue;
    }

    const flow = flowIdx !== -1 ? normalizeFlow(row[flowIdx] ?? "") : "medium";
    const symptoms = sympIdx !== -1 && row[sympIdx]
      ? row[sympIdx].split(/[;|,]/).map((s) => s.trim()).filter(Boolean)
      : [];
    const mood = moodIdx !== -1 ? row[moodIdx] || null : null;
    const energy = energyIdx !== -1 ? row[energyIdx] || null : null;
    const notes = notesIdx !== -1 ? row[notesIdx] || "" : "";

    logs.push({ date, flow, symptoms, mood, energy, notes });
  }

  return { source, logs, errors };
}

// ─── Main import function ────────────────────────────────────────────────────

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
      // Rhea backups use the existing import path in db.ts
      return { source: "rhea_backup", logs: [], errors: ["Use the Rhea backup import instead"] };
    default:
      return parseGenericCSV(text);
  }
}

export function sourceLabel(source: ImportSource): string {
  switch (source) {
    case "clue": return "Clue";
    case "flo": return "Flo";
    case "apple_health": return "Apple Health";
    case "generic_csv": return "CSV";
    case "rhea_backup": return "Rhea Backup";
    default: return "Unknown";
  }
}
