-- 0007_harden_definer_functions.sql (SEC-14)
-- Hardens the four SECURITY DEFINER functions in `public`: handle_new_user(),
-- ensure_share_settings(uuid), create_invite() and redeem_invite(text). Bodies,
-- signatures, return types and owners are unchanged; only each function's
-- search_path setting and its EXECUTE grants change. Graded by
-- supabase/tests/rls_coverage.sql.
--
-- 1. search_path = public, pg_temp (pg_temp LAST). Under the previous
--    `search_path = public` the session's temporary schema was still searched,
--    and FIRST, for table and type names, so a temporary object could shadow a
--    name the function trusts (ensure_share_settings() inserts into an
--    unqualified `share_settings`). With pg_temp last, every name resolves as
--    before unless a temporary object would have shadowed it. Functions and
--    operators never resolve through pg_temp, and the pgcrypto calls are already
--    schema-qualified (`extensions.*`, 0004).
-- 2. EXECUTE revoked from PUBLIC and anon. A DEFINER function bypasses RLS, and
--    none of these is meant for a signed-out caller. PostgreSQL grants PUBLIC
--    EXECUTE on every new function and Supabase's default privileges add an
--    explicit anon grant, so both must go. Any future DEFINER function needs the
--    same revoke; rls_coverage.sql fails until it has it.
-- 3. EXECUTE restated for authenticated on the three client RPCs. 0001/0005
--    (ensure_share_settings) and 0002/0004 (create_invite, redeem_invite) already
--    grant it explicitly; restating it keeps the result independent of how a
--    given database came to hold that grant.
--
-- handle_new_user() is the function of the on_auth_user_created trigger.
-- PostgreSQL checks EXECUTE on a trigger function when the trigger is created,
-- not when it fires, so sign-up (Supabase Auth inserting into auth.users) is
-- unaffected by the revoke.
--
-- Backward-compatible with every shipped client: the app calls these RPCs only
-- from a signed-in session (src/app/lib/pairing.ts, src/app/lib/sharing.ts),
-- i.e. as `authenticated`, which keeps EXECUTE. Catalog-only: no table or row
-- is touched.
--
-- Deliberately NOT changed here (backlog P0-11, which ships with SEC-01 per
-- readiness D7): ensure_share_settings(uid) still trusts its uid argument for
-- signed-in callers.
--
-- Production: CI does not apply this. The maintainer applies it to the linked
-- project with `supabase db push`.

alter function public.handle_new_user()           set search_path = public, pg_temp;
alter function public.ensure_share_settings(uuid) set search_path = public, pg_temp;
alter function public.create_invite()             set search_path = public, pg_temp;
alter function public.redeem_invite(text)         set search_path = public, pg_temp;

revoke execute on function
  public.handle_new_user(),
  public.ensure_share_settings(uuid),
  public.create_invite(),
  public.redeem_invite(text)
from public, anon;

grant execute on function
  public.ensure_share_settings(uuid),
  public.create_invite(),
  public.redeem_invite(text)
to authenticated;
