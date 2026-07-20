# Implementation Journal — Rhea v2 migration

> 🕰️ **Historical snapshot (frozen at 2026-07-15).** Superseded by later work merged to `main` and deployed; for current state see the root `README.md` and [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md).

A running historical record of how the architecture evolved during the v2
implementation. Newest entries at the bottom. Times are relative to the
implementation session (S0 = session start = Phase 0 work; calendar date
2026-07-15 for the session in which this journal was created).

Companion documents: `V2_IMPLEMENTATION_PLAN.md` (milestone order),
`V2_TASKS.md` (task-level acceptance criteria), `ARCHITECTURE_CRITIQUE.md` +
`RISK_REGISTER.md` (both override the original proposal on conflict),
`PHASE_0_IMPLEMENTATION_REPORT.md` (Phase 0 detail).

---

## S0 — Phase 0 (M0.1–M0.6) — COMPLETE (retrospective summary)

- **Decision.** Execute Phase 0 exactly as planned; establish a real, verified
  toolchain (Node 22 + Vitest + ESLint 9 + tsc gate + GitHub Actions) before any
  behavioral change.
- **Why.** No test runner/linter/CI existed; every later milestone depends on the
  characterization safety net (M0.2) and gates (M0.1).
- **Alternatives.** Skipping straight to features was rejected — the Critique's
  top finding is that refactors without golden-master coverage are the main
  data-loss risk (R-DATA-2).
- **Outcome.** 36 tests green; 4 latent tsc errors fixed; invite-redemption
  hotfix authored (`0002_secure_invite_redemption.sql`, client cut over);
  account-scoped IndexedDB (`rhea-<uid>`) with legacy copy-forward;
  partner-never-writes guard; wipe-on-signout for partners; false privacy copy
  corrected + CI copy-guard; plaintext notes egress disabled behind
  `flags.notesSync=false`.
- **Known gap.** No Postgres/Supabase in this environment: SQL migrations and
  pgTAP are authored but **not executed** — must run
  `supabase db reset && supabase test db` before deploying (R-PRIV-5, R-PAIR-3).
- **Files.** See PHASE_0_IMPLEMENTATION_REPORT.md §4–5.

## S1 — Temporary "Local Testing Mode" — ADDED then REMOVED (user-directed)

- **Decision.** For manual UX review, expose sharing/partner UI in local-only
  dev builds behind a single dev-only flag (`flags.localUiPreview`), with all
  backend actions disabled; then remove it after review, per user instruction.
- **Why.** User needed to see partner/sharing UX with no Supabase configured.
- **Trade-offs.** Deliberately display-only (no fake pairing/sync/network) so no
  security posture change; isolated in `src/components/dev/` for clean removal.
- **Outcome (removal).** Flag, banner, preview panel, and call sites removed;
  behavior restored to: partner/sharing UI requires a configured backend + auth.
- **Kept (permanent).** `src/lib/transports.ts` — a framework-free transport
  *registry* (descriptors only: official relay / self-hosted relay / bluetooth /
  local-network / WebRTC) — and `src/views/settings/SyncTransportSection.tsx`
  (Settings section showing transport status honestly). These begin the
  multi-transport direction; the real `Transport` seam (M1.8) will absorb the
  registry's status resolution later.
- **Files.** `src/lib/flags.ts`, `src/App.tsx`, `src/views/settings/SettingsView.tsx`
  (add+revert); `src/lib/transports.ts`, `src/views/settings/SyncTransportSection.tsx`,
  `tests/unit/transports.spec.ts` (kept).
- **Follow-up.** M1.8's `Transport` interface should expose per-transport
  status so `transports.ts` stops special-casing Supabase.

## S2 — Phase 1 begins

Environment notes that shape Phase 1–4 execution:

- Node 22.11.0 lives in the session scratchpad (no system Node); all npm
  commands run with the scratchpad PATH prefix. CI uses `setup-node@22`.
- No Postgres/Supabase/Docker ⇒ server migrations + pgTAP are authored and
  reviewed but not executed here (carried gap from Phase 0, documented per
  milestone in `supabase/migrations/README.md`).
- No Android/iOS SDKs ⇒ Phase 3 native builds cannot be verified here; that
  phase will be implemented to the extent verifiable (TS code, config,
  contracts) with the rest explicitly deferred.
- Web-only verification: vitest (node + fake-indexeddb), tsc, eslint, vite build.

---

## S2.1 — M1.1 `kernel/` + boundary-lint scaffold — COMPLETE

- **Decision.** Implement the kernel exactly per spec Chapter 9 (§4.1 Result
  convention, §4.4 logging) and Chapter 2 (file layout): `result.ts`,
  `errors.ts` (full ErrorCode enum + per-code retry policy table), `logger.ts`
  (deep redaction of `flow, symptoms, mood, energy, notes, medication,
  intimacy, date, content, email`), `brand.ts` (Uid/DeviceId/KeyId/Hlc/
  Iso8601/DateKey; DateKey+Hlc validate shape), `assert.ts`
  (invariant/assertNever → RheaError INVARIANT), barrel.
