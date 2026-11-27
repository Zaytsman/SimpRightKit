import { BaseClient, queryString, type ApiResponse } from './BaseClient';

/** The products endpoints, one public method per endpoint (here only the one the examples call). */
export class ProductsClient extends BaseClient {
  /** GET /products/search. Without `query`, no `q` is sent at all; an empty string sends `q=`. */
  async search(query?: string, page?: number): Promise<ApiResponse> {
    return this.get('/products/search', queryString({ q: query, page }));
  }
}
