// What the kit knows about SimpRightTemplate: where a version's files are (doctor compares the core with them, and
// init checks that the files it changes are still the template's), which files are the examples of each layer and
// which files register them, the template's own CI, and the files simpright init writes in their place: the
// skeletons, the login presets of src/config/project.ts, src/config/roles.ts, the login client and the exemplars'
// README.

import type { BearerLogin, Layer } from './answers.ts';
import { withLf, withoutRefs } from './state.ts';

/** The template's repository on GitHub; `template` in simpright.yml names one of its tags. */
export const TEMPLATE_REPO = 'Zaytsman/SimpRightTemplate';
const FETCH_TIMEOUT_MS = 30_000;

/** The template's copy of `file` at `version` (a tag), with LF line endings; undefined when the tag has no such file. */
export async function fetchTemplateFile(version: string, file: string, fetchFile: typeof fetch): Promise<string | undefined> {
  const url = `https://raw.githubusercontent.com/${TEMPLATE_REPO}/refs/tags/${version}/${file}`;
  const response = await fetchFile(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (response.status === 404) return undefined;
  if (!response.ok) throw new Error(`${url}: ${response.status} ${response.statusText}`);
  return withLf(await response.text());
}

/** Whether a project's `file` is still the template's: a workflow apart from its action pins, which Dependabot bumps. */
export function sameAsTemplate(file: string, ours: string, theirs: string): boolean {
  return file.startsWith('.github/workflows/') ? withoutRefs(ours) === withoutRefs(theirs) : withLf(ours) === withLf(theirs);
}

/** Each layer's examples: its spec, its scenario file, and the app code only they use (the Toolshop's). */
export const EXAMPLES: Record<Layer, string[]> = {
  api: [
    'tests/api/products/get-products-search.spec.ts',
    'test-scenarios/api/products/get-products-search.yml',
    'src/api/clients/ProductsClient.ts',
    'src/api/services/ProductsService.ts',
    'src/api/dto/product.ts',
    'src/api/dto/common.ts',
  ],
  ui: [
    'tests/ui/products/product-search.spec.ts',
    'test-scenarios/ui/products/product-search.yml',
    'src/ui/pages/HomePage.ts',
    'src/ui/pages/components/ProductGrid.ts',
    'src/ui/fixtures/preconditions/openHomePageTest.ts',
  ],
};

/** Where the examples go with the agents part, at their paths below it, as the agents' style exemplars. */
export const EXEMPLARS_DIR = 'docs/exemplars';

/** The template's own CI, hand-written: it goes when the CI part turns on, so that simpright apply writes the project's. */
export const TEMPLATE_CI = ['.github/workflows/pr-checks.yml', '.github/workflows/tests.yml', '.github/dependabot.yml'];

/** The test folders the core's playwright.config.ts runs: one that the examples leave empty keeps a .gitkeep. */
export const TEST_DIRS: Record<Layer, string> = { api: 'tests/api', ui: 'tests/ui' };

const API_FIXTURES = `import { test as base } from '../../fixtures/base';

/**
 * API clients and services per area, in the variants the scenarios need: each one's type here, e.g.
 * \`ordersClient: OrdersClient;\`, and its fixture in \`test\` below:
 *   ordersClient: async ({ request, config }, use) => {
 *     await use(new OrdersClient(request, config));
 *   },
 * When an endpoint needs a token, add an \`xClientWithToken\` variant whose token is the test's role's, fetched per
 * request: \`new XClient(request, config, () => tokenService.getAccessToken(role))\`.
 */
export type ApiFixtures = {};

export const test = base.extend<ApiFixtures>({});
`;

const UI_FIXTURES = `import { test as base } from '../../fixtures/base';

/**
 * Pages, components, flows and dialogs as fixtures: each one's type here, e.g. \`homePage: HomePage;\`, and its
 * fixture in \`test\` below:
 *   homePage: async ({ page, config }, use) => {
 *     await use(new HomePage(page, config));
 *   },
 * How a UI test starts logged in (\`authMode\`, \`storageState\`) is in the base fixtures (src/fixtures/base.ts).
 */
export type UiFixtures = {};

export const test = base.extend<UiFixtures>({});
`;

const FIXTURES_INDEX = `export { test, expect, type TestFixtures } from './fixtures';
// Precondition fixtures (src/ui/fixtures/preconditions/) are exported here as they're added, e.g.
// export { openHomePageTest } from '../ui/fixtures/preconditions/openHomePageTest';

// API setup and check helpers, one module per area. Everything a module exports reaches specs, so keep names that only
// the module itself uses unexported; a name two modules export is a compile error here.
export * from '../api/fixtures/apiSteps';
`;

const TEST_CONSTANTS = `/**
 * Stable values from the app's seeded data that more than one test relies on, grouped by area, e.g.
 * \`products: { searchTerm: 'pliers' }\`. A value only one test uses stays a variable in that test. Data a test creates
 * comes from a factory in \`factories/\`, never from here. Roles are not repeated here: they're in \`src/config/roles.ts\`.
 */
export const TestConstants = {} as const;
`;

/** The files that register a layer's examples, and what each becomes once they're gone: nothing registered. */
export const REGISTRATIONS: Record<Layer, Record<string, string>> = {
  api: { 'src/api/fixtures/fixtures.ts': API_FIXTURES },
  ui: { 'src/ui/fixtures/fixtures.ts': UI_FIXTURES, 'src/fixtures/index.ts': FIXTURES_INDEX },
};

/** The seeded values both layers' examples read, and what the file becomes once no example is left. */
export const SHARED_REGISTRATIONS: Record<string, string> = { 'src/data/TestConstants.ts': TEST_CONSTANTS };

export const EXEMPLARS_README = `# Exemplars

SimpRightTemplate's examples, which test the Toolshop demo app logged out, kept as the QA agents' style exemplars:
\`agents.*.exemplars\` in \`simpright.yml\` point here. Nothing here is compiled, run or validated (\`tsconfig.json\`,
Playwright and the scenario validator don't look in \`docs/\`), so their imports don't resolve.

Once the project has its own client, service, DTO, page, component and specs, point the exemplars at them
(\`/simpright-setup\` does it) and delete this folder. \`simpright doctor\` notes the exemplars that still point here.
`;

/** A string as a TypeScript literal in single quotes. */
const literal = (text: string) => `'${text.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

const PROJECT_INTRO = `/**
 * How the framework's core reaches the app under test: its test ids, its logins and what runs around a test run. The
 * roles are in \`roles.ts\`; URLs, timeouts and the configured users in \`src/envs/<ENV>.json\`.`;

/** src/config/project.ts with the test-id attribute and a login preset: none (logged-out tests only) or bearer. */
export function projectFile(testIdAttribute: string, login: { preset: 'none' } | BearerLogin): string {
  if (login.preset === 'none') {
    return `import { defineProject } from './defineProject';

const NO_LOGIN =
  "No login is set up: a test that logs in needs project.login and project.browserState in src/config/project.ts. Logged-out tests use test.use({ authMode: 'none' }).";

${PROJECT_INTRO}
 *
 * No login is set up yet. To log users in, replace \`login\` (an API login that returns a bearer token) and
 * \`browserState\` (where a logged-in page keeps that token), and add \`uiLogin\` for UI_AUTH_MODE=storageState. SimpRight's
 * project file does all of it, plus a user registered for each run in \`beforeRun\`:
 * https://github.com/Zaytsman/SimpRight/blob/main/src/config/project.ts
 */
export const project = defineProject({
  testIdAttribute: ${literal(testIdAttribute)},

  login: async () => {
    throw new Error(NO_LOGIN);
  },

  browserState: () => {
    throw new Error(NO_LOGIN);
  },
});
`;
  }
  const body = Object.entries(login.body)
    .map(([field, value]) => `${field}: user.${value}`)
    .join(', ');
  const fields = [`  ${login.tokenField}: string;`, ...(login.expiresInField ? [`  ${login.expiresInField}: number;`] : [])];
  const lifetime = login.expiresInField ? `body.${login.expiresInField}` : String(login.expiresInSeconds);
  const lasts = login.expiresInField ? `which lasts the body's ${login.expiresInField} seconds` : `which lasts ${login.expiresInSeconds} s`;
  const noBrowserState = login.localStorageKey
    ? ''
    : `
const NO_BROWSER_STATE =
  'No browser state is set up: a UI test that starts logged in needs project.browserState in src/config/project.ts, which says where a logged-in page keeps the token.';
`;
  const browserState = login.localStorageKey
    ? `  /** A logged-in page keeps the token in localStorage[${literal(login.localStorageKey)}]. */
  browserState: (baseUrl, token) => ({
    cookies: [],
    origins: [{ origin: new URL(baseUrl).origin, localStorage: [{ name: ${literal(login.localStorageKey)}, value: token }] }],
  }),`
    : `  browserState: () => {
    throw new Error(NO_BROWSER_STATE);
  },`;
  return `import { AuthClient } from '../api/clients/AuthClient';
import { ApiError } from '../api/services/serviceUtils';
import { defineProject } from './defineProject';
${noBrowserState}
/** The body of a successful login. */
interface LoginResponse {
${fields.join('\n')}
}

${PROJECT_INTRO}
 */
export const project = defineProject({
  testIdAttribute: ${literal(testIdAttribute)},

  /** POST ${login.path} with the user's credentials; the token is the body's ${login.tokenField}, ${lasts}. */
  login: async ({ request, config, user }) => {
    const response = await new AuthClient(request, config).login({ ${body} });
    if (!response.isSuccess) throw new ApiError(\`\${response.status} \${response.statusText}\`, response.status);
    const body = JSON.parse(response.body) as LoginResponse;
    return { token: body.${login.tokenField}, expiresInSeconds: ${lifetime} };
  },

${browserState}
});
`;
}

/** src/api/clients/AuthClient.ts: the login endpoint the bearer preset calls. */
export function authClientFile(login: BearerLogin): string {
  return `import { BaseClient, type ApiResponse } from './BaseClient';

/** The API's login endpoint, which project.login (src/config/project.ts) calls for each role's token. */
export class AuthClient extends BaseClient {
  /** POST ${login.path} with the user's credentials. */
  async login(credentials: Record<string, string>): Promise<ApiResponse> {
    return this.post(${literal(login.path)}, { data: credentials });
  }
}
`;
}

/** src/config/roles.ts with `roles`, the first being the default. */
export function rolesFile(roles: string[]): string {
  return `/**
 * The roles a test can act as (\`test.use({ role })\`): the project's own list, which the framework's core reads through
 * \`@config/env\`. A role logs in with its user from \`testUsers\` in \`src/envs/<ENV>.json\` (secrets from \`.env\`), or with
 * a user created for the run (\`setRunUser\`).
 */
export const ROLES = [${roles.map(literal).join(', ')}] as const;

export type UserRole = (typeof ROLES)[number];

/** The role of a test that doesn't set one: the scenarios' "default user". */
export const DEFAULT_ROLE: UserRole = ${literal(roles[0]!)};
`;
}
