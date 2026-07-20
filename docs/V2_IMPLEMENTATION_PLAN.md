# Rhea v2 — Incremental Implementation Plan

> 🧊 **Planning artifact — implementation status frozen at the 2026-07-15 planning state.** The v2 branch has since merged to `main` and deployed; for current state see the root `README.md` and [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md). Migration numbers `0004`+ here predate the shipped `0004` pairing fix — the E2EE sequence has shifted to `0005`+.

> **Purpose.** Turn the design in
> [RHEA_V2_TECHNICAL_SPEC.md](RHEA_V2_TECHNICAL_SPEC.md) into a sequence of
> **small, independently-mergeable pull requests**. Every milestone below is one
> PR (occasionally two closely-coupled PRs) that (a) compiles, (b) passes CI, and
> (c) leaves `main` shippable. There is **no big-bang rewrite**: the current app
> keeps working after every merge until the exact milestone that intentionally
> changes a behavior — and those are called out, flagged, and reversible.
>
> **Companion documents.** *Why* → [Rhea_v2_Architecture_Proposal.md](Rhea_v2_Architecture_Proposal.md).
> *Compatibility critique* → [V2_ARCHITECTURE_REVIEW.md](V2_ARCHITECTURE_REVIEW.md).
> *How* (interfaces, tables, contracts) → [RHEA_V2_TECHNICAL_SPEC.md](RHEA_V2_TECHNICAL_SPEC.md).
> This document is the *in what order, and how to land it safely*. Chapter/§
> references point into the technical spec unless noted.
>
> **This is a plan. No source code is modified by this document.**

---

## 1. How to read this plan

Milestones are grouped into five phases (aligned to spec Chapter 15). Each
milestone has a stable id (`Mx.y`) and the eight required fields:

1. **Objective** — the one outcome that defines "done."
2. **Files affected** — new / moved / edited, using the current tree and the
   spec's target tree (Chapter 2).
3. **Estimated complexity** — effort, not risk: **XS** (<½ day) · **S** (½–2 days) ·
   **M** (3–5 days) · **L** (1–2 weeks) · **XL** (multi-week, expect to split).
4. **Risk** — **Low / Med / High**, with the specific failure mode.
5. **Dependencies** — milestones that must merge first.
6. **Rollback strategy** — how to revert this PR in production without data loss.
7. **Testing requirements** — the checks that gate the merge.
8. **Deliverables** — the concrete artifacts the PR adds.

### 1.1 Guiding principles (apply to every milestone)

- **Additive first, destructive last.** Data and schema changes follow
  **expand → migrate → contract**: add the new shape, dual-read/dual-write across
  both shapes, backfill, verify, and only then remove the old shape in a
  *separate later* PR. No milestone both adds a new path and deletes the old one.
