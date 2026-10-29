import { useState, useMemo, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { PhaseName, Cycle, DailyLog, FertileWindow } from "@/domain/types";
import {
  PHASES,
  PHASE_ORDER,
  getPhaseForDay,
  getPhaseRangeLabel,
  getPhaseLengths,
  anchorsFrom,
  type PhaseAnchors,
} from "@/domain/phases";
import { parseDate, addDays, diffDays, toDateKey } from "@/domain/dates";
import { fmt } from "@/app/lib/format";
import { cn } from "@/app/lib/cn";
import { Button } from "@/app/components/ui/Button";
import { daysFrom, fmtSpan } from "./dateText";

interface CalendarTabProps {
  /** Derived domain cycles (M1.3 — replaced the LegacyCycleEntry bridge). */
  cycles: Cycle[];
  avgLength: number;
  avgPeriodLength: number;
  today: Date;
  logs: DailyLog[];
  /** Omitted in read-only mode — a partner has no log sheet to open. */
  onDayClick?: (date: Date) => void;
  fertileWindow?: FertileWindow | null;
  /**
   * Partner mode: the same month view, but no day is tappable. The partner
   * client is read-only end to end (see `setSyncReadOnly`), so surfacing a tap
   * target that could never save anything would just be a dead affordance.
   */
  readOnly?: boolean;
  /**
   * Leave out predicted periods: no predicted cycles after the last logged
   * one and no "Period, predicted" marks. The partner view sets it unless the
   * owner shares the cycle heads-up, which is what governs predictions.
   */
  hidePredictions?: boolean;
}

function getDatePhase(
  date: Date,
  cycles: Cycle[],
  avg: number,
  anchors: PhaseAnchors,
  withPredictions: boolean
): { phase: PhaseName; day: number; predicted: boolean } | null {
  const sorted = [...cycles].sort((a, b) => (a.periodStart < b.periodStart ? -1 : 1));

  for (let i = sorted.length - 1; i >= 0; i--) {
    const start = parseDate(sorted[i].periodStart);
    const len = sorted[i].cycleLength ?? avg;
    const end = addDays(start, len - 1);
    if (date >= start && date <= end) {
      const day = diffDays(date, start) + 1;
      return { phase: getPhaseForDay(day, anchors), day, predicted: false };
    }
  }

  const last = sorted[sorted.length - 1];
  if (!last || !withPredictions) return null;
  let nextStart = addDays(parseDate(last.periodStart), last.cycleLength ?? avg);
  for (let i = 0; i < 6; i++) {
    const end = addDays(nextStart, avg - 1);
    if (date >= nextStart && date <= end) {
      const day = diffDays(date, nextStart) + 1;
      return { phase: getPhaseForDay(day, anchors), day, predicted: true };
    }
    nextStart = addDays(nextStart, avg);
  }

  return null;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
// An explicit background and colour keep the native option list readable in dark mode.
const SELECT =
  "h-11 cursor-pointer rounded-lg bg-card px-1.5 font-display text-xl font-semibold text-foreground hover:bg-muted";

interface Day {
  d: number;
  date: Date;
  info: ReturnType<typeof getDatePhase>;
  isToday: boolean;
  isFuture: boolean;
  hasLog: boolean;
  hasEntry: boolean;
  periodLogged: boolean;
  periodPredicted: boolean;
  isFertile: boolean;
  isOvulation: boolean;
}

/** The key doubles as this month's summary: each mark with the dates it covers. */
const MARKS: { label: string; swatch: string; test: (d: Day) => boolean }[] = [
  { label: "Period, logged", swatch: "size-3.5 rounded-full bg-menstrual", test: (d) => d.periodLogged },
  {
    label: "Period, predicted",
    swatch: "size-3.5 rounded-full border-2 border-dashed border-menstrual",
    test: (d) => d.periodPredicted,
  },
  { label: "Fertile window", swatch: "h-1 w-3.5 rounded-full bg-ovulation", test: (d) => d.isFertile },
  { label: "Ovulation", swatch: "size-2 rounded-full bg-ovulation", test: (d) => d.isOvulation },
  { label: "Today", swatch: "size-3.5 rounded-full ring-[1.5px] ring-inset ring-foreground/70", test: (d) => d.isToday },
];

/** Runs of consecutive days that pass `test`, as "Oct 10–14". */
function spans(days: Day[], test: (d: Day) => boolean): string {
  const runs: [Date, Date][] = [];
  for (const day of days) {
    if (!test(day)) continue;
    const last = runs[runs.length - 1];
    if (last && daysFrom(last[1], day.date) === 1) last[1] = day.date;
    else runs.push([day.date, day.date]);
  }
  return runs.map(([a, b]) => fmtSpan(a, b)).join(", ");
}

/** "Tuesday, October 27, today, luteal phase, logged" — what a sighted reader gets from the cell. */
function dayName(day: Day): string {
  const parts = [fmt(day.date, { weekday: "long", month: "long", day: "numeric" })];
  if (day.isToday) parts.push("today");
  if (day.info) parts.push(`${PHASES[day.info.phase].name.toLowerCase()} phase`);
  if (day.periodLogged) parts.push("period logged");
  else if (day.periodPredicted) parts.push("period predicted");
  else if (day.info?.predicted) parts.push("predicted");
  if (day.isOvulation) parts.push("estimated ovulation");
  else if (day.isFertile) parts.push("fertile window");
  if (day.hasLog && !day.periodLogged) parts.push("logged");
  return parts.join(", ");
}

export function CalendarTab({
  cycles,
  avgLength,
  avgPeriodLength,
  today,
  logs,
  onDayClick,
  fertileWindow,
  readOnly = false,
  hidePredictions = false,
}: CalendarTabProps) {
  const anchors = anchorsFrom(avgLength, avgPeriodLength);
  // A very short cycle squeezes a phase to no days: the legend leaves it out.
  const lengths = getPhaseLengths(anchors);
  const [calMonth, setCalMonth] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1)
  );

  const { loggedDates, flowDates, entryDates } = useMemo(() => {
    // Content-based (the dot), flow (the filled period mark), and every
    // PERSISTED row regardless of content — the last drives tappability of
    // future dates, so an existing future entry (even notes-only) can be
    // opened and deleted while future EMPTY dates stay disabled.
    const logged = new Set<string>();
    const flow = new Set<string>();
    const entry = new Set<string>();
    for (const l of logs) {
      entry.add(l.date);
      if (l.flow !== "none") flow.add(l.date);
      if (l.flow !== "none" || l.symptoms.length > 0 || l.mood || l.energy) logged.add(l.date);
    }
    return { loggedDates: logged, flowDates: flow, entryDates: entry };
  }, [logs]);

  // Years offered by the year selector: a window around today PLUS every year
  // present in logged data (so far-future entries like 2099 are selectable),
  // PLUS the currently-viewed year.
  const years = useMemo(() => {
    const set = new Set<number>();
    const ty = today.getFullYear();
    for (let y = ty - 5; y <= ty + 1; y++) set.add(y);
    for (const l of logs) {
      const y = Number(l.date.slice(0, 4));
      if (Number.isFinite(y)) set.add(y);
    }
    set.add(calMonth.getFullYear());
    return [...set].sort((a, b) => a - b);
  }, [logs, today, calMonth]);

  const calDays = useMemo(() => {
    const daysInMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 0).getDate();
    const firstDay = new Date(calMonth.getFullYear(), calMonth.getMonth(), 1).getDay();
    const days: Day[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(calMonth.getFullYear(), calMonth.getMonth(), d);
      const key = toDateKey(date);
      const info = cycles.length > 0 ? getDatePhase(date, cycles, avgLength, anchors, !hidePredictions) : null;
      const isFuture = date > today;
      const periodLogged = flowDates.has(key);
      days.push({
        d,
        date,
        info,
        isToday: date.toDateString() === today.toDateString(),
        isFuture,
        hasLog: loggedDates.has(key),
        hasEntry: entryDates.has(key),
        periodLogged,
        // Expected bleed days with nothing logged: a predicted cycle's period
        // (past ones too, while a period is late) or the rest of this one's.
        periodPredicted: !hidePredictions && !periodLogged && info?.phase === "menstrual" && (info.predicted || isFuture),
        isFertile: fertileWindow != null && date >= fertileWindow.start && date <= fertileWindow.end,
        isOvulation: fertileWindow != null && date.toDateString() === fertileWindow.ovulationDate.toDateString(),
      });
    }
    return { days, firstDay };
  }, [calMonth, avgLength, avgPeriodLength, today, cycles, loggedDates, flowDates, entryDates, fertileWindow, hidePredictions]);

  const isThisMonth =
    calMonth.getFullYear() === today.getFullYear() && calMonth.getMonth() === today.getMonth();
  const entries = calDays.days.filter((d) => d.hasLog).length;
  const marks = MARKS.map((m) => ({ ...m, value: spans(calDays.days, m.test) })).filter((m) => m.value);

  return (
    <section aria-label="Month calendar" className="@container rounded-2xl border border-border bg-card p-5 sm:p-6">
      <div className="grid gap-6 @3xl:grid-cols-[minmax(0,1fr)_16rem] @3xl:gap-8">
        <div>
          {/* Arrows stay put on the first row. "Today" appears only away from this
              month, and wraps below them when the card is narrow. */}
          <div className="flex flex-wrap items-center gap-x-1 gap-y-2">
            <div className="mr-auto flex items-center">
              <select
                aria-label="Month"
                value={calMonth.getMonth()}
                onChange={(e) => setCalMonth((m) => new Date(m.getFullYear(), Number(e.target.value), 1))}
                className={SELECT}
              >
                {MONTH_NAMES.map((name, i) => (
                  <option key={name} value={i}>{name}</option>
                ))}
              </select>
              <select
                aria-label="Year"
                value={calMonth.getFullYear()}
                onChange={(e) => setCalMonth((m) => new Date(Number(e.target.value), m.getMonth(), 1))}
                className={SELECT}
              >
                {years.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            {!isThisMonth && (
              <Button
                variant="outline"
                size="sm"
                className="@max-md:order-last"
                onClick={() => setCalMonth(new Date(today.getFullYear(), today.getMonth(), 1))}
              >
                Today
              </Button>
            )}
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Previous month"
                onClick={() => setCalMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
              >
                <ChevronLeft size={20} aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Next month"
                onClick={() => setCalMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
              >
                <ChevronRight size={20} aria-hidden="true" />
              </Button>
            </div>
          </div>

          {/* The weekday header's next sibling is the day grid (specs rely on it). */}
          <div className="mt-4 grid grid-cols-7" aria-hidden="true">
            {WEEKDAYS.map((w) => (
              <div key={w} className="py-2 text-center text-sm text-muted-foreground">
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-y-1">
            {Array.from({ length: calDays.firstDay }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {calDays.days.map((day) => {
              const { d, date, info, isToday, isFuture, hasLog, hasEntry, periodLogged, periodPredicted, isFertile, isOvulation } = day;
              // Future dates are non-tappable UNLESS they already have a persisted
              // entry (so an existing future log can be opened + deleted); future
              // empty dates stay disabled — you can't create logs in the future.
              const canTap = !readOnly && (!isFuture || hasEntry);
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => onDayClick?.(date)}
                  disabled={!canTap}
                  aria-label={dayName(day)}
                  aria-current={isToday ? "date" : undefined}
                  data-phase={info?.phase}
                  className="flex aspect-square items-center justify-center rounded-xl transition-colors enabled:cursor-pointer enabled:hover:bg-muted @3xl:aspect-auto @3xl:h-[72px]"
                >
                  <span
                    className={cn(
                      "relative flex size-8 items-center justify-center rounded-full text-sm font-medium tabular-nums @md:size-10 @md:text-base",
                      periodLogged
                        ? "bg-menstrual text-card"
                        : periodPredicted
                          ? "border-2 border-dashed border-menstrual text-menstrual-ink"
                          : info
                            ? "bg-phase-tint text-phase-ink"
                            : "text-foreground",
                      isToday && "font-semibold ring-[1.5px] ring-foreground/70 ring-offset-2 ring-offset-card"
                    )}
                  >
                    {d}
                    {(isFertile || isOvulation) && (
                      <span
                        aria-hidden="true"
                        className={cn(
                          "absolute left-1/2 -translate-x-1/2 rounded-full bg-ovulation",
                          isOvulation ? "-bottom-[7px] size-1.5" : "-bottom-[6px] h-[3px] w-3"
                        )}
                      />
                    )}
                    {hasLog && (
                      <span
                        aria-hidden="true"
                        className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-muted-foreground ring-2 ring-card"
                      />
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="@3xl:border-l @3xl:border-border @3xl:pl-8">
          <h2 className="text-xl">This month</h2>
          <ul className="mt-3 space-y-2.5 text-sm">
            {marks.map((m) => (
              <Key key={m.label} swatch={<span className={m.swatch} />} label={m.label} value={m.value} />
            ))}
            {entries > 0 && (
              <Key
                swatch={<span className="size-2 rounded-full bg-muted-foreground" />}
                label="Days with a log"
                value={String(entries)}
              />
            )}
            {cycles.length > 0 &&
              PHASE_ORDER.filter((p) => lengths[p] > 0).map((p) => (
                <Key
                  key={p}
                  swatch={
                    <span
                      className="size-3.5 rounded-full"
                      // The tint alone is too faint on the card: outline it in its own hue.
                      style={{ backgroundColor: PHASES[p].bg, boxShadow: `inset 0 0 0 1px ${PHASES[p].border}` }}
                    />
                  }
                  label={`${PHASES[p].name} phase`}
                  value={getPhaseRangeLabel(p, anchors)}
                />
              ))}
          </ul>
          {fertileWindow && (
            <p className="mt-4 text-sm text-muted-foreground">
              Predictions, the fertile window and ovulation are calendar estimates, not contraception.
            </p>
          )}
          {marks.length === 0 && entries === 0 && cycles.length === 0 && (
            <p className="mt-3 text-sm text-muted-foreground">Nothing logged in this month.</p>
          )}
        </div>
      </div>
    </section>
  );
}

function Key({ swatch, label, value }: { swatch: ReactNode; label: string; value: string }) {
  return (
    <li className="flex items-center gap-3">
      <span className="flex w-4 shrink-0 justify-center" aria-hidden="true">
        {swatch}
      </span>
      <span className="flex-1 text-foreground">{label}</span>
      <span className="tabular-nums text-muted-foreground">{value}</span>
    </li>
  );
}
