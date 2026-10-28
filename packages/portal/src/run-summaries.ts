// The small JSON files the portal reads, so the browser never downloads a run's full results.json (an API
// regression's is about 8 MB) or the coverage summary (about 400 KB). publish-run and build-pages
// (src/publish-run.ts, src/build-pages.ts) write them into a site folder (a gh-pages checkout, or any folder):
//   <family>/run-<N>/run-summary.json  one run: its stats, known issues and each scenario test's last status
//                                      (read by the Bugs page); written once per run, from its results.json,
//                                      which publish-run then removes
//   latest/<family>/run-summary.json   a copy of the newest run's
//   <family>-history.json              every kept run of the family, newest first, with its stats, plus the
//                                      newest run's known issues (read by the dashboard)
//   latest/api-coverage/totals.json    the coverage summary's totals, without the per-endpoint detail
//
// The output depends only on the site's files, so two workflows writing the same file write the same bytes.

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** A run's folder in its family's folder: run-<the workflow's run number>. */
export const RUN_FOLDER = /^run-\d+$/;
const SUMMARY = 'run-summary.json';
const TITLE_ID = /^([A-Z]+-\d+):/;

interface Stats {
  startTime?: string;
  duration?: number;
  expected?: number;
  unexpected?: number;
  skipped?: number;
  flaky?: number;
}
interface ReportSpec {
  title: string;
  tests?: { expectedStatus?: string; annotations?: { description?: string }[]; results?: { status: string }[] }[];
}
interface ReportSuite {
  title: string;
  specs?: ReportSpec[];
  suites?: ReportSuite[];
}
interface Report {
  stats?: Stats;
  suites?: ReportSuite[];
}
interface KnownIssue {
  area: string;
  testName: string;
  description: string;
}
interface RunSummary {
  run: string;
  stats: Stats;
  knownIssues: KnownIssue[];
  tests: Record<string, { status: string; expectedStatus?: string }>;
}

const readJson = <T,>(file: string): T => JSON.parse(readFileSync(file, 'utf8')) as T;
const writeJson = (file: string, data: unknown) => writeFileSync(file, `${JSON.stringify(data)}\n`);

// Playwright JSON report: suites (file -> describe blocks) -> specs (one per test title) -> tests (one per project).
// A known issue is an annotation containing "Known issue" (test.fail(true, 'Known issue BUG-003: ...')).
function summarize(run: string, report: Report): RunSummary {
  const knownIssues: KnownIssue[] = [];
  const tests: RunSummary['tests'] = {};
  const walk = (suite: ReportSuite, area: string) => {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        for (const { description = '' } of test.annotations ?? []) {
          if (!description.includes('Known issue')) continue;
          if (!knownIssues.some((issue) => issue.testName === spec.title && issue.description === description)) {
            knownIssues.push({ area, testName: spec.title, description });
          }
        }
      }
      const id = TITLE_ID.exec(spec.title)?.[1];
      const test = spec.tests?.[0];
      if (id && test) tests[id] = { status: test.results?.at(-1)?.status ?? 'skipped', expectedStatus: test.expectedStatus };
    }
    for (const child of suite.suites ?? []) walk(child, area);
  };
  for (const suite of report.suites ?? []) walk(suite, suite.title);
  return { run, stats: report.stats ?? {}, knownIssues, tests };
}

// The run's summary, built from its results.json the first time; undefined when the run has no results.
function runSummary(site: string, family: string, run: string): RunSummary | undefined {
  const dir = path.join(site, family, run);
  const summaryFile = path.join(dir, SUMMARY);
  if (existsSync(summaryFile)) return readJson<RunSummary>(summaryFile);
  const resultsFile = path.join(dir, 'results.json');
  if (!existsSync(resultsFile)) return undefined;
  const summary = summarize(run, readJson<Report>(resultsFile));
  writeJson(summaryFile, summary);
  return summary;
}

/** The family's run summaries, the newest one's copy in latest/<family>/ and <family>-history.json, for the runs in <family>-manifest.json. */
export function buildFamily(site: string, family: string) {
  const runs = readJson<string[]>(path.join(site, `${family}-manifest.json`)).filter((run) => RUN_FOLDER.test(run));
  const summaries = runs.map((run) => ({ run, summary: runSummary(site, family, run) }));

  const newest = summaries[0]?.summary;
  const latestDir = path.join(site, 'latest', family);
  if (newest && existsSync(latestDir)) writeJson(path.join(latestDir, SUMMARY), newest);

  writeJson(path.join(site, `${family}-history.json`), {
    runs: summaries.map(({ run, summary }) => ({ run, stats: summary?.stats ?? null })),
    knownIssues: newest?.knownIssues ?? [],
  });
  console.log(`${family}: ${runs.length} runs in ${family}-history.json`);
}

/** The report families that have a manifest but no history yet. */
export function familiesWithoutHistory(site: string): string[] {
  return readdirSync(site)
    .filter((name) => name.endsWith('-manifest.json'))
    .map((name) => name.slice(0, -'-manifest.json'.length))
    .filter((family) => !existsSync(path.join(site, `${family}-history.json`)));
}

/** latest/api-coverage/totals.json: only the scalar totals (overallCoveragePct, coveredEndpoints, ...); the per-endpoint detail stays in summary.json. */
export function buildCoverageTotals(site: string) {
  const summaryFile = path.join(site, 'latest/api-coverage/summary.json');
  if (!existsSync(summaryFile)) return;
  const summary = readJson<Record<string, unknown>>(summaryFile);
  const totals = Object.fromEntries(Object.entries(summary).filter(([, value]) => typeof value !== 'object'));
  writeJson(path.join(site, 'latest/api-coverage/totals.json'), totals);
}
