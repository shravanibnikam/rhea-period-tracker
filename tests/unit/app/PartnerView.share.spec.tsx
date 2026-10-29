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
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";

vi.mock("@/app/lib/sharing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/lib/sharing")>();
  return {
    ...actual,
    getShareSettings: vi.fn(),
    getQuietWindows: vi.fn().mockResolvedValue([]),
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

function renderPartner(settings: ShareSettings, logs: DailyLog[] = LOGS) {
  vi.mocked(getShareSettings).mockResolvedValue(settings);
  const state = deriveCycleState(logs, null, TODAY);
  return render(
    <PartnerView
      phaseData={PHASES[state.phase]}
      phase={state.phase}
      state={state}
      today={TODAY}
      logs={logs}
      ownerId="owner-1"
      currentUserId="partner-1"
    />
  );
}

describe("partner calendar + symptom gating", () => {
  it("hides both when the owner has not enabled them", async () => {
    renderPartner(settingsWith("todays_phase"));
    await screen.findByText(/What’s happening in their body/i);

    expect(screen.queryByText(/Their cycle calendar/i)).toBeNull();
    expect(screen.queryByText(/How they’re feeling/i)).toBeNull();
    expect(screen.queryByText("Cramps")).toBeNull();
  });

  it("shows the calendar only when calendar_view is on", async () => {
    renderPartner(settingsWith("calendar_view"));
    await screen.findByText(/Their cycle calendar/i);

    // Rendered read-only: no day opens a log sheet for a partner.
    const dayButtons = screen
      .getAllByRole("button")
      .filter((b) => /^\d{1,2}$/.test(b.textContent ?? ""));
    expect(dayButtons.length).toBeGreaterThan(0);
    expect(dayButtons.every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
  });

  it("shows logged symptoms only when symptom_details is on", async () => {
    renderPartner(settingsWith("symptom_details"));
    await screen.findByText(/How they’re feeling/i);

    expect(screen.getByText("Cramps")).toBeTruthy();
    expect(screen.getByText("Fatigue")).toBeTruthy();
    expect(screen.getByText("Insomnia")).toBeTruthy(); // earlier this week
  });

  it("never renders the owner's free-text notes", async () => {
    renderPartner(settingsWith("symptom_details", "calendar_view", "todays_phase"));
    await screen.findByText(/How they’re feeling/i);

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
    expect(screen.queryByText(/Their cycle calendar/i)).toBeNull();
    expect(screen.queryByText(/How they’re feeling/i)).toBeNull();
  });

  it("mood_signal shows the mood the owner logged today, labelled; without it, only the phase's usual mood", async () => {
    const logs = LOGS.map((l) => (l.date === toDateKey(TODAY) ? { ...l, mood: "Irritable" } : l));
    renderPartner(settingsWith("mood_signal"), logs);
    expect(await screen.findByText("Irritable")).toBeTruthy();
    expect(screen.getByText("Logged by your partner")).toBeTruthy();
    cleanup();

    renderPartner(settingsWith("mood_signal")); // nothing logged today
    expect(await screen.findByText("No mood logged today.")).toBeTruthy();
    cleanup();

    renderPartner(settingsWith("todays_phase"), logs);
    expect(await screen.findByText("Usual mood in this phase")).toBeTruthy();
    expect(screen.queryByText("Irritable")).toBeNull();
  });

  it("shows the cycle ring only with both todays_phase and cycle_headsup (its position reveals the due date)", async () => {
    renderPartner(settingsWith("todays_phase"));
    await screen.findByText(/What’s happening in their body/i);
    expect(screen.queryByRole("img", { name: /Cycle day/i })).toBeNull();
    cleanup();

    renderPartner(settingsWith("todays_phase", "cycle_headsup"));
    expect(await screen.findByRole("img", { name: /Cycle day/i })).toBeTruthy();
  });

  it("a failed load offers a retry and never shows the owner's details", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(getShareSettings).mockRejectedValueOnce(new Error("Failed to fetch"));
    const state = deriveCycleState(LOGS, null, TODAY);
    render(
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
    // Announced: the notice is an alert, not a silent swap.
    expect((await screen.findByRole("alert")).textContent).toContain("Couldn’t load the partner view");
    expect(screen.queryByText("Cramps")).toBeNull();
    expect(screen.queryByText(/Their cycle calendar/i)).toBeNull();

    vi.mocked(getShareSettings).mockResolvedValueOnce(settingsWith("symptom_details"));
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Cramps")).toBeTruthy();
  });

  it("falls back to 'nothing shared' when every key is off", async () => {
    renderPartner(ALL_OFF);
    await waitFor(() => expect(screen.getByText(/Nothing shared yet/i)).toBeTruthy());
  });
});

describe("partner view never reveals what isn't shared", () => {
  const MOODY = LOGS.map((l) => (l.date === toDateKey(TODAY) ? { ...l, mood: "Irritable" } : l));

  it("with only mood or symptoms shared, nothing carries the owner's phase colour", async () => {
    for (const keys of [["mood_signal"], ["symptom_details"], ["mood_signal", "symptom_details"]] as ShareKey[][]) {
      const { container } = renderPartner(settingsWith(...keys), MOODY);
      await screen.findByText(/How they’re feeling/);
      expect(container.querySelector("[data-phase]")).toBeNull();
      cleanup();
    }
  });

  it("mood and symptom chips take the partner hue, not a phase tint", async () => {
    renderPartner(settingsWith("mood_signal", "symptom_details", "todays_phase"), MOODY);
    for (const chip of [await screen.findByText("Irritable"), screen.getByText("Cramps")]) {
      expect(chip.className).toContain("bg-partner-tint");
      expect(chip.className).not.toMatch(/phase/);
    }
  });

  it("sets the phase scope when the phase is shared and a period is logged", async () => {
    const { container } = renderPartner(settingsWith("todays_phase"));
    await screen.findByText(/What’s happening in their body/);
    expect((container.firstElementChild as HTMLElement).dataset.phase).toBe(deriveCycleState(LOGS, null, TODAY).phase);
  });

  it("leaves predicted periods off the calendar unless the heads-up is shared", async () => {
    renderPartner(settingsWith("calendar_view"));
    await screen.findByText(/Their cycle calendar/i);
    expect(screen.queryByText("Period, predicted")).toBeNull();
    expect(screen.queryAllByRole("button", { name: /predicted/ })).toHaveLength(0);
    cleanup();

    // Control: with the heads-up on, the same month shows them.
    renderPartner(settingsWith("calendar_view", "cycle_headsup"));
    await screen.findByText(/Their cycle calendar/i);
    expect(screen.getByText("Period, predicted")).toBeTruthy();
    expect(screen.queryAllByRole("button", { name: /period predicted/ }).length).toBeGreaterThan(0);
  });

  it("counts days to the next period in calendar days, across a DST change", async () => {
    const tz = process.env.TZ;
    process.env.TZ = "America/New_York"; // clocks go forward on Mar 8, 2026
    try {
      const today = new Date(2026, 2, 7);
      const logs: DailyLog[] = [
        { date: "2026-02-09", flow: "medium", symptoms: [], mood: null, energy: null, notes: "" },
      ];
      const state = deriveCycleState(logs, null, today);
      expect(toDateKey(state.predictions[0].start)).toBe("2026-03-09");
      vi.mocked(getShareSettings).mockResolvedValue(settingsWith("cycle_headsup"));
      render(
        <PartnerView
          phaseData={PHASES[state.phase]}
          phase={state.phase}
          state={state}
          today={today}
          logs={logs}
          ownerId="owner-1"
          currentUserId="partner-1"
        />
      );
      await screen.findByText("What’s coming next");
      expect(screen.getByText("In 2 days")).toBeTruthy();
    } finally {
      process.env.TZ = tz;
    }
  });
});
