-- pgTAP suite for 0003_owner_sync_metadata (M1.9 / RHEA-054).
-- Run with: supabase test db   (requires a local Supabase / Postgres).

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(10);

-- ── Schema assertions ─────────────────────────────────────────────────────
select has_column('public', 'daily_logs', 'updated_hlc',        'daily_logs has updated_hlc');
select has_column('public', 'daily_logs', 'device_id',          'daily_logs has device_id');
select has_column('public', 'daily_logs', 'deleted',            'daily_logs has deleted');
select has_column('public', 'daily_logs', 'server_updated_at',  'daily_logs has server_updated_at');
select has_column('public', 'daily_logs', 'medication',         'daily_logs has medication');
select has_column('public', 'daily_logs', 'intimacy',           'daily_logs has intimacy');

select has_index('public', 'daily_logs', 'idx_daily_logs_server_order',
                 'keyset paging index exists');

select has_function('public', 'daily_logs_reject_stale_write',
                    'stale-write guard function exists');

-- ── Behavioral: server_updated_at is server-authored ──────────────────────
-- Privileged setup; account isolation is covered by rls_isolation.sql.
insert into auth.users (id, email)
values ('00000000-0000-0000-0000-000000000001', 'sync@example.test');
insert into public.daily_logs (owner_id, date, flow, updated_hlc, device_id)
values ('00000000-0000-0000-0000-000000000001', '2026-07-01', 'medium',
        '000000000010:0000:devA', 'devA');

select isnt(
  (select server_updated_at from public.daily_logs
    where owner_id = '00000000-0000-0000-0000-000000000001' and date = '2026-07-01'),
  null,
  'server_updated_at is set by trigger on insert'
);

-- ── Behavioral: stale-write guard keeps the newer stored HLC ──────────────
update public.daily_logs
   set flow = 'light', updated_hlc = '000000000005:0000:devB'   -- OLDER HLC
 where owner_id = '00000000-0000-0000-0000-000000000001' and date = '2026-07-01';

select is(
  (select flow from public.daily_logs
    where owner_id = '00000000-0000-0000-0000-000000000001' and date = '2026-07-01'),
  'medium',
  'stale-write (older HLC) is silently skipped — stored row survives (LWW backstop)'
);

select * from finish();
rollback;
