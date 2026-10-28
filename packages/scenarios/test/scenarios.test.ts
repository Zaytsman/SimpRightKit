// simpright-scenarios validate and check-step-titles on a copy of the sample project, with one file broken per case.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, it } from 'node:test';
import { readConfig } from 'simpright/config';
import { KIT, sampleProject, type Project } from '../../../test/helpers.ts';
import { checkStepTitles } from '../src/step-titles.ts';
import { validateScenarios, type ValidationResult } from '../src/validate.ts';

const CLI = path.join(KIT, 'packages/scenarios/dist/cli.js');
const API_FILE = 'test-scenarios/api/products/get-products.yml';
const BY_ID_FILE = 'test-scenarios/api/products/get-products-by-product-id.yml';
const SEARCH_FILE = 'test-scenarios/ui/products/product-search.yml';
const CART_FILE = 'test-scenarios/ui/cart/add-to-cart.yml';
const CART_SPEC = 'tests/ui/cart/add-to-cart.spec.ts';

function check(change: (project: Project) => void): ValidationResult {
  const project = sampleProject();
  try {
    change(project);
    return validateScenarios(project.root, readConfig(project.root));
  } finally {
    project.dispose();
  }
}

/** A scenario file with one manual scenario. */
const scenarioFile = (suite: string, tag: string, id: string) =>
  `suite: ${suite}\ntags: ["${tag}"]\nscenarios:\n  - id: ${id}\n    name: Something\n    status: manual\n    steps:\n      - Verify something.\n`;
/** A bug file. */
const bugFile = (id: string, extra = '') =>
  `id: ${id}\ntitle: Something\nstatus: open\nseverity: minor\nlayer: ui\narea: cart\naffects:\n  - the cart\nfound: 2026-10-01\n${extra}steps:\n  - Do it.\nexpected: It works.\nactual: It doesn't.\n`;

