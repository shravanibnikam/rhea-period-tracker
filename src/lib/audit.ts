import { supabase } from "@/lib/supabase";

export interface AuditEntry {
  id: string;
  actor_id: string;
  action: string;
  target: string | null;
  created_at: string;
}

export async function logAudit(
  actorId: string,
  action: string,
  target?: string
): Promise<void> {
  if (!supabase) return;
  await supabase.from("audit_log").insert({
    actor_id: actorId,
    action,
    target: target ?? null,
  });
}

export async function getAuditLog(actorId: string): Promise<AuditEntry[]> {
  if (!supabase) return [];
  const { data } = await supabase
    .from("audit_log")
    .select("*")
    .eq("actor_id", actorId)
    .order("created_at", { ascending: false })
    .limit(50);
  return (data as AuditEntry[]) ?? [];
}

export function formatAction(action: string): string {
  const labels: Record<string, string> = {
    "share.toggle_on": "Enabled sharing",
    "share.toggle_off": "Disabled sharing",
    "partner.paired": "Partner linked",
    "partner.unpaired": "Partner unlinked",
    "quiet.added": "Quiet window added",
    "quiet.removed": "Quiet window removed",
    "data.exported": "Data exported",
    "data.erased": "All data erased",
    "data.imported": "Data imported",
  };
  return labels[action] ?? action;
}
