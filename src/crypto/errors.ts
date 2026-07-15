import {
  RheaError,
  ErrorCode,
  CATEGORY_BY_CODE,
  defaultRetryable,
  type ErrorCategory,
  type RheaErrorOptions,
} from "@/kernel";

/**
 * Crypto-layer RheaError (spec Chapter 9 §4.1 — concrete subclass per layer;
 * the T-3 table maps each ErrorCode to its mandatory handling).
 *
 * NEVER put plaintext, key material, or health data in `message`/`context`.
 */
export class CryptoError extends RheaError {
  readonly category: ErrorCategory;
  readonly code: ErrorCode;
  readonly retryable: boolean;
  readonly userMessage: string;

  constructor(code: ErrorCode, message: string, options?: RheaErrorOptions) {
    super(message, options);
    this.name = "CryptoError";
    this.code = code;
    this.category = CATEGORY_BY_CODE[code];
    this.retryable = options?.retryable ?? defaultRetryable(code);
    this.userMessage =
      options?.userMessage ?? "There was a problem with this device's keys.";
  }
}
