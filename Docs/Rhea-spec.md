# Rhea — Product & Design Specification

> A private, local-first cycle tracker built for two people, not one.

*Working document · v0.1 · owns the vision, the partner model, the privacy stance, and the build plan.*

---

## 1. The name

**Rhea.** The Greek Titaness of fertility, motherhood, and generation — mother of the Olympians, consort of Kronos (time). Since antiquity her name has been linked to *rhoē* ("flowing," "a stream"); Plato's *Cratylus* puns on exactly this, pairing Rhea's flux against Kronos's time. Scholars consider the ultimate etymology pre-Greek and uncertain, so the honest claim is *an ancient, attested association with flow* rather than a literal translation — but that's more than enough.

Why it works as a product name:

- **Four letters, one syllable and a bit** — the minimalist equal of *Flo*, without riding on it.
- **"Flow" without the cliché.** Says what the app is about without pink ribbons or moon logos.
- **Mythic weight, quietly worn.** Fertility and motherhood are in the name's DNA, so the app never has to shout them.
- **Ownable.** Short, memorable, easy to type, and not another "-ly" SaaS coinage.

This replaces the earlier placeholder name (*Luna*) everywhere — title, wordmark, favicon, cache keys.

**Logo.** A flowing loop: a tapering ribbon that sweeps roughly 300° and curls back toward the centre — a stream turning into a cycle. It encodes the name's meaning (Rhea → *flow / stream*) and the cyclical subject *without* the moon motif Luna leaned on. Rendered in the terracotta→peach gradient of the app, paired with the "Rhea" wordmark set in Playfair Display. Delivered as `rhea-mark.svg` plus favicon/app-icon PNGs.

---

## 2. What Rhea is

Rhea is a period and cycle tracker with one defining idea: **the partner is a first-class user.** Most trackers bolt on "sharing" as an afterthought — a read-only invite, or nothing. Rhea is designed from the ground up so that one person tracks and the other stays gently, respectfully informed, on terms the tracker sets and can revoke at any time.

It is also **local-first and private by construction.** Reproductive-health data is among the most sensitive data a person can hold. Rhea's answer is not "we promise to protect your data on our servers" — it's "your detailed data never reaches a server at all." Only a small, curated slice you explicitly choose to share ever leaves your device, and even that travels end-to-end encrypted.

Two sentences, if it needs to fit on a card:

> Rhea tracks your cycle entirely on your own device — nothing uploaded, no account required. When you want your partner in the loop, you share exactly as much as you choose, and take it back whenever you like.

---

## 3. Principles (the non-negotiables)

1. **Your body, your data, your device.** Detailed logs live only on the tracker's phone. No cloud copy of symptoms, moods, or notes. Ever.
2. **The tracker holds the lens.** The partner never sees more than the tracker has chosen to show, and sharing is always revocable in one tap.
3. **Consent is explicit and ongoing**, not a checkbox at signup. Pairing is deliberate; un-pairing is easy and instant.
4. **Honest predictions.** Estimates are labelled as estimates. Rhea never presents calendar-method fertility windows as contraception, and says so plainly.
5. **No dark patterns.** No engagement nags, no data-hungry defaults, no "share more to unlock." The app works fully with zero sharing.
6. **Calm over clinical.** This is an app opened at night, in bed, tired. It should feel quiet, warm, and unhurried — not like a lab report.

---

## 4. Who it's for

**The tracker** logs their cycle: flow, symptoms, mood, energy, notes. They want quick daily logging, useful predictions, and control over what a partner sees.

**The partner** wants to be considerate and prepared — to know a rough day might be coming, when a period is likely, or simply that today's a good day to be extra kind — without being intrusive or being handed clinical detail they neither need nor should have by default.

The relationship being served is not "app and user" — it's **two people trying to be good to each other.** Every feature answers to that.

---

## 5. The partner model (the core of the product)

Access mode: **curated view the tracker controls** (chosen over shared-account and read-only-mirror alternatives). Design details:

### What the partner can see
Nothing by default. The tracker turns on individual *shares*, each independently:

| Share | What the partner sees | Off by default |
|---|---|---|
| Cycle heads-up | "Period likely in ~N days" | ✓ |
| Today's phase | A soft label (e.g. "luteal — may be lower energy") | ✓ |
| Mood signal | An optional, tracker-set flag: "rough day," "good day" | ✓ |
| Care nudges | Gentle suggestions to the partner ("check in," "she may want space") | ✓ |
| Shared notes | A small two-way space for messages, not medical detail | ✓ |

What the partner **never** sees, regardless of settings: raw symptom logs, freeform private notes, historical detail, or anything the tracker hasn't mapped to a share. The curated slice is *derived* and *sanitized* on the tracker's device before anything is transmitted.

### Consent & control
- **Pairing** is a deliberate act: the tracker generates an invite (code or QR); the partner accepts. No silent linking.
- **Un-pairing** is one tap and immediate. On un-pair, the shared slice is wiped from the relay and the partner's device.
- **Per-share toggles** can be flipped any time. A share turned off disappears from the partner's view on next sync.
- **Quiet windows** (optional): the tracker can suppress all sharing for chosen days.

### The asymmetry is intentional
This is not a symmetric "couples app." One person's body is being tracked; that person holds all the controls. The partner's role is to *receive and respond*, not to inspect. The product language reflects this throughout.

### How the design realizes this
The uploaded design's Partner view already embodies the right *spirit*: it shows phase-aware, educational guidance — *What's Happening in Her Body*, *How You Can Help* — rather than raw logs. To bring it fully in line with this section, its content must be **gated by the per-share toggles above** (off by default) and driven only by the sanitized curated slice, not the full local data. In other words: keep the design's warm, considerate framing; put the tracker's consent controls in front of it.

---

## 6. Privacy & data architecture

The privacy model *is* the architecture — it can't be retrofitted, so it's decided here.

### Two tiers of data
- **Detailed data** (flow, symptoms, mood, energy, notes, full history): lives **only** in IndexedDB on the tracker's device. Never serialized to any network.
- **Curated slice** (the small, sanitized summary the tracker has opted to share): the *only* thing that can leave the device, and only when at least one share is on and a partner is paired.

### How the curated slice travels (Phase 3)
Local-first plus a partner on a *different* phone is a genuine tension: some bytes must move. The resolution keeps the spirit intact:

1. On the tracker's device, Rhea builds the curated slice from enabled shares only.
2. It **encrypts the slice end-to-end** with a key derived at pairing and exchanged out-of-band (embedded in the QR / invite), so the relay never sees the key.
3. The encrypted blob is pushed to a **minimal relay** (e.g. Cloudflare Worker + KV), keyed by an opaque pairing ID. The relay stores only ciphertext and can decrypt nothing.
4. The partner's device pulls the blob and decrypts locally.

The relay is a dumb, zero-knowledge letterbox. It holds no accounts, no detailed data, and nothing readable. If it were fully breached, an attacker would get opaque blobs and pairing IDs — no symptoms, no notes, no identities.

### Threat model (informal)
- **Lost/stolen tracker phone** → detailed data protected by device lock; consider optional app-level PIN + at-rest encryption of the IndexedDB payload.
- **Relay breach** → ciphertext only; useless without the per-pair key.
- **Nosy partner** → sees only enabled shares; can never escalate to detailed data.
- **Us (the app makers)** → we hold nothing. There is no "us" server for the sensitive tier.
- **Browser data wipe** → the real risk to the *tracker*: clearing site data erases everything. Mitigation: prominent, easy **export/backup** (already in Phase 1) and periodic reminders.

---

## 7. Feature roadmap

### Phase 1 — Solo tracking (in progress)
Local-first data layer built and tested (IndexedDB storage + derived-cycle math: daily flow/symptoms/mood/energy/notes, month calendar, history + averages, export / import / erase). The chosen **Rhea design** (rebranded from the uploaded build) provides the UI: phase hero, Overview / Calendar / History / Predictions tabs. Remaining work: wire the tested data layer under the design (replace sample data), add PWA manifest + service worker.

### Phase 2 — Insight
Symptom and mood patterns by phase ("cramps cluster on cycle days 1–2," "energy dips in the late luteal"); cycle-length variability and regularity view; gentle, non-judgemental summaries. Still 100% on-device.

### Phase 3 — Partner (the differentiator)
Pairing (invite code / QR), per-share toggles, the curated partner view, the encrypted relay, un-pair + wipe, quiet windows. Two app "modes": tracker and partner.

