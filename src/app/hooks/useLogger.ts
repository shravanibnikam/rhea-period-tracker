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
  loading: boolean;
}

export function useLogger(
  date: Date,
  onSaved?: (saved: DailyLog[]) => void
): UseLoggerReturn {
  const container = useContainer();
  const dateKey = toDateKey(date);
  const [log, setLog] = useState<DailyLog>(() => emptyLog(dateKey));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    container.getLog(dateKey).then((existing) => {
      if (cancelled) return;
      setLog(existing ?? emptyLog(dateKey));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [dateKey, container]);

  const save = useCallback(async () => {
    await container.saveLog(log);
    onSaved?.([log]);
  }, [log, onSaved, container]);

  const saveMany = useCallback(
    async (logs: DailyLog[]) => {
      for (const l of logs) {
        await container.saveLog(l);
        if (l.date === dateKey) setLog(l); // keep the active view in step
      }
      onSaved?.(logs);
    },
    [dateKey, onSaved, container]
  );

  const remove = useCallback(async () => {
    await container.deleteLog(dateKey);
    setLog(emptyLog(dateKey));
    onSaved?.([]);
  }, [dateKey, onSaved, container]);

  return { log, setLog, save, saveMany, remove, loading };
}
