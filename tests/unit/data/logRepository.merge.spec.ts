import { describe, it, expect } from "vitest";
import { MemoryDriver } from "@/data/drivers/MemoryDriver";
import { LogRepository } from "@/data/repositories";
import { logKey, openPlain } from "@/data/envelope";
import { Outbox, type OutboxEntry } from "@/sync";
import { buildPeriodLogs } from "@/domain/cycle";
import { emptyLog, type DailyLog } from "@/domain/types";
import { makeContainer } from "../../helpers/makeContainer";

// P0-01 regression: Quick Add ("mark these days as period days") must MERGE
// flow into a day that is already logged. The replace path rebuilt each day
// from emptyLog and wiped notes, symptoms, mood, energy, medication, intimacy.

const LOGGED = "2026-03-10"; // a day the user already logged in detail
const EMPTY = "2026-03-11"; // a day with no prior log

const SEEDED: DailyLog = {
  date: LOGGED,
  flow: "light",
  symptoms: ["cramps", "bloating", "headache"],
  mood: "anxious",
  energy: "low",
  notes: "private note",
  medication: [{ name: "ibuprofen", dose: "200mg", takenAt: "08:30" }],
  intimacy: { occurred: true, protected: true },
};

// What a brand-new day looks like after Quick Add (= replace of an absent row).
const EMPTY_MEDIUM: DailyLog = {
  ...emptyLog(EMPTY),
  flow: "medium",
  medication: [],
  intimacy: null,
};

const SYNC_META = {
  updatedAt: expect.any(String),
  deviceId: expect.any(String),
  deleted: false,
};

/** The Quick Add write: a 2-day range covering LOGGED then EMPTY. */
function quickAdd(repo: LogRepository): Promise<DailyLog[]> {
  return repo.saveAll(buildPeriodLogs(LOGGED, 2), { mode: "merge-defined" });
}

describe("LogRepository.saveAll merge-defined (P0-01 Quick Add)", () => {
  it("keeps every non-flow field of a logged day; an empty day becomes a medium-flow empty log", async () => {
    const { logs } = makeContainer();
    await logs.save(SEEDED);

    const saved = await quickAdd(logs);

    const kept = await logs.get(LOGGED);
    expect(kept?.notes).toBe("private note");
    expect(kept).toEqual({ ...SEEDED, flow: "medium", ...SYNC_META });
    expect(await logs.get(EMPTY)).toEqual({ ...EMPTY_MEDIUM, ...SYNC_META });
    // Callers get the MERGED domain records (never the partial patch).
    expect(saved).toEqual([{ ...SEEDED, flow: "medium" }, EMPTY_MEDIUM]);
  });

  it("with an outbox attached, the enqueued SyncRecord carries the merged record", async () => {
    const driver = new MemoryDriver();
    const logs = new LogRepository(driver, { outbox: new Outbox(driver) });
    await logs.save(SEEDED);

    await quickAdd(logs);

    const queued = await driver.getAll<OutboxEntry>("outbox");
    const payloadOf = (date: string): DailyLog | undefined => {
      const record = queued.find((e) => e.record.key === logKey(date))?.record;
      return record?.payload ? openPlain<DailyLog>(record.payload) : undefined;
    };
    expect(payloadOf(LOGGED)?.notes).toBe("private note");
    // Domain fields only — the prior row's sync metadata never leaks in.
    expect(payloadOf(LOGGED)).toEqual({ ...SEEDED, flow: "medium" });
    expect(payloadOf(EMPTY)).toEqual(EMPTY_MEDIUM);
    expect(queued).toHaveLength(2); // coalesced: one pending intent per day
  });

  it("a field set to undefined in a patch means 'leave as is', not 'clear'", async () => {
    const { logs } = makeContainer();
    await logs.save(SEEDED);

    await logs.saveAll([{ date: LOGGED, flow: "heavy", notes: undefined }], {
      mode: "merge-defined",
    });

    const kept = await logs.get(LOGGED);
    expect(kept?.notes).toBe("private note");
    expect(kept).toEqual({ ...SEEDED, flow: "heavy", ...SYNC_META });
  });
});

describe("LogRepository.saveAll replace (default contract unchanged)", () => {
  const REPLACEMENT: DailyLog = { ...emptyLog(LOGGED), flow: "heavy" };
  const REPLACED = { ...REPLACEMENT, medication: [], intimacy: null, ...SYNC_META };

  it("save() of a full log still replaces the whole record", async () => {
    const { logs } = makeContainer();
    await logs.save(SEEDED);
    await logs.save(REPLACEMENT);
    expect(await logs.get(LOGGED)).toEqual(REPLACED);
  });

  it("saveAll() without options, or with mode 'replace', still replaces", async () => {
    const { logs } = makeContainer();
    await logs.save(SEEDED);
    await logs.saveAll([REPLACEMENT]);
    expect(await logs.get(LOGGED)).toEqual(REPLACED);

    await logs.save(SEEDED);
    await logs.saveAll([REPLACEMENT], { mode: "replace" });
    expect(await logs.get(LOGGED)).toEqual(REPLACED);
  });
});
