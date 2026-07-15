/**
 * Typed error taxonomy (spec Chapter 9 §4.1). Expected failures travel as
 * `Result<T, RheaError>`; invariants throw (assert.ts). Concrete subclasses
 * live in each layer (data/StorageError, crypto/CryptoError, ...) — allowed
 * because layers may import kernel.
 *
 * kernel/ is the zero-dependency leaf: this module imports nothing.
 */

export enum ErrorCode {
  // domain
  INVALID_DATE = "INVALID_DATE",
  INVARIANT = "INVARIANT",
  PROJECTION_BUILD_FAILED = "PROJECTION_BUILD_FAILED",
  // storage
  STORAGE_UNAVAILABLE = "STORAGE_UNAVAILABLE",
  STORAGE_QUOTA = "STORAGE_QUOTA",
  DB_BLOCKED = "DB_BLOCKED",
  MIGRATION_FAILED = "MIGRATION_FAILED",
  DECODE_FAILED = "DECODE_FAILED",
  // crypto
  KEY_NOT_FOUND = "KEY_NOT_FOUND",
  KEY_LOCKED = "KEY_LOCKED",
  DECRYPT_FAILED = "DECRYPT_FAILED",
  AAD_MISMATCH = "AAD_MISMATCH", // stored AAD ≠ recomputed — potential tampering (T-3 #3)
  RNG_UNAVAILABLE = "RNG_UNAVAILABLE", // no secure randomness — refuse to seal (T-3 #6)
  KDF_FAILED = "KDF_FAILED",
  SAS_MISMATCH = "SAS_MISMATCH",
  RECOVERY_INVALID = "RECOVERY_INVALID",
  // sync / transport
  TRANSPORT_OFFLINE = "TRANSPORT_OFFLINE",
  TRANSPORT_HTTP = "TRANSPORT_HTTP",
  REALTIME_DROPPED = "REALTIME_DROPPED",
  OUTBOX_DRAIN_FAILED = "OUTBOX_DRAIN_FAILED",
  PROTOCOL_SKEW = "PROTOCOL_SKEW",
  // auth
  AUTH_INVALID = "AUTH_INVALID",
  AUTH_SESSION_EXPIRED = "AUTH_SESSION_EXPIRED",
  AUTH_NOT_CONFIGURED = "AUTH_NOT_CONFIGURED",
  AUTH_RATE_LIMITED = "AUTH_RATE_LIMITED",
  RLS_DENIED = "RLS_DENIED",
}

export type ErrorCategory = "domain" | "storage" | "crypto" | "sync" | "auth";

export const CATEGORY_BY_CODE: Readonly<Record<ErrorCode, ErrorCategory>> = {
  [ErrorCode.INVALID_DATE]: "domain",
  [ErrorCode.INVARIANT]: "domain",
  [ErrorCode.PROJECTION_BUILD_FAILED]: "domain",
  [ErrorCode.STORAGE_UNAVAILABLE]: "storage",
  [ErrorCode.STORAGE_QUOTA]: "storage",
  [ErrorCode.DB_BLOCKED]: "storage",
  [ErrorCode.MIGRATION_FAILED]: "storage",
  [ErrorCode.DECODE_FAILED]: "storage",
  [ErrorCode.KEY_NOT_FOUND]: "crypto",
  [ErrorCode.KEY_LOCKED]: "crypto",
  [ErrorCode.DECRYPT_FAILED]: "crypto",
  [ErrorCode.AAD_MISMATCH]: "crypto",
  [ErrorCode.RNG_UNAVAILABLE]: "crypto",
  [ErrorCode.KDF_FAILED]: "crypto",
  [ErrorCode.SAS_MISMATCH]: "crypto",
  [ErrorCode.RECOVERY_INVALID]: "crypto",
  [ErrorCode.TRANSPORT_OFFLINE]: "sync",
  [ErrorCode.TRANSPORT_HTTP]: "sync",
  [ErrorCode.REALTIME_DROPPED]: "sync",
  [ErrorCode.OUTBOX_DRAIN_FAILED]: "sync",
  [ErrorCode.PROTOCOL_SKEW]: "sync",
  [ErrorCode.AUTH_INVALID]: "auth",
  [ErrorCode.AUTH_SESSION_EXPIRED]: "auth",
  [ErrorCode.AUTH_NOT_CONFIGURED]: "auth",
  [ErrorCode.AUTH_RATE_LIMITED]: "auth",
  [ErrorCode.RLS_DENIED]: "auth",
};

