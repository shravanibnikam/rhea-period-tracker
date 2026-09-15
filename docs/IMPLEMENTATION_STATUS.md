# Rhea v2 — Implementation Status

## Current work — 2026-09-15

Active branch: `chore/phase-2-hosting`. Phase 1 is merged as `bf76c4b`. The owner's newer engineering brief
sets the order: credibility → Pages/keep-alive → on-device ML → scoped owner
E2EE → presentation. See [EXECUTION_PLAN.md](EXECUTION_PLAN.md); July's milestone
numbers below describe an older roadmap. Mobile apps are cancelled.

### Implemented and verified locally

- Baseline: 305 Vitest tests; lint/build pass. Both transport failures reproduced
  with dummy Supabase configuration before the fix.
- Transport descriptors now take an explicit configuration fixture; importing
  them does not initialize a Supabase client.
- All migrations 0001–0005 apply locally. The orientation missed the existing
  0005 partner share-default migration; keep-alive must take the next number.
- Three pgTAP suites pass: 31 assertions. Required Auth users are seeded inside
  test transactions; invite behavior is executable rather than a comment sketch.
- CI adds pgTAP and Chromium tests on local Supabase, plus the full Vitest suite
  with populated dummy configuration.
- Browser tests pass for local-only persistence/offline deletion, and a real
  owner save → Supabase row → UI delete → newer tombstone → two-device reload.
- Browser testing exposed a startup race: an obsolete auth/role effect stopped
  the replacement owner engine, leaving writes queued. Cleanup now invalidates
  pending storage initialization and obsolete callbacks cannot stop successors.
  A deferred-start regression test covers this.
- MIT license, unreleased changelog and reproducible testing instructions added.
- Final local checks: **309/309 Vitest tests** with and without dummy Supabase
  configuration, **31 pgTAP assertions**, **2 Chromium tests**, lint/typecheck/
  build pass. Coverage: lines/statements **56.61%** (baseline 56.27%), branches
  **81.80%** (81.66%), functions **74.25%** (73.44%). Runtime: Node 24.21.0
  locally; CI uses Node 22.

### GitHub verification

