import type { Locator, Page } from '@playwright/test';
import { BaseComponent } from './BaseComponent';

/** Grid of product cards on the home/search page. */
export class ProductGrid extends BaseComponent {
  /** Every card is a link with `data-test="product-<id>"`. */
  private readonly cardLinks: Locator;
  private readonly productNameTexts: Locator;

  /**
   * CSS: the results column next to the filter sidebar (search caption, cards, "no results"). The cards' own container
   * has no fixed test id: its `data-test` is the app's result state.
   */
  constructor(page: Page, root: Locator = page.locator('div.col-md-9')) {
    super(page, root);
    this.cardLinks = root.locator('a[data-test^="product-"]');
    this.productNameTexts = root.getByTestId('product-name');
  }

  /** Every product card in the grid. */
  get cards(): Locator {
    return this.cardLinks;
  }

  /** The product names on the cards, in grid order. */
  async getProductNames(): Promise<string[]> {
    return (await this.productNameTexts.allTextContents()).map((name) => name.trim());
  }
}