- **Notable choices.**
  - `rheaError()` factory + concrete `GenericRheaError` in kernel; layers with
    richer needs subclass `RheaError` (spec allows this — layers import kernel).
  - Redaction is *runtime deep-redaction in every sink*, not just a type-level
    contract, so a caller that sneaks a health field into an event cannot leak
    it. `createCapturingLogger()` provided for tests.
  - `invariant` throws always (not dev-only): the check is cheap and a
    silently-passed broken invariant in prod is worse than a crash caught by
    the ErrorBoundary. Deviation from the plan's "(dev-only)" note, documented
    here.
  - Brand validators never put the raw value in error context (a date IS
    health data) — only its length. Tested.
- **Boundary rule.** `import/no-restricted-paths` zone: `src/kernel` may not
  import from `src/**` except itself; verified to fail lint with a deliberate
  violation.
- **Files.** New: `src/kernel/{result,errors,logger,brand,assert,index}.ts`,
  `tests/unit/kernel/{result,errors,logger,assert}.spec.ts`. Edited:
  `eslint.config.js`.
- **Gates.** tsc ✓ · lint 0 errors ✓ · 90 tests ✓ · build ✓.
- **Follow-up.** Wire `Logger` through DI in M1.10; ErrorBoundary consumption
  of `userMessage` lands with app/ move.

## S2.2 — M1.2 Extract `domain/` behind shims — COMPLETE

