// `simpright init`: sets up a fresh copy of SimpRightTemplate from the answers of /simpright-setup's interview
// (src/answers.ts). As the answers ask, it changes:
// - simpright.yml, edited in place with its comments kept (src/yaml-text.ts): the layers' keys, the areas, the roles,
//   the folders' paths, the agents' facts and exemplars, and the config block's parts, ci, runs and portal;
// - src/envs/TEST.json (the URLs, the roles' users) and .env.example (their variables), src/config/roles.ts, and
//   src/config/project.ts with a login preset: none, or bearer, which also writes src/api/clients/AuthClient.ts;
// - the examples (src/template.ts): a dropped layer's go; with examples: remove, all go, moved to docs/exemplars/ with
//   the agents part, where the agents' exemplars then point; the files that register them become empty skeletons;
// - the folders outside the core: an existing one moves (its YAML files' $schema headers follow, and for the scenarios
//   the specs' `// Scenarios:` comments), a new one is made;
// - the template's own CI, removed when the CI part turns on, so that simpright apply writes the project's.
// It works only in a fresh copy: every file it replaces, moves or removes must still be the template's at the version
// simpright.yml names, read from GitHub. Otherwise it writes nothing and names the files. It runs neither npm nor apply,
// and says what to run next. `--dry-run` shows the changes and writes nothing.

