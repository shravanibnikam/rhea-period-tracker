# Rhea v2 — Implementation Status

**Paused at user request — 2026-07-15, after M2.1. Project is being HANDED OFF —
start at [HANDOFF.md](HANDOFF.md).**
Repository state: branch `rhea-v2-preparation`, working tree **clean** — all work to date
is contained in HEAD (`16d4360`, committed by the repository owner). The implementation
sessions themselves created no commits and pushed nothing.

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
| M2.4 | RHEA-069…073 | Migration 0004 (ciphertext cols, `(owner_id,scope,key)`) · seal/open in repos+transport · dual-read/write + backfill · e2e suite · flip `flags.e2eeOwner` |
| M2.5 | RHEA-074…083 | Migration 0005 (`device_keys`,`pairing_sessions`) · QR+SAS pairing replacing invite codes |
| M2.6 | RHEA-084…087 | Multi-device DEK enrollment |
| M2.7 | RHEA-088…091 | `PrivacyEngine` + `projectionBuilder` + `privacyPolicy` (pure) |
| M2.8 | RHEA-092…095 | `ProjectionPublisher` + `partner_projections` (0006) + 4 triggers |
| M2.9 | RHEA-096…100 | Partner consumes E2EE projection ← retires legacy plaintext partner pull |
| M2.10 | RHEA-101…103 | E2EE shared notes (0007), flips `flags.notesSync` |
| M2.11 | RHEA-104…105 | Quiet windows + share gates under projection (0008) |
| M2.12 | RHEA-106…107 | Local audit log; retire server `audit_log` (0009) |
| M2.13 | RHEA-108…109 | Drop partner plaintext ACL + plaintext columns (0010) — zero-knowledge end state |

### Phase 3 — Mobile (RHEA-110…127) · Phase 4 — Advanced (RHEA-128…132)
Unchanged; Phase 3 native builds unverifiable here (no Android/iOS SDKs).

---

## ⚠️ Known issues / standing caveats
1. **SQL never executed** (no local Postgres): migrations 0001–0003 + pgTAP
   suites authored only; **pgTAP is NOT wired into CI** — wire + apply before
   enabling any Phase-2 server feature (risk register pre-deploy action).
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
