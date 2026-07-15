import type { PhaseName } from "@/domain/types";
import { PHASES, PHASE_ORDER, getPhaseLengths, anchorsFrom } from "@/domain/phases";

interface PhaseProgressBarProps {
  currentPhase: PhaseName;
  avgLength: number;
  avgPeriodLength: number;
  phaseTextColor: string;
  height?: string;
  showLabels?: boolean;
}

export function PhaseProgressBar({
  currentPhase,
  avgLength,
  avgPeriodLength,
  phaseTextColor,
  height = "h-1.5",
  showLabels = true,
}: PhaseProgressBarProps) {
  // Widths come from the single phase oracle (M1.3) — the same segments the
  // partner view shows, so the two bars can never disagree again.
  const phaseLengths = getPhaseLengths(anchorsFrom(avgLength, avgPeriodLength));

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
