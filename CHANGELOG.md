# Changelog

The kit's packages share one version; each release lists what changed in each of them.

## 0.2.0 (unreleased)

The CI part: SimpRight's GitHub Actions as the kit's own, and `simpright apply` to write the workflows that use them. After upgrading a project that ran `apply`, run it again.

- **The actions** (`actions/`, used as `Zaytsman/SimpRightKit/actions/<name>@<commit>`): `setup`, `run-tests`, `publish-run`, `publish-pages`, `squash-pages` and `publish-wiki`, moved from SimpRight's `.github/actions/`. Compared with them:
  - each takes `working-directory`, for a project in a subfolder of its repository;
  - `setup`'s `browsers` takes the browser names to install (empty: none), with the project's own Playwright;
  - `run-tests` checks the step titles only when `check-step-titles` is `'true'`, with `simpright-scenarios`;
  - no action calls a project's npm script.
- **simpright:**
  - `simpright apply` writes the CI part's files from `simpright.yml`: the reusable test workflow, one caller per run, the pull request checks, the portal's and the wiki's publishing, the monthly squash, and `dependabot.yml`, with one pull request for the kit's packages and actions. `.simpright/state.json` keeps what it wrote: it stops before overwriting a changed file (`--force` overwrites), leaves pins out of the comparison, and `--dry-run` shows the diff.
  - `simpright doctor` checks the kit's action steps (inputs, Node), their pins (a full commit SHA with the version, all at the installed kit's release), and that the files `apply` generates are what it would write now.
  - `simpright.yml`: `runs[].workflow` (a caller's file name) and `paths.wiki` (the wiki's pages). Without a portal, `doctor` no longer checks the coverage and the runs kept of a run's caller.
  - The package ships the kit's actions' inputs and the pins its workflows use (`dist/kit-data.json`), and the published package records its release's commit (`dist/release.json`).
- **The e2e workflow** runs the actions on the sample project on every pull request and push to `main`, publishing to the kit's own `gh-pages` branch.
- **@simpright/scenarios, @simpright/portal:** no change; released at 0.2.0 with the kit.

## 0.1.0 (2026-10-28)

The first release: SimpRight's validator, step-title check and portal scripts, as packages.

- **simpright:** `simpright doctor` checks `simpright.yml` (its schema, the paths it names, the parts' needs), that the installed kit packages share one version, the test runs against their workflows, the local actions' inputs, the Node version, the secrets, the core boundary, and the core files against SimpRightTemplate (`--offline` leaves that out). It holds `simpright.yml`'s schema, and `simpright/config` and `simpright/workflows` for the other packages.
- **@simpright/scenarios:** the scenario and bug schemas; `simpright-scenarios validate` (scenarios, bugs, their links to the specs, the next free IDs); `simpright-scenarios check-step-titles`.
- **@simpright/portal:** the dashboard and the Test Cases and Bugs pages; `simpright-portal publish-run`, `build-pages`, `build-test-cases`, `build-bugs`, `build-config`, and `preview` (a local server for a site, or `--sample` for the sample site the package ships). Compared with SimpRight's scripts:
  - the run's report, results and coverage folders are options, the site gets a `site.json` with its layout version, and `SOURCE_DATE_EPOCH` sets the build time;
  - a project with one layer, or without coverage, gets a status row without an empty slot and an intro that names only what it has;
  - the Wiki link shows only with `parts.wiki`, and links to the project's files work from a subfolder of the repository (`projectPath`).
