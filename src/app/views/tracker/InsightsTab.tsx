import { useState, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Cycle, DailyLog, PhaseData, PhaseName, PredictedCycle } from "@/domain/types";
import { PHASES, PHASE_ORDER, anchorsFrom, getPhaseLengths, getPhaseRangeLabel } from "@/domain/phases";
import { diffDays, parseDate, toDateKey } from "@/domain/dates";
import { analyzeSymptomPatterns, getVariabilityLabel } from "@/domain/cycle";
import {
  cycleStats,
  moodByPhase,
  mostLoggedSymptoms,
  predictionBasis,
  type CycleStats,
  type PredictionBasis,
} from "@/domain/insights";
import { fmt } from "@/app/lib/format";
import { Button } from "@/app/components/ui/Button";

export interface InsightsTabProps {
  phaseData: PhaseData;
  cycles: Cycle[];
  avgLength: number;
  avgPeriodLength: number;
  cycleDay: number;
  stdDev: number;
  logs: DailyLog[];
  predictions: PredictedCycle[];
  excludedStarts: Set<string>;
  onToggleExcluded: (periodStart: string) => void;
}

const MAX_BARS = 12; // about a year of cycles fits a phone-width chart
const LOG_ROWS = 6;

const days = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;
const short = (d: Date) => fmt(d, { month: "short", day: "numeric" });
const dated = (d: Date) => fmt(d, { month: "short", day: "numeric", year: "numeric" });

const CONFIDENCE = { early: "Early estimate", building: "Building accuracy", good: "Good accuracy" };

/** One screen for "how regular am I, and what comes next" (replaces History + Predictions). */
export function InsightsTab({
  phaseData,
  cycles,
  avgLength,
  avgPeriodLength,
  cycleDay,
  stdDev,
  logs,
  predictions,
  onToggleExcluded,
}: InsightsTabProps) {
  const stats = cycleStats(cycles);
  const hasCycles = cycles.length > 0;
  return (
    <div className="mx-auto w-full max-w-[1100px]">
      <h1 className="text-3xl">Insights</h1>
      <div className="mt-6 grid items-start gap-6 lg:grid-cols-2">
        <div className="grid gap-6">
          <CycleLengthCard cycles={cycles} stats={stats} color={phaseData.color} />
          {hasCycles && <CycleLog cycles={cycles} cycleDay={cycleDay} onToggleExcluded={onToggleExcluded} />}
        </div>
        <div className="grid gap-6">
          {hasCycles && (
            <NextCycles
              predictions={predictions}
              basis={predictionBasis({ cycles, avgCycleLength: avgLength, stdDev })}
              avgLength={avgLength}
              avgPeriodLength={avgPeriodLength}
            />
          )}
          <Symptoms logs={logs} cycles={cycles} avgLength={avgLength} avgPeriodLength={avgPeriodLength} />
          <Moods logs={logs} cycles={cycles} avgLength={avgLength} avgPeriodLength={avgPeriodLength} />
        </div>
      </div>
    </div>
  );
}

function Card({ title, sub, children }: { title: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <h2>{title}</h2>
      {sub ? <p className="mt-1 text-sm text-muted-foreground">{sub}</p> : null}
      {children}
    </section>
  );
}