import { type Dirent, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import type { Answers, FolderKey, Layer } from './answers.ts';
import { checkConfig, CONFIG_FILE, ConfigError, readConfig } from './config.ts';
import { unifiedDiff } from './diff.ts';
import { partProblems } from './parts.ts';
import { withLf } from './state.ts';
import {
  authClientFile,
  EXAMPLES,
  EXEMPLARS_DIR,
  EXEMPLARS_README,
  fetchTemplateFile,
  projectFile,
  REGISTRATIONS,
  rolesFile,
  sameAsTemplate,
  SHARED_REGISTRATIONS,
  TEMPLATE_CI,
  TEST_DIRS,
} from './template.ts';
import { YamlText } from './yaml-text.ts';

export interface InitOptions {
  /** Show the changes, write nothing. */
  dryRun?: boolean;
  /** Reads the template's files (tests pass a stub); the global fetch by default. */
  fetch?: typeof fetch;
}

export interface InitChange {
  file: string;
  action: 'create' | 'update' | 'delete' | 'move';
  /** Where a moved file goes. */
  to?: string;
  /** What the change is for. */
  why: string;
  /** The text before against after (unified format); '' for a deletion, or a move that keeps the text. */
  diff: string;
}

export interface InitResult {
  /** The template version simpright.yml names. */
  template: string;
  changes: InitChange[];
  /** Why the project isn't a fresh copy, one line per file; init writes nothing when there are any. */
  problems: string[];
  /** Whether init wrote the changes (not a dry run, and no problems). */
  written: boolean;
  /** Whether the roles now have users whose values .env needs: a test run reads them, even a logged-out test's. */
  needsEnv: boolean;
}

interface Planned extends InitChange {
  /** The text written at `file` (create, update) or at `to` (a move that changes the text; else a rename). */
  text?: string;
  /** Checked against the template before anything is written. */
  fromTemplate: boolean;
}

const ENV_FILE = 'src/envs/TEST.json';
const ENV_EXAMPLE = '.env.example';
const PROJECT_FILE = 'src/config/project.ts';
const ROLES_FILE = 'src/config/roles.ts';
const AUTH_CLIENT = 'src/api/clients/AuthClient.ts';
/** The template's .env.example says the examples need no secret; that goes once the roles have users. */
const NO_SECRETS = ' The examples log no one in, so they need none.';

/** The files below `dir` (relative to `root`, with / separators), sorted; none when it doesn't exist. */
function filesUnder(root: string, dir: string): string[] {
  const base = path.join(root, dir);
  if (!existsSync(base)) return [];
  return (readdirSync(base, { recursive: true, withFileTypes: true }) as Dirent[])
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(root, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'))
    .sort();
}

/** A YAML file's `$schema` header (yaml-language-server) pointed at the same schema from `to`; undefined when it doesn't change. */
function withSchemaFrom(text: string, from: string, to: string): string | undefined {
  if (!/\.ya?ml$/.test(from)) return undefined;
  const next = text.replace(/^(# yaml-language-server: \$schema=)(\S+)/m, (line, prefix: string, ref: string) => {
    if (/^[a-z][a-z0-9+.-]*:/i.test(ref) || ref.startsWith('/')) return line;
    const schema = path.posix.join(path.posix.dirname(from), ref);
    return `${prefix}${path.posix.relative(path.posix.dirname(to), schema)}`;
  });
  return next === text ? undefined : next;
}

/** The lines of the files that aren't the template's at `version`; one line when the template can't be read. */
async function notFresh(version: string, files: string[], read: (file: string) => string | undefined, fetchFile: typeof fetch): Promise<string[]> {
  if (files.length === 0) return [];
  let outcomes: (string | undefined)[];
  try {
    outcomes = await Promise.all(
      files.map(async (file) => {
        const ours = read(file);
        if (ours === undefined) return undefined;
        const theirs = await fetchTemplateFile(version, file, fetchFile);
        if (theirs === undefined) return 'missing';
        return sameAsTemplate(file, ours, theirs) ? undefined : 'changed';
      }),
    );
  } catch (error) {
    return [`couldn't read SimpRightTemplate ${version} from GitHub: ${error instanceof Error ? error.message : String(error)}`];
  }
  if (outcomes.every((outcome) => outcome === 'missing')) {
    return [`SimpRightTemplate has no tag ${version} (${CONFIG_FILE} template), or none of the files init changes`];
  }
  return files.flatMap((file, i) => {
    if (outcomes[i] === 'missing') return [`${file}: not in SimpRightTemplate ${version}`];
    return outcomes[i] === 'changed' ? [`${file}: changed since SimpRightTemplate ${version}`] : [];
  });
}

/** Removes the folders that `files` leave empty, up to (not including) `root`. */
function removeEmptyFolders(root: string, files: string[]): void {
  for (const file of files) {
    let dir = path.dirname(path.join(root, file));
    while (path.relative(root, dir) !== '' && existsSync(dir) && readdirSync(dir).length === 0) {
      rmdirSync(dir);
      dir = path.dirname(dir);
    }
  }
}

/** Plans (and, unless it's a dry run or the copy isn't fresh, makes) the changes the answers ask for in `root`. */
export async function init(root: string, answers: Answers, options: InitOptions = {}): Promise<InitResult> {
  const config = readConfig(root);
  const version = config.template;
  if (!version) {
    throw new ConfigError([`${CONFIG_FILE}: no template, so this isn't a copy of SimpRightTemplate. simpright init sets up a fresh copy only: edit ${CONFIG_FILE} and run simpright apply instead.`]);
  }
  const full = (file: string) => path.join(root, file);
  const read = (file: string) => (existsSync(full(file)) ? withLf(readFileSync(full(file), 'utf8')) : undefined);

  const planned: Planned[] = [];
  /** Files deleted or moved. */
  const handled = new Set<string>();
  /** Writes `file` whole: a new one, or one init replaces (the template's, when `fromTemplate`). */
  const write = (file: string, text: string, why: string, fromTemplate = true) => {
    const before = read(file);
    if (before === text) return;
    const action = before === undefined ? 'create' : 'update';
    planned.push({ file, action, why, text, fromTemplate: fromTemplate && before !== undefined, diff: unifiedDiff(file, before, text) });
  };
  const yaml = new YamlText(read(CONFIG_FILE)!);

  // The layers and the examples.
  const layersNow = Object.keys(config.ids.layers).filter((layer): layer is Layer => layer === 'api' || layer === 'ui');
  const layers = answers.layers ?? layersNow;
  const dropped = layersNow.filter((layer) => !layers.includes(layer));
  const agentsOn = Boolean(answers.config?.parts?.agents ?? config.parts?.agents);
  const removeExamples = answers.examples === 'remove';
  /** Example file → its place in docs/exemplars/. */
  const exemplars = new Map<string, string>();
  for (const layer of layersNow.filter((layer) => dropped.includes(layer) || removeExamples)) {
    const keep = agentsOn && !dropped.includes(layer);
    for (const file of EXAMPLES[layer]) {
      const text = read(file);
      if (text === undefined) continue;
      handled.add(file);
      if (keep) {
        const to = `${EXEMPLARS_DIR}/${file}`;
        const moved = withSchemaFrom(text, file, to);
        exemplars.set(file, to);
        planned.push({ file, action: 'move', to, text: moved, why: "an example, kept as the agents' style exemplar", fromTemplate: true, diff: moved ? unifiedDiff(to, text, moved) : '' });
      } else {
        const why = dropped.includes(layer) ? `an example of the ${layer} layer, which goes` : 'an example';
        planned.push({ file, action: 'delete', why, fromTemplate: true, diff: '' });
      }
    }
    for (const [file, text] of Object.entries(REGISTRATIONS[layer])) write(file, text, `it registered the ${layer} examples`);
  }
  if (removeExamples) {
    for (const [file, text] of Object.entries(SHARED_REGISTRATIONS)) write(file, text, 'it held values the examples read');
    yaml.set(['ids', 'areas'], []);
    if (!agentsOn) yaml.remove(['agents']);
  }
  if (exemplars.size > 0) write(`${EXEMPLARS_DIR}/README.md`, EXEMPLARS_README, 'what docs/exemplars/ is for', false);
  for (const layer of ['api', 'ui'] as const) {
    const keys = (yaml.get(['agents', layer, 'exemplars']) ?? {}) as Record<string, string>;
    for (const [key, file] of Object.entries(keys)) {
      const to = exemplars.get(file);
      if (to) yaml.set(['agents', layer, 'exemplars', key], to);
    }
  }
  for (const layer of dropped) {
    yaml.remove(['ids', 'layers', layer]);
    yaml.remove(['paths', `${layer}Tests`]);
    yaml.remove(['agents', layer]);
    if (layer === 'api') {
      const fileNames = Object.keys((yaml.get(['ids', 'fileNames']) ?? {}) as object);
      yaml.remove(fileNames.every((name) => name === 'api') ? ['ids', 'fileNames'] : ['ids', 'fileNames', 'api']);
    } else {
      yaml.remove(['parts', 'inspector']);
      yaml.remove(['commands', 'inspectUi']);
    }
  }

  // The app, its login and its roles.
  const envBefore = read(ENV_FILE);
  const env = JSON.parse(envBefore ?? '{}') as Record<string, unknown>;
  const app = answers.app ?? {};
  if (app.baseUrl !== undefined || app.apiBaseUrl !== undefined) {
    env.baseUrl = app.baseUrl ?? (layers.includes('ui') ? env.baseUrl : app.apiBaseUrl);
    env.apiBaseUrl = app.apiBaseUrl ?? (layers.includes('api') ? env.apiBaseUrl : app.baseUrl);
    // The template's app misbehaves in its own ways (its hourly re-seed); this one's are still to be learned.
    if (yaml.has(['agents', 'liveApi', 'transient'])) yaml.set(['agents', 'liveApi', 'transient'], []);
  }
  if (answers.login || app.testIdAttribute !== undefined || app.baseUrl !== undefined || app.apiBaseUrl !== undefined) {
    const current = /testIdAttribute: '([^']+)'/.exec(read(PROJECT_FILE) ?? '')?.[1];
    const login = answers.login ?? { preset: 'none' as const };
    write(PROJECT_FILE, projectFile(app.testIdAttribute ?? current ?? 'data-test', login), 'the test-id attribute and the login');
    if (login.preset === 'bearer') write(AUTH_CLIENT, authClientFile(login), 'the login endpoint project.login calls');
  }
  if (answers.roles) {
    const roles = Object.keys(answers.roles);
    yaml.set(['roles'], [...roles, ...(config.roles.includes('guest') ? ['guest'] : [])]);
    write(ROLES_FILE, rolesFile(roles), 'the roles tests act as');
    const users = Object.entries(answers.roles).filter(([, user]) => user.username && user.password) as [string, { username: string; password: string }][];
    env.testUsers = Object.fromEntries(users.map(([role, user]) => [role, { username: `\${${user.username}}`, password: `\${${user.password}}` }]));
    if (users.length > 0) {
      let text = (read(ENV_EXAMPLE) ?? '').replace(NO_SECRETS, '').replace(/\n*$/, '\n');
      for (const [role, user] of users) {
        const missing = [user.username, user.password].filter((name) => !new RegExp(`^${name}=`, 'm').test(text));
        if (missing.length > 0) text += `\n# The ${role} role's user (testUsers.${role} in ${ENV_FILE}).\n${missing.map((name) => `${name}=`).join('\n')}\n`;
      }
      write(ENV_EXAMPLE, text, "the roles' users", false);
    }
  }
  if (envBefore !== undefined && JSON.stringify(env) !== JSON.stringify(JSON.parse(envBefore))) {
    write(ENV_FILE, `${JSON.stringify(env, null, 2)}\n`, 'the URLs and the users', false);
  }

  // The folders outside the core.
  for (const [key, folder] of Object.entries(answers.folders ?? {}) as [FolderKey, string][]) {
    const current = config.paths[key];
    if (current === folder) continue;
    yaml.set(['paths', key], folder);
    const files = current === undefined ? [] : filesUnder(root, current).filter((file) => !handled.has(file));
    if (current === undefined || !existsSync(full(current))) {
      write(`${folder}/.gitkeep`, '', `paths.${key}`, false);
      continue;
    }
    for (const file of files) {
      const to = `${folder}/${file.slice(current.length + 1)}`;
      const text = read(file)!;
      const moved = withSchemaFrom(text, file, to);
      handled.add(file);
      planned.push({ file, action: 'move', to, text: moved, why: `paths.${key} moves to ${folder}`, fromTemplate: false, diff: moved ? unifiedDiff(to, text, moved) : '' });
    }
    if (key === 'scenarios') {
      // Each spec names its scenario file in a `// Scenarios: <path>` comment, which the scenario validator checks.
      const comment = new RegExp(`^(\\s*//\\s*Scenarios:\\s*)${current.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/`, 'gm');
      for (const spec of filesUnder(root, config.paths.tests).filter((file) => file.endsWith('.ts') && !handled.has(file))) {
        const text = read(spec)!;
        const next = text.replace(comment, `$1${folder}/`);
        if (next !== text) write(spec, next, 'its // Scenarios: comment follows paths.scenarios', false);
      }
    }
  }

  // The template's own CI goes when the CI part turns on, and simpright.yml's parts, ci, runs and portal.
  if (answers.config?.parts?.ci && !config.parts?.ci) {
    for (const file of TEMPLATE_CI.filter((file) => read(file) !== undefined)) {
      handled.add(file);
      planned.push({ file, action: 'delete', why: "the template's own CI: simpright apply writes the project's", fromTemplate: true, diff: '' });
    }
  }
  for (const key of ['parts', 'ci', 'runs', 'portal'] as const) {
    if (answers.config?.[key] !== undefined) yaml.merge([key], answers.config[key]);
  }

  // A test folder of the core's playwright.config.ts that the examples leave empty keeps a .gitkeep.
  for (const dir of Object.values(TEST_DIRS)) {
    const files = filesUnder(root, dir);
    if (files.length > 0 && files.every((file) => handled.has(file))) write(`${dir}/.gitkeep`, '', "the core's playwright.config.ts runs this folder", false);
  }

  const configBefore = read(CONFIG_FILE)!;
  const configAfter = yaml.toString();
  if (configAfter !== configBefore) {
    const problems = partProblems(checkConfig(parse(configAfter)));
    if (problems.length > 0) throw new ConfigError(problems);
    planned.push({ file: CONFIG_FILE, action: 'update', why: 'the answers', text: configAfter, fromTemplate: false, diff: unifiedDiff(CONFIG_FILE, configBefore, configAfter) });
  }

  const checked = planned.filter((change) => change.fromTemplate).map((change) => change.file);
  const problems = await notFresh(version, checked, read, options.fetch ?? fetch);
  const written = problems.length === 0 && !options.dryRun;
  if (written) {
    for (const change of planned) {
      if (change.action === 'move') {
        mkdirSync(path.dirname(full(change.to!)), { recursive: true });
        if (change.text === undefined) {
          renameSync(full(change.file), full(change.to!));
        } else {
          writeFileSync(full(change.to!), change.text);
          rmSync(full(change.file));
        }
      } else if (change.action === 'delete') {
        rmSync(full(change.file), { force: true });
      }
    }
    for (const change of planned.filter((change) => change.action === 'create' || change.action === 'update')) {
      mkdirSync(path.dirname(full(change.file)), { recursive: true });
      writeFileSync(full(change.file), change.text!);
    }
    removeEmptyFolders(root, [...handled]);
  }
  const needsEnv = Object.keys((env.testUsers ?? {}) as object).length > 0;
  return { template: version, changes: planned.map(({ text: _text, fromTemplate: _fromTemplate, ...change }) => change), problems, written, needsEnv };
}

