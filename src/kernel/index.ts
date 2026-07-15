/**
 * kernel/ — the zero-dependency leaf. The ONE package every layer may import.
 * Contains no I/O, no framework code, no crypto: only types, error taxonomy,
 * Result, assertions, branded primitives, and the redacting logger contract.
 */

export * from "./result";
export * from "./errors";
export * from "./logger";
export * from "./brand";
export * from "./assert";