const cases: { name: string; change: (project: Project) => void; expect: string[] }[] = [
  // simpright.yml's IDs and schemas
  {
    name: 'two layers with one prefix',
    change: (p) => p.edit('simpright.yml', 'ui: { prefix: UI, digits: 3 }', 'ui: { prefix: API, digits: 3 }'),
    expect: ['simpright.yml: ids.layers: api and ui share the prefix API'],
  },
  {
    name: "the bugs' prefix is a layer's",
    change: (p) => p.edit('simpright.yml', 'bugs: { prefix: BUG, digits: 3 }', 'bugs: { prefix: UI, digits: 3 }'),
    expect: ["simpright.yml: ids.bugs: the prefix UI is also a layer's prefix"],
  },
  {
    name: 'paths.bugs without paths.bugSchema',
    change: (p) => p.edit('simpright.yml', '  bugSchema: node_modules/@simpright/scenarios/schemas/bug.schema.json\n', ''),
    expect: ['simpright.yml: paths.bugs, paths.bugSchema and ids.bugs go together: set all three or none'],
  },
  {
    name: 'a file name pattern that is no regex',
    change: (p) => p.edit('simpright.yml', 'api: "^(get|post|put|patch|delete)-{area}(-[a-z0-9]+)*$"', 'api: "^(get"'),
    expect: ['simpright.yml: ids.fileNames.api: invalid regex'],
  },
  {
    name: "a schema path that isn't this version's schema",
    change: (p) => p.write('node_modules/@simpright/scenarios/schemas/scenarios.schema.json', '{}\n'),
    expect: ["simpright.yml: paths.scenarioSchema: node_modules/@simpright/scenarios/schemas/scenarios.schema.json isn't this version's schema"],
  },
  // Scenario files
  {
    name: 'a scenario file in an unknown area',
    change: (p) => p.write('test-scenarios/api/orders/get-orders.yml', scenarioFile('Orders API', '@orders-api', 'API-0010')),
    expect: ['test-scenarios/api/orders/get-orders.yml: must be test-scenarios/<layer>/<area>/<name>.yml with a layer and area from simpright.yml (ids)'],
  },
  {
    name: "a file name that doesn't match the layer's pattern",
    change: (p) => p.write('test-scenarios/api/products/list-products.yml', scenarioFile('Products API', '@products-api', 'API-0010')),
    expect: ['test-scenarios/api/products/list-products.yml: file name must match ^(get|post|put|patch|delete)-products(-[a-z0-9]+)*$ (simpright.yml ids.fileNames.api)'],
  },
  {
    name: 'a scenario without a check',
    change: (p) => p.edit(SEARCH_FILE, '      - Verify the page says no products were found.\n', '      - Check the page says no products were found.\n'),
    expect: [`${SEARCH_FILE}: /scenarios/1/steps must have at least one step that starts with 'Verify '`],
  },
  {
    name: 'keys out of order',
    change: (p) => p.edit(CART_FILE, '    status: automated\n    automatedIn: tests/ui/cart/add-to-cart.spec.ts\n    preconditions', '    automatedIn: tests/ui/cart/add-to-cart.spec.ts\n    status: automated\n    preconditions'),
    expect: [`${CART_FILE} UI-004: keys must be in the order id, name, status, automatedIn, preconditions, steps (found id, name, automatedIn, status, preconditions, steps)`],
  },
  {
    name: 'a duplicate ID',
    change: (p) => p.edit(BY_ID_FILE, '  - id: API-0004\n', '  - id: API-0001\n'),
    expect: [`${API_FILE} API-0001: duplicate ID (also in ${BY_ID_FILE})`],
  },
  {
    name: "an ID with the layer's prefix but not its digits",
    change: (p) => p.edit(SEARCH_FILE, '  - id: UI-001\n', '  - id: UI-01\n'),
    expect: [`${SEARCH_FILE} UI-01: IDs in ${SEARCH_FILE} must be UI-NNN (simpright.yml ids.layers.ui)`],
  },
  {
    name: 'an unknown role',
    change: (p) => p.edit(SEARCH_FILE, '    status: manual\n    role: guest\n', '    status: manual\n    role: admin\n'),
    expect: [`${SEARCH_FILE} UI-003: role admin isn't one of default, guest (simpright.yml roles)`],
  },
  {
    name: 'a known issue without a bug',
    change: (p) => p.edit(API_FILE, '    bug: BUG-001\n', ''),
    expect: [`${API_FILE}: /scenarios/2 must have property bug when property knownIssue is present`],
  },
  {
    name: 'a bug without a bug file',
    change: (p) => p.edit(CART_FILE, 'bug: BUG-002', 'bug: BUG-009'),
    expect: [`${CART_FILE} UI-005: bug BUG-009 has no file bugs/BUG-009.yml`],
  },
  {
    name: 'a known issue whose bug is fixed',
    change: (p) => {
      p.edit('bugs/BUG-002.yml', 'status: open', 'status: fixed');
      p.edit('bugs/BUG-002.yml', 'found: 2026-10-02\n', 'found: 2026-10-02\nresolved: 2026-10-20\n');
    },
    expect: [`${CART_FILE} UI-005: BUG-002 is fixed: remove knownIssue and bug from the scenario and the known-issue line from its test`],
  },
  {
    name: 'an automated scenario without automatedIn',
    change: (p) => p.edit(BY_ID_FILE, '    automatedIn: tests/api/products/get-products-by-product-id.spec.ts\n', ''),
    expect: [`${BY_ID_FILE} API-0004: status is automated, so automatedIn must name the spec`],
  },
  {
    name: 'a manual scenario with automatedIn',
    change: (p) => p.edit(BY_ID_FILE, '    status: manual\n', '    status: manual\n    automatedIn: tests/api/products/get-products-by-product-id.spec.ts\n'),
    expect: [`${BY_ID_FILE} API-0005: automatedIn is set, so status must be automated`],
  },
  {
    name: 'a manual @smoke scenario',
    change: (p) => p.edit(SEARCH_FILE, '    name: Clearing the search shows every product again\n', '    name: Clearing the search shows every product again\n    tags: ["@smoke"]\n'),
    expect: [`${SEARCH_FILE} UI-003: a @smoke scenario must be automated`],
  },
  {
    name: 'a @smoke scenario with a known issue',
    change: (p) => p.edit(API_FILE, '    name: A page past the last one returns an empty list\n', '    name: A page past the last one returns an empty list\n    tags: ["@smoke"]\n'),
    expect: [`${API_FILE} API-0003: a @smoke scenario must have no knownIssue: drop @smoke while the bug is open`],
  },
  {
    name: "a test without its scenario's tags",
    change: (p) => p.edit('tests/ui/products/product-search.spec.ts', "{ tag: '@smoke' }, async", 'async'),
    expect: [`${SEARCH_FILE} UI-001: tests/ui/products/product-search.spec.ts: the test needs the tag option { tag: '@smoke' } (the scenario's tags)`],
  },
  // Specs
  {
    name: "a spec that isn't named after its scenario file",
    change: (p) => p.edit(BY_ID_FILE, 'automatedIn: tests/api/products/get-products-by-product-id.spec.ts', 'automatedIn: tests/api/products/products.spec.ts'),
    expect: [
      `${BY_ID_FILE} API-0004: automatedIn must be tests/api/products/get-products-by-product-id.spec.ts (the spec is named after the scenario file)`,
      `${BY_ID_FILE} API-0004: automatedIn tests/api/products/products.spec.ts doesn't exist`,
    ],
  },
  {
    name: "a test whose title isn't the scenario's name",
    change: (p) => p.edit('tests/api/products/get-products-by-product-id.spec.ts', "details include its price", 'details show its price'),
    expect: [`needs a test titled 'API-0004: A product's details include its price' (found 'API-0004: A product's details show its price')`],
  },
  {
    name: "a describe title that isn't the file's tags and suite",
    change: (p) => p.edit(CART_SPEC, "test.describe('@cart - Add to cart'", "test.describe('@cart - Cart'"),
    expect: [`${CART_SPEC} needs test.describe('@cart - Add to cart') (the tags and suite of ${CART_FILE})`],
  },
  {
    name: 'a spec without its Scenarios comment',
    change: (p) => p.edit(CART_SPEC, '// Scenarios: test-scenarios/ui/cart/add-to-cart.yml\n', ''),
    expect: [`${CART_SPEC} has no '// Scenarios: ${CART_FILE}' comment`],
  },
  {
    name: "a known-issue line that isn't the scenario's",
    change: (p) => p.edit(CART_SPEC, 'Known issue BUG-002: The cart badge shows the number of lines, not the number of items.', 'Known issue BUG-002: The badge is wrong.'),
    expect: [
      `${CART_FILE} UI-005: ${CART_SPEC} needs the known-issue line test.fail(true, 'Known issue BUG-002: The cart badge shows the number of lines, not the number of items.') (simpright.yml ui.knownIssue)`,
      `${CART_SPEC}: the known-issue line 'Known issue BUG-002: The badge is wrong.' matches no scenario's knownIssue and bug`,
    ],
  },
  {
    name: 'tests without a scenario of their own',
    change: (p) =>
      p.write('tests/ui/cart/extra.spec.ts', "test('Adds a product', async () => {});\ntest('UI-099: Something', async () => {});\ntest('UI-004: Adding a product shows it in the cart', async () => {});\n"),
    expect: [
      "tests/ui/cart/extra.spec.ts: test 'Adds a product' doesn't start with a scenario ID",
      'tests/ui/cart/extra.spec.ts: UI-099 has no scenario in test-scenarios/',
      `tests/ui/cart/extra.spec.ts: UI-004's scenario (${CART_FILE}) has automatedIn ${CART_SPEC}, not this spec`,
    ],
  },
  // Bug files
  {
    name: "a bug file that isn't named after its ID",
    change: (p) => p.write('bugs/BUG-004.yml', bugFile('BUG-005')),
    expect: ['bugs/BUG-004.yml: the file must be named after its ID (BUG-005.yml)'],
  },
  {
    name: 'a bug file in a subfolder',
    change: (p) => p.write('bugs/old/BUG-010.yml', bugFile('BUG-010')),
    expect: ['bugs/old/BUG-010.yml: must be bugs/<ID>.yml (no subfolders)'],
  },
  {
    name: "a bug ID with the wrong digits, layer and area",
    change: (p) => p.write('bugs/BUG-04.yml', bugFile('BUG-04').replace('layer: ui', 'layer: web').replace('area: cart', 'area: search')),
    expect: [
      'bugs/BUG-04.yml: ID must be BUG-NNN (simpright.yml ids.bugs)',
      "bugs/BUG-04.yml: layer web isn't one of ui, api (simpright.yml ids.layers)",
      "bugs/BUG-04.yml: area search isn't one of products, cart (simpright.yml ids.areas)",
    ],
  },
  {
    name: "a resolved date that doesn't fit the status",
    change: (p) => {
      p.edit('bugs/BUG-003.yml', 'resolved: 2026-10-05\n', '');
      p.write('bugs/BUG-004.yml', bugFile('BUG-004', 'resolved: 2026-10-20\n'));
    },
    expect: ['bugs/BUG-003.yml: status is fixed, so resolved must give the date', 'bugs/BUG-004.yml: status is open, so resolved must be absent'],
  },
  {
    name: 'two bug files with one ID',
    change: (p) => p.write('bugs/BUG-009.yml', p.read('bugs/BUG-001.yml')),
    expect: ['bugs/BUG-009.yml: duplicate ID (also in bugs/BUG-001.yml)'],
  },
];

