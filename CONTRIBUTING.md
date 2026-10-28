# Contributing

## Layout

```text
packages/simpright/       simpright: the CLI (doctor) and simpright.yml's schema and reader
packages/scenarios/       @simpright/scenarios: the scenario and bug schemas, validate, check-step-titles
packages/portal/          @simpright/portal: the pages (pages/), the builders, publish-run, build-pages, preview,
                          the sample site it ships (sample/) and the screenshot tests (screenshots/)
examples/sample-project/  a made-up shop's simpright.yml, scenarios, bugs, specs and workflows: what the tests run on
test/helpers.ts           sampleProject(): a fresh copy of the sample project for a test to change
scripts/                  the repo's own scripts: check-packages.ts, sample-site.ts
```

## Working on the kit

```bash
npm install
npm test             # builds the packages, then runs every packages/*/test/*.test.ts with node:test
npm run typecheck    # builds, then checks the sources, the tests and the scripts
npm run check:packages   # what each package would publish
```

- The sources are TypeScript (Node 22.18 or later runs them directly in the repo). `tsc` builds each package into `dist/` for publishing, because Node doesn't strip types inside `node_modules`.
- Inside a package, imports name the `.ts` file; the build rewrites them to `.js`. Between packages, imports name the package (`simpright/config`), which resolves to its built `dist/`: build before you run a test or a command.
- A test changes a copy of the sample project (`sampleProject()`), one file at a time, and checks what a command says about it. A new check gets a case that breaks it.
- To try a change on a real project, run the built command against it: `node packages/scenarios/dist/cli.js validate --root ../SimpRight`.

## The sample site and the screenshots

```bash
npm run sample:build        # the sample's made-up runs, published into test-results/sample-site/ (and an API-only variant)
npm run test:screenshots    # the portal's pages, compared with packages/portal/screenshots/baselines/
node packages/portal/dist/cli.js preview --sample    # look at it on http://127.0.0.1:4173/
```

- `sample:build` (`scripts/sample-site.ts`) also writes `packages/portal/sample/`, the site without its pages, which the portal ships for `preview --sample`. Its output is the same on every machine; CI fails when the committed copy isn't what the sample builds, so run it after a change to the sample, the builders or the run summaries, and commit the result.
- The committed baselines are Linux's, the system CI compares on. A run on Windows or macOS writes and compares its own (git ignores them). After a change to how a page looks, run the **Update screenshots** workflow and commit the PNGs from its artifact.

## Versions and releases

The three packages share one version, and each pins its siblings exactly (`"simpright": "0.1.0"`), so a project installs one kit release. Every change goes into `CHANGELOG.md` under `## <next version> (unreleased)`.

To release:

```bash
npm run release -- 0.2.0                 # the versions, the pins, the lockfile, the CHANGELOG date
git commit -am "Release v0.2.0"
git tag -a v0.2.0 -m "SimpRight Kit v0.2.0"
git push origin main v0.2.0
```

The tag starts the **Release** workflow: it checks the tag against the versions, runs the typecheck and the tests, then waits for an approval in the `npm` environment (Actions → the run → Review deployments). After that it publishes the packages through npm trusted publishing (no npm token; each version gets provenance from the run) and makes the GitHub release from the CHANGELOG entry.

The one-time setup behind it (done for 0.1.0):

- each package exists on npmjs.com (a `0.0.0` placeholder, because npm links only existing packages to a workflow) and is linked to `release.yml` and the `npm` environment of this repository (`npm trust github <name> --file release.yml --repo Zaytsman/SimpRightKit --env npm --allow-publish`), with publishing by token disallowed;
- the `npm` environment requires a reviewer and allows only `v*` tags.

## Style

The same rules as SimpRight: plain names, a comment on each module and exported function saying what it does, no fixed sleeps, no unused code (the typecheck fails on it). GitHub Actions: every action pinned to a full commit SHA with its version in a comment, `persist-credentials: false` on every checkout, `npm ci --ignore-scripts`, inputs reach scripts through `env:`.
