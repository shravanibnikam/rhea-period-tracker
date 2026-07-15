import type { PhaseData, CycleState } from "@/domain/types";
import { PHASES } from "@/domain/phases";
import { ALL_SYMPTOMS } from "@/app/lib/constants";
import { fmt } from "@/app/lib/format";
import { diffDays } from "@/domain/dates";
import { EnergyBar } from "@/app/components/shared/EnergyBar";

interface OverviewTabProps {
  phaseData: PhaseData;
  state: CycleState;
  symptoms: Set<string>;
  toggleSymptom: (s: string) => void;
  today: Date;
}

export function OverviewTab({
  phaseData,
  state,
  symptoms,
  toggleSymptom,
  today,
}: OverviewTabProps) {
  return (
    <div className="space-y-5">
      {/* What's Happening */}
      <div className="bg-card rounded-2xl border border-border p-6">
        <h2 className="font-serif text-xl font-semibold mb-3 text-foreground">
          What&apos;s Happening
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed mb-5">
          {phaseData.description}
        </p>

        <div className="grid sm:grid-cols-2 gap-4 mb-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Energy Level
            </p>
            <EnergyBar level={phaseData.energy} color={phaseData.color} />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Mood
            </p>
            <p className="text-sm text-foreground">{phaseData.mood}</p>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-5 pt-5 border-t border-border">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Common Symptoms
            </p>
            <div className="flex flex-wrap gap-1.5">
              {phaseData.symptoms.map((s) => (
                <span
                  key={s}
                  className="text-xs px-2.5 py-1 rounded-full border"
                  style={{
                    backgroundColor: phaseData.bg,
                    color: phaseData.text,
                    borderColor: phaseData.border,
                  }}
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Phase Tips
            </p>
            <ul className="space-y-2">
              {phaseData.tips.map((tip) => (
                <li
                  key={tip}
                  className="text-xs text-muted-foreground flex items-start gap-2"
                >
                  <span
                    className="mt-0.5 flex-shrink-0"
                    style={{ color: phaseData.color }}
                  >
                    &#x2726;
                  </span>
                  {tip}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Symptom Logger */}
      <div className="bg-card rounded-2xl border border-border p-6">
        <h2 className="font-serif text-xl font-semibold mb-1 text-foreground">
          Today&apos;s Symptoms
        </h2>
        <p className="text-xs text-muted-foreground mb-4">
          Tap to log &mdash; {symptoms.size} tracked today
        </p>
        <div className="flex flex-wrap gap-2">
          {ALL_SYMPTOMS.map((s) => (
            <button
              key={s}
              onClick={() => toggleSymptom(s)}
              className="px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-200"
              style={
                symptoms.has(s)
                  ? {
                      backgroundColor: phaseData.bg,
                      color: phaseData.text,
                      borderColor: phaseData.border,
                    }
                  : {
                      backgroundColor: "var(--muted)",
                      color: "var(--muted-foreground)",
                      borderColor: "var(--border)",
                    }
              }
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Fertile Window */}
      {state.fertileWindow && (
        <div
          className="rounded-2xl border p-5"
          style={{ backgroundColor: "#FBF0DC", borderColor: "#E8C88A" }}
        >
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-lg">&#x2600;&#xFE0F;</span>
              <h3 className="font-serif text-base font-semibold" style={{ color: "#7A4A0A" }}>
                Fertile Window
              </h3>
            </div>
            <span
              className="text-xs px-2 py-0.5 rounded-full font-medium"
              style={{ backgroundColor: "#E8C88A", color: "#7A4A0A" }}
            >
              {Math.round(state.fertileWindow.confidence * 100)}% confidence
            </span>
          </div>
          <p className="text-sm mb-1" style={{ color: "#7A4A0A" }}>
            {fmt(state.fertileWindow.start, { month: "short", day: "numeric" })} &ndash;{" "}
            {fmt(state.fertileWindow.end, { month: "short", day: "numeric" })}
            <span className="opacity-70">
              {" "}&middot; ovulation ~{fmt(state.fertileWindow.ovulationDate, { month: "short", day: "numeric" })}
            </span>
          </p>
          <p className="text-xs mt-2" style={{ color: "#7A4A0A", opacity: 0.7 }}>
            This is a calendar-method estimate, not contraception.
            Consult a clinician for medical decisions.
          </p>
        </div>
      )}

      {/* Upcoming Periods */}
      <div className="bg-card rounded-2xl border border-border p-6">
        <h2 className="font-serif text-xl font-semibold mb-4 text-foreground">
          Upcoming Periods
        </h2>
        <div className="space-y-3">
          {state.predictions.map((pred, i) => {
            const isNext = i === 0;
            const daysAway = diffDays(pred.start, today);
            return (
              <div
                key={i}
                className={`flex items-center justify-between p-3 rounded-xl ${
                  isNext ? "" : "bg-muted"
                }`}
                style={isNext ? { backgroundColor: PHASES.menstrual.bg } : undefined}
              >
                <div className="flex items-center gap-3">
                  <span className={`text-2xl ${isNext ? "" : "opacity-60"}`}>
                    {PHASES.menstrual.emoji}
                  </span>
                  <div>
                    <p
                      className={`text-sm ${isNext ? "font-semibold" : "font-medium text-foreground"}`}
                      style={isNext ? { color: PHASES.menstrual.text } : undefined}
                    >
                      {fmt(pred.start, { month: "long", day: "numeric" })}
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
                        {isNext ? "Next period" : `Cycle ${pred.cycleNumber}`}
                        {" "}&middot; {isNext ? "in" : "predicted \u00b7 in"}{" "}
                        {daysAway} days
                      </span>
                    </p>
                  </div>
                </div>
                {isNext && (
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{
                      backgroundColor: PHASES.menstrual.border,
                      color: PHASES.menstrual.text,
                    }}
                  >
                    Soon
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
