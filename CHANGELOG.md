# Changelog

## Unreleased

### Added

- GitHub Pages deployment, project-path assets, relative manifest and a working
  application 404 shell; root-hosted builds remain supported.
- Build-generated offline asset cache, with deep-link and offline browser tests.
- Daily Supabase keep-alive workflow and migration 0006, reviewed and applied to
  production. Manual production workflow passed; first scheduled run pending.
- Production Pages verification: save/delete, two-session reload, unlinked-account
  isolation, pairing/unlink, offline shell and generated signup callback.

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
