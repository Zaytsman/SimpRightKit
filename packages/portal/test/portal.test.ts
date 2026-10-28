// simpright-portal's publish-run and build-pages on a copy of the sample project, into a fresh site folder.

import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { readConfig, UsageError } from 'simpright/config';
import { sampleProject, type Project } from '../../../test/helpers.ts';
import { buildPages } from '../src/build-pages.ts';
import { preview } from '../src/preview.ts';
import { publishRun } from '../src/publish-run.ts';

// Where the pages link to, and a fixed build time, as on CI.
process.env.GITHUB_REPOSITORY = 'Zaytsman/SimpRightKit-sample';
process.env.GITHUB_SHA = '0123456789abcdef0123456789abcdef01234567';
process.env.GITHUB_REF_NAME = 'main';
process.env.SOURCE_DATE_EPOCH = '1798761600';

let project: Project;
let site: string;
const silently = <T>(work: () => T): T => {
  const log = console.log;
  console.log = () => {};
  try {
    return work();
  } finally {
    console.log = log;
  }
};
const json = (file: string) => JSON.parse(readFileSync(path.join(site, file), 'utf8'));
const folders = (dir: string) => readdirSync(path.join(site, dir), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();

/** A run's outputs in the project: the HTML report (tagged), a JSON report with one known issue, and optionally coverage. */
function runOutputs(tag: string, { coverage = false } = {}) {
  project.remove('playwright-report');
  project.remove('test-results');
  project.write('playwright-report/index.html', `<html>report ${tag}</html>\n`);
  project.write(`playwright-report/data/${tag}.txt`, `attachment of ${tag}\n`);
  const test = (status: string, expectedStatus = 'passed', annotations: object[] = []) => ({ expectedStatus, annotations, results: [{ status }] });
  project.write(
    'test-results/results.json',
    JSON.stringify({
      stats: { startTime: '2026-10-28T06:15:00.000Z', duration: 1000, expected: 2, unexpected: 0, skipped: 0, flaky: 0 },
      suites: [
        {
          title: 'api/products/get-products.spec.ts',
          suites: [
            {
              title: '@products-api - Products API',
              specs: [
                { title: 'API-0001: The product list returns products with a name and a price', tests: [test('passed')] },
                { title: 'API-0003: A page past the last one returns an empty list', tests: [test('failed', 'failed', [{ type: 'fail', description: 'Known issue BUG-001: The API returns 500.' }])] },
              ],
            },
          ],
        },
      ],
    }),
  );
  if (coverage) project.write('test-results/api-coverage/summary.json', JSON.stringify({ overallCoveragePct: 80, coveredEndpoints: 4, endpoints: [{ path: '/products' }] }));
}

const publish = (run: string, number: string, extra: Partial<Parameters<typeof publishRun>[2]> = {}) =>
  silently(() => publishRun(project.root, readConfig(project.root), { site, run, number, ...extra }));

beforeEach(() => {
  project = sampleProject();
  site = path.join(project.root, '.gh-pages');
});
afterEach(() => project.dispose());

describe('simpright-portal publish-run', () => {
  it("publishes a first run: the report, its summary, the family's files, latest/ and the dashboard", () => {
    runOutputs('one', { coverage: true });
    publish('api-regression', '1');
    assert.equal(readFileSync(path.join(site, 'api-regression/run-1/index.html'), 'utf8'), '<html>report one</html>\n');
    assert.ok(!existsSync(path.join(site, 'api-regression/run-1/results.json')), "the full results.json isn't published");
    const summary = json('api-regression/run-1/run-summary.json');
    assert.equal(summary.stats.expected, 2);
    assert.deepEqual(summary.knownIssues, [{ area: 'api/products/get-products.spec.ts', testName: 'API-0003: A page past the last one returns an empty list', description: 'Known issue BUG-001: The API returns 500.' }]);
    assert.deepEqual(summary.tests['API-0003'], { status: 'failed', expectedStatus: 'failed' });
    assert.deepEqual(json('api-regression-manifest.json'), ['run-1']);
    assert.equal(json('api-regression-history.json').runs.length, 1);
    assert.deepEqual(json('latest/api-coverage/totals.json'), { overallCoveragePct: 80, coveredEndpoints: 4 }, 'the run publishes its coverage (publishCoverage)');
    assert.ok(existsSync(path.join(site, 'latest/api-regression/run-summary.json')));
    const portal = json('portal.json');
    assert.equal(portal.title, 'Sample Shop');
    assert.equal(portal.repository, 'https://github.com/Zaytsman/SimpRightKit-sample');
    assert.equal(portal.wiki, false, 'the sample publishes no wiki (parts.wiki)');
    assert.deepEqual(portal.runs.map((run: { id: string }) => run.id), ['ui-regression', 'api-regression', 'smoke', 'custom-ui']);
    assert.deepEqual(json('site.json'), { layoutVersion: 1 });
    assert.ok(existsSync(path.join(site, 'index.html')) && existsSync(path.join(site, '.nojekyll')));
  });

  it("keeps the run's number of newest runs (custom-ui keeps 5)", () => {
    for (const number of ['1', '2', '3', '4', '5', '6', '7']) {
      runOutputs(number);
      publish('custom-ui', number);
    }
    assert.deepEqual(json('custom-ui-manifest.json'), ['run-7', 'run-6', 'run-5', 'run-4', 'run-3']);
    assert.deepEqual(folders('custom-ui'), ['run-3', 'run-4', 'run-5', 'run-6', 'run-7']);
    assert.equal(json('custom-ui-history.json').runs.length, 5);
  });

  it('replaces a run published again (a re-run of the workflow)', () => {
    runOutputs('first');
    publish('smoke', '2');
    runOutputs('second');
    publish('smoke', '2');
    assert.deepEqual(readdirSync(path.join(site, 'smoke/run-2/data')), ['second.txt']);
  });

  it('copies the newest kept run to latest/, also when an older run is published again', () => {
    for (const number of ['3', '5', '3']) {
      runOutputs(`run-${number}`);
      publish('smoke', number);
    }
    assert.equal(readFileSync(path.join(site, 'latest/smoke/index.html'), 'utf8'), '<html>report run-5</html>\n');
  });

  it("doesn't keep a run older than the kept ones", () => {
    for (const number of ['5', '6', '3']) {
      runOutputs(number);
      publish('smoke', number, { keep: '2' });
    }
    assert.deepEqual(json('smoke-manifest.json'), ['run-6', 'run-5']);
    assert.ok(!existsSync(path.join(site, 'smoke/run-3')));
  });

  it("publishes nothing when there's no report", () => {
    publish('smoke', '1');
    assert.ok(!existsSync(site));
  });

  it('rejects an unknown run, a bad number and a bad keep', () => {
    runOutputs('x');
    assert.throws(() => publish('nightly', '1'), (error) => error instanceof UsageError && /Unknown run 'nightly'/.test(error.message));
    assert.throws(() => publish('smoke', '0'), (error) => error instanceof UsageError && /--number must be a positive whole number, got '0'/.test(error.message));
    assert.throws(() => publish('smoke', '1', { keep: 'all' }), (error) => error instanceof UsageError && /--keep must be a positive whole number, got 'all'/.test(error.message));
  });
});

describe('simpright-portal build-pages', () => {
  it('builds the Test Cases and Bugs pages and the dashboard', () => {
    silently(() => buildPages(project.root, readConfig(project.root), site));
    const catalog = (file: string, variable: string) => {
      const text = readFileSync(path.join(site, file), 'utf8');
      assert.ok(text.startsWith('// Generated by @simpright/portal'), file);
      return JSON.parse(text.slice(text.indexOf(`${variable} = `) + variable.length + 3).replace(/;\s*$/, ''));
    };
    const ui = catalog('test-cases/ui/scenarios-data.js', 'window.SCENARIO_CATALOG');
    assert.deepEqual(ui.stats, { total: 5, automated: 4, manual: 1, knownIssues: 1, automatedPct: 80 });
    assert.equal(ui.generatedAt, '2027-01-01T00:00:00.000Z', 'SOURCE_DATE_EPOCH sets the build time');
    assert.equal(ui.workflowUrl, 'https://github.com/Zaytsman/SimpRightKit-sample/actions/workflows/custom-ui.yml', "the area picker run's workflow");
    assert.equal(ui.portal.title, 'Sample Shop');
    const api = catalog('test-cases/api/scenarios-data.js', 'window.SCENARIO_CATALOG');
    assert.equal(api.workflowUrl, undefined, 'no API run has an area picker');
    assert.deepEqual(api.tree[0].files.map((file: { label: string }) => file.label), ['GET /products', 'GET /products/{productId}']);
    const bugs = catalog('bugs/bugs-data.js', 'window.BUG_CATALOG');
    assert.deepEqual(bugs.stats, { total: 3, open: 2, fixed: 1, wontFix: 0 });
    assert.deepEqual(bugs.bugs.map((bug: { id: string }) => bug.id), ['BUG-002', 'BUG-001', 'BUG-003'], 'open bugs first, then by severity');
    assert.deepEqual(bugs.regressions.map((run: { results: string }) => run.results), ['../latest/ui-regression/run-summary.json', '../latest/api-regression/run-summary.json']);
    for (const page of ['index.html', 'test-cases/ui/index.html', 'test-cases/api/index.html', 'bugs/index.html', 'portal.json', 'site.json']) assert.ok(existsSync(path.join(site, page)), page);
  });

  it("replaces old pages and builds a family's missing history", () => {
    project.write('.gh-pages/test-cases/legacy/index.html', 'old\n');
    project.write('.gh-pages/smoke-manifest.json', '["run-1"]\n');
    project.write('.gh-pages/smoke/run-1/index.html', '<html></html>\n');
    silently(() => buildPages(project.root, readConfig(project.root), site));
    assert.deepEqual(folders('test-cases'), ['api', 'ui']);
    assert.deepEqual(json('smoke-history.json'), { runs: [{ run: 'run-1', stats: null }], knownIssues: [] });
  });

  it("links the project's files in its folder of the repository", () => {
    process.env.SIMPRIGHT_PROJECT_PATH = 'examples/shop';
    try {
      silently(() => buildPages(project.root, readConfig(project.root), site));
    } finally {
      delete process.env.SIMPRIGHT_PROJECT_PATH;
    }
    const data = readFileSync(path.join(site, 'bugs/bugs-data.js'), 'utf8');
    assert.match(data, /"projectPath": "examples\/shop\/"/);
  });

  it('skips the Bugs page without paths.bugs', () => {
    project.edit('simpright.yml', '  bugs: bugs\n  bugSchema: node_modules/@simpright/scenarios/schemas/bug.schema.json\n', '');
    project.edit('simpright.yml', '  bugs: { prefix: BUG, digits: 3 }\n', '');
    silently(() => buildPages(project.root, readConfig(project.root), site));
    assert.ok(!existsSync(path.join(site, 'bugs')));
  });
});

describe('simpright-portal preview', () => {
  /** Starts a preview on a free port, runs `check` against it, and stops it. */
  async function withPreview(options: Parameters<typeof preview>[0], check: (url: string) => Promise<void>) {
    const server = await preview({ ...options, port: 0 });
    const address = server.address();
    try {
      await check(`http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`);
    } finally {
      server.close();
    }
  }

  it("serves a site's files, a folder's index.html with a trailing slash, and nothing outside it", async () => {
    project.write('.gh-pages/index.html', '<html>dashboard</html>\n');
    project.write('.gh-pages/test-cases/ui/index.html', '<html>ui</html>\n');
    project.write('.gh-pages/portal.json', '{}\n');
    await withPreview({ site }, async (url) => {
      assert.equal(await (await fetch(`${url}/`)).text(), '<html>dashboard</html>\n');
      const redirect = await fetch(`${url}/test-cases/ui`, { redirect: 'manual' });
      assert.equal(redirect.status, 301);
      assert.equal(redirect.headers.get('location'), '/test-cases/ui/');
      assert.equal(await (await fetch(`${url}/test-cases/ui/`)).text(), '<html>ui</html>\n');
      assert.equal((await fetch(`${url}/portal.json`)).headers.get('content-type'), 'application/json; charset=utf-8');
      assert.equal((await fetch(`${url}/portal.json`, { method: 'HEAD' })).status, 200);
      assert.equal((await fetch(`${url}/missing.json`)).status, 404);
      // The project's simpright.yml is one folder up: neither an encoded .. nor an encoded backslash reaches it.
      for (const escape of ['%2e%2e/simpright.yml', '..%5csimpright.yml', '%2e%2e%5csimpright.yml']) {
        const response = await fetch(`${url}/${escape}`);
        assert.ok([403, 404].includes(response.status), `${escape}: ${response.status}`);
      }
      assert.equal((await fetch(`${url}/`, { method: 'POST' })).status, 405);
    });
  });

  it("serves the sample site with this package's pages", async () => {
    await withPreview({ sample: true }, async (url) => {
      assert.match(await (await fetch(`${url}/`)).text(), /<title>Automation Portal<\/title>/);
      assert.match(await (await fetch(`${url}/test-cases/api/`)).text(), /<title>Test Cases<\/title>/);
      assert.match(await (await fetch(`${url}/bugs/`)).text(), /<title>Bugs<\/title>/);
      assert.equal(((await (await fetch(`${url}/portal.json`)).json()) as { title: string }).title, 'Sample Shop');
    });
  });
});
