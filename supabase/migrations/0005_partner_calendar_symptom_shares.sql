-- 0005_partner_calendar_symptom_shares.sql
-- Adds two share keys so an owner can let her partner see the cycle calendar
-- (`calendar_view`) and her logged symptoms (`symptom_details`). Both default
-- to OFF, like every other key, and are paused by quiet windows in the client.
--
-- No schema change is needed: share_settings.share_key is free-form text and the
-- table already carries the right RLS (owner rw / partner read). The only server
-- work is seeding the two new rows. ensure_share_settings() runs on every
-- getShareSettings() call, so existing owners backfill on their next load —
-- `on conflict do nothing` keeps any toggle they have already set untouched.

create or replace function public.ensure_share_settings(uid uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into share_settings (owner_id, share_key, enabled) values
    (uid, 'cycle_headsup', false),
    (uid, 'todays_phase', false),
    (uid, 'mood_signal', false),
    (uid, 'care_nudges', false),
    (uid, 'shared_notes', false),
    (uid, 'calendar_view', false),
    (uid, 'symptom_details', false)
  on conflict do nothing;
end; $$;

grant execute on function public.ensure_share_settings(uuid) to authenticated;
