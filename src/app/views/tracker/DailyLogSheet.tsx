import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { isSupabaseConfigured } from "@/app/lib/supabase";
import { flushSync } from "react-dom";
import { ChevronDown, Plus, Trash2, X } from "lucide-react";
import type { DailyLog, MedicationEntry, PhaseData } from "@/domain/types";
import { PHASES, PHASE_ORDER } from "@/domain/phases";
import {
  ALL_SYMPTOMS,
  ENERGY_OPTIONS,
  FLOW_LEVELS,
  MEDICATION_SUGGESTIONS,
  MOOD_OPTIONS,
} from "@/app/lib/constants";
import { fmt } from "@/app/lib/format";
import { cn } from "@/app/lib/cn";
import { saveErrorMessage } from "@/app/hooks/useLogger";
import { Sheet } from "@/app/components/ui/Sheet";
import { Button } from "@/app/components/ui/Button";
import { Chip, Segmented, Switch } from "@/app/components/ui/controls";

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

interface MedDraft {
  name: string;
  dose: string;
  takenAt: string;
}
const NO_DRAFT: MedDraft = { name: "", dose: "", takenAt: "" };

/** A trimmed entry, or null when there is no name. Optional fields are omitted, not blank. */
function toEntry(d: MedDraft): MedicationEntry | null {
  const name = d.name.trim().replace(/\s+/g, " ");
  if (!name) return null;
  const dose = d.dose.trim().replace(/\s+/g, " ");
  return { name, ...(dose ? { dose } : {}), ...(d.takenAt ? { takenAt: d.takenAt } : {}) };
}

