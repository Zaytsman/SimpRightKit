import { test as base } from '../../fixtures/base';
import { HomePage } from '../pages/HomePage';

// How a UI test starts logged in (`authMode`, `storageState`) is in the base fixtures (src/fixtures/base.ts).
export type UiFixtures = {
  // Pages
  homePage: HomePage;

  // Flows, components, grids and dialogs go here as they are added
};

export const test = base.extend<UiFixtures>({
  homePage: async ({ page, config }, use) => {
    await use(new HomePage(page, config));
  },
});
