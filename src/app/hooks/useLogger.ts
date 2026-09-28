import { useState, useEffect, useCallback, useRef } from "react";
import type { DailyLog } from "@/domain/types";
import { emptyLog } from "@/domain/types";
import { toDateKey } from "@/domain/dates";
import { useContainer } from "@/app/di";
import type { SaveLogsArgs } from "@/data/repositories/LogRepository";

interface UseLoggerReturn {
  log: DailyLog;
  setLog: React.Dispatch<React.SetStateAction<DailyLog>>;
  /**
   * Persist `log` as the whole record. Rejects if the write fails, and refuses
   * (rejects without writing) while this date's stored record is still loading
   * or could not be read, so a Save never overwrites a record the UI never
   * showed (N8). Callers must await it and surface the error (P0-04).
   */
  save: () => Promise<void>;
  /**
   * Persist an explicit batch of logs through the same write path (used by
   * QuickAddPeriod and the Overview symptom toggles — M1.3 single write path).
   * Default "replace"; QuickAddPeriod passes "merge-defined" patches (P0-01).
   * A replace-mode batch that includes the active date is refused on the same
   * terms as save(); merge-defined batches and other dates are never refused.
   */
  saveMany: (...args: SaveLogsArgs) => Promise<void>;
  remove: () => Promise<void>;
  /**
   * True only when a persisted, non-deleted log exists for this date — drives
   * the Delete action (RHEA UI gap). A merely populated-but-unsaved draft is
   * NOT existing; a locally-tombstoned log is removed from the store, so it
   * reads back as absent.
   */
  exists: boolean;
  loading: boolean;
  /** Set when this date's stored record could not be read; `log` is then an empty draft. */
  loadError: Error | null;
}

/** Thrown by save()/saveMany() instead of writing a record the UI never loaded. */
class LogNotLoadedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LogNotLoadedError";
  }
}

interface LoadStatus {
  key: string;
  state: "pending" | "loaded" | "failed";
}

const SAVE_FAILED = "Couldn't save this log. Your changes are still here — please try again.";
const NOT_LOADED_PENDING = "This day's log is still loading. Please try again in a moment.";
const NOT_LOADED_FAILED =
  "Couldn't load this day's saved log, so saving now could overwrite it. Nothing was saved — reload the app and try again.";

/**
 * User-facing text for a rejected save(): the refusal's own reason, else a
 * generic retry prompt (raw storage errors are not shown to the user).
 */
export function saveErrorMessage(err: unknown): string {
  return err instanceof LogNotLoadedError ? err.message : SAVE_FAILED;
}

export function useLogger(
  date: Date,
  onSaved?: (saved: DailyLog[]) => void
): UseLoggerReturn {
  const container = useContainer();
  const dateKey = toDateKey(date);
  const [log, setLog] = useState<DailyLog>(() => emptyLog(dateKey));
  const [exists, setExists] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<Error | null>(null);
  // Load state of the record `log` reflects, read at call time so a save that
  // races the initial read is refused rather than writing the empty draft.
  // Each read owns its object: replacing it (a newer read, or a save that
  // returned the persisted record) makes that read's late result stale.
  const status = useRef<LoadStatus>({ key: dateKey, state: "pending" });

  useEffect(() => {
    let cancelled = false;
    const read: LoadStatus = { key: dateKey, state: "pending" };
    status.current = read;
    setLoading(true);
    setLoadError(null);
    const stale = () => cancelled || status.current !== read;
    container.getLog(dateKey).then(
      (existing) => {
        if (stale()) return;
        status.current = { key: dateKey, state: "loaded" };
        // A returned row is persisted; a locally-deleted log is removed from the
        // store, so `existing == null` there. Guard `deleted` defensively in case
        // a soft-deleted row is ever surfaced by a driver.
        setExists(existing != null && (existing as { deleted?: boolean }).deleted !== true);
        setLog(existing ?? emptyLog(dateKey));
        setLoading(false);
      },
      (err: unknown) => {
        if (stale()) return;
        status.current = { key: dateKey, state: "failed" };
        console.error("Failed to load the daily log:", err);
        // Nothing is known about the stored record: never present another
        // date's (or a stale) log as this date's, and don't offer Delete.
        setExists(false);
        setLog(emptyLog(dateKey));
        setLoadError(err instanceof Error ? err : new Error(String(err)));
        setLoading(false);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [dateKey, container]);

  /** Refuse a whole-record write of the active date unless its record loaded. */
  const assertActiveLoaded = useCallback(() => {
    const { key, state } = status.current;
    if (key === dateKey && state === "loaded") return;
    throw new LogNotLoadedError(
      key === dateKey && state === "failed" ? NOT_LOADED_FAILED : NOT_LOADED_PENDING
    );
  }, [dateKey]);

  const save = useCallback(async () => {
    assertActiveLoaded();
    await container.saveLog(log);
    setExists(true);
    onSaved?.([log]);
  }, [log, onSaved, container, assertActiveLoaded]);

  const saveMany = useCallback(
    async (...args: SaveLogsArgs) => {
      const [logs, opts] = args;
      // merge-defined reads the prior row inside its own transaction, so it
      // can never overwrite unseen content; only replace-mode is guarded.
      if (opts?.mode !== "merge-defined" && logs.some((l) => l.date === dateKey)) {
        assertActiveLoaded();
      }
      // One transaction for the batch. Use the PERSISTED records, never the
      // input: a merge-defined patch is partial, and onSaved may push them.
      const saved = await container.saveLogs(...args);
      const active = saved.find((l) => l.date === dateKey);
      // Only while that date is still the active one: the user may have moved
      // to another date during the write.
      if (active && status.current.key === dateKey) {
        // The persisted record is now known: it supersedes a pending or failed
        // read, and keeps the active view in step.
        status.current = { key: dateKey, state: "loaded" };
        setLog(active);
        setExists(true);
        setLoadError(null);
        setLoading(false);
      }
      onSaved?.(saved);
    },
    [dateKey, onSaved, container, assertActiveLoaded]
  );

  const remove = useCallback(async () => {
    // Throws if the local tombstone write fails — the caller keeps the modal
    // open and surfaces the error; the log row is untouched (tx rolls back).
    await container.deleteLog(dateKey);
    setLog(emptyLog(dateKey));
    setExists(false);
    onSaved?.([]);
  }, [dateKey, onSaved, container]);

  return { log, setLog, save, saveMany, remove, exists, loading, loadError };
}
