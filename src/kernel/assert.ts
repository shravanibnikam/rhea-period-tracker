/**
 * Programmer-error assertions (spec Chapter 9 §4.1). Broken invariants THROW
 * (RheaError INVARIANT) and are caught only by the ErrorBoundary — they are
 * bugs, never user-recoverable states. Expected failures use Result instead.
 *
 * kernel-internal imports only.
 */

import { ErrorCode, rheaError } from "./errors";

/** Throw INVARIANT unless the condition holds. Narrows the type on success. */
export function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw rheaError(ErrorCode.INVARIANT, `Invariant violated: ${message}`);
  }
}

/**
 * Exhaustiveness guard for discriminated unions: unreachable at compile time,
 * throws INVARIANT if ever reached at runtime.
 */
export function assertNever(value: never, message = "Unexpected variant"): never {
  throw rheaError(ErrorCode.INVARIANT, `${message}: ${String(value)}`);
}
