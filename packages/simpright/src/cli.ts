#!/usr/bin/env node
// The simpright command. `simpright doctor` checks that a project's setup is consistent (src/doctor.ts lists the
// checks); `simpright apply` writes the CI part's files from simpright.yml (src/apply.ts); `init` and `upgrade` come
// later. Exits with 0 when it succeeds, 1 when a check fails or apply stops on a conflict, and 2 on a usage error.

import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { apply, report } from './apply.ts';
import { ConfigError, projectRoot, readConfig, UsageError } from './config.ts';
import { doctor } from './doctor.ts';

const USAGE = `usage: simpright doctor [--root <dir>] [--offline]
       simpright apply [--root <dir>] [--dry-run] [--force] [--kit-ref <commit>]
  doctor     check simpright.yml, its paths and parts, the test runs against the workflows, the files apply
             generates, the kit's actions, the core boundary and the core against SimpRightTemplate
  apply      write the CI part's files (the workflows and dependabot.yml) from simpright.yml
  --root     the project's folder (default: the nearest folder up with simpright.yml)
  --offline  doctor: leave out the template check, the only one that needs the network
  --dry-run  apply: show the changes, write nothing
  --force    apply: also overwrite files that apply didn't write or that changed since (read --dry-run's diff first)
  --kit-ref  apply: the kit commit to pin the kit's actions to (default: this release's)`;

/** Each command's own options: one given to the other command is a mistake, not a no-op. */
const OPTIONS_OF: Record<string, string[]> = { doctor: ['offline'], apply: ['dry-run', 'force', 'kit-ref'] };

const version = () => (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version;

/** The command being run, for the error messages. */
let command = 'doctor';

async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      root: { type: 'string' },
      offline: { type: 'boolean' },
      'dry-run': { type: 'boolean' },
      force: { type: 'boolean' },
      'kit-ref': { type: 'string' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
    },
  });
  if (values.version) {
    console.log(version());
    return 0;
  }
  const [name, ...rest] = positionals;
  if (values.help || name === undefined || name === 'help') {
    console.log(USAGE);
    return values.help || name === 'help' ? 0 : 2;
  }
  const own = OPTIONS_OF[name];
  if (!own) throw new UsageError(`Unknown command '${name}'.`);
  command = name;
  if (rest.length > 0) throw new UsageError(`Unexpected argument '${rest[0]}'.`);
  const misplaced = Object.values(OPTIONS_OF)
    .flat()
    .find((option) => !own.includes(option) && values[option as keyof typeof values] !== undefined);
  if (misplaced) throw new UsageError(`--${misplaced} isn't an option of simpright ${command}.`);

  const root = projectRoot(values.root);
  if (command === 'apply') {
    const options = { dryRun: values['dry-run'], force: values.force, kitRef: values['kit-ref'] };
    const result = apply(root, readConfig(root), options);
    for (const line of report(result, options)) console.log(line);
    return options.dryRun || result.written ? 0 : 1;
  }

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
    console.error(`simpright ${command} found ${error.problems.length} problem(s):`);
    for (const problem of error.problems) console.error(`  - ${problem}`);
    process.exitCode = 1;
  } else if (error instanceof UsageError || (error as { code?: string }).code?.startsWith('ERR_PARSE_ARGS')) {
    console.error(`${(error as Error).message}\n${USAGE}`);
    process.exitCode = 2;
  } else {
    throw error;
  }
}
