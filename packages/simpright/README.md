# simpright

The [SimpRight Kit](https://github.com/Zaytsman/SimpRightKit)'s command-line tool. `simpright doctor` checks that a project's setup is consistent. The package also holds the schema of `simpright.yml`, the project's toolchain config, and the reader the kit's other packages use.

```bash
npm install --save-dev simpright
npx simpright doctor [--root <dir>] [--offline]
```

Exits with 0 when every check passes, 1 when one fails (each problem on its own line, as `<file>: <what>`), and 2 on a usage error. `--root` is the project's folder: by default, the nearest folder up that holds `simpright.yml`.

## What `doctor` checks

- **The config:** `simpright.yml` matches its schema, and every path it names exists (the conventions, `paths`, the exemplars), except `paths.coverageSummary`, which a test run writes. A portal (`parts.portal`) needs `runs` and a `portal` section, and its Bugs page needs `paths.bugs`. `portal.titleAccent` is the end of `portal.title`.
- **The kit:** the installed kit packages share one version.
- **The runs** (`runs`): each has exactly one caller of `.github/workflows/playwright-run.yml`, with the run's id as its `family`. The caller matches the run: its project, grep, paths, schedule, a manual start (`workflow_dispatch`), coverage publishing and the number of runs it keeps. An `areaPicker` run's `area` input offers `all` plus the folders of its project's tests. A run with a `trend` runs that layer, there's one per layer, and each has a `portal.healthThreshold`.
- **The secrets:** the reusable workflow declares exactly `ci.secrets`, and its callers pass them by name (never `secrets: inherit`).
- **The local actions:** every step that uses `./.github/actions/<name>` finds its `action.yml` and passes the action's required inputs and nothing it doesn't declare.
- **Node:** every `actions/setup-node` step, in a workflow or a local action, sets up `ci.node` (through an action's input too), and at least one does.
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

## License

[MIT](LICENSE)
