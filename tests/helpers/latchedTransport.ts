/**
 * LatchedTransport — the wire half of the interleaving harness (G-03).
 *
 * A Transport whose push() can be PARKED mid-flight until the test releases
 * it, so a test can land a local save inside the push round-trip — the window
 * in which the outbox's claimed snapshot goes stale (P0-02 / P0-03).
 *
 * - Every push() call is recorded (deep copy) in `calls`, latched or not, so a
 *   test can see exactly what reached the wire and in which round.
 * - An unlatched push goes straight to `server`, a FakeTransport: the faithful
 *   in-memory server (upsert-by-key plus the stale-write LWW guard).
 * - `latchNextPush()` parks the next push() call. The test picks the outcome
 *   at release: the server's own answer (default), a forced per-row rejection
 *   (any PushRejectReason, e.g. "stale-write"), or a whole-batch failure.
 *
 * Use it with the REAL IndexedDbDriver on fake-indexeddb (see idbSyncRig.ts),
 * never MemoryDriver: MemoryDriver rolls back by restoring a snapshot taken
 * when ITS transaction began, erasing writes that other transactions committed
 * meanwhile, so a compare-and-swap test on it is false in either direction.
 */

import type { SyncRecord } from "@/data/envelope";
import type {
  Transport,
  PushCtx,
  PushOutcome,
  PushRejectReason,
  PullRequest,
  PullResponse,
  SubscribeRequest,
  Subscription,
  TransportHealth,
  WakeHint,
} from "@/sync/transports/Transport";
import { FakeTransport } from "./fakeTransport";

/** How a parked push() ends. */
export type PushVerdict =
  /** The inner FakeTransport answers, at release time (and stores what it accepts). */
  | { kind: "server" }
  /** Every row comes back rejected with `reason`. The server is not touched. */
  | { kind: "reject"; reason: PushRejectReason }
  /** The whole batch fails (offline, 5xx, ...): push() throws. The server is not touched. */
  | { kind: "throw"; message?: string };

export interface PushCall {
  /** Deep copy of the rows push() received, in order. */
  readonly rows: SyncRecord[];
  readonly ctx: PushCtx;
  readonly latched: boolean;
}

export interface ParkedPush extends PushCall {
  /** Let the parked push() return (or throw). Default verdict: the server's answer. */
  release(verdict?: PushVerdict): void;
}

export class LatchedTransport implements Transport {
  /** The faithful in-memory server behind every unlatched push and `{ kind: "server" }` release. */
  readonly server = new FakeTransport();
  /** Every push() call, latched or not, in arrival order. */
  readonly calls: PushCall[] = [];

  private latches: Array<(parked: ParkedPush) => void> = [];
  private closed = false;

  /**
   * Park the next push() call that no earlier latch has claimed. Resolves once
   * that call has arrived; it then stays parked until `release()` is called.
   */
  latchNextPush(): Promise<ParkedPush> {
    return new Promise((resolve) => this.latches.push(resolve));
  }

  /** Disarm latches no push() has consumed (so a later push() is not parked). */
  clearLatches(): void {
    this.latches = [];
  }

  /**
   * End of test: disarm latches, and make every later push() throw. A flush
   * loop that a failing test left running (say, a regression that re-pushes
   * forever) then stops at its next push instead of outliving the test and
   * starving the tests after it.
   */
  close(): void {
    this.closed = true;
    this.latches = [];
  }

  async push(rows: SyncRecord[], ctx: PushCtx): Promise<PushOutcome> {
    if (this.closed) throw new Error("LatchedTransport: closed");
    const latch = this.latches.shift();
    const call: PushCall = {
      rows: structuredClone(rows),
      ctx: { ...ctx },
      latched: latch !== undefined,
    };
    this.calls.push(call);
    if (!latch) return this.server.push(rows, ctx);

    const verdict = await new Promise<PushVerdict>((resolve) => {
      let released = false;
      latch({
        ...call,
        release: (v: PushVerdict = { kind: "server" }) => {
          if (released) throw new Error("LatchedTransport: push released twice");
          released = true;
          resolve(v);
        },
      });
    });

    switch (verdict.kind) {
      case "server":
        return this.server.push(rows, ctx);
      case "reject":
        return {
          accepted: [],
          rejected: rows.map((r) => ({ key: r.key, reason: verdict.reason })),
          serverTime: new Date().toISOString(),
        };
      case "throw":
        throw new Error(verdict.message ?? "transport offline");
    }
  }

  pull(req: PullRequest): Promise<PullResponse> {
    return this.server.pull(req);
  }

  subscribe(sub: SubscribeRequest, onWake: (hint: WakeHint) => void): Subscription {
    return this.server.subscribe(sub, onWake);
  }

  health(): Promise<TransportHealth> {
    return this.server.health();
  }
}
