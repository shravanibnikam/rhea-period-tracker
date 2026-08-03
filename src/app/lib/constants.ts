import type { FlowLevel } from "@/domain/types";

// UI option lists (presentation content). Cycle-math constants live in
// domain/constants and are re-exported for convenience.
export {
  DEFAULT_CYCLE_LENGTH,
  DEFAULT_LUTEAL_LENGTH,
  MIN_CYCLES_FOR_PREDICTION,
  ROLLING_AVERAGE_WINDOW,
} from "@/domain/constants";

// Loggable symptoms. Order is append-only: existing entries keep their position
// so the pill grid doesn't reshuffle under people who know where things sit.
// `Lower back pain` is deliberately absent — `Back pain` already covers it, and
// `Swelling` is left out as a restatement of `Water retention`.
export const ALL_SYMPTOMS = [
  "Cramps",
  "Bloating",
  "Headache",
  "Fatigue",
  "Mood swings",
  "Food cravings",
  "Breast tenderness",
  "Back pain",
  "Acne",
  "Nausea",
  "Anxiety",
  "Irritability",
  "Brain fog",
  "Insomnia",
  "Migraine",
  "Dizziness",
  "Pelvic pain",
  "Body aches",
  "Joint pain",
  "Hot flashes",
  "Chills",
  "Water retention",
  "Sleepiness",
  "Restlessness",
  "Low appetite",
  "Increased appetite",
  "Skin sensitivity",
  "Weakness",
  "Vaginal dryness",
  "Discharge changes",
  "Low libido",
] as const;

export const FLOW_LEVELS: { value: FlowLevel; label: string; color: string }[] = [
  { value: "none", label: "None", color: "#E5DDD8" },
  { value: "spotting", label: "Spotting", color: "#D4B8B0" },
  { value: "light", label: "Light", color: "#D4E8CC" },
  { value: "medium", label: "Medium", color: "#F2C4C4" },
  { value: "heavy", label: "Heavy", color: "#E08080" },
];

// Single-select — DailyLogSheet writes one value to `DailyLog.mood` (tapping the
// active one clears it). Append-only for the same reason as ALL_SYMPTOMS.
// `Low` is deliberately absent: it restates `Sad`, and it would read as an
// energy level next to ENERGY_OPTIONS below.
export const MOOD_OPTIONS = [
  "Happy",
  "Calm",
  "Energetic",
  "Sensitive",
  "Anxious",
  "Irritable",
  "Sad",
  "Neutral",
  "Confident",
  "Focused",
  "Motivated",
  "Social",
  "Affectionate",
  "Playful",
  "Hopeful",
  "Content",
  "Emotional",
  "Tearful",
  "Overwhelmed",
  "Stressed",
  "Restless",
  "Angry",
  "Frustrated",
  "Lonely",
  "Unmotivated",
  "Withdrawn",
] as const;

export const ENERGY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
] as const;
