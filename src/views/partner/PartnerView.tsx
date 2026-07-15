import { Heart } from "lucide-react";
import type { PhaseData, PhaseName, CycleState } from "@/types";
import { PHASES, PHASE_ORDER, ENERGY_LABELS } from "@/lib/phases";
import { fmt, diffDays, getPhaseLengths } from "@/lib/utils";
import { EnergyBar } from "@/components/shared/EnergyBar";

interface PartnerViewProps {
  phaseData: PhaseData;
  phase: PhaseName;
  state: CycleState;
  today: Date;
}

export function PartnerView({ phaseData, phase, state, today }: PartnerViewProps) {
  const phaseLengths = getPhaseLengths(state.avgCycleLength);

  return (
    <div className="space-y-5">
      {/* Partner Hero */}
      <div
        className="rounded-3xl p-6 sm:p-8 border text-center"
        style={{ backgroundColor: phaseData.bg, borderColor: phaseData.border }}
      >
        <div className="flex items-center justify-center gap-2 mb-3">
          <Heart size={14} style={{ color: phaseData.color }} fill={phaseData.color} />
          <p
            className="text-xs font-semibold uppercase tracking-widest"
            style={{ color: phaseData.color }}
          >
            Partner&apos;s Guide
          </p>
          <Heart size={14} style={{ color: phaseData.color }} fill={phaseData.color} />
        </div>

        <p
          className="text-4xl sm:text-5xl mb-3 select-none"
          style={{ filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.08))" }}
        >
          {phaseData.emoji}
        </p>

        <h1
          className="font-serif text-3xl sm:text-4xl font-bold mb-1"
          style={{ color: phaseData.text }}
        >
          She&apos;s in her
        </h1>
        <h1
          className="font-serif text-3xl sm:text-4xl font-bold italic mb-3"
          style={{ color: phaseData.text }}
        >
          {phaseData.name} Phase
        </h1>

        <p
          className="text-sm mb-2"
          style={{ color: phaseData.text, opacity: 0.75 }}
        >
          Day {state.cycleDay} of {state.avgCycleLength} &nbsp;&middot;&nbsp;{" "}
          {phaseData.range} &nbsp;&middot;&nbsp;{" "}
          <em>&ldquo;{phaseData.tagline}&rdquo;</em>
        </p>

        {/* Cycle position bar */}
        <div className="max-w-xs mx-auto mt-5">
          <div className="flex h-2.5 rounded-full overflow-hidden gap-px">
            {PHASE_ORDER.map((p) => {
              const len = phaseLengths[p];
              const pct = (len / state.avgCycleLength) * 100;
              return (
                <div
                  key={p}
                  className="h-full transition-all"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: PHASES[p].color,
                    opacity: p === phase ? 1 : 0.25,
                  }}
                />
              );
            })}
          </div>
          <div className="flex justify-between mt-1">
            <span
              className="text-xs"
              style={{ color: phaseData.text, opacity: 0.5 }}
            >
              Day 1
            </span>
            <span
              className="text-xs font-medium"
              style={{ color: phaseData.color }}
            >
              Day {state.cycleDay} (now)
            </span>
            <span
              className="text-xs"
              style={{ color: phaseData.text, opacity: 0.5 }}
            >
              Day {state.avgCycleLength}
            </span>
          </div>
        </div>
      </div>

      {/* What's Happening */}
      <div className="bg-card rounded-2xl border border-border p-6">
        <h2 className="font-serif text-xl font-semibold mb-3 text-foreground">
          What&apos;s Happening in Her Body
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed mb-5">
          {phaseData.partnerDesc}
        </p>

        <div className="grid sm:grid-cols-2 gap-3">
          <div
            className="p-4 rounded-xl"
            style={{ backgroundColor: phaseData.bg }}
          >
            <p
              className="text-xs font-semibold uppercase tracking-wider mb-2"
              style={{ color: phaseData.color }}
            >
              Energy Level
            </p>
            <EnergyBar level={phaseData.energy} color={phaseData.color} />
            <p
              className="text-xs mt-2"
              style={{ color: phaseData.text, opacity: 0.85 }}
            >
              {ENERGY_LABELS[phaseData.energy]}
            </p>
          </div>

          <div
            className="p-4 rounded-xl"
            style={{ backgroundColor: phaseData.bg }}
          >
            <p
              className="text-xs font-semibold uppercase tracking-wider mb-2"
              style={{ color: phaseData.color }}
            >
              Mood Tendencies
            </p>
            <p className="text-sm" style={{ color: phaseData.text }}>
              {phaseData.mood}
            </p>
          </div>
        </div>
      </div>

      {/* How to Support */}
      <div className="bg-card rounded-2xl border border-border p-6">
        <h2 className="font-serif text-xl font-semibold mb-1 text-foreground">
          How You Can Help
        </h2>
        <p className="text-xs text-muted-foreground mb-4">
          Four things that matter most right now
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          {phaseData.partnerTips.map((tip, i) => (
            <div
              key={i}
              className="flex items-start gap-3 p-4 rounded-xl border border-border"
            >
              <div
                className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold text-white"
                style={{ backgroundColor: phaseData.color }}
              >
                {i + 1}
              </div>
              <p className="text-sm text-foreground leading-snug">{tip}</p>
            </div>
          ))}
        </div>
      </div>

      {/* What's Coming Next */}
      <div className="bg-card rounded-2xl border border-border p-6">
        <h2 className="font-serif text-xl font-semibold mb-4 text-foreground">
          What&apos;s Coming Next
        </h2>

        <div className="space-y-2.5">
          {state.predictions.slice(0, 3).map((pred, i) => {
            const isNext = i === 0;
            const daysAway = diffDays(pred.start, today);
            return (
              <div
                key={i}
                className={`flex items-center justify-between p-3.5 rounded-xl ${
                  isNext ? "" : "bg-muted"
                }`}
                style={isNext ? { backgroundColor: PHASES.menstrual.bg } : undefined}
              >
                <div className="flex items-center gap-3">
                  <span className={`text-2xl ${isNext ? "" : "opacity-50"}`}>
                    {PHASES.menstrual.emoji}
                  </span>
                  <div>
                    <p
                      className={`text-sm ${isNext ? "font-semibold" : "font-medium text-foreground"}`}
                      style={isNext ? { color: PHASES.menstrual.text } : undefined}
                    >
                      {isNext ? "Next Period" : fmt(pred.start, { month: "long", day: "numeric", year: "numeric" })}
                    </p>
                    <p
                      className="text-xs"
                      style={
                        isNext
                          ? { color: PHASES.menstrual.text, opacity: 0.7 }
                          : undefined
                      }
                    >
                      <span className={isNext ? "" : "text-muted-foreground"}>
                        {isNext
                          ? `${fmt(pred.start, { month: "long", day: "numeric" })} \u00b7 in ${daysAway} days`
                          : `Cycle ${pred.cycleNumber} \u00b7 in ${daysAway} days`}
                      </span>
                    </p>
                  </div>
                </div>
                {isNext && (
                  <div
                    className="text-right text-sm font-serif font-bold"
                    style={{ color: PHASES.menstrual.text }}
                  >
                    {daysAway}d
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Understanding the Full Cycle */}
      <div className="bg-card rounded-2xl border border-border p-6">
        <h2 className="font-serif text-xl font-semibold mb-1 text-foreground">
          Understanding the Full Cycle
        </h2>
        <p className="text-xs text-muted-foreground mb-4">
          Each cycle has four distinct phases with different needs.
        </p>

        <div className="space-y-2.5">
          {PHASE_ORDER.map((p) => (
            <div
              key={p}
              className="p-4 rounded-xl border-2 transition-all"
              style={{
                backgroundColor: PHASES[p].bg,
                borderColor: p === phase ? PHASES[p].color : "transparent",
              }}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2.5">
                  <span className="text-xl">{PHASES[p].emoji}</span>
                  <div>
                    <p
                      className="text-sm font-semibold"
                      style={{ color: PHASES[p].text }}
                    >
                      {PHASES[p].name}{" "}
                      {p === phase && (
                        <span
                          className="ml-1.5 text-xs px-1.5 py-0.5 rounded-full"
                          style={{
                            backgroundColor: PHASES[p].color,
                            color: "white",
                          }}
                        >
                          Now
                        </span>
                      )}
                    </p>
                    <p
                      className="text-xs"
                      style={{ color: PHASES[p].text, opacity: 0.6 }}
                    >
                      {PHASES[p].range}
                    </p>
                  </div>
                </div>
                <div className="w-24">
                  <EnergyBar level={PHASES[p].energy} color={PHASES[p].color} />
                </div>
              </div>
              <p
                className="text-xs leading-relaxed pl-9"
                style={{ color: PHASES[p].text, opacity: 0.8 }}
              >
                {PHASES[p].partnerTips[0]}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-4 pt-4 border-t border-border">
          <p className="text-xs text-center text-muted-foreground leading-relaxed">
            Every cycle is different. These are tendencies, not certainties
            &mdash;
            <br />
            listening is always the best guide.
          </p>
        </div>
      </div>
    </div>
  );
}
