import { supabase } from "@/app/lib/supabase";

// ─── Invite code format ──────────────────────────────────────────────────────

/**
 * The secret minted by the create_invite() RPC:
 *   replace(replace(encode(gen_random_bytes(15),'base64'),'+','-'),'/','_')
 * → base64url of 15 bytes = exactly 20 chars from [A-Za-z0-9_-], no padding,
 * CASE-SENSITIVE. Validate against THIS so the UI never uppercases, truncates,
 * or otherwise corrupts a real code (RHEA pairing release blocker).
 */
export const INVITE_CODE_RE = /^[A-Za-z0-9_-]{20}$/;

export function isValidInviteCode(code: string): boolean {
  return INVITE_CODE_RE.test(code.trim());
}

// ─── Owner: create an invite code ────────────────────────────────────────────

// The server (create_invite RPC) mints a high-entropy secret and stores only its
// hash; the plaintext is returned to the owner once, to share out-of-band.
// `_ownerId` is retained for call-site compatibility but the server uses auth.uid().
export async function createInviteCode(_ownerId: string): Promise<string | null> {
  if (!supabase) return null;

  const { data, error } = await supabase.rpc("create_invite");

  if (error) {
    console.error("Create invite failed:", error.message);
    return null;
  }

  return (data as string) ?? null;
}

// ─── Partner: redeem an invite code ──────────────────────────────────────────

export async function redeemInviteCode(code: string): Promise<string | null> {
  if (!supabase) return "Not connected";

  // The secret is case-sensitive (base64url), so do NOT upper-case it.
  const { error } = await supabase.rpc("redeem_invite", {
    p_secret: code.trim(),
  });

  return error?.message ?? null;
}

// ─── Check if the current user has a partner linked ──────────────────────────

/**
 * A partner link as seen from `userId`. The counterpart is null when several
 * links make it ambiguous (multi-link, N11) — none is auto-selected.
 */
export interface PartnerLink {
  ownerId: string | null;
  partnerId: string | null;
}

/**
 * `.limit(2)`, not `.maybeSingle()`: with several links `.maybeSingle()` RETURNS
 * an error (it does not throw), which used to read as "no link" and hid Unlink.
 * Any returned error REJECTS instead: an unknown link state is never reported as
 * "no link" (which would offer a second invite to an already-linked owner).
 */
export async function getPartnerLink(userId: string): Promise<PartnerLink | null> {
  if (!supabase) return null;

  // Check if user is an owner with a partner (any row → linked, so Unlink renders)
  const asOwner = await supabase
    .from("partner_links")
    .select("partner_id")
    .eq("owner_id", userId)
    .limit(2);
  if (asOwner.error || !asOwner.data) {
    throw asOwner.error ?? new Error("owner link lookup returned no rows array");
  }
  if (asOwner.data.length > 0) {
    const partnerId = asOwner.data.length === 1 ? asOwner.data[0].partner_id : null;
    return { ownerId: userId, partnerId };
  }

  // Check if user is a partner linked to an owner (several → still a partner)
  const asPartner = await supabase
    .from("partner_links")
    .select("owner_id")
    .eq("partner_id", userId)
    .limit(2);
  if (asPartner.error || !asPartner.data) {
    throw asPartner.error ?? new Error("partner link lookup returned no rows array");
  }
  if (asPartner.data.length > 0) {
    const ownerId = asPartner.data.length === 1 ? asPartner.data[0].owner_id : null;
    return { ownerId, partnerId: userId };
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
