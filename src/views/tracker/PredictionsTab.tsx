import type { PhaseData, PhaseName, PredictedCycle } from "@/types";
import { PHASES, PHASE_ORDER } from "@/lib/phases";
import { fmt, addDays, getPhaseLengths } from "@/lib/utils";
import { EnergyBar } from "@/components/shared/EnergyBar";

interface PredictionsTabProps {
  phaseData: PhaseData;
  predictions: PredictedCycle[];
  avgLength: number;
}

export function PredictionsTab({
  phaseData,
  predictions,
  avgLength,
}: PredictionsTabProps) {
  const phaseLengths = getPhaseLengths(avgLength);

  return (
    <div className="space-y-5">
      <div className="bg-card rounded-2xl border border-border p-6">
        <h2 className="font-serif text-xl font-semibold mb-1 text-foreground">
          Your Next 3 Cycles
        </h2>
        <p className="text-xs text-muted-foreground mb-6">
          Based on your {avgLength}-day average. Predictions may shift &plusmn;2
          days.
        </p>

        <div className="space-y-5">
          {predictions.map((pred, i) => (
            <div key={i} className="border border-border rounded-2xl p-5">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                    Cycle {pred.cycleNumber}
                  </p>
                  <p className="font-serif text-lg font-semibold text-foreground">
                    {fmt(pred.start, { month: "long", day: "numeric" })} &rarr;{" "}
                    {fmt(pred.end, { month: "long", day: "numeric" })}
                  </p>
                </div>
                <span className="text-xs px-2.5 py-1 bg-muted text-muted-foreground rounded-full">
                  Predicted
                </span>
              </div>

              {/* Phase bar */}
              <div className="flex h-5 rounded-full overflow-hidden gap-px mb-3">
                {PHASE_ORDER.map((p) => {
                  const len = phaseLengths[p];
                  const pct = (len / avgLength) * 100;
                  return (
                    <div
                      key={p}
                      className="h-full flex items-center justify-center"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: PHASES[p].color,
                      }}
                    >
                      {pct > 12 && (
                        <span
                          className="text-white font-medium"
                          style={{ fontSize: "9px" }}
                        >
                          {PHASES[p].shortName}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Phase dates */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {PHASE_ORDER.map((p) => {
                  const startOffset = PHASES[p].cycleStart - 1;
                  const endOffset =
                    p === "luteal" ? avgLength - 1 : PHASES[p].cycleEnd - 1;
                  const pStart = addDays(pred.start, startOffset);
                  const pEnd = addDays(pred.start, endOffset);
                  return (
                    <div
                      key={p}
                      className="text-center p-2.5 rounded-xl"
                      style={{ backgroundColor: PHASES[p].bg }}
                    >
                      <p
                        className="text-xs font-semibold mb-1"
                        style={{ color: PHASES[p].color }}
                      >
                        {PHASES[p].emoji} {PHASES[p].name}
                      </p>
                      <p
                        className="text-xs leading-tight"
                        style={{ color: PHASES[p].text }}
                      >
                        {fmt(pStart, { month: "short", day: "numeric" })} &ndash;{" "}
                        {fmt(pEnd, { month: "short", day: "numeric" })}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Phase reference guide */}
      <div className="bg-card rounded-2xl border border-border p-6">
        <h2 className="font-serif text-xl font-semibold mb-4 text-foreground">
          Phase Reference
        </h2>
        <div className="space-y-2.5">
          {PHASE_ORDER.map((p) => (
            <div
              key={p}
              className="flex items-center gap-4 p-3.5 rounded-xl"
              style={{ backgroundColor: PHASES[p].bg }}
            >
              <span className="text-2xl">{PHASES[p].emoji}</span>
              <div className="flex-1 min-w-0">
                <p
                  className="text-sm font-semibold"
                  style={{ color: PHASES[p].text }}
                >
                  {PHASES[p].name}
                </p>
                <p
                  className="text-xs"
                  style={{ color: PHASES[p].text, opacity: 0.7 }}
                >
                  {PHASES[p].range} &middot; {PHASES[p].tagline}
                </p>
              </div>
              <div className="w-20 flex-shrink-0">
                <EnergyBar level={PHASES[p].energy} color={PHASES[p].color} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
