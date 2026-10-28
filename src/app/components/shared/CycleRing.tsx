import type { ReactNode } from "react";
import type { PhaseName } from "@/domain/types";
import { PHASES, PHASE_ORDER, getPhaseBoundaries, getPhaseForDay, anchorsFrom } from "@/domain/phases";

interface CycleRingProps {
  avgLength: number;
  avgPeriodLength: number;
  /** 1-indexed; past the average (a late period) the marker rests at the end. */
  cycleDay: number;
  /** Rendered px; the ring scales with it. */
  size?: number;
  /** Stroke width in viewBox units (viewBox is 200). */
  thickness?: number;
  /** Centre content (figures, labels). */
  children?: ReactNode;
  className?: string;
}

const C = 100;
const GAP_DEG = 1.6;

function point(r: number, deg: number): [number, number] {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [C + r * Math.cos(rad), C + r * Math.sin(rad)];
}

function arc(r: number, from: number, to: number): string {
  const [x0, y0] = point(r, from);
  const [x1, y1] = point(r, to);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

/**
 * Rhea's signature element: the cycle as a ring of its four phases, sized by
 * the phase oracle (the same boundaries as every other view). Days already
 * lived this cycle are drawn in the phase's mark colour, the rest as a faint
 * track; a marker sits on today.
 */
export function CycleRing({
  avgLength,
  avgPeriodLength,
  cycleDay,
  size = 240,
  thickness = 14,
  children,
  className,
}: CycleRingProps) {
  const anchors = anchorsFrom(avgLength, avgPeriodLength);
  const bounds = getPhaseBoundaries(anchors);
  const r = C - thickness / 2 - 6;
  const day = Math.min(Math.max(cycleDay, 1), avgLength);
  const deg = (d: number) => (d / avgLength) * 360;
  const todayDeg = deg(day - 0.5);
  const todayPhase: PhaseName = getPhaseForDay(day, anchors);
  const [mx, my] = point(r, todayDeg);
  const label = `Cycle day ${cycleDay} of ${avgLength}, ${PHASES[todayPhase].name.toLowerCase()} phase`;

  return (
    <div className={className} style={{ position: "relative", width: size, height: size }}>
      <svg viewBox="0 0 200 200" width={size} height={size} role="img" aria-label={label}>
        {PHASE_ORDER.map((p) => {
          const b = bounds[p];
          if (b.endDay < b.startDay) return null; // a squeezed phase has no width
          const from = deg(b.startDay - 1) + GAP_DEG / 2;
          const to = deg(b.endDay) - GAP_DEG / 2;
          const lived = Math.min(to, todayDeg);
          return (
            <g key={p}>
              <path
                d={arc(r, from, to)}
                fill="none"
                strokeWidth={thickness}
                style={{ stroke: `color-mix(in srgb, var(--${p}) 22%, transparent)` }}
              />
              {lived > from && (
                <path d={arc(r, from, lived)} fill="none" strokeWidth={thickness} style={{ stroke: `var(--${p})` }} />
              )}
            </g>
          );
        })}
        <circle
          cx={mx}
          cy={my}
          r={thickness * 0.78}
          strokeWidth={4}
          style={{ fill: `var(--${todayPhase})`, stroke: "var(--card)" }}
        />
      </svg>
      {children ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
      ) : null}
    </div>
  );
}
