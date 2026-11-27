# Contributing

## Layout

```text
packages/simpright/       simpright: the CLI (init, apply, doctor) and simpright.yml's schema and reader. init and what
                          it knows about the template: src/init.ts, src/answers.ts (with init-answers.schema.json),
                          src/template.ts, src/yaml-text.ts. apply's parts: the workflow templates (src/generate.ts),
                          the plugins as plain files (src/plain.ts), the package.json entries (src/package-json.ts),
                          the parts' rules (src/parts.ts). test/golden/ holds the workflows apply writes for the tests,
                          test/fixtures/template-v0.3.0/ the template's files init reads
packages/scenarios/       @simpright/scenarios: the scenario and bug schemas, validate, check-step-titles
packages/portal/          @simpright/portal: the pages (pages/), the builders, publish-run, build-pages, preview,
                          the sample site it ships (sample/) and the screenshot tests (screenshots/)
actions/                  the CI part: the composite actions (one folder each, lib/ for their shared git steps) and
                          its README, with the rules the actions and the generated workflows follow
plugins/simpright/        the setup plugin: /simpright-setup and /simpright-doctor (skills/, shared/), which apply
                          writes into every kit project
plugins/simpright-qa/     the agents part: the QA plugin (agents/, skills/, shared/); both plugins are listed in the
                          kit's marketplace, .claude-plugin/marketplace.json
examples/sample-project/  a made-up shop's simpright.yml, scenarios, bugs, specs and workflows: what the tests run on;
                          its package.json links the packages, for the e2e workflow
e2e/                      init's E2E cases: the template's tag (template.json), each case's answers (answers/), and
                          the script that sets up and checks one case (init-case.sh)
test/helpers.ts           sampleProject(): a fresh copy of the sample project for a test to change
test/plugin.test.ts       the plugins' checks: their fields, names, paths and simpright.yml keys, the shared files'
                          copies, the setup interview's example answers, and no app's facts
scripts/                  the repo's own scripts: check-packages.ts, sample-site.ts, kit-data.ts, release.ts,
                          validate-plugins.ts
```

## Working on the kit

```bash
npm install
npm test             # builds the packages, then runs every packages/*/test/*.test.ts with node:test
npm run typecheck    # builds, then checks the sources, the tests and the scripts
npm run check:packages   # what each package would publish
npm run validate:plugins # Claude Code's own checks of the marketplace and the plugins
```

- The sources are TypeScript (Node 22.18 or later runs them directly in the repo). `tsc` builds each package into `dist/` for publishing, because Node doesn't strip types inside `node_modules`.
- Inside a package, imports name the `.ts` file; the build rewrites them to `.js`. Between packages, imports name the package (`simpright/config`), which resolves to its built `dist/`: build before you run a test or a command.
- A test changes a copy of the sample project (`sampleProject()`), one file at a time, and checks what a command says about it. A new check gets a case that breaks it.
- To try a change on a real project, run the built command against it: `node packages/scenarios/dist/cli.js validate --root ../SimpRight`.
- The build also writes `packages/simpright/dist/kit-data.json` (`scripts/kit-data.ts`): the actions' inputs, which `doctor` checks steps against, and the third-party pins of the kit's own workflows, which `apply` writes into a project's. The kit's Dependabot keeps those pins current, so there's nothing to copy by hand. It copies the plugins into `packages/simpright/dist/plugins/` too: `apply` writes them into projects from there.
- The apply tests compare the workflows it writes with `packages/simpright/test/golden/`. After a change to the templates (`src/generate.ts`), rewrite them with `UPDATE_GOLDEN=1 npm test`, then read the diff before you commit it: the golden files are what every project will get.
- The init tests run on the template's files at the tag they were exported from (`packages/simpright/test/fixtures/template-v0.3.0/`, left out of the typecheck), with the fetch from GitHub stubbed. The E2E's `init` job runs `init` on the real template.

## The E2E checks of init

