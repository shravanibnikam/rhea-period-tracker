import { describe, it, expect } from "vitest";
import { plainError } from "@/app/lib/errors";

describe("plainError", () => {
  it("turns client network failures into one plain sentence", () => {
    for (const raw of ["Failed to fetch", "TypeError: Failed to fetch", "NetworkError when attempting to fetch resource.", "Load failed"]) {
      expect(plainError(raw)).toBe("Couldn't reach the server. Check your connection and try again.");
    }
  });

  it("rewrites the database's invite errors and keeps unknown messages as they are", () => {
    expect(plainError("Invalid, expired, or already-used invite")).toMatch(/^That code doesn't work any more/);
    expect(plainError("Password should be at least 6 characters.")).toBe("Password should be at least 6 characters.");
  });
});
