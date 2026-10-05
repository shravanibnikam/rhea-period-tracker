import { useCallback, useEffect, useRef, useState } from "react";
import { X, Trash2 } from "lucide-react";
import type { DailyLog, PhaseData } from "@/domain/types";
import { ALL_SYMPTOMS, FLOW_LEVELS, MOOD_OPTIONS, ENERGY_OPTIONS } from "@/app/lib/constants";
import { fmt } from "@/app/lib/format";
import { saveErrorMessage } from "@/app/hooks/useLogger";

interface DailyLogSheetProps {
  log: DailyLog;
  setLog: React.Dispatch<React.SetStateAction<DailyLog>>;
  /**
   * Persist the log. Must REJECT on failure: the sheet closes only after it
   * resolves, and on failure stays open with the error and the user's edits.
   */
  onSave: () => Promise<void>;
  onClose: () => void;
  phaseData: PhaseData;
  date: Date;
  /**
   * Delete the persisted log via the sync-engine tombstone path. Must REJECT on
   * failure so the modal stays open. Resolves only after the delete succeeds,
   * at which point the parent closes the sheet.
   */
  onDelete?: () => Promise<void>;
  /** Show the Delete action only for an existing, non-deleted persisted log. */
  canDelete?: boolean;
  /**
   * Set when this day's saved log could not be read: shown as an alert, and
   * Save is disabled (it would only be refused — it could overwrite the log).
   */
  loadError?: string | null;
}

export function DailyLogSheet({
  log,
  setLog,
  onSave,
  onClose,
  phaseData,
  date,
  onDelete,
  canDelete = false,
  loadError = null,
}: DailyLogSheetProps) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // While a save or delete runs the sheet cannot be closed: its late result
  // would otherwise call onClose, which closes whatever sheet is open by then
  // (possibly another day's). A ref, so Escape sees it at once.
  const busy = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const requestClose = useCallback(() => {
    if (!busy.current) onClose();
  }, [onClose]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") requestClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [requestClose]);

  const showDelete = canDelete && !!onDelete;

  const runDelete = useCallback(async () => {
    if (!onDelete) return;
    busy.current = true;
    setDeleting(true);
    setDeleteError(null);
    setSaveError(null);
    try {
      await onDelete(); // parent closes the sheet on success
    } catch (err) {
      busy.current = false;
      if (!mounted.current) return;
      // Failure: keep the modal open, surface the error, retain the log.
      setDeleteError(
        err instanceof Error ? err.message : "Couldn't delete this log. Please try again."
      );
      setDeleting(false);
      setConfirming(false);
    }
  }, [onDelete]);

  const runSave = useCallback(async () => {
    busy.current = true;
    setSaving(true);
    setSaveError(null);
    setDeleteError(null);
    try {
      await onSave();
    } catch (err) {
      busy.current = false;
      console.error("Failed to save the daily log:", err);
      if (!mounted.current) return;
      // Failure: keep the sheet open with the user's edits and say so.
      setSaveError(saveErrorMessage(err));
      setSaving(false);
      return;
    }
    busy.current = false;
    // Gone already (e.g. sign-out): never close a sheet opened since.
    if (!mounted.current) return;
    setSaving(false);
    onClose(); // only once the log is persisted
  }, [onSave, onClose]);

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
        onClick={requestClose}
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
            onClick={requestClose}
            disabled={saving || deleting}
            aria-label="Close"
            className="p-2 rounded-full hover:bg-muted transition-colors disabled:opacity-50"
          >
            <X size={18} className="text-muted-foreground" aria-hidden="true" />
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
              Notes <span className="font-normal opacity-60">(not end-to-end encrypted; a linked partner&apos;s account can read it)</span>
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

        {/* Save + Delete */}
        <div className="sticky bottom-0 bg-card/95 backdrop-blur-sm border-t border-border px-6 py-4 space-y-3">
          {loadError && (
            <p role="alert" className="text-xs text-red-600 text-center">
              {loadError}
            </p>
          )}
          {saveError && (
            <p role="alert" className="text-xs text-red-600 text-center">
              {saveError}
            </p>
          )}
          {deleteError && (
            <p role="alert" className="text-xs text-red-600 text-center">
              {deleteError}
            </p>
          )}
          <button
            onClick={runSave}
            disabled={saving || deleting || !!loadError}
            aria-busy={saving}
            className="w-full py-3 rounded-xl font-medium text-sm text-white transition-all duration-200 hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: phaseData.color }}
          >
            Save Log
          </button>

          {showDelete && !confirming && (
            <button
              onClick={() => { setDeleteError(null); setSaveError(null); setConfirming(true); }}
              disabled={saving}
              className="w-full py-2.5 rounded-xl font-medium text-sm text-red-600 border border-red-200 hover:bg-red-50 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              aria-label="Delete this log"
            >
              <Trash2 size={15} aria-hidden="true" />
              Delete log
            </button>
          )}

          {showDelete && confirming && (
            <div className="flex gap-2" role="group" aria-label="Confirm deleting this log">
              <button
                onClick={() => setConfirming(false)}
                disabled={deleting || saving}
                className="flex-1 py-2.5 rounded-xl font-medium text-sm text-muted-foreground border border-border hover:bg-muted transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={runDelete}
                disabled={deleting || saving}
                autoFocus
                className="flex-1 py-2.5 rounded-xl font-medium text-sm text-white bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-50"
                aria-label="Confirm delete log"
              >
                {deleting ? "Deleting…" : "Confirm delete"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