The **E2E** workflow's `init` job sets up a fresh copy of SimpRightTemplate for each case in its matrix, the way `/simpright-setup` does, with the packages packed from the commit: `init` from the case's answers (`e2e/answers/<case>.yml`, or `--defaults`), then `apply` (each after a dry run that must write nothing), `doctor --offline`, the typecheck, the validator, the examples the case keeps on the live app, actionlint on the generated workflows (a pinned release, its checksum checked), and a second `apply` that must change nothing. `e2e/init-case.sh` has the steps, and runs one case here too (Git Bash on Windows):

```bash
bash e2e/init-case.sh api-only api      # <case> <none | api | ui | all>: the examples to run, by Playwright project
```

It builds and packs the kit into a temporary folder (`WORK`, by default `simpright-e2e` in the temp folder; `TARBALLS` reuses packed tarballs), clones the template at the tag in `e2e/template.json`, and pins the generated workflows to the kit's `HEAD` (`KIT_REF`). Without `actionlint` on the PATH (or `ACTIONLINT`), it says so and leaves the workflows unlinted. The examples call the template's demo app, logged out; a run during its hourly re-seed (around :00 UTC) can fail for that reason.

- A new case: an answers file, plus a line in the job's matrix with the examples it runs.
- After a template release, move `e2e/template.json` to its tag in a pull request: `init` must handle the template users start from.

## The actions

- `actions/<name>/action.yml` and its script. The rules they follow are in `actions/README.md`; a new input or a renamed one changes the templates and `doctor`'s checks with it.
- The **E2E** workflow's `e2e` job (`.github/workflows/e2e.yml`) runs the actions from the pull request's commit on the sample project, publishing to this repository's `gh-pages` branch, which nothing serves. A pull request from a fork skips it (its token can't push).
- To try an action change on a real project before a release, point its workflows at the branch's commit: `node packages/simpright/dist/cli.js apply --root ../SimpRight --kit-ref <commit>`, push that project's branch, and run its workflows from it. A released `simpright` pins its own release's commit instead.

## The plugins

