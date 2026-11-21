// Every scenario here has the precondition "The home page is open.": the fixture opens it before the steps.
import { openHomePageTest as test, expect } from '@fixtures';
import { TestConstants } from '@data/TestConstants';
import type { HomePage } from '@ui/pages/HomePage';

/** The checks of a "Verify every product name contains "<term>" (case-insensitive)." step: the grid's page 1. */
async function expectEveryNameContains(homePage: HomePage, term: string): Promise<void> {
  for (const name of await homePage.productGrid.getProductNames()) {
    expect(name.toLowerCase(), `Product "${name}" should contain "${term}"`).toContain(term);
  }
}

/**
 * The checks of a "Verify the product grid still shows the first page of all products." step: the same names, in the
 * same order, as right after the home page loaded.
 */
async function expectGridUnchanged(homePage: HomePage, firstPageNames: string[]): Promise<void> {
  expect(firstPageNames.length, 'The home page showed products before the search').toBeGreaterThan(0);
  const names = await homePage.productGrid.getProductNames();
  expect(names, `The grid is unchanged: ${names.join(' | ')} (before: ${firstPageNames.join(' | ')})`).toEqual(firstPageNames);
}

// Scenarios: test-scenarios/ui/products/product-search.yml
test.describe('@products - Product search', () => {
  // The scenarios' role is guest: a visitor who isn't logged in.
  test.use({ authMode: 'none' });

  test('UI-001: Search by name shows only matching products', { tag: '@smoke' }, async ({ homePage }) => {
    const term = TestConstants.products.searchTerm;

    await test.step('Search for "pliers".', async () => {
      await homePage.search(term);
    });

    await test.step('Verify the caption reads "Searched for: pliers".', async () => {
      await expect(homePage.searchCaption, 'The caption names the search term').toHaveText(`Searched for: ${term}`);
    });

    await test.step('Verify at least one product is shown.', async () => {
      await expect(homePage.productGrid.cards.first(), 'At least one product card is shown').toBeVisible();
    });

    await test.step('Verify every product name contains "pliers" (case-insensitive).', async () => {
      await expectEveryNameContains(homePage, term);
    });
  });

  test('UI-002: Search with a 3-character term is accepted', async ({ homePage }) => {
    const term = 'ham';

    await test.step('Search for "ham".', async () => {
      await homePage.search(term);
    });

    await test.step('Verify the caption reads "Searched for: ham".', async () => {
      await expect(homePage.searchCaption, 'The caption names the search term').toHaveText(`Searched for: ${term}`);
    });

    await test.step('Verify at least one product is shown.', async () => {
      await expect(homePage.productGrid.cards.first(), 'At least one product card is shown').toBeVisible();
    });

    await test.step('Verify every product name contains "ham" (case-insensitive).', async () => {
      await expectEveryNameContains(homePage, term);
    });
  });

  test('UI-003: Search with a 40-character term is accepted', async ({ homePage }) => {
    const term = 'a'.repeat(40);

    await test.step('Search for a term of exactly 40 characters.', async () => {
      await homePage.search(term);
    });

    await test.step('Verify the caption reads "Searched for: " followed by the term.', async () => {
      await expect(homePage.searchCaption, 'The caption names the 40-character term').toHaveText(`Searched for: ${term}`);
    });
  });

  test('UI-004: Search with a 2-character term is rejected', async ({ homePage }) => {
    const term = 'pl';
    // The first page as the fixture opened it, for the last check.
    const firstPageNames = await homePage.productGrid.getProductNames();

    await test.step('Search for "pl".', async () => {
      await homePage.submitSearch(term);
    });

    await test.step('Verify no "Searched for:" caption is shown.', async () => {
      await expect(homePage.searchCaption, 'No search caption is shown').toBeHidden();
    });

    await test.step('Verify the product grid still shows the first page of all products.', async () => {
      await expectGridUnchanged(homePage, firstPageNames);
    });
  });

  test('UI-005: Search with a 41-character term is rejected', async ({ homePage }) => {
    const term = 'a'.repeat(41);
    // The first page as the fixture opened it, for the last check.
    const firstPageNames = await homePage.productGrid.getProductNames();

    await test.step('Search for a term of exactly 41 characters.', async () => {
      await homePage.submitSearch(term);
    });

    await test.step('Verify no "Searched for:" caption is shown.', async () => {
      await expect(homePage.searchCaption, 'No search caption is shown').toBeHidden();
    });

    await test.step('Verify the product grid still shows the first page of all products.', async () => {
      await expectGridUnchanged(homePage, firstPageNames);
    });
  });
});
