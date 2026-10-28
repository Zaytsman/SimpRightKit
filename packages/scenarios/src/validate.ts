// `simpright-scenarios validate`: checks the bug files, the scenario files and their links to the specs. The rest of
// the project's setup (simpright.yml's paths and parts, the test runs, the core) is `simpright doctor`'s.
//
// Checks:
// - simpright.yml's IDs: each layer has its own prefix, the bugs' prefix is none of them, paths.bugs,
//   paths.bugSchema and ids.bugs come together, every ids.fileNames pattern is a regex for a layer;
//   paths.scenarioSchema and paths.bugSchema are this package's schemas (the format the checks below implement);
// - every bug file is <bugs>/<ID>.yml, parses, matches the bug schema, has its keys in the schema's order,
//   an ID with the prefix and digits of ids.bugs, a layer and area from the profile, and a resolved date
//   exactly when its status isn't open;
// - every scenario file lives in <scenarios>/<layer>/<area>/<name>.yml with a layer and area from the profile,
//   a name that matches the layer's ids.fileNames pattern (any kebab-case name when there's none),
//   parses, and matches the scenario schema;
// - keys are in the agreed order (file: suite, tags, scenarios; scenario: id, name, ref, tags, status, automatedIn, role, knownIssue, bug, preconditions, steps);
// - a scenario tagged @smoke is automated and has no knownIssue, and its test's tag option ({ tag: ... }) holds
//   exactly the scenario's tags;
// - status automated has an automatedIn, and status manual has none;
// - IDs are unique across files and are <PREFIX>-<number> with the prefix and digits of the file's layer
//   (numbered across the layer, not per area); the output ends with the next free ID of each layer and of the bugs;
// - a scenario's role is one of the profile's roles;
// - a scenario's knownIssue comes with a bug (and the other way round) that has a bug file and is open;
// - automatedIn is <tests>/<layer>/<area>/<name>.spec.ts (named after the scenario file), exists, and has
//   a `// Scenarios:` comment for this file, a test.describe titled '<tags> - <suite>', a test titled
//   '<ID>: <name>' with the scenario name verbatim, and, for a known issue, the layer's knownIssue annotation
//   with the scenario's bug and text;
// - every test in <tests> starts its title with an ID, and that ID has a scenario whose automatedIn is this spec;
//   every 'Known issue' annotation in a spec belongs to a scenario automated there.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ajv, type ValidateFunction } from 'ajv';
import { CONFIG_FILE as PROFILE_FILE, type Config } from 'simpright/config';
import { parse } from 'yaml';

/** The schemas the checks below implement, shipped with this package (exported as `@simpright/scenarios/schemas/...`). */
export const SCENARIO_SCHEMA_FILE = fileURLToPath(new URL('../schemas/scenarios.schema.json', import.meta.url));
export const BUG_SCHEMA_FILE = fileURLToPath(new URL('../schemas/bug.schema.json', import.meta.url));

const FILE_KEY_ORDER = ['suite', 'tags', 'scenarios'];
const SCENARIO_KEY_ORDER = ['id', 'name', 'ref', 'tags', 'status', 'automatedIn', 'role', 'knownIssue', 'bug', 'preconditions', 'steps'];
const BUG_KEY_ORDER = [
  'id', 'title', 'status', 'severity', 'layer', 'area', 'affects', 'found', 'resolved',
  'ref', 'upstream', 'description', 'steps', 'expected', 'actual', 'evidence',
];

// The title string of a call: '...', "..." or `...`, with escapes allowed.
// test('...'), test.only/skip/fixme/fail('...'); test.describe/test.step/test.use don't match.
const TEST_CALL = /\btest(?:\.(?:only|skip|fixme|fail|slow))?\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g;
const DESCRIBE_CALL = /\btest\.describe(?:\.(?:only|skip|fixme|serial|parallel))?\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g;
// The text of a known-issue line: test.fail(true, '...'), or test.skip(true, '...') for a known issue too slow to run.
const KNOWN_ISSUE_CALL = /\btest\.(?:fail|skip)\(\s*true\s*,\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g;
// A test call with its details object: test('...', { tag: '@smoke' }, ...) or { tag: ['@a', '@b'] }.
const TEST_WITH_DETAILS = /\btest(?:\.(?:only|skip|fixme|fail|slow))?\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1\s*,\s*\{([^{}]*)\}/g;
const TAG_OPTION = /\btag\s*:\s*(\[[^\]]*\]|'[^']*'|"[^"]*")/;
const TITLE_ID = /^([A-Z]+-\d+):/;
const KEBAB_CASE = '^[a-z0-9]+(-[a-z0-9]+)*$';

