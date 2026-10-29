// @vitest-environment jsdom
/**
 * The owner's share switches must never show a choice the server doesn't
 * have: a rejected save flips the switch back and says so, and a failed load
 * shows a retry instead of all-off switches.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/app/lib/sharing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/lib/sharing")>();
  return {
    ...actual,
    getShareSettings: vi.fn(),
    getQuietWindows: vi.fn(),
    setShareSetting: vi.fn(),
    addQuietWindow: vi.fn(),
    removeQuietWindow: vi.fn(),
  };
});
vi.mock("@/app/lib/audit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/lib/audit")>();
  return { ...actual, logAudit: vi.fn().mockResolvedValue(undefined), getAuditLog: vi.fn() };
});
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));

import { toast } from "sonner";
import { SharingControls } from "@/app/views/settings/SharingControls";
import {
  getShareSettings,
  setShareSetting,
  getQuietWindows,
  addQuietWindow,
  removeQuietWindow,
  type ShareSettings,
  type QuietWindow,
} from "@/app/lib/sharing";
import { logAudit, getAuditLog } from "@/app/lib/audit";

const ALL_OFF: ShareSettings = {
  cycle_headsup: false,
  todays_phase: false,
  calendar_view: false,
  mood_signal: false,
  symptom_details: false,
  care_nudges: false,
};

const QW: QuietWindow = { id: "q1", owner_id: "owner-1", start_date: "2026-11-09", end_date: "2026-11-12" };

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(getShareSettings).mockResolvedValue({ ...ALL_OFF });
  vi.mocked(getQuietWindows).mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SharingControls", () => {
  it("a save the server rejects flips the switch back and says so", async () => {
    vi.mocked(setShareSetting).mockRejectedValueOnce(new Error("Failed to fetch"));
    render(<SharingControls ownerId="owner-1" />);
    const mood = await screen.findByRole("switch", { name: "Today's mood" });

    fireEvent.click(mood);
    await waitFor(() => expect(toast.error).toHaveBeenCalledOnce());
    expect(mood.getAttribute("aria-checked")).toBe("false");
    expect(logAudit).not.toHaveBeenCalled();
  });

  it("a saved change stays and is logged", async () => {
    vi.mocked(setShareSetting).mockResolvedValueOnce(undefined);
    render(<SharingControls ownerId="owner-1" />);
    const mood = await screen.findByRole("switch", { name: "Today's mood" });

    fireEvent.click(mood);
    await waitFor(() => expect(logAudit).toHaveBeenCalledWith("owner-1", "share.toggle_on", "mood_signal"));
    expect(mood.getAttribute("aria-checked")).toBe("true");
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("a failed load offers a retry, not all-off switches", async () => {
    vi.mocked(getShareSettings).mockRejectedValueOnce(new Error("Failed to fetch"));
    render(<SharingControls ownerId="owner-1" />);

    await screen.findByText(/Couldn't load your sharing choices/);
    expect(screen.queryByRole("switch")).toBeNull();

    const retry = screen.getByRole("button", { name: "Try again" });
    retry.focus();
    fireEvent.click(retry);
    expect(await screen.findByRole("switch", { name: "Today's mood" })).toBeTruthy();
    // Try again is gone: focus lands on the first switch, not the page.
    expect(document.activeElement).toBe(screen.getByRole("switch", { name: "Cycle heads-up" }));
  });

  it("ignores taps on a switch while its save is in flight, so a failure can't leave it showing the wrong choice", async () => {
    const first = deferred();
    const second = deferred();
    vi.mocked(setShareSetting).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    render(<SharingControls ownerId="owner-1" />);
    const mood = await screen.findByRole("switch", { name: "Today's mood" });

    fireEvent.click(mood); // on, saving
    fireEvent.click(mood); // ignored: no second save, no flicker back
    expect(setShareSetting).toHaveBeenCalledTimes(1);
    expect(mood.getAttribute("aria-checked")).toBe("true");

    first.reject(new Error("Failed to fetch"));
    second.resolve(); // a second save, had one been sent, would land now
    await waitFor(() => expect(toast.error).toHaveBeenCalledOnce());
    expect(mood.getAttribute("aria-checked")).toBe("false"); // what the server has

    // Once the save settles, the switch takes taps again.
    vi.mocked(setShareSetting).mockResolvedValueOnce(undefined);
    fireEvent.click(mood);
    await waitFor(() => expect(logAudit).toHaveBeenCalledWith("owner-1", "share.toggle_on", "mood_signal"));
    expect(setShareSetting).toHaveBeenCalledTimes(2);
    expect(mood.getAttribute("aria-checked")).toBe("true");
  });

  it("a quiet window that saved closes its form even when the list can't refresh, so a retry can't add it twice", async () => {
    vi.mocked(addQuietWindow).mockResolvedValueOnce(undefined);
    vi.mocked(getQuietWindows).mockResolvedValueOnce([]).mockRejectedValueOnce(new Error("Failed to fetch"));
    render(<SharingControls ownerId="owner-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Add quiet window" }));
    // Opening the form puts focus in its first field.
    expect(document.activeElement).toBe(screen.getByLabelText("First day"));

    fireEvent.click(screen.getAllByRole("button", { name: "Add quiet window" }).at(-1)!);
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.stringMatching(/^Quiet window added, but the list couldn't refresh/)));
    expect(addQuietWindow).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText("First day")).toBeNull();
    expect(toast.error).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Add quiet window" }));
  });

  it("Cancel and Remove leave focus on the button that adds a quiet window", async () => {
    vi.mocked(getQuietWindows).mockResolvedValueOnce([QW]);
    vi.mocked(removeQuietWindow).mockResolvedValueOnce(undefined);
    render(<SharingControls ownerId="owner-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Add quiet window" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    const add = screen.getByRole("button", { name: "Add quiet window" });
    expect(document.activeElement).toBe(add);

    const remove = screen.getByRole("button", { name: /^Remove quiet window/ });
    remove.focus();
    fireEvent.click(remove);
    await waitFor(() => expect(screen.queryByRole("button", { name: /^Remove quiet window/ })).toBeNull());
    expect(document.activeElement).toBe(add);
  });

  it("marks the field that is wrong: an empty first day, or a last day before it", async () => {
    render(<SharingControls ownerId="owner-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Add quiet window" }));
    const start = screen.getByLabelText("First day");
    const end = screen.getByLabelText("Last day");

    fireEvent.change(start, { target: { value: "" } });
    expect(screen.getByRole("alert").textContent).toBe("Choose a first and a last day.");
    expect(start.getAttribute("aria-invalid")).toBe("true");
    expect(start.getAttribute("aria-describedby")).toBe("quiet-error");
    expect(end.getAttribute("aria-invalid")).toBe("false");
    expect(end.hasAttribute("aria-describedby")).toBe(false);

    fireEvent.change(start, { target: { value: "2026-11-12" } });
    fireEvent.change(end, { target: { value: "2026-11-09" } });
    expect(start.getAttribute("aria-invalid")).toBe("false");
    expect(end.getAttribute("aria-invalid")).toBe("true");
    expect(end.getAttribute("aria-describedby")).toBe("quiet-error");
  });

  it("a failed activity-log read offers a retry, never 'No changes recorded yet.'", async () => {
    vi.mocked(getAuditLog)
      .mockRejectedValueOnce(new Error("Failed to fetch"))
      .mockResolvedValueOnce([
        { id: "a1", actor_id: "owner-1", action: "share.toggle_on", target: "shared_notes", created_at: "2026-10-29T12:00:00Z" },
      ]);
    render(<SharingControls ownerId="owner-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Show activity" }));

    expect(await screen.findByText(/Couldn't load the activity log/)).toBeTruthy();
    expect(screen.queryByText("No changes recorded yet.")).toBeNull();

    const retry = screen.getByRole("button", { name: "Try again" });
    retry.focus();
    fireEvent.click(retry);
    // A retired share key reads as words, not the raw key.
    expect(await screen.findByText("Shared notes")).toBeTruthy();
    expect(screen.queryByText("shared_notes")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Hide activity" }));
  });
});
