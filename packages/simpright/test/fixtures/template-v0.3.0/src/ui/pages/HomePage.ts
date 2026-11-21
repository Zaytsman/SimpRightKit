import { expect, type Locator, type Page } from '@playwright/test';
import type { EnvConfig } from '../../config/env';
import { AppPage } from './AppPage';
import { ProductGrid } from './components/ProductGrid';

export class HomePage extends AppPage {
  private readonly searchInput: Locator;
  private readonly searchButton: Locator;
  private readonly searchCaptionText: Locator;
  /** Marker the app renders once search results are in. */
  private readonly searchCompletedMarker: Locator;
  readonly productGrid: ProductGrid;

  constructor(page: Page, config: EnvConfig) {
    super(page, config);
    this.searchInput = page.getByTestId('search-query');
    this.searchButton = page.getByTestId('search-submit');
    this.searchCaptionText = page.getByTestId('search-caption');
    this.searchCompletedMarker = page.getByTestId('search_completed');
    this.productGrid = new ProductGrid(page);
  }

  /** "Searched for: <term>", shown after a search. */
  get searchCaption(): Locator {
    return this.searchCaptionText;
  }

  async open(): Promise<void> {
    await this.goto('/');
    await this.waitForLoaded();
  }

  /**
   * Waits for the search box and the first page of products. The first page loads without any result
   * marker, and a late response would replace the grid after a search, so actions wait for it here.
   */
  async waitForLoaded(): Promise<void> {
    await expect(this.searchInput).toBeVisible();
    await expect(this.productGrid.cards.first()).toBeVisible();
  }

  /** Searches and waits until the results (or the "no products" message) are rendered. */
  async search(term: string): Promise<void> {
    await this.searchInput.fill(term);
    await this.searchButton.click();
    await expect(this.searchCompletedMarker).toBeAttached();
  }

  /**
   * Fills the search box and submits, without waiting for results: only for terms the app is expected to reject
   * (shorter than 3 or longer than 40 characters), where it renders no marker at all. The app validates the form
   * synchronously, so a rejected term changes nothing within the click, and checks right after this call are meaningful.
   */
  async submitSearch(term: string): Promise<void> {
    await this.searchInput.fill(term);
    await this.searchButton.click();
  }
}
