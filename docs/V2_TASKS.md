# Rhea v2 — Engineering Task Backlog

> 🧊 **Planning artifact — implementation status frozen at the 2026-07-15 planning state.** Task statuses below reflect that snapshot; the v2 branch has since merged to `main` and deployed (pairing fixed, delete-sync fixes shipped). For current state see the root `README.md` and [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md). Migration numbers `0004`+ here predate the shipped `0004` pairing fix — the E2EE sequence has shifted to `0005`+.

> **What this is.** Every milestone in
> [V2_IMPLEMENTATION_PLAN.md](V2_IMPLEMENTATION_PLAN.md) broken down into
> **GitHub-Issue-shaped engineering tasks**. Each task is scoped to be a single
> reviewable pull request.
>
> **Progress.** Phases 0–1 are **complete** (RHEA-001 … RHEA-059) — see
> [IMPLEMENTATION_JOURNAL.md](IMPLEMENTATION_JOURNAL.md) and
> [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) for what actually landed.
> Phase 2 is **in progress**: M2.1 (RHEA-060…062) complete 2026-07-15;
> next up M2.2 (RHEA-063…065). RHEA-066 onward pending.
>
> **Completion convention.** Each task header carries a **Status:** field
> (✅ Done / Not started), which is **authoritative**. Acceptance-criteria
> checkboxes are left as written — they record the *original* criteria, not
> completion state; where delivery deviated, a **Deviation:** note under the
> Status line says how.
>
> **Sources.** *Order & safety* → [V2_IMPLEMENTATION_PLAN.md](V2_IMPLEMENTATION_PLAN.md).
> *Design & contracts* → [RHEA_V2_TECHNICAL_SPEC.md](RHEA_V2_TECHNICAL_SPEC.md).
> *Why* → [Rhea_v2_Architecture_Proposal.md](Rhea_v2_Architecture_Proposal.md).
> `§`/`Chapter` references point into the technical spec; `Mx.y` references point
> into the implementation plan.

---

## Conventions

**Task template.** Every task carries the eight required fields:

- **ID** — stable `RHEA-NNN` (contiguous; never reused).
- **Title** — imperative, issue-style.
- **Description** — what and why, in 2–4 sentences.
- **Files** — the files the PR touches (`new` / `edit` / `move` / `remove`).
- **Acceptance Criteria** — checkbox list; all must pass to close. Tests live here
  unless the test artifact is itself a standalone deliverable (then it is its own task).
- **Estimated Difficulty** — `XS` (<½d) · `S` (½–2d) · `M` (3–5d) · `L` (1–2wk).
- **Dependencies** — task IDs that must merge first (`—` = none).
- **Priority** — `P0` blocker/critical-path or security · `P1` high · `P2` normal · `P3` deferred.

**Labels** (GitHub-style, for filtering): `phase-0…4`, and area tags
`tooling` `ci` `security` `rls` `migration` `crypto` `storage` `sync` `domain`
`privacy` `ui` `mobile` `capacitor` `test` `flag` `docs`.

**Global rules inherited from the plan** (do not restate per task):
- Behavior-changing tasks land **dark behind a flag**; a separate `flag`-labeled
  task flips it on. Every task keeps `main` shippable.
- Data/schema changes are **additive first**; destructive steps are their own
  later task, gated on the replacement being live (sequencing invariant).
- Every `crypto/**` or RLS-policy task requires a **human security review** in
  addition to CI (noted in its acceptance criteria).
- "CI green" in acceptance criteria = `tsc --noEmit`, unit tests, lint boundaries,
  and (once they exist) pgTAP + build, all pass.

---

## Backlog at a glance

| Phase | Milestones | Tasks | ID range | Status |
|---|---|---|---|---|
| 0 — Stabilize & de-risk | M0.1–M0.6 | 18 | RHEA-001 … RHEA-018 | ✅ Complete |
| 1 — Foundations | M1.1–M1.10 | 41 | RHEA-019 … RHEA-059 | ✅ Complete |
| 2 — Privacy + E2EE | M2.1–M2.13 | 50 | RHEA-060 … RHEA-109 | ▶ In progress — M2.1 ✅ |
| 3 — Mobile (Capacitor) | M3.1–M3.6 | 18 | RHEA-110 … RHEA-127 | Pending |
| 4 — Advanced (if justified) | M4.1–M4.5 | 5 | RHEA-128 … RHEA-132 | Pending |
| **Total** | **40** | **132** | | |

### Critical path (P0), in execution order

```
RHEA-001 → 002/003/004 (harness)
  → 007–011 (invite hotfix)  ‖  012–015 (account-scope + guards)
  → 019–022 (kernel)
  → 029–033 (StorageDriver)  → 034–038 (SyncRecord + v1→v2)
  → 039–041 (hlc + merge)    → 046–050 (SyncEngine/NullTransport)
  → 051–055 (SupabaseTransport owner cutover)
  → 060–062 (aead) → 063–065 (keyring) → 066–068 (recovery)
  → 069–073 (encrypt owner)  → 074–078 (QR+SAS pairing)
  → 086–090 (projection publish) → 091–094 (partner consumes)
  → 106–109 (revoke plaintext ACL — final, gated)
```

Everything not on this line (copy fixes, export/import, notes, quiet windows,
audit, mobile, advanced) parallelizes around it.

---
## Phase 0 — Stabilize & de-risk

### M0.1 — Toolchain & CI gate

### RHEA-001 · Add Vitest test runner with `@` alias and global setup

**Milestone:** M0.1 · **Labels:** `phase-0` `tooling` `test` · **Priority:** P0 · **Difficulty:** S · **Depends on:** —
**Status:** ✅ Done (v0.2.0)

**Description**
Introduce Vitest as the unit-test runner with the `@ → src` path alias and a
global setup file, so all later milestones can add tests. No runtime change.

**Files**
- `vitest.config.ts` — new (alias `@`, jsdom + node environments, coverage provider `v8`, thresholds start at 0).
- `tests/setup.ts` — new (matchers; placeholder for async `sodium.ready()` added in M2.1).
- `package.json` — edit (add `test`, `test:watch` scripts; add dev deps `vitest`, `@vitest/coverage-v8`, `jsdom`).

**Acceptance Criteria**
- [ ] `npm test` runs and discovers `tests/**/*.spec.ts`.
- [ ] A trivial smoke test importing via `@/…` resolves and passes.
- [ ] Coverage report is produced (thresholds set to 0, to be ratcheted later).
- [ ] No change to app runtime or build output.

---

### RHEA-002 · Add ESLint flat config with boundary-rule scaffold

**Milestone:** M0.1 · **Labels:** `phase-0` `tooling` `ci` · **Priority:** P0 · **Difficulty:** S · **Depends on:** —
**Status:** ✅ Done (v0.2.0)

**Description**
Add a flat ESLint config including `eslint-plugin-import` with
`import/no-restricted-paths` present but constraining nothing yet (rules are
added as each layer lands, §3.1).

**Files**
- `eslint.config.js` — new (flat config; React + TS rules; `import/no-restricted-paths` with empty zones).
- `package.json` — edit (add `lint` script; dev deps `eslint`, `eslint-plugin-import`, TS-ESLint).

**Acceptance Criteria**
- [ ] `npm run lint` runs clean on the current tree.
- [ ] The `import/no-restricted-paths` rule is wired and ready to receive zones.
- [ ] Pre-existing lint errors, if any, are fixed or explicitly ignored with a tracked TODO.

---

### RHEA-003 · Wire `tsc --noEmit` typecheck into build (advisory → blocking)

**Milestone:** M0.1 · **Labels:** `phase-0` `tooling` `ci` · **Priority:** P0 · **Difficulty:** S · **Depends on:** —
**Status:** ✅ Done (v0.2.0)

**Description**
Add a `typecheck` script and run `tsc --noEmit` as part of `build`. Latent type
errors in current code may surface; land the CI typecheck job **advisory** here
and flip it blocking once errors are cleared (see acceptance).

**Files**
- `package.json` — edit (`typecheck` script; `build` runs `tsc --noEmit && vite build`).
- `tsconfig.json` — edit (confirm `strict`, correct `noEmit`/paths).

**Acceptance Criteria**
- [ ] `npm run typecheck` runs against the whole tree.
- [ ] Any pre-existing type errors are enumerated in the PR and fixed, OR filed as fast-follow tasks.
- [ ] Once zero errors, the CI typecheck job is marked **blocking** (may be a same-PR flip or immediate follow-up).

---

### RHEA-004 · Add GitHub Actions CI pipeline

**Milestone:** M0.1 · **Labels:** `phase-0` `ci` · **Priority:** P0 · **Difficulty:** S · **Depends on:** RHEA-001, RHEA-002, RHEA-003
**Status:** ✅ Done (v0.2.0)

**Description**
Create the CI workflow that gates every PR on typecheck, unit tests, lint, and
build. This is the gate the whole plan relies on.

**Files**
- `.github/workflows/ci.yml` — new (jobs: typecheck, test+coverage, lint, build).

**Acceptance Criteria**
- [ ] CI runs on PR and on `main`; all four jobs execute.
- [ ] A failing test / type error / lint error fails the pipeline.
- [ ] Build artifact is produced on success.
- [ ] Job matrix leaves room for pgTAP (M0.3) and native (M3.1) to be added later.

---

### M0.2 — Characterization tests for current cycle/phase logic

### RHEA-005 · Author cycle/log test fixtures

**Milestone:** M0.2 · **Labels:** `phase-0` `test` · **Priority:** P0 · **Difficulty:** S · **Depends on:** RHEA-001
**Status:** ✅ Done (v0.2.0)

**Description**
Build reusable fixtures (regular cycle, irregular cycles, empty history, a
DST/timezone-boundary date) that later domain tests also consume.

**Files**
- `tests/fixtures/logs.ts` — new.

**Acceptance Criteria**
- [ ] Fixtures cover ≥1 full regular cycle, an irregular set, empty history, and a DST-boundary date.
- [ ] Fixtures are pure data, importable in the node test env.

---

### RHEA-006 · Golden-master characterization spec for `cycle`/`phases`

**Milestone:** M0.2 · **Labels:** `phase-0` `test` `domain` · **Priority:** P0 · **Difficulty:** S · **Depends on:** RHEA-005
**Status:** ✅ Done (v0.2.0)

**Description**
Snapshot the *current* observable output of `lib/cycle.ts` and `lib/phases.ts`
so the Phase-1 refactor provably preserves behavior (including today's bugs,
which M1.3 changes deliberately).

**Files**
- `tests/unit/domain/cycle.characterization.spec.ts` — new.

**Acceptance Criteria**
- [ ] Snapshots capture derived cycle state, predictions, and phase/day-ranges for every fixture.
- [ ] Suite passes against current code and runs in CI.
- [ ] The known timezone key bug is captured (its snapshot will be updated with a documented diff in RHEA-028).

---

### M0.3 — Supabase CLI + secure invite-redemption hotfix

### RHEA-007 · Adopt Supabase CLI and baseline the current schema

**Milestone:** M0.3 · **Labels:** `phase-0` `migration` · **Priority:** P0 · **Difficulty:** S · **Depends on:** —
**Status:** ✅ Done (v0.2.0)

**Description**
Introduce the Supabase CLI project and capture the currently-deployed schema
(`migration*.sql`) as a baseline migration so all future schema is versioned.

**Files**
- `supabase/config.toml` — new.
- `supabase/migrations/0001_baseline.sql` — new (reconciles existing `migration.sql` + phase-c/e; no schema change).

**Acceptance Criteria**
- [ ] `supabase db reset` on a local project reproduces the current schema exactly.
- [ ] Baseline is a faithful no-op relative to production (documented diff = none).
- [ ] Hand-run `migration*.sql` files are marked superseded in a README note.

---

### RHEA-008 · Migration 0002 — drop `"anyone read unused invites"` and tighten invite RLS

**Milestone:** M0.3 · **Labels:** `phase-0` `security` `rls` `migration` · **Priority:** P0 · **Difficulty:** S · **Depends on:** RHEA-007
**Status:** ✅ Done (v0.2.0)

**Description**
Remove the policy at `migration.sql:84` that lets anyone read unused invites
(the live pairing-hijack hole, TM-R1) and tighten `invites` RLS so redemption
only flows through the RPC in RHEA-009. **Security review required.**

**Files**
- `supabase/migrations/0002_secure_invite_redemption.sql` — new (DROP policy; restrict `invites` SELECT to owner).

**Acceptance Criteria**
- [ ] The `"anyone read unused invites"` policy no longer exists after migration.
- [ ] An unlinked/anon user cannot `SELECT` any invite row.
- [ ] The documented inverse (re-create policy) is recorded in the PR body for emergencies.
- [ ] Security reviewer sign-off recorded.

---

### RHEA-009 · Atomic `redeem_invite()` RPC (SECURITY DEFINER)

**Milestone:** M0.3 · **Labels:** `phase-0` `security` `rls` `migration` · **Priority:** P0 · **Difficulty:** M · **Depends on:** RHEA-008
**Status:** ✅ Done (v0.2.0)

**Description**
Add a `SECURITY DEFINER` RPC that redeems an invite atomically: `SELECT … FOR
UPDATE`, TTL check, revocation check, constant-time compare of the BLAKE2b hash
of a 32-byte secret (§0.10 J), and single-use marking — all in one transaction.

**Files**
- `supabase/migrations/0002_secure_invite_redemption.sql` — edit (add function + grant).

