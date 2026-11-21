# The interview

Seven rounds. Each is one AskUserQuestion call with up to four questions, then, when the round has values to type, one plain message listing them. The recommended options are the defaults: taking all of them gives a project that works, with the template's examples.

**Read first,** so the defaults are this project's: `simpright.yml` (`paths`, `roles`, `parts`, `ci`), `src/envs/TEST.json` (the URLs), `testIdAttribute` in `src/config/project.ts`, the scripts in `package.json`, and with `gh` logged in `gh repo view --json nameWithOwner,visibility,hasWikiEnabled,defaultBranchRef`.

**The answers file** (`node_modules/simpright/init-answers.schema.json`): each answer fills one key; a key left out keeps the template's choice. Its `config` block holds `simpright.yml`'s own `parts`, `ci`, `runs` and `portal`, each a whole value in that file's schema (`node_modules/simpright/simpright.schema.json`): `ci` always with `node` and `secrets`, `portal` always with a `title`. `parts` is merged key by key, so list only the parts that change.

## Round 1: the app

1. **Layers:** "API and UI (Recommended)", "API only", "UI only". → `layers: [api]` or `[ui]`; leave it out for both.
2. **The app:** "My own app", "The examples' site, to try the kit first" (the site in `src/envs/TEST.json`, which the examples test logged out). No recommendation: it's what the user is here for. With the examples' site, the URLs stay, the login is none, and the examples stay (rounds 3 and 4 then only confirm).
3. **Test ids** (with the UI layer and an own app): the attribute the app's elements carry for tests: "data-test", "data-testid", "data-qa", "data-cy", the current one first. Recommend one only when the user knows the app uses it; the page inspector shows the elements that carry it once the URL is set. → `app.testIdAttribute`.

To type, for an own app:
1. The app's URL (with the UI layer) and the API's URL (with the API layer). → `app.baseUrl`, `app.apiBaseUrl`.
2. Other environments, optional: a name and its URLs each (e.g. STAGING). → `src/envs/<NAME>.json` after init, picked with `TEST_ENV=<NAME>`; not in the answers.
3. What tests should know about the app, optional: a data reset, rate limits, caches, a slow or unstable area. → the app section of `CLAUDE.md`, and with the agents part `agents.liveApi.transient` (after init: it empties that list when the URLs change).

## Round 2: the parts

Show the parts first, one line each with what it needs, then two multi-select questions:
1. **For writing tests:**
   - "Scenarios and bugs": the YAML scenarios and bug files, checked by the validator (`npm run validate:scenarios`). On in the template.
   - "Page inspector" (UI layer): a live page's test ids, roles and labels, read-only (`npm run inspect:ui -- <path>`). On in the template.
   - "QA agents": Claude Code skills and agents that write API contracts, scenarios and specs, review and heal tests, and record bugs. They need the scenarios, and for the UI the page inspector.
   Recommend the scenarios and the inspector; recommend the agents when the user will write tests with Claude Code.
2. **CI and publishing** (needs a GitHub repository):
   - "CI on GitHub Actions": generated workflows: the PR checks (`verify`), the test runs from round 5, Dependabot. They replace the template's own CI files (`pr-checks.yml`, `tests.yml`, `dependabot.yml`).
   - "Portal on GitHub Pages": the dashboard with each run's report and history, and the Test Cases and Bugs pages. Needs CI.
   - "Wiki": the pages of a folder, published to the repository's GitHub wiki. Needs CI.
   Recommend CI and the portal when the repository is on GitHub; the wiki only when the user wants one.

→ `config.parts`: `inspector: false` or `scenarios: false` only when unticked; `agents: true`; `ci: true`; `portal: { testCases: true, bugs: true }` (round 6 may drop a page; without the scenarios part, `portal: {}`); `wiki: true`. The API coverage reporter (`parts.coverage`) needs a package of the user's own: only when they name one in "Other", as `coverage: { package: <name>, registry: <https URL, when not npmjs.org> }`.

The parts' rules, which init and apply enforce: the agents need the scenarios, and with the UI layer the inspector; the portal and the wiki need CI; the Test Cases and Bugs pages need the scenarios; coverage needs the API layer; the wiki needs its folder (round 4).

## Round 3: the login and the roles

