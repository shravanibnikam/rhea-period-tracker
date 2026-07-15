import { describe, it, expect } from "vitest";
import { emptyLog } from "@/domain/types";

// Proves the test runner is wired and the `@ -> src` alias resolves (M0.1).
describe("test harness smoke test", () => {
  it("runs and resolves the @ alias", () => {
    const log = emptyLog("2026-07-15");
    expect(log.date).toBe("2026-07-15");
    expect(log.flow).toBe("none");
  });
});
