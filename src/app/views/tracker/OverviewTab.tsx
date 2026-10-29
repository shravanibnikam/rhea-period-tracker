import { useState } from "react";
import { toast } from "sonner";
import { CalendarPlus, Droplet, PenLine } from "lucide-react";
import type { CycleState, FlowLevel, PhaseData } from "@/domain/types";
import { anchorsFrom, getPhaseRangeLabel } from "@/domain/phases";
import { ALL_SYMPTOMS } from "@/app/lib/constants";
import { fmt } from "@/app/lib/format";
import { cn } from "@/app/lib/cn";
import { CycleRing } from "@/app/components/shared/CycleRing";
import { EnergyBar } from "@/app/components/shared/EnergyBar";
import { Button } from "@/app/components/ui/Button";
import { Chip } from "@/app/components/ui/controls";
import { daysFrom, fmtSpan, inDays } from "./dateText";

interface OverviewTabProps {
  phaseData: PhaseData;
  state: CycleState;
  symptoms: Set<string>;
  toggleSymptom: (s: string) => void;
  /**
   * Shown under the symptom toggles: a toggle that could not be saved (it is
   * undone), or today's saved log that could not be read.
   */
  symptomError?: string | null;
  today: Date;
  /** Open the Log sheet on today. */
  onLogToday?: () => void;
  /** Open QuickAddPeriod. */
  onAddPeriod?: () => void;
  /**
   * Save today's flow through the single write path (M1.3); must reject on
   * failure. Offered only when today has no flow and the period is due within
   * 3 days or late.
   */
  onPeriodStarted?: () => Promise<void>;
  /** Today's stored flow ("none" when nothing is logged). */
  todayFlow?: FlowLevel;
}

const CARD = "rounded-2xl border border-border bg-card p-5 sm:p-6";
const LONG: Intl.DateTimeFormatOptions = { weekday: "long", month: "long", day: "numeric" };
const DATE: Intl.DateTimeFormatOptions = { month: "long", day: "numeric" };
const CONFIDENCE = { early: "Early estimate", building: "Building accuracy", good: "Good accuracy" } as const;
const ENERGY = ["", "Very low", "Low", "Moderate", "High", "Peak"];
const days = (n: number) => (n === 1 ? "day" : "days");

