-- 0004_fix_invite_pgcrypto_schema.sql
-- Pairing release blocker: create_invite()/redeem_invite() call pgcrypto
-- (gen_random_bytes, digest) but run with `search_path = public`, while Supabase
-- installs pgcrypto in the `extensions` schema. Both RPCs therefore errored with
-- "function gen_random_bytes(integer) does not exist" — no invite could be minted
-- or redeemed. Fix: schema-qualify the pgcrypto calls. search_path stays tight
-- (public) so the SECURITY DEFINER functions resolve app tables safely; only the
-- extension calls are qualified. Behaviour is otherwise identical to 0002.

create or replace function public.create_invite()
returns text language plpgsql security definer set search_path = public as $$
declare
  v_secret text;
begin
  -- ~120 bits of entropy, URL-safe base64 (case-sensitive), no padding.
  v_secret := replace(replace(encode(extensions.gen_random_bytes(15), 'base64'), '+', '-'), '/', '_');
  insert into public.invites (owner_id, code_hash)
    values (auth.uid(), encode(extensions.digest(v_secret, 'sha256'), 'hex'));
  return v_secret; -- returned to the owner ONCE; never persisted in plaintext
end;
$$;
grant execute on function public.create_invite() to authenticated;

create or replace function public.redeem_invite(p_secret text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id    uuid;
  v_owner uuid;
begin
  select id, owner_id into v_id, v_owner
    from public.invites
    where code_hash = encode(extensions.digest(p_secret, 'sha256'), 'hex')
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
