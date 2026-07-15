import { openDB, type IDBPDatabase } from "idb";
import type { DailyLog, FlowLevel } from "@/types";

const DB_NAME = "rhea";
const DB_VERSION = 1;

interface RheaDB {
  logs: {
    key: string;
    value: DailyLog;
  };
  meta: {
    key: string;
    value: unknown;
  };
}

let dbPromise: Promise<IDBPDatabase<RheaDB>> | null = null;

function getDB(): Promise<IDBPDatabase<RheaDB>> {
  if (!dbPromise) {
    dbPromise = openDB<RheaDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("logs")) {
          db.createObjectStore("logs", { keyPath: "date" });
        }
        if (!db.objectStoreNames.contains("meta")) {
          db.createObjectStore("meta");
        }
      },
    });
  }
  return dbPromise;
}

// ─── Daily Logs ──────────────────────────────────────────────────────────────

export function emptyLog(date: string): DailyLog {
  return {
    date,
    flow: "none",
    symptoms: [],
    mood: null,
    energy: null,
    notes: "",
  };
}

export async function saveLog(log: DailyLog): Promise<void> {
  const db = await getDB();
  await db.put("logs", log);
}

export async function getLog(date: string): Promise<DailyLog | undefined> {
  const db = await getDB();
  return db.get("logs", date);
}

export async function getAllLogs(): Promise<DailyLog[]> {
  const db = await getDB();
  return db.getAll("logs");
}

export async function deleteLog(date: string): Promise<void> {
  const db = await getDB();
  await db.delete("logs", date);
}

// ─── Meta (settings) ─────────────────────────────────────────────────────────

export async function getMeta<T>(key: string): Promise<T | undefined> {
  const db = await getDB();
  return db.get("meta", key) as Promise<T | undefined>;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  const db = await getDB();
  await db.put("meta", value, key);
}

// ─── Export / Import / Erase ─────────────────────────────────────────────────

export interface ExportData {
  version: 1;
  exportedAt: string;
  logs: DailyLog[];
  meta: Record<string, unknown>;
}

export async function exportData(): Promise<ExportData> {
  const db = await getDB();
  const logs = await db.getAll("logs");

  const metaKeys = await db.getAllKeys("meta");
  const meta: Record<string, unknown> = {};
  for (const key of metaKeys) {
    meta[String(key)] = await db.get("meta", key);
  }

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    logs,
    meta,
  };
}

export async function importData(data: ExportData): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(["logs", "meta"], "readwrite");

  for (const log of data.logs) {
    await tx.objectStore("logs").put(log);
  }

  for (const [key, value] of Object.entries(data.meta)) {
    await tx.objectStore("meta").put(value, key);
  }

  await tx.done;
}

export async function eraseAllData(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(["logs", "meta"], "readwrite");
  await tx.objectStore("logs").clear();
  await tx.objectStore("meta").clear();
  await tx.done;
}

export function downloadJSON(data: ExportData): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `rhea-backup-${data.exportedAt.slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