/** The Today screen: where you are in the cycle, what's next, and today's log. */
export function OverviewTab({
  phaseData,
  state,
  symptoms,
  toggleSymptom,
  symptomError = null,
  today,
  onLogToday,
  onAddPeriod,
  onPeriodStarted,
  todayFlow = "none",
}: OverviewTabProps) {
  const next = state.cycles.length > 0 ? state.nextPeriodDate : null;
  // Calendar days to the predicted date, so the figure always agrees with the
  // date beside it (CycleState.daysUntilPeriod counts to the cycle's last day).
  const toNext = next ? daysFrom(today, next) : 0;
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const offerStart = !!onPeriodStarted && next !== null && todayFlow === "none" && toNext <= 3;

  const periodStarted = async () => {
    setStarting(true);
    setStartError(null);
    try {
      await onPeriodStarted?.();
      toast("Period logged for today");
    } catch (err) {
      console.error("Failed to log the period start:", err);
      setStartError("Couldn't log your period. Nothing was saved, please try again.");
    } finally {
      // The save has refreshed the logs by now (onSaved runs before it
      // resolves), so the action goes away; if today's flow is later set back
      // to none, it returns ready to use.
      setStarting(false);
    }
  };

  return (
    <div>
      <h1 className="text-3xl">Today</h1>
      <p className="mt-1 text-base text-muted-foreground">{fmt(today, LONG)}</p>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-12">
        <div className={cn("grid gap-6", next ? "lg:col-span-7" : "lg:col-span-12")}>
          <section aria-labelledby="today-cycle" className={CARD}>
            {next ? (
              <div className="flex flex-col items-center gap-6 sm:flex-row sm:gap-8">
                <CycleRing
                  avgLength={state.avgCycleLength}
                  avgPeriodLength={state.avgPeriodLength}
                  cycleDay={state.cycleDay}
                  size={232}
                  className="shrink-0"
                >
                  {/* One run of text nodes, "Day N of M", which specs read whole; the
                      first line is the figure. font-display on the <p> gives it the
                      x-height match and lining figures, which ::first-line inherits. */}
                  <p className="font-display text-lg leading-snug tabular-nums lining-nums text-muted-foreground first-line:text-5xl first-line:leading-[1.3] first-line:font-semibold first-line:text-foreground">
                    Day {state.cycleDay} <br />
                    of {state.avgCycleLength}
                  </p>
                </CycleRing>
                <div className="w-full min-w-0 text-center sm:text-left">
                  <h2 id="today-cycle" className="text-2xl text-phase-ink">
                    {phaseData.name} phase
                  </h2>
                  <p className="mt-1 text-base text-muted-foreground">{phaseData.tagline}</p>
                  <p className="mt-6 text-sm text-muted-foreground">Next period</p>
                  <p className="mt-1 font-display text-4xl leading-none font-semibold tabular-nums lining-nums">
                    {toNext < 0 ? (
                      "May be late"
                    ) : toNext === 0 ? (
                      "Today"
                    ) : (
                      <>
                        {toNext}
                        <span className="ml-1.5 font-sans text-base font-normal text-muted-foreground">{days(toNext)}</span>
                      </>
                    )}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {toNext < 0
                      ? `Expected ${fmt(next, DATE)}, ${inDays(toNext)}`
                      : `${toNext === 0 ? "Expected today" : `Around ${fmt(next, DATE)}`}${uncertainty(state)}`}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">{confidence(state)}</p>
                </div>
              </div>
            ) : (
              <>
                <h2 id="today-cycle" className="text-2xl">No period logged yet</h2>
                <p className="mt-2 max-w-prose text-base text-muted-foreground">
                  Add your last period, or log one when it starts, to see your cycle day, your next
                  period and your fertile window.
                </p>
              </>
            )}
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Button size="lg" onClick={onLogToday}>
                <PenLine size={18} aria-hidden="true" />
                Log today
              </Button>
              <Button size="lg" variant="outline" onClick={onAddPeriod}>
                <CalendarPlus size={18} aria-hidden="true" />
                Add a past period
              </Button>
              {offerStart && (
                <Button
                  size="lg"
                  variant="secondary"
                  disabled={starting}
                  onClick={periodStarted}
                  className="bg-menstrual-tint text-menstrual-ink hover:bg-menstrual-tint/70"
                >
                  <Droplet size={18} aria-hidden="true" />
                  {starting ? "Saving…" : "My period started today"}
                </Button>
              )}
            </div>
            {startError && (
              <p role="alert" className="mt-3 text-sm text-destructive">
                {startError}
              </p>
            )}
          </section>

          <section aria-labelledby="today-symptoms" className={CARD}>
            <div className="flex items-baseline justify-between gap-4">
              <h2 id="today-symptoms" className="text-xl">
                Today&apos;s symptoms
              </h2>
              <p className="shrink-0 text-sm tabular-nums text-muted-foreground">{symptoms.size} tracked today</p>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {ALL_SYMPTOMS.map((s) => (
                <Chip key={s} selected={symptoms.has(s)} onClick={() => toggleSymptom(s)}>
                  {s}
                </Chip>
              ))}
            </div>
            {symptomError && (
              <p role="alert" className="mt-3 text-sm text-destructive">
                {symptomError}
              </p>
            )}
          </section>
        </div>

        {next && (
          <div className="grid gap-6 lg:col-span-5">
            <ComingUp state={state} today={today} />
            <PhaseCard phaseData={phaseData} state={state} />
          </div>
        )}
      </div>
    </div>
  );
}

