import { useState } from "react";
import { X, CalendarPlus } from "lucide-react";
import type { PhaseData } from "@/types";
import { saveLog, emptyLog } from "@/lib/db";
import { toDateKey, addDays } from "@/lib/utils";

interface QuickAddPeriodProps {
  onClose: () => void;
  onSaved: () => void;
  phaseData: PhaseData;
}

export function QuickAddPeriod({ onClose, onSaved, phaseData }: QuickAddPeriodProps) {
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    return toDateKey(d);
  });
  const [duration, setDuration] = useState(5);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const start = new Date(startDate + "T00:00:00");

    for (let i = 0; i < duration; i++) {
      const date = addDays(start, i);
      const dateKey = toDateKey(date);
      const log = {
        ...emptyLog(dateKey),
        flow: "medium" as const,
      };
      await saveLog(log);
    }

    onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative w-full max-w-md bg-card rounded-t-3xl sm:rounded-3xl border border-border shadow-xl overflow-y-auto">
        <div className="sticky top-0 bg-card/95 backdrop-blur-sm border-b border-border px-6 py-4 flex items-center justify-between z-10 rounded-t-3xl">
          <div className="flex items-center gap-2.5">
            <CalendarPlus size={18} style={{ color: phaseData.color }} />
            <h2 className="font-serif text-lg font-semibold text-foreground">
              Add a Period
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-muted transition-colors"
          >
            <X size={18} className="text-muted-foreground" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          <p className="text-xs text-muted-foreground">
            Quickly add a past or current period. This creates daily flow logs
            for each day of the period.
          </p>

          {/* Start date */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Start Date
            </p>
            <input
              type="date"
              value={startDate}
              max={toDateKey(new Date())}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-xl border border-border bg-muted/50 px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          {/* Duration */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Duration &mdash; {duration} days
            </p>
            <div className="flex gap-1.5">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((d) => (
                <button
                  key={d}
                  onClick={() => setDuration(d)}
                  className="flex-1 py-2 rounded-lg text-xs font-medium border-2 transition-all"
                  style={{
                    borderColor: duration === d ? phaseData.color : "var(--border)",
                    backgroundColor: duration === d ? phaseData.bg : "transparent",
                    color: duration === d ? phaseData.text : "var(--muted-foreground)",
                  }}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            You can tap individual days on the calendar afterward to edit flow
            level, symptoms, and other details.
          </p>
        </div>

        <div className="sticky bottom-0 bg-card/95 backdrop-blur-sm border-t border-border px-6 py-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3 rounded-xl font-medium text-sm text-white transition-all hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: phaseData.color }}
          >
            {saving ? "Saving..." : `Add ${duration}-day period`}
          </button>
        </div>
      </div>
    </div>
  );
}
