// Global Vitest setup.

// Deterministic timezone for date-derived snapshots (see vitest.config.ts).
process.env.TZ = "UTC";

// libsodium initializes asynchronously (M2.1 / RHEA-060); awaiting it once
// here means no individual test can race `sodium.ready`.
import { getSodium } from "@/crypto/sodium";
await getSodium();

// App specs model a returning visitor: the first-visit landing page (App gate)
// is covered by its own spec, which clears this flag.
try {
  globalThis.localStorage?.setItem("rhea:welcomed", "1");
} catch {
  // node environment: no Web Storage
}

export {};
