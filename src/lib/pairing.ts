import { supabase } from "@/lib/supabase";

// ─── Owner: create an invite code ────────────────────────────────────────────

export async function createInviteCode(ownerId: string): Promise<string | null> {
  if (!supabase) return null;

  const code = crypto.randomUUID().slice(0, 8).toUpperCase();

  const { error } = await supabase
    .from("invites")
    .insert({ code, owner_id: ownerId });

  if (error) {
    console.error("Create invite failed:", error.message);
    return null;
  }

  return code;
}

// ─── Partner: redeem an invite code ──────────────────────────────────────────

export async function redeemInviteCode(code: string): Promise<string | null> {
  if (!supabase) return "Not connected";

  const { error } = await supabase.rpc("redeem_invite", {
    invite_code: code.toUpperCase().trim(),
  });

  return error?.message ?? null;
}

// ─── Check if the current user has a partner linked ──────────────────────────

export async function getPartnerLink(
  userId: string
): Promise<{ ownerId: string; partnerId: string } | null> {
  if (!supabase) return null;

  // Check if user is an owner with a partner
  const { data: asOwner } = await supabase
    .from("partner_links")
    .select("partner_id")
    .eq("owner_id", userId)
    .maybeSingle();

  if (asOwner) {
    return { ownerId: userId, partnerId: asOwner.partner_id };
  }

  // Check if user is a partner linked to an owner
  const { data: asPartner } = await supabase
    .from("partner_links")
    .select("owner_id")
    .eq("partner_id", userId)
    .maybeSingle();

  if (asPartner) {
    return { ownerId: asPartner.owner_id, partnerId: userId };
  }

  return null;
}

// ─── Owner: unpair (revoke partner access) ───────────────────────────────────

export async function unpair(ownerId: string): Promise<string | null> {
  if (!supabase) return "Not connected";

  const { error } = await supabase
    .from("partner_links")
    .delete()
    .eq("owner_id", ownerId);

  return error?.message ?? null;
}
