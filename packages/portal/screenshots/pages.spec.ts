// The portal's pages with the sample's data: what each page says (checked on every system) and how it looks (compared
// with the baselines). The tests use no network: the fonts fall back to the system's, and Chart.js comes from
// node_modules, the same file the pages load from jsDelivr (so its integrity hash matches).

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

const KIT = fileURLToPath(new URL('../../../', import.meta.url));
const SAMPLE = 'http://127.0.0.1:4173';
const API_ONLY = 'http://127.0.0.1:4174';
const CHART_JS_VERSION = (JSON.parse(readFileSync(path.join(KIT, 'node_modules/chart.js/package.json'), 'utf8')) as { version: string }).version;
const PHONE = { width: 390, height: 844 };

test.beforeEach(async ({ page }) => {
  await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) => route.abort());
  await page.route(`https://cdn.jsdelivr.net/npm/chart.js@${CHART_JS_VERSION}/dist/chart.umd.min.js`, (route) =>
    route.fulfill({ path: path.join(KIT, 'node_modules/chart.js/dist/chart.umd.min.js'), contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' } }),
  );
});

test('the dashboard loads the Chart.js version that the kit tests with', () => {
  const page = readFileSync(path.join(KIT, 'packages/portal/pages/dashboard.html'), 'utf8');
  expect(page, 'Upgrade the page\'s Chart.js URL and integrity hash together with the devDependency').toContain(`chart.js@${CHART_JS_VERSION}/`);
});

/** The dashboard, once its regressions' status and the run history have loaded. */
async function openDashboard(page: Page, url: string) {
  await page.goto(url);
  await expect(page.locator('#api-status'), "The API regression's status").toHaveClass(/healthy/);
  await expect(page.locator('#history-list .run-empty'), 'The run history has loaded').toHaveCount(0);
}

test.describe('the dashboard', () => {
  test('names its layers and shows a card per regression', async ({ page }) => {
    await openDashboard(page, SAMPLE);
    await expect(page.locator('#intro-text'), 'The intro').toHaveText('Latest reports, trends, known issues and the history of every UI and API run, published by GitHub Actions.');
    await expect(page.locator('.status-row'), 'Two cards (no coverage) share the row').toHaveClass(/\bcards-2\b/);
    await expect(page.locator('#ui-status .text'), "The UI regression's latest run").toHaveText('Healthy');
    await expect(page.getByRole('heading', { name: 'Sample Shop' }).or(page.getByText('SimpRight Kit demo')).first(), 'The brand').toBeVisible();
    await expect(page.locator('#knownIssuesBody tr'), 'One row per known issue').toHaveCount(2);
    await expect(page.locator('[data-repo-link="actions"]'), "The repository's workflows").toHaveAttribute('href', 'https://github.com/Zaytsman/SimpRightKit/actions');
    await expect(page.locator('[data-repo-link="wiki"]'), 'No wiki link: the sample publishes none').toBeHidden();
  });

  test('looks the same (desktop)', async ({ page }) => {
    await openDashboard(page, SAMPLE);
    await expect(page).toHaveScreenshot('dashboard-desktop.png', { fullPage: true });
  });

  test('looks the same with the UI trends open', async ({ page }) => {
    await openDashboard(page, SAMPLE);
    await page.locator('button[data-trends="ui"]').click();
    await expect(page.locator('#ui-charts canvas').first(), 'A trend chart').toBeVisible();
    await expect(page.locator('#ui-trends')).toHaveScreenshot('dashboard-ui-trends.png');
  });

  test('looks the same (phone)', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await openDashboard(page, SAMPLE);
    await expect(page).toHaveScreenshot('dashboard-phone.png', { fullPage: true });
  });
});

test.describe("an API-only project's dashboard", () => {
  test('names only its layer, with one card and no empty slot', async ({ page }) => {
    await openDashboard(page, API_ONLY);
    await expect(page.locator('#intro-text'), 'The intro').toHaveText('Latest reports, trends, known issues and the history of every API run, published by GitHub Actions.');
    await expect(page.locator('.status-row'), 'The one card fills the row').toHaveClass(/\bcards-1\b/);
    await expect(page.locator('[data-layer="ui"]').first(), 'The UI card').toBeHidden();
    await expect(page.locator('[data-bugs]'), 'No Bugs page link').toBeHidden();
  });

  test('looks the same (desktop)', async ({ page }) => {
    await openDashboard(page, API_ONLY);
    await expect(page).toHaveScreenshot('api-only-dashboard-desktop.png', { fullPage: true });
  });
});

/** The UI Test Cases page, open on its first scenario. */
async function openTestCases(page: Page) {
  await page.goto(`${SAMPLE}/test-cases/ui/`);
  await expect(page.getByRole('heading', { level: 2, name: 'Adding a product shows it in the cart' }), 'The first scenario').toBeVisible();
}

test.describe('the Test Cases page', () => {
  test("counts the layer's scenarios and links their files in the repository", async ({ page }) => {
    await openTestCases(page);
    await expect(page.getByRole('button', { name: '5 Total' }), 'The total').toBeVisible();
    await expect(page.getByRole('button', { name: 'Cart 2' }), 'An area with its count').toBeVisible();
    await expect(page.getByRole('link', { name: 'test-scenarios/ui/cart/add-to-cart.yml' }), "The scenario file's link").toHaveAttribute(
      'href',
      'https://github.com/Zaytsman/SimpRightKit/blob/main/examples/sample-project/test-scenarios/ui/cart/add-to-cart.yml',
    );
  });

  for (const [name, viewport] of [['desktop', undefined], ['phone', PHONE]] as const) {
    test(`looks the same (${name})`, async ({ page }) => {
      if (viewport) await page.setViewportSize(viewport);
      await openTestCases(page);
      await expect(page).toHaveScreenshot(`test-cases-${name}.png`, { fullPage: true });
    });
  }
});

test.describe('the Bugs page', () => {
  test('lists the bugs, open ones first', async ({ page }) => {
    await page.goto(`${SAMPLE}/bugs/`);
    await expect(page.getByText('The cart badge counts lines instead of items').first(), 'An open bug').toBeVisible();
    await expect(page.getByText('The search box ignored a trailing space').first(), 'A fixed bug').toBeVisible();
  });

  for (const [name, viewport] of [['desktop', undefined], ['phone', PHONE]] as const) {
    test(`looks the same (${name})`, async ({ page }) => {
      if (viewport) await page.setViewportSize(viewport);
      await page.goto(`${SAMPLE}/bugs/`);
      await expect(page.getByText('The cart badge counts lines instead of items').first()).toBeVisible();
      await expect(page).toHaveScreenshot(`bugs-${name}.png`, { fullPage: true });
    });
  }
});