**Acceptance Criteria**
- [ ] Concurrent double-redemption yields exactly one `partner_link` (row lock enforced).
- [ ] Expired, used, or revoked invites are rejected.
- [ ] The short typed code is only a lookup handle; redemption gates on the hashed secret.
- [ ] Function is `SECURITY DEFINER` with a locked `search_path`; security sign-off recorded.

---

### RHEA-010 · Client: redeem via RPC, store hashed secret + TTL

**Milestone:** M0.3 · **Labels:** `phase-0` `security` · **Priority:** P0 · **Difficulty:** S · **Depends on:** RHEA-009
**Status:** ✅ Done (v0.2.0)

**Description**
Point the client at the new RPC and change invite creation to store a hashed
secret with a TTL, keeping a capability check so an older client still works.

**Files**
- `src/lib/pairing.ts` — edit (`createInviteCode` [:5], `redeemInviteCode` [:24]).

**Acceptance Criteria**
- [ ] Invite creation persists a hashed 32-byte secret and an expiry.
- [ ] Redemption calls `redeem_invite()` and never reads the `invites` table directly.
- [ ] Pairing still succeeds end-to-end against a local Supabase project.

---

### RHEA-011 · pgTAP suite for invite security

**Milestone:** M0.3 · **Labels:** `phase-0` `security` `rls` `test` · **Priority:** P0 · **Difficulty:** S · **Depends on:** RHEA-009, RHEA-004
**Status:** ✅ Done (v0.2.0)

**Description**
Regression-test the closed hole and the atomic redemption in CI.

**Files**
- `supabase/tests/rls_invite.sql` — new (pgTAP).
- `.github/workflows/ci.yml` — edit (add pgTAP job).

**Acceptance Criteria**
- [ ] Test proves an unlinked user cannot read or redeem another's invite.
- [ ] Test proves expired/used/revoked rejection and single-winner concurrency.
- [ ] pgTAP job runs in CI and blocks on failure.

---

### M0.4 — Account-scoped local DB + guards

### RHEA-012 · Scope IndexedDB per account (`rhea-<uid>`)

**Milestone:** M0.4 · **Labels:** `phase-0` `storage` · **Priority:** P0 · **Difficulty:** S · **Depends on:** RHEA-001
**Status:** ✅ Done (v0.2.0)

**Description**
Open the local database under an account-scoped name so two accounts on one
device never share a store. Opened by uid on session change.

**Files**
- `src/lib/db.ts` — edit (DB name `"rhea"` → `"rhea-<uid>"`, [:3]).
- `src/hooks/useAuth.ts` — edit (open/close DB on session change).

**Acceptance Criteria**
- [ ] Two different uids get isolated IndexedDB stores (fake-indexeddb test).
- [ ] Signing out closes the DB; signing in as another uid opens a distinct DB.
- [ ] Behavior for a single existing user is unchanged after the copy-forward (RHEA-013).

---

### RHEA-013 · One-time idempotent copy-forward from legacy `"rhea"` DB

**Milestone:** M0.4 · **Labels:** `phase-0` `storage` `migration` · **Priority:** P0 · **Difficulty:** S · **Depends on:** RHEA-012
**Status:** ✅ Done (v0.2.0)

**Description**
On first launch after the rename, copy any legacy `"rhea"` database into the
account-scoped DB, idempotently, leaving the legacy DB read-only for one release
so rollback is lossless.

**Files**
- `src/lib/db.ts` — edit (copy-forward routine).

**Acceptance Criteria**
- [ ] Legacy data appears in the scoped DB after first launch.
- [ ] Re-running the copy is a no-op (idempotent).
- [ ] The legacy DB is not deleted in this task (removed in a later release).

---

### RHEA-014 · Partner-never-writes guard

**Milestone:** M0.4 · **Labels:** `phase-0` `security` `sync` · **Priority:** P0 · **Difficulty:** XS · **Depends on:** RHEA-012
**Status:** ✅ Done (v0.2.0)

**Description**
Hard-guard the client so a partner-role session can never call the owner push
paths.

**Files**
- `src/lib/sync.ts` — edit (`pushLog` [:39], `pushAllLogs` [:8] no-op for partner role).

**Acceptance Criteria**
- [ ] With partner role, push functions are no-ops and log a redacted warning.
- [ ] Owner role behavior is unchanged.
- [ ] Unit test asserts the guard.

---

### RHEA-015 · Wipe partner local DB on unpair

**Milestone:** M0.4 · **Labels:** `phase-0` `privacy` `storage` · **Priority:** P0 · **Difficulty:** XS · **Depends on:** RHEA-012
**Status:** ✅ Done (v0.2.0)

**Description**
On unpair, clear the partner's locally cached owner data so nothing lingers
after access is revoked.

**Files**
- `src/lib/pairing.ts` — edit (`unpair` [:68] clears local partner store).

**Acceptance Criteria**
- [ ] After unpair, the partner's local store contains no owner-derived data.
- [ ] Unit test (fake-indexeddb) confirms the store is empty post-unpair.

---

### M0.5 — Correct inaccurate privacy copy

### RHEA-016 · Correct false in-app privacy claims + add a guard test

**Milestone:** M0.5 · **Labels:** `phase-0` `docs` `privacy` `test` · **Priority:** P1 · **Difficulty:** XS · **Depends on:** —
**Status:** ✅ Done (v0.2.0)

**Description**
Remove the four privacy claims the current architecture does not yet meet, and
add a test that fails if a not-yet-true claim (e.g. "end-to-end encrypted")
reappears before its feature ships.

**Files**
- `src/views/settings/PrivacyPolicy.tsx`, `src/views/tracker/Onboarding.tsx`, `src/views/auth/AuthScreen.tsx` — edit.
- `tests/unit/copy.guard.spec.ts` — new.

**Acceptance Criteria**
- [ ] The four inaccurate strings are corrected to reflect current behavior.
- [ ] Guard test flags forbidden claims; each claim is re-enabled per feature in Phase 2.

---

### M0.6 — Disable plaintext notes sync (flag-gated stopgap)

### RHEA-017 · Add feature-flag module and gate note sync egress

**Milestone:** M0.6 · **Labels:** `phase-0` `privacy` `flag` · **Priority:** P1 · **Difficulty:** S · **Depends on:** RHEA-001
**Status:** ✅ Done (v0.2.0)

**Description**
Introduce the flags module and gate all shared-note push/pull on
`flags.notesSync = false`, so no note payload leaves the device until the E2EE
channel (RHEA-095…098) ships. Local notes stay readable.

**Files**
- `src/lib/flags.ts` — new (`notesSync: false`).
- `src/lib/sharing.ts` — edit (gate note push/pull).

**Acceptance Criteria**
- [ ] With the flag off, no note payload is sent to the transport (asserted in test).
- [ ] Local notes still render.
- [ ] Flipping the flag on restores prior behavior (one-line revert).

---

### RHEA-018 · Partner UI "notes upgrading to E2EE" state

**Milestone:** M0.6 · **Labels:** `phase-0` `ui` `privacy` · **Priority:** P2 · **Difficulty:** XS · **Depends on:** RHEA-017
**Status:** ✅ Done (v0.2.0)

**Description**
Show a clear, non-alarming state where shared notes used to appear, explaining
they are being upgraded to end-to-end encryption.

**Files**
- `src/views/partner/PartnerView.tsx`, `src/views/settings/SharingControls.tsx` — edit.

**Acceptance Criteria**
- [ ] With the flag off, the notes area shows the upgrade message, not an error/empty gap.
- [ ] Copy passes the RHEA-016 forbidden-claim guard.

---
## Phase 1 — Foundations

### M1.1 — Introduce `kernel/`

### RHEA-019 · `kernel/result.ts` — `Result<T,E>` and combinators

**Milestone:** M1.1 · **Labels:** `phase-1` `kernel` · **Priority:** P0 · **Difficulty:** S · **Depends on:** RHEA-002
**Status:** ✅ Done (v0.2.0)

**Description**
Add the `Result<T,E>` type with `ok`/`err`/`map`/`flatMap`/`unwrapOr` and the
`kernel/` barrel. Zero dependencies; the one package every layer may import.

**Files**
- `src/kernel/result.ts`, `src/kernel/index.ts` — new.

**Acceptance Criteria**
- [ ] `Result` and all combinators are typed and unit-tested.
- [ ] `kernel/` imports nothing outside itself.

---

### RHEA-020 · `kernel/errors.ts` — `RheaError`, `ErrorCode`, `isRetryable`

**Milestone:** M1.1 · **Labels:** `phase-1` `kernel` · **Priority:** P0 · **Difficulty:** S · **Depends on:** RHEA-019
**Status:** ✅ Done (v0.2.0)

**Description**
Add the typed error base, the `ErrorCode` enum, error factories, and
`isRetryable()`, matching the taxonomy in Chapter 9.

**Files**
- `src/kernel/errors.ts` — new.

**Acceptance Criteria**
- [ ] `RheaError` carries `code`, `userMessage`, and `cause`.
- [ ] `ErrorCode` includes the codes named in Chapter 9 (incl. `PROTOCOL_SKEW`, `INVARIANT`).
- [ ] `isRetryable()` unit-tested per code.

---

### RHEA-021 · `kernel/logger.ts` — logger with health-data redaction

**Milestone:** M1.1 · **Labels:** `phase-1` `kernel` `privacy` · **Priority:** P0 · **Difficulty:** S · **Depends on:** RHEA-019
**Status:** ✅ Done (v0.2.0)

**Description**
Add the `Logger` interface and a redaction layer guaranteeing no health field is
ever logged.

**Files**
- `src/kernel/logger.ts` — new.

**Acceptance Criteria**
- [ ] A log call including a known health field emits a redacted value (unit-tested).
- [ ] Log levels and a no-op logger for tests are provided.

---

### RHEA-022 · `kernel/brand.ts` + `assert.ts` + kernel boundary rule

**Milestone:** M1.1 · **Labels:** `phase-1` `kernel` `ci` · **Priority:** P0 · **Difficulty:** S · **Depends on:** RHEA-019
**Status:** ✅ Done (v0.2.0)

**Description**
Add branded primitives (`Uid`, `DeviceId`, `KeyId`, `Hlc`, `Iso8601`, `DateKey`),
`invariant()`/`assertNever()`, and the first ESLint zone forbidding non-`kernel`
imports from `kernel/`.

**Files**
- `src/kernel/brand.ts`, `src/kernel/assert.ts` — new.
- `eslint.config.js` — edit (kernel zone).

**Acceptance Criteria**
- [ ] Branded types compile and are used by later layers.
- [ ] `assert` throws `RheaError(INVARIANT)` in dev.
- [ ] Lint fails if `kernel/` imports any other layer.

---

### M1.2 — Extract `domain/`

### RHEA-023 · Move domain types to `domain/types.ts` behind a shim

**Milestone:** M1.2 · **Labels:** `phase-1` `domain` · **Priority:** P1 · **Difficulty:** S · **Depends on:** RHEA-022
**Status:** ✅ Done (v0.2.0)

**Description**
Relocate `DailyLog`/`CycleState`/`Period`/`Cycle`/`Gates`/`PartnerProjection`
types into `domain/types.ts`; re-export from `src/types/index.ts` so callers are
untouched.

**Files**
- `src/domain/types.ts` — new. `src/types/index.ts` — edit (re-export shim).

**Acceptance Criteria**
- [ ] All type imports still resolve; `tsc` clean.
- [ ] No behavior change; characterization suite (RHEA-006) still passes.

---

### RHEA-024 · Move `cycle.ts` into `domain/` with a purity test

**Milestone:** M1.2 · **Labels:** `phase-1` `domain` `test` · **Priority:** P1 · **Difficulty:** M · **Depends on:** RHEA-023
**Status:** ✅ Done (v0.2.0)

**Description**
Move `lib/cycle.ts` logic to `domain/cycle.ts` unchanged; leave a re-export shim
at the old path. Add a domain spec that runs in the pure node env (no DOM),
proving purity.

**Files**
- `src/domain/cycle.ts` — new (moved logic). `src/lib/cycle.ts` — edit (shim).
- `tests/unit/domain/cycle.spec.ts` — new.

**Acceptance Criteria**
- [ ] `domain/cycle.ts` imports only `kernel`/`domain`.
- [ ] Characterization snapshots unchanged.
- [ ] Domain spec runs in the node environment.

---

### RHEA-025 · Move `phases.ts` into `domain/` + domain barrel + boundary rule

**Milestone:** M1.2 · **Labels:** `phase-1` `domain` `ci` · **Priority:** P1 · **Difficulty:** S · **Depends on:** RHEA-024
**Status:** ✅ Done (v0.2.0)

**Description**
Move `lib/phases.ts` to `domain/phases.ts` (shim at old path), add `domain/index.ts`,
and extend ESLint to forbid `domain/` importing anything but `kernel`.

**Files**
- `src/domain/phases.ts`, `src/domain/index.ts` — new. `src/lib/phases.ts` — edit (shim).
- `eslint.config.js` — edit (domain zone).

**Acceptance Criteria**
- [ ] `domain/` is import-pure (lint enforced).
- [ ] Characterization suite passes unchanged.

---

### M1.3 — Unify phase engines + single write path

### RHEA-026 · Unify the three phase engines into one oracle

**Milestone:** M1.3 · **Labels:** `phase-1` `domain` · **Priority:** P1 · **Difficulty:** M · **Depends on:** RHEA-025
**Status:** ✅ Done (v0.2.0)

