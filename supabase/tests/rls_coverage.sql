-- SEC-14: schema-wide RLS and SECURITY DEFINER coverage for `public`.
-- Catalog checks only, no fixtures. They grade every current AND future object:
-- a new table without RLS, or a DEFINER function that anon can call or that
-- lacks a pinned search_path, fails here and is named in the output ("have:").
-- Run: supabase test db

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(9);

-- 1. Every table has RLS enabled and at least one policy.
select is(
  array(select c.oid::regclass::text from pg_class c
         where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
           and not c.relrowsecurity
         order by 1),
  '{}'::text[], 'every table in public has RLS enabled');

select is(
  array(select c.oid::regclass::text from pg_class c
         where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
           and not exists (select 1 from pg_policy pol where pol.polrelid = c.oid)
         order by 1),
  '{}'::text[], 'every table in public has at least one RLS policy');

-- 2. Every SECURITY DEFINER function pins search_path with pg_temp LAST. An
--    unlisted pg_temp is searched FIRST for table and type names, so a temporary
--    object could shadow a name the function trusts. proconfig holds the
--    canonical form ('search_path=public, pg_temp'); it is matched per entry so a
--    function with no SET at all (NULL proconfig) is reported, not skipped.
select is(
  array(select p.oid::regprocedure::text from pg_proc p
         where p.pronamespace = 'public'::regnamespace and p.prosecdef
           and not exists (select 1 from unnest(p.proconfig) as cfg(setting)
                            where cfg.setting ~ '^search_path=(.*, )?pg_temp$')
         order by 1),
  '{}'::text[], 'every SECURITY DEFINER function in public sets search_path with pg_temp last');

-- 3. A DEFINER function bypasses RLS, so anon may execute none of them
--    (neither by a direct grant nor through PUBLIC).
select is(
  array(select p.oid::regprocedure::text from pg_proc p
         where p.pronamespace = 'public'::regnamespace and p.prosecdef
           and has_function_privilege('anon', p.oid, 'EXECUTE')
         order by 1),
  '{}'::text[], 'anon cannot execute any SECURITY DEFINER function in public');

-- 4. The signed-in client keeps its three RPCs (src/app/lib/pairing.ts, sharing.ts).
select ok(has_function_privilege('authenticated', 'public.create_invite()', 'EXECUTE'),
  'authenticated can execute create_invite()');
select ok(has_function_privilege('authenticated', 'public.redeem_invite(text)', 'EXECUTE'),
  'authenticated can execute redeem_invite(text)');
select ok(has_function_privilege('authenticated', 'public.ensure_share_settings(uuid)', 'EXECUTE'),
  'authenticated can execute ensure_share_settings(uuid)');

-- 5. The 0003 sync trigger functions run as the caller, so 2 and 3 rightly skip them.
select isnt_definer('public', 'daily_logs_touch_server_updated_at', '{}'::name[],
  'daily_logs_touch_server_updated_at() is SECURITY INVOKER');
select isnt_definer('public', 'daily_logs_reject_stale_write', '{}'::name[],
  'daily_logs_reject_stale_write() is SECURITY INVOKER');

select * from finish();
rollback;
