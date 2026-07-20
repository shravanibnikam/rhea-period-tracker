# Next Session Brief — resume at M2.2

> 🕰️ **Historical / superseded (2026-07-15 planning snapshot).** The v2 branch has
> since merged to `main` and deployed; pairing was fixed and delete-sync fixes shipped.
> This file's *implementation status is frozen at 2026-07-15* — for current state see
> [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) and the root `README.md`. The
> Phase-2 milestone/design guidance below is still useful, but the migration numbers
> `0004`–`0010` cited here **predate the shipped `0004` pairing fix** — the E2EE
> sequence has shifted to `0005`+.

**Written 2026-07-15 (session S3), paused after completing M2.1. The project is being
handed off to a new engineer — read [HANDOFF.md](HANDOFF.md) FIRST; this file is the
task-level resume brief it points to.**

Repo state: branch `rhea-v2-preparation`, working tree **clean** (all work is in HEAD
`16d4360`, committed by the repository owner; the implementation sessions created no
commits and pushed nothing). All four gates green (`tsc` ✓ ·
`eslint --max-warnings=0` ✓ · **228/228 tests** ✓ · `vite build` ✓).
**M2.2 has NOT been started.**

## Exact stopping point
- Phase 2, after **M2.1 (RHEA-060…062)**: `src/crypto/{sodium,envelope,errors,aead,index}.ts`
  + pinned KAT vectors (`tests/fixtures/vectors/aead.json`, generator beside it)
  + crypto ESLint zone + `tests/setup.ts` awaits `getSodium()`.
- Same session also: fixed critique-H2/R-OFF-1 merge defect (see
  IMPLEMENTATION_JOURNAL S3.2), established `docs/adr/` (0001–0005),
  synchronized ALL planning docs to the code, tightened the lint gate.

## Suggested first task: RHEA-063 (`SecureStore` seam + `WebSecureStore`)
Then RHEA-064 (keyring), RHEA-065 (suite) — that completes M2.2.
Before any code: write **ADR-0006** (web key-custody decision) — cryptographic
decisions require an ADR first (project rule; see docs/adr/0001).
A ready-to-paste Codex prompt for exactly this work is at the end of
[HANDOFF.md](HANDOFF.md).

Implementation notes agreed in the docs (read these first):
- Spec Ch5 §3.3–§3.4 (SecureStore + Keyring contracts), Ch3 §3.2 (seam
  signature with `custody: 'software-idb' | 'keystore' | 'secure-enclave'`),
  §0.4 (colon keyId grammar `dek:<epoch>`, `kpair:<linkId>:<version>`),
  §0.10 K (deviceId = 128-bit base64url — **already minted by
  `src/data/syncStamp.ts`; keyring must reuse it, not mint a second id**).
- New `src/platform/` layer (tasks file paths: `src/platform/seams/SecureStore.ts`,
  `src/platform/web/WebSecureStore.ts`) → add the `platform/` ESLint zone
  (may import kernel + data-StorageDriver types only; spec Ch3 §3.1).
- WebSecureStore: non-extractable AES-GCM 256 MWK via WebCrypto
  (`generateKey(..., extractable:false, ['encrypt','decrypt'])`), the
  `CryptoKey` HANDLE persisted by structured clone; wrapped secrets in the
  account-scoped DB's `keyring` store (schema v2 already has it, unused).
  fake-indexeddb + Node's WebCrypto both support this in Vitest.
- Keyring holds: device X25519 (`crypto_kx_keypair`) + Ed25519
  (`crypto_sign_keypair`) identity, DEK (`generateKey()` from crypto/aead),
  `seal/open` BY KEY-ID (raw keys never leave the keyring), multi-epoch DEK
  resolution, `KEY_NOT_FOUND` per T-3 #2.
- Container wiring: inject SecureStore via `app/di/Container.ts` (RHEA-064
  files list).
- Write an ADR (0006) for the MWK web-custody decision (non-extractable
  WebCrypto MWK vs password-derived vs plaintext-IDB) BEFORE implementing —
  crypto rule from the user directive.

## Remaining implementation order (unchanged)
M2.2 → M2.3 (kdf+recovery, Argon2id profile frozen ops=4/mem=256MiB) → M2.4
(migration **0005** ciphertext cutover, dual-read/write + backfill, `e2eeOwner`
flag) → M2.5 (**0006** QR+SAS pairing) → M2.6 (enrollment) → M2.7 (PrivacyEngine)
→ M2.8 (**0007** projections) → M2.9 (partner cutover, retires legacy plaintext
pull) → M2.10 (**0008** notes) → M2.11 (**0009** quiet windows) → M2.12 (**0010** local
audit) → M2.13 (**0011** drop plaintext ACL) → Phase 3 (SDK-less subset) →
Phase 4 seeds → docs/FINAL_IMPLEMENTATION_REPORT.md.

## Outstanding blockers / caveats
1. **No local Postgres/Supabase** — migrations 0001–0003 + pgTAP authored,
   never executed; pgTAP NOT in CI. Pre-deploy action on the risk register.
2. **No Android/iOS SDKs** — Phase 3 native builds unverifiable here.
3. **No human security reviewer** — crypto sign-off recorded as pending on
   RHEA-061; required pre-launch.
4. Node = scratchpad install v22.11.0 (PATH prefix in session notes); Vite
   chunk-size warning = sumo bundle (tech debt: dynamic-import crypto).

## Architectural context a newcomer needs
- Layering (lint-enforced): `kernel ← domain ← crypto ← data ← sync ← app`
  (+ `platform` arrives in M2.2). `CipherEnvelope` type lives in
  `crypto/envelope.ts`; data re-exports it; AAD assembly (`buildAad`) in
  `data/envelope.ts`.
- Envelope passthrough: payloads are `PlainEnvelope (alg:'none')` until the
  M2.4 cutover; merge/outbox/cursor machinery already runs the final shapes.
- DailyLog is the single source of truth; partners must never receive raw
  logs (legacy plaintext partner pull survives ONLY until M2.9).
- Docs: RHEA_V2_TECHNICAL_SPEC.md is design authority (§0.10 wins conflicts);
  V2_TASKS.md has per-task Status fields; journal S3 has today's decisions;
  ADR-0005 fixes the crypto supplier.
