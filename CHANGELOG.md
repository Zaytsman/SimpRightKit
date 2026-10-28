# Changelog

The kit's packages share one version; each release lists what changed in each of them.

## 0.1.0 (unreleased)

The first release: SimpRight's validator, step-title check and portal scripts, as packages.

- **simpright:** `simpright doctor` checks `simpright.yml` (its schema, the paths it names, the parts' needs), that the installed kit packages share one version, the test runs against their workflows, the local actions' inputs, the Node version, the secrets, the core boundary, and the core files against SimpRightTemplate (`--offline` leaves that out). It holds `simpright.yml`'s schema, and `simpright/config` and `simpright/workflows` for the other packages.
- **@simpright/scenarios:** the scenario and bug schemas; `simpright-scenarios validate` (scenarios, bugs, their links to the specs, the next free IDs); `simpright-scenarios check-step-titles`.
- **@simpright/portal:** the dashboard and the Test Cases and Bugs pages; `simpright-portal publish-run`, `build-pages`, `build-test-cases`, `build-bugs`, `build-config`, and `preview` (a local server for a site, or `--sample` for the sample site the package ships). Compared with SimpRight's scripts:
  - the run's report, results and coverage folders are options, the site gets a `site.json` with its layout version, and `SOURCE_DATE_EPOCH` sets the build time;
  - a project with one layer, or without coverage, gets a status row without an empty slot and an intro that names only what it has;
  - the Wiki link shows only with `parts.wiki`, and links to the project's files work from a subfolder of the repository (`projectPath`).