/** The titles of the calls `pattern` matches in `source`, with escapes resolved. */
function titlesOf(source: string, pattern: RegExp): string[] {
  return [...source.matchAll(pattern)].map((match) => (match[2] ?? '').replace(/\\(.)/g, '$1'));
}

/** Test title → the tags in its tag option, for the tests in `source` that have one. */
function testTagsOf(source: string): Map<string, string[]> {
  const tags = new Map<string, string[]>();
  for (const match of source.matchAll(TEST_WITH_DETAILS)) {
    const option = TAG_OPTION.exec(match[3] ?? '')?.[1];
    if (option) tags.set((match[2] ?? '').replace(/\\(.)/g, '$1'), [...option.matchAll(/['"]([^'"]*)['"]/g)].map((tag) => tag[1] ?? ''));
  }
  return tags;
}

interface Bug {
  id: string;
  status: 'open' | 'fixed' | 'wont-fix';
  layer: string;
  area: string;
  resolved?: string;
}

interface Scenario {
  id: string;
  name: string;
  ref?: string | string[];
  tags?: string[];
  status: 'manual' | 'automated';
  automatedIn?: string;
  role?: string;
  knownIssue?: string;
  bug?: string;
  steps: string[];
}

interface ScenarioFile {
  suite: string;
  tags: string[];
  scenarios: Scenario[];
}

export interface ValidationResult {
  /** What's wrong, as "<where>: <what>" lines; empty when everything checks out. */
  problems: string[];
  /** The summary lines: the scenarios, the bugs and the next free IDs. */
  notes: string[];
}

/** The text with CRLF line endings turned into LF, so a Windows checkout compares equal. */
const normalize = (text: string) => text.replace(/\r\n/g, '\n');

