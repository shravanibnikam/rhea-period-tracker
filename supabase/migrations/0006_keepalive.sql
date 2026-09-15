-- A public liveness read with no account or health data.
create table public.keepalive (
  id boolean primary key default true check (id)
);

insert into public.keepalive (id) values (true);

alter table public.keepalive enable row level security;
revoke all on public.keepalive from public, anon, authenticated;
grant select on public.keepalive to anon;
create policy "anon read keepalive" on public.keepalive
  for select to anon using (true);
