import { Cloud, Server, Bluetooth, Wifi, Share2, AlertCircle } from "lucide-react";
import {
  listTransports,
  hasConfiguredTransport,
  type TransportId,
  type TransportStatus,
} from "@/app/lib/transports";

// Icons per transport — kept here so lib/transports stays framework-free.
const TRANSPORT_ICONS: Record<TransportId, typeof Cloud> = {
  "relay-official": Cloud,
  "relay-selfhosted": Server,
  bluetooth: Bluetooth,
  "local-network": Wifi,
  webrtc: Share2,
};

const STATUS_LABELS: Record<TransportStatus, string> = {
  available: "Available",
  "not-configured": "Not configured",
  planned: "Planned",
};

const STATUS_STYLES: Record<TransportStatus, string> = {
  available: "bg-primary/10 text-primary",
  "not-configured": "bg-muted text-foreground border border-border",
  planned: "bg-muted text-muted-foreground",
};

/**
 * Shows which sync transports exist and their current status. Rhea v2 is
 * designed so sharing can travel over several transports (relay, Bluetooth,
 * local network, peer-to-peer); this section makes that direction visible
 * even before the additional transports are implemented.
 */
export function SyncTransportSection() {
  const transports = listTransports();
  const anyConfigured = hasConfiguredTransport();

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
        Sync &amp; Transport
      </p>
      <p className="text-xs text-muted-foreground mb-3">
        Sharing travels over a transport you choose. More options are on the way.
      </p>

      {!anyConfigured && (
        <div className="flex items-start gap-2.5 p-3.5 rounded-xl border border-border bg-muted/50 mb-3">
          <AlertCircle size={16} className="text-muted-foreground flex-shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            <span className="font-medium text-foreground">No transport configured.</span>{" "}
            Sharing and partner features can&apos;t send or receive anything until a
            transport is set up. Your data stays on this device.
          </p>
        </div>
      )}

      <div className="space-y-2">
        {transports.map((t) => {
          const Icon = TRANSPORT_ICONS[t.id];
          return (
            <div
              key={t.id}
              className="flex items-center gap-3 p-3.5 rounded-xl border border-border"
            >
              <Icon size={18} className="text-muted-foreground flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{t.name}</p>
                <p className="text-xs text-muted-foreground">{t.description}</p>
              </div>
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${STATUS_STYLES[t.status]}`}
              >
                {STATUS_LABELS[t.status]}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
