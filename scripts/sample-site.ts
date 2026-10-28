// Builds the sample site from the sample project (examples/sample-project): made-up runs of its families, published
// through publish-run, then the pages through build-pages. The dates, the repository and every result are fixed, so
// each machine gets the same bytes. It writes:
//   packages/portal/sample/         the site without its pages: what @simpright/portal ships for `preview --sample`
//   test-results/sample-site/       the whole site: the demo portal and the screenshot tests
//   test-results/sample-site-api/   an API-only variant (one layer, no Bugs page), for the single-layer screenshots
// Run with `npm run sample:build` (it builds the packages first); CI checks that packages/portal/sample/ is current.

import { cpSync, existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { readConfig } from 'simpright/config';
import { parse } from 'yaml';
import { buildPages } from '../packages/portal/src/build-pages.ts';
import { publishRun } from '../packages/portal/src/publish-run.ts';
import { KIT, sampleProject, type Project } from '../test/helpers.ts';

const PACKAGE_SAMPLE = path.join(KIT, 'packages/portal/sample');
const SITE = path.join(KIT, 'test-results/sample-site');
const API_SITE = path.join(KIT, 'test-results/sample-site-api');

// What the pages link to and when they were built, as on CI.
Object.assign(process.env, {
  GITHUB_REPOSITORY: 'Zaytsman/SimpRightKit',
  GITHUB_SHA: '5a3b1e0c9d8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b',
  GITHUB_REF_NAME: 'main',
  SOURCE_DATE_EPOCH: String(Date.UTC(2026, 9, 28, 8) / 1000),
  // The sample is built from a copy outside git; its files are in this folder of the kit's repository.
  SIMPRIGHT_PROJECT_PATH: 'examples/sample-project/',
});

/** How a test ended in a run: passed, failed on both attempts, failed then passed (flaky), or a known issue that failed as expected. */
type Outcome = 'passed' | 'failed' | 'flaky' | 'known';

interface Scenario {
  id: string;
  name: string;
  knownIssue?: string;
  bug?: string;
}
interface SpecFile {
  /** The spec's path under paths.tests, as the JSON report names it. */
  file: string;
  describe: string;
  scenarios: Scenario[];
}

/** The sample's automated scenarios, by spec. */
function specFiles(project: Project): SpecFile[] {
  const config = readConfig(project.root);
  const files: SpecFile[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(path.join(project.root, dir), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(file);
      else if (entry.name.endsWith('.yml')) {
        const doc = parse(project.read(file)) as { suite: string; tags: string[]; scenarios: (Scenario & { automatedIn?: string })[] };
        const automated = doc.scenarios.filter((scenario) => scenario.automatedIn);
        if (automated.length === 0) continue;
        files.push({
          file: automated[0]!.automatedIn!.slice(config.paths.tests.length + 1),
          describe: `${doc.tags.join(' ')} - ${doc.suite}`,
          scenarios: automated,
        });
      }
    }
  };
  walk(config.paths.scenarios);
  return files;
}

interface PlannedRun {
  family: string;
  number: number;
  /** When it started (UTC). */
  start: string;
  /** The scenario IDs it ran. */
  ids: string[];
  /** The tests that didn't just pass (known issues are found by their scenario). */
  outcomes?: Record<string, Exclude<Outcome, 'known'>>;
}

const WEEKDAYS = ['10-15', '10-16', '10-19', '10-20', '10-21', '10-22', '10-23', '10-26', '10-27', '10-28'];
const API = ['API-0001', 'API-0002', 'API-0003', 'API-0004'];
const UI = ['UI-001', 'UI-002', 'UI-004', 'UI-005'];

/** Ten nightly runs of each regression (one bad night and one flaky test each, the UI's worst night two days ago), a few smoke runs and two custom ones. */
const PLAN: PlannedRun[] = [
  ...WEEKDAYS.map((day, i): PlannedRun => ({
    family: 'api-regression',
    number: i + 1,
    start: `2026-${day}T02:15:00.000Z`,
    ids: API,
    outcomes: { 4: { 'API-0002': 'failed' as const }, 7: { 'API-0004': 'flaky' as const } }[i + 1],
  })),
  ...WEEKDAYS.map((day, i): PlannedRun => ({
    family: 'ui-regression',
    number: i + 1,
    start: `2026-${day}T06:15:00.000Z`,
    ids: UI,
    outcomes: { 3: { 'UI-002': 'failed' as const }, 6: { 'UI-004': 'flaky' as const }, 9: { 'UI-001': 'failed' as const, 'UI-002': 'failed' as const } }[i + 1],
  })),
  ...['10-20', '10-23', '10-27', '10-28'].map((day, i): PlannedRun => ({ family: 'smoke', number: i + 1, start: `2026-${day}T10:00:00.000Z`, ids: ['API-0001', 'UI-001'] })),
  { family: 'custom-ui', number: 1, start: '2026-10-22T14:00:00.000Z', ids: ['UI-004', 'UI-005'] },
  { family: 'custom-ui', number: 2, start: '2026-10-27T15:30:00.000Z', ids: ['UI-001', 'UI-002'] },
];

/** The run's outputs in the project: a stub HTML report and a Playwright JSON report of its tests. */
function writeRunOutputs(project: Project, specs: SpecFile[], run: PlannedRun) {
  project.remove('playwright-report');
  project.remove('test-results');
  const counts = { expected: 0, unexpected: 0, flaky: 0, skipped: 0 };
  const suites = specs
    .map((spec) => {
      const tests = spec.scenarios.filter((scenario) => run.ids.includes(scenario.id));
      return {
        title: spec.file,
        specs: [],
        suites: [
          {
            title: spec.describe,
            specs: tests.map((scenario) => {
              const outcome: Outcome = scenario.knownIssue ? 'known' : (run.outcomes?.[scenario.id] ?? 'passed');
              counts[{ passed: 'expected', known: 'expected', failed: 'unexpected', flaky: 'flaky' }[outcome] as keyof typeof counts]++;
              const statuses = { passed: ['passed'], known: ['failed'], failed: ['failed', 'failed'], flaky: ['failed', 'passed'] }[outcome];
              return {
                title: `${scenario.id}: ${scenario.name}`,
                tests: [
                  {
                    expectedStatus: outcome === 'known' ? 'failed' : 'passed',
                    annotations: outcome === 'known' ? [{ type: 'fail', description: `Known issue ${scenario.bug}: ${scenario.knownIssue}` }] : [],
                    results: statuses.map((status) => ({ status })),
                  },
                ],
              };
            }),
          },
        ],
      };
    })
    .filter((suite) => suite.suites[0]!.specs.length > 0);
  // Made-up durations that differ from run to run: the API runs take a few seconds, the UI runs about half a minute.
  const duration = run.family.startsWith('api') ? 4200 + ((run.number * 137) % 900) : 26_000 + ((run.number * 733) % 5000);
  project.write('test-results/results.json', `${JSON.stringify({ config: {}, stats: { startTime: run.start, duration, ...counts }, suites })}\n`);
  project.write(
    'playwright-report/index.html',
    `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Sample report</title></head>
<body style="margin:0;padding:40px 20px;background:#0d1117;color:#c9d1d9;font-family:system-ui,sans-serif;line-height:1.5">
  <h1 style="font-size:22px">Sample report: ${run.family} run ${run.number}</h1>
  <p>The SimpRight Kit's sample runs are made up, so there's no real Playwright report here. In a project,
  <code>simpright-portal publish-run</code> copies the run's HTML report to this folder.</p>
  <p>${counts.expected} passed as expected, ${counts.unexpected} failed, ${counts.flaky} flaky.</p>
</body>
</html>
`,
  );
}

/** Publishes the plan's runs of the project into `site`, then builds the pages. */
function buildSite(project: Project, site: string, plan: PlannedRun[]) {
  rmSync(site, { recursive: true, force: true });
  const config = readConfig(project.root);
  const specs = specFiles(project);
  const log = console.log;
  console.log = () => {};
  try {
    for (const run of plan) {
      writeRunOutputs(project, specs, run);
      publishRun(project.root, config, { site, run: run.family, number: String(run.number) });
    }
    buildPages(project.root, config, site);
  } finally {
    console.log = log;
  }
  console.log(`${path.relative(KIT, site).split(path.sep).join('/')}/: ${plan.length} runs of ${new Set(plan.map((run) => run.family)).size} families, and the pages`);
}

/** The sample as an API-only project: one layer, its regression and smoke runs, no Bugs page. */
function apiOnly(project: Project) {
  project.edit('simpright.yml', '    ui: { prefix: UI, digits: 3 }\n', '');
  project.edit('simpright.yml', '  bugs: bugs\n  bugSchema: node_modules/@simpright/scenarios/schemas/bug.schema.json\n', '');
  project.edit('simpright.yml', '  bugs: { prefix: BUG, digits: 3 }\n', '');
  project.edit('simpright.yml', 'portal: { testCases: true, bugs: true }', 'portal: { testCases: true, bugs: false }');
  const runs = project.read('simpright.yml').replace(/\r\n/g, '\n').match(/\nruns:\n[\s\S]*?\n\n/)?.[0];
  if (!runs) throw new Error("The sample's simpright.yml has no runs section.");
  project.edit(
    'simpright.yml',
    runs,
    '\nruns:\n  - id: api-regression\n    label: API regression\n    note: Latest nightly run\n    project: api\n    schedule: \'15 2 * * 1-5\'\n    trend: api\n  - id: smoke\n    label: Smoke\n    note: The happy paths\n    project: api\n    grep: \'@smoke\'\n\n',
  );
  project.edit('simpright.yml', 'healthThreshold: { ui: 1, api: 1 }', 'healthThreshold: { api: 1 }');
}

const project = sampleProject();
const apiProject = sampleProject();
try {
  // The sample's workflows don't run in the kit's repository, so the demo has no area picker: its Test Cases pages
  // would offer a "Run on GitHub" button that leads nowhere.
  project.edit('simpright.yml', '    areaPicker: true\n    keep: 5\n', '    keep: 5\n');
  buildSite(project, SITE, PLAN);
  apiOnly(apiProject);
  buildSite(
    apiProject,
    API_SITE,
    PLAN.filter((run) => run.family === 'api-regression' || run.family === 'smoke').map((run) => ({ ...run, ids: run.ids.filter((id) => id.startsWith('API')) })),
  );
} finally {
  project.dispose();
  apiProject.dispose();
}

// The package's copy: the site without the pages, which `preview --sample` serves from the package itself.
rmSync(PACKAGE_SAMPLE, { recursive: true, force: true });
cpSync(SITE, PACKAGE_SAMPLE, { recursive: true });
const pages = [
  'index.html',
  'bugs/index.html',
  ...readdirSync(path.join(PACKAGE_SAMPLE, 'test-cases')).map((layer) => `test-cases/${layer}/index.html`),
];
for (const page of pages) {
  const file = path.join(PACKAGE_SAMPLE, page);
  if (!existsSync(file)) throw new Error(`The sample site has no ${page}.`);
  rmSync(file);
}
const fileCount = (dir: string): number =>
  readdirSync(dir, { withFileTypes: true }).reduce((count, entry) => count + (entry.isDirectory() ? fileCount(path.join(dir, entry.name)) : 1), 0);
console.log(`packages/portal/sample/: ${fileCount(PACKAGE_SAMPLE)} files (the site without its ${pages.length} pages)`);
// A sanity check that it is the data the pages read.
JSON.parse(readFileSync(path.join(PACKAGE_SAMPLE, 'portal.json'), 'utf8'));
