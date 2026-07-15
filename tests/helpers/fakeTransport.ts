/**
 * FakeTransport — in-memory "server" for sync tests (M1.8 / RHEA-050).
 * Implements the server-side contract faithfully: upsert-by-key with the
 * stale-write LWW guard trigger, keyset paging by server order, and realtime
 * fan-out to every subscriber of (peerId, scope).
 */

import { compareHlc } from "@/domain/hlc";
import type { SyncRecord, SyncScope } from "@/data/envelope";
import type {
  Transport,
  PushCtx,
  PushOutcome,
  PullRequest,
  PullResponse,
  RemoteRow,
  SubscribeRequest,
  Subscription,
  TransportHealth,
  WakeHint,
} from "@/sync/transports/Transport";

interface Sub {
  peerId: string;
  scope: SyncScope;
  onWake: (hint: WakeHint) => void;
  open: boolean;
}

export class FakeTransport implements Transport {
  private tables = new Map<string, Map<string, RemoteRow>>();
  private seq = 0;
  private subs: Sub[] = [];

  /** Set > 0 to make the next N push() calls throw (simulates offline). */
  failPushes = 0;
  /** Set > 0 to make the next N pull() calls throw. */
  failPulls = 0;
  pushCalls = 0;
  pullCalls = 0;

  private table(peerId: string, scope: SyncScope): Map<string, RemoteRow> {
    const key = `${peerId}/${scope}`;
    let t = this.tables.get(key);
    if (!t) {
      t = new Map();
      this.tables.set(key, t);
    }
    return t;
  }

  /** Direct server-state inspection for assertions. */
  rows(peerId: string, scope: SyncScope): RemoteRow[] {
    return [...this.table(peerId, scope).values()].sort((a, b) =>
      a.serverCursor < b.serverCursor ? -1 : 1
    );
  }

  async push(rows: SyncRecord[], ctx: PushCtx): Promise<PushOutcome> {
    this.pushCalls++;
    if (this.failPushes > 0) {
      this.failPushes--;
      throw new Error("transport offline");
    }
    const accepted: string[] = [];
    const rejected: PushOutcome["rejected"] = [];
    const touchedScopes = new Set<SyncScope>();

    for (const row of rows) {
      const t = this.table(ctx.peerId, row.scope);
      const existing = t.get(row.key);
      // Server-side LWW guard trigger (§2.3): stale HLC ⇒ stale-write.
      if (existing && compareHlc(row.updatedAt, existing.updatedAt) <= 0) {
        rejected.push({ key: row.key, reason: "stale-write" });
        continue;
      }
      this.seq++;
      t.set(row.key, { ...row, serverCursor: String(this.seq).padStart(10, "0") });
      accepted.push(row.key);
      touchedScopes.add(row.scope);
    }

    // Realtime fan-out: notify every open subscriber of the touched scopes
    // (including the pusher's own devices — echo suppression is client-side).
    for (const sub of this.subs) {
      if (!sub.open || sub.peerId !== ctx.peerId) continue;
      if (touchedScopes.has(sub.scope)) sub.onWake({ scope: sub.scope });
    }

    return { accepted, rejected, serverTime: new Date().toISOString() };
  }

  async pull(req: PullRequest): Promise<PullResponse> {
    this.pullCalls++;
    if (this.failPulls > 0) {
      this.failPulls--;
      throw new Error("transport offline");
    }
    const all = this.rows(req.peerId, req.scope).filter(
      (r) => r.serverCursor > req.sinceServerCursor
    );
    const page = all.slice(0, req.limit);
    const last = page[page.length - 1];
    return {
      rows: page,
      nextServerCursor: last ? last.serverCursor : req.sinceServerCursor,
      hasMore: all.length > page.length,
      serverTime: new Date().toISOString(),
    };
  }

  subscribe(sub: SubscribeRequest, onWake: (hint: WakeHint) => void): Subscription {
    const record: Sub = { ...sub, onWake, open: true };
    this.subs.push(record);
    return {
      close: () => {
        record.open = false;
      },
      state: "joined",
    };
  }

  async health(): Promise<TransportHealth> {
    return { reachable: true, authed: true, serverTime: new Date().toISOString() };
  }
}
