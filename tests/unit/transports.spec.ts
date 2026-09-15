import { describe, it, expect } from "vitest";
import { listTransports, hasConfiguredTransport } from "@/app/lib/transports";

// Explicit fixtures: no client initialization or dependence on a local .env.
const localOnly = { supabaseConfigured: false };
const configured = { supabaseConfigured: true };

describe("transport registry", () => {
  it("lists the five known transports", () => {
    const ids = listTransports(localOnly).map((t) => t.id);
    expect(ids).toEqual([
      "relay-official",
      "relay-selfhosted",
      "bluetooth",
      "local-network",
      "webrtc",
    ]);
  });

  it("official relay is not-configured without Supabase credentials", () => {
    const relay = listTransports(localOnly).find((t) => t.id === "relay-official");
    expect(relay?.status).toBe("not-configured");
  });

  it("unimplemented transports are planned, never available", () => {
    for (const t of listTransports(configured)) {
      if (t.id !== "relay-official") expect(t.status).toBe("planned");
    }
  });

  it("hasConfiguredTransport is false when nothing is configured", () => {
    expect(hasConfiguredTransport(localOnly)).toBe(false);
  });

  it("official relay is available when configured", () => {
    expect(listTransports(configured).find((t) => t.id === "relay-official")?.status)
      .toBe("available");
    expect(hasConfiguredTransport(configured)).toBe(true);
  });

  it("evaluates each configuration independently", () => {
    expect(hasConfiguredTransport(configured)).toBe(true);
    expect(hasConfiguredTransport(localOnly)).toBe(false);
  });
});