describe('simpright-scenarios validate', () => {
  it('passes the sample project and prints the next free IDs', () => {
    const result = check(() => {});
    assert.deepEqual(result.problems, []);
    assert.deepEqual(result.notes, [
      'Scenarios OK: 10 scenario(s), 8 automated.',
      'Bugs OK: 3 bug(s), 2 open, 1 without a scenario.',
      'Next free IDs: UI-006, API-0006, BUG-004',
    ]);
  });

  for (const testCase of cases) {
    it(`finds ${testCase.name}`, () => {
      const { problems } = check(testCase.change);
      for (const text of testCase.expect) assert.ok(problems.some((problem) => problem.includes(text)), `expected a problem with: ${text}\ngot:\n${problems.join('\n')}`);
    });
  }

  it('exits with 0, 1 or 2', () => {
    const project = sampleProject();
    const run = (args: string[]) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
    try {
      const ok = run(['validate', '--root', project.root]);
      assert.equal(ok.status, 0, ok.stderr);
      assert.match(ok.stdout, /Next free IDs: UI-006, API-0006, BUG-004/);
      project.edit('bugs/BUG-003.yml', 'resolved: 2026-10-05\n', '');
      const failed = run(['validate', '--root', project.root]);
      assert.equal(failed.status, 1);
      assert.match(failed.stderr, /Scenario validation failed with 1 error\(s\):/);
      assert.equal(run(['valdate']).status, 2);
    } finally {
      project.dispose();
    }
  });
});

