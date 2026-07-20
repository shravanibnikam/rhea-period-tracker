# Repository Overview

Orientation document for engineers joining the Rhea codebase. Last updated **2026-07-20** (app version 0.2.0).

> **Current deployed state (2026-07-20).** The v2 branch has been merged to `main`
> and is **live** at https://rhea-period-tracker.vercel.app (Vercel auto-deploys
> `main`). Supabase migrations **`0001`–`0004` are all applied to production**.
> Phase 1 (local-first + owner sync) is shipped; **partner pairing is fixed and
> verified end-to-end**; the delete-sync fixes are deployed and unit-tested but a
> final **live delete E2E is still pending**. Phase 2 (E2EE) has only the M2.1
> crypto primitives — cloud health data is **still plaintext** and the partner
> path is **still legacy plaintext**. See [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md)
> for the current-state section.

Where authority lives:

- [RHEA_V2_TECHNICAL_SPEC.md](RHEA_V2_TECHNICAL_SPEC.md) — the design authority. If this overview and the spec disagree, the spec wins.
- [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) — current milestone/ticket state.
- [IMPLEMENTATION_JOURNAL.md](IMPLEMENTATION_JOURNAL.md) — chronological history, including deviations from plan.
- [adr/](adr/) — accepted architecture decision records (process, layering, HLC/LWW, StorageDriver, crypto library).

## What Rhea is

Rhea is a local-first, installable web app (TypeScript + React 18 + Vite + Tailwind) for menstrual-cycle tracking with an optional partner-sharing mode. All cycle derivation (periods, cycles, phases, predictions) is computed on the client from one `DailyLog` record per date. Persistence is browser IndexedDB; when Supabase env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`) are configured, the app adds auth, cross-device sync, and pairing. Phase 0 (stabilization) and Phase 1 (layered re-architecture + sync engine) are complete; Phase 2 (end-to-end encryption) is starting now.

## Layered layout

Source lives under `src/` in five layers. Import direction is strictly downward (`app → sync → data → domain → kernel`) and is enforced by ESLint `import/no-restricted-paths` in [eslint.config.js](../eslint.config.js). The legacy `src/lib/` and `src/types/` directories are deleted.

```
src/kernel/            # dependency-free primitives
  assert.ts            #   invariant/assert helpers
  brand.ts             #   branded types (e.g. IsoDate)
  errors.ts            #   typed error taxonomy
  logger.ts            #   structured logger (no console.* elsewhere)
  result.ts            #   Result<T, E>

src/domain/            # pure functions, no I/O
  cycle.ts             #   period/cycle detection, averages, predictions
  phases.ts            #   phase model and copy
  dates.ts             #   date-key math
  hlc.ts               #   hybrid logical clock (tick/receive/compare)
  merge.ts             #   LWW merge decision (decideMerge)
  constants.ts, types.ts

src/data/              # local persistence
  schema.ts            #   store definitions, DB_VERSION, meta keys
  drivers/             #   StorageDriver interface; IndexedDbDriver; MemoryDriver (tests)
  storageManager.ts    #   per-account driver lifecycle (rhea-<uid> / rhea-local)
  repositories/        #   LogRepository, MetaRepository (HLC stamping + outbox enqueue)
  migrations/indexeddb/#   v1_to_v2 upgrade
  envelope.ts          #   payload envelope (plaintext passthrough until M2.4)
  exporter.ts, importer.ts, legacyImport.ts, syncStamp.ts, errors.ts

src/sync/              # replication engine
  SyncEngine.ts        #   push/pull orchestration, backoff, resync()
  outbox.ts            #   durable outbox drain
  reconcile.ts         #   applies pulled rows via domain merge
  cursor.ts            #   per-scope pull cursor
  initialSeed.ts       #   first-sync seeding of pre-existing local data
  transports/          #   Transport interface; SupabaseTransport; NullTransport