/** Validates the scenarios, bugs and specs of the project in `root`, whose simpright.yml readConfig() has read. */
export function validateScenarios(root: string, profile: Config): ValidationResult {
  const problems: string[] = [];
  const fail = (where: string, message: string) => problems.push(`${where}: ${message}`);
  const exists = (file: string) => existsSync(path.join(root, file));
  const read = (file: string) => readFileSync(path.join(root, file), 'utf8');

  /** Files under `dir` (relative to the project root, with forward slashes) that end with one of `extensions`. */
  const listFiles = (dir: string, extensions: string[]): string[] => {
    if (!exists(dir)) return [];
    return readdirSync(path.join(root, dir), { recursive: true, encoding: 'utf8' })
      .map((file) => `${dir}/${file.replaceAll('\\', '/')}`)
      .filter((file) => extensions.some((ext) => file.endsWith(ext)))
      .sort();
  };

  const validators = new Map<string, ValidateFunction>();
  /** Parses a YAML file and checks it against a JSON schema; records errors and returns undefined on failure. */
  const loadYaml = <T>(file: string, schemaFile: string): T | undefined => {
    let doc: unknown;
    try {
      doc = parse(read(file));
    } catch (error) {
      fail(file, `invalid YAML: ${(error as Error).message}`);
      return undefined;
    }
    let validate = validators.get(schemaFile);
    if (!validate) {
      validate = new Ajv({ allErrors: true }).compile(JSON.parse(readFileSync(schemaFile, 'utf8')));
      validators.set(schemaFile, validate);
    }
    if (validate(doc)) return doc as T;
    for (const error of validate.errors ?? []) {
      // `contains` reports every step that isn't a check; one clear message is enough.
      if (error.schemaPath.includes('/contains/')) continue;
      const message = error.keyword === 'contains' ? "must have at least one step that starts with 'Verify '" : error.message;
      fail(file, `${error.instancePath || '/'} ${message}`);
    }
    return undefined;
  };

  const checkKeyOrder = (where: string, value: object, order: string[]): void => {
    const keys = Object.keys(value).filter((key) => order.includes(key));
    const expected = [...keys].sort((a, b) => order.indexOf(a) - order.indexOf(b));
    if (keys.join() !== expected.join()) {
      fail(where, `keys must be in the order ${expected.join(', ')} (found ${keys.join(', ')})`);
    }
  };

  // --- The profile's IDs and schemas ---

  const { paths, ids, roles } = profile;
  const seenPrefixes = new Map<string, string>();
  for (const [layer, { prefix }] of Object.entries(ids.layers)) {
    const other = seenPrefixes.get(prefix);
    if (other) fail(PROFILE_FILE, `ids.layers: ${layer} and ${other} share the prefix ${prefix}`);
    seenPrefixes.set(prefix, layer);
  }
  if (ids.bugs && Object.values(ids.layers).some(({ prefix }) => prefix === ids.bugs?.prefix)) {
    fail(PROFILE_FILE, `ids.bugs: the prefix ${ids.bugs.prefix} is also a layer's prefix`);
  }
  if (Boolean(paths.bugs) !== Boolean(ids.bugs) || Boolean(paths.bugs) !== Boolean(paths.bugSchema)) {
    fail(PROFILE_FILE, 'paths.bugs, paths.bugSchema and ids.bugs go together: set all three or none');
  }
  for (const [layer, pattern] of Object.entries(ids.fileNames ?? {})) {
    if (!(layer in ids.layers)) fail(PROFILE_FILE, `ids.fileNames.${layer}: ${layer} isn't in ids.layers`);
    try {
      new RegExp(pattern.replaceAll('{area}', 'area'));
    } catch (error) {
      fail(PROFILE_FILE, `ids.fileNames.${layer}: invalid regex (${(error as Error).message})`);
    }
  }
  // The agents and editors read the schemas at these paths; the checks below follow this package's.
  for (const [key, ownFile, name] of [
    ['scenarioSchema', SCENARIO_SCHEMA_FILE, 'scenarios.schema.json'],
    ['bugSchema', BUG_SCHEMA_FILE, 'bug.schema.json'],
  ] as const) {
    const file = paths[key];
    if (!file) continue;
    if (!exists(file)) {
      fail(PROFILE_FILE, `paths.${key}: ${file} doesn't exist`);
    } else if (normalize(read(file)) !== normalize(readFileSync(ownFile, 'utf8'))) {
      fail(PROFILE_FILE, `paths.${key}: ${file} isn't this version's schema: point it at node_modules/@simpright/scenarios/schemas/${name}`);
    }
  }
  if (problems.length > 0) return { problems, notes: [] };

  // --- Bugs ---

  /** Bug ID → its file and status. */
  const bugs = new Map<string, { file: string; status: Bug['status'] }>();
  let highestBugNumber = 0;

  if (paths.bugs && paths.bugSchema && ids.bugs) {
    const bugIdPattern = new RegExp(`^${ids.bugs.prefix}-(\\d{${ids.bugs.digits}})$`);
    const bugIdFormat = `${ids.bugs.prefix}-${'N'.repeat(ids.bugs.digits)}`;
    for (const file of listFiles(paths.bugs, ['.yml', '.yaml'])) {
      const name = path.basename(file).replace(/\.ya?ml$/, '');
      if (file !== `${paths.bugs}/${name}.yml`) {
        fail(file, `must be ${paths.bugs}/<ID>.yml (no subfolders)`);
        continue;
      }
      const bug = loadYaml<Bug>(file, BUG_SCHEMA_FILE);
      if (!bug) continue;
      checkKeyOrder(file, bug, BUG_KEY_ORDER);

      const idNumber = bugIdPattern.exec(bug.id)?.[1];
      if (idNumber === undefined) {
        fail(file, `ID must be ${bugIdFormat} (${PROFILE_FILE} ids.bugs)`);
      } else {
        highestBugNumber = Math.max(highestBugNumber, Number(idNumber));
      }
      if (name !== bug.id) fail(file, `the file must be named after its ID (${bug.id}.yml)`);
      if (bugs.has(bug.id)) {
        fail(file, `duplicate ID (also in ${bugs.get(bug.id)?.file})`);
        continue;
      }
      bugs.set(bug.id, { file, status: bug.status });

      if (!(bug.layer in ids.layers)) fail(file, `layer ${bug.layer} isn't one of ${Object.keys(ids.layers).join(', ')} (${PROFILE_FILE} ids.layers)`);
      if (!ids.areas.includes(bug.area)) fail(file, `area ${bug.area} isn't one of ${ids.areas.join(', ')} (${PROFILE_FILE} ids.areas)`);
      if (bug.status === 'open' && bug.resolved) fail(file, 'status is open, so resolved must be absent');
      if (bug.status !== 'open' && !bug.resolved) fail(file, `status is ${bug.status}, so resolved must give the date`);
    }
  }
  /** Bug ID → the scenarios that name it. */
  const bugScenarios = new Map<string, string[]>();

  /** The annotation text inside a layer's knownIssue snippet ('Known issue {bug}: {text}'), if it has one. */
  const knownIssueTemplate = (layer: string): string | undefined => {
    const snippet = ({ api: profile.api, ui: profile.ui } as Record<string, { knownIssue: string } | undefined>)[layer]?.knownIssue;
    return snippet ? /(['"`])((?:(?!\1).)*\{text\}(?:(?!\1).)*)\1/.exec(snippet)?.[2] : undefined;
  };
  /** Spec → the known-issue annotations its scenarios ask for. */
  const expectedAnnotations = new Map<string, Set<string>>();

  // --- Scenario files ---

  /** Scenario ID → where it's defined and which spec automates it. */
  const scenarios = new Map<string, { file: string; automatedIn?: string }>();
  /** Layer → the highest scenario number used in it. */
  const highestNumber = new Map<string, number>();

  for (const file of listFiles(paths.scenarios, ['.yml', '.yaml'])) {
    // <scenarios>/<layer>/<area>/<name>.yml
    const [layer = '', area = '', fileName = '', ...rest] = file.slice(paths.scenarios.length + 1).split('/');
    const name = fileName.replace(/\.ya?ml$/, '');
    const layerIds = ids.layers[layer];
    if (!fileName || rest.length > 0 || !layerIds || !ids.areas.includes(area)) {
      fail(file, `must be ${paths.scenarios}/<layer>/<area>/<name>.yml with a layer and area from ${PROFILE_FILE} (ids)`);
      continue;
    }
    // {area} in a pattern stands for the area folder name.
    const namePattern = ids.fileNames?.[layer]?.replaceAll('{area}', area);
    if (!new RegExp(namePattern ?? KEBAB_CASE).test(name)) {
      fail(file, namePattern ? `file name must match ${namePattern} (${PROFILE_FILE} ids.fileNames.${layer})` : 'file name must be kebab-case');
    }

    const doc = loadYaml<ScenarioFile>(file, SCENARIO_SCHEMA_FILE);
    if (!doc) continue;
    checkKeyOrder(file, doc, FILE_KEY_ORDER);

    const idPattern = new RegExp(`^${layerIds.prefix}-(\\d{${layerIds.digits}})$`);
    const idFormat = `${layerIds.prefix}-${'N'.repeat(layerIds.digits)}`;
    const specFile = `${paths.tests}/${layer}/${area}/${name}.spec.ts`;
    const describeTitle = `${doc.tags.join(' ')} - ${doc.suite}`;
    /** Specs whose comment and describe are already checked for this file. */
    const checkedSpecs = new Set<string>();

    for (const scenario of doc.scenarios) {
      const where = `${file} ${scenario.id}`;
      checkKeyOrder(where, scenario, SCENARIO_KEY_ORDER);

      const existing = scenarios.get(scenario.id);
      if (existing) {
        fail(where, `duplicate ID (also in ${existing.file})`);
        continue;
      }
      scenarios.set(scenario.id, { file, automatedIn: scenario.automatedIn });

      const idNumber = idPattern.exec(scenario.id)?.[1];
      if (idNumber === undefined) {
        fail(where, `IDs in ${file} must be ${idFormat} (${PROFILE_FILE} ids.layers.${layer})`);
      } else {
        highestNumber.set(layer, Math.max(highestNumber.get(layer) ?? 0, Number(idNumber)));
      }
      if (scenario.role !== undefined && !roles.includes(scenario.role)) {
        fail(where, `role ${scenario.role} isn't one of ${roles.join(', ')} (${PROFILE_FILE} roles)`);
      }
      if (scenario.bug) {
        const bug = bugs.get(scenario.bug);
        if (!paths.bugs) {
          fail(where, `bug needs paths.bugs and ids.bugs in ${PROFILE_FILE}`);
        } else if (!bug) {
          fail(where, `bug ${scenario.bug} has no file ${paths.bugs}/${scenario.bug}.yml`);
        } else if (bug.status !== 'open') {
          fail(where, `${scenario.bug} is ${bug.status}: remove knownIssue and bug from the scenario and the known-issue line from its test`);
        }
        bugScenarios.set(scenario.bug, [...(bugScenarios.get(scenario.bug) ?? []), scenario.id]);
      }

      if (scenario.status === 'automated' && !scenario.automatedIn) {
        fail(where, 'status is automated, so automatedIn must name the spec');
      }
      if (scenario.status === 'manual' && scenario.automatedIn) {
        fail(where, 'automatedIn is set, so status must be automated');
      }
      if (scenario.tags?.includes('@smoke')) {
        if (scenario.status !== 'automated') fail(where, 'a @smoke scenario must be automated');
        if (scenario.knownIssue) fail(where, 'a @smoke scenario must have no knownIssue: drop @smoke while the bug is open');
      }

      if (scenario.automatedIn) {
        if (scenario.automatedIn !== specFile) {
          fail(where, `automatedIn must be ${specFile} (the spec is named after the scenario file)`);
        }
        if (!exists(scenario.automatedIn)) {
          fail(where, `automatedIn ${scenario.automatedIn} doesn't exist`);
          continue;
        }
        const spec = read(scenario.automatedIn);
        const title = `${scenario.id}: ${scenario.name}`;
        const titles = titlesOf(spec, TEST_CALL);
        if (!titles.includes(title)) {
          const found = titles.find((other) => other.startsWith(`${scenario.id}:`));
          fail(where, `${scenario.automatedIn} needs a test titled '${title}'${found ? ` (found '${found}')` : ''}`);
        }
        const expectedTags = [...(scenario.tags ?? [])].sort();
        const testTags = [...(testTagsOf(spec).get(title) ?? [])].sort();
        if (expectedTags.join(' ') !== testTags.join(' ')) {
          fail(
            where,
            expectedTags.length
              ? `${scenario.automatedIn}: the test needs the tag option { tag: ${expectedTags.length === 1 ? `'${expectedTags[0]}'` : `[${expectedTags.map((tag) => `'${tag}'`).join(', ')}]`} } (the scenario's tags)${testTags.length ? `, found ${testTags.join(' ')}` : ''}`
              : `${scenario.automatedIn}: the test has the tags ${testTags.join(' ')}, but the scenario has no tags`
          );
        }
        const template = knownIssueTemplate(layer);
        if (scenario.knownIssue && scenario.bug && template) {
          const annotation = template.replaceAll('{bug}', scenario.bug).replaceAll('{text}', scenario.knownIssue);
          const expected = expectedAnnotations.get(scenario.automatedIn) ?? new Set<string>();
          expectedAnnotations.set(scenario.automatedIn, expected.add(annotation));
          if (!titlesOf(spec, KNOWN_ISSUE_CALL).includes(annotation)) {
            fail(where, `${scenario.automatedIn} needs the known-issue line test.fail(true, '${annotation}') (${PROFILE_FILE} ${layer}.knownIssue)`);
          }
        }
        if (!checkedSpecs.has(scenario.automatedIn)) {
          checkedSpecs.add(scenario.automatedIn);
          if (!spec.includes(`// Scenarios: ${file}`)) {
            fail(where, `${scenario.automatedIn} has no '// Scenarios: ${file}' comment`);
          }
          if (!titlesOf(spec, DESCRIBE_CALL).includes(describeTitle)) {
            fail(where, `${scenario.automatedIn} needs test.describe('${describeTitle}') (the tags and suite of ${file})`);
          }
        }
      }
    }
  }

  // --- Specs ---

  for (const spec of listFiles(paths.tests, ['.spec.ts', '.test.ts'])) {
    const source = read(spec);
    for (const annotation of titlesOf(source, KNOWN_ISSUE_CALL)) {
      if (annotation.includes('Known issue') && !expectedAnnotations.get(spec)?.has(annotation)) {
        fail(spec, `the known-issue line '${annotation}' matches no scenario's knownIssue and bug`);
      }
    }
    for (const title of titlesOf(source, TEST_CALL)) {
      const id = TITLE_ID.exec(title)?.[1];
      if (!id) {
        fail(spec, `test '${title}' doesn't start with a scenario ID`);
        continue;
      }
      const scenario = scenarios.get(id);
      if (!scenario) {
        fail(spec, `${id} has no scenario in ${paths.scenarios}/`);
      } else if (scenario.automatedIn !== spec) {
        fail(spec, `${id}'s scenario (${scenario.file}) has automatedIn ${scenario.automatedIn ?? '(none)'}, not this spec`);
      }
    }
  }

  if (problems.length > 0) return { problems, notes: [] };
  const notes: string[] = [];
  const automated = [...scenarios.values()].filter((scenario) => scenario.automatedIn).length;
  notes.push(`Scenarios OK: ${scenarios.size} scenario(s), ${automated} automated.`);
  const nextIds = Object.entries(ids.layers).map(
    ([layer, { prefix, digits }]) => `${prefix}-${String((highestNumber.get(layer) ?? 0) + 1).padStart(digits, '0')}`
  );
  if (ids.bugs) {
    const open = [...bugs.values()].filter((bug) => bug.status === 'open').length;
    const unlinked = [...bugs.keys()].filter((id) => !bugScenarios.has(id)).length;
    notes.push(`Bugs OK: ${bugs.size} bug(s), ${open} open, ${unlinked} without a scenario.`);
    nextIds.push(`${ids.bugs.prefix}-${String(highestBugNumber + 1).padStart(ids.bugs.digits, '0')}`);
  }
  notes.push(`Next free IDs: ${nextIds.join(', ')}`);
  return { problems, notes };
}
