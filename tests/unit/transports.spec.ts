import { describe, it, expect } from "vitest";
import { listTransports, hasConfiguredTransport } from "@/app/lib/transports";

// The transport registry describes sync options for the UI. In this test env
// no Supabase credentials are set, so nothing should report as available.

describe("transport registry", () => {
  it("lists the five known transports", () => {
    const ids = listTransports().map((t) => t.id);
    expect(ids).toEqual([
      "relay-official",
      "relay-selfhosted",
      "bluetooth",
      "local-network",
      "webrtc",
    ]);
  });

  it("official relay is not-configured without Supabase credentials", () => {
    const relay = listTransports().find((t) => t.id === "relay-official");
    expect(relay?.status).toBe("not-configured");
  });

  it("unimplemented transports are planned, never available", () => {
    for (const t of listTransports()) {
      if (t.id !== "relay-official") expect(t.status).toBe("planned");
    }
  });

  it("hasConfiguredTransport is false when nothing is configured", () => {
    expect(hasConfiguredTransport()).toBe(false);
  });
});
