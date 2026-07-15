-- 0002_secure_invite_redemption.sql
-- Security hotfix for TM-R1 (V2_ARCHITECTURE_REVIEW / RISK_REGISTER R-PAIR-3):
-- the "anyone read unused invites" policy let ANY authenticated user enumerate
-- and redeem every outstanding invite, hijacking pairings. This migration:
--   1. drops that policy (the acute fix);
--   2. moves invites to hash-at-rest + TTL (plaintext secret never stored);
--   3. replaces redeem_invite() with an atomic, TTL-checked, single-use RPC;
--   4. adds create_invite() so the server mints the secret and stores only its hash.
--
-- Invites are ephemeral, single-use tokens, so dropping any in-flight rows on
-- upgrade is acceptable and documented.
--
-- NOTE: This is a destructive-then-additive migration but the replacement (the
-- RPCs) ships in the SAME migration, so no data path is left without a successor
-- (sequencing invariant, V2_IMPLEMENTATION_PLAN §1.1).

create extension if not exists pgcrypto;

-- 1. Close the hole ----------------------------------------------------------
drop policy if exists "anyone read unused invites" on public.invites;
drop policy if exists "owner create invites"       on public.invites;
drop policy if exists "owner see invites"          on public.invites;

-- 2. Rebuild invites for hash-at-rest + TTL ----------------------------------
-- (single-use ephemeral tokens: any outstanding plaintext-code invites are
--  intentionally discarded here.)
drop table if exists public.invites cascade;
create table public.invites (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users(id) on delete cascade,
  code_hash  text not null,          -- sha256(secret) hex; plaintext never stored
  used       boolean not null default false,
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  created_at timestamptz not null default now()
);
create index invites_code_hash_idx on public.invites (code_hash);

alter table public.invites enable row level security;

-- Owner may create / read / revoke ONLY their own invites; no cross-account read.
create policy "owner manage own invites" on public.invites
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- 3. create_invite(): server mints the secret, stores only its hash ----------
create or replace function public.create_invite()
returns text language plpgsql security definer set search_path = public as $$
declare
  v_secret text;
begin
  -- ~120 bits of entropy, URL-safe, copy/paste- (and QR-, in M2.5) friendly.
  v_secret := replace(replace(encode(gen_random_bytes(15), 'base64'), '+', '-'), '/', '_');
  insert into public.invites (owner_id, code_hash)
    values (auth.uid(), encode(digest(v_secret, 'sha256'), 'hex'));
  return v_secret;  -- returned to the owner ONCE; never persisted in plaintext
end;
$$;
grant execute on function public.create_invite() to authenticated;

-- 4. redeem_invite(): atomic, TTL-checked, single-use ------------------------
-- Return type changes (void -> uuid), so the old function must be dropped first.
drop function if exists public.redeem_invite(text);

create or replace function public.redeem_invite(p_secret text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id    uuid;
  v_owner uuid;
begin
  -- Row lock makes concurrent double-redemption yield exactly one winner.
  select id, owner_id into v_id, v_owner
    from public.invites
    where code_hash = encode(digest(p_secret, 'sha256'), 'hex')
      and used = false
      and expires_at > now()
    for update;

  if v_id is null then
    raise exception 'Invalid, expired, or already-used invite';
  end if;

  if v_owner = auth.uid() then
    raise exception 'You cannot pair with yourself';
  end if;

  insert into public.partner_links (owner_id, partner_id)
    values (v_owner, auth.uid())
    on conflict do nothing;

  update public.invites set used = true where id = v_id;
  return v_owner;
end;
$$;
grant execute on function public.redeem_invite(text) to authenticated;
