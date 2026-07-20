# Rhea v2 — Technical Risk Register

> 🧊 **Planning artifact — implementation status frozen at the 2026-07-15 planning state.** The v2 branch has since merged to `main` and deployed; for current state see the root `README.md` and [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md). Note: several pre-deploy risks referenced here (e.g. pgTAP RLS verification) remain **open** — see the migrations README. Migration numbers `0004`+ predate the shipped `0004` pairing fix — the E2EE sequence has shifted to `0005`+.

> **Purpose.** A living inventory of the significant technical risks in the Rhea
> v2 design, each with an impact/likelihood rating, the components it touches, a
> mitigation (reduce probability/impact *before* it happens), a contingency (what
> to do *after* it happens), a detection method, and a priority. Reviewed against
> [RHEA_V2_TECHNICAL_SPEC.md](RHEA_V2_TECHNICAL_SPEC.md) and grounded in the
> verified findings of [ARCHITECTURE_CRITIQUE.md](ARCHITECTURE_CRITIQUE.md).
>
> Where a risk corresponds to a verified critique finding, the finding id is cited
> (e.g. *→ H1 / CRYP-3*). This is a design-time register; **no source code was
> modified.**

---

## 1. Rating scales

**Impact** — the worst credible consequence if the risk materializes.

| | Meaning |
|---|---|
| **Critical** | Irreversible loss of a user's health data, or a confidentiality breach exposing plaintext health data / endangering a user. |
| **High** | Significant data loss or feature outage recoverable only with effort; material privacy degradation; a release-blocking defect. |
| **Medium** | Bounded/partial data loss, degraded UX, or a leak of coarse (non-content) metadata. |
| **Low** | Cosmetic, transient, self-healing, or a consciously-accepted disclosed tradeoff. |

**Likelihood** — probability the adverse event occurs over the product lifetime **if the risk is left unmitigated**.

| | Meaning |
|---|---|
| **High** | Will occur in normal operation / affects most users, or a design ambiguity certain to bite. |
| **Medium** | Plausible for a meaningful fraction of users or under a realistic condition. |
| **Low** | Requires an uncommon sequence, a specific adversary, or a rare device state. |
| **Rare** | Edge of edge cases. |

**Priority** derives from impact × likelihood, then is elevated for the critique's
pre-implementation blockers.

| Impact ↓ / Likelihood → | High | Medium | Low | Rare |
|---|---|---|---|---|
| **Critical** | P1 | P1 | P2 | P2 |
| **High** | P1 | P2 | P2 | P3 |
| **Medium** | P2 | P2 | P3 | P3 |
| **Low** | P3 | P3 | P4 | P4 |

- **P1 — Urgent:** design or fix before the relevant milestone ships; the H-tier of the critique lives here.
- **P2 — Planned:** owned, mitigated in the backlog, with a tested contingency.
- **P3 — Monitor:** instrument and watch; act if signals appear.
- **P4 — Accept:** disclosed/residual; revisit only if conditions change.

---

## 2. Risk summary (heat table)

| ID | Risk | Impact | Likelihood | Priority |
|---|---|---|---|---|
| **R-DL-1** | Local store eviction destroys the source of truth (web) | Critical | Medium | **P1** |
| R-DL-2 | `v1→v2` migration failure loses/orphans records | High | Low | P2 |
| R-DL-3 | Over-broad wipe on sign-out / account-switch / unpair | High | Low | P2 |
| **R-ENC-1** | Ambiguous at-rest model → double-encryption or weaker posture | High | High | **P1** |
| R-ENC-2 | AEAD open failure / quarantine renders records unreadable | High | Low | P2 |
| R-ENC-3 | `K_pair` derived two ways → all partner ciphertext fails to open | High | Medium | P2 |
| R-ENC-4 | libsodium WASM fails to load/init | High | Low | P2 |
| R-SYNC-1 | Whole-record LWW silently drops a concurrent field edit | Medium | Medium | P2 |
| R-SYNC-2 | Cutover changes key- and payload-shape → split-brain rows | High | Medium | P2 |
| R-SYNC-3 | Non-rotation-stable wire key → tombstone miss → data resurrects | High | Low | P2 |
| R-DB-1 | IndexedDB corruption / blocked upgrade | High | Low | P2 |
| R-DB-2 | SQLCipher DB corruption on mobile | High | Low | P2 |
| R-DB-3 | Storage quota exceeded mid-transaction | Medium | Medium | P2 |
| **R-DEV-1** | New device, local-only user, no backup → total loss | Critical | Medium | **P1** |
| R-DEV-2 | Multi-device enrollment fails → 2nd device can't decrypt | Medium | Medium | P2 |
| R-DEV-3 | Lost/stolen device retains DEK; `revoked` flag is inert | High | Low | P2 |
| **R-KEY-1** | Recovery phrase lost/mistranscribed → permanent loss | Critical | Medium | **P1** |
| R-KEY-2 | OS clears Keystore/Keychain → keys gone | High | Medium | P2 |
| R-KEY-3 | Incomplete rekey cascade leaves `recovery_blob` under old DEK | High | Low | P2 |
| **R-PAIR-1** | QR auto-confirm MITM on the partner key | High | Medium | **P1** |
| R-PAIR-2 | SAS ceremony friction → abandonment / click-through | Low | Medium | P3 |
| R-PAIR-3 | Invite-redemption race / hijack regression | High | Low | P2 |
| R-PRIV-1 | Plaintext `share_gates` leaks sharing categories | Medium | Medium | P2 |
| **R-PRIV-2** | Coercion/abuse: signaling unpair + no duress design | High | Medium | **P1** |
| R-PRIV-3 | Write-timing metadata reveals logging cadence | Medium | High | P2 |
| R-PRIV-4 | Immutable local audit log is self-incriminating under seizure | Medium | Low | P2 |
| **R-PRIV-5** | RLS misconfiguration exposes cross-account / partner data | Critical | Low | **P1** |
| R-PRIV-6 | Plaintext exposure during the M2.4 dual-read window | High | Low | P2 |
| R-MOB-1 | Background suspension / Doze kills realtime socket | Low | High | P3 |
| R-MOB-2 | Argon2id 256 MiB → OOM/ANR on low-end Android | Medium | Medium | P2 |
| R-MOB-3 | App-store rejection (no in-app account deletion, health decl.) | High | Medium | P2 |
| R-MOB-4 | iOS local-notification cap / scheduling limits → missed reminders | Low | Medium | P3 |
| R-OFF-1 | Long-offline `resync()` restores nothing (single-device) | Critical | Low | ~~P1~~ **Closed 2026-07-15** |
| R-OFF-2 | Outbox unbounded growth during extended offline | Medium | Low | P3 |
| R-BAK-1 | No automated backup for local-only users | High | Medium | P2 |
| R-BAK-2 | Restore accepts a rolled-back/withheld server snapshot | Medium | Low | P3 |
| R-BAK-3 | Export/import format or version bug corrupts restore | Medium | Low | P2 |
| R-PERF-1 | Decrypt-on-boot budget blown on low-end devices | Medium | Medium | P2 |
| R-PERF-2 | `postgres_changes` scaling cliff / connection cost | Medium | Medium | P2 |
| R-PERF-3 | Re-encryption backfill burst on E2EE cutover | Low | Medium | P3 |
| **R-PROJ-1** | Serial multi-month critical path for optional features | High | High | **P1** |
| R-PROJ-2 | Spec inconsistency → weaker crypto construction shipped | High | Low | P2 |

