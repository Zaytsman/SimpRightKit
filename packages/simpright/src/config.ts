// simpright.yml, the project's toolchain config: where a project keeps it, the schema it follows (simpright.schema.json,
// shipped with this package) and the parts of it the kit's tools read. Every command of the kit starts here:
// findRoot() finds the project and readConfig() parses the file and checks it against the schema.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ajv } from 'ajv';
import { parse } from 'yaml';

export const CONFIG_FILE = 'simpright.yml';
/** simpright.yml's schema, shipped with this package (exported as `simpright/simpright.schema.json`). */
export const CONFIG_SCHEMA_FILE = fileURLToPath(new URL('../simpright.schema.json', import.meta.url));

/** A scenario layer's IDs (simpright.yml ids.layers): <prefix>-<number with digits digits>. */
export interface IdFormat {
  prefix: string;
  digits: number;
}

/** A test run (simpright.yml runs): one report family on the portal, run by one caller of the test workflow. */
export interface Run {
  id: string;
  label: string;
  /** The caller's file name in .github/workflows/ (default: <id>.yml). */
  workflow?: string;
  note?: string;
  project: 'ui' | 'api' | 'all';
  schedule?: string;
  grep?: string;
  paths?: string;
  areaPicker?: boolean;
  keep?: number;
  trend?: 'ui' | 'api';
  publishCoverage?: boolean;
}

/** The portal's text and health thresholds (simpright.yml portal). */
export interface Portal {
  title: string;
  titleAccent?: string;
  tagline?: string;
  description?: string;
  healthThreshold?: Partial<Record<'ui' | 'api', number>>;
}

/** A layer's facts for the agents (simpright.yml api, ui): the files to copy the style from and the known-issue line. */
export interface LayerFacts {
  exemplars: Record<string, string>;
  knownIssue: string;
  rules: string[];
}

/** The parts of simpright.yml the kit's tools read; simpright.schema.json describes the whole file. */
export interface Config {
  template?: string;
  project: { language: string; runner: string; conventions: string[] };
  paths: Record<string, string> & {
    scenarios: string;
    scenarioSchema: string;
    tests: string;
    bugs?: string;
    bugSchema?: string;
    apiTests?: string;
    uiTests?: string;
    wiki?: string;
  };
  commands: Record<string, string>;
  ids: {
    layers: Record<string, IdFormat>;
    areas: string[];
    bugs?: IdFormat;
    fileNames?: Record<string, string>;
  };
  roles: string[];
  api?: LayerFacts;
  ui?: LayerFacts;
  parts?: {
    scenarios?: boolean;
    portal?: false | { testCases?: boolean; bugs?: boolean };
    coverage?: false | { package: string; registry?: string };
    wiki?: boolean;
  } & Record<string, unknown>;
  core?: { files: string[]; seams?: string[] };
  ci?: { node: number; secrets: string[]; branches?: { default?: string; work?: string } };
  runs?: Run[];
  portal?: Portal;
}

/** simpright.yml is missing, isn't YAML or doesn't match its schema; `problems` lists what's wrong, one per line. */
export class ConfigError extends Error {
  readonly problems: string[];

  constructor(problems: string[]) {
    super(problems.join('\n'));
    this.name = 'ConfigError';
    this.problems = problems;
  }
}

/** The project's root: the nearest folder, from `start` up, that holds simpright.yml. */
export function findRoot(start: string = process.cwd()): string {
  const from = path.resolve(start);
  for (let dir = from; ; dir = path.dirname(dir)) {
    if (existsSync(path.join(dir, CONFIG_FILE))) return dir;
    if (path.dirname(dir) === dir) throw new ConfigError([`${CONFIG_FILE}: not found in ${from} or any folder above it`]);
  }
}

/** The project root a command works on: `--root` as given (it must hold simpright.yml), else the nearest one up. */
export function projectRoot(rootOption: string | undefined): string {
  if (rootOption === undefined) return findRoot();
  const root = path.resolve(rootOption);
  if (!existsSync(path.join(root, CONFIG_FILE))) throw new ConfigError([`${CONFIG_FILE}: not found in ${root} (--root)`]);
  return root;
}

/** Parses simpright.yml in `root` and checks it against simpright.schema.json; throws a ConfigError when it doesn't match. */
export function readConfig(root: string): Config {
  let config: unknown;
  try {
    config = parse(readFileSync(path.join(root, CONFIG_FILE), 'utf8'));
  } catch (error) {
    throw new ConfigError([`${CONFIG_FILE}: ${(error as NodeJS.ErrnoException).code === 'ENOENT' ? 'not found' : `invalid YAML: ${(error as Error).message}`}`]);
  }
  const validate = new Ajv({ allErrors: true }).compile<Config>(JSON.parse(readFileSync(CONFIG_SCHEMA_FILE, 'utf8')));
  if (validate(config)) return config;
  throw new ConfigError((validate.errors ?? []).map((error) => `${CONFIG_FILE}: ${error.instancePath || '/'} ${error.message}`));
}

/** The repository's web URL: from GitHub Actions, else from the origin remote. */
export function repositoryUrl(root: string): string {
  const server = process.env.GITHUB_SERVER_URL ?? 'https://github.com';
  if (process.env.GITHUB_REPOSITORY) return `${server}/${process.env.GITHUB_REPOSITORY}`;
  try {
    const remote = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const repository = /github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?\/?$/.exec(remote)?.[1];
    if (repository) return `${server}/${repository}`;
  } catch {
    // No git, or no origin remote: the error below says what to set.
  }
  throw new Error("Can't tell the repository's URL: set GITHUB_REPOSITORY (owner/repo) or add a GitHub remote named origin.");
}

/** The branch the pages link to: the one GitHub Actions built, else the project's default branch. */
export function branchName(config: Pick<Config, 'ci'>): string {
  return process.env.GITHUB_REF_NAME ?? config.ci?.branches?.default ?? 'main';
}

/**
 * The project's folder within its repository, with a trailing slash ('' at the repository's root), so links to its
 * files work when it lives in a subfolder: SIMPRIGHT_PROJECT_PATH when it's set, else git's, else ''.
 */
export function projectPath(root: string): string {
  const fromEnv = process.env.SIMPRIGHT_PROJECT_PATH;
  if (fromEnv !== undefined) return fromEnv === '' || fromEnv.endsWith('/') ? fromEnv : `${fromEnv}/`;
  try {
    return execFileSync('git', ['rev-parse', '--show-prefix'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

/** The commit the pages were built from, or '' outside git. */
export function commitSha(root: string): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

/** Command-line errors: the message and the usage line go to stderr, and the command exits with 2. */
export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsageError';
  }
}
