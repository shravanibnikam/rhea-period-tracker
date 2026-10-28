import { useMemo } from "react";
import type { DailyLog } from "@/domain/types";
import { toDateKey, addDays } from "@/domain/dates";
import { fmt } from "@/app/lib/format";

/** Days of history shown behind today, when `symptom_details` is on. */
const HISTORY_DAYS = 6;
// Labels in the text face (PartnerView's LABEL): h3 would otherwise take the display face.
const LABEL = "font-sans text-sm font-semibold text-foreground [font-size-adjust:none]";

/**
 * The partner-side symptom list (gated on the owner's `symptom_details` toggle),
 * rendered inside PartnerView's "How they're feeling" card. Chips take the tint
 * of the nearest `[data-phase]` scope.
 *
 * Deliberately narrow: symptoms ONLY. Free-text notes, medication, and intimacy
 * live on the same DailyLog and are never rendered here — they are not symptoms,
 * and no single toggle should hand them over.
 */
export function PartnerSymptoms({ logs, today }: { logs: DailyLog[]; today: Date }) {
  const { todaysSymptoms, recentDays } = useMemo(() => {
    const byDate = new Map<string, string[]>();
    for (const log of logs) {
      if (log.symptoms.length > 0) byDate.set(log.date, log.symptoms);
    }

    // Walk back day by day so gaps stay gaps — a week with two logged days
    // should read as two entries, not a padded run of empties.
    const recent: { date: Date; symptoms: string[] }[] = [];
    for (let i = 1; i <= HISTORY_DAYS; i++) {
      const date = addDays(today, -i);
      const symptoms = byDate.get(toDateKey(date));
      if (symptoms) recent.push({ date, symptoms });
    }

    return { todaysSymptoms: byDate.get(toDateKey(today)) ?? [], recentDays: recent };
  }, [logs, today]);

  return (
    <div className="space-y-5">
      <div>
        <h3 className={LABEL}>Symptoms today</h3>
        {todaysSymptoms.length > 0 ? (
          <ul className="mt-2 flex flex-wrap gap-2">
            {todaysSymptoms.map((s) => (
              <li key={s} className="rounded-full bg-phase-tint px-3 py-1.5 text-sm font-medium text-phase-ink">
                {s}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">None logged today.</p>
        )}
      </div>

      <div>
        <h3 className={LABEL}>Earlier this week</h3>
        {recentDays.length > 0 ? (
          <ul className="mt-2 space-y-2">
            {recentDays.map(({ date, symptoms }) => (
              <li key={toDateKey(date)} className="flex items-start gap-3">
                <span className="w-24 shrink-0 pt-1 text-sm text-muted-foreground tabular-nums">
                  {fmt(date, { weekday: "short", month: "short", day: "numeric" })}
                </span>
                <ul className="flex flex-wrap gap-1.5">
                  {symptoms.map((s) => (
                    <li key={s} className="rounded-full bg-muted px-2.5 py-1 text-sm text-foreground">
                      {s}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">None logged in the six days before today.</p>
        )}
      </div>
    </div>
  );
}