**P1 watchlist (10):** R-DL-1, R-ENC-1, R-DEV-1, R-KEY-1, R-PAIR-1, R-PRIV-2, R-PRIV-5, ~~R-OFF-1~~ (closed 2026-07-15), R-PROJ-1 — plus R-ENC-3 as a pre-Phase-2 spec fix.

> **Standing pre-deploy action (2026-07-15):** the pgTAP suites exist as files
> (`supabase/tests/rls_invite.sql`, `supabase/tests/rls_owner_sync.sql`) but are
> **not wired into CI**, and migrations `0001`–`0003` are authored but have
> **never been executed against a live database**. Before enabling any Phase-2
> server feature: wire pgTAP into `.github/workflows/ci.yml` and apply + verify
> migrations `0001`–`0003`. Rows below that previously claimed "pgTAP in CI" /
> "pgTAP blocks merges" (R-PAIR-3, R-PRIV-5) are corrected accordingly.

---

## 3. Data loss

### R-DL-1 · Local store eviction destroys the source of truth
- **Description:** On web (especially iOS Safari / home-screen PWA), the browser can evict IndexedDB under storage pressure or ITP inactivity. For a local-first app where the device *is* the source of truth, eviction is permanent loss of the user's entire history. *(→ PLAT-6)*
- **Impact:** Critical — irreversible loss of all local health data for a local-only user.
- **Likelihood:** Medium — common on iOS web over time; lower on Android/installed PWA.
- **Affected components:** `platform/web` IndexedDbDriver, `data/schema`, iOS Safari/WKWebView, local-only (no-cloud) mode.
- **Mitigation:** Call `navigator.storage.persist()` and surface an install-PWA / grant-persistence prompt; gate meaningful history accumulation for local-only users on either a granted persistence, a completed export, or a cloud account; move mobile to native SQLite (durable) via Capacitor.
- **Contingency:** Restore from the most recent export/backup or (if cloud enabled) re-sync from the server; if neither exists, the data is unrecoverable — communicate honestly.
- **Detection:** Query `navigator.storage.persisted()` and `estimate()` on launch; telemetry counter for "opened to empty store after prior non-empty state."
- **Priority:** **P1.**

### R-DL-2 · `v1→v2` IndexedDB migration failure loses or orphans records
- **Description:** A failed or partial `upgrade(1→2)` (new stores, `by_updatedAt` index, epoch-0 backfill) could corrupt or drop data.
- **Impact:** High — loss of pre-v2 history at the moment of upgrade.
- **Likelihood:** Low — migration is designed additive/idempotent with "v1 must remain readable on failure" (Ch7 axis 1).
- **Affected components:** `src/data/migrations/indexeddb/v1_to_v2.ts`, `src/data/schema.ts`.
- **Mitigation:** **Implemented (Phase 1, verified 2026-07-15):** `src/data/migrations/indexeddb/v1_to_v2.ts` is strictly additive and idempotent by construction (creates only missing stores/indexes), covered by `tests/unit/data/driver.contract.spec.ts`. Not yet landed: canary rollout and `upgradeneeded` error telemetry.
- **Contingency:** Ship a corrective `v2→v2'` forward migration; never downgrade; the legacy `"rhea"` DB is retained one release (M0.4) for lossless fallback.
- **Detection:** Migration unit tests in CI; post-migration record-count assertion and error telemetry remain future work.
- **Priority:** P2 — mitigation **Implemented** (Phase 1); telemetry/canary outstanding.

### R-DL-3 · Over-broad wipe on sign-out / account-switch / unpair
- **Description:** `clearAll`/`destroy` fired against the wrong scope (e.g. wiping owner data on partner unpair, or on account switch) deletes data that should persist.
- **Impact:** High — accidental deletion of owner history.
- **Likelihood:** Low.
- **Affected components:** `StorageDriver.destroy`, `useAuth`, `src/app/lib/pairing.ts`, account-scoped DB name (M0.4).
- **Mitigation:** **Implemented (Phase 0/1, verified 2026-07-15):** account-scoped DB names via `src/data/storageManager.ts` (`rhea-<uid>` / `rhea-local`), with wipe/switch behavior tested in `tests/unit/data/db.account.spec.ts`; deletes propagate via tombstones written atomically in `src/data/repositories/LogRepository.ts` (`delete()`), so unpair/wipe cannot silently resurrect or over-delete owner data.
- **Contingency:** Restore from export/cloud; retain legacy DB one release.
- **Detection:** Tests asserting scope isolation (`tests/unit/data/db.account.spec.ts`); a confirmation step before any destructive wipe in the UI.
- **Priority:** P2 — mitigation **Implemented** (Phase 0/1).

---

## 4. Encryption failures

### R-ENC-1 · Ambiguous at-rest model → double-encryption or weaker posture
- **Description:** Ch6 describes native storage as plaintext columns under SQLCipher, while Ch12/Ch13 describe already-sealed `CipherEnvelope` blobs decrypted on boot. Building the wrong one yields either double-encryption (SQLCipher + XChaCha20, both keys in one Keychain) or a weaker, platform-divergent posture — and invalidates the performance budget. *(→ H4 / PLAT-1)*
- **Impact:** High — wrong security posture or blown perf budget on the most constrained devices.
- **Likelihood:** High — an unresolved contradiction *will* produce divergent implementations.
- **Affected components:** `data/drivers/SqliteDriver`, `IndexedDbDriver`, `crypto/aead`, Ch6/Ch12/Ch13.
- **Mitigation:** **Pin one representation before any storage code** — recommended: opaque ciphertext KV, drop SQLCipher; reconcile Ch6/12/13 to state it identically.
- **Contingency:** If double-encryption ships, a one-time re-store pass strips the redundant layer; if plaintext-columns ship, re-seal into envelopes.
- **Detection:** Spec-consistency review gate; a storage-layer test asserting on-disk bytes are ciphertext and are singly-encrypted.
- **Priority:** **P1** (pre-implementation blocker).