**Description**
Collapse the overlapping phase/day-range logic into a single oracle in
`domain/phases`, with day-ranges **derived** from the engine rather than
hardcoded (Chapter 4 §2).

**Files**
- `src/domain/phases.ts` — edit.

**Acceptance Criteria**
- [ ] One function is the source of phase + day-range truth.
- [ ] Parity test: unified oracle equals the previous three engines except the documented fix (RHEA-028).

---

### RHEA-027 · Remove the `LegacyCycleEntry` bridge

**Milestone:** M1.3 · **Labels:** `phase-1` `domain` · **Priority:** P1 · **Difficulty:** S · **Depends on:** RHEA-026
**Status:** ✅ Done (v0.2.0)

**Description**
Delete the `LegacyCycleEntry` compatibility bridge now that a single engine and
the `DailyLog` model are canonical.

**Files**
- `src/domain/*` and call sites — edit/remove.

**Acceptance Criteria**
- [ ] No references to `LegacyCycleEntry` remain.
- [ ] `tsc` clean; characterization suite green (except RHEA-028 diff).

---

### RHEA-028 · Route QuickAdd + Overview through single `useLogger` write path (timezone fix)

**Milestone:** M1.3 · **Labels:** `phase-1` `domain` `ui` `test` · **Priority:** P1 · **Difficulty:** M · **Depends on:** RHEA-027
**Status:** ✅ Done (v0.2.0)

**Description**
Make `useLogger` the sole write path and route `QuickAddPeriod` + Overview symptom
logging through it, fixing the timezone date-key bug. Update the characterization
snapshot with an explicit before/after diff.

**Files**
- `src/hooks/useLogger.ts` — edit. `src/views/tracker/QuickAddPeriod.tsx`, `OverviewTab.tsx` — edit.
- `tests/unit/domain/cycle.characterization.spec.ts` — edit (documented snapshot update).

**Acceptance Criteria**
- [ ] QuickAdd and Overview both write via `useLogger`.
- [ ] New timezone regression test passes; the snapshot diff is documented in the PR.
- [ ] No duplicate/competing write paths remain.

---

### M1.4 — Storage seam + drivers + repositories

### RHEA-029 · `StorageDriver` seam interface + `data/schema.ts`

**Milestone:** M1.4 · **Labels:** `phase-1` `storage` · **Priority:** P0 · **Difficulty:** M · **Depends on:** RHEA-022
**Status:** ✅ Done (v0.2.0)

**Description**
Define the canonical `StorageDriver` interface (§0.10 A: `ready`, primitive
CRUD, `getByIndexSince`, `transaction`, `close`/`destroy`, blocked/blocking
handlers, `identity`) and the store definitions + `DB_VERSION` in `data/schema.ts`
(still `v1` shape here).

**Files**
- `src/data/drivers/StorageDriver.ts`, `src/data/schema.ts` — new.
- `eslint.config.js` — edit (data zone).

**Acceptance Criteria**
- [ ] Interface matches the §0.10 A canonical signature.
- [ ] `data/` may import only `kernel`/`domain`/`crypto` (lint enforced).
- [ ] Store defs describe the current `v1` stores.

---

### RHEA-030 · `IndexedDbDriver` wrapping current `v1` stores

**Milestone:** M1.4 · **Labels:** `phase-1` `storage` · **Priority:** P0 · **Difficulty:** M · **Depends on:** RHEA-029
**Status:** ✅ Done (v0.2.0)

**Description**
Implement `StorageDriver` over `idb`, wrapping the *exact* current stores at
`DB_VERSION = 1` (no schema change; that is M1.5). Include blocked/blocking/
versionchange handlers and `navigator.storage.persist()`.

**Files**
- `src/data/drivers/IndexedDbDriver.ts` — new.

**Acceptance Criteria**
- [ ] Reads existing `v1` data identically to the current `db.ts` (parity test).
- [ ] Blocked/blocking handlers are wired.
- [ ] Implements the full `StorageDriver` contract.

---

### RHEA-031 · `MemoryDriver` for tests

**Milestone:** M1.4 · **Labels:** `phase-1` `storage` `test` · **Priority:** P0 · **Difficulty:** S · **Depends on:** RHEA-029
**Status:** ✅ Done (v0.2.0)

**Description**
Add an in-memory `StorageDriver` implementation for fast unit tests.

**Files**
- `src/data/drivers/MemoryDriver.ts` — new.

**Acceptance Criteria**
- [ ] Satisfies the full contract in-memory.
- [ ] Used by the driver-contract suite (RHEA-032).

---

### RHEA-032 · Driver-contract test suite

**Milestone:** M1.4 · **Labels:** `phase-1` `storage` `test` · **Priority:** P0 · **Difficulty:** S · **Depends on:** RHEA-030, RHEA-031
**Status:** ✅ Done (v0.2.0)

**Description**
One conformance suite run against every `StorageDriver` implementation, so new
drivers (SQLite in M3.2) inherit coverage.

**Files**
- `tests/unit/data/storageDriver.contract.spec.ts` — new.
- `tests/helpers/makeContainer.ts` — new.

**Acceptance Criteria**
- [ ] Suite runs against `MemoryDriver` and `IndexedDbDriver` (fake-indexeddb).
- [ ] Covers CRUD, transactions, index-since, destroy, and reopen.

---

### RHEA-033 · `LogRepository` + `MetaRepository` + `db.ts` shim

**Milestone:** M1.4 · **Labels:** `phase-1` `storage` · **Priority:** P0 · **Difficulty:** M · **Depends on:** RHEA-030
**Status:** ✅ Done (v0.2.0)

**Description**
Introduce repositories that speak `DailyLog`/meta over the driver; make
`lib/db.ts` a thin shim delegating to them so callers are unchanged.

**Files**
- `src/data/repositories/{LogRepository,MetaRepository,index}.ts` — new.
- `src/lib/db.ts` — edit (shim). `tests/unit/data/repositories.spec.ts` — new.

**Acceptance Criteria**
- [ ] All local reads/writes route through repositories.
- [ ] Existing callers compile via the shim; behavior unchanged.
- [ ] Repository unit tests pass on `MemoryDriver`.

---

### M1.5 — `SyncRecord` + IndexedDB `v1→v2` migration

### RHEA-034 · `data/envelope.ts` — `CipherEnvelope` + `SyncRecord` types

**Milestone:** M1.5 · **Labels:** `phase-1` `storage` `sync` · **Priority:** P0 · **Difficulty:** S · **Depends on:** RHEA-029
**Status:** ✅ Done (v0.2.0)

**Description**
Declare the canonical `CipherEnvelope` and `SyncRecord` (§0.2) with (de)serialize
helpers and a version guard. Payload is a pass-through here (no encryption yet;
`alg` reserved).

**Files**
- `src/data/envelope.ts` — new.

**Acceptance Criteria**
- [ ] Types match §0.2 exactly (fields, `scope` union, `deleted`, HLC `updatedAt`).
- [ ] Unknown `CipherEnvelope.v` routes to quarantine (unit-tested), never silent-accept.

---

### RHEA-035 · Bump local schema to `v2`: add fields + new stores

**Milestone:** M1.5 · **Labels:** `phase-1` `storage` · **Priority:** P0 · **Difficulty:** M · **Depends on:** RHEA-034
**Status:** ✅ Done (v0.2.0)

**Description**
Extend `data/schema.ts` to `DB_VERSION = 2`: add `updatedAt`/`deviceId`/`deleted`
to `logs`, the `by_updatedAt` index, and the new stores completing the canonical
eight (`outbox`, `keyring`, `projections`, `tombstones`, `sync_cursors`, `audit`
— §0.8).

**Files**
- `src/data/schema.ts` — edit.

**Acceptance Criteria**
- [ ] All eight canonical stores are defined.
- [ ] The `by_updatedAt` index exists on `logs`.
- [ ] `DB_VERSION` is `2`.

---

### RHEA-036 · `v1_to_v2` IndexedDB migration with epoch-0 backfill

**Milestone:** M1.5 · **Labels:** `phase-1` `storage` `migration` · **Priority:** P0 · **Difficulty:** M · **Depends on:** RHEA-035
**Status:** ✅ Done (v0.2.0) — with deviations, see note
**Deviation:** Implemented in swapped order — the pure M1.6 HLC/merge work landed before this M1.5 envelope/migration (journaled).

**Description**
Implement a strictly additive, idempotent `upgrade(old=1→2)` that creates new
stores/index and backfills pre-v2 rows with the epoch-0 HLC
(`000000000000:0000:<deviceId>`, §0.5) so migrated rows never win a merge. A
failed upgrade must leave `v1` readable.

**Files**
- `src/data/migrations/indexeddb/{v1_to_v2,index}.ts` — new.

**Acceptance Criteria**
- [ ] Migration is additive (no destructive ops) and idempotent.
- [ ] Pre-v2 rows get the epoch-0 sentinel timestamp.
- [ ] Interrupted upgrade leaves `v1` data intact.

---

### RHEA-037 · Migration integration-test suite (fake-indexeddb)

**Milestone:** M1.5 · **Labels:** `phase-1` `storage` `migration` `test` · **Priority:** P0 · **Difficulty:** S · **Depends on:** RHEA-036
**Status:** ✅ Done (v0.2.0) — with deviations, see note
**Deviation:** Implemented in swapped order — the pure M1.6 HLC/merge work landed before the M1.5 envelope/migration (journaled).

**Description**
Prove the migration preserves data and is safe under interruption.

**Files**
- `tests/integration/indexeddb/migration.spec.ts` — new.

**Acceptance Criteria**
- [ ] v1→v2 preserves every log.
- [ ] Re-running is a no-op; interrupted upgrade leaves v1 intact.
- [ ] Epoch-0 timestamps applied; all eight stores present post-migration.

---

### RHEA-038 · Repositories stamp HLC / `deviceId` / `deleted`

**Milestone:** M1.5 · **Labels:** `phase-1` `storage` `sync` · **Priority:** P0 · **Difficulty:** S · **Depends on:** RHEA-036, RHEA-039
**Status:** ✅ Done (v0.2.0)

**Description**
Update `LogRepository`/`MetaRepository` to write `SyncRecord`s stamping an
edit-time HLC, the device id, and tombstone flags; deletes become tombstones.

**Files**
- `src/data/repositories/{LogRepository,MetaRepository}.ts` — edit.

**Acceptance Criteria**
- [ ] Every write carries an edit-time HLC and `deviceId`.
- [ ] Deletes write a tombstone (`deleted=true`, `payload=null`), not a hard delete.
- [ ] Unit-tested on `MemoryDriver`.

---

### M1.6 — Pure `hlc` + `merge`

### RHEA-039 · `domain/hlc.ts` — Hybrid Logical Clock

**Milestone:** M1.6 · **Labels:** `phase-1` `domain` `sync` · **Priority:** P0 · **Difficulty:** S · **Depends on:** RHEA-022
**Status:** ✅ Done (v0.2.0)

**Description**
Implement `now()`/`receive(remote)`/`compare()` in the §0.5 format, including the
16-bit counter overflow carry into physical time.

**Files**
- `src/domain/hlc.ts` — new.

**Acceptance Criteria**
- [ ] HLC string format matches §0.5 (`<pt12hex>:<c4hex>:<deviceId>`).
- [ ] Counter overflow at `0xffff` carries into `pt` (no throw).
- [ ] Property test: lexicographic order == causal order.

---

### RHEA-040 · `domain/merge.ts` — LWW / tombstone / echo

**Milestone:** M1.6 · **Labels:** `phase-1` `domain` `sync` · **Priority:** P0 · **Difficulty:** M · **Depends on:** RHEA-039
**Status:** ✅ Done (v0.2.0)

**Description**
Implement LWW-per-key resolution with tombstone competition, echo detection, and
`deviceId` tiebreak — all pure.

**Files**
- `src/domain/merge.ts` — new.

**Acceptance Criteria**
- [ ] Merge is commutative and idempotent (property-tested).
- [ ] Tombstone beats a stale write; echo of own write is suppressed.
- [ ] Ties broken deterministically by `deviceId`.

---

### RHEA-041 · HLC + merge property-test suite

**Milestone:** M1.6 · **Labels:** `phase-1` `domain` `sync` `test` · **Priority:** P0 · **Difficulty:** S · **Depends on:** RHEA-040
**Status:** ✅ Done (v0.2.0)

**Description**
Exhaustive property tests for the correctness core before any wiring.

**Files**
- `tests/unit/domain/{hlc.spec,merge.spec}.ts` — new.

**Acceptance Criteria**
- [ ] Randomized-order convergence proven.
- [ ] Overflow, tie, and tombstone edge cases covered.
- [ ] Coverage threshold for `domain/` ratcheted up in this PR.

---

### M1.7 — Export/import v2

### RHEA-042 · `data/exporter.ts` — versioned `ExportData` v2

**Milestone:** M1.7 · **Labels:** `phase-1` `storage` · **Priority:** P1 · **Difficulty:** S · **Depends on:** RHEA-035
**Status:** ✅ Done (v0.2.0)

**Description**
Build the versioned v2 export (`version: 2`) and a `downloadJSON` helper.

**Files**
- `src/data/exporter.ts` — new.

**Acceptance Criteria**
- [ ] Export carries `version: 2` and all v2 fields.
- [ ] Round-trips with the importer (RHEA-043).

---

### RHEA-043 · `data/importer.ts` — v1 shim + parser bug fixes

**Milestone:** M1.7 · **Labels:** `phase-1` `storage` · **Priority:** P1 · **Difficulty:** M · **Depends on:** RHEA-042
**Status:** ✅ Done (v0.2.0)

