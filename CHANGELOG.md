# Changelog

## Unreleased

### Added

- GitHub Pages deployment, project-path assets, relative manifest and a working
  application 404 shell; root-hosted builds remain supported.
- Build-generated offline asset cache, with deep-link and offline browser tests.
- Daily Supabase keep-alive workflow and migration 0006, reviewed and applied to
  production. Manual and first scheduled production runs passed.
- Production Pages verification: save/delete, two-session reload, unlinked-account
  isolation, pairing/unlink, offline shell and generated signup callback.
- A landing page for first visits (`#welcome` reopens it), with a live estimate
  that stores nothing.
- Insights: average cycle and period length with variability, each cycle by
  phase, the next three cycles, symptoms and mood by phase. A cycle can be left
  out of the predictions.
- Exports: CSV, the predicted periods as `.ics`, and a printable clinician
  summary. Medication and intimacy in the daily log; the partner app doesn't
  download them.
- Light, dark and system themes; "My period started today" on Today; a "Today's
  mood" share switch.

### Changed

- New design throughout: a warm palette, Cormorant Garamond and Nunito, an icon
  rail on desktop and a bottom bar on phones, and Settings as its own screen.
  See `docs/DESIGN.md`.
- Partner copy is gender-neutral, and unlinking a partner asks first.

### Fixed

- A share switch whose save fails flips back and says so. Failed sharing loads
  offer a retry instead of all-off switches or an endless "Loading…".
- "In N days" counts could read one day short later in the day.
- With no period logged, the partner view no longer shows the default phase's
  tips as if they were real.
- Partner privacy:
  - If a partner's account can't be confirmed (for example offline), the
    device shows no cycle data.
  - After an unlink, the former partner's device deletes the owner's cached
    logs before the account is used as an owner, and never uploads them.
  - Partners can't change the cycle length the partner view predicts from.
  - The partner view's colours never reveal the owner's phase unless it is
    shared.
  - The calendar shows predicted periods only with Cycle heads-up on.
- Cycles:
  - A spotting day on its own no longer starts a new cycle.
  - Cycle and period lengths no longer lose a day across a daylight-saving
    change.
  - Excluded cycles no longer count toward the period length.
  - While a period is late, the calendar agrees with Today.
  - The fertile window ends with the ovulation phase.
  - Very short cycles never show an empty phase range.
- "Add a period" no longer logs days after today.
- Imports detect the source app from the file's contents, not its name, and
  normalize energy levels.
- The backup file is named with the local date.
- Accessibility:
  - Off switches and field borders meet 3:1 contrast.
  - Closing a sheet returns focus to what opened it.
  - Errors read as plain sentences.

### Removed

- Shared notes, the `notesSync` flag and the "coming soon" transports.

## [0.2.0] — 2026-09-15

### Fixed

- Transport registry tests now use explicit configuration, independent of `.env`.
- A cancelled owner-sync startup no longer stops its replacement engine or
  installs an obsolete engine after storage initialization. This fixes newly
  signed-in owners' writes remaining queued despite an available backend.
- pgTAP suites now create required Auth fixtures and exercise invite redemption,
  reuse, expiry, hash-at-rest and account isolation against a real local database.

### Added

- CI job applying all migrations and running pgTAP plus Chromium browser tests.
- Browser coverage for local-only/offline logging and owner save/delete through
  Supabase, including tombstone ordering and two-device reload checks.
- MIT license and active execution plan. Mobile apps removed from the README
  roadmap; the July v2 specification remains historical design context.

CI passed on Phase 1 merge commit `bf76c4b`. Production UI delete and two-session
reload passed using synthetic accounts before tagging. Cloud health data remains
plaintext; linked partners retain legacy RLS access.

[0.2.0]: https://github.com/shravanibnikam/rhea-period-tracker/releases/tag/v0.2.0
