import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ChevronRight, LogOut } from "lucide-react";
import { toast } from "sonner";
import { APP_VERSION, downloadJSON } from "@/data/exporter";
import { parseImportFile, sourceLabel, type ImportResult } from "@/data/importer";
import { deriveCycleState } from "@/domain/cycle";
import { toDateKey } from "@/domain/dates";
import { isRheaError } from "@/kernel";
import { useContainer } from "@/app/di";
import { useTheme, type ThemePref } from "@/app/hooks/useTheme";
import type { UserRole } from "@/app/hooks/useAuth";
import {
  CALENDAR_EVENTS,
  SUMMARY_CYCLES,
  downloadText,
  logsToCSV,
  predictionsToICS,
  summarizeCycles,
  type CycleSummary,
} from "@/app/lib/exports";
import { cn } from "@/app/lib/cn";
import { Button } from "@/app/components/ui/Button";
import { Segmented, type SegmentedOption } from "@/app/components/ui/controls";
import { PairingSection } from "./PairingSection";
import { SharingControls } from "./SharingControls";
import { ClinicianSummary } from "./ClinicianSummary";
import { Section, Panel, Row, fieldClass, formatDay as day } from "./Section";

interface SettingsViewProps {
  /** Unused since Settings became a screen: the app's navigation leaves it. Kept for callers. */
  onClose?: () => void;
  onDataChanged: () => void;
  /** The override as the caller last knew it; Settings re-reads the stored value. */
  cycleLengthOverride: number | null;
  onCycleLengthOverrideChange: (value: number | null) => void;
  onSourcesClick: () => void;
  onPrivacyClick: () => void;
  // Auth props (optional — absent when running local-only)
  userId?: string | null;
  userEmail?: string | null;
  role?: UserRole;
  onSignOut?: () => void;
  onRoleChanged?: () => void;
}

