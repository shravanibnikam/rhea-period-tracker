// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act, within, cleanup } from "@testing-library/react";
import App from "@/app/App";
import { Container } from "@/app/di/Container";
import { ContainerProvider } from "@/app/di/context";
import { toDateKey } from "@/domain/dates";
import { emptyLog, type DailyLog } from "@/domain/types";

// P0-N2 (ports of reviewer probes zzProbeDraft, zzProbeDraft2, zzProbeDoubleTap).
// The Log sheet and the Overview share the active log. A draft the user
// abandons (Escape, or a failed Save then close) must be discarded, never saved
// by the next Overview tap; and overlapping taps must leave the view matching
// the store. Real App over a real Container (fake-indexeddb); Supabase is
// unconfigured in tests (local mode).

const TODAY = toDateKey(new Date());
const SEEDED: DailyLog = {
  ...emptyLog(TODAY),
  flow: "medium",
  symptoms: ["Cramps"],
  notes: "original",
};

let open: Container[] = [];
let seq = 0;
afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  for (const c of open) await c.closeDB();
  open = [];
});

async function renderApp(): Promise<Container> {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const c = new Container();
  c.setAccount(`n2-draft-${++seq}-${Date.now()}`);
  open.push(c);
  await c.saveLog(SEEDED);
  render(
    <ContainerProvider value={c}>
      <App />
    </ContainerProvider>
  );
  await screen.findByText(/1 tracked today/);
  return c;
}

/**
 * Open today's sheet and make an unsaved edit: new notes plus a symptom. The
 * sheet re-reads the day when it opens; the edit is made only once that read
 * has landed, so the read cannot wipe the draft before the test closes the
 * sheet (the view shows "original" even before it lands). Returns the sheet
 * and the controller of today's reads (see controlTodayReads).
 */
async function editTodayInSheet(c: Container) {
  const reads = controlTodayReads(c);
  fireEvent.click(screen.getByRole("button", { name: "Log today" }));
  const sheet = await screen.findByRole("dialog", { name: "Log your day" });
  expect(reads.reads).not.toHaveLength(0);
  await reads.settle();
  const notes = within(sheet).getByPlaceholderText("How are you feeling today?") as HTMLTextAreaElement;
  expect(notes.value).toBe("original");
  fireEvent.change(notes, { target: { value: "ABANDONED DRAFT" } });
  fireEvent.click(within(sheet).getByRole("button", { name: "Bloating" }));
  // The draft is in the active log the Overview shares.
  expect(screen.getByText(/2 tracked today/)).toBeTruthy();
  return { sheet, reads };
}

async function closeWithEscape() {
  fireEvent.keyDown(window, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "Log your day" })).toBeNull());
}

/** Soft: record whether the Overview shows `text`, and carry on (so RED shows what gets saved). */
async function softlyShows(text: RegExp, label: string) {
  const shown = await waitFor(() => screen.getByText(text)).then(
    () => true,
    () => false
  );
  expect.soft(shown, label).toBe(true);
}

const slowReject = () =>
  new Promise<never>((_, reject) =>
    setTimeout(() => reject(new DOMException("The quota has been exceeded.", "QuotaExceededError")), 60)
  );

/**
 * Control the container's reads of today's log (useLogger's only read path):
 * "fail" rejects them, "hold" keeps the next one pending until release(), and
 * "real" lets them through. Every read of today is recorded, so a test can
 * wait for the ones it caused and let them settle.
 */
function controlTodayReads(c: Container) {
  const real = c.getLog.bind(c);
  let release = () => {};
  const ctl = {
    mode: "real" as "real" | "fail" | "hold",
    reads: [] as Promise<unknown>[],
    release: () => release(),
    /** Let every recorded read settle, and React apply what it led to. */
    settle: () =>
      act(async () => {
        await Promise.allSettled(ctl.reads.splice(0));
      }),
  };
  vi.spyOn(c, "getLog").mockImplementation((date) => {
    if (date !== TODAY) return real(date);
    let read: Promise<DailyLog | undefined>;
    if (ctl.mode === "fail") {
      read = Promise.reject(new DOMException("The operation failed.", "UnknownError"));
    } else if (ctl.mode === "hold") {
      ctl.mode = "real";
      const gate = new Promise<void>((r) => (release = r));
      read = gate.then(() => real(date));
    } else {
      read = real(date);
    }
    ctl.reads.push(read);
    return read;
  });
  return ctl;
}

/** Make an unsaved edit in the sheet, then close it while its re-read of the day fails. */
async function abandonDraftWhileReadsFail(c: Container) {
  const { reads } = await editTodayInSheet(c);
  reads.mode = "fail";
  await closeWithEscape();
  // The close-time re-read ran, and failed: it cannot mask a kept draft.
  expect(reads.reads).toHaveLength(1);
  await reads.settle();
  reads.mode = "real";
  return reads;
}