- **The sequencing invariant (spec Chapter 15) is law.** (a) *Never revoke a data
  path before its replacement ships and stale caches are purged.* (b) *No crypto
  or merge code ships before the Phase-0 test harness exists.* This plan makes one
  deliberate refinement to the spec's Phase-0 grouping to honor invariant (a) —
  see [§2 note on M0.3 vs M2.13](#note-partner-acl).
- **Feature flags for anything user-visible.** Behavior-changing milestones land
  **dark** behind a flag (`flags.ts`, default off), are validated, then flipped on
  in a trivial follow-up PR. Flip-on and revert are one-line changes.
- **Re-export shims keep moves cheap.** File moves (Phase 1) leave a
  re-export barrel at the old path so callers are untouched; the shim is deleted in
  the final boundary-enforcement milestone. This is what makes a 40-file
  reorganization land as many painless PRs instead of one unreviewable one.
- **Every PR is green.** `tsc --noEmit`, unit tests, lint (boundary rules), and —
  once they exist — RLS tests and build all pass before merge. CI is the gate,
  established in the very first milestone.
- **Crypto merges are gated by a human security review** (spec §5.4) in addition
  to CI, for every `crypto/**` and RLS-policy PR.

### 1.2 Complexity / risk legend used in the summary table

`Cx` = complexity, `Rk` = risk. "Feature-affecting" = intentionally changes
observable behavior (always flag-gated). "Structural" = no behavior change.

---

## 2. Milestone map

```mermaid
flowchart LR
  subgraph P0["Phase 0 · Stabilize (days–1wk)"]
    M01["M0.1 CI/test harness"]
    M02["M0.2 Characterization tests"]
    M03["M0.3 Supabase CLI + invite hotfix"]
    M04["M0.4 Account-scoped DB + guards"]
    M05["M0.5 Fix privacy copy"]
    M06["M0.6 Disable plaintext notes (flag)"]
  end
  subgraph P1["Phase 1 · Foundations (weeks)"]
    M11["M1.1 kernel/"]
    M12["M1.2 domain/ extract"]
    M13["M1.3 Unify phases + write path"]
    M14["M1.4 StorageDriver + repos"]
    M15["M1.5 SyncRecord + IDB v1→v2"]
    M16["M1.6 hlc + merge (pure)"]
    M17["M1.7 Export/import v2"]
    M18["M1.8 SyncEngine over NullTransport"]
    M19["M1.9 SupabaseTransport (owner)"]
    M110["M1.10 di/ root + boundaries"]
  end
  subgraph P2["Phase 2 · Privacy + E2EE (months, critical path)"]
    M21["M2.1 aead + sodium"]
    M22["M2.2 keyring + SecureStore"]
    M23["M2.3 Recovery phrase"]
    M24["M2.4 Encrypt owner data"]
    M25["M2.5 QR+SAS pairing"]
    M26["M2.6 Multi-device enroll"]
    M27["M2.7 PrivacyEngine + builder"]
    M28["M2.8 ProjectionPublisher"]
    M29["M2.9 Partner consumes projection"]
    M210["M2.10 E2EE notes"]
    M211["M2.11 Quiet windows + gates"]
    M212["M2.12 Local audit + retire server audit"]
    M213["M2.13 Remediate + revoke partner ACL"]
  end
  subgraph P3["Phase 3 · Mobile (6–9 eng-wks)"]
    M31["M3.1 Capacitor scaffold"]
    M32["M3.2 SqliteDriver + IDB→SQLite"]
    M33["M3.3 Hardware SecureStore + re-key"]
    M34["M3.4 Native export"]
    M35["M3.5 Local notifications + app-lock"]
    M36["M3.6 Store compliance"]
  end
  subgraph P4["Phase 4 · Advanced (if justified)"]
    M41["M4.1 Doctor export"]
    M42["M4.2 Key-distribution hardening"]
    M43["M4.3 Passkeys / WebAuthn PRF"]
    M44["M4.4 P2P transports (spike)"]
    M45["M4.5 On-device ML / research export"]
  end
  P0 --> P1 --> P2 --> P3 --> P4
```

### 2.1 Summary table

| ID | Milestone | Cx | Rk | Kind | Depends on | Status |
|---|---|---|---|---|---|---|
| **M0.1** | Toolchain & CI gate (tsc / Vitest / ESLint / Actions) | M | Low | Structural | — | ✅ Done (v0.2.0) |
| **M0.2** | Characterization tests for current cycle/phase logic | S | Low | Structural | M0.1 | ✅ Done (v0.2.0) |
| **M0.3** | Supabase CLI + secure invite-redemption hotfix | M | **High** | Feature-affecting | M0.1 | ✅ Done (v0.2.0) |
| **M0.4** | Account-scoped local DB + partner-never-writes + wipe-on-unpair | M | Med | Feature-affecting | M0.1 | ✅ Done (v0.2.0) |
| **M0.5** | Correct inaccurate in-app privacy copy | XS | Low | Copy | — | ✅ Done (v0.2.0) |
| **M0.6** | Disable plaintext notes sync (flag-gated stopgap) | S | Med | Feature-affecting | M0.1 | ✅ Done (v0.2.0) |
| **M1.1** | Introduce `kernel/` + boundary-lint scaffold | S | Low | Structural | M0.1 | ✅ Done (v0.2.0) |
| **M1.2** | Extract `domain/` (cycle, types, phases) behind shims | M | Low | Structural | M1.1, M0.2 | ✅ Done (v0.2.0) |
| **M1.3** | Unify phase engines + single write path (tz bug fix) | M | Med | Feature-affecting | M1.2 | ✅ Done (v0.2.0) |
| **M1.4** | `StorageDriver` seam + IndexedDb/Memory drivers + repositories | L | Med | Structural | M1.1 | ✅ Done (v0.2.0) |
| **M1.5** | `SyncRecord`/envelope types + IndexedDB `v1→v2` migration | L | **High** | Structural | M1.4 | ✅ Done (v0.2.0) |
| **M1.6** | Pure `hlc.ts` + `merge.ts` (LWW, tombstone, echo) | M | Low | Structural | M1.1 | ✅ Done (v0.2.0) |
| **M1.7** | Export/import v2 (versioned + import bug fixes) | M | Med | Feature-affecting | M1.5 | ✅ Done (v0.2.0) |
| **M1.8** | `SyncEngine` + outbox + reconcile over `NullTransport` | L | Med | Structural (shadow) | M1.5, M1.6 | ✅ Done (v0.2.0) |
| **M1.9** | `SupabaseTransport` (owner scope) + cut over legacy sync | M | **High** | Feature-affecting | M1.8, M0.4 | ✅ Done (v0.2.0) |
| **M1.10** | Composition root `di/` + finalize `app/` boundaries | M | Med | Structural | M1.2–M1.9 | ✅ Done (v0.2.0) |
| **M2.1** | `crypto/sodium` + `aead` (XChaCha20-Poly1305, AAD) + KATs | M | Med | Structural | M1.1 | ⏭ Next (Phase 2) |
| **M2.2** | `keyring` + DEK custody + `SecureStore` seam (web) | M | **High** | Structural | M2.1 | ⏭ Next (Phase 2) |
| **M2.3** | Recovery phrase (BIP39 → Argon2id KEK → wrap DEK) + UI | M | **High** | Feature-affecting | M2.2 | ⏭ Next (Phase 2) |
| **M2.4** | Encrypt owner data at rest + in transit (E2EE cutover) | L | **High** | Feature-affecting | M2.2, M2.3, M1.9 | ⏭ Next (Phase 2) |
| **M2.5** | QR + SAS pairing (X25519, `K_pair`) replacing invite codes | L | **High** | Feature-affecting | M2.2, M0.3 | ⏭ Next (Phase 2) |
| **M2.6** | Multi-device DEK enrollment | M | **High** | Feature-affecting | M2.5, M2.3 | ⏭ Next (Phase 2) |
| **M2.7** | `PrivacyEngine` + `projectionBuilder` + `privacyPolicy` (pure) | M | Med | Structural | M1.2, M2.1 | ⏭ Next (Phase 2) |
| **M2.8** | `ProjectionPublisher` + `partner_projections` + triggers | L | **High** | Feature-affecting | M2.7, M2.5, M2.4 | ⏭ Next (Phase 2) |
| **M2.9** | Partner view consumes E2EE projection + cache purge | M | **High** | Feature-affecting | M2.8 | ⏭ Next (Phase 2) |
| **M2.10** | E2EE shared notes (`NotesGateway`, `shared_notes`) | M | Med | Feature-affecting | M2.5, M2.4 | ⏭ Next (Phase 2) |
| **M2.11** | Quiet windows + share gates under projection model | M | Med | Feature-affecting | M2.8 | ⏭ Next (Phase 2) |
| **M2.12** | Local `AuditLog` + retire server `audit_log` | S | Med | Feature-affecting | M1.4 | ⏭ Next (Phase 2) |
| **M2.13** | Remediate historical plaintext + revoke partner ACL | M | **High** | Destructive (gated) | M2.4, M2.9, M2.10 | ⏭ Next (Phase 2) |
| **M3.1** | Capacitor scaffold + webview SW/viewport/env gating | M | Med | Structural | M1.10 | ⏳ Pending |
| **M3.2** | `SqliteDriver` (SQLCipher) + IndexedDB → SQLite migration | L | **High** | Feature-affecting | M3.1, M1.4 | ⏳ Pending |
| **M3.3** | Hardware-backed `CapSecureStore` + key re-key | L | **High** | Feature-affecting | M3.2, M2.2, M2.3 | ⏳ Pending |
| **M3.4** | Native export (Filesystem + Share) | S | Low | Feature-affecting | M3.1, M1.7 | ⏳ Pending |
| **M3.5** | Local-only notifications + biometric app-lock | M | Med | Feature-affecting | M3.3 | ⏳ Pending |
| **M3.6** | Store compliance (Play Data-safety, Apple labels) + release | M | Med | Process | M3.1–M3.5 | ⏳ Pending |
| **M4.1** | Doctor export (consent-gated) | M | Med | Feature | M1.7 | ⏳ Pending |
| **M4.2** | Multi-device key-distribution hardening | M | High | Feature | M2.6 | ⏳ Pending |
| **M4.3** | Passkeys / WebAuthn PRF key custody | M | High | Feature | M2.2 | ⏳ Pending |
| **M4.4** | P2P transports (research spike) | L | High | Research | M1.8 | ⏳ Pending |
| **M4.5** | On-device ML / anonymized research export | XL | High | Research | M2.4 | ⏳ Pending |

> **Status note (2026-07-15, v0.2.0).** Phase 0 (M0.1–M0.6) and Phase 1
> (M1.1–M1.10) are fully implemented. M1.6 was implemented *before* M1.5 — its
> declared dependency (M1.1 only) allowed this reorder. Phase 2 (E2EE) starts
> now. See "Deviations from plan (as implemented)" at the end of §4.

### 2.2 Server migration ledger

One migration file per PR that needs a schema change; all are **additive** except
the two marked *destructive*, which run only after their replacement has shipped
and caches are purged (invariant a). This renumbers the spec's illustrative folder
(`0002_hotfix…`, `0003_ciphertext…`) so that each destructive step is its own
reversible PR.

| Migration file | Milestone | Type | Summary |
|---|---|---|---|
| `0001_baseline.sql` | M0.3 | baseline | Reconcile existing `migration*.sql` into a CLI baseline; no schema change. |
| `0002_secure_invite_redemption.sql` | M0.3 | **destructive (policy) + additive** | DROP `"anyone read unused invites"`; add `redeem_invite()` `SECURITY DEFINER` RPC (`FOR UPDATE`, TTL, revocable, BLAKE2b-hashed secret — §0.10 J); tighten `invites` RLS. Replacement (the RPC) ships in the *same* PR, so invariant (a) holds. |
| `0003_owner_sync_metadata.sql` | M1.9 | additive | Add `updated_hlc text` (HLC; the name `updated_at` was taken by a legacy `timestamptz`), `device_id text`, `deleted bool`, `server_updated_at timestamptz` (trigger-set — §0.10 C) + keyset index `(owner_id, server_updated_at, date)` to `daily_logs`; stale-write guard trigger silently skips (`RETURN NULL`) writes with `updated_hlc <=` stored, so batch upserts survive. Old clients ignore new columns. **Authored, NOT yet applied.** |
| `0004_daily_logs_ciphertext.sql` | M2.4 | additive (expand) | Add `payload bytea` (ciphertext) alongside the existing plaintext column; PK becomes `(owner_id, scope, key)` (§0.10 D). Plaintext column dropped later in M2.13. |
| `0005_pairing_v2_tables.sql` | M2.5 | additive | `device_keys`, `pairing_sessions` (§0.7). |
| `0006_partner_projections.sql` | M2.8 | additive | `partner_projections` (PK `link_id`, ciphertext, `server_updated_at`). |
| `0007_shared_notes.sql` | M2.10 | additive | `shared_notes` ciphertext table (`K_pair`). |
| `0008_quiet_windows_share_gates.sql` | M2.11 | additive | `quiet_windows`, `share_gates`. |
| `0009_retire_server_audit.sql` | M2.12 | **destructive** | Drop server `audit_log` (after local `AuditLog` ships in same milestone). |
| `0010_drop_partner_plaintext_acl.sql` | M2.13 | **destructive** | DROP `"partner read linked logs"` on `daily_logs` + drop the plaintext payload column. **Gated** on M2.9 (projection replacement live) + partner cache purge. |

<a name="note-partner-acl"></a>
> **Refinement to spec Chapter 15, Phase 0.** The spec's Phase-0 step 1 drops
> *both* the invite-hijack policy **and** the partner `daily_logs` SELECT policy.
> Dropping the latter before the E2EE `PartnerProjection` replacement (M2.8/M2.9)
> exists would violate the spec's own sequencing invariant (a) and would break the
> shipping partner view with no replacement. This plan therefore keeps the two
> concerns in separate milestones: the **acute, no-replacement** invite-redemption
> fix lands in **M0.3** (immediately), while the **partner-plaintext ACL** — which
> *does* have a replacement — is revoked in **M2.13**, only after the projection
> path is live and partner caches are purged. In the interim, M0.4/M0.6 shrink the
> partner blast radius (partner never writes, notes sync disabled, per-account DB,
> wipe-on-unpair) without breaking the read path. This is a strictly safer
> sequencing of the same end state.

---

## 3. Phase 0 — Stabilize & de-risk (days → 1 week)

Goal: stand up the safety net the rest of the plan depends on, close the one
acute security hole, and shrink the privacy blast radius — all without a rewrite.
Delivers the bulk of the near-term privacy improvement at a fraction of the cost.

### M0.1 — Toolchain & CI gate

- **Objective.** Every future PR is gated by type-checking, unit tests, lint, and
  build in CI. No runtime behavior change.
- **Files affected.** *New:* `vitest.config.ts` (with `@ → src` alias, jsdom+node
  envs, coverage thresholds), `eslint.config.js` (flat config; `import/no-restricted-paths`
  present but scoped to nothing yet), `.github/workflows/ci.yml`, `tests/setup.ts`.
  *Edited:* `package.json` (add `test`, `test:watch`, `lint`, `typecheck` scripts;
  wire `tsc --noEmit` into `build`; add dev deps: `vitest`, `@vitest/coverage-v8`,
  `eslint` + import plugin, `jsdom`, `fake-indexeddb`); `tsconfig.json` (confirm
  `strict`, `noEmit` path).
- **Estimated complexity.** M.
- **Risk.** Low functionally. The one hazard: `tsc --noEmit` may surface latent
  type errors in current code. Mitigation: land `typecheck` as a **non-blocking**
  CI job in this PR; fix errors in a fast follow-up, then flip it blocking. Do not
  hold this PR on pre-existing errors.
- **Dependencies.** None (first PR).
- **Rollback.** Delete the workflow file / revert `package.json` scripts; pure
  tooling, no data or runtime impact.
- **Testing requirements.** CI must run green on an empty test suite; one trivial
  smoke test (`expect(true)`) proves the runner and `@` alias resolve.
- **Deliverables.** Working `npm test` / `npm run lint` / `npm run typecheck`; CI
  pipeline; coverage reporting (thresholds start at 0, ratcheted per milestone).

### M0.2 — Characterization tests for current cycle/phase logic

- **Objective.** Lock the *current observable behavior* of prediction/phase math
  so the Phase-1 refactor provably preserves it.
- **Files affected.** *New:* `tests/unit/domain/cycle.characterization.spec.ts`,
  `tests/fixtures/logs.ts`. *Read-only:* `src/lib/cycle.ts` (370 L),
  `src/lib/phases.ts` (158 L), `src/lib/constants.ts`.
- **Estimated complexity.** S.
- **Risk.** Low. Snapshot may encode existing bugs (e.g., the timezone key bug) —
  that is intended; M1.3 changes the snapshot deliberately with a documented diff.
- **Dependencies.** M0.1.
- **Rollback.** Delete test files.
- **Testing requirements.** Tests pass against current code; cover ≥1 full cycle,
  irregular cycles, empty history, and a DST/timezone date.
- **Deliverables.** A golden-master suite for `cycle`/`phases` that Phase 1 must
  keep green (or intentionally update with justification).

### M0.3 — Supabase CLI + secure invite-redemption hotfix

- **Objective.** Close **TM-R1** (the live pairing-hijack hole): anyone could read
  and redeem an unused invite. Make redemption atomic, TTL'd, revocable, and
  owner-scoped, and adopt the Supabase CLI so all future schema is versioned.
- **Files affected.** *New:* `supabase/config.toml`,
  `supabase/migrations/0001_baseline.sql`,
  `supabase/migrations/0002_secure_invite_redemption.sql`,
  `supabase/tests/rls_invite.sql` (pgTAP). *Edited:* `src/lib/pairing.ts`
  (`redeemInviteCode` at [pairing.ts:24](../src/lib/pairing.ts#L24) → call the RPC;
  `createInviteCode` at :5 → store hashed secret + TTL). *Removed from active
  schema:* policy `"anyone read unused invites"`
  ([migration.sql:84](../supabase/migration.sql#L84)).
- **Estimated complexity.** M.
- **Risk.** **High** — touches live pairing. A wrong RLS/RPC change can break
  pairing for all users or, worse, silently keep the hole open. Mitigation:
  pgTAP test proves an unlinked user cannot select or redeem another's invite;
  staged rollout on a preview project first.
- **Dependencies.** M0.1 (CI to run pgTAP).
- **Rollback.** Migrations are forward-only in production, but `0002` is written
  with a documented inverse (re-create the old policy) kept in the PR description;
  the client keeps a capability check so an old client still works against the new
  RPC. Prefer *fixing forward* over restoring the hole.
- **Testing requirements.** pgTAP: owner can create/redeem own invite; unlinked
  user cannot read/redeem; expired/used/revoked invite rejected; concurrent
  double-redeem yields exactly one link (`FOR UPDATE`). Client integration test
  against local Supabase.
- **Deliverables.** Supabase CLI project; baseline + hotfix migrations; atomic
  `redeem_invite()` RPC; the acute hole closed and regression-tested.

### M0.4 — Account-scoped local DB + partner-never-writes guard + wipe-on-unpair

- **Objective.** Prevent cross-account local data bleed and stop the partner
  client from ever writing owner data; guarantee partner data is wiped on unpair.
- **Files affected.** *Edited:* `src/lib/db.ts` (DB name `"rhea"` →
  `"rhea-<uid>"`, [db.ts:3](../src/lib/db.ts#L3); add a one-time copy of a legacy
  `"rhea"` DB into the scoped DB on first run); `src/lib/sync.ts` (guard: partner
  role never calls `pushLog`/`pushAllLogs`, [sync.ts:8](../src/lib/sync.ts#L8),
  [:39](../src/lib/sync.ts#L39)); `src/lib/pairing.ts` (`unpair`
  [pairing.ts:68](../src/lib/pairing.ts#L68) → clear local partner DB);
  `src/hooks/useAuth.ts` (open DB by uid on session change).
- **Estimated complexity.** M.
- **Risk.** Med. Renaming the IndexedDB orphans the legacy `"rhea"` database.
  Mitigation: one-time idempotent copy-forward on first launch; keep the legacy DB
  read-only for one release before deleting (a later PR), so rollback is lossless.
- **Dependencies.** M0.1.
- **Rollback.** Feature-flag the DB-name switch; flipping off falls back to the
  legacy `"rhea"` DB (still present). The copy-forward is additive and idempotent.
- **Testing requirements.** Unit (fake-indexeddb): two uids get isolated stores;
  legacy-DB copy-forward runs once and is idempotent; partner role's push path is
  a no-op; `unpair` empties the partner store.
- **Deliverables.** Per-account local isolation; a hard "partner is read-only"
  client guard; verified wipe-on-unpair.

### M0.5 — Correct inaccurate in-app privacy copy

- **Objective.** Remove privacy claims the current architecture does not yet meet
  (the review flagged four false strings).
- **Files affected.** *Edited:* `src/views/settings/PrivacyPolicy.tsx`,
  `src/views/tracker/Onboarding.tsx`, `src/views/auth/AuthScreen.tsx`.
- **Estimated complexity.** XS.
- **Risk.** Low (copy only). Value: removes a compliance/trust liability now.
- **Dependencies.** None (can land in parallel with everything).
- **Rollback.** Revert the string changes.
- **Testing requirements.** Snapshot/RTL assertions on the corrected copy; a
  lightweight "no forbidden claim" test (grep for "end-to-end encrypted" etc.
  gated until the feature actually ships).
- **Deliverables.** Accurate privacy copy; a guard test that fails if a
  not-yet-true claim reappears (re-enabled per feature in Phase 2).

### M0.6 — Disable plaintext notes sync (flag-gated privacy stopgap)

- **Objective.** Stop syncing shared notes in plaintext until the E2EE notes
  channel (M2.10) exists, without deleting local notes.
- **Files affected.** *New:* `src/lib/flags.ts` (`notesSync: false`). *Edited:*
  `src/lib/sharing.ts` (171 L; gate the notes push/pull on the flag),
  `src/views/partner/PartnerView.tsx` and `SharingControls.tsx` (show a "shared
  notes are being upgraded to end-to-end encryption" state when off).
- **Estimated complexity.** S.
- **Risk.** Med — a shipping feature goes dark. Mitigation: local notes remain
  readable; the flag makes it a one-line revert; messaging sets expectations.
- **Dependencies.** M0.1.
- **Rollback.** Flip `flags.notesSync = true`.
- **Testing requirements.** With flag off, no note payload leaves the device
  (assert transport not called); local notes still render; flag on restores prior
  behavior.
- **Deliverables.** Flag module; plaintext note egress halted; re-enable path
  reserved for M2.10.

---

## 4. Phase 1 — Architectural foundations (weeks)

Goal: reshape `src/lib/*` into the layered structure (Chapters 2–3) and introduce
the sync primitives (envelope, HLC, merge, outbox, `SyncEngine`) — **without**
introducing encryption yet. Owner data still travels as it does today (plaintext
blobs on the server) but now inside the correct `SyncRecord`/outbox/merge machinery,
so Phase 2 can layer the seal in cleanly. Moves use re-export shims so no PR
touches every caller.

### M1.1 — Introduce `kernel/` + boundary-lint scaffold

- **Objective.** Add the zero-dependency leaf (`Result`, `RheaError`/`ErrorCode`,
  `Logger` with redaction, branded primitives, `assert`) that every layer may
  import, and turn on `import/no-restricted-paths` (initially constraining only
  `kernel/`).
- **Files affected.** *New:* `src/kernel/{result,errors,logger,brand,assert,index}.ts`.
  *Edited:* `eslint.config.js` (add the `kernel/` rule).
- **Estimated complexity.** S.
- **Risk.** Low. Pure addition; nothing imports it yet.
- **Dependencies.** M0.1.
- **Rollback.** Delete `kernel/`; no consumers exist.
- **Testing requirements.** Unit tests for `Result` combinators, `RheaError`
  factories/`isRetryable`, logger redaction (asserts no health field is logged).
- **Deliverables.** The kernel package + first boundary rule in CI.

### M1.2 — Extract `domain/` (cycle, types, phases) behind shims

- **Objective.** Move pure logic into `domain/` with **unchanged behavior**; leave
  re-export shims at `src/lib/cycle.ts` etc. so callers compile untouched.
- **Files affected.** *New:* `src/domain/{types,cycle,phases,index}.ts`,
  `tests/unit/domain/cycle.spec.ts`. *Moved (logic):* from
  `src/lib/cycle.ts` → `src/domain/cycle.ts`; `src/lib/phases.ts` →
  `src/domain/phases.ts`; relevant types from `src/types/index.ts` →
  `src/domain/types.ts`. *Edited (now a shim):* `src/lib/cycle.ts`,
  `src/lib/phases.ts` re-export from `domain/`.
- **Estimated complexity.** M.
- **Risk.** Low — the characterization suite (M0.2) is the safety net.
- **Dependencies.** M1.1, M0.2.
- **Rollback.** Revert; shims mean callers never changed.
- **Testing requirements.** M0.2 characterization suite passes **unchanged**;
  new `domain/cycle.spec` runs in the pure Node env (no DOM), proving purity.
- **Deliverables.** `domain/` populated; boundary rule extended to forbid
  `domain/` importing anything but `kernel/`.

### M1.3 — Unify phase engines + single write path (timezone bug fix)

- **Objective.** Collapse the three overlapping phase/day-range engines into one
  oracle in `domain/phases`, delete the `LegacyCycleEntry` bridge, and route
  `QuickAddPeriod` + Overview symptom logging through the single `useLogger` write
  path — fixing the timezone date-key bug.
- **Files affected.** *Edited:* `src/domain/phases.ts` (day-ranges derived from the
  engine, not hardcoded), `src/hooks/useLogger.ts` (47 L; sole write path),
  `src/views/tracker/QuickAddPeriod.tsx`, `src/views/tracker/OverviewTab.tsx`.
  *Removed:* `LegacyCycleEntry` bridge.
- **Estimated complexity.** M.
- **Risk.** Med — behavior change (bug fix). Mitigation: the M0.2 snapshot is
  updated in this PR with an explicit before/after diff documenting the corrected
  timezone key; add a dedicated regression test.
- **Dependencies.** M1.2.
- **Rollback.** Revert; flag the unified write path if partial exposure is needed.
- **Testing requirements.** New timezone regression test; phase parity test
  (single oracle == previous three engines except the documented fix); write-path
  test (QuickAdd + Overview both hit `useLogger`).
- **Deliverables.** One phase oracle; one write path; timezone bug fixed.

### M1.4 — `StorageDriver` seam + IndexedDb/Memory drivers + repositories

- **Objective.** Replace ad-hoc `idb` calls with the `StorageDriver` seam
  (canonical signature — §0.10 A) and thin repositories, preserving behavior.
- **Files affected.** *New:* `src/data/drivers/{StorageDriver,IndexedDbDriver,MemoryDriver}.ts`,
  `src/data/schema.ts` (store defs + `DB_VERSION`), `src/data/repositories/{LogRepository,MetaRepository,index}.ts`,
  `tests/unit/data/repositories.spec.ts`, `tests/helpers/makeContainer.ts`.
  *Edited (now shims delegating to repositories):* `src/lib/db.ts` (141 L).
- **Estimated complexity.** L.
- **Risk.** Med — all local reads/writes reroute. Mitigation: `MemoryDriver`
  enables fast unit tests; `IndexedDbDriver` wraps the *exact* current stores at
  `DB_VERSION = 1` (no schema change here — that is M1.5).
- **Dependencies.** M1.1.
- **Rollback.** Revert; `db.ts` shim restores direct access.
- **Testing requirements.** Repository unit tests on `MemoryDriver`;
  fake-indexeddb parity test that `IndexedDbDriver` reads existing `v1` data
  identically to the old `db.ts`.
- **Deliverables.** Persistence seam + two drivers + `Log`/`Meta` repositories;
  boundary rule for `data/`.

### M1.5 — `SyncRecord`/envelope types + IndexedDB `v1→v2` migration

- **Objective.** Introduce `CipherEnvelope`/`SyncRecord` (§0.2) and migrate the
  local DB to `v2`: add `updatedAt` (HLC, edit-time), `deviceId`, `deleted`, the
  `by_updatedAt` index, and the new stores (`outbox`, `keyring`, `projections`,
  `tombstones`, `sync_cursors`, `audit` — the canonical eight, §0.8). Payloads are
  **not yet encrypted** (envelope carries a pass-through payload; `alg` reserved).
- **Files affected.** *New:* `src/data/envelope.ts`,
  `src/data/migrations/indexeddb/{v1_to_v2,index}.ts`,
  `tests/integration/indexeddb/migration.spec.ts`. *Edited:* `src/data/schema.ts`
  (`DB_VERSION = 2`), repositories (stamp HLC/deviceId/deleted).
- **Estimated complexity.** L.
- **Risk.** **High** — a bad migration corrupts local user data. Mitigation: the
  `upgrade(old=1→2)` is strictly **additive** and idempotent; a failed upgrade must
  leave `v1` readable (spec Chapter 7 axis 1); epoch-0 backfill
  (`000000000000:0000:<deviceId>`, §0.5) so migrated rows never win a merge.
- **Dependencies.** M1.4.
- **Rollback.** The migration cannot be un-run in place; instead it is **forward-safe**
  (v1 data preserved). If defective, ship a corrective `v2→v2'` follow-up; never a
  downgrade. Gate exposure behind a canary.
- **Testing requirements.** fake-indexeddb migration tests: v1→v2 preserves every
  log; re-running is a no-op; interrupted upgrade leaves v1 intact; epoch-0
  timestamps applied; all eight stores exist.
- **Deliverables.** Canonical envelope/record types; safe `v1→v2` migration; the
  full local store set in place for sync.

### M1.6 — Pure `hlc.ts` + `merge.ts`

- **Objective.** Implement the Hybrid Logical Clock (`now`/`receive`/`compare`,
  §0.5, with counter-overflow carry) and the LWW-per-key merge (tombstone
  competition, echo detection, `deviceId` tiebreak) as **pure** functions.
- **Files affected.** *New:* `src/domain/hlc.ts`, `src/domain/merge.ts`,
  `tests/unit/domain/{hlc.spec,merge.spec}.ts`.
- **Estimated complexity.** M.
- **Risk.** Low to ship (pure, unused yet); high *value* — this is the correctness
  core of sync, so it is tested exhaustively before any wiring.
- **Dependencies.** M1.1.
- **Rollback.** Delete; no consumers yet.
- **Testing requirements.** Property tests: HLC monotonicity, causal order ==
  lexicographic order, counter carry at `0xffff`; merge is commutative/idempotent,
  tombstone beats stale write, echo suppressed, deterministic `deviceId` tiebreak.
- **Deliverables.** Verified HLC + merge, ready to inject into `SyncEngine`.

### M1.7 — Export/import v2 (versioned) + import bug fixes

- **Objective.** Ship `ExportData` v2 (versioned) with an importer that accepts
  `{1, 2}` via a shim, and fix the CSV/date parsing bugs the review found.
- **Files affected.** *New:* `src/data/exporter.ts`, `src/data/importer.ts`,
  `tests/unit/data/importer.spec.ts`, `tests/fixtures/` import samples.
  *Edited (now shims):* `src/lib/import.ts` (292 L). *Edited:*
  `src/views/settings/SourcesView.tsx`.
- **Estimated complexity.** M.
- **Risk.** Med — import touches user-provided data. Mitigation: v1 shim (new
  fields default `medication:[]`, `intimacy:null`); reject `version > 2` explicitly
  ("exported by a newer version").
- **Dependencies.** M1.5.
- **Rollback.** Revert; `lib/import.ts` shim restores prior parsing.
- **Testing requirements.** Round-trip export→import identity; v1-file import via
  shim; malformed CSV/date fixtures (the specific bugs) now parse correctly;
  future-version rejection.
- **Deliverables.** Versioned export/import; import bugs fixed; fixtures.

### M1.8 — `SyncEngine` + outbox + reconcile over `NullTransport`

- **Objective.** Build the orchestration (durable outbox with backoff+jitter,
  per-`(scope,peer)` cursor, `reconcile` = pull-since-cursor → merge, DELETE
  propagation) and run it over `NullTransport` (local-only, no network) — a shadow
  of production behavior with zero user-facing change.
- **Files affected.** *New:* `src/sync/{SyncEngine,outbox,reconcile,cursor,index}.ts`,
  `src/sync/transports/{Transport,NullTransport,index}.ts`,
  `src/data/repositories/OutboxRepository.ts`,
  `tests/unit/sync/{outbox,reconcile,syncEngine}.spec.ts`,
  `tests/helpers/fakeTransport.ts`, `fakeClock.ts`.
- **Estimated complexity.** L.
- **Risk.** Med — complex logic, but isolated behind `NullTransport`, so it cannot
  affect production until M1.9.
- **Dependencies.** M1.5 (records/stores), M1.6 (hlc/merge).
- **Rollback.** Revert; nothing consumes the engine in the app yet.
- **Testing requirements.** Outbox drains with backoff and survives restart;
  reconcile is idempotent and applies merge correctly; tombstone GC; echo
  suppression end-to-end against `fakeTransport`.
- **Deliverables.** Full `SyncEngine` proven against fakes; `Transport` seam.

### M1.9 — `SupabaseTransport` (owner scope) + cut over legacy sync

- **Objective.** Implement `SupabaseTransport` (push/pull ciphertext-shaped rows +
  realtime wake-up) for **owner scope only** and replace `initialSync`/`pushAllLogs`/
  `pullAllLogs` ([sync.ts:142](../src/lib/sync.ts#L142), [:8](../src/lib/sync.ts#L8),
  [:63](../src/lib/sync.ts#L63)) with the `SyncEngine`. Payloads remain plaintext
  blobs (encryption is M2.4); this milestone changes the *mechanism*, not the
  confidentiality posture.
- **Files affected.** *New:* `src/sync/transports/SupabaseTransport.ts`,
  `supabase/migrations/0003_owner_sync_metadata.sql`,
  `tests/integration/rls/owner.spec.ts`. *Edited (now shims/removed):*
  `src/lib/sync.ts` (150 L), `src/hooks/useCycleData.ts`, `src/App.tsx` (338 L;
  swap the sync bootstrap).
- **Estimated complexity.** M.
- **Risk.** **High** — the live owner-sync cutover. Mitigation: additive server
  migration (old clients keep working); ship behind `flags.syncEngine`; dual-run
  (old path + new engine in shadow) for one release, compare, then flip.
- **Dependencies.** M1.8, M0.4.
- **Rollback.** Flip `flags.syncEngine = false` → legacy `sync.ts` path (kept until
  M1.10). Server migration is additive, so no schema rollback needed.
- **Testing requirements.** Integration vs local Supabase: owner multi-device
  converges; offline edits flush on reconnect; tombstone deletes propagate; RLS
  owner-isolation test; shadow-diff shows engine == legacy result set.
- **Deliverables.** Real owner sync on the new engine; `0003` migration; legacy
  sync path retired behind a flag (deleted in M1.10).

### M1.10 — Composition root `di/` + finalize `app/` boundaries

- **Objective.** Introduce the composition root (`app/di/Container.ts`,
  `Providers.tsx`, `context.ts`), move hooks/views/components under `app/`, delete
  all Phase-1 re-export shims, and turn the full boundary matrix (§3.1) on as a
  hard CI failure.
- **Files affected.** *New:* `src/app/di/{Container,Providers,context}.ts`.
  *Moved:* `src/hooks/*` → `src/app/hooks/*`; `src/views/*` → `src/app/views/*`;
  `src/components/*` → `src/app/components/*`; `App.tsx`/`main.tsx` → `src/app/`.
  *Removed:* all `src/lib/*` shims from M1.2–M1.9. *Edited:* `eslint.config.js`
  (full `import/no-restricted-paths` matrix), `vite.config.ts`/`index.html` (entry
  path), `src/main.tsx` (SW registration gated to web — spec §3).
- **Estimated complexity.** M (mechanical but wide).
- **Risk.** Med — a large move. Mitigation: it is *only* moves + deletions of
  already-dead shims; types guarantee completeness; do it as one atomic PR so
  `main` is never half-moved.
- **Dependencies.** M1.2–M1.9 (everything they shimmed must be live).
- **Rollback.** Revert the single PR.
- **Testing requirements.** Full suite green post-move; `tsc` clean; ESLint
  boundary matrix passes (proves no illegal cross-layer imports remain); build
  succeeds; app boots.
- **Deliverables.** The Chapter 2 folder structure fully realized; Chapter 3
  boundaries CI-enforced; `src/lib/` grab-bag gone.

### 4.x Deviations from plan (as implemented)

Phase 0 and Phase 1 shipped as planned with these deviations (details in
`docs/IMPLEMENTATION_JOURNAL.md`):

- **M1.6 implemented before M1.5.** Its declared dependency (M1.1) allowed the
  reorder; no rework resulted.
- **HLC column renamed to `updated_hlc`.** `daily_logs.updated_at` already
  existed as a legacy `timestamptz`, so `0003_owner_sync_metadata.sql` adds
  `updated_hlc text` instead. The stale-write guard trigger *silently skips*
  (`RETURN NULL`) stale rows rather than erroring, so batch upserts survive.
  Migrations 0001–0003 are authored but **not yet applied** (no local Postgres).
- **Playwright/e2e deferred.** No Playwright suites and no
  `tests/integration/rls/` were built; RHEA-054 was delivered instead as pgTAP
  files (`supabase/tests/{rls_invite,rls_owner_sync}.sql`) plus fake-transport
  unit suites. The pgTAP suites are **not yet wired into CI**
  (`.github/workflows/ci.yml`).
- **Flags live state.** `notesSync: false`, `syncEngine: true`
  (`src/app/lib/flags.ts`) — the M1.9 cutover is flipped on.
- **Lint gate tightened.** `lint` runs `eslint . --max-warnings=0`.
- **Post-M1.9 fix of critique H2 (R-OFF-1), 2026-07-15.** `decideMerge`
  (`src/domain/merge.ts`) no longer drops self-authored rows before the LWW
  compare; "echo" is now only the skip-reason *label* when a self-authored row
  ties or is older than local. A strictly-newer or locally-missing self-authored
  row applies, restoring the single-device restore/rollback path. Regression
  tests in `tests/unit/domain/merge.spec.ts`, `tests/unit/sync/reconcile.spec.ts`,
  and `tests/unit/sync/syncEngine.spec.ts`. Note `SyncEngine.resync()` resets the
  cursor only; it does not clear the local scope.
- **ADRs introduced.** `docs/adr/` now records: 0001 process, 0002 layering,
  0003 HLC/LWW, 0004 StorageDriver, 0005 crypto library
  (`libsodium-wrappers-sumo` + `@scure/bip39`).

---

## 5. Phase 2 — Privacy engine & end-to-end encryption (months, critical path)

Goal: make the server zero-knowledge. Layer libsodium crypto behind the seams,
introduce the DEK / recovery / `K_pair` key hierarchy, encrypt owner data, and
replace the plaintext partner-read path with an encrypted `PartnerProjection` that
the partner re-derives locally. **Every `crypto/**` and RLS PR carries a human
security-review gate (§5.4) in addition to CI.**

### M2.1 — `crypto/sodium` + `aead` + KAT vectors

- **Objective.** libsodium `ready()` singleton and `aead.ts`
  (XChaCha20-Poly1305 `seal`/`open` producing/consuming `CipherEnvelope`, 4-field
  AAD binding — §0.3 / §0.10 G), validated against known-answer test vectors.
- **Files affected.** *New:* `src/crypto/{sodium,aead,index}.ts`,
  `tests/unit/crypto/aead.vectors.spec.ts`, `tests/fixtures/vectors/`. *Edited:*
  `package.json` (`libsodium-wrappers`), `tests/setup.ts` (await sodium ready).
- **Estimated complexity.** M.
- **Risk.** Med — crypto correctness. Mitigation: KAT vectors; AAD-mismatch →
  quarantine (never silent-accept); no custom crypto (§0.1.6). **Security-review gate.**
- **Dependencies.** M1.1.
- **Rollback.** Delete `crypto/`; no consumers yet.
- **Testing requirements.** KAT seal/open round-trips; tamper (flip a ct byte) →
  auth failure; AAD field mismatch → failure; nonce uniqueness.
- **Deliverables.** Verified AEAD primitive behind the `data/envelope` seam.

### M2.2 — `keyring` + DEK custody + `SecureStore` seam (web)

- **Objective.** Device identity keypairs (X25519/Ed25519), the per-account DEK,
  `keyId → key` resolution (grammar §0.4), and the `SecureStore` seam with
  `WebSecureStore` (wrapped/non-extractable material in IndexedDB, best-effort).
- **Files affected.** *New:* `src/crypto/keyring.ts`,
  `src/platform/seams/SecureStore.ts`, `src/platform/web/WebSecureStore.ts`,
  `tests/unit/crypto/keyring.spec.ts`. *Edited:* `src/app/di/Container.ts` (inject
  `SecureStore`), `data/repositories` (resolve keys via keyring — still unused for
  sealing until M2.4).
- **Estimated complexity.** M.
- **Risk.** **High** — key custody. A lost/overwritten DEK = unrecoverable data
  (recovery lands next, in M2.3, before encryption is *relied on* in M2.4).
  Mitigation: keyring is created but not yet the sole guardian of any data until
  M2.4; `deviceId` = 128-bit base64url (§0.10 K). **Security-review gate.**
- **Dependencies.** M2.1.
- **Rollback.** Revert; DEK not yet load-bearing.
- **Testing requirements.** Keyring generates/persists/reloads keys; `keyId`
  resolution across epochs; `WebSecureStore` wrap/unwrap round-trip; negative test
  that raw key bytes are never returned by `getAll`.
- **Deliverables.** Key hierarchy foundation + custody seam.

### M2.3 — Recovery phrase (BIP39 → Argon2id KEK → wrap DEK) + onboarding

- **Objective.** The **only** key-recovery path: a BIP39 phrase derives an
  Argon2id recovery-KEK that wraps/unwraps the DEK; ship the recovery onboarding
  and restore UI. Must land **before** encryption is relied upon (M2.4).
- **Files affected.** *New:* `src/crypto/{kdf,recovery}.ts`,
  `src/app/views/auth/{RecoveryPhraseSetup,RecoveryRestore}.tsx`,
  `tests/unit/crypto/{kdf.vectors,recovery}.spec.ts`. *Edited:* auth flow, `di/`.
- **Estimated complexity.** M.
- **Risk.** **High** — if wrap/unwrap is wrong, recovery silently fails when users
  need it most. Mitigation: KAT vectors for Argon2id params; a "verify your phrase"
  step at setup; restore tested against a wrapped-DEK fixture. **Security-review gate.**
- **Dependencies.** M2.2.
- **Rollback.** Revert; not yet load-bearing (encryption is M2.4).
- **Testing requirements.** Phrase → KEK determinism; wrap→unwrap→DEK identity;
  wrong phrase → clean failure; Argon2id params pinned by vector.
- **Deliverables.** Working recovery-phrase custody, ready to backstop M2.4.

### M2.4 — Encrypt owner data at rest + in transit (E2EE cutover)

- **Objective.** Seal owner `DailyLog`/meta payloads with the DEK before they hit
  the outbox and local store; `reconcile` opens on read. The server now holds
  **ciphertext** for owner data. Uses expand→migrate→contract on `daily_logs`.
- **Files affected.** *New:* `supabase/migrations/0004_daily_logs_ciphertext.sql`
  (add `payload bytea` alongside plaintext — expand), `src/data/migrations/indexeddb/`
  re-encrypt step. *Edited:* `LogRepository`/`MetaRepository` (seal/open via
  `aead`), `SupabaseTransport` (ciphertext + hashed record keys §0.10 H,
  length-padding §0.6), reconcile.
- **Estimated complexity.** L.
- **Risk.** **High** — the confidentiality cutover; a mistake either leaks
  plaintext or bricks reads. Mitigation: **dual-read** window (accept plaintext OR
  ciphertext), **dual-write** briefly, client re-encrypts historical rows and
  uploads ciphertext, verify 100% ciphertext coverage, *then* M2.13 drops the
  plaintext column. Recovery (M2.3) is live so no data is unrecoverable. Flag
  `flags.e2eeOwner`. **Security-review gate.**
- **Dependencies.** M2.2, M2.3, M1.9.
- **Rollback.** Flip `flags.e2eeOwner = false` → dual-read still serves plaintext;
  the plaintext column is untouched until M2.13, so rollback is lossless.
- **Testing requirements.** Round-trip encrypt→sync→decrypt across two devices;
  server row contains no plaintext (integration assertion); dual-read serves mixed
  rows; re-encryption backfill idempotent; AAD binds keyId+scope+key+updatedAt.
- **Deliverables.** Owner data E2EE end-to-end; server zero-knowledge for owner
  scope; plaintext retained only transiently for safe rollback.

### M2.5 — QR + SAS pairing (X25519, `K_pair`) replacing invite codes

- **Objective.** Replace typed-invite pairing with an X25519 QR handshake + SAS
  verification that derives `K_pair` (§0.10 L), backed by `device_keys` /
  `pairing_sessions`.
- **Files affected.** *New:* `src/crypto/pairing.ts`,
  `supabase/migrations/0005_pairing_v2_tables.sql`,
  `src/app/hooks/usePairing.ts`, `tests/unit/crypto/pairing.spec.ts`,
  `tests/integration/rls/pairing-hijack.spec.ts`. *Edited:*
  `src/app/views/settings/PairingSection.tsx`, `src/lib/pairing.ts` (retire
  invite-code redemption behind `flags.pairingV2`).
- **Estimated complexity.** L.
- **Risk.** **High** — pairing is the trust root for all sharing. Mitigation: SAS
  (short auth string, 100-bit/30-digit — §0.10) defeats MITM; ship behind
  `flags.pairingV2`; keep the M0.3 secure invite path until v2 pairing is proven.
  **Security-review gate.**
- **Dependencies.** M2.2, M0.3.
- **Rollback.** Flip `flags.pairingV2 = false` → M0.3 secure invite path.
- **Testing requirements.** Pairing derives identical `K_pair` on both sides; SAS
  mismatch aborts before key use; pgTAP proves a third party cannot hijack a
  `pairing_session`; rotation on unpair bumps `kpair` version.
- **Deliverables.** MITM-resistant pairing + `K_pair`; hijack regression test.

### M2.6 — Multi-device DEK enrollment

- **Objective.** Distribute the DEK to a second owner device via a QR + `crypto_kx`
  + SAS handshake (no plaintext key ever transits the server).
- **Files affected.** *New:* `src/crypto/enrollment.ts`,
  `src/app/views/settings/DevicesSection.tsx`,
  `tests/unit/crypto/enrollment.spec.ts`. *Edited:* `device_keys` usage, `di/`.
- **Estimated complexity.** M.
- **Risk.** **High** — mis-enrollment could expose the DEK. Mitigation: SAS-gated;
  ciphertext-only transit; flag `flags.multiDevice`. **Security-review gate.**
- **Dependencies.** M2.5, M2.3.
- **Rollback.** Flip `flags.multiDevice = false` (single-device + recovery phrase
  remains the supported multi-device story until this is proven).
- **Testing requirements.** Enrolled device decrypts owner data; SAS mismatch
  aborts; server never sees the unwrapped DEK.
- **Deliverables.** Multi-device owner support via secure enrollment.

### M2.7 — `PrivacyEngine` + `projectionBuilder` + `privacyPolicy` (pure)

- **Objective.** Build the projection pipeline logic: `domain/projectionBuilder`
  (`CycleState → PartnerProjection` as **anchors + gates + computedAt**, version 2 —
  §0.10 F), `domain/privacyPolicy` (shareable-field allowlist, gate resolution,
  quiet-window eval), and `privacy/PrivacyEngine` orchestration — **not yet
  publishing** to a transport.
- **Files affected.** *New:* `src/domain/{projectionBuilder,privacyPolicy}.ts`,
  `src/privacy/{PrivacyEngine,index}.ts`,
  `tests/unit/domain/{projectionBuilder,privacyPolicy}.spec.ts`,
  `tests/unit/privacy/privacyEngine.spec.ts`,
  `tests/unit/crypto/negative.partner-cannot-decrypt.spec.ts`.
- **Estimated complexity.** M.
- **Risk.** Med — privacy-critical logic, but pure and unwired, so fully testable
  in isolation before it can affect anyone.
- **Dependencies.** M1.2 (domain), M2.1.
- **Rollback.** Revert; nothing publishes yet.
- **Testing requirements.** Anchors emitted **only** when an enabled gate needs
  them (§0.10 M table); disabled gate → no anchor; partial-anchor re-derivation
  rules; the negative test that a partner key cannot open an owner-scope envelope.
- **Deliverables.** The privacy engine + projection builder, verified offline.

### M2.8 — `ProjectionPublisher` + `partner_projections` + recompute triggers

- **Objective.** Publish the encrypted `PartnerProjection` (under `K_pair`,
  logical key `projection:current` — §0.10 E) to `partner_projections`, driven by
  the four recompute-and-republish triggers (spec Chapter 4 §5).
- **Files affected.** *New:* `src/privacy/consumers/ProjectionPublisher.ts`,
  `src/data/repositories/ProjectionRepository.ts`,
  `supabase/migrations/0006_partner_projections.sql`,
  `tests/unit/privacy/projectionPublisher.spec.ts`,
  `tests/integration/rls/partner.spec.ts`. *Edited:* `PrivacyEngine` (wire
  triggers), `SupabaseTransport` (projection scope).
- **Estimated complexity.** L.
- **Risk.** **High** — first cross-user encrypted write; RLS must let exactly the
  paired partner read and no one else. Mitigation: pgTAP partner/unlinked matrix;
  flag `flags.projectionPublish`; additive table (no existing path touched).
  **Security-review gate.**
- **Dependencies.** M2.7, M2.5 (`K_pair`), M2.4 (owner ciphertext + crypto stack).
- **Rollback.** Flip `flags.projectionPublish = false`; the legacy plaintext
  partner-read path (M0.x-guarded) is still present, so partner view keeps working.
- **Testing requirements.** Triggers republish on log/settings/pairing/quiet
  changes; only the paired partner row is readable (RLS); TTL/staleness stamp set;
  echo not re-published.
- **Deliverables.** Encrypted projection delivery; `0006` migration.

### M2.9 — Partner view consumes E2EE projection + cache purge

- **Objective.** Switch `PartnerView` to decrypt the `PartnerProjection` and
  **re-derive** phase/predictions via `domain/cycle.ts`; perform a one-time purge
  of any stale plaintext partner cache (**TM-R2**).
- **Files affected.** *New:* `src/app/hooks/useProjection.ts`. *Edited:*
  `src/app/views/partner/PartnerView.tsx` (consume projection, re-derive),
  one-time purge migration step, `di/`.
- **Estimated complexity.** M.
- **Risk.** **High** — this is the point the partner experience flips to E2EE; a
  gap here means partner view breaks or renders stale data. Mitigation:
  version-guarded projection (falls back to last-good cache on unknown version —
  spec Chapter 7 axis 5); dual-source read (projection if present, else legacy)
  during a canary; flag `flags.partnerProjection`.
- **Dependencies.** M2.8.
- **Rollback.** Flip `flags.partnerProjection = false` → legacy partner read (still
  present until M2.13).
- **Testing requirements.** Partner re-derivation matches owner's own view for
  enabled gates; partial-anchor rendering (§0.10 M); purge runs once and is
  idempotent; unknown-version fallback.
- **Deliverables.** Partner view fully E2EE; stale plaintext caches purged.

### M2.10 — E2EE shared notes (`NotesGateway`, `shared_notes`)

- **Objective.** Re-enable shared notes (disabled in M0.6) as a two-way encrypted
  channel under `K_pair`.
- **Files affected.** *New:* `src/privacy/consumers/NotesGateway.ts`,
  `src/data/repositories/NoteRepository.ts`,
  `supabase/migrations/0007_shared_notes.sql`,
  `tests/unit/privacy/notesGateway.spec.ts`. *Edited:* `SharingControls.tsx`,
  `PartnerView.tsx`, `src/lib/flags.ts` (`notesSync` → E2EE-backed, on).
- **Estimated complexity.** M.
- **Risk.** Med — two-way write path (the one place the partner writes).
  Mitigation: `K_pair`-scoped RLS; both sides tested; additive table.
  **Security-review gate.**
- **Dependencies.** M2.5 (`K_pair`), M2.4 (crypto stack).
- **Rollback.** Flip the notes flag off → notes dark again (M0.6 state), no data
  loss (local notes retained).
- **Testing requirements.** Owner↔partner note round-trip encrypted; server holds
  ciphertext only; RLS restricts to the pair; concurrent edits merge (LWW).
- **Deliverables.** E2EE shared notes restored; `0007` migration.

### M2.11 — Quiet windows + share gates under projection model

- **Objective.** Implement quiet windows and per-share consent gates as encrypted
  `K_pair` data feeding the projection/gating (spec Chapter 4 §6).
- **Files affected.** *New:* `supabase/migrations/0008_quiet_windows_share_gates.sql`,
  `src/app/hooks/useSharing.ts`. *Edited:* `SharingControls.tsx`, `PrivacyEngine`
  (respect gates/quiet windows in trigger evaluation), `privacyPolicy`.
- **Estimated complexity.** M.
- **Risk.** Med — a gate bug could over-share. Mitigation: gate resolution is pure
  and unit-tested (M2.7); default-deny; additive tables.
- **Dependencies.** M2.8.
- **Rollback.** Flag `flags.shareGates`; off → projection uses current
  (M2.8) gating defaults.
- **Testing requirements.** Quiet window suppresses republish/notify in-range;
  disabled gate omits its anchors (verified against §0.10 M); default-deny when a
  gate is unset.
- **Deliverables.** User-controlled sharing granularity; `0008` migration.

### M2.12 — Local `AuditLog` + retire server `audit_log`

- **Objective.** Move auditing on-device (`privacy/consumers/AuditLog`, append-only
  in the `audit` store) and drop the server `audit_log` table (§0.10 I; §0.7).
- **Files affected.** *New:* `src/privacy/consumers/AuditLog.ts`,
  `supabase/migrations/0009_retire_server_audit.sql`,
  `tests/unit/privacy/auditLog.spec.ts`. *Edited (now shim/removed):*
  `src/lib/audit.ts` (48 L; delegate to local `AuditLog`), call sites
  (`quiet.added`/`quiet.removed`, share changes, pair/unpair/export/erase/import).
- **Estimated complexity.** S.
- **Risk.** Med — dropping a server table is destructive. Mitigation: local
  `AuditLog` ships in the **same** PR (replacement-before-revoke); export the
  server audit history to a migration artifact before dropping.
- **Dependencies.** M1.4 (`audit` store).
- **Rollback.** The local `AuditLog` is additive; the server drop is preceded by an
  export, so history is preserved. Re-creating the table is documented but should
  not be needed.
- **Testing requirements.** Every audited action appends locally; append-only
  (no update/delete of past entries); server table absence doesn't break the app.
- **Deliverables.** On-device audit trail; server audit surface removed.

### M2.13 — Remediate historical plaintext + revoke partner ACL (sequencing-gated)

- **Objective.** The one intentional **destructive** privacy step: after the E2EE
  projection path is live (M2.9) and partner caches are purged, re-encrypt/purge
  any residual historical plaintext and **drop the partner `daily_logs` SELECT
  policy** + the plaintext payload column (**TM-R2/TM-R3**).
- **Files affected.** *New:*
  `supabase/migrations/0010_drop_partner_plaintext_acl.sql`. *Edited:* remove the
  dual-read plaintext fallback in `SupabaseTransport`/reconcile; remove legacy
  partner-read code in `PartnerView`; remove Phase-1/2 rollback flags now that the
  new paths are permanent.
- **Estimated complexity.** M.
- **Risk.** **High** — irreversible removal of the old data path. Mitigation:
  **hard preconditions checked in CI/ops before merge** — (1) 100% of owner rows
  have ciphertext (M2.4 coverage report), (2) `flags.partnerProjection` on for the
  full user base with no error spike, (3) partner cache purge (M2.9) confirmed.
  This is the milestone the sequencing invariant exists to protect. **Security-review gate.**
- **Dependencies.** M2.4, M2.9, M2.10 (all encrypted paths live and stable).
- **Rollback.** Forward-only. Because the replacement has been live and verified,
  rollback means fixing forward, not restoring plaintext. The preceding
  precondition gates are what make this safe to merge.
- **Testing requirements.** Post-migration: partner cannot read `daily_logs`
  (pgTAP now expects denial); no plaintext column remains; owner + partner flows
  fully functional on ciphertext-only; residual-plaintext scan returns zero.
- **Deliverables.** Server is zero-knowledge end-to-end; the legacy plaintext
  partner path is gone; v2 privacy posture achieved.

---

## 6. Phase 3 — Mobile (Capacitor) (6–9 eng-weeks; Health integrations excluded)

Goal: ship native Android/iOS from the same codebase, upgrading storage and key
custody to hardware-backed primitives. Web remains the reference platform; each
milestone gates native code off inside the webview so web is never regressed.

### M3.1 — Capacitor scaffold + webview SW/viewport/env gating

- **Objective.** Add the Capacitor project (Android + iOS), disable service-worker
  registration inside the native webview, apply safe-area viewport, and inject env
  at build in CI.
- **Files affected.** *New:* `capacitor.config.ts`, `android/`, `ios/` platform
  projects, CI native build steps. *Edited:* `src/app/main.tsx` (SW gated to web —
  spec §3), `index.html` (safe-area meta), `.github/workflows/ci.yml`.
- **Estimated complexity.** M.
- **Risk.** Med — build/config only; no web behavior change if SW gate is correct.
- **Dependencies.** M1.10 (`platform/` seams + `di/` exist).
- **Rollback.** Native projects are additive; revert leaves web untouched.
- **Testing requirements.** Web build unchanged (SW still registers on web);
  native app boots and loads the bundle; no SW inside webview.
- **Deliverables.** Buildable native shells; CI native jobs.

### M3.2 — `SqliteDriver` (SQLCipher) + IndexedDB → SQLite migration

- **Objective.** Implement the `StorageDriver` over `@capacitor-community/sqlite`
  (SQLCipher) and migrate a device's IndexedDB data into SQLite idempotently.
- **Files affected.** *New:* `src/data/drivers/SqliteDriver.ts`,
  `src/platform/capacitor/CapStorage.ts`,
  `src/data/migrations/sqlite/{0001_init,index}.ts`, migration bridge.
- **Estimated complexity.** L.
- **Risk.** **High** — native data migration. Mitigation: idempotent, verify-then-
  swap; keep IndexedDB intact until SQLite copy is verified; `MemoryDriver` parity
  tests reused against `SqliteDriver`.
- **Dependencies.** M3.1, M1.4 (`StorageDriver` seam).
- **Rollback.** Fall back to `IndexedDbDriver` in the webview (both drivers satisfy
  the seam); SQLite DB discarded, IndexedDB retained.
- **Testing requirements.** Driver-contract suite passes on `SqliteDriver`;
  IndexedDB→SQLite migration preserves all stores; re-run is a no-op; SQLCipher
  encryption verified (raw file is ciphertext).
- **Deliverables.** Encrypted native storage; safe data migration.

### M3.3 — Hardware-backed `CapSecureStore` + key re-key

- **Objective.** Custody key material in Android Keystore / iOS
  Keychain+Secure Enclave (biometric-gated), and **re-key** software-custody keys
  from Phase 2 into hardware backing.
- **Files affected.** *New:* `src/platform/capacitor/CapSecureStore.ts`, re-key
  migration step. *Edited:* `di/` (select `CapSecureStore` on native).
- **Estimated complexity.** L.
- **Risk.** **High** — botched re-key loses keys. Mitigation: recovery phrase
  (M2.3) is the backstop; re-key is verify-then-remove-old; biometric fallback
  paths tested. **Security-review gate.**
- **Dependencies.** M3.2, M2.2, M2.3.
- **Rollback.** `WebSecureStore`-style software custody remains available via the
  seam; re-key only removes the software copy after the hardware copy is verified.
- **Testing requirements.** Wrap/unwrap through hardware; biometric prompt gates
  unwrap; re-key migrates every key and old copy removed only post-verify; recovery
  restores if hardware is wiped.
- **Deliverables.** Hardware-backed custody; keys upgraded from software backing.

### M3.4 — Native export (Filesystem + Share)

- **Objective.** Export via native `Filesystem` + Share sheet instead of a browser
  download.
- **Files affected.** *New:* `src/platform/capacitor/CapFilesystem.ts`. *Edited:*
  `SourcesView.tsx`/exporter wiring via the `Filesystem` seam.
- **Estimated complexity.** S.
- **Risk.** Low — additive platform adapter behind the existing seam.
- **Dependencies.** M3.1, M1.7 (exporter).
- **Rollback.** Web `Blob` download remains for web; revert removes only native
  export.
- **Testing requirements.** Native export writes a valid v2 file and opens the
  Share sheet; web export unaffected.
- **Deliverables.** Native export/share.

### M3.5 — Local-only notifications + biometric app-lock

- **Objective.** Reschedule-on-write **local** notifications (content-free wake
  ups; no health text — spec §6.3) and a biometric app-lock.
- **Files affected.** *New:* `src/platform/capacitor/CapNotifications.ts`,
  `src/platform/seams/NotificationScheduler.ts` impl, app-lock gate. *Edited:* `di/`.
- **Estimated complexity.** M.
- **Risk.** Med — notification content policy is a privacy surface. Mitigation:
  content-free payloads enforced by type + test; local-only (no server push of
  health data).
- **Dependencies.** M3.3 (secure custody for app-lock).
- **Rollback.** Flag off → no notifications / no lock; core app unaffected.
- **Testing requirements.** Notifications carry no health text; reschedule on each
  write; app-lock gates open; web is a no-op adapter.
- **Deliverables.** Privacy-preserving reminders + app-lock.

### M3.6 — Store compliance & release

- **Objective.** Google Play Data-safety form + Apple privacy labels aligned to the
  actual (now zero-knowledge) data practices; release pipeline.
- **Files affected.** *New:* store metadata, `docs/` compliance notes, release
  workflow. *Edited:* privacy copy references (consistency with M0.5/M2.x).
- **Estimated complexity.** M.
- **Risk.** Med — compliance accuracy. Mitigation: derive the disclosures from the
  spec's residual-metadata section (§0.6 / spec §10.4); legal review.
- **Dependencies.** M3.1–M3.5.
- **Rollback.** Hold the release; app already functions.
- **Testing requirements.** Disclosure checklist matches shipped behavior; signed
  builds install; store pre-submission checks pass.
- **Deliverables.** Submittable, compliant Android + iOS builds.

---

## 7. Phase 4 — Advanced (only if justified)

Speculative; each is a standalone feature gated on a real product decision. Listed
with the eight fields at low detail; promote to a full milestone when scheduled.

### M4.1 — Doctor export (consent-gated)
- **Objective.** A clinician-friendly export format. **Files:** new
  `data/exporters/doctor.ts`, consent UI. **Cx:** M. **Risk:** Med (consent +
  format correctness). **Deps:** M1.7. **Rollback:** flag off. **Testing:**
  format snapshot; consent required before export. **Deliverables:** consented
  clinical export.

### M4.2 — Multi-device key-distribution hardening
- **Objective.** Strengthen M2.6 (revocation lists, per-device DEK wrapping).
  **Files:** `crypto/enrollment.ts`, `device_keys`. **Cx:** M. **Risk:** High
  (crypto). **Deps:** M2.6. **Rollback:** flag off. **Testing:** revoked device
  loses access; per-device wrap. **Deliverables:** hardened enrollment.
  **Security-review gate.**

### M4.3 — Passkeys / WebAuthn PRF key custody
- **Objective.** Derive/protect keys via WebAuthn PRF as an alternative custody
  path. **Files:** new `platform/*/WebAuthnSecureStore`. **Cx:** M. **Risk:** High.
  **Deps:** M2.2. **Rollback:** flag off; recovery phrase remains. **Testing:**
  PRF wrap/unwrap; fallback when unsupported. **Deliverables:** passkey custody
  option. **Security-review gate.**

### M4.4 — P2P transports (research spike)
- **Objective.** Prototype a `Transport` over WebRTC/LAN/Bluetooth (spec's future
  transports). **Files:** new `sync/transports/*`. **Cx:** L. **Risk:** High.
  **Deps:** M1.8 (`Transport` seam). **Rollback:** never shipped by default; behind
  a flag. **Testing:** seam-contract parity with `SupabaseTransport`.
  **Deliverables:** a spike + go/no-go memo.

### M4.5 — On-device ML / anonymized research export
- **Objective.** On-device prediction tier and/or a research export with a real
  anonymization design. **Files:** new module + a written anonymization threat
  model first. **Cx:** XL. **Risk:** High (re-identification). **Deps:** M2.4.
  **Rollback:** never ship without the anonymization design review.
  **Testing:** utility vs. privacy evaluation. **Deliverables:** design memo
  before any code.

---

## 8. Cross-cutting requirements (apply across all milestones)

### 8.1 CI gates (ratcheted up over time)

| Gate | Introduced | Blocking from |
|---|---|---|
| `tsc --noEmit` | M0.1 | M0.1 (advisory) → M0.2 (blocking) |
| Vitest unit | M0.1 | M0.1 |
| ESLint boundaries (`import/no-restricted-paths`) | M1.1 (partial) | M1.10 (full matrix) |
| pgTAP RLS | M0.3 (suites authored: `supabase/tests/`) | **not yet wired into CI** (see §4.x) |
| Coverage thresholds | M0.1 (0%) | ratcheted per milestone; domain/crypto ≥ high |
| Playwright E2E | ~~M1.9 (first flows)~~ **deferred** — not built in Phase 1 (pgTAP + fake-transport suites shipped instead; see §4.x) | M2.9 |
| Native build | M3.1 | M3.1 |
| **Human security review** | M2.1 | every `crypto/**` + RLS-policy PR |

### 8.2 Definition of done (every milestone)

- CI green (all gates active at that milestone).
- The milestone's own tests added and passing; coverage not decreased.
- Behavior-changing work is behind a flag defaulting **off**, with the flip-on as
  a separate trivial PR.
- Rollback path validated (revert the PR, or flip the flag) with **no data loss**.
- Spec cross-references cited in the PR description; any deviation from the spec
  noted (as this plan does for the M0.3/M2.13 split).
- `main` remains shippable.

### 8.3 Flag lifecycle

Flags are born **off** in the milestone that adds the dark path, flipped **on** in
a follow-up once validated, and **removed** in a later cleanup PR (often the
destructive milestone that retires the old path, e.g. M2.13). No flag lives
forever.

---

## 9. Sequencing & critical path

- **Critical path:** M0.1 → M1.1 → M1.4 → M1.5 → M1.6 → M1.8 → M1.9 → M2.1 → M2.2 →
  M2.3 → M2.4 → M2.5 → M2.8 → M2.9 → M2.13. Everything else parallelizes around it.
- **Parallelizable early wins** (independent of the critical path): M0.5 (copy),
  M0.2 (tests), and — once M0.1 lands — M1.2/M1.3 and M1.6/M1.7.
- **The two irreversible moments** are M2.4 (owner ciphertext cutover) and M2.13
  (drop plaintext partner ACL). Both are protected by expand→migrate→contract,
  precondition gates, and the recovery phrase (M2.3) shipping first.
- **Phase gate:** do not start Phase 2 crypto until M0.1's harness and M1.6's merge
  tests exist (invariant b). Do not run M2.13 until M2.4 coverage is 100% and M2.9
  is live for the full user base (invariant a).

### 9.1 Rough effort rollup (order-of-magnitude, not a commitment)

| Phase | Milestones | Rough effort |
|---|---|---|
| 0 — Stabilize | 6 | ~1 eng-week |
| 1 — Foundations | 10 | ~4–6 eng-weeks |
| 2 — Privacy + E2EE | 13 | ~3–5 eng-months (critical path) |
| 3 — Mobile | 6 | ~6–9 eng-weeks |
| 4 — Advanced | 5 | scheduled individually |

---

*This plan is derived from [RHEA_V2_TECHNICAL_SPEC.md](RHEA_V2_TECHNICAL_SPEC.md)
and preserves its architectural decisions and sequencing invariant. Where it
refines the spec (the M0.3 / M2.13 split of the two RLS drops), the refinement is
called out inline and is a strictly safer ordering of the same end state. No
source code is modified by this document.*