function uncertainty(state: CycleState): string {
  const u = state.predictions[0]?.uncertainty ?? 0;
  return u > 0 ? `, give or take ${u} ${days(u)}` : "";
}

function confidence(state: CycleState): string {
  const complete = state.cycles.filter((c) => c.cycleLength !== null && !c.excluded).length;
  const basis = complete === 0 ? "your first logged period" : `${complete} complete ${complete === 1 ? "cycle" : "cycles"}`;
  return `${CONFIDENCE[state.confidence]}, from ${basis}`;
}

function ComingUp({ state, today }: { state: CycleState; today: Date }) {
  const fw = state.fertileWindow;
  // Only a window that is still running or ahead; a past one is history.
  const fertile = fw && daysFrom(today, fw.end) >= 0 ? fw : null;
  const toFertile = fertile ? daysFrom(today, fertile.start) : 0;
  return (
    <section aria-labelledby="coming-up" className={CARD}>
      <h2 id="coming-up" className="text-xl">
        Coming up
      </h2>
      {fertile && (
        <div data-phase="ovulation" className="mt-4 rounded-xl bg-phase-tint p-4 text-phase-ink">
          <p className="font-semibold">
            {toFertile <= 0 ? "Fertile window now" : `Fertile window ${inDays(toFertile)}`}
          </p>
          <p className="mt-1 text-sm">
            {fmtSpan(fertile.start, fertile.end)}, ovulation around {fmt(fertile.ovulationDate)}
          </p>
          <p className="mt-1 text-sm">A calendar estimate, not contraception.</p>
        </div>
      )}
      <ul className="mt-2">
        {state.predictions.slice(1, 4).map((p) => (
          <li key={p.cycleNumber} className="flex items-center gap-3 border-b border-border py-3 last:border-0">
            <div className="min-w-0 flex-1">
              <p className="text-base">{fmt(p.start, DATE)}</p>
              <p className="text-sm text-muted-foreground">
                Period, predicted{p.uncertainty > 0 ? `, give or take ${p.uncertainty} ${days(p.uncertainty)}` : ""}
              </p>
            </div>
            <p className="shrink-0 text-sm tabular-nums text-muted-foreground">{inDays(daysFrom(today, p.start))}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PhaseCard({ phaseData, state }: { phaseData: PhaseData; state: CycleState }) {
  const range = getPhaseRangeLabel(state.phase, anchorsFrom(state.avgCycleLength, state.avgPeriodLength));
  return (
    <section aria-labelledby="phase-card" className={CARD}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="phase-card" className="text-xl">
          What&apos;s happening
        </h2>
        <p className="shrink-0 text-sm text-muted-foreground">{range}</p>
      </div>
      <p className="mt-3 text-base leading-relaxed">{phaseData.description}</p>
      <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 text-sm">
        <dt className="text-muted-foreground">Energy</dt>
        <dd className="flex items-center gap-3">
          <span className="w-20">
            <EnergyBar level={phaseData.energy} color={phaseData.color} />
          </span>
          {ENERGY[phaseData.energy]}
        </dd>
        <dt className="text-muted-foreground">Mood tendency</dt>
        <dd>{phaseData.mood}</dd>
        <dt className="text-muted-foreground">Common signs</dt>
        <dd>{phaseData.symptoms.map((s, i) => (i ? s.toLowerCase() : s)).join(", ")}</dd>
      </dl>
      <h3 className="mt-5 text-lg">Tips</h3>
      <ul className="mt-2 space-y-2 text-sm">
        {phaseData.tips.map((t) => (
          <li key={t} className="flex gap-3">
            <span aria-hidden="true" className="mt-[7px] size-1.5 shrink-0 rounded-full bg-phase" />
            {t}
          </li>
        ))}
      </ul>
      <p className="mt-5 text-sm text-muted-foreground">Typical patterns, not rules. Yours may differ.</p>
    </section>
  );
}
