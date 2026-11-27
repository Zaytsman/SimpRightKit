import type { ProductsClient } from '../clients/ProductsClient';
import type { Paginated } from '../dto/common';
import type { Product } from '../dto/product';
import { parseOk } from './serviceUtils';

/**
 * Domain operations on products. Methods expect success and return parsed bodies;
 * tests that check error statuses use `ProductsClient` directly.
 */
export class ProductsService {
  constructor(private readonly client: ProductsClient) {}

  async search(query: string, page?: number): Promise<Paginated<Product>> {
    return parseOk(await this.client.search(query, page), `search products "${query}"`);
  }
}
