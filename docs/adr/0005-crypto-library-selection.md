# ADR-0005: Cryptographic library selection — libsodium-wrappers-sumo (+ @scure/bip39)

**Status:** Accepted · **Date:** 2026-07-15 (written before M2.1 implementation, per the
"no custom crypto / audited libraries / ADR before implementation" rule)

## Context
Phase 2 introduces the full E2EE system (spec Ch. 5): XChaCha20-Poly1305 AEAD
for every synced payload, X25519 key agreement + Ed25519 signatures for
pairing/enrollment, Argon2id for the recovery KEK, keyed BLAKE2b for record-key
hashing and SAS, BIP39 for the recovery phrase, plus constant-time compare and
zeroization. Targets: web PWA today (Vite/browser + Vitest/Node), Capacitor
webview in Phase 3.

## Problem
Which established, audited implementation(s) provide all primitives, on all
targets, with acceptable performance — especially Argon2id at the pinned
`recovery` profile (ops=4, mem=256 MiB), which is memory-hard by design?

## Decision
- **`libsodium-wrappers-sumo`** (libsodium.js, the Emscripten build of
  libsodium) for **all** primitives: `crypto_aead_xchacha20poly1305_ietf_*`,
  `crypto_kx_*` (X25519), `crypto_sign_*` (Ed25519), `crypto_pwhash`
  (Argon2id — **requires the sumo build**; the standard `libsodium-wrappers`
  package omits it), `crypto_generichash` (BLAKE2b, keyed),
  `crypto_kdf_derive_from_key`, `randombytes_buf`, `sodium.memcmp`,
  `sodium.memzero`, `sodium.pad/unpad`.
- **`@scure/bip39`** only for the BIP39 mnemonic *encoding* (wordlist +
  checksum); entropy comes from libsodium's RNG. BIP39 encoding is
  deterministic serialization, not cryptography.
- All libsodium calls go through `src/crypto/` wrappers; **no other module may
  call the library directly** (lint-enforced zone: `crypto/` imports kernel +
  libsodium only).

## Alternatives considered
1. **@noble/ciphers + @noble/curves + @noble/hashes (+ @scure/bip39)** — the
   audited pure-TS stack (Trail of Bits / Cure53 audits). Pros: tiny,
   tree-shakeable ESM, no WASM/asm.js init, no async `ready`. Cons: **pure-JS
   Argon2id at 256 MiB is prohibitively slow on mobile webviews** (multi-second
   to tens of seconds; the pinned recovery profile is frozen as
   `recovery-argon2id-v1` and cannot be weakened to fit a slow implementation);
   no `crypto_kx` equivalent (we would hand-compose X25519 + HKDF session
   derivation — more custom protocol surface, which the project rules forbid
   when an established composition exists).
2. **WebCrypto (SubtleCrypto)** — no XChaCha20-Poly1305, no Argon2id, no
   Ed25519 in all target browsers. Would force AES-GCM + PBKDF2 — weaker fit
   and still needs a second library. Rejected as the primary provider; **it is
   still used for the non-extractable AES-GCM master wrapping key** in
   `WebSecureStore` (M2.2), where non-extractability is the whole point.
3. **libsodium standard build (`libsodium-wrappers`)** — missing
   `crypto_pwhash` (Argon2id); would need a separate argon2 WASM package →
   two crypto suppliers instead of one. Rejected.
4. **argon2-browser + noble stack** — mixes suppliers and adds an
   un-audited-glue surface. Rejected.

## Trade-offs
- **Bundle size:** the sumo build is large (~≥300 KB gz). Accepted; mitigated
  by dynamic-importing the crypto module so first paint doesn't pay for it
  (follow-up noted below).
- **Async init:** every entry point must `await sodium.ready` — wrapped once
  in `src/crypto/sodium.ts` singleton.
- **asm.js/WASM performance:** Argon2id 256 MiB runs in ~1–3 s in the
  Emscripten build — acceptable for a recovery flow that runs rarely.
- **CSP:** libsodium.js ships as plain JS (asm.js-style), so no
  `wasm-unsafe-eval` CSP requirement.

## Consequences
- One audited supplier for all hot-path crypto; primitives match spec Ch5 §5
  1:1, so the spec's operation table is directly implementable.
- Known-answer tests (RHEA-062, RHEA-066) pin the constructions so a future
  library swap cannot silently change ciphertext formats.
- `@types/libsodium-wrappers-sumo` provides typings; versions pinned in
  `package.json` (`libsodium-wrappers-sumo@0.8.4`, `@scure/bip39@2.2.0`).

## Future considerations
- Code-split `src/crypto/` behind a dynamic import when bundle size becomes a
  gate (tracked as tech debt in IMPLEMENTATION_STATUS).
- If WebCrypto gains XChaCha20-Poly1305/Argon2id broadly, revisit for the
  at-rest path only; wire format is already pinned by KATs.
- Phase 3 may move Argon2id + AEAD into a native plugin for performance;
  the KAT vectors guarantee cross-implementation compatibility.
