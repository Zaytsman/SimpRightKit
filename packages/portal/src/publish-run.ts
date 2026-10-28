// publish-run: publishes a test run's report into a portal site folder: the HTML report, its API coverage, the small
// files the portal reads and the dashboard. On CI a step runs it between the gh-pages checkout and the push; it runs
// wherever Node does, so a site can also be built locally, in any folder.
//
// It reads the run's Playwright HTML report (default playwright-report/), its JSON report (test-results/results.json)
// and its API coverage (test-results/api-coverage/), relative to the project root.
// Site layout:
//   index.html, portal.json      the dashboard and what it shows (src/site.ts, on every publish)
//   site.json                    the layout version (written once)
//   <id>-manifest.json           the kept runs of the family, newest first; older runs are deleted
//   <id>-history.json            every kept run's stats + the newest run's known issues (read by the dashboard)
//   <id>/run-<N>/                HTML report + run-summary.json (+ api-coverage/) of run N; publishing the same
//                                number again (a re-run of the workflow) replaces it
//   latest/<id>/                 a copy of the newest kept run
//   latest/api-coverage/         the newest coverage report of the family that publishes it (+ totals.json)
// The run summaries, the history and totals.json come from src/run-summaries.ts. The run's full results.json is
// only their source: an API regression's is about 8 MB, so it isn't published (it stays in the run's artifact).

import { copyFileSync, cpSync, existsSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { UsageError, type Config } from 'simpright/config';
import { buildCoverageTotals, buildFamily, RUN_FOLDER } from './run-summaries.ts';
import { replaceDir, writeDashboard } from './site.ts';

const DEFAULT_KEEP = 10;
const WHOLE_NUMBER = /^[1-9]\d*$/;

export interface PublishRunOptions {
  /** The site folder. */
  site: string;
  /** The run's id in simpright.yml runs: its report family. */
  run: string;
  /** The run's number (GITHUB_RUN_NUMBER on CI): the report goes in <id>/run-<N>/. */
  number: string;
  /** How many runs of the family stay on the site (default: the run's keep, else 10). */
  keep?: string;
  /** Also publish the newest run's API coverage as latest/api-coverage/ (default: the run's publishCoverage). */
  latestCoverage?: boolean;
  /** The run's outputs, relative to the project root. */
  report?: string;
  results?: string;
  coverage?: string;
}

/** Publishes the run's outputs from the project in `root` into the site; see the top of this file. */
export function publishRun(root: string, config: Config, options: PublishRunOptions): void {
  const run = config.runs?.find(({ id }) => id === options.run);
  if (!run) throw new UsageError(`Unknown run '${options.run}': simpright.yml's runs have no such id.`);
  if (!WHOLE_NUMBER.test(options.number)) throw new UsageError(`--number must be a positive whole number, got '${options.number}'.`);
  const keep = options.keep ?? String(run.keep ?? DEFAULT_KEEP);
  if (!WHOLE_NUMBER.test(keep)) throw new UsageError(`--keep must be a positive whole number, got '${keep}'.`);
  const latestCoverage = options.latestCoverage ?? run.publishCoverage ?? false;

  const report = path.resolve(root, options.report ?? 'playwright-report');
  const results = path.resolve(root, options.results ?? 'test-results/results.json');
  const coverage = path.resolve(root, options.coverage ?? 'test-results/api-coverage');
  if (!existsSync(report)) {
    console.log(`No ${path.relative(root, report).split(path.sep).join('/')}/ found; nothing to publish.`);
    return;
  }

  const site = path.resolve(options.site);
  const familyDir = path.join(site, run.id);
  const thisRun = `run-${options.number}`;
  const runNumber = (folder: string) => Number(folder.slice('run-'.length));

  // This run's report, coverage and results (the source of its run-summary.json, removed below).
  replaceDir(report, path.join(familyDir, thisRun));
  if (existsSync(results)) copyFileSync(results, path.join(familyDir, thisRun, 'results.json'));
  if (existsSync(coverage)) cpSync(coverage, path.join(familyDir, thisRun, 'api-coverage'), { recursive: true });

  // Keep only the newest runs and list them in the manifest.
  const runs = readdirSync(familyDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && RUN_FOLDER.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => runNumber(b) - runNumber(a));
  const kept = runs.slice(0, Number(keep));
  for (const old of runs.slice(kept.length)) rmSync(path.join(familyDir, old), { recursive: true, force: true });
  writeFileSync(path.join(site, `${run.id}-manifest.json`), `${JSON.stringify(kept, null, 2)}\n`);
  console.log(`Runs kept for ${run.id}: ${kept.length}`);
  if (!kept.includes(thisRun)) console.log(`${thisRun} is older than the ${keep} newest runs, so it isn't kept.`);

  buildFamily(site, run.id);
  // Every run with results now has its run-summary.json, so drop the full results.json (also from runs published
  // before the summaries existed).
  for (const folder of kept) rmSync(path.join(familyDir, folder, 'results.json'), { force: true });

  // The latest copies come from the newest kept run, which is this one unless an older run was published again.
  const newest = path.join(familyDir, kept[0]!);
  replaceDir(newest, path.join(site, 'latest', run.id));
  if (latestCoverage && existsSync(path.join(newest, 'api-coverage'))) {
    replaceDir(path.join(newest, 'api-coverage'), path.join(site, 'latest', 'api-coverage'));
  }
  buildCoverageTotals(site);
  writeDashboard(root, config, site);
}
