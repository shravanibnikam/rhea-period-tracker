# Rhea v2 — Engineering Handoff

**Date:** 2026-07-15 · **Handoff point:** Phase 2, end of milestone **M2.1** (M2.2 not started)
**Audience:** the next engineer (working with Codex or any coding agent) continuing the v2 implementation.

Read this file first, then [NEXT_SESSION.md](NEXT_SESSION.md) (exact resume brief), then the
design authority [RHEA_V2_TECHNICAL_SPEC.md](RHEA_V2_TECHNICAL_SPEC.md).

---

# Project Summary

**What Rhea is.** A privacy-first, local-first period/cycle tracker. Web PWA today
(React 18 + TypeScript strict + Vite 6), Capacitor mobile planned (Phase 3). All health
data lives on-device in IndexedDB; a Supabase backend is optional and only for sync +
partner sharing. The v2 program (this effort) turns the v1 prototype into the target
architecture: end-to-end-encrypted sync where the server is a zero-knowledge mailbox,
and partners receive only a consented, derived **projection** — never raw logs.

**Current architecture.** Strictly layered, ESLint-enforced:
`kernel ← domain ← crypto ← data ← sync ← app` (with `privacy/` and `platform/` layers
arriving in Phase 2/M2.2+). Storage and transport are dependency-inverted seams
(`StorageDriver`, `Transport`); the only place concrete adapters are named is the
composition root `src/app/di/Container.ts`.

**Long-term vision.** DailyLog is the single source of truth; everything else (phases,
predictions, projections) is derived, never persisted as truth. Every payload that leaves
the device is sealed with XChaCha20-Poly1305 under device-held keys; keys never leave the
device (recovery = BIP39 phrase → Argon2id KEK → wrapped DEK). Transports are swappable
(Supabase relay today; self-hosted relay / LAN / WebRTC later). Multi-device via
SAS-verified DEK enrollment; partner links via QR + SAS pairing with per-link keys.

**Major design principles** (violating these fails review):
1. Local-first — the app is fully functional offline; sync merges, never overwrites.
2. Privacy over convenience — partners get gated projections; raw DailyLog never syncs to them.
3. No custom crypto — audited libraries only (libsodium), all calls fenced inside `src/crypto/` (ADR-0005).
4. DailyLog = single source of truth; derived data recomputed, not stored.
5. Docs are living architecture — spec/plan/tasks/critique/risk register must match the code at all times; §0.10 of the spec wins any cross-chapter conflict.
6. Every milestone lands with all four gates green (typecheck, lint, tests, build).

# Current Progress

**Completed phases.**
- **Phase 0 — Stabilize & de-risk** (M0.1–M0.6, RHEA-001…018): toolchain + CI, golden-master
  characterization of the cycle engine, invite-redemption security hotfix (migration 0002),
  account-scoped IndexedDB, honest privacy copy + CI copy-guard, plaintext-notes egress kill-switch.
- **Phase 1 — Architectural foundations** (M1.1–M1.10, RHEA-019…059): `kernel/`, pure `domain/`
  (single phase oracle, HLC, LWW merge), `data/` (StorageDriver seam, IDB v2 eight stores,
  v1→v2 migration, repositories, export/import v2), `sync/` (durable outbox, cursor pulls,
  reconciler, SyncEngine, Null/Supabase transports, migration 0003 authored), `app/di`
  composition root; `src/lib` + `src/types` deleted.

**Completed milestones (Phase 2).**
- **M2.1 — crypto/sodium + aead + KATs** (RHEA-060…062, 2026-07-15): libsodium singleton,
  XChaCha20-Poly1305 seal/open with mandatory 4-field AAD, pinned known-answer vectors,
  crypto lint zone. Same session: P1 merge-defect fix (critique H2 / risk R-OFF-1),
  ADR log established (0001–0005), all planning docs synchronized to the code.