describe('simpright-scenarios check-step-titles', () => {
  type Result = { status: string; steps?: { title: string }[] };
  /** A Playwright JSON report of the sample's API-0001 and API-0002 (their scenario steps unless given). */
  const report = (root: string, results: Record<string, Result>) => ({
    config: { rootDir: path.join(root, 'tests') },
    suites: [
      {
        title: 'api/products/get-products.spec.ts',
        suites: [
          {
            title: '@products-api - Products API',
            specs: Object.entries(results).map(([title, result], i) => ({ title, file: 'api/products/get-products.spec.ts', line: 11 + i * 10, tests: [{ results: [result] }] })),
          },
        ],
      },
    ],
  });
  const steps = (...titles: string[]) => titles.map((title) => ({ title }));
  const API_0001 = ['Send GET /products.', 'Verify the response status is 200.', 'Verify every product has a name and a price.'];

  function run(results: Record<string, Result>) {
    const project = sampleProject();
    try {
      project.write('results.json', JSON.stringify(report(project.root, results)));
      return checkStepTitles(project.root, readConfig(project.root), path.join(project.root, 'results.json'));
    } finally {
      project.dispose();
    }
  }

  it('matches every step title, verbatim and in order', () => {
    const result = run({ 'API-0001: The product list returns products with a name and a price': { status: 'passed', steps: steps(...API_0001) } });
    assert.deepEqual(result, { matched: 1, mismatches: [] });
  });

  it('finds a changed step, with its annotation', () => {
    const result = run({ 'API-0001: The product list returns products with a name and a price': { status: 'passed', steps: steps('Send GET /products', ...API_0001.slice(1)) } });
    assert.equal(result.mismatches.length, 1);
    assert.equal(result.mismatches[0]?.text, 'MISMATCH API-0001: The product list returns products with a name and a price (tests/api/products/get-products.spec.ts:11, passed)\n  1: test "Send GET /products", scenario "Send GET /products."');
    assert.equal(result.mismatches[0]?.annotation, '::warning file=tests/api/products/get-products.spec.ts,line=11,title=Step titles: API-0001::1: test "Send GET /products", scenario "Send GET /products."');
  });

  it('compares a failed test up to the step it reached, a passed one to the end, and skips a skipped one', () => {
    const result = run({
      'API-0001: The product list returns products with a name and a price': { status: 'failed', steps: steps(...API_0001.slice(0, 2)) },
      'API-0002: Page 2 of the product list returns the next products': { status: 'passed', steps: steps('Send GET /products with page=2.') },
      'API-0003: A page past the last one returns an empty list': { status: 'skipped', steps: [] },
    });
    assert.equal(result.matched, 1);
    assert.equal(result.mismatches.length, 1);
    assert.match(result.mismatches[0]?.text ?? '', /^MISMATCH API-0002: .*\n {2}2: test undefined, scenario "Verify the response status is 200\."\n {2}3: test undefined/);
  });

  it('names a test whose ID has no scenario', () => {
    const result = run({ 'API-0099: Something': { status: 'passed', steps: [] } });
    assert.match(result.mismatches[0]?.text ?? '', /no scenario with the id in the title "API-0099: Something"/);
  });
});