const THEMES: readonly SegmentedOption<ThemePref>[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

const MIN_CYCLE = 18;
const MAX_CYCLE = 45;

const linkRow =
  "flex min-h-12 w-full items-center justify-between gap-4 px-5 py-3 text-left font-medium text-foreground transition-colors hover:bg-muted/60 focus-visible:-outline-offset-2"; // the panel clips an outside ring

const ROLE_LABEL: Record<NonNullable<UserRole>, string> = {
  owner: "Tracking your cycle",
  partner: "Joined as a partner",
};

export function SettingsView({
  onDataChanged,
  cycleLengthOverride,
  onCycleLengthOverrideChange,
  onSourcesClick,
  onPrivacyClick,
  userId,
  userEmail,
  role,
  onSignOut,
  onRoleChanged,
}: SettingsViewProps) {
  const container = useContainer();
  const { theme, setTheme } = useTheme();

  const [override, setOverride] = useState(cycleLengthOverride);
  const [lengthInput, setLengthInput] = useState(cycleLengthOverride ? String(cycleLengthOverride) : "");
  const [lengthError, setLengthError] = useState<string | null>(null);

  const [importPreview, setImportPreview] = useState<ImportResult | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);
  const [confirmErase, setConfirmErase] = useState(false);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<CycleSummary | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);

  // The stored override is the truth (predictions read it); a backup import or
  // an erase changes it underneath whatever the caller holds.
  const readOverride = useCallback(async () => {
    const stored = (await container.getMeta<number>("cycleLengthOverride")) ?? null;
    setOverride(stored);
    setLengthInput(stored ? String(stored) : "");
  }, [container]);

  useEffect(() => {
    readOverride().catch(console.error);
  }, [readOverride]);

  // ── Cycle length ──
  const applyLength = (value: number | null) => {
    setLengthError(null);
    setOverride(value);
    setLengthInput(value ? String(value) : "");
    onCycleLengthOverrideChange(value);
    toast(value ? `Predictions now use a ${value}-day cycle` : "Predictions use the average of your logged cycles");
  };

  const saveLength = (e: FormEvent) => {
    e.preventDefault();
    const raw = lengthInput.trim();
    if (raw === "") return applyLength(null);
    const days = Number(raw);
    if (!Number.isInteger(days)) {
      setLengthError("Enter a whole number of days, like 28.");
    } else if (days < MIN_CYCLE || days > MAX_CYCLE) {
      setLengthError(`${days} days is outside the ${MIN_CYCLE} to ${MAX_CYCLE} days Rhea can predict with.`);
    } else {
      applyLength(days);
    }
  };

  // ── Your data ──
  /** One data action; a failure is said under the data panels, in the words given. */
  const run = (failure: string, action: () => Promise<void>) => async () => {
    setDataError(null);
    setBusy(true);
    try {
      await action();
    } catch (err) {
      console.error(err);
      setDataError(isRheaError(err) ? err.userMessage : failure);
    } finally {
      setBusy(false);
    }
  };

  /** Logs and predictions exactly as useCycleData derives them. */
  const readCycles = async () => {
    const [logs, stored, excluded] = await Promise.all([
      container.getAllLogs(),
      container.getMeta<number>("cycleLengthOverride"),
      container.getMeta<string[]>("excludedCycles"),
    ]);
    return { logs, state: deriveCycleState(logs, stored ?? null, new Date(), new Set(excluded ?? [])) };
  };

  const READ_FAILED = "Couldn't read the logs on this device. Please try again.";
  const today = () => toDateKey(new Date());

  const exportBackup = run(READ_FAILED, async () => {
    downloadJSON(await container.exportBackup());
    toast("Backup downloaded");
  });

  const exportCSV = run(READ_FAILED, async () => {
    const logs = await container.getAllLogs();
    if (logs.length === 0) return void toast("Nothing to export: no days are logged on this device.");
    downloadText(logsToCSV(logs), `rhea-logs-${today()}.csv`, "text/csv;charset=utf-8");
    toast(`Exported ${logs.length} ${logs.length === 1 ? "day" : "days"}`);
  });

  const exportCalendar = run(READ_FAILED, async () => {
    const ics = predictionsToICS((await readCycles()).state);
    if (!ics) return void toast("Log a period first: predictions start from it.");
    downloadText(ics, `rhea-predicted-periods-${today()}.ics`, "text/calendar;charset=utf-8");
    toast("Calendar file downloaded. Open it to add the dates to your calendar.");
  });

  const openSummary = run(READ_FAILED, async () => {
    const { logs, state } = await readCycles();
    setSummary(summarizeCycles(state.cycles, logs));
    setSummaryOpen(true);
  });

  /** Opens the file picker; `onFile` runs with the chosen file. */
  const pickFile = (accept: string, onFile: (file: File) => Promise<void>) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) void onFile(file);
    };
    input.click();
  };

  const importBackupText = async (text: string) => {
    // Accepts version 1 or 2; newer versions are rejected with clear copy.
    const { imported, skipped } = await container.importBackup(text);
    onDataChanged();
    await readOverride(); // a backup restores settings too
    toast(
      skipped > 0
        ? `Imported ${imported} days (${skipped} already up to date)`
        : `Imported ${imported} days from your Rhea backup`
    );
  };

  const importRheaBackup = () =>
    pickFile(".json", async (file) =>
      run("Couldn't read that backup file. Choose a .json file exported from Rhea.", async () =>
        importBackupText(await file.text())
      )()
    );

  const importFromApp = () =>
    pickFile(".csv,.json,.xml,.txt", async (file) =>
      run("Couldn't read that file.", async () => {
        setImportPreview(null);
        const text = await file.text();
        const result = parseImportFile(text, file.name);
        if (result.source === "rhea_backup") return importBackupText(text);
        if (result.logs.length === 0) {
          setDataError(result.errors[0] ?? "No period data found in that file.");
          return;
        }
        setImportPreview(result);
      })()
    );

  const confirmImport = run("Couldn't save the imported days. Please try again.", async () => {
    if (!importPreview) return;
    // Merge into existing logs (never blind-overwrite a rich local entry).
    const { imported } = await container.importParsedLogs(importPreview.logs);
    onDataChanged();
    toast(`Imported ${imported} days from ${sourceLabel(importPreview.source)}`);
    setImportPreview(null);
  });

  const erase = run("Couldn't erase this device. Please try again.", async () => {
    await container.eraseAllData();
    onDataChanged();
    await readOverride();
    setConfirmErase(false);
    toast("Data on this device erased");
  });

  const previewDates = importPreview?.logs.map((l) => l.date).sort() ?? [];
  const skippedRows = importPreview?.errors.filter((e) => e.startsWith("Skipped")).length ?? 0;
  const importNotes = importPreview?.errors.filter((e) => !e.startsWith("Skipped")) ?? [];

  return (
    <div className="mx-auto w-full max-w-5xl">
      <h1 className="text-3xl text-foreground">Settings</h1>

      <div className="mt-2">
        {userId && onSignOut ? (
          <Section title="Account">
            <Panel>
              <Row
                title={<span className="break-all">{userEmail ?? "Signed in"}</span>}
                description={role ? ROLE_LABEL[role] : undefined}
                action={
                  <Button variant="outline" onClick={onSignOut}>
                    <LogOut size={16} aria-hidden="true" />
                    Sign out
                  </Button>
                }
              />
            </Panel>
          </Section>
        ) : null}

        <Section title="Appearance">
          <Panel>
            <Row
              title="Theme"
              description="System follows your device's light or dark setting."
              action={
                <Segmented
                  label="Theme"
                  value={theme}
                  options={THEMES}
                  onChange={(v) => v && setTheme(v)}
                  className="w-full sm:w-72"
                />
              }
            />
          </Panel>
        </Section>

        <Section
          title="Cycle"
          description={
            <p>Set a length if you know your cycle better than your logs do, for example with only a few cycles logged.</p>
          }
        >
          <Panel>
            <Row
              title="Cycle length"
              description={
                override ? (
                  <>
                    Predictions use a <span className="font-medium text-foreground tabular-nums">{override}-day</span>{" "}
                    cycle that you set.
                  </>
                ) : (
                  "Predictions use the average of your logged cycles."
                )
              }
              action={
                override ? (
                  <Button variant="outline" onClick={() => applyLength(null)}>
                    Clear
                  </Button>
                ) : undefined
              }
            />
            <form onSubmit={saveLength} noValidate className="space-y-2 py-4">
              <label htmlFor="cycle-length" className="block text-sm text-foreground">
                Length in days
              </label>
              <div className="flex gap-2">
                <input
                  id="cycle-length"
                  name="cycle-length"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="28"
                  value={lengthInput}
                  onChange={(e) => {
                    setLengthInput(e.target.value);
                    setLengthError(null);
                  }}
                  aria-invalid={lengthError !== null}
                  aria-describedby={lengthError ? "cycle-length-error" : "cycle-length-hint"}
                  className={cn(fieldClass, "w-28 tabular-nums")}
                />
                <Button type="submit" variant="outline">
                  Save
                </Button>
              </div>
              {lengthError ? (
                <p id="cycle-length-error" role="alert" className="text-sm text-destructive">
                  {lengthError}
                </p>
              ) : (
                <p id="cycle-length-hint" className="text-sm text-muted-foreground">
                  From {MIN_CYCLE} to {MAX_CYCLE} days. Leave it empty to use your average.
                </p>
              )}
            </form>
          </Panel>
        </Section>

        <Section
          title="Your data"
          description={
            <p>
              {role === "partner"
                ? "This device keeps a copy of your partner's synced logs for the partner view. Erasing it here is undone the next time the app syncs."
                : "Your logs are stored on this device. Take a copy in the format you need, bring days in from another app, or erase this device."}
            </p>
          }
        >
          {/* A partner's store is the owner's cache, ungated by the share switches: never export or import it. */}
          {role !== "partner" && (
            <>
              <Panel>
                <Row
                  title="Backup"
                  description="Everything on this device in one JSON file, to restore here or on another device."
                  action={
                    <Button variant="outline" onClick={exportBackup} disabled={busy}>
                      Export backup
                    </Button>
                  }
                />
                <Row
                  title="Spreadsheet"
                  description="Every logged day as a row (CSV), for Excel, Numbers or Google Sheets."
                  action={
                    <Button variant="outline" onClick={exportCSV} disabled={busy}>
                      Export CSV
                    </Button>
                  }
                />
                <Row
                  title="Calendar"
                  description={`Your next ${CALENDAR_EVENTS} predicted periods as all-day events (.ics). Each one asks your calendar app for a reminder the day before.`}
                  action={
                    <Button variant="outline" onClick={exportCalendar} disabled={busy}>
                      Export calendar
                    </Button>
                  }
                />
                <Row
                  title="Summary for a clinician"
                  description={`Your last ${SUMMARY_CYCLES} cycles, averages and most-logged symptoms on one page to print.`}
                  action={
                    <Button variant="outline" onClick={openSummary} disabled={busy}>
                      Open summary
                    </Button>
                  }
                />
              </Panel>

              <Panel>
                <Row
                  title="Rhea backup"
                  description="Restore from a backup file. Its days are merged with the ones already here."
                  action={
                    <Button variant="outline" onClick={importRheaBackup} disabled={busy}>
                      Import backup
                    </Button>
                  }
                />
                <div>
                  <Row
                    title="Another app"
                    description="Clue, Flo, Apple Health or any CSV with a date column. You see what was found before anything is saved."
                    action={
                      <Button variant="outline" onClick={importFromApp} disabled={busy}>
                        Choose file
                      </Button>
                    }
                  />
                  {importPreview && (
                    <div className="mb-4 space-y-3 rounded-xl bg-muted p-4">
                      <div>
                        <p className="font-medium text-foreground">
                          {importPreview.logs.length} days found in {sourceLabel(importPreview.source)}
                        </p>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                          {day(previewDates[0])} to {day(previewDates[previewDates.length - 1])}.
                          {skippedRows > 0 && ` ${skippedRows} ${skippedRows === 1 ? "row" : "rows"} skipped.`}
                        </p>
                        {importNotes.map((note) => (
                          <p key={note} className="mt-0.5 text-sm text-muted-foreground">
                            {note}
                          </p>
                        ))}
                      </div>
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button variant="ghost" onClick={() => setImportPreview(null)}>
                          Cancel
                        </Button>
                        <Button onClick={confirmImport} disabled={busy}>
                          Import {importPreview.logs.length} days
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </Panel>
            </>
          )}

          {dataError && (
            <p role="alert" className="text-sm text-destructive">
              {dataError}
            </p>
          )}

          <Panel>
            <div>
              <Row
                title="Erase this device"
                description="Deletes the logs, settings and cycle history stored here, after you confirm."
                action={
                  confirmErase ? undefined : (
                    <Button variant="destructive-outline" onClick={() => setConfirmErase(true)}>
                      Erase
                    </Button>
                  )
                }
              />
              {confirmErase && (
                <div className="mb-4 space-y-3 rounded-xl bg-muted p-4">
                  <p className="text-sm text-foreground">
                    This deletes all your logs, settings and cycle history on this device.
                    {userId &&
                      " It does not sign you out or delete data already synced to your account: that stays on the server and downloads again the next time the app syncs."}
                  </p>
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button variant="ghost" onClick={() => setConfirmErase(false)} autoFocus>
                      Cancel
                    </Button>
                    <Button variant="destructive" onClick={erase} disabled={busy}>
                      Erase this device
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </Panel>
        </Section>

        <Section title="Sync">
          <Panel>
            {!userId ? (
              <Row title="This device only" description="Nothing is sent anywhere." />
            ) : role === "partner" ? (
              <Row
                title="Reading your partner's logs"
                description="Your partner's synced logs download to this device over TLS. Synced data is not end-to-end encrypted."
              />
            ) : (
              <Row
                title="Synced to your account"
                description="Your logs sync to your account over TLS. Synced data is not end-to-end encrypted."
              />
            )}
          </Panel>
        </Section>

        {userId && onRoleChanged ? (
          <Section
            title="Partner"
            description={
              <p>
                {role === "owner"
                  ? "Link a partner's account with a one-time invite code. Their partner view shows only what you turn on below."
                  : "Link to your partner's account with the invite code they send you."}
              </p>
            }
          >
            <PairingSection userId={userId} role={role ?? null} onRoleChanged={onRoleChanged} />
          </Section>
        ) : null}

        {userId && role === "owner" ? <SharingControls ownerId={userId} /> : null}

        <Section title="About">
          <Panel className="overflow-hidden px-0">
            <button type="button" onClick={onSourcesClick} className={linkRow}>
              Sources &amp; references
              <ChevronRight size={18} aria-hidden="true" className="text-muted-foreground" />
            </button>
            <button type="button" onClick={onPrivacyClick} className={linkRow}>
              Privacy policy
              <ChevronRight size={18} aria-hidden="true" className="text-muted-foreground" />
            </button>
            <a href="#welcome" className={linkRow}>
              About Rhea
              <ChevronRight size={18} aria-hidden="true" className="text-muted-foreground" />
            </a>
            <p className="px-5 py-3 text-sm text-muted-foreground">Rhea v{APP_VERSION}</p>
          </Panel>
        </Section>
      </div>

      <ClinicianSummary open={summaryOpen} onOpenChange={setSummaryOpen} summary={summary} />
    </div>
  );
}
