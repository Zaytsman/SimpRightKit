// build-pages: builds the portal's pages into a site folder: the Test Cases pages (test-cases/<layer>/), the Bugs page
// (bugs/, when simpright.yml has paths.bugs) and the dashboard (index.html, portal.json). The rest of the site is the
// test runs' (publish-run). On CI a step runs it between the gh-pages checkout and the push, and a pull request's
// checks can run it to see that the pages still build; it runs wherever Node does.
//
// It replaces the whole test-cases/ and bugs/ folders, so a layer that no longer exists disappears too. It also
// builds the run summaries of report families that have none yet (src/run-summaries.ts), so a dashboard change
// published here finds its data before the next run.

import { rmSync } from 'node:fs';
import path from 'node:path';
import type { Config } from 'simpright/config';
import { buildBugs } from './bugs.ts';
import { buildCoverageTotals, buildFamily, familiesWithoutHistory } from './run-summaries.ts';
import { writeDashboard } from './site.ts';
import { buildTestCases } from './test-cases.ts';

/** Builds the pages of the project in `root` into `site`; see the top of this file. */
export function buildPages(root: string, config: Config, siteDir: string): void {
  const site = path.resolve(siteDir);
  for (const [folder, build] of [
    ['test-cases', buildTestCases],
    ['bugs', buildBugs],
  ] as const) {
    rmSync(path.join(site, folder), { recursive: true, force: true });
    build(root, config, path.join(site, folder));
  }
  familiesWithoutHistory(site).forEach((family) => buildFamily(site, family));
  buildCoverageTotals(site);
  writeDashboard(root, config, site);
}