- `plugins/<name>/` is one Claude Code plugin: `.claude-plugin/plugin.json`, its agents, skills and shared files, and its README. The marketplace (`.claude-plugin/marketplace.json`, named `simpright-kit`) lists each one by a relative path and no version: a plugin's version is its `plugin.json`'s, the kit's, which `release.ts` sets. The marketplace serves a user-level install; projects get the plugins as plain files from `apply`.
- **The plain files:** `apply` writes `simpright` into every kit project and `simpright-qa` with `parts.agents`, from `simpright`'s `dist/plugins/` (`src/plain.ts`): `skills/<s>/` as `.claude/skills/<plugin>-<s>/`, `agents/<a>.md` as `.claude/agents/<plugin>-<a>.md`, `shared/` as `.claude/<plugin>/`, and in the texts `<plugin>:<name>` as `<plugin>-<name>` and `${CLAUDE_PLUGIN_ROOT}/...` as the project path. Plain project skills and agents load in any session; a plugin a repository supplies needs a trusted folder, which Claude Code's desktop app never asks for.
- The texts hold no app's facts: what an agent needs to know about a project comes from its `simpright.yml` and the files that names. They name the plugin's own agents and skills with its prefix (`simpright-qa:ui-test-engineer`), its files through `${CLAUDE_PLUGIN_ROOT}` and `${CLAUDE_SKILL_DIR}` (which Claude Code substitutes in SKILL.md files and agent bodies only), and only `simpright.yml` keys the schema has. `test/plugin.test.ts` checks all of that, and `npm run validate:plugins` runs `claude plugin validate --strict` (the CLI from an exact devDependency), as the `ci` job does. A one-word skill name (`setup`, `doctor`) is a plain word too, so the test fails only its bare command and code forms (`/setup`, `` `setup` ``).
- `shared/how-to-ask.md` is the same file in every plugin (a test keeps the copies equal): change them together.
- A change to a key in the schema changes the texts that name it, and the other way round.
- **Trying a change** in a project, with the kit's folder next to it:
  - for one session: `claude --plugin-dir ../SimpRightKit/plugins/<name>`, which loads the plugin next to the project's plain files, under its plugin names (`/simpright-qa:review-tests`); an edit applies after `/reload-plugins`;
  - under the project's names: `npm run build` here, then the built `apply` on the project (`node ../SimpRightKit/packages/simpright/dist/cli.js apply --root <project>`, with `--kit-ref <commit>` when it has the CI part), which writes the plain files from your working copy; `git restore` the project afterwards;
  - **`/simpright-setup` end to end:** a new folder with the template at its tag (no remote, one commit), and the three packages packed after a build with a temporary `packages/simpright/dist/release.json` (`{ "version": "<the kit's version>", "commit": "<a kit commit that has the actions>" }`, so that the setup's own `apply` pins the actions without `--kit-ref`; delete it right after, since the tests expect a repository build). In the copy, point `simpright`, `@simpright/scenarios` and `@simpright/portal` at the tarballs (`file:` specs, all three: `apply` leaves those alone, but would add a missing one from npm), `npm install`, run the packed `apply` once to write the plain files, and commit. Then open a Claude Code session there and run `/simpright-setup`.
  - A resumed agent runs on its current text: don't edit an agent while one of its runs may still be resumed.

## The sample site and the screenshots

```bash
npm run sample:build        # the sample's made-up runs, published into test-results/sample-site/ (and an API-only variant)
npm run test:screenshots    # the portal's pages, compared with packages/portal/screenshots/baselines/
node packages/portal/dist/cli.js preview --sample    # look at it on http://127.0.0.1:4173/
```

- `sample:build` (`scripts/sample-site.ts`) also writes `packages/portal/sample/`, the site without its pages, which the portal ships for `preview --sample`. Its output is the same on every machine; CI fails when the committed copy isn't what the sample builds, so run it after a change to the sample, the builders or the run summaries, and commit the result.
- The committed baselines are Linux's, the system CI compares on. A run on Windows or macOS writes and compares its own (git ignores them). After a change to how a page looks, run the **Update screenshots** workflow and commit the PNGs from its artifact.

## Versions and releases

The three packages share one version, and each pins its siblings exactly (`"simpright": "0.1.0"`), so a project installs one kit release; the actions are that release's too, at its tag's commit, and so are the plugins, which ship inside `simpright` and which `simpright apply` writes into the project. Every change goes into `CHANGELOG.md` under `## <next version> (unreleased)`, with the steps a project takes to upgrade when there are any.

`main` takes changes through pull requests only (its ruleset requires the `ci` check), so a release commit goes through one too, and the tag goes on `main` after the merge:

```bash
git switch -c release-0.2.0
npm run release -- 0.2.0                 # the versions, the pins, the lockfile, the CHANGELOG date
git commit -am "Release v0.2.0"
git push origin release-0.2.0            # open a pull request; merge it once CI and E2E pass
git switch main && git pull --ff-only
git tag -a v0.2.0 -m "SimpRight Kit v0.2.0"
git push origin v0.2.0
```

The tag starts the **Release** workflow: it checks the tag against the versions, runs the typecheck and the tests, then waits for an approval in the `npm` environment (Actions → the run → Review deployments). After that it records the tagged commit in `simpright`'s `dist/release.json` (what `simpright apply` pins the actions to), publishes the packages through npm trusted publishing (no npm token; each version gets provenance from the run) and makes the GitHub release from the CHANGELOG entry. The plugins need no publishing of their own: they're in `simpright`'s package, and the tag is what the marketplace serves for a user-level install. Check them from a clone at the tag with `claude plugin validate .`.

The one-time setup behind it (done for 0.1.0):

- each package exists on npmjs.com (a `0.0.0` placeholder, because npm links only existing packages to a workflow) and is linked to `release.yml` and the `npm` environment of this repository (`npm trust github <name> --file release.yml --repo Zaytsman/SimpRightKit --env npm --allow-publish`), with publishing by token disallowed;
- the `npm` environment requires a reviewer and allows only `v*` tags.

## Style

The same rules as SimpRight: plain names, a comment on each module and exported function saying what it does, no fixed sleeps, no unused code (the typecheck fails on it). GitHub Actions, in the kit's own workflows as in its actions and templates: the rules in [`actions/README.md`](actions/README.md) (every action pinned to a full commit SHA with its version in a comment, `persist-credentials: false` on every checkout, `npm ci --ignore-scripts`, inputs reach scripts through `env:`).