### R-ENC-2 · AEAD open failure / quarantine renders records unreadable
- **Description:** A corrupted ciphertext, an AAD mismatch, or (tail risk) byte-level `canonicalJSON` drift between `seal` and `open` across engines causes records to fail authentication and be quarantined. *(→ CRYP-7; verifier refuted mass-failure but a tail exists)*
- **Impact:** High — affected records become unreadable until repaired.
- **Likelihood:** Low — identical libsodium-in-webview runs on both targets; flat ASCII AAD; KAT-frozen (RHEA-062).
- **Affected components:** `crypto/aead`, `data/envelope`, AAD assembly, `sync/reconcile`.
- **Mitigation:** Pin the exact byte canonicalization (or use a length-prefixed concat instead of JSON); KAT vectors; quarantine (never silent-accept) on mismatch.
- **Contingency:** Quarantined records are re-fetched/re-derived from the owner source or the server copy; a repair pass re-seals; nothing is deleted on a failed open.
- **Detection:** Quarantine counter + alert; cross-engine KAT in CI (web vs. Capacitor JS).
- **Priority:** P2.

### R-ENC-3 · `K_pair` derived two incompatible ways → all partner ciphertext fails to open
- **Description:** §0.10.L (server-session `rx`) and the §6.2 sequence (server `.tx`/client `.rx`) select different 32-byte halves; owner and partner branches coded from different sections derive different keys, so every projection/note fails to open. *(→ M-CRYP-2)*
- **Impact:** High — total, silent breakage of all partner sharing.
- **Likelihood:** Medium — a single shared `kdf.ts` implemented one way works at runtime; the risk is coding the two roles from different sections.
- **Affected components:** `crypto/kdf`, `crypto/pairing`, `ProjectionPublisher`, `NotesGateway`, RHEA-066.
- **Mitigation:** State one derivation once; better, replace `crypto_kx` with `crypto_scalarmult(sk, peer_pk) → BLAKE2b(dh ‖ linkId ‖ "rhea-kpair-v1")` (symmetric by construction, no rx/tx choice); a shared two-party KAT that both roles must match.
- **Contingency:** Re-pair (mints a fresh `K_pair`) to recover a broken link.
- **Detection:** RHEA-066 "identical bytes on both sides" test; an integration test pairing two real clients.
- **Priority:** P2 (fix the spec/KAT before Phase 2).

### R-ENC-4 · libsodium WASM fails to load or initialize
- **Description:** The WASM module fails to fetch/instantiate (CSP, cache miss, memory) → no crypto → nothing decrypts.
- **Impact:** High — app cannot read encrypted data until resolved.
- **Likelihood:** Low.
- **Affected components:** `crypto/sodium` ready() singleton, service worker precache, CSP.
- **Mitigation:** Precache the WASM in the SW; `sodium.ready()` gate with retry; explicit error surface if unavailable.
- **Contingency:** Block crypto operations behind a typed error with a "reload / update" prompt rather than corrupting state; owner data remains intact locally.
- **Detection:** ready() failure telemetry; a startup self-test seal/open round-trip.
- **Priority:** P2.

---

## 5. Sync conflicts

### R-SYNC-1 · Whole-record LWW silently drops a concurrent field edit
- **Description:** The merge unit is the entire `DailyLog` for a date; two owner devices editing different fields of the same day offline converge to the higher-timestamp whole record, dropping the other edit with no surfaced conflict. *(→ SYNC-1; documented accepted tradeoff)*
- **Impact:** Medium — bounded loss of one field's edit on a contested day.
- **Likelihood:** Medium once multi-device (M2.6) ships; Low before.
- **Affected components:** `domain/merge`, `LogRepository`, `sync/reconcile`.
- **Mitigation:** For multi-device, adopt per-field record keys (`log:DATE#symptoms`) reusing the exact LWW pipeline; until then, single-device avoids concurrency.
- **Contingency:** None automatic (the loser is not retained); if field-level merge is deferred, disclose the multi-device caveat.
- **Detection:** Instrument same-key merges where both sides changed since a common base; a "conflict occurred" counter.
- **Priority:** P2.

### R-SYNC-2 · E2EE cutover changes key- and payload-shape together → split-brain rows
- **Description:** At M2.4 the wire key flips from plaintext-date to keyed-hash *and* the payload becomes ciphertext simultaneously; with a client-side flag + SW cache skew, two devices of one account write disjoint-PK rows that never meet in LWW. *(→ M-SYNC-4)*
- **Impact:** High — silent divergence + duplicate server rows for the same day.
- **Likelihood:** Medium — a web user with two browsers (both holding the DEK) can hit it; M2.4 is otherwise single-device.
- **Affected components:** `SupabaseTransport`, `LogRepository`, migration `0004`, `flags.e2eeOwner`.
- **Mitigation:** Never change key- and payload-shape in the same expand→migrate→contract window — introduce the hashed wire key from a rotation-stable naming key in a *separate earlier* additive step, flip only the payload at M2.4; make `e2eeOwner` a per-account server-gated flag, not a client bundle flag.
- **Contingency:** A reconciliation pass that maps legacy-keyed rows to hashed keys and de-dupes by (date) once all devices are upgraded.
- **Detection:** Duplicate-day detector server-side; count of rows still on the legacy key-shape post-cutover.
- **Priority:** P2.

### R-SYNC-3 · Non-rotation-stable wire key → tombstone miss → deleted data resurrects
- **Description:** `recordKeyHashKey` is derived from the epoch-versioned DEK, so a `rotateDEK` changes every wire key; a new-epoch tombstone lands on a different PK than the old-epoch live row it must shadow, so the deleted day reappears on peers. *(→ M-SYNC-5)*
- **Impact:** High — resurrection of intentionally-deleted health data (a privacy failure).
- **Likelihood:** Low — DEK rotation is manual/compromise-only. (Unpair/re-pair is unaffected — projections are `link_id`-keyed with wipe-on-unpair.)
- **Affected components:** `crypto/keyring` (naming key), `LogRepository` wire-key derivation, tombstones, `rotateDEK`.
- **Mitigation:** Derive `recordKeyHashKey` from a dedicated rotation-independent naming key seeded once at account creation; add a test that rotation preserves wire keys.
- **Contingency:** After a rotation, run an orphan-purge that re-hashes and re-keys historical rows and re-applies live tombstones.
- **Detection:** Post-rotation test asserting tombstones still shadow; server scan for pre- and post-epoch rows for the same logical key.
- **Priority:** P2 (close before `rotateDEK` ships).

