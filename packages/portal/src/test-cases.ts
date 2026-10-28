// The Test Cases pages: one page per scenario layer (UI, API) of the portal.
//
// For each layer in simpright.yml it writes <out dir>/<layer>/index.html (a copy of pages/test-cases.html) and
// <out dir>/<layer>/scenarios-data.js, which sets window.SCENARIO_CATALOG: the folder tree (area -> file -> scenario
// IDs), counts, and every scenario with its steps, raw YAML and the line of its test in the spec, plus the portal's
// brand (simpright.yml portal) and the workflow of the layer's area-picker run (Run on GitHub). The data is a script,
// not JSON, so the page also opens straight from disk. build-pages builds them into the site as test-cases/<layer>/.
//
// It reads the files as they are; run `simpright-scenarios validate` first.

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { branchName, commitSha, projectPath, repositoryUrl, type Config } from 'simpright/config';
import { runWorkflows } from 'simpright/workflows';
import { isMap, isSeq, parse, parseDocument } from 'yaml';
import { buildTime, PAGES_DIR, portalBrand } from './site.ts';

const METHOD_ORDER = ['GET', 'QUERY', 'POST', 'PUT', 'PATCH', 'DELETE'];
const ENDPOINT = /\b(GET|POST|PUT|PATCH|DELETE|QUERY) (\/[^\s,.;:)"']*)/g;

interface ScenarioFile {
  suite: string;
  tags: string[];
  scenarios: {
    id: string;
    name: string;
    ref?: string | string[];
    status: 'manual' | 'automated';
    automatedIn?: string;
    role?: string;
    knownIssue?: string;
    bug?: string;
    preconditions?: string[];
    steps: string[];
  }[];
}

const toPosix = (file: string) => file.split(path.sep).join('/');
const titleCase = (name: string) => name.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

/**
 * An API file's endpoint, such as "GET /products/{productId}/related": the endpoint its steps name
 * whose method and path give the file name (a path parameter {productId} becomes by-product-id).
 * Falls back to the file name when no step names it.
 */
function endpointOf(fileName: string, steps: string[]): string | undefined {
  for (const step of steps) {
    for (const [, method = '', urlPath = ''] of step.matchAll(ENDPOINT)) {
      const kebab = urlPath
        .split('/')
        .filter(Boolean)
        .map((part) => {
          const param = /^\{(\w+)\}$/.exec(part);
          return param?.[1] ? `by-${param[1].replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()}` : part;
        })
        .join('-');
      if (`${method.toLowerCase()}-${kebab}` === fileName) return `${method} ${urlPath}`;
    }
  }
  return undefined;
}

/** Files sort by label; endpoints by path, then method, so an endpoint's methods sit together. */
function sortKey(label: string, endpoint: string | undefined): string {
  if (!endpoint) return label.toLowerCase();
  const [method = '', urlPath = ''] = endpoint.split(' ');
  return `${urlPath} ${METHOD_ORDER.indexOf(method)}`;
}

/** Each scenario's own YAML, as written in the file (the list item, dedented). */
function rawScenarios(source: string): string[] {
  const doc = parseDocument(source);
  const list = doc.get('scenarios');
  if (!isSeq(list)) return [];
  return list.items.map((item) => {
    if (!isMap(item) || !item.range) return '';
    const start = source.lastIndexOf('\n', item.range[0]) + 1;
    const lines = source.slice(start, item.range[1]).replace(/\r/g, '').trimEnd().split('\n');
    const indent = /^\s*/.exec((lines[0] ?? '').replace(/-\s/, ''))?.[0].length ?? 0;
    return lines.map((line, i) => (i === 0 ? line.replace(/^\s*/, '') : line.slice(indent))).join('\n');
  });
}

/** Builds the Test Cases pages of the project in `root` into `outDir`/<layer>/. */
export function buildTestCases(root: string, config: Config, outDir: string): void {
  const read = (file: string) => readFileSync(path.join(root, file), 'utf8');

  /** The 1-based line of the test titled '<id>: ...' in a spec, if the spec exists. */
  const specLine = (spec: string | undefined, id: string): number | undefined => {
    if (!spec || !existsSync(path.join(root, spec))) return undefined;
    const lines = read(spec).split('\n');
    const index = lines.findIndex((line) => new RegExp(`['"\`]${id}: `).test(line));
    return index >= 0 ? index + 1 : undefined;
  };

  const scenariosDir = config.paths.scenarios;
  const generatedAt = buildTime();
  const sha = commitSha(root);
  const repoUrl = repositoryUrl(root);
  const branch = branchName(config);
  const brand = config.portal ? portalBrand(config.portal) : undefined;

  // Run on GitHub opens the workflow of the layer's manual run with an area picker.
  const runFiles = runWorkflows(root);
  const pickerWorkflows: Record<string, string | undefined> = Object.fromEntries(
    (config.runs ?? []).filter((run) => run.areaPicker).map((run) => [run.project, runFiles.get(run.id)])
  );

  for (const layer of Object.keys(config.ids.layers)) {
    const layerDir = path.join(root, scenariosDir, layer);
    const areas = existsSync(layerDir)
      ? readdirSync(layerDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()
      : [];

    const tree: unknown[] = [];
    const scenarios: (Omit<ScenarioFile['scenarios'][number], 'ref'> & Record<string, unknown>)[] = [];
    for (const area of areas) {
      const files = readdirSync(path.join(layerDir, area))
        .filter((f) => f.endsWith('.yml'))
        .map((fileName) => {
          const file = toPosix(path.join(scenariosDir, layer, area, fileName));
          const source = read(file);
          const data = parse(source) as ScenarioFile;
          const name = fileName.replace(/\.yml$/, '');
          const endpoint = layer === 'api' ? endpointOf(name, data.scenarios.flatMap((s) => s.steps)) : undefined;
          const label = layer === 'api' ? (endpoint ?? name) : titleCase(name);
          return { file, source, data, name, label, sortKey: sortKey(label, endpoint) };
        })
        // The page walks the scenarios in this order (arrow keys), so it is also the tree's order.
        .sort((a, b) => (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0));
      const fileNodes = [];
      for (const { file, source, data, name, label } of files) {
        const raws = rawScenarios(source);
        fileNodes.push({ file, name, label, suite: data.suite, tags: data.tags, ids: data.scenarios.map((s) => s.id) });
        data.scenarios.forEach((scenario, i) => {
          scenarios.push({
            ...scenario,
            ref: scenario.ref === undefined ? [] : [scenario.ref].flat(),
            specLine: specLine(scenario.automatedIn, scenario.id),
            area,
            areaLabel: titleCase(area),
            file,
            fileLabel: label,
            suite: data.suite,
            tags: data.tags,
            yaml: raws[i] ?? '',
          });
        });
      }
      tree.push({ area, label: titleCase(area), files: fileNodes });
    }

    const automated = scenarios.filter((s) => s.status === 'automated').length;
    const catalog = {
      layer,
      title: `${layer.toUpperCase()} Test Cases`,
      prefix: config.ids.layers[layer]?.prefix,
      generatedAt,
      commit: sha,
      repoUrl,
      branch,
      // The project's folder in the repository: the pages' links to its files start with it.
      projectPath: projectPath(root),
      portal: brand,
      workflowUrl: pickerWorkflows[layer] ? `${repoUrl}/actions/workflows/${pickerWorkflows[layer]}` : undefined,
      stats: {
        total: scenarios.length,
        automated,
        manual: scenarios.length - automated,
        knownIssues: scenarios.filter((s) => s.knownIssue).length,
        automatedPct: scenarios.length ? Math.round((automated / scenarios.length) * 100) : 0,
      },
      tree,
      scenarios,
    };

    const target = path.join(outDir, layer);
    mkdirSync(target, { recursive: true });
    copyFileSync(path.join(PAGES_DIR, 'test-cases.html'), path.join(target, 'index.html'));
    writeFileSync(
      path.join(target, 'scenarios-data.js'),
      `// Generated by @simpright/portal (build-test-cases); do not edit.\nwindow.SCENARIO_CATALOG = ${JSON.stringify(catalog, null, 1)};\n`,
    );
    console.log(`${catalog.title}: ${scenarios.length} scenarios (${automated} automated) -> ${toPosix(path.relative(root, target))}/`);
  }
}
