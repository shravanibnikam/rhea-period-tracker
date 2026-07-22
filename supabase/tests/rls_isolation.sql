-- pgTAP suite for daily_logs account isolation + partner link/unlink.
-- Run with: `supabase test db` (requires a local Supabase / Postgres + pgtap).
-- NOT executed in the implementation environment (no Postgres) — deployment
-- gate, see supabase/migrations/README.md.
--
-- Proves the cloud-side half of the account-isolation guarantee:
--   1. an unpaired account B cannot read owner A's daily_logs,
--   2. B cannot write rows as A (owner_id spoof denied by WITH CHECK),
--   3. partner read works ONLY after a valid partner_links row exists,
--   4. partner read disappears the moment the link is removed (unpair).

begin;
select plan(6);

-- Two unrelated accounts.
\set A '00000000-0000-0000-0000-0000000000aa'
\set B '00000000-0000-0000-0000-0000000000bb'

-- Seed A's private log as a privileged role (bypasses RLS for setup only).
set local role postgres;
insert into public.daily_logs (owner_id, date, flow, notes, updated_hlc, device_id)
values (:'A', '2026-01-05', 'heavy', 'private note', '000000000010:0000:devA', 'devA');

-- ── Helper: become an authenticated user by JWT claim ─────────────────────
create or replace function pg_temp.become(uid text) returns void
  language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;

-- 1. Unpaired account B cannot read A's log ---------------------------------
select pg_temp.become(:'B');
select is(
  (select count(*)::int from public.daily_logs where owner_id = :'A'),
  0,
  'unpaired account B reads zero of owner A''s daily_logs'
);

-- 2. B cannot forge a row owned by A (WITH CHECK denies owner_id spoof) ------
select throws_ok(
  format('insert into public.daily_logs (owner_id, date, flow) values (%L, %L, %L)',
         :'A', '2026-02-02', 'light'),
  '42501',
  null,
  'account B cannot insert a row under owner A''s owner_id (RLS WITH CHECK)'
);

-- 3. Establish a valid partner link (A owns, B is partner) -------------------
set local role postgres;
insert into public.partner_links (owner_id, partner_id) values (:'A', :'B');

select pg_temp.become(:'B');
select is(
  (select count(*)::int from public.daily_logs where owner_id = :'A'),
  1,
  'a linked partner B can read owner A''s daily_logs'
);
select is(
  (select notes from public.daily_logs where owner_id = :'A' and date = '2026-01-05'),
  'private note',
  'linked partner sees the actual log content'
);

-- 4. Unpair: removing the link revokes read immediately ---------------------
set local role postgres;
delete from public.partner_links where owner_id = :'A' and partner_id = :'B';

select pg_temp.become(:'B');
select is(
  (select count(*)::int from public.daily_logs where owner_id = :'A'),
  0,
  'after unlink, former partner B can no longer read owner A''s daily_logs'
);

-- 5. B still reads nothing when querying without an owner filter ------------
select is(
  (select count(*)::int from public.daily_logs),
  0,
  'unpaired B sees an empty daily_logs table (only own rows, of which there are none)'
);

select * from finish();
rollback;
