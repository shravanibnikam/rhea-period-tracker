import { useState, useEffect, useRef, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { Moon } from "lucide-react";
import { toast } from "sonner";
import { logAudit, getAuditLog, formatAction, type AuditEntry } from "@/app/lib/audit";
import {
  SHARE_KEYS,
  getShareSettings,
  setShareSetting,
  getQuietWindows,
  addQuietWindow,
  removeQuietWindow,
  isInQuietWindow,
  type ShareSettings,
  type ShareKey,
  type QuietWindow,
} from "@/app/lib/sharing";
import { parseDate, toDateKey } from "@/domain/dates";
import { fmt } from "@/app/lib/format";
import { Button } from "@/app/components/ui/Button";
import { Switch } from "@/app/components/ui/controls";
import { Section, Panel, RetryRow, fieldClass, formatDay } from "./Section";

interface SharingControlsProps {
  ownerId: string;
}

/** "Nov 9 to Nov 12, 2026": the year once when both days share it. */
const span = ({ start_date: start, end_date: end }: Pick<QuietWindow, "start_date" | "end_date">) => {
  if (start === end) return formatDay(start);
  const first = start.slice(0, 4) === end.slice(0, 4) ? fmt(parseDate(start)) : formatDay(start);
  return `${first} to ${formatDay(end)}`;
};

/**
 * An activity entry's target as people read it: a share key's label, a quiet
 * window's days, or a retired key in words ("shared_notes" → "Shared notes").
 */
const targetText = (target: string) => {
  const range = /^(\d{4}-\d{2}-\d{2}) to (\d{4}-\d{2}-\d{2})$/.exec(target);
  if (range) return span({ start_date: range[1], end_date: range[2] });
  const label = SHARE_KEYS.find((k) => k.key === target)?.label;
  if (label) return label;
  return /^[a-z]+(_[a-z]+)+$/.test(target) ? target[0].toUpperCase() + target.slice(1).replace(/_/g, " ") : target;
};

/** A change the server didn't take: logged, and said out loud. */
const saveFailed = (err: unknown) => {
  console.error("Failed to save a sharing change:", err);
  toast.error("Couldn't save that change. Check your connection and try again.");
};

/** A switch with its title as the accessible name; the whole row toggles it. */
function SwitchRow({
  id,
  label,
  description,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: () => void;
}) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start justify-between gap-4 py-4">
      <span className="min-w-0 flex-1">
        <span id={`${id}-label`} className="block text-foreground">
          {label}
        </span>
        <span id={`${id}-hint`} className="mt-0.5 block text-sm font-normal text-muted-foreground">
          {description}
        </span>
      </span>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-hint`}
      />
    </label>
  );
}

/** The owner's partner-view choices, quiet windows and activity log: three Settings sections. */
export function SharingControls({ ownerId }: SharingControlsProps) {
  const [settings, setSettings] = useState<ShareSettings | null>(null);
  const [quietWindows, setQuietWindows] = useState<QuietWindow[]>([]);
  const [showAddQuiet, setShowAddQuiet] = useState(false);
  const [quietStart, setQuietStart] = useState(() => toDateKey(new Date()));
  const [quietEnd, setQuietEnd] = useState(() => toDateKey(new Date()));
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [auditFailed, setAuditFailed] = useState(false);
  const [showAudit, setShowAudit] = useState(false);
  // Switches whose save is in flight. A ref, not state: a second tap must see
  // the first at once, whatever has rendered.
  const savingKeys = useRef(new Set<ShareKey>());
  const addQuietButton = useRef<HTMLButtonElement>(null);
  const quietStartField = useRef<HTMLInputElement>(null);
  const auditToggle = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let current = true;
    Promise.all([getShareSettings(ownerId), getQuietWindows(ownerId)])
      .then(([s, qw]) => {
        if (!current) return;
        flushSync(() => {
          setSettings(s);
          setQuietWindows(qw);
          setLoadFailed(false);
          setLoading(false);
        });
        // After Try again, focus goes to the first switch, not the page.
        if (attempt > 0) document.getElementById(`share-${SHARE_KEYS[0].key}`)?.focus();
      })
      .catch((err) => {
        // Unknown choices: show none rather than all-off switches.
        console.error("Failed to load sharing settings:", err);
        if (!current) return;
        setLoadFailed(true);
        setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [ownerId, attempt]);

  const handleToggle = async (key: ShareKey) => {
    // One save per switch: a tap while its save is in flight is ignored, so a
    // failure always reverts to the value the server still has.
    if (!settings || savingKeys.current.has(key)) return;
    savingKeys.current.add(key);
    const newValue = !settings[key];
    const showValue = (value: boolean) => setSettings((s) => s && { ...s, [key]: value });
    showValue(newValue);
    try {
      await setShareSetting(ownerId, key, newValue);
    } catch (err) {
      // The switch goes back: it never shows a choice the server doesn't have.
      showValue(!newValue);
      saveFailed(err);
      return;
    } finally {
      savingKeys.current.delete(key);
    }
    await logAudit(ownerId, newValue ? "share.toggle_on" : "share.toggle_off", key);
  };

  // Date keys compare as strings (YYYY-MM-DD); both days are included.
  const startInvalid = !quietStart;
  const endInvalid = !quietEnd || (!startInvalid && quietEnd < quietStart);
  const rangeError =
    startInvalid || !quietEnd
      ? "Choose a first and a last day."
      : endInvalid
        ? "The last day is before the first day. Choose a last day on or after the first."
        : null;

  /** Closes the add form; focus goes back to the button that opens it. */
  const closeQuietForm = () => {
    flushSync(() => setShowAddQuiet(false));
    addQuietButton.current?.focus();
  };

  const handleAddQuiet = async (e: FormEvent) => {
    e.preventDefault();
    if (rangeError || saving) return;
    setSaving(true);
    try {
      await addQuietWindow(ownerId, quietStart, quietEnd);
    } catch (err) {
      setSaving(false);
      saveFailed(err);
      return;
    }
    // Saved: the form closes whatever happens next, so trying again can't add it twice.
    setSaving(false);
    closeQuietForm();
    await logAudit(ownerId, "quiet.added", `${quietStart} to ${quietEnd}`);
    try {
      setQuietWindows(await getQuietWindows(ownerId));
    } catch (err) {
      console.error("Failed to refresh quiet windows:", err);
      toast("Quiet window added, but the list couldn't refresh. Reopen Settings to see it.");
    }
  };

  const handleRemoveQuiet = async (qw: QuietWindow) => {
    try {
      await removeQuietWindow(qw.id);
    } catch (err) {
      saveFailed(err);
      return;
    }
    await logAudit(ownerId, "quiet.removed", `${qw.start_date} to ${qw.end_date}`);
    // Its Remove button goes with it: focus moves to the open form, or the button that opens one.
    (quietStartField.current ?? addQuietButton.current)?.focus();
    setQuietWindows((prev) => prev.filter((w) => w.id !== qw.id));
  };

  /** Reads the activity log; a failure shows a retry, never an empty log. */
  const loadAudit = async () => {
    try {
      setAuditEntries(await getAuditLog(ownerId));
      setAuditFailed(false);
      return true;
    } catch (err) {
      console.error("Failed to load the activity log:", err);
      setAuditFailed(true);
      return false;
    }
  };

  const toggleAudit = async () => {
    if (!showAudit) await loadAudit();
    setShowAudit(!showAudit);
  };

  if (loadFailed || !settings) {
    return (
      <Section title="Partner view">
        <Panel>
          {loadFailed ? (
            <RetryRow
              message={
                loading
                  ? "Loading your sharing choices…"
                  : "Couldn't load your sharing choices. Check your connection and try again."
              }
              busy={loading}
              onRetry={() => {
                setLoading(true);
                setAttempt((n) => n + 1);
              }}
            />
          ) : (
            <p role="status" className="py-4 text-sm text-muted-foreground">
              Loading your sharing choices…
            </p>
          )}
        </Panel>
      </Section>
    );
  }

  const currentlyQuiet = isInQuietWindow(quietWindows);

  return (
    <>
      <Section
        title="Partner view"
        description={
          <p>
            Choose what Rhea&apos;s partner view shows. Everything starts off. These choices are applied by the app,
            not the server: a linked partner&apos;s account can read your synced logs.
          </p>
        }
      >
        <Panel>
          {currentlyQuiet && (
            <div className="flex items-start gap-3 py-4">
              <Moon size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-muted-foreground" />
              <p className="text-sm text-foreground">
                Paused today by a quiet window: the partner view shows a pause message instead of these.
              </p>
            </div>
          )}
          {SHARE_KEYS.map(({ key, label, description }) => (
            <SwitchRow
              key={key}
              id={`share-${key}`}
              label={label}
              description={description}
              checked={settings[key]}
              onCheckedChange={() => handleToggle(key)}
            />
          ))}
        </Panel>
      </Section>

      <Section
        title="Quiet windows"
        description={<p>Pause the partner view on the days you choose, whatever is turned on above.</p>}
      >
        <Panel>
          {quietWindows.length > 0 ? (
            <ul className="divide-y divide-border">
              {quietWindows.map((qw) => (
                <li key={qw.id} className="flex items-center justify-between gap-4 py-2">
                  <span className="text-foreground tabular-nums">{span(qw)}</span>
                  <Button variant="ghost" onClick={() => handleRemoveQuiet(qw)} aria-label={`Remove quiet window ${span(qw)}`}>
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-4 text-sm text-muted-foreground">No quiet windows yet.</p>
          )}

          {showAddQuiet ? (
            <form className="space-y-4 py-4" onSubmit={handleAddQuiet} noValidate>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="quiet-start" className="block text-sm text-foreground">
                    First day
                  </label>
                  <input
                    ref={quietStartField}
                    id="quiet-start"
                    type="date"
                    required
                    autoFocus
                    value={quietStart}
                    onChange={(e) => setQuietStart(e.target.value)}
                    aria-invalid={startInvalid}
                    aria-describedby={startInvalid ? "quiet-error" : undefined}
                    className={fieldClass}
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="quiet-end" className="block text-sm text-foreground">
                    Last day
                  </label>
                  <input
                    id="quiet-end"
                    type="date"
                    required
                    min={quietStart || undefined}
                    value={quietEnd}
                    onChange={(e) => setQuietEnd(e.target.value)}
                    aria-invalid={endInvalid}
                    aria-describedby={endInvalid ? "quiet-error" : undefined}
                    className={fieldClass}
                  />
                </div>
              </div>
              {rangeError && (
                <p id="quiet-error" role="alert" className="text-sm text-destructive">
                  {rangeError}
                </p>
              )}
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="ghost" onClick={closeQuietForm}>
                  Cancel
                </Button>
                <Button type="submit" disabled={rangeError !== null} aria-disabled={saving || undefined}>
                  Add quiet window
                </Button>
              </div>
            </form>
          ) : (
            <div className="py-4">
              <Button ref={addQuietButton} variant="outline" onClick={() => setShowAddQuiet(true)}>
                Add quiet window
              </Button>
            </div>
          )}
        </Panel>
      </Section>

      <Section
        title="Activity log"
        description={<p>Changes to the partner view and quiet windows on this account, newest first.</p>}
      >
        <Panel>
          <div className="py-4">
            <Button
              ref={auditToggle}
              variant="outline"
              onClick={toggleAudit}
              aria-expanded={showAudit}
              aria-controls="activity-log"
            >
              {showAudit ? "Hide activity" : "Show activity"}
            </Button>
          </div>
          {showAudit &&
            (auditFailed ? (
              <div id="activity-log">
                <RetryRow
                  message="Couldn't load the activity log. Check your connection and try again."
                  onRetry={async () => {
                    // Try again goes with the failure: focus moves to the log's toggle.
                    if (await loadAudit()) auditToggle.current?.focus();
                  }}
                />
              </div>
            ) : auditEntries.length > 0 ? (
              <ol id="activity-log" className="max-h-80 divide-y divide-border overflow-y-auto">
                {auditEntries.map((entry) => (
                  <li key={entry.id} className="flex items-start justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{formatAction(entry.action)}</p>
                      {entry.target && (
                        <p className="text-sm text-muted-foreground">{targetText(entry.target)}</p>
                      )}
                    </div>
                    <time dateTime={entry.created_at} className="shrink-0 text-sm text-muted-foreground tabular-nums">
                      {fmt(new Date(entry.created_at), { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    </time>
                  </li>
                ))}
              </ol>
            ) : (
              <p id="activity-log" className="py-4 text-sm text-muted-foreground">
                No changes recorded yet.
              </p>
            ))}
        </Panel>
      </Section>
    </>
  );
}