1. **Login:** "None yet: tests run logged out", "An API login that returns a token", "A login page only (no API token)", "Something else (SSO, a cookie session, ...)". Recommend "None yet" only for the examples' site or an app without a login.
   - An API token → `login.preset: bearer`, with the values below. When the token isn't a top-level field of a JSON body, or the lifetime is neither a number of seconds nor a constant, write `none` here and the login after init (`login.md`).
   - A login page, or something else → `login: { preset: none }`, and the login after init (`login.md`).
2. **Roles** (the users tests act as; `guest`, a logged-out visitor, is always there): "One role: default (Recommended)", "default and admin"; other names, in kebab-case, in "Other". The first is the default role. → the keys of `roles`.
3. **Users** (with a login): "A user per role in .env (Recommended)": its username and password in `.env`, never committed, and in CI secrets of the same names; "Created for each run": the project's `beforeRun` registers them through the app's API (written after init, `login.md`).

To type, with the API token:
1. The login endpoint, relative to the API's URL (e.g. `/auth/login`). → `login.path`.
2. The request body's field for the username and for the password (e.g. `email`, `password`). → `login.body: { <field>: username, <field>: password }`.
3. The response body's token field (e.g. `access_token`). → `login.tokenField`.
4. How long a token lives: the response field with the seconds (e.g. `expires_in`), or a number of seconds. → `login.expiresInField` or `login.expiresInSeconds`.
5. Optional, for UI tests that start logged in: the `localStorage` key where a logged-in page keeps the token. → `login.localStorageKey`. Without it, UI tests start logged out until `browserState` is written (`login.md`).

When the user doesn't know these, offer to read them from the API's OpenAPI spec or source code (a URL or a folder), or ask them to log in once with the browser's developer tools open and read the login request and the page's storage.

To type, with users from `.env`: the variable names per role, by default `<ROLE>_USERNAME` and `<ROLE>_PASSWORD` in upper case. → `roles: { <role>: { username: <NAME>, password: <NAME> } }`; `{}` for a role whose user is created per run, and for every role without a login.

## Round 4: the folders and the examples

