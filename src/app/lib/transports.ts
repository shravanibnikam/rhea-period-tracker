import { isSupabaseConfigured } from "@/app/lib/supabase";

/**
 * Transport registry — UI descriptors only.
 *
 * Rhea v2 syncs encrypted payloads over swappable transports (see
 * docs/RHEA_V2_TECHNICAL_SPEC.md). The real `SyncTransport` interface lands
 * with the encrypted sync engine in Phase 2/3; until then this module only
 * *describes* the known transports so the UI can show what exists, what is
 * configured, and what is planned. It performs no I/O and simulates nothing.
 */

export type TransportId =
  | "relay-official"
  | "relay-selfhosted"
  | "bluetooth"
  | "local-network"
  | "webrtc";

export type TransportStatus =
  | "available" // configured and usable right now
  | "not-configured" // supported by this build, but missing configuration
  | "planned"; // part of the v2 roadmap, not implemented yet

export interface TransportInfo {
  id: TransportId;
  name: string;
  description: string;
  status: TransportStatus;
}

export function listTransports(): TransportInfo[] {
  return [
    {
      id: "relay-official",
      name: "Official Relay",
      description: "Hosted relay — syncs with your partner through the cloud",
      status: isSupabaseConfigured() ? "available" : "not-configured",
    },
    {
      id: "relay-selfhosted",
      name: "Self-hosted Relay",
      description: "Run the relay on your own server",
      status: "planned",
    },
    {
      id: "bluetooth",
      name: "Bluetooth",
      description: "Device-to-device sync when you're together",
      status: "planned",
    },
    {
      id: "local-network",
      name: "Local Network",
      description: "Sync over your own Wi-Fi, no internet needed",
      status: "planned",
    },
    {
      id: "webrtc",
      name: "Peer-to-peer (WebRTC)",
      description: "Direct connection between devices over the internet",
      status: "planned",
    },
  ];
}

/** True when at least one transport is configured and usable. */
export function hasConfiguredTransport(): boolean {
  return listTransports().some((t) => t.status === "available");
}
