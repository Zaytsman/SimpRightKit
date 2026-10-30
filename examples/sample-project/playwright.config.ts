// The sample's Playwright setup, for the kit's e2e workflow. Its specs check made-up data, so they need no browser and
// no network. The reporters write what the portal publishes: the HTML report (playwright-report/) and the JSON report
// (test-results/results.json), which the step-title check reads too.
import { defineConfig } from '@playwright/test';

export default defineConfig({
  forbidOnly: !!process.env.CI,
  reporter: [['list'], ['html', { open: 'never' }], ['json', { outputFile: 'test-results/results.json' }]],
  projects: [
    { name: 'api', testDir: 'tests/api' },
    { name: 'ui', testDir: 'tests/ui' },
  ],
});