**Remaining milestones.**
- Phase 2: **M2.2 (next)** keyring + SecureStore → M2.3 recovery phrase → M2.4 owner E2EE
  cutover (migration 0004) → M2.5 QR+SAS pairing (0005) → M2.6 device enrollment →
  M2.7 PrivacyEngine → M2.8 ProjectionPublisher (0006) → M2.9 partner projection cutover →
  M2.10 E2EE notes (0007) → M2.11 quiet windows (0008) → M2.12 local audit (0009) →
  M2.13 drop plaintext ACL (0010).
- Phase 3: Mobile/Capacitor (M3.1–M3.6, RHEA-110…127) — native builds need Android/iOS SDKs.
- Phase 4: Advanced seeds (M4.1–M4.5, RHEA-128…132).

**Remaining tasks.** RHEA-063…132 (70 of 132). Per-task status lives in
[V2_TASKS.md](V2_TASKS.md) (`**Status:**` field on every task is authoritative).

# Current Branch

- **Branch:** `rhea-v2-preparation`
- **HEAD:** `16d4360` — "chore: prepare repository for Rhea v2 implementation"
  (the repository owner committed all v2 work to date into this commit; it contains
  Phases 0–1 and M2.1 including `src/crypto/` and `docs/adr/`).
- **Working tree:** clean **except for this handoff-doc update itself** — expect
  `git status` to show `docs/HANDOFF.md` (new) plus modified
  `docs/{NEXT_SESSION,IMPLEMENTATION_STATUS,IMPLEMENTATION_JOURNAL}.md`; commit them at
  your discretion (the implementation sessions never commit or push by standing rule).
  No source files are modified relative to HEAD. No remote pushes were made.

# Current Build Status

Verified 2026-07-15 at HEAD:

