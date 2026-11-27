# SimpRight Kit

The installable parts of [SimpRight](https://github.com/Zaytsman/SimpRight), a TypeScript + Playwright test framework for UI and API tests with AI QA agents. A project starts from [SimpRightTemplate](https://github.com/Zaytsman/SimpRightTemplate), the framework's core as source you own, and adds the parts it wants. Each part is a versioned package you update, not code you copy.

| Part | What it does | Commands |
|---|---|---|
| [`simpright`](packages/simpright) | Sets up a fresh copy of the template from your answers. Writes what the parts in `simpright.yml` ask for: the CI workflows, the kit's Claude Code plugins as plain skills and agents, and the kit's packages and scripts in `package.json`. Checks that the setup is consistent: `simpright.yml` and how its parts fit together, the test runs against the workflows, the generated files, the core files against the template. Holds `simpright.yml`'s schema. | `simpright init`, `simpright apply`, `simpright doctor` |
| [`@simpright/scenarios`](packages/scenarios) | Test scenarios and bugs as YAML files: their schemas, and checks that keep them and the Playwright specs in sync. | `simpright-scenarios validate`, `simpright-scenarios check-step-titles` |
| [`@simpright/portal`](packages/portal) | A static dashboard for Playwright runs (run history, trends, known issues) with Test Cases and Bugs pages, published into any folder, such as a `gh-pages` branch. | `simpright-portal publish-run`, `simpright-portal build-pages` |
| [The CI actions](actions) | GitHub Actions composite actions: install, run the tests, publish the run and the pages to GitHub Pages, squash the `gh-pages` history, publish a wiki. `simpright apply` writes the workflows that use them (`parts.ci`). | `uses: Zaytsman/SimpRightKit/actions/<name>@<commit>` |
| [`simpright`, the setup plugin](plugins/simpright) | Claude Code skills that set a project up: an interview, then `init` and `apply` at your OK, a first test run, the project's docs and the GitHub settings; and a check that explains what `doctor` finds and checks the GitHub settings. `simpright apply` writes it into every kit project. | `/simpright-setup`, `/simpright-doctor` |
| [`simpright-qa`](plugins/simpright-qa) | The QA agents and skills: analyse a story, write API contracts and test scenarios, automate them, review and heal the tests, record bugs. `simpright apply` writes them into the project (`parts.agents`). | `/simpright-qa-implement-ui-scenarios`, ... |

The packages, the actions and the plugins share one version (one kit release). The packages need Node.js 22 or later, and everything reads the project's `simpright.yml`. The plugins reach a project as plain skills and agents in its `.claude/` folder, so they load in every Claude Code session (the desktop app, the terminal, VS Code, the cloud), with nothing to install and no folder to trust.

## Quick start

Make a repository from SimpRightTemplate (v0.4.0 or later: **Use this template** on GitHub), clone it, then in its folder:

```bash
npm install
claude                 # or open the folder in the Claude desktop app
```

and run `/simpright-setup` in Claude Code. It asks about your app, the layers you test, the login, the parts you want (scenarios, the page inspector, the QA agents, CI with test runs, the portal, a wiki) and your GitHub repository. It does the rest with the kit's commands, which also work by hand:

```bash
npx simpright init --answers answers.yml --dry-run   # the template becomes your project; without --dry-run, written
npm install
npx simpright apply --dry-run                        # what simpright.yml's parts ask for; without --dry-run, written
npx simpright doctor
npx simpright-scenarios validate
```

A Playwright project that didn't start from the template can use the parts too: `npm install --save-dev simpright`, a `simpright.yml` (its schema ships with the package), then `npx simpright apply` and `npx simpright doctor`; only `init` needs a copy of the template. Each part's README lists what it checks or writes and the `simpright.yml` keys it reads. After a kit upgrade, run `npx simpright apply`: each release's steps are in the [CHANGELOG](CHANGELOG.md).

## See it working

- The [demo portal](https://zaytsman.github.io/SimpRightKit/): the portal with the kit's sample project, a made-up shop. `npx @simpright/portal preview --sample` shows the same on your machine.
- [SimpRight](https://github.com/Zaytsman/SimpRight) is the kit's first user and its reference project: about 770 scenarios, 730 automated tests, and its [Automation Portal](https://zaytsman.github.io/SimpRight/) on GitHub Pages.

## Status

Version 0.4: the setup (`simpright init` and the `/simpright-setup` skill), every part through `apply` and `doctor`, and the plugins as plain project files, on top of 0.3's QA agents, 0.2's GitHub Actions and 0.1's packages (the parts that were scripts in SimpRight). Next come the docs (a page per part and a guide to building your framework) and 1.0.

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md): the layout, the tests, the sample project, the E2E checks and the release routine. Security reports: [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
