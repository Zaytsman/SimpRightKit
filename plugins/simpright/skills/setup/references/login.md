# Writing the login

`src/config/project.ts` tells the framework's core how a user logs in, through `defineProject`; the shape, with a comment on each member, is in `src/config/defineProject.ts`. Read both first. init writes two presets: `none` (members that throw a message saying what's missing) and `bearer` (`login` through `src/api/clients/AuthClient.ts`, and `browserState` when the app keeps its token in `localStorage`). Anything else you write here with the user, then check one login.

Show each change as a diff and get an OK before writing it. A username or a password never goes into code, a command or the chat: the core passes `user`, whose values come from `src/envs/<ENV>.json` (`${VAR}` placeholders) and `.env`.

## The members

- `login({ request, config, user })` returns `{ token, expiresInSeconds }`: it logs `user` in through the API. `TokenService` calls it once per role and worker, and again 2 minutes before the token expires. On an error response it throws an `ApiError` with the status (`src/api/services/serviceUtils.ts`), so the failure names the role. It calls the API through a client (a `BaseClient` subclass), never `fetch`.
- `browserState(baseUrl, token)` returns a Playwright storage state (`cookies`, `origins`): what a page logged in with `token` has. UI tests start with it (`authMode: 'api'`, the default).
- `uiLogin({ page, config, user })`, optional: logs `user` in through the app's login page, for runs with `UI_AUTH_MODE=storageState`; `globalSetup` then saves each role's state in `.auth/<role>.json` (git-ignored).
- `beforeRun()` and `afterRun()`, optional: once before and after the run, e.g. creating users for it (`setRunUser(role, user)` from `src/config/env.ts`) and deleting them. `afterRun` shouldn't throw.

## The cases

1. **An API token in another shape** (nested, e.g. `data.token`; a lifetime given as an expiry date): write `login` as the `bearer` preset does (an `AuthClient` with a `login` method for the endpoint, the body parsed, the token and its lifetime returned), reading the body as the API returns it. An expiry date gives `expiresInSeconds` as the seconds from now. With no lifetime at all: the token's own `exp` claim when it's a JWT, or a fixed number a little under the real lifetime.
2. **A token the page keeps elsewhere:** in a cookie, `browserState` returns it in `cookies` (`name`, `value: token`, `domain` from `baseUrl`, `path: '/'`) with `origins: []`; in `sessionStorage`, which a storage state can't hold, add the token in the test's page instead (`page.addInitScript`, in a fixture in `src/ui/fixtures/`), or log in through the login page (case 3).
3. **A login page only** (a form and a session cookie, no API token):
   - When the form posts to an endpoint that answers with the session cookie (the browser's developer tools show the request), `login` can send the same form through a client and return the cookie's value as the token, its `Max-Age` as the lifetime; `browserState` puts it back as a cookie (case 2). API and UI tests then log in as with a token.
   - Otherwise write `uiLogin`: open the login page, type the username and the password with `fillSecret` (`src/ui/pages/fillSecret.ts`, so the report doesn't print them), submit, and wait for something only a logged-in user sees. Take the form's test ids and labels from the page inspector, logged out: `npm run inspect:ui -- <login path> --logged-out`. Every run then needs `UI_AUTH_MODE=storageState`: locally in `.env`; on CI in the test step's `env:` of a hand-written workflow, which the generated workflows can't set yet, so say so in the report. `login` and `browserState` stay the stubs, and API tests can't log in.
4. **Users created for each run:** `beforeRun` registers one user per role through the API (a client, a unique name for each) and hands it to the tests with `setRunUser(role, user)`; `afterRun` deletes them, and a failed delete only warns. Those roles have no entry in `testUsers`. SimpRight's project file does this for its customer role: https://github.com/Zaytsman/SimpRight/blob/main/src/config/project.ts
5. **SSO, multi-factor login, a captcha:** tests can't get through them. The way out is the app team's: a token endpoint for tests, a test user without the second factor, or the check turned off on the test environment. Write down what was agreed in `CLAUDE.md` (the app section).

## Check one login

After `.env` has the values (the skill's section 5):
- **An API login:** a throwaway spec gets each role's token through the core's `tokenService` and prints nothing of it:

  ```ts
  // tests/api/setup-login-check.spec.ts: deleted right after the check
  import { test, expect } from '@fixtures';
  import { ROLES } from '@config/roles';

  test('Every role logs in', async ({ tokenService }) => {
    for (const role of ROLES) {
      const token = await tokenService.getAccessToken(role);
      expect(token.length > 0, `${role} gets a token`).toBe(true);
    }
  });
  ```

  Run `HEADLESS=true npx playwright test tests/api/setup-login-check.spec.ts --project=api`, then delete the file whatever the result: the scenario validator rejects a spec without scenarios.
- **The browser state:** `npm run inspect:ui -- / --role <role>` opens the app's home page with it; the accessibility tree shows whether the page is logged in (a user menu, the user's name).
- **A login page:** `UI_AUTH_MODE=storageState npm run inspect:ui -- / --role <role>`: `globalSetup` logs the role in through `uiLogin` first.

On a failure, show the error (the core names the role and the status), fix it with the user, and run the check again.
