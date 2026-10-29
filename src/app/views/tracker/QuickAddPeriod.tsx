import { useState } from "react";
import type { PhaseData } from "@/domain/types";
import type { DailyLogPatch } from "@/data/repositories/LogRepository";
import { buildPeriodLogs } from "@/domain/cycle";
import { addDays, parseDate, toDateKey } from "@/domain/dates";
import { Sheet } from "@/app/components/ui/Sheet";
import { Button } from "@/app/components/ui/Button";
import { Segmented } from "@/app/components/ui/controls";
import { fmtSpan } from "./dateText";

interface QuickAddPeriodProps {
  onClose: () => void;
  /** The single write path (useLogger.saveMany) — QuickAdd no longer writes
   *  to the database directly, so its logs sync like any other save (M1.3).
   *  Merge-defined: only flow is set; existing day content is kept (P0-01). */
  saveLogs: (logs: DailyLogPatch[], opts: { mode: "merge-defined" }) => Promise<void>;
  phaseData: PhaseData;
}

const LENGTHS = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ value: String(n), label: String(n) }));

export function QuickAddPeriod({ onClose, saveLogs }: QuickAddPeriodProps) {
  const todayKey = toDateKey(new Date());
  const [startDate, setStartDate] = useState(todayKey);
  const [duration, setDuration] = useState(5);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A typed date can pass `max`; an empty or future start would write nonsense days.
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(startDate) && startDate <= todayKey;
  // Only days up to today are logged: a day that hasn't happened isn't logged
  // flow (it would feed the calendar, averages and exports as fact).
  const logs = valid ? buildPeriodLogs(startDate, duration).filter((l) => l.date <= todayKey) : [];
  const ahead = valid ? duration - logs.length : 0;

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await saveLogs(logs, { mode: "merge-defined" });
    } catch (err) {
      // The batch is one transaction, so a failed write leaves nothing
      // half-saved. Stay open so the user can retry.
      console.error("Failed to add the period:", err);
      setError("Couldn't add this period. Please try again.");
      setSaving(false);
      return;
    }
    onClose(); // only once the logs are persisted
  };

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
      closeDisabled={saving}
      title="Add a period"
      description="Each day is logged as medium flow, and anything else already logged on those days is kept."
      footer={
        <div className="space-y-3">
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button size="lg" className="w-full" onClick={handleSave} disabled={saving || !valid} aria-busy={saving}>
            {ahead > 0 ? `Log ${logs.length} ${logs.length === 1 ? "day" : "days"} so far` : `Add ${duration}-day period`}
          </Button>
        </div>
      }
    >
      <div className="space-y-7">
        <section className="space-y-3">
          <h3 className="text-lg">
            <label htmlFor="quick-add-start">First day</label>
          </h3>
          <input
            id="quick-add-start"
            type="date"
            value={startDate}
            max={todayKey}
            onChange={(e) => setStartDate(e.target.value)}
            className="h-11 w-full rounded-xl border border-input bg-input-background px-3 text-foreground"
          />
          {!valid && <p className="text-sm text-muted-foreground">Choose today or an earlier day.</p>}
        </section>

        <section className="space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-lg">Length in days</h3>
            {valid && (
              <span className="text-sm text-muted-foreground">
                {fmtSpan(parseDate(startDate), addDays(parseDate(startDate), duration - 1))}
              </span>
            )}
          </div>
          <Segmented
            label="Length in days"
            value={String(duration)}
            options={LENGTHS}
            onChange={(v) => v && setDuration(Number(v))}
            className="grid grid-cols-4 sm:grid-cols-8"
          />
          <p className="text-sm text-muted-foreground">
            {ahead > 0
              ? `Only days up to today are logged. Log the other ${ahead === 1 ? "day" : `${ahead} days`} as they come, or change any day later from the calendar.`
              : "You can change any day’s flow later from the calendar."}
          </p>
        </section>
      </div>
    </Sheet>
  );
}
