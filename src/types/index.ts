// ─── Phase ───────────────────────────────────────────────────────────────────

export type PhaseName = "menstrual" | "follicular" | "ovulation" | "luteal";

export interface PhaseData {
  name: string;
  shortName: string;
  range: string;
  color: string;
  bg: string;
  text: string;
  border: string;
  emoji: string;
  tagline: string;
  description: string;
  partnerDesc: string;
  energy: number;
  mood: string;
  symptoms: string[];
  tips: string[];
  partnerTips: string[];
  cycleStart: number;
  cycleEnd: number;
}

// ─── Daily log (stored in IndexedDB) ─────────────────────────────────────────

export type FlowLevel = "none" | "spotting" | "light" | "medium" | "heavy";

export interface DailyLog {
  date: string; // YYYY-MM-DD, primary key
  flow: FlowLevel;
  symptoms: string[];
  mood: string | null;
  energy: string | null; // "low" | "medium" | "high"
  notes: string;
}

// ─── Cycle (derived from logs) ───────────────────────────────────────────────

export interface Period {
  startDate: string;
  endDate: string;
  length: number;
}

export interface Cycle {
  periodStart: string;
  periodEnd: string;
  periodLength: number;
  cycleLength: number | null; // null for the current/latest cycle
  excluded: boolean; // excluded from prediction calculations
}

export interface FertileWindow {
  start: Date;
  end: Date;
  ovulationDate: Date;
  confidence: number; // 0-1, lower when stddev is high
}

export interface CycleState {
  cycles: Cycle[];
  currentCycleStart: string | null;
  cycleDay: number;
  phase: PhaseName;
  avgCycleLength: number;
  avgPeriodLength: number;
  stdDev: number;
  daysUntilPeriod: number;
  nextPeriodDate: Date | null;
  confidence: "early" | "building" | "good";
  isLate: boolean;
  predictions: PredictedCycle[];
  fertileWindow: FertileWindow | null;
}

export interface PredictedCycle {
  cycleNumber: number;
  start: Date;
  end: Date;
  uncertainty: number; // days of uncertainty, widens for further predictions
}

// ─── Legacy: matches Figma export's hardcoded format (to bridge during migration)

export interface LegacyCycleEntry {
  start: string;
  length: number | null;
  flow: "light" | "medium" | "heavy";
}
