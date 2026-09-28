import type { OutboxMode } from "@/app/di/Container";

// Feature flags. Behavior-changing work lands here "dark" (default off), is
// validated, then flipped on in a small follow-up. See V2_IMPLEMENTATION_PLAN §1.1.
export const flags = {
  // Shared notes currently sync to the server in PLAINTEXT. They are disabled
  // until the end-to-end-encrypted notes channel ships (M2.10). While false, no
  // note content leaves the device; local drafts are unaffected.
  notesSync: false,

  // M1.9 (RHEA-053/055): owner sync runs on the new SyncEngine (outbox + HLC
  // merge + tombstones) instead of the legacy pull-then-overwrite path.
  // DEPLOYMENT GATE: supabase/migrations/0003 must be applied first — until
  // then pushes back off harmlessly (local data is never at risk).
  // Flip to false to fall back to the legacy owner path (removed in M1.10).
  syncEngine: true,
};

/**
 * Whether the session may RUN the owner SyncEngine — the only path that pushes,
 * pulls or seeds: true only for an authenticated account whose role has been
 * POSITIVELY resolved as "owner" (with the engine flag on). When false, the
 * legacy direct-push path applies instead (a resolved owner with the flag off).
 *
 * Fails closed (P0-06): a null/undefined role — still resolving, or the lookup
 * failed — is NOT owner and gets no engine, because the local store may hold
 * someone else's rows (a partner's cache of the owner). Queueing writes locally
 * is a separate decision: see `ownerOutboxMode`.
 *
 * Derived from auth + feature flag + role ONLY — deliberately NOT from whether
 * the engine instance has finished starting. Using the transient
 * `isSyncEngineActive()` here would let a write during the startup gap both
 * enqueue AND legacy-push (double delivery), and would leave lifecycle gaps able
 * to lose a mutation.
 */
export function isOwnerEngineSync(
  authed: boolean,
  role: string | null | undefined
): boolean {
  return authed && flags.syncEngine && role === "owner";
}

/**
 * The durable-outbox queue mode for a session (Container.setOwnerSyncMode).
 * Queueing is purely local — nothing is pushed unless `isOwnerEngineSync` later
 * lets the engine start for a confirmed owner.
 * - "owner": an authenticated, confirmed owner (engine flag on).
 * - "unresolved": authenticated, role still unknown (null/undefined), engine
 *   flag on — an offline start must not lose the owner's logging (P0-06). The
 *   Container still refuses to queue in a store marked lastKnownRole=partner.
 * - "off": a partner (it never pushes; the app drops what was queued before the
 *   role resolved), no user, or legacy mode (no outbox to drain).
 */
export function ownerOutboxMode(
  authed: boolean,
  role: string | null | undefined
): OutboxMode {
  if (!authed || !flags.syncEngine || role === "partner") return "off";
  return role === "owner" ? "owner" : "unresolved";
}
