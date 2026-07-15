/**
 * domain/ — PURE business logic. Imports kernel/ only (lint-enforced).
 * No I/O, no framework, no crypto libraries. DailyLog in → derived cycle
 * state out; the same functions run identically on owner and partner devices.
 */

export * from "./types";
export * from "./constants";
export * from "./dates";
export * from "./cycle";
export * from "./phases";
export * from "./hlc";
export * from "./merge";