---

## 6. Corrupted local databases

### R-DB-1 · IndexedDB corruption / blocked upgrade
- **Description:** A second open tab holding a connection blocks an upgrade, or the store is corrupted, leaving the app unable to open its DB.
- **Impact:** High — app can't read/write locally until resolved.
- **Likelihood:** Low.
- **Affected components:** `src/data/drivers/IndexedDbDriver.ts` (blocked/blocking/versionchange handlers), `src/data/schema.ts`.
- **Mitigation:** **Implemented (Phase 1, verified 2026-07-15):** `src/data/drivers/IndexedDbDriver.ts` wires `blocking`/`onversionchange` handlers and transactional writes, covered by `tests/unit/data/driver.contract.spec.ts`. Not yet landed: the close-other-tabs UI prompt.
- **Contingency:** Rebuild the DB from the server (cloud) or export (local); if corrupted beyond read, offer an import-from-backup recovery screen rather than silently failing.
- **Detection:** Driver contract tests in CI; open-failure telemetry and a launch integrity self-check remain future work.
- **Priority:** P2 — handler mitigation **Implemented** (Phase 1); telemetry/UI prompt outstanding.

### R-DB-2 · SQLCipher database corruption on mobile
- **Description:** An interrupted write (crash, battery death) or full storage corrupts the SQLCipher file.
- **Impact:** High — local loss on native.
- **Likelihood:** Low.
- **Affected components:** `platform/capacitor/CapStorage`, `SqliteDriver`, SQLCipher.
- **Mitigation:** WAL mode; transactional writes; keep the pre-migration IndexedDB until the SQLite copy is verified (M3.2 verify-then-swap).
- **Contingency:** Re-sync from cloud or re-import export; SQLCipher `.recover` as a best-effort salvage.
- **Detection:** `PRAGMA integrity_check` on open; corruption error telemetry.
- **Priority:** P2.

### R-DB-3 · Storage quota exceeded mid-transaction
- **Description:** A write fails partway when the origin/device quota is exhausted, risking inconsistent state.
- **Impact:** Medium — a failed/partial write; potential inconsistency.
- **Likelihood:** Medium — plausible on constrained devices with long histories + padding + outbox.
- **Affected components:** all repositories, outbox, `StorageDriver.transaction`.
- **Mitigation:** All domain-write-plus-outbox-enqueue in one atomic transaction (so a quota failure rolls both back); tombstone GC + outbox drain to bound growth; sensible padding buckets (padmé).
- **Contingency:** Surface a "storage full" typed error; offer export + prune; never leave a half-applied write.
- **Detection:** `QuotaExceededError` handling; `storage.estimate()` headroom warning.
- **Priority:** P2.

---

## 7. Device replacement

### R-DEV-1 · New device, local-only user, no backup → total loss
- **Description:** A local-only user (no cloud account) who replaces or loses their device has no server copy; IndexedDB is origin-partitioned so a native install can't read the web DB either — a fresh install is empty. *(→ PLAT-5)*
- **Impact:** Critical — total, irreversible loss of history.
- **Likelihood:** Medium — the flagship privacy persona is exactly the one with no cloud copy.
- **Affected components:** local-only mode, `data/exporter`/`importer`, Capacitor migration bridge.
- **Mitigation:** A guided export→import bridge triggered from the web app when a native install is likely; periodic "your data isn't backed up" prompts for local-only users; make export frictionless.
- **Contingency:** Import a previously-saved export file; if none exists, unrecoverable — set expectations honestly at onboarding.
- **Detection:** Track "local-only user with no export in N days"; first-run-empty telemetry on native.
- **Priority:** **P1.**

### R-DEV-2 · Multi-device enrollment fails → second device can't decrypt
- **Description:** The QR + `crypto_kx` + SAS enrollment fails or is misimplemented, so the second device never receives a usable DEK.
- **Impact:** Medium — second device unusable; owner data safe on the first.
- **Likelihood:** Medium — multi-party ceremonies are error-prone.
- **Affected components:** `crypto/enrollment`, `device_keys`, `DevicesSection`.
- **Mitigation:** SAS-gated ceremony with clear abort/timeout; enrollment behind `flags.multiDevice`; recovery phrase as the always-available fallback path to a new device.
- **Contingency:** Fall back to recovery-phrase restore on the second device instead of enrollment.
- **Detection:** Enrollment success/failure telemetry; a post-enrollment decrypt self-test.
- **Priority:** P2.

### R-DEV-3 · Lost/stolen device retains the DEK; `revoked` flag is inert
- **Description:** Enrollment gives every device the single account DEK; `device_keys.revoked` has no consumer, so a stolen device can still decrypt all history. *(→ M-CRYP-9)*
- **Impact:** High — confidentiality loss of full history to whoever holds the old device.
- **Likelihood:** Low.
- **Affected components:** `crypto/keyring`, `device_keys`, `rotateDEK`, `recovery_blob`.
- **Mitigation:** Define a "device lost → `rotateDEK` + re-enroll survivors + re-wrap `recovery_blob`" cascade as the revocation flow; until then mark `revoked` explicitly inert so it isn't mistaken for protection; hardware-backed, biometric-gated custody raises the bar on the device itself.
- **Contingency:** Owner initiates DEK rotation (new epoch, re-encrypt) which cryptographically cuts the lost device off from *future* writes; past ciphertext it already cached remains readable — disclose this.
- **Detection:** N/A pre-event; audit the rotation cascade in tests.
- **Priority:** P2.

---

## 8. Lost encryption keys

### R-KEY-1 · Recovery phrase lost or mistranscribed → permanent loss
- **Description:** The BIP39 recovery phrase is the only key-recovery path; if lost (or mis-copied and only 3-of-24 words were verified at setup), cloud ciphertext and any re-installed device are permanently undecryptable. *(→ CRYP-5; mostly a UX risk — the crypto is sound)*
- **Impact:** Critical — irreversible loss despite ciphertext existing on the server.
- **Likelihood:** Medium — recovery phrases are the #1 lost-data generator in E2EE consumer apps.
- **Affected components:** `crypto/recovery`, `crypto/kdf`, recovery onboarding UI.
- **Mitigation:** Verify **full** phrase re-entry at setup (not 3-of-24); offer an "encrypted recovery file to your password manager/cloud drive" alternative to hand-copying; a persistent (honest, non-nagging) "recovery not set up" reminder; keep the plaintext-export escape hatch.
- **Contingency:** If a cloud account and a valid session exist, the DEK is still wrapped and usable on current devices — encourage setting a *new* phrase immediately; otherwise unrecoverable.
- **Detection:** Track "cloud user without verified recovery"; setup completion/verification funnel.
- **Priority:** **P1.**

