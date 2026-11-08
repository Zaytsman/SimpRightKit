# Changelog

The kit's packages share one version; each release lists what changed in each of them.

## 0.3.0 (unreleased)

The agents part: SimpRight's QA agents and skills as a Claude Code plugin, in the kit's own marketplace, and `simpright apply` to give a project the plugin. The agents' facts in `simpright.yml` move under `agents:`, which breaks the old layout. After upgrading a project:

1. move `api`, `ui` and `liveApi` under `agents:`, indented by two spaces;
2. with the agents, set `parts.agents: true`;
3. run `npx simpright apply`, which writes the plugin's entries in `.claude/settings.json`.

- **The `simpright-qa` plugin** (`plugins/simpright-qa`, marketplace `simpright-kit` in `.claude-plugin/marketplace.json`): SimpRight's 9 agents and 14 skills, moved from its `.claude/`. Compared with them:
  - the commands and agents carry the plugin's prefix (`/simpright-qa:implement-ui-scenarios`, `simpright-qa:ui-test-engineer`), and the texts name each other that way;
  - bundled files are found through `${CLAUDE_PLUGIN_ROOT}` and `${CLAUDE_SKILL_DIR}`, and `how-to-ask.md` moved to `shared/`;
  - no SimpRight or Toolshop facts: what the agents need to know about an app comes from `simpright.yml` (`agents`: the exemplars, the rules and `agents.liveApi`);
  - the agents start without CLAUDE.md, CLAUDE.local.md and memory (`omitClaudeMd`), and read the files in `project.conventions` themselves;
  - the scenario writers' "From steps" rules are a reference that the from-steps skills pass, so the writers are smaller in their other modes;
  - the agents read the app's source only at `paths.appSource`, and search the project with `git grep` or in the profile's folders, so git-ignored private files (a local `.claude/` folder) stay out of their searches;
  - the reviewer's UI checklist names the conventions' secret-typing rule (`fillSecret`), and the two from-steps skills have shorter descriptions, so the skill listing keeps them.
- **simpright:**
  - `simpright.yml`: `agents` holds the QA agents' facts, which were top-level keys: `agents.api` and `agents.ui` (each layer's exemplars, known-issue line and rules) and `agents.liveApi` (the live app's guardrails, required within `agents`). `liveApi` is no longer required at the top; `doctor` requires `agents` with `parts.agents`. A file on the old layout stops every command with one line per moved key, such as `simpright.yml: liveApi moved to agents.liveApi in kit 0.3.0`.
  - `simpright.yml`: `paths.appSource`, optional, the app under test's source checkout, relative to the repository root (such as `../app`). `doctor` doesn't require it to exist, since CI has no checkout.
  - `simpright apply`, with `parts.agents`, writes two entries in `.claude/settings.json`: the kit's marketplace from GitHub at the release's tag (`ref: v0.3.0`, with a sparse checkout of `.claude-plugin` and `plugins`), and `simpright-qa@simpright-kit`, enabled.
    - It owns only those entries: the rest of the file stays, and `.claude/settings.local.json` is never touched.
    - `state.json` records them as it records the workflows, so a hand edit stops `apply` with the diff.
    - Without `parts.agents`, it removes the entries it wrote.
    - Each kit release moves the ref, so run `apply` after every upgrade, as for the pins.
  - `simpright doctor` checks the exemplars under `agents`, and the plugin's entries: with `parts.agents`, the marketplace from GitHub at the installed kit's tag and the plugin enabled; without it, the plugin not enabled.
- **@simpright/scenarios:** `validate` reads a layer's known-issue line from `agents.<layer>.knownIssue`. A layer without agents facts gets the kit's default, `test.fail(true, 'Known issue {bug}: {text}');`, so a project without agents still gets the check.
- **The kit's checks:** `npm run validate:plugins` runs `claude plugin validate --strict` on the marketplace and each plugin (in the `ci` job, with the Claude Code CLI as a devDependency), and `test/plugin.test.ts` checks the plugins' names, paths, agent and skill fields, and the `simpright.yml` keys their texts name. `release.ts` sets the plugins' version with the packages'.

## 0.2.1 (2026-11-01)

- **The actions:** `publish-wiki` compares the pages by content (`rsync --checksum`, in its new `sync-pages.sh`). It could leave a changed page out of the wiki when the change kept the page's size and the checkout and the wiki's clone ran in the same second, as they often do: rsync's quick check took the page for unchanged. The e2e workflow checks that case.
- **simpright, @simpright/scenarios, @simpright/portal:** no change; released at 0.2.1 with the kit.

## 0.2.0 (2026-10-30)

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
