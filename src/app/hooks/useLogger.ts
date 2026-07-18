import { useState, useEffect, useCallback } from "react";
import type { DailyLog } from "@/domain/types";
import { emptyLog } from "@/domain/types";
import { toDateKey } from "@/domain/dates";
import { useContainer } from "@/app/di";

interface UseLoggerReturn {
  log: DailyLog;
  setLog: React.Dispatch<React.SetStateAction<DailyLog>>;
  save: () => Promise<void>;
  /**
   * Persist an explicit batch of logs through the same write path (used by
   * QuickAddPeriod and the Overview symptom toggles — M1.3 single write path).
   */
  saveMany: (logs: DailyLog[]) => Promise<void>;
  remove: () => Promise<void>;
  /**
   * True only when a persisted, non-deleted log exists for this date — drives
   * the Delete action (RHEA UI gap). A merely populated-but-unsaved draft is
   * NOT existing; a locally-tombstoned log is removed from the store, so it
   * reads back as absent.
   */
  exists: boolean;
  loading: boolean;
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

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    container.getLog(dateKey).then((existing) => {
      if (cancelled) return;
      // A returned row is persisted; a locally-deleted log is removed from the
      // store, so `existing == null` there. Guard `deleted` defensively in case
      // a soft-deleted row is ever surfaced by a driver.
      setExists(existing != null && (existing as { deleted?: boolean }).deleted !== true);
      setLog(existing ?? emptyLog(dateKey));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [dateKey, container]);

  const save = useCallback(async () => {
    await container.saveLog(log);
    setExists(true);
    onSaved?.([log]);
  }, [log, onSaved, container]);

  const saveMany = useCallback(
    async (logs: DailyLog[]) => {
      for (const l of logs) {
        await container.saveLog(l);
        if (l.date === dateKey) {
          setLog(l); // keep the active view in step
          setExists(true);
        }
      }
      onSaved?.(logs);
    },
    [dateKey, onSaved, container]
  );

  const remove = useCallback(async () => {
    // Throws if the local tombstone write fails — the caller keeps the modal
    // open and surfaces the error; the log row is untouched (tx rolls back).
    await container.deleteLog(dateKey);
    setLog(emptyLog(dateKey));
    setExists(false);
    onSaved?.([]);
  }, [dateKey, onSaved, container]);

  return { log, setLog, save, saveMany, remove, exists, loading };
}
