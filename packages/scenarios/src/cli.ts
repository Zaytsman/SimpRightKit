#!/usr/bin/env node
// The simpright-scenarios command: `validate` checks the scenarios, bugs and specs (src/validate.ts lists the checks);
// `check-step-titles` checks the step titles of a run against the scenarios (src/step-titles.ts). Exits with 0 when
// everything checks out, 1 when something doesn't, and 2 on a usage error.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { ConfigError, projectRoot, readConfig, UsageError } from 'simpright/config';
import { checkStepTitles } from './step-titles.ts';
import { validateScenarios } from './validate.ts';

const USAGE = `usage: simpright-scenarios validate [--root <dir>]
       simpright-scenarios check-step-titles [<results.json>] [--root <dir>]
  validate           check the bug files, the scenario files and their links to the specs; prints the next free IDs
  check-step-titles  check that every test's steps are its scenario's, verbatim, in a Playwright JSON report
                     (default: test-results/results.json)
  --root             the project's folder (default: the nearest folder up with simpright.yml)`;

const version = () => (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version;

function main(argv: string[]): number {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { root: { type: 'string' }, help: { type: 'boolean', short: 'h' }, version: { type: 'boolean', short: 'v' } },
  });
  if (values.version) {
    console.log(version());
    return 0;
  }
  const [command, ...rest] = positionals;
  if (values.help || command === undefined || command === 'help') {
    console.log(USAGE);
    return values.help || command === 'help' ? 0 : 2;
  }

  if (command === 'validate') {
    if (rest.length > 0) throw new UsageError(`Unexpected argument '${rest[0]}'.`);
    const root = projectRoot(values.root);
    const { problems, notes } = validateScenarios(root, readConfig(root));
    if (problems.length > 0) {
      console.error(`Scenario validation failed with ${problems.length} error(s):`);
      for (const problem of problems) console.error(`  - ${problem}`);
      return 1;
    }
    for (const note of notes) console.log(note);
    return 0;
  }

  if (command === 'check-step-titles') {
    if (rest.length > 1) throw new UsageError(`Unexpected argument '${rest[1]}'.`);
    const root = projectRoot(values.root);
    const reportFile = path.resolve(root, rest[0] ?? 'test-results/results.json');
    const result = checkStepTitles(root, readConfig(root), reportFile);
    for (const { text, annotation } of result.mismatches) {
      console.log(text);
      if (process.env.GITHUB_ACTIONS === 'true') console.log(annotation);
    }
    console.log(`${result.matched} tests with every step title verbatim, ${result.mismatches.length} with a mismatch (${reportFile}).`);
    return result.mismatches.length > 0 ? 1 : 0;
  }

  throw new UsageError(`Unknown command '${command}'.`);
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  if (error instanceof ConfigError) {
    console.error(`Scenario validation failed with ${error.problems.length} error(s):`);
    for (const problem of error.problems) console.error(`  - ${problem}`);
    process.exitCode = 1;
  } else if (error instanceof UsageError || (error as { code?: string }).code?.startsWith('ERR_PARSE_ARGS')) {
    console.error(`${(error as Error).message}\n${USAGE}`);
    process.exitCode = 2;
  } else {
    throw error;
  }
}
