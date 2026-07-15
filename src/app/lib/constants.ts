import type { FlowLevel } from "@/domain/types";

// UI option lists (presentation content). Cycle-math constants live in
// domain/constants and are re-exported for convenience.
export {
  DEFAULT_CYCLE_LENGTH,
  DEFAULT_LUTEAL_LENGTH,
  MIN_CYCLES_FOR_PREDICTION,
  ROLLING_AVERAGE_WINDOW,
} from "@/domain/constants";

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
] as const;

export const FLOW_LEVELS: { value: FlowLevel; label: string; color: string }[] = [
  { value: "none", label: "None", color: "#E5DDD8" },
  { value: "spotting", label: "Spotting", color: "#D4B8B0" },
  { value: "light", label: "Light", color: "#D4E8CC" },
  { value: "medium", label: "Medium", color: "#F2C4C4" },
  { value: "heavy", label: "Heavy", color: "#E08080" },
];

export const MOOD_OPTIONS = [
  "Happy",
  "Calm",
  "Energetic",
  "Sensitive",
  "Anxious",
  "Irritable",
  "Sad",
  "Neutral",
] as const;

export const ENERGY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
] as const;
