/**
 * The legacy pull path (partners, or the owner with the engine flag off):
 * tombstones and the owner's sensitive fields.
 *
 * `daily_logs` deletes are tombstones (migration 0003 added `deleted`), not row
 * removals — the row stays so the delete can propagate. The legacy pull that
 * partners still run ignored that column, so a log the owner deleted lived on in
 * the partner's local store. It was invisible while the partner rendered no
 * per-day data; with the partner calendar it becomes a wrong dot on a real day.
 *
 * P0-05: the owner's notes, medication and intimacy must never be written to a
 * partner's disk — not by the pull, and not by realtime, whose payloads carry
 * every column whatever the pull selects. Every server row below includes them
 * (worst case: a server that ignores the select list).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { emptyLog, type DailyLog } from "@/domain/types";
import { makeContainer } from "../../helpers/makeContainer";

type Payload = Record<string, unknown>;

const h = vi.hoisted(() => {
  const rows: { data: unknown[] | null; error: unknown } = { data: [], error: null };
  return {
    rows,
    /** The account signed in on this device — a partner unless a test says otherwise. */
    session: { userId: "partner-1" as string | null },
    /** Every column list passed to `.select()`, in call order (one per pull). */
    selects: [] as string[],
    /** When set, each pull's server response waits on it (holds a pull in flight). */
    gate: { wait: null as Promise<void> | null },
    container: {
      getLog: vi.fn<(date: string) => Promise<DailyLog | undefined>>(),
      saveLog: vi.fn<(log: DailyLog) => Promise<void>>(),
      deleteLog: vi.fn<(date: string) => Promise<void>>(),
      getAllLogs: vi.fn<() => Promise<DailyLog[]>>(),
    },
    // Captures the realtime handler so a change event can be replayed.
    handlers: [] as ((payload: Payload) => Promise<void>)[],
  };
});

vi.mock("@/app/di", () => ({ container: h.container }));

