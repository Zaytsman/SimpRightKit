import { test as base } from '../../fixtures/base';
import { ProductsClient } from '../clients/ProductsClient';
import { ProductsService } from '../services/ProductsService';

/**
 * API clients and services per area, in the variants the scenarios need. The examples call public endpoints, so they
 * take no token. When an endpoint needs one, add an `xClientWithToken` variant whose token is the test's role's, fetched
 * per request: `new XClient(request, config, () => tokenService.getAccessToken(role))`.
 */
export type ApiFixtures = {
  /** Public endpoints: no token. */
  productsClient: ProductsClient;
  productsService: ProductsService;
};

export const test = base.extend<ApiFixtures>({
  productsClient: async ({ request, config }, use) => {
    await use(new ProductsClient(request, config));
  },
  productsService: async ({ productsClient }, use) => {
    await use(new ProductsService(productsClient));
  },
});
