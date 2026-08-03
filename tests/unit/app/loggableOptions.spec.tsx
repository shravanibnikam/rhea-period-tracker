// @vitest-environment jsdom
/**
 * The loggable option lists (ALL_SYMPTOMS / MOOD_OPTIONS).
 *
 * These are user-facing vocabulary, so the risks are editorial as much as
 * technical: a near-duplicate label ("Back pain" next to "Lower back pain")
 * makes two entries mean the same thing and splits the data behind them. The
 * lists are also append-only by convention — dropping or reordering an entry
 * would move pills under people who know where they sit, and an entry already
 * written into a stored DailyLog would no longer be selectable.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ALL_SYMPTOMS, MOOD_OPTIONS } from "@/app/lib/constants";
import { DailyLogSheet } from "@/app/views/tracker/DailyLogSheet";
import { OverviewTab } from "@/app/views/tracker/OverviewTab";
import { emptyLog, type DailyLog } from "@/domain/types";
import { PHASES } from "@/domain/phases";
import { deriveCycleState } from "@/domain/cycle";

afterEach(cleanup);

/** The vocabulary as shipped before the expansion — none of it may disappear. */
const ORIGINAL_SYMPTOMS = [
  "Cramps", "Bloating", "Headache", "Fatigue", "Mood swings", "Food cravings",
  "Breast tenderness", "Back pain", "Acne", "Nausea", "Anxiety", "Irritability",
  "Brain fog", "Insomnia",
];
const ORIGINAL_MOODS = [
  "Happy", "Calm", "Energetic", "Sensitive", "Anxious", "Irritable", "Sad",
  "Neutral",
];

const norm = (s: string) => s.trim().toLowerCase();

describe.each([
  ["ALL_SYMPTOMS", ALL_SYMPTOMS as readonly string[], ORIGINAL_SYMPTOMS],
  ["MOOD_OPTIONS", MOOD_OPTIONS as readonly string[], ORIGINAL_MOODS],
])("%s", (_name, list, original) => {
  it("has no duplicate labels", () => {
    const seen = new Map<string, string>();
    const dupes: string[] = [];
    for (const label of list) {
      const key = norm(label);
      if (seen.has(key)) dupes.push(`${seen.get(key)} / ${label}`);
      seen.set(key, label);
    }
    expect(dupes).toEqual([]);
  });

  it("keeps every option that shipped before", () => {
    expect(list).toEqual(expect.arrayContaining(original));
  });

  it("preserves the original entries in their original order (append-only)", () => {
    expect(list.slice(0, original.length)).toEqual(original);
  });

  it("has no blank or untrimmed labels", () => {
    for (const label of list) {
      expect(label).toBe(label.trim());
      expect(label.length).toBeGreaterThan(0);
    }
  });
});

describe("symptom vocabulary boundaries", () => {
  it("carries no digestive symptoms", () => {
    const banned = ["constipation", "diarrhea", "diarrhoea", "gas", "indigestion", "heartburn"];
    const hits = ALL_SYMPTOMS.filter((s) => banned.some((b) => norm(s).includes(b)));
    expect(hits).toEqual([]);
  });

  it("does not restate an existing label with a narrower one", () => {
    // "Back pain" already covers the lower back; "Water retention" already
    // covers swelling. Either pair would split the same signal across two pills.
    const labels = (ALL_SYMPTOMS as readonly string[]).map(norm);
    expect(labels).toContain("back pain");
    expect(labels).not.toContain("lower back pain");
    expect(labels).toContain("water retention");
    expect(labels).not.toContain("swelling");
  });

  it("keeps mood out of the energy vocabulary", () => {
    // ENERGY_OPTIONS renders Low/Medium/High in the same sheet — a mood called
    // "Low" would read as an energy level and collide by accessible name.
    expect((MOOD_OPTIONS as readonly string[]).map(norm)).not.toContain("low");
  });
});

// ── Rendering ───────────────────────────────────────────────────────────────

