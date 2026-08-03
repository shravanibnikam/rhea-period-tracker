// @vitest-environment jsdom
/**
 * Partner visibility for the calendar + symptom share keys.
 *
 * The partner client already holds the owner's full logs locally (the legacy
 * pull path caches them), so these toggles are what decides whether the calendar
 * and symptoms are RENDERED. That makes the gating the thing worth testing:
 * off by default, on only when the owner says so, and paused by quiet windows
 * like every other key.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";

vi.mock("@/app/lib/sharing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/lib/sharing")>();
  return {
    ...actual,
    getShareSettings: vi.fn(),
    getQuietWindows: vi.fn().mockResolvedValue([]),
    getSharedNotes: vi.fn().mockResolvedValue([]),
  };
});

import { PartnerView } from "@/app/views/partner/PartnerView";
import {
  getShareSettings,
  getQuietWindows,
  type ShareSettings,
  type ShareKey,
} from "@/app/lib/sharing";
import { PHASES } from "@/domain/phases";
import { deriveCycleState } from "@/domain/cycle";
import type { DailyLog } from "@/domain/types";
import { toDateKey, addDays } from "@/domain/dates";

afterEach(() => {
  cleanup();
  vi.mocked(getQuietWindows).mockResolvedValue([]);
});

const TODAY = new Date(2026, 7, 2); // 2 Aug 2026 (local; TZ pinned to UTC)

const ALL_OFF: ShareSettings = {
  cycle_headsup: false,
  todays_phase: false,
  calendar_view: false,
  mood_signal: false,
  symptom_details: false,
  care_nudges: false,
  shared_notes: false,
};

function settingsWith(...on: ShareKey[]): ShareSettings {
  const s = { ...ALL_OFF };
  for (const k of on) s[k] = true;
  return s;
}

/** A short cycle history so the calendar has real phases to paint. */
const LOGS: DailyLog[] = [
  { date: toDateKey(addDays(TODAY, -30)), flow: "medium", symptoms: [], mood: null, energy: null, notes: "" },
  { date: toDateKey(addDays(TODAY, -2)), flow: "none", symptoms: ["Insomnia"], mood: null, energy: null, notes: "" },
  { date: toDateKey(TODAY), flow: "none", symptoms: ["Cramps", "Fatigue"], mood: null, energy: null, notes: "private thought" },
];

function renderPartner(settings: ShareSettings) {
  vi.mocked(getShareSettings).mockResolvedValue(settings);
  const state = deriveCycleState(LOGS, null, TODAY);
  return render(
    <PartnerView
      phaseData={PHASES[state.phase]}
      phase={state.phase}
      state={state}
      today={TODAY}
      logs={LOGS}
      ownerId="owner-1"
      currentUserId="partner-1"
    />
  );
}

describe("partner calendar + symptom gating", () => {
  it("hides both when the owner has not enabled them", async () => {
    renderPartner(settingsWith("todays_phase"));
    await screen.findByText(/What's Happening in Her Body/i);

    expect(screen.queryByText(/Her Cycle Calendar/i)).toBeNull();
    expect(screen.queryByText(/What She's Feeling/i)).toBeNull();
    expect(screen.queryByText("Cramps")).toBeNull();
  });

  it("shows the calendar only when calendar_view is on", async () => {
    renderPartner(settingsWith("calendar_view"));
    await screen.findByText(/Her Cycle Calendar/i);

    // Rendered read-only: no day opens a log sheet for a partner.
    const dayButtons = screen
      .getAllByRole("button")
      .filter((b) => /^\d{1,2}$/.test(b.textContent ?? ""));
    expect(dayButtons.length).toBeGreaterThan(0);
    expect(dayButtons.every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
  });

  it("shows logged symptoms only when symptom_details is on", async () => {
    renderPartner(settingsWith("symptom_details"));
    await screen.findByText(/What She's Feeling/i);

    expect(screen.getByText("Cramps")).toBeTruthy();
    expect(screen.getByText("Fatigue")).toBeTruthy();
    expect(screen.getByText("Insomnia")).toBeTruthy(); // earlier this week
  });

  it("never renders the owner's free-text notes", async () => {
    renderPartner(settingsWith("symptom_details", "calendar_view", "todays_phase"));
    await screen.findByText(/What She's Feeling/i);

    expect(screen.queryByText(/private thought/i)).toBeNull();
  });

  it("is paused by an active quiet window", async () => {
    // isInQuietWindow compares against the real wall clock, so span a range
    // wide enough that this asserts the pause behaviour, not the boundary math
    // (which has its own coverage in the sharing unit tests).
    vi.mocked(getQuietWindows).mockResolvedValue([
      { id: "q1", owner_id: "owner-1", start_date: "2000-01-01", end_date: "2100-01-01" },
    ]);
    renderPartner(settingsWith("calendar_view", "symptom_details"));

    await screen.findByText(/Sharing paused/i);
    expect(screen.queryByText(/Her Cycle Calendar/i)).toBeNull();
    expect(screen.queryByText(/What She's Feeling/i)).toBeNull();
  });

  it("falls back to 'nothing shared' when every key is off", async () => {
    renderPartner(ALL_OFF);
    await waitFor(() => expect(screen.getByText(/Nothing shared yet/i)).toBeTruthy());
  });
});
