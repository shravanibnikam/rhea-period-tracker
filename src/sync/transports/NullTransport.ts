/**
 * NullTransport — the local-only Transport (M1.8 / RHEA-046). Accepts every
 * push (into the void), returns no remote rows, never wakes. Lets the full
 * SyncEngine run as a shadow of production behavior with zero network and
 * zero user-facing change. Also the transport used when Supabase is not
 * configured.
 */

import type { SyncRecord } from "@/data/envelope";
import type {
  Transport,
  PushCtx,
  PushOutcome,
  PullRequest,
  PullResponse,
  SubscribeRequest,
  Subscription,
  TransportHealth,
  WakeHint,
} from "./Transport";

export class NullTransport implements Transport {
  async push(rows: SyncRecord[], _ctx: PushCtx): Promise<PushOutcome> {
    return {
      accepted: rows.map((r) => r.key),
      rejected: [],
      serverTime: new Date().toISOString(),
    };
  }

  async pull(_req: PullRequest): Promise<PullResponse> {
    return {
      rows: [],
      nextServerCursor: "",
      hasMore: false,
      serverTime: new Date().toISOString(),
    };
  }

  subscribe(_sub: SubscribeRequest, _onWake: (hint: WakeHint) => void): Subscription {
    return { close: () => {}, state: "closed" };
  }

  async health(): Promise<TransportHealth> {
    return { reachable: true, authed: true };
  }
}
