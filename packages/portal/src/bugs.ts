// The Bugs page of the portal, from the bug files and the scenarios that name them.
//
// It writes <out dir>/index.html (a copy of pages/bugs.html) and <out dir>/bugs-data.js, which sets
// window.BUG_CATALOG: every bug with its fields, raw YAML and the scenarios whose `bug` names it (with the line of
// their test in the spec), the portal's brand (simpright.yml portal), and where the latest results of each layer's
// regression (the run with that trend in simpright.yml runs) are published. The page reads those results itself (the
// small run-summary.json of each published run, src/run-summaries.ts), so a known-issue test that passes there is
// flagged for a re-check. The data is a script, not JSON, so the page also opens straight from disk. build-pages
// builds it into the site as bugs/.
//
// It reads the files as they are; run `simpright-scenarios validate` first.

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { branchName, commitSha, projectPath, repositoryUrl, type Config } from 'simpright/config';
import { parse } from 'yaml';
import { buildTime, PAGES_DIR, portalBrand } from './site.ts';

const SEVERITY_ORDER = ['critical', 'major', 'minor', 'trivial'];

interface Bug {
  id: string;
  title: string;
  status: 'open' | 'fixed' | 'wont-fix';
  severity: string;
  layer: string;
  area: string;
  affects: string[];
  found: string;
  resolved?: string;
  ref?: string | string[];
  upstream?: string;
  description?: string;
  steps: string[];
  expected: string;
  actual: string;
  evidence?: string;
}

interface Scenario {
  id: string;
  name: string;
  status: 'manual' | 'automated';
  automatedIn?: string;
  knownIssue?: string;
  bug?: string;
}

const toPosix = (file: string) => file.split(path.sep).join('/');

/** Builds the Bugs page of the project in `root` into `outDir`; does nothing when simpright.yml has no paths.bugs. */
export function buildBugs(root: string, config: Config, outDir: string): void {
  const read = (file: string) => readFileSync(path.join(root, file), 'utf8');

  /** Files under `dir` (relative to the project root, with forward slashes) that end with .yml. */
  const ymlFiles = (dir: string): string[] => {
    if (!existsSync(path.join(root, dir))) return [];
    return readdirSync(path.join(root, dir), { recursive: true, encoding: 'utf8' })
      .map((file) => `${dir}/${toPosix(file)}`)
      .filter((file) => file.endsWith('.yml'))
      .sort();
  };

  /** The 1-based line of the test titled '<id>: ...' in a spec, if the spec exists. */
  const specLine = (spec: string | undefined, id: string): number | undefined => {
    if (!spec || !existsSync(path.join(root, spec))) return undefined;
    const lines = read(spec).split('\n');
    const index = lines.findIndex((line) => new RegExp(`['"\`]${id}: `).test(line));
    return index >= 0 ? index + 1 : undefined;
  };

  const bugsDir = config.paths.bugs;
  const bugIds = config.ids.bugs;
  if (!bugsDir || !bugIds) {
    console.log('No paths.bugs in simpright.yml: no Bugs page to build.');
    return;
  }

  // Scenario files are <scenarios>/<layer>/<area>/<name>.yml.
  const linked = new Map<string, Record<string, unknown>[]>();
  for (const file of ymlFiles(config.paths.scenarios)) {
    const [layer = '', area = ''] = file.slice(config.paths.scenarios.length + 1).split('/');
    const scenarios = (parse(read(file)) as { scenarios?: Scenario[] }).scenarios ?? [];
    for (const scenario of scenarios) {
      if (!scenario.bug) continue;
      linked.set(scenario.bug, [
        ...(linked.get(scenario.bug) ?? []),
        {
          id: scenario.id,
          name: scenario.name,
          layer,
          area,
          file,
          status: scenario.status,
          automatedIn: scenario.automatedIn,
          specLine: specLine(scenario.automatedIn, scenario.id),
          knownIssue: scenario.knownIssue,
        },
      ]);
    }
  }

  const bugs = ymlFiles(bugsDir)
    .filter((file) => !file.slice(bugsDir.length + 1).includes('/'))
    .map((file) => {
      const source = read(file).replace(/\r/g, '');
      const bug = parse(source) as Bug;
      return {
        ...bug,
        ref: bug.ref === undefined ? [] : [bug.ref].flat(),
        file,
        // The file without its schema comment line.
        yaml: source.replace(/^#.*\n/, '').trimEnd(),
        scenarios: linked.get(bug.id) ?? [],
      };
    })
    // Open bugs first, then by severity, then by ID.
    .sort((a, b) =>
      Number(a.status !== 'open') - Number(b.status !== 'open') ||
      SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) ||
      a.id.localeCompare(b.id));

  const count = (status: Bug['status']) => bugs.filter((bug) => bug.status === status).length;
  const catalog = {
    title: 'Bugs',
    prefix: bugIds.prefix,
    generatedAt: buildTime(),
    commit: commitSha(root),
    repoUrl: repositoryUrl(root),
    branch: branchName(config),
    // The project's folder in the repository: the page's links to its files start with it.
    projectPath: projectPath(root),
    portal: config.portal ? portalBrand(config.portal) : undefined,
    bugsDir,
    layers: Object.fromEntries(Object.keys(config.ids.layers).map((layer) => [layer, layer.toUpperCase()])),
    // Each layer's regression: the run whose trend it is, published by publish-run as latest/<id>/.
    // Relative to the published page (bugs/index.html); missing ones (a local build) are skipped by the page.
    regressions: (config.runs ?? [])
      .filter((run) => run.trend && run.trend in config.ids.layers)
      .map((run) => ({ layer: run.trend, label: run.label, results: `../latest/${run.id}/run-summary.json`, report: `../latest/${run.id}/` })),
    stats: { total: bugs.length, open: count('open'), fixed: count('fixed'), wontFix: count('wont-fix') },
    bugs,
  };

  mkdirSync(outDir, { recursive: true });
  copyFileSync(path.join(PAGES_DIR, 'bugs.html'), path.join(outDir, 'index.html'));
  writeFileSync(
    path.join(outDir, 'bugs-data.js'),
    `// Generated by @simpright/portal (build-bugs); do not edit.\nwindow.BUG_CATALOG = ${JSON.stringify(catalog, null, 1)};\n`,
  );
  console.log(`Bugs: ${bugs.length} bugs (${catalog.stats.open} open) -> ${toPosix(path.relative(root, outDir))}/`);
}