### R-KEY-2 · OS clears Keystore/Keychain → keys gone
- **Description:** A biometric change, OS reset, or Keychain eviction removes hardware-wrapped key material; the app needs the recovery phrase to re-derive.
- **Impact:** High — local decrypt blocked until recovery.
- **Likelihood:** Medium — biometric enrollment changes and OS events do clear Keystore entries.
- **Affected components:** `CapSecureStore`, `WebSecureStore`, `crypto/keyring`.
- **Mitigation:** Recovery phrase as backstop (must be set up before this is relied on); device-PIN/passcode fallback; re-key flow verify-then-remove.
- **Contingency:** Recovery-phrase restore re-derives the DEK; re-establish hardware custody afterward.
- **Detection:** Unwrap-failure telemetry; a key-presence check on launch.
- **Priority:** P2.

### R-KEY-3 · Incomplete rekey cascade leaves `recovery_blob` under the old DEK
- **Description:** After `rotateDEK`, if `recovery_blob` isn't re-wrapped under the new DEK, a later phrase-based restore yields a dead key. *(→ M-CRYP-9)*
- **Impact:** High — recovery silently fails when the user most needs it.
- **Likelihood:** Low.
- **Affected components:** `rotateDEK`, `crypto/recovery`, enrollment.
- **Mitigation:** Make `rotateDEK` re-wrap `recovery_blob` and re-enroll survivors atomically; a test asserting restore works after rotation.
- **Contingency:** If detected, re-run recovery setup under the current DEK before the old key is discarded.
- **Detection:** Post-rotation restore test; a self-check that `recovery_blob` decrypts under the current DEK epoch.
- **Priority:** P2.

---

## 9. Partner pairing failures

