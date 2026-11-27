# Changelog

The kit's packages share one version; each release lists what changed in each of them.

## 0.4.1 (unreleased)

- **The kit's checks:** the E2E's `init` cases set up SimpRightTemplate v0.4.0, the template that ships with this kit (`e2e/template.json`).

## 0.4.0 (2026-11-27)

The setup: `simpright init` and the setup plugin (`/simpright-setup`, `/simpright-doctor`), `apply` and `doctor` for every part, and the kit's plugins as plain project files. A repository made from SimpRightTemplate gets `/simpright-setup` in its first Claude Code session, with nothing to install and no folder to trust. After upgrading a project:

1. if `apply` writes its workflows (it has `runs`), add `parts.ci: true` to `simpright.yml`. Until then `apply` and `doctor` stop with one line that says so (`parts.ci: false` would have `apply` remove the workflows it wrote);
2. run `npx simpright apply --dry-run`, read the diff, then `npx simpright apply`. It takes over the kit's entries in `package.json`, writes the plugins as plain files in `.claude/`, and removes the two `.claude/settings.json` entries 0.3.0 wrote. Run `npm install` when it says so;
3. with the agents part, the commands are `/simpright-qa-<skill>` now (the agents `simpright-qa-<agent>`): rename them wherever your docs name them. The plugin's one-time install can go, in each clone: `claude plugin uninstall simpright-qa@simpright-kit --scope local` (the scope you installed it at), then `claude plugin marketplace remove simpright-kit`.

- **simpright:**
  - **`simpright init`** sets up a fresh copy of SimpRightTemplate from an answers file (`--answers <file>`, or `--defaults`; `--dry-run` shows the changes): the layers, the app's URLs and test-id attribute, a login preset (`none`, or `bearer`: an API login that returns a bearer token), the roles and their users' `.env` variables, the examples, the folders outside the core, and `simpright.yml`'s `parts`, `ci`, `runs` and `portal`. The answers' schema ships as `simpright/init-answers.schema.json`; `/simpright-setup` writes the file from its interview.
    - It works only in a fresh copy: every file it would replace, move or remove must still be the template's at the version `simpright.yml` names (read from GitHub, workflows without their action pins). Otherwise it writes nothing and names the files.
    - `simpright.yml` is edited in place, its comments and layout kept. A dropped layer takes its keys and examples with it; the core stays whole.
    - Without the examples, the files that registered them become empty skeletons with a how-to comment. With the agents part the examples move to `docs/exemplars/` instead, as the agents' style exemplars (`doctor` notes the exemplars still there).
    - A moved folder takes along its YAML files' `$schema` headers and, for the scenarios, the specs' `// Scenarios:` comments. When the answers turn the CI part on, the template's own hand-written CI goes, so that `apply` writes the project's.
    - It prints each change and the next commands (`npm install`, `npx simpright apply`), and runs none of them.
  - **`parts.ci`:** the CI part is a part like the others. `apply` writes the workflows and `dependabot.yml` only with it (and needs no kit commit without it), and removes the CI files it wrote when it's off. A config with `runs`, or with CI files `apply` recorded, but no `parts.ci` stops with one line instead of losing its workflows.
  - **The parts' rules**, which `apply` and `doctor` share: runs need `parts.ci`, which needs `ci`; the portal and the wiki need `parts.ci`; the Test Cases and Bugs pages and the agents need `parts.scenarios`; the UI agents need `parts.inspector`, which needs `commands.inspectUi`; coverage needs an API layer.
  - **The plugins as plain files:** `apply` writes the setup plugin into every project and the QA plugin with `parts.agents`, as plain project skills and agents. `skills/<skill>/` becomes `.claude/skills/<plugin>-<skill>/`, `agents/<agent>.md` becomes `.claude/agents/<plugin>-<agent>.md`, and `shared/` becomes `.claude/<plugin>/`; in the texts, `<plugin>:<name>` becomes `<plugin>-<name>`.
    - They load in every Claude Code session (the desktop app, the terminal, VS Code, the cloud) with no install and no trust: a plugin a repository supplies loads only in a folder the user has trusted, and the desktop app never asks.
    - `apply` owns them as it owns the workflows: their hashes in `.simpright/state.json`, a hand edit stops it with the diff, `--force` overwrites, and turning `parts.agents` off removes the QA files. It removes the `.claude/settings.json` entries 0.3.0 wrote, and leaves ones it didn't write.
  - **`package.json`:** `apply` owns the kit's entries, one by one: its packages in `devDependencies` (exact, at the kit's version) and the scripts of the parts that are on (`doctor` and `apply` always; `validate:scenarios` and `check:step-titles` with the scenarios; `inspect:ui` with the inspector; `test-cases:build`, `bugs:build` and `portal:build` with the portal). An entry with the wanted value is adopted and a missing one added; another value is a conflict unless `apply` wrote it; a kit package from a local folder (`file:` or `link:`) is left alone. It never runs npm, and says when `npm install` has to follow.
  - `apply` adds a `.gitkeep` to a scenario layer's folder or the bugs folder that doesn't exist yet.
  - **`doctor`** checks the same: the parts' rules, the CI part only with `parts.ci`, the plain files among the generated ones, the 0.3.0 settings entries (a problem now), and the `package.json` entries (a pin the installed kit doesn't match says to run `npm install`). Its hint for a core file that differs from the template no longer assumes you maintain the template.
  - **Fixed:** with `ci.secrets: []`, `doctor` asked the callers of the test workflow to pass "the secrets none" (since 0.2.0). A caller without a `secrets:` block is right then; `secrets: inherit` still fails.
  - `simpright.yml`: `ids.areas` may be empty: a new project adds each area with its first scenario.
