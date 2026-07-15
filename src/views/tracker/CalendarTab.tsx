import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { PhaseName, LegacyCycleEntry, DailyLog, FertileWindow } from "@/types";
import { PHASES, PHASE_ORDER } from "@/lib/phases";
import { parseDate, addDays, diffDays, getPhase, toDateKey } from "@/lib/utils";

interface CalendarTabProps {
  cycleData: LegacyCycleEntry[];
  avgLength: number;
  today: Date;
  logs: DailyLog[];
  onDayClick: (date: Date) => void;
  fertileWindow?: FertileWindow | null;
}

function getDatePhase(
  date: Date,
  cycles: LegacyCycleEntry[],
  avg: number
): { phase: PhaseName; day: number; predicted: boolean } | null {
  const sorted = [...cycles].sort((a, b) => (a.start < b.start ? -1 : 1));

  for (let i = sorted.length - 1; i >= 0; i--) {
    const start = parseDate(sorted[i].start);
    const len = sorted[i].length ?? avg;
    const end = addDays(start, len - 1);
    if (date >= start && date <= end) {
      const day = diffDays(date, start) + 1;
      return { phase: getPhase(day), day, predicted: false };
    }
  }

  const last = sorted[sorted.length - 1];
  if (!last) return null;
  let nextStart = addDays(parseDate(last.start), last.length ?? avg);
  for (let i = 0; i < 6; i++) {
    const end = addDays(nextStart, avg - 1);
    if (date >= nextStart && date <= end) {
      const day = diffDays(date, nextStart) + 1;
      return { phase: getPhase(day), day, predicted: true };
    }
    nextStart = addDays(nextStart, avg);
  }

  return null;
}

export function CalendarTab({ cycleData, avgLength, today, logs, onDayClick, fertileWindow }: CalendarTabProps) {
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
      const info = cycleData.length > 0 ? getDatePhase(date, cycleData, avgLength) : null;
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
        isFertile,
        isOvulation,
      });
    }
    return { days, firstDay };
  }, [calMonth, avgLength, today, cycleData, loggedDates]);

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
        >
          <ChevronLeft size={16} className="text-muted-foreground" />
        </button>
        <h2 className="font-serif text-xl font-semibold text-foreground">
          {calMonth.toLocaleDateString("en-US", {
            month: "long",
            year: "numeric",
          })}
        </h2>
        <button
          onClick={() =>
            setCalMonth(
              (m) => new Date(m.getFullYear(), m.getMonth() + 1, 1)
            )
          }
          className="p-2 rounded-full hover:bg-muted transition-colors"
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
        {calDays.days.map(({ d, date, info, isToday, isFuture, hasLog, isFertile, isOvulation }) => {
          const p = info ? PHASES[info.phase] : null;
          const canTap = !isFuture;
          // Fertile window gets a gold bottom border; phase bg takes priority for fill
          const bg = p ? p.bg : isFertile ? "#FBF0DC" : "transparent";
          return (
            <button
              key={d}
              onClick={() => canTap && onDayClick(date)}
              disabled={isFuture}
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
              <span className="opacity-60">{PHASES[p].range}</span>
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
