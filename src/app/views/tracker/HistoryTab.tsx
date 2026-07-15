import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from "recharts";
import type { PhaseData, DailyLog, Cycle } from "@/domain/types";
import { PHASES } from "@/domain/phases";
import { fmt } from "@/app/lib/format";
import { parseDate } from "@/domain/dates";
import { analyzeSymptomPatterns, getVariabilityLabel } from "@/domain/cycle";

interface HistoryTabProps {
  phaseData: PhaseData;
  /** Derived domain cycles (M1.3 — replaced the LegacyCycleEntry bridge). */
  cycles: Cycle[];
  avgLength: number;
  cycleDay: number;
  excludedStarts?: Set<string>;
  onToggleExcluded?: (periodStart: string) => void;
  stdDev?: number;
  logs?: DailyLog[];
  avgPeriodLength?: number;
}

export function HistoryTab({
  phaseData,
  cycles,
  avgLength,
  cycleDay,
  excludedStarts = new Set(),
  onToggleExcluded,
  stdDev = 0,
  logs = [],
  avgPeriodLength = 5,
}: HistoryTabProps) {
  const completedCycles = cycles.filter((c) => c.cycleLength !== null);

  const chartData = completedCycles.map((c) => ({
    name: parseDate(c.periodStart).toLocaleDateString("en-US", {
      month: "short",
      year: "2-digit",
    }),
    days: c.cycleLength,
    excluded: excludedStarts.has(c.periodStart),
  }));

  const variabilityLabel = getVariabilityLabel(stdDev);
  const symptomPatterns = analyzeSymptomPatterns(logs, cycles, avgLength, avgPeriodLength);

  return (
    <div className="space-y-5">
      <div className="bg-card rounded-2xl border border-border p-6">
        <h2 className="font-serif text-xl font-semibold mb-1 text-foreground">
          Cycle Length History
        </h2>
        <div className="flex items-center gap-2 mb-5">
          <p className="text-xs text-muted-foreground">
            Average: {avgLength} days &middot; {completedCycles.length} cycles tracked
          </p>
          {completedCycles.length >= 2 && (
            <span
              className="text-xs px-2 py-0.5 rounded-full"
              style={{
                backgroundColor: phaseData.bg,
                color: phaseData.text,
                border: `1px solid ${phaseData.border}`,
              }}
            >
              {variabilityLabel}
            </span>
          )}
        </div>
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} barSize={32} barCategoryGap="30%">
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--border)"
                vertical={false}
              />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={[24, 34]}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: "10px",
                  fontSize: "12px",
                }}
                formatter={(v: number) => [`${v} days`, "Cycle Length"]}
              />
              <Bar dataKey="days" radius={[5, 5, 0, 0]}>
                {chartData.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={phaseData.color}
                    opacity={entry.excluded ? 0.2 : i === chartData.length - 1 ? 0.4 : 1}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-border p-6">
        <h2 className="font-serif text-xl font-semibold mb-4 text-foreground">
          Cycle Log
        </h2>
        <div className="space-y-0">
          {[...cycles].reverse().map((c, i) => {
            const isCurrent = i === 0;
            const start = parseDate(c.periodStart);
            const isExcluded = excludedStarts.has(c.periodStart);
            return (
              <div
                key={c.periodStart}
                className={`flex items-center justify-between py-3.5 border-b border-border last:border-0 ${
                  isExcluded ? "opacity-50" : ""
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-1.5 h-8 rounded-full flex-shrink-0"
                    style={{ backgroundColor: PHASES.menstrual.border }}
                  />
                  <div>
                    <p className="text-sm font-medium text-foreground flex items-center gap-2">
                      {fmt(start, {
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      })}
                      {isCurrent && (
                        <span
                          className="text-xs px-2 py-0.5 rounded-full"
                          style={{
                            backgroundColor: phaseData.bg,
                            color: phaseData.text,
                          }}
                        >
                          Current
                        </span>
                      )}
                      {isExcluded && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                          Excluded
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {c.cycleLength
                        ? `${c.cycleLength} days \u00b7 ${c.periodLength}-day period`
                        : `Day ${cycleDay} \u00b7 ongoing`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {c.cycleLength && (
                    <span className="font-serif text-xl font-bold text-foreground opacity-40">
                      {c.cycleLength}
                    </span>
                  )}
                  {onToggleExcluded && c.cycleLength && (
                    <button
                      onClick={() => onToggleExcluded(c.periodStart)}
                      className="text-xs px-2 py-1 rounded-lg border border-border hover:bg-muted transition-colors text-muted-foreground"
                      title={isExcluded ? "Include in predictions" : "Exclude from predictions"}
                    >
                      {isExcluded ? "Include" : "Exclude"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Symptom Patterns */}
      {symptomPatterns.length > 0 && (
        <div className="bg-card rounded-2xl border border-border p-6">
          <h2 className="font-serif text-xl font-semibold mb-1 text-foreground">
            Symptom Patterns
          </h2>
          <p className="text-xs text-muted-foreground mb-4">
            Which symptoms show up most, and when in your cycle.
          </p>
          <div className="space-y-3">
            {symptomPatterns.slice(0, 8).map((sp) => {
              const total = sp.totalCount;
              return (
                <div key={sp.symptom} className="flex items-center gap-3">
                  <p className="text-sm text-foreground w-28 flex-shrink-0 truncate">
                    {sp.symptom}
                  </p>
                  <div className="flex-1 flex h-4 rounded-full overflow-hidden gap-px">
                    {(["menstrual", "follicular", "ovulation", "luteal"] as const).map((phase) => {
                      const count = sp.byPhase[phase];
                      if (count === 0) return null;
                      const pct = (count / total) * 100;
                      return (
                        <div
                          key={phase}
                          className="h-full"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: PHASES[phase].color,
                            minWidth: "4px",
                          }}
                          title={`${PHASES[phase].name}: ${count} times`}
                        />
                      );
                    })}
                  </div>
                  <span className="text-xs text-muted-foreground w-6 text-right flex-shrink-0">
                    {total}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="mt-4 pt-3 border-t border-border flex flex-wrap gap-x-4 gap-y-1">
            {(["menstrual", "follicular", "ovulation", "luteal"] as const).map((p) => (
              <div key={p} className="flex items-center gap-1.5">
                <div
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: PHASES[p].color }}
                />
                <span className="text-xs text-muted-foreground">{PHASES[p].name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
