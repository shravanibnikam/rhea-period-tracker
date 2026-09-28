// @vitest-environment jsdom
/**
 * useCycleData reads land in request order, whatever order they resolve in
 * (P0-06 review). The mount-time read runs against whichever store is active
 * then (e.g. `rhea-local` before the session arrives); a later read runs
 * against the signed-in account. If the slow first read resolves last, it must
 * not overwrite the account's data with another store's rows.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act, waitFor, cleanup } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { ContainerProvider } from "@/app/di/context";
import type { Container } from "@/app/di/Container";
import { useCycleData } from "@/app/hooks/useCycleData";
import { emptyLog, type DailyLog } from "@/domain/types";

afterEach(cleanup);

const LOCAL: DailyLog[] = [{ ...emptyLog("2026-01-01"), flow: "heavy" }];
const ACCOUNT: DailyLog[] = [
  { ...emptyLog("2026-08-01"), flow: "medium" },
  { ...emptyLog("2026-08-02"), flow: "light" },
];

function harness(meta: Record<string, unknown> = {}) {
  const reads: Array<{ resolve: (v: DailyLog[]) => void; reject: (e: Error) => void }> = [];
  const fake = {
    getAllLogs: vi.fn(
      () =>
        new Promise<DailyLog[]>((resolve, reject) => {
          reads.push({ resolve, reject });
        })
    ),
    getMeta: vi.fn((key: string) => Promise.resolve(meta[key])),
  };
  const value = fake as unknown as Container;
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(ContainerProvider, { value }, children);
  return { reads, ...renderHook(() => useCycleData(), { wrapper }) };
}

describe("useCycleData — latest request wins", () => {
  it("a slow earlier read that resolves LAST does not overwrite the newer read", async () => {
    const { reads, result } = harness();
    await waitFor(() => expect(reads).toHaveLength(1)); // mount read (other store)

    let second!: Promise<void>;
    act(() => {
      second = result.current.refresh(); // the account's read
    });
    expect(reads).toHaveLength(2);

    await act(async () => {
      reads[1].resolve(ACCOUNT);
      await second;
    });
    expect(result.current.logs).toEqual(ACCOUNT);

    await act(async () => {
      reads[0].resolve(LOCAL); // the stale read lands late
      await Promise.resolve();
    });
    expect(result.current.logs).toEqual(ACCOUNT);
    expect(result.current.loading).toBe(false);
  });

  it("an earlier read that resolves FIRST still shows until the newer one lands (control)", async () => {
    const { reads, result } = harness();
    await waitFor(() => expect(reads).toHaveLength(1));
    act(() => {
      void result.current.refresh();
    });

    await act(async () => {
      reads[0].resolve(LOCAL);
      await Promise.resolve();
    });
    expect(result.current.logs).toEqual(LOCAL);

    await act(async () => {
      reads[1].resolve(ACCOUNT);
      await Promise.resolve();
    });
    expect(result.current.logs).toEqual(ACCOUNT);
  });
});

describe("useCycleData — a failed read never leaves another store's rows on screen", () => {
  it("a read that REJECTS after rows were shown clears logs and excluded cycles (e.g. B's store fails after A's showed)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { reads, result } = harness({ excludedCycles: ["2026-08-01"] });
    await waitFor(() => expect(reads).toHaveLength(1));
    await act(async () => {
      reads[0].resolve(ACCOUNT); // A's rows
      await Promise.resolve();
    });
    expect(result.current.logs).toEqual(ACCOUNT);
    expect([...result.current.excludedStarts]).toEqual(["2026-08-01"]);

    let failing!: Promise<void>;
    act(() => {
      failing = result.current.refresh(); // B's read
    });
    await act(async () => {
      reads[1].reject(new Error("IndexedDB failure"));
      await failing;
    });

    expect(result.current.logs).toEqual([]);
    expect(result.current.excludedStarts.size).toBe(0);
    expect(result.current.state.cycles).toEqual([]);
    expect(result.current.loading).toBe(false);
  });
});
