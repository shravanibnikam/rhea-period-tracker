import { describe, it, expect } from "vitest";
import {
  redact,
  REDACTED,
  FORBIDDEN_LOG_FIELDS,
  createCapturingLogger,
  noopLogger,
  type LogEvent,
} from "@/kernel/logger";

describe("logger redaction (no health data, ever)", () => {
  it("the forbidden list matches spec Chapter 9 §4.4", () => {
    expect(FORBIDDEN_LOG_FIELDS).toEqual([
      "flow",
      "symptoms",
      "mood",
      "energy",
      "notes",
      "medication",
      "intimacy",
      "date",
      "content",
      "email",
    ]);
  });

  it("redacts every forbidden health field at the top level", () => {
    for (const field of FORBIDDEN_LOG_FIELDS) {
      const event = { module: "test", [field]: "SENSITIVE" };
      expect(redact(event)[field as keyof typeof event]).toBe(REDACTED);
    }
  });

  it("redacts nested health fields (context objects, arrays)", () => {
    const sneaky = {
      module: "sync",
      detail: {
        rows: [{ date: "2026-07-15", flow: "heavy", keyId: "dek:v1" }],
        email: "user@example.com",
      },
    } as unknown as LogEvent;
    const safe = redact(sneaky) as unknown as {
      detail: { rows: Array<Record<string, unknown>>; email: string };
    };
    expect(safe.detail.rows[0].date).toBe(REDACTED);
    expect(safe.detail.rows[0].flow).toBe(REDACTED);
    expect(safe.detail.rows[0].keyId).toBe("dek:v1"); // operational field survives
    expect(safe.detail.email).toBe(REDACTED);
  });

  it("leaves allowed operational fields intact", () => {
    const event: LogEvent = {
      module: "outbox",
      code: "TRANSPORT_OFFLINE",
      category: "sync",
      retryable: true,
      latencyMs: 12,
      deviceId: "dev-1",
      scope: "owner",
      protocolVersion: 2,
    };
    expect(redact(event)).toEqual(event);
  });

  it("capturing logger stores redacted events with levels", () => {
    const log = createCapturingLogger();
    log.warn({ module: "m", message: "hi" });
    log.error({ module: "m", date: "2026-01-01" } as unknown as LogEvent);
    expect(log.events).toHaveLength(2);
    expect(log.events[0].level).toBe("warn");
    expect(
      (log.events[1].event as unknown as Record<string, unknown>).date
    ).toBe(REDACTED);
  });

  it("noop logger does nothing (smoke)", () => {
    expect(() => noopLogger.debug({ module: "x" })).not.toThrow();
  });
});
