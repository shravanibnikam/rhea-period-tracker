/**
 * app/lib/exports.ts — the user's own data, out of Rhea in formats other apps
 * read: a spreadsheet (CSV), the predicted periods as a calendar file (.ics) so
 * the user's own calendar reminds them, and the figures for a printable
 * summary. Pure builders, plus one browser download helper.
 */

import type { Cycle, CycleState, DailyLog } from "@/domain/types";
import { addDays, parseDate, toDateKey } from "@/domain/dates";

// ─── CSV (RFC 4180) ─────────────────────────────────────────────────────────

const CSV_COLUMNS = ["date", "flow", "symptoms", "mood", "energy", "medication", "intimacy", "notes"];

// ponytail: no formula-injection escaping (a leading = + - @ stays as written);
// the file is the user's own notes for their own spreadsheet.
function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function medicationText(log: DailyLog): string {
  return (log.medication ?? [])
    .map((m) => [m.name, m.dose, m.takenAt && `at ${m.takenAt}`].filter(Boolean).join(" "))
    .join("; ");
}

function intimacyText(intimacy: DailyLog["intimacy"]): string {
  if (!intimacy) return "";
  if (!intimacy.occurred) return "no";
  if (intimacy.protected === undefined) return "yes";
  return intimacy.protected ? "yes, protected" : "yes, unprotected";
}

/**
 * Every logged day as one row, oldest first, lists joined with "; ". CRLF
 * records and a UTF-8 byte-order mark, so spreadsheet apps read accents and
 * line breaks in notes correctly.
 */
export function logsToCSV(logs: DailyLog[]): string {
  const rows = [...logs]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((l) => [
      l.date,
      l.flow,
      l.symptoms.join("; "),
      l.mood ?? "",
      l.energy ?? "",
      medicationText(l),
      intimacyText(l.intimacy),
      l.notes,
    ]);
  return "﻿" + [CSV_COLUMNS, ...rows].map((r) => r.map(csvField).join(",")).join("\r\n") + "\r\n";
}

// ─── iCalendar (RFC 5545) ───────────────────────────────────────────────────

export const CALENDAR_EVENTS = 6;

function icsText(s: string): string {
  return s.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\r?\n/g, "\\n");
}

/** Fold a content line at 75 octets (§3.1); a UTF-8 character is never split. */
export function foldLine(line: string): string {
  const encoder = new TextEncoder();
  let out = "";
  let octets = 0;
  for (const ch of line) {
    const size = encoder.encode(ch).length;
    if (octets + size > 75) {
      out += "\r\n "; // the continuation's leading space counts toward its 75
      octets = 1;
    }
    out += ch;
    octets += size;
  }
  return out;
}

const icsDate = (d: Date) => toDateKey(d).replace(/-/g, "");

/**
 * The next CALENDAR_EVENTS predicted period starts (today or later) as all-day
 * events lasting the average period, each asking for a reminder at 9:00 the day
 * before. Null when no period is logged, so there is nothing to predict from.
 *
 * Dates follow predictFutureCycles (latest start + k × average cycle); a
 * prediction already in the past (a late period) is skipped. The UID is the
 * predicted cycle's number, so a later export moves an event rather than adding
 * a second one, in calendar apps that match events by UID.
 */
export function predictionsToICS(state: CycleState, now: Date = new Date()): string | null {
  if (!state.currentCycleStart) return null;
  const latestStart = parseDate(state.currentCycleStart);
  const cycleLength = Math.max(1, state.avgCycleLength);
  const periodLength = Math.max(1, state.avgPeriodLength);
  const today = toDateKey(now);
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const description = icsText(
    `Estimated by Rhea from your logged cycles (average cycle ${cycleLength} days, ` +
      `period ${periodLength} days). An estimate, not a diagnosis.`
  );

  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Rhea//Predicted periods//EN", "METHOD:PUBLISH"];
  for (let k = 1, added = 0; added < CALENDAR_EVENTS; k++) {
    const start = addDays(latestStart, k * cycleLength);
    if (toDateKey(start) < today) continue;
    added++;
    lines.push(
      "BEGIN:VEVENT",
      `UID:rhea-cycle-${state.cycles.length + k}@rhea`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${icsDate(start)}`,
      `DTEND;VALUE=DATE:${icsDate(addDays(start, periodLength))}`,
      "SUMMARY:Period expected (Rhea estimate)",
      `DESCRIPTION:${description}`,
      "TRANSP:TRANSPARENT",
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      "DESCRIPTION:Period expected tomorrow (Rhea estimate)",
      "TRIGGER:-PT15H",
      "END:VALARM",
      "END:VEVENT"
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

// ─── Summary for a clinician ────────────────────────────────────────────────

export const SUMMARY_CYCLES = 12;

export interface CycleSummary {
  /** The last SUMMARY_CYCLES cycles, newest first. */
  cycles: Cycle[];
  /** Completed cycles not excluded by the user: the base of every figure below. */
  counted: number;
  averageCycle: number | null;
  shortestCycle: number | null;
  longestCycle: number | null;
  /** Sample standard deviation of cycle length; null under two cycles. */
  stdDev: number | null;
  averagePeriod: number | null;
  /** Up to five symptoms by the number of days logged since `since`. */
  symptoms: { name: string; days: number }[];
  /** Start of the oldest listed cycle. */
  since: string | null;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/**
 * Plain (unweighted) figures over the listed cycles, unlike the app's weighted
 * prediction average: what a clinician expects to read. Excluded cycles are
 * listed but not counted; the cycle in progress has no length yet.
 */
export function summarizeCycles(cycles: Cycle[], logs: DailyLog[]): CycleSummary {
  const recent = cycles.slice(-SUMMARY_CYCLES);
  // Completed and not excluded: the "From N completed cycles" every figure is over.
  const counted = recent.filter((c) => !c.excluded && c.cycleLength !== null);
  const lengths = counted.map((c) => c.cycleLength as number);
  const averageCycle = mean(lengths);
  const stdDev =
    averageCycle !== null && lengths.length > 1
      ? Math.sqrt(lengths.reduce((sum, x) => sum + (x - averageCycle) ** 2, 0) / (lengths.length - 1))
      : null;

  const since = recent[0]?.periodStart ?? null;
  const days = new Map<string, number>();
  for (const log of logs) {
    if (since && log.date < since) continue;
    for (const s of log.symptoms) days.set(s, (days.get(s) ?? 0) + 1);
  }
  const symptoms = [...days]
    .map(([name, n]) => ({ name, days: n }))
    .sort((a, b) => b.days - a.days || a.name.localeCompare(b.name))
    .slice(0, 5);

  return {
    cycles: [...recent].reverse(),
    counted: lengths.length,
    averageCycle,
    shortestCycle: lengths.length ? Math.min(...lengths) : null,
    longestCycle: lengths.length ? Math.max(...lengths) : null,
    stdDev,
    averagePeriod: mean(counted.map((c) => c.periodLength)),
    symptoms,
    since,
  };
}

// ─── Download ───────────────────────────────────────────────────────────────

/** Save text as a file, as downloadJSON does (data/exporter.ts). */
export function downloadText(text: string, filename: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  // Revoked later, not at once: Safari can drop a download whose URL is revoked
  // in the same tick.
  setTimeout(() => URL.revokeObjectURL(url), 40_000);
}
