import { describe, it, expect } from "vitest";
import {
  ErrorCode,
  CATEGORY_BY_CODE,
  RheaError,
  rheaError,
  isRetryable,
  isRheaError,
  defaultRetryable,
} from "@/kernel/errors";

describe("RheaError taxonomy", () => {
  it("factory produces a RheaError with code, category, userMessage, cause", () => {
    const cause = new Error("underlying");
    const e = rheaError(ErrorCode.DECRYPT_FAILED, "seal open failed", {
      cause,
      context: { keyId: "dek:v1" },
    });
    expect(e).toBeInstanceOf(RheaError);
    expect(e).toBeInstanceOf(Error);
    expect(e.code).toBe(ErrorCode.DECRYPT_FAILED);
    expect(e.category).toBe("crypto");
    expect(e.cause).toBe(cause);
    expect(e.context).toEqual({ keyId: "dek:v1" });
    expect(e.userMessage.length).toBeGreaterThan(0);
    expect(isRheaError(e)).toBe(true);
  });

  it("every code has a category", () => {
    for (const code of Object.values(ErrorCode)) {
      expect(CATEGORY_BY_CODE[code]).toBeDefined();
    }
  });

  // Retry policy per spec Chapter 9 §4.3.
  const expectations: Array<[ErrorCode, boolean]> = [
    [ErrorCode.INVALID_DATE, false],
    [ErrorCode.INVARIANT, false],
    [ErrorCode.PROJECTION_BUILD_FAILED, false],
    [ErrorCode.STORAGE_UNAVAILABLE, false],
    [ErrorCode.STORAGE_QUOTA, false],
    [ErrorCode.DB_BLOCKED, true],
    [ErrorCode.MIGRATION_FAILED, false],
    [ErrorCode.DECODE_FAILED, false],
    [ErrorCode.KEY_NOT_FOUND, false],
    [ErrorCode.KEY_LOCKED, true],
    [ErrorCode.DECRYPT_FAILED, false],
    [ErrorCode.AAD_MISMATCH, false],
    [ErrorCode.RNG_UNAVAILABLE, false],
    [ErrorCode.KDF_FAILED, false],
    [ErrorCode.SAS_MISMATCH, false],
    [ErrorCode.RECOVERY_INVALID, false],
    [ErrorCode.TRANSPORT_OFFLINE, true],
    [ErrorCode.TRANSPORT_HTTP, true],
    [ErrorCode.REALTIME_DROPPED, true],
    [ErrorCode.OUTBOX_DRAIN_FAILED, true],
    [ErrorCode.PROTOCOL_SKEW, false],
    [ErrorCode.AUTH_INVALID, false],
    [ErrorCode.AUTH_SESSION_EXPIRED, true],
    [ErrorCode.AUTH_NOT_CONFIGURED, false],
    [ErrorCode.AUTH_RATE_LIMITED, true],
    [ErrorCode.RLS_DENIED, false],
  ];

  it.each(expectations)("retry policy for %s is %s", (code, retryable) => {
    expect(defaultRetryable(code)).toBe(retryable);
    expect(isRetryable(rheaError(code, "msg"))).toBe(retryable);
  });

  it("covers every code in the retry-policy table", () => {
    expect(expectations.map(([c]) => c).sort()).toEqual(
      Object.values(ErrorCode).sort()
    );
  });

  it("retryable can be overridden per instance", () => {
    const e = rheaError(ErrorCode.TRANSPORT_HTTP, "422 unprocessable", {
      retryable: false,
    });
    expect(isRetryable(e)).toBe(false);
  });

  it("isRetryable is false for non-Rhea errors", () => {
    expect(isRetryable(new Error("plain"))).toBe(false);
    expect(isRetryable(undefined)).toBe(false);
  });
});
