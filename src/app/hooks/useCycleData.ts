import { useState, useEffect, useCallback } from "react";
import type { DailyLog, CycleState } from "@/domain/types";
import { deriveCycleState } from "@/domain/cycle";
import { useContainer } from "@/app/di";

interface UseCycleDataReturn {
  logs: DailyLog[];
  state: CycleState;
  loading: boolean;
  excludedStarts: Set<string>;
  refresh: () => Promise<void>;
}

export function useCycleData(): UseCycleDataReturn {
  const container = useContainer();
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [excludedStarts, setExcludedStarts] = useState<Set<string>>(new Set());
  const [state, setState] = useState<CycleState>(() =>
    deriveCycleState([], null)
  );
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [allLogs, override, excluded] = await Promise.all([
        container.getAllLogs(),
        container.getMeta<number>("cycleLengthOverride"),
        container.getMeta<string[]>("excludedCycles"),
      ]);
      const excludedSet = new Set(excluded ?? []);
      setLogs(allLogs);
      setExcludedStarts(excludedSet);
      setState(deriveCycleState(allLogs, override ?? null, new Date(), excludedSet));
    } catch (err) {
      console.error("Failed to load cycle data:", err);
      // Still show the app with empty state rather than hanging on loading
      setState(deriveCycleState([], null));
    }
    setLoading(false);
  }, [container]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { logs, state, loading, excludedStarts, refresh };
}
