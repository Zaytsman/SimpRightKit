// Scenarios: test-scenarios/api/products/get-products.yml
// The sample's specs check made-up data, so they run anywhere, without a browser or the network.
import { expect, test } from '@playwright/test';

const pages: Record<number, { name: string; price: number }[]> = {
  1: [{ name: 'Pliers', price: 12.5 }, { name: 'Hammer', price: 9.99 }],
  2: [{ name: 'Saw', price: 21 }],
};

test.describe('@products-api - Products API', () => {
  test('API-0001: The product list returns products with a name and a price', { tag: '@smoke' }, async () => {
    let status = 0;
    await test.step('Send GET /products.', async () => {
      status = 200;
    });
    await test.step('Verify the response status is 200.', async () => {
      expect(status, 'The response status').toBe(200);
    });
    await test.step('Verify every product has a name and a price.', async () => {
      expect(pages[1]?.length, 'The page lists some products').toBeGreaterThan(0);
      for (const product of pages[1] ?? []) expect(product.name !== '' && product.price > 0, `${product.name} has a name and a price`).toBe(true);
    });
  });

  test('API-0002: Page 2 of the product list returns the next products', async () => {
    let page = 0;
    await test.step('Send GET /products with page=2.', async () => {
      page = 2;
    });
    await test.step('Verify the response status is 200.', async () => {
      expect(pages[page], 'Page 2 exists').toBeDefined();
    });
    await test.step('Verify the response is page 2.', async () => {
      expect(page, 'The page number').toBe(2);
    });
  });

  test('API-0003: A page past the last one returns an empty list', async () => {
    test.fail(true, 'Known issue BUG-001: The API returns 500 for a page past the last one instead of an empty list.');
    let status = 0;
    await test.step('Send GET /products with page=999.', async () => {
      status = pages[999] ? 200 : 500;
    });
    await test.step('Verify the response status is 200.', async () => {
      expect(status, 'The response status').toBe(200);
    });
    await test.step('Verify the list is empty.', async () => {
      expect(pages[999] ?? [], 'The list').toEqual([]);
    });
  });
});
