// `simpright doctor`: checks that a project's setup is consistent. The scenarios and bugs have their own check
// (`simpright-scenarios validate`); this one covers the rest:
// - simpright.yml matches simpright.schema.json (readConfig), and every path it names exists (except
//   paths.coverageSummary, which a test run generates); a portal (parts.portal) needs runs and a portal section, and
//   its Bugs page needs paths.bugs; portal.titleAccent is the end of portal.title;
// - the kit's packages that are installed share one version (one kit release);
// - every run (runs) has exactly one caller of .github/workflows/playwright-run.yml, with the run's id as its
//   family, and the caller matches the run: project, grep, paths, schedule, a manual start (workflow_dispatch),
//   coverage publishing and the runs it keeps; an areaPicker run's area input offers all plus the folders of its
//   project's tests; a run with a trend runs that layer, one run per layer, with a portal.healthThreshold for each;
// - the reusable workflow declares exactly ci.secrets, and its callers pass them by name;
// - every workflow step that uses a local action (./.github/actions/<name>) finds its action.yml, and passes the
//   action's required inputs and no inputs it doesn't declare;
// - every actions/setup-node step, in a workflow or in a local action, sets up ci.node (a local action's step that
//   reads the version from an input: as each workflow step that uses the action passes it), and at least one does;
// - every core file and seam (core) exists, and a core code file imports only core files, the seams and packages
//   (relative imports and the tsconfig.json path aliases are followed; comments are skipped; a document such as
//   the conventions isn't scanned);
// - the core files equal SimpRightTemplate's at the version simpright.yml records (template), read from
//   raw.githubusercontent.com (the template is public: no token); --offline leaves this out.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { CONFIG_FILE, type Config, type Run } from './config.ts';
import {
  ACTIONS_DIR,
  callersOf,
  readActions,
  readWorkflows,
  TEST_WORKFLOW,
  type LocalAction,
  type Workflow,
  type WorkflowJob,
} from './workflows.ts';

/** The template's repository on GitHub; `template` in simpright.yml names one of its tags. */
export const TEMPLATE_REPO = 'Zaytsman/SimpRightTemplate';
/** The kit's packages: one release gives them one version. */
export const KIT_PACKAGES = ['simpright', '@simpright/scenarios', '@simpright/portal'];
/** Runs a family keeps on the portal when its entry has no keep (the schema's default). */
const DEFAULT_KEEP = 10;
const FETCH_TIMEOUT_MS = 30_000;

export interface DoctorOptions {
  /** Leave out the template check, the only one that needs the network. */
  offline?: boolean;
  /** Reads the template's files (tests pass a stub); the global fetch by default. */
  fetch?: typeof fetch;
}

export interface DoctorResult {
  /** What's wrong, as "<where>: <what>" lines; empty when the setup is consistent. */
  problems: string[];
  /** How to fix a kind of problem found, printed after the problems. */
  hints: string[];
  /** One line per check that passed (or was left out). */
  notes: string[];
}

/** Checks the project in `root`, whose simpright.yml readConfig() has read; see the top of this file. */
export async function doctor(root: string, config: Config, options: DoctorOptions = {}): Promise<DoctorResult> {
  const result: DoctorResult = { problems: [], hints: [], notes: [] };
  const fail = (where: string, message: string) => result.problems.push(`${where}: ${message}`);
  const exists = (file: string) => existsSync(path.join(root, file));
  const read = (file: string) => readFileSync(path.join(root, file), 'utf8');

  checkConfig(config, exists, fail);
  // The other checks read the files the config names.
  if (result.problems.length > 0) return result;
  result.notes.push(`Config OK: ${CONFIG_FILE} matches its schema, and every path it names exists.`);

  const kit = checkKitVersions(root, fail);
  if (kit) result.notes.push(kit);

  const before = result.problems.length;
  checkRunsAndWorkflows(root, config, exists, fail);
  if (config.runs && result.problems.length === before) result.notes.push(`Runs OK: ${config.runs.length} run(s), each with its workflow.`);

  const { core } = config;
  if (core) {
    const beforeCore = result.problems.length;
    checkCore(root, core, exists, read, fail);
    if (result.problems.length === beforeCore) {
      result.notes.push(`Core OK: ${core.files.length} file(s), the code importing only each other, ${core.seams?.length ?? 0} seam(s) and packages.`);
    }
  }

  if (config.template && core) {
    if (options.offline) {
      result.notes.push(`Template: not checked (--offline).`);
    } else {
      const outcome = await checkTemplate(config.template, core.files, exists, read, options.fetch ?? fetch);
      result.problems.push(...outcome.problems);
      if (outcome.problems.length > 0) {
        result.hints.push(`Port the change to the template (https://github.com/${TEMPLATE_REPO}), tag a new version there, then set template in ${CONFIG_FILE}.`);
      } else {
        result.notes.push(`Template OK: ${core.files.length} core file(s) match SimpRightTemplate ${config.template}.`);
      }
    }
  }
  return result;
}