### R-PAIR-1 · QR auto-confirm MITM on the partner key
- **Description:** In-person QR pairing may auto-confirm (skip SAS), but only the owner's key crosses the visual channel; the partner's key returns over the untrusted server, which a malicious/compelled server can substitute → it reads the owner's shared projection. *(→ H1 / CRYP-3)*
- **Impact:** High — confidentiality breach of the shared projection (bounded: real partner's sync then breaks, eventually detectable).
- **Likelihood:** Medium — the server is explicitly in-scope as an adversary for this product.
- **Affected components:** `crypto/pairing`, `usePairing`, `PairingSection`, `pairing_sessions`.
- **Mitigation:** **Remove auto-confirm; always require the SAS tap on both screens.** Optionally add a bidirectional QR so both keys cross the visual channel.
- **Contingency:** If a mis-paired link is suspected, unpair (rotates `K_pair`) and re-pair with SAS verification.
- **Detection:** Monitor for partners whose sync never decrypts after pairing (a signature of key substitution); require SAS by construction so the failure can't occur silently.
- **Priority:** **P1.**

### R-PAIR-2 · SAS ceremony friction → abandonment or click-through
- **Description:** A multi-step QR + SAS ceremony causes users to abandon pairing or blindly confirm.
- **Impact:** Low — feature adoption/security-in-practice, not data integrity.
- **Likelihood:** Medium.
- **Affected components:** `usePairing`, pairing UI, copy.
- **Mitigation:** Clear, minimal-step ceremony with plain-language SAS comparison; don't over-explain; measure the funnel.
- **Contingency:** Provide an alternative (retry, resend) rather than a dead end.
- **Detection:** Pairing funnel analytics (started → SAS shown → confirmed).
- **Priority:** P3.

### R-PAIR-3 · Invite-redemption race / hijack regression
- **Description:** The pre-v2 "anyone read unused invites" hole (TM-R1) or a redemption race could reappear if the atomic `redeem_invite()` RPC or its RLS regresses.
- **Impact:** High — unauthorized pairing / account linkage.
- **Likelihood:** Low — fixed in M0.3 with `FOR UPDATE`, TTL, hashed secret, and pgTAP assertions (authored).
- **Affected components:** `redeem_invite()` RPC, `invites` RLS, `src/app/lib/pairing.ts`, migration `0002`.
- **Mitigation:** Atomic `SECURITY DEFINER` redemption with row lock + hash compare (migration `0002_secure_invite_redemption.sql`); pgTAP regression suite **authored** (`supabase/tests/rls_invite.sql`) but **not wired into CI**, and migrations `0001`–`0003` have never been executed against a live database. *(Corrected 2026-07-15.)*
- **Contingency:** Revoke affected invites/links; rotate `K_pair`; re-issue.
- **Detection:** pgTAP hijack tests exist as files but do **not** currently block merges — wiring them into CI + applying/verifying `0001`–`0003` is the standing pre-deploy action before any Phase-2 server feature; alert on multiple redemptions of one invite.
- **Priority:** P2.

---

## 10. Privacy leaks

### R-PRIV-1 · Plaintext `share_gates` leaks sharing categories
- **Description:** §10 claims the server can't see which gates are on, but a plaintext per-key `share_gates` table (owner rw, partner read) exposes e.g. "fertility/mood sharing is on" to a breach or subpoena. *(→ M-CRYP-1)*
- **Impact:** Medium — coarse category-level metadata (not health content) leaked; sensitive in the repro-health context.
- **Likelihood:** Medium — the contradiction exists as written.
- **Affected components:** `share_gates` table, RLS, `ProjectionPublisher`, `PrivacyEngine`.
- **Mitigation:** Delete `share_gates` server-side (gate state is already resolved owner-side and baked into the sealed projection) or fold it into the encrypted owner-meta blob; correct §10.
- **Contingency:** If already deployed, drop/encrypt the table in an additive-then-destructive migration.
- **Detection:** Schema review; a "no plaintext consent metadata server-side" check.
- **Priority:** P2.

### R-PRIV-2 · Coercion / abuse: signaling unpair + no duress design
- **Description:** The partner feature is a named abuse vector, yet quiet windows show "Sharing paused" and unpair makes the projection visibly vanish on the partner's device — signaling resistance to a coercive partner — and there is no duress/decoy/plausible-deniability design. *(→ H3 / COMP-1)*
- **Impact:** High — user-safety harm in an intimate-partner-violence scenario.
- **Likelihood:** Medium — the modal risk for this product class.
- **Affected components:** quiet windows (Ch4 §6), `unpair`, `PartnerView`, app-lock, copy.
- **Mitigation:** Non-signaling defaults for quiet windows and unpair (degrade to "looks stale-but-normal," which the TTL model already makes indistinguishable); a PIN/passphrase lock option that can be refused; a coercion & plausible-deniability design memo *before* partner sharing ships.
- **Contingency:** Emergency quick-unpair + local panic wipe reachable without signaling.
- **Detection:** N/A technically; validate via a safety design review and IPV-informed testing.
- **Priority:** **P1.**

### R-PRIV-3 · Write-timing metadata reveals logging cadence
- **Description:** Per-record `server_updated_at` + realtime events reveal when the user logs (cadence, gaps → inferable events), even though payloads and dates are hidden; jitter is deferred to "future." *(→ CRYP-6)*
- **Impact:** Medium — behavioral metadata, not content; sensitive for the post-Dobbs adversary.
- **Likelihood:** High — the channel is always present.
- **Affected components:** `SyncEngine`/outbox flush timing, `SupabaseTransport`, server metadata.
- **Mitigation:** Bring jittered/batched outbox flush into v2 scope (a small SyncEngine change) to decouple wall-clock write time from log time; keep positioning honest that timing is a disclosed residual.
- **Contingency:** N/A (accepted, disclosed residual if jitter is not shipped).
- **Detection:** N/A; treat as a known residual in the honest-disclosure statement.
- **Priority:** P2.

### R-PRIV-4 · Immutable local audit log is self-incriminating under seizure
- **Description:** An immutable on-device log of `data.exported` / `data.erased` / `partner.unpaired` / `recovery.used` is a record of exactly the actions an at-risk user needs to deny under device seizure or coercion. *(→ COMP-2)*
- **Impact:** Medium — aids a device-holding adversary.
- **Likelihood:** Low–Medium.
- **Affected components:** `privacy/consumers/AuditLog`, `audit` store.
- **Mitigation:** Exclude sensitive actions from the persisted audit (keep only crypto-lifecycle events, or drop the log); make it ephemeral/user-clearable; a full `eraseAllData` already clears it.
- **Contingency:** Panic-wipe clears the whole store including the audit.
- **Detection:** Design review of retained `AuditAction` set.
- **Priority:** P2.

### R-PRIV-5 · RLS misconfiguration exposes cross-account / partner data
- **Description:** A wrong or regressed Row-Level-Security policy lets a user read another owner's ciphertext rows, the pairing graph, or a partner read more than their projection. RLS is the coarse envelope ACL; a hole exposes routing metadata and (if combined with a key compromise) more.
- **Impact:** Critical — potential cross-account exposure of ciphertext + metadata.
- **Likelihood:** Low–Medium — the pgTAP RLS matrix is **authored but does not yet gate policy changes** (see mitigation).
- **Affected components:** all Supabase tables' RLS, migrations, `SupabaseTransport`.
- **Mitigation:** pgTAP owner/partner/unlinked assertions **authored** (`supabase/tests/rls_invite.sql`, `supabase/tests/rls_owner_sync.sql`, per RHEA-011/054) but **not wired into `.github/workflows/ci.yml`**; migrations `0001`–`0003` authored but never executed against a live database. **Standing pre-deploy action (2026-07-15):** wire pgTAP into CI and apply + verify `0001`–`0003` before enabling any Phase-2 server feature. Least-privilege policies; human security review on every RLS PR; default-deny.
- **Contingency:** Hotfix migration to tighten the policy; rotate affected `K_pair`; notify if a breach is confirmed.
- **Detection:** pgTAP suites exist as files but do **not** currently block merges *(corrected 2026-07-15)*; periodic RLS audit; anomaly alerts on cross-account read patterns.
- **Priority:** **P1.**

### R-PRIV-6 · Plaintext exposure during the M2.4 dual-read window
- **Description:** During the E2EE cutover, both plaintext and ciphertext columns exist (expand→migrate→contract); the plaintext isn't dropped until M2.13, extending server-side plaintext exposure.
- **Impact:** High — continued plaintext-on-server during the window.
- **Likelihood:** Low — bounded, sequenced, and gated by the invariant.
- **Affected components:** migration `0004`/`0010`, `SupabaseTransport`, `flags.e2eeOwner`, dual-read.
- **Mitigation:** Keep the window short; verify 100% ciphertext coverage before M2.13 drops the plaintext column (the precondition gate RHEA-106); the partner-plaintext ACL is revoked only after the projection replacement is live.
- **Contingency:** If coverage stalls, hold M2.13; the plaintext column enables lossless rollback in the interim.
- **Detection:** Coverage report (% rows with ciphertext); residual-plaintext scan (RHEA-109) before and after the drop.
- **Priority:** P2.

---

## 11. Mobile OS restrictions

### R-MOB-1 · Background suspension / Doze kills the realtime socket
- **Description:** iOS suspends and Android Doze drops the WebSocket in the background, so realtime events are missed.
- **Impact:** Low — realtime is a hint; correctness comes from the authoritative pull.
- **Likelihood:** High — happens routinely.
- **Affected components:** `SupabaseTransport.subscribe`, SyncEngine, heartbeat, resume handlers.
- **Mitigation:** Treat realtime as wake-up-only; `pull` on `resume`/`visibilitychange`/`online`; catch-up on reconnect (already designed).
- **Contingency:** The pull reconciles missed changes on next foreground; nothing is lost.
- **Detection:** Reconnect/catch-up telemetry; stale-projection banner via TTL.
- **Priority:** P3.

### R-MOB-2 · Argon2id 256 MiB → OOM / ANR on low-end Android
- **Description:** A 256 MiB contiguous WASM allocation can fail or trigger a low-memory kill on 2–3 GB Android; on the main thread it can ANR during fresh-install recovery. *(→ PLAT-4)*
- **Impact:** Medium — recovery (the worst moment) fails or janks.
- **Likelihood:** Medium on low-end devices.
- **Affected components:** `crypto/kdf` (Argon2id), recovery flow, crypto worker.
- **Mitigation:** Explicitly bind the KDF to the crypto worker (not the main thread); validate the 256 MiB choice on a low-RAM reference device and consider a versioned 128 MiB profile (entropy already justifies it).
- **Contingency:** Retry at a lower memlimit if allocation fails, recording the chosen params in the wrap version.
- **Detection:** Recovery success/failure + duration telemetry per device class; a low-end device in the test matrix.
- **Priority:** P2.

### R-MOB-3 · App-store rejection (missing account deletion, health declarations)
- **Description:** Apple Guideline 5.1.1(v) requires in-app account deletion (a server-side delete endpoint, distinct from local wipe); Google Play requires sensitive-health-data / content-rating declarations. None are designed. *(→ M-COMP-9)*
- **Impact:** High — release blocked at submission, after all Phase-3 work.
- **Likelihood:** Medium.
- **Affected components:** account deletion endpoint, `SettingsView`, store metadata, M3.6.
- **Mitigation:** Design an in-app account-deletion endpoint now (also satisfies GDPR Art. 17); expand M3.6 into a policy-clause checklist; complete the content/age-rating and data-safety declarations early.
- **Contingency:** Expedited re-submission with the deletion flow added; keep the web app shipping meanwhile.
- **Detection:** Pre-submission compliance checklist review.
- **Priority:** P2.

### R-MOB-4 · iOS local-notification cap / scheduling limits → missed reminders
- **Description:** iOS caps pending local notifications (~64); web notifications are a no-op. Reminders may not fire as expected.
- **Impact:** Low — a retention feature degrades; no data impact.
- **Likelihood:** Medium.
- **Affected components:** `CapNotifications`, `NotificationScheduler`, reschedule-on-write.
- **Mitigation:** Reschedule-on-write with a bounded pending set within the cap; re-reconcile on resume; in-app reminders as the web fallback; surface that reminders need the native app on iOS web.
- **Contingency:** In-app reminder surfacing when foregrounded.
- **Detection:** Compare scheduled vs. `listPending`; reminder-fired telemetry.
- **Priority:** P3.

---

## 12. Offline edge cases

### R-OFF-1 · Long-offline `resync()` restores nothing for a single-device owner
- **Status: Mitigated/Closed (2026-07-15).** The recommended gate is implemented in `src/domain/merge.ts` (`decideMerge`): "echo" is now only the skip-reason label when a self-authored row ties or is older than local; a strictly-newer or locally-missing self-authored row applies (restore/rollback path). Regression tests: `tests/unit/domain/merge.spec.ts` (H2 cases), `tests/unit/sync/reconcile.spec.ts` ("H2 fix" case), `tests/unit/sync/syncEngine.spec.ts` ("resync() restores a SINGLE-device owner's own rows").
- **Description:** As designed, `resync()` was described as clearing the local scope and re-pulling from epoch-0; **as implemented, `SyncEngine.resync()` resets the pull cursor only (it does not clear the local scope)** — see `src/sync/SyncEngine.ts`. The original risk: echo suppression dropped own-device rows before the merge — so a single-device owner re-adopted none of their (server-intact) data. Reachable via >365-day offline, a tombstone-GC cursor gap, or a cursor-format change on app update. *(→ H2 / SYNC-2 — both resolved 2026-07-15)*
- **Impact:** Critical — 100% local data loss for the default single-device user (data safe server-side but never repopulates).
- **Likelihood:** Low — requires a resync trigger, uncommon in normal use. (Post-fix: residual likelihood is negligible; regression-tested.)
- **Affected components:** `src/domain/merge.ts` (echo labeling), `src/sync/SyncEngine.ts` `resync()`, cursor, `meta` store.
- **Mitigation:** **Implemented 2026-07-15** — self-authored rows are no longer dropped before the LWW compare (strictly-newer or locally-missing self-rows apply); single-device resync regression test in place. Note the fix landed after M1.9 shipped; the gap was closed at the Phase-2 doc audit.
- **Contingency:** A one-time repair that disables echo suppression and re-pulls; data is safe on the server so recovery is complete once the logic is fixed.
- **Detection:** Regression tests in the unit suite (merge, reconcile, syncEngine); post-resync record-count assertion remains a good addition.
- **Priority:** ~~**P1**~~ → **Closed** (2026-07-15).

### R-OFF-2 · Outbox unbounded growth during extended offline
- **Description:** A long offline period accumulates outbox rows and tombstones, pressuring storage.
- **Impact:** Medium — storage pressure; potential quota errors (see R-DB-3).
- **Likelihood:** Low.
- **Affected components:** `src/sync/outbox.ts`, tombstone GC, `StorageDriver`.
- **Mitigation:** **Partially implemented (Phase 1, verified 2026-07-15):** outbox coalescing of repeated edits to the same (key, scope) is implemented in `src/sync/outbox.ts` (`enqueueCoalesced` / `enqueueCoalescedTx`, tested in `tests/unit/sync/outbox.spec.ts`), and drain runs on reconnect via `SyncEngine`. **Not yet implemented:** age-horizon tombstone GC (no GC pass exists in `src/sync` or `src/data`).
- **Contingency:** Prune coalesced/obsolete outbox entries; prompt export if storage is critical.
- **Detection:** Outbox depth is exposed via `SyncEngine` status; storage headroom warning remains future work.
- **Priority:** P3 — coalescing **Implemented**; tombstone GC outstanding.

---

## 13. Backup / restore failures

### R-BAK-1 · No automated backup for local-only users
- **Description:** Local-only users have no server copy; the only backup is a manual JSON export, which most users won't do — compounding R-DEV-1 and R-DL-1.
- **Impact:** High — a device loss/eviction becomes total loss.
- **Likelihood:** Medium.
- **Affected components:** `data/exporter`, local-only mode, onboarding.
- **Mitigation:** Frictionless one-tap export + reminders; optionally an encrypted backup file to the OS files/cloud provider; make the value of enabling cloud (or exporting) explicit at onboarding.
- **Contingency:** Import from the last export; otherwise unrecoverable.
- **Detection:** "Days since last backup/export" per local-only user.
- **Priority:** P2.

### R-BAK-2 · Restore accepts a rolled-back / withheld server snapshot
- **Description:** On a fresh restore the client has no baseline, so a malicious/compelled server could serve an older/withheld set of rows and the client accepts it as current (no signed freshness anchor). *(→ CRYP-8)*
- **Impact:** Medium — stale/partial data on restore; the owner's own device otherwise remains authoritative.
- **Likelihood:** Low.
- **Affected components:** `reconcile`, restore flow, projection.
- **Mitigation:** A monotonic version counter inside the sealed projection (partner rejects non-increasing); optionally a signed head for owner scope; correct the T-1 "detected by HLC monotonicity" claim which doesn't hold on a baseline-less restore.
- **Contingency:** Surface aggressive staleness in the UI; re-sync when connectivity to a trusted state returns.
- **Detection:** Staleness/TTL banner; version-counter regression check.
- **Priority:** P3.

### R-BAK-3 · Export/import format or version bug corrupts restore
- **Description:** A bug in the versioned `ExportData` writer/reader, or a `version > 2` file, corrupts or silently drops data on import.
- **Impact:** Medium — partial/incorrect restore.
- **Likelihood:** Low.
- **Affected components:** `src/data/exporter.ts`, `src/data/importer.ts`, v1 shim.
- **Mitigation:** **Implemented (Phase 1, verified 2026-07-15):** `src/data/importer.ts` accepts versions `{1,2}` via a shim (v1 defaults: medication `[]`, intimacy `null`), rejects `>2` with an explicit user-facing message, and applies imports via per-field merge (`mergeLog` — merge, never blind-overwrite); versioned export in `src/data/exporter.ts`; covered by `tests/unit/data/importer.spec.ts`.
- **Contingency:** Reject a malformed/newer file with a clear message rather than importing partial data; keep the original file.
- **Detection:** Importer tests in CI; import validation with a dry-run count remains future work.
- **Priority:** P2 — mitigation **Implemented** (Phase 1).

---

## 14. Performance regressions

### R-PERF-1 · Decrypt-on-boot budget blown on low-end devices
- **Description:** The "< 300 ms working-set decrypt / < 1 s boot" budget assumes a per-record AEAD model; the undecided at-rest representation (R-ENC-1) and low-end hardware can blow it, especially if double-encryption ships.
- **Impact:** Medium — slow cold starts.
- **Likelihood:** Medium.
- **Affected components:** boot path, `crypto/aead`, storage driver, crypto worker, Ch12 budgets.
- **Mitigation:** Resolve R-ENC-1 (single-encryption ciphertext KV); decrypt the working set (recent window) first, lazy-decrypt history; run decrypt in the worker; measure on a low-end reference device.
- **Contingency:** Progressive/lazy load with a skeleton UI; cache decrypted working set.
- **Detection:** Boot-time and working-set-decrypt telemetry per device class against the budget.
- **Priority:** P2.

### R-PERF-2 · `postgres_changes` scaling cliff / connection cost
- **Description:** `postgres_changes` evaluates RLS per subscriber per change (the least-scalable Realtime mode); cost is linear in online users; up to 3 channels per client; not in the Ch12 budget. *(→ PLAT-2 / SYNC-9)*
- **Impact:** Medium — cost and latency degradation as the user base grows.
- **Likelihood:** Medium — at scale, not at launch.
- **Affected components:** `SupabaseTransport.subscribe`, Supabase Realtime quotas.
- **Mitigation:** Document the scaling ceiling + connection cost in Ch12; name Broadcast-from-database as the seam's migration path; consider pull-on-foreground + long heartbeat (pull is authoritative) to reduce persistent connections.
- **Contingency:** Swap `postgres_changes` for Broadcast behind the existing `Transport` seam; fall back to polling.
- **Detection:** Connection-count and Realtime-cost dashboards; latency SLO monitoring.
- **Priority:** P2.

### R-PERF-3 · Re-encryption backfill burst on the E2EE cutover
- **Description:** The M2.4 background pass re-encrypts and re-uploads the full history; a 10-year user is ~3,650 rows, and dual-write doubles writes during the window. *(→ PLAT-7)*
- **Impact:** Low — one-time cellular data + battery cost; batched upserts already exist.
- **Likelihood:** Medium (affects long-history users at cutover).
- **Affected components:** re-encryption pass, outbox, `SupabaseTransport`.
- **Mitigation:** Batch upserts with backoff (already designed); gate the historical sweep to Wi-Fi + charging on native; newest-first ordering.
- **Contingency:** Pause/resume the backfill; throttle on metered networks.
- **Detection:** Backfill throughput + coverage %; data-usage telemetry during the window.
- **Priority:** P3.

---

## 15. Cross-cutting / project risks

### R-PROJ-1 · Serial multi-month critical path for optional features
- **Description:** Most of v2's cost/risk lives in optional, secondary features (multi-device, the transport abstraction, the advanced tier) on a serialized ~3–5 eng-month Phase-2 critical path, while Phase 0 already delivers most of the privacy outcome in ~1 week. *(→ §2.1 / §5.3 of the critique)*
- **Impact:** High — schedule overrun / stalled effort / opportunity cost for a small team.
- **Likelihood:** High — serial critical paths on optional scope routinely overrun.
- **Affected components:** the whole implementation plan / phasing.
- **Mitigation:** Treat the Phase 0/1 boundary as an explicit **decision gate**; ship Phase 0 + owner-E2EE + partner projection, and defer multi-device, the multi-transport abstraction, and the advanced tier until there is demand + capacity (the plan's flags and "Phase 4 only if justified" already permit this).
- **Contingency:** Stop after Phase 0/1 and reassess with real usage data before committing to Phase 2+.
- **Detection:** Milestone burn-down vs. the §9.1 order-of-magnitude estimates; explicit gate reviews.
- **Priority:** **P1.**

### R-PROJ-2 · Spec inconsistency → weaker crypto construction shipped
- **Description:** ~21 shared values are pinned differently across chapters and reconciled only in the §0.9/§0.10 errata tables (incl. AAD field-count and invite hashing); a reader consulting a chapter in isolation could ship the weaker construction. *(→ M-ARCH-1)*
- **Impact:** High — a security-weaker implementation than intended.
- **Likelihood:** Low — the build tickets (RHEA-009/061) carry the strong construction, so an implementer following tasks is safe.
- **Affected components:** the spec itself; `crypto/aead`, invite hashing, migrations.
- **Mitigation:** A spec-consistency pass folding each §0.10 override back into its chapter (and deleting the errata tables) before Phase 2; inline forward-pointers meanwhile.
- **Contingency:** Security review at the crypto cutovers catches a weaker construction before release.
- **Detection:** KAT vectors pin the exact constructions; security-review gate on crypto PRs.
- **Priority:** P2.

---

## 16. Accepted / residual risks (disclosed, not mitigated away)

These are consciously accepted; the honest in-app disclosure (Ch5 §6.4) should state them plainly.

- **Server-visible metadata** — account identity, the pairing graph, write timing/frequency, blob sizes, and `scope` are visible to the relay and unprotected by E2EE (partially mitigated by R-PRIV-3 jitter if adopted).
- **Compelled-user access** — no client can protect data if the user is compelled to unlock the device; mitigated only by the coercion affordances of R-PRIV-2.
- **Forward-only revocation** — unpairing stops future sharing but cannot retract data a partner already synced.
- **Key loss = data loss** — the necessary consequence of zero-knowledge E2EE (R-KEY-1).
- **Local-first web durability** — browser eviction can lose data absent persistence/backup (R-DL-1); native SQLite is the durable path.

---

*Grounded in [RHEA_V2_TECHNICAL_SPEC.md](RHEA_V2_TECHNICAL_SPEC.md) and the verified
findings of [ARCHITECTURE_CRITIQUE.md](ARCHITECTURE_CRITIQUE.md). Living document —
re-rate as mitigations land and as usage data arrives. No source code was modified.*
