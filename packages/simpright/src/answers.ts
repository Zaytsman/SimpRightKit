// The answers of simpright init (--answers <file>): what /simpright-setup's interview decided, in the shape
// init-answers.schema.json (shipped with this package) describes. Every key is optional and a missing one keeps the
// template's choice, so --defaults is an empty answers object. readAnswers() parses a file and checks it: the schema,
// then what a schema can't say (folders that collide, a part that needs a layer the answers drop).

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ajv } from 'ajv';
import { parse } from 'yaml';
import { CONFIG_SCHEMA_FILE, ConfigError, type Config } from './config.ts';

/** The answers' schema, shipped with this package (exported as `simpright/init-answers.schema.json`). */
export const ANSWERS_SCHEMA_FILE = fileURLToPath(new URL('../init-answers.schema.json', import.meta.url));

export type Layer = 'api' | 'ui';

/** The folders outside the core that the answers can move or add (simpright.yml paths.<key>). */
export const FOLDER_KEYS = ['scenarios', 'bugs', 'contracts', 'userStories', 'analysis', 'wiki'] as const;
export type FolderKey = (typeof FOLDER_KEYS)[number];

/** An API login that returns a bearer token. */
export interface BearerLogin {
  preset: 'bearer';
  path: string;
  /** Request body field → the user's value it takes. */
  body: Record<string, 'username' | 'password'>;
  tokenField: string;
  expiresInSeconds?: number;
  expiresInField?: string;
  /** Where a logged-in page keeps the token, for UI tests that start logged in. */
  localStorageKey?: string;
}

export interface Answers {
  layers?: Layer[];
  app?: { baseUrl?: string; apiBaseUrl?: string; testIdAttribute?: string };
  login?: { preset: 'none' } | BearerLogin;
  /** Role → its user's .env variables ({} when its user is made per run); the first role is the default. */
  roles?: Record<string, { username?: string; password?: string }>;
  examples?: 'keep' | 'remove';
  folders?: Partial<Record<FolderKey, string>>;
  config?: Pick<Config, 'parts' | 'ci' | 'runs' | 'portal'>;
}

/** Folders the answers can't use: the core's, the tools', and the exemplars' home. */
const RESERVED = ['src', 'tests', 'scripts', 'node_modules', '.github', '.claude', '.simpright', 'docs/exemplars', 'test-results', 'playwright-report'];

const inside = (folder: string, parent: string) => folder === parent || folder.startsWith(`${parent}/`);

/** Checks `value` against the answers' schema and the rules beyond it; throws a ConfigError with one line per problem. */
export function checkAnswers(value: unknown, source = 'answers'): Answers {
  const answers = value ?? {};
  const ajv = new Ajv({ allErrors: true });
  ajv.addSchema(JSON.parse(readFileSync(CONFIG_SCHEMA_FILE, 'utf8')) as object);
  const validate = ajv.compile<Answers>(JSON.parse(readFileSync(ANSWERS_SCHEMA_FILE, 'utf8')) as object);
  if (!validate(answers)) {
    throw new ConfigError((validate.errors ?? []).map((error) => `${source}: ${error.instancePath || '/'} ${error.message}`));
  }

  const problems: string[] = [];
  const folders = Object.entries(answers.folders ?? {}) as [FolderKey, string][];
  for (const [key, folder] of folders) {
    const reserved = RESERVED.find((name) => inside(folder, name) || inside(name, folder));
    if (reserved) problems.push(`${source}: folders.${key} (${folder}) can't be or hold ${reserved}: the core and the tools keep it`);
    for (const [other, otherFolder] of folders) {
      if (other !== key && inside(folder, otherFolder)) problems.push(`${source}: folders.${key} (${folder}) is inside folders.${other} (${otherFolder})`);
    }
  }
  const layers = answers.layers;
  if (layers && !layers.includes('ui') && answers.config?.parts?.inspector) {
    problems.push(`${source}: config.parts.inspector needs the ui layer: the page inspector opens the app's pages`);
  }
  if (layers && !layers.includes('api') && answers.config?.parts?.coverage) {
    problems.push(`${source}: config.parts.coverage needs the api layer: it measures the API tests against the contracts`);
  }
  if (problems.length > 0) throw new ConfigError(problems);
  return answers;
}

/** Parses and checks an answers file (YAML or JSON). */
export function readAnswers(file: string): Answers {
  let value: unknown;
  try {
    value = parse(readFileSync(file, 'utf8'));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    throw new ConfigError([`${file}: ${code === 'ENOENT' ? 'not found' : `invalid YAML: ${(error as Error).message}`}`]);
  }
  return checkAnswers(value, path.basename(file));
}
