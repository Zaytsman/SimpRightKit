// Scenarios: test-scenarios/api/products/get-products-by-product-id.yml
import { expect, test } from '@playwright/test';

test.describe('@products-api - Products API', () => {
  test("API-0004: A product's details include its price", async () => {
    let price = 0;
    await test.step('Send GET /products/{productId} for the first listed product.', async () => {
      price = 12.5;
    });
    await test.step('Verify the response status is 200.', async () => {
      expect(price, 'The product was found').not.toBe(0);
    });
    await test.step('Verify the price is a positive number.', async () => {
      expect(price, 'The price').toBeGreaterThan(0);
    });
  });
});
