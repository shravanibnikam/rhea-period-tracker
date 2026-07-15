-- 0003_owner_sync_metadata.sql (M1.9 / RHEA-051)
-- ADDITIVE ONLY. Adds the sync-engine metadata to daily_logs so the owner
-- multi-device replica can merge by HLC and page by server order. Old clients
-- ignore every new column and keep working against (owner_id, date).
--
-- Naming note (deviation from the plan's sketch): the plan said to add
-- "updated_at text (HLC)", but daily_logs already has a legacy
-- `updated_at timestamptz` (client-written). The HLC column is therefore
-- `updated_hlc` — renaming the legacy column would not be additive.
-- See docs/IMPLEMENTATION_JOURNAL.md S2.9.

-- 1) Sync metadata columns -----------------------------------------------------
alter table public.daily_logs
  add column if not exists updated_hlc text,           -- edit-time HLC (client-authored)
  add column if not exists device_id  text,            -- authoring device (echo suppression)
  add column if not exists deleted    boolean not null default false,
  add column if not exists server_updated_at timestamptz, -- server receive order (trigger-set)
  add column if not exists medication jsonb not null default '[]'::jsonb, -- v2 additive fields
  add column if not exists intimacy   jsonb;           -- v2 additive (null = unknown)

-- Backfill server order for pre-existing rows so keyset paging sees them.
update public.daily_logs
   set server_updated_at = coalesce(updated_at, now())
 where server_updated_at is null;

-- 2) server_updated_at is server-authored, never client-written ----------------
create or replace function public.daily_logs_touch_server_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.server_updated_at := now();
  return new;
end;
$$;

-- 3) Server-side LWW backstop (stale-write guard, spec Sync ch. §2.3) ----------
-- On UPDATE, an incoming row whose HLC is <= the stored HLC is SKIPPED
-- (return null) instead of raising: batch upserts stay atomic, the newer
-- stored row survives, and the laggy client converges on its next pull.
create or replace function public.daily_logs_reject_stale_write()
returns trigger
language plpgsql
as $$
begin
  if new.updated_hlc is not null
     and old.updated_hlc is not null
     and new.updated_hlc <= old.updated_hlc then
    return null; -- silently keep the newer stored row (LWW)
  end if;
  new.server_updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_daily_logs_server_updated_at_ins on public.daily_logs;
create trigger trg_daily_logs_server_updated_at_ins
  before insert on public.daily_logs
  for each row execute function public.daily_logs_touch_server_updated_at();

drop trigger if exists trg_daily_logs_server_updated_at_upd on public.daily_logs;
create trigger trg_daily_logs_server_updated_at_upd
  before update on public.daily_logs
  for each row execute function public.daily_logs_reject_stale_write();

-- 4) Keyset-paging index (pull ordering: server_updated_at, date) --------------
create index if not exists idx_daily_logs_server_order
  on public.daily_logs (owner_id, server_updated_at, date);