function ControlledSheet({ initial }: { initial?: Partial<DailyLog> } = {}) {
  const [log, setLog] = useState<DailyLog>({ ...emptyLog("2099-01-01"), ...initial });
  return (
    <DailyLogSheet
      log={log}
      setLog={setLog}
      onSave={vi.fn()}
      onClose={vi.fn()}
      phaseData={PHASES.menstrual}
      date={new Date(2099, 0, 1)}
    />
  );
}

describe("DailyLogSheet renders the full vocabulary", () => {
  it("shows every symptom and every mood as its own control", () => {
    render(<ControlledSheet />);
    for (const s of ALL_SYMPTOMS) {
      expect(screen.getByRole("button", { name: s })).toBeTruthy();
    }
    for (const m of MOOD_OPTIONS) {
      expect(screen.getByRole("button", { name: m })).toBeTruthy();
    }
  });

  it("stays scrollable rather than overflowing as the lists grow", () => {
    render(<ControlledSheet />);
    const panel = screen
      .getByRole("dialog")
      .querySelector<HTMLElement>(".overflow-y-auto");
    expect(panel).not.toBeNull();
    expect(panel!.className).toMatch(/max-h-\[85vh\]/);
  });
});

describe("mood stays single-select", () => {
  it("replaces the previous mood rather than accumulating", () => {
    render(<ControlledSheet />);
    fireEvent.click(screen.getByRole("button", { name: "Overwhelmed" }));
    fireEvent.click(screen.getByRole("button", { name: "Hopeful" }));

    // Exactly one selected pill in the mood row, and it is the last clicked.
    // "Neutral" was never touched, so its fill is the unselected baseline.
    const unselectedBg = screen.getByRole("button", { name: "Neutral" }).style
      .backgroundColor;
    const selected = MOOD_OPTIONS.filter(
      (m) =>
        screen.getByRole("button", { name: m }).style.backgroundColor !==
        unselectedBg
    );
    expect(selected).toEqual(["Hopeful"]);
  });

  it("clears the mood when the active one is tapped again", () => {
    render(<ControlledSheet initial={{ mood: "Tearful" }} />);
    const pill = () => screen.getByRole("button", { name: "Tearful" });
    const selectedBg = pill().style.backgroundColor;

    fireEvent.click(pill());
    expect(pill().style.backgroundColor).not.toBe(selectedBg);
  });

  it("symptoms remain multi-select, unlike mood", () => {
    render(<ControlledSheet />);
    fireEvent.click(screen.getByRole("button", { name: "Migraine" }));
    fireEvent.click(screen.getByRole("button", { name: "Joint pain" }));

    const unselectedBg = screen.getByRole("button", { name: "Chills" }).style
      .backgroundColor;
    expect(screen.getByRole("button", { name: "Migraine" }).style.backgroundColor)
      .not.toBe(unselectedBg);
    expect(screen.getByRole("button", { name: "Joint pain" }).style.backgroundColor)
      .not.toBe(unselectedBg);
  });
});

describe("OverviewTab renders the full symptom vocabulary", () => {
  it("shows every symptom as a toggle", () => {
    render(
      <OverviewTab
        phaseData={PHASES.menstrual}
        state={deriveCycleState([], null, new Date(2099, 0, 1))}
        symptoms={new Set<string>()}
        toggleSymptom={vi.fn()}
        today={new Date(2099, 0, 1)}
      />
    );
    for (const s of ALL_SYMPTOMS) {
      expect(screen.getByRole("button", { name: s })).toBeTruthy();
    }
  });

  it("toggling reports the exact label", () => {
    const toggleSymptom = vi.fn();
    render(
      <OverviewTab
        phaseData={PHASES.menstrual}
        state={deriveCycleState([], null, new Date(2099, 0, 1))}
        symptoms={new Set<string>()}
        toggleSymptom={toggleSymptom}
        today={new Date(2099, 0, 1)}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Discharge changes" }));
    expect(toggleSymptom).toHaveBeenCalledWith("Discharge changes");
  });
});
