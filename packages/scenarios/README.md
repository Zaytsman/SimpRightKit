# @simpright/scenarios

Test scenarios and bugs as YAML files, part of the [SimpRight Kit](https://github.com/Zaytsman/SimpRightKit). A scenario file is the source of truth for what gets automated. This package holds the schemas of scenario and bug files, a validator that keeps them and the Playwright specs in sync, and a check of a run's step titles.

```bash
npm install --save-dev @simpright/scenarios
npx simpright-scenarios validate [--root <dir>]
npx simpright-scenarios check-step-titles [<results.json>] [--root <dir>]
```

Exits with 0 when everything checks out, 1 when something doesn't, and 2 on a usage error.

## The files

- `<paths.scenarios>/<layer>/<area>/<name>.yml`: a suite of scenarios (`suite`, `tags`, `scenarios`), with a layer and area from `simpright.yml`'s `ids`. Each scenario has an `id` numbered across its layer (`API-0001`, `UI-001`), a `name`, a `status` (`manual` or `automated` with `automatedIn`), optional `tags`, `role`, `preconditions` and `knownIssue` with its `bug`, and `steps`, of which at least one starts with `Verify`.
- `<paths.bugs>/<ID>.yml`: one bug per root cause (`BUG-001`), shared by the scenarios that hit it.

Point the files at the installed schemas (the path from each file to `node_modules`), and set the same paths in `simpright.yml` (`paths.scenarioSchema`, `paths.bugSchema`), where editors and agents look for them:

```yaml
# yaml-language-server: $schema=../../../node_modules/@simpright/scenarios/schemas/scenarios.schema.json
```

## What `validate` checks

- **The config:** each layer has its own ID prefix and the bugs' prefix is none of them; `paths.bugs`, `paths.bugSchema` and `ids.bugs` come together; every `ids.fileNames` pattern is a regex for a layer; `paths.scenarioSchema` and `paths.bugSchema` are this version's schemas.
- **Bug files:** each is `<bugs>/<ID>.yml`, matches the schema with its keys in the schema's order, and has an ID with the prefix and digits of `ids.bugs`, a layer and area from `ids`, and a `resolved` date exactly when it isn't open.
- **Scenario files:** each lives in `<layer>/<area>/` with a name that matches the layer's `ids.fileNames` pattern (else any kebab-case name), matches the schema, and has its keys in the agreed order. IDs are unique and have the layer's prefix and digits. A `role` is one of `roles`. A `knownIssue` comes with an open `bug` that has a file. A `@smoke` scenario is automated and has no known issue.
- **Specs:** `automatedIn` is `<tests>/<layer>/<area>/<name>.spec.ts`, named after the scenario file. The spec has a `// Scenarios: <file>` comment, a `test.describe('<tags> - <suite>')`, a `test('<ID>: <name>')` with the name verbatim and the scenario's tags in its tag option, and, for a known issue, the layer's known-issue line (`api.knownIssue`, `ui.knownIssue`) with the bug and text. Every test in `paths.tests` starts with an ID whose scenario names that spec, and every `Known issue` line belongs to a scenario there.

It ends with the next free ID of each layer and of the bugs.

## `check-step-titles`

Each test's top-level `test.step` titles must be its scenario's steps, verbatim and in order. Step titles are often template parameters, so only a run shows them: the check reads a Playwright JSON report (default `test-results/results.json`). A failed test is compared up to the step it reached, and a skipped one isn't compared. In GitHub Actions each mismatch is also a warning on the spec.

## License

[MIT](LICENSE)
