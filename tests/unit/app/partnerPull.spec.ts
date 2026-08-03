/**
 * The partner pull path and delete tombstones.
 *
 * `daily_logs` deletes are tombstones (migration 0003 added `deleted`), not row
 * removals — the row stays so the delete can propagate. The legacy pull that
 * partners still run ignored that column, so a log the owner deleted lived on in
 * the partner's local store. It was invisible while the partner rendered no
 * per-day data; with the partner calendar it becomes a wrong dot on a real day.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => {
  const rows: { data: unknown[] | null; error: unknown } = { data: [], error: null };
  return {
    rows,
    container: {
      getLog: vi.fn(),
      saveLog: vi.fn().mockResolvedValue(undefined),
      deleteLog: vi.fn().mockResolvedValue(undefined),
      getAllLogs: vi.fn().mockResolvedValue([]),
    },
    // Captures the realtime handler so a change event can be replayed.
    handlers: [] as ((payload: Record<string, unknown>) => Promise<void>)[],
  };
});

vi.mock("@/app/di", () => ({ container: h.container }));

vi.mock("@/app/lib/supabase", () => {
  const channel = {
    on: (
      _evt: string,
      _cfg: unknown,
      cb: (payload: Record<string, unknown>) => Promise<void>
    ) => {
      h.handlers.push(cb);
      return channel;
    },
    subscribe: () => channel,
  };
  return {
    supabase: {
      from: () => ({
        select: () => ({ eq: () => ({ order: () => Promise.resolve(h.rows) }) }),
      }),
      channel: () => channel,
      removeChannel: vi.fn(),
    },
    isSupabaseConfigured: () => true,
  };
});

import { pullAllLogs, subscribeToLogs } from "@/app/lib/sync";

function row(date: string, extra: Record<string, unknown> = {}) {
  return {
    owner_id: "owner-1",
    date,
    flow: "medium",
    symptoms: ["Cramps"],
    mood: null,
    energy: null,
    notes: "",
    deleted: false,
    ...extra,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.handlers.length = 0;
  h.container.getLog.mockResolvedValue(undefined);
});

describe("pullAllLogs honours tombstones", () => {
  it("saves live rows and drops locally-cached deleted ones", async () => {
    h.rows.data = [row("2026-07-01"), row("2026-07-02", { deleted: true })];
    // The partner still has the deleted date cached from an earlier pull.
    h.container.getLog.mockImplementation(async (d: string) =>
      d === "2026-07-02" ? { date: d } : undefined
    );

    await pullAllLogs("owner-1");

    expect(h.container.saveLog).toHaveBeenCalledTimes(1);
    expect(h.container.saveLog.mock.calls[0][0]).toMatchObject({ date: "2026-07-01" });
    expect(h.container.deleteLog).toHaveBeenCalledWith("2026-07-02");
  });

  it("does not write a tombstone for a deleted date it never cached", async () => {
    h.rows.data = [row("2026-07-02", { deleted: true })];
    h.container.getLog.mockResolvedValue(undefined);

    await pullAllLogs("owner-1");

    expect(h.container.deleteLog).not.toHaveBeenCalled();
    expect(h.container.saveLog).not.toHaveBeenCalled();
  });
});

describe("realtime changes honour tombstones", () => {
  it("an UPDATE setting deleted removes the local log", async () => {
    h.container.getLog.mockResolvedValue({ date: "2026-07-03" });
    subscribeToLogs("owner-1", () => {});

    await h.handlers[0]({
      eventType: "UPDATE",
      new: row("2026-07-03", { deleted: true }),
    });

    expect(h.container.deleteLog).toHaveBeenCalledWith("2026-07-03");
    expect(h.container.saveLog).not.toHaveBeenCalled();
  });

  it("a hard DELETE removes the local log by primary key", async () => {
    h.container.getLog.mockResolvedValue({ date: "2026-07-04" });
    subscribeToLogs("owner-1", () => {});

    await h.handlers[0]({
      eventType: "DELETE",
      old: { owner_id: "owner-1", date: "2026-07-04" },
    });

    expect(h.container.deleteLog).toHaveBeenCalledWith("2026-07-04");
  });

  it("a normal UPDATE still saves the log", async () => {
    subscribeToLogs("owner-1", () => {});

    await h.handlers[0]({ eventType: "UPDATE", new: row("2026-07-05") });

    expect(h.container.saveLog).toHaveBeenCalledTimes(1);
    expect(h.container.saveLog.mock.calls[0][0]).toMatchObject({
      date: "2026-07-05",
      symptoms: ["Cramps"],
    });
    expect(h.container.deleteLog).not.toHaveBeenCalled();
  });
});
