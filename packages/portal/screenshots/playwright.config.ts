// The portal's screenshot tests: the three pages of the sample site (`preview --sample`, the package's pages with the
// sample's data) and the API-only variant's dashboard (test-results/sample-site-api), at a desktop and a phone width.
// Run with `npm run test:screenshots` from the kit's root (it builds the sample site first).
//
// The committed baselines are Linux's (CI runs them on ubuntu-latest): text renders differently on each system, so a
// Windows or macOS run writes and compares its own, which git ignores. New Linux baselines come from the manual
// "Update screenshots" workflow.

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  outputDir: '../../../test-results/screenshots',
  snapshotPathTemplate: '{testDir}/baselines/{arg}-{platform}{ext}',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // On CI a missing baseline fails the run; locally the first run writes it.
  updateSnapshots: process.env.CI ? 'none' : 'missing',
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: '../../../test-results/screenshots-report' }]] : 'list',
  use: {
    ...devices['Desktop Chrome'],
    headless: true,
    // The pages format dates in the browser's locale and time zone.
    locale: 'en-US',
    timezoneId: 'UTC',
  },
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: 'disabled' },
  },
  webServer: [
    { command: 'node ../dist/cli.js preview --sample --port 4173', url: 'http://127.0.0.1:4173/', reuseExistingServer: !process.env.CI },
    { command: 'node ../dist/cli.js preview --site ../../../test-results/sample-site-api --port 4174', url: 'http://127.0.0.1:4174/', reuseExistingServer: !process.env.CI },
  ],
});