/** "08:30" → "8:30 AM" */
function clock(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

// The medication suggestions are 36px pills like the chips (ui/Chip): the
// pseudo-element grows each hit area to 44px, filling the 8px row gap.
const CHIP_TARGET = "relative before:absolute before:inset-x-0 before:-inset-y-1";
const SEGMENTS = "gap-0.5 p-0.5 [&>button]:px-1 [&>button]:text-[13px]";
const FIELD =
  "h-11 w-full rounded-xl border border-input bg-input-background px-3 text-foreground placeholder:text-muted-foreground";

const PROTECTION = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "unsure", label: "Not sure" },
] as const;

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
  const [draft, setDraft] = useState<MedDraft>(NO_DRAFT);
  const [draftError, setDraftError] = useState<string | null>(null);
  // null: follow the data (open when the day has medication or intimacy logged).
  const [moreOpen, setMoreOpen] = useState<boolean | null>(null);
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
  // The latest onSave: after flushSync below, the parent has re-rendered and
  // this is the save that holds the just-added medication.
  const latestSave = useRef(onSave);
  latestSave.current = onSave;

  // Backing out of the delete confirmation hands focus back to the Delete
  // button it replaced (the Cancel button that had it is gone).
  const deleteButton = useRef<HTMLButtonElement>(null);
  const refocusDelete = useRef(false);
  const cancelDelete = useCallback(() => {
    refocusDelete.current = true;
    setConfirming(false);
  }, []);
  useEffect(() => {
    if (confirming || !refocusDelete.current) return;
    refocusDelete.current = false;
    deleteButton.current?.focus();
  }, [confirming]);

  // Escape, the overlay and the X (Sheet's onOpenChange(false), refusable):
  // while the delete confirmation is open they back out of it, so the day's
  // edits are never dropped with it.
  const requestClose = useCallback(() => {
    if (busy.current) return;
    if (confirming) cancelDelete();
    else onClose();
  }, [confirming, cancelDelete, onClose]);

  // Radix handles Escape inside the dialog (and preventDefaults it); this also
  // catches an Escape dispatched on window, which Radix never sees.
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) requestClose();
    };
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
      cancelDelete();
    }
  }, [onDelete, cancelDelete]);

  const runSave = useCallback(async () => {
    // A medication typed but not added is part of what the person is saving.
    const pending = toEntry(draft);
    if (pending) {
      flushSync(() => {
        setLog((prev) => ({ ...prev, medication: [...(prev.medication ?? []), pending] }));
        setDraft(NO_DRAFT);
      });
    }
    busy.current = true;
    setSaving(true);
    setSaveError(null);
    setDeleteError(null);
    try {
      await latestSave.current();
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
  }, [draft, setLog, onClose]);

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

  const addMedication = (entry: MedicationEntry) =>
    setLog((prev) => ({ ...prev, medication: [...(prev.medication ?? []), entry] }));

  const submitDraft = (e: FormEvent) => {
    e.preventDefault();
    const entry = toEntry(draft);
    if (!entry) {
      setDraftError("Enter the medication's name.");
      return;
    }
    addMedication(entry);
    setDraft(NO_DRAFT);
    setDraftError(null);
  };

  const meds = log.medication ?? [];
  const intimacy = log.intimacy?.occurred ? log.intimacy : null;
  const showMore = moreOpen ?? (meds.length > 0 || intimacy !== null);
  const taken = new Set(meds.map((m) => m.name.toLowerCase()));
  const phase = PHASE_ORDER.find((p) => PHASES[p].name === phaseData.name) ?? "menstrual";

  const footer = (
    <div className="space-y-3">
      {[loadError, saveError, deleteError].map((message, i) =>
        message ? (
          <p key={i} role="alert" className="text-sm text-destructive">
            {message}
          </p>
        ) : null
      )}
      {showDelete && confirming ? (
        // Keyed apart, so Save never morphs into Cancel (React would reuse the node).
        <div
          key="confirm"
          className="flex flex-wrap items-center gap-x-2 gap-y-3"
          role="group"
          aria-label="Confirm deleting this log"
        >
          <p className="w-full text-base font-semibold sm:mr-auto sm:w-auto">Delete the log for {fmt(date)}?</p>
          <Button
            variant="secondary"
            size="lg"
            className="flex-1 sm:flex-none"
            onClick={cancelDelete}
            disabled={deleting || saving}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="lg"
            className="flex-1 sm:flex-none"
            onClick={runDelete}
            disabled={deleting || saving}
            autoFocus
            aria-label="Confirm delete log"
          >
            {deleting ? "Deleting…" : "Delete"}
          </Button>
        </div>
      ) : (
        <div key="actions" className="flex gap-2">
          {showDelete && (
            <Button
              ref={deleteButton}
              variant="destructive-outline"
              size="lg"
              onClick={() => {
                setDeleteError(null);
                setSaveError(null);
                setConfirming(true);
              }}
              disabled={saving}
              aria-label="Delete this log"
            >
              <Trash2 size={18} aria-hidden="true" />
              Delete
            </Button>
          )}
          <Button size="lg" className="flex-1" onClick={runSave} disabled={saving || deleting || !!loadError} aria-busy={saving}>
            Save log
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) requestClose();
      }}
      title="Log your day"
      description={fmt(date, { weekday: "long", month: "long", day: "numeric" })}
      closeDisabled={saving || deleting}
      footer={footer}
    >
      <div data-phase={phase} className="space-y-7">
        <Section title="Flow">
          <Segmented
            label="Flow"
            value={log.flow}
            options={FLOW_LEVELS}
            onChange={(v) => v && setField("flow", v)}
            className={SEGMENTS}
          />
        </Section>

        <Section title="Symptoms" aside={log.symptoms.length ? `${log.symptoms.length} selected` : null}>
          <div className="flex flex-wrap gap-2">
            {ALL_SYMPTOMS.map((s) => (
              <Chip key={s} selected={log.symptoms.includes(s)} onClick={() => toggleSymptom(s)}>
                {s}
              </Chip>
            ))}
          </div>
        </Section>

        <Section title="Mood" aside="Pick one">
          <div className="flex flex-wrap gap-2">
            {MOOD_OPTIONS.map((m) => (
              <Chip
                key={m}
                selected={log.mood === m}
                onClick={() => setField("mood", log.mood === m ? null : m)}
              >
                {m}
              </Chip>
            ))}
          </div>
        </Section>

        <Section title="Energy">
          <Segmented
            label="Energy"
            value={log.energy as (typeof ENERGY_OPTIONS)[number]["value"] | null}
            options={ENERGY_OPTIONS}
            onChange={(v) => setField("energy", v)}
            allowDeselect
            className={SEGMENTS}
          />
        </Section>

        <section className="space-y-3">
          <h3 className="text-lg">
            <label htmlFor="log-notes">Notes</label>
          </h3>
          <textarea
            id="log-notes"
            value={log.notes}
            onChange={(e) => setField("notes", e.target.value)}
            placeholder="How are you feeling today?"
            rows={3}
            aria-describedby="log-privacy"
            className={cn(FIELD, "h-auto resize-none py-3")}
          />
          <p id="log-privacy" className="text-sm text-muted-foreground">
            {isSupabaseConfigured()
              ? "Notes, medication and intimacy aren’t end-to-end encrypted. Your partner’s view doesn’t show them, but a linked partner’s account can read synced logs."
              : "Notes, medication and intimacy are stored only on this device."}
          </p>

          <button
            type="button"
            aria-expanded={showMore}
            aria-controls="log-more"
            onClick={() => setMoreOpen(!showMore)}
            className="flex min-h-11 w-full items-center justify-between rounded-xl bg-muted px-4 text-left font-semibold transition-colors hover:bg-secondary/70"
          >
            Medication and intimacy
            <ChevronDown
              size={18}
              aria-hidden="true"
              className={cn("transition-transform duration-150", showMore && "rotate-180")}
            />
          </button>

          {/* Always rendered, hidden while collapsed: aria-controls must point at an element. */}
          <div id="log-more" hidden={!showMore} className="space-y-7 pt-3">
            <Section title="Medication">
              {meds.length > 0 && (
                <ul className="divide-y divide-border rounded-xl border border-border">
                  {meds.map((m, i) => (
                    <li key={`${i}:${m.name}`} className="flex min-h-12 items-center justify-between gap-2 py-1 pr-1 pl-4">
                      <span className="min-w-0">
                        <span className="font-semibold">{m.name}</span>
                        {(m.dose || m.takenAt) && (
                          <span className="text-muted-foreground">
                            {" · "}
                            {[m.dose, m.takenAt && clock(m.takenAt)].filter(Boolean).join(" · ")}
                          </span>
                        )}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove ${m.name}`}
                        onClick={() => setField("medication", meds.filter((_, j) => j !== i))}
                      >
                        <X size={18} aria-hidden="true" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap gap-2">
                {MEDICATION_SUGGESTIONS.filter((s) => !taken.has(s.toLowerCase())).map((s) => (
                  <Button
                    key={s}
                    variant="secondary"
                    size="sm"
                    className={CHIP_TARGET}
                    aria-label={`Add ${s}`}
                    onClick={() => addMedication({ name: s })}
                  >
                    <Plus size={16} aria-hidden="true" />
                    {s}
                  </Button>
                ))}
              </div>
              <form onSubmit={submitDraft} noValidate className="grid grid-cols-2 gap-3">
                <label className="col-span-2 space-y-1.5 text-sm font-semibold">
                  <span>Other medication</span>
                  <input
                    value={draft.name}
                    onChange={(e) => {
                      setDraft({ ...draft, name: e.target.value });
                      setDraftError(null);
                    }}
                    maxLength={60}
                    autoComplete="off"
                    aria-invalid={draftError ? true : undefined}
                    aria-describedby={draftError ? "med-error" : undefined}
                    className={FIELD}
                  />
                </label>
                <label className="space-y-1.5 text-sm font-semibold">
                  <span>Dose (optional)</span>
                  <input
                    value={draft.dose}
                    onChange={(e) => setDraft({ ...draft, dose: e.target.value })}
                    maxLength={30}
                    placeholder="200 mg"
                    autoComplete="off"
                    className={FIELD}
                  />
                </label>
                <label className="space-y-1.5 text-sm font-semibold">
                  <span>Time (optional)</span>
                  <input
                    type="time"
                    value={draft.takenAt}
                    onChange={(e) => setDraft({ ...draft, takenAt: e.target.value })}
                    className={FIELD}
                  />
                </label>
                {draftError && (
                  <p id="med-error" className="col-span-2 text-sm text-destructive">
                    {draftError}
                  </p>
                )}
                <Button type="submit" variant="outline" className="col-span-2">
                  Add medication
                </Button>
              </form>
            </Section>

            <Section title="Intimacy">
              <label
                htmlFor="log-had-sex"
                className="flex min-h-11 items-center justify-between gap-4 rounded-xl border border-border px-4"
              >
                <span className="font-semibold">Had sex</span>
                <Switch
                  id="log-had-sex"
                  checked={intimacy !== null}
                  onCheckedChange={(on) => setField("intimacy", on ? { occurred: true } : null)}
                />
              </label>
              {intimacy && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold">Protected</p>
                  <Segmented
                    label="Protected"
                    value={intimacy.protected === true ? "yes" : intimacy.protected === false ? "no" : "unsure"}
                    options={PROTECTION}
                    // "Not sure" leaves `protected` out: unknown.
                    onChange={(v) =>
                      setField(
                        "intimacy",
                        v === "yes" || v === "no" ? { occurred: true, protected: v === "yes" } : { occurred: true }
                      )
                    }
                    className={SEGMENTS}
                  />
                </div>
              )}
            </Section>
          </div>
        </section>
      </div>
    </Sheet>
  );
}

function Section({ title, aside, children }: { title: string; aside?: string | null; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-lg">{title}</h3>
        {aside ? <span className="text-sm text-muted-foreground">{aside}</span> : null}
      </div>
      {children}
    </section>
  );
}
