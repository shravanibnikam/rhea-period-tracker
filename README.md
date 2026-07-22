# Rhea

A private, **local-first** period & cycle tracker built for two people — one person tracks, and a partner can stay gently informed on terms the tracker sets and can revoke.

> ⚠️ **Status: alpha / closed-beta.** Suitable for personal use and trusted testers — **not yet a public health-data product.** In particular, **cloud-synced health data is currently stored in plaintext on the server** (end-to-end encryption is designed but **not yet deployed**). See [Privacy & security](#privacy--security).

---

## What you can actually do today

- **Track locally, offline-first** — one `DailyLog` per day in your browser (IndexedDB). Periods, cycles, phases, predictions, and the fertile window are all derived on-device.
- **Log & review** — daily log sheet (flow, symptoms, mood, energy, notes) with **delete**, quick-add period, a calendar with month/year jump + "Today", history, predictions, and cited sources.
- **Sign in & sync (optional)** — Supabase email+password auth; owner data syncs across your devices via a durable outbox + hybrid-logical-clock merge, with realtime updates.
- **Partner pairing** — the owner generates an invite code; a partner redeems it to link accounts and see a **read-only** shared view with per-item share toggles and quiet windows. ✅ Verified end-to-end.

### Not yet available (planned)
- 🔒 **End-to-end encryption** of cloud data (Phase 2) — *currently cloud health data is plaintext.*
- 📱 **Mobile apps** (Capacitor/native, Phase 3).
- 🧪 **RLS pgTAP suites** are authored but **not yet executed / wired into CI**.
- 🟡 **Delete-sync live E2E** — the delete→cloud-tombstone fixes are shipped and unit-tested, but a final real-UI confirmation is still pending.

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
| `npm run build` | `tsc --noEmit` + `vite build` |
| `npm run typecheck` | TypeScript, no emit |
| `npm run lint` | ESLint (`--max-warnings=0`, layering enforced) |
| `npm test` | Vitest (`test:watch`, `test:coverage` also available) |

---

## Architecture & tech stack

**Stack:** React 18 · TypeScript (strict) · Vite 6 · Tailwind v4 · Supabase (Postgres + Auth + Realtime) · IndexedDB (`idb`) · Recharts · libsodium (crypto primitives, staged for Phase 2) · deployed on Vercel · Node 22 (CI).

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

Orientation for contributors: [`docs/REPOSITORY_OVERVIEW.md`](docs/REPOSITORY_OVERVIEW.md). Design authority (v2 target incl. E2EE): [`docs/RHEA_V2_TECHNICAL_SPEC.md`](docs/RHEA_V2_TECHNICAL_SPEC.md). Decisions: [`docs/adr/`](docs/adr/).

---

## Supabase & migrations

The backend is a Supabase project (`daily_logs`, `partner_links`, `invites`, `profiles`, plus sharing tables, all RLS-scoped). Versioned migrations live in [`supabase/migrations/`](supabase/migrations/) and are all **applied to production** (`0001`–`0004`):

| # | Migration | Summary |
|---|---|---|
| `0001` | baseline | Consolidated schema, RLS, functions |
| `0002` | secure invite redemption | Hash-at-rest, single-use, TTL invite RPCs |
| `0003` | owner sync metadata | HLC/`deleted`/`server_updated_at` columns + LWW guard trigger |
| `0004` | invite pgcrypto fix | Schema-qualifies pgcrypto so `create_invite`/`redeem_invite` work |

Apply to a linked project with `supabase db push`. Details and the applied/verification status: [`supabase/migrations/README.md`](supabase/migrations/README.md). Note: the pgTAP RLS suites in `supabase/tests/` are **not yet executed / CI-wired**.

---

## Testing & deployment

- **Tests:** ~270 passing across the `tests/` suite (unit + a real IndexedDB migration integration test). Two `transports.spec.ts` cases only "fail" locally when a populated `.env` makes Supabase look configured; they pass in CI.
- **CI:** [`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs typecheck, test, lint, and build on every push/PR.
- **Deploy:** Vercel auto-deploys `main`; the production alias is `rhea-period-tracker.vercel.app`. Requires `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` set in the Vercel project.

---

## Privacy & security

Rhea's **goal** is that detailed health data never reaches a server in readable form. That end state is **not yet in place** — be honest with yourself and any testers:

- 🔴 **Cloud health data is currently PLAINTEXT.** When sync is enabled, owner `daily_logs` (flow, symptoms, mood, energy, notes, medication, intimacy) are stored **unencrypted** in Supabase. The "zero-knowledge server" model is designed (see the technical spec) but **not deployed**.
- 🔴 **Partner sharing reads the owner's plaintext rows** via RLS (legacy path); share toggles/quiet windows are currently presentation-level, not a hard data boundary.
- 🟢 Invite secrets are stored hashed (sha256), single-use, 30-minute TTL.
- 🟢 Shared-notes sync is **disabled** (`flags.notesSync=false`) — note content never leaves the device.
- 🟡 The crypto layer has had no external security review.

**Bottom line:** fine for your own data and trusted alpha/closed-beta testers who understand the above; **not yet appropriate as a public product handling other people's reproductive-health data.**

---

## Project status & docs

- **Current live state & what shipped recently:** [`docs/IMPLEMENTATION_STATUS.md`](docs/IMPLEMENTATION_STATUS.md)
- **Codebase orientation:** [`docs/REPOSITORY_OVERVIEW.md`](docs/REPOSITORY_OVERVIEW.md)
- **v2 design authority (E2EE target):** [`docs/RHEA_V2_TECHNICAL_SPEC.md`](docs/RHEA_V2_TECHNICAL_SPEC.md)
- **Architecture decisions:** [`docs/adr/`](docs/adr/)
- **Planning artifacts** (frozen at the 2026-07-15 planning state): `docs/V2_*`, `docs/RISK_REGISTER.md`, `docs/ARCHITECTURE_CRITIQUE.md`
