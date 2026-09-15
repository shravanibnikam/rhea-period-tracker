# GitHub Pages hosting

[Rhea is live](https://shravanibnikam.github.io/rhea-period-tracker/) on GitHub
Pages. The hosting cutover completed on 2026-09-15 at application commit `995a87d`.
The owner confirmed JSON import and checked dates/entries before the former
hosting project was deleted. Its obsolete Auth redirect was removed.

## Build and offline behavior

`npm run build:pages` uses Vite's `pages` mode and `/rhea-period-tracker/`, then
copies the shell to `404.html`. Missing project paths load the app through that
shell with an actual HTTP 404 response. Views are selected in memory; this
fallback does not introduce a URL router or make `/calendar` select that view.
`npm run build` still supports root hosting for local previews and portability.

Logos and worker registration use `BASE_URL`; the manifest uses relative URLs.
The generated Workbox worker precaches built assets, including the HTML shell.
It does not cache Supabase responses or health records. IndexedDB retains logs.
A newly installed worker waits for existing app tabs to close before activation.
Development does not register a worker. Initial online loading is required for
offline use.

Run `npm run test:pages` after installing Playwright Chromium. The server emulates
a project site without Vite's SPA rewrite. Tests cover fresh deep-link assets and
retained logs in a newly opened offline tab.

## Deployment and backend configuration

- GitHub Pages source: GitHub Actions; `deploy.yml` builds/deploys from main.
- Repository variables: `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_PUBLISHABLE_KEY`. These are public browser configuration; never
  substitute a service-role key or management token.
- Supabase project: `jhhuimcsmvdihfeihhtu`. It was resumed from INACTIVE and
  confirmed ACTIVE_HEALTHY. Migrations 0001–0006 are applied to production.
- Auth Site URL and allowed redirect: the exact Pages base URL above.
- `keepalive.yml` reads the public liveness row daily at 09:23 UTC. The production
  manual dispatch passed. Its first scheduled run has not yet been observed.
  Scheduled Actions can be delayed or disabled after 60 days of repository
  inactivity; this is best-effort activity, not an uptime guarantee.
- Migration 0006 received explicit owner review before application. Future
  migration PRs require human review under
  [technical spec §5.4](RHEA_V2_TECHNICAL_SPEC.md#54-coverage-bar--ci-gate).

## Production verification

Dedicated synthetic accounts passed UI save/delete, a newer server tombstone,
two-session reload, unlinked-account read/write isolation, invite creation and
redemption, and unlink revocation. Linked plaintext reads remain legacy behavior.
Live deep-link assets, worker scope and offline fresh-tab loading also passed.
A generated real signup verification link completed the Pages callback and
opened the signed-in app. **Email delivery itself was not tested.** Evidence
and workflow links are recorded in IMPLEMENTATION_STATUS.md.

## Moving data between origins

Browser storage is isolated by origin. Signing into another host does not move
IndexedDB, unsent outbox or local-only records. Export with **Settings → Export
backup** before leaving an origin. Choose the intended account/local-only mode
at the destination, use **Settings → Import Rhea backup**, and check log dates
and content. Keep the backup privately until transfer is confirmed.

Installed PWAs remain tied to their original origin. Install the Pages app after
verifying the transfer; removing a shortcut does not migrate browser storage.

## Recovery after cutover

The former hosting project has been deleted, so it is no longer a rollback
endpoint. For an application regression, redeploy a known-good Pages commit or
revert the change on main after checking CI. Preserve local browser data and
private exports during recovery. A future move to another origin requires the
same export/import procedure and updated Auth redirects. Never reset production
or rewrite applied migrations to repair a frontend deployment.
