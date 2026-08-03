import { useMemo } from "react";
import { Activity } from "lucide-react";
import type { DailyLog, PhaseData } from "@/domain/types";
import { toDateKey, addDays } from "@/domain/dates";
import { fmt } from "@/app/lib/format";

/** Days of history shown behind today, when `symptom_details` is on. */
const HISTORY_DAYS = 6;

interface PartnerSymptomsProps {
  logs: DailyLog[];
  today: Date;
  phaseData: PhaseData;
}

/**
 * The partner-side symptom card (gated on the owner's `symptom_details` toggle).
 *
 * Deliberately narrow: symptoms ONLY. Free-text notes, medication, and intimacy
 * live on the same DailyLog and are never rendered here — they are not symptoms,
 * and no single toggle should hand them over.
 */
export function PartnerSymptoms({ logs, today, phaseData }: PartnerSymptomsProps) {
  const { todaysSymptoms, recentDays } = useMemo(() => {
    const byDate = new Map<string, string[]>();
    for (const log of logs) {
      if (log.symptoms.length > 0) byDate.set(log.date, log.symptoms);
    }

    const todays = byDate.get(toDateKey(today)) ?? [];

    // Walk back day by day so gaps stay gaps — a week with two logged days
    // should read as two entries, not a padded run of empties.
    const recent: { date: Date; symptoms: string[] }[] = [];
    for (let i = 1; i <= HISTORY_DAYS; i++) {
      const date = addDays(today, -i);
      const symptoms = byDate.get(toDateKey(date));
      if (symptoms && symptoms.length > 0) recent.push({ date, symptoms });
    }

    return { todaysSymptoms: todays, recentDays: recent };
  }, [logs, today]);

  return (
    <div className="bg-card rounded-2xl border border-border p-6">
      <div className="flex items-center gap-2 mb-1">
        <Activity size={16} style={{ color: phaseData.color }} />
        <h2 className="font-serif text-xl font-semibold text-foreground">
          What She&apos;s Feeling
        </h2>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Symptoms she&apos;s logged today and over the past week
      </p>

      {/* Today */}
      <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: phaseData.color }}>
        Today
      </p>
      {todaysSymptoms.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {todaysSymptoms.map((s) => (
            <span
              key={s}
              className="px-3 py-1.5 rounded-full text-xs font-medium"
              style={{ backgroundColor: phaseData.bg, color: phaseData.text }}
            >
              {s}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Nothing logged today.
        </p>
      )}

      {/* Past week */}
      {recentDays.length > 0 && (
        <div className="mt-5 pt-4 border-t border-border">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Earlier This Week
          </p>
          <div className="space-y-2.5">
            {recentDays.map(({ date, symptoms }) => (
              <div key={toDateKey(date)} className="flex items-start gap-3">
                <p className="text-xs text-muted-foreground w-16 flex-shrink-0 pt-1.5">
                  {fmt(date, { weekday: "short", day: "numeric" })}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {symptoms.map((s) => (
                    <span
                      key={s}
                      className="px-2.5 py-1 rounded-full text-xs bg-muted text-foreground"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {todaysSymptoms.length === 0 && recentDays.length === 0 && (
        <p className="mt-4 text-xs text-muted-foreground leading-relaxed">
          Nothing logged in the past week. A quiet stretch isn&apos;t
          necessarily a good or bad sign &mdash; it just means there was
          nothing she felt like recording.
        </p>
      )}
    </div>
  );
}
