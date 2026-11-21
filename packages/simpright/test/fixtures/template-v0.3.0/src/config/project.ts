import { defineProject } from './defineProject';

const NO_LOGIN =
  "No login is set up: a test that logs in needs project.login and project.browserState in src/config/project.ts. Logged-out tests use test.use({ authMode: 'none' }).";

/**
 * How the framework's core reaches the app under test: its test ids, its logins and what runs around a test run. The
 * roles are in `roles.ts`; URLs, timeouts and the configured users in `src/envs/<ENV>.json`.
 *
 * The examples test the Toolshop demo app (practicesoftwaretesting.com) logged out, so no login is set up. To log users
 * in, replace `login` (an API login that returns a bearer token) and `browserState` (where a logged-in page keeps that
 * token), and add `uiLogin` for UI_AUTH_MODE=storageState. SimpRight's project file does all of it, plus a user
 * registered for each run in `beforeRun`: https://github.com/Zaytsman/SimpRight/blob/main/src/config/project.ts
 */
export const project = defineProject({
  testIdAttribute: 'data-test',

  login: async () => {
    throw new Error(NO_LOGIN);
  },

  browserState: () => {
    throw new Error(NO_LOGIN);
  },
});
