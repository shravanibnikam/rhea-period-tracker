# Changelog

## Unreleased

### Fixed

- Transport registry tests now use explicit configuration, independent of `.env`.
- A cancelled owner-sync startup no longer stops its replacement engine or
  installs an obsolete engine after storage initialization. This fixes newly
  signed-in owners' writes remaining queued despite an available backend.
- pgTAP suites now create required Auth fixtures and exercise invite redemption,
  reuse, expiry, hash-at-rest and account isolation against a real local database.

### Added

- GitHub Pages build/deployment, project-path assets and an application 404 shell.
- Build-generated offline asset cache and browser checks for deep links and
  fresh-tab offline persistence. Root-hosted builds remain supported for cutover.
- Daily anonymous liveness read and migration 0006, with six permission checks.
  The migration is local-only pending production review/application.

- CI job applying all migrations and running pgTAP plus Chromium browser tests.
- Browser coverage for local-only/offline logging and owner save/delete through
  Supabase, including tombstone ordering and two-device reload checks.
- MIT license and active execution plan. Mobile apps removed from the README
  roadmap; the July v2 specification remains historical design context.

Implementation CI is green on [PR #4](https://github.com/shravanibnikam/rhea-period-tracker/pull/4).
Phase 1 is merged. Release remains pending dedicated production delete verification;
local test success is not a production verification claim.
