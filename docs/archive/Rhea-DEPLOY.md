# Deploying Rhea — database, logins, and live partner sync

Goal: a real database, your own login, your partner's login, and **live** updates — your partner's open app changes the moment you log something, and all your devices stay in sync. All on free tiers, reachable by opening one URL on any phone or laptop.

**Stack:** Supabase (Postgres + Auth + Realtime) for the backend, Vercel (or Netlify) for the site. Total setup ≈ 30–45 min.

How the pieces fit:

```
You log data ──► Postgres (Supabase) ──► Realtime websocket ──► Partner's open app updates instantly
     ▲                                                                      
     └───────────── your other devices get the same push ──────────────────┘
```

---

## Part A — Backend: database, auth, realtime (Supabase)

### A1. Create the project
1. Go to supabase.com → **New project**. Pick a name ("rhea"), a strong DB password, a region near you.
2. When it's ready, open **Project Settings → API Keys** and copy two values:
   - **Project URL** (e.g. `https://xxxx.supabase.co`)
   - **Publishable key** (`sb_publishable_...`) — this is the client-side key. *(If you only see legacy keys, the `anon` key works too, but the publishable key is the current one; legacy keys are being retired by end of 2026.)*
   - **Never** put the secret/`service_role` key in the frontend.

### A2. Create the tables
Open **SQL Editor** and run:

```sql
-- Your daily log: the single source of truth
create table public.daily_logs (
  owner_id  uuid not null references auth.users(id) on delete cascade,
  date      date not null,
  flow      text,
  symptoms  text[] default '{}',
  mood      text,
  energy    text,
  notes     text,
  updated_at timestamptz default now(),
  primary key (owner_id, date)
);

-- Links an owner (you) to a partner
create table public.partner_links (
  owner_id   uuid not null references auth.users(id) on delete cascade,
  partner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (owner_id, partner_id)
);

-- One-time invite codes so the partner can pair with you
create table public.invites (
  code       text primary key,
  owner_id   uuid not null references auth.users(id) on delete cascade,
  used       boolean default false,
  created_at timestamptz default now()
);
```

### A3. Lock it down with Row-Level Security
This is the important part: the **database itself** decides who can read what, so a bug in the app can never leak your logs.

```sql
alter table public.daily_logs   enable row level security;
alter table public.partner_links enable row level security;
alter table public.invites       enable row level security;

-- You: full read/write on your own logs
create policy "owner rw own logs" on public.daily_logs
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- Partner: read-only on the logs of an owner they're linked to
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

-- You manage invites
create policy "owner create invites" on public.invites
  for insert to authenticated with check (owner_id = auth.uid());
create policy "owner see invites" on public.invites
  for select to authenticated using (owner_id = auth.uid());
```

### A4. Pairing function (partner redeems an invite)
The partner can't write to `partner_links` directly (they're not the owner), so pairing goes through a trusted function:

```sql
create or replace function public.redeem_invite(invite_code text)
returns void language plpgsql security definer set search_path = public as $$
declare v_owner uuid;
begin
  select owner_id into v_owner from invites where code = invite_code and used = false;
  if v_owner is null then raise exception 'Invalid or used invite'; end if;
  insert into partner_links(owner_id, partner_id) values (v_owner, auth.uid())
    on conflict do nothing;
  update invites set used = true where code = invite_code;
end; $$;

grant execute on function public.redeem_invite(text) to authenticated;
```

### A5. Turn on Realtime for live updates
```sql
alter publication supabase_realtime add table public.daily_logs;
```
That's what pushes changes over a websocket. Because RLS is checked on every event, your partner only ever receives rows they're allowed to see.

### A6. Auth
Email + password is on by default (**Authentication → Providers**). For a nicer experience later you can enable magic links or passkeys. For local testing you may want to turn **off** "Confirm email" (Authentication → settings) so signups work instantly; turn it back on for real use.

---

## Part B — Wire the app to Supabase

In your `rhea-website` project:

```bash
npm i @supabase/supabase-js
```