Show the layout as a tree: the template's, with the folders the parts chosen use.
1. **Folders:** "The default layout (Recommended)", "My own folders" (typed below). Only the folders outside the core can move: the scenarios, the bugs, the API contracts, the user stories, the analyses and the wiki. `src/` and `tests/` keep the template's layout, since the core's files name them.
2. **The examples** (one API spec and one UI spec, each with its scenario file and the code it uses; they test the examples' site, logged out): "Keep them", "Remove them". Recommend keeping them with the examples' site, and removing them with an own app, where they'd fail. With the agents part, removing them moves them to `docs/exemplars/` instead: the agents copy their style until the project has its own files. → `examples: remove`; leave it out to keep them.

→ `folders`, with a key only where the folder changes or is new: `scenarios` and `bugs` when they move; `wiki: docs/wiki` with the wiki part; with the agents part, `userStories: docs/user-stories` and `analysis: docs/analysis`, and with the API layer `contracts: docs/api/contracts`. init moves a folder that exists and creates a new one.

To type, with their own folders: a path per folder, relative to the repository's root (e.g. `qa/scenarios`).

## Round 5: CI and the runs

Only with the CI part. Show the default runs first, as a table of the rows for the layers chosen (times in UTC and in the user's local time):

| id | label | project | when | other |
|---|---|---|---|---|
| `ui-regression` | UI regression | `ui` | weekdays 06:15 UTC (`15 6 * * 1-5`) | `trend: ui`, `note: Latest nightly run` |
| `api-regression` | API regression | `api` | weekdays 02:15 UTC (`15 2 * * 1-5`) | `trend: api`, `note: Latest nightly run` |
| `smoke` | Smoke | `all` (one layer: that one) | by hand | `grep: '@smoke'`, `note: UI + API` (one layer: its name) |
| `custom-ui` | Custom UI | `ui` | by hand, with an area picker | `areaPicker: true`, `note: Latest custom run` |
| `custom-api` | Custom API | `api` | by hand, with an area picker | `areaPicker: true`, `note: Latest custom run` |

1. **Branches:** "One branch: <default branch> (Recommended)", "A work branch too (develop)": work happens on `develop`, and a pull request releases it into the default branch. → `config.ci.branches: { default: <default branch> }`, plus `work: develop`. The default branch comes from `gh repo view` (`defaultBranchRef`), else `main`.
2. **Runs:** "The default runs (Recommended)", "My own runs" (typed below).
3. **Reports kept per run** (with the portal): "10 (Recommended)", "5", "20". → `keep` on each run; leave it out for 10.
4. **Node.js on CI:** "24 (Recommended)", "22". → `config.ci.node`.

`config.ci.secrets` takes the variable names of round 3's users, with no question (say so): the names only, never values.

To type, with their own runs, one per line: its name; its layer (`ui`, `api` or both); when (days and a local time, or by hand); what it runs (everything, a tag such as `@smoke`, some folders, or an area picked at each run). → one `config.runs` entry each:
- `id`: the name in kebab-case; `label`: the name; `note`: optional, one line for the portal; `project`: `ui`, `api` or `all`.
- `schedule`: a cron in UTC. Convert from the user's local time zone (`node -e "console.log(Intl.DateTimeFormat().resolvedOptions().timeZone)"`), and keep the minute off the hour (`15`): GitHub's scheduler is busiest on the hour, and scheduled runs can start late anyway.
- `grep` for a tag, `paths` for folders (space-separated), `areaPicker: true` for a run started by hand with an area input.
- `trend: <layer>` on one scheduled run per layer: it feeds the portal's health card and trends. `publishCoverage: true` on one API run, only with the coverage part.
- `workflow` is the caller's file name, `<id>.yml` by default. It must not change once the workflow has run: GitHub numbers a workflow's runs per file, and the portal keeps a family's highest numbers.

## Round 6: the portal

Only with the portal part.
1. **Pages** (multi-select, with the scenarios part): "Test Cases pages" (the scenarios, by layer and area), "Bugs page" (the bug files and the tests they fail). Both recommended. → `config.parts.portal: { testCases, bugs }`.
2. **Health threshold** (the failure rate under which a layer's latest regression counts as healthy): "1% (Recommended)", "0%", "5%". → `config.portal.healthThreshold: { <layer>: <n> }` for each layer whose run has a `trend`.

To type:
1. The title, the brand on every page (default: the repository's name). → `config.portal.title`.
2. Optional: the end of the title in the accent colour (e.g. `Right` in `SimpRight`), a tagline under it, and one sentence about the project for the side panel. → `titleAccent`, `tagline`, `description`.

## Round 7: GitHub

Read the repository with `gh repo view` when `gh` is logged in; ask only what that doesn't say.
1. **Visibility** (when unknown): "Public", "Private". Say what it changes: a private repository needs a paid plan for Pages, a wiki and enforced rulesets, and a Pages site is public even for a private repository, so the reports there are public (the framework masks the test users' credentials in them).
2. **The GitHub settings:** "After the local setup, one at a time (Recommended)", "Later: list them in the report". → section 7 of the skill.

To type, when there's no GitHub remote yet: the repository the project will live in, as `<owner>/<name>`, or nothing if it isn't decided. → the portal's URL and the links in `README.md` and the wiki's `Home.md`; without it they're left out, never guessed from the `gh` login.

## The answers file

An example: API and UI, an own app with a bearer login and two roles, the agents, CI with a work branch, the default runs and the portal.

```yaml
app:
  baseUrl: https://shop.example.com
  apiBaseUrl: https://api.shop.example.com
  testIdAttribute: data-testid
login:
  preset: bearer
  path: /auth/login
  body: { email: username, password: password }
  tokenField: access_token
  expiresInField: expires_in
  localStorageKey: auth-token
roles:
  default: { username: DEFAULT_USERNAME, password: DEFAULT_PASSWORD }
  admin: { username: ADMIN_USERNAME, password: ADMIN_PASSWORD }
examples: remove
folders:
  userStories: docs/user-stories
  analysis: docs/analysis
  contracts: docs/api/contracts
config:
  parts: { agents: true, ci: true, portal: { testCases: true, bugs: true } }
  ci: { branches: { default: main, work: develop }, node: 24, secrets: [DEFAULT_USERNAME, DEFAULT_PASSWORD, ADMIN_USERNAME, ADMIN_PASSWORD] }
  runs:
    - { id: ui-regression, label: UI regression, note: Latest nightly run, project: ui, schedule: '15 6 * * 1-5', trend: ui }
    - { id: api-regression, label: API regression, note: Latest nightly run, project: api, schedule: '15 2 * * 1-5', trend: api }
    - { id: smoke, label: Smoke, note: UI + API, project: all, grep: '@smoke' }
    - { id: custom-ui, label: Custom UI, note: Latest custom run, project: ui, areaPicker: true }
    - { id: custom-api, label: Custom API, note: Latest custom run, project: api, areaPicker: true }
  portal: { title: Example Shop, titleAccent: Shop, healthThreshold: { ui: 1, api: 1 } }
```
