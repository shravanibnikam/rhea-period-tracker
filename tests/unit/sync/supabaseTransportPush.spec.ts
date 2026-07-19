/**
 * Truthful push acknowledgement (RHEA delete-sync fix).
 *
 * A push must be reported accepted ONLY when the server returns the attempted
 * key with the exact HLC we sent. A silently-skipped upsert (LWW trigger) must
 * surface as rejected — stale-write when the server holds newer, retry-able
 * otherwise — never as a false "accepted".
 */
import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseTransport, classifyPush } from "@/sync/transports/SupabaseTransport";
import type { SyncRecord } from "@/data/envelope";
import { encodeHlc } from "@/domain/hlc";

const T = 1_784_000_000_000;
const CTX = { peerId: "owner-1", deviceId: "dev-me" };

function tombstone(hlc: string): SyncRecord {
  return { key: "log:2099-01-01", scope: "owner", payload: null, updatedAt: hlc, deviceId: "dev-me", deleted: true };
}

interface Captured {
  upsertCalls: number;
  verifyCalls: number;
  upsertRows?: unknown[];
}

function makeClient(cfg: {
  captured: Captured;
  upsertReturn?: Array<{ date: string; updated_hlc: string | null }>;
  upsertError?: { code?: string; message: string } | null;
  serverRows?: Array<{ date: string; updated_hlc: string | null }>;
}): SupabaseClient {
  return {
    from() {
      return {
        upsert(rows: unknown[]) {
          cfg.captured.upsertCalls++;
          cfg.captured.upsertRows = rows;
          return {
            select: () =>
              Promise.resolve({
                data: cfg.upsertError ? null : (cfg.upsertReturn ?? []),
                error: cfg.upsertError ?? null,
              }),
          };
        },
        select() {
          return {
            eq: () => ({
              in: () => {
                cfg.captured.verifyCalls++;
                return Promise.resolve({ data: cfg.serverRows ?? [], error: null });
              },
            }),
          };
        },
      };
    },
  } as unknown as SupabaseClient;
}

describe("classifyPush", () => {
  it("accepts only keys returned with our exact HLC; classifies skips", () => {
    const ours = encodeHlc(T, 0, "dev-me");
    const { accepted, rejected } = classifyPush(
      [
        { key: "log:a", updatedAt: ours }, // returned with our HLC
        { key: "log:b", updatedAt: ours }, // skipped, server newer
        { key: "log:c", updatedAt: ours }, // skipped, server has nothing
      ],
      new Map([["log:a", ours]]),
      new Map([["log:b", encodeHlc(T + 1000, 0, "other")]])
    );
    expect(accepted).toEqual(["log:a"]);
    expect(rejected).toEqual([
      { key: "log:b", reason: "stale-write" }, // lost LWW → drop
      { key: "log:c", reason: "unknown" }, // should have applied → retry
    ]);
  });

  it("a returned row with a DIFFERENT HLC is NOT accepted", () => {
    const ours = encodeHlc(T, 0, "dev-me");
    const theirs = encodeHlc(T + 9, 0, "other");
    const { accepted, rejected } = classifyPush(
      [{ key: "log:a", updatedAt: ours }],
      new Map([["log:a", theirs]]),
      new Map([["log:a", theirs]])
    );
    expect(accepted).toEqual([]);
    expect(rejected).toEqual([{ key: "log:a", reason: "stale-write" }]);
  });
});

describe("SupabaseTransport.push — truthful acknowledgement", () => {
  it("issues a real upsert and acks the tombstone only when the server returns our key/HLC", async () => {
    const ours = encodeHlc(T, 0, "dev-me");
    const captured: Captured = { upsertCalls: 0, verifyCalls: 0 };
    const t = new SupabaseTransport(
      makeClient({ captured, upsertReturn: [{ date: "2099-01-01", updated_hlc: ours }] })
    );
    const out = await t.push([tombstone(ours)], CTX);

    expect(captured.upsertCalls).toBe(1); // a real POST/upsert was issued
    expect((captured.upsertRows?.[0] as { deleted: boolean }).deleted).toBe(true);
    expect(captured.verifyCalls).toBe(0); // all returned → no follow-up needed
    expect(out.accepted).toEqual(["log:2099-01-01"]);
    expect(out.rejected).toEqual([]);
  });

  it("does NOT ack a silently-skipped upsert; reports stale-write when the server holds newer", async () => {
    const ours = encodeHlc(T, 0, "dev-me");
    const captured: Captured = { upsertCalls: 0, verifyCalls: 0 };
    const t = new SupabaseTransport(
      makeClient({ captured, upsertReturn: [], serverRows: [{ date: "2099-01-01", updated_hlc: encodeHlc(T + 1000, 0, "other") }] })
    );
    const out = await t.push([tombstone(ours)], CTX);

    expect(captured.upsertCalls).toBe(1);
    expect(captured.verifyCalls).toBe(1);
    expect(out.accepted).toEqual([]);
    expect(out.rejected).toEqual([{ key: "log:2099-01-01", reason: "stale-write" }]);
  });

  it("retains a skipped write for retry when the server has no newer row (never silently accepted)", async () => {
    const ours = encodeHlc(T, 0, "dev-me");
    const captured: Captured = { upsertCalls: 0, verifyCalls: 0 };
    const t = new SupabaseTransport(makeClient({ captured, upsertReturn: [], serverRows: [] }));
    const out = await t.push([tombstone(ours)], CTX);

    expect(out.accepted).toEqual([]);
    expect(out.rejected).toEqual([{ key: "log:2099-01-01", reason: "unknown" }]);
  });

  it("RLS denial is reported per-key, not accepted", async () => {
    const ours = encodeHlc(T, 0, "dev-me");
    const captured: Captured = { upsertCalls: 0, verifyCalls: 0 };
    const t = new SupabaseTransport(makeClient({ captured, upsertError: { code: "42501", message: "rls" } }));
    const out = await t.push([tombstone(ours)], CTX);
    expect(out.accepted).toEqual([]);
    expect(out.rejected).toEqual([{ key: "log:2099-01-01", reason: "rls-denied" }]);
  });
});
