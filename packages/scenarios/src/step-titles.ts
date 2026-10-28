// `simpright-scenarios check-step-titles`: checks that every test's top-level test.step titles are its scenario's steps,
// verbatim and in order, the one spec convention `validate` can't see (step titles are often template parameters, so
// only a run shows them). It reads a Playwright JSON report (default test-results/results.json, which the JSON
// reporter writes; e.g. PLAYWRIGHT_JSON_OUTPUT_NAME=test-results/results.json npx playwright test --reporter=list,json).
//
// A test that failed or was skipped is compared only up to the step it reached. In GitHub Actions each mismatch is
// also a warning annotation on the spec.

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Config } from 'simpright/config';
import { parse } from 'yaml';

interface ReportStep {
  title: string;
}
interface ReportResult {
  status: string;
  steps?: ReportStep[];
}
interface ReportSpec {
  title: string;
  file: string;
  line: number;
  tests: { results: ReportResult[] }[];
}
interface ReportSuite {
  specs?: ReportSpec[];
  suites?: ReportSuite[];
}
interface Report {
  config: { rootDir: string };
  suites: ReportSuite[];
}

export interface StepTitlesResult {
  matched: number;
  /** Per test that doesn't match: its title, spec, status and the differing steps, and the same as a GitHub Actions warning annotation. */
  mismatches: { text: string; annotation: string }[];
}

/** Every scenario's steps, by scenario id. */
function readScenarioSteps(dir: string, steps = new Map<string, string[]>()): Map<string, string[]> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) readScenarioSteps(full, steps);
    else if (entry.name.endsWith('.yml')) {
      const file = parse(readFileSync(full, 'utf8')) as { scenarios?: { id: string; steps: string[] }[] };
      for (const scenario of file.scenarios ?? []) steps.set(scenario.id, scenario.steps);
    }
  }
  return steps;
}

function collectSpecs(suite: ReportSuite, specs: ReportSpec[] = []): ReportSpec[] {
  specs.push(...(suite.specs ?? []));
  for (const child of suite.suites ?? []) collectSpecs(child, specs);
  return specs;
}

/** The differing steps, as "<n>: test ..., scenario ..." lines; empty when the titles match. */
function compare(actual: string[], expected: string[], finished: boolean): string[] {
  const length = finished ? Math.max(actual.length, expected.length) : actual.length;
  const lines: string[] = [];
  for (let i = 0; i < length; i++) {
    if (actual[i] !== expected[i]) lines.push(`${i + 1}: test ${JSON.stringify(actual[i])}, scenario ${JSON.stringify(expected[i])}`);
  }
  return lines;
}

/** A GitHub Actions warning annotation (`%`, CR and LF escaped as the runner expects). */
function annotation(file: string, line: number, title: string, message: string): string {
  const escape = (text: string) => text.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
  return `::warning file=${file},line=${line},title=${escape(title)}::${escape(message)}`;
}

/** Compares the steps of every test in `reportFile` with its scenario's, for the project in `root`. */
export function checkStepTitles(root: string, config: Config, reportFile: string): StepTitlesResult {
  const prefixes = Object.values(config.ids.layers).map((layer) => layer.prefix);
  const id = new RegExp(`^((?:${prefixes.join('|')})-\\d+):`);
  const scenarioSteps = readScenarioSteps(path.join(root, config.paths.scenarios));
  const report = JSON.parse(readFileSync(reportFile, 'utf8')) as Report;
  const specs = report.suites.flatMap((suite) => collectSpecs(suite));
  const result: StepTitlesResult = { matched: 0, mismatches: [] };

  for (const spec of specs) {
    const file = path.relative(root, path.join(report.config.rootDir, spec.file)).split(path.sep).join('/');
    const scenarioId = id.exec(spec.title)?.[1];
    const expected = scenarioId ? scenarioSteps.get(scenarioId) : undefined;
    for (const test of spec.tests) {
      const last = test.results.at(-1);
      if (!last || last.status === 'skipped') continue;
      const problems = expected
        ? compare((last.steps ?? []).map((step) => step.title), expected, last.status === 'passed')
        : [`no scenario with the id in the title "${spec.title}"`];
      if (problems.length === 0) {
        result.matched++;
        continue;
      }
      result.mismatches.push({
        text: `MISMATCH ${spec.title} (${file}:${spec.line}, ${last.status})\n  ${problems.join('\n  ')}`,
        annotation: annotation(file, spec.line, `Step titles: ${scenarioId ?? spec.title}`, problems.join('\n')),
      });
    }
  }
  return result;
}
