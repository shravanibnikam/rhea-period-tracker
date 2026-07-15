import { useState, useEffect } from "react";
import { Eye, EyeOff, Moon } from "lucide-react";
import { logAudit, getAuditLog, formatAction, type AuditEntry } from "@/lib/audit";
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
} from "@/lib/sharing";
import { toDateKey } from "@/lib/utils";

interface SharingControlsProps {
  ownerId: string;
}

export function SharingControls({ ownerId }: SharingControlsProps) {
  const [settings, setSettings] = useState<ShareSettings | null>(null);
  const [quietWindows, setQuietWindows] = useState<QuietWindow[]>([]);
  const [showAddQuiet, setShowAddQuiet] = useState(false);
  const [quietStart, setQuietStart] = useState(() => toDateKey(new Date()));
  const [quietEnd, setQuietEnd] = useState(() => toDateKey(new Date()));
  const [loading, setLoading] = useState(true);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [showAudit, setShowAudit] = useState(false);

  useEffect(() => {
    Promise.all([
      getShareSettings(ownerId),
      getQuietWindows(ownerId),
    ]).then(([s, qw]) => {
      setSettings(s);
      setQuietWindows(qw);
      setLoading(false);
    });
  }, [ownerId]);

  const handleToggle = async (key: ShareKey) => {
    if (!settings) return;
    const newValue = !settings[key];
    setSettings({ ...settings, [key]: newValue });
    await setShareSetting(ownerId, key, newValue);
    await logAudit(ownerId, newValue ? "share.toggle_on" : "share.toggle_off", key);
  };

  const handleAddQuiet = async () => {
    await addQuietWindow(ownerId, quietStart, quietEnd);
    await logAudit(ownerId, "quiet.added", `${quietStart} to ${quietEnd}`);
    const updated = await getQuietWindows(ownerId);
    setQuietWindows(updated);
    setShowAddQuiet(false);
  };

  const handleRemoveQuiet = async (id: string) => {
    await removeQuietWindow(id);
    await logAudit(ownerId, "quiet.removed", id);
    setQuietWindows((prev) => prev.filter((qw) => qw.id !== id));
  };

  if (loading || !settings) return null;

  const currentlyQuiet = isInQuietWindow(quietWindows);

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
        Sharing Controls
      </p>
      <p className="text-xs text-muted-foreground mb-4">
        Choose what your partner sees. Everything is off by default.
      </p>

      {currentlyQuiet && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-muted mb-4">
          <Moon size={14} className="text-muted-foreground" />
          <p className="text-xs text-muted-foreground">
            Sharing is paused — quiet window active
          </p>
        </div>
      )}

      <div className="space-y-2 mb-5">
        {SHARE_KEYS.map(({ key, label, description }) => (
          <button
            key={key}
            onClick={() => handleToggle(key)}
            className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-border hover:bg-muted/30 transition-colors text-left"
          >
            <div
              className={`w-9 h-5 rounded-full flex items-center px-0.5 transition-colors ${
                settings[key] ? "bg-primary" : "bg-muted"
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                  settings[key] ? "translate-x-4" : "translate-x-0"
                }`}
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">{label}</p>
              <p className="text-xs text-muted-foreground">{description}</p>
            </div>
            {settings[key] ? (
              <Eye size={14} className="text-primary flex-shrink-0" />
            ) : (
              <EyeOff size={14} className="text-muted-foreground flex-shrink-0" />
            )}
          </button>
        ))}
      </div>

      {/* Quiet windows */}
      <div className="pt-4 border-t border-border">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Quiet Windows
        </p>
        <p className="text-xs text-muted-foreground mb-3">
          Pause all sharing for chosen days, regardless of toggles.
        </p>

        {quietWindows.length > 0 && (
          <div className="space-y-2 mb-3">
            {quietWindows.map((qw) => (
              <div
                key={qw.id}
                className="flex items-center justify-between p-3 rounded-xl bg-muted"
              >
                <p className="text-xs text-foreground">
                  {qw.start_date} &rarr; {qw.end_date}
                </p>
                <button
                  onClick={() => handleRemoveQuiet(qw.id)}
                  className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        {showAddQuiet ? (
          <div className="space-y-2 p-3 rounded-xl border border-border">
            <div className="flex gap-2">
              <input
                type="date"
                value={quietStart}
                onChange={(e) => setQuietStart(e.target.value)}
                className="flex-1 rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <span className="text-xs text-muted-foreground self-center">&rarr;</span>
              <input
                type="date"
                value={quietEnd}
                onChange={(e) => setQuietEnd(e.target.value)}
                className="flex-1 rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowAddQuiet(false)}
                className="flex-1 py-2 rounded-lg text-xs font-medium border border-border hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddQuiet}
                className="flex-1 py-2 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
              >
                Add
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowAddQuiet(true)}
            className="text-xs text-primary hover:underline"
          >
            + Add quiet window
          </button>
        )}
      </div>

      {/* Audit log */}
      <div className="pt-4 border-t border-border">
        <button
          onClick={async () => {
            if (!showAudit) {
              const entries = await getAuditLog(ownerId);
              setAuditEntries(entries);
            }
            setShowAudit(!showAudit);
          }}
          className="text-xs text-primary hover:underline"
        >
          {showAudit ? "Hide activity log" : "View activity log"}
        </button>

        {showAudit && auditEntries.length > 0 && (
          <div className="mt-3 space-y-1.5 max-h-48 overflow-y-auto">
            {auditEntries.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between py-1.5">
                <div>
                  <p className="text-xs text-foreground">{formatAction(entry.action)}</p>
                  {entry.target && (
                    <p className="text-xs text-muted-foreground">{entry.target}</p>
                  )}
                </div>
                <p className="text-xs text-muted-foreground flex-shrink-0 ml-3">
                  {new Date(entry.created_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            ))}
          </div>
        )}

        {showAudit && auditEntries.length === 0 && (
          <p className="mt-3 text-xs text-muted-foreground">No activity yet.</p>
        )}
      </div>
    </div>
  );
}
