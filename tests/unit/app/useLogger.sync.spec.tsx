// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor, act, cleanup } from "@testing-library/react";
import type { ReactNode } from "react";
import { Container } from "@/app/di/Container";
import { ContainerProvider } from "@/app/di/context";
import { useLogger } from "@/app/hooks/useLogger";
import { emptyLog, type DailyLog } from "@/domain/types";

// P0-N2, hook level: the active log must follow the STORE, not a stale view.
//   setSymptom — the Overview toggle: one atomic read-modify-write of a single
//                symptom; the view is then set from the stored record.
//   reload     — re-read the day in the background (after a sync, or when the
//                Log sheet opens), without refusing saves meanwhile.
//   revert     — drop an unsaved draft: back to the last stored record.
// Real Container over fake-indexeddb.

const DATE = new Date(2026, 2, 10);
const KEY = "2026-03-10";
const SEEDED: DailyLog = { ...emptyLog(KEY), flow: "medium", symptoms: ["Headache"], notes: "KEEP" };
const REMOTE: DailyLog = { ...SEEDED, symptoms: ["Headache", "Bloating"], notes: "REMOTE" };

let open: Container[] = [];
let seq = 0;
afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  for (const c of open) await c.closeDB();
  open = [];
});

async function setup(seed?: DailyLog) {
  const uid = `n2-hook-${++seq}-${Date.now()}`;
  const c = new Container();
  c.setAccount(uid);
  open.push(c);
  if (seed) await c.saveLog(seed);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ContainerProvider value={c}>{children}</ContainerProvider>
  );
  const hook = renderHook(({ k }: { k: string }) => useLogger(DATE, undefined, k), {
    initialProps: { k: uid },
    wrapper,
  });
  return { c, uid, ...hook };
}

/** Change the stored row on a separate connection: the hook's view does not hear. */
async function writeBehind(uid: string, log: DailyLog) {
  const other = new Container();
  other.setAccount(uid);
  await other.saveLog(log);
  await other.closeDB();
}

describe("useLogger.setSymptom (P0-N2)", () => {
  it("changes only that symptom on the stored row and shows the stored record", async () => {
    const { c, uid, result } = await setup(SEEDED);
    await waitFor(() => expect(result.current.log.notes).toBe("KEEP"));
    await writeBehind(uid, REMOTE); // the view still shows SEEDED

    await act(async () => {
      await result.current.setSymptom("Cramps", true);
    });
    const merged = { ...REMOTE, symptoms: ["Headache", "Bloating", "Cramps"] };
    expect(await c.getLog(KEY)).toMatchObject(merged);
    expect(result.current.log).toMatchObject(merged);
    expect(result.current.exists).toBe(true);
  });

  it("is not refused while the day's read is pending, and the late read does not undo it", async () => {
    const { c, result } = await setup(SEEDED);
    // No wait for the initial read: it is still in flight.
    await act(async () => {
      await result.current.setSymptom("Cramps", true);
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(await c.getLog(KEY)).toMatchObject({ ...SEEDED, symptoms: ["Headache", "Cramps"] });
    expect(result.current.log.symptoms).toEqual(["Headache", "Cramps"]);
  });

  it("a failed write puts the view back to the stored record and rejects", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { c, result } = await setup(SEEDED);
    await waitFor(() => expect(result.current.log.notes).toBe("KEEP"));
    const driver = await c.driver();
    vi.spyOn(driver, "transaction").mockRejectedValueOnce(new Error("quota"));

    // The optimistic update a caller makes before writing.
    act(() => result.current.setLog((l) => ({ ...l, symptoms: [...l.symptoms, "Cramps"] })));
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.setSymptom("Cramps", true).catch((e: unknown) => e);
    });
    expect(outcome).toBeInstanceOf(Error);
    expect(result.current.log.symptoms).toEqual(["Headache"]);
    expect(await c.getLog(KEY)).toMatchObject(SEEDED);
  });

  it("a result that lands after an account switch is not applied to the new account's view", async () => {
    const { c, uid, result, rerender } = await setup(SEEDED);
    await waitFor(() => expect(result.current.log.notes).toBe("KEEP"));
    const b = `${uid}-B`;
    await writeBehind(b, { ...emptyLog(KEY), notes: "B-OWN" });

    const real = c.setSymptom.bind(c);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    vi.spyOn(c, "setSymptom").mockImplementationOnce(async (...args) => {
      const stored = await real(...args); // lands in the first account's store
      await gate; // resolves only after the switch
      return stored;
    });
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.setSymptom("Cramps", true);
    });
    await waitFor(async () => expect((await c.getLog(KEY))?.symptoms).toContain("Cramps"));

    c.setAccount(b);
    rerender({ k: b });
    await waitFor(() => expect(result.current.log.notes).toBe("B-OWN"));
    await act(async () => {
      release();
      await pending;
    });
    expect(result.current.log.notes).toBe("B-OWN");
    expect(result.current.log.symptoms).toEqual([]);
  });
});