describe("App: an abandoned Log-sheet draft is discarded (P0-N2)", () => {
  it("Escape without saving: the Overview drops the draft and the next tap does not save it", async () => {
    const c = await renderApp();
    await editTodayInSheet(c);
    await closeWithEscape();

    // The draft's extra symptom is not shown as logged.
    await softlyShows(/1 tracked today/, "the Overview drops the draft");
    fireEvent.click(screen.getByRole("button", { name: "Headache" }));
    await waitFor(async () => expect((await c.getLog(TODAY))?.symptoms).toContain("Headache"));
    expect(await c.getLog(TODAY)).toMatchObject({
      ...SEEDED,
      symptoms: ["Cramps", "Headache"],
    });
  });

  it("a failed Save then close: the next tap does not save the draft", async () => {
    const c = await renderApp();
    const { sheet } = await editTodayInSheet(c);
    const driver = await c.driver();
    const write = vi
      .spyOn(driver, "transaction")
      .mockRejectedValueOnce(new DOMException("The quota has been exceeded.", "QuotaExceededError"));
    fireEvent.click(within(sheet).getByRole("button", { name: "Save Log" }));
    await within(sheet).findByRole("alert");
    await closeWithEscape();
    write.mockRestore();

    await softlyShows(/1 tracked today/, "the Overview drops the draft");
    fireEvent.click(screen.getByRole("button", { name: "Headache" }));
    await waitFor(async () => expect((await c.getLog(TODAY))?.symptoms).toContain("Headache"));
    expect(await c.getLog(TODAY)).toMatchObject({
      ...SEEDED,
      symptoms: ["Cramps", "Headache"],
    });
  });

  // Review mutant M5: closing the sheet must drop the draft itself. The re-read
  // on close would replace a kept draft anyway, so these make that read fail.
  it("a failed re-read on close still drops the draft: the Overview shows the stored day, and the next tap stores only its symptom", async () => {
    const c = await renderApp();
    await abandonDraftWhileReadsFail(c);

    // The stored day (one symptom), not the draft (two).
    expect(screen.getByText(/1 tracked today/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Headache" }));
    await waitFor(async () => expect((await c.getLog(TODAY))?.symptoms).toContain("Headache"));
    expect(await c.getLog(TODAY)).toMatchObject({ ...SEEDED, symptoms: ["Cramps", "Headache"] });
    await waitFor(() => expect(screen.getByText(/2 tracked today/)).toBeTruthy());
  });

  it("a failed re-read on close, then reopening the sheet: the draft is not shown, and Save does not store it", async () => {
    const c = await renderApp();
    const reads = await abandonDraftWhileReadsFail(c);

    // Reopen; the sheet's own re-read of the day is still on its way.
    reads.mode = "hold";
    fireEvent.click(screen.getByRole("button", { name: "Log today" }));
    const sheet = await screen.findByRole("dialog", { name: "Log your day" });
    const notes = within(sheet).getByPlaceholderText("How are you feeling today?") as HTMLTextAreaElement;
    expect.soft(notes.value, "the reopened sheet does not show the abandoned draft").not.toBe("ABANDONED DRAFT");

    // Soft above, so RED shows what a Save then stores.
    fireEvent.click(within(sheet).getByRole("button", { name: "Save Log" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Log your day" })).toBeNull());
    reads.release();
    await reads.settle();
    expect(await c.getLog(TODAY)).toMatchObject(SEEDED);
  });
});

describe("App: overlapping symptom taps leave the view matching the store (P0-N2)", () => {
  it("the same symptom tapped twice, both writes failing: the view shows the stored day", async () => {
    const c = await renderApp();
    const driver = await c.driver();
    vi.spyOn(driver, "transaction").mockImplementation(slowReject);
    const headache = screen.getByRole("button", { name: "Headache" });
    fireEvent.click(headache); // add (fails)
    fireEvent.click(headache); // remove (fails)
    await screen.findByRole("alert");
    await act(async () => {
      await new Promise((r) => setTimeout(r, 200));
    });

    expect((await c.getLog(TODAY))?.symptoms).toEqual(["Cramps"]);
    expect(screen.getByText(/1 tracked today/)).toBeTruthy();
  });

  it("one tap fails and another succeeds: only the successful symptom is stored, and shown", async () => {
    const c = await renderApp();
    const driver = await c.driver();
    const real = driver.transaction.bind(driver);
    let calls = 0;
    vi.spyOn(driver, "transaction").mockImplementation(((...args: Parameters<typeof real>) => {
      calls++;
      if (calls === 1) return slowReject();
      return new Promise((r) => setTimeout(r, 90)).then(() => real(...args));
    }) as typeof real);
    fireEvent.click(screen.getByRole("button", { name: "Headache" })); // fails
    fireEvent.click(screen.getByRole("button", { name: "Bloating" })); // succeeds
    await act(async () => {
      await new Promise((r) => setTimeout(r, 300));
    });

    expect((await c.getLog(TODAY))?.symptoms).toEqual(["Cramps", "Bloating"]);
    expect(screen.getByText(/2 tracked today/)).toBeTruthy();
    expect(screen.getByRole("alert")).toBeTruthy(); // the failed tap is reported
  });

  it("two quick taps on different symptoms both land, and the day's other fields are kept (review mutant M1a)", async () => {
    const c = await renderApp();
    const writes = vi.spyOn(c, "setSymptom");
    fireEvent.click(screen.getByRole("button", { name: "Headache" }));
    fireEvent.click(screen.getByRole("button", { name: "Bloating" }));
    // Both writes started before either could land (nothing was awaited yet).
    expect(writes).toHaveBeenCalledTimes(2);
    await act(async () => {
      await Promise.allSettled(writes.mock.results.map((r) => r.value));
    });

    const stored = await c.getLog(TODAY);
    expect([...(stored?.symptoms ?? [])].sort()).toEqual(["Bloating", "Cramps", "Headache"]);
    expect(stored).toMatchObject({ ...SEEDED, symptoms: stored?.symptoms });
    expect(screen.getByText(/3 tracked today/)).toBeTruthy();
  });
});
