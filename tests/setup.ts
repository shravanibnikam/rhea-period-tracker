// Global Vitest setup.

// Deterministic timezone for date-derived snapshots (see vitest.config.ts).
process.env.TZ = "UTC";

// libsodium initializes asynchronously (M2.1 / RHEA-060); awaiting it once
// here means no individual test can race `sodium.ready`.
import { getSodium } from "@/crypto/sodium";
await getSodium();

export {};
