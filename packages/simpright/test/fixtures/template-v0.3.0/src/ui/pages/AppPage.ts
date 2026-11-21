import { BasePage } from './BasePage';

/**
 * The app's base page, which every page object extends. What every page of the app has goes here (in the Toolshop,
 * e.g. the nav bar and the toast), and a `goto` override when the app needs one. It extends the core's `BasePage`.
 */
export abstract class AppPage extends BasePage {}
