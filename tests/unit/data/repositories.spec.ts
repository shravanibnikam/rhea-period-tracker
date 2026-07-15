import { describe, it, expect } from "vitest";
import { makeContainer } from "../../helpers/makeContainer";
import { emptyLog } from "@/domain/types";

// Repository behavior on MemoryDriver (RHEA-031/033): same observable
// semantics the legacy lib/db.ts provided.

describe("LogRepository", () => {
  it("save/get/getAll/delete/count", async () => {
    const { logs } = makeContainer();
    await logs.save({ ...emptyLog("2026-01-02"), flow: "light" });
    await logs.save({ ...emptyLog("2026-01-01"), flow: "medium" });

    expect((await logs.get("2026-01-01"))?.flow).toBe("medium");
    expect((await logs.getAll()).map((l) => l.date)).toEqual([
      "2026-01-01",
      "2026-01-02",
    ]);
    expect(await logs.count()).toBe(2);

    await logs.delete("2026-01-01");
    expect(await logs.get("2026-01-01")).toBeUndefined();
    expect(await logs.count()).toBe(1);
  });

  it("saveAll is atomic", async () => {
    const { logs } = makeContainer();
    await logs.saveAll([emptyLog("2026-02-01"), emptyLog("2026-02-02")]);
    expect(await logs.count()).toBe(2);
  });

  it("save upserts by date", async () => {
    const { logs } = makeContainer();
    await logs.save({ ...emptyLog("2026-01-01"), notes: "a" });
    await logs.save({ ...emptyLog("2026-01-01"), notes: "b" });
    expect(await logs.count()).toBe(1);
    expect((await logs.get("2026-01-01"))?.notes).toBe("b");
  });
});

describe("MetaRepository", () => {
  it("get/set/delete/keys/entries", async () => {
    const { meta } = makeContainer();
    await meta.set("cycleLengthOverride", 30);
    await meta.set("excludedCycles", ["2026-01-01"]);

    expect(await meta.get<number>("cycleLengthOverride")).toBe(30);
    expect((await meta.keys()).sort()).toEqual(["cycleLengthOverride", "excludedCycles"]);
    expect(await meta.entries()).toEqual({
      cycleLengthOverride: 30,
      excludedCycles: ["2026-01-01"],
    });

    await meta.delete("cycleLengthOverride");
    expect(await meta.get("cycleLengthOverride")).toBeUndefined();
  });
});
