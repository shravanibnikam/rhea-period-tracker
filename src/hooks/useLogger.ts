import { useState, useEffect, useCallback } from "react";
import type { DailyLog } from "@/types";
import { getLog, saveLog, deleteLog, emptyLog } from "@/lib/db";
import { toDateKey } from "@/lib/utils";

interface UseLoggerReturn {
  log: DailyLog;
  setLog: React.Dispatch<React.SetStateAction<DailyLog>>;
  save: () => Promise<void>;
  remove: () => Promise<void>;
  loading: boolean;
}

export function useLogger(
  date: Date,
  onSaved?: () => void
): UseLoggerReturn {
  const dateKey = toDateKey(date);
  const [log, setLog] = useState<DailyLog>(() => emptyLog(dateKey));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getLog(dateKey).then((existing) => {
      if (cancelled) return;
      setLog(existing ?? emptyLog(dateKey));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [dateKey]);

  const save = useCallback(async () => {
    await saveLog(log);
    onSaved?.();
  }, [log, onSaved]);

  const remove = useCallback(async () => {
    await deleteLog(dateKey);
    setLog(emptyLog(dateKey));
    onSaved?.();
  }, [dateKey, onSaved]);

  return { log, setLog, save, remove, loading };
}
