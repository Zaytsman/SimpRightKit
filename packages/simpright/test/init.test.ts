// simpright init (src/init.ts) on a copy of SimpRightTemplate v0.3.0's files that init reads or changes
// (test/fixtures/template-v0.3.0, exported from the template's tag), with a fetch that serves the same files as the
// template's at the tag. A Windows checkout has them with CRLF line endings, so the tests compare texts with LF.

import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { type Answers, checkAnswers } from '../src/answers.ts';
import { ConfigError, type Config } from '../src/config.ts';
import { init, initReport, type InitResult } from '../src/init.ts';

const TEMPLATE = fileURLToPath(new URL('./fixtures/template-v0.3.0', import.meta.url));
const TAG_URL = 'https://raw.githubusercontent.com/Zaytsman/SimpRightTemplate/refs/tags/v0.3.0/';

const API_EXAMPLES = [
  'tests/api/products/get-products-search.spec.ts',
  'test-scenarios/api/products/get-products-search.yml',
  'src/api/clients/ProductsClient.ts',
  'src/api/services/ProductsService.ts',
  'src/api/dto/product.ts',
  'src/api/dto/common.ts',
];
const UI_EXAMPLES = [
  'tests/ui/products/product-search.spec.ts',
  'test-scenarios/ui/products/product-search.yml',
  'src/ui/pages/HomePage.ts',
  'src/ui/pages/components/ProductGrid.ts',
  'src/ui/fixtures/preconditions/openHomePageTest.ts',
];

/** A copy of the template's files in a new temporary folder. */
function templateCopy() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'simpright-init-'));
  cpSync(TEMPLATE, root, { recursive: true });
  const full = (file: string) => path.join(root, file);
  return {
    root,
    /** The file's text, with LF line endings. */
    read: (file: string) => readFileSync(full(file), 'utf8').replace(/\r\n/g, '\n'),
    exists: (file: string) => existsSync(full(file)),
    write: (file: string, text: string) => writeFileSync(full(file), text),
    config: () => parse(readFileSync(full('simpright.yml'), 'utf8')) as Config,
    dispose: () => rmSync(root, { recursive: true, force: true }),
  };
}

/** A fetch that answers with the template's files at v0.3.0 (else 404), and records the files it was asked for. */
function templateFetch(asked: string[] = []): typeof fetch {
  return (async (url: string | URL | Request) => {
    const file = String(url).startsWith(TAG_URL) ? String(url).slice(TAG_URL.length) : undefined;
    if (file) asked.push(file);
    const local = file === undefined ? undefined : path.join(TEMPLATE, file);
    return local && existsSync(local) ? new Response(readFileSync(local, 'utf8')) : new Response('404: Not Found', { status: 404 });
  }) as typeof fetch;
}

/** The lines of `after` that aren't in `before`, and the other way round. */
function changedLines(before: string, after: string): { added: string[]; removed: string[] } {
  const a = before.split('\n');
  const b = after.split('\n');
  return { added: b.filter((line) => !a.includes(line)), removed: a.filter((line) => !b.includes(line)) };
}

const changesOf = (result: InitResult, action: string) =>
  result.changes
    .filter((change) => change.action === action)
    .map((change) => change.file)
    .sort();

async function run(project: ReturnType<typeof templateCopy>, answers: Answers, asked?: string[]) {
  return init(project.root, checkAnswers(answers), { fetch: templateFetch(asked) });
}

