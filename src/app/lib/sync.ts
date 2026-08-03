import { supabase } from "@/app/lib/supabase";
import { container } from "@/app/di";
import type { DailyLog } from "@/domain/types";
import type { RealtimeChannel } from "@supabase/supabase-js";

// ─── Write guard (M0.4 / RHEA-014) ───────────────────────────────────────────
// Only an owner may push logs to the server. A partner is read-only; this guard
// makes the push functions hard no-ops so a partner client can never write owner
// data, independent of any UI gating.

let readOnly = false;

export function setSyncReadOnly(value: boolean): void {
  readOnly = value;
}

export function isSyncReadOnly(): boolean {
  return readOnly;
}

// ─── Push local logs to Supabase ─────────────────────────────────────────────

export async function pushAllLogs(ownerId: string): Promise<number> {
  if (readOnly) return 0;
  if (!supabase) return 0;

  const logs = await container.getAllLogs();
  if (logs.length === 0) return 0;

  const rows = logs.map((log) => ({
    owner_id: ownerId,
    date: log.date,
    flow: log.flow,
    symptoms: log.symptoms,
    mood: log.mood,
    energy: log.energy,
    notes: log.notes,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from("daily_logs")
    .upsert(rows, { onConflict: "owner_id,date" });

  if (error) {
    console.error("Push failed:", error.message);
    return 0;
  }

  return rows.length;
}

// ─── Push a single log to Supabase ───────────────────────────────────────────

export async function pushLog(ownerId: string, log: DailyLog): Promise<void> {
  if (readOnly) return;
  if (!supabase) return;

  const { error } = await supabase.from("daily_logs").upsert(
    {
      owner_id: ownerId,
      date: log.date,
      flow: log.flow,
      symptoms: log.symptoms,
      mood: log.mood,
      energy: log.energy,
      notes: log.notes,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "owner_id,date" }
  );

  if (error) {
    console.error("Push log failed:", error.message);
  }
}

// ─── Apply a remote delete locally ───────────────────────────────────────────

/**
 * Drop a locally-cached log for a date the server says is deleted. Guarded on
 * existence so a repeated pull doesn't accrue a tombstone per absent date —
 * LogRepository.delete() always writes one.
 */
async function applyRemoteDelete(date: string): Promise<void> {
  if (await container.getLog(date)) await container.deleteLog(date);
}

// ─── Pull all logs from Supabase into IndexedDB ─────────────────────────────

export async function pullAllLogs(ownerId: string): Promise<number> {
  if (!supabase) return 0;

  const { data, error } = await supabase
    .from("daily_logs")
    .select("*")
    .eq("owner_id", ownerId)
    .order("date");

  if (error) {
    console.error("Pull failed:", error.message);
    return 0;
  }

  if (!data) return 0;

  for (const row of data) {
    // Tombstones (migration 0003) are rows, not absences. Without this the
    // partner keeps a log the owner deleted — invisible while the partner saw
    // no per-day data, but a wrong dot the moment they see the calendar.
    if (row.deleted) {
      await applyRemoteDelete(row.date);
      continue;
    }
    const log: DailyLog = {
      date: row.date,
      flow: row.flow ?? "none",
      symptoms: row.symptoms ?? [],
      mood: row.mood ?? null,
      energy: row.energy ?? null,
      notes: row.notes ?? "",
    };
    await container.saveLog(log);
  }

  return data.length;
}

// ─── Subscribe to realtime changes ───────────────────────────────────────────

export function subscribeToLogs(
  ownerId: string,
  onUpdate: () => void
): RealtimeChannel | null {
  if (!supabase) return null;

  const channel = supabase
    .channel("rhea-logs")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "daily_logs",
        filter: `owner_id=eq.${ownerId}`,
      },
      async (payload) => {
        // Apply the change to local IndexedDB
        if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
          const row = payload.new as Record<string, unknown>;
          // A delete arrives as an UPDATE setting `deleted` — the row itself
          // stays so the tombstone can propagate (see pullAllLogs).
          if (row.deleted) {
            await applyRemoteDelete(row.date as string);
          } else {
            const log: DailyLog = {
              date: row.date as string,
              flow: (row.flow as DailyLog["flow"]) ?? "none",
              symptoms: (row.symptoms as string[]) ?? [],
              mood: (row.mood as string) ?? null,
              energy: (row.energy as string) ?? null,
              notes: (row.notes as string) ?? "",
            };
            await container.saveLog(log);
          }
        } else if (payload.eventType === "DELETE") {
          // Hard delete (row removed outright rather than tombstoned). The old
          // record carries only the primary key unless REPLICA IDENTITY FULL.
          const date = (payload.old as Record<string, unknown> | null)?.date;
          if (typeof date === "string") await applyRemoteDelete(date);
        }
        // Trigger a refresh in the UI
        onUpdate();
      }
    )
    .subscribe();

  return channel;
}

export function unsubscribe(channel: RealtimeChannel | null): void {
  if (!supabase || !channel) return;
  supabase.removeChannel(channel);
}

// ─── Initial sync: pull remote, push local, merge ────────────────────────────

export async function initialSync(ownerId: string): Promise<void> {
  if (!supabase) return;

  // Pull remote data first (server is source of truth)
  await pullAllLogs(ownerId);

  // Then push any local-only logs up
  await pushAllLogs(ownerId);
}
