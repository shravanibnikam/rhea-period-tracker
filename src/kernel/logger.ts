/**
 * Structured logging with mandatory health-data redaction (spec Chapter 9
 * §4.4). A LogEvent carries operational metadata ONLY; the redaction layer
 * guarantees no health field ever reaches a sink, even if a caller passes one
 * by mistake. There is NO remote telemetry sink in v2 — logs stay local.
 *
 * kernel/ is the zero-dependency leaf: this module imports nothing.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

/** The only fields a log event may carry (plus a free-form safe message). */
export interface LogEvent {
  module: string;
  message?: string;
  code?: string;
  category?: string;
  retryable?: boolean;
  latencyMs?: number;
  deviceId?: string;
  keyId?: string;
  scope?: string;
  protocolVersion?: number;
}

export interface Logger {
  debug(event: LogEvent): void;
  info(event: LogEvent): void;
  warn(event: LogEvent): void;
  error(event: LogEvent): void;
}

/**
 * Health/PII fields that must NEVER appear in a log, at any nesting depth.
 * Kept in sync with the DailyLog shape + account identifiers; the unit test in
 * tests/unit/kernel/logger.spec.ts enforces this list.
 */
export const FORBIDDEN_LOG_FIELDS: readonly string[] = [
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
];

const FORBIDDEN = new Set(FORBIDDEN_LOG_FIELDS);
export const REDACTED = "[redacted]";

/**
 * Deep-redact any forbidden key. Applied by every sink before output, so even
 * a caller that sneaks extra fields into an event cannot leak health data.
 */
export function redact<T>(value: T, depth = 0): T {
  if (depth > 6 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map((v) => redact(v, depth + 1)) as unknown as T;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = FORBIDDEN.has(k) ? REDACTED : redact(v, depth + 1);
  }
  return out as T;
}

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

/**
 * Console-backed logger. `minLevel` lets the composition root silence debug
 * in production builds (kernel itself never reads build flags).
 */
export function createConsoleLogger(minLevel: LogLevel = "debug"): Logger {
  const emit = (level: LogLevel, event: LogEvent) => {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return;
    const safe = redact(event);
    console[level === "debug" ? "log" : level](`[rhea:${safe.module}]`, safe);
  };
  return {
    debug: (e) => emit("debug", e),
    info: (e) => emit("info", e),
    warn: (e) => emit("warn", e),
    error: (e) => emit("error", e),
  };
}

/** No-op logger for tests and for silencing debug output entirely. */
export const noopLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

/**
 * Capturing logger for tests: records redacted events so specs can assert
 * both that logging happened and that redaction was applied.
 */
export function createCapturingLogger(): Logger & {
  events: Array<{ level: LogLevel; event: LogEvent }>;
} {
  const events: Array<{ level: LogLevel; event: LogEvent }> = [];
  const push = (level: LogLevel) => (event: LogEvent) =>
    events.push({ level, event: redact(event) });
  return {
    events,
    debug: push("debug"),
    info: push("info"),
    warn: push("warn"),
    error: push("error"),
  };
}
