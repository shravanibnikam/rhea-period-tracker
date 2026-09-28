// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  render,
  renderHook,
  screen,
  fireEvent,
  waitFor,
  act,
  cleanup,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { Container } from "@/app/di/Container";
import { ContainerProvider } from "@/app/di/context";
import { useLogger } from "@/app/hooks/useLogger";
import { DailyLogSheet } from "@/app/views/tracker/DailyLogSheet";
import { QuickAddPeriod } from "@/app/views/tracker/QuickAddPeriod";
import { PHASES } from "@/domain/phases";
import { emptyLog, type DailyLog } from "@/domain/types";

// INV-WRITE-ACK (P0-04): no UI affordance reports success before its persisting
// promise resolves. A failed write keeps the UI open, resets its pending state
// and renders an inline role="alert". A failed or pending READ of the active day
// must never let a whole-record save overwrite the stored record with an
// empty draft (N8). The seams are real: useLogger over a Container on
// fake-indexeddb, with the storage driver (or the container read) made to fail.

const DATE = new Date(2026, 2, 10);
const KEY = "2026-03-10";
const OTHER = "2026-03-11";

const SEEDED: DailyLog = {
  ...emptyLog(KEY),
  flow: "light",
  symptoms: ["Cramps"],
  notes: "private note",
};

let open: Container[] = [];
let seq = 0;

async function makeContainer(seed?: DailyLog): Promise<Container> {
  const c = new Container();
  c.setAccount(`save-failure-${++seq}`);
  open.push(c);
  if (seed) await c.saveLog(seed);
  return c;
}

afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  for (const c of open) await c.closeDB();
  open = [];
});

