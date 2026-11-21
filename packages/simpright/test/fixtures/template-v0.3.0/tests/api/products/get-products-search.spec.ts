import { test, expect, sendAndAttach } from '@fixtures';
import { expectSomeItems, expectStatus, expectStatusAndBody, parseJson } from '@utils/apiChecks';
import type { ApiResponse } from '@api/clients/BaseClient';
import type { ProductsClient } from '@api/clients/ProductsClient';
import type { Paginated } from '@api/dto/common';
import type { Product } from '@api/dto/product';
import { TestConstants } from '@data/TestConstants';
import { uniqueName } from '@data/factories/testDataUtils';
import { assertMessage } from '@utils/assertHelpers';

// Scenarios: test-scenarios/api/products/get-products-search.yml

type SearchRequest = { method: 'GET'; path: '/products/search'; query?: { q?: string; page?: number } };

/** Sends GET /products/search (no query string when q and page are undefined) and attaches the request and the response. */
async function sendSearch(productsClient: ProductsClient, q?: string, page?: number): Promise<{ request: SearchRequest; response: ApiResponse }> {
  const query = { ...(q !== undefined ? { q } : {}), ...(page !== undefined ? { page } : {}) };
  const request: SearchRequest = { method: 'GET', path: '/products/search', ...(Object.keys(query).length ? { query } : {}) };
  return sendAndAttach('Search', request, () => productsClient.search(q, page));
}

/** The checks of a "Verify data is an empty array and from is null." step. */
function expectEmptyPage(request: SearchRequest, body: Paginated<Product>): void {
  expect(
    Array.isArray(body.data) && body.data.length === 0,
    assertMessage({ request, expected: 'data is an empty array', actual: body.data })
  ).toBe(true);
  expect(body.from, assertMessage({ request, expected: 'from is null', actual: body.from })).toBeNull();
}

/**
 * The template of the "Search ... returns an empty page" scenarios (API-0003..0005): GET /products/search with `q`
 * (title `sendStep`; undefined sends no q at all), then the 200 and an empty page.
 */
async function checkEmptySearch(productsClient: ProductsClient, sendStep: string, q: string | undefined): Promise<void> {
  let request: SearchRequest;
  let response: ApiResponse;
  let body: Paginated<Product>;

  await test.step(sendStep, async () => {
    ({ request, response } = await sendSearch(productsClient, q));
  });

  await test.step('Verify the response status is 200.', async () => {
    body = expectStatusAndBody<Paginated<Product>>(request, response, 200);
  });

  await test.step('Verify data is an empty array and from is null.', async () => {
    expectEmptyPage(request, body);
  });
}

test.describe('@products-api - Products API', () => {
  test('API-0001: Search by name returns only matching products', { tag: '@smoke' }, async ({ productsClient }) => {
    const term = TestConstants.products.searchTerm;
    let request: SearchRequest;
    let response: ApiResponse;
    let body: Paginated<Product>;

    await test.step('Send GET /products/search with q=pliers.', async () => {
      ({ request, response } = await sendSearch(productsClient, term));
    });

    await test.step('Verify the response status is 200 and the body is paginated (data, total, current_page).', async () => {
      expectStatus(request, response, 200);
      body = parseJson<Paginated<Product>>(request, response);
      for (const field of ['data', 'total', 'current_page'] as const) {
        expect(body[field], assertMessage({ request, expected: `Paginated body with "${field}"`, actual: Object.keys(body) })).toBeDefined();
      }
    });

    await test.step('Verify total is greater than 0 and every item\'s name contains "pliers" (case-insensitive).', async () => {
      expect(body.total, assertMessage({ request, expected: 'At least one match (total > 0)', actual: body.total })).toBeGreaterThan(0);
      for (const product of body.data) {
        expect(
          product.name.toLowerCase(),
          assertMessage({ request, expected: `Product name should contain "${term}"`, actual: product.name })
        ).toContain(term);
      }
    });

    await test.step('Verify each item has an id, a name and a price greater than 0.', async () => {
      expectSomeItems(request, body.data, 'data');
      for (const product of body.data) {
        const actual = { id: product.id, name: product.name, price: product.price };
        expect(product.id, assertMessage({ request, expected: 'Product has an id', actual })).toBeTruthy();
        expect(product.name, assertMessage({ request, expected: 'Product has a name', actual })).toBeTruthy();
        expect(product.price, assertMessage({ request, expected: 'Product price > 0', actual })).toBeGreaterThan(0);
      }
    });
  });

  test('API-0002: Search page 2 returns the second page', async ({ productsClient }) => {
    let request: SearchRequest;
    let response: ApiResponse;
    let body: Paginated<Product>;

    await test.step('Send GET /products/search with q=pliers and page=2.', async () => {
      ({ request, response } = await sendSearch(productsClient, TestConstants.products.searchTerm, 2));
    });

    await test.step('Verify the response status is 200.', async () => {
      body = expectStatusAndBody<Paginated<Product>>(request, response, 200);
    });

    await test.step('Verify current_page is 2.', async () => {
      expect(body.current_page, assertMessage({ request, expected: 'current_page is 2', actual: body.current_page })).toBe(2);
    });
  });

  test('API-0003: Search for a term no product has returns an empty page', async ({ productsClient }) => {
    await checkEmptySearch(productsClient, 'Send GET /products/search with q set to a unique name that no product has.', uniqueName('NoSuchProduct'));
  });

  test('API-0004: Search without a term returns an empty page', async ({ productsClient }) => {
    await checkEmptySearch(productsClient, 'Send GET /products/search without query parameters.', undefined);
  });

  test('API-0005: Search with an empty term returns an empty page', async ({ productsClient }) => {
    await checkEmptySearch(productsClient, 'Send GET /products/search with an empty q.', '');
  });
});
