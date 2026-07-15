-- Rhea Phase E — Audit log
-- Run this in Supabase SQL Editor.

create table if not exists public.audit_log (
  id         uuid primary key default gen_random_uuid(),
  actor_id   uuid not null references auth.users(id) on delete cascade,
  action     text not null,
  target     text,
  created_at timestamptz default now()
);

alter table public.audit_log enable row level security;

-- Owner can read their own audit entries
create policy "owner read audit" on public.audit_log
  for select to authenticated
  using (actor_id = auth.uid());

-- Authenticated users can insert (logging their own actions)
create policy "insert audit" on public.audit_log
  for insert to authenticated
  with check (actor_id = auth.uid());
