// Scenarios: test-scenarios/ui/products/product-search.yml
import { expect, test } from '@playwright/test';

const catalog = ['Combination Pliers', 'Long Nose Pliers', 'Claw Hammer'];
const search = (term: string) => catalog.filter((name) => name.toLowerCase().includes(term));

test.describe('@products - Product search', () => {
  test('UI-001: Search by name shows only matching products', { tag: '@smoke' }, async () => {
    let shown: string[] = [];
    await test.step('Search for "pliers".', async () => {
      shown = search('pliers');
    });
    await test.step('Verify every product shown has "pliers" in its name.', async () => {
      expect(shown.length, 'Some products are shown').toBeGreaterThan(0);
      for (const name of shown) expect(name.toLowerCase(), `${name} matches the search`).toContain('pliers');
    });
  });

  test('UI-002: A search with no match says so', async () => {
    let shown: string[] = [];
    await test.step('Search for "zzz".', async () => {
      shown = search('zzz');
    });
    await test.step('Verify the page says no products were found.', async () => {
      expect(shown, 'The products shown').toEqual([]);
    });
  });
});