### Phase 4 — Polish & live
Notifications (period reminders, log nudges, partner heads-ups — noting iOS web-push requires an installed PWA), onboarding, accessibility pass, deploy to a static host, self-hosted fonts for true offline.

### Later / maybe
Widget/complication for at-a-glance day; passcode lock; multiple prediction models; data-portability with other trackers.

---

## 8. Screens & information architecture

The chosen design is a single responsive app with a **My View / Partner** toggle in the header (the wordmark + logomark sit to its left). This is the canonical structure.

**My View** (the tracker) — a color-shifting **phase hero** at the top of every tab, then four tabs:

- **Overview** — hero (current phase, cycle day, days-until-period, next-period date, segmented phase-progress bar), *What's Happening* (phase explainer), *Today's Symptoms* (quick multi-select log), *Upcoming Periods*.
- **Calendar** — month grid with phase-colored days and predicted period marked.
- **History** — *Cycle Length History* chart (per-cycle lengths over time) and a *Cycle Log* list.
- **Predictions** — *Your Next 3 Cycles* (projected dates + phases) and a *Phase Reference*.

**Partner** (the differentiator) — the curated, phase-aware view:

- Phase hero (framed for the partner), *What's Happening in Her Body*, *How You Can Help* (phase-specific partner tips), *What's Coming Next*, *Understanding the Full Cycle*.

**Phase-content model.** Each of the four phases carries a small content bundle used across both views: `name`, `shortName`, `range`, phase colors, `emoji`, `tagline` (e.g. "Rest & Release," "Rise & Bloom," "Peak & Shine," "Turn Inward"), `description`, `partnerDesc`, `energy` (1–5), `mood`, `symptoms[]`, `tips[]`, `partnerTips[]`. This is what makes the app feel *warm and guiding* rather than clinical.

Not yet in the visual design, to add: **Settings** (cycle-length override, export / import / erase, app lock) and, for Phase 3, **Sharing controls** (pairing, per-share toggles, quiet windows, un-pair) — these govern what the Partner view is actually allowed to show (see §5).

---

## 9. Data model

Single source of truth is the daily log; cycles, averages, and predictions are *derived*, never stored redundantly.

**`logs`** (IndexedDB, keyed by `date` = `YYYY-MM-DD`)

| Field | Type | Notes |
|---|---|---|
| date | string | primary key, local date |
| flow | enum | none / spotting / light / medium / heavy |
| symptoms | string[] | multi-select |
| mood | string \| null | single-select |
| energy | string \| null | low / medium / high |
| notes | string | freeform, private, never shared |

**`meta`** (IndexedDB, keyed by `key`) — settings such as `cycleLengthOverride`, and (Phase 3) pairing keys/IDs.

**Derived (in memory, `cycle.js`)** — periods (grouped bleed days, 1-day gap tolerance), cycles (period-start to next period-start), average cycle length (rolling, last 6), average period length, current cycle day, phase, next-period date, fertile-window estimate, confidence level.

**Curated slice (Phase 3, transient)** — built from enabled shares only, e.g. `{ daysUntilNext, phaseLabel, moodFlag? }`. Encrypted before it ever exists off-device.

---

## 10. Prediction & history model

### What Clue and Flo actually do

Both leaders long ago abandoned fixed 28-day calendar math for adaptive, personalized prediction:

- **Clue** runs machine-learning models trained on anonymized data from millions of cycles, weighting individual patterns such as cycle-length variability and luteal-phase consistency. It needs roughly **three cycles** for accurate core predictions (period, fertile window, ovulation), treats **21–35 days** as a normal range, predicts next period / fertile window / PMS, can project the next **12 periods** (paid tier), and lets users **hide an anomalous cycle** so it doesn't skew predictions. Its separate FDA-cleared contraceptive product uses **Bayesian modelling** off a single input — the period start date.
- **Flo** was the first tracker to publicly use **neural networks**, combining per-user pattern recognition with a population model; it reports cutting irregular-cycle error from ~5.6 to ~2.6 days. It also needs ~**3 cycles**, estimates ovulation ~**14 days before the next period**, **widens the fertile window to ~14 days** when it can't predict confidently, and shows a **"delay" state** when a predicted period doesn't arrive.

