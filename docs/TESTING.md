# Testing Rhea

## Application checks

Use Node 22 (CI) and the committed lockfile:

```sh
npm ci
npm run typecheck
npm run lint
npm run test:coverage
npm run build
```

The transport registry takes explicit configuration. To check that the entire
Vitest suite stays independent of an ambient Supabase configuration:

```sh
VITE_SUPABASE_URL=http://127.0.0.1:54321 \
VITE_SUPABASE_PUBLISHABLE_KEY=rhea-test-only npm test
```

## Real database and browser tests

Install Docker and Supabase CLI **2.117.0**, the same version pinned in CI.
These commands target the disposable local `rhea` stack. `db reset --local`
deletes its existing local test data; use a separate checkout/project id if you
keep personal development data there.

```sh
supabase start -x studio,postgres-meta,storage-api,imgproxy,edge-runtime,logflare,vector,supavisor > /dev/null
supabase db reset --local
supabase test db
npx playwright install chromium
npm run test:e2e
supabase stop --no-backup
```

The browser config reads the local CLI status without logging it, accepts only
`http://127.0.0.1:54321`, and supplies only its anonymous key to the app. Set
`SUPABASE_BIN` if the CLI is not on PATH. Browser tests require ports 4173 and
4174, use synthetic accounts through public signup, and never read `.env` for
test configuration. Local Auth must retain its default auto-confirm behavior.
On Linux, Playwright may also require `playwright install --with-deps chromium`;
CI uses that command on Ubuntu.

pgTAP runs all fixtures inside rolled-back transactions. Browser accounts remain
in the disposable local database until reset/stop. Browser traces are disabled
to avoid persisting auth tokens. No production credentials are required.

The suites follow [Supabase's database testing guidance](https://supabase.com/docs/guides/local-development/testing/overview)
and [Playwright's web-server configuration](https://playwright.dev/docs/test-webserver).

## Pages production-build checks

```sh
npm run test:pages
```

These two Chromium tests build with the project prefix and emulate Pages' actual
404 fallback on port 4175. They check fresh deep-link assets and opening the
installed shell in a new offline tab with retained logs. They use blank Supabase
configuration and no accounts. Root builds remain available via `npm run build`.
See [HOSTING.md](HOSTING.md) for production cutover gates.

## Production delete verification

Passed on the former host and Pages on 2026-09-15; see IMPLEMENTATION_STATUS.md.
To repeat, use a dedicated synthetic test account after deploying the phase change. Sign in,
save a log, confirm the server row under the owner's session, delete via the UI,
confirm `deleted=true` with a newer `updated_hlc`, then reload a second session
and confirm the log stays absent. Record deployment commit, date, and result in
IMPLEMENTATION_STATUS.md. Do not export health data, passwords or session tokens.
