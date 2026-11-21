// Extends the merged `test` (API + UI fixtures), because a spec uses this fixture as its `test`.
import { test as base } from '../../../fixtures/fixtures';
import type { HomePage } from '../../pages/HomePage';

type OpenHomePageFixtures = {
  homePage: HomePage;
};

/** Same as `test`, but `homePage` is already opened and loaded when the test starts. */
export const openHomePageTest = base.extend<OpenHomePageFixtures>({
  homePage: async ({ homePage }, use) => {
    await homePage.open();
    await use(homePage);
  },
});
