# Supabase migrations

Versioned, additive-first migrations applied in lexical order by the Supabase CLI.

## Ledger

| File | Milestone | Summary |
|---|---|---|
| `0001_baseline.sql` | M0.3 / RHEA-007 | Faithful capture of the previously hand-run schema (`migration.sql` + `migration-phase-c.sql` + `migration-phase-e.sql`). No schema change vs. what is deployed. |
| `0002_secure_invite_redemption.sql` | M0.3 / RHEA-008–009 | **Security hotfix (TM-R1).** Drops `"anyone read unused invites"`; moves invites to hash-at-rest + TTL; atomic, single-use `redeem_invite(text)`; adds `create_invite()`. |
| `0003_owner_sync_metadata.sql` | M1.9 / RHEA-051 | **Additive.** `daily_logs` gains `updated_hlc` (edit-time HLC — the legacy `updated_at timestamptz` already existed, so the plan's "updated_at text" is named `updated_hlc`), `device_id`, `deleted`, trigger-set `server_updated_at`, v2 fields (`medication`, `intimacy`), the keyset index, and the stale-write LWW guard trigger (silently skips an update whose HLC ≤ stored). **Deployment gate for `flags.syncEngine`** — apply before shipping the M1.9 client. |

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

⚠️ These SQL migrations and pgTAP tests were **authored but not executed** in the
implementation environment, which has no Postgres/Supabase instance or `supabase`
CLI. Per RISK_REGISTER **R-PRIV-5 / R-PAIR-3**, RLS changes must be pgTAP-verified
before shipping — run `supabase db reset && supabase test db` in an environment
with the stack available and confirm green before deploying `0002`+.

Additional client coupling: the M1.9 client (`flags.syncEngine = true`) writes
the `0003` columns. Until `0003` is applied, engine pushes fail and back off
harmlessly (local data is never at risk), but sync will not progress — apply
`0003` before or with the client deployment.
