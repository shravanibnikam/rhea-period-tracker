-- Rhea Phase C — Sharing controls, shared notes, quiet windows
-- Run this in Supabase SQL Editor after the initial migration.

-- ─── Share settings ──────────────────────────────────────────────────────────

create table if not exists public.share_settings (
  owner_id   uuid not null references auth.users(id) on delete cascade,
  share_key  text not null,
  enabled    boolean default false,
  primary key (owner_id, share_key)
);

alter table public.share_settings enable row level security;

-- Owner can read/write their own settings
create policy "owner rw share_settings" on public.share_settings
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- Partner can read linked owner's settings
create policy "partner read share_settings" on public.share_settings
  for select to authenticated
  using (exists (
    select 1 from public.partner_links pl
    where pl.owner_id = share_settings.owner_id
      and pl.partner_id = auth.uid()
  ));

-- Seed default settings (all off) on first use via function
create or replace function public.ensure_share_settings(uid uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into share_settings (owner_id, share_key, enabled) values
    (uid, 'cycle_headsup', false),
    (uid, 'todays_phase', false),
    (uid, 'mood_signal', false),
    (uid, 'care_nudges', false),
    (uid, 'shared_notes', false)
  on conflict do nothing;
end; $$;

grant execute on function public.ensure_share_settings(uuid) to authenticated;

-- ─── Shared notes ────────────────────────────────────────────────────────────

create table if not exists public.shared_notes (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  author_id   uuid not null references auth.users(id) on delete cascade,
  content     text not null,
  created_at  timestamptz default now()
);

alter table public.shared_notes enable row level security;

-- Both sides of a partner link can read notes
create policy "read shared notes" on public.shared_notes
  for select to authenticated
  using (
    owner_id = auth.uid()
    or author_id = auth.uid()
    or exists (
      select 1 from public.partner_links pl
      where pl.owner_id = shared_notes.owner_id
        and pl.partner_id = auth.uid()
    )
  );

-- Both sides can insert (author_id must be self)
create policy "write shared notes" on public.shared_notes
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and (
      owner_id = auth.uid()
      or exists (
        select 1 from public.partner_links pl
        where pl.owner_id = shared_notes.owner_id
          and pl.partner_id = auth.uid()
      )
    )
  );

-- Enable realtime for shared notes
alter publication supabase_realtime add table public.shared_notes;

-- ─── Quiet windows ──────────────────────────────────────────────────────────

create table if not exists public.quiet_windows (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users(id) on delete cascade,
  start_date date not null,
  end_date   date not null,
  created_at timestamptz default now()
);

alter table public.quiet_windows enable row level security;

-- Owner can manage their own quiet windows
create policy "owner rw quiet_windows" on public.quiet_windows
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- Partner can read to know sharing is paused
create policy "partner read quiet_windows" on public.quiet_windows
  for select to authenticated
  using (exists (
    select 1 from public.partner_links pl
    where pl.owner_id = quiet_windows.owner_id
      and pl.partner_id = auth.uid()
  ));
