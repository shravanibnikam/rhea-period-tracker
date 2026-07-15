-- Rhea — Supabase database setup
-- Run this in the Supabase SQL Editor to set up all tables, RLS, and functions.

-- ─── Tables ──────────────────────────────────────────────────────────────────

-- Daily log: the single source of truth
create table if not exists public.daily_logs (
  owner_id   uuid not null references auth.users(id) on delete cascade,
  date       date not null,
  flow       text,
  symptoms   text[] default '{}',
  mood       text,
  energy     text,
  notes      text,
  updated_at timestamptz default now(),
  primary key (owner_id, date)
);

-- Partner links: connects an owner to a partner
create table if not exists public.partner_links (
  owner_id   uuid not null references auth.users(id) on delete cascade,
  partner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (owner_id, partner_id)
);

-- Invite codes: single-use pairing codes
create table if not exists public.invites (
  code       text primary key,
  owner_id   uuid not null references auth.users(id) on delete cascade,
  used       boolean default false,
  created_at timestamptz default now()
);

-- User profiles: stores role and display name
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz default now()
);

-- ─── Row-Level Security ──────────────────────────────────────────────────────

alter table public.daily_logs    enable row level security;
alter table public.partner_links enable row level security;
alter table public.invites       enable row level security;
alter table public.profiles      enable row level security;

-- Owner: full read/write on own logs
create policy "owner rw own logs" on public.daily_logs
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- Partner: read-only on logs of an owner they're linked to
create policy "partner read linked logs" on public.daily_logs
  for select to authenticated
  using (exists (
    select 1 from public.partner_links pl
    where pl.owner_id = daily_logs.owner_id
      and pl.partner_id = auth.uid()
  ));

-- Either side can see their own link row
create policy "see own links" on public.partner_links
  for select to authenticated
  using (owner_id = auth.uid() or partner_id = auth.uid());

-- Owner can delete their own links (unpair)
create policy "owner delete links" on public.partner_links
  for delete to authenticated
  using (owner_id = auth.uid());

-- Owner manages invites
create policy "owner create invites" on public.invites
  for insert to authenticated
  with check (owner_id = auth.uid());

create policy "owner see invites" on public.invites
  for select to authenticated
  using (owner_id = auth.uid());

-- Anyone can read unused invites (to redeem them)
create policy "anyone read unused invites" on public.invites
  for select to authenticated
  using (used = false);

-- Profiles: users can read/write their own
create policy "own profile" on public.profiles
  for all to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ─── Pairing function ────────────────────────────────────────────────────────

create or replace function public.redeem_invite(invite_code text)
returns void language plpgsql security definer set search_path = public as $$
declare v_owner uuid;
begin
  select owner_id into v_owner from invites
    where code = invite_code and used = false;
  if v_owner is null then
    raise exception 'Invalid or used invite code';
  end if;
  insert into partner_links(owner_id, partner_id)
    values (v_owner, auth.uid())
    on conflict do nothing;
  update invites set used = true where code = invite_code;
end; $$;

grant execute on function public.redeem_invite(text) to authenticated;

-- ─── Auto-create profile on signup ───────────────────────────────────────────

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id)
    values (new.id)
    on conflict do nothing;
  return new;
end; $$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── Enable Realtime ─────────────────────────────────────────────────────────

alter publication supabase_realtime add table public.daily_logs;
