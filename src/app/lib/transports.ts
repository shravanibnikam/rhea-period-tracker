/**
 * Transport registry — UI descriptors only.
 *
 * Describes the transports for settings; replication uses src/sync/transports.
 * Configuration comes from the caller so importing this registry never creates
 * a Supabase client or reads the ambient environment. Cloud payloads are still
 * plaintext until owner encryption ships.
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

export interface TransportConfig {
  supabaseConfigured: boolean;
}

export function listTransports(config: TransportConfig): TransportInfo[] {
  return [
    {
      id: "relay-official",
      name: "Official Relay",
      description: "Hosted relay — syncs with your partner through the cloud",
      status: config.supabaseConfigured ? "available" : "not-configured",
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
export function hasConfiguredTransport(config: TransportConfig): boolean {
  return listTransports(config).some((t) => t.status === "available");
}