/** "How regular am I?" — the measured average leads, the chart and the figures explain it. */
function CycleLengthCard({ cycles, stats, color }: { cycles: Cycle[]; stats: CycleStats; color: string }) {
  if (!cycles.length) {
    return (
      <Card title="Cycle length">
        <p className="mt-3">
          Log a period to begin. When the next one starts, that cycle&apos;s length shows here. After a few
          cycles you&apos;ll see how regular they are and when the next ones are likely.
        </p>
      </Card>
    );
  }
  const { counted, excluded, avgCycleLength } = stats;
  const variability = getVariabilityLabel(stats.stdDev);
  const finding =
    counted >= 2
      ? stats.shortest === stats.longest
        ? `${variability}: your last ${stats.window} cycles were all ${days(stats.shortest!)}.`
        : `${variability}: your last ${stats.window} cycles ran ${stats.shortest} to ${days(stats.longest!)}.`
      : counted === 1
        ? "From one cycle. How regular your cycles are shows once a second one completes."
        : excluded > 0
          ? "Every completed cycle is excluded, so there's no average. Include one below to see it."
          : "Your first cycle length shows here when your next period starts.";
  const period =
    stats.avgPeriodLength === null
      ? null
      : stats.shortestPeriod !== null && stats.shortestPeriod !== stats.longestPeriod
        ? `${days(stats.avgPeriodLength)} on average, ${stats.shortestPeriod} to ${stats.longestPeriod}`
        : `${days(stats.avgPeriodLength)} on average`;

  return (
    <Card title="Cycle length">
      {avgCycleLength !== null && (
        <p className="mt-3 flex items-baseline gap-2">
          <span className="font-display text-5xl leading-none font-semibold tabular-nums lining-nums">{avgCycleLength}</span>
          <span className="text-muted-foreground">days on average</span>
        </p>
      )}
      <p className="mt-2">{finding}</p>
      {cycles.filter((c) => c.cycleLength !== null).length >= 2 && (
        <LengthChart cycles={cycles} avg={avgCycleLength} color={color} />
      )}
      <dl className="mt-5 divide-y divide-border border-t border-border text-sm">
        {period && <Row label="Period length" value={period} />}
        <Row label="Cycles counted" value={excluded ? `${counted}, ${excluded} excluded` : String(counted)} />
        <Row label="Predictions" value={CONFIDENCE[stats.confidence]} />
      </dl>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

interface BarDatum {
  key: string;
  label: string;
  from: string;
  days: number;
  excluded: boolean;
}

/** One bar per completed cycle; excluded ones faded; the dashed line is the average. */
function LengthChart({ cycles, avg, color }: { cycles: Cycle[]; avg: number | null; color: string }) {
  const data: BarDatum[] = cycles
    .filter((c) => c.cycleLength !== null)
    .slice(-MAX_BARS)
    .map((c) => ({
      key: c.periodStart,
      label: short(parseDate(c.periodStart)),
      from: dated(parseDate(c.periodStart)),
      days: c.cycleLength as number,
      excluded: c.excluded,
    }));
  // Zero baseline (bar length is the value); round steps with the top tick above the longest cycle.
  const max = Math.max(...data.map((d) => d.days));
  const step = max < 50 ? 10 : max < 100 ? 20 : 50;
  const ticks = Array.from({ length: Math.ceil((max * 1.1) / step) + 1 }, (_, i) => i * step); // >= 10% headroom
  const anyExcluded = data.some((d) => d.excluded);

  return (
    <figure className="mt-5">
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 52, bottom: 0, left: 0 }} barCategoryGap="22%" accessibilityLayer>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 13, fill: "var(--muted-foreground)" }}
              interval="preserveStartEnd"
              minTickGap={12}
            />
            <YAxis
              domain={[0, ticks[ticks.length - 1]]}
              ticks={ticks}
              width={32}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 13, fill: "var(--muted-foreground)" }}
            />
            <Tooltip
              cursor={{ fill: "var(--muted)" }}
              isAnimationActive={false}
              content={({ active, payload }) => {
                const d = active ? (payload?.[0]?.payload as BarDatum | undefined) : undefined;
                if (!d) return null;
                return (
                  <div className="rounded-xl border border-border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-soft">
                    <p className="font-semibold tabular-nums">{days(d.days)}</p>
                    <p className="text-muted-foreground">
                      From {d.from}
                      {d.excluded ? ", not counted" : ""}
                    </p>
                  </div>
                );
              }}
            />
            {avg !== null && (
              <ReferenceLine
                y={avg}
                stroke="var(--muted-foreground)"
                strokeDasharray="4 3"
                label={{ value: `Avg ${avg}`, position: "right", fill: "var(--muted-foreground)", fontSize: 13 }}
              />
            )}
            <Bar dataKey="days" maxBarSize={24} radius={[6, 6, 0, 0]} isAnimationActive={false}>
              {data.map((d) => (
                <Cell
                  key={d.key}
                  fill={d.excluded ? "var(--muted-foreground)" : color}
                  fillOpacity={d.excluded ? 0.35 : 1}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {anyExcluded && (
        <figcaption className="mt-2 flex gap-4 text-sm text-muted-foreground">
          <Swatch style={{ backgroundColor: color }} label="Counted" />
          <Swatch style={{ backgroundColor: "var(--muted-foreground)", opacity: 0.35 }} label="Excluded" />
        </figcaption>
      )}
    </figure>
  );
}

function Swatch({ style, label }: { style: React.CSSProperties; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="size-2.5 rounded-sm" style={style} aria-hidden="true" />
      {label}
    </span>
  );
}

/** "Which cycles count?" — the chart's table, and where a cycle is excluded or included. */
function CycleLog({
  cycles,
  cycleDay,
  onToggleExcluded,
}: {
  cycles: Cycle[];
  cycleDay: number;
  onToggleExcluded: (periodStart: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const rows = [...cycles].reverse();
  return (
    <Card
      title="Your cycles"
      sub="Exclude a cycle that wasn't typical for you, like one after an illness or a missed log. It stays listed but stops counting toward your averages and predictions."
    >
      <ul className="mt-4 divide-y divide-border">
        {(showAll ? rows : rows.slice(0, LOG_ROWS)).map((c) => {
          const start = dated(parseDate(c.periodStart));
          return (
            <li key={c.periodStart} className="flex min-h-16 items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className={c.excluded ? "font-medium text-muted-foreground" : "font-medium"}>{start}</p>
                <p className="text-sm text-muted-foreground">
                  {c.cycleLength === null
                    ? `Day ${cycleDay}, in progress`
                    : `${c.excluded ? "Not counted · " : ""}${c.cycleLength}-day cycle · ${c.periodLength}-day period`}
                </p>
              </div>
              {c.cycleLength !== null && (
                <Button
                  variant="ghost"
                  className="-mr-3 shrink-0"
                  aria-label={`${c.excluded ? "Include" : "Exclude"} the cycle from ${start}`}
                  onClick={() => onToggleExcluded(c.periodStart)}
                >
                  {c.excluded ? "Include" : "Exclude"}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {rows.length > LOG_ROWS && (
        <Button variant="outline" className="mt-2 w-full" aria-expanded={showAll} onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Show fewer" : `Show all ${rows.length} cycles`}
        </Button>
      )}
    </Card>
  );
}

/** "When are the next ones?" — estimates, with how far each can move. */
function NextCycles({
  predictions,
  basis,
  avgLength,
  avgPeriodLength,
}: {
  predictions: PredictedCycle[];
  basis: PredictionBasis;
  avgLength: number;
  avgPeriodLength: number;
}) {
  if (basis.from === "firstPeriod") {
    return (
      <Card title="Next 3 cycles">
        <p className="mt-3">Your next periods are estimated here once a cycle completes.</p>
      </Card>
    );
  }
  const today = parseDate(toDateKey(new Date()));
  const anchors = anchorsFrom(avgLength, avgPeriodLength);
  const lengths = getPhaseLengths(anchors);
  const sub =
    basis.from === "setting"
      ? `Estimates from the ${avgLength}-day cycle length you set.`
      : basis.from === "allExcluded"
        ? `All your cycles are excluded, so these estimates use a typical ${avgLength}-day cycle.`
        : basis.cycles === 1
          ? "Rough estimates from your one completed cycle. They firm up as more cycles complete."
          : `Estimates from your ${avgLength}-day average. Each date can move by the days shown.`;
  return (
    <Card title="Next 3 cycles" sub={sub}>
      <ul className="mt-4 divide-y divide-border">
        {predictions.slice(0, 3).map((p) => {
          const until = diffDays(p.start, today);
          return (
            <li key={p.start.getTime()} className="flex items-center justify-between gap-4 py-3">
              <div>
                <p className="font-display text-xl font-semibold">{short(p.start)}</p>
                <p className="text-sm text-muted-foreground">
                  {until > 0 ? `Period in ${days(until)}` : until === 0 ? "Period due today" : `Period was due ${days(-until)} ago`}
                </p>
              </div>
              {p.uncertainty > 0 && <p className="text-sm text-muted-foreground tabular-nums">± {days(p.uncertainty)}</p>}
            </li>
          );
        })}
      </ul>
      <h3 className="mt-5 text-lg">Each cycle, by phase</h3>
      <div className="mt-3 flex h-3 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
        {PHASE_ORDER.map((p) =>
          lengths[p] > 0 ? (
            <span key={p} style={{ flex: `${lengths[p]} 1 0`, backgroundColor: PHASES[p].color }} />
          ) : null
        )}
      </div>
      <ul className="mt-3 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
        {PHASE_ORDER.map((p) => (
          <li key={p} className="flex items-center gap-2">
            <Dot phase={p} />
            <span>{PHASES[p].name}</span>
            <span className="text-muted-foreground">{getPhaseRangeLabel(p, anchors)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Dot({ phase }: { phase: PhaseName }) {
  return <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: PHASES[phase].color }} aria-hidden="true" />;
}

interface PatternProps {
  logs: DailyLog[];
  cycles: Cycle[];
  avgLength: number;
  avgPeriodLength: number;
}

/** "What do I log most, and when does it come up?" */
function Symptoms({ logs, cycles, avgLength, avgPeriodLength }: PatternProps) {
  const top = mostLoggedSymptoms(logs);
  const most = top[0]?.days ?? 1;
  const byPhase = new Map(
    analyzeSymptomPatterns(logs, cycles, avgLength, avgPeriodLength).map((s) => [s.symptom, s.byPhase])
  );
  if (!top.length) {
    return (
      <Card title="Symptoms">
        <p className="mt-3">Log symptoms on a few days and they show here, most frequent first.</p>
      </Card>
    );
  }
  return (
    <Card
      title="Symptoms"
      sub={cycles.length ? "Most logged first. Each bar is split by the phase they came up in." : "Most logged first."}
    >
      <ul className="mt-4 space-y-4">
        {top.map((s) => {
          const split = byPhase.get(s.label);
          const parts = split ? PHASE_ORDER.filter((p) => split[p] > 0) : [];
          return (
            <li key={s.label}>
              <p className="flex justify-between gap-3">
                <span>{s.label}</span>
                <span className="text-sm text-muted-foreground tabular-nums">{days(s.days)}</span>
              </p>
              {parts.length > 0 && (
                <div
                  role="img"
                  aria-label={parts.map((p) => `${PHASES[p].name} ${days(split![p])}`).join(", ")}
                  className="mt-1.5 flex h-2 gap-0.5 overflow-hidden rounded-full"
                  style={{ width: `${(s.days / most) * 100}%` }}
                >
                  {parts.map((p) => (
                    <span
                      key={p}
                      title={`${PHASES[p].name}: ${days(split![p])}`}
                      style={{ flex: `${split![p]} 1 0`, backgroundColor: PHASES[p].color }}
                    />
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {cycles.length > 0 && (
        <ul className="mt-5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {PHASE_ORDER.map((p) => (
            <li key={p} className="flex items-center gap-1.5">
              <Dot phase={p} />
              {PHASES[p].name}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** "How do I tend to feel in each phase?" */
function Moods({ logs, cycles, avgLength, avgPeriodLength }: PatternProps) {
  const byPhase = moodByPhase(logs, cycles, avgLength, avgPeriodLength);
  if (PHASE_ORDER.every((p) => byPhase[p].length === 0)) {
    return (
      <Card title="Mood by phase">
        <p className="mt-3">
          {cycles.length
            ? "Log your mood on a few days and this shows how it tends to change through your cycle."
            : "Log a period and your mood on a few days, and this shows how your mood tends to change through your cycle."}
        </p>
      </Card>
    );
  }
  return (
    <Card title="Mood by phase" sub="The moods you logged most in each phase.">
      <ul className="mt-4 divide-y divide-border">
        {PHASE_ORDER.map((p) => (
          <li key={p} data-phase={p} className="grid gap-2 py-3 sm:grid-cols-[7rem_1fr] sm:items-center sm:gap-3">
            <span className="flex items-center gap-2">
              <Dot phase={p} />
              {PHASES[p].name}
            </span>
            {byPhase[p].length ? (
              <span className="flex flex-wrap gap-1.5">
                {byPhase[p].map((m) => (
                  <span key={m.label} className="inline-flex items-center gap-1.5 rounded-full bg-phase-tint px-3 py-1 text-sm text-phase-ink">
                    {m.label}
                    <span className="font-semibold tabular-nums" aria-label={days(m.days)}>
                      {m.days}
                    </span>
                  </span>
                ))}
              </span>
            ) : (
              <span className="text-sm text-muted-foreground">None logged</span>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