**Description**
Port the Clue/Flo/AppleHealth/generic parsers to produce `DailyLog`, accept
`{1,2}` via a shim (defaults `medication:[]`, `intimacy:null`), reject `>2`, and
fix the CSV/date bugs the review found.

**Files**
- `src/data/importer.ts` — new. `src/lib/import.ts` — edit (shim).

**Acceptance Criteria**
- [ ] v1 files import via the shim; `version > 2` rejected with a clear message.
- [ ] The specific CSV/date bugs are fixed (covered in RHEA-045).

---

### RHEA-044 · Wire export/import into `SourcesView`

**Milestone:** M1.7 · **Labels:** `phase-1` `ui` · **Priority:** P1 · **Difficulty:** S · **Depends on:** RHEA-043
**Status:** ✅ Done (v0.2.0)

**Description**
Point the settings UI at the new exporter/importer.

**Files**
- `src/views/settings/SourcesView.tsx` — edit.

**Acceptance Criteria**
- [ ] Export downloads a v2 file; import accepts v1/v2 files.
- [ ] Error states surface via the typed error path.

---

### RHEA-045 · Import/export test suite + fixtures

**Milestone:** M1.7 · **Labels:** `phase-1` `storage` `test` · **Priority:** P1 · **Difficulty:** S · **Depends on:** RHEA-043
**Status:** ✅ Done (v0.2.0)

**Description**
Round-trip and regression tests, including the previously-broken CSV/date inputs.

**Files**
- `tests/unit/data/importer.spec.ts` — new. `tests/fixtures/` — new import samples.

**Acceptance Criteria**
- [ ] Export→import identity holds.
- [ ] Each fixed bug has a failing-before/passing-after fixture.
- [ ] Future-version rejection tested.

---

### M1.8 — `SyncEngine` over `NullTransport`

### RHEA-046 · `Transport` seam + `NullTransport`

**Milestone:** M1.8 · **Labels:** `phase-1` `sync` · **Priority:** P0 · **Difficulty:** S · **Depends on:** RHEA-034
**Status:** ✅ Done (v0.2.0)

**Description**
Define the `Transport` interface (`push`/`pull`/`subscribe`/`protocolVersion`,
§3.2) and a local-only `NullTransport` so the engine can run with no network.

**Files**
- `src/sync/transports/{Transport,NullTransport,index}.ts` — new.
- `eslint.config.js` — edit (sync + transports zones).

**Acceptance Criteria**
- [ ] `Transport` matches §3.2; transports may import only `kernel`/`data` types.
- [ ] `NullTransport` satisfies the contract with no I/O.

---

### RHEA-047 · `OutboxRepository` + outbox drain (backoff + jitter)

**Milestone:** M1.8 · **Labels:** `phase-1` `sync` `storage` · **Priority:** P0 · **Difficulty:** M · **Depends on:** RHEA-035, RHEA-046
**Status:** ✅ Done (v0.2.0)

**Description**
Add the durable outbox store/repository and a drain loop with exponential backoff
+ jitter and `nextAttemptAt` scheduling.

**Files**
- `src/data/repositories/OutboxRepository.ts` — new. `src/sync/outbox.ts` — new.

**Acceptance Criteria**
- [ ] Enqueued records survive a restart (durable).
- [ ] Backoff + jitter applied; attempts and `nextAttemptAt` persisted.
- [ ] Drain is safe to run concurrently (single-flight).

---

### RHEA-048 · `reconcile` + `cursor` (pull-since → merge)

**Milestone:** M1.8 · **Labels:** `phase-1` `sync` · **Priority:** P0 · **Difficulty:** M · **Depends on:** RHEA-040, RHEA-046
**Status:** ✅ Done (v0.2.0)

**Description**
Implement per-`(scope,peer)` cursor persistence (`sync_cursors` store) and
`reconcile`: pull since cursor → decrypt (pass-through here) → `merge.applyRemote`
without re-enqueuing (echo-safe).

**Files**
- `src/sync/{reconcile,cursor}.ts` — new.

**Acceptance Criteria**
- [ ] Reconcile is idempotent and advances the cursor monotonically.
- [ ] Applying a remote record does not re-enqueue it (no echo storm).

---

### RHEA-049 · `SyncEngine` orchestration + lifecycle

**Milestone:** M1.8 · **Labels:** `phase-1` `sync` · **Priority:** P0 · **Difficulty:** M · **Depends on:** RHEA-047, RHEA-048
**Status:** ✅ Done (v0.2.0)

**Description**
Compose outbox + cursor + reconcile behind `start()`/`stop()` with a status
signal (`idle|syncing|offline|error|stale`) for the UI.

**Files**
- `src/sync/{SyncEngine,index}.ts` — new.

**Acceptance Criteria**
- [ ] `start()`/`stop()` are idempotent; wake-ups trigger reconcile.
- [ ] Status transitions are observable for `useSyncStatus` (M1.10).

---

### RHEA-050 · Sync test helpers + unit suite

**Milestone:** M1.8 · **Labels:** `phase-1` `sync` `test` · **Priority:** P0 · **Difficulty:** S · **Depends on:** RHEA-049
**Status:** ✅ Done (v0.2.0)

**Description**
Add `fakeTransport`/`fakeClock` helpers and unit tests proving end-to-end sync
against fakes.

**Files**
- `tests/helpers/{fakeTransport,fakeClock}.ts` — new.
- `tests/unit/sync/{outbox,reconcile,syncEngine}.spec.ts` — new.

**Acceptance Criteria**
- [ ] Offline edits flush on reconnect; tombstones propagate; echo suppressed.
- [ ] Engine converges two fake peers to identical state.

---

### M1.9 — `SupabaseTransport` (owner) + cutover

### RHEA-051 · Migration 0003 — owner sync metadata columns

**Milestone:** M1.9 · **Labels:** `phase-1` `migration` `sync` · **Priority:** P0 · **Difficulty:** S · **Depends on:** RHEA-007
**Status:** ✅ Done (v0.2.0) — with deviations, see note
**Deviation:** The HLC column is `updated_hlc` (`updated_at` was a pre-existing legacy `timestamptz`); 0003 also ships the silent-skip (`RETURN NULL`) stale-write trigger `daily_logs_reject_stale_write()`. Migration authored but not yet applied to any database.

**Description**
Additively add `updated_at` (HLC text), `device_id`, `deleted`, and a
trigger-set `server_updated_at timestamptz` (§0.10 C) plus a keyset index to
`daily_logs`. Old clients ignore new columns.

**Files**
- `supabase/migrations/0003_owner_sync_metadata.sql` — new.

**Acceptance Criteria**
- [ ] Columns + trigger + keyset index `(server_updated_at, key)` exist.
- [ ] `server_updated_at` is server-set on every insert/update; clients never write it.
- [ ] Existing rows/clients keep working (additive).

---

### RHEA-052 · `SupabaseTransport` (push/pull/subscribe), owner scope

**Milestone:** M1.9 · **Labels:** `phase-1` `sync` · **Priority:** P0 · **Difficulty:** M · **Depends on:** RHEA-046, RHEA-051
**Status:** ✅ Done (v0.2.0) — with deviations, see note
**Deviation:** Shipped wire shape upserts with `onConflict = owner_id,date` against plaintext columns; the `(owner_id,scope,key)` conflict target arrives with M2.4's migration `0004` (more invasive than "add a column" — a PK/conflict/cursor change).

**Description**
Implement the only Phase-2 transport: push/pull ciphertext-shaped rows keyed by
the `(server_updated_at, key)` cursor and a realtime `postgres_changes` wake-up.
Payloads remain plaintext blobs until M2.4 (mechanism change only).

**Files**
- `src/sync/transports/SupabaseTransport.ts` — new.

**Acceptance Criteria**
- [ ] Push upserts on `onConflict = owner_id,scope,key` (§0.10 D).
- [ ] Pull is keyset-paginated by `(server_updated_at, key)`.
- [ ] `subscribe` fires the engine's `onWake`; unsubscribe cleans up.

---

### RHEA-053 · Cut owner sync over to `SyncEngine` behind `flags.syncEngine` (shadow)

**Milestone:** M1.9 · **Labels:** `phase-1` `sync` `flag` · **Priority:** P0 · **Difficulty:** M · **Depends on:** RHEA-052, RHEA-014
**Status:** ✅ Done (v0.2.0)

**Description**
Replace `initialSync`/`pushAllLogs`/`pullAllLogs` (`sync.ts:142`/`:8`/`:63`) with
the engine, gated by `flags.syncEngine`. Run new engine in shadow and diff its
result set against the legacy path for one release.

**Files**
- `src/lib/sync.ts` — edit. `src/hooks/useCycleData.ts`, `src/App.tsx` — edit (bootstrap swap).

**Acceptance Criteria**
- [ ] With the flag off, the legacy path runs unchanged.
- [ ] Shadow-diff shows engine result == legacy result across test accounts.
- [ ] No user-visible change while the flag is off.

---

### RHEA-054 · Owner RLS integration test + first offline E2E

**Milestone:** M1.9 · **Labels:** `phase-1` `sync` `rls` `test` · **Priority:** P0 · **Difficulty:** M · **Depends on:** RHEA-052
**Status:** ✅ Done (v0.2.0) — with deviations, see note
**Deviation:** Delivered with deviation — owner-RLS coverage authored as pgTAP (`supabase/tests/rls_owner_sync.sql`, not yet executed against a live database); offline/convergence proven via fake-transport unit suites instead of Playwright. Playwright e2e was NOT set up (deferred; bootstrap before or during M2.4 verification if a live Supabase becomes available).

**Description**
Prove owner isolation against a local Supabase and the offline→reconnect flush
end-to-end.

**Files**
- `tests/integration/rls/owner.spec.ts` — new. `tests/e2e/offline.spec.ts` — new.
- `playwright.config.ts` — new.

**Acceptance Criteria**
- [ ] Owner cannot read another owner's rows (RLS).
- [ ] Multi-device owner converges; offline edits flush on reconnect; deletes propagate.
- [ ] Playwright is wired into CI.

---

### RHEA-055 · Flip `flags.syncEngine` on; retire legacy sync

**Milestone:** M1.9 · **Labels:** `phase-1` `sync` `flag` · **Priority:** P0 · **Difficulty:** XS · **Depends on:** RHEA-053, RHEA-054
**Status:** ✅ Done (v0.2.0)

**Description**
After the shadow window is clean, flip the flag on. The legacy `sync.ts` path
stays present (deleted in M1.10) for one release as a rollback.

**Files**
- `src/lib/flags.ts` — edit.

**Acceptance Criteria**
- [ ] Engine is the live owner-sync path.
- [ ] Rollback = flip flag off (verified).
- [ ] No error-rate regression in the shadow metrics.

---

### M1.10 — Composition root + boundaries

### RHEA-056 · Composition root: `Container` / `Providers` / `context`

**Milestone:** M1.10 · **Labels:** `phase-1` `app` · **Priority:** P1 · **Difficulty:** M · **Depends on:** RHEA-049, RHEA-033
**Status:** ✅ Done (v0.2.0)

**Description**
Introduce the single place that names concrete adapters/drivers/engines and wires
them from `Platform` capabilities, plus React providers and typed accessor hooks.

**Files**
- `src/app/di/{Container,Providers,context}.ts` — new.

**Acceptance Criteria**
- [ ] Container builds the full graph (driver, transport, engine) for web.
- [ ] UI obtains dependencies only via `useContainer`/typed hooks.

---

### RHEA-057 · Move hooks/views/components under `app/` and fix entry

**Milestone:** M1.10 · **Labels:** `phase-1` `app` · **Priority:** P1 · **Difficulty:** M · **Depends on:** RHEA-056
**Status:** ✅ Done (v0.2.0)

**Description**
Relocate `hooks/`, `views/`, `components/`, `App.tsx`, `main.tsx` under `src/app/`
per Chapter 2 and update the Vite/HTML entry path.

**Files**
- `src/app/**` — move. `vite.config.ts`, `index.html` — edit.

**Acceptance Criteria**
- [ ] App boots from the new entry; full suite green.
- [ ] Only moves — no logic changes.

---

### RHEA-058 · Remove all Phase-1 re-export shims

**Milestone:** M1.10 · **Labels:** `phase-1` `app` `sync` · **Priority:** P1 · **Difficulty:** S · **Depends on:** RHEA-057, RHEA-055
**Status:** ✅ Done (v0.2.0)

**Description**
Delete the `src/lib/*` shims (cycle, phases, db, import, sync) and the legacy sync
path now that the engine is live and everything imports the real modules.

**Files**
- `src/lib/*` — remove (shims + legacy `sync.ts`).

**Acceptance Criteria**
- [ ] No shim files remain; imports point at real modules.
- [ ] `tsc` clean; suite green.

---

### RHEA-059 · Enforce the full boundary matrix + web-gate SW registration

**Milestone:** M1.10 · **Labels:** `phase-1` `ci` `app` · **Priority:** P1 · **Difficulty:** S · **Depends on:** RHEA-058
**Status:** ✅ Done (v0.2.0)

**Description**
Turn on the complete `import/no-restricted-paths` matrix (§3.1) as a hard CI
failure and gate service-worker registration to web only (§3).

**Files**
- `eslint.config.js` — edit (full matrix). `src/app/main.tsx` — edit (SW web gate).

**Acceptance Criteria**
- [ ] Any illegal cross-layer import fails CI.
- [ ] SW registers on web, not inside a (future) native webview.
- [ ] Chapter 2 folder structure fully realized.

