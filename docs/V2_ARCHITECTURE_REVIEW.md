# Rhea v2 Architecture Review

> 🧊 **Planning artifact — implementation status frozen at the 2026-07-15 planning state.** The v2 branch has since merged to `main` and deployed; for current state see the root `README.md` and [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md). Migration numbers `0004`+ here predate the shipped `0004` pairing fix — the E2EE sequence has shifted to `0005`+. (Two docs it references, `Rhea-DEPLOY.md` and `Rhea-technical-spec.md`, have moved to `docs/archive/`.)

> **Addendum (2026-07-15, app v0.2.0).** This review's engineering-hygiene
> findings — no tests, no CI, no lint, build without `tsc` — are resolved as of
> Phase 0: Vitest (205 passing tests in 24 files), an ESLint layering gate
> (`eslint . --max-warnings=0` with `import/no-restricted-paths`), `tsc --noEmit`
> in the build script, and GitHub Actions CI. This satisfies R12's precondition
> for starting crypto work. The layering (`src/kernel|domain|data|sync|app`) and
> sync architecture shipped in Phase 1; Phase 2 (E2EE) is now starting. See
> `docs/IMPLEMENTATION_STATUS.md` for current state.

> **Scope.** A Principal-Architect compatibility assessment of
> [docs/Rhea_v2_Architecture_Proposal.md](Rhea_v2_Architecture_Proposal.md)
> against the code actually in this repository. It answers one question:
> *is the proposed architecture compatible with the existing implementation,
> and where is it wrong, under-specified, or dangerous?*
>
> **Method.** Every source file under [src/](../src), the three
> [supabase/](../supabase) migrations, the PWA shell, and all five spec
> documents ([Docs/](../Docs), [docs/](.)) were read in full. Claims are
> cited as `file:line`. This document changes no source code.
>
> **Verdict in one line.** The proposal's *diagnosis* is correct and, if
> anything, understated; its *architecture* is a vision memo — internally
> contradictory, silent on the hardest engineering, and in places
> prescribing transports and guarantees that a browser PWA cannot deliver.
> About **70% of the existing client survives**; the partner data path must
> be **replaced**; and the single most severe defect in the live system (a
> pairing-hijack RLS hole) is **fixable in a day** and the proposal never
> mentions it.

---

## Table of contents

