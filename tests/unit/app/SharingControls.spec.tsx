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
    getQuietWindows: vi.fn().mockResolvedValue([]),
    setShareSetting: vi.fn(),
  };
});
vi.mock("@/app/lib/audit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/lib/audit")>();
  return { ...actual, logAudit: vi.fn().mockResolvedValue(undefined) };
});
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));

import { toast } from "sonner";
import { SharingControls } from "@/app/views/settings/SharingControls";
import { getShareSettings, setShareSetting, type ShareSettings } from "@/app/lib/sharing";
import { logAudit } from "@/app/lib/audit";

const ALL_OFF: ShareSettings = {
  cycle_headsup: false,
  todays_phase: false,
  calendar_view: false,
  mood_signal: false,
  symptom_details: false,
  care_nudges: false,
};

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(getShareSettings).mockResolvedValue({ ...ALL_OFF });
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

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("switch", { name: "Today's mood" })).toBeTruthy();
  });
});
