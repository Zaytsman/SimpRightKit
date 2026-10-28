# SimpRight Kit

The installable parts of [SimpRight](https://github.com/Zaytsman/SimpRight), a TypeScript + Playwright test framework for UI and API tests with AI QA agents. A project starts from [SimpRightTemplate](https://github.com/Zaytsman/SimpRightTemplate), the framework's core as source you own, and adds the parts it wants. Each part is a versioned package you update, not code you copy.

| Package | What it does | Commands |
|---|---|---|
| [`simpright`](packages/simpright) | Checks that a project's setup is consistent: `simpright.yml`, the paths and parts it names, the test runs against the GitHub workflows, the core files against the template. Holds `simpright.yml`'s schema. | `simpright doctor` |
| [`@simpright/scenarios`](packages/scenarios) | Test scenarios and bugs as YAML files: their schemas, and checks that keep them and the Playwright specs in sync. | `simpright-scenarios validate`, `simpright-scenarios check-step-titles` |
| [`@simpright/portal`](packages/portal) | A static dashboard for Playwright runs (run history, trends, known issues) with Test Cases and Bugs pages, published into any folder, such as a `gh-pages` branch. | `simpright-portal publish-run`, `simpright-portal build-pages` |

The three packages share one version (one kit release), need Node.js 22 or later, and read the project's `simpright.yml`.

## Quick start

In a project made from SimpRightTemplate (or any Playwright project with a `simpright.yml`):

```bash
npm install --save-dev simpright @simpright/scenarios @simpright/portal
npx simpright doctor
npx simpright-scenarios validate
npx simpright-portal build-pages --site .gh-pages
```

Each package's README lists what it checks or writes and the `simpright.yml` keys it reads.

## See it working

- The [demo portal](https://zaytsman.github.io/SimpRightKit/): the portal with the kit's sample project, a made-up shop. `npx @simpright/portal preview --sample` shows the same on your machine.
- [SimpRight](https://github.com/Zaytsman/SimpRight) is the kit's first user and its reference project: about 770 scenarios, 730 automated tests, and its [Automation Portal](https://zaytsman.github.io/SimpRight/) on GitHub Pages.

## Status

Version 0.1: the parts that were scripts in SimpRight, as packages. Next come the GitHub Actions and a workflow generator (`simpright apply`), the QA agents as Claude Code plugins, and a setup assistant that asks the questions and runs `apply` and `doctor`.

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md): the layout, the tests, the sample project and the release routine. Security reports: [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
