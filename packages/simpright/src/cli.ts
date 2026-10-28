#!/usr/bin/env node
// The simpright command. `simpright doctor` checks that a project's setup is consistent (src/doctor.ts lists the
// checks); `init`, `apply` and `upgrade` come later. Exits with 0 when every check passes, 1 when one fails, and 2 on a
// usage error.

import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { ConfigError, projectRoot, readConfig, UsageError } from './config.ts';
import { doctor } from './doctor.ts';

const USAGE = `usage: simpright doctor [--root <dir>] [--offline]
  doctor     check simpright.yml, its paths and parts, the test runs against the workflows, the core boundary
             and the core against SimpRightTemplate
  --root     the project's folder (default: the nearest folder up with simpright.yml)
  --offline  leave out the template check, the only one that needs the network`;

const version = () => (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version;

async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { root: { type: 'string' }, offline: { type: 'boolean' }, help: { type: 'boolean', short: 'h' }, version: { type: 'boolean', short: 'v' } },
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
  if (command !== 'doctor') throw new UsageError(`Unknown command '${command}'.`);
  if (rest.length > 0) throw new UsageError(`Unexpected argument '${rest[0]}'.`);

  const root = projectRoot(values.root);
  const result = await doctor(root, readConfig(root), { offline: values.offline });
  if (result.problems.length > 0) {
    console.error(`simpright doctor found ${result.problems.length} problem(s):`);
    for (const problem of result.problems) console.error(`  - ${problem}`);
    for (const hint of result.hints) console.error(hint);
    return 1;
  }
  for (const note of result.notes) console.log(note);
  return 0;
}

try {
  // An exit code instead of process.exit(): exiting while fetch's connections close trips a libuv assertion on Windows.
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  if (error instanceof ConfigError) {
    console.error(`simpright doctor found ${error.problems.length} problem(s):`);
    for (const problem of error.problems) console.error(`  - ${problem}`);
    process.exitCode = 1;
  } else if (error instanceof UsageError || (error as { code?: string }).code?.startsWith('ERR_PARSE_ARGS')) {
    console.error(`${(error as Error).message}\n${USAGE}`);
    process.exitCode = 2;
  } else {
    throw error;
  }
}
