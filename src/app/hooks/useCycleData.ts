import { useState, useEffect, useCallback, useRef } from "react";
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
  // Reads can resolve out of order — e.g. the mount-time read of the local store
  // landing after the signed-in account's read (P0-06). An older read never
  // overwrites a newer one that has already applied.
  const requested = useRef(0);
  const applied = useRef(0);

  const refresh = useCallback(async () => {
    const seq = ++requested.current;
    const apply = (update: () => void) => {
      if (seq < applied.current) return; // stale: a newer read already landed
      applied.current = seq;
      update();
      setLoading(false);
    };
    try {
      const [allLogs, override, excluded] = await Promise.all([
        container.getAllLogs(),
        container.getMeta<number>("cycleLengthOverride"),
        container.getMeta<string[]>("excludedCycles"),
      ]);
      const excludedSet = new Set(excluded ?? []);
      apply(() => {
        setLogs(allLogs);
        setExcludedStarts(excludedSet);
        setState(deriveCycleState(allLogs, override ?? null, new Date(), excludedSet));
      });
    } catch (err) {
      console.error("Failed to load cycle data:", err);
      // Still show the app with empty state rather than hanging on loading —
      // empty ALL of it: after an account switch the rows on screen belong to
      // the previous store, and must not stay visible to the new account.
      apply(() => {
        setLogs([]);
        setExcludedStarts(new Set());
        setState(deriveCycleState([], null));
      });
    }
  }, [container]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { logs, state, loading, excludedStarts, refresh };
}
