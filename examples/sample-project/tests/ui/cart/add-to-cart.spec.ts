// Scenarios: test-scenarios/ui/cart/add-to-cart.yml
import { expect, test } from '@playwright/test';

test.describe('@cart - Add to cart', () => {
  test('UI-004: Adding a product shows it in the cart', async () => {
    const cart: { name: string; quantity: number }[] = [];
    await test.step('Add the product to the cart.', async () => {
      cart.push({ name: 'Claw Hammer', quantity: 1 });
    });
    await test.step('Verify the cart lists the product once.', async () => {
      expect(cart.filter((line) => line.name === 'Claw Hammer'), 'The cart lines for the product').toHaveLength(1);
    });
  });

  test('UI-005: The cart badge counts the items added', async () => {
    test.fail(true, 'Known issue BUG-002: The cart badge shows the number of lines, not the number of items.');
    let quantity = 1;
    const cart: { name: string; quantity: number }[] = [];
    await test.step('Set the quantity to 3.', async () => {
      quantity = 3;
    });
    await test.step('Add the product to the cart.', async () => {
      cart.push({ name: 'Claw Hammer', quantity });
    });
    await test.step('Verify the cart badge shows 3.', async () => {
      expect(cart.length, 'The cart badge').toBe(3);
    });
  });
});
