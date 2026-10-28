// simpright doctor on a copy of the sample project, with one file broken per case.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { KIT, sampleProject, type Project } from '../../../test/helpers.ts';
import { ConfigError, readConfig } from '../src/config.ts';
import { doctor, parseJsonc, type DoctorOptions, type DoctorResult } from '../src/doctor.ts';

const SETUP = '.github/actions/setup/action.yml';
const SETUP_NODE = 'uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0';
const CLI = path.join(KIT, 'packages/simpright/dist/cli.js');

/** Runs doctor (offline unless the options say otherwise) on a sample project changed by `change`. */
async function check(change: (project: Project) => void, options: DoctorOptions = { offline: true }): Promise<DoctorResult> {
  const project = sampleProject();
  try {
    change(project);
    return await doctor(project.root, readConfig(project.root), options);
  } finally {
    project.dispose();
  }
}

/** Each expected text is part of one problem; `unexpected` texts are part of none. */
function assertProblems(result: DoctorResult, expected: string[], unexpected: string[] = []) {
  for (const text of expected) assert.ok(result.problems.some((problem) => problem.includes(text)), `expected a problem with: ${text}\ngot:\n${result.problems.join('\n')}`);
  for (const text of unexpected) assert.ok(!result.problems.some((problem) => problem.includes(text)), `unexpected problem with: ${text}`);
}

interface Case {
  name: string;
  change: (project: Project) => void;
  expect: string[];
  unexpected?: string[];
}

