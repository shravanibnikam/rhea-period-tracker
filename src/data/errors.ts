import {
  RheaError,
  ErrorCode,
  CATEGORY_BY_CODE,
  defaultRetryable,
  type ErrorCategory,
  type RheaErrorOptions,
} from "@/kernel";

/** Storage-layer RheaError (spec Chapter 9 §4.1 — concrete subclass per layer). */
export class StorageError extends RheaError {
  readonly category: ErrorCategory;
  readonly code: ErrorCode;
  readonly retryable: boolean;
  readonly userMessage: string;

  constructor(code: ErrorCode, message: string, options?: RheaErrorOptions) {
    super(message, options);
    this.name = "StorageError";
    this.code = code;
    this.category = CATEGORY_BY_CODE[code];
    this.retryable = options?.retryable ?? defaultRetryable(code);
    this.userMessage =
      options?.userMessage ??
      "There was a problem saving on this device. Your data is safe — try again.";
  }
}
