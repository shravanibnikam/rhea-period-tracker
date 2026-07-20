# Rhea — Technical Specification & Build Plan

> The engineering companion to `Rhea-spec.md`. Where that document owns the *product*,
> this one owns the *system*: accounts, database, sync, the ML/analysis engine, data
> import, and the medical grounding behind every prediction.

*Working document · v0.1 · read alongside the product spec.*

---

## 0. What changed, and one honest tension

The product has grown from "a private tracker that lives only on my phone" into **a real, deployed web app**: separate logins for you and your partner, a proper database, an ML-driven prediction engine seeded with your existing period history, and cross-device + partner sync — all reachable by just opening a URL on a phone or a laptop.

**The tension to resolve first.** "Runs locally" and "syncs with my partner over the web, just open the site" pull in opposite directions if taken literally: pure local-only data can't reach a second person's device, and a normal web app keeps everything on a server. Rhea's answer is the **local-first + encrypted-sync** pattern:

- The app **runs locally** — it's an installable PWA that stores your data in the browser's own database (IndexedDB) and works offline and instantly.
- It **syncs** — changes replicate through an encrypted backend so your laptop, your phone, and (only what you choose to share) your partner all stay current.
- There is **a real database** on both ends: a local one per device, and a server one that holds the synced source of truth.

So "local" describes *where the app runs and where your working copy lives*; "synced" describes *how devices and people stay in agreement*. You get offline speed **and** partner sync, at the cost of trusting a backend with (encrypted) data — a trade the privacy section addresses head-on.

---

## 1. System overview

```
┌────────────────────────┐        ┌────────────────────────┐
│  YOU (Owner)            │        │  PARTNER                │
│  PWA on phone + laptop  │        │  PWA on phone + laptop  │
│  • local DB (IndexedDB) │        │  • local DB (curated)   │
│  • full logging UI      │        │  • read-only phase view │
└───────────┬────────────┘        └───────────┬────────────┘
            │  encrypted sync                  │  encrypted sync (shared slice only)
            ▼                                  ▼
      ┌──────────────────────────────────────────────┐
      │  BACKEND                                        │
      │  • Auth (Owner / Partner roles)                 │
      │  • Postgres (source of truth, row-level security)│
      │  • Sync endpoint                                │
      │  • ML service (predictions written back)        │
      │  • Import service (parse prior-app exports)     │
      └──────────────────────────────────────────────┘
```

Three planes: a **client** (identical codebase, two roles), a **backend** (auth + database + sync + ML + import), and an **ML/analysis service** that reads your logs and writes predictions back.

---

## 2. Accounts & authentication

Two account **roles**, one app.

- **Owner** (you): full logging, full history, controls all sharing.
- **Partner**: their own login, sees only the curated slice the Owner has enabled (see product spec §5).

Flow:

1. Owner signs up (email + password, or passkey/magic-link — passkeys preferred, no password to leak).
2. Owner generates a **pairing invite** (single-use link or code, expiring).
3. Partner signs up via the invite, creating their *own* independent account, and is linked to the Owner with a `partner` relationship.
4. Owner can **revoke** the link at any time; revocation is immediate and wipes the partner's synced copy.

Enforcement is **server-side**, not just UI: the partner's token can only ever read the curated projection, never the Owner's raw logs. With Postgres this is enforced with **Row-Level Security (RLS)** policies keyed on the authenticated user id and role — the database itself refuses to return rows the partner isn't entitled to, so a bug in the client can't leak data.

Sessions: short-lived access token + refresh token; re-auth on sensitive actions (change sharing, export, delete account). Optional app-level PIN/biometric lock on top of device lock.

---

## 3. Data model (database schema)

Postgres server-side; a mirrored subset lives in each device's local DB. Core tables:

| Table | Key fields | Notes |
|---|---|---|
| `users` | id, email, role (`owner`/`partner`), auth metadata | one row per person |
| `partner_links` | owner_id, partner_id, status, created_at, revoked_at | the pairing; drives access |
| `share_settings` | owner_id, share_key, enabled (bool) | per-share toggles (heads-up, phase, mood, tips…) — off by default |
| `daily_logs` | owner_id, date (PK w/ owner), flow, symptoms[], mood, energy, notes, bbt?, lh_test? | **the source of truth**; one row per day |
| `cycles` (derived/materialized) | owner_id, start_date, period_end, period_days, length | recomputed from logs; cached for speed |
| `predictions` | owner_id, generated_at, next_periods[], ovulation_est, fertile_window, phase_forecast[], confidence, model_version | written by the ML service |
| `imports` | owner_id, source_app, imported_at, row_count, status | provenance of imported history |
| `audit_log` | actor_id, action, target, at | who accessed/changed sharing, for trust |

Design rule (unchanged from product spec): **the daily log is the single source of truth**; cycles, averages, phases, and predictions are all *derived* so there's never conflicting state. Sensitive free-text (`notes`) is treated as the most protected field and is **never** part of any partner projection.

The **partner** never gets rows from `daily_logs`. They get a separate, server-computed **`partner_view`** projection built only from `share_settings` that are enabled — e.g. `{ days_until_period, phase_label, phase_guidance, mood_flag? }`.

---

## 4. Sync model

Local-first replication so the app is fast and offline-capable while still syncing:

- Each device keeps a local DB (IndexedDB via a wrapper like Dexie, or SQLite-wasm).
- Writes happen locally first (instant UI), then replicate to the backend.
- The backend is the source of truth for conflict resolution and fan-out to other devices / the partner.
- **Conflict handling:** logs are keyed by `(owner_id, date)`, so the common case is last-write-wins per day; richer merge (per-field) is possible later. Because only the Owner writes logs, cross-person conflicts don't arise — the partner is read-only.
- **Options to implement sync:** a managed backend with realtime replication (e.g. Supabase/Postgres realtime, or a sync engine like ElectricSQL/PowerSync/Replicache). Recommended starting point: **Supabase** (Postgres + auth + RLS + realtime in one), which collapses auth, DB, sync, and the permission model into a single well-trodden stack.

---

## 5. Importing your existing period history

Feeding in prior data is a first-class feature, not an afterthought — it solves the ML "cold start" (predictions are weak until several cycles exist, so importing history makes the app useful on day one).

**Supported sources (parse to the `daily_logs` schema):**

| Source | Export format | Notes |
|---|---|---|
| Clue | CSV export | period days, symptoms; map symptom vocab |
| Flo | data export (CSV/JSON) | periods, symptoms, notes |
| Apple Health | exported XML (`HKCategoryTypeIdentifierMenstrualFlow`, etc.) | flow, spotting, symptoms |
| Google Fit / Samsung Health | CSV/JSON | flow days |
| Generic CSV | date, flow, symptoms columns | a mapping step lets you align columns |

**Flow:** upload file → detect/choose source → preview parsed rows and a column-mapping step → validate (dates, ranges) → write to `daily_logs` with an `imports` provenance row → recompute `cycles` → retrain/refresh predictions. De-duplicate against existing logs by date. Everything imported is editable afterward.

---

## 6. The ML & analysis engine

This is where "use actual ML and data analysis to make accurate decisions" gets real — and where honesty matters, because the science says cycle prediction is *inherently* uncertain.

### 6.1 What the science says (and why it shapes the model)

*Peer-reviewed sources below were retrieved via **PubMed**; DOIs are linked. Clinical background is from Cleveland Clinic and the NIH/NCBI Endotext chapter.*