const cases: Case[] = [
  // ci.node and the local actions
  {
    name: "a local action's literal Node version",
    change: (p) => p.edit(SETUP, 'node-version: ${{ inputs.node-version }}', 'node-version: 22'),
    expect: [`${SETUP}: sets up Node 22, but ci.node in simpright.yml is 24`],
  },
  {
    name: 'a workflow passes another Node version',
    change: (p) => p.edit('.github/workflows/pr-checks.yml', 'node-version: 24', 'node-version: 22'),
    expect: ['.github/workflows/pr-checks.yml (job verify): sets up Node 22, but ci.node in simpright.yml is 24'],
  },
  {
    name: 'a workflow leaves out a required input',
    change: (p) => p.edit('.github/workflows/pr-checks.yml', '        with:\n          node-version: 24\n', ''),
    expect: [`.github/workflows/pr-checks.yml (job verify): must pass node-version to ./.github/actions/setup (required in ${SETUP})`],
  },
  {
    name: 'nothing sets up Node',
    change: (p) => p.edit(SETUP, SETUP_NODE, 'uses: actions/cache@55cc8345863c7cc4c66a329aec7e433d2d1c52a9 # v6.1.0'),
    expect: ['simpright.yml: ci.node is 24, but no workflow or local action sets up Node (actions/setup-node)'],
  },
  {
    name: 'a step uses a local action that does not exist',
    change: (p) => p.edit('.github/workflows/playwright-run.yml', 'uses: ./.github/actions/publish-run', 'uses: ./.github/actions/publish-rnu'),
    expect: ["playwright-run.yml (job test): uses ./.github/actions/publish-rnu, but there's no local action there"],
  },
  {
    name: 'a step passes an input the action does not declare',
    change: (p) => p.edit('.github/workflows/playwright-run.yml', 'run-id: ${{ inputs.family }}', 'run: ${{ inputs.family }}'),
    expect: [
      'playwright-run.yml (job test): passes run to ./.github/actions/publish-run, which has no such input',
      'playwright-run.yml (job test): must pass run-id to ./.github/actions/publish-run',
    ],
  },
  {
    name: "an action.yml that isn't YAML",
    change: (p) => p.write('.github/actions/squash-pages/action.yml', 'name: [broken\n'),
    expect: ['.github/actions/squash-pages/action.yml: invalid YAML'],
    unexpected: ["there's no local action there"],
  },
  {
    name: "an input's default is another Node version",
    change: (p) => p.edit(SETUP, '    required: true\n', '    default: 22\n'),
    expect: [`${SETUP} (the default of its node-version input): sets up Node 22`],
  },
  {
    name: 'Node from an undeclared input',
    change: (p) => p.edit(SETUP, 'node-version: ${{ inputs.node-version }}', 'node-version: ${{ inputs.node }}'),
    expect: [`${SETUP}: sets up Node from inputs.node, which it doesn't declare`],
  },
  {
    name: 'Node from an optional input without a default',
    change: (p) => p.edit(SETUP, '    required: true\n', '    required: false\n'),
    expect: [`${SETUP}: sets up Node from its node-version input, which has no default and isn't required`],
  },
  {
    name: 'a direct setup-node step with another version',
    change: (p) => p.edit('.github/workflows/squash-pages.yml', '    steps:\n', `    steps:\n      - ${SETUP_NODE}\n        with:\n          node-version: 22\n`),
    expect: ['.github/workflows/squash-pages.yml: sets up Node 22, but ci.node in simpright.yml is 24'],
  },
  // The core
  {
    name: 'a core file imports app code (relative)',
    change: (p) => p.edit('src/core/base.ts', "import { label } from './helpers';", "import { label } from './helpers';\nimport { shopName } from '../app/index';"),
    expect: ["src/core/base.ts: imports ../app/index (src/app/index.ts), which isn't in core in simpright.yml"],
  },
  {
    name: 'a core file imports app code (alias)',
    change: (p) => p.edit('src/core/helpers.ts', '// A core file.', "// A core file.\nimport { shopName } from '@app';"),
    expect: ["src/core/helpers.ts: imports @app (src/app/index.ts), which isn't in core"],
  },
  {
    name: 'a core file imports an app type',
    change: (p) => p.edit('src/core/types.ts', '// A core file,', "import type { homePath } from '../app/pages/homePage';\n// A core file,"),
    expect: ["src/core/types.ts: imports ../app/pages/homePage (src/app/pages/homePage.ts), which isn't in core"],
  },
  {
    name: 'a core file re-exports app code',
    change: (p) => p.edit('src/core/helpers.ts', '// A core file.', "// A core file.\nexport * from '../app/productsClient';"),
    expect: ["src/core/helpers.ts: imports ../app/productsClient (src/app/productsClient.ts), which isn't in core"],
  },
  {
    name: 'a core file imports a file that does not exist',
    change: (p) => p.edit('src/core/base.ts', "from './helpers';", "from './helper';"),
    expect: ["src/core/base.ts: imports ./helper, which isn't a file in the repository"],
  },
  {
    name: 'a listed core file is missing',
    change: (p) => p.edit('simpright.yml', '    - src/core/helpers.ts\n', '    - src/core/helper.ts\n'),
    expect: ["simpright.yml: core: src/core/helper.ts doesn't exist", "src/core/base.ts: imports ./helpers (src/core/helpers.ts), which isn't in core"],
  },
  {
    name: 'a path listed as a core file and a seam',
    change: (p) => p.edit('simpright.yml', '    - src/config/project.ts\n', '    - src/config/project.ts\n    - src/core/types.ts\n'),
    expect: ['simpright.yml: core: src/core/types.ts is listed as a core file and as a seam'],
  },
  // The config
  {
    name: 'a path in simpright.yml that does not exist',
    change: (p) => p.edit('simpright.yml', 'pages: src/app/pages', 'pages: src/app/screens'),
    expect: ["simpright.yml: paths.pages: src/app/screens doesn't exist"],
  },
  {
    name: 'the Bugs page without paths.bugs',
    change: (p) => p.edit('simpright.yml', '  bugs: bugs\n', ''),
    expect: ['simpright.yml: parts.portal.bugs needs paths.bugs'],
  },
  {
    name: "portal.titleAccent isn't the end of the title",
    change: (p) => p.edit('simpright.yml', 'titleAccent: Shop', 'titleAccent: Store'),
    expect: ['simpright.yml: portal.titleAccent must be the end of portal.title (Sample Shop)'],
  },
  {
    name: "the kit's packages at different versions",
    change: (p) => p.write('node_modules/@simpright/portal/package.json', JSON.stringify({ name: '@simpright/portal', version: '0.1.1' })),
    expect: ["package.json: the kit's packages must share one version (one kit release): simpright 0.1.0, @simpright/scenarios 0.1.0, @simpright/portal 0.1.1"],
  },
  // The runs and their workflows
  {
    name: 'a caller publishes a family with no run',
    change: (p) => p.edit('.github/workflows/smoke.yml', 'family: smoke', 'family: smoky'),
    expect: [
      '.github/workflows/smoke.yml (job test): publishes the family smoky, which has no entry in simpright.yml runs',
      'simpright.yml runs: smoke: no workflow calls .github/workflows/playwright-run.yml with family smoke',
    ],
  },
  {
    name: 'two workflows run the same run',
    change: (p) => p.write('.github/workflows/zz-smoke.yml', p.read('.github/workflows/smoke.yml')),
    expect: ['.github/workflows/zz-smoke.yml (job test): runs smoke, which .github/workflows/smoke.yml runs too: one workflow per run'],
  },
  {
    name: "a caller's project differs from the run's",
    change: (p) => p.edit('.github/workflows/ui-regression.yml', 'project: ui', 'project: api'),
    expect: ["ui-regression.yml (job test): project is api, but the run's project is ui"],
  },
  {
    name: "a caller's grep differs from the run's",
    change: (p) => p.edit('.github/workflows/smoke.yml', "grep: '@smoke'", "grep: '@fast'"),
    expect: ["smoke.yml (job test): grep must be '@smoke', the run's grep"],
  },
  {
    name: "a caller's schedule differs from the run's",
    change: (p) => p.edit('.github/workflows/ui-regression.yml', "cron: '15 6 * * 1-5'", "cron: '0 6 * * 1-5'"),
    expect: ["ui-regression.yml (job test): schedules '0 6 * * 1-5', but the run's schedule is '15 6 * * 1-5'"],
  },
  {
    name: "a caller that can't be started by hand",
    change: (p) => p.edit('.github/workflows/api-regression.yml', '  workflow_dispatch:\n', ''),
    expect: ['api-regression.yml (job test): needs on: workflow_dispatch (every run can be started by hand)'],
  },
  {
    name: "a caller that doesn't publish the run's coverage",
    change: (p) => p.edit('.github/workflows/api-regression.yml', '      publish-latest-coverage: true\n', ''),
    expect: ['api-regression.yml (job test): publish-latest-coverage must be true (the run publishes its coverage)'],
  },
  {
    name: "an area picker that doesn't list every folder",
    change: (p) => p.edit('.github/workflows/custom-ui.yml', 'options: [all, cart, products]', 'options: [all, products]'),
    expect: ['custom-ui.yml (job test): the area input must be a choice of all, then the folders in tests/ui: cart, products (found all, products)'],
  },
  {
    name: "a caller keeps another number of runs than the run's keep",
    change: (p) => p.edit('.github/workflows/custom-ui.yml', 'default: 5', 'default: 7'),
    expect: ["custom-ui.yml (job test): keeps 7 runs, but the run's keep is 5"],
  },
  {
    name: "a caller doesn't pass every secret",
    change: (p) => p.edit('.github/workflows/ui-regression.yml', '      SHOP_PASSWORD: ${{ secrets.SHOP_PASSWORD }}\n', ''),
    expect: ['ui-regression.yml (job test): must pass the secrets SHOP_USER, SHOP_PASSWORD by name (ci.secrets; never secrets: inherit)'],
  },
  {
    name: 'the reusable workflow declares other secrets',
    change: (p) => p.edit('.github/workflows/playwright-run.yml', 'SHOP_PASSWORD: { required: true }', 'SHOP_TOKEN: { required: true }'),
    expect: ['.github/workflows/playwright-run.yml: declares the secrets SHOP_USER, SHOP_TOKEN, but ci.secrets in simpright.yml lists SHOP_USER, SHOP_PASSWORD'],
  },
  {
    name: 'two runs feed one trend',
    change: (p) => p.edit('simpright.yml', '    areaPicker: true\n    keep: 5\n', '    areaPicker: true\n    keep: 5\n    trend: ui\n'),
    expect: ['simpright.yml runs: custom-ui and ui-regression both feed the ui trend: one run per layer'],
  },
  {
    name: 'a health threshold missing for a trend',
    change: (p) => p.edit('simpright.yml', 'healthThreshold: { ui: 1, api: 1 }', 'healthThreshold: { ui: 1 }'),
    expect: ['simpright.yml: portal.healthThreshold has ui, but the runs feed the trends of ui, api'],
  },
];

