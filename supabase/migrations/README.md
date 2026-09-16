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

> **Migration-numbering note:** the earlier planning docs reserved `0004`+ for
> Phase-2 E2EE migrations. The shipped `0004` is the pairing pgcrypto fix and
> `0005` is the partner calendar/symptom share keys, so the planned E2EE sequence
> now follows the hosting keep-alive at `0006`: owner ciphertext columns must
> use `0007` or the next available number. The older partner E2EE roadmap is
> superseded by the scoped plan in `docs/EXECUTION_PLAN.md`.
> **Applied migrations are never renamed or rewritten.**

The legacy `supabase/migration*.sql` scripts are superseded by `0001_baseline.sql`
and kept only for historical reference.

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
- **pgTAP:** all four suites (`rls_invite.sql`, `rls_isolation.sql`,
  `rls_owner_sync.sql`, `rls_keepalive.sql`) passed locally on 2026-09-15: 37 assertions against
  Supabase CLI 2.117.0 / Postgres 15 after applying migrations 0001–0006.
  CI now starts the local stack, resets it, runs the SQL suites and runs browser
  save/delete tests. This checks current plaintext RLS semantics, including
  linked-partner access; it does not claim encrypted partner isolation.
  See [testing instructions](../../docs/TESTING.md).

- **0006 production liveness:** the GitHub keep-alive workflow passed on manual
  dispatch after application. The first scheduled execution also passed on
  2026-09-15 (run 34981235349), verified on 2026-09-16.