type Fail = (where: string, message: string) => void;
type Exists = (file: string) => boolean;
type Read = (file: string) => string;

const sameItems = (a: string[], b: string[]) => [...a].sort().join('\n') === [...b].sort().join('\n');
const listOf = (items: string[]) => items.join(', ') || 'none';

// --- The config ---

function checkConfig(config: Config, exists: Exists, fail: Fail): void {
  const { paths } = config;
  const configPaths: [string, string][] = [
    ...config.project.conventions.map((file, i): [string, string] => [`project.conventions[${i}]`, file]),
    ...Object.entries(paths)
      .filter(([key]) => key !== 'coverageSummary')
      .map(([key, file]): [string, string] => [`paths.${key}`, file]),
    ...Object.entries(config.api?.exemplars ?? {}).map(([key, file]): [string, string] => [`api.exemplars.${key}`, file]),
    ...Object.entries(config.ui?.exemplars ?? {}).map(([key, file]): [string, string] => [`ui.exemplars.${key}`, file]),
  ];
  for (const [key, file] of configPaths) {
    if (!exists(file)) fail(CONFIG_FILE, `${key}: ${file} doesn't exist`);
  }
  if (config.parts?.portal) {
    if (!config.runs) fail(CONFIG_FILE, 'parts.portal needs runs: the portal publishes the reports of the test runs');
    if (!config.portal) fail(CONFIG_FILE, 'parts.portal needs portal: the pages take their title from it');
    if (config.parts.portal.bugs && !paths.bugs) fail(CONFIG_FILE, 'parts.portal.bugs needs paths.bugs');
  }
  const accent = config.portal?.titleAccent;
  if (accent && !config.portal?.title.endsWith(accent)) {
    fail(CONFIG_FILE, `portal.titleAccent must be the end of portal.title (${config.portal?.title})`);
  }
}

// --- The kit's packages ---

/** The versions of the kit's packages installed for the project (resolved from it, as Node would); a note when they agree. */
function checkKitVersions(root: string, fail: Fail): string | undefined {
  const require = createRequire(path.join(root, 'package.json'));
  const installed = KIT_PACKAGES.flatMap((name) => {
    try {
      const file = require.resolve(`${name}/package.json`);
      return [{ name, version: String((JSON.parse(readFileSync(file, 'utf8')) as { version?: unknown }).version) }];
    } catch {
      return [];
    }
  });
  if (installed.length === 0) return undefined;
  const versions = new Set(installed.map(({ version }) => version));
  if (versions.size > 1) {
    fail('package.json', `the kit's packages must share one version (one kit release): ${installed.map(({ name, version }) => `${name} ${version}`).join(', ')}`);
    return undefined;
  }
  return `Kit OK: ${installed.map(({ name }) => name).join(', ')} at ${installed[0]?.version}.`;
}

// --- Runs and workflows ---

/** A workflow expression such as ${{ inputs.grep }}: a value someone picks when they start the run. */
const EXPRESSION = /^\$\{\{[\s\S]*\}\}$/;
/** A step value that is just one of the action's inputs: ${{ inputs.<name> }}. */
const INPUT_VALUE = /^\$\{\{\s*inputs\.([A-Za-z_][\w-]*)\s*\}\}$/;

/** The local action a step uses (`./.github/actions/<name>`, without a trailing slash), or undefined. */
const localActionOf = (uses: string | undefined) => (uses?.startsWith('./') ? uses.replace(/\/+$/, '') : undefined);

