import type { PhaseName, PhaseData } from "@/types";

export const PHASES: Record<PhaseName, PhaseData> = {
  menstrual: {
    name: "Menstrual",
    shortName: "Flow",
    range: "Days 1–5",
    color: "#BE5A5A",
    bg: "#FDF0F0",
    text: "#7A2020",
    border: "#EAAFAF",
    emoji: "\u{1F311}",
    tagline: "Rest & Release",
    description:
      "The uterine lining sheds as progesterone and estrogen reach their lowest. A time of renewal \u2014 the body releasing what it no longer needs to begin a fresh cycle.",
    partnerDesc:
      "Her body is in its monthly reset. Energy is naturally lower and she may need more comfort and rest than usual. Small acts of care \u2014 warmth, gentleness, flexibility \u2014 mean the world right now.",
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
    cycleStart: 1,
    cycleEnd: 5,
  },
  follicular: {
    name: "Follicular",
    shortName: "Rising",
    range: "Days 6\u201313",
    color: "#5E8A52",
    bg: "#EBF0E7",
    text: "#2A4A20",
    border: "#A8C89E",
    emoji: "\u{1F331}",
    tagline: "Rise & Bloom",
    description:
      "Estrogen rises steadily as follicles develop in the ovaries. Energy returns, cognitive sharpness increases, and there\u2019s a natural pull toward new beginnings and social connection.",
    partnerDesc:
      "She\u2019s in a rising phase \u2014 energy is building and she\u2019s likely feeling more like herself. A great time to plan things together and enjoy her natural enthusiasm for life.",
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
      "She\u2019s communicative \u2014 really lean in",
      "Great time for meaningful conversations",
      "Match and celebrate her renewed energy",
    ],
    cycleStart: 6,
    cycleEnd: 13,
  },
  ovulation: {
    name: "Ovulation",
    shortName: "Peak",
    range: "Days 14\u201316",
    color: "#C9913A",
    bg: "#FBF0DC",
    text: "#7A4A0A",
    border: "#E8C88A",
    emoji: "\u2600\uFE0F",
    tagline: "Peak & Shine",
    description:
      "The follicle releases an egg as estrogen peaks and testosterone briefly surges. This is the most magnetic, high-energy phase \u2014 confidence, sociability, and vitality are at their highest.",
    partnerDesc:
      "She\u2019s at her peak \u2014 likely feeling her most vibrant and connected. This is a golden window for quality time, meaningful conversations, and shared experiences. Be present with her.",
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
      "She\u2019s at her most magnetic and expressive",
      "Ideal time for romantic connection",
      "Have important conversations \u2014 she\u2019s most receptive",
      "Quality time over anything else",
    ],
    cycleStart: 14,
    cycleEnd: 16,
  },
  luteal: {
    name: "Luteal",
    shortName: "Nesting",
    range: "Days 17\u201328",
    color: "#8B6FA0",
    bg: "#EEE8F4",
    text: "#4A2A5A",
    border: "#C0A8D8",
    emoji: "\u{1F319}",
    tagline: "Turn Inward",
    description:
      "Progesterone rises as the body prepares. If pregnancy doesn\u2019t occur, hormones gradually decline toward the end of the phase \u2014 which can bring PMS symptoms in the final days.",
    partnerDesc:
      "The body is winding down toward the next cycle. She may feel more sensitive or need more reassurance. Quiet, consistent support and extra patience are the most loving things you can offer.",
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
      "Don\u2019t dismiss or try to fix her feelings",
      "Offer to handle decisions or logistics",
      "Cosy nights in over high-stimulation plans",
    ],
    cycleStart: 17,
    cycleEnd: 999,
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
  4: "High \u2014 she\u2019s in her stride",
  5: "Peak \u2014 vibrant and magnetic",
};
