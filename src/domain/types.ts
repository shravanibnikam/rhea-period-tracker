// domain/types.ts — the stored + derived domain model (spec Chapter 2/§1.2).
// DailyLog is the single source of truth; everything cycle-shaped is derived
// in memory. Moved verbatim from src/types/index.ts (M1.2 / RHEA-023), minus
// the LegacyCycleEntry bridge, which stays in the shim until M1.3 deletes it.

// ─── Phase ───────────────────────────────────────────────────────────────────

export type PhaseName = "menstrual" | "follicular" | "ovulation" | "luteal";

// Phase copy + colors ONLY. Day ranges (`range`, `cycleStart`, `cycleEnd`)
// were removed in M1.3: they are DERIVED by the phase oracle (phases.ts),
// never baked into content.
export interface PhaseData {
  name: string;
  shortName: string;
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
}

// ─── Daily log (stored in IndexedDB) ─────────────────────────────────────────

export type FlowLevel = "none" | "spotting" | "light" | "medium" | "heavy";

/** v2 additive log entry: a medication taken that day (spec §1.2). */
export interface MedicationEntry {
  name: string;
  dose?: string; // "200mg" — optional
  takenAt?: string; // "HH:mm" local, optional
}

/** v2 additive log entry: intimacy record (spec §1.2). */
export interface IntimacyEntry {
  occurred: boolean;
  protected?: boolean; // optional; omit = unknown
}

export interface DailyLog {
  date: string; // YYYY-MM-DD, primary key (the logical SyncRecord key)
  flow: FlowLevel;
  symptoms: string[];
  mood: string | null;
  energy: string | null; // "low" | "medium" | "high"
  notes: string;
  // ── v2 additive (all optional → v1 payloads remain valid) ──
  medication?: MedicationEntry[];
  intimacy?: IntimacyEntry | null;
  /** Payload-shape marker inside the plaintext (pre-encryption). */
  schemaHint?: 2;
}

/** The canonical empty log for a date (pure constructor; moved from lib/db). */
export function emptyLog(date: string): DailyLog {
  return { date, flow: "none", symptoms: [], mood: null, energy: null, notes: "" };
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
