# Rhea v2 — Implementation Report (Phase 0)

> 🕰️ **Historical snapshot (frozen at 2026-07-15).** Superseded by later work merged to `main` and deployed; for current state see the root `README.md` and [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md).

> Status of the transformation toward the Rhea v2 architecture. This session
> completed **Phase 0 (Stabilize & de-risk)** end-to-end and verified it against a
> real toolchain. Phases 1–4 are deferred at the plan's own decision gate (see
> §11). **No git commits were created; no remote was pushed.**

---

## 1. Executive summary

Phase 0 of [V2_IMPLEMENTATION_PLAN.md](V2_IMPLEMENTATION_PLAN.md) is complete:
milestones **M0.1–M0.6** (tasks **RHEA-001…RHEA-018**). The repository now has a
working, green quality gate (TypeScript strict typecheck, Vitest, ESLint with a
layer-boundary scaffold, and a GitHub Actions CI pipeline), a characterization
safety net that locks the current cycle/phase behavior before any refactor, the
acute pairing-hijack security hole closed, account-scoped local storage with a
one-time legacy copy-forward, a hard "partner never writes" guard, a partner
cache wipe on sign-out, corrected (previously inaccurate) privacy copy backed by
a CI guard, and plaintext shared-notes sync disabled behind a feature flag until
the end-to-end-encrypted channel ships.

**Verification:** `npm run typecheck` ✓, `npm run lint` ✓ (0 errors), `npm test`
✓ (**36 tests, 6 files**), `npm run build` ✓. Every behavior-changing change is
either flag-gated or covered by a test, and `main` remains shippable.

One honest caveat: the environment has **no Postgres/Supabase or `supabase` CLI**,
so the M0.3 SQL migrations and pgTAP tests were **authored but not executed** here
(the client-side change was verified). Per RISK_REGISTER **R-PRIV-5/R-PAIR-3**,
run them against a real database before deploying `0002` (see §10).

Per the Architecture Critique's top recommendation and **R-PROJ-1**, Phase 0
delivers the bulk of the near-term privacy outcome for ~1 week of effort, and the
Phase 0/1 boundary is a deliberate decision gate. Work stopped here at a clean,
verified state rather than starting the multi-month Phase-1+ rewrite half-way.

## 2. Completed milestones

| Milestone | Title | Status |
|---|---|---|
| — | Workspace Node runtime + dependency install | ✓ done |
| **M0.1** | Toolchain & CI gate (Vitest, ESLint, `tsc`→build, GitHub Actions) | ✓ verified |
| **M0.2** | Characterization tests for cycle/phase logic | ✓ verified |
| **M0.3** | Supabase CLI + secure invite-redemption hotfix | ◑ client verified; SQL authored, not executed here |
| **M0.4** | Account-scoped local DB + partner-never-writes + wipe-on-unpair | ✓ verified |
| **M0.5** | Correct inaccurate privacy copy | ✓ verified |
| **M0.6** | Disable plaintext notes sync (flag-gated) | ✓ verified |

## 3. Completed tasks

- **M0.1:** RHEA-001 (Vitest + `@` alias + setup + smoke test), RHEA-002 (ESLint
  flat config + `import/no-restricted-paths` scaffold), RHEA-003 (`typecheck`
  script + `tsc --noEmit` wired into `build`; **fixed the 4 pre-existing type
  errors**), RHEA-004 (CI workflow: typecheck/test/lint/build).
- **M0.2:** RHEA-005 (deterministic fixtures), RHEA-006 (golden-master spec — 23
  cases incl. regular/irregular/single/empty histories, phase boundaries,
  fertile-window/predictions, and DST-boundary date round-trips).
