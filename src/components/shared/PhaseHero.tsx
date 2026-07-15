import type { PhaseName, PhaseData } from "@/types";
import { PhaseProgressBar } from "./PhaseProgressBar";
import { fmt } from "@/lib/utils";

interface PhaseHeroProps {
  phaseData: PhaseData;
  phase: PhaseName;
  cycleDay: number;
  avgLength: number;
  daysLeft: number;
  nextPeriod: Date;
  isLate?: boolean;
  confidence?: "early" | "building" | "good";
}

export function PhaseHero({
  phaseData,
  phase,
  cycleDay,
  avgLength,
  daysLeft,
  nextPeriod,
  isLate = false,
  confidence,
}: PhaseHeroProps) {
  return (
    <div
      className="rounded-3xl p-6 sm:p-8 mb-6 border"
      style={{ backgroundColor: phaseData.bg, borderColor: phaseData.border }}
    >
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <p
            className="text-xs font-semibold uppercase tracking-widest mb-2"
            style={{ color: phaseData.color }}
          >
            Day {cycleDay} of {avgLength} &middot; {phaseData.range}
          </p>
          {isLate ? (
            <>
              <h1
                className="font-serif text-4xl sm:text-5xl font-bold leading-none mb-2"
                style={{ color: "#BE5A5A" }}
              >
                Period
                <br />
                <span className="font-light italic">may be late</span>
              </h1>
              <p
                className="text-sm mt-3"
                style={{ color: phaseData.text, opacity: 0.75 }}
              >
                Expected {fmt(nextPeriod, { month: "long", day: "numeric" })} &middot;{" "}
                {Math.abs(daysLeft)} days ago
              </p>
            </>
          ) : (
            <>
              <h1
                className="font-serif text-4xl sm:text-5xl font-bold leading-none mb-2"
                style={{ color: phaseData.text }}
              >
                {phaseData.name}
                <br />
                <span className="font-light italic">Phase</span>
              </h1>
              <p
                className="text-sm italic mt-3"
                style={{ color: phaseData.text, opacity: 0.75 }}
              >
                &ldquo;{phaseData.tagline}&rdquo;
              </p>
            </>
          )}
        </div>
        <div
          className="text-7xl sm:text-8xl select-none self-end sm:self-start"
          style={{ filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.08))" }}
        >
          {isLate ? "\u23F0" : phaseData.emoji}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {[
          { label: "Cycle Day", value: String(cycleDay) },
          { label: "Avg Length", value: `${avgLength} days` },
          {
            label: isLate ? "Days Late" : "Days Until Period",
            value: isLate
              ? String(Math.abs(daysLeft))
              : daysLeft > 0
                ? String(daysLeft)
                : "Today",
          },
          {
            label: isLate ? "Expected" : "Next Period",
            value: fmt(nextPeriod, { month: "short", day: "numeric" }),
          },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-xl p-3 text-center"
            style={{ backgroundColor: "rgba(255,255,255,0.5)" }}
          >
            <p
              className="text-xs font-medium mb-1"
              style={{ color: phaseData.color }}
            >
              {item.label}
            </p>
            <p
              className="text-xl font-serif font-bold"
              style={{ color: phaseData.text }}
            >
              {item.value}
            </p>
          </div>
        ))}
      </div>

      {/* Confidence badge */}
      {confidence && (
        <div className="mt-3 flex justify-end">
          <span
            className="text-xs px-2.5 py-1 rounded-full"
            style={{
              backgroundColor: phaseData.bg,
              color: phaseData.color,
              border: `1px solid ${phaseData.border}`,
            }}
          >
            {confidence === "early"
              ? "Early estimate"
              : confidence === "building"
                ? "Building accuracy"
                : "Good accuracy"}
          </span>
        </div>
      )}

      <div className="mt-3">
        <PhaseProgressBar
          currentPhase={phase}
          avgLength={avgLength}
          phaseTextColor={phaseData.text}
        />
      </div>
    </div>
  );
}
