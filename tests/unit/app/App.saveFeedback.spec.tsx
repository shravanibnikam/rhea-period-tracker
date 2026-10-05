// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within, cleanup } from "@testing-library/react";
import App from "@/app/App";
import { Container } from "@/app/di/Container";
import { ContainerProvider } from "@/app/di/context";
import { toDateKey } from "@/domain/dates";
import { emptyLog, type DailyLog } from "@/domain/types";

// Local mode regardless of the ambient environment: CI also runs this suite
// with VITE_SUPABASE_* set, where the real client would show the sign-in screen.
vi.mock("@/app/lib/supabase", () => ({ supabase: null, isSupabaseConfigured: () => false }));

// P0-04 review follow-ups, App level (local mode, real Container on fake-indexeddb).
//   (3) A failed symptom toggle is undone on screen, so its message must not
//       claim "your changes are still here".
//   (4) When today's saved log cannot be read, the Overview says so (in the
//       symptom alert slot) and the Log sheet shows the alert with Save disabled.

const TODAY = toDateKey(new Date());
const SEEDED: DailyLog = { ...emptyLog(TODAY), flow: "medium", symptoms: ["Cramps"], notes: "n" };

let open: Container[] = [];
let seq = 0;
afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  for (const c of open) await c.closeDB();
  open = [];
});

async function makeContainer(): Promise<Container> {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const c = new Container();
  c.setAccount(`save-feedback-${++seq}-${Date.now()}`);
  open.push(c);
  await c.saveLog(SEEDED);
  // Older history too, so the tracker renders even when today's read fails.
  await c.saveLog({ ...emptyLog("2026-06-01"), flow: "heavy" });
  return c;
}

function renderApp(c: Container) {
  render(
    <ContainerProvider value={c}>
      <App />
    </ContainerProvider>
  );
}

describe("App: truthful save feedback (P0-04 review)", () => {
  it("a failed symptom toggle says it was not saved, without claiming the change is still there", async () => {
    const c = await makeContainer();
    renderApp(c);
    await screen.findByText(/1 tracked today/);
    const driver = await c.driver();
    vi.spyOn(driver, "transaction").mockRejectedValue(
      new DOMException("The quota has been exceeded.", "QuotaExceededError")
    );

    fireEvent.click(screen.getByRole("button", { name: "Headache" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).not.toMatch(/still here/i);
    expect(alert.textContent).toMatch(/couldn't save that symptom/i);
    await waitFor(() => expect(screen.getByText(/1 tracked today/)).toBeTruthy());
  });

  it("a failed read of today's log is shown on the Overview and in the Log sheet, with Save disabled", async () => {
    const c = await makeContainer();
    const realGetLog = c.getLog.bind(c);
    vi.spyOn(c, "getLog").mockImplementation((date) =>
      date === TODAY ? Promise.reject(new Error("read failed")) : realGetLog(date)
    );
    renderApp(c);
    await screen.findByRole("button", { name: "Log today" });

    const overviewAlert = await screen.findByRole("alert");
    expect(overviewAlert.textContent).toMatch(/couldn't load this day's saved log/i);

    fireEvent.click(screen.getByRole("button", { name: "Log today" }));
    const sheet = await screen.findByRole("dialog", { name: "Log your day" });
    const sheetAlert = await within(sheet).findByRole("alert");
    expect(sheetAlert.textContent).toMatch(/couldn't load this day's saved log/i);
    expect((within(sheet).getByRole("button", { name: "Save Log" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
