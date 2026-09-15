# Hosting cutover: Vercel to GitHub Pages

Status on 2026-09-15: implementation and local checks complete; production
cutover pending. The current host is `https://rhea-period-tracker.vercel.app`.
The intended Pages URL is `https://shravanibnikam.github.io/rhea-period-tracker/`.

## Build and offline behavior

`npm run build` retains root hosting. `npm run build:pages` uses Vite's `pages`
mode and `/rhea-period-tracker/`, then copies the shell to `404.html`. Missing
project paths load the app through that shell with an actual HTTP 404 response.
The app currently selects views in memory; this fallback does not introduce a
URL router or promise that `/calendar` selects the calendar view.

Logos and worker registration use `BASE_URL`; the manifest uses relative URLs.
The build-generated Workbox worker precaches built assets, including the HTML
shell. It does not cache Supabase responses or health records. IndexedDB retains
local logs. A newly installed worker waits for existing app tabs to close before
activation, avoiding an automatic reload during an edit. Development does not
register a worker. An initial online load is required for offline use.

Run `npm run test:pages` after installing Playwright Chromium. The test server
emulates a GitHub project site without Vite's SPA rewrite. The two tests verify
fresh deep-link assets and offline persistence in a newly opened tab.

## Infrastructure prepared

- GitHub Pages source is configured as GitHub Actions.
- Repository variables `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_PUBLISHABLE_KEY` are configured. These are public browser
  configuration; never place a service-role key or management token in them.
- `deploy.yml` builds on main/dispatch and deploys with scoped Pages permissions.
- `keepalive.yml` reads the single public liveness row daily at 09:23 UTC and
  fails on HTTP errors or unexpected data. Migration 0006 must exist first.
  Scheduled Actions may be delayed or disabled after 60 days of repository
  inactivity; the read is best-effort activity, not an uptime guarantee.

## Production cutover gates

1. Authenticate management tools locally. Confirm the Supabase project reference
   is `jhhuimcsmvdihfeihhtu`, check project status, and resolve the observed DNS
   failure before attempting account or data verification. No dedicated test
   accounts are currently available. The supplied Mac Vercel credential path is
   not present in this Linux workspace.
2. Obtain human security review for migration 0006 as required by
   [technical spec §5.4](RHEA_V2_TECHNICAL_SPEC.md#54-coverage-bar--ci-gate).
   It adds only `keepalive(id boolean)`, one true row, RLS, anonymous SELECT and
   no anonymous/authenticated writes. It does not change health-table policies.
   Review the migration history/dry run before applying to the linked project.
3. Deploy Pages from the reviewed main commit. Keep Vercel available through
   verification. Check assets and worker scope at the exact production prefix.
4. In Supabase Auth URL Configuration, set Site URL to the Pages URL above and
   allow the exact Pages base URL plus any required callback paths. Preserve
   the existing Vercel redirect temporarily. Current signup uses Supabase's
   configured Site URL; test a real confirmation email and sign-in on Pages.
5. Use fresh synthetic owner and partner accounts. Avoid repeated signup/email
   attempts. Verify pairing/unlinking and unrelated-account isolation. Verify
   owner UI save → row visible with the owner's authenticated session → delete
   → `deleted=true` with a newer HLC → absent after second-session reload.
   The public key plus owner session is sufficient to inspect that owner's row
   through RLS; a service-role key is not required for this check.
6. Run the keep-alive workflow manually and record its result, then confirm a
   scheduled run. Record deployment commit, date and production results in
   IMPLEMENTATION_STATUS.md without credentials or health records.
7. Complete the data transfer below before retiring the old host. Update the
   repository homepage and current user-facing links after Pages is verified.
   Remove the obsolete Auth redirect and Vercel deployment only after this gate.

## Moving existing local data

Browser storage is isolated by origin. Signing into Pages does not transfer
Vercel's IndexedDB, unsent outbox or local-only data. Before leaving the old
origin, use **Settings → Export backup**. On Pages, choose the intended account
or local-only mode, then **Settings → Import Rhea backup** and verify log dates
and content. Keep the backup privately until the transfer is confirmed. Synced
records should also be checked on the new origin before closing the old one.

Existing installed Vercel PWAs remain tied to their old origin. Install the new
Pages app after verifying the transfer; removing a shortcut does not migrate it.

## Rollback

Before Vercel retirement, keep the old deployment and Auth redirect usable.
If Pages fails, return users to that deployment and restore the previous Site
URL if necessary. Data newly written locally on Pages also needs export/import
when moving back. Do not delete either origin's browser data during rollback.
The additive liveness table can remain; disable its workflow if troubleshooting
requires it. Do not reset production or rewrite applied migrations.
