# simpright

The [SimpRight Kit](https://github.com/Zaytsman/SimpRightKit)'s command-line tool. `simpright init` sets up a fresh copy of [SimpRightTemplate](https://github.com/Zaytsman/SimpRightTemplate) from an answers file. `simpright apply` writes what the parts in `simpright.yml` ask for: the CI workflows, the kit's Claude Code plugins as plain skills and agents, and the kit's packages and scripts in `package.json`. `simpright doctor` checks that the project's setup is consistent. The package also holds the schemas of `simpright.yml` (the project's toolchain config) and of `init`'s answers, and the reader the kit's other packages use.

In a project made from the template, the package is already a devDependency, and `/simpright-setup` and `/simpright-doctor` (the [setup plugin](../../plugins/simpright), which `apply` writes into every project) run these commands for you, each after you've seen what it will change.

```bash
npm install --save-dev simpright
npx simpright init (--answers <file> | --defaults) [--root <dir>] [--dry-run]
npx simpright apply [--root <dir>] [--dry-run] [--force] [--kit-ref <commit>]
npx simpright doctor [--root <dir>] [--offline]
```

`--root` is the project's folder: by default, the nearest folder up that holds `simpright.yml`. Each command exits with 0 when it succeeds, 1 when a check fails, `apply` stops on a conflict or `init` on a copy that isn't fresh, and 2 on a usage error.

## What `init` does

It turns a fresh copy of the template into your project, from the answers of the setup's interview. `--dry-run` shows each change as a diff and writes nothing.

- **Only in a fresh copy:** every file `init` would replace, move or remove must still be the template's at the version `simpright.yml` names (`template`), read from GitHub (workflows apart from their action pins). Otherwise it writes nothing and names the files that differ: in a project already set up, edit `simpright.yml` and run `apply`, or use `/simpright-setup`.
- **The answers file** is YAML, with the schema `init-answers.schema.json` (exported as `simpright/init-answers.schema.json`). Every key is optional, and a missing one keeps the template's choice, so `--defaults` changes nothing:

  ```yaml
  # yaml-language-server: $schema=./node_modules/simpright/init-answers.schema.json
  layers: [api, ui]                       # the layers the project tests
  app:
    baseUrl: https://shop.example.com
    apiBaseUrl: https://api.shop.example.com
    testIdAttribute: data-testid
  login:                                  # none, or bearer: an API login that returns a bearer token
    preset: bearer
    path: /auth/login
    body: { email: username, password: password }
    tokenField: access_token
    expiresInField: expires_in
  roles:                                  # each role's user, as the names of its .env variables
    default: { username: DEFAULT_USERNAME, password: DEFAULT_PASSWORD }
  examples: remove                        # the template's examples test its demo app
  folders:                                # the folders outside the core, moved or added
    contracts: docs/api/contracts
  config:                                 # simpright.yml's own parts, ci, runs and portal
    parts: { scenarios: true, inspector: true, agents: true }
  ```

- **What it changes** (these files are yours from then on):
  - `simpright.yml`, edited in place with its comments and layout kept: the layers' keys, the areas, the roles, the folders' paths, the agents' facts and exemplars, and the `config` block;
  - `src/envs/TEST.json` (the URLs, the roles' users), `.env.example` (their variables), `src/config/roles.ts`, and `src/config/project.ts` with the test-id attribute and the login: `none`, or `bearer`, which also writes `src/api/clients/AuthClient.ts`. Any other login stays `none`, and `/simpright-setup` writes it with you;
  - **the layers:** a dropped layer's examples and keys go. The core stays whole, its other layer's files included, since `doctor` compares every core file with the template;
  - **the examples:** without them, the files that registered them (the fixtures, `src/fixtures/index.ts`, `src/data/TestConstants.ts`) become empty skeletons with a how-to comment. With the agents part (`parts.agents`) the examples move to `docs/exemplars/` instead, and the agents' exemplars point there, so the agents have a style to copy until your own files exist;
  - **the folders:** only those outside the core move (the scenarios, the bugs, the contracts, the user stories, the analyses, the wiki): their YAML files' `$schema` headers follow, and for the scenarios the specs' `// Scenarios:` comments. `src/` and `tests/` keep the template's layout;
  - **the template's own CI** (`pr-checks.yml`, `tests.yml`, `dependabot.yml`) goes when the answers turn the CI part on, so that `apply` writes the project's.
- It prints the next commands (`npm install`, then `npx simpright apply`) and runs neither.

## What `apply` writes

The files of the parts that are on, and nothing for a part that's off: it removes what it wrote for a part you turn off.

| Part | What `apply` writes |
|---|---|
| always | the [setup plugin](../../plugins/simpright) as plain files (`/simpright-setup`, `/simpright-doctor`); `simpright` in `devDependencies`; the scripts `doctor` and `apply` |
| `scenarios` | `@simpright/scenarios`; the scripts `validate:scenarios` and `check:step-titles`; a `.gitkeep` in each scenario layer's folder and the bugs folder that doesn't exist yet (it never removes a folder) |
| `inspector` | the script `inspect:ui` |
| `agents` | the [`simpright-qa` plugin](../../plugins/simpright-qa) as plain files: its skills, agents and shared files |
| `ci` | the workflows that run the tests and publish the portal through the kit's actions, and `.github/dependabot.yml`: the [CI part's README](../../actions/README.md) lists them |
| `portal` | `@simpright/portal`; the scripts `test-cases:build`, `bugs:build` and `portal:build` |
| `wiki` | `.github/workflows/publish-wiki.yml` (with the CI part) |
| `coverage` | in the workflows, what installs the optional API coverage package from GitHub Packages; the package stays your project's own optional dependency |

- **The plugins as plain files:** a plugin's `skills/<skill>/` becomes `.claude/skills/<plugin>-<skill>/`, `agents/<agent>.md` becomes `.claude/agents/<plugin>-<agent>.md`, and `shared/` becomes `.claude/<plugin>/`, with a README; in the texts, `<plugin>:<name>` becomes `<plugin>-<name>`. Plain project skills and agents load in every Claude Code session (the desktop app, the terminal, VS Code, the cloud) with no install and no trusted folder, which a plugin a repository supplies would need. The commands are `/simpright-setup`, `/simpright-doctor` and `/simpright-qa-<skill>`.
- **`package.json`:** `apply` owns only the kit's entries above, one by one, and keeps the rest of the file and its key order. The packages are pinned exactly, at the kit's version. An entry that already has the value it wants is adopted, and a missing one is added; a kit package installed from a local folder (`file:` or `link:`) is left as it is. It never runs npm: it says when `npm install` has to follow.
- **What it owns:** `.simpright/state.json` records a hash of every file `apply` wrote and the `package.json` entries it wrote. `apply` overwrites or removes a file or an entry only while it still matches what it wrote; one it didn't write, or one someone changed since, stops it with the diff, and `--force` overwrites. The hashes leave out the workflows' `uses:` pins, so a Dependabot pin bump never counts as a change, and `apply` keeps a third-party pin that is newer than its own.
- **The kit's actions** are pinned to the commit of this release (`Zaytsman/SimpRightKit/actions/<name>@<commit> # v<version>`), which the published package knows. `--kit-ref <commit>` pins another one, such as a branch of the kit you're trying out; a build of the kit from its repository needs it.
- **After a kit upgrade,** run `apply` again: it moves the pins, the packages and the plain files to the new release, which `doctor` checks. Each release's steps are in the [CHANGELOG](../../CHANGELOG.md).
- **Kit 0.3.0's entries** in `.claude/settings.json` (the kit's marketplace and the plugin, enabled) are removed when `apply` wrote them; the rest of that file stays.
- `--dry-run` prints every change as a diff and writes nothing. A config whose parts don't fit together stops it, one line per rule (the next section has them).