| Gate | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` | ✅ clean |
| Lint | `npm run lint` (`eslint . --max-warnings=0`) | ✅ 0 errors, 0 warnings |
| Tests | `npm test` | ✅ **228 / 228** in 25 files |
| Build | `npm run build` | ✅ (chunk-size warning only — libsodium sumo bundle, known debt) |

# Current Architecture

- **Kernel** (`src/kernel/`) — zero-dependency leaf every layer may import: `Result<T,E>`,
  the `RheaError` taxonomy (`ErrorCode` enum + per-code retry policy), a health-data-redacting
  `Logger` (forbidden fields enforced by tests), branded types, `invariant`/`assertNever`.
- **Domain** (`src/domain/`) — pure, no I/O: `DailyLog` types, cycle engine, the **single
  phase oracle** (`phases.ts` — all phase boundaries derive from one function), HLC
  (`hlc.ts`: `"<pt 12-hex>:<c 4-hex>:<deviceId>"`, lexicographic = causal), LWW merge
  (`merge.ts` `decideMerge` — echo is a label, not a pre-compare drop; see ADR/journal S3.2).
- **Crypto** (`src/crypto/`) — may import only kernel + libsodium (lint-fenced):
  `sodium.ts` ready-singleton, `aead.ts` seal/open, `envelope.ts` (owns the `CipherEnvelope`
  type), `errors.ts`. Keyring/kdf/recovery/pairing/enrollment land in M2.2–M2.6.
- **Data** (`src/data/`) — persistence behind the `StorageDriver` seam (IndexedDb + Memory
  drivers), eight logical stores (`logs, meta, outbox, keyring, projections, tombstones,
  sync_cursors, audit`), v1→v2 migration, repositories that stamp HLC/deviceId and enqueue
  the outbox **in the same transaction**, `envelope.ts` (SyncRecord, PlainEnvelope
  passthrough, AAD assembly `buildAad`), exporter/importer v2.
- **Sync** (`src/sync/`) — `SyncEngine` orchestrates: durable coalescing outbox (leases,
  backoff+jitter), cursor-driven keyset pulls, pure-merge reconciler, realtime as a
  debounced wake hint only, `resync()` (cursor reset, then merge — never wipes).
- **Privacy** (`src/privacy/` — NOT YET CREATED, M2.7+) — PrivacyEngine, ProjectionPublisher,
  NotesGateway, local AuditLog.
- **Transport** (`src/sync/transports/`) — `Transport` seam; `NullTransport` (local-only,
  tests) and `SupabaseTransport` (owner scope; upsert `onConflict owner_id,date` until the
  M2.4 wire change; server keyset cursor on `(server_updated_at, date)`).
- **Composition Root** (`src/app/di/Container.ts`) — the only file that names concrete
  drivers/transports; React reaches it via `Providers`/`useContainer`; account scoping,
  wipe policy, engine lifecycle live here. Entry point: `src/app/main.tsx`.

# Important Decisions

All in [docs/adr/](adr/) (details + trade-offs) and [IMPLEMENTATION_JOURNAL.md](IMPLEMENTATION_JOURNAL.md) (chronology):

- **ADR-0001** — ADR process; write ADRs *before* implementing significant decisions (mandatory for crypto).
- **ADR-0002** — layered architecture with lint-enforced import boundaries; DI at a single composition root.
- **ADR-0003** — HLC + per-key LWW + tombstones as the sync model (why not CRDTs/server time).
- **ADR-0004** — StorageDriver seam + eight-store IndexedDB v2 schema.
- **ADR-0005** — crypto supplier: `libsodium-wrappers-sumo` (+ `@scure/bip39` for mnemonic
  encoding only). Sumo build is required for `crypto_pwhash`/Argon2id. Noble/pure-TS stack
  rejected (Argon2id @ 256 MiB unusable in JS on mobile; no `crypto_kx` composition).
  WebCrypto kept only for the non-extractable AES-GCM master wrapping key (M2.2).
- Journal-recorded (pre-ADR-log) decisions: single phase oracle; epoch-0 HLC backfill;
  §4.4 unknown-tombstone skip; `updated_hlc` column rename (Postgres `updated_at` was taken);
  **silent-skip (RETURN NULL) stale-write trigger** so batch upserts survive; first sync
  merges-never-overwrites (`initialSeed`); merge echo = label not drop (H2 fix, S3.2);
  colon keyId grammar `dek:<epoch>` / `kpair:<linkId>:<version>` (spec §0.4);
  `CipherEnvelope` type owned by `crypto/`, re-exported by `data/` (spec Ch3 §3.1);
  invite hashing shipped as sha256-hex server-side (spec §0.10.J updated — Postgres lacks BLAKE2b).

# Cryptography Status

**Implemented (M2.1).**
- `getSodium()` ready-singleton; no module outside `src/crypto/` may touch libsodium (lint).
- AEAD: `seal`/`open` = `crypto_aead_xchacha20poly1305_ietf_*`, 24-byte random nonce per
  message, base64 "original" variant. **AAD is mandatory**: `canonicalJSON({keyId,
  recordKey, scope, updatedAt})`, assembled by `data/envelope.buildAad`, recomputed by the
  caller on open (never trusted from the envelope). Distinct failures: `AAD_MISMATCH`
  (transplant/tamper — audit-flag), `DECRYPT_FAILED` (tag/format — quarantine),
  `RNG_UNAVAILABLE` (hard-fail, never seal without entropy).
- Known-answer vectors pinned (`tests/fixtures/vectors/aead.json` + in-repo generator);
  nonce-uniqueness, tamper, per-field AAD-mismatch, unknown-version tests.

**Remaining.** M2.2 SecureStore/MWK + keyring (device X25519+Ed25519, DEK, keyId
resolution) → M2.3 `kdf.ts` (Argon2id `recovery` profile FROZEN at ops=4 / mem=256 MiB as
`recovery-argon2id-v1`) + BIP39 recovery → M2.4 encrypt-everything cutover (dual-read/write
+ backfill + hashed wire keys per §0.6/§0.10.H) → M2.5/M2.6 pairing + enrollment (crypto_kx,
SAS = BLAKE2b→100 bits→6×5 decimal digits; K_pair = BLAKE2b(kx_shared‖linkId‖"rhea-kpair-v1"))
→ M2.10 notes under K_pair → M2.13 final plaintext removal.

**Security assumptions (documented, honest).**
- Web at-rest custody is best-effort: non-extractable WebCrypto MWK wraps libsodium keys,
  but a live-DOM XSS can coerce an unwrap (spec Ch5 §2/§3.3, T-4). Capacitor
  Keystore/Keychain is the hardened path (Phase 3).
- Key loss = data loss (by design; recovery phrase is the only path — must be surfaced in UX).
- Server sees metadata per spec Ch5 §10 (pairing graph, timing, sizes) — minimized, not erased.
- RLS is an envelope ACL, never a confidentiality boundary.
- **No human security review has happened yet** — recorded on RHEA-061; required pre-launch.

# Sync Status

**Engine.** `SyncEngine` (owner + meta scopes live): durable outbox with per-entry leases,
exponential backoff + deterministic jitter, coalescing (same-key writes collapse); pulls are
cursor-driven keyset pages (server cursor separate from the HLC high-water mark); reconciler
applies via pure `decideMerge`; realtime is only a debounced wake hint; single-flight flush;
initial seed merges local↑ (never pull-overwrite). Stale writes are silently skipped
server-side by the 0003 trigger and dropped client-side on next pull.

**Transports.** `NullTransport` (local-only + tests, zero user-facing change) and
`SupabaseTransport` (owner scope, plaintext columns until M2.4; `updated_hlc` column;
`.or()` keyset paging). A faithful in-memory `FakeTransport` server drives the e2e-style
unit suites (convergence, tombstones, offline, stale-write, restore).

**Remaining.** M2.4: ciphertext wire shape (`(owner_id, scope, key)` conflict target,
hashed record keys, env columns — migration 0004) with dual-read/write + backfill behind
`flags.e2eeOwner`. M2.8/M2.10: `projection`/`note` scope appliers in the reconciler
(stubs return skip today). M2.9: partner consumes the projection scope; delete legacy
`src/app/lib/sync.ts` plaintext pull. M2.13: server-side cleanup of `deleted=true` rows.

# Known Risks

**Outstanding risks** (register: [RISK_REGISTER.md](RISK_REGISTER.md)):
- **SQL never executed** — migrations 0001–0003 and both pgTAP suites are authored but have
  never run against any Postgres; **pgTAP is not wired into CI**. Standing pre-deploy
  action: `supabase db reset && supabase test db` + wire pgTAP CI before enabling any
  Phase-2 server feature. `flags.syncEngine=true` presumes 0003 is applied.
- **Legacy plaintext partner path** (`src/app/lib/sync.ts`) stays until M2.9 — intentional
  sequencing (never remove an access path before its replacement), but it is a live
  plaintext egress until then (`flags.notesSync=false` already blocks notes).
- **No human security review** of crypto (see above).

**Technical debt:**
- libsodium sumo inflates the main bundle (Vite chunk-size warning) — dynamic-import the
  crypto layer (ADR-0005 future note).
- Playwright/e2e harness never set up (RHEA-054 deviation) — revisit at M2.4 verification.
- `kernel/result.ts` combinators exist but production code throws typed errors instead
  (ARCH-5 resolved-by-convention; combinators are available, not load-bearing).
- Deleted rows remain server-side as `deleted=true` until M2.13 GC.

**External dependencies:** Supabase project (auth + Postgres + realtime) for any live sync;
Node ≥ 20 (sessions used 22.11.0); Android/iOS SDKs only for Phase 3 native builds;
`libsodium-wrappers-sumo@0.8.4`, `@scure/bip39@2.2.0`, `idb@8`, `@supabase/supabase-js@2`.

# How To Continue

Resume at **Phase 2 → milestone M2.2 → task RHEA-063**, in this order:

1. **ADR-0006 first** (crypto rule): web key-custody decision — non-extractable WebCrypto
   AES-GCM MWK wrapping libsodium secrets vs alternatives. Then implement.
2. **RHEA-063** — `SecureStore` seam + web impl:
   - `src/platform/seams/SecureStore.ts` (interface per spec Ch3 §3.2: `custody:
     'software-idb' | 'keystore' | 'secure-enclave'`, `wrap/unwrap/remove`, biometric flags)
   - `src/platform/web/WebSecureStore.ts` (MWK: `crypto.subtle.generateKey({name:'AES-GCM',
     length:256}, false, ['encrypt','decrypt'])`; persist the `CryptoKey` handle via
     structured clone; wrapped blobs in the existing-but-unused `keyring` store)
   - add the `platform/` ESLint zone (imports: kernel + data seam types only)
3. **RHEA-064** — `src/crypto/keyring.ts` (device X25519 + Ed25519 identity, DEK
   create/load, `seal/open` by keyId — raw keys never returned; `KEY_NOT_FOUND` per T-3 #2;
   multi-epoch `dek:<n>` resolution) + inject SecureStore in `src/app/di/Container.ts`.
   **Reuse the deviceId already minted by `src/data/syncStamp.ts` — do not mint a second one.**
4. **RHEA-065** — `tests/unit/crypto/keyring.spec.ts` (custody round-trip, no raw-key
   leakage negative test, epoch/version resolution edge cases, persistence across reloads).
5. Gates + update `V2_TASKS.md` statuses, `IMPLEMENTATION_STATUS.md`,
   `IMPLEMENTATION_JOURNAL.md` (start session S4), then M2.3.

Full brief with file-level notes: [NEXT_SESSION.md](NEXT_SESSION.md).

# Commands

```bash
npm install            # install deps (Node >= 20; sessions used 22.11.0)
npm run dev            # Vite dev server → http://localhost:5173
npm test               # vitest run (228 tests; TZ=UTC enforced by setup)
npm run test:watch     # vitest watch mode
npm run lint           # eslint . --max-warnings=0  (layer boundaries enforced here)
npm run typecheck      # tsc --noEmit
npm run build          # tsc --noEmit && vite build
```

Supabase (when a live project exists — NOT yet done anywhere):
`supabase db reset && supabase test db` (applies migrations 0001–0003 + runs pgTAP).

# Important Files

Read in this order:
1. [docs/HANDOFF.md](HANDOFF.md) — this file.
2. [docs/NEXT_SESSION.md](NEXT_SESSION.md) — exact resume brief for M2.2.
3. [docs/RHEA_V2_TECHNICAL_SPEC.md](RHEA_V2_TECHNICAL_SPEC.md) — design authority.
   **Chapter 0 (esp. §0.10) overrides everything else on conflict.** For M2.2–M2.6 read
   Chapter 5 (encryption) closely.
4. [docs/V2_TASKS.md](V2_TASKS.md) — per-task acceptance criteria + authoritative Status fields.
5. [docs/IMPLEMENTATION_JOURNAL.md](IMPLEMENTATION_JOURNAL.md) — why things are the way they
   are (sessions S0–S3); [docs/adr/](adr/) — durable decisions.
6. Code anchors: `src/app/di/Container.ts` (wiring) · `src/data/envelope.ts` (SyncRecord/
   AAD) · `src/crypto/aead.ts` (AEAD) · `src/domain/merge.ts` + `src/domain/hlc.ts` (sync
   semantics) · `src/sync/SyncEngine.ts` · `src/data/schema.ts` (stores) ·
   `eslint.config.js` (layer matrix) · `tests/helpers/fakeTransport.ts` (e2e harness).
7. [docs/ARCHITECTURE_CRITIQUE.md](ARCHITECTURE_CRITIQUE.md) + [docs/RISK_REGISTER.md](RISK_REGISTER.md)
   — these override the original proposal on conflict.

# Things To Avoid

Pitfalls discovered (each cost real debugging time or is guarded by a test):
- **Never import libsodium outside `src/crypto/`** — lint-fenced; all crypto via wrappers.
- **Never write logs outside the repositories.** Direct driver writes bypass HLC stamping +
  outbox enqueue; a guard test (`writePath.guard.spec.ts`) greps for illegal write paths and
  raw `toISOString().slice(0,10)` date keys (it even catches comments). Use `domain/dates`.
- **Never put health fields in logger context or error messages** — the kernel logger
  redacts a forbidden-field list and tests enforce it (flow, symptoms, mood, notes, …).
- **Don't "fix" the echo rule back.** Self-authored rows that are strictly newer than local
  (or missing locally) MUST apply — that's the restore path (journal S3.2). Two old tests
  once pinned the buggy behavior; don't reintroduce a pre-compare echo drop.
- **Don't trust `env.aad`** — always recompute the AAD from the surrounding SyncRecord.
- **Don't regenerate the KAT vectors casually** — changed fixture bytes = changed wire
  format = a breaking protocol change (bump `ENVELOPE_VERSION`, document, migrate).
- **Don't mint a second deviceId** — `src/data/syncStamp.ts` owns it (128-bit base64url,
  persisted in `meta`); the HLC tiebreak and echo logic depend on its stability.
- **Don't remove the legacy partner path before M2.9** — sequencing invariant: a
  replacement must ship before the old access path is deleted.
- **Don't add IndexedDB stores ad hoc** — schema changes go through `src/data/schema.ts`
  + a versioned migration in `src/data/migrations/indexeddb/` (idempotent, additive).
- **idb typing traps:** generic-mode transactions need `put!`/`delete!` non-null assertions;
  always attach `tx.done.catch(() => {})` BEFORE calling `tx.abort()` (unhandled-rejection
  noise); an open driver handle blocks `deleteDB` in tests (close the container first).
- **Batch upserts vs server guards:** a RAISE in a Postgres trigger fails the whole batch —
  that's why the stale-write trigger silently skips (RETURN NULL). Keep new triggers batch-safe.
- **Spec conflicts:** resolve via §0.10, not by picking whichever chapter you read last;
  when implementation legitimately diverges, update the docs in the same change.

# Suggested Prompt

Paste this into Codex to continue:

```text
You are continuing the Rhea v2 implementation in this repository
(/path/to/rhea-period-tracker, branch rhea-v2-preparation, working tree clean).