- **The `simpright` plugin** (`plugins/simpright`, new, in the kit's marketplace too): the setup, run in the main conversation, since it asks you things.
  - `/simpright-setup`, in a fresh copy of the template: an interview in seven rounds (the app, the parts, the login and roles, the folders and examples, CI and runs, the portal, GitHub), then `init` and `apply`, each after its dry run and your OK; `doctor`, the typecheck, the validator and a first test run; the project's README, CLAUDE.md and the wiki's first page; a commit; and the GitHub settings, one at a time. In a project already set up, it turns a part on or off, changes the runs or the portal, and points the agents' exemplars at your own files.
  - `/simpright-doctor`: `simpright doctor`'s problems explained with their fixes, and the GitHub settings the parts need (the secrets by name, Actions, Pages, the wiki, the rulesets) checked with `gh`; then the fixes you pick.
  - Secrets never go through the chat: you type them with `gh secret set` or on GitHub.
- **The `simpright-qa` plugin:** reaches a project as plain files (above), so its commands there are `/simpright-qa-<skill>`; as an installed plugin they keep the colon. `shared/how-to-ask.md` no longer lists the QA skills, so the setup plugin's copy is the same file.
- **The actions:** `publish-wiki` leaves the wiki alone when the folder has no page, and never copies a `.gitkeep`. `init` creates a new project's wiki folder empty, and mirroring it would have deleted the wiki's first page, the one made by hand.
- **@simpright/portal:** the dashboard's trend charts don't animate when the reader's system asks for reduced motion (`prefers-reduced-motion: reduce`).
- **@simpright/scenarios:** no change; released at 0.4.0 with the kit.
- **The kit's checks:**
  - the E2E workflow's `init` job: six cases on SimpRightTemplate at the tag in `e2e/template.json` (the defaults, API only, UI only, no examples with the agents, moved folders, the CI part with runs of its own), each with the packages packed from the commit. Each runs `init` and `apply` after their dry runs, `doctor --offline`, the typecheck, the validator, the examples it keeps on the live app, actionlint on the generated workflows, and a second `apply` that must change nothing. `e2e/init-case.sh` runs a case locally too;
  - the portal's screenshot tests ask for reduced motion, so they compare the charts as drawn. The UI trends screenshot used to catch Chart.js partway through its animation (`animations: 'disabled'` stops only CSS and Web Animations), so it depended on timing. A test checks that the charts animate by default and don't under reduced motion.

## 0.3.0 (2026-11-08)

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
