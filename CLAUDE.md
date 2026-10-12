# markovce-rozpis

Weekly liturgical schedule app for Orthodox parishes. Static site (`index.html`, `script.js`,
`style.css`, no build step) plus Vercel functions in `api/` on Vercel Postgres. Sign-in is Google
OAuth; data is per parish. See README.md for how it works and how to deploy.

## Every change is tested end to end, and the report is shared

This is the definition of done for any change to the app, however small:

1. **Run both suites** (and fix what fails before going on):
   ```sh
   eval "$(scripts/test-db.sh)"   # throwaway Postgres; skip if TEST_DATABASE_URL/E2E_DATABASE_URL are set
   npm test                       # API + schema tests (test/)
   npm run e2e                    # browser walkthrough, desktop + mobile (e2e/)
   ```
   `npm run check` runs both. Without `TEST_DATABASE_URL` the API tests skip themselves: that is
   not a pass.
2. **Look at the screenshots yourself** in `e2e-report/index.html` for the steps your change
   touches. A passing assertion with a broken-looking screen is a failure.
3. **Send the report to the user** (`e2e-report/index.html` is a single self-contained file) with
   a short summary: what was tested, pass/fail per device, anything only checked by hand.
4. **Cover the change in the walkthrough.** New behaviour a person can see gets a step (or an
   assertion in an existing one) in `e2e/walkthrough.spec.mjs`; server rules get a test in
   `test/api.test.js`. A bug fix starts with a step or test that fails without the fix.
5. CI (`.github/workflows/ci.yml`) runs the same on every push and attaches the report as the
   `e2e-report` artifact; a red run is not done.

The walkthrough runs the real page and real `api/` handlers (`e2e/server.mjs` stands in for
Vercel) against Postgres seeded in the original single-parish layout, so every run also exercises
the migration. Only Google's consent screen is a stand-in (`e2e/shims/google.mjs`); say so when
reporting, and check real sign-in by hand after a deploy that touches auth.

## Conventions

- Bump `?v=` on both `style.css` and `script.js` in `index.html` on every deploy (README).
- Every parish-scoped endpoint goes through `requireMember()` in `lib/auth.js`; the database
  does not enforce tenancy.
- Schema changes go in `lib/schema.js` and `db/init.sql` together (a test checks they match)
  and must keep migrating an existing database in place.
- A save from the app is an *edit* only when the person changed something: passive saves use
  `saveToLocalStorage({ dirty: false })`. A wrong "dirty" save stamps the week as newest and
  overwrites other people's edits on sync.
- UI text is Slovak.
