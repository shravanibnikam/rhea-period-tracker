/**
 * The legacy bulk push never uploads a partner's cache (P0-06).
 *
 * With the engine flag off, an owner's session runs initialSync → pushAllLogs,
 * which upserts EVERY local log under the signed-in account. On a device that
 * has served a partner session those rows are the previous OWNER's (the pull
 * cached them), so an ex-partner who now resolves as owner would publish her
 * health data under his own id, where she can never delete it. The store is
 * marked by `meta.lastKnownRole = "partner"`; the bulk push must refuse it.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { emptyLog, type DailyLog } from "@/domain/types";

const h = vi.hoisted(() => ({
  meta: {} as Record<string, unknown>,
  cached: [] as DailyLog[],
  upsert: vi.fn((_rows: unknown, _opts: unknown) => Promise.resolve({ error: null })),
}));

vi.mock("@/app/di", () => ({
  container: {
    getMeta: vi.fn((key: string) => Promise.resolve(h.meta[key])),
    getAllLogs: vi.fn(() => Promise.resolve(h.cached)),
    getLog: vi.fn((_date: string) => Promise.resolve(undefined)),
    saveLog: vi.fn((_log: DailyLog) => Promise.resolve()),
    deleteLog: vi.fn((_date: string) => Promise.resolve()),
  },
}));

vi.mock("@/app/lib/supabase", () => ({
  isSupabaseConfigured: () => true,
  supabase: {
    from: (_table: string) => ({
      upsert: h.upsert,
      // The pull half of initialSync: the server has nothing for this account.
      select: (_cols: string) => ({
        eq: (_col: string, _val: string) => ({
          order: (_by: string) => Promise.resolve({ data: [], error: null }),
        }),
      }),
    }),
    auth: {
      getSession: () =>
        Promise.resolve({ data: { session: { user: { id: "ex-partner" } } }, error: null }),
    },
  },
}));

import { initialSync, pushAllLogs, setSyncReadOnly } from "@/app/lib/sync";

/** The previous owner's rows, cached by the partner pull. */
const OWNERS_ROWS: DailyLog[] = [
  { ...emptyLog("2026-08-01"), flow: "heavy" },
  { ...emptyLog("2026-08-02"), flow: "medium" },
];

beforeEach(() => {
  vi.clearAllMocks();
  h.meta = {};
  h.cached = OWNERS_ROWS;
  setSyncReadOnly(false); // a resolved owner
});

describe("pushAllLogs refuses a store that has served a partner session", () => {
  it("lastKnownRole=partner → uploads nothing", async () => {
    h.meta.lastKnownRole = "partner";

    expect(await pushAllLogs("ex-partner")).toBe(0);
    expect(h.upsert).not.toHaveBeenCalled();
  });

  it("the legacy owner path (initialSync) of an ex-partner uploads nothing", async () => {
    h.meta.lastKnownRole = "partner";

    await initialSync("ex-partner");

    expect(h.upsert).not.toHaveBeenCalled();
  });

  it("an ordinary owner store still pushes every local row (control)", async () => {
    expect(await pushAllLogs("owner-1")).toBe(OWNERS_ROWS.length);
    expect(h.upsert).toHaveBeenCalledTimes(1);
    const rows = h.upsert.mock.calls[0][0] as Array<{ owner_id: string; date: string }>;
    expect(rows.map((r) => [r.owner_id, r.date])).toEqual([
      ["owner-1", "2026-08-01"],
      ["owner-1", "2026-08-02"],
    ]);
  });
});
