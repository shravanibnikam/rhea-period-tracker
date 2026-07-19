/**
 * SupabaseTransport — the first real Transport (M1.9 / RHEA-052), owner scope
 * only. Pushes/pulls `daily_logs` rows and exposes Realtime as a wake-up
 * hint. Payloads travel as plaintext COLUMNS in this phase (M2.4 switches to
 * the ciphertext `payload` column); this milestone changes the sync
 * MECHANISM, not the confidentiality posture.
 *
 * The Supabase client instance is injected — sync/ never imports app config.
 */

import type { SupabaseClient, RealtimeChannel } from "@supabase/supabase-js";
import { epochZeroHlc, compareHlc, isValidHlc } from "@/domain/hlc";
import type { DailyLog } from "@/domain/types";
import { openPlain, sealPlain, type SyncRecord } from "@/data/envelope";
import type {
  Transport,
  PushCtx,
  PushOutcome,
  PullRequest,
  PullResponse,
  RemoteRow,
  RejectedRow,
  SubscribeRequest,
  Subscription,
  TransportHealth,
  WakeHint,
} from "./Transport";

/** daily_logs wire row (0001 baseline + 0003 sync metadata). */
export interface OwnerWireRow {
  owner_id: string;
  date: string;
  flow: string | null;
  symptoms: string[] | null;
  mood: string | null;
  energy: string | null;
  notes: string | null;
  medication: unknown;
  intimacy: unknown;
  updated_at?: string; // legacy client-written timestamp (kept fresh for old clients)
  updated_hlc: string | null;
  device_id: string | null;
  deleted: boolean | null;
  server_updated_at: string | null;
}

/** Sentinel device id for rows written before 0003 (no HLC): loses every merge. */
export const LEGACY_DEVICE_ID = "legacy";

// ── Pure mapping helpers (unit-tested without a client) ─────────────────────

export function recordToRow(record: SyncRecord, ownerId: string): Omit<OwnerWireRow, "server_updated_at"> {
  const log = record.payload ? openPlain<DailyLog>(record.payload) : undefined;
  return {
    owner_id: ownerId,
    date: record.key.replace(/^log:/, ""),
    flow: log?.flow ?? null,
    symptoms: log?.symptoms ?? [],
    mood: log?.mood ?? null,
    energy: log?.energy ?? null,
    notes: log?.notes ?? null,
    medication: log?.medication ?? [],
    intimacy: log?.intimacy ?? null,
    updated_at: new Date().toISOString(),
    updated_hlc: record.updatedAt,
    device_id: record.deviceId,
    deleted: record.deleted,
  };
}

export function rowToRecord(row: OwnerWireRow): RemoteRow {
  const deleted = row.deleted ?? false;
  const log: DailyLog = {
    date: row.date,
    flow: (row.flow as DailyLog["flow"]) ?? "none",
    symptoms: row.symptoms ?? [],
    mood: row.mood,
    energy: row.energy,
    notes: row.notes ?? "",
    medication: (row.medication as DailyLog["medication"]) ?? [],
    intimacy: (row.intimacy as DailyLog["intimacy"]) ?? null,
  };
  return {
    key: `log:${row.date}`,
    scope: "owner",
    payload: deleted ? null : sealPlain(log),
    // Pre-0003 rows have no HLC: epoch-0 means they never beat a real edit.
    updatedAt: row.updated_hlc ?? epochZeroHlc(LEGACY_DEVICE_ID),
    deviceId: row.device_id ?? LEGACY_DEVICE_ID,
    deleted,
    serverCursor: encodeServerCursor(row.server_updated_at ?? "", row.date),
  };
}

/** Keyset cursor = (server_updated_at, date), base64-encoded (spec §2.5). */
export function encodeServerCursor(serverUpdatedAt: string, date: string): string {
  return btoa(JSON.stringify({ t: serverUpdatedAt, d: date }));
}

export function decodeServerCursor(cursor: string): { t: string; d: string } | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(atob(cursor)) as { t: string; d: string };
    return typeof parsed.t === "string" && typeof parsed.d === "string" ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Decide accepted vs rejected from what the server actually persisted — the
 * truthful-acknowledgement core (RHEA delete-sync fix). A key is ACCEPTED only
 * when the upsert's RETURNING set contains it with the EXACT `updated_hlc` we
 * pushed (proof our write won). A skipped key (BEFORE-UPDATE trigger returned
 * null → absent from RETURNING) is:
 *   - `stale-write` when the server holds an equal/newer HLC (we legitimately
 *     lost LWW → safe to drop; the newer row arrives on the next pull), or
 *   - `unknown` when the server has no newer row — our write SHOULD have applied,
 *     so it is retained for retry instead of being silently dropped.
 * This makes a silently-skipped upsert impossible to report as accepted.
 */
