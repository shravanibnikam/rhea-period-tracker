import { describe, it, expect, vi } from "vitest";
import { MemoryDriver } from "@/data/drivers/MemoryDriver";
import { LogRepository, type StoredLog } from "@/data/repositories/LogRepository";
import { logKey, openPlain } from "@/data/envelope";
import { Outbox, type OutboxEntry } from "@/sync";
import { emptyLog, type DailyLog } from "@/domain/types";
import { makeContainer } from "../../helpers/makeContainer";

// P0-N2: the Overview symptom toggle is ONE atomic single-field operation. In
// one transaction it reads the stored row, adds or removes exactly that
// symptom, writes it and enqueues the merged record, so it can never clobber
// other fields or symptoms another device added.

const DAY = "2026-03-10";
const STORED: DailyLog = {
  date: DAY,
  flow: "medium",
  symptoms: ["Headache", "Bloating"],
  mood: "Calm",
  energy: "low",
  notes: "REMOTE-KEEP",
  medication: [{ name: "ibuprofen" }],
  intimacy: { occurred: true },
};

const SYNC_META = {
  updatedAt: expect.any(String),
  deviceId: expect.any(String),
  deleted: false,
};

describe("LogRepository.setSymptom (P0-N2)", () => {
  it("adds exactly one symptom and keeps every other field and symptom", async () => {
    const { logs } = makeContainer();
    await logs.save(STORED);

    const result = await logs.setSymptom(DAY, "Cramps", true);

    const expected = { ...STORED, symptoms: ["Headache", "Bloating", "Cramps"] };
    expect(result).toEqual(expected);
    expect(await logs.get(DAY)).toEqual({ ...expected, ...SYNC_META });
  });

  it("removes exactly one symptom and keeps the rest", async () => {
    const { logs } = makeContainer();
    await logs.save(STORED);

    const result = await logs.setSymptom(DAY, "Headache", false);

    expect(result).toEqual({ ...STORED, symptoms: ["Bloating"] });
    expect(await logs.get(DAY)).toEqual({ ...STORED, symptoms: ["Bloating"], ...SYNC_META });
  });

  it("is a no-op, without a write, when the symptom is already in that state", async () => {
    const { logs } = makeContainer();
    await logs.save(STORED);
    const before = (await logs.get(DAY)) as StoredLog;

    expect(await logs.setSymptom(DAY, "Headache", true)).toEqual(STORED);
    expect(await logs.setSymptom(DAY, "Cramps", false)).toEqual(STORED);
    expect(((await logs.get(DAY)) as StoredLog).updatedAt).toBe(before.updatedAt);
  });

  it("a day with no log: adding creates it with just that symptom; removing creates nothing", async () => {
    const { logs } = makeContainer();

    expect(await logs.setSymptom(DAY, "Cramps", false)).toBeUndefined();
    expect(await logs.get(DAY)).toBeUndefined();

    const created = { ...emptyLog(DAY), symptoms: ["Cramps"], medication: [], intimacy: null };
    expect(await logs.setSymptom(DAY, "Cramps", true)).toEqual(created);
    expect(await logs.get(DAY)).toEqual({ ...created, ...SYNC_META });
  });

  it("with an outbox, the enqueued record is the merged row (domain fields only)", async () => {
    const driver = new MemoryDriver();
    const logs = new LogRepository(driver, { outbox: new Outbox(driver) });
    await logs.save(STORED);

    await logs.setSymptom(DAY, "Cramps", true);

    const queued = await driver.getAll<OutboxEntry>("outbox");
    const record = queued.find((e) => e.record.key === logKey(DAY))?.record;
    expect(record?.payload && openPlain<DailyLog>(record.payload)).toEqual({
      ...STORED,
      symptoms: ["Headache", "Bloating", "Cramps"],
    });
    expect(queued).toHaveLength(1); // coalesced with the seed's intent
  });

  it("is atomic: if the enqueue fails, the stored row is unchanged", async () => {
    const driver = new MemoryDriver();
    const outbox = new Outbox(driver);
    const logs = new LogRepository(driver, { outbox });
    await logs.save(STORED);
    vi.spyOn(outbox, "enqueueCoalescedTx").mockRejectedValueOnce(new Error("outbox full"));

    await expect(logs.setSymptom(DAY, "Cramps", true)).rejects.toThrow("outbox full");
    expect(await logs.get(DAY)).toEqual({ ...STORED, ...SYNC_META });
  });
});
