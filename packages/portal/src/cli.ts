#!/usr/bin/env node
// The simpright-portal command: publishes test runs and builds the portal's pages into a site folder (publish-run,
// build-pages), or builds one page on its own. Exits with 0 when it's done, 1 on an error in the project, and 2 on a
// usage error.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs, type ParseArgsOptionsConfig } from 'node:util';
import { ConfigError, projectRoot, readConfig, UsageError } from 'simpright/config';
import { buildBugs } from './bugs.ts';
import { buildPages } from './build-pages.ts';
import { DEFAULT_PORT, preview } from './preview.ts';
import { publishRun } from './publish-run.ts';
import { portalConfig } from './site.ts';
import { buildTestCases } from './test-cases.ts';

const USAGE = `usage: simpright-portal <command> [options] [--root <dir>]
  publish-run --site <dir> --run <id> --number <N> [--keep <N>] [--latest-coverage]
              [--report <dir>] [--results <file>] [--coverage <dir>]
                       publish a run's report (default playwright-report/, test-results/results.json and
                       test-results/api-coverage/) into the site as <id>/run-<N>/, keep the newest runs (default: the
                       run's keep, else 10) and refresh the dashboard
  build-pages --site <dir>
                       build the Test Cases and Bugs pages and the dashboard into the site
  build-test-cases [<out dir>]   the Test Cases pages alone (default test-results/test-cases)
  build-bugs [<out dir>]         the Bugs page alone (default test-results/bugs)
  build-config [<out file>]      the dashboard's portal.json alone (default test-results/portal/portal.json)
  preview [--site <dir> | --sample] [--port <N>]
                       serve a site on http://127.0.0.1:<port>/ (default 4173), or the sample site with this
                       package's pages (no project needed)
  --root               the project's folder (default: the nearest folder up with simpright.yml)`;

const ROOT_OPTION: ParseArgsOptionsConfig = { root: { type: 'string' } };

const version = () => (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version;

/** The command's options and positionals, parsed with its own option list (an unknown option is a usage error). */
function parse(args: string[], options: ParseArgsOptionsConfig, maxPositionals: number) {
  const parsed = parseArgs({ args, options: { ...options, ...ROOT_OPTION }, allowPositionals: true });
  if (parsed.positionals.length > maxPositionals) throw new UsageError(`Unexpected argument '${parsed.positionals[maxPositionals]}'.`);
  const root = projectRoot(parsed.values.root as string | undefined);
  return { values: parsed.values as Record<string, string | boolean | undefined>, positionals: parsed.positionals, root, config: readConfig(root) };
}

/** `preview`: no project needed, and it keeps running until it's stopped. */
async function startPreview(args: string[]): Promise<void> {
  const { values } = parseArgs({ args, options: { site: { type: 'string' }, sample: { type: 'boolean' }, port: { type: 'string' } } });
  if (Boolean(values.site) === Boolean(values.sample)) throw new UsageError('preview needs --site <dir> or --sample.');
  const port = values.port === undefined ? DEFAULT_PORT : Number(values.port);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new UsageError(`--port must be a port number, got '${values.port}'.`);
  const server = await preview({ site: values.site, sample: values.sample, port });
  const address = server.address();
  const url = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : port}/`;
  console.log(`Serving ${values.sample ? 'the sample site' : path.resolve(values.site!)} at ${url} (Ctrl+C to stop)`);
}

function main(argv: string[]): number | Promise<void> {
  const [command, ...args] = argv;
  if (command === 'preview') return startPreview(args);
  if (command === '--version' || command === '-v') {
    console.log(version());
    return 0;
  }
  if (command === undefined || command === 'help' || command === '--help' || command === '-h') {
    console.log(USAGE);
    return command === undefined ? 2 : 0;
  }

  switch (command) {
    case 'publish-run': {
      const { values, root, config } = parse(
        args,
        {
          site: { type: 'string' },
          run: { type: 'string' },
          number: { type: 'string' },
          keep: { type: 'string' },
          'latest-coverage': { type: 'boolean' },
          report: { type: 'string' },
          results: { type: 'string' },
          coverage: { type: 'string' },
        },
        0,
      );
      const { site, run, number } = values as Record<string, string | undefined>;
      if (!site || !run || !number) throw new UsageError('--site, --run and --number are required.');
      publishRun(root, config, {
        site,
        run,
        number,
        keep: values.keep as string | undefined,
        latestCoverage: values['latest-coverage'] as boolean | undefined,
        report: values.report as string | undefined,
        results: values.results as string | undefined,
        coverage: values.coverage as string | undefined,
      });
      return 0;
    }
    case 'build-pages': {
      const { values, root, config } = parse(args, { site: { type: 'string' } }, 0);
      if (!values.site) throw new UsageError('--site is required.');
      buildPages(root, config, values.site as string);
      return 0;
    }
    case 'build-test-cases': {
      const { positionals, root, config } = parse(args, {}, 1);
      buildTestCases(root, config, path.resolve(root, positionals[0] ?? 'test-results/test-cases'));
      return 0;
    }
    case 'build-bugs': {
      const { positionals, root, config } = parse(args, {}, 1);
      buildBugs(root, config, path.resolve(root, positionals[0] ?? 'test-results/bugs'));
      return 0;
    }
    case 'build-config': {
      const { positionals, root, config } = parse(args, {}, 1);
      const outFile = path.resolve(root, positionals[0] ?? 'test-results/portal/portal.json');
      const portal = portalConfig(root, config);
      mkdirSync(path.dirname(outFile), { recursive: true });
      writeFileSync(outFile, `${JSON.stringify(portal, null, 2)}\n`);
      console.log(`Portal: ${portal.runs.length} runs -> ${path.relative(root, outFile).split(path.sep).join('/')}`);
      return 0;
    }
    default:
      throw new UsageError(`Unknown command '${command}'.`);
  }
}

try {
  const result = await main(process.argv.slice(2));
  if (typeof result === 'number') process.exitCode = result;
} catch (error) {
  if ((error as NodeJS.ErrnoException).code === 'EADDRINUSE') {
    console.error(`${(error as Error).message}: another program uses the port; pick another with --port.`);
    process.exitCode = 1;
  } else if (error instanceof ConfigError) {
    console.error(`simpright.yml isn't valid (simpright doctor checks it):`);
    for (const problem of error.problems) console.error(`  - ${problem}`);
    process.exitCode = 1;
  } else if (error instanceof UsageError || (error as { code?: string }).code?.startsWith('ERR_PARSE_ARGS')) {
    console.error(`${(error as Error).message}\n${USAGE}`);
    process.exitCode = 2;
  } else {
    throw error;
  }
}