- **Decision.** Verbatim moves: `lib/cycle.ts → domain/cycle.ts`,
  `lib/phases.ts → domain/phases.ts`, `types/index.ts → domain/types.ts`; PLUS
  two moves the plan implied but didn't list — `parseDate/addDays/diffDays/
  toDateKey → domain/dates.ts` and the numeric cycle constants →
  `domain/constants.ts` — because `cycle.ts` imports them and domain purity
  (imports ≤ kernel) is lint-enforced. `getPhase`/`getPhaseLengths` also moved
  into `domain/phases.ts` (they are phase logic; gathers all three phase
  engines in one file ahead of M1.3 unification).
- **What stayed behind.** `fmt()` (Intl presentation) stays in `lib/utils.ts`;
  UI option lists (symptoms/flow colors/moods) stay in `lib/constants.ts`;
  `LegacyCycleEntry` stays in the `types/index.ts` shim (deleted in M1.3, never
  enters domain/).
- **Shims.** `lib/cycle.ts`, `lib/phases.ts`, `lib/utils.ts`, `lib/constants.ts`,
  `types/index.ts` are now re-export shims (deleted in M1.10). Callers untouched.
- **Boundary.** New ESLint zone: `src/domain` may import only `domain|kernel`.
- **Tests.** Characterization suite passes UNCHANGED (snapshots would fail on
  drift). New `tests/unit/domain/purity.spec.ts` imports the domain barrel in
  the pure Node env (asserts `document`/`window` undefined) proving no DOM/
  framework dependency.
- **Gates.** tsc ✓ · lint 0 errors ✓ · 94 tests ✓ · build ✓.

## S2.3 — M1.3 Single phase oracle + single write path — COMPLETE

- **Decisions.**
  1. **Oracle** (`domain/phases.ts`): `PhaseAnchors` → `getPhaseBoundaries` /
     `getPhaseForDay` / `getPhaseLengths` / `getPhaseRangeLabel`. The dynamic
     `cycle.getCurrentPhase` algorithm was promoted as canonical (now a
     delegating wrapper); the hardcoded `utils.getPhase` and
     `utils.getPhaseLengths(avgLength)` were DELETED. `PhaseData` lost its
     baked `range`/`cycleStart`/`cycleEnd` — all day-ranges are derived.
  2. **SPEC CORRECTION.** Spec §2.2's boundary sketch (`ovulation = [fertileStart,
     ovulationDay+1]`) contradicted its own "identical branching" requirement
     (branching resolves day == fertileStart to follicular) and broke down for
     degenerate short cycles. Implemented sequential clamped cut points
     (`fEnd = max(fertileStart, mEnd)`, `oEnd = max(ovulationDay+1, fEnd)`),
     which preserve branch parity on every day, keep phases ordered, and make
     widths always sum to avgCycleLength. Spec §2.2 updated in place.
  3. **Single write path.** `useLogger` is the sole writer: `onSaved` now
     receives the saved logs; added `saveMany`. Fixes found & closed:
     (a) App.tsx pushed saves to sync after re-fetching by a **UTC** date key
     (`toISOString().slice(0,10)`) — mis-keyed/dropped saves near midnight;
     now pushes exactly what was saved, keyed locally.
     (b) QuickAddPeriod wrote straight to the DB, so quick-added periods
     never synced until a full re-push; now goes through `saveMany` (pure
     `domain/cycle.buildPeriodLogs` builds the rows).
     (c) Overview symptom toggles were ephemeral React state (never persisted,
     lost on reload); now persist to today's DailyLog via the same path.
     (d) Same UTC-key bug class fixed in `sharing.isInQuietWindow`.
  4. **LegacyCycleEntry deleted** (RHEA-027): Calendar/History consume the
     domain `Cycle` type directly; the always-fake `flow:"medium"` display
     field is gone (History shows `periodLength` instead).
- **Trade-offs.** Partner/owner segment bars change appearance slightly (real
  derived widths vs hardcoded 5/8/3/N−16) — intended; they can no longer
  disagree. Overview symptom chips now reflect persisted state.
- **Documented snapshot change.** Characterization test for the legacy engines
  replaced with an oracle-parity test; before/after table recorded inline in
  the spec file. `emptyLog` moved to `domain/types` (pure constructor).
- **New guard.** `tests/unit/writePath.guard.spec.ts` — scans src/ for
  UTC-date-key derivation and fails if any returns (it caught a leftover
  during this very milestone).
- **Files.** Edited: domain/{phases,cycle,types}.ts, hooks/useLogger.ts,
  App.tsx, views/tracker/{QuickAddPeriod,OverviewTab→(via App),CalendarTab,
  HistoryTab,PredictionsTab}.tsx, components/shared/{PhaseHero,
  PhaseProgressBar}.tsx, views/partner/PartnerView.tsx, lib/{utils,sharing,
  db,constants}.ts, types/index.ts, spec §2.2. New: phases.oracle.spec.ts,
  writePath.guard.spec.ts.
- **Gates.** tsc ✓ · lint 0 errors ✓ · 111 tests ✓ · build ✓.

## S2.4 — M1.4 StorageDriver seam + drivers + repositories — COMPLETE

- **Decision.** Implemented the §0.10.A canonical `StorageDriver` contract
  (`src/data/drivers/StorageDriver.ts`) with two drivers:
  `IndexedDbDriver` (idb-backed; delegated upgrade callback so M1.5 migrations
  own schema evolution; onBlocked/onBlocking/onVersionChange wired) and
  `MemoryDriver` (contract-faithful: key-ordered getAll, keyPath extraction,
  out-of-line keys, snapshot-rollback transactions, paged index reads).
  Thin `LogRepository`/`MetaRepository`; `StorageManager` (spec Ch6 §1) owns
  the single live driver + account switching; legacy `rhea` copy-forward
  rehosted as `data/legacyImport.ts` running via the manager's onOpen hook.
- **Schema stance.** `data/schema.ts` declares the store catalog; v1 physically
  = exactly the legacy stores (`logs` keyPath date, `meta` out-of-line). The
  full eight-store set (§0.8) exists in the TYPE now, physically in M1.5.
  StoreName includes `sync_cursors`/`audit` per §0.8 (canonical eight) even
  though Ch6 §1's snippet lists six — §0.8 wins per §0.9.
- **lib/db.ts is now a shim** with the identical public API delegating to
  repositories; the pre-existing M0.4 account-scoping test suite passes
  UNCHANGED against the new stack — behavior preservation proven, not assumed.
- **Fixes along the way.** idb generic-mode tx typing (`put!`/`delete!`);
  observed `tx.done` before `abort()` (otherwise an unhandled AbortError
  rejection — caught by vitest's unhandled-error detector).
- **Boundary.** New ESLint zone: `src/data` imports only data|domain|kernel.
- **Files.** New: data/{schema,errors,storageManager,legacyImport}.ts,
  data/drivers/{StorageDriver,IndexedDbDriver,MemoryDriver}.ts,
  data/repositories/{LogRepository,MetaRepository,index}.ts,
  tests/helpers/makeContainer.ts, tests/unit/data/{driver.contract,
  repositories}.spec.ts. Edited: lib/db.ts (shim), eslint.config.js.
- **Gates.** tsc ✓ · lint 0 errors ✓ · 131 tests ✓ (incl. dual-driver contract
  suite) · build ✓.

## S2.5 — M1.6 Pure HLC + merge — COMPLETE (executed BEFORE M1.5)

- **Reordering decision.** The plan lists M1.5 → M1.6, but RHEA-038 (M1.5's
  "repositories stamp HLC") consumes `domain/hlc`; M1.6 declares only M1.1 as
  a dependency, so the pure functions landed first. No behavioral consequence.
- **Implementation.** `domain/hlc.ts`: encode/decode/compare, `hlcNow`
  (never-backwards, same-ms counter bump, 0xffff spill), `hlcObserve` (remote
  fold w/ 24h `MAX_DRIFT` clamp + drift flag), epoch-0 sentinel — all pure,
  state in/out; the stateful persistence wrapper is `data/syncStamp.ts`.
  `domain/merge.ts`: `decideMerge` — echo-before-compare, LWW, identical-stamp
  = duplicate (idempotent replay), same-(pt,c) deviceId tiebreak, tombstone
  apply/beat-stale/rebirth, §4.4 full-pull unknown-tombstone skip; plus
  `lwwWinner` for outbox coalescing.
- **Tests.** Property tests (seeded PRNG): causal order == lexicographic
  order (500 random pairs); stamp monotonicity under backwards-moving wall
  clock (1000 steps); interleaved now/observe never regresses; counter
  spill; drift clamp; merge commutativity over a 48-version cross-product;
  idempotency; tombstone semantics.
- **Gates.** 151 tests ✓ (all four gates green).

## S2.6 — M1.5 Envelope/SyncRecord + IDB v1→v2 migration — COMPLETE

- **Implementation.**
  - `data/envelope.ts`: canonical `CipherEnvelope` + `SyncRecord` (§0.2) plus
    an explicit `PlainEnvelope` (`alg:"none"`, ct = base64(JSON)) for the
    pre-E2EE phase, so the machinery runs on final shapes while
    `xchacha20poly1305` stays reserved for src/crypto. `SyncedRow<T>`,
    `TombstoneRow`, `logKey()`.
  - `domain/types.ts`: DailyLog gains additive optional v2 fields
    (`medication: MedicationEntry[]`, `intimacy: IntimacyEntry|null`,
    `schemaHint`) — v1 payloads stay valid (spec §1.2).
  - `data/schema.ts`: `DB_VERSION = 2`; all EIGHT §0.8 stores (incl.
    `sync_cursors`, `audit` — Ch6's six-store list is superseded per §0.9).
    Outbox keyed by `id` per the Sync-chapter `OutboxEntry` (Ch6's
    `seq autoIncrement` sketch superseded — the Outbox interface upserts/acks
    by id). Well-known meta keys exported.
  - `data/migrations/indexeddb/v1_to_v2.ts`: additive + idempotent; runs in
    the versionchange tx (throw ⇒ IDB aborts ⇒ v1 intact); backfills ONLY
    rows lacking a stamp with epoch-0 HLC + generated 128-bit base64url
    deviceId (§0.10.K) + `medication:[]`/`intimacy:null`; seeds
    deviceId/hlcState/dbSchemaVersion and sets `needsInitialSeed` only when
    v1 logs existed. Fresh DBs take the same path (oldVersion 0).
  - `LogRepository` (RHEA-038): saves stamp `updatedAt`/`deviceId`/`deleted:false`
    in ONE tx with the row (via `data/syncStamp.ts` nextStamp — lazily creates
    deviceId, persists HLC state in meta); `delete()` now writes a `tombstones`
    row (key `log:<date>`) so deletes finally propagate (fixes the silent
    local-only delete). `eraseAllData` now clears all eight stores.
  - `legacyImport` pinned to open the legacy `rhea` DB at v1 (never migrated).
- **Tests.** Integration suite on fake-indexeddb: preservation, stamping,
  eight stores + queryable `by_updatedAt`, sync-meta seeding, idempotent
  re-open, ABORTED upgrade leaves v1 fully readable at version 1, fresh-v2
  path, monotonic repo stamps, tombstone on delete, post-upgrade edit
  dominates epoch-0.
- **Gates.** tsc ✓ · lint 0 errors ✓ · 159 tests ✓ · build ✓.

## S2.7 — M1.7 Export/import v2 — COMPLETE

- **Implementation.** `data/exporter.ts` (`ExportDataV2` incl. reserved
  `encryption`/`ct` fields — passphrase encryption lands with M2.3;
  `BACKUP_EXCLUDED_META_KEYS` keeps per-device sync state out of backups;
  rows are stripped to domain fields) and `data/importer.ts` (all third-party
  parsers ported + `parseBackup` v1/v2 shim rejecting `>2` with clear copy +
  merge-apply). `lib/import.ts` → shim; `lib/db.ts` gains
  `exportBackup`/`importBackup`/`importParsedLogs`, old v1 export/import
  removed; SettingsView cut over (v1-only version check replaced; import
  errors surface `RheaError.userMessage`). Package/app version → 0.2.0.
- **Five review-documented bugs fixed** (each with a failing-before fixture):
  1. CSV parser now RFC-4180 (escaped `""`, newlines in quoted fields).
  2. Apple Health regex matches non-self-closing `<Record>` (real exports
     nest `<MetadataEntry>`; old code imported 0 rows).
  3. Generic CSV without a flow column no longer FABRICATES `flow:"medium"`
     for every row — imports without flow + surfaces a warning. (Never invent
     health data.)
  4. EU `dd/mm/yyyy` slash dates: per-FILE convention detection (any first
     component > 12 ⇒ day-first; ambiguous ⇒ documented US default).
  5. Imports now MERGE per-field into existing logs (union symptoms; incoming
     wins where it has content) — a flow-only import can no longer wipe a
     rich local entry. Apply is idempotent, returns {imported, skipped}.
- **Task-file correction.** RHEA-044 names `SourcesView.tsx`, but the
  import/export UI lives in `SettingsView.tsx` (SourcesView is the citation
  list); wired there.
- **Gates.** tsc ✓ · lint 0 errors ✓ · 173 tests ✓ · build ✓.

## S2.8 — M1.8 SyncEngine + outbox over NullTransport — COMPLETE

- **Implementation.** `src/sync/`: `types.ts` (OutboxEntry, SyncCursor — spec's
  §1.2 cursor type extended with the §2.5 `serverCursor` keyset token, which
  the spec stores but never declared on the type; both cursor spaces now
  explicit), `transports/Transport.ts` (the full §2.1 seam), `NullTransport`,
  `outbox.ts` (LWW coalescing incl. a transaction-scoped `enqueueCoalescedTx`
  so repositories enqueue ATOMICALLY with the domain write — §1.5),
  `cursor.ts` (cursor advanced only after a page is durably reconciled; peer
  change ⇒ epoch-0), `reconcile.ts` (I/O wrapper over pure decideMerge;
  observes every remote HLC before decisions; owner+meta appliers now,
  projection/note in M2.8+; meta merge state kept in `_sync:<key>`
  bookkeeping rows; sealed envelopes quarantine-skip per §4.5),
  `SyncEngine.ts` (single-flight flush, lease+backoff, stale-write drops,
  debounced wake→pull, resync, status observable).
- **LogRepository** now accepts an optional `TxEnqueuer` — with sync enabled,
  save/delete enqueue the SyncRecord (PlainEnvelope payload until M2.4;
  tombstone on delete) in the same transaction as the row.
- **Boundary.** ESLint zone: sync/ imports only kernel|domain|data.
- **Tests.** FakeTransport = faithful in-memory server (upsert-by-key,
  server-side LWW stale-write guard, keyset paging, realtime fan-out) +
  fakeClock. Suites: outbox (coalescing LWW both directions, lease/crash
  reclaim, backoff, restart survival), reconcile (idempotent replay, echo,
  LWW conflicts, tombstone/rebirth, §4.4 full-pull rule, meta scope, HLC
  folding dominates next local stamp), engine e2e (2-device convergence w/
  paging, delete propagation, offline backoff with deterministic jitter,
  stale-write drop, realtime wake, resync, NullTransport shadow mode).
- **Gates.** tsc ✓ · lint 0 errors ✓ · 195 tests ✓ · build ✓.

## S2.9 — M1.9 SupabaseTransport + owner-sync cutover — COMPLETE

- **Server (authored, NOT executed — no Postgres here).**
  `0003_owner_sync_metadata.sql`: additive columns on daily_logs. NAMING
  DEVIATION: the plan's "updated_at text (HLC)" collides with the legacy
  `updated_at timestamptz` → the HLC column is **`updated_hlc`**. Also adds
  `device_id`, `deleted`, trigger-set `server_updated_at` (+ backfill),
  v2 fields `medication jsonb`/`intimacy jsonb` (needed to round-trip v2
  fields while payloads are still plaintext columns), keyset index, and the
  stale-write guard as a **silent-skip** BEFORE UPDATE trigger (returning
  NULL) rather than RAISE — a raise would fail whole batch upserts; the
  silent skip preserves LWW and the laggy client converges on next pull.
  pgTAP suite `rls_owner_sync.sql` authored; deployment gate documented.
- **Client.** `SupabaseTransport` (client injected — sync/ never touches app
  config): push = batch upsert `onConflict owner_id,date`; pull = keyset
  paging on `(server_updated_at, date)` via PostgREST `.or()`; realtime as
  pure wake hint. Pure `recordToRow`/`rowToRecord` mappers unit-tested;
  pre-0003 rows (no HLC) map to epoch-0/`legacy` so they never win a merge.
  `sync/initialSeed.ts` implements the Ch6 §2 first-sync rule (merge-up,
  never overwrite — replaces the legacy pull-then-overwrite data-loss flow).
- **Cutover.** `flags.syncEngine = true` (RHEA-055) with legacy fallback kept
  until M1.10. App.tsx: owners run the engine (start/stop tied to auth
  effect, status → refresh); partners stay on the legacy read-only pull until
  M2.9. lib/db: `setActiveSyncEngine` attaches the outbox to repositories
  (atomic enqueue) and saves/deletes trigger a flush; the useLogger push
  callback skips the legacy pushLog when the engine is active (no dual
  writes). `lib/syncBootstrap.ts` is the temporary composition glue (absorbed
  by di/ in M1.10).
- **Test-exposed fix.** Repository HLC stamping used wall-clock only; the
  injected test clock revealed it — LogRepository now accepts `now()` (prod
  default Date.now).
- **Verification gap (env).** Live Supabase integration (multi-device
  converge over real RLS, realtime) not runnable here; covered by the
  FakeTransport e2e suite + authored pgTAP; must be run against a local
  stack before deploy (README updated).
- **Gates.** tsc ✓ · lint 0 errors ✓ · 200 tests ✓ · build ✓.

## S2.10 — M1.10 Composition root + app/ move + boundary matrix — COMPLETE (Phase 1 done)

- **The move.** `src/{hooks,views,components,styles,App.tsx,main.tsx}` →
  `src/app/…`; surviving lib glue (`supabase, sync(legacy), pairing, sharing,
  audit, flags, transports`) → `src/app/lib/`; entry now `/src/app/main.tsx`
  (index.html updated). SW registration web-gated (skipped in Capacitor
  shells, RHEA-059).
- **Composition root.** `app/di/Container.ts` absorbs the deleted
  `lib/db.ts` + `lib/syncBootstrap.ts`: account scoping (StorageManager),
  repository construction (auto-attaches the outbox when the engine is
  active), backup import/export, erase/wipe policy, owner sync-engine
  lifecycle. `context.ts` (singleton + useContainer) and `Providers.tsx`
  wrap the app; hooks (useLogger/useCycleData/useAuth) and SettingsView
  resolve the container from context; the legacy partner sync module uses
  the singleton.
- **Shims DELETED** (all Phase-1 re-exports): `lib/{cycle,phases,utils,
  constants,import,db,syncBootstrap}.ts`, `src/types/`. Real content moved:
  `fmt` → `app/lib/format.ts`, UI option lists → `app/lib/constants.ts`
  (re-exporting domain numerics). Zero `@/lib/*` / `@/types` references
  remain.
- **Boundary matrix.** Already fully enforced by the four accumulated zones
  (kernel ≤ ∅; domain ≤ kernel; data ≤ domain+kernel; sync ≤
  data+domain+kernel); app/ may import all layers and nothing may import
  app/ (implied by the zones). crypto/privacy zones will be added as those
  layers land in Phase 2.
- **Tests.** `db.account.spec` rewritten against the Container (same M0.4
  behavioral assertions — proving preservation); smoke/guard suites
  repointed; a test-exposed fix: an open driver handle blocks
  `indexedDB.deleteDB`, so the suite closes the container between tests.
- **Note.** The legacy `app/lib/sync.ts` (partner read-only pull + owner
  fallback) intentionally SURVIVES M1.10 — the plan's "delete legacy sync"
  applies to the owner path only; partners have no replacement until M2.9.
- **Gates.** tsc ✓ · lint 0 errors ✓ · 200 tests ✓ · build ✓ · dev server
  serves the new entry.

**PHASE 1 COMPLETE** — session paused here at user request (status doc:
`docs/IMPLEMENTATION_STATUS.md`).

---

## Session S3 — Phase 2 kickoff: doc audit, H2 fix, ADRs, M2.1 (2026-07-15)

### S3.0 · Session start — baseline + lint gate tightened
- **Time:** S3 +0m · **Milestone:** — · **Task:** —
- **Decision:** Re-ran all four gates before any Phase-2 work; tightened the
  lint gate from "0 errors" to `--max-warnings=0` (package.json `lint` script,
  which CI invokes) and fixed the 5 pre-existing unused-var warnings instead of
  keeping the looser gate. One warning was a dead prop end-to-end
  (`PredictionsTab.phaseData`, unused since the M1.3 oracle) — removed from
  interface, destructuring, and the App.tsx call site.
- **Why:** "Repository must always remain in a working state" is cheaper to
  enforce with a hard gate than a convention.
- **Files:** package.json, src/app/views/tracker/{DailyLogSheet,HistoryTab,
  OverviewTab,PredictionsTab}.tsx, src/app/App.tsx.
- **Risk mitigated:** warning creep masking real defects.

### S3.1 · Doc-vs-code audit (7-agent workflow) — required reading verified
- **Time:** S3 +10m · **Milestone:** — (user-mandated pre-Phase-2 gate)
- **Decision:** Fanned out one reader per architecture doc to verify every
  claim against the post-Phase-1 code, rather than trusting the docs.
- **Findings (high severity):** (1) critique H2 / risk R-OFF-1 was a CONFIRMED
  OPEN DEFECT in shipped code (see S3.2); (2) V2_TASKS.md still claimed
  "nothing is implemented" and had zero status markers; (3) Phase-2+ task file
  lists pointed at deleted `src/lib/` paths; (4) spec Ch2/Ch6 described a
  migration set (0003_ciphertext_tables etc.) that never shipped — real 0003 is
  owner_sync_metadata with `updated_hlc`; (5) spec Ch6 said six local stores,
  code has eight; (6) REPOSITORY_OVERVIEW.md described the deleted pre-v2
  layout end-to-end; (7) RISK_REGISTER cited a "pgTAP in CI" control that does
  not exist (suites authored, CI job absent, migrations never executed).
- **Follow-up:** all fixed in S3.2 (code) and S3.4 (docs).

### S3.2 · FIX: merge echo suppression (critique H2 / risk R-OFF-1) — P1
- **Time:** S3 +25m · **Milestone:** repairs M1.6/M1.8 · **Task:** —
- **Decision:** `decideMerge` no longer drops self-authored rows BEFORE the
  LWW compare. "echo" is now only the skip-reason LABEL when a self-authored
  row ties (or is older than) local; a self-authored row that is strictly
  newer than local, or missing locally, APPLIES.
- **Why:** the pre-compare drop made restore-after-wipe a silent no-op for a
  single-device owner (all server rows are self-authored) and would have made
  M2.3 phrase-restore + M2.4 backfill lossy in the same way. The old rule was
  only load-bearing in exactly the cases where it was wrong: normal-operation
  echoes tie local and are skipped by the LWW compare anyway.
- **Alternatives:** (a) suppress-unless-fullPull — rejected: a DB restored
  from backup pulls incrementally from an old cursor, so the rollback case
  isn't a fullPull; (b) clear-scope-then-pull in resync() — rejected: turns a
  safe merge into a destructive wipe (violates "first sync merges, never
  overwrites").
- **Files:** src/domain/merge.ts; tests/unit/domain/merge.spec.ts (2 tests
  rewritten — they had PINNED the buggy behavior — +2 H2 cases),
  tests/unit/sync/reconcile.spec.ts (echo test now seeds the local copy — the
  realistic echo; +1 restore case), tests/unit/sync/syncEngine.spec.ts
  (+ single-device resync restore).
- **Trade-off:** none found — semantics strictly safer; replay idempotence
  preserved (ties still skip).
- **Risks mitigated:** R-OFF-1 (closed); latent M2.3/M2.4 restore data loss.

### S3.3 · ADR log established (docs/adr/) + crypto-library ADR
- **Time:** S3 +30m
- **Decision:** ADR-0001 (process), ADR-0002 (layering, backfill), ADR-0003
  (HLC+LWW, backfill), ADR-0004 (StorageDriver/IDB-v2, backfill), ADR-0005
  (**crypto library = libsodium-wrappers-sumo + @scure/bip39**, written BEFORE
  M2.1 code per the "trade-offs in an ADR before implementation" rule).
- **Why sumo:** standard `libsodium-wrappers` omits `crypto_pwhash` (Argon2id,
  needed for the pinned recovery profile ops=4/mem=256MiB). Pure-TS noble stack
  rejected primarily because pure-JS Argon2id at 256 MiB is unusably slow on
  mobile webviews and hand-composing X25519+HKDF would add custom protocol
  surface. WebCrypto rejected as primary (no XChaCha20/Argon2id) but KEPT for
  the non-extractable AES-GCM MWK in M2.2's WebSecureStore.
- **Deps installed:** libsodium-wrappers-sumo@0.8.4, @scure/bip39@2.2.0,
  @types/libsodium-wrappers-sumo@0.7.8.

### S3.4 · Doc repair (6-agent workflow) — all planning docs synchronized
- **Time:** S3 +45m
- **Applied:** V2_TASKS.md (Status field on all 132 tasks; deviations recorded
  on RHEA-036/037, 051, 052, 054; `src/lib/`→`src/app/lib/` path fixes; glance
  table + header); V2_IMPLEMENTATION_PLAN.md (status column, corrected 0003
  ledger row, "Deviations from plan" subsection); RHEA_V2_TECHNICAL_SPEC.md
  (real migration set + renumbered 0004–0010 plan, §0.2 passthrough note,
  §0.10.J sha256-as-shipped invite hashing, Ch6 eight-store correction +
  daily_logs as-shipped DDL, Ch8 §4.2 echo rule matches the S3.2 fix);
  ARCHITECTURE_CRITIQUE.md (H2 RESOLVED, dated); RISK_REGISTER.md (R-OFF-1
  closed; pgTAP-in-CI wording corrected + pre-deploy action; R-DL-2/R-DL-3/
  R-DB-1/R-OFF-2/R-BAK-3 marked landed); REPOSITORY_OVERVIEW.md (rewritten
  against v2 layout); proposal + review (dated addenda).
- **Why:** user directive — docs are living architecture; never stale.

### S3.5 · M2.1 — crypto/sodium + aead + KATs (RHEA-060..062) ✅
- **Time:** S3 +60m · **Milestone:** M2.1
- **Decisions:**
  1. **`CipherEnvelope` type ownership moved to `src/crypto/envelope.ts`**
     (data/envelope.ts re-exports). crypto/ may import only kernel+libsodium,
     yet aead.seal must RETURN a CipherEnvelope — spec Ch3 §3.1 explicitly
     allows data→crypto for envelope types; this is that clause, exercised.
  2. **AAD assembly stays in data/** (`buildAad`/`aadForRecord`,
     spec Ch2 "envelope.ts — AAD assembly"): aead takes opaque bytes, so the
     crypto layer never learns SyncRecord shapes.
  3. **Colon keyId grammar** (`dek:<epoch>`, `kpair:<linkId>:<version>`) per
     §0.4 — the tasks file's dot-form was the non-canonical Ch5 spelling.
  4. **Two new kernel ErrorCodes** — AAD_MISMATCH (T-3 #3: transplant/tamper,
     flagged for audit) distinct from DECRYPT_FAILED (T-3 #1: quarantine);
     RNG_UNAVAILABLE (T-3 #6: hard-fail, never seal without entropy). Both
     non-retryable; CryptoError subclass mirrors StorageError.
  5. **KAT strategy:** vectors self-generated once against the audited
     libsodium build via an in-repo generator
     (tests/fixtures/vectors/gen-aead-vectors.mjs) and PINNED in aead.json —
     3 vectors (owner-log, empty-plaintext meta, unicode projection under a
     kpair key) + tamper/AAD-mismatch/stripped-aad/unknown-version/nonce-
     uniqueness/wrong-key behavior tests. `sealWithNonce` is exported
     @internal solely so KATs can be deterministic; production uses `seal`
     (fresh `randombytes_buf(24)` per message).
  6. `open()` recomputes AAD from the surrounding record (never trusts
     `env.aad`); the stored-vs-recomputed string compare is non-constant-time
     BY DESIGN (AAD is public data stored beside the ciphertext; the
     cryptographic binding is the Poly1305 tag).
- **Files (new):** src/crypto/{sodium,envelope,errors,aead,index}.ts,
  tests/unit/crypto/aead.vectors.spec.ts,
  tests/fixtures/vectors/{aead.json,gen-aead-vectors.mjs}.
- **Files (edited):** src/kernel/errors.ts (+2 codes),
  src/data/envelope.ts (type re-export + buildAad), eslint.config.js
  (crypto zone; data/sync may import crypto), tests/setup.ts (await
  getSodium()), tests/unit/kernel/errors.spec.ts (retry table +2).
- **Risks introduced:** bundle grows by the sumo build (mitigation tracked:
  dynamic-import code-split, see STATUS tech debt). No security reviewer
  human sign-off exists — flagged in V2_TASKS RHEA-061 as a pre-launch
  requirement.
- **Risks mitigated:** custom-crypto risk (single audited supplier, wrappers
  lint-fenced); silent construction drift (KATs).
- **Gates:** tsc ✓ · lint 0 warnings ✓ · **228 tests / 25 files** ✓ · build ✓.

**PAUSED at user request after M2.1** — M2.2 (keyring + SecureStore,
RHEA-063..065) NOT started. Resume pointer: docs/NEXT_SESSION.md.

### S3.6 · Handoff preparation (2026-07-15)
- **Time:** S3 +90m · **Milestone:** — · **Task:** — (no source code modified)
- **Decision:** Implementation hands off to another engineer (continuing with
  Codex). Created `docs/HANDOFF.md` — project summary, progress, branch/build
  state, per-layer architecture, decision index (ADRs 0001–0005 + journal),
  crypto/sync status, risks & debt, exact resume point (M2.2 / RHEA-063, with
  ADR-0006 required first), commands, reading order, a "Things To Avoid"
  pitfall list distilled from sessions S0–S3, and a ready-to-paste Codex
  prompt. Updated NEXT_SESSION.md and IMPLEMENTATION_STATUS.md to lead with
  the handoff.
- **Repository-state correction recorded:** the working tree is CLEAN — all
  work to date (Phases 0–1 + M2.1 + docs) is contained in HEAD `16d4360`
  ("chore: prepare repository for Rhea v2 implementation") on branch
  `rhea-v2-preparation`, committed by the repository owner between sessions.
  The implementation sessions themselves created no commits and pushed
  nothing (per standing instruction). Earlier status-doc claims of
  "uncommitted working-tree state" were corrected.
- **Files:** docs/HANDOFF.md (new), docs/NEXT_SESSION.md,
  docs/IMPLEMENTATION_STATUS.md, docs/IMPLEMENTATION_JOURNAL.md (this entry).
- **Follow-up for the next engineer:** everything in HANDOFF.md "How To
  Continue"; session numbering continues at S4.

**HANDED OFF after M2.1** — gates at handoff: tsc ✓ · lint 0 warnings ✓ ·
228/228 tests ✓ · build ✓.
