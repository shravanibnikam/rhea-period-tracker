-- No privileged credential is needed for the workflow's liveness read.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(6);

select ok((select relrowsecurity from pg_class where oid = 'public.keepalive'::regclass),
  'keepalive has RLS enabled');
set local role anon;
select is((select count(*)::int from public.keepalive where id), 1,
  'anon can read the single liveness row');
select throws_ok('insert into public.keepalive (id) values (false)', '42501', null,
  'anon cannot insert');
select throws_ok('update public.keepalive set id = false', '42501', null,
  'anon cannot update');
select throws_ok('delete from public.keepalive', '42501', null,
  'anon cannot delete');
reset role;
select throws_ok('insert into public.keepalive (id) values (false)', '23514', null,
  'table constrains the key to a single possible row');

select * from finish();
rollback;
