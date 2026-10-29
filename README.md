# Rhea

A **local-first** period & cycle tracker built for two people — one person tracks, and a partner can stay gently informed on terms the tracker sets and can revoke.

> ⚠️ **Status: alpha / closed-beta.** Suitable for personal use and trusted testers — **not yet a public health-data product.** In particular, **cloud-synced health data is currently stored in plaintext on the server** (end-to-end encryption is designed but **not yet deployed**). See [Privacy & security](#privacy--security).

---

**Live app:** [Rhea on GitHub Pages](https://shravanibnikam.github.io/rhea-period-tracker/). The hosted build asks you to create an account. Built without Supabase settings, Rhea runs as a local-only tracker (see [Quick start](#quick-start)).

## What you can actually do today

- **Start from a welcome page** — a first visit opens a short landing page with a live estimate you can try with your own dates; nothing typed there is stored or sent. `#welcome` reopens it.
- **Track locally, offline-first** — one `DailyLog` per day in your browser (IndexedDB). Periods, cycles, phases, predictions, and the fertile window are all derived on-device. Rhea installs as a PWA and works offline.
- **See today at a glance** — a cycle ring with the day of your cycle, your next period and fertile window as estimates, today's symptoms, and a one-tap "My period started today".
- **Log & review** — a daily log sheet (flow, symptoms, mood, energy, notes, plus medication and intimacy) with **delete**, quick-add period, a calendar with month/year jump + "Today", and cited sources.
- **Insights** — average cycle and period length with their variability, each cycle by phase, the next three predicted cycles, your most-logged symptoms, and mood by phase. Leave an unusual cycle out of the predictions with one tap.
- **Take your data with you** — export a JSON backup, a CSV spreadsheet, the predicted periods as an `.ics` calendar, or a printable summary for a clinician. Import a Rhea backup or data from Clue, Flo, Apple Health or a generic CSV, or erase this device.
- **Light, dark or system theme.**
- **Sign in & sync** — Supabase email+password auth; owner data syncs across your devices via a durable outbox + hybrid-logical-clock merge, with realtime updates.
- **Partner pairing** — the owner generates an invite code; a partner redeems it to link accounts and see a **read-only** partner view. Six share switches, all off to start: cycle heads-up, today's phase, cycle calendar, today's mood, symptoms and care nudges. Quiet windows pause the view, and an activity log records every change. The partner app doesn't download notes, medication or intimacy (but see [Privacy & security](#privacy--security)). ✅ Verified end-to-end.

### Active roadmap

- On-device model training and evaluation, with visible uncertainty and a rule-based fallback.
- Owner-data encryption after the ML phase; cloud health data remains plaintext today.

The [execution plan](docs/EXECUTION_PLAN.md) records the phase order and release gates.
Native mobile apps are out of scope.

---


## Quick start

```bash
git clone https://github.com/shravanibnikam/rhea-period-tracker.git
cd rhea-period-tracker
npm install

# Optional — enables auth, cloud sync, and pairing.
# Without these the app runs fully as a local-only tracker.
cp .env.example .env
#   VITE_SUPABASE_URL=https://<project>.supabase.co
#   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...

npm run dev      # http://localhost:5173
```

### Commands
| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server (entry `src/app/main.tsx`) |
| `npm run build:pages` | Production project-site build including `404.html` |
| `npm run test:pages` | Deep-link and offline production browser checks |
| `npm run build` | `tsc --noEmit` + `vite build` |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | TypeScript for the app and the tests, no emit |
| `npm run lint` | ESLint (`--max-warnings=0`, layering enforced) |
| `npm test` | Vitest (`test:watch`, `test:coverage` also available) |
| `npm run test:e2e` | Chromium tests against disposable local Supabase ([setup](docs/TESTING.md)) |

---

## Architecture & tech stack

**Stack:** React 18 · TypeScript (strict) · Vite 6 · Tailwind v4 · Radix UI · Supabase (Postgres + Auth + Realtime) · IndexedDB (`idb`) · Recharts · libsodium (crypto primitives, staged for Phase 2) · deployed on GitHub Pages · Node 22 (CI).

Source is organized in strictly-layered directories; imports only point downward and this is enforced by ESLint:

```
kernel  ←  domain  ←  data  ←  sync  ←  app
```

- **`src/kernel`** — dependency-free primitives (Result, errors, logger, branded types).
- **`src/domain`** — pure cycle/phase logic, dates, HLC clock, LWW merge. No I/O.
- **`src/data`** — IndexedDB persistence (StorageDriver seam, per-account DB, repositories, v1→v2 migration, export/import, envelope).
- **`src/sync`** — replication engine (durable outbox, cursor pulls, reconciler, SyncEngine, Supabase/Null transports).
- **`src/app`** — React shell, DI container, hooks, views. `src/app/lib/` holds legacy integration modules (pairing, sharing, partner sync) being reworked in Phase 2.
- **`src/crypto`** — audited-library crypto primitives (XChaCha20-Poly1305); not yet on the sync path.

**Design:** warm and soft, in light and dark. Cormorant Garamond for headings and figures, Nunito for text, both self-hosted. Tokens live in `src/app/styles/theme.css`; components, colour roles and copy rules (sentence case, gender-neutral partner copy, exact privacy wording) are in [`docs/DESIGN.md`](docs/DESIGN.md).

Orientation for contributors: [`docs/REPOSITORY_OVERVIEW.md`](docs/REPOSITORY_OVERVIEW.md). Design authority (v2 target incl. E2EE): [`docs/RHEA_V2_TECHNICAL_SPEC.md`](docs/RHEA_V2_TECHNICAL_SPEC.md). Decisions: [`docs/adr/`](docs/adr/).

---

## Supabase & migrations

The backend is a Supabase project (`daily_logs`, `partner_links`, `invites`, `profiles`, plus sharing tables, all RLS-scoped). Versioned migrations live in [`supabase/migrations/`](supabase/migrations/) with **`0001`–`0006` applied to production**, per the migration ledger:

| # | Migration | Summary |
|---|---|---|
| `0001` | baseline | Consolidated schema, RLS, functions |
| `0002` | secure invite redemption | Hash-at-rest, single-use, TTL invite RPCs |
| `0003` | owner sync metadata | HLC/`deleted`/`server_updated_at` columns + LWW guard trigger |
| `0004` | invite pgcrypto fix | Schema-qualifies pgcrypto so `create_invite`/`redeem_invite` work |
| `0005` | partner share defaults | Seeds calendar and symptom share keys, default off |
| `0006` | keep-alive | Anonymous read of one liveness row |
| `0007` | definer hardening | Pins `search_path` on the four `SECURITY DEFINER` functions, revokes `anon` execute. **Not yet applied to production.** |

Apply to a linked project with `supabase db push`. Details and the applied/verification status: [`supabase/migrations/README.md`](supabase/migrations/README.md). All five pgTAP suites pass locally (48 assertions) and run in CI; see [testing](docs/TESTING.md).

---

## Testing & deployment

- **Tests:** Vitest unit and IndexedDB integration coverage, 48 pgTAP assertions, and four browser tests. Transport fixtures are independent of ambient `.env` configuration. See [testing instructions](docs/TESTING.md).
- **CI:** [`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs typecheck, coverage, configured-environment tests, lint, build, and local Supabase security/browser tests on pushes to main and pull requests.
- **Production verification:** UI save/delete, newer tombstone, two-session reload, unlinked-account isolation and pairing/unlink passed on Pages with synthetic accounts.
- **Deploy:** GitHub Actions builds and deploys Pages from `main` using public repository variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Daily Supabase keep-alive is enabled.
- **Data transfer:** JSON transfer is confirmed and the former hosting project has been retired. See [hosting and data-transfer instructions](docs/HOSTING.md).

---

## Privacy & security

Rhea's **goal** is that detailed health data never reaches a server in readable form. That end state is **not yet in place** — be honest with yourself and any testers:

- 🔴 **Cloud health data is currently PLAINTEXT.** When sync is enabled, owner `daily_logs` (flow, symptoms, mood, energy, notes, medication, intimacy) are stored **unencrypted** in Supabase. The "zero-knowledge server" model is designed (see the technical spec) but **not deployed**. <!-- copy-guard: allow zero-knowledge -->
- 🔴 **Partner sharing reads the owner's plaintext rows** via RLS (legacy path); share toggles/quiet windows are currently presentation-level, not a hard data boundary. The partner app leaves notes, medication and intimacy out of what it downloads, but a linked partner's account can still read them through the API.
- 🟢 Invite secrets are stored hashed (sha256), single-use, 30-minute TTL.
- 🟢 Shared notes are removed from the app: no shared-note messages are sent or shown. Daily-log notes, medication and intimacy still sync in plaintext when owner sync is enabled.
- 🟡 The crypto layer has had no external security review.

**Bottom line:** fine for your own data and trusted alpha/closed-beta testers who understand the above; **not yet appropriate as a public product handling other people's reproductive-health data.**

---

## Project status & docs

- **Active work order:** [`docs/EXECUTION_PLAN.md`](docs/EXECUTION_PLAN.md)
- **Changes:** [`CHANGELOG.md`](CHANGELOG.md) · **License:** [MIT](LICENSE)

- **Current live state & what shipped recently:** [`docs/IMPLEMENTATION_STATUS.md`](docs/IMPLEMENTATION_STATUS.md)
- **Codebase orientation:** [`docs/REPOSITORY_OVERVIEW.md`](docs/REPOSITORY_OVERVIEW.md)
- **v2 design authority (E2EE target):** [`docs/RHEA_V2_TECHNICAL_SPEC.md`](docs/RHEA_V2_TECHNICAL_SPEC.md)
- **Architecture decisions:** [`docs/adr/`](docs/adr/)
- **Planning artifacts** (frozen at the 2026-07-15 planning state): `docs/V2_*`, `docs/RISK_REGISTER.md`, `docs/ARCHITECTURE_CRITIQUE.md`
