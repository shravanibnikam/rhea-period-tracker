/**
 * sync/SyncEngine.ts — orchestration (M1.8 / spec Sync ch. §1). The ONLY
 * component that talks to a Transport. Transport-agnostic and crypto-agnostic:
 * it moves opaque envelopes between the outbox/local stores and the wire.
 *
 * enqueue() is durable-local-first (returns after the outbox write, not after
 * network); flush() drains with backoff + leases (single-flight); pull() is
 * cursor-driven and authoritative; realtime is a debounced wake-up hint only.
 */

import type { StorageDriver } from "@/data/drivers/StorageDriver";
import type { SyncRecord, SyncScope } from "@/data/envelope";
import type { Transport, Subscription } from "./transports/Transport";
import { Outbox } from "./outbox";
import { CursorStore } from "./cursor";
import { Reconciler } from "./reconcile";
import {
  DEFAULT_BACKOFF,
  nextBackoffDelay,
  type BackoffPolicy,
  type FlushReason,
  type FlushResult,
  type PullResult,
  type SyncStatus,
  type SyncPhase,
} from "./types";

export interface SyncEngineConfig {
  deviceId: string; // stable per-device id (§3.1)
  selfPeerId: string; // auth.uid() of this account (or link id for partner scopes)
  scopes: SyncScope[]; // which pipelines this role runs
  transport: Transport;
  driver: StorageDriver;
  backoff?: BackoffPolicy;
  now?: () => number;
  /** Realtime wake debounce (ms); tests may set 0. */
  wakeDebounceMs?: number;
  /** Push batch size per flush round. */
  batchSize?: number;
  leaseMs?: number;
}

export class SyncEngine {
  readonly outbox: Outbox;
  readonly cursors: CursorStore;
  readonly reconciler: Reconciler;

  private readonly cfg: Required<
    Pick<SyncEngineConfig, "deviceId" | "selfPeerId" | "scopes" | "transport" | "driver">
  >;
  private readonly backoff: BackoffPolicy;
  private readonly now: () => number;
  private readonly wakeDebounceMs: number;
  private readonly batchSize: number;
  private readonly leaseMs: number;

  private subscriptions: Subscription[] = [];
  private wakeTimers = new Map<SyncScope, ReturnType<typeof setTimeout>>();
  private flushInFlight: Promise<FlushResult> | null = null;
  private started = false;

  private phase: SyncPhase = "idle";
  private online = true;
  private lastSyncedAt: number | null = null;
  private lastError: string | null = null;
  private statusListeners = new Set<(s: SyncStatus) => void>();

  constructor(config: SyncEngineConfig) {
    this.cfg = {
      deviceId: config.deviceId,
      selfPeerId: config.selfPeerId,
      scopes: config.scopes,
      transport: config.transport,
      driver: config.driver,
    };
    this.backoff = config.backoff ?? DEFAULT_BACKOFF;
    this.now = config.now ?? Date.now;
    this.wakeDebounceMs = config.wakeDebounceMs ?? 250;
    this.batchSize = config.batchSize ?? 50;
    this.leaseMs = config.leaseMs ?? 30_000;
    this.outbox = new Outbox(this.cfg.driver, this.now);
    this.cursors = new CursorStore(this.cfg.driver);
    this.reconciler = new Reconciler({
      driver: this.cfg.driver,
      selfDeviceId: this.cfg.deviceId,
      now: this.now,
    });
  }