### What Rhea can and can't borrow

The catch: those models are **cloud-trained on tens of millions of users' cycles.** Rhea is local-first and single-user *by design*, so it deliberately forgoes population-scale ML. **It cannot match their irregular-cycle accuracy, and won't pretend to.** What it *can* do entirely on-device is a solid adaptive statistical model that captures most of the day-to-day value — and Rhea's honesty about its limits is itself a feature.

### Rhea's on-device model

1. **Inputs:** period start dates (primary), period length, optional manual cycle-length override. (Basal body temperature / wearable input is a possible later add.)
2. **Cycle length:** weighted rolling average of the last 3–6 cycles (recent weighted more), plus **standard deviation** as a variability measure. Fallback 28 until data exists.
3. **Outlier handling:** auto-flag cycles far outside the personal range, and let the user **exclude / "hide" a cycle** from predictions (Clue-style) — a sick month, a skipped log, a one-off.
4. **Ovulation, anchored to the luteal phase:** predicted ovulation ≈ *next-period − luteal length* (default 14), **not** the cycle midpoint. Rationale: the luteal phase is relatively fixed (~12–14 days) while the follicular phase stretches and shrinks, so counting back from the next period is more robust than counting forward from the last.
5. **Fertile window:** ovulation −5 to +1 (sperm survive ~5 days, egg ~24h). When variability is high, **widen the window and lower confidence** (Flo-style) instead of showing false precision.
6. **Future dates:** chain predictions to show the **next several periods** (target: up to 12), with visibly widening uncertainty the further out they go.
7. **Future phases:** project menstrual / follicular / fertile / luteal onto upcoming dates so the calendar and dial can show *coming* phases — all clearly marked as estimates.
8. **Delay state:** if a predicted period date passes with no logged bleed, switch to a **"period may be late"** state rather than a stale, wrong-looking prediction.
9. **Confidence:** derived from cycle count *and* variability → *early → building → good*. Shown plainly.
10. **Honesty rails:** fertile/ovulation output is calendar-method, **never contraception**; the disclaimer is permanent, non-negotiable copy.

### The four phases (medically grounded)

| Phase | Span | Character |
|---|---|---|
| **Menstrual** | Bleeding days | The logged period. |
| **Follicular** | Period end → ovulation | *Variable* length — this is the part that changes with cycle length. |
| **Ovulation / fertile** | ~5 days before + day of + ~1 day after | Highest conception likelihood. |
| **Luteal** | Ovulation → next period | ~12–14 days, relatively **stable** — which is why prediction anchors here. |

### History features

- **Full daily log history** (built): flow, symptoms, mood, energy, notes per day.
- **Cycle list** with per-cycle length and period length (built), plus a **regularity / variability** indicator (how consistent recent cycles are).
- **Editable past cycles** — both Clue and Flo stress that correcting past logs improves accuracy, so allow editing and back-filling missed days.
- **Exclude-from-prediction** toggle per cycle (see model step 3).
- **Pattern insights** (Phase 2): symptom and mood frequency by phase, cycle-length trend over time.

---

## 11. Design language

Direction: **warm & editorial.** A soft, daylight identity — cream paper, terracotta, and a serif display face — that feels like a well-designed wellness journal rather than a clinical dashboard. The whole UI **shifts color with the current phase**, so the app quietly *feels* like where you are in your cycle. (This supersedes the earlier dark "Dusk" concept; the Phase-1 prototype would be re-skinned to this identity.)

### Palette
| Token | Hex | Role |
|---|---|---|
| background | `#FDF8F5` | warm cream ground |
| card | `#FFFAF8` | cards, sheets |
| foreground | `#2D1F1A` | primary text (warm ink) |
| primary | `#C4776A` | terracotta — brand + primary actions |
| accent | `#F2B5A0` | peach — highlights, logo gradient end |
| secondary / muted | `#F5EDE9` / `#EDE5E0` | fills, chips |
| muted-foreground | `#8A7570` | secondary text (warm taupe) |
| **menstrual** | `#BE5A5A` | phase — deep rose |
| **follicular** | `#5E8A52` | phase — green |
| **ovulation** | `#C9913A` | phase — gold |
| **luteal** | `#8B6FA0` | phase — violet |