export function classifyPush(
  pushed: Array<{ key: string; updatedAt: string }>,
  returnedHlcByKey: Map<string, string>,
  serverHlcByKey: Map<string, string>
): { accepted: string[]; rejected: RejectedRow[] } {
  const accepted: string[] = [];
  const rejected: RejectedRow[] = [];
  for (const p of pushed) {
    if (returnedHlcByKey.get(p.key) === p.updatedAt) {
      accepted.push(p.key); // our exact write is the persisted row
      continue;
    }
    const server = serverHlcByKey.get(p.key);
    if (
      server !== undefined &&
      isValidHlc(server) &&
      isValidHlc(p.updatedAt) &&
      compareHlc(server, p.updatedAt) >= 0
    ) {
      rejected.push({ key: p.key, reason: "stale-write" }); // lost LWW → drop
    } else {
      rejected.push({ key: p.key, reason: "unknown" }); // should have applied → retry
    }
  }
  return { accepted, rejected };
}

// ── The transport ────────────────────────────────────────────────────────────

export class SupabaseTransport implements Transport {
  constructor(private readonly client: SupabaseClient) {}

  async push(rows: SyncRecord[], ctx: PushCtx): Promise<PushOutcome> {
    if (rows.length === 0) {
      return { accepted: [], rejected: [], serverTime: new Date().toISOString() };
    }
    const wireRows = rows.map((r) => recordToRow(r, ctx.peerId));
    // RETURNING the persisted rows tells us EXACTLY which keys the server wrote.
    // A row the LWW trigger skipped (returns null) is absent here — so we can no
    // longer mistake a silent skip for an accepted write (RHEA delete-sync fix).
    const { data, error } = await this.client
      .from("daily_logs")
      .upsert(wireRows, { onConflict: "owner_id,date" })
      .select("date,updated_hlc");

    if (error) {
      // RLS denial is terminal per-batch; anything else bubbles for backoff.
      if (error.code === "42501") {
        return {
          accepted: [],
          rejected: rows.map((r) => ({ key: r.key, reason: "rls-denied" as const })),
          serverTime: new Date().toISOString(),
        };
      }
      throw new Error(`push failed: ${error.message}`);
    }

    const returned = new Map<string, string>();
    for (const row of (data ?? []) as Array<{ date: string; updated_hlc: string | null }>) {
      returned.set(`log:${row.date}`, row.updated_hlc ?? "");
    }

    // For keys the server did NOT return (skipped), read the server's current
    // HLC so we can tell "we lost LWW" (drop) from "should have applied" (retry).
    const notReturned = rows.filter((r) => returned.get(r.key) !== r.updatedAt);
    const serverHlc = new Map<string, string>();
    if (notReturned.length > 0) {
      const dates = notReturned.map((r) => r.key.replace(/^log:/, ""));
      const { data: cur, error: selErr } = await this.client
        .from("daily_logs")
        .select("date,updated_hlc")
        .eq("owner_id", ctx.peerId)
        .in("date", dates);
      if (selErr) throw new Error(`push verify failed: ${selErr.message}`);
      for (const row of (cur ?? []) as Array<{ date: string; updated_hlc: string | null }>) {
        serverHlc.set(`log:${row.date}`, row.updated_hlc ?? "");
      }
    }

    const { accepted, rejected } = classifyPush(
      rows.map((r) => ({ key: r.key, updatedAt: r.updatedAt })),
      returned,
      serverHlc
    );
    return { accepted, rejected, serverTime: new Date().toISOString() };
  }

  async pull(req: PullRequest): Promise<PullResponse> {
    const cursor = decodeServerCursor(req.sinceServerCursor);
    let query = this.client
      .from("daily_logs")
      .select(
        "owner_id,date,flow,symptoms,mood,energy,notes,medication,intimacy,updated_hlc,device_id,deleted,server_updated_at"
      )
      .eq("owner_id", req.peerId)
      .order("server_updated_at", { ascending: true })
      .order("date", { ascending: true })
      .limit(req.limit);

    if (cursor) {
      // Keyset: (server_updated_at, date) > (t, d)
      query = query.or(
        `server_updated_at.gt.${cursor.t},and(server_updated_at.eq.${cursor.t},date.gt.${cursor.d})`
      );
    }

    const { data, error } = await query;
    if (error) throw new Error(`pull failed: ${error.message}`);

    const rows = (data ?? []).map((r) => rowToRecord(r as OwnerWireRow));
    const last = rows[rows.length - 1];
    return {
      rows,
      nextServerCursor: last ? last.serverCursor : req.sinceServerCursor,
      hasMore: rows.length === req.limit,
      serverTime: new Date().toISOString(),
    };
  }

  subscribe(sub: SubscribeRequest, onWake: (hint: WakeHint) => void): Subscription {
    const channel: RealtimeChannel = this.client
      .channel(`sync-${sub.scope}-${sub.peerId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "daily_logs",
          filter: `owner_id=eq.${sub.peerId}`,
        },
        () => onWake({ scope: sub.scope })
      )
      .subscribe();

    return {
      close: () => {
        void this.client.removeChannel(channel);
      },
      get state() {
        return channel.state === "joined"
          ? ("joined" as const)
          : channel.state === "joining"
            ? ("joining" as const)
            : channel.state === "errored"
              ? ("errored" as const)
              : ("closed" as const);
      },
    };
  }

  async health(): Promise<TransportHealth> {
    const { error } = await this.client.from("daily_logs").select("date").limit(1);
    return {
      reachable: !error || error.code !== "",
      authed: !error,
      serverTime: new Date().toISOString(),
    };
  }
}