describe('simpright doctor', () => {
  it('passes the sample project', async () => {
    const result = await check(() => {});
    assert.deepEqual(result.problems, []);
    assert.deepEqual(result.notes, [
      'Config OK: simpright.yml matches its schema, and every path it names exists.',
      'Kit OK: simpright, @simpright/scenarios, @simpright/portal at 0.1.0.',
      'Runs OK: 4 run(s), each with its workflow.',
      'Core OK: 4 file(s), the code importing only each other, 1 seam(s) and packages.',
    ]);
  });

  for (const testCase of cases) {
    it(`finds ${testCase.name}`, async () => assertProblems(await check(testCase.change), testCase.expect, testCase.unexpected));
  }

  it('accepts a local action named with a trailing slash', async () => {
    const result = await check((p) => p.edit('.github/workflows/pr-checks.yml', 'uses: ./.github/actions/setup\n', 'uses: ./.github/actions/setup/\n'));
    assert.deepEqual(result.problems, []);
  });

  it("skips imports in comments and doesn't scan the core's documents", async () => {
    const result = await check((p) => {
      p.edit('src/core/base.ts', "import { label } from './helpers';", "import { label } from './helpers';\n// import { shopName } from '../app/index';\n/* import { homePath } from '../app/pages/homePage'; */");
      p.write('docs/conventions.md', "Examples: `import { a } from '../src/app/index'` and `import { b } from './missing'`.\n");
    });
    assert.deepEqual(result.problems, []);
  });

  it('stops after a problem in the config itself', async () => {
    const result = await check((p) => {
      p.edit('simpright.yml', 'pages: src/app/pages', 'pages: src/app/screens');
      p.edit('.github/workflows/smoke.yml', 'family: smoke', 'family: smoky');
    });
    assert.equal(result.problems.length, 1);
    assert.deepEqual(result.notes, []);
  });

  it("reports simpright.yml that doesn't match its schema", () => {
    const project = sampleProject();
    try {
      project.edit('simpright.yml', 'roles: [default, guest]', 'roles: []');
      assert.throws(() => readConfig(project.root), (error) => error instanceof ConfigError && error.problems.includes('simpright.yml: /roles must NOT have fewer than 1 items'));
    } finally {
      project.dispose();
    }
  });
});