Keys it reads besides `parts`, `ci`, `runs` and `paths`: `runs[].workflow` (a caller's file name, default `<id>.yml`; keep it once the workflow has run, because GitHub numbers runs per workflow file), `paths.wiki` (the wiki's pages, with `parts.wiki`), `commands.typecheck` and `commands.validateScenarios` (the checks' commands).

## What `doctor` checks

It exits with 0 when every check passes and 1 when one fails, each problem on its own line, as `<file>: <what>`, and prints an OK line per check that passed.

- **The config:** `simpright.yml` matches its schema, and every path it names exists (the conventions, `paths`, the exemplars under `agents`), except `paths.coverageSummary`, which a test run writes, and `paths.appSource`, the app's source checkout, which CI doesn't have. `portal.titleAccent` is the end of `portal.title`.
- **The parts fit together:** runs need `parts.ci`, which needs `ci`; the portal needs `parts.ci`, `runs` and a `portal` section, and its Bugs page needs `paths.bugs`; the wiki needs `parts.ci` and `paths.wiki`; the Test Cases and Bugs pages need `parts.scenarios`; the agents need `parts.scenarios` and their facts (`agents`), and the UI agents `parts.inspector`, which needs `commands.inspectUi`; coverage needs an API layer. A config from before kit 0.4.0, with `runs` but no `parts.ci`, gets one line saying so.
- **The kit:** the installed kit packages share one version.
- **The runs** (with `parts.ci`): each has exactly one caller of `.github/workflows/playwright-run.yml`, with the run's id as its `family`. The caller matches the run: its project, grep, paths, schedule, a manual start (`workflow_dispatch`), coverage publishing and the number of runs it keeps. An `areaPicker` run's `area` input offers `all` plus the folders of its project's tests. A run with a `trend` runs that layer, there's one per layer, and each has a `portal.healthThreshold`.
- **The secrets:** the reusable workflow declares exactly `ci.secrets`, and its callers pass them by name (never `secrets: inherit`).
- **The actions:** every step that uses a local action (`./.github/actions/<name>`) or one of the kit's (`Zaytsman/SimpRightKit/actions/<name>`) finds it and passes the action's required inputs and nothing it doesn't declare. The kit's actions are pinned to a full commit SHA with the version in a comment, all at one release: the installed kit packages' version, at that release's commit.
- **Node:** every `actions/setup-node` step, in a workflow or an action it uses, sets up `ci.node` (through an action's input too), and at least one does.
- **The generated files:** once `apply` has run (`.simpright/state.json`), the files it writes (the workflows, the plugins' plain files) are what it would write now, apart from the pins, and none it no longer writes is left. A changed run, a new test folder or a new kit version needs another `apply`.
- **The agents part:** with `parts.agents`, `.claude/` has the `simpright-qa` plugin's plain skills and agents. `.claude/settings.json` doesn't enable the plugin from the kit's marketplace, as kit 0.3.0 did. A note lists the agents' exemplars that still point into `docs/exemplars/`.
- **`package.json`:** the kit's packages at the installed kit's version (one from a local folder counts), and the scripts as `apply` writes them. A pin the installed kit doesn't match says to run `npm install`.
- **The core** (`core`): every core file and seam exists, and a core code file imports only core files, the seams and packages. Relative imports and the `tsconfig.json` path aliases are followed, and comments are skipped. Documents such as the conventions aren't scanned.
- **The template** (`template`): the core files equal SimpRightTemplate's at that tag, read from raw.githubusercontent.com with no token. `--offline` leaves this check out; it's the only one that needs the network.

The scenarios and bugs have their own check, `simpright-scenarios validate` ([`@simpright/scenarios`](../scenarios)). The GitHub settings the parts need (Pages, the secrets, the wiki, the rulesets) are checked by `/simpright-doctor`, with `gh`, so the CLI stays offline.

## The schemas

Point your editor at the installed schemas with a first line:

```yaml
# yaml-language-server: $schema=./node_modules/simpright/simpright.schema.json
```

and, in an answers file, `$schema=./node_modules/simpright/init-answers.schema.json`. A key that moved in a kit release stops every command with one line per key, such as `simpright.yml: liveApi moved to agents.liveApi in kit 0.3.0`; the [CHANGELOG](../../CHANGELOG.md) has each release's steps.

## For the kit's packages

- `simpright/config`: `findRoot`, `projectRoot`, `readConfig` (parses and checks `simpright.yml`; throws a `ConfigError`), the `Config` and `Run` types, and the repository facts (`repositoryUrl`, `branchName`, `commitSha`).
- `simpright/workflows`: the project's workflows and local actions, and the callers of the test workflow.

The package also ships `dist/kit-data.json` (the kit's actions as their `action.yml` files declare them, and the pins of the third-party actions the generated workflows use, taken from the kit's own workflows when it's built) and `dist/plugins/` (the kit's plugins, which `apply` writes as plain files). A published package has `dist/release.json` too: the release's commit.

## License

[MIT](LICENSE)