---
## Phase 2 — Privacy Engine + E2EE (critical path)

> Every `crypto/**` and RLS-policy task in this phase requires a **human security
> review** in addition to CI. This is stated once here and referenced in each
> task's acceptance criteria.

### M2.1 — `crypto/sodium` + `aead` + KATs

### RHEA-060 · libsodium `ready()` singleton

**Milestone:** M2.1 · **Labels:** `phase-2` `crypto` · **Priority:** P0 · **Difficulty:** S · **Depends on:** RHEA-022
**Status:** ✅ Done (v0.2.0, 2026-07-15) — with deviations, see note
**Deviation:** Package is `libsodium-wrappers-sumo` (standard build omits `crypto_pwhash`/Argon2id — ADR-0005). Singleton is `getSodium()` in `src/crypto/sodium.ts`; `tests/setup.ts` awaits it globally; `crypto/` lint zone added (kernel-only imports).

**Description**
Add the libsodium initialization singleton all crypto depends on, and await it in
the test setup.

**Files**
- `src/crypto/{sodium,index}.ts` — new. `package.json` — edit (`libsodium-wrappers-sumo` — the sumo build is required for `crypto_pwhash`/Argon2id; see [ADR-0005](adr/0005-crypto-library-selection.md)).
- `tests/setup.ts` — edit (await `sodium.ready`). `eslint.config.js` — edit (crypto zone).

**Acceptance Criteria**
- [ ] `crypto/` may import only `kernel` + libsodium (lint enforced).
- [ ] `sodium.ready()` resolves once and is reused.

---

### RHEA-061 · `crypto/aead.ts` — XChaCha20-Poly1305 seal/open with 4-field AAD

