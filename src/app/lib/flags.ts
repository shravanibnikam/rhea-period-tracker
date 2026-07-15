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
