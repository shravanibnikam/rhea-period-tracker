import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { PhaseName, Cycle, DailyLog, FertileWindow } from "@/domain/types";
import {
  PHASES,
  PHASE_ORDER,
  getPhaseForDay,
  getPhaseRangeLabel,
  anchorsFrom,
  type PhaseAnchors,
} from "@/domain/phases";
import { parseDate, addDays, diffDays, toDateKey } from "@/domain/dates";

interface CalendarTabProps {
  /** Derived domain cycles (M1.3 — replaced the LegacyCycleEntry bridge). */
  cycles: Cycle[];
  avgLength: number;
  avgPeriodLength: number;
  today: Date;
  logs: DailyLog[];
  onDayClick: (date: Date) => void;
  fertileWindow?: FertileWindow | null;
}

function getDatePhase(
  date: Date,
  cycles: Cycle[],
  avg: number,
  anchors: PhaseAnchors
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
  if (!last) return null;
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

export function CalendarTab({ cycles, avgLength, avgPeriodLength, today, logs, onDayClick, fertileWindow }: CalendarTabProps) {
  const anchors = anchorsFrom(avgLength, avgPeriodLength);
  const [calMonth, setCalMonth] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1)
  );

  // Build a set of dates that have logged data for the dot indicator
  const loggedDates = useMemo(() => {
    const set = new Set<string>();
    for (const l of logs) {
      if (l.flow !== "none" || l.symptoms.length > 0 || l.mood || l.energy) {
        set.add(l.date);
      }
    }
    return set;
  }, [logs]);

  // Every date with a PERSISTED log row (regardless of content) — drives
  // tappability of future dates so an existing future entry can be opened and
  // deleted, while future EMPTY dates stay disabled. Broader than loggedDates
  // (which is content-based, for the dot) so notes-only entries are reachable.
  const entryDates = useMemo(() => new Set(logs.map((l) => l.date)), [logs]);

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

  const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  const calDays = useMemo(() => {
    const daysInMonth = new Date(
      calMonth.getFullYear(),
      calMonth.getMonth() + 1,
      0
    ).getDate();
    const firstDay = new Date(
      calMonth.getFullYear(),
      calMonth.getMonth(),
      1
    ).getDay();
    const days = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(calMonth.getFullYear(), calMonth.getMonth(), d);
      const info = cycles.length > 0 ? getDatePhase(date, cycles, avgLength, anchors) : null;
      const isFertile =
        fertileWindow != null &&
        date >= fertileWindow.start &&
        date <= fertileWindow.end;
      const isOvulation =
        fertileWindow != null &&
        date.toDateString() === fertileWindow.ovulationDate.toDateString();

      days.push({
        d,
        date,
        info,
        isToday: date.toDateString() === today.toDateString(),
        isFuture: date > today,
        hasLog: loggedDates.has(toDateKey(date)),
        hasEntry: entryDates.has(toDateKey(date)),
        isFertile,
        isOvulation,
      });
    }
    return { days, firstDay };
  }, [calMonth, avgLength, avgPeriodLength, today, cycles, loggedDates, entryDates, fertileWindow]);

  return (
    <div className="bg-card rounded-2xl border border-border p-6">
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() =>
            setCalMonth(
              (m) => new Date(m.getFullYear(), m.getMonth() - 1, 1)
            )
          }
          className="p-2 rounded-full hover:bg-muted transition-colors"
          aria-label="Previous month"
        >
          <ChevronLeft size={16} className="text-muted-foreground" />
        </button>

        <div className="flex items-center gap-2">
          <select
            aria-label="Month"
            value={calMonth.getMonth()}
            onChange={(e) =>
              setCalMonth((m) => new Date(m.getFullYear(), Number(e.target.value), 1))
            }
            className="font-serif text-base sm:text-lg font-semibold text-foreground bg-transparent rounded-lg px-1.5 py-1 hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer"
          >
            {MONTH_NAMES.map((name, i) => (
              <option key={name} value={i}>{name}</option>
            ))}
          </select>
          <select
            aria-label="Year"
            value={calMonth.getFullYear()}
            onChange={(e) =>
              setCalMonth((m) => new Date(Number(e.target.value), m.getMonth(), 1))
            }
            className="font-serif text-base sm:text-lg font-semibold text-foreground bg-transparent rounded-lg px-1.5 py-1 hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer"
          >
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <button
            onClick={() => setCalMonth(new Date(today.getFullYear(), today.getMonth(), 1))}
            className="ml-1 text-xs font-medium text-primary rounded-full px-2.5 py-1 hover:bg-muted transition-colors"
            aria-label="Jump to current month"
          >
            Today
          </button>
        </div>

        <button
          onClick={() =>
            setCalMonth(
              (m) => new Date(m.getFullYear(), m.getMonth() + 1, 1)
            )
          }
          className="p-2 rounded-full hover:bg-muted transition-colors"
          aria-label="Next month"
        >
          <ChevronRight size={16} className="text-muted-foreground" />
        </button>
      </div>

      <div className="grid grid-cols-7 mb-1">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
          <div
            key={d}
            className="text-center text-xs text-muted-foreground font-medium py-2"
          >
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {Array.from({ length: calDays.firstDay }).map((_, i) => (
          <div key={`empty-${i}`} />
        ))}
        {calDays.days.map(({ d, date, info, isToday, isFuture, hasLog, hasEntry, isFertile, isOvulation }) => {
          const p = info ? PHASES[info.phase] : null;
          // Future dates are non-tappable UNLESS they already have a persisted
          // entry (so an existing future log can be opened + deleted); future
          // empty dates stay disabled — you can't create logs in the future.
          const canTap = !isFuture || hasEntry;
          // Fertile window gets a gold bottom border; phase bg takes priority for fill
          const bg = p ? p.bg : isFertile ? "#FBF0DC" : "transparent";
          return (
            <button
              key={d}
              onClick={() => canTap && onDayClick(date)}
              disabled={!canTap}
              className={`aspect-square flex flex-col items-center justify-center rounded-lg relative transition-all ${
                canTap ? "hover:ring-2 hover:ring-primary/30 cursor-pointer" : "cursor-default"
              }`}
              style={{
                backgroundColor: bg,
                opacity: isFuture && info?.predicted ? 0.55 : 1,
                boxShadow: isFertile && !p ? "inset 0 -2px 0 #C9913A" : undefined,
              }}
            >
              <span
                className={`text-xs ${isToday ? "font-bold" : "font-medium"}`}
                style={{ color: p ? p.text : "var(--foreground)" }}
              >
                {d}
              </span>
              {/* Today dot */}
              {isToday && (
                <span
                  className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
                  style={{
                    backgroundColor: p?.color ?? "var(--foreground)",
                  }}
                />
              )}
              {/* Ovulation marker */}
              {isOvulation && (
                <span
                  className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: "#C9913A" }}
                />
              )}
              {/* Logged data dot */}
              {hasLog && !isToday && (
                <span
                  className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary"
                />
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-5 pt-4 border-t border-border flex flex-wrap gap-x-4 gap-y-2">
        {PHASE_ORDER.map((p) => (
          <div key={p} className="flex items-center gap-1.5">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: PHASES[p].color }}
            />
            <span className="text-xs text-muted-foreground">
              {PHASES[p].name}{" "}
              <span className="opacity-60">{getPhaseRangeLabel(p, anchors)}</span>
            </span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <div
            className="w-3 h-3 rounded-full border border-border"
            style={{ opacity: 0.5 }}
          />
          <span className="text-xs text-muted-foreground">Predicted</span>
        </div>
        {fertileWindow && (
          <div className="flex items-center gap-1.5">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: "#C9913A" }}
            />
            <span className="text-xs text-muted-foreground">Fertile</span>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-primary" />
          <span className="text-xs text-muted-foreground">Logged</span>
        </div>
      </div>
    </div>
  );
}
