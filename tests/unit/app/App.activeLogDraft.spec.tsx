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

/** Open today's sheet and make an unsaved edit: new notes plus a symptom. */
async function editTodayInSheet() {
  fireEvent.click(screen.getByRole("button", { name: "Log today" }));
  const sheet = await screen.findByRole("dialog", { name: "Log your day" });
  const notes = within(sheet).getByPlaceholderText("How are you feeling today?") as HTMLTextAreaElement;
  await waitFor(() => expect(notes.value).toBe("original"));
  fireEvent.change(notes, { target: { value: "ABANDONED DRAFT" } });
  fireEvent.click(within(sheet).getByRole("button", { name: "Bloating" }));
  return sheet;
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

describe("App: an abandoned Log-sheet draft is discarded (P0-N2)", () => {
  it("Escape without saving: the Overview drops the draft and the next tap does not save it", async () => {
    const c = await renderApp();
    await editTodayInSheet();
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
    const sheet = await editTodayInSheet();
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
});
