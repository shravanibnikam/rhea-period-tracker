-- pgTAP tests for the invite-security hotfix (M0.3 / RHEA-011).
-- Run with: `supabase test db` (requires the pgtap extension).
--
-- Schema-level assertions below run standalone. The behavioral RLS assertions
-- (cross-account read denial, atomic single-winner double-redeem) require JWT
-- claim mocking (`set local request.jwt.claims`) and are sketched at the bottom
-- to be completed against the running test database.

begin;
select plan(6);

-- TM-R1: the hijack policy must be gone.
select ok(
  not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'invites'
      and policyname = 'anyone read unused invites'
  ),
  'TM-R1: "anyone read unused invites" policy is removed'
);

-- Hardened functions exist with expected signatures / return types.
select has_function('public', 'create_invite', '{}'::text[],
  'create_invite() exists');
select has_function('public', 'redeem_invite', array['text'],
  'redeem_invite(text) exists');
select function_returns('public', 'redeem_invite', array['text'], 'uuid',
  'redeem_invite returns the owner uuid');

-- Hash-at-rest + TTL columns present (no plaintext code column).
select has_column('public', 'invites', 'code_hash',
  'invites.code_hash present (hash-at-rest)');
select has_column('public', 'invites', 'expires_at',
  'invites.expires_at present (TTL)');

select * from finish();
rollback;

-- ── Behavioral assertions to complete against the running test DB ───────────
-- 1. As user A: v_secret := create_invite();  redeem as A  -> raises (self-pair).
-- 2. As user B: redeem_invite(v_secret) -> returns A; partner_links has (A,B).
-- 3. As user C: redeem_invite(v_secret) -> raises (already used).
-- 4. Directly `select * from invites` as user B -> 0 rows (RLS: owner-only).
-- 5. Expired invite (expires_at in the past) -> redeem raises.
-- These require: set local role authenticated; set local request.jwt.claims
--   to '{"sub":"<uuid>","role":"authenticated"}' per simulated user.