- **A cycle has four phases** — menstrual, follicular, ovulation, luteal — driven by rising/falling estrogen and progesterone ([Cleveland Clinic](https://my.clevelandclinic.org/health/articles/10132-menstrual-cycle)).
- **"28 days" is a myth for most people.** Normal cycles run ~24–38 days; the NIH/NCBI reference gives a median of 28 with most between 25–30 ([Endotext, NBK279054](https://www.ncbi.nlm.nih.gov/books/NBK279054/)). A study of **612,613 ovulatory cycles** found a mean length of **29.3 days**, and showed cycle length varies between people and drifts down with age (Bull et al., 2019, *NPJ Digital Medicine*; via PubMed, [10.1038/s41746-019-0152-7](https://doi.org/10.1038/s41746-019-0152-7)).
- **The luteal phase is relatively stable (~14 days); the follicular phase is what varies.** Bull et al. measured a mean follicular phase of **16.9 days (95% CI 10–30)** versus a mean luteal phase of **12.4 days (95% CI 7–17)** (via PubMed, [10.1038/s41746-019-0152-7](https://doi.org/10.1038/s41746-019-0152-7)); Endotext states the luteal phase is "relatively constant… ~14 days" ([NBK279054](https://www.ncbi.nlm.nih.gov/books/NBK279054/)). **Design consequence:** predict ovulation by counting *back* from the expected next period (luteal-anchored), not forward from the last one.
- **The fertile window is ~6 days and its timing is genuinely unpredictable.** The egg lives ~24h; the window is the ~5 days before ovulation plus the ovulation day, with peak probability the day *before* ovulation (Dunson et al., 1999, *Hum Reprod*; via PubMed, [10.1093/humrep/14.7.1835](https://doi.org/10.1093/humrep/14.7.1835)). Critically, a prospective study found women had ≥10% chance of being in their fertile window on **every day from cycle day 6 to 21**, and only ~30% had it fall entirely within the "textbook" days 10–17 — even women with regular cycles can't reliably predict it (Wilcox, Dunson & Baird, 2000, *BMJ*; via PubMed, [10.1136/bmj.321.7271.1259](https://doi.org/10.1136/bmj.321.7271.1259)). **Design consequence:** always present the fertile window as a probability band with wide uncertainty, and **never** as contraception.

### 6.2 Model strategy (single-user, few cycles, missing data)

The hard part: one person's data is a short, noisy, gappy time series. Two academic approaches are built for exactly this and shape Rhea's engine:

- **Cyclic Hidden Markov Models (CyHMMs)** — Pierson, Althoff & Leskovec (Stanford), which infer cycle length, model how each symptom progresses across the cycle, handle missing data, and can share information across users (via PubMed, [10.1145/3178876.3186052](https://doi.org/10.1145/3178876.3186052)).
- **Hidden Semi-Markov Models (HSMMs)** — Symul & Holmes, designed to label self-tracked menstrual records, explicitly capture missingness, quantify uncertainty, and predict cycle length by learning individual user characteristics; the implementation is open-source (via PubMed, [10.1109/JBHI.2021.3110716](https://doi.org/10.1109/JBHI.2021.3110716)).

**Rhea's tiered engine:**

1. **Cold start (0–2 cycles):** population priors from the literature (cycle-length distribution, luteal ≈ 14d). Imported history skips most of this stage.
2. **Statistical personal model (3+ cycles):** weighted rolling mean + standard deviation of *your* cycle lengths; luteal-anchored ovulation; fertile band widened by your variability. Transparent and explainable.
3. **Probabilistic state-space model (enough data):** a per-user HSMM/CyHMM-style model that treats phases as hidden states, ingests flow + symptoms + optional BBT/LH, tolerates gaps, and emits **calibrated uncertainty** rather than false-precise dates.
4. **Population priors as a backstop:** where your data is thin, fall back toward literature distributions instead of overfitting a handful of points. (This is the honest substitute for the tens-of-millions-of-cycles neural nets that Clue/Flo train in the cloud — Rhea trades a little accuracy on erratic cycles for keeping the modelling personal and explainable.)

### 6.3 What it outputs

- **Next period(s):** the upcoming date plus several future cycles, each with a prediction interval that widens further out.
- **Ovulation & fertile window:** luteal-anchored estimate as a probability band (per §6.1), labelled an estimate and not contraception.
- **Phase forecast:** menstrual / follicular / fertile / luteal projected onto future dates for the calendar and the phase hero.
- **Symptom & mood patterns:** which symptoms cluster at which cycle positions (the CyHMM insight), surfaced as gentle observations.
- **Anomaly / delay detection:** flag an unusually long/short cycle, or show a "period may be late" state when a predicted date passes unlogged, instead of a stale prediction.
- **Confidence:** every prediction carries an *early / building / good* label driven by how much consistent data exists.

### 6.4 Where it runs

The ML service lives on the backend (a Python service — `statsmodels`/`scikit-learn` for the statistical tier, a probabilistic library such as `pyro`/`numpyro` or the published HSMM implementation for the state-space tier). It recomputes on new/imported data and writes to the `predictions` table; clients just read predictions and render them (and can compute the cheap statistical tier locally for instant offline estimates).

---

## 7. Medical accuracy & the content shown

Every physiological statement in the UI must trace to a citable source, and every fertility statement must carry the uncertainty the literature demands.

- Phase descriptions and "what's happening in the body" copy is grounded in the clinical sources above (Cleveland Clinic; NIH/NCBI Endotext) and the product spec's phase-content model.
- A persistent, quiet disclaimer wherever fertility is shown: **estimates, not contraception; consult a clinician for medical decisions.**
- A "why we think this" affordance: let the user see that a prediction is based on *their* N cycles plus population data, reinforcing that it's an estimate.
- Symptom lists and phase guidance stay descriptive, never diagnostic. Anything suggesting a possible disorder (very irregular cycles, etc.) prompts "consider seeing a clinician," not a diagnosis.

A full **References** list (below) ships in an in-app "Sources" page so the information is visibly legitimate.

---

## 8. Privacy, security & legal

Reproductive-health data is among the most sensitive categories that exists, and in the current US legal climate it can be the target of subpoenas — so this is a design constraint, not a footnote.

- **Encryption in transit** (TLS) and **at rest** (DB-level). Consider **application-layer encryption** of the most sensitive fields (notes, symptoms) so the backend stores ciphertext it can't read; the partner slice is derived on the Owner's device before it syncs.
- **Server-side authorization** via RLS: the database enforces who can read what, independent of client bugs.
- **Data minimization:** collect only what the features need; short retention for anything not essential.
- **Full user control:** one-tap export (your data is portable) and hard delete (account + all rows, including from the partner's synced copy).
- **No selling or ad-targeting data**, ever; no third-party analytics on health fields.
- **Legal:** a plain-language privacy policy; be explicit about what's stored, where, and what a legal request could compel. If application-layer encryption is used for sensitive fields, the provider genuinely cannot hand over readable content — the strongest protection.
- **Auditability:** the `audit_log` lets the Owner see access to sharing settings, building trust.

*Open question flagged in §11: how far to push end-to-end encryption vs. server-side ML. There's a real trade-off — the more the server can't read, the less server-side ML it can do. A middle path runs the heavier ML on the device or on decrypted data only in-memory.*

---

## 9. Cross-platform: one app, phone + laptop

- **PWA** (installable web app) built responsive-first, so the same URL works as a phone home-screen app and a desktop site. No app stores, no separate codebases.
- Service worker for offline use and instant loads; installable with the Rhea icon.
- Layout: single-column mobile → wider multi-panel desktop, same components (the uploaded design already leans this way).
- Note: web push notifications work on desktop and Android freely; on iOS they require the PWA to be installed to the home screen (a known constraint to design around).

---

## 10. Recommended stack

A pragmatic path that collapses auth + database + sync + permissions into one well-supported foundation:

| Layer | Recommendation | Why |
|---|---|---|
| Frontend | React + Vite + Tailwind (the existing Rhea design), as a PWA (`vite-plugin-pwa`) | matches current design; installable; phone + desktop |
| Local store | IndexedDB via Dexie (or SQLite-wasm) | offline, instant, local-first |
| Backend / DB / Auth / Sync | **Supabase** (Postgres + Auth + Row-Level Security + Realtime) | one stack for accounts, the real database, the owner/partner permission model, and sync |
| ML service | Python (FastAPI) with `statsmodels`/`scikit-learn` + a probabilistic lib (`numpyro`) / the published HSMM code | serves the tiered prediction engine; writes to `predictions` |
| Import service | Python parsers (CSV/JSON/Apple-Health XML) | bootstraps the model from prior apps |
| Hosting | Frontend on Vercel/Netlify; Supabase managed; ML on Fly.io/Railway | low-ops, scales from two users up |

Alternatives if you'd rather self-host everything: Postgres + a Node/FastAPI API + a sync engine (ElectricSQL/PowerSync) + your own auth. More control, more work.

---

## 11. Build roadmap

1. **Foundations** — schema + Supabase project + Owner auth + the React PWA shell wired to the existing design; local-first read/write of `daily_logs`.
2. **Import + history** — parsers for Clue/Flo/Apple Health/CSV; provenance; recompute cycles; the History views.
3. **Prediction engine v1** — statistical tier (weighted mean + variability, luteal-anchored ovulation, uncertainty bands) feeding the hero/calendar/predictions; the "Sources" page.
4. **Partner** — invite/pairing, Partner role, RLS-enforced `partner_view`, per-share toggles, revoke + wipe.
5. **Prediction engine v2** — the probabilistic state-space model (HSMM/CyHMM-style) with calibrated uncertainty and symptom-by-phase patterns.
6. **Hardening** — application-layer encryption of sensitive fields, export/delete, audit log, notifications, accessibility, privacy policy.

---

## 12. Open decisions

- **End-to-end encryption depth** vs. server-side ML (see §8) — how much must the server be able to read?
- **Auth method:** passkeys-first (recommended) vs. email+password vs. social login.
- **Managed (Supabase) vs. self-hosted** backend — speed now vs. control later.
- **Partner default openness** (carried over from the product spec): rich-by-default phase guidance vs. everything gated behind explicit shares.
- **BBT/LH input:** support manual or wearable basal temperature to sharpen ovulation estimates? (It's the one signal that most improves per-user accuracy honestly.)
- **How much ML runs on-device** vs. backend, given the encryption choice.

---

## 13. References

**Peer-reviewed literature — retrieved via PubMed** (please cite PubMed; DOIs linked):

1. Bull JR, Rowland SP, Scherwitzl EB, Scherwitzl R, Gemzell Danielsson K, Harper J. *Real-world menstrual cycle characteristics of more than 600,000 menstrual cycles.* NPJ Digit Med. 2019. [10.1038/s41746-019-0152-7](https://doi.org/10.1038/s41746-019-0152-7)
2. Wilcox AJ, Dunson D, Baird DD. *The timing of the "fertile window" in the menstrual cycle: day specific estimates from a prospective study.* BMJ. 2000. [10.1136/bmj.321.7271.1259](https://doi.org/10.1136/bmj.321.7271.1259)
3. Dunson DB, Baird DD, Wilcox AJ, Weinberg CR. *Day-specific probabilities of clinical pregnancy based on two studies with imperfect measures of ovulation.* Hum Reprod. 1999. [10.1093/humrep/14.7.1835](https://doi.org/10.1093/humrep/14.7.1835)
4. Pierson E, Althoff T, Leskovec J. *Modeling Individual Cyclic Variation in Human Behavior* (Cyclic Hidden Markov Models). Proc. WWW Conf. 2018. [10.1145/3178876.3186052](https://doi.org/10.1145/3178876.3186052)
5. Symul L, Holmes S. *Labeling Self-Tracked Menstrual Health Records With Hidden Semi-Markov Models.* IEEE J Biomed Health Inform. 2022. [10.1109/JBHI.2021.3110716](https://doi.org/10.1109/JBHI.2021.3110716)

**Authoritative clinical references:**

6. Cleveland Clinic — *Menstrual Cycle (Normal Menstruation): Overview & Phases.* https://my.clevelandclinic.org/health/articles/10132-menstrual-cycle
7. Cleveland Clinic — *Follicular Phase* and *Luteal Phase.* https://my.clevelandclinic.org/health/body/23953-follicular-phase · https://my.clevelandclinic.org/health/articles/24417-luteal-phase
8. Reed BG, Carr BR. *The Normal Menstrual Cycle and the Control of Ovulation.* Endotext (NIH/NCBI Bookshelf), NBK279054. https://www.ncbi.nlm.nih.gov/books/NBK279054/

*Note: item 4 (Pierson et al.) originates in Stanford academic research on cycle modelling and is a good entry point into the dissertation-level literature on personalized cycle prediction.*

---

*Next: confirm the stack (Supabase vs. self-host) and the encryption-vs-ML trade-off in §12, then start the Foundations phase.*
