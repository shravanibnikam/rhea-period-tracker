/**
 * Transport — the swappable wire seam (M1.8 / spec Sync ch. §2.1). The
 * SyncEngine is the ONLY caller. SupabaseTransport (M1.9) is the first real
 * implementation; Bluetooth/LAN/WebRTC would be alternate implementations
 * behind this same interface (see lib/transports.ts registry).
 */

import type { SyncRecord, SyncScope } from "@/data/envelope";

export interface PushCtx {
  peerId: string;
  deviceId: string;
}

export type PushRejectReason =
  | "rls-denied"
  | "stale-write"
  | "payload-too-large"
  | "malformed"
  | "unknown";

export interface RejectedRow {
  key: string;
  reason: PushRejectReason;
}

export interface PushOutcome {
  accepted: string[]; // keys upserted
  rejected: RejectedRow[]; // per-row failures (RLS, conflict, malformed)
  serverTime: string; // ISO; feeds skew estimate
}

export interface PullRequest {
  peerId: string;
  scope: SyncScope;
  sinceServerCursor: string; // opaque server-order cursor (§2.5); '' = epoch-0
  limit: number;
}

/** Wire row = SyncRecord fields + server-assigned ordering token. */
export interface RemoteRow extends SyncRecord {
  serverCursor: string;
}

export interface PullResponse {
  rows: RemoteRow[]; // ascending by server order
  nextServerCursor: string;
  hasMore: boolean;
  serverTime: string;
}

export interface SubscribeRequest {
  peerId: string;
  scope: SyncScope;
}

export interface WakeHint {
  scope: SyncScope;
  key?: string;
}

export interface Subscription {
  close(): void;
  readonly state: "joined" | "joining" | "closed" | "errored";
}

export interface TransportHealth {
  reachable: boolean;
  authed: boolean;
  serverTime?: string;
}

export interface Transport {
  /** Upsert rows keyed by (peerId, scope, key). At-least-once / idempotent. */
  push(rows: SyncRecord[], ctx: PushCtx): Promise<PushOutcome>;

  /** Fetch rows with server order strictly after the cursor, ascending, paged. */
  pull(req: PullRequest): Promise<PullResponse>;

  /** Wake-up channel: payload is a HINT only; the engine responds with pull(). */
  subscribe(sub: SubscribeRequest, onWake: (hint: WakeHint) => void): Subscription;

  /** Liveness / auth probe for status + reconnect logic. */
  health(): Promise<TransportHealth>;
}