vi.mock("@/app/lib/supabase", () => {
  const channel = {
    on: (_evt: string, _cfg: unknown, cb: (payload: Payload) => Promise<void>) => {
      h.handlers.push(cb);
      return channel;
    },
    subscribe: () => channel,
  };
  const respond = async () => {
    if (h.gate.wait) await h.gate.wait;
    return h.rows;
  };
  return {
    supabase: {
      from: () => ({
        select: (columns: string) => {
          h.selects.push(columns);
          return { eq: () => ({ order: respond }) };
        },
      }),
      channel: () => channel,
      removeChannel: vi.fn(),
      auth: {
        getSession: () =>
          Promise.resolve({
            data: {
              session: h.session.userId === null ? null : { user: { id: h.session.userId } },
            },
            error: null,
          }),
      },
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

/** The owner's private fields, as the server would return them for her rows. */
const SECRET = {
  notes: "owner secret",
  medication: [{ name: "Ibuprofen", dose: "200mg" }],
  intimacy: { occurred: true, protected: true },
};

function savedLogs(): DailyLog[] {
  return h.container.saveLog.mock.calls.map(([log]) => log);
}

/** Something was written, and none of it carries the owner's private fields. */
function expectNothingSensitiveSaved(): void {
  expect(h.container.saveLog).toHaveBeenCalled();
  for (const log of savedLogs()) {
    expect(log.notes).toBe("");
    expect(log).not.toHaveProperty("medication");
    expect(log).not.toHaveProperty("intimacy");
  }
}

/** Every pull named its columns, and none of the private ones. */
function expectNarrowSelects(): void {
  expect(h.selects.length).toBeGreaterThan(0);
  for (const columns of h.selects) {
    expect(columns).not.toContain("*");
    expect(columns).not.toMatch(/notes|medication|intimacy/);
    // …but still everything the mapper and tombstone handling need.
    expect(columns.split(",").map((c) => c.trim())).toEqual(
      expect.arrayContaining(["date", "flow", "symptoms", "mood", "energy", "deleted"])
    );
  }
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  vi.clearAllMocks();
  h.handlers.length = 0;
  h.selects.length = 0;
  h.gate.wait = null;
  h.session.userId = "partner-1";
  h.rows.data = [];
  h.container.getLog.mockReset().mockResolvedValue(undefined);
  h.container.saveLog.mockReset().mockResolvedValue(undefined);
  h.container.deleteLog.mockReset().mockResolvedValue(undefined);
  h.container.getAllLogs.mockReset().mockResolvedValue([]);
});

describe("pullAllLogs honours tombstones", () => {
  it("saves live rows and drops locally-cached deleted ones", async () => {
    h.rows.data = [row("2026-07-01"), row("2026-07-02", { deleted: true })];
    // The partner still has the deleted date cached from an earlier pull.
    h.container.getLog.mockImplementation(async (d: string) =>
      d === "2026-07-02" ? emptyLog(d) : undefined
    );

    await pullAllLogs("owner-1");

    expect(h.container.saveLog).toHaveBeenCalledTimes(1);
    expect(savedLogs()[0]).toMatchObject({ date: "2026-07-01" });
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
  it("an UPDATE setting deleted removes the local log (via the pull it wakes)", async () => {
    h.rows.data = [row("2026-07-03", { deleted: true })];
    h.container.getLog.mockResolvedValue(emptyLog("2026-07-03"));
    subscribeToLogs("owner-1", () => {});

    await h.handlers[0]({
      eventType: "UPDATE",
      new: row("2026-07-03", { deleted: true }),
    });

    expect(h.container.deleteLog).toHaveBeenCalledWith("2026-07-03");
    expect(h.container.saveLog).not.toHaveBeenCalled();
  });

  it("a hard DELETE removes the local log by primary key", async () => {
    h.container.getLog.mockResolvedValue(emptyLog("2026-07-04"));
    const onUpdate = vi.fn();
    subscribeToLogs("owner-1", onUpdate);

    await h.handlers[0]({
      eventType: "DELETE",
      old: { owner_id: "owner-1", date: "2026-07-04" },
    });

    expect(h.container.deleteLog).toHaveBeenCalledWith("2026-07-04");
    expect(h.container.saveLog).not.toHaveBeenCalled();
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it("a normal UPDATE still saves the log (via the pull it wakes)", async () => {
    h.rows.data = [row("2026-07-05")];
    subscribeToLogs("owner-1", () => {});

    await h.handlers[0]({ eventType: "UPDATE", new: row("2026-07-05") });

    expect(h.container.saveLog).toHaveBeenCalledTimes(1);
    expect(savedLogs()[0]).toMatchObject({
      date: "2026-07-05",
      symptoms: ["Cramps"],
    });
    expect(h.container.deleteLog).not.toHaveBeenCalled();
  });
});

describe("the owner's sensitive fields never reach a partner's disk (P0-05)", () => {
  it("initial pull: server-returned notes, medication and intimacy are not saved", async () => {
    h.rows.data = [row("2026-07-01", SECRET), row("2026-07-02", SECRET)];

    await pullAllLogs("owner-1");

    expectNothingSensitiveSaved();
    expect(h.container.saveLog).toHaveBeenCalledTimes(2);
    // The mapper builds the log from the explicit shared fields only.
    expect(savedLogs()[0]).toEqual({
      date: "2026-07-01",
      flow: "medium",
      symptoms: ["Cramps"],
      mood: null,
      energy: null,
      notes: "",
    });
    expectNarrowSelects();
  });

  it.each(["INSERT", "UPDATE"])(
    "owner edits while the partner is connected: a realtime %s payload is never written",
    async (eventType) => {
      // Server state after the owner's edit. The payload deliberately differs
      // (flow "heavy") so the test can tell which one was written.
      h.rows.data = [row("2026-07-05", { ...SECRET, flow: "light" })];
      const onUpdate = vi.fn();
      subscribeToLogs("owner-1", onUpdate);

      await h.handlers[0]({
        eventType,
        new: row("2026-07-05", { ...SECRET, flow: "heavy" }),
        old: {},
      });

      expectNothingSensitiveSaved();
      // The payload was only a wake-up: a pull ran and wrote the server row.
      expect(h.selects).toHaveLength(1);
      expectNarrowSelects();
      expect(h.container.saveLog).toHaveBeenCalledTimes(1);
      expect(savedLogs()[0]).toMatchObject({ date: "2026-07-05", flow: "light" });
      // …and the UI refreshed after the pull wrote.
      expect(onUpdate).toHaveBeenCalledTimes(1);
      expect(h.container.saveLog.mock.invocationCallOrder[0]).toBeLessThan(
        onUpdate.mock.invocationCallOrder[0]
      );
    }
  );

  it("rapid realtime wakes coalesce into one in-flight pull plus at most one follow-up", async () => {
    h.rows.data = [row("2026-07-06", SECRET)];
    let release: () => void = () => {};
    h.gate.wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    const onUpdate = vi.fn();
    subscribeToLogs("owner-1", onUpdate);

    const wakes = Array.from({ length: 5 }, () =>
      h.handlers[0]({ eventType: "UPDATE", new: row("2026-07-06", SECRET) })
    );
    await tick();
    expect(h.selects).toHaveLength(1); // the first wake's pull is in flight

    release();
    await Promise.all(wakes);

    expect(h.selects).toHaveLength(2); // 5 wakes → 1 pull + 1 follow-up
    expectNothingSensitiveSaved();
    expect(onUpdate).toHaveBeenCalled();

    // Not wedged: a later wake starts a fresh pull.
    await h.handlers[0]({ eventType: "UPDATE", new: row("2026-07-06", SECRET) });
    expect(h.selects).toHaveLength(3);
  });

  it("a partner session with a live owner edit leaves no owner notes on disk", async () => {
    // Real repository over an in-memory store, standing in for IndexedDB. The
    // device already cached the owner's private fields (an older build).
    const { logs } = makeContainer();
    await logs.save({
      ...emptyLog("2026-07-07"),
      flow: "light",
      notes: "cached by an older build",
      medication: [{ name: "Ibuprofen" }],
      intimacy: { occurred: true },
    });
    h.container.getLog.mockImplementation((d) => logs.get(d));
    h.container.saveLog.mockImplementation((l) => logs.save(l));

    h.rows.data = [row("2026-07-07", SECRET)];
    await pullAllLogs("owner-1");
    subscribeToLogs("owner-1", () => {});
    h.rows.data = [row("2026-07-07", { ...SECRET, notes: "edited while partner online" })];
    await h.handlers[0]({
      eventType: "UPDATE",
      new: row("2026-07-07", { ...SECRET, notes: "edited while partner online" }),
    });

    const stored = await logs.getAll();
    expect(stored.map((l) => l.notes)).toEqual([""]);
    expect(stored[0]).toMatchObject({ flow: "medium", medication: [], intimacy: null });
  });

  it("pulls nothing when the signed-in account cannot be established", async () => {
    h.session.userId = null;
    h.rows.data = [row("2026-07-09", SECRET)];

    expect(await pullAllLogs("owner-1")).toBe(0);
    expect(h.container.saveLog).not.toHaveBeenCalled();
  });
});

describe("an owner pulling her own rows (legacy path, engine flag off)", () => {
  it("still receives her own notes, so the push that follows cannot blank them", async () => {
    h.session.userId = "owner-1";
    h.rows.data = [row("2026-07-08", SECRET)];

    await pullAllLogs("owner-1");

    expect(savedLogs()).toHaveLength(1);
    expect(savedLogs()[0].notes).toBe("owner secret");
    // Unchanged legacy behaviour: v2 fields are not mapped by this path.
    expect(savedLogs()[0]).not.toHaveProperty("medication");
    expect(savedLogs()[0]).not.toHaveProperty("intimacy");
    expect(h.selects[0]).not.toContain("*");
    expect(h.selects[0]).not.toMatch(/medication|intimacy/);
  });
});
