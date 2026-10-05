// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor, act, cleanup } from "@testing-library/react";
import type { ReactNode } from "react";
import { Container } from "@/app/di/Container";
import { ContainerProvider } from "@/app/di/context";
import { useLogger } from "@/app/hooks/useLogger";
import { emptyLog, type DailyLog } from "@/domain/types";

// P0-04 review item 5 (basis: reviewer probe zzProbeStillActive). A write that
// resolves after an A→B account switch must not apply its outcome to B's view:
// save must not mark B's day as existing, saveMany must not show A's record
// (A's notes) in B's session, and remove must not blank B's day. These pin the
// stillActive() guards, which no earlier test killed.

const DATE = new Date(2026, 2, 10);
const KEY = "2026-03-10";

let open: Container[] = [];
let seq = 0;
afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  for (const c of open) await c.closeDB();
  open = [];
});

async function seed(uid: string, log: DailyLog) {
  const c = new Container();
  c.setAccount(uid);
  await c.saveLog(log);
  await c.closeDB();
}

/** A signed in with a row; B's store as given. Returns the hook plus a switch-to-B step. */
async function setup(bLog: DailyLog | null) {
  const a = `sa-A-${++seq}-${Date.now()}`;
  const b = `sa-B-${seq}-${Date.now()}`;
  await seed(a, { ...emptyLog(KEY), notes: "A-PRIVATE" });
  if (bLog) await seed(b, bLog);
  const c = new Container();
  c.setAccount(a);
  open.push(c);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ContainerProvider value={c}>{children}</ContainerProvider>
  );
  const hook = renderHook(({ k }: { k: string }) => useLogger(DATE, undefined, k), {
    initialProps: { k: a },
    wrapper,
  });
  await waitFor(() => expect(hook.result.current.log.notes).toBe("A-PRIVATE"));
  const switchToB = async () => {
    c.setAccount(b);
    hook.rerender({ k: b });
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
  };
  return { c, ...hook, switchToB };
}

/** Let `method` do its real write, then hold its result until released. */
function holdAfterWrite<K extends "saveLog" | "saveLogs" | "deleteLog">(c: Container, method: K) {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  let markLanded!: () => void;
  const landed = new Promise<void>((r) => (markLanded = r));
  const real = (c[method] as (...args: unknown[]) => Promise<unknown>).bind(c);
  vi.spyOn(c, method).mockImplementationOnce((async (...args: unknown[]) => {
    const out = await real(...args); // lands in A's store
    markLanded();
    await gate; // resolves only after the switch
    return out;
  }) as never);
  return { release, landed };
}

describe("useLogger: a write finishing after an account switch leaves B's view alone", () => {
  it("saveMany: A's record (A's notes) is never shown in B's session", async () => {
    const { c, result, switchToB } = await setup({ ...emptyLog(KEY), notes: "B-OWN" });
    const { release, landed } = holdAfterWrite(c, "saveLogs");
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.saveMany([{ ...result.current.log, symptoms: ["Cramps"] }]);
    });
    await landed;
    await switchToB();
    expect(result.current.log.notes).toBe("B-OWN");

    await act(async () => {
      release();
      await pending;
    });
    expect(result.current.log.notes).toBe("B-OWN");
    expect(result.current.log.symptoms).toEqual([]);
  });

  it("save: B's day without a log does not become 'existing' (no Delete for nothing)", async () => {
    const { c, result, switchToB } = await setup(null);
    const { release, landed } = holdAfterWrite(c, "saveLog");
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.save();
    });
    await landed;
    await switchToB();
    expect(result.current.exists).toBe(false);

    await act(async () => {
      release();
      await pending;
    });
    expect(result.current.exists).toBe(false);
    expect(result.current.log).toEqual(emptyLog(KEY));
  });

  it("remove: B's own day is not blanked", async () => {
    const { c, result, switchToB } = await setup({ ...emptyLog(KEY), notes: "B-OWN" });
    const { release, landed } = holdAfterWrite(c, "deleteLog");
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.remove();
    });
    await landed;
    await switchToB();
    expect(result.current.log.notes).toBe("B-OWN");

    await act(async () => {
      release();
      await pending;
    });
    expect(result.current.log.notes).toBe("B-OWN");
    expect(result.current.exists).toBe(true);
  });
});