/** The lines `simpright init` prints for a result: one per change, the diffs with --dry-run, and the next commands. */
export function initReport(result: InitResult, options: Pick<InitOptions, 'dryRun'>): string[] {
  const out = [`simpright init: a copy of SimpRightTemplate ${result.template}`];
  if (result.problems.length > 0) {
    out.push("It isn't a fresh copy of the template, so init changes nothing:");
    out.push(...result.problems.map((problem) => `  - ${problem}`));
    out.push(`Edit ${CONFIG_FILE} and run simpright apply instead, or restore those files and run init again.`);
    return out;
  }
  if (result.changes.length === 0) {
    out.push('Nothing to change: the answers keep the template as it is.');
  }
  for (const change of result.changes) {
    out.push(`  ${change.action.padEnd(6)} ${change.file}${change.to ? ` -> ${change.to}` : ''} (${change.why})`);
  }
  if (options.dryRun) {
    for (const change of result.changes.filter((change) => change.diff !== '')) out.push('', change.diff.replace(/\n$/, ''));
  }
  const count = (action: InitChange['action']) => result.changes.filter((change) => change.action === action).length;
  out.push('');
  if (options.dryRun) {
    out.push(`Dry run, nothing written: ${count('create')} to create, ${count('update')} to update, ${count('move')} to move, ${count('delete')} to delete.`);
    return out;
  }
  if (result.changes.length > 0) out.push(`Done: ${count('create')} created, ${count('update')} updated, ${count('move')} moved, ${count('delete')} deleted.`);
  out.push('Next:', '  npm install', '  npx simpright apply --dry-run   then, once its changes look right: npx simpright apply', '  npx simpright doctor');
  if (result.needsEnv) out.push(`  copy ${ENV_EXAMPLE} to .env and fill in the users' values (never commit .env): every test run reads them`);
  return out;
}