[PR #4](https://github.com/shravanibnikam/rhea-period-tracker/pull/4) is merged.
[CI run 34946040531](https://github.com/shravanibnikam/rhea-period-tracker/actions/runs/34946040531)
passed on merge commit `bf76c4b`. Release tagging still requires production UI
delete confirmation with a dedicated synthetic test account.

### Phase 2: implemented, cutover pending

- Root builds retain the current hosting path; `build:pages` uses the GitHub
  project prefix, base-aware logos, relative manifest and a 404 application shell.
- Build-generated service worker precaches application assets only. Offline
  fresh-tab logging works; updates wait until existing app tabs close.
- Actions deployment and daily public keep-alive workflows added. Public build
  variables and Pages Actions source are configured in GitHub; Pages is not yet
  deployed. Vercel remains the current host.
- Migration `0006_keepalive.sql` adds a single public liveness row. Applied only
  to the local stack; production requires human security review and management
  access. No health table permissions change.
- Local checks: **310 Vitest tests**, **37 pgTAP assertions**, **2 sync/local-only
  browser tests**, **2 production Pages browser tests**, lint/typecheck/build.
  Coverage: **57.70%** lines/statements, **81.90%** branches, **74.52%** functions.
- Production access and dedicated test accounts are being established. The
  supplied Mac Vercel credential paths are absent in this Linux workspace.
  Supabase CLI login succeeded; management reports project `rhea` as `INACTIVE`,
  consistent with the earlier public-endpoint DNS failure. Resume is pending.
- [HOSTING.md](HOSTING.md) records the remaining auth, data-transfer, verification
  and retirement gates. Local tests do not establish production success.

Privacy is unchanged: cloud daily logs (including daily-log notes) are plaintext,
partner access is legacy RLS, and sharing toggles are presentation controls.
Only the separate shared-notes channel is disabled. Existing onboarding/auth
copy still overstates confidentiality and needs correction during presentation.

The latest dependency install reported 11 audit findings (4 moderate, 5 high,
2 critical); dependency remediation has not been assessed in this phase.
The build retains its existing Recharts chunk-size warning.

---

## ▶ Current state (2026-07-20) — READ THIS FIRST

The v2 work has since been **merged to `main` and deployed** — the sections below
(from the 2026-07-15 handoff) describe the pre-merge snapshot and are retained for
history. Current reality:

- **Live** at https://rhea-period-tracker.vercel.app; Vercel auto-deploys `main`.
- **Supabase migrations `0001`–`0004` are all applied to production** (`0004` = the
  invite pgcrypto fix; see `supabase/migrations/README.md`).
- **Partner pairing: fixed and verified end-to-end** — three corrupting invite
  inputs fixed (`PairingSection` ×2 + `RoleSelect`), plus the `0004` server fix;
  confirmed live with a two-account pass (create → redeem → `partner_links`) and unlink.
- **Delete + calendar features shipped;** the delete→cloud-tombstone fixes
  (durable outbox, key-aware HLC stamping, truthful transport acknowledgement) are
  **deployed and unit-tested, but a final live delete E2E is still pending.**
- **Tests: ~270 passing** (2 `transports.spec.ts` cases fail only locally with a
  populated `.env`; green in CI).
- **Privacy (unchanged):** cloud health data is **still plaintext**; the partner
  path is **still legacy plaintext**. Phase 2 (E2EE) has only the M2.1 primitives.
- Migration-numbering: the shipped `0004` is the pairing fix, so the planned
  Phase-2 E2EE migrations have **shifted to `0005`+** (the table below still shows
  the old reservation, corrected inline).

---

**Paused at user request — 2026-07-15, after M2.1** *(historical handoff snapshot below).*
Repository state at that time: branch `rhea-v2-preparation`, working tree clean —
all work to date was in HEAD (`16d4360`). Those implementation sessions created no
commits and pushed nothing; everything since has shipped on `main`.

| | |
|---|---|
| **Current phase** | Phase 2 — Privacy engine & E2EE (in progress) |
| **Current milestone** | M2.1 ✅ complete → **M2.2 next (not started)** |
| **Current task** | Next: RHEA-063 (`SecureStore` seam + `WebSecureStore`) |
| **Typecheck** | ✅ `tsc --noEmit` clean |
| **Lint** | ✅ `eslint . --max-warnings=0` clean (gate tightened this session) |
| **Tests** | ✅ **228 passed / 228, 25 files** (`vitest run`) |
| **Build** | ✅ `vite build` (chunk-size warning only — sumo bundle, tracked debt) |
| **Dev server** | `npm run dev` → http://localhost:5173 (entry `src/app/main.tsx`) |

Handoff brief: [HANDOFF.md](HANDOFF.md) · Resume brief: [NEXT_SESSION.md](NEXT_SESSION.md) · Decision history: [IMPLEMENTATION_JOURNAL.md](IMPLEMENTATION_JOURNAL.md) (session S3 = today) · ADRs: [docs/adr/](adr/)

---

## ✅ Completed

### Phases 0–1 (M0.1–M0.6, M1.1–M1.10 · RHEA-001…059) — prior sessions
Toolchain/CI · golden-master suite · invite security hotfix · account-scoped DB
· honest privacy copy · notes-egress kill-switch · `kernel/` · pure `domain/`
(single phase oracle, HLC, LWW merge) · `data/` (StorageDriver seam, IDB v2
eight stores, v1→v2 migration, repositories, export/import v2) · `sync/`
(outbox, cursors, reconciler, SyncEngine, Null/Supabase transports, migration
0003 authored) · `app/di` composition root; `src/lib`+`src/types` deleted.

### This session (S3, 2026-07-15)
1. **Pre-Phase-2 doc audit** (7-agent verification of every architecture doc
   against the code) → all findings fixed; all planning docs now match the
   implementation (V2_TASKS statuses on all 132 tasks, plan status column,
   spec Ch2/Ch6/Ch8/§0.10.J corrections, critique/risk updates,
   REPOSITORY_OVERVIEW rewritten, proposal/review addenda).
2. **P1 defect fixed — critique H2 / risk R-OFF-1** (found by the audit):
   `decideMerge` echo suppression is now a label on ties/older self-rows, not
   a pre-compare drop; single-device restore/resync now works. Regression
   tests at merge/reconciler/engine levels. Risk register updated.
3. **ADR log established** — `docs/adr/0001…0005`; ADR-0005 fixes the crypto
   supplier (libsodium-wrappers-sumo + @scure/bip39) with alternatives and
   trade-offs, written before any crypto code (per project crypto rule).
4. **Lint gate tightened** to `--max-warnings=0` (5 warnings fixed, one dead
   prop removed end-to-end).
5. **M2.1 complete (RHEA-060…062):** `src/crypto/{sodium,envelope,errors,
   aead,index}.ts` — XChaCha20-Poly1305 seal/open with mandatory 4-field AAD
   (`buildAad` in `data/envelope.ts`), distinct `AAD_MISMATCH` vs
   `DECRYPT_FAILED` vs `RNG_UNAVAILABLE` error codes, pinned KAT vectors +
   generator, crypto ESLint zone, sodium-ready in test setup.

## 📁 Files modified this session
- **New:** `src/crypto/*` (5) · `tests/unit/crypto/aead.vectors.spec.ts` ·
  `tests/fixtures/vectors/{aead.json,gen-aead-vectors.mjs}` ·
  `docs/adr/0001–0005` · `docs/NEXT_SESSION.md`
- **Edited (code):** `src/domain/merge.ts` (H2 fix) · `src/kernel/errors.ts`
  (+2 codes) · `src/data/envelope.ts` (type re-export + AAD assembly) ·
  `eslint.config.js` (crypto zone) · `tests/setup.ts` · `package.json`
  (lint script, +3 deps) · 5 view files (lint cleanup) · 4 test files
- **Edited (docs):** V2_TASKS, V2_IMPLEMENTATION_PLAN, RHEA_V2_TECHNICAL_SPEC,
  ARCHITECTURE_CRITIQUE, RISK_REGISTER, REPOSITORY_OVERVIEW (rewritten),
  Rhea_v2_Architecture_Proposal, V2_ARCHITECTURE_REVIEW, IMPLEMENTATION_JOURNAL

---

## ⏳ Remaining

### Phase 2 (next: **M2.2**)
| Milestone | Tasks | Scope |
|---|---|---|
| **M2.2 ← next** | RHEA-063…065 | `SecureStore` seam + `WebSecureStore` (non-extractable AES-GCM MWK) + `keyring.ts` (device X25519/Ed25519 identity, DEK, `dek:<epoch>`/`kpair:<linkId>:<v>` resolution) + suite |
| M2.3 | RHEA-066…068 | `kdf.ts` (Argon2id KEK + crypto_kx, vectors) · `recovery.ts` (BIP39 ↔ wrapped DEK) · recovery UI |
| M2.4 | RHEA-069…073 | Migration **0005** (ciphertext cols, `(owner_id,scope,key)`) · seal/open in repos+transport · dual-read/write + backfill · e2e suite · flip `flags.e2eeOwner` |
| M2.5 | RHEA-074…083 | Migration **0006** (`device_keys`,`pairing_sessions`) · QR+SAS pairing replacing invite codes |
| M2.6 | RHEA-084…087 | Multi-device DEK enrollment |
| M2.7 | RHEA-088…091 | `PrivacyEngine` + `projectionBuilder` + `privacyPolicy` (pure) |
| M2.8 | RHEA-092…095 | `ProjectionPublisher` + `partner_projections` (**0007**) + 4 triggers |
| M2.9 | RHEA-096…100 | Partner consumes E2EE projection ← retires legacy plaintext partner pull |
| M2.10 | RHEA-101…103 | E2EE shared notes (**0008**), flips `flags.notesSync` |
| M2.11 | RHEA-104…105 | Quiet windows + share gates under projection (**0009**) |
| M2.12 | RHEA-106…107 | Local audit log; retire server `audit_log` (**0010**) |
| M2.13 | RHEA-108…109 | Drop partner plaintext ACL + plaintext columns (**0011**) — zero-knowledge end state |

### Phase 3 — Mobile (RHEA-110…127) · Phase 4 — Advanced (RHEA-128…132)
Unchanged; Phase 3 native builds unverifiable here (no Android/iOS SDKs).

---

## ⚠️ Known issues / standing caveats
1. **Migrations 0001–0004 are applied to production** (this changed after the
   handoff). However the **pgTAP suites are still NOT executed or wired into CI**
   — wire + run them before treating RLS as verified (risk register pre-deploy
   action). *(Original handoff note: "SQL never executed; migrations 0001–0003
   authored only" — no longer accurate.)*
2. **Partner path still legacy plaintext** (`src/app/lib/sync.ts`) until M2.9
   — by design (never remove an access path before its replacement ships).
3. **Bundle size**: libsodium sumo build inflates the main chunk (Vite warns).
   Tech debt: dynamic-import the crypto layer (`ADR-0005` future note).
4. **No human security review** of the crypto layer yet — required before
   production launch (recorded on RHEA-061).
5. Node runtime is a session-scratchpad install (v22.11.0); CI uses
   `setup-node@22`.

## ▶ Next recommended task
**RHEA-063** — `src/platform/seams/SecureStore.ts` + `src/platform/web/WebSecureStore.ts`
(new `platform/` layer + lint zone), then RHEA-064 keyring, RHEA-065 suite.
See [NEXT_SESSION.md](NEXT_SESSION.md) for the full brief.
