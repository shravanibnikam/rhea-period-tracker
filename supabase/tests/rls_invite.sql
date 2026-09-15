-- Invite schema, hash-at-rest, RLS, TTL and single-use behavior.
-- All fixtures are synthetic and rolled back. Run: supabase test db

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(15);

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

-- Seed identities as postgres; exercise RPCs and reads as authenticated users.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000aa', 'invite-owner@example.test'),
  ('00000000-0000-0000-0000-0000000000bb', 'invite-partner@example.test'),
  ('00000000-0000-0000-0000-0000000000cc', 'invite-stranger@example.test');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000aa","role":"authenticated"}';
select public.create_invite() as secret \gset
select is(
  (select code_hash from public.invites where owner_id = auth.uid()),
  encode(extensions.digest(:'secret', 'sha256'), 'hex'),
  'create_invite stores the hash of the returned secret'
);
select ok(
  (select expires_at > now() and expires_at <= now() + interval '30 minutes'
   from public.invites where owner_id = auth.uid()),
  'new invite expires within 30 minutes'
);
select throws_ok(
  format('select public.redeem_invite(%L)', :'secret'),
  'P0001', 'You cannot pair with yourself', 'owner cannot redeem own invite'
);

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000bb","role":"authenticated"}';
select is((select count(*)::int from public.invites), 0,
  'unlinked user cannot enumerate another owner invites');
select is(public.redeem_invite(:'secret'),
  '00000000-0000-0000-0000-0000000000aa'::uuid,
  'partner redeems a valid secret and receives owner id');
select is((select count(*)::int from public.partner_links
  where owner_id = '00000000-0000-0000-0000-0000000000aa' and partner_id = auth.uid()),
  1, 'redemption creates exactly one visible partner link');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000cc","role":"authenticated"}';
select throws_ok(format('select public.redeem_invite(%L)', :'secret'),
  'P0001', 'Invalid, expired, or already-used invite',
  'another user cannot reuse the redeemed invite');
select throws_ok($$select public.redeem_invite('invalid-secret')$$,
  'P0001', 'Invalid, expired, or already-used invite', 'invalid secret is rejected');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000aa","role":"authenticated"}';
select public.create_invite() as expired_secret \gset
reset role;
update public.invites set expires_at = now() - interval '1 second'
  where code_hash = encode(extensions.digest(:'expired_secret', 'sha256'), 'hex');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000cc","role":"authenticated"}';
select throws_ok(format('select public.redeem_invite(%L)', :'expired_secret'),
  'P0001', 'Invalid, expired, or already-used invite', 'expired secret is rejected');

select * from finish();
rollback;