/** Abort the next write transaction, as IndexedDB does when storage is full. */
async function failNextWrite(c: Container) {
  const driver = await c.driver();
  return vi
    .spyOn(driver, "transaction")
    .mockRejectedValueOnce(new DOMException("The quota has been exceeded.", "QuotaExceededError"));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function wrapperFor(c: Container) {
  return ({ children }: { children: ReactNode }) => (
    <ContainerProvider value={c}>{children}</ContainerProvider>
  );
}

/** Resolve a save to "saved" or to the error it rejected with. */
function settle(p: Promise<void>): Promise<unknown> {
  return p.then(
    () => "saved",
    (err: unknown) => err
  );
}

function silenceConsoleError() {
  vi.spyOn(console, "error").mockImplementation(() => {});
}

// ── DailyLogSheet ───────────────────────────────────────────────────────────

function SheetHarness({ onClose }: { onClose: () => void }) {
  // Wired exactly like App.tsx: onSave={useLogger().save}.
  const { log, setLog, save, loading } = useLogger(DATE);
  return (
    <>
      <output data-testid="loading">{String(loading)}</output>
      <DailyLogSheet
        log={log}
        setLog={setLog}
        onSave={save}
        onClose={onClose}
        phaseData={PHASES.menstrual}
        date={DATE}
      />
    </>
  );
}

describe("DailyLogSheet awaits the save (INV-WRITE-ACK)", () => {
  it("a rejected write keeps the sheet open, shows an alert, re-enables Save, and a retry saves", async () => {
    silenceConsoleError();
    const c = await makeContainer(SEEDED);
    const onClose = vi.fn<() => void>();
    render(
      <ContainerProvider value={c}>
        <SheetHarness onClose={onClose} />
      </ContainerProvider>
    );
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
    const notes = screen.getByPlaceholderText("How are you feeling today?") as HTMLTextAreaElement;
    expect(notes.value).toBe("private note");
    fireEvent.change(notes, { target: { value: "edited note" } });

    const write = await failNextWrite(c);
    const saveButton = screen.getByRole("button", { name: "Save Log" }) as HTMLButtonElement;
    fireEvent.click(saveButton);
    await waitFor(() => expect(write).toHaveBeenCalledTimes(1));

    // The write failed: the sheet must not have closed behind a success-shaped UI.
    expect(onClose).not.toHaveBeenCalled();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/couldn't save this log/i);
    expect(onClose).not.toHaveBeenCalled();
    expect(saveButton.disabled).toBe(false);
    expect(saveButton.textContent).toBe("Save Log");
    // The user's edit is still in the form; the stored record is untouched.
    expect(notes.value).toBe("edited note");
    expect((await c.getLog(KEY))?.notes).toBe("private note");

    // Retry succeeds: the sheet closes only now, and the edit is persisted.
    fireEvent.click(saveButton);
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect((await c.getLog(KEY))?.notes).toBe("edited note");
  });

  it("closes only after the save promise resolves, with Save disabled meanwhile", async () => {
    const pending = deferred<void>();
    const onSave = vi.fn(() => pending.promise);
    const onClose = vi.fn<() => void>();
    render(
      <DailyLogSheet
        log={emptyLog(KEY)}
        setLog={vi.fn()}
        onSave={onSave}
        onClose={onClose}
        phaseData={PHASES.menstrual}
        date={DATE}
      />
    );
    const saveButton = screen.getByRole("button", { name: "Save Log" }) as HTMLButtonElement;
    fireEvent.click(saveButton);

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    expect(saveButton.disabled).toBe(true);

    await act(async () => {
      pending.resolve();
      await pending.promise;
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

// ── QuickAddPeriod ──────────────────────────────────────────────────────────

function QuickAddHarness({ onClose }: { onClose: () => void }) {
  // Wired exactly like App.tsx: saveLogs={useLogger().saveMany}.
  const { saveMany } = useLogger(DATE);
  return <QuickAddPeriod onClose={onClose} saveLogs={saveMany} phaseData={PHASES.menstrual} />;
}

describe("QuickAddPeriod awaits the save (INV-WRITE-ACK)", () => {
  it("a rejected write stays open, is not stuck on 'Saving...', shows an alert, and a retry saves", async () => {
    silenceConsoleError();
    const c = await makeContainer();
    const onClose = vi.fn<() => void>();
    render(
      <ContainerProvider value={c}>
        <QuickAddHarness onClose={onClose} />
      </ContainerProvider>
    );

    const write = await failNextWrite(c);
    const addButton = screen.getByRole("button", { name: "Add 5-day period" }) as HTMLButtonElement;
    fireEvent.click(addButton);
    await waitFor(() => expect(write).toHaveBeenCalledTimes(1));

    // Not stuck: the pending state resets so the user can retry.
    await waitFor(() => expect(addButton.textContent).toBe("Add 5-day period"));
    expect(addButton.disabled).toBe(false);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/couldn't add this period/i);
    expect(onClose).not.toHaveBeenCalled();
    expect(await c.getAllLogs()).toEqual([]); // one transaction: nothing was written

    fireEvent.click(addButton);
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(await c.getAllLogs()).toHaveLength(5);
  });
});

// ── useLogger: never overwrite a record the UI did not load (N8) ────────────

describe("useLogger load failure (N8)", () => {
  it("a rejected read sets loadError and clears loading", async () => {
    silenceConsoleError();
    const c = await makeContainer(SEEDED);
    vi.spyOn(c, "getLog").mockRejectedValueOnce(new Error("read failed"));
    const { result } = renderHook(() => useLogger(DATE), { wrapper: wrapperFor(c) });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.loadError).toBeInstanceOf(Error);
    expect(result.current.exists).toBe(false);
  });

  it("after a rejected read, save() and replace-mode saveMany() refuse and the stored record survives", async () => {
    silenceConsoleError();
    const c = await makeContainer(SEEDED);
    const getLog = vi.spyOn(c, "getLog").mockRejectedValueOnce(new Error("read failed"));
    const { result } = renderHook(() => useLogger(DATE), { wrapper: wrapperFor(c) });
    await waitFor(() => expect(getLog).toHaveBeenCalledTimes(1));
    await act(async () => {
      await getLog.mock.results[0]?.value?.catch(() => {});
    });

    // DailyLogSheet's Save: the form shows an empty draft, not the stored day.
    let outcome: unknown;
    await act(async () => {
      outcome = await settle(result.current.save());
    });
    expect((await c.getLog(KEY))?.notes).toBe("private note");
    expect(outcome).toBeInstanceOf(Error);
    expect((outcome as Error).message).toMatch(/couldn't load/i);

    // The Overview symptom toggle's path: a replace-mode save of the active day.
    await act(async () => {
      outcome = await settle(
        result.current.saveMany([{ ...result.current.log, symptoms: ["Headache"] }])
      );
    });
    expect(await c.getLog(KEY)).toMatchObject(SEEDED);
    expect((outcome as Error).message).toMatch(/couldn't load/i);

    // Replace-mode saves of other dates are unaffected.
    await act(async () => {
      await result.current.saveMany([{ ...emptyLog(OTHER), flow: "medium" }]);
    });
    expect((await c.getLog(OTHER))?.flow).toBe("medium");
  });

  it("a merge-defined save of the active day still works after a failed read, and recovers the view", async () => {
    silenceConsoleError();
    const c = await makeContainer(SEEDED);
    vi.spyOn(c, "getLog").mockRejectedValueOnce(new Error("read failed"));
    const { result } = renderHook(() => useLogger(DATE), { wrapper: wrapperFor(c) });
    await waitFor(() => expect(result.current.loadError).toBeInstanceOf(Error));

    // Quick Add reads the prior row inside its own transaction: never blocked.
    await act(async () => {
      await result.current.saveMany([{ date: KEY, flow: "heavy" }], { mode: "merge-defined" });
    });
    expect(await c.getLog(KEY)).toMatchObject({ ...SEEDED, flow: "heavy" });
    // The persisted, merged record is now known: the view shows it and saves resume.
    expect(result.current.log).toMatchObject({ ...SEEDED, flow: "heavy" });
    expect(result.current.loadError).toBeNull();
    await act(async () => {
      await result.current.save();
    });
    expect(await c.getLog(KEY)).toMatchObject({ ...SEEDED, flow: "heavy" });
  });
});

describe("useLogger pending-load race (N8)", () => {
  it("save() while the active day's read is pending refuses; after the read it saves", async () => {
    const c = await makeContainer(SEEDED);
    const realGetLog = c.getLog.bind(c);
    const gate = deferred<void>();
    const getLog = vi.spyOn(c, "getLog").mockImplementationOnce(async (date) => {
      await gate.promise;
      return realGetLog(date);
    });
    const { result } = renderHook(() => useLogger(DATE), { wrapper: wrapperFor(c) });
    await waitFor(() => expect(getLog).toHaveBeenCalledTimes(1));
    expect(result.current.loading).toBe(true);

    let outcome: unknown;
    await act(async () => {
      outcome = await settle(result.current.save());
    });
    expect((await realGetLog(KEY))?.notes).toBe("private note");
    expect(outcome).toBeInstanceOf(Error);
    expect((outcome as Error).message).toMatch(/still loading/i);

    await act(async () => {
      gate.resolve();
      await gate.promise;
    });
    await waitFor(() => expect(result.current.log.notes).toBe("private note"));
    act(() => result.current.setLog((l) => ({ ...l, notes: "edited note" })));
    await act(async () => {
      await result.current.save();
    });
    expect((await realGetLog(KEY))?.notes).toBe("edited note");
  });

  it("a replace-mode saveMany() of the active day while pending refuses; other dates are unaffected", async () => {
    const c = await makeContainer(SEEDED);
    const realGetLog = c.getLog.bind(c);
    const gate = deferred<void>();
    const getLog = vi.spyOn(c, "getLog").mockImplementationOnce(async (date) => {
      await gate.promise;
      return realGetLog(date);
    });
    const { result } = renderHook(() => useLogger(DATE), { wrapper: wrapperFor(c) });
    await waitFor(() => expect(getLog).toHaveBeenCalledTimes(1));

    // Built from the empty draft, as a symptom toggle during the load would be.
    let outcome: unknown;
    await act(async () => {
      outcome = await settle(
        result.current.saveMany([{ ...result.current.log, symptoms: ["Headache"] }])
      );
    });
    expect(await realGetLog(KEY)).toMatchObject(SEEDED);
    expect((outcome as Error).message).toMatch(/still loading/i);

    await act(async () => {
      await result.current.saveMany([{ ...emptyLog(OTHER), flow: "medium" }]);
    });
    expect((await realGetLog(OTHER))?.flow).toBe("medium");
    gate.resolve();
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it("a merge-defined save during the read is not blocked, and the late (stale) read does not clobber it", async () => {
    const c = await makeContainer(SEEDED);
    const realGetLog = c.getLog.bind(c);
    const gate = deferred<void>();
    // The read is taken now (pre-merge) but delivered only after the merge.
    const getLog = vi.spyOn(c, "getLog").mockImplementationOnce((date) => {
      const snapshot = realGetLog(date);
      return gate.promise.then(() => snapshot);
    });
    const { result } = renderHook(() => useLogger(DATE), { wrapper: wrapperFor(c) });
    await waitFor(() => expect(getLog).toHaveBeenCalledTimes(1));

    await act(async () => {
      await result.current.saveMany([{ date: KEY, flow: "heavy" }], { mode: "merge-defined" });
    });
    expect(await realGetLog(KEY)).toMatchObject({ ...SEEDED, flow: "heavy" });
    expect(result.current.log.flow).toBe("heavy");

    await act(async () => {
      gate.resolve();
      await gate.promise;
    });
    expect(result.current.log.flow).toBe("heavy");
    expect(result.current.loading).toBe(false);
  });
});
