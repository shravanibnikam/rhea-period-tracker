// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import App from "@/app/App";
import { Container } from "@/app/di/Container";
import { ContainerProvider } from "@/app/di/context";
import { toDateKey } from "@/domain/dates";
import { emptyLog, type DailyLog } from "@/domain/types";

// INV-WRITE-ACK (P0-04), App call site: the Overview symptom toggles update the
// UI optimistically, so a failed save must revert the toggle and say so, never
// leave a symptom on screen that was not stored. Real App over a real
// Container (fake-indexeddb); Supabase is unconfigured in tests (local mode).

let open: Container[] = [];
let seq = 0;

afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  for (const c of open) await c.closeDB();
  open = [];
});

async function renderAppWithToday(): Promise<{ c: Container; today: string }> {
  const c = new Container();
  c.setAccount(`app-toggle-symptom-${++seq}`);
  open.push(c);
  const today = toDateKey(new Date());
  const seeded: DailyLog = {
    ...emptyLog(today),
    flow: "medium",
    symptoms: ["Cramps"],
    notes: "private note",
  };
  await c.saveLog(seeded);
  render(
    <ContainerProvider value={c}>
      <App />
    </ContainerProvider>
  );
  // Today's log has loaded into the Overview (it has one stored symptom).
  await screen.findByText(/1 tracked today/);
  return { c, today };
}

describe("App Overview symptom toggle awaits the save (INV-WRITE-ACK)", () => {
  it("a rejected save reverts the toggle and shows an alert; the stored log is untouched", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { c, today } = await renderAppWithToday();
    const driver = await c.driver();
    const write = vi
      .spyOn(driver, "transaction")
      .mockRejectedValue(new DOMException("The quota has been exceeded.", "QuotaExceededError"));

    fireEvent.click(screen.getByRole("button", { name: "Headache" }));
    await waitFor(() => expect(write).toHaveBeenCalled());

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/couldn't save/i);
    // Reverted: the symptom that was never stored is no longer shown as logged.
    await waitFor(() => expect(screen.getByText(/1 tracked today/)).toBeTruthy());
    expect((await c.getLog(today))?.symptoms).toEqual(["Cramps"]);
    expect((await c.getLog(today))?.notes).toBe("private note");
  });

  it("a successful toggle persists and shows no alert", async () => {
    const { c, today } = await renderAppWithToday();

    fireEvent.click(screen.getByRole("button", { name: "Headache" }));
    await waitFor(async () =>
      expect((await c.getLog(today))?.symptoms).toEqual(["Cramps", "Headache"])
    );
    expect(screen.getByText(/2 tracked today/)).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect((await c.getLog(today))?.notes).toBe("private note");
  });
});
