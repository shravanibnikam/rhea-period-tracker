# Supabase migrations

Versioned, additive-first migrations applied in lexical order by the Supabase CLI.

**Applied state: `0001`–`0006` are ALL applied to the production project**
(`jhhuimcsmvdihfeihhtu`), with history verified through the Management API on 2026-09-15.

`0006` was explicitly reviewed/approved by the owner and applied to production
on 2026-09-15, in the same transaction as its migration-history entry.

## Ledger

| File | Milestone | Applied | Summary |
|---|---|---|---|
| `0001_baseline.sql` | M0.3 / RHEA-007 | ✅ prod | Faithful capture of the previously hand-run schema (`migration.sql` + `migration-phase-c.sql` + `migration-phase-e.sql`). No schema change vs. what was hand-deployed. Reconciled into migration history via `migration repair --status applied 0001` after the missing `audit_log` slice was applied. |
| `0002_secure_invite_redemption.sql` | M0.3 / RHEA-008–009 | ✅ prod | **Security hotfix (TM-R1).** Drops `"anyone read unused invites"`; moves invites to hash-at-rest + TTL; atomic, single-use `redeem_invite(text)`; adds `create_invite()`. |
| `0003_owner_sync_metadata.sql` | M1.9 / RHEA-051 | ✅ prod | **Additive.** `daily_logs` gains `updated_hlc` (edit-time HLC — the legacy `updated_at timestamptz` already existed, so the plan's "updated_at text" is named `updated_hlc`), `device_id`, `deleted`, trigger-set `server_updated_at`, v2 fields (`medication`, `intimacy`), the keyset index, and the stale-write LWW guard trigger (silently skips an update whose HLC ≤ stored). **Deployment gate for `flags.syncEngine`.** |
| `0004_fix_invite_pgcrypto_schema.sql` | pairing hotfix | ✅ prod | **Invite pgcrypto fix (pairing release blocker).** `create_invite()`/`redeem_invite()` ran with `search_path = public` but Supabase installs `pgcrypto` in the `extensions` schema, so both RPCs errored `function gen_random_bytes does not exist` — no invite could be minted or redeemed. Schema-qualifies the pgcrypto calls (`extensions.gen_random_bytes`/`extensions.digest`); behaviour otherwise identical to `0002`. Pairing is now verified end-to-end (create → redeem → `partner_links`). |
| `0005_partner_calendar_symptom_shares.sql` | partner visibility | ✅ prod | **Additive, function-only.** Extends `ensure_share_settings()` to seed two new keys — `calendar_view` (partner sees the month view) and `symptom_details` (partner sees logged symptoms) — both defaulting to `false`. No table or RLS change: `share_settings.share_key` is free-form text and already carries owner-rw / partner-read policies. Existing owners backfill on their next `getShareSettings()` call; `on conflict do nothing` preserves toggles already set. |
| `0006_keepalive.sql` | hosting | ✅ prod | One boolean liveness row; RLS permits anonymous SELECT only, with no account or health data. |
| `0007_harden_definer_functions.sql` | SEC-14 | not yet (maintainer: `supabase db push`) | **Grants and settings only; no body, signature or data change.** The four `SECURITY DEFINER` functions (`handle_new_user`, `ensure_share_settings`, `create_invite`, `redeem_invite`) get `search_path = public, pg_temp` (`pg_temp` last); `EXECUTE` is revoked from `PUBLIC` and `anon` and restated for `authenticated` on the three client RPCs. Graded by `supabase/tests/rls_coverage.sql`. Before/after `db push`: see "Deploying 0007" below. |

### Deploying 0007

`ALTER FUNCTION` needs the function's owner, and `handle_new_user()` in production
dates from the hand-run baseline. Before `supabase db push`, confirm against
production (read-only) that all four functions are owned by the role `db push`
connects as (`postgres`):

```sql
select p.oid::regprocedure, pg_get_userbyid(p.proowner) as owner
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace and p.prosecdef;
```

If an `ALTER` fails with "must be owner", stop. Do not delete the `ALTER`, and
do not apply the `REVOKE` on its own: a non-owner's `REVOKE` only warns and
leaves `anon` able to execute. After the push, both of these must return no
rows:

```sql
select p.oid::regprocedure from pg_proc p
 where p.pronamespace = 'public'::regnamespace and p.prosecdef
   and not exists (select 1 from unnest(p.proconfig) s
                    where s ~ '^search_path=(.*, )?pg_temp$');
select p.oid::regprocedure from pg_proc p
 where p.pronamespace = 'public'::regnamespace and p.prosecdef
   and has_function_privilege('anon', p.oid, 'EXECUTE');
```

> **Migration-numbering note:** the earlier planning docs reserved `0004`+ for
> Phase-2 E2EE migrations. The shipped `0004` is the pairing pgcrypto fix and
> `0005` is the partner calendar/symptom share keys, so the planned E2EE sequence
> now follows the hosting keep-alive at `0006` and the SEC-14 hardening at `0007`:
> the next migration uses `0008` or the next available number. Planning documents
> that name later migrations `0007`–`0011` predate this, so each of those shifts
> by one. The older partner E2EE roadmap is
> superseded by the scoped plan in `docs/EXECUTION_PLAN.md`.
> **Applied migrations are never renamed or rewritten.**

The legacy hand-run `supabase/migration*.sql` scripts have been removed. Each was a
byte-identical copy of one marked section of `0001_baseline.sql` (`===== migration.sql =====`,
`===== migration-phase-c.sql =====`, `===== migration-phase-e.sql =====`), so nothing was lost;
running them by hand would have re-created the invite policy that `0002` removed.

## Applying

```bash
supabase start            # local stack
supabase db reset         # applies 0001..N from scratch
# or, against a linked project:
supabase db push
```

## Testing

```bash
supabase test db          # runs supabase/tests/*.sql (pgTAP)
```

## Verification status

- **Migrations `0001`–`0006`: applied to production** and exercised — owner sync
  runs on `0003`; pairing (create/redeem → `partner_links`) is verified
  end-to-end after `0004`. `0005` seeds the `calendar_view` / `symptom_details`
  share keys; because `setShareSetting` upserts, the toggles also function
  without it — the migration makes the default-off rows explicit.
- **pgTAP:** all five suites (`rls_invite.sql`, `rls_isolation.sql`,
  `rls_owner_sync.sql`, `rls_keepalive.sql`, `rls_coverage.sql`) passed locally on
  2026-10-01 against Supabase CLI 2.117.0 / Postgres 15 after applying migrations
  0001–0007. The first four (37 assertions) also passed on 2026-09-15 against
  0001–0006; `rls_coverage.sql` fails against 0001–0006 by design.
  CI now starts the local stack, resets it, runs the SQL suites and runs browser
  save/delete tests. This checks current plaintext RLS semantics, including
  linked-partner access; it does not claim encrypted partner isolation.
  See [testing instructions](../../docs/TESTING.md).

- **0006 production liveness:** the GitHub keep-alive workflow passed on manual
  dispatch after application. The first scheduled execution also passed on
  2026-09-15 (run 34981235349), verified on 2026-09-16.
