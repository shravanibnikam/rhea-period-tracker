import { useState } from "react";
import { X, Download, Upload, Trash2, AlertTriangle, FileUp, LogOut } from "lucide-react";
import { exportData, importData, eraseAllData, downloadJSON, saveLog, type ExportData } from "@/lib/db";
import { parseImportFile, sourceLabel, type ImportResult } from "@/lib/import";
import { PairingSection } from "./PairingSection";
import { SharingControls } from "./SharingControls";
import type { UserRole } from "@/hooks/useAuth";

interface SettingsViewProps {
  onClose: () => void;
  onDataChanged: () => void;
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

export function SettingsView({
  onClose,
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
  const [showEraseConfirm, setShowEraseConfirm] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [overrideInput, setOverrideInput] = useState(
    cycleLengthOverride ? String(cycleLengthOverride) : ""
  );

  // Import preview state
  const [importPreview, setImportPreview] = useState<ImportResult | null>(null);

  const showStatus = (msg: string) => {
    setStatus(msg);
    setTimeout(() => setStatus(null), 4000);
  };

  const handleExport = async () => {
    const data = await exportData();
    downloadJSON(data);
    showStatus("Data exported successfully");
  };

  const handleRheaBackupImport = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data: ExportData = JSON.parse(text);
        if (data.version !== 1 || !Array.isArray(data.logs)) {
          showStatus("Invalid Rhea backup file");
          return;
        }
        await importData(data);
        onDataChanged();
        showStatus(`Imported ${data.logs.length} logs from Rhea backup`);
      } catch {
        showStatus("Failed to read backup file");
      }
    };
    input.click();
  };

  const handleAppImport = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv,.json,.xml,.txt";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const result = parseImportFile(text, file.name);

        if (result.source === "rhea_backup") {
          handleRheaBackupImport();
          return;
        }

        if (result.logs.length === 0) {
          showStatus(
            result.errors.length > 0
              ? result.errors[0]
              : "No period data found in file"
          );
          return;
        }

        setImportPreview(result);
      } catch {
        showStatus("Failed to read file");
      }
    };
    input.click();
  };

  const confirmImport = async () => {
    if (!importPreview) return;
    for (const log of importPreview.logs) {
      await saveLog(log);
    }
    onDataChanged();
    showStatus(
      `Imported ${importPreview.logs.length} days from ${sourceLabel(importPreview.source)}`
    );
    setImportPreview(null);
  };

  const handleErase = async () => {
    await eraseAllData();
    onDataChanged();
    setShowEraseConfirm(false);
    showStatus("All data erased");
  };

  const handleOverrideSubmit = () => {
    const parsed = parseInt(overrideInput, 10);
    if (overrideInput === "" || isNaN(parsed)) {
      onCycleLengthOverrideChange(null);
    } else if (parsed >= 18 && parsed <= 45) {
      onCycleLengthOverrideChange(parsed);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative w-full max-w-lg max-h-[85vh] bg-card rounded-t-3xl sm:rounded-3xl border border-border shadow-xl overflow-y-auto">
        <div className="sticky top-0 bg-card/95 backdrop-blur-sm border-b border-border px-6 py-4 flex items-center justify-between z-10 rounded-t-3xl">
          <h2 className="font-serif text-lg font-semibold text-foreground">
            Settings
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-muted transition-colors"
          >
            <X size={18} className="text-muted-foreground" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {status && (
            <div className="px-4 py-2.5 rounded-xl bg-muted text-sm text-foreground text-center">
              {status}
            </div>
          )}

          {/* Account (when logged in) — at the top for easy access */}
          {userId && onSignOut && (
            <div className="flex items-center justify-between p-4 rounded-xl border border-border">
              <div>
                <p className="text-sm font-medium text-foreground">
                  {userEmail}
                </p>
                <p className="text-xs text-muted-foreground capitalize">
                  {role ?? "owner"}
                </p>
              </div>
              <button
                onClick={onSignOut}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors"
              >
                <LogOut size={14} />
                Sign out
              </button>
            </div>
          )}

          {/* Import preview */}
          {importPreview && (
            <div className="p-4 rounded-xl border-2 border-primary/30 bg-primary/5">
              <p className="text-sm font-medium text-foreground mb-1">
                Import from {sourceLabel(importPreview.source)}
              </p>
              <p className="text-xs text-muted-foreground mb-3">
                Found {importPreview.logs.length} days of period data.
                {importPreview.errors.length > 0 && (
                  <> {importPreview.errors.length} rows skipped.</>
                )}
              </p>
              {importPreview.logs.length > 0 && (
                <p className="text-xs text-muted-foreground mb-3">
                  Date range: {importPreview.logs[0].date} to{" "}
                  {importPreview.logs[importPreview.logs.length - 1].date}
                </p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => setImportPreview(null)}
                  className="flex-1 py-2 rounded-xl text-sm font-medium border border-border hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmImport}
                  className="flex-1 py-2 rounded-xl text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
                >
                  Import {importPreview.logs.length} days
                </button>
              </div>
            </div>
          )}

          {/* Cycle length override */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              Cycle Length Override
            </p>
            <p className="text-xs text-muted-foreground mb-3">
              Leave empty to use auto-calculated average from your logs.
            </p>
            <div className="flex gap-2">
              <input
                type="number"
                min={18}
                max={45}
                value={overrideInput}
                onChange={(e) => setOverrideInput(e.target.value)}
                placeholder="e.g. 28"
                className="flex-1 rounded-xl border border-border bg-muted/50 px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <button
                onClick={handleOverrideSubmit}
                className="px-4 py-2.5 rounded-xl text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
              >
                Set
              </button>
            </div>
            {cycleLengthOverride && (
              <p className="text-xs text-muted-foreground mt-2">
                Currently set to {cycleLengthOverride} days.{" "}
                <button
                  onClick={() => {
                    setOverrideInput("");
                    onCycleLengthOverrideChange(null);
                  }}
                  className="text-primary underline"
                >
                  Clear
                </button>
              </p>
            )}
          </div>

          {/* Data management */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Your Data
            </p>
            <div className="space-y-2">
              <button
                onClick={handleExport}
                className="w-full flex items-center gap-3 p-4 rounded-xl border border-border hover:bg-muted/50 transition-colors text-left"
              >
                <Download size={18} className="text-primary flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Export backup
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Download all your data as a JSON file
                  </p>
                </div>
              </button>

              <button
                onClick={handleRheaBackupImport}
                className="w-full flex items-center gap-3 p-4 rounded-xl border border-border hover:bg-muted/50 transition-colors text-left"
              >
                <Upload size={18} className="text-primary flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Import Rhea backup
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Restore data from a previous Rhea export
                  </p>
                </div>
              </button>

              <button
                onClick={handleAppImport}
                className="w-full flex items-center gap-3 p-4 rounded-xl border border-border hover:bg-muted/50 transition-colors text-left"
              >
                <FileUp size={18} className="text-primary flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Import from another app
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Clue, Flo, Apple Health, or any CSV
                  </p>
                </div>
              </button>

              {!showEraseConfirm ? (
                <button
                  onClick={() => setShowEraseConfirm(true)}
                  className="w-full flex items-center gap-3 p-4 rounded-xl border border-destructive/30 hover:bg-destructive/5 transition-colors text-left"
                >
                  <Trash2 size={18} className="text-destructive flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-destructive">
                      Erase all data
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Permanently delete all logs and settings
                    </p>
                  </div>
                </button>
              ) : (
                <div className="p-4 rounded-xl border-2 border-destructive/50 bg-destructive/5">
                  <div className="flex items-start gap-3 mb-3">
                    <AlertTriangle
                      size={18}
                      className="text-destructive flex-shrink-0 mt-0.5"
                    />
                    <div>
                      <p className="text-sm font-medium text-destructive">
                        Are you sure?
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        This will permanently delete all your logs, settings,
                        and cycle history. This cannot be undone.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowEraseConfirm(false)}
                      className="flex-1 py-2 rounded-xl text-sm font-medium border border-border hover:bg-muted transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleErase}
                      className="flex-1 py-2 rounded-xl text-sm font-medium bg-destructive text-destructive-foreground hover:opacity-90 transition-opacity"
                    >
                      Erase Everything
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Pairing (when logged in) */}
          {userId && onRoleChanged && (
            <PairingSection
              userId={userId}
              role={role ?? null}
              onRoleChanged={onRoleChanged}
            />
          )}

          {/* Sharing controls (owner only, when paired) */}
          {userId && role === "owner" && (
            <SharingControls ownerId={userId} />
          )}

          {/* App info */}
          <div className="pt-4 border-t border-border space-y-3">
            <button
              onClick={onSourcesClick}
              className="w-full text-center text-xs text-primary hover:underline"
            >
              Sources &amp; references
            </button>
            <button
              onClick={onPrivacyClick}
              className="w-full text-center text-xs text-primary hover:underline"
            >
              Privacy policy
            </button>
            <p className="text-xs text-center text-muted-foreground">
              Rhea v0.1.0 &middot;{" "}
              {userId
                ? "Synced securely"
                : "Your data never leaves this device"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