describe("useLogger.reload / revert (P0-N2)", () => {
  it("reload() shows a row that changed behind the view", async () => {
    const { uid, result } = await setup(SEEDED);
    await waitFor(() => expect(result.current.log.notes).toBe("KEEP"));
    await writeBehind(uid, REMOTE);

    act(() => result.current.reload());
    await waitFor(() => expect(result.current.log.notes).toBe("REMOTE"));
    expect(result.current.log.symptoms).toEqual(["Headache", "Bloating"]);
    expect(result.current.exists).toBe(true);
  });

  it("reload() never refuses a save, and a save made meanwhile wins over the late read", async () => {
    const { c, result } = await setup(SEEDED);
    await waitFor(() => expect(result.current.log.notes).toBe("KEEP"));
    const realGetLog = c.getLog.bind(c);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    vi.spyOn(c, "getLog").mockImplementationOnce((date) => {
      const snapshot = realGetLog(date); // taken before the save below
      return gate.then(() => snapshot);
    });

    act(() => result.current.reload());
    act(() => result.current.setLog((l) => ({ ...l, notes: "EDITED" })));
    await act(async () => {
      await result.current.save(); // not refused as "still loading"
    });
    await act(async () => {
      release();
      await gate;
    });
    expect(result.current.log.notes).toBe("EDITED");
    expect((await c.getLog(KEY))?.notes).toBe("EDITED");
  });

  it("a reload while the day's first read is pending lets that read land, then re-reads", async () => {
    const uid = `n2-hook-${++seq}-${Date.now()}`;
    const c = new Container();
    c.setAccount(uid);
    open.push(c);
    await c.saveLog(SEEDED);
    const realGetLog = c.getLog.bind(c);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const getLog = vi.spyOn(c, "getLog").mockImplementationOnce((date) => {
      const snapshot = realGetLog(date); // the first read sees SEEDED...
      return gate.then(() => snapshot);
    });
    const { result } = renderHook(() => useLogger(DATE, undefined, uid), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <ContainerProvider value={c}>{children}</ContainerProvider>
      ),
    });
    await waitFor(() => expect(getLog).toHaveBeenCalledTimes(1));

    act(() => result.current.reload()); // asked for while the first read is pending
    await writeBehind(uid, REMOTE); // ...and the row changes after it was taken
    await act(async () => {
      release();
      await gate;
    });
    // The first read is not thrown away (saves unblock as soon as it lands)...
    expect(result.current.loading).toBe(false);
    // ...and the reload then runs, showing the changed row.
    await waitFor(() => expect(result.current.log.notes).toBe("REMOTE"));
    expect(getLog).toHaveBeenCalledTimes(2);
  });

  it("revert() drops an unsaved draft back to the stored record", async () => {
    const { result } = await setup(SEEDED);
    await waitFor(() => expect(result.current.log.notes).toBe("KEEP"));
    act(() => result.current.setLog((l) => ({ ...l, notes: "DRAFT", symptoms: ["Cramps"] })));
    expect(result.current.log.notes).toBe("DRAFT");

    act(() => result.current.revert());
    expect(result.current.log).toMatchObject(SEEDED);
  });

  it("revert() after a successful save keeps the saved record", async () => {
    const { result } = await setup(SEEDED);
    await waitFor(() => expect(result.current.log.notes).toBe("KEEP"));
    act(() => result.current.setLog((l) => ({ ...l, notes: "SAVED" })));
    await act(async () => {
      await result.current.save();
    });
    act(() => result.current.setLog((l) => ({ ...l, notes: "LATER DRAFT" })));

    act(() => result.current.revert());
    expect(result.current.log.notes).toBe("SAVED");
  });
});