/**
 * Retry policy per code (spec Chapter 9 §4.3). Retryable errors drive outbox
 * backoff; everything else surfaces to the user or the engineer.
 * - KEY_LOCKED retries once the user unlocks.
 * - AUTH_SESSION_EXPIRED retries via silent session refresh.
 * - AUTH_RATE_LIMITED retries after backoff.
 */
const RETRYABLE_CODES: ReadonlySet<ErrorCode> = new Set([
  ErrorCode.DB_BLOCKED,
  ErrorCode.KEY_LOCKED,
  ErrorCode.TRANSPORT_OFFLINE,
  ErrorCode.TRANSPORT_HTTP,
  ErrorCode.REALTIME_DROPPED,
  ErrorCode.OUTBOX_DRAIN_FAILED,
  ErrorCode.AUTH_SESSION_EXPIRED,
  ErrorCode.AUTH_RATE_LIMITED,
]);

export function defaultRetryable(code: ErrorCode): boolean {
  return RETRYABLE_CODES.has(code);
}

/** Safe default user copy per category. NEVER contains health data. */
const DEFAULT_USER_MESSAGE: Readonly<Record<ErrorCategory, string>> = {
  domain: "Something looks off with that input.",
  storage: "There was a problem saving on this device.",
  crypto: "There was a problem with this device's keys.",
  sync: "Sync is having trouble right now — your data is safe on this device.",
  auth: "There was a problem signing in.",
};

export interface RheaErrorOptions {
  /** Safe, user-facing copy. NEVER include health data. */
  userMessage?: string;
  /** Redacted metadata only — never health fields (enforced by logger tests). */
  context?: Record<string, string | number>;
  /** The underlying throwable, for diagnostics. */
  cause?: unknown;
  /** Override the per-code default retry policy. */
  retryable?: boolean;
}

export abstract class RheaError extends Error {
  abstract readonly category: ErrorCategory;
  abstract readonly code: ErrorCode;
  abstract readonly retryable: boolean; // drives outbox retry vs surface
  abstract readonly userMessage: string; // safe copy; NEVER contains health data
  readonly context?: Record<string, string | number>; // redacted metadata only
  readonly cause?: unknown;

  constructor(message: string, options?: RheaErrorOptions) {
    super(message);
    this.name = new.target.name;
    this.context = options?.context;
    this.cause = options?.cause;
  }
}

/** Concrete catch-all used by the kernel factory below. */
class GenericRheaError extends RheaError {
  readonly category: ErrorCategory;
  readonly code: ErrorCode;
  readonly retryable: boolean;
  readonly userMessage: string;

  constructor(code: ErrorCode, message: string, options?: RheaErrorOptions) {
    super(message, options);
    this.name = "RheaError";
    this.code = code;
    this.category = CATEGORY_BY_CODE[code];
    this.retryable = options?.retryable ?? defaultRetryable(code);
    this.userMessage = options?.userMessage ?? DEFAULT_USER_MESSAGE[this.category];
  }
}

/**
 * Factory for a typed error. Layers with richer needs subclass RheaError
 * instead; this covers the common case without ceremony.
 */
export function rheaError(
  code: ErrorCode,
  message: string,
  options?: RheaErrorOptions
): RheaError {
  return new GenericRheaError(code, message, options);
}

export const isRetryable = (e: unknown): boolean =>
  e instanceof RheaError && e.retryable;

export const isRheaError = (e: unknown): e is RheaError => e instanceof RheaError;
