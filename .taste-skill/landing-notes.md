# Rhea landing — working notes

Direction: Colour chapters, seed 1499624779 (dealt before this run; not redrawn).
Palette colours taken from the subject: Rhea's four phase fields in cycle order on charcoal.

## Inventory (only Rhea has these)
1. The name: Rhea, Saturn's second-largest moon; Cassini photographed it 2004–2017 (public domain).
2. "RHEA. PERIOD." — the name and what it is.
3. Four phases, each with a colour and a tagline: Rest & Release (red #C8322B), Rise & Bloom
   (green #2F7A4B), Peak & Shine (gold #F2B53A), Turn Inward (plum #6D3B6A).
4. The phase oracle: 28-day cycle, 5-day period → menstrual 1–5, follicular 6–9, ovulation 10–15,
   luteal 16–28; luteal fixed at 14 days; fertile window = ovulation −5 to +1.
5. Local-first: logs in the browser's IndexedDB, offline, installable PWA; local-only copies send
   nothing; the hosted build needs an account and syncs over TLS, not end-to-end encrypted.
6. Partner view: Cycle heads-up, Today's phase, Cycle calendar, Mood signal, Symptoms, Care nudges,
   Shared notes; all off by default; quiet windows pause it; toggles are not enforced by the server.
7. Sources: Bull 2019 (600,000+ cycles), Wilcox 2000, Dunson 1999, Pierson 2018, Symul & Holmes 2022,
   Reed & Carr (Endotext), Cleveland Clinic.
8. Its file: rhea-backup-YYYY-MM-DD.json (version 2, appVersion 0.2.0).
9. Imports: Clue CSV, Flo JSON/CSV, Apple Health export.xml, any CSV (date + flow; dd/mm detected
   per file; flow never invented); imports merge field by field.
10. MIT licence; github.com/shravanibnikam/rhea-period-tracker.
11. The log: flow (5 levels), 31 symptoms, 26 moods, energy low/medium/high, notes.

## Idea
On this page, one menstrual cycle — Rhea's four phases with their own colours, names and days —
becomes the colour chapters the page scrolls through.
Competitor test: Clue or Flo in the sentence fails — the four named, coloured phases and their day
oracle are Rhea's own.

## Live thing
"My last period started [date]" — a sentence with a blank (+ "usually [28] days"). Rhea's own engine
(buildPeriodLogs → deriveCycleState, computeFertileWindow) runs in the browser; the chapter takes the
field colour of the visitor's phase and Rhea's Today card shows cycle day, phase + tagline, next
period, estimated fertile window ("a calendar estimate, not contraception"). Nothing stored or sent.
Fallback before input: the card lists the four phases with their days for the chosen length.

## Placement record (no redraws)
- Added one section, the live thing, between about and showcase, using the geometry of
  `cta-blank-in-the-sentence` (a sentence whose blank is the form). No dealt blueprint holds an input
  with a result; the dealt cta (action tile) stays as the close.
- Added one full-bleed photograph chapter (the direction allows "one photograph with a caption" per
  field) so the page carries real pictures: the dealt blueprints are type-led.
- Pictures: one family, Cassini photographs of Rhea (NASA/JPL/SSI, public domain).

## Argument
1. Hero — Rhea is a period tracker → RHEA. / PERIOD. + one plain sentence + Start tracking.
2. About — local-first, and exact about where logs go → statement, facts highlighted.
3. Live — it can tell you where you are today without sending anything → the blank + Today card.
4. Showcase — what it makes → index of outputs + true-size sheets (sample data that adds up).
5. Features — a partner sees only what you turn on → sticky partner card + real switches.
6. Rest — the name → Rhea, photographed by Cassini.
7. Proof — the estimates come from research → reference names, edge to edge.
8. List — bring your history, take it with you → source tabs + what each import does.
9. FAQ — straight answers → a band per question.
10. CTA — start → the action tile. 11. Footer — the source is open → the repository as the line.

## Copy deck
NAV: Rhea mark · Your cycle · Partner view · Questions · [Start tracking] (hosted: Sign in, Create your account)
HERO h1: RHEA. / PERIOD.
HERO line: A free, open-source period tracker that stores your logs on your device and works offline.
ABOUT: Rhea keeps every log [on your device], in your browser's own storage. It [works offline] and
  [installs like an app]... [free and open source], [no ads and no analytics]... local: [nothing leaves
  this device] / hosted: [signing in syncs your logs to your account] over TLS; not end-to-end
  encrypted... [Try it with your own dates.]
LIVE h2: My last period / started [date]. "My cycle is usually [28] days." Note: Worked out in this
  browser with Rhea's cycle engine. Nothing you enter is stored or sent.
SHOWCASE h2: Inside Rhea — Day log · Calendar · History · Backup (sample: Maya, day 18 of 28).
FEATURES h2: Partner view. Lead: You choose what your partner's view shows... switches shape the view,
  not the server. Blocks: Cycle heads-up · Today's phase · Symptoms · Cycle calendar · Quiet window.
PROOF: Bull et al. 2019 · Wilcox, Dunson & Baird 2000 · Dunson et al. 1999 · Pierson, Althoff &
  Leskovec 2018 · Symul & Holmes 2022 · Reed & Carr · Cleveland Clinic. h2 under the band: The research
  behind the estimates.
LIST h2: Bring your history. / Take it with you. Tabs: Clue · Flo · Apple Health · Any CSV · Rhea backup.
FAQ h2: Straight answers. Six questions (encryption, offline, contraception, partner, leaving, cost).
CTA h2: Day one starts here. FOOTER line: github.com/shravanibnikam/ rhea-period-tracker

Sample content to confirm: "Maya" and her six cycles (28, 30, 27, 29, 28 days; periods 5,5,6,5,4,5),
her logged symptoms, moods and note, the sample day 27 Oct 2026.