Each phase also has a soft tinted `bg` / `border` / `text` set used to theme the hero card. Radius `0.75rem` throughout; borders are a low-opacity warm line.

### Typography
- **Display / serif:** *Playfair Display* — headings, phase names, key numbers; often set in italic for taglines ("Rest & Release"). High-contrast, editorial.
- **Body / UI:** *DM Sans* — clean, friendly, highly legible at small sizes.
- **Utility:** uppercase, letter-spaced DM Sans for eyebrows and labels.
- *Offline note:* self-host both faces for a genuinely offline PWA.

### Logo
The flowing-loop mark (see §1) in the terracotta→peach gradient, beside the "Rhea" wordmark in Playfair. Sits top-left in the header. Ships as `rhea-mark.svg` + favicon/app-icon PNGs (incl. a maskable variant).

### Signature elements
1. **The color-shifting phase hero** — a large card that re-themes to the current phase, showing the phase name (Playfair), tagline, emoji, the key stats, and a **segmented phase-progress bar** whose four segments are sized by each phase's length and whose current segment is lit. This is the memorable, content-true centerpiece.
2. **Phase-as-hue everywhere** — calendar, charts, and reference all read the same four-color phase system, so color always means the same thing.

### Voice & copy
- Warm, plain, unhurried. Sentence case. Active voice ("Log today," not "Submit").
- Names things by what the person controls, never system internals ("Cycle heads-up," not "sync payload").
- Empty states invite action; errors explain and guide, never apologize vaguely.
- The partner side stays *considerate and non-clinical*: "she may have lower energy today," not "luteal-phase progesterone decline."
- The fertility disclaimer is quiet but always present where relevant.

---

## 12. Technical shape

The project now has two pieces that meet in the middle:

- **UI layer — the chosen design.** React + Vite + Tailwind + shadcn/ui (the uploaded, rebranded design). Playfair Display + DM Sans, the warm phase-themed system, the My View / Partner structure. This is the canonical front end.
- **Data layer — local-first, from the Phase-1 prototype.** IndexedDB storage (`db.js`) and the pure, tested cycle math (`cycle.js` — derivation, averages, luteal-anchored predictions). This ports directly under the React UI so the app keeps its **local-first, on-device** guarantee.

Reconciliation plan: replace the design's sample `CYCLE_DATA` with the IndexedDB-backed store; feed real logs through the tested `cycle.js` snapshot to drive the hero, calendar, history chart, and predictions.

- **PWA:** add manifest + service worker to the Vite build so it stays installable and offline; self-host fonts.
- **Hosting:** any static host (Netlify / GitHub Pages / Vercel). Hosting the *code* doesn't compromise local-first — data stays in each device's IndexedDB.
- **Phase 3 addition:** a single zero-knowledge relay endpoint (Cloudflare Worker + KV or equivalent) storing only encrypted blobs keyed by pairing ID.

---

## 13. Open decisions

- **App lock:** offer an optional PIN / biometric gate on the tracker app? (Recommended — low cost, high trust.)
- **At-rest encryption of IndexedDB:** encrypt the local payload too, or rely on device lock? (Trade-off: safety vs. complexity and export/restore friction.)
- **Mood signal semantics:** tracker-set flag only, or optionally derived from logged mood? (Derived is convenient but leaks inference — probably keep it tracker-set.)
- **Partner logging:** strictly read + shared-notes, or can the partner log care actions? (Leaning read + notes for v1.)
- **Notifications transport:** web push (needs installed PWA, iOS caveats) vs. local reminders only for v1.
- **Backup nudge cadence:** how often to remind the tracker to export, without nagging.

---

## 14. Definition of done

For a two-person app used by real people, "done" is not app-store metrics. It's:

- The tracker can log in under ten seconds and trust the data is theirs alone.
- Predictions are useful enough to plan around, and never overclaim.
- The partner feels *more considerate*, not more surveillant.
- Turning sharing off is as easy and immediate as turning it on.
- If every server Rhea touches vanished tomorrow, the tracker would lose nothing.

---

*Next: wire the tested local-first data layer under the rebranded Rhea design, then design Phase 3 pairing + the encrypted relay. This document is the reference — update it as decisions in §13 get made.*