1. [Current architecture](#1-current-architecture)
2. [Proposed architecture](#2-proposed-architecture)
3. [Compatibility analysis](#3-compatibility-analysis)
4. [Components that can remain unchanged](#4-components-that-can-remain-unchanged)
5. [Components requiring refactoring](#5-components-requiring-refactoring)
6. [Components requiring complete replacement](#6-components-requiring-complete-replacement)
7. [Migration complexity for each module](#7-migration-complexity-for-each-module)
8. [Technical risks](#8-technical-risks)
9. [Missing requirements](#9-missing-requirements)
10. [Suggested improvements to the proposal](#10-suggested-improvements-to-the-proposal)
11. [Alternative architectures worth considering](#11-alternative-architectures-worth-considering)
12. [Estimated implementation order](#12-estimated-implementation-order)
13. [Appendix: severity-ranked defect register](#13-appendix-severity-ranked-defect-register)

---

## 1. Current architecture

Rhea is a **single-page React PWA** (React 18 + Vite 6 + Tailwind 4) with an
**optional Supabase backend**. There is no server application, no API layer,
no ML service, no tests, and no CI — the browser client is the only
executable code. The `supabase/*.sql` files are hand-run scripts, not a
managed migration project. ([package.json](../package.json),
[src/lib/supabase.ts](../src/lib/supabase.ts),
[docs/REPOSITORY_OVERVIEW.md](REPOSITORY_OVERVIEW.md))

### 1.1 Runtime shape

```
                          ┌─────────────────────────────────────────┐
                          │  Browser / installed PWA                 │
                          │                                          │
   main.tsx ──► App.tsx ──┤  useAuth      useCycleData    useLogger  │
   (mount, SW reg)        │    │              │              │       │
                          │    ▼              ▼              ▼       │
                          │  supabase      cycle.ts        db.ts     │
                          │    │         (pure derive)   (IndexedDB) │
                          │    │              ▲              │       │
                          │    │              └──────────────┘       │
                          │    ▼                                     │
                          │  sync.ts ── pairing.ts ── sharing.ts     │
                          │    │            │             │          │
                          └────┼────────────┼─────────────┼──────────┘
                               │ (only when VITE_SUPABASE_* set)
                               ▼
        ┌───────────────────────────────────────────────────────────┐
        │  Supabase (Postgres + Auth + Realtime)                      │
        │  daily_logs · partner_links · invites · profiles            │
        │  share_settings · shared_notes · quiet_windows · audit_log  │
        │  RLS on every table · redeem_invite() SECURITY DEFINER      │
        │  realtime publication on daily_logs + shared_notes          │
        └───────────────────────────────────────────────────────────┘
```

### 1.2 The data model — single source of truth, derived everything

The domain's only stored record is one **`DailyLog` per local calendar date**
(`{date, flow, symptoms[], mood, energy, notes}`,
[src/types/index.ts:30](../src/types/index.ts#L30)). Periods, cycles,
averages, phase, predictions, fertile window, variability, and symptom
patterns are all **recomputed in memory** by
[src/lib/cycle.ts](../src/lib/cycle.ts); nothing derived is persisted. This is
already the architecture the v2 proposal asks for, and it is the codebase's
genuine strength.

The prediction model actually shipped (not the ML the technical spec
imagines): detect periods (bleed days, ≤2-day gap tolerance) → build cycles →
recency-weighted mean of the last 6 completed cycle lengths + standard
deviation → luteal-anchored ovulation (`avgCycleLength − 14`) → fertile window
widened by variability → four future cycles with widening uncertainty →
`early/building/good` confidence. ([src/lib/cycle.ts:15-299](../src/lib/cycle.ts#L15))

### 1.3 Persistence and sync (the problem area)

- **Local:** a single unscoped IndexedDB database named `rhea`, keyed by bare
  `date` with no account dimension ([src/lib/db.ts:4-34](../src/lib/db.ts#L4)).
- **Cloud (owner):** on auth, `initialSync` **pulls all remote rows into
  IndexedDB, then pushes all local rows back**
  ([src/lib/sync.ts:142-150](../src/lib/sync.ts#L142)); realtime
  `postgres_changes` keeps the local copy live.
- **Cloud (partner):** the *same* code path runs with
  `ownerId = auth.linkedOwnerId`
  ([src/App.tsx:69](../src/App.tsx#L69)), so a partner's device **pulls the
  owner's complete raw logs — flow, symptoms, mood, energy, and free-text
  notes — into its own IndexedDB** ([src/lib/sync.ts:79-89](../src/lib/sync.ts#L79)).
- **Partner "privacy":** the five share toggles, quiet windows, and "notes
  never shared" gate **only what `PartnerView` renders**
  ([src/views/partner/PartnerView.tsx:88-96](../src/views/partner/PartnerView.tsx#L88)).
  The raw data is already on the partner device and readable through the
  Supabase REST API with the partner's own JWT.

### 1.4 What the current system actually is

A **cloud-first app wearing local-first clothing.** The code comment says the
quiet part out loud — `"server is source of truth"`
([src/lib/sync.ts:145](../src/lib/sync.ts#L145)) — directly contradicting the
product principle "local storage is the source of truth." The partner
"projection" is a client-side UI illusion, and several in-app privacy claims
are false against the code (documented in §8 and §9).

---

## 2. Proposed architecture

The v2 proposal ([docs/Rhea_v2_Architecture_Proposal.md](Rhea_v2_Architecture_Proposal.md))
restates Rhea as **privacy-first, local-first, zero-knowledge**:

- **Vision (lines 9-21):** local is the source of truth; cloud optional;
  partner sharing opt-in and end-to-end encrypted; *"the server should never
  be able to read health data."*
- **Biggest problem named (lines 39-49):** raw `DailyLog` entries sync to
  partners. Replace with a pipeline:
  `DailyLog → Cycle Engine → Privacy Engine → Partner Projection → Encrypt → Sync`.
- **Data tiers (lines 53-92):** *Private* (symptoms, notes, mood, energy,
  medication, sexual activity) never leaves the device; *Derived* (phase,
  predictions, stats) is never persisted; *Shared* is a filtered projection.
- **Privacy Engine (lines 96-104):** one layer fanning out Owner / Partner /
  Doctor / Backup / Research views.
- **Sync ⟂ Transport (lines 107-124):** a Sync Engine that only sends
  encrypted payloads, over any of Bluetooth / LAN / WebRTC / Nearby / QR /
  optional relay / iCloud / Drive.
- **E2EE (lines 128-140):** on-device keys, never leave, hardware-backed,
  audited libraries only.
- **Pairing (lines 144-153):** QR + public-key exchange + device
  verification; invite codes demoted to discovery.
- **Local DB (lines 157-166):** scope by account, clear on sign-out, multiple
  accounts, encrypt at rest, version records.
- **Conflict resolution (lines 169-179):** record version, timestamp, device
  ID, deterministic merge, outbox, retry, delete propagation.
- **Mobile (lines 183-201):** wrap the React app with Capacitor → Android →
  notifications → biometric lock → encrypted DB; later iOS + Health.
- **Phasing (lines 229-254):** P1 fix privacy / add projection; P2 Privacy
  Engine + Sync Engine + encrypted transport; P3 mobile; P4 advanced sharing,
  doctor exports, relay, multi-device.
- **"Guidance for Codex" (lines 258-271):** hand the above to an LLM to
  implement.

```
       PROPOSAL'S TARGET (as written)

   DailyLog ─► Cycle Engine ─► Privacy Engine ─┬─► Owner View
   (private,                                   ├─► Partner View ─► Encrypt ─► Sync Engine ─► Transport(?)
    on-device)                                 ├─► Doctor Export        (per-pair key)          │
                                               ├─► Backup Export                    Bluetooth / LAN / WebRTC /
                                               └─► Research Export                  Nearby / QR / relay / iCloud
```

**The proposal is directionally aligned with
[Docs/Rhea-spec.md](../Docs/Rhea-spec.md) §6** (which specifies the encrypted
curated-slice relay in *more* detail than the proposal itself, spec:98-107),
but **flatly incompatible with
[Docs/Rhea-technical-spec.md](archive/Rhea-technical-spec.md)** (a server-side
Python ML service that reads logs and writes a `predictions` table,
tech-spec:157-159) and with
[Docs/Rhea-DEPLOY.md](archive/Rhea-DEPLOY.md)'s deployed sub-second realtime
model. The proposal never names those documents, never names Supabase, and
never mentions the plaintext data already deployed — three gaps that shape the
entire compatibility picture.

---

## 3. Compatibility analysis

### 3.1 Where proposal and code agree (the easy part)

| Proposal principle | Reality in code | Verdict |
|---|---|---|
| Local-first IndexedDB storage (line 29) | [db.ts](../src/lib/db.ts) exists, is clean, 141 lines, 7 importers | ✅ Compatible |
| Derived cycle engine, never persist derived (lines 30, 66-79) | [cycle.ts](../src/lib/cycle.ts) `deriveCycleState` is pure, persists nothing | ✅ Already done |
| Separation of UI / domain / persistence (line 32) | Partially — see §3.3 | ⚠️ Overstated |
| DailyLog as single source of truth (line 263) | True *except* `localSymptoms` and QuickAdd bypasses (§3.3) | ⚠️ Mostly |
| Offline support "already a strength" (line 32) | **False** — SW never caches HTML, offline cold-start fails (§8) | ❌ Broken |
| Partner sees only a curated slice (lines 81-92) | **False** — partner holds full raw logs (§1.3) | ❌ The core defect |

### 3.2 The central finding: the diagnosis is right, the code is worse than stated

The proposal's "Biggest Architectural Problem" — raw logs to partners — is
**verified concrete at specific lines**, and is *understated* in three ways
the proposal never acknowledges:

1. **Partners don't just receive raw logs — they persist them.** `pullAllLogs`
   writes the owner's every field (including `notes`) into the partner's
   IndexedDB ([sync.ts:79-89](../src/lib/sync.ts#L79)), and the realtime
   subscription keeps mirroring column changes
   ([sync.ts:114-124](../src/lib/sync.ts#L114)). "Remove raw partner log
   synchronization" (proposal:234) does **not** un-leak what is already on
   partner devices.
2. **Revocation cannot claw anything back.** `unpair` deletes only the
   `partner_links` row ([pairing.ts:68-77](../src/lib/pairing.ts#L77));
   `signOut` clears no IndexedDB ([useAuth.ts:133-141](../src/hooks/useAuth.ts#L133)).
   The in-app promise "Unpair… wipes their synced copy"
   ([PrivacyPolicy.tsx:105-107](../src/views/settings/PrivacyPolicy.tsx#L105))
   is false.
3. **The breach is reachable by any stranger, today.** The RLS policy
   `"anyone read unused invites"`
   ([migration.sql:84-86](../supabase/migration.sql#L84)) lets *any*
   authenticated user `SELECT code, owner_id` for every pending invite, then
   `redeem_invite()` to pair themselves in and read the owner's raw logs. This
   is a **live pairing-hijack vulnerability**, fixable in a day, that the
   proposal doesn't mention.

### 3.3 Where the proposal's "current strengths" claim is false

The proposal says to "keep" the existing "separation between UI, domain logic,
and persistence" (lines 30-35). For the sync/privacy dimension that separation
**does not exist**:

- Cloud writes happen **inside a UI save callback**
  ([App.tsx:54-60](../src/App.tsx#L54)).
- The partner consent boundary lives in **rendering code**
  ([PartnerView.tsx:88-96](../src/views/partner/PartnerView.tsx#L88)).
- Role inference lives in a **React hook**
  ([useAuth.ts:30-66](../src/hooks/useAuth.ts#L30)); pairing side-effects fire
  from **UI event handlers**; audit writes are **sprinkled through a settings
  component** ([SharingControls.tsx:48-61](../src/views/settings/SharingControls.tsx#L48)).
- Two writes never persist at all: `OverviewTab`'s `localSymptoms` is
  ephemeral React state ([App.tsx:63,100-107](../src/App.tsx#L63)), and
  `QuickAddPeriod` writes IndexedDB directly with no cloud push and **clobbers
  existing symptoms/mood/notes** on that date
  ([QuickAddPeriod.tsx:25-33](../src/views/tracker/QuickAddPeriod.tsx#L25)).

The proposal must **build** this separation, not "keep" it.

### 3.4 The three fatal internal contradictions

1. **"Never persist derived data" (lines 66-79, 264) vs. "everything works
   offline" (line 16) for the partner.** The partner device has no `DailyLog`;
   to render while the owner is offline it *must* persist the received
   projection. Under "server never has plaintext" (line 136) only the owner
   device can compute that projection. So a share-toggle change or a new log
   stalls until the owner comes online — and the "primary" direct transports
   (Bluetooth/LAN/WebRTC) require both peers online simultaneously. The rule
   is only satisfiable if re-scoped to *"never persist derived data in the
   owner store; the partner projection is versioned, persisted, encrypted
   derived data by design."*

2. **Line 55 vs. line 92.** Private data "never leaves the owner's device"
   (55) vs. "never include raw health logs *unless the user explicitly enables
   them*" (92). A privacy spec cannot leave its strongest guarantee ambiguous
   between two adjacent sections.
   [Rhea-spec.md:74](../Docs/Rhea-spec.md) resolves it categorically (never,
   regardless of settings); the proposal should too.

3. **Phasing that breaks shipped features.** Phase 1 removes raw partner sync
   (line 234) but the encrypted-projection replacement is Phase 2 (line 241),
   and multi-device sync — the owner's own laptop↔phone replication that
   `sync.ts` also serves — is Phase 4 (line 254). As written, Phase 1 either
   leaves the partner view blank or strands the owner's second device for
   three phases.

### 3.5 The silent contradiction with the rest of the doc suite

"The server should never be able to read health data" (line 21) **silently
kills the technical spec's entire ML roadmap** (server-side Python HSMM/CyHMM
writing a `predictions` table, tech-spec:157-159) and the DEPLOY guide's
server-computed `partner_view`. The technical spec itself flagged this exact
tension as an *open decision* (tech-spec §12); the proposal *resolves it by
omission* without ever saying so. It also invents **"Pregnancy mode"**
(line 89) — a feature that exists nowhere: no data field, no logging UI, no
engine handling, no share key (grep confirms only physiological copy at
[phases.ts:116](../src/lib/phases.ts#L116)). The repository would carry three
mutually contradictory architectures unless the proposal explicitly deprecates
the superseded sections.

---

## 4. Components that can remain unchanged

Ranked by confidence. These survive v2 essentially as-is.

| Component | Why it survives | Evidence |
|---|---|---|
| **[src/lib/cycle.ts](../src/lib/cycle.ts)** (whole file) | `deriveCycleState` **is** the proposal's "Cycle Engine": pure, framework-free, persists nothing. The Partner Projection is a ~15-line selector over its output. | [cycle.ts:227-299](../src/lib/cycle.ts#L227) |
| **Tracker view bodies** (`DailyLogSheet`, `OverviewTab`, `PhaseHero`, `PredictionsTab` render layer) | Props-driven projections of derived state; `DailyLogSheet` is the owner-side capture surface that legitimately handles raw `DailyLog`. | [OverviewTab.tsx](../src/views/tracker/OverviewTab.tsx), [DailyLogSheet.tsx](../src/views/tracker/DailyLogSheet.tsx) |
| **All chrome** (`Header`, `TabNav`, `UserMenu`, `EnergyBar`, `ErrorBoundary`) | Zero data-shape coupling; presentational only. | [src/components/](../src/components) |
| **PartnerView render body** (JSX at :98-429) | All partner-facing copy is static `PHASES` content keyed on phase; only the **props interface** must narrow (see §5). | [PartnerView.tsx:98-429](../src/views/partner/PartnerView.tsx#L98) |
| **[src/lib/import.ts](../src/lib/import.ts) parsers** | Client-side parsing keeps raw data on-device — *more* compatible with v2 than the tech-spec's server-side import service. (Parsing quality bugs remain, §8.) | [import.ts:263-281](../src/lib/import.ts#L263) |
| **[supabase.ts](../src/lib/supabase.ts) null-fallback client** | The "no env ⇒ fully local" posture *is* "cloud is optional" (proposal:18). Survives every option. | [supabase.ts:8-15](../src/lib/supabase.ts#L8) |
| **`share_settings` table + `SHARE_KEYS`** | The five-toggle consent model matches proposal:82-92. The toggles survive; only their **enforcement point** moves (§5). | [sharing.ts:3-36](../src/lib/sharing.ts#L3) |
| **`useLogger` hook shape** (load/save/remove per date) | Signature survives account-scoping and tombstones untouched; only `db.ts` internals beneath it change. | [useLogger.ts:14-47](../src/hooks/useLogger.ts#L14) |
| **Self-hosted fonts + no-CDN asset story** | Genuine v2 positive: no third-party network dependency, so a strict CSP with `default-src 'self'` is feasible. | [main.tsx:3-11](../src/main.tsx#L3) |

> **Caveat on "unchanged":** `cycle.ts` survives *functionally* but has **zero
> tests** — and the proposal wants to keep it as-is while an LLM rewrites
> everything around it. Add tests before trusting it as the projection input
> (§8).

---

## 5. Components requiring refactoring

Sized S (≤1 day) / M (2–5 days) / L (1–3 weeks). Line references are the
seams.

| Component | Change | Size |
|---|---|---|
| **`PartnerView` props** ([:19-26](../src/views/partner/PartnerView.tsx#L19)) | Replace `state: CycleState` with a `PartnerProjection` interface; only **3 internal reads** change (`avgCycleLength` :41,:188; `predictions.slice(0,3)` :273). | **S** |
| **`App.tsx` sync effect** ([:66-79](../src/App.tsx#L66)) | Split the conflated `initialSync(ownerId)` into two pipelines: owner-multi-device replica **vs.** partner-projection subscription. Partner must stop calling `initialSync`/`subscribeToLogs` on `daily_logs`. | **M** |
| **`App.tsx` save callback** ([:54-60](../src/App.tsx#L54)) | Move the re-read-then-`pushLog` dance into a persistence-layer `saveLog` that enqueues to an outbox; the UI must not know sync exists. Fixes the **UTC/local timezone key bug** (`toISOString().slice(0,10)` vs `toDateKey`) that silently drops evening saves west of UTC. | **S** |
| **`db.ts`** ([:18-129](../src/lib/db.ts#L18)) | Account-scope by **DB name** (`rhea-${uid}` + `rhea-local` sentinel), reset the cached `dbPromise` on account switch, add `blocked/blocking` handlers (missing today → multi-tab v1→v2 upgrade hangs the loading screen forever), bump `DB_VERSION`, add `updatedAt`/`deviceId`/`deleted` envelope. | **M** |
| **`sync.ts`** — Phase-0 slice | Stop pushing `notes` ([:21,:50](../src/lib/sync.ts#L21)); stamp `updatedAt` at **edit time** not push time; drop the pull-overwrites-local ordering. | **S** |
| **`useAuth.detectRole`** ([:30-66](../src/hooks/useAuth.ts#L30)) | Handle N-link cardinality (today `maybeSingle` **errors** on multiple links and silently misclassifies a partner as owner); surface errors instead of discarding; persist role (the `profiles` comment claims a role column that doesn't exist). | **M** |
| **`App.tsx` role gate** ([:34,:155-164](../src/App.tsx#L34)) | `roleChosen` is ephemeral React state — an owner who logs nothing re-sees `RoleSelect` every reload. Persist the choice. | **S** |
| **`pairing.ts` + invites schema** | QR + X25519 public-key exchange + short-authentication-string verification; hashed, TTL'd, rate-limited discovery codes carrying **no `owner_id`**; owner-revocable; atomic redeem (`FOR UPDATE`). See §6 — this is nearly a replacement. | **L** |
| **`sharing.ts` notes/quiet windows** | Wrap `content` in AEAD under the per-pair key; move quiet-window evaluation into the encrypted projection (a server row of dates is itself health metadata). | **M** |
| **`audit.ts`** | Move emission to a trusted layer; actually log pair/unpair/export/erase/import — their labels exist at [audit.ts:39-45](../src/lib/audit.ts#L39) but have **no call sites** (only `share.toggle_*` and `quiet.*` are ever emitted, from [SharingControls.tsx:48,53,61](../src/views/settings/SharingControls.tsx#L48)); reconcile a plaintext server audit with "server never has plaintext." | **M** |
| **Realtime subscription** ([sync.ts:96-133](../src/lib/sync.ts#L96)) | Survives as a **wake-up/notification channel** but the handler must become "fetch + decrypt envelope," not "deserialize plaintext row." Add background/resume lifecycle for Capacitor. | **M** |
| **Three conflicting phase engines** → one | `utils.getPhase` (fixed 5/13/16, ignores its `cycleLength` arg), `utils.getPhaseLengths` (fixed 5/8/3), and `cycle.getCurrentPhase` (dynamic, luteal-anchored) disagree for non-28-day cycles. Delete the static ones or make them thin wrappers over the engine. | **M** |
| **`LegacyCycleEntry` bridge** | `App.tsx` fabricates `flow: "medium"` for every cycle ([:95](../src/App.tsx#L95)); `HistoryTab` displays it as real data. Migrate `CalendarTab`/`HistoryTab` to real `Cycle` types. | **M** |
| **PWA shell / SW** | Replace hand-rolled `sw.js` with a build-integrated precache + navigation fallback (vite-plugin-pwa/Workbox); PNG icons; manifest `id`/`scope`; `base` for subpath hosting; gate SW registration off inside the Capacitor webview. | **M** |

---

## 6. Components requiring complete replacement

No salvageable code exists in these; they encode the exact model v2 rejects.

1. **The partner data path, end-to-end.** `pullAllLogs`/`pushAllLogs`
   raw-row replication into the partner's IndexedDB
   ([sync.ts:8-92](../src/lib/sync.ts#L8), invoked for partners via
   [App.tsx:69-72](../src/App.tsx#L69)) → replaced by an
   owner-device-built, E2E-encrypted **projection channel**. The partner
   client currently derives the full `CycleState` from the owner's raw logs;
   there is nothing to preserve.

2. **The partner RLS SELECT on `daily_logs`**
   ([migration.sql:56-62](../supabase/migration.sql#L56)). Drop it; replace
   with a `partner_projections` table (owner writes, partner reads,
   realtime-enabled). While this policy exists, **every share toggle is
   decorative** — the `share_settings` table is not referenced by any
   `daily_logs` policy, so a partner reads raw rows with all toggles OFF.

3. **`pairing.ts` (entire 77 lines) + `invites` table/policies.**
   32-bit hex codes, a world-readable unused-invites policy, no expiry, no
   owner revocation, a raceable `redeem_invite`, and `getPartnerLink` hard-
   assuming exactly one link. Under QR + public-key pairing, **zero function
   signatures survive**.

4. **`sync.ts` initial-sync + delete semantics.** Pull-overwrites-local
   ([:142-150](../src/lib/sync.ts#L142)) is a data-loss machine; push-time
   `updated_at` destroys any future merge; DELETE is never propagated
   (deleted logs resurrect on next pull). Replace with an
   outbox + cursor + LWW-merge + tombstones SyncEngine (§11).

5. **`audit_log` server table** ([migration-phase-e.sql](../supabase/migration-phase-e.sql))
   as a plaintext store — its `target` column embeds literal quiet-window date
   ranges ([SharingControls.tsx:53](../src/views/settings/SharingControls.tsx#L53)),
   which are cycle-correlated health metadata, directly contradicting "server
   never has plaintext." Replace with a local append-only log.

6. **Governing status of
   [Docs/Rhea-technical-spec.md](archive/Rhea-technical-spec.md) §1-4, §6.4,
   §10.** The server-as-source-of-truth Postgres design, the server-computed
   `partner_view`, and the backend Python ML service are architecturally dead
   under "server never reads health data." A v2 spec must explicitly deprecate
   these or the repo carries contradictory blueprints.

---

## 7. Migration complexity for each module

`updatedAt` here means **edit-time**, not push-time. Effort is engineering,
excluding review/QA.

| Module | Target state | Effort | Risk | Notes |
|---|---|---|---|---|
| `cycle.ts` | Unchanged; add tests | **S** | Low | Add unit tests *before* trusting as projection input. |
| `phases.ts` | Move `cycleStart/cycleEnd/range` out of content into engine output | **S** | Low | Static ranges hardcode a 28-day cycle into display copy. |
| Tracker views | Narrow props; one phase oracle | **M** | Low | `CalendarTab`/`HistoryTab` need raw logs today → highest-coupling views. |
| `PartnerView` | Consume `PartnerProjection`; parameterize gendered copy | **M** | Low | Data plumbing, not UX rewrite. |
| `db.ts` | Account-scope + envelope + tombstones + upgrade | **M** | **High** | v1→v2 backfill semantics; multi-tab upgrade deadlock; local-only mode has no account. |
| `sync.ts` | Full replace → SyncEngine + Transport | **L** (Phase-0 slice **S**) | **High** | Echo loops, clock skew (needs HLC), tombstone GC. |
| `pairing.ts` + invites | QR/PKE/verification; hardened codes | **L** | **High** | Security-critical; live hijack hole must be hotfixed first. |
| `sharing.ts` | AEAD notes; projection-side quiet windows | **M** | Med | Two-way notes need a per-pair symmetric key. |
| `useAuth.ts` | Persist role; N-link handling; clear-on-signout | **M** | Med | Decide account model first (§11). |
| `audit.ts` | Local log; cover all actions | **M** | Low | Current audit is decorative. |
| **E2EE / key management** | X25519 pairing, per-pair AEAD, sealed boxes, rotation, recovery, multi-device distribution | **XL** | **Critical** | From zero crypto today. The critical path. See §8. |
| PWA/SW | Build-integrated precache + fallback + icons + CSP | **M** | Med | Current offline is broken; SW harmful inside Android webview. |
| Capacitor wrap | Config + SW gating + Filesystem export + SQLite adapter + deep links | **L** | Med | Wrap boots in a day; four platform forks needed for an *honest* release. |
| Server ML (tech-spec) | **Deleted** or on-device-only | — | — | Incompatible with zero-knowledge; decide explicitly. |

**Total honest read:** the client is ~70% reusable. The expensive, risky work
is concentrated in **three tracks** — E2EE/key-management (XL, critical path),
the sync rewrite (L), and pairing (L) — none of which the proposal sizes or
sequences correctly.

---

## 8. Technical risks

Ordered by severity. Each is a concrete failure scenario, not a worry.

### R1 — Live pairing-hijack (CRITICAL, exploitable today)
`"anyone read unused invites"` ([migration.sql:84-86](../supabase/migration.sql#L84))
returns every pending invite's `code` + `owner_id` to any authenticated user.
Sign up with any email → `SELECT` a pending invite → `redeem_invite(code)` →
`partner_links` row created → RLS grants full raw `daily_logs` incl. notes +
realtime. The owner gets no notification of who paired. **Fix is one day and
must precede any v2 work.**

### R2 — Key loss = permanent, unrecoverable data loss (CRITICAL)
On a web PWA the E2EE key lives in IndexedDB (there is no hardware-backed
alternative — see R7). "Clear site data," storage eviction, or a browser
reset destroys the key → **all server-stored ciphertext becomes permanently
undecryptable**, and encrypted backups (proposal:212) with it. The proposal
specifies no recovery key, escrow, or re-pair flow.
[Rhea-spec.md:113](../Docs/Rhea-spec.md) names browser-wipe the top threat but
never connects it to *key* loss.

### R3 — E2EE and server-side ML are mutually exclusive, and both ship (HIGH)
[Rhea-technical-spec.md:157-159](archive/Rhea-technical-spec.md) has a backend
that reads logs and writes predictions; §8 openly flags the conflict. The
proposal picks E2EE but never retires the ML design. Implementing per §8
leaves plaintext (or in-memory-decrypted) logs on the server, quietly voiding
the E2EE claim.

### R4 — Multi-device deadlock (HIGH)
Device-bound keys that "never leave the device" (line 133) mean the owner's
**second** device cannot decrypt the owner's **own** synced history. Phase 4
promises multi-device sync (line 254) with no key-distribution mechanism.
Failure: owner logs on phone, opens laptop, sees an empty/undecryptable
history.

### R5 — Silent data loss on sync, today and after migration (HIGH)
`initialSync` pulls remote over local unconditionally before pushing
([sync.ts:142-150](../src/lib/sync.ts#L142)). Failure: owner logs a period
offline on phone, opens laptop first, phone syncs later and its logs are
overwritten by stale remote rows. The v1→v2 IndexedDB backfill has the same
hazard: backfilling `updatedAt=now()` on a stale secondary device clobbers the
primary's months of edits on first reconcile.

### R6 — Phase 1 breaks shipped features (HIGH)
Removing raw partner sync (line 234) before the encrypted projection exists
(Phase 2) makes the partner view render **fabricated** data: `deriveCycleState([])`
yields a plausible 28-day follicular state and empty predictions
([cycle.ts:238-254](../src/lib/cycle.ts#L238)) — silent wrong data, not an
error. It can also strand the owner's own second device (multi-device is
Phase 4).

### R7 — "Hardware-backed storage" is unavailable on the web (HIGH, bounds line 134's "where available")
Line 134 hedges with "where available"; on the web the honest answer is
"nowhere." WebCrypto exposes no interface to TPM / Secure Enclave / Android
Keystore for application keys. The realistic best case on web is a **non-extractable
WebCrypto key in IndexedDB**, protected only by the origin sandbox + OS disk
encryption — *not* sealed to hardware. The only genuine hardware path is the
WebAuthn PRF extension (recent, not universal, unmentioned). Real hardware
backing arrives **only under Capacitor** (Phase 3) — yet E2EE is Phase 2, so
Phase-2 keys are software-extractable and every pair must re-key when Phase 3
lands.

### R8 — Notification content leakage defeats the architecture (HIGH)
Phase 3 adds notifications (line 190) with no content policy. A push payload
"Period likely Thursday" transits FCM/APNs plaintext to Google/Apple —
exactly the third-party disclosure E2EE exists to prevent. Requires
**local-only** scheduling (easy under Capacitor), which also collides with
"never persist derived predictions" (a scheduled notification *is* a persisted
derived prediction handed to the OS — needs an explicit carve-out).

### R9 — Existing plaintext is never remediated (HIGH)
`daily_logs` already holds every deployed user's flow/symptoms/mood/energy/
notes in plaintext; partners' IndexedDB already holds pulled raw logs that
unpair doesn't wipe; Supabase PITR/WAL/backups retain deleted rows. Shipping
E2EE for *new* writes leaves all historical plaintext subpoenable server-side
and readable on ex-partners' devices forever. The proposal has no remediation
step.

### R10 — Cross-account local bleed (MED-HIGH, today)
IndexedDB is unscoped ([db.ts:4](../src/lib/db.ts#L4)) and sign-out clears
nothing. User B on user A's browser sees A's data (`hasData=true` skips
`RoleSelect`) and `initialSync`'s `pushAllLogs` re-uploads **A's health logs
under B's `owner_id`** — silent exfiltration into a stranger's cloud account.
Account-scoping alone doesn't fix it without a "partner never pushes" guard.
(Relatedly, when a *partner* runs `initialSync`, its `pushAllLogs` tries to
re-upsert the owner's pulled rows and fails the "owner rw own logs" RLS check
silently on every session — dead, error-swallowing code the projection split
removes.)

### R11 — Metadata leakage under "zero-knowledge" (MED)
Even with encrypted payloads, the server retains identities (`auth.users`),
the pairing graph (`partner_links`), timing/IP on every sync,
`share_settings`, and `quiet_windows` date ranges. For reproductive health
this metadata *is* sensitive. "Server never reads health data" is honest only
if scoped to payload content and paired with a metadata disclosure. Under an
E2EE relay, sync metadata (`updatedAt`, `deviceId`) must sit **outside** the
ciphertext, leaking edit-frequency patterns.

### R12 — LLM-implemented cryptography with no verification (MED-HIGH)
"Guidance for Codex" (lines 258-271) hands E2EE, merge logic, and the privacy
boundary to an LLM in a repo with **no test runner, no CI, no lint, and a
build that doesn't even run `tsc`** ([package.json:6-9](../package.json#L6)).
A nonce-reuse or key-confusion bug ships unreviewed and silently voids every
privacy promise. Crypto and deterministic-merge are the two categories most
dependent on property/vector tests.

### R13 — WKWebView storage durability + toolchain floor (MED, Capacitor)
The "7-day ITP wipe" fear is overstated for an installed/Capacitor app (its
origin is first-party every launch), but **undocumented purge-under-pressure**
and **absent backup/device-migration semantics** for webview IndexedDB are
real — for irreplaceable health data with optional cloud, unacceptable.
Mandates a move to native SQLite (SQLCipher). Separately, **Tailwind 4 raises
the device floor to Chromium 111 / iOS 16.4**, above Capacitor's own minimum —
an un-updated Android WebView renders broken UI. And `docs/` vs `Docs/` (a
case-only directory collision) will break checkouts on the macOS machines iOS
work requires.

### R14 — Offline is already broken (MED, refutes a "current strength")
`sw.js` never caches HTML ([sw.js:24-30](../public/sw.js#L24)) and has no
precache, so any offline cold-start hits the browser error page. "Offline
support" today means "offline-tolerant while the tab stays open." Any review
that signs off on "offline already works" is wrong.

---

## 9. Missing requirements

The proposal omits every hard engineering requirement. Grouped:

**Migration & remediation (the biggest omission)**
- No plan to re-encrypt or purge existing plaintext `daily_logs` rows, wipe
  partner-side raw-log caches, or handle PITR/backup retention.
- No transition for currently-paired users (their apps hard-depend on the
  `daily_logs` SELECT policy about to be dropped).
- No IndexedDB v1→v2 upgrade/backfill spec; no `ExportData.version` bump
  policy (the importer hard-rejects anything but `version:1`,
  [SettingsView.tsx:67](../src/views/settings/SettingsView.tsx)).
- No correction plan for the **false in-app privacy copy** —
  [PrivacyPolicy.tsx:74](../src/views/settings/PrivacyPolicy.tsx#L74) ("notes
  never shared"), :97-99 ("erase from device and server with one tap"),
  [Onboarding.tsx:34-36](../src/views/tracker/Onboarding.tsx#L34) ("no cloud,
  no account"), [AuthScreen.tsx:163-167](../src/views/auth/AuthScreen.tsx#L163)
  ("encrypted… detailed logs only visible to you") — all false today.

**Key & crypto lifecycle**
- No key-custody model (extractable vs non-extractable, wrapped under
  passphrase/biometric or not), no multi-device key distribution, no rotation
  on unpair/re-pair, no recovery-key UX, no KDF named, no verification
  ceremony (SAS/safety-number) detail, no library budgeted (WebCrypto lacks
  Argon2id/XChaCha20 — libsodium.js is required by the proposal's own
  "audited libraries" rule but never added).
- **Two-way encryption for `shared_notes`** never addressed (the proposal
  treats E2EE as one-way owner→partner; the partner authors notes too).

**Sync & data**
- No tombstones (yet "delete propagation" is listed — impossible without
  them), no meta-store sync (`excludedCycles`/`cycleLengthOverride` diverge
  across devices today), no conflict UX, no `navigator.storage.persist()` (a
  bigger durability gap than anything on the proposal's list).

**Fate of the entire Supabase surface**
- The proposal never mentions Supabase, accounts, RLS, realtime,
  `shared_notes`, `quiet_windows`, or `audit_log`. Each needs an explicit
  decision.

**Product & delivery**
- Zero mention of **testing/CI** (the repo has none) despite ordering crypto
  and merge logic. No feature flags, protocol/payload versioning
  (owner-v2↔partner-v1 skew during SW cache windows), performance budgets,
  accessibility, or **i18n** — the gendered "She/Her" is hardcoded throughout
  [PartnerView.tsx](../src/views/partner/PartnerView.tsx#L171) and
  [sharing.ts:29](../src/lib/sharing.ts#L29), which a privacy-first
  repositioning would be expected to address.
- **Doctor / Research exports** (lines 100-101) have no format (PDF? FHIR?),
  no consent flow, and — for Research — no anonymization scheme, meaningless
  at n≈2 and in tension with the "no analytics" positioning.
- **Store-compliance workstream** absent: Play Data-safety form, Apple privacy
  labels, and Health-Connect approval have weeks of review latency; shipping
  the current plaintext sync inside a reviewed APK is materially riskier than
  on the web, coupling Phase 3 to Phase 1.

**Import correctness (feeds the single source of truth)**
- `parseCSVLine` doesn't handle escaped quotes/newlines; the Apple Health
  regex only matches self-closing `<Record/>` (real exports nest
  `<MetadataEntry>`, yielding 0 rows); generic CSV fabricates `flow:"medium"`
  for every row; EU `dd/mm/yyyy` with slashes is misread as US.
  ([import.ts](../src/lib/import.ts)) Import also overwrites existing rich logs
  with no merge/dedup/provenance.

---

## 10. Suggested improvements to the proposal

1. **Rewrite it as a real spec before any implementation.** Add a threat model
   (or cite Rhea-spec §6), an explicit **supersession list** deprecating
   tech-spec §1-4/§6.4/§10 and DEPLOY Part-A partner policy, a **decision
   record** for killing server-side ML, concrete **data schemas** for the
   `PartnerProjection` payload, the **key-exchange protocol**, and
   **acceptance criteria**. Fix the mangled pandoc formatting (lines 46-48,
   100-101) — the document reads as an unreviewed chat export.

2. **Define `PartnerProjection` as anchors, not baked strings.**
   `{version, computedAt, asOfDate, currentCycleStart, avgCycleLength,
   avgPeriodLength, moodFlag?, gates:{phase,headsup,mood,tips,notes}}`. The
   partner client re-derives phase/predictions daily via the existing pure
   functions ([cycle.ts:127-147,201-223](../src/lib/cycle.ts#L127)), giving
   clock-freshness for free and shrinking the payload to what the head-up
   toggle already implies. Add a **staleness contract** (`computedAt` surfaced
   as "updated N days ago", a TTL banner, and defined post-unpair cache-wipe
   behavior, acknowledged as best-effort).

3. **Re-scope the derived-data rule:** *"never persist derived data in the
   owner store; the partner projection is versioned, persisted, encrypted
   derived data, re-published on every relevant owner-side change,"* and
   enumerate the four recompute triggers (log save, toggle change, quiet-window
   change, excluded-cycle/override change).

4. **Resolve line 55 vs. 92 in favor of "never":** raw logs are never
   shareable under any toggle. If opt-in raw sharing is genuinely wanted, name
   it as a separate, explicitly consented feature with its own channel.

5. **Specify the key lifecycle before writing any crypto:** custody model
   (recommend non-extractable WebCrypto keys on web, upgraded to WebAuthn PRF
   where supported, Keystore/Keychain-sealed on Capacitor), multi-device
   distribution (or declare single-device-per-role for v2), recovery
   (documented as "unrecoverable by design" if that is the choice, surfaced in
   onboarding), rotation on unpair, and an out-of-band **safety-number**
   verification if invite codes remain as discovery. Scope "server never reads
   health data" to **payload content** and disclose the metadata that remains.

6. **Split `shared_notes` out of the Privacy Engine** into a two-party
   encrypted messaging component (per-pair symmetric key), and keep quiet
   windows inside the encrypted projection for offline-correct local
   evaluation.

7. **Mandate a verification plan for the LLM-driven build:** crypto test
   vectors, property tests for merge determinism, RLS integration tests
   against owner/partner/unlinked identities, and a human security-review gate
   on the pairing/encryption PRs. "Guidance for Codex" must say *how the output
   is checked*, not just what to build.

8. **Cut scope explicitly:** delete Bluetooth/LAN/Nearby transports, Research
   Export, and multiple-accounts from v2 (no stated requirement, large test
   surface, n≈2 userbase). Either fully spec **Pregnancy mode** (owner-side
   data field, engine behavior, projection semantics) or remove line 89.

9. **Fold the ignored product debt in while the partner surface is being
   rewritten anyway:** parameterize the gendered copy behind a configurable
   pronoun/name setting; carry accessibility and notification-content
   requirements into the plan; correct the false privacy copy as a Phase-0
   line item.

10. **Add the store-compliance and testing/CI workstreams** the proposal never
    mentions — they are calendar-bound prerequisites, not polish.

---

## 11. Alternative architectures worth considering

### 11.1 The recommended architecture — E2EE over the *existing* Supabase realtime channel

The proposal implies a false dichotomy: that E2EE requires abandoning realtime
for a zoo of P2P transports. It does not. **Ciphertext rows in a Supabase
table still fan out over Postgres-Changes websockets.** This preserves
DEPLOY.md's sub-second partner UX and the shared-notes chat with **no new
transport layer at all** — the cheapest design that satisfies the vision, and
the proposal never evaluates it.

```
   OWNER DEVICE (only place with plaintext)                 PARTNER DEVICE
   ┌───────────────────────────────────────┐               ┌──────────────────────────────┐
   │ DailyLog (IndexedDB, account-scoped)   │               │ PartnerProjection cache       │
   │        │                               │               │ (encrypted at rest)           │
   │        ▼                               │               │        ▲                      │
   │ cycle.ts  (derive, in memory)          │               │  decrypt(K_pair)              │
   │        │                               │               │        │                      │
   │        ▼                               │               │  re-derive phase/predictions  │
   │ Privacy Engine ── selects anchors ─────┤               │  via cycle.ts (pure fns)      │
   │        │                               │               │        │                      │
   │        ▼                               │               │        ▼                      │
   │ encrypt(K_pair)  ← per-pair key from   │               │  PartnerView (gates applied   │
   │        │           X25519 at pairing   │               │  by owner BEFORE encryption)  │
   └────────┼───────────────────────────────┘               └────────▲──────────────────────┘
            │                                                         │
            ▼   ciphertext blob + plaintext {updatedAt, deviceId}     │  realtime push (RLS-gated
   ┌─────────────────────────────────────────────────────────────────┴───────────────────┐
   │  SUPABASE  = zero-knowledge relay + wake-up channel                                   │
   │  partner_projections(owner_id, ciphertext, updated_at)   ← RLS: partner may SELECT    │
   │  daily_logs  → OWNER-ONLY ciphertext blobs (multi-device replica)                     │
   │  shared_notes → ciphertext under K_pair (two-way)                                     │
   │  NO plaintext health columns anywhere · NO partner SELECT on owner raw logs           │
   └───────────────────────────────────────────────────────────────────────────────────────┘
```

**Why this is right for Rhea specifically:**

- The partner is **read-only** (RLS enforces single-writer), so partner sync
  never needs conflict resolution.
- The owner is the **only writer**, so multi-device merge is a simple
  LWW-per-date with an HLC to defeat clock skew — ~20 lines, not vector
  clocks.
- Supabase *already is* the relay ([sync.ts](../src/lib/sync.ts),
  [migration.sql](../supabase/migration.sql)); v2 is a **schema change**
  (plaintext columns → ciphertext blob), not a new service.
- `PartnerView` already reads only 2-3 fields of `CycleState`, so the
  projection is data plumbing, not a UX rewrite (§5).

**Minimal `SyncEngine`/`Transport` seam** the current code can refactor toward:

```ts
interface SyncRecord {
  key: string;                 // e.g. the date
  payload: Ciphertext | null;  // null = tombstone
  updatedAt: string;           // HLC-stamped at EDIT time
  deviceId: string;
  deleted: boolean;
}
interface Transport {          // the ONLY thing that moves bytes
  push(records: SyncRecord[]): Promise<void>;
  pull(since?: Cursor): Promise<{ records: SyncRecord[]; cursor: Cursor }>;
  subscribe?(onChange: () => void): () => void;   // existing realtime channel
}
class SyncEngine {             // owns outbox + cursor + merge (never per-transport)
  enqueue(key): void;          // called INSIDE db.saveLog/deleteLog
  flush(): Promise<void>;      // drain outbox, exponential backoff
  reconcile(): Promise<void>;  // pull since cursor, LWW-merge via non-enqueueing applyRemote()
  start(): void;               // online + visibilitychange + subscribe
}
```

Merge rule, complete: per key, higher `(updatedAt, deviceId)` wins; tombstones
compete as ordinary writes; drop echoes where `deviceId === self`; a
backfilled (epoch-0) record never beats a stamped one.

### 11.2 The "do-less" alternative — incremental hardening (steelman)

**A v2 rearchitecture may not be justified at all** for the current two-person
deployment. The operative privacy defect is not architectural — it is **one
RLS policy, one over-broad upsert, and one missing cache wipe**:

| Phase-0 fix (days, not phases) | Closes |
|---|---|
| Drop `"partner read linked logs"` + `"anyone read unused invites"` policies; add minimal server-side `partner_view` (DEPLOY.md:234 already prescribes this) | Partner reading raw logs; pairing hijack |
| Stop syncing the `notes` column ([sync.ts:21,50](../src/lib/sync.ts#L21)); optionally app-layer-encrypt it | Server/partner holding the most sensitive field |
| Wipe partner IndexedDB on unpair; scope `db.ts` keys by user | Retained caches; cross-account bleed |
| Correct the four false privacy strings | Trust/legal exposure |

This achieves **~90% of the privacy outcome at ~10% of the cost**, on the
existing realtime stack, reversibly. The *only* outcomes that genuinely require
the full v2 rearchitecture are (a) **server-blind phase/date metadata** and
(b) **serverless transports**. The proposal should state which of those it is
actually buying, and for whom — because for today's deployment the honest
answer may be "neither yet."

### 11.3 The account-model fork (a decision the proposal must make)

- **Option A — Supabase auth as an encrypted mailbox (recommended).** Keep
  email/password as identity + envelope addressing (`auth.uid()` owns
  ciphertext rows). Preserves `AuthScreen`, `useAuth` session plumbing, RLS as
  coarse ACLs, realtime as a wake-up channel, and **existing user accounts**.
  Effort: **S**. Requires a key-recovery kit (password reset ≠ key recovery).
- **Option B — no accounts, device-keypair identity over a dumb relay.**
  Philosophically purer, but an **XL rewrite**: deletes `useAuth`/`AuthScreen`/
  all RLS/`profiles`, orphans every existing account, and forfeits Supabase
  realtime addressing.

The proposal presupposes accounts (lines 161-163 "scope by account", "multiple
accounts") *and* pulls toward no-account (lines 18-21) without choosing. It
must choose.

### 11.4 Transports — honest triage

| Transport (proposal:113-122) | Reality for a browser PWA | Verdict |
|---|---|---|
| Encrypted relay | Supabase already is one | **Mandatory baseline** (not "optional") |
| WebRTC | Needs a signaling server + STUN/TURN + both peers online | Post-Capacitor, niche |
| Bluetooth | Web Bluetooth is central-role only; a page cannot be a GATT peripheral; absent on iOS | **Impossible on web** |
| LAN / mDNS | Web pages cannot do mDNS or open listening sockets | **Impossible on web** |
| Nearby | Google Nearby / Apple Multipeer have no web API and don't interop | **Native-only, non-interop** |
| QR | A pairing/key-exchange bootstrap, not a transport | Keep, for pairing |
| iCloud / Drive | A backup channel, not partner sync | Optional encrypted backup only |

Delete the impossible transports from v2; name the relay as the baseline.

---

## 12. Estimated implementation order

The proposal's four phases are **not shippable as written** (§3.4, R6). A
shippable re-phasing, dependency-ordered:

### Phase 0 — Stop the bleeding (days; do before anything else)
1. Drop `"anyone read unused invites"`; hash codes; add expiry + owner-revoke +
   atomic redeem (**R1**).
2. Drop the partner `daily_logs` SELECT policy; add a minimal server-side
   `partner_view` (DEPLOY.md:234).
3. Stop syncing `notes`; wipe partner IndexedDB on unpair; scope `db.ts` by
   account with a "partner never pushes" guard (**R10**).
4. Correct the four false privacy strings.
5. **Stand up the missing safety net:** `tsc` in the build, Vitest with the
   `@` alias, CI, and unit tests for `cycle.ts`. *Prerequisite for touching any
   privacy/crypto code (**R12**).*

### Phase 1 — Foundations for correctness (weeks)
6. Record envelope (`updatedAt` at edit time, `deviceId`, `deleted` tombstones)
   + IndexedDB v1→v2 upgrade with careful backfill (**R5**); `ExportData`
   version bump + acceptance shim.
7. Outbox + online/visibility retry; replace `initialSync`/`pushAll`/`pullAll`
   with `reconcile()`/`flush()`; add DELETE propagation.
8. Unify the three phase engines; delete the `LegacyCycleEntry` bridge; route
   `OverviewTab` symptoms and `QuickAdd` through the one write path.

### Phase 2 — Privacy Engine + E2EE projection (months; critical path)
9. Owner-device Privacy Engine emitting the anchor-based `PartnerProjection`;
   `partner_projections` table + RLS + realtime; switch `PartnerView` to it;
   **one-time partner-local cache purge**; only *then* remove `daily_logs`
   partner access.
10. Key management: X25519 pairing over QR + safety-number verification;
    per-pair AEAD; two-way `shared_notes`; rotation on unpair; **recovery-key
    UX**. Decide the account model (§11.3) and custody (§11.1) first. **(XL)**
11. Historical-plaintext remediation pass (purge/re-encrypt; document PITR
    limits) (**R9**).

### Phase 3 — Mobile (Capacitor) (6–9 eng-weeks if Health excluded)
12. Capacitor config + Android project + SW gating + safe-area viewport + CI
    env injection.
13. Storage-driver extraction from `db.ts` + `@capacitor-community/sqlite`
    (SQLCipher) + idempotent IndexedDB→SQLite migration; hardware-backed key
    custody upgrade (**R7**, **R13**).
14. Native export via Filesystem+Share; **local-only** notifications
    (reschedule-on-write) (**R8**); biometric app-lock; Play/Apple compliance.

### Phase 4 — Advanced (only if justified)
15. Doctor export (define format + consent first); multi-device key
    distribution (**R4**); optional P2P transports as research; Research export
    only with a real anonymization design.

> **Sequencing invariant:** never revoke a data path before its replacement
> ships and the stale caches are purged; never let crypto or merge code ship
> without the Phase-0 test harness in place.

---

## 13. Appendix: severity-ranked defect register

Live defects in the current code (independent of whether v2 proceeds), for
triage:

| # | Severity | Defect | Location |
|---|---|---|---|
| 1 | **Critical** | Pairing hijack: any user reads all unused invites and pairs in | [migration.sql:84-86](../supabase/migration.sql#L84) |
| 2 | **Critical** | Partner RLS grants SELECT on owner's full raw logs incl. notes | [migration.sql:56-62](../supabase/migration.sql#L56) |
| 3 | **High** | Partner device persists owner's full raw history locally | [sync.ts:79-89](../src/lib/sync.ts#L79), [App.tsx:69](../src/App.tsx#L69) |
| 4 | **High** | Cross-account local bleed + re-upload under wrong owner_id | [db.ts:4](../src/lib/db.ts#L4), [sync.ts:8-35](../src/lib/sync.ts#L8) |
| 5 | **High** | `initialSync` pull-overwrites-local → offline edits lost | [sync.ts:142-150](../src/lib/sync.ts#L142) |
| 6 | **High** | Four false in-app privacy claims | [PrivacyPolicy.tsx:74,97](../src/views/settings/PrivacyPolicy.tsx#L74), [Onboarding.tsx:34](../src/views/tracker/Onboarding.tsx#L34), [AuthScreen.tsx:163](../src/views/auth/AuthScreen.tsx#L163) |
| 7 | **High** | Offline cold-start fails (SW never caches HTML) | [sw.js:24-30](../public/sw.js#L24) |
| 8 | **Med** | DELETE never propagates; deleted logs resurrect on pull | [sync.ts:114](../src/lib/sync.ts#L114) |
| 9 | **Med** | Timezone key bug silently skips cloud push (evening, west of UTC) | [App.tsx:57](../src/App.tsx#L57) |
| 10 | **Med** | Three conflicting phase engines; QuickAdd clobbers logs; `localSymptoms` never persists | [utils.ts:32-46](../src/lib/utils.ts#L32), [QuickAddPeriod.tsx:28](../src/views/tracker/QuickAddPeriod.tsx#L28), [App.tsx:63](../src/App.tsx#L63) |
| 11 | **Med** | Role misclassification via `maybeSingle` on N links; ephemeral `roleChosen` | [useAuth.ts:35-56](../src/hooks/useAuth.ts#L35), [App.tsx:34](../src/App.tsx#L34) |
| 12 | **Med** | `redeem_invite` double-redeem race (no `FOR UPDATE`); invites never expire | [migration.sql:96-109](../supabase/migration.sql#L96) |
| 13 | **Med** | Local erase/export miss all cloud tables; audit log incomplete (pair/unpair/export/erase/import never logged) | [db.ts:90-129](../src/lib/db.ts#L90), [audit.ts:39-45](../src/lib/audit.ts#L39) |
| 14 | **Low** | Import parser bugs fabricate/mis-parse data | [import.ts:58-247](../src/lib/import.ts#L58) |
| 15 | **Low** | Many runtime deps never imported in `src/` (all 12 `@radix-ui/*`, plus `vaul`/`sonner`/`class-variance-authority`/`clsx`/`tailwind-merge`); `docs/`↔`Docs/` case collision; no CSP | [package.json:14-36](../package.json#L14), [index.html](../index.html) |

---

*Review complete. The proposal should be treated as a vision statement to be
rewritten into an implementable specification — starting from the Phase-0
hardening in §12, which delivers most of the privacy outcome immediately and is
a prerequisite for everything after it.*
