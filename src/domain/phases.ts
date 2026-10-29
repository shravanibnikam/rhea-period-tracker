// domain/phases.ts — THE single phase oracle (M1.3 / spec Chapter 4 §2) plus
// phase copy/colors. PURE: imports domain types only. PhaseData carries copy
// and colors ONLY (colours are CSS custom-property references into
// app/styles/theme.css, so every consumer follows the theme); every day-range
// is DERIVED from getPhaseBoundaries — the
// three previously-conflicting engines (utils.getPhase, utils.getPhaseLengths,
// cycle.getCurrentPhase) are unified here, with cycle.getCurrentPhase's
// dynamic algorithm promoted as canonical.
import type { PhaseName, PhaseData } from "./types";
import { DEFAULT_LUTEAL_LENGTH } from "./constants";

// Re-exported so callers can import the phase type with the oracle (type-only; no runtime effect).
export type { PhaseName } from "./types";

export const PHASES: Record<PhaseName, PhaseData> = {
  menstrual: {
    name: "Menstrual",
    shortName: "Flow",
    color: "var(--menstrual)",
    bg: "var(--menstrual-tint)",
    text: "var(--menstrual-ink)",
    border: "color-mix(in srgb, var(--menstrual) 35%, transparent)",
    emoji: "\u{1F311}",
    tagline: "Rest & release",
    description:
      "The uterine lining sheds as progesterone and estrogen reach their lowest. A time of renewal \u2014 the body releasing what it no longer needs to begin a fresh cycle.",
    partnerDesc:
      "Their body is in its monthly reset. Energy is naturally lower and they may need more comfort and rest than usual. Small acts of care \u2014 warmth, gentleness, flexibility \u2014 mean the world right now.",
    energy: 2,
    mood: "Reflective, tender, quietly inward",
    symptoms: ["Cramps", "Bloating", "Fatigue", "Lower back pain", "Headaches"],
    tips: [
      "Heat pads and warm baths for cramps",
      "Iron-rich foods: lentils, leafy greens, red meat",
      "Gentle yoga or slow walks only",
      "Extra sleep and rest \u2014 honour the slowdown",
    ],
    partnerTips: [
      "Offer warmth without being asked",
      "Bring comfort foods or a hot water bottle",
      "Keep plans low-key and flexible",
      "Gentle physical comfort \u2014 warmth over activity",
    ],
  },
  follicular: {
    name: "Follicular",
    shortName: "Rising",
    color: "var(--follicular)",
    bg: "var(--follicular-tint)",
    text: "var(--follicular-ink)",
    border: "color-mix(in srgb, var(--follicular) 35%, transparent)",
    emoji: "\u{1F331}",
    tagline: "Rise & bloom",
    description:
      "Estrogen rises steadily as follicles develop in the ovaries. Energy returns, cognitive sharpness increases, and there\u2019s a natural pull toward new beginnings and social connection.",
    partnerDesc:
      "They\u2019re in a rising phase \u2014 energy is building and they\u2019re likely feeling more like themselves. A great time to plan things together and enjoy their natural enthusiasm for life.",
    energy: 4,
    mood: "Optimistic, curious, creative, sociable",
    symptoms: ["Rising energy", "Improved mood", "Better sleep", "Sharper focus"],
    tips: [
      "Ideal time for new projects and bold goals",
      "Schedule important meetings or negotiations",
      "Higher-intensity workouts feel rewarding now",
      "Explore new ideas, places, and experiences",
    ],
    partnerTips: [
      "Plan exciting adventures or experiences together",
      "They\u2019re communicative \u2014 really lean in",
      "Great time for meaningful conversations",
      "Match and celebrate their renewed energy",
    ],
  },
  ovulation: {
    name: "Ovulation",
    shortName: "Peak",
    color: "var(--ovulation)",
    bg: "var(--ovulation-tint)",
    text: "var(--ovulation-ink)",
    border: "color-mix(in srgb, var(--ovulation) 35%, transparent)",
    emoji: "\u2600\uFE0F",
    tagline: "Peak & shine",
    description:
      "The follicle releases an egg as estrogen peaks and testosterone briefly surges. This is the most magnetic, high-energy phase \u2014 confidence, sociability, and vitality are at their highest.",
    partnerDesc:
      "They\u2019re at their peak \u2014 likely feeling their most vibrant and connected. This is a golden window for quality time, meaningful conversations, and shared experiences. Be present with them.",
    energy: 5,
    mood: "Confident, charismatic, assertive, open",
    symptoms: [
      "Peak energy",
      "Heightened senses",
      "Mild pelvic discomfort",
      "Increased warmth",
    ],
    tips: [
      "Perfect for important pitches or negotiations",
      "HIIT, strength training, or dance classes",
      "Express creativity and take bold leaps",
      "Connect deeply \u2014 vulnerability flows easier",
    ],
    partnerTips: [
      "They\u2019re at their most magnetic and expressive",
      "Ideal time for romantic connection",
      "Have important conversations \u2014 they\u2019re most receptive",
      "Quality time over anything else",
    ],
  },
  luteal: {
    name: "Luteal",
    shortName: "Nesting",
    color: "var(--luteal)",
    bg: "var(--luteal-tint)",
    text: "var(--luteal-ink)",
    border: "color-mix(in srgb, var(--luteal) 35%, transparent)",
    emoji: "\u{1F319}",
    tagline: "Turn inward",
    description:
      "Progesterone rises as the body prepares. If pregnancy doesn\u2019t occur, hormones gradually decline toward the end of the phase \u2014 which can bring PMS symptoms in the final days.",
    partnerDesc:
      "The body is winding down toward the next cycle. They may feel more sensitive or need more reassurance. Quiet, consistent support and extra patience are the most loving things you can offer.",
    energy: 3,
    mood: "Detail-oriented, introspective, emotionally sensitive",
    symptoms: [
      "Bloating",
      "Mood sensitivity",
      "Breast tenderness",
      "Food cravings",
      "Fatigue",
    ],
    tips: [
      "Nesting, organising, and finishing tasks",
      "Gentle movement: yoga, swimming, long walks",
      "Magnesium-rich foods: dark chocolate, nuts, seeds",
      "Reduce caffeine and alcohol, prioritise sleep",
    ],
    partnerTips: [
      "Extra patience is key \u2014 emotions run deeper",
      "Don\u2019t dismiss or try to fix their feelings",
      "Offer to handle decisions or logistics",
      "Cosy nights in over high-stimulation plans",
    ],
  },
};