Create `.env` (and add the same values in Vercel later):

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx
```

`src/lib/supabase.ts`:

```ts
import { createClient } from '@supabase/supabase-js';
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
);
```

**Auth (same forms for you and partner):**
```ts
await supabase.auth.signUp({ email, password });          // first time
await supabase.auth.signInWithPassword({ email, password }); // returning
const { data: { user } } = await supabase.auth.getUser();
await supabase.auth.signOut();
```

**You: save a day's log** (upsert = insert or update that date):
```ts
await supabase.from('daily_logs').upsert({
  owner_id: user.id, date, flow, symptoms, mood, energy, notes,
}, { onConflict: 'owner_id,date' });
```

**Load + subscribe to live changes** (works for both your own devices and the partner):
```ts
// initial load
const { data } = await supabase.from('daily_logs')
  .select('*').eq('owner_id', ownerId).order('date');
setLogs(data ?? []);

// live updates
const channel = supabase.channel('rhea-logs')
  .on('postgres_changes',
    { event: '*', schema: 'public', table: 'daily_logs',
      filter: `owner_id=eq.${ownerId}` },
    (payload) => {
      // payload.new has the changed row (payload.old on delete)
      applyChange(payload);   // merge into local state → UI updates instantly
    })
  .subscribe();

// cleanup on unmount
return () => { supabase.removeChannel(channel); };
```

For **your own** account `ownerId = user.id`. For the **partner**, look it up from the link:
```ts
const { data } = await supabase.from('partner_links')
  .select('owner_id').eq('partner_id', user.id).single();
const ownerId = data.owner_id;   // subscribe to this
```

**Pairing UI:**
```ts
// You: make an invite code and share it (text it to them)
const code = crypto.randomUUID().slice(0, 8);
await supabase.from('invites').insert({ code, owner_id: user.id });

// Partner: after signing up, enter the code
await supabase.rpc('redeem_invite', { invite_code: code });
```

---

## Part C — Deploy the site

1. Push the project to a **GitHub** repo.
2. Go to **vercel.com → New Project → import the repo.** Framework preset: **Vite** (build `npm run build`, output `dist`).
3. Add the two env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`) in the Vercel project settings.
4. **Deploy.** You get a URL like `rhea.vercel.app`.
5. Open it on each phone/laptop → browser menu → **Add to Home Screen** to install it as an app. (Your existing manifest + icons already make it installable.)

*(Netlify is equivalent: drag-drop or connect the repo, set the same env vars, publish directory `dist`.)*

---

## Part D — The end-to-end test

1. Open the URL on your laptop, sign up, log a day.
2. Create an invite code; text it to your partner.
3. Partner opens the same URL on their phone, signs up, enters the code.
4. Partner's app subscribes to your `owner_id`.
5. Back on your laptop, change today's flow/symptoms → **your partner's screen updates within a second**, no refresh. Your own phone does too.

That's a real database, two logins, and live sync.

---

## Notes, gotchas, next steps

- **Free tier** is plenty for two people. One catch: free Supabase projects **pause after ~1 week of inactivity** — just un-pause from the dashboard, or a paid plan avoids it.
- **Client key only.** Use the publishable (or legacy `anon`) key in the frontend. RLS is what keeps data safe with a public client key — never ship the secret key.
- **Delete events** can't be server-filtered on Postgres Changes; if you support deleting a day, handle the delete client-side by row id. Minor.
- **This MVP lets the partner read your raw `daily_logs`.** That gets live sync working fastest. The privacy-preserving version from the specs is the next step: instead of the partner reading `daily_logs`, expose a **curated view** (a SQL `view` or a `partner_view` table that only contains `days_until_period`, `phase_label`, an optional mood flag) and point the partner's RLS + subscription at *that*. Same mechanism, less exposure. Do this before real use.
- **Un-pair = revoke:** deleting the `partner_links` row instantly cuts the partner's access (RLS stops returning your rows) — wire a button to `delete from partner_links`.
- **Scaling:** if this ever grew beyond a couple of users, Supabase recommends their **Broadcast** feature (DB triggers → `realtime.broadcast_changes()`) over Postgres Changes. Not needed for two people.
- **Where ML/import fit:** run those as a small backend job (or Supabase Edge Function) that reads `daily_logs` and writes to a `predictions` table; the app subscribes to that table the same way. See `Rhea-technical-spec.md`.
```