describe('simpright init', () => {
  it('changes nothing with the defaults, and reads nothing from GitHub', async () => {
    const project = templateCopy();
    try {
      const asked: string[] = [];
      const result = await run(project, {}, asked);
      assert.deepEqual(result.changes, []);
      assert.deepEqual(result.problems, []);
      assert.deepEqual(asked, []);
      assert.ok(initReport(result, {}).includes('Nothing to change: the answers keep the template as it is.'));
    } finally {
      project.dispose();
    }
  });

  it("drops the UI layer: its examples, their registrations and its keys, the API's examples kept", async () => {
    const project = templateCopy();
    try {
      const before = project.read('simpright.yml');
      const asked: string[] = [];
      const result = await run(project, { layers: ['api'] }, asked);
      assert.deepEqual(result.problems, []);
      assert.deepEqual(changesOf(result, 'delete'), [...UI_EXAMPLES].sort());
      assert.deepEqual(changesOf(result, 'update'), ['simpright.yml', 'src/fixtures/index.ts', 'src/ui/fixtures/fixtures.ts']);
      assert.deepEqual(changesOf(result, 'create'), ['tests/ui/.gitkeep']);
      // Every file init replaces or removes was compared with the template's.
      assert.deepEqual(asked.sort(), [...UI_EXAMPLES, 'src/fixtures/index.ts', 'src/ui/fixtures/fixtures.ts'].sort());

      for (const file of UI_EXAMPLES) assert.equal(project.exists(file), false, file);
      for (const file of API_EXAMPLES) assert.equal(project.exists(file), true, file);
      assert.equal(project.exists('test-scenarios/ui'), false, 'the emptied scenario folder goes');
      assert.equal(project.exists('src/ui/fixtures/preconditions'), false);
      assert.equal(project.read('tests/ui/.gitkeep'), '');
      assert.match(project.read('src/ui/fixtures/fixtures.ts'), /export type UiFixtures = \{\};/);
      assert.doesNotMatch(project.read('src/fixtures/index.ts'), /^export \{ openHomePageTest \}/m);

      const config = project.config();
      assert.deepEqual(Object.keys(config.ids.layers), ['api']);
      assert.deepEqual(config.ids.areas, ['products']);
      assert.equal(config.paths.uiTests, undefined);
      assert.equal(config.agents?.ui, undefined);
      assert.ok(config.agents?.api);
      assert.equal(config.parts?.inspector, undefined);
      assert.equal(config.commands.inspectUi, undefined);
      const { added, removed } = changedLines(before, project.read('simpright.yml'));
      assert.deepEqual(added, [], 'only removals');
      assert.ok(removed.includes('  # Page inspector (read-only): data-test elements + accessibility tree of {path} (relative to baseUrl).'));
      assert.ok(removed.every((line) => !line.includes('uiTests') || line === '  uiTests: tests/ui'));
    } finally {
      project.dispose();
    }
  });

  it("drops the API layer: its examples, its fixtures' registrations, ids.fileNames and its keys", async () => {
    const project = templateCopy();
    try {
      const result = await run(project, { layers: ['ui'] });
      assert.deepEqual(changesOf(result, 'delete'), [...API_EXAMPLES].sort());
      assert.deepEqual(changesOf(result, 'update'), ['simpright.yml', 'src/api/fixtures/fixtures.ts']);
      assert.deepEqual(changesOf(result, 'create'), ['tests/api/.gitkeep']);
      assert.match(project.read('src/api/fixtures/fixtures.ts'), /export type ApiFixtures = \{\};/);
      assert.match(project.read('src/data/TestConstants.ts'), /searchTerm: 'pliers'/, 'the UI example still reads it');
      const config = project.config();
      assert.deepEqual(Object.keys(config.ids.layers), ['ui']);
      assert.equal(config.ids.fileNames, undefined);
      assert.equal(config.paths.apiTests, undefined);
      assert.equal(config.agents?.api, undefined);
      assert.equal(config.parts?.inspector, true);
    } finally {
      project.dispose();
    }
  });

  it('removes every example without the agents part: skeletons, no areas, no agents facts', async () => {
    const project = templateCopy();
    try {
      const result = await run(project, { examples: 'remove' });
      assert.deepEqual(result.problems, []);
      assert.deepEqual(changesOf(result, 'delete'), [...API_EXAMPLES, ...UI_EXAMPLES].sort());
      assert.deepEqual(changesOf(result, 'update'), [
        'simpright.yml',
        'src/api/fixtures/fixtures.ts',
        'src/data/TestConstants.ts',
        'src/fixtures/index.ts',
        'src/ui/fixtures/fixtures.ts',
      ]);
      assert.deepEqual(changesOf(result, 'create'), ['tests/api/.gitkeep', 'tests/ui/.gitkeep']);
      assert.match(project.read('src/data/TestConstants.ts'), /export const TestConstants = \{\} as const;/);
      assert.equal(project.exists('test-scenarios'), false);
      const config = project.config();
      assert.deepEqual(config.ids.areas, []);
      assert.equal(config.agents, undefined);
      assert.match(project.read('simpright.yml'), /^roles: \[default, guest\]\n\n# The framework's optional parts/m, 'one blank line where the agents were');
    } finally {
      project.dispose();
    }
  });

  it("moves the examples to docs/exemplars/ with the agents part, and points the agents' exemplars there", async () => {
    const project = templateCopy();
    try {
      const result = await run(project, { examples: 'remove', config: { parts: { scenarios: true, inspector: true, agents: true } } });
      assert.deepEqual(changesOf(result, 'delete'), []);
      assert.deepEqual(changesOf(result, 'move'), [...API_EXAMPLES, ...UI_EXAMPLES].sort());
      for (const file of [...API_EXAMPLES, ...UI_EXAMPLES]) {
        assert.equal(project.exists(file), false, file);
        assert.equal(project.exists(`docs/exemplars/${file}`), true, file);
      }
      assert.match(project.read('docs/exemplars/README.md'), /QA agents' style exemplars/);
      assert.match(
        project.read('docs/exemplars/test-scenarios/api/products/get-products-search.yml'),
        /^# yaml-language-server: \$schema=\.\.\/\.\.\/\.\.\/\.\.\/\.\.\/node_modules\/@simpright\/scenarios\/schemas\/scenarios\.schema\.json\n/,
      );
      const config = project.config();
      assert.equal(config.parts?.agents, true);
      assert.deepEqual(config.ids.areas, []);
      assert.equal(config.agents?.api?.exemplars.client, 'docs/exemplars/src/api/clients/ProductsClient.ts');
      assert.equal(config.agents?.api?.exemplars.spec, 'docs/exemplars/tests/api/products/get-products-search.spec.ts');
      assert.equal(config.agents?.ui?.exemplars.preconditionFixture, 'docs/exemplars/src/ui/fixtures/preconditions/openHomePageTest.ts');
      // The exemplars that name a file to edit stay on the project's files.
      assert.equal(config.agents?.api?.exemplars.fixtures, 'src/api/fixtures/fixtures.ts');
      assert.equal(config.agents?.ui?.exemplars.fixturesIndex, 'src/fixtures/index.ts');
      assert.equal(config.agents?.ui?.exemplars.constants, 'src/data/TestConstants.ts');
    } finally {
      project.dispose();
    }
  });

  it('writes the bearer login, its client, the roles and their users', async () => {
    const project = templateCopy();
    try {
      const result = await run(project, {
        app: { baseUrl: 'https://shop.example.com', apiBaseUrl: 'https://api.example.com', testIdAttribute: 'data-testid' },
        login: { preset: 'bearer', path: '/auth/login', body: { email: 'username', password: 'password' }, tokenField: 'access_token', expiresInField: 'expires_in', localStorageKey: 'auth-token' },
        roles: { default: { username: 'USER_EMAIL', password: 'USER_PASSWORD' }, admin: { username: 'ADMIN_EMAIL', password: 'ADMIN_PASSWORD' } },
      });
      assert.deepEqual(result.problems, []);
      assert.deepEqual(changesOf(result, 'create'), ['src/api/clients/AuthClient.ts']);
      const project_ts = project.read('src/config/project.ts');
      assert.match(project_ts, /testIdAttribute: 'data-testid',/);
      assert.match(project_ts, /new AuthClient\(request, config\)\.login\(\{ email: user\.username, password: user\.password \}\)/);
      assert.match(project_ts, /return \{ token: body\.access_token, expiresInSeconds: body\.expires_in \};/);
      assert.match(project_ts, /localStorage: \[\{ name: 'auth-token', value: token \}\]/);
      assert.match(project.read('src/api/clients/AuthClient.ts'), /return this\.post\('\/auth\/login', \{ data: credentials \}\);/);
      assert.match(project.read('src/config/roles.ts'), /export const ROLES = \['default', 'admin'\] as const;[\s\S]*DEFAULT_ROLE: UserRole = 'default';/);
      assert.deepEqual(JSON.parse(project.read('src/envs/TEST.json')), {
        baseUrl: 'https://shop.example.com',
        apiBaseUrl: 'https://api.example.com',
        defaultTimeoutMs: 10000,
        extendedTimeoutMs: 60000,
        testUsers: {
          default: { username: '${USER_EMAIL}', password: '${USER_PASSWORD}' },
          admin: { username: '${ADMIN_EMAIL}', password: '${ADMIN_PASSWORD}' },
        },
      });
      const envExample = project.read('.env.example');
      assert.doesNotMatch(envExample, /The examples log no one in/);
      assert.match(envExample, /# The admin role's user \(testUsers\.admin in src\/envs\/TEST\.json\)\.\nADMIN_EMAIL=\nADMIN_PASSWORD=\n/);
      const config = project.config();
      assert.deepEqual(config.roles, ['default', 'admin', 'guest']);
      assert.deepEqual(config.agents?.liveApi.transient, [], "the Toolshop's re-seed isn't this app's");
      assert.equal(result.needsEnv, true);
      assert.match(initReport(result, {}).join('\n'), /copy \.env\.example to \.env and fill in the users' values/);
    } finally {
      project.dispose();
    }
  });

  it('writes a fixed token lifetime, and a browser state stub without a localStorage key', async () => {
    const project = templateCopy();
    try {
      await run(project, { login: { preset: 'bearer', path: '/login', body: { user: 'username', pass: 'password' }, tokenField: 'token', expiresInSeconds: 300 } });
      const project_ts = project.read('src/config/project.ts');
      assert.match(project_ts, /expiresInSeconds: 300 \};/);
      assert.match(project_ts, /throw new Error\(NO_BROWSER_STATE\);/);
      assert.match(project_ts, /testIdAttribute: 'data-test',/, "the template's attribute stays");
    } finally {
      project.dispose();
    }
  });

  it('moves the folders outside the core, their YAML headers following, and makes new ones', async () => {
    const project = templateCopy();
    try {
      const result = await run(project, { folders: { scenarios: 'qa/scenarios', bugs: 'qa/bugs', contracts: 'docs/contracts' } });
      assert.deepEqual(result.problems, []);
      assert.equal(project.exists('test-scenarios'), false);
      assert.equal(project.exists('bugs'), false);
      assert.match(
        project.read('qa/scenarios/ui/products/product-search.yml'),
        /^# yaml-language-server: \$schema=\.\.\/\.\.\/\.\.\/\.\.\/node_modules\/@simpright\/scenarios\/schemas\/scenarios\.schema\.json\n/,
      );
      assert.ok(project.exists('qa/bugs/README.md'));
      assert.equal(project.read('docs/contracts/.gitkeep'), '');
      // The specs name their scenario files, and the validator checks the names.
      assert.deepEqual(changesOf(result, 'update'), ['simpright.yml', 'tests/api/products/get-products-search.spec.ts', 'tests/ui/products/product-search.spec.ts']);
      assert.match(project.read('tests/api/products/get-products-search.spec.ts'), /^\/\/ Scenarios: qa\/scenarios\/api\/products\/get-products-search\.yml$/m);
      assert.match(project.read('tests/ui/products/product-search.spec.ts'), /^\/\/ Scenarios: qa\/scenarios\/ui\/products\/product-search\.yml$/m);
      const config = project.config();
      assert.equal(config.paths.scenarios, 'qa/scenarios');
      assert.equal(config.paths.bugs, 'qa/bugs');
      assert.equal(config.paths.contracts, 'docs/contracts');
    } finally {
      project.dispose();
    }
  });

  it("removes the template's CI when the CI part turns on, and merges parts, ci, runs and portal", async () => {
    const project = templateCopy();
    try {
      const before = project.read('simpright.yml');
      const result = await run(project, {
        config: {
          parts: { scenarios: true, inspector: true, ci: true, portal: { testCases: true, bugs: true } },
          ci: { node: 24, secrets: ['USER_PASSWORD'], branches: { default: 'main', work: 'develop' } },
          runs: [{ id: 'nightly-ui', label: 'Nightly UI', project: 'ui', schedule: '15 6 * * 1-5', trend: 'ui' }],
          portal: { title: 'Example Shop', healthThreshold: { ui: 1 } },
        },
      });
      assert.deepEqual(result.problems, []);
      assert.deepEqual(changesOf(result, 'delete'), ['.github/dependabot.yml', '.github/workflows/pr-checks.yml', '.github/workflows/tests.yml']);
      const after = project.read('simpright.yml');
      const config = project.config();
      assert.equal(config.parts?.ci, true);
      assert.deepEqual(config.ci, { branches: { default: 'main', work: 'develop' }, node: 24, secrets: ['USER_PASSWORD'] });
      assert.equal(config.runs?.[0]?.id, 'nightly-ui');
      assert.equal(config.portal?.title, 'Example Shop');
      assert.deepEqual(changedLines(before, after).removed, ['  branches: { default: main }', '  secrets: []                               # names of the repository secrets the tests read, never values']);
      assert.match(after, / {2}secrets: \[USER_PASSWORD\] {31}# names of the repository secrets the tests read, never values\n/, 'the comment stays');
    } finally {
      project.dispose();
    }
  });

  it('stops, writing nothing, when a file init would change is no longer the template\'s', async () => {
    const project = templateCopy();
    try {
      project.write('src/ui/pages/HomePage.ts', `${project.read('src/ui/pages/HomePage.ts')}// mine\n`);
      const before = project.read('simpright.yml');
      const result = await run(project, { layers: ['api'] });
      assert.deepEqual(result.problems, ['src/ui/pages/HomePage.ts: changed since SimpRightTemplate v0.3.0']);
      assert.equal(result.written, false);
      assert.equal(project.read('simpright.yml'), before);
      assert.equal(project.exists('tests/ui/products/product-search.spec.ts'), true);
      assert.match(initReport(result, {}).join('\n'), /isn't a fresh copy of the template, so init changes nothing/);
    } finally {
      project.dispose();
    }
  });

  it("takes a workflow whose action pins Dependabot bumped for the template's", async () => {
    const project = templateCopy();
    try {
      const file = '.github/workflows/tests.yml';
      project.write(file, project.read(file).replace(/actions\/checkout@[0-9a-f]{40} # v[\d.]+/, `actions/checkout@${'a'.repeat(40)} # v9.9.9`));
      const result = await run(project, { config: { parts: { scenarios: true, inspector: true, ci: true }, ci: { node: 24, secrets: [] } } });
      assert.deepEqual(result.problems, []);
      assert.equal(project.exists(file), false);
    } finally {
      project.dispose();
    }
  });

  it("says when it can't read the template, and writes nothing", async () => {
    const project = templateCopy();
    try {
      const offline = (async () => {
        throw new Error('getaddrinfo ENOTFOUND raw.githubusercontent.com');
      }) as typeof fetch;
      const result = await init(project.root, { examples: 'remove' }, { fetch: offline });
      assert.deepEqual(result.problems, ["couldn't read SimpRightTemplate v0.3.0 from GitHub: getaddrinfo ENOTFOUND raw.githubusercontent.com"]);
      assert.equal(project.exists('src/ui/pages/HomePage.ts'), true);
    } finally {
      project.dispose();
    }
  });

  it('shows the changes and writes nothing in a dry run, and has nothing left to change after a run', async () => {
    const project = templateCopy();
    try {
      const answers: Answers = { layers: ['api'], examples: 'remove' };
      const dry = await init(project.root, answers, { dryRun: true, fetch: templateFetch() });
      assert.equal(dry.written, false);
      assert.equal(project.exists('src/ui/pages/HomePage.ts'), true);
      const report = initReport(dry, { dryRun: true }).join('\n');
      assert.match(report, /^ {2}delete src\/ui\/pages\/HomePage\.ts \(an example of the ui layer, which goes\)$/m);
      assert.match(report, /^Dry run, nothing written: 2 to create, 5 to update, 0 to move, 11 to delete\.$/m);
      assert.match(report, /^-  areas: \[products\]$/m, 'with the diffs');

      const done = await init(project.root, answers, { fetch: templateFetch() });
      assert.equal(done.written, true);
      assert.deepEqual(done.changes.length, dry.changes.length);
      const again = await init(project.root, answers, { fetch: templateFetch() });
      assert.deepEqual(again.changes, []);
    } finally {
      project.dispose();
    }
  });
});

describe('the answers', () => {
  const problemsOf = (answers: unknown) => {
    try {
      checkAnswers(answers, 'answers.yml');
      return [];
    } catch (error) {
      assert.ok(error instanceof ConfigError, String(error));
      return error.problems;
    }
  };

  it('take an empty file, and every key of the schema', () => {
    assert.deepEqual(problemsOf(null), []);
    assert.deepEqual(
      problemsOf({
        layers: ['api', 'ui'],
        app: { baseUrl: 'https://a.example', apiBaseUrl: 'https://api.a.example/v1', testIdAttribute: 'data-qa' },
        login: { preset: 'none' },
        roles: { default: {}, admin: { username: 'ADMIN_USER', password: 'ADMIN_PASSWORD' } },
        examples: 'keep',
        folders: { scenarios: 'qa/scenarios', wiki: 'docs/wiki' },
        config: { parts: { scenarios: true }, ci: { node: 24, secrets: [] }, runs: [{ id: 'r', label: 'R', project: 'all' }], portal: { title: 'T' } },
      }),
      [],
    );
  });

  it("refuse what the schema doesn't allow", () => {
    assert.ok(problemsOf({ lyers: ['api'] }).some((line) => line.includes('must NOT have additional properties')));
    assert.ok(problemsOf({ login: { preset: 'bearer', path: '/login', body: { email: 'username' } } }).length > 0, 'a bearer login without its token field');
    assert.ok(problemsOf({ login: { preset: 'none', path: '/login' } }).length > 0, 'none takes nothing else');
    assert.ok(problemsOf({ roles: { guest: {} } }).length > 0, 'guest is the logged-out role');
    assert.ok(problemsOf({ roles: { admin: { username: 'ADMIN_USER' } } }).length > 0, 'a user needs both variables');
    assert.ok(problemsOf({ folders: { scenarios: '../elsewhere' } }).length > 0);
    assert.ok(problemsOf({ config: { ci: { node: 24 } } }).length > 0, 'ci is a whole value of its key');
  });

  it('refuse folders the core keeps or that hold each other, and a part that needs a dropped layer', () => {
    assert.deepEqual(problemsOf({ folders: { scenarios: 'src/scenarios' } }), ["answers.yml: folders.scenarios (src/scenarios) can't be or hold src: the core and the tools keep it"]);
    assert.deepEqual(problemsOf({ folders: { scenarios: 'qa', bugs: 'qa/bugs' } }), ['answers.yml: folders.bugs (qa/bugs) is inside folders.scenarios (qa)']);
    assert.deepEqual(problemsOf({ layers: ['api'], config: { parts: { inspector: true } } }), [
      "answers.yml: config.parts.inspector needs the ui layer: the page inspector opens the app's pages",
    ]);
  });
});