describe('simpright doctor: the template check', () => {
  const withTemplate = (p: Project) => p.edit('simpright.yml', 'project:\n  language', 'template: v0.1.0\n\nproject:\n  language');
  /** A fetch that answers from `files` (path → text; missing: 404) and records the URLs it was asked for. */
  const stubFetch = (files: Record<string, string>, urls: string[] = []) =>
    (async (url: string | URL | Request) => {
      urls.push(String(url));
      const file = String(url).replace(/^https:\/\/raw\.githubusercontent\.com\/Zaytsman\/SimpRightTemplate\/refs\/tags\/v0\.1\.0\//, '');
      const text = files[file];
      return text === undefined ? new Response('404: Not Found', { status: 404 }) : new Response(text);
    }) as typeof fetch;
  const sampleCore = () => {
    const core = ['src/core/base.ts', 'src/core/helpers.ts', 'src/core/types.ts', 'docs/conventions.md'];
    return Object.fromEntries(core.map((file) => [file, readFileSync(path.join(KIT, 'examples/sample-project', file), 'utf8').replace(/\r\n/g, '\n')]));
  };

  it("compares the core files with the template's at the recorded tag", async () => {
    const urls: string[] = [];
    const result = await check(withTemplate, { fetch: stubFetch(sampleCore(), urls) });
    assert.deepEqual(result.problems, []);
    assert.ok(result.notes.includes('Template OK: 4 core file(s) match SimpRightTemplate v0.1.0.'));
    assert.ok(urls.includes('https://raw.githubusercontent.com/Zaytsman/SimpRightTemplate/refs/tags/v0.1.0/src/core/base.ts'));
  });

  it('finds a file that differs or is missing on either side', async () => {
    const files = { ...sampleCore(), 'src/core/base.ts': 'changed\n' };
    delete (files as Record<string, string>)['src/core/helpers.ts'];
    const result = await check((p) => {
      withTemplate(p);
      p.remove('src/core/types.ts');
    }, { fetch: stubFetch(files) });
    assertProblems(result, ['src/core/base.ts: differs (SimpRightTemplate v0.1.0)', 'src/core/helpers.ts: missing in the template (SimpRightTemplate v0.1.0)']);
    assert.ok(result.hints.some((hint) => hint.startsWith('Port the change to the template')));
  });

  it('names an unknown tag once', async () => {
    const result = await check(withTemplate, { fetch: stubFetch({}) });
    assert.deepEqual(result.problems, ['simpright.yml template: SimpRightTemplate has no tag v0.1.0, or none of the core files']);
  });

  it("says when it can't read the template", async () => {
    const result = await check(withTemplate, { fetch: (async () => { throw new Error('getaddrinfo ENOTFOUND'); }) as typeof fetch });
    assert.deepEqual(result.problems, ["simpright.yml template: couldn't read SimpRightTemplate v0.1.0: getaddrinfo ENOTFOUND"]);
  });

  it('leaves the check out with --offline', async () => {
    const result = await check(withTemplate, { offline: true, fetch: (async () => assert.fail('no fetch offline')) as typeof fetch });
    assert.ok(result.notes.includes('Template: not checked (--offline).'));
  });
});

describe('parseJsonc', () => {
  it('drops comments and trailing commas, but not inside strings', () => {
    const text = '{\n  // a comment\n  "a": "./src/*", /* another */ "b": ["http://x/y", "a,]"],\n}';
    assert.deepEqual(parseJsonc(text), { a: './src/*', b: ['http://x/y', 'a,]'] });
  });
});

describe('the simpright command', () => {
  const run = (args: string[]) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });

  it('exits with 0, 1 or 2', () => {
    const project = sampleProject();
    try {
      const ok = run(['doctor', '--offline', '--root', project.root]);
      assert.equal(ok.status, 0, ok.stderr);
      assert.match(ok.stdout, /^Config OK/);
      project.edit('simpright.yml', 'pages: src/app/pages', 'pages: src/app/screens');
      const failed = run(['doctor', '--offline', '--root', project.root]);
      assert.equal(failed.status, 1);
      assert.match(failed.stderr, /simpright doctor found 1 problem\(s\):\n {2}- simpright\.yml: paths\.pages/);
      assert.equal(run(['doctr']).status, 2);
      assert.equal(run(['doctor', '--root', path.join(project.root, 'src')]).status, 1);
    } finally {
      project.dispose();
    }
  });
});