- **M0.3:** RHEA-007 (Supabase CLI `config.toml` + `0001_baseline.sql`),
  RHEA-008 (drop `"anyone read unused invites"` + tighten invite RLS), RHEA-009
  (atomic, TTL'd, single-use `redeem_invite()` + hash-at-rest `create_invite()`),
  RHEA-010 (client → RPC, case-sensitive secret) **[verified]**, RHEA-011 (pgTAP)
  — SQL authored; execution pending a database (§10).
- **M0.4:** RHEA-012 (`rhea-<uid>` / `rhea-local` scoping + open-by-uid),
  RHEA-013 (idempotent one-time legacy `rhea` copy-forward), RHEA-014
  (partner-never-writes guard), RHEA-015 (`wipeLocalData` + partner wipe on
  sign-out).
- **M0.5:** RHEA-016 (corrected the false E2EE/"wipes their copy"/erase claims +
  forbidden-claim CI guard test).
- **M0.6:** RHEA-017 (`flags.ts` + gated note egress in `sharing.ts`), RHEA-018
  (partner "notes upgrading to E2EE" state; realtime notes subscription gated).

## 4. Files modified

- `package.json`, `package-lock.json` — scripts (`typecheck`/`lint`/`test*`;
  `build` now runs `tsc --noEmit && vite build`) + dev dependencies.
- `.gitignore` — ignore `coverage/`.
- `src/lib/db.ts` — account-scoped DB, legacy copy-forward, `setAccount`/
  `closeDB`/`wipeLocalData` (all prior exports preserved).
- `src/lib/sync.ts` — `setSyncReadOnly`/`isSyncReadOnly` + push guards; fixed the
  loose `FlowLevel` assignment.
- `src/lib/pairing.ts` — `create_invite`/`redeem_invite` RPC flow.
- `src/lib/sharing.ts` — flag-gated `getSharedNotes`/`sendSharedNote`.
- `src/hooks/useAuth.ts` — wire account scope + read-only role + partner
  sign-out wipe.
- `src/views/auth/AuthScreen.tsx`, `src/views/settings/PrivacyPolicy.tsx` —
  corrected privacy copy.
- `src/views/partner/PartnerView.tsx` — notes flag gate + upgrade message; fixed
  the possibly-null `supabase` narrowing.

## 5. Newly created files

- **Tooling:** `vitest.config.ts`, `eslint.config.js`, `.github/workflows/ci.yml`,
  `src/vite-env.d.ts`, `src/lib/flags.ts`.
- **Tests:** `tests/setup.ts`, `tests/smoke.spec.ts`, `tests/fixtures/logs.ts`,
  `tests/unit/domain/cycle.characterization.spec.ts` (+ `__snapshots__/`),
  `tests/unit/data/db.account.spec.ts`, `tests/unit/sync/guard.spec.ts`,
  `tests/unit/copy.guard.spec.ts`, `tests/unit/sharing/notes.spec.ts`.
- **Supabase:** `supabase/config.toml`, `supabase/migrations/0001_baseline.sql`,
  `supabase/migrations/0002_secure_invite_redemption.sql`,
  `supabase/migrations/README.md`, `supabase/tests/rls_invite.sql`.
- **Docs:** this report.

## 6. Architectural improvements

- A real **quality gate** (typecheck + unit tests + lint + build) in CI, where
  there were none — the prerequisite the plan requires before any crypto/merge
  work (sequencing invariant b).
- **Characterization safety net**: the current cycle/phase engine's behavior is
  locked in golden-master snapshots, so the Phase-1 refactor can prove it
  preserves behavior (or change a snapshot with a documented diff).
- **Boundary-lint scaffold** (`import/no-restricted-paths`) seeded with the first
  (currently no-op) kernel→app rule, ready for Phase-1 layers.
- **Storage seam groundwork**: `db.ts` now centralizes account scoping and
  lifecycle (`setAccount`/`closeDB`), a stepping stone toward the `StorageDriver`
  seam.
- **Feature-flag module** establishing the dark-launch → flip-on → remove pattern.
- **Supabase CLI migration structure** replacing hand-run SQL scripts, with a
  documented ledger.

## 7. Security improvements

- **Closed TM-R1** (the live pairing-hijack hole): dropped `"anyone read unused
  invites"`; redemption is now an atomic (`FOR UPDATE`), TTL'd, single-use
  `SECURITY DEFINER` RPC that matches a **hashed** secret (plaintext never stored),
  with self-pair rejection. *(SQL pending execution — §10.)*
- **Partner-never-writes guard** in the sync layer — a partner client can never
  push owner data, independent of UI gating.
- Fixed a real **null-safety** gap (`supabase` possibly null in `PartnerView`) and
  a **type-looseness** bug (`FlowLevel`), plus added Vite client types.
- Redemption no longer upper-cases the (now case-sensitive) invite secret — a
  correctness fix that prevents silent redemption failures.

## 8. Privacy improvements

- **Per-account local isolation** (`rhea-<uid>` / `rhea-local`) so two accounts on
  one device never share a store; existing data is copied forward once, losslessly.
- **Partner cache wipe on sign-out** so cached owner data does not linger after a
  partner disconnects.
- **Plaintext shared-notes egress disabled** behind `flags.notesSync` until the
  E2EE channel (M2.10); local drafts unaffected; partners see a clear "upgrading"
  message.
- **Corrected inaccurate privacy copy** (removed unearned E2EE / "wipes their
  copy" / absolute-erase claims; states current reality honestly) with a **CI
  guard** that fails if a not-yet-true claim reappears.

## 9. Performance improvements

Phase 0 is not performance-focused, and runtime performance is essentially
unchanged (by design — "preserve existing functionality"). The only perf-adjacent
work: tests pin `TZ=UTC` for deterministic, fast (<0.5 s) execution. The
pre-existing recharts chunk-size build warning is unchanged and noted as debt.

## 10. Remaining technical debt

- **M0.3 SQL not executed here.** `0001`/`0002` and `rls_invite.sql` need
  `supabase db reset && supabase test db` in an environment with Postgres/Supabase;
  the behavioral pgTAP assertions (cross-account denial, atomic double-redeem) are
  sketched and must be completed against the running DB before deploying `0002`.
- **8 ESLint warnings** (pre-existing unused imports/vars in views + `cycle.ts`
  `toDateKey`). Non-blocking; safe to clean during the Phase-1 `domain/` extraction.
- **Local-only → account data-follow** is not handled: a user who accumulates data
  in `rhea-local` and later signs up does not yet have it copied into `rhea-<uid>`
  (copy-forward currently sources only the legacy `rhea` DB). Track for the sign-up
  flow.
- **Partner auto-wipe on *remote* unpair** (owner unpairs → partner's cache clears
  without the partner signing out) is deferred to Phase 2, when the partner
  consumes the encrypted projection instead of caching raw logs.
- The **recharts vendor chunk** exceeds 500 kB (pre-existing) — code-split later.
- The **Node runtime used this session is a temporary install** under the session
  scratchpad; developers/CI need Node ≥ 20 installed normally (`node_modules` is
  present in the repo, and CI uses `actions/setup-node@22`).

## 11. Deferred work

Deferred deliberately at the Phase 0/1 decision gate (Architecture Critique §2.1;
RISK_REGISTER **R-PROJ-1**), and further constrained by session scope and missing
infrastructure (no Postgres for RLS/pgTAP, no Android/iOS SDKs for Capacitor):

- **Phase 1 — Foundations:** the layered reorg (`kernel`/`domain`/`data`/`sync`),
  `SyncRecord`/envelope + HLC + LWW merge, `SyncEngine` over `NullTransport` then
  `SupabaseTransport`, phase-engine unification + single write path, export/import
  v2, and the composition root. (Weeks of work; the plan's `main`-always-green
  discipline argues against starting it partially.)
- **Phase 2 — Privacy + E2EE (critical path):** libsodium AEAD/keyring/recovery,
  QR+SAS pairing, owner-data E2EE cutover, encrypted `PartnerProjection`, E2EE
  notes, revoking the plaintext partner ACL. (Months.)
- **Phase 3 — Mobile (Capacitor)** and **Phase 4 — Advanced.**

The Critique recommends folding several Phase-1+ decisions toward simpler forms
(fewer layers, thinner transport seam, `Result` only where dual-outcome, wall-clock
vs. HLC trade-offs) — worth revisiting when those milestones are scheduled.

## 12. Suggested future enhancements

1. **Run and green the M0.3 SQL + pgTAP** in a Supabase environment; complete the
   behavioral RLS assertions; then deploy `0002` and flip pairing over.
2. **Gate review before Phase 1:** decide (per R-PROJ-1) whether to commit to the
   full v2 or to ship Phase 0 + owner-E2EE only and defer multi-device / transport
   abstraction / advanced tier.
3. When starting **Phase 1**, apply the Critique's simplifications rather than the
   maximal spec (e.g., ~4 folders + 2 boundary rules; keep `domain/` pure and
   `crypto/` isolated as the load-bearing seams).
4. Clean the 8 lint warnings and add the local-only→account data-follow during the
   `domain/`/storage extraction.
5. Ratchet coverage thresholds up on the pure `domain/` layer first (cheap, high
   value), as the plan's CI-gate schedule intends.

---

*Verified with Node 22 / npm 10 in-workspace. `npm run typecheck && npm run lint
&& npm test && npm run build` all pass. Changes are uncommitted, per instructions.*