function checkRunsAndWorkflows(root: string, config: Config, exists: Exists, fail: Fail): void {
  const { runs, paths } = config;

  /** The folders directly under `dir` (relative to the project root), sorted. */
  const listFolders = (dir: string): string[] => {
    if (!exists(dir)) return [];
    return readdirSync(path.join(root, dir), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  };

  /** Checks a caller of the test workflow (`job` in `workflow`) against its run. */
  const checkCaller = (where: string, run: Run, workflow: Workflow, job: WorkflowJob, defaultKeep: unknown): void => {
    const settings = job.with ?? {};
    const on = workflow.on ?? {};
    // An empty grep or paths means none, as in playwright-run.yml.
    const grep = settings.grep === '' ? undefined : settings.grep;
    const specPaths = settings.paths === '' ? undefined : settings.paths;
    if (settings.project !== run.project) fail(where, `project is ${String(settings.project)}, but the run's project is ${run.project}`);
    if (run.grep !== undefined ? grep !== run.grep : grep !== undefined && !EXPRESSION.test(String(grep))) {
      fail(where, run.grep !== undefined ? `grep must be '${run.grep}', the run's grep` : `grep is '${String(grep)}', but the run has none (only an input may set one)`);
    }
    if (Boolean(settings['publish-latest-coverage']) !== Boolean(run.publishCoverage)) {
      fail(where, `publish-latest-coverage must be ${run.publishCoverage ? 'true (the run publishes its coverage)' : 'left out (the run has no publishCoverage)'}`);
    }
    const crons = (on.schedule ?? []).map((entry) => entry.cron);
    if (!sameItems(crons, run.schedule ? [run.schedule] : [])) {
      fail(where, `schedules ${listOf(crons.map((cron) => `'${cron}'`))}, but the run's schedule is ${run.schedule ? `'${run.schedule}'` : 'none'}`);
    }
    if (!('workflow_dispatch' in on)) fail(where, 'needs on: workflow_dispatch (every run can be started by hand)');

    const inputs = on.workflow_dispatch?.inputs ?? {};
    if (run.areaPicker) {
      const testsDir = run.project === 'all' ? undefined : paths[`${run.project}Tests`];
      const folders = testsDir ? listFolders(testsDir) : [];
      const options = inputs.area?.type === 'choice' ? (inputs.area.options ?? []) : [];
      if (options[0] !== 'all' || !sameItems(options.slice(1), folders)) {
        fail(where, `the area input must be a choice of all, then the folders in ${testsDir ?? 'the tests'}: ${listOf(folders)} (found ${listOf(options)})`);
      }
      if (!String(specPaths ?? '').includes('inputs.area')) fail(where, 'paths must come from the area input');
    } else {
      if (inputs.area) fail(where, 'has an area input, but the run has no areaPicker');
      if (specPaths !== run.paths) {
        fail(where, run.paths ? `paths must be '${run.paths}', the run's paths` : `paths is '${String(specPaths)}', but the run has none`);
      }
    }

    // No keep-runs: the reusable workflow's default; an expression: the default of the input it reads.
    const keepSetting = settings['keep-runs'];
    const keep =
      keepSetting === undefined
        ? defaultKeep
        : typeof keepSetting === 'number'
          ? keepSetting
          : String(keepSetting).includes('inputs.keep-runs')
            ? inputs['keep-runs']?.default
            : undefined;
    if (Number(keep) !== (run.keep ?? DEFAULT_KEEP)) {
      fail(where, `keeps ${String(keep)} runs, but the run's keep is ${run.keep ?? DEFAULT_KEEP}`);
    }

    const secrets = config.ci?.secrets;
    if (secrets && (typeof job.secrets !== 'object' || job.secrets === null || !sameItems(Object.keys(job.secrets), secrets))) {
      fail(where, `must pass the secrets ${listOf(secrets)} by name (ci.secrets; never secrets: inherit)`);
    }
  };

  // A project without runs or ci may have no workflows at all.
  const invalidYaml = (file: string, error: Error) => fail(file, `invalid YAML: ${error.message}`);
  const workflows = runs || config.ci ? readWorkflows(root, invalidYaml) : new Map<string, Workflow>();
  const actions = readActions(root, invalidYaml);
  if (runs) {
    const runsAt = `${CONFIG_FILE} runs`;

    /** Layer → the run that feeds its trend. */
    const trends = new Map<string, string>();
    for (const [i, run] of runs.entries()) {
      if (runs.findIndex((other) => other.id === run.id) !== i) fail(runsAt, `${run.id} is listed twice`);
      if (run.areaPicker && run.project === 'all') fail(runsAt, `${run.id}: an areaPicker run needs project ui or api`);
      if (run.areaPicker && run.paths) fail(runsAt, `${run.id}: an areaPicker run takes its paths from the area input, so it has no paths`);
      if (!run.trend) continue;
      if (run.trend !== run.project) fail(runsAt, `${run.id}: trend ${run.trend} needs project ${run.trend}`);
      const other = trends.get(run.trend);
      if (other) fail(runsAt, `${run.id} and ${other} both feed the ${run.trend} trend: one run per layer`);
      trends.set(run.trend, run.id);
    }
    const thresholds = config.portal?.healthThreshold;
    if (thresholds && !sameItems(Object.keys(thresholds), [...trends.keys()])) {
      fail(CONFIG_FILE, `portal.healthThreshold has ${listOf(Object.keys(thresholds))}, but the runs feed the trends of ${listOf([...trends.keys()])}`);
    }

    const call = workflows.get(TEST_WORKFLOW)?.on?.workflow_call;
    if (!call) {
      fail(CONFIG_FILE, `runs needs ${TEST_WORKFLOW}, a reusable workflow (on: workflow_call)`);
    } else if (config.ci && !sameItems(Object.keys(call.secrets ?? {}), config.ci.secrets)) {
      fail(TEST_WORKFLOW, `declares the secrets ${listOf(Object.keys(call.secrets ?? {}))}, but ci.secrets in ${CONFIG_FILE} lists ${listOf(config.ci.secrets)}`);
    }

    /** Run ID → the workflow that runs it. */
    const callers = new Map<string, string>();
    for (const { file, name, workflow, job, family } of callersOf(workflows)) {
      const where = `${file} (job ${name})`;
      const run = runs.find((entry) => entry.id === family);
      if (!run) {
        fail(where, `publishes the family ${String(family)}, which has no entry in ${CONFIG_FILE} runs`);
      } else if (callers.has(run.id)) {
        fail(where, `runs ${run.id}, which ${callers.get(run.id)} runs too: one workflow per run`);
      } else {
        callers.set(run.id, file);
        checkCaller(where, run, workflow, job, call?.inputs?.['keep-runs']?.default);
      }
    }
    for (const run of runs) {
      if (!callers.has(run.id)) fail(runsAt, `${run.id}: no workflow calls ${TEST_WORKFLOW} with family ${run.id}`);
    }
  }
  checkLocalActionSteps(workflows, actions, exists, fail);
  if (config.ci) checkNodeVersion(config.ci.node, workflows, actions, fail);
}

/** Checks every workflow step that uses a local action: the action exists, and gets its required inputs and no others. */
function checkLocalActionSteps(workflows: Map<string, Workflow>, actions: Map<string, LocalAction>, exists: Exists, fail: Fail): void {
  for (const [file, workflow] of workflows) {
    for (const [name, job] of Object.entries(workflow.jobs ?? {})) {
      for (const step of job.steps ?? []) {
        const ref = localActionOf(step.uses);
        if (!ref) continue;
        const where = `${file} (job ${name})`;
        const local = actions.get(ref);
        if (!local) {
          // An action.yml that isn't valid YAML has its own error.
          if (!['action.yml', 'action.yaml'].some((fileName) => exists(`${ref.slice(2)}/${fileName}`))) {
            fail(where, `uses ${String(step.uses)}, but there's no local action there (${ACTIONS_DIR}/<name>/action.yml)`);
          }
          continue;
        }
        const declared = local.action.inputs ?? {};
        const passed = Object.keys(step.with ?? {});
        const unknown = passed.filter((input) => !Object.hasOwn(declared, input));
        if (unknown.length > 0) fail(where, `passes ${listOf(unknown)} to ${ref}, which has no such input (${local.file})`);
        const missing = Object.entries(declared)
          .filter(([input, spec]) => spec?.required && spec.default === undefined && !passed.includes(input))
          .map(([input]) => input);
        if (missing.length > 0) fail(where, `must pass ${listOf(missing)} to ${ref} (required in ${local.file})`);
      }
    }
  }
}

/**
 * Checks that every actions/setup-node step sets up ci.node: in a workflow by its node-version; in a local action by
 * its node-version or, when that is one of the action's inputs, by what each workflow step that uses the action
 * passes (or the input's default). Some step must set up Node, so the check never passes with nothing to check.
 */
function checkNodeVersion(node: number, workflows: Map<string, Workflow>, actions: Map<string, LocalAction>, fail: Fail): void {
  let setupSteps = 0;
  const check = (where: string, version: unknown) => {
    if (version === undefined || version === null || version === '') {
      fail(where, `sets up Node without a node-version, but ci.node in ${CONFIG_FILE} is ${node}`);
    } else if (String(version) !== String(node)) {
      fail(where, `sets up Node ${String(version)}, but ci.node in ${CONFIG_FILE} is ${node}`);
    }
  };

  /** Local action → the input its setup-node step reads the version from. */
  const versionInputs = new Map<string, string>();
  for (const [ref, { file, action }] of actions) {
    for (const step of action.runs?.steps ?? []) {
      if (!step.uses?.startsWith('actions/setup-node@')) continue;
      setupSteps++;
      const version = step.with?.['node-version'];
      const input = INPUT_VALUE.exec(String(version ?? ''))?.[1];
      if (!input) {
        check(file, version);
        continue;
      }
      const spec = action.inputs?.[input];
      if (!spec) {
        fail(file, `sets up Node from inputs.${input}, which it doesn't declare`);
      } else if (spec.default !== undefined) {
        check(`${file} (the default of its ${input} input)`, spec.default);
      } else if (!spec.required) {
        fail(file, `sets up Node from its ${input} input, which has no default and isn't required`);
      }
      versionInputs.set(ref, input);
    }
  }
  for (const [file, workflow] of workflows) {
    for (const [name, job] of Object.entries(workflow.jobs ?? {})) {
      for (const step of job.steps ?? []) {
        if (step.uses?.startsWith('actions/setup-node@')) {
          setupSteps++;
          check(file, step.with?.['node-version']);
        }
        const ref = localActionOf(step.uses);
        const input = ref ? versionInputs.get(ref) : undefined;
        // Left out, the input's default applies (checked above); a missing required input is checkLocalActionSteps'.
        if (input && step.with?.[input] !== undefined) check(`${file} (job ${name})`, step.with[input]);
      }
    }
  }
  if (setupSteps === 0) fail(CONFIG_FILE, `ci.node is ${node}, but no workflow or local action sets up Node (actions/setup-node)`);
}

// --- The core ---

/** The module of every import: `from '...'` (imports and re-exports), `import '...'`, `import('...')`, `require('...')`. */
const IMPORT = /(?:\bfrom|\bimport(?:\s*\()?|\brequire\s*\()\s*(['"])([^'"\r\n]+)\1/g;
/** What an import's path may leave out, tried in this order. */
const SOURCE_SUFFIXES = ['', '.ts', '.mts', '.tsx', '.js', '.mjs', '/index.ts'];
/** The core files whose imports are checked: code, not documents such as the conventions (their examples show imports). */
const CODE_FILE = /\.(?:[cm]?[jt]s|[jt]sx)$/;

/** `source` without its comments, so a module named in a comment isn't taken for an import (a `//` after `:` is a URL). */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** JSON with comments and trailing commas, as tsconfig.json allows: both are dropped outside strings before parsing. */
export function parseJsonc(text: string): unknown {
  let json = '';
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      const end = /"(?:\\.|[^"\\])*"/y;
      end.lastIndex = i;
      const string = end.exec(text)?.[0] ?? text.slice(i);
      json += string;
      i += string.length - 1;
    } else if (char === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      json += '\n';
    } else if (char === '/' && text[i + 1] === '*') {
      const close = text.indexOf('*/', i + 2);
      i = close < 0 ? text.length : close + 1;
    } else {
      json += char;
    }
  }
  // A string is kept as it is; a comma before a closing bracket goes.
  return JSON.parse(json.replace(/("(?:\\.|[^"\\])*")|,(\s*[}\]])/g, (_match, string?: string, close?: string) => string ?? close ?? ''));
}

function checkCore(root: string, core: NonNullable<Config['core']>, exists: Exists, read: Read, fail: Fail): void {
  const coreFiles = new Set(core.files);
  const seams = new Set(core.seams ?? []);
  for (const file of [...coreFiles, ...seams]) {
    if (!exists(file)) fail(CONFIG_FILE, `core: ${file} doesn't exist`);
  }
  for (const seam of seams) {
    if (coreFiles.has(seam)) fail(CONFIG_FILE, `core: ${seam} is listed as a core file and as a seam`);
  }

  // tsconfig.json's path aliases with their first target: `@fixtures` → `./src/fixtures/index.ts`, `@api/*` → `./src/api/*`.
  const { compilerOptions } = (exists('tsconfig.json') ? parseJsonc(read('tsconfig.json')) : {}) as { compilerOptions?: { paths?: Record<string, string[]> } };
  const aliases = Object.entries(compilerOptions?.paths ?? {}).flatMap(([alias, [target]]): [string, string][] => (target ? [[alias, target]] : []));

  /** The project file `specifier` resolves to from `file`; `undefined` for a package, `null` when no file matches. */
  const resolveImport = (file: string, specifier: string): string | null | undefined => {
    let target: string | undefined;
    if (specifier.startsWith('.')) {
      target = path.posix.join(path.posix.dirname(file), specifier);
    } else {
      const alias = aliases.find(([name]) => (name.endsWith('/*') ? specifier.startsWith(name.slice(0, -1)) : specifier === name));
      if (!alias) return undefined;
      const [name, aliasTarget] = alias;
      target = path.posix.normalize(name.endsWith('/*') ? aliasTarget.slice(0, -1) + specifier.slice(name.length - 1) : aliasTarget);
    }
    return SOURCE_SUFFIXES.map((suffix) => target + suffix).find((candidate) => exists(candidate) && statSync(path.join(root, candidate)).isFile()) ?? null;
  };

  for (const file of coreFiles) {
    if (!exists(file) || !CODE_FILE.test(file)) continue;
    for (const [, , specifier] of withoutComments(read(file)).matchAll(IMPORT)) {
      if (!specifier) continue;
      const target = resolveImport(file, specifier);
      if (target === null) {
        fail(file, `imports ${specifier}, which isn't a file in the repository`);
      } else if (target !== undefined && !coreFiles.has(target) && !seams.has(target)) {
        fail(file, `imports ${specifier} (${target}), which isn't in core in ${CONFIG_FILE}: a core file imports only core files, the seams and packages`);
      }
    }
  }
}

// --- The template ---

/** The text with CRLF line endings turned into LF, so a Windows checkout compares equal. */
const normalize = (text: string) => text.replace(/\r\n/g, '\n');

/** Compares every core file with the template's copy at `version`. */
async function checkTemplate(version: string, files: string[], exists: Exists, read: Read, fetchFile: typeof fetch): Promise<{ problems: string[] }> {
  /** The template's copy of `file` at the recorded version, or undefined when the tag has no such file (404). */
  const fetchTemplateFile = async (file: string): Promise<string | undefined> => {
    const url = `https://raw.githubusercontent.com/${TEMPLATE_REPO}/refs/tags/${version}/${file}`;
    const response = await fetchFile(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (response.status === 404) return undefined;
    if (!response.ok) throw new Error(`${url}: ${response.status} ${response.statusText}`);
    return normalize(await response.text());
  };

  /** What's wrong with `file`, or undefined when both copies match. */
  const compareFile = async (file: string): Promise<string | undefined> => {
    const ours = exists(file) ? normalize(read(file)) : undefined;
    const theirs = await fetchTemplateFile(file);
    if (theirs === undefined) return 'missing in the template';
    if (ours === undefined) return 'missing here';
    return ours === theirs ? undefined : 'differs';
  };

  let results: (string | undefined)[];
  try {
    results = await Promise.all(files.map(compareFile));
  } catch (error) {
    return { problems: [`${CONFIG_FILE} template: couldn't read SimpRightTemplate ${version}: ${error instanceof Error ? error.message : String(error)}`] };
  }
  if (files.length > 0 && results.every((outcome) => outcome === 'missing in the template')) {
    return { problems: [`${CONFIG_FILE} template: SimpRightTemplate has no tag ${version}, or none of the core files`] };
  }
  return { problems: files.flatMap((file, i) => (results[i] ? [`${file}: ${results[i]} (SimpRightTemplate ${version})`] : [])) };
}