src/app/               # React shell (entry: src/app/main.tsx)
  App.tsx              #   composition of views/state
  di/Container.ts      #   DI composition root (plus context.ts, Providers.tsx)
  hooks/               #   useAuth, useCycleData, useLogger
  components/          #   ErrorBoundary, layout/, shared/
  views/               #   auth/, tracker/, partner/, settings/
  lib/                 #   legacy modules pending Phase-2 rework:
                       #   flags, pairing, sharing, sync, audit, supabase,
                       #   transports, constants, format
  styles/              #   Tailwind/theme CSS
```

`src/app/lib/` holds the surviving legacy integration modules (pairing, sharing, audit, Supabase client, legacy partner sync). They are quarantined at the app layer and are replaced milestone-by-milestone in Phase 2.

## Data flow

1. `DailyLog` (one per `YYYY-MM-DD`) is the single source of truth; all cycle state is derived from it by `src/domain/cycle.ts`.
2. Writes go through `src/data/repositories/LogRepository.ts`, which stamps each row with an HLC (`updatedAt`, an HLC string) plus `deviceId` via `src/data/syncStamp.ts` and enqueues an outbox entry **in the same IndexedDB transaction** — no write can be persisted without becoming pushable.
3. `src/sync/SyncEngine.ts` drains the outbox (push) and pulls by keyset cursor; pulled rows go through `reconcile.ts` → `domain/merge.ts` `decideMerge`, a last-writer-wins compare on HLC. Self-authored rows participate in the same compare: a tie/older self-row is skipped (reason `"echo"`), a strictly-newer or locally-missing self-row is applied (restore/rollback path). `SyncEngine.resync()` resets the pull cursor only; it does not clear the local scope.
4. The remote is Supabase Postgres (`daily_logs`, RLS-scoped). Payloads are **plaintext** through `src/data/envelope.ts` until the E2EE cutover (M2.4); Phase 2 replaces the plaintext columns with ciphertext and partner projections.

## Local storage

- Per-account IndexedDB database `rhea-<uid>` (or `rhea-local` when signed out), managed by `src/data/storageManager.ts`.
- `DB_VERSION = 2` ([src/data/schema.ts](../src/data/schema.ts)), eight stores: `logs`, `meta`, `outbox`, `keyring`, `projections`, `tombstones`, `sync_cursors`, `audit`. (`keyring` and `audit` are reserved for Phase 2; `projections` is the partner-side cache.)
- v1→v2 migration ([src/data/migrations/indexeddb/v1_to_v2.ts](../src/data/migrations/indexeddb/v1_to_v2.ts)) is additive and idempotent over the legacy `logs`+`meta` layout.
- `MemoryDriver` implements the same `StorageDriver` contract for tests; a shared contract suite keeps the two drivers in lockstep.

## Supabase

`supabase/migrations/` contains four ordered migrations — **all applied to production** (`supabase migration list --linked` confirms `0001`–`0004`):

- `0001_baseline.sql` — consolidated legacy schema (tables, RLS, `redeem_invite`).
- `0002_secure_invite_redemption.sql` — drops the world-readable invite policy; server-minted ~120-bit invite secrets stored as unsalted sha256-hex `code_hash`, single-use, 30-minute TTL, via `create_invite()`/`redeem_invite()` SECURITY DEFINER RPCs.
- `0003_owner_sync_metadata.sql` — adds `updated_hlc` (text; distinct from the legacy `updated_at` timestamptz), `device_id`, `deleted`, trigger-set `server_updated_at`, `medication`/`intimacy` jsonb, a keyset index `(owner_id, server_updated_at, date)`, and a stale-write trigger (`daily_logs_reject_stale_write()`) that **silently skips** (RETURN NULL) writes whose `updated_hlc` is `<=` the stored value.
- `0004_fix_invite_pgcrypto_schema.sql` — pairing hotfix: `create_invite()`/`redeem_invite()` errored because they ran with `search_path = public` while `pgcrypto` lives in the `extensions` schema; schema-qualifies the pgcrypto calls. Pairing is now verified end-to-end.

pgTAP suites exist at `supabase/tests/rls_invite.sql` and `supabase/tests/rls_owner_sync.sql` but are **not executed / not wired into CI** yet. The old hand-run `migration*.sql` scripts are history; see `supabase/migrations/README.md`.

Planned Phase-2 migrations (numbering **shifted** after the shipped `0004` pairing fix): `0005` owner ciphertext columns (M2.4), `0006` device_keys + pairing_sessions (M2.5), `0007` partner_projections (M2.8), `0008` E2EE shared notes (M2.10), `0009` quiet windows (M2.11), `0010` retire server audit_log (M2.12), `0011` drop partner plaintext ACL + plaintext columns (M2.13). *(Older planning docs still cite the pre-shift `0004`–`0010` reservation.)*

## Feature flags

[src/app/lib/flags.ts](../src/app/lib/flags.ts):

| Flag | Value | Meaning |
|---|---|---|
| `notesSync` | `false` | Shared-notes sync disabled until the E2EE notes channel (M2.10); no note content leaves the device. |
| `syncEngine` | `true` | Owner sync runs on the new SyncEngine (outbox + HLC merge + tombstones). Requires migration 0003 on the server; until applied, pushes back off harmlessly. |

## Scripts, tests, CI

Scripts ([package.json](../package.json)): `dev`, `build` (`tsc --noEmit && vite build`), `typecheck`, `lint` (`eslint . --max-warnings=0`), `test` (Vitest; plus `test:watch`, `test:coverage`).

Tests: **~270 passing tests** under `tests/` (2 `transports.spec.ts` cases fail only locally when a populated `.env` makes Supabase look configured; they pass in CI):

- `tests/unit/kernel/` — assert, errors, logger, result.
- `tests/unit/domain/` — HLC, merge (incl. H2 self-authored-row regression), cycle characterization + snapshot, phases oracle, purity guard.
- `tests/unit/data/` — driver contract (both drivers), repositories, importer, per-account DB isolation.
- `tests/unit/sync/` — outbox, reconcile, SyncEngine (fake transport/clock), SupabaseTransport, layering guard.
- Guard suites — `copy.guard.spec.ts`, `writePath.guard.spec.ts` (all log writes go through the repository).
- `tests/integration/indexeddb/migration.spec.ts` — real v1→v2 upgrade.

Test helpers live in `tests/helpers/` (fakeClock, fakeTransport, makeContainer) and `tests/fixtures/`. There is no Playwright/e2e suite; RLS coverage is the (not-yet-CI-wired) pgTAP files plus fake-transport unit suites — a journaled deviation from the original RHEA-054 plan.

CI ([.github/workflows/ci.yml](../.github/workflows/ci.yml)) runs four jobs on every push/PR: typecheck, test (with coverage), lint, build.

## Known limits (current, intentional)

- **Payloads are plaintext until M2.4.** `src/data/envelope.ts` is a passthrough; owner rows sync to Supabase unencrypted. Phase 2 replaces this with E2EE ciphertext.
- **Partner path is still legacy.** Partners read the owner's plaintext `daily_logs` rows via the legacy `src/app/lib/sync.ts` path and RLS grant until partner projections land (M2.8/M2.9); the plaintext ACL and columns are dropped in M2.13.
- Migrations 0001–0004 are **applied to production**; the pgTAP suites are still unexecuted/unwired (see Supabase section).
- Sharing toggles and quiet windows remain presentation-level controls until the Phase-2 projection model makes them data-boundary controls.

## Learning path

1. Read [RHEA_V2_TECHNICAL_SPEC.md](RHEA_V2_TECHNICAL_SPEC.md) chapters 0–2, then [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md).
2. `src/domain/types.ts` + `src/domain/cycle.ts` — the data model and derivation.
3. `src/data/schema.ts` → `src/data/repositories/LogRepository.ts` — the write path (HLC + outbox in one transaction).
4. `src/sync/SyncEngine.ts` → `src/sync/reconcile.ts` → `src/domain/merge.ts` — replication and conflict policy (with ADR 0003).
5. `src/app/di/Container.ts` and `src/app/App.tsx` — how it all composes.
6. Before touching pairing/sharing/partner code, read `supabase/migrations/0002` and the Phase-2 milestones in [V2_IMPLEMENTATION_PLAN.md](V2_IMPLEMENTATION_PLAN.md) — most of `src/app/lib/` is scheduled for replacement.
