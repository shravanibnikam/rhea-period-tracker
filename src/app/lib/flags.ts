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
 * The CONFIGURED sync mode for a session: true only for an authenticated account
 * whose role has been POSITIVELY resolved as "owner" (with the engine flag on),
 * which then runs the owner SyncEngine (durable outbox) instead of the legacy
 * direct-push path.
 *
 * Fails closed (P0-06): a null/undefined role — still resolving, or the lookup
 * failed — is NOT owner. It gets no outbox and no engine, because the local
 * store may hold someone else's rows (a partner's cache of the owner's logs).
 * Writes made while the role is unresolved stay local and are not queued.
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