**Milestone:** M2.1 · **Labels:** `phase-2` `crypto` · **Priority:** P0 · **Difficulty:** M · **Depends on:** RHEA-060, RHEA-034
**Status:** ✅ Done (v0.2.0, 2026-07-15) — with deviations, see note
**Deviation:** `CipherEnvelope` TYPE moved to `src/crypto/envelope.ts` (crypto may not import data; data re-exports it — spec Ch3 §3.1); AAD assembly (`buildAad`/`aadForRecord`, canonical 4-field JSON) lives in `src/data/envelope.ts`; `open()` distinguishes `AAD_MISMATCH` (stored≠recomputed, T-3 #3) from `DECRYPT_FAILED` (tag/format, T-3 #1) — two new kernel ErrorCodes. "Security reviewer sign-off" recorded as: no human security reviewer exists in this engagement — ADR-0005 + pinned KATs + T-3 error mapping stand in; **external review still required before production launch**.

**Description**
Implement `seal`/`open` producing/consuming `CipherEnvelope`, binding the 4-field
AAD `canonicalJSON({keyId, recordKey, scope, updatedAt})` (§0.3 / §0.10 G). A
mismatch is an auth failure → quarantine.

**Files**
- `src/crypto/aead.ts` — new.

**Acceptance Criteria**
- [ ] Seal/open round-trips; fresh 24-byte nonce per message.
- [ ] Tampered ciphertext or any AAD field mismatch fails to open.
- [ ] Security reviewer sign-off recorded.

---

### RHEA-062 · AEAD known-answer-test vectors

**Milestone:** M2.1 · **Labels:** `phase-2` `crypto` `test` · **Priority:** P0 · **Difficulty:** S · **Depends on:** RHEA-061
**Status:** ✅ Done (v0.2.0, 2026-07-15)
**Note:** Vectors self-generated against the audited libsodium build and pinned (`tests/fixtures/vectors/aead.json` + in-repo generator `gen-aead-vectors.mjs`); suite covers seal/open KATs, tamper→DECRYPT_FAILED, per-field AAD-mismatch→AAD_MISMATCH, stripped-aad tag failure, unknown v/alg rejection, canonical-JSON guard, 300-seal nonce uniqueness, wrong-key, equal/zero.

**Description**
Pin AEAD behavior with KAT fixtures so future refactors cannot silently change
the construction.

**Files**
- `tests/unit/crypto/aead.vectors.spec.ts` — new. `tests/fixtures/vectors/` — new.

**Acceptance Criteria**
- [ ] Vectors cover seal/open, tamper, and AAD-mismatch.
- [ ] Nonce-uniqueness asserted across many seals.

---

### M2.2 — `keyring` + `SecureStore` (web)

### RHEA-063 · `SecureStore` seam + `WebSecureStore`

**Milestone:** M2.2 · **Labels:** `phase-2` `crypto` `platform` · **Priority:** P0 · **Difficulty:** M · **Depends on:** RHEA-060
**Status:** Not started

**Description**
Define the `SecureStore` seam (§3.2) and a web implementation storing wrapped /
non-extractable key material in IndexedDB (best-effort custody). **Security review.**

**Files**
- `src/platform/seams/SecureStore.ts`, `src/platform/web/WebSecureStore.ts` — new.

**Acceptance Criteria**
- [ ] `wrap`/`unwrap`/`remove` round-trip; `custody` reports `software-idb`.
- [ ] Raw key bytes are never returned by generic store reads (negative test).
- [ ] Security reviewer sign-off recorded.

---

### RHEA-064 · `crypto/keyring.ts` — identity keys + DEK + keyId resolution

**Milestone:** M2.2 · **Labels:** `phase-2` `crypto` · **Priority:** P0 · **Difficulty:** M · **Depends on:** RHEA-063
**Status:** Not started

**Description**
Generate the device identity keypairs (X25519 + Ed25519) and the per-account DEK,
and resolve `keyId → key` per the §0.4 grammar (`dek:<epoch>`, `kpair:<linkId>:<version>`).
`deviceId` = 128-bit base64url (§0.10 K). Not yet the sole guardian of any data
(encryption relies on it in M2.4). **Security review.**

**Files**
- `src/crypto/keyring.ts` — new. `src/app/di/Container.ts` — edit (inject `SecureStore`).

**Acceptance Criteria**
- [ ] Keys generate, persist via `SecureStore`, and reload across sessions.
- [ ] `keyId` resolution handles multiple DEK epochs and pair versions.
- [ ] Security reviewer sign-off recorded.

---

### RHEA-065 · Keyring + SecureStore test suite

**Milestone:** M2.2 · **Labels:** `phase-2` `crypto` `test` · **Priority:** P0 · **Difficulty:** S · **Depends on:** RHEA-064
**Status:** Not started

**Description**
Cover custody and resolution behavior.

**Files**
- `tests/unit/crypto/keyring.spec.ts` — new.

**Acceptance Criteria**
- [ ] DEK create/persist/reload verified; keyId grammar edge cases covered.
- [ ] `WebSecureStore` wrap/unwrap round-trip; no raw-key leakage.

---

### M2.3 — Recovery phrase

### RHEA-066 · `crypto/kdf.ts` — Argon2id KEK + `crypto_kx` pair-key derivation + vectors

**Milestone:** M2.3 · **Labels:** `phase-2` `crypto` `test` · **Priority:** P0 · **Difficulty:** M · **Depends on:** RHEA-060
**Status:** Not started

**Description**
Derive the recovery-KEK via Argon2id (pinned params) and the `K_pair` from
`crypto_kx` per §0.10 L, with KAT vectors pinning the parameters. **Security review.**

**Files**
- `src/crypto/kdf.ts` — new. `tests/unit/crypto/kdf.vectors.spec.ts` — new.

**Acceptance Criteria**
- [ ] Argon2id params pinned by vector; deterministic KEK from a phrase.
- [ ] `K_pair` derivation yields identical bytes on both sides (§0.10 L).
- [ ] Security reviewer sign-off recorded.

---

### RHEA-067 · `crypto/recovery.ts` — BIP39 phrase ↔ wrapped DEK

**Milestone:** M2.3 · **Labels:** `phase-2` `crypto` · **Priority:** P0 · **Difficulty:** M · **Depends on:** RHEA-066, RHEA-064
**Status:** Not started

**Description**
Generate/validate a BIP39 phrase, derive the KEK, and wrap/unwrap the DEK. This
is the **only** key-recovery path and must ship before encryption is relied upon
(M2.4). **Security review.**

**Files**
- `src/crypto/recovery.ts` — new. `tests/unit/crypto/recovery.spec.ts` — new.

**Acceptance Criteria**
- [ ] Phrase → KEK → wrap → unwrap → DEK is an identity.
- [ ] A wrong phrase fails cleanly (no partial/plaintext key exposure).
- [ ] Security reviewer sign-off recorded.

---

### RHEA-068 · Recovery onboarding + restore UI (with verify step)

**Milestone:** M2.3 · **Labels:** `phase-2` `crypto` `ui` · **Priority:** P0 · **Difficulty:** M · **Depends on:** RHEA-067
**Status:** Not started

**Description**
Add the phrase setup (with a "confirm your phrase" verification) and restore
flows.

**Files**
- `src/app/views/auth/{RecoveryPhraseSetup,RecoveryRestore}.tsx` — new. auth flow + `di/` — edit.

**Acceptance Criteria**
- [ ] Setup forces a verification step before completing.
- [ ] Restore recovers the DEK on a fresh install from the phrase.
- [ ] Copy passes the forbidden-claim guard (RHEA-016).

---

### M2.4 — Encrypt owner data (E2EE cutover)

### RHEA-069 · Migration 0004 — add ciphertext `payload` column (expand)

**Milestone:** M2.4 · **Labels:** `phase-2` `migration` `crypto` · **Priority:** P0 · **Difficulty:** S · **Depends on:** RHEA-051
**Status:** Not started

**Description**
Additively add `payload bytea` (ciphertext) alongside the existing plaintext
column and set the PK to `(owner_id, scope, key)` (§0.10 D). The plaintext column
is dropped later in M2.13. **Security review (schema).**

**Files**
- `supabase/migrations/0004_daily_logs_ciphertext.sql` — new.

**Acceptance Criteria**
- [ ] `payload bytea` and the `(owner_id, scope, key)` PK exist; plaintext column untouched.
- [ ] Old clients continue to read/write the plaintext column.
- [ ] Security sign-off recorded.

---

### RHEA-070 · Seal/open owner payloads in repositories + transport

**Milestone:** M2.4 · **Labels:** `phase-2` `crypto` `sync` `storage` · **Priority:** P0 · **Difficulty:** M · **Depends on:** RHEA-061, RHEA-064, RHEA-069
**Status:** Not started

**Description**
Seal `DailyLog`/meta payloads with the DEK before the outbox and at rest; open on
reconcile. Hash record keys (keyed BLAKE2b, §0.10 H) and length-pad payloads
(§0.6) so the server sees neither dates nor sizes. **Security review.**

**Files**
- `src/data/repositories/{LogRepository,MetaRepository}.ts`, `src/sync/{reconcile}.ts`, `src/sync/transports/SupabaseTransport.ts` — edit.

**Acceptance Criteria**
- [ ] Server rows contain ciphertext + hashed wire keys only (no plaintext, no dates).
- [ ] `wireKey → logicalKey` mapping is reconstructable from the DEK (§0.10 H).
- [ ] Security sign-off recorded.

---

### RHEA-071 · Dual-read/dual-write + historical re-encryption backfill (flag `e2eeOwner`)

**Milestone:** M2.4 · **Labels:** `phase-2` `crypto` `migration` `flag` · **Priority:** P0 · **Difficulty:** M · **Depends on:** RHEA-070, RHEA-067
**Status:** Not started

**Description**
During cutover, read plaintext OR ciphertext and briefly write both; a background
pass re-encrypts historical rows and uploads ciphertext. Gated by
`flags.e2eeOwner`; recovery (M2.3) is live so nothing is unrecoverable.

**Files**
- `src/data/migrations/indexeddb/` re-encrypt step — new. `src/sync/reconcile.ts` — edit (dual-read). `src/app/lib/flags.ts` — edit.

**Acceptance Criteria**
- [ ] Mixed plaintext/ciphertext rows both resolve during the window.
- [ ] Re-encryption backfill is idempotent and reports coverage %.
- [ ] Flag off falls back to plaintext (lossless rollback).

---

### RHEA-072 · Owner-E2EE integration test suite

**Milestone:** M2.4 · **Labels:** `phase-2` `crypto` `sync` `test` · **Priority:** P0 · **Difficulty:** M · **Depends on:** RHEA-071
**Status:** Not started

**Description**
Prove confidentiality and multi-device correctness on ciphertext.

**Files**
- `tests/integration/rls/owner.spec.ts` — edit. `tests/unit/crypto/aad.binding.spec.ts` — new.

**Acceptance Criteria**
- [ ] Two devices encrypt→sync→decrypt to identical state.
- [ ] A server-side assertion finds no plaintext health data or raw dates.
- [ ] AAD binds keyId+scope+recordKey+updatedAt (transplant rejected).

---

### RHEA-073 · Flip `flags.e2eeOwner` on

**Milestone:** M2.4 · **Labels:** `phase-2` `crypto` `flag` · **Priority:** P0 · **Difficulty:** XS · **Depends on:** RHEA-072
**Status:** Not started

**Description**
Enable owner E2EE for the user base once coverage is verified. The plaintext
column remains (dropped in M2.13) so rollback stays lossless.

**Files**
- `src/app/lib/flags.ts` — edit.

**Acceptance Criteria**
- [ ] Owner data is E2EE end-to-end; server is zero-knowledge for owner scope.
- [ ] Re-encryption coverage reported ~100% before flip.
- [ ] Rollback via flag verified.

---

### M2.5 — QR + SAS pairing

### RHEA-074 · Migration 0005 — `device_keys` + `pairing_sessions`

**Milestone:** M2.5 · **Labels:** `phase-2` `migration` `crypto` · **Priority:** P0 · **Difficulty:** S · **Depends on:** RHEA-007
**Status:** Not started

**Description**
Add the tables backing device public keys and the ephemeral QR/SAS handshake
rendezvous (§0.7). **Security review (schema + RLS).**

**Files**
- `supabase/migrations/0005_pairing_v2_tables.sql` — new.

**Acceptance Criteria**
- [ ] `device_keys` and `pairing_sessions` exist with least-privilege RLS.
- [ ] A third party cannot read/write another session (asserted in RHEA-077).
- [ ] Security sign-off recorded.

---

### RHEA-075 · `crypto/pairing.ts` — X25519 + SAS + `K_pair` derive/rotate

**Milestone:** M2.5 · **Labels:** `phase-2` `crypto` · **Priority:** P0 · **Difficulty:** M · **Depends on:** RHEA-066, RHEA-074
**Status:** Not started

**Description**
Implement the QR X25519 handshake, SAS verification (100-bit/30-digit, §0.10), and
`K_pair` derivation + rotation on unpair (`kpair` version bump). **Security review.**

**Files**
- `src/crypto/pairing.ts` — new.

**Acceptance Criteria**
- [ ] Both sides derive identical `K_pair`; raw kx bytes are zeroed.
- [ ] SAS mismatch aborts before any key is used.
- [ ] Unpair bumps the `kpair` version; old ciphertext no longer opens.
- [ ] Security sign-off recorded.

---

### RHEA-076 · Pairing UI + `usePairing` (QR + SAS ceremony)

**Milestone:** M2.5 · **Labels:** `phase-2` `crypto` `ui` · **Priority:** P0 · **Difficulty:** M · **Depends on:** RHEA-075
**Status:** Not started

**Description**
Build the pairing hook and settings UI for the QR scan + SAS confirmation
ceremony state machine.

**Files**
- `src/app/hooks/usePairing.ts` — new. `src/app/views/settings/PairingSection.tsx` — edit.

**Acceptance Criteria**
- [ ] The ceremony shows the SAS and requires both sides to confirm.
- [ ] Cancel/timeout paths abort cleanly with a typed error.

---

### RHEA-077 · pgTAP pairing-hijack + pairing unit tests

**Milestone:** M2.5 · **Labels:** `phase-2` `crypto` `rls` `test` · **Priority:** P0 · **Difficulty:** S · **Depends on:** RHEA-075, RHEA-074
**Status:** Not started

**Description**
Regression-test that pairing cannot be hijacked and that SAS defeats MITM.

**Files**
- `tests/integration/rls/pairing-hijack.spec.ts` — new. `tests/unit/crypto/pairing.spec.ts` — new.

**Acceptance Criteria**
- [ ] A third party cannot join/hijack a `pairing_session`.
- [ ] A MITM producing a different key yields a SAS mismatch → abort.

---

### RHEA-078 · Cut over to v2 pairing behind `flags.pairingV2` and flip on

**Milestone:** M2.5 · **Labels:** `phase-2` `crypto` `flag` · **Priority:** P0 · **Difficulty:** S · **Depends on:** RHEA-076, RHEA-077, RHEA-010
**Status:** Not started

**Description**
Gate v2 pairing behind a flag, keep the M0.3 secure invite path as fallback, then
flip on once proven.

**Files**
- `src/app/lib/pairing.ts` — edit. `src/app/lib/flags.ts` — edit.

**Acceptance Criteria**
- [ ] Flag off → M0.3 invite path; flag on → QR+SAS pairing.
- [ ] Rollback via flag verified; no orphaned links created during cutover.

---

### M2.6 — Multi-device enrollment

### RHEA-079 · `crypto/enrollment.ts` — DEK distribution (kx + SAS)

**Milestone:** M2.6 · **Labels:** `phase-2` `crypto` · **Priority:** P1 · **Difficulty:** M · **Depends on:** RHEA-075, RHEA-067
**Status:** Not started

**Description**
Distribute the DEK to a second owner device via a QR + `crypto_kx` + SAS
handshake; no unwrapped key ever transits the server. **Security review.**

**Files**
- `src/crypto/enrollment.ts` — new. `tests/unit/crypto/enrollment.spec.ts` — new.

**Acceptance Criteria**
- [ ] Enrolled device decrypts owner data after the ceremony.
- [ ] SAS mismatch aborts; server never sees the unwrapped DEK.
- [ ] Security sign-off recorded.

---

### RHEA-080 · Devices UI (`DevicesSection`)

**Milestone:** M2.6 · **Labels:** `phase-2` `ui` `crypto` · **Priority:** P1 · **Difficulty:** S · **Depends on:** RHEA-079
**Status:** Not started

**Description**
Add the settings UI to enroll and list owner devices.

**Files**
- `src/app/views/settings/DevicesSection.tsx` — new. `di/` — edit.

**Acceptance Criteria**
- [ ] Enrollment ceremony is reachable and shows the SAS.
- [ ] Enrolled devices are listed; copy passes the claim guard.

---

### RHEA-081 · Enable multi-device behind `flags.multiDevice`

**Milestone:** M2.6 · **Labels:** `phase-2` `crypto` `flag` · **Priority:** P1 · **Difficulty:** XS · **Depends on:** RHEA-080
**Status:** Not started

**Description**
Ship enrollment dark, validate, then flip on. Single-device + recovery phrase
remains the supported story until then.

**Files**
- `src/app/lib/flags.ts` — edit.

**Acceptance Criteria**
- [ ] Flag off → single-device behavior unchanged.
- [ ] Flag on → second device works end-to-end; rollback via flag verified.

---

### M2.7 — PrivacyEngine + projection builder (pure)

### RHEA-082 · `domain/projectionBuilder.ts` — anchors + gates + version 2

**Milestone:** M2.7 · **Labels:** `phase-2` `domain` `privacy` · **Priority:** P1 · **Difficulty:** M · **Depends on:** RHEA-025
**Status:** Not started

**Description**
Build `CycleState → PartnerProjection` emitting **anchors + gates + computedAt**
with `version = 2` (§0.10 F), shipping an anchor only when an enabled gate needs
it (§0.10 M).

**Files**
- `src/domain/projectionBuilder.ts` — new.

**Acceptance Criteria**
- [ ] Anchors are emitted only for enabled gates that require them (§0.10 M table).
- [ ] Output carries `version = 2` and `computedAt`.
- [ ] Pure; no I/O.

---

### RHEA-083 · `domain/privacyPolicy.ts` — allowlist, gate resolution, quiet eval

**Milestone:** M2.7 · **Labels:** `phase-2` `domain` `privacy` · **Priority:** P1 · **Difficulty:** S · **Depends on:** RHEA-082
**Status:** Not started

**Description**
Encode the shareable-field allowlist, gate resolution (default-deny), and
quiet-window evaluation as pure rules.

**Files**
- `src/domain/privacyPolicy.ts` — new.

**Acceptance Criteria**
- [ ] Non-allowlisted fields can never enter a projection (unit-tested).
- [ ] Unset gate resolves to deny.

---

### RHEA-084 · `privacy/PrivacyEngine.ts` — orchestration (unwired)

**Milestone:** M2.7 · **Labels:** `phase-2` `privacy` · **Priority:** P1 · **Difficulty:** S · **Depends on:** RHEA-083
**Status:** Not started

**Description**
Compose derive → build → (later) encrypt → publish, and own the four recompute
triggers — but do not publish to a transport yet.

**Files**
- `src/privacy/{PrivacyEngine,index}.ts` — new. `eslint.config.js` — edit (privacy zone).

**Acceptance Criteria**
- [ ] Engine produces a projection object from a `CycleState`.
- [ ] `privacy/` imports only its allowed layers (lint enforced).

---

### RHEA-085 · Privacy pure-logic + "partner cannot decrypt" negative test

**Milestone:** M2.7 · **Labels:** `phase-2` `privacy` `crypto` `test` · **Priority:** P1 · **Difficulty:** S · **Depends on:** RHEA-084, RHEA-064
**Status:** Not started

**Description**
Test the builder/policy and prove a partner key cannot open an owner-scope
envelope.

**Files**
- `tests/unit/domain/{projectionBuilder,privacyPolicy}.spec.ts`, `tests/unit/privacy/privacyEngine.spec.ts`, `tests/unit/crypto/negative.partner-cannot-decrypt.spec.ts` — new.

**Acceptance Criteria**
- [ ] Partial-anchor re-derivation rules (§0.10 M) covered.
- [ ] A partner's `K_pair` cannot decrypt an owner `dek:`-scoped envelope.

---

### M2.8 — ProjectionPublisher + table + triggers

### RHEA-086 · Migration 0006 — `partner_projections`

**Milestone:** M2.8 · **Labels:** `phase-2` `migration` `rls` · **Priority:** P0 · **Difficulty:** S · **Depends on:** RHEA-051
**Status:** Not started

**Description**
Add `partner_projections` (one row per link, PK `link_id`, ciphertext,
trigger-set `server_updated_at`) with RLS letting exactly the paired partner
read. **Security review (RLS).**

**Files**
- `supabase/migrations/0006_partner_projections.sql` — new.

**Acceptance Criteria**
- [ ] Only the paired partner may `SELECT`; only the owner may write.
- [ ] `server_updated_at` trigger-set; additive to existing schema.
- [ ] Security sign-off recorded.

---

### RHEA-087 · `ProjectionRepository` + `ProjectionPublisher`

**Milestone:** M2.8 · **Labels:** `phase-2` `privacy` `crypto` · **Priority:** P0 · **Difficulty:** M · **Depends on:** RHEA-086, RHEA-075, RHEA-070
**Status:** Not started

**Description**
Encrypt the `PartnerProjection` under `K_pair` and publish it as a `SyncRecord`
(scope `projection`, logical key `projection:current`, §0.10 E) with a
TTL/staleness stamp.

**Files**
- `src/data/repositories/ProjectionRepository.ts`, `src/privacy/consumers/ProjectionPublisher.ts` — new.

**Acceptance Criteria**
- [ ] Projection is encrypted under `K_pair` and written to `partner_projections`.
- [ ] Logical key is the constant `projection:current`; tombstone supported.

---

### RHEA-088 · Wire the four recompute-and-republish triggers

**Milestone:** M2.8 · **Labels:** `phase-2` `privacy` · **Priority:** P0 · **Difficulty:** M · **Depends on:** RHEA-087, RHEA-084
**Status:** Not started

**Description**
Drive republish on the four triggers (log edit, settings/gate change, pairing
change, quiet-window change — Chapter 4 §5), with echo suppression.

**Files**
- `src/privacy/PrivacyEngine.ts` — edit.

**Acceptance Criteria**
- [ ] Each trigger republishes exactly once (no echo loop).
- [ ] Disabling all gates tombstones the projection.

---

### RHEA-089 · Projection scope in `SupabaseTransport` + partner RLS tests

**Milestone:** M2.8 · **Labels:** `phase-2` `sync` `rls` `test` · **Priority:** P0 · **Difficulty:** S · **Depends on:** RHEA-087, RHEA-052
**Status:** Not started

**Description**
Teach the transport the projection scope and prove the RLS matrix.

**Files**
- `src/sync/transports/SupabaseTransport.ts` — edit. `tests/integration/rls/partner.spec.ts` — new.

**Acceptance Criteria**
- [ ] Paired partner reads the projection; unlinked users are denied.
- [ ] Owner writes only their own projection row.

---

### RHEA-090 · Enable projection publish behind `flags.projectionPublish`

**Milestone:** M2.8 · **Labels:** `phase-2` `privacy` `flag` · **Priority:** P0 · **Difficulty:** XS · **Depends on:** RHEA-089
**Status:** Not started

**Description**
Ship publishing dark, validate, then flip on. The legacy plaintext partner-read
path remains until M2.13.

**Files**
- `src/app/lib/flags.ts` — edit.

**Acceptance Criteria**
- [ ] Flag off → no projection writes; flag on → projections flow.
- [ ] Rollback via flag verified.

---

### M2.9 — Partner consumes projection + purge

### RHEA-091 · `useProjection` — subscribe, decrypt, re-derive

**Milestone:** M2.9 · **Labels:** `phase-2` `privacy` `crypto` · **Priority:** P0 · **Difficulty:** M · **Depends on:** RHEA-089, RHEA-024
**Status:** Not started

**Description**
On the partner side, subscribe to `partner_projections`, decrypt under `K_pair`,
and re-derive phase/predictions via `domain/cycle.ts` from the anchors.

**Files**
- `src/app/hooks/useProjection.ts` — new.

**Acceptance Criteria**
- [ ] Partner re-derivation matches the owner's own view for enabled gates.
- [ ] Partial-anchor cases render per §0.10 M (missing input → omit that element).

---

### RHEA-092 · Switch `PartnerView` to the projection source

**Milestone:** M2.9 · **Labels:** `phase-2` `privacy` `ui` `flag` · **Priority:** P0 · **Difficulty:** M · **Depends on:** RHEA-091
**Status:** Not started

**Description**
Consume the decrypted projection in `PartnerView`, dual-source during canary
(projection if present, else legacy), gated by `flags.partnerProjection`.

**Files**
- `src/app/views/partner/PartnerView.tsx` — edit. `di/` — edit.

**Acceptance Criteria**
- [ ] Flag off → legacy view; flag on → E2EE projection view.
- [ ] Unknown projection `version` falls back to last-good cache (Chapter 7 axis 5).

---

### RHEA-093 · One-time partner plaintext-cache purge (TM-R2)

**Milestone:** M2.9 · **Labels:** `phase-2` `privacy` `storage` · **Priority:** P0 · **Difficulty:** S · **Depends on:** RHEA-092
**Status:** Not started

**Description**
Purge any stale plaintext partner cache once, idempotently, as the projection
path goes live.

**Files**
- `src/data/migrations/indexeddb/` purge step — new.

**Acceptance Criteria**
- [ ] Purge runs once and is idempotent.
- [ ] No plaintext owner-derived data remains in the partner store afterward.

---

### RHEA-094 · Flip `flags.partnerProjection` on + E2E

**Milestone:** M2.9 · **Labels:** `phase-2` `privacy` `flag` `test` · **Priority:** P0 · **Difficulty:** S · **Depends on:** RHEA-093
**Status:** Not started

**Description**
Enable the E2EE partner experience for the base and cover it end-to-end.

**Files**
- `src/app/lib/flags.ts` — edit. `tests/e2e/sharing.spec.ts` — new.

**Acceptance Criteria**
- [ ] Owner change → partner sees the re-derived update sub-second.
- [ ] Rollback via flag verified; no partner error spike.

---

### M2.10 — E2EE shared notes

### RHEA-095 · Migration 0007 — `shared_notes` ciphertext table

**Milestone:** M2.10 · **Labels:** `phase-2` `migration` `rls` · **Priority:** P1 · **Difficulty:** S · **Depends on:** RHEA-051
**Status:** Not started

**Description**
Add the two-way `shared_notes` table (ciphertext under `K_pair`) with pair-scoped
RLS. **Security review (RLS).**

**Files**
- `supabase/migrations/0007_shared_notes.sql` — new.

**Acceptance Criteria**
- [ ] Both members of the pair may read/write; others denied.
- [ ] Ciphertext only; additive.
- [ ] Security sign-off recorded.

---

### RHEA-096 · `NoteRepository` + `NotesGateway` (two-way `K_pair`)

**Milestone:** M2.10 · **Labels:** `phase-2` `privacy` `crypto` `sync` · **Priority:** P1 · **Difficulty:** M · **Depends on:** RHEA-095, RHEA-075
**Status:** Not started

**Description**
Implement note CRUD as `SyncRecord`s (scope `note`) encrypted under `K_pair`,
merged with LWW like other records.

**Files**
- `src/data/repositories/NoteRepository.ts`, `src/privacy/consumers/NotesGateway.ts` — new.

**Acceptance Criteria**
- [ ] Owner↔partner note round-trip is encrypted; server holds ciphertext only.
- [ ] Concurrent edits merge deterministically (LWW).

---

### RHEA-097 · Re-enable notes UI + tests

**Milestone:** M2.10 · **Labels:** `phase-2` `ui` `privacy` `test` · **Priority:** P1 · **Difficulty:** S · **Depends on:** RHEA-096, RHEA-018
**Status:** Not started

**Description**
Replace the M0.6 "upgrading" state with the live E2EE notes UI and test the pair
round-trip.

**Files**
- `src/app/views/settings/SharingControls.tsx`, `src/app/views/partner/PartnerView.tsx` — edit. `tests/unit/privacy/notesGateway.spec.ts` — new.

**Acceptance Criteria**
- [ ] Notes send/receive across the pair; RLS restricts to the pair.
- [ ] The upgrade message is gone once enabled.

---

### RHEA-098 · Flip notes flag to E2EE-backed on

**Milestone:** M2.10 · **Labels:** `phase-2` `privacy` `flag` · **Priority:** P1 · **Difficulty:** XS · **Depends on:** RHEA-097
**Status:** Not started

**Description**
Point `flags.notesSync` at the E2EE channel and enable it, retiring the Phase-0
stopgap.

**Files**
- `src/app/lib/flags.ts` — edit.

**Acceptance Criteria**
- [ ] Notes are live and E2EE; flag off returns to the dark state with no data loss.

---

### M2.11 — Quiet windows + share gates

### RHEA-099 · Migration 0008 — `quiet_windows` + `share_gates`

**Milestone:** M2.11 · **Labels:** `phase-2` `migration` `rls` · **Priority:** P1 · **Difficulty:** S · **Depends on:** RHEA-051
**Status:** Not started

**Description**
Add the encrypted quiet-window ranges and per-share consent booleans (§0.7) with
pair-scoped RLS. **Security review (RLS).**

**Files**
- `supabase/migrations/0008_quiet_windows_share_gates.sql` — new.

**Acceptance Criteria**
- [ ] Tables exist with pair-scoped RLS; consent gates are non-health metadata.
- [ ] Security sign-off recorded.

---

### RHEA-100 · `useSharing` + `SharingControls` for gates and quiet windows

**Milestone:** M2.11 · **Labels:** `phase-2` `ui` `privacy` · **Priority:** P1 · **Difficulty:** M · **Depends on:** RHEA-099
**Status:** Not started

**Description**
Let the owner toggle per-share gates and set quiet windows.

**Files**
- `src/app/hooks/useSharing.ts` — new. `src/app/views/settings/SharingControls.tsx` — edit.

**Acceptance Criteria**
- [ ] Toggling a gate changes which anchors are published (via the trigger).
- [ ] Quiet windows persist and are editable.

---

### RHEA-101 · Enforce gates + quiet windows in the publish triggers

**Milestone:** M2.11 · **Labels:** `phase-2` `privacy` · **Priority:** P1 · **Difficulty:** S · **Depends on:** RHEA-100, RHEA-088
**Status:** Not started

**Description**
Make `PrivacyEngine` respect gate resolution and suppress republish/notify inside
a quiet window.

**Files**
- `src/privacy/PrivacyEngine.ts`, `src/domain/privacyPolicy.ts` — edit.

**Acceptance Criteria**
- [ ] A disabled gate omits its anchors from the next projection (§0.10 M).
- [ ] In-range quiet windows suppress republish/notify.

---

### RHEA-102 · Gate/quiet-window test suite (default-deny)

**Milestone:** M2.11 · **Labels:** `phase-2` `privacy` `test` · **Priority:** P1 · **Difficulty:** S · **Depends on:** RHEA-101
**Status:** Not started

**Description**
Prove default-deny and quiet-window suppression.

**Files**
- `tests/unit/privacy/gates.spec.ts` — new.

**Acceptance Criteria**
- [ ] Unset gate → no anchor; enabling one adds exactly its anchors.
- [ ] Quiet-window range suppresses the trigger.

---

### M2.12 — Local audit + retire server audit

### RHEA-103 · `privacy/consumers/AuditLog.ts` — local append-only audit

**Milestone:** M2.12 · **Labels:** `phase-2` `privacy` · **Priority:** P1 · **Difficulty:** S · **Depends on:** RHEA-035
**Status:** Not started

**Description**
Implement the on-device append-only audit (`audit` store) for pair/unpair/export/
erase/import/share events (§0.10 I).

**Files**
- `src/privacy/consumers/AuditLog.ts` — new. `tests/unit/privacy/auditLog.spec.ts` — new.

**Acceptance Criteria**
- [ ] Every audited action appends locally; entries are immutable (no update/delete).
- [ ] Existing `quiet.added`/`quiet.removed`/share events are captured.

---

### RHEA-104 · Migrate call sites off `lib/audit.ts`

**Milestone:** M2.12 · **Labels:** `phase-2` `privacy` · **Priority:** P1 · **Difficulty:** S · **Depends on:** RHEA-103
**Status:** Not started

**Description**
Repoint all audit call sites at the local `AuditLog` and remove `lib/audit.ts`.

**Files**
- `src/app/lib/audit.ts` — remove. call sites (pairing, sharing, export, import) — edit.

**Acceptance Criteria**
- [ ] No references to `lib/audit.ts` remain.
- [ ] Audit entries appear for every prior audited action.

---

### RHEA-105 · Migration 0009 — export then drop server `audit_log`

**Milestone:** M2.12 · **Labels:** `phase-2` `migration` `security` · **Priority:** P1 · **Difficulty:** S · **Depends on:** RHEA-104
**Status:** Not started

**Description**
Export existing server audit history to a migration artifact, then drop the
server `audit_log` table (destructive; replacement shipped in RHEA-103). **Security review.**

**Files**
- `supabase/migrations/0009_retire_server_audit.sql` — new.

**Acceptance Criteria**
- [ ] Server audit history is exported before the drop.
- [ ] The app functions with no server `audit_log`.
- [ ] Security sign-off recorded.

---

### M2.13 — Remediate + revoke partner ACL (sequencing-gated)

### RHEA-106 · Precondition gate: coverage + flag saturation + purge confirmation

**Milestone:** M2.13 · **Labels:** `phase-2` `security` `privacy` · **Priority:** P0 · **Difficulty:** S · **Depends on:** RHEA-073, RHEA-094, RHEA-098
**Status:** Not started

**Description**
Codify the hard preconditions that must hold before the destructive revoke:
100% owner-ciphertext coverage, `flags.partnerProjection` on with no error spike,
and confirmed partner cache purge. Blocks the merge of RHEA-107.

**Files**
- `scripts/preconditions_m2_13.md` + a coverage/telemetry check — new. `.github/workflows/ci.yml` — edit.

**Acceptance Criteria**
- [ ] A documented, checkable gate exists and is green before RHEA-107 merges.
- [ ] Each precondition has an owner and evidence link.

---

### RHEA-107 · Migration 0010 — drop partner `daily_logs` SELECT + plaintext column

**Milestone:** M2.13 · **Labels:** `phase-2` `security` `rls` `migration` · **Priority:** P0 · **Difficulty:** S · **Depends on:** RHEA-106
**Status:** Not started

**Description**
The one intentional destructive privacy step: drop the `"partner read linked
logs"` policy (`migration.sql:56`) and the plaintext payload column now that the
projection replacement is live and caches are purged (TM-R2/TM-R3). **Security review.**

**Files**
- `supabase/migrations/0010_drop_partner_plaintext_acl.sql` — new.

**Acceptance Criteria**
- [ ] Partner can no longer `SELECT` `daily_logs` (pgTAP now expects denial).
- [ ] No plaintext payload column remains.
- [ ] Security sign-off recorded; preconditions (RHEA-106) confirmed green.

---

### RHEA-108 · Remove dual-read + legacy partner code + retire Phase-1/2 flags

**Milestone:** M2.13 · **Labels:** `phase-2` `sync` `privacy` `flag` · **Priority:** P0 · **Difficulty:** S · **Depends on:** RHEA-107
**Status:** Not started

**Description**
Delete the plaintext dual-read fallback, the legacy partner-read code path, and
the now-permanent flags (`e2eeOwner`, `partnerProjection`, `syncEngine`,
`pairingV2`).

**Files**
- `src/sync/{reconcile}.ts`, `src/sync/transports/SupabaseTransport.ts`, `src/app/views/partner/PartnerView.tsx`, `src/app/lib/flags.ts` — edit.

**Acceptance Criteria**
- [ ] No plaintext-read code path remains; suite green on ciphertext-only.
- [ ] Retired flags are removed (no dead branches).

---

### RHEA-109 · Post-migration verification: partner-denied + residual-plaintext scan

**Milestone:** M2.13 · **Labels:** `phase-2` `security` `rls` `test` · **Priority:** P0 · **Difficulty:** S · **Depends on:** RHEA-107
**Status:** Not started

**Description**
Prove the zero-knowledge end state.

**Files**
- `tests/integration/rls/partner.spec.ts` — edit. `supabase/tests/residual_plaintext.sql` — new.

**Acceptance Criteria**
- [ ] Partner `SELECT` on `daily_logs` is denied.
- [ ] A scan finds zero plaintext health data server-side.
- [ ] Owner + partner flows fully functional on ciphertext only.

---
## Phase 3 — Mobile (Capacitor)

### M3.1 — Capacitor scaffold

### RHEA-110 · Add Capacitor project (Android + iOS)

**Milestone:** M3.1 · **Labels:** `phase-3` `mobile` `capacitor` · **Priority:** P1 · **Difficulty:** M · **Depends on:** RHEA-059
**Status:** Not started

**Description**
Add the Capacitor configuration and native Android/iOS shells that load the same
web bundle.

**Files**
- `capacitor.config.ts` — new. `android/`, `ios/` — new (generated projects). `package.json` — edit (Capacitor deps).

**Acceptance Criteria**
- [ ] Native app boots and loads the bundle on device/emulator.
- [ ] Web build is unchanged.

---

### RHEA-111 · Gate SW off in webview + safe-area viewport

**Milestone:** M3.1 · **Labels:** `phase-3` `mobile` · **Priority:** P1 · **Difficulty:** S · **Depends on:** RHEA-110
**Status:** Not started

**Description**
Disable service-worker registration inside the native webview (§3) and apply the
safe-area viewport handling.

**Files**
- `src/app/main.tsx` — edit (SW gate). `index.html` — edit (safe-area meta).

**Acceptance Criteria**
- [ ] No SW registers inside the webview; SW still registers on web.
- [ ] Content respects device safe areas.

---

### RHEA-112 · CI native build + env injection

**Milestone:** M3.1 · **Labels:** `phase-3` `ci` `mobile` · **Priority:** P1 · **Difficulty:** M · **Depends on:** RHEA-110, RHEA-004
**Status:** Not started

**Description**
Add native build jobs and inject Supabase env at build time in CI.

**Files**
- `.github/workflows/ci.yml` — edit (native jobs). CI secrets wiring — new.

**Acceptance Criteria**
- [ ] CI produces Android + iOS builds.
- [ ] Env is injected at build; no secrets committed.

---

### M3.2 — `SqliteDriver` + migration

### RHEA-113 · `SqliteDriver` (SQLCipher) + `CapStorage`

**Milestone:** M3.2 · **Labels:** `phase-3` `mobile` `storage` `capacitor` · **Priority:** P1 · **Difficulty:** L · **Depends on:** RHEA-032, RHEA-110
**Status:** Not started

**Description**
Implement `StorageDriver` over `@capacitor-community/sqlite` (SQLCipher) and the
`CapStorage` platform adapter that constructs it.

**Files**
- `src/data/drivers/SqliteDriver.ts`, `src/platform/capacitor/CapStorage.ts` — new.

**Acceptance Criteria**
- [ ] Passes the driver-contract suite (RHEA-032).
- [ ] The on-disk database file is encrypted (SQLCipher verified).

---

### RHEA-114 · SQLite schema/migrations (`0001_init`)

**Milestone:** M3.2 · **Labels:** `phase-3` `mobile` `storage` `migration` · **Priority:** P1 · **Difficulty:** M · **Depends on:** RHEA-113
**Status:** Not started

**Description**
Define the SQLite DDL/`schema_version` aligned to the local `v2` shape (Chapter 6
§3) with ordered idempotent steps.

**Files**
- `src/data/migrations/sqlite/{0001_init,index}.ts` — new.

**Acceptance Criteria**
- [ ] `schema_version` compared on open, then bumped; steps are idempotent.
- [ ] Store set matches the canonical eight.

---

### RHEA-115 · IndexedDB → SQLite data migration (verify-then-swap)

**Milestone:** M3.2 · **Labels:** `phase-3` `mobile` `storage` `migration` · **Priority:** P1 · **Difficulty:** M · **Depends on:** RHEA-114
**Status:** Not started

**Description**
Copy a device's IndexedDB data into SQLite idempotently; keep IndexedDB intact
until the SQLite copy is verified.

**Files**
- `src/data/migrations/` bridge — new.

**Acceptance Criteria**
- [ ] All stores migrate; re-run is a no-op.
- [ ] IndexedDB is retained until verification passes (lossless rollback).

---

### RHEA-116 · SQLite driver-contract + migration tests

**Milestone:** M3.2 · **Labels:** `phase-3` `mobile` `storage` `test` · **Priority:** P1 · **Difficulty:** S · **Depends on:** RHEA-115
**Status:** Not started

**Description**
Run the shared contract suite against `SqliteDriver` and test the migration.

**Files**
- `tests/integration/sqlite/migration.spec.ts` — new.

**Acceptance Criteria**
- [ ] Contract suite green on `SqliteDriver`.
- [ ] Migration preserves all data and is idempotent.

---

### M3.3 — Hardware SecureStore + re-key

### RHEA-117 · `CapSecureStore` (Keystore / Keychain + Secure Enclave, biometric)

**Milestone:** M3.3 · **Labels:** `phase-3` `mobile` `crypto` `capacitor` · **Priority:** P1 · **Difficulty:** L · **Depends on:** RHEA-113, RHEA-063
**Status:** Not started

**Description**
Implement hardware-backed key custody with biometric gating on Android Keystore
and iOS Keychain + Secure Enclave. **Security review.**

**Files**
- `src/platform/capacitor/CapSecureStore.ts` — new. `di/` — edit (select on native).

**Acceptance Criteria**
- [ ] `wrap`/`unwrap` route through hardware; `custody` reports `keystore`/`secure-enclave`.
- [ ] Unwrap is biometric-gated; `supportsHardwareBacking()` is accurate.
- [ ] Security sign-off recorded.

---

### RHEA-118 · Software → hardware key re-key migration

**Milestone:** M3.3 · **Labels:** `phase-3` `mobile` `crypto` · **Priority:** P1 · **Difficulty:** M · **Depends on:** RHEA-117, RHEA-067
**Status:** Not started

**Description**
Re-key Phase-2 software-custody keys into hardware backing, verify-then-remove the
software copy; the recovery phrase is the backstop. **Security review.**

**Files**
- re-key migration step — new.

**Acceptance Criteria**
- [ ] Every key migrates to hardware; old copy removed only after verification.
- [ ] Recovery restores keys if hardware is wiped.
- [ ] Security sign-off recorded.

---

### RHEA-119 · Hardware-custody test suite

**Milestone:** M3.3 · **Labels:** `phase-3` `mobile` `crypto` `test` · **Priority:** P1 · **Difficulty:** S · **Depends on:** RHEA-118
**Status:** Not started

**Description**
Cover the biometric gate, re-key, and recovery fallback on device/emulator.

**Files**
- `tests/e2e/mobile/secure-store.spec.ts` — new.

**Acceptance Criteria**
- [ ] Biometric prompt gates unwrap; cancel path handled.
- [ ] Re-key + recovery paths verified.

---

### M3.4 — Native export

### RHEA-120 · `CapFilesystem` — Filesystem + Share

**Milestone:** M3.4 · **Labels:** `phase-3` `mobile` `capacitor` · **Priority:** P2 · **Difficulty:** S · **Depends on:** RHEA-110, RHEA-042
**Status:** Not started

**Description**
Implement the `Filesystem` seam natively via Capacitor Filesystem + Share sheet.

**Files**
- `src/platform/capacitor/CapFilesystem.ts` — new.

**Acceptance Criteria**
- [ ] Native export writes a valid v2 file and opens the Share sheet.
- [ ] Web `Blob` download is unaffected.

---

### RHEA-121 · Wire native export + test

**Milestone:** M3.4 · **Labels:** `phase-3` `mobile` `test` · **Priority:** P2 · **Difficulty:** XS · **Depends on:** RHEA-120
**Status:** Not started

**Description**
Route the export UI through the seam and smoke-test on native.

**Files**
- `src/app/views/settings/SourcesView.tsx` — edit. `tests/e2e/mobile/export.spec.ts` — new.

**Acceptance Criteria**
- [ ] Export from native produces an importable v2 file.
- [ ] Web export path unchanged.

---

### M3.5 — Local notifications + app-lock

### RHEA-122 · `CapNotifications` — local-only, content-free reminders

**Milestone:** M3.5 · **Labels:** `phase-3` `mobile` `privacy` `capacitor` · **Priority:** P2 · **Difficulty:** M · **Depends on:** RHEA-117
**Status:** Not started

**Description**
Implement the `NotificationScheduler` seam as local-only, reschedule-on-write
notifications carrying no health text (content-free wake-ups, §6.3).

**Files**
- `src/platform/capacitor/CapNotifications.ts` — new. `platform/seams/NotificationScheduler.ts` impl — edit.

**Acceptance Criteria**
- [ ] Notifications carry no health text (asserted by type + test).
- [ ] Reminders reschedule on each relevant write; web is a no-op adapter.

---

### RHEA-123 · Biometric app-lock

**Milestone:** M3.5 · **Labels:** `phase-3` `mobile` `crypto` · **Priority:** P2 · **Difficulty:** S · **Depends on:** RHEA-117
**Status:** Not started

**Description**
Gate app open behind a biometric lock using hardware custody.

**Files**
- app-lock gate — new. `di/` — edit.

**Acceptance Criteria**
- [ ] App requires biometric unlock when enabled; graceful fallback on failure.
- [ ] Disabled by default; opt-in in settings.

---

### RHEA-124 · Notifications + app-lock tests

**Milestone:** M3.5 · **Labels:** `phase-3` `mobile` `test` · **Priority:** P2 · **Difficulty:** XS · **Depends on:** RHEA-122, RHEA-123
**Status:** Not started

**Description**
Cover content policy and lock behavior.

**Files**
- `tests/e2e/mobile/notifications.spec.ts` — new.

**Acceptance Criteria**
- [ ] No health text ever appears in a notification payload.
- [ ] App-lock gates entry; web no-op verified.

---

### M3.6 — Store compliance & release

### RHEA-125 · Google Play Data-safety declaration

**Milestone:** M3.6 · **Labels:** `phase-3` `mobile` `docs` `privacy` · **Priority:** P2 · **Difficulty:** S · **Depends on:** RHEA-110
**Status:** Not started

**Description**
Author the Play Data-safety form derived from the actual (zero-knowledge)
practices and residual metadata (§0.6 / §10.4).

**Files**
- `docs/compliance/play-data-safety.md` + store metadata — new.

**Acceptance Criteria**
- [ ] Declaration matches shipped behavior; residual metadata disclosed accurately.
- [ ] Reviewed against the threat model.

---

### RHEA-126 · Apple privacy labels

**Milestone:** M3.6 · **Labels:** `phase-3` `mobile` `docs` `privacy` · **Priority:** P2 · **Difficulty:** S · **Depends on:** RHEA-110
**Status:** Not started

**Description**
Author the Apple privacy-nutrition labels consistent with the Play declaration.

**Files**
- `docs/compliance/apple-privacy-labels.md` + App Store metadata — new.

**Acceptance Criteria**
- [ ] Labels match shipped behavior and the Play declaration.
- [ ] Reviewed against the threat model.

---

### RHEA-127 · Release pipeline + signed builds

**Milestone:** M3.6 · **Labels:** `phase-3` `mobile` `ci` · **Priority:** P2 · **Difficulty:** M · **Depends on:** RHEA-112, RHEA-125, RHEA-126
**Status:** Not started

**Description**
Produce signed, submittable Android + iOS builds via CI.

**Files**
- release workflow + signing config — new.

**Acceptance Criteria**
- [ ] Signed builds install on device and pass pre-submission checks.
- [ ] Release is reproducible from CI.

---

## Phase 4 — Advanced (only if justified)

> These are **epics**, each seeded with one task. Promote to a full milestone
> breakdown when scheduled; do not start without the stated product/design gate.

### RHEA-128 · Doctor export (consent-gated) — epic seed

**Milestone:** M4.1 · **Labels:** `phase-4` `docs` `privacy` · **Priority:** P3 · **Difficulty:** M · **Depends on:** RHEA-045
**Status:** Not started

**Description**
Design a clinician-friendly export format and a consent flow, then implement
behind a flag. Format + consent are designed before any code.

**Files**
- `docs/design/doctor-export.md` — new (design first). `src/data/exporters/doctor.ts` — new (later).

**Acceptance Criteria**
- [ ] Format spec + consent flow reviewed before implementation.
- [ ] Export requires explicit consent; flag-gated.

---

### RHEA-129 · Multi-device key-distribution hardening — epic seed

**Milestone:** M4.2 · **Labels:** `phase-4` `crypto` · **Priority:** P3 · **Difficulty:** M · **Depends on:** RHEA-081
**Status:** Not started

**Description**
Add revocation lists and per-device DEK wrapping to strengthen M2.6. **Security review.**

**Files**
- `src/crypto/enrollment.ts`, `device_keys` usage — edit (later).

**Acceptance Criteria**
- [ ] A revoked device loses access; per-device wrapping verified.
- [ ] Security sign-off recorded.

---

### RHEA-130 · Passkeys / WebAuthn PRF custody — epic seed

**Milestone:** M4.3 · **Labels:** `phase-4` `crypto` · **Priority:** P3 · **Difficulty:** M · **Depends on:** RHEA-064
**Status:** Not started

**Description**
Offer WebAuthn PRF as an alternative key-custody path, with graceful fallback
where unsupported. **Security review.**

**Files**
- `src/platform/*/WebAuthnSecureStore.ts` — new (later).

**Acceptance Criteria**
- [ ] PRF wrap/unwrap works; recovery phrase remains available as fallback.
- [ ] Security sign-off recorded.

---

### RHEA-131 · P2P transport (research spike) — epic seed

**Milestone:** M4.4 · **Labels:** `phase-4` `sync` · **Priority:** P3 · **Difficulty:** L · **Depends on:** RHEA-046
**Status:** Not started

**Description**
Prototype a `Transport` over WebRTC/LAN and produce a go/no-go memo. Never
shipped by default; behind a flag.

**Files**
- `src/sync/transports/` prototype — new (later). `docs/design/p2p-transport-memo.md` — new.

**Acceptance Criteria**
- [ ] Prototype satisfies the `Transport` seam contract in a test harness.
- [ ] A go/no-go memo with security analysis is delivered.

---

### RHEA-132 · On-device ML / anonymized research export — epic seed

**Milestone:** M4.5 · **Labels:** `phase-4` `privacy` `docs` · **Priority:** P3 · **Difficulty:** L · **Depends on:** RHEA-073
**Status:** Not started

**Description**
Design an on-device prediction tier and/or a research export with a real
anonymization + re-identification threat model. **Design memo before any code.**

**Files**
- `docs/design/research-export-anonymization.md` — new (design first).

**Acceptance Criteria**
- [ ] Anonymization design + re-identification analysis reviewed before implementation.
- [ ] No data leaves the device without the reviewed design.

---

*End of backlog. 132 tasks across 40 milestones. Phases 0–1 (RHEA-001 …
RHEA-059) are complete as of v0.2.0 — see
[IMPLEMENTATION_JOURNAL.md](IMPLEMENTATION_JOURNAL.md) and
[IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md). Work continues with the
Phase-2 P0 critical path (see header), starting at RHEA-060.*
