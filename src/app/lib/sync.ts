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

// P0-05: an owner's notes, medication and intimacy must never be written to a
// partner's device. The pull names only the columns the mapper reads, and the
// mapper copies only those, so even a server that ignored the list could not
// put them on disk. Client-side damage limitation, NOT an authorization
// boundary: RLS ("partner read linked logs", 0001_baseline.sql) still lets a
// linked partner's token read every column. The server-side fix is SEC-01.
const SHARED_COLUMNS = "date,flow,symptoms,mood,energy,deleted";
// An account pulling its OWN rows (the owner's legacy path, engine flag off)
// keeps its notes: initialSync pushes right after pulling, and a blanked copy
// would overwrite the server's.
const OWN_COLUMNS = `${SHARED_COLUMNS},notes`;

interface PulledRow {
  date: string;
  flow: DailyLog["flow"] | null;
  symptoms: string[] | null;
  mood: string | null;
  energy: string | null;
  deleted: boolean | null;
  notes?: string | null;
}

export async function pullAllLogs(ownerId: string): Promise<number> {
  if (!supabase) return 0;

  // Whose rows these are decides whether notes may come down. If the signed-in
  // account is unknown, write nothing rather than guess (a wrong guess either
  // leaks a partner the notes or blanks an owner's own).
  const { data: auth } = await supabase.auth.getSession();
  const selfId = auth.session?.user.id;
  if (!selfId) return 0;
  const own = selfId === ownerId;

  const { data, error } = await supabase
    .from("daily_logs")
    .select<string, PulledRow>(own ? OWN_COLUMNS : SHARED_COLUMNS)
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
    // Built from the explicit fields only. medication/intimacy are never
    // copied; notes only for the account's own rows (DailyLog.notes is
    // required, so a partner gets ""). saveLog replaces the whole record, so
    // this also blanks an older build's cached copy — but only for rows the
    // server still returns; purging other cached rows is S-07.
    const log: DailyLog = {
      date: row.date,
      flow: row.flow ?? "none",
      symptoms: row.symptoms ?? [],
      mood: row.mood ?? null,
      energy: row.energy ?? null,
      notes: own ? (row.notes ?? "") : "",
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

  // Single-flight wake: while a pull is in flight, further wakes collapse into
  // ONE follow-up pull after it, which sees every change made before it starts.
  let inFlight: Promise<void> | null = null;
  let wakeAgain = false;
  const wake = (): Promise<void> => {
    if (inFlight) {
      wakeAgain = true;
      return inFlight;
    }
    inFlight = (async () => {
      try {
        do {
          wakeAgain = false;
          await pullAllLogs(ownerId);
          onUpdate();
        } while (wakeAgain);
      } catch (err) {
        console.error("Realtime pull failed:", err);
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  };

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
        if (payload.eventType === "DELETE") {
          // Hard delete (row removed outright rather than tombstoned). The old
          // record carries only the primary key unless REPLICA IDENTITY FULL;
          // only the date key is read. Wait out an in-flight wake pull first:
          // its snapshot may predate the delete and would write the row back.
          const date = (payload.old as Record<string, unknown> | null)?.date;
          if (inFlight) await inFlight;
          if (typeof date === "string") await applyRemoteDelete(date);
          onUpdate();
          return;
        }
        // INSERT/UPDATE are a wake-up only (P0-05). Realtime payloads carry
        // EVERY column whatever the pull selects — the owner's notes included —
        // so the payload is never read; pullAllLogs is the one path that writes
        // rows (tombstones too: a delete arrives as an UPDATE setting `deleted`).
        await wake();
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
