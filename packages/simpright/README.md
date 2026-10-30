# simpright

The [SimpRight Kit](https://github.com/Zaytsman/SimpRightKit)'s command-line tool. `simpright apply` writes a project's CI workflows from `simpright.yml`, and `simpright doctor` checks that the project's setup is consistent. The package also holds the schema of `simpright.yml`, the project's toolchain config, and the reader the kit's other packages use.

```bash
npm install --save-dev simpright
npx simpright apply [--root <dir>] [--dry-run] [--force] [--kit-ref <commit>]
npx simpright doctor [--root <dir>] [--offline]
```

`--root` is the project's folder: by default, the nearest folder up that holds `simpright.yml`. Usage errors exit with 2.

## What `apply` writes

The CI part's files, from `simpright.yml`: the workflows that run the tests and publish the portal through the kit's actions, and `.github/dependabot.yml`. The [CI part's README](../../actions/README.md) lists them and the rules they follow. Packages, plugins and npm scripts come in a later version.

- The kit's actions are pinned to the commit of this release (`Zaytsman/SimpRightKit/actions/<name>@<commit> # v<version>`), which the published package knows. `--kit-ref <commit>` pins another one, such as a branch of the kit you're trying out.
- `.simpright/state.json` records a hash of every file `apply` wrote. `apply` overwrites or removes a file only while it still matches that hash; a file it didn't write, or one someone changed since, stops it with the diff, and `--force` overwrites it. The hashes leave out the `uses:` pins, so a Dependabot pin bump never counts as a change, and `apply` keeps a third-party pin that is newer than its own.
- `--dry-run` prints every change as a diff and writes nothing.
- It exits with 0 when it wrote the files (or with `--dry-run`), and 1 when a conflict stopped it. A config it can't generate from fails it (each problem on its own line).

Keys it reads besides `runs`, `ci`, `parts` and `paths`: `runs[].workflow` (a caller's file name, default `<id>.yml`; keep it once the workflow has run, because GitHub numbers runs per workflow file), `paths.wiki` (the wiki's pages, with `parts.wiki`), `commands.typecheck` and `commands.validateScenarios` (the checks' commands).

## What `doctor` checks

It exits with 0 when every check passes and 1 when one fails, each problem on its own line, as `<file>: <what>`.

## What `doctor` checks

- **The config:** `simpright.yml` matches its schema, and every path it names exists (the conventions, `paths`, the exemplars), except `paths.coverageSummary`, which a test run writes. A portal (`parts.portal`) needs `runs` and a `portal` section, and its Bugs page needs `paths.bugs`. `portal.titleAccent` is the end of `portal.title`.
- **The kit:** the installed kit packages share one version.
- **The runs** (`runs`): each has exactly one caller of `.github/workflows/playwright-run.yml`, with the run's id as its `family`. The caller matches the run: its project, grep, paths, schedule, a manual start (`workflow_dispatch`), coverage publishing and the number of runs it keeps. An `areaPicker` run's `area` input offers `all` plus the folders of its project's tests. A run with a `trend` runs that layer, there's one per layer, and each has a `portal.healthThreshold`.
- **The secrets:** the reusable workflow declares exactly `ci.secrets`, and its callers pass them by name (never `secrets: inherit`).
- **The actions:** every step that uses a local action (`./.github/actions/<name>`) or one of the kit's (`Zaytsman/SimpRightKit/actions/<name>`) finds it and passes the action's required inputs and nothing it doesn't declare. The kit's actions are pinned to a full commit SHA with the version in a comment, all at one release: the installed kit packages' version, at that release's commit.
- **Node:** every `actions/setup-node` step, in a workflow or an action it uses, sets up `ci.node` (through an action's input too), and at least one does.
- **The generated files:** once `simpright apply` has run (`.simpright/state.json`), the files it writes are what it would write now, apart from the pins, and none it no longer writes is left. A changed run, a new test folder or a new kit version needs another `apply`.
- **The core** (`core`): every core file and seam exists, and a core code file imports only core files, the seams and packages. Relative imports and the `tsconfig.json` path aliases are followed, and comments are skipped. Documents such as the conventions aren't scanned.
- **The template** (`template`): the core files equal [SimpRightTemplate](https://github.com/Zaytsman/SimpRightTemplate)'s at that tag, read from raw.githubusercontent.com with no token. `--offline` leaves this check out; it's the only one that needs the network.

The scenarios and bugs have their own check, `simpright-scenarios validate` ([`@simpright/scenarios`](../scenarios)).

## `simpright.yml`'s schema

Point your editor at the installed schema with the first line of `simpright.yml`:

```yaml
# yaml-language-server: $schema=./node_modules/simpright/simpright.schema.json
```

## For the kit's packages

- `simpright/config`: `findRoot`, `projectRoot`, `readConfig` (parses and checks `simpright.yml`; throws a `ConfigError`), the `Config` and `Run` types, and the repository facts (`repositoryUrl`, `branchName`, `commitSha`).
- `simpright/workflows`: the project's workflows and local actions, and the callers of the test workflow.

The package also ships `dist/kit-data.json`: the kit's actions as their `action.yml` files declare them, and the pins of the third-party actions the generated workflows use (taken from the kit's own workflows when it's built). A published package has `dist/release.json` too: the release's commit.

## License

[MIT](LICENSE)