export const PHASE_ORDER: PhaseName[] = [
  "menstrual",
  "follicular",
  "ovulation",
  "luteal",
];

export const ENERGY_LABELS: Record<number, string> = {
  1: "Very low \u2014 rest is essential",
  2: "Low \u2014 gentle support needed",
  3: "Moderate \u2014 balanced energy",
  4: "High \u2014 they\u2019re in their stride",
  5: "Peak \u2014 vibrant and magnetic",
};

// \u2500\u2500\u2500 The phase oracle \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// One algorithm, mirrored from the former cycle.getCurrentPhase exactly:
//   menstrual  = days 1..avgPeriodLength
//   ovulationDay = avgCycleLength \u2212 lutealLength; fertileStart = ovulationDay \u2212 5
//   follicular = avgPeriodLength+1 .. fertileStart      (day == fertileStart is follicular)
//   ovulation  = fertileStart+1 .. ovulationDay+1
//   luteal     = ovulationDay+2 .. avgCycleLength
// (The spec \u00a72.2 boundary sketch had ovulation starting AT fertileStart \u2014 an
// off-by-one inconsistent with its own "identical branching" requirement; the
// branching wins, spec corrected. See IMPLEMENTATION_JOURNAL S2.3.)
// The fertile window (cycle.computeFertileWindow) uses the same ovulationDay
// (getOvulationDay): fertileStart .. ovulationDay+1, so its last day is the
// ovulation phase's last day and it never runs into the luteal phase.

export interface PhaseAnchors {
  avgCycleLength: number;
  avgPeriodLength: number;
  /** = DEFAULT_LUTEAL_LENGTH unless a caller injects a different model. */
  lutealLength: number;
}

export function anchorsFrom(
  avgCycleLength: number,
  avgPeriodLength: number,
  lutealLength: number = DEFAULT_LUTEAL_LENGTH
): PhaseAnchors {
  return { avgCycleLength, avgPeriodLength, lutealLength };
}

export interface PhaseBoundary {
  startDay: number; // 1-indexed, inclusive
  endDay: number; // inclusive
}
export type PhaseBoundaries = Record<PhaseName, PhaseBoundary>;

/** Cycle day (1-indexed) of the estimated ovulation: the one definition, shared with the fertile window. */
export function getOvulationDay(avgCycleLength: number, lutealLength: number = DEFAULT_LUTEAL_LENGTH): number {
  return avgCycleLength - lutealLength;
}

export function getPhaseBoundaries(a: PhaseAnchors): PhaseBoundaries {
  const ovulationDay = getOvulationDay(a.avgCycleLength, a.lutealLength);
  const fertileStart = ovulationDay - 5;
  // Sequential cut points, clamped so phases stay ordered even for degenerate
  // short cycles (fertileStart inside the period) — exactly what the branching
  // in getPhaseForDay resolves to. A squeezed phase gets width 0 (startDay =
  // endDay + 1: getPhaseForDay gives it no day), never a negative or
  // overlapping range, and widths always sum to avgCycleLength.
  const mEnd = a.avgPeriodLength;
  const fEnd = Math.max(fertileStart, mEnd);
  const oEnd = Math.max(ovulationDay + 1, fEnd);
  return {
    menstrual: { startDay: 1, endDay: mEnd },
    follicular: { startDay: mEnd + 1, endDay: fEnd },
    ovulation: { startDay: fEnd + 1, endDay: oEnd },
    luteal: { startDay: oEnd + 1, endDay: a.avgCycleLength },
  };
}

/** THE phase-for-day decision. Identical branching to the legacy getCurrentPhase. */
export function getPhaseForDay(cycleDay: number, a: PhaseAnchors): PhaseName {
  if (cycleDay <= a.avgPeriodLength) return "menstrual";
  const ovulationDay = getOvulationDay(a.avgCycleLength, a.lutealLength);
  const fertileStart = ovulationDay - 5;
  if (cycleDay <= fertileStart) return "follicular";
  if (cycleDay <= ovulationDay + 1) return "ovulation";
  return "luteal";
}

/** Segment widths = boundary widths (construction guarantees \u2265 0; sum = cycle). */
export function getPhaseLengths(a: PhaseAnchors): Record<PhaseName, number> {
  const b = getPhaseBoundaries(a);
  const width = (p: PhaseName) => b[p].endDay - b[p].startDay + 1;
  return {
    menstrual: width("menstrual"),
    follicular: width("follicular"),
    ovulation: width("ovulation"),
    luteal: width("luteal"),
  };
}

/**
 * "Days 1\u20135" \u2014 derived, replacing the baked PhaseData.range strings. A phase a
 * short cycle squeezes out (getPhaseForDay gives it no day) reads "No days",
 * never an empty or inverted range like "Days 6\u20135".
 */
export function getPhaseRangeLabel(p: PhaseName, a: PhaseAnchors): string {
  const b = getPhaseBoundaries(a)[p];
  return b.endDay < b.startDay ? "No days" : `Days ${b.startDay}\u2013${b.endDay}`;
}