  /** Idempotent: opens realtime subscriptions, drains outbox, pulls. */
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    for (const scope of this.cfg.scopes) {
      const sub = this.cfg.transport.subscribe(
        { peerId: this.cfg.selfPeerId, scope },
        () => this.onWake(scope)
      );
      this.subscriptions.push(sub);
    }
    await this.pull();
    await this.flush("manual");
  }

  /** Closes subscriptions; the outbox survives for the next start(). */
  async stop(): Promise<void> {
    this.started = false;
    for (const sub of this.subscriptions.splice(0)) sub.close();
    for (const t of this.wakeTimers.values()) clearTimeout(t);
    this.wakeTimers.clear();
  }

  /**
   * Durable local-first write: persists to the outbox (coalesced), then
   * schedules a flush. Returns after the entry is durable, NOT after network.
   */
  async enqueue(record: SyncRecord, destination?: SyncScope): Promise<void> {
    await this.outbox.enqueueCoalesced(record, destination ?? record.scope);
    void this.flush("enqueue").catch(() => {});
    this.emitStatus();
  }

  /** Push all due outbox entries. Single-flight: concurrent callers coalesce. */
  flush(_reason?: FlushReason): Promise<FlushResult> {
    if (this.flushInFlight) return this.flushInFlight;
    this.flushInFlight = this.doFlush().finally(() => {
      this.flushInFlight = null;
    });
    return this.flushInFlight;
  }

  private async doFlush(): Promise<FlushResult> {
    let pushed = 0;
    let failed = 0;
    this.setPhase("syncing");

    // Drain in rounds until nothing is due.
    for (;;) {
      const due = await this.outbox.claimDue(this.now(), this.batchSize, this.leaseMs);
      if (due.length === 0) break;

      try {
        const outcome = await this.cfg.transport.push(
          due.map((e) => e.record),
          { peerId: this.cfg.selfPeerId, deviceId: this.cfg.deviceId }
        );
        const accepted = new Set(outcome.accepted);
        const rejected = new Map(outcome.rejected.map((r) => [r.key, r.reason]));

        for (const entry of due) {
          if (accepted.has(entry.record.key)) {
            await this.outbox.ack(entry.id);
            pushed++;
          } else {
            const reason = rejected.get(entry.record.key) ?? "unknown";
            if (reason === "stale-write") {
              // The server already holds a newer row — our write lost LWW.
              // Drop it; the newer content arrives on the next pull.
              await this.outbox.ack(entry.id);
            } else {
              failed++;
              await this.outbox.fail(
                entry.id,
                reason,
                this.now() + nextBackoffDelay(this.backoff, entry.attempts)
              );
            }
          }
        }
        this.online = true;
        this.lastError = null;
      } catch (e) {
        // Whole-batch transport failure (offline etc.): back off every entry.
        for (const entry of due) {
          failed++;
          await this.outbox.fail(
            entry.id,
            e instanceof Error ? e.message : "push failed",
            this.now() + nextBackoffDelay(this.backoff, entry.attempts)
          );
        }
        this.online = false;
        this.lastError = e instanceof Error ? e.message : "push failed";
        break; // no point trying further rounds right now
      }
    }

    const remaining = await this.outbox.depth();
    this.lastSyncedAt = pushed > 0 ? this.now() : this.lastSyncedAt;
    this.setPhase(remaining === 0 ? "idle" : this.online ? "syncing" : "offline");
    this.emitStatus();
    return { pushed, failed, remaining };
  }

  /** Pull remote changes since the cursor and reconcile, per scope. */
  async pull(scopes?: SyncScope[]): Promise<PullResult> {
    const total: PullResult = { applied: 0, skipped: 0, conflicts: 0 };
    this.setPhase("syncing");
    try {
      for (const scope of scopes ?? this.cfg.scopes) {
        const result = await this.pullScope(scope);
        total.applied += result.applied;
        total.skipped += result.skipped;
        total.conflicts += result.conflicts;
      }
      this.online = true;
      this.lastSyncedAt = this.now();
      this.lastError = null;
      this.setPhase("idle");
    } catch (e) {
      this.online = false;
      this.lastError = e instanceof Error ? e.message : "pull failed";
      this.setPhase("offline");
    }
    this.emitStatus();
    return total;
  }

  private async pullScope(scope: SyncScope): Promise<PullResult> {
    const total: PullResult = { applied: 0, skipped: 0, conflicts: 0 };
    let cursor = await this.cursors.get(scope, this.cfg.selfPeerId);
    const fullPull = cursor.serverCursor === "";

    for (;;) {
      const page = await this.cfg.transport.pull({
        peerId: this.cfg.selfPeerId,
        scope,
        sinceServerCursor: cursor.serverCursor,
        limit: this.batchSize,
      });
      if (page.rows.length > 0) {
        const result = await this.reconciler.apply(page.rows, scope, fullPull);
        total.applied += result.applied;
        total.skipped += result.skipped;
        total.conflicts += result.conflicts;
        // Advance the cursor ONLY after the page is durably applied (§2.5).
        const newest = page.rows[page.rows.length - 1];
        cursor = {
          ...cursor,
          serverCursor: page.nextServerCursor,
          highWater:
            cursor.highWater && cursor.highWater > newest.updatedAt
              ? cursor.highWater
              : newest.updatedAt,
          updatedAt: this.now(),
        };
        await this.cursors.set(cursor);
      } else if (page.nextServerCursor && page.nextServerCursor !== cursor.serverCursor) {
        cursor = { ...cursor, serverCursor: page.nextServerCursor, updatedAt: this.now() };
        await this.cursors.set(cursor);
      }
      if (!page.hasMore) break;
    }
    return total;
  }

  /** Force a full re-pull from epoch-0 for a scope (long-offline recovery). */
  async resync(scope: SyncScope): Promise<void> {
    await this.cursors.reset(scope);
    await this.pull([scope]);
  }

  /** Debounced realtime wake → authoritative cursor pull (§2.6). */
  private onWake(scope: SyncScope): void {
    const existing = this.wakeTimers.get(scope);
    if (existing) clearTimeout(existing);
    this.wakeTimers.set(
      scope,
      setTimeout(() => {
        this.wakeTimers.delete(scope);
        void this.pull([scope]).then(() => this.flush("realtime"));
      }, this.wakeDebounceMs)
    );
  }

  status(): SyncStatus {
    return {
      phase: this.phase,
      online: this.online,
      outboxDepth: -1, // async — use statusAsync() or the emitted snapshots
      lastSyncedAt: this.lastSyncedAt,
      lastError: this.lastError,
      scopes: {},
    };
  }

  async statusAsync(): Promise<SyncStatus> {
    const depth = await this.outbox.depth();
    return { ...this.status(), outboxDepth: depth };
  }

  onStatus(cb: (s: SyncStatus) => void): () => void {
    this.statusListeners.add(cb);
    return () => this.statusListeners.delete(cb);
  }

  private setPhase(phase: SyncPhase): void {
    this.phase = phase;
  }

  private emitStatus(): void {
    if (this.statusListeners.size === 0) return;
    void this.statusAsync().then((s) => {
      for (const cb of this.statusListeners) cb(s);
    });
  }
}