Before writing any code, read in order: docs/HANDOFF.md, docs/NEXT_SESSION.md,
docs/RHEA_V2_TECHNICAL_SPEC.md Chapter 0 (§0.10 wins all conflicts) and Chapter 5,
docs/V2_TASKS.md tasks RHEA-063..065, docs/adr/ (especially ADR-0005), and the
"Things To Avoid" section of HANDOFF.md.

State: Phases 0-1 and Phase-2 milestone M2.1 are complete (all four gates green:
typecheck, eslint --max-warnings=0, 228/228 vitest tests, vite build). Resume at
Phase 2, milestone M2.2, task RHEA-063.

Work order:
1. Write docs/adr/0006 (web key-custody: non-extractable WebCrypto AES-GCM master
   wrapping key wrapping libsodium secrets; document alternatives + trade-offs)
   BEFORE implementing — cryptographic decisions require an ADR first.
2. RHEA-063: src/platform/seams/SecureStore.ts (seam per spec Ch3 §3.2) +
   src/platform/web/WebSecureStore.ts (MWK via crypto.subtle.generateKey AES-GCM-256
   non-extractable; persist the CryptoKey handle by structured clone; wrapped secrets
   in the existing unused `keyring` object store). Add the platform/ ESLint zone.
3. RHEA-064: src/crypto/keyring.ts — device X25519 + Ed25519 identity keypairs, DEK
   create/load, seal/open by keyId (colon grammar dek:<epoch> / kpair:<linkId>:<version>,
   spec §0.4; raw keys never returned to callers; KEY_NOT_FOUND per threat-model T-3 #2).
   Inject SecureStore via src/app/di/Container.ts. REUSE the deviceId minted by
   src/data/syncStamp.ts — do not create a second identity.
4. RHEA-065: tests/unit/crypto/keyring.spec.ts — custody round-trip, negative test
   that generic store reads never expose raw key bytes, DEK epoch + kpair version
   resolution edge cases, persistence across container reloads.

Rules: no custom crypto (libsodium only, calls confined to src/crypto/); repository
must stay green — run `npm run typecheck && npm run lint && npm test && npm run build`
after every task and fix failures immediately; do not create git commits or push;
after each task update docs/V2_TASKS.md (Status fields), docs/IMPLEMENTATION_STATUS.md,
and append decisions to docs/IMPLEMENTATION_JOURNAL.md (start session S4); write an
ADR for any significant architectural decision; keep documentation synchronized with
the code. When M2.2 is done, continue autonomously with M2.3 (recovery phrase) unless
instructed otherwise.
```
