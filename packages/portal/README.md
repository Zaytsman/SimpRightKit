# @simpright/portal

A static dashboard for Playwright runs, part of the [SimpRight Kit](https://github.com/Zaytsman/SimpRightKit). It shows each run family's latest report and history, a health card and trend per layer, the known issues, and Test Cases and Bugs pages built from the project's scenarios and bugs. It writes a plain folder, so you can publish it anywhere. On GitHub, publish it as the `gh-pages` branch.

```bash
npx @simpright/portal preview --sample    # the portal with a made-up project's data, on http://127.0.0.1:4173/

npm install --save-dev @simpright/portal
npx simpright-portal publish-run --site .gh-pages --run <id> --number <N>
npx simpright-portal build-pages --site .gh-pages
npx simpright-portal preview --site .gh-pages
```

See the [demo portal](https://zaytsman.github.io/SimpRightKit/) (the sample's data) and SimpRight's [Automation Portal](https://zaytsman.github.io/SimpRight/) (a real project's).

## Commands

- `publish-run --site <dir> --run <id> --number <N> [--keep <N>] [--latest-coverage] [--report <dir>] [--results <file>] [--coverage <dir>]`: copies a run's HTML report into `<id>/run-<N>/` and writes its small summary from the JSON report. It keeps the newest runs (default: the run's `keep`, else 10) and refreshes the dashboard. The run's outputs default to `playwright-report/`, `test-results/results.json` and `test-results/api-coverage/`. `--latest-coverage` (default: the run's `publishCoverage`) also publishes the run's API coverage report as the latest.
- `build-pages --site <dir>`: the Test Cases pages (one per layer), the Bugs page and the dashboard.
- `build-test-cases [<out dir>]`, `build-bugs [<out dir>]`, `build-config [<out file>]`: one page, or the dashboard's `portal.json`, on its own.
- `preview [--site <dir> | --sample] [--port <N>]`: serves a site on `http://127.0.0.1:<port>/` (default 4173), only to this machine. `--sample` serves the sample site this package ships, with its own pages, and needs no project.

The commands but `preview` take `--root <dir>`, the project's folder (default: the nearest folder up with `simpright.yml`). Set `SOURCE_DATE_EPOCH` for a reproducible build time.

## What it reads

- `simpright.yml`: `portal` (title, accent, tagline, description, health thresholds) and `runs` (one report family each: `id`, `label`, `note`, `trend`, `keep`, `publishCoverage`); `parts.wiki` (a link to the repository's wiki); for the pages, `paths.scenarios`, `paths.bugs`, `ids`, and the workflow of each layer's `areaPicker` run (a "Run on GitHub" button). The dashboard shows a status card and trends for each layer with a `trend` run, and names only those layers.
- The repository the pages link to: `GITHUB_REPOSITORY` on GitHub Actions, else the `origin` remote. Links to the project's files start with its folder in the repository (git's, or `SIMPRIGHT_PROJECT_PATH`), so a project in a subfolder of a monorepo links right too.
- The JSON reporter's output for the stats and known issues: a test annotation that contains `Known issue` (`test.fail(true, 'Known issue BUG-001: ...')`) lists the test under Known Issues, and the bug ID links to the Bugs page.

## The site

```text
index.html, portal.json   the dashboard and what it shows (rewritten on every publish)
site.json                 the site's layout version
<id>-manifest.json        the kept runs of a family, newest first
<id>-history.json         their stats and the newest run's known issues
<id>/run-<N>/             a run's HTML report, run-summary.json and API coverage
latest/<id>/              a copy of the family's newest run
latest/api-coverage/      the newest coverage report of the family that publishes it
test-cases/<layer>/       the Test Cases pages
bugs/                     the Bugs page
```

A run's full `results.json` isn't published (an API regression's is about 8 MB): the pages read the small summaries.

## License

[MIT](LICENSE)
