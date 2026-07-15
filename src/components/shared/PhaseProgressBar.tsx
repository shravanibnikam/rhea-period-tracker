import type { PhaseName } from "@/types";
import { PHASES, PHASE_ORDER } from "@/lib/phases";
import { getPhaseLengths } from "@/lib/utils";

interface PhaseProgressBarProps {
  currentPhase: PhaseName;
  avgLength: number;
  phaseTextColor: string;
  height?: string;
  showLabels?: boolean;
}

export function PhaseProgressBar({
  currentPhase,
  avgLength,
  phaseTextColor,
  height = "h-1.5",
  showLabels = true,
}: PhaseProgressBarProps) {
  const phaseLengths = getPhaseLengths(avgLength);

  return (
    <div>
      <div className={`flex ${height} rounded-full overflow-hidden gap-0.5`}>
        {PHASE_ORDER.map((p) => {
          const len = phaseLengths[p];
          const pct = (len / avgLength) * 100;
          return (
            <div
              key={p}
              className="h-full rounded-full"
              style={{
                width: `${pct}%`,
                backgroundColor: PHASES[p].color,
                opacity: p === currentPhase ? 1 : 0.3,
              }}
            />
          );
        })}
      </div>
      {showLabels && (
        <div className="flex justify-between mt-1">
          {PHASE_ORDER.map((p) => (
            <span
              key={p}
              className="text-xs"
              style={{
                color: phaseTextColor,
                opacity: p === currentPhase ? 0.9 : 0.4,
              }}
            >
              {PHASES[p].shortName}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
