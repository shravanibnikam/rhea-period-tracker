import { useCallback, useEffect } from "react";
import { X } from "lucide-react";
import type { DailyLog, FlowLevel, PhaseData } from "@/types";
import { ALL_SYMPTOMS, FLOW_LEVELS, MOOD_OPTIONS, ENERGY_OPTIONS } from "@/lib/constants";
import { fmt } from "@/lib/utils";

interface DailyLogSheetProps {
  log: DailyLog;
  setLog: React.Dispatch<React.SetStateAction<DailyLog>>;
  onSave: () => void;
  onClose: () => void;
  phaseData: PhaseData;
  date: Date;
}

export function DailyLogSheet({
  log,
  setLog,
  onSave,
  onClose,
  phaseData,
  date,
}: DailyLogSheetProps) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const setField = useCallback(
    <K extends keyof DailyLog>(key: K, value: DailyLog[K]) => {
      setLog((prev) => ({ ...prev, [key]: value }));
    },
    [setLog]
  );

  const toggleSymptom = useCallback(
    (symptom: string) => {
      setLog((prev) => {
        const symptoms = prev.symptoms.includes(symptom)
          ? prev.symptoms.filter((s) => s !== symptom)
          : [...prev.symptoms, symptom];
        return { ...prev, symptoms };
      });
    },
    [setLog]
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label="Log your day">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div className="relative w-full max-w-lg max-h-[85vh] bg-card rounded-t-3xl sm:rounded-3xl border border-border shadow-xl overflow-y-auto">
        {/* Handle + header */}
        <div className="sticky top-0 bg-card/95 backdrop-blur-sm border-b border-border px-6 py-4 flex items-center justify-between z-10 rounded-t-3xl">
          <div>
            <h2 className="font-serif text-lg font-semibold text-foreground">
              Log Your Day
            </h2>
            <p className="text-xs text-muted-foreground">
              {fmt(date, { weekday: "long", month: "long", day: "numeric" })}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-muted transition-colors"
          >
            <X size={18} className="text-muted-foreground" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* Flow */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Flow
            </p>
            <div className="flex gap-2">
              {FLOW_LEVELS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setField("flow", f.value)}
                  className="flex-1 py-2.5 rounded-xl text-xs font-medium border-2 transition-all duration-200"
                  style={{
                    borderColor:
                      log.flow === f.value ? phaseData.color : "var(--border)",
                    backgroundColor:
                      log.flow === f.value ? phaseData.bg : "transparent",
                    color:
                      log.flow === f.value
                        ? phaseData.text
                        : "var(--muted-foreground)",
                  }}
                >
                  <div
                    className="w-3 h-3 rounded-full mx-auto mb-1"
                    style={{ backgroundColor: f.color }}
                  />
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Symptoms */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Symptoms
            </p>
            <div className="flex flex-wrap gap-2">
              {ALL_SYMPTOMS.map((s) => (
                <button
                  key={s}
                  onClick={() => toggleSymptom(s)}
                  className="px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-200"
                  style={
                    log.symptoms.includes(s)
                      ? {
                          backgroundColor: phaseData.bg,
                          color: phaseData.text,
                          borderColor: phaseData.border,
                        }
                      : {
                          backgroundColor: "var(--muted)",
                          color: "var(--muted-foreground)",
                          borderColor: "var(--border)",
                        }
                  }
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Mood */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Mood
            </p>
            <div className="flex flex-wrap gap-2">
              {MOOD_OPTIONS.map((m) => (
                <button
                  key={m}
                  onClick={() =>
                    setField("mood", log.mood === m ? null : m)
                  }
                  className="px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-200"
                  style={
                    log.mood === m
                      ? {
                          backgroundColor: phaseData.bg,
                          color: phaseData.text,
                          borderColor: phaseData.border,
                        }
                      : {
                          backgroundColor: "var(--muted)",
                          color: "var(--muted-foreground)",
                          borderColor: "var(--border)",
                        }
                  }
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Energy */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Energy
            </p>
            <div className="flex gap-2">
              {ENERGY_OPTIONS.map((e) => (
                <button
                  key={e.value}
                  onClick={() =>
                    setField(
                      "energy",
                      log.energy === e.value ? null : e.value
                    )
                  }
                  className="flex-1 py-2.5 rounded-xl text-xs font-medium border-2 transition-all duration-200"
                  style={{
                    borderColor:
                      log.energy === e.value
                        ? phaseData.color
                        : "var(--border)",
                    backgroundColor:
                      log.energy === e.value ? phaseData.bg : "transparent",
                    color:
                      log.energy === e.value
                        ? phaseData.text
                        : "var(--muted-foreground)",
                  }}
                >
                  {e.label}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Notes <span className="font-normal opacity-60">(private, never shared)</span>
            </p>
            <textarea
              value={log.notes}
              onChange={(e) => setField("notes", e.target.value)}
              placeholder="How are you feeling today?"
              rows={3}
              className="w-full rounded-xl border border-border bg-muted/50 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>

        {/* Save button */}
        <div className="sticky bottom-0 bg-card/95 backdrop-blur-sm border-t border-border px-6 py-4">
          <button
            onClick={() => {
              onSave();
              onClose();
            }}
            className="w-full py-3 rounded-xl font-medium text-sm text-white transition-all duration-200 hover:opacity-90"
            style={{ backgroundColor: phaseData.color }}
          >
            Save Log
          </button>
        </div>
      </div>
    </div>
  );
}
