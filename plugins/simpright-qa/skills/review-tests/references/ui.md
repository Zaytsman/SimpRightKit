# Review checklist: UI

On top of `common.md`. The rules are in the conventions files (the framework's "UI layer", "UI spec style" and "Fixtures", plus the project's own) and the profile's `ui.rules`; cite them there.

## Specs

- Pages, components, flows and API services come from fixtures. No `new SomePage(...)`, no `page.goto`, no selectors (`page.locator`, `getByTestId`, ...) in a spec; a check goes through a page object getter.
- A flow is used in a step only when it does exactly what the step says; a flow spanning several steps is for setup.
- A scenario's `preconditions` are set up before the first step: a precondition fixture (`open<Page><State>Test`, such as `openHomePageInLondonTest`, with no `test.step` inside; a new one named otherwise is a finding) when tests share one, otherwise setup code with a `// Precondition:` comment. A precondition in a `test.step`, a scenario step done in a fixture, or the same setup code repeated in two or more tests where a fixture fits is a finding.
- Logged-out scenarios (`guest`) use `test.use({ authMode: 'none' })`; a role uses `test.use({ role })`.
- Setup is never a `test.step`: preconditions and the data helpers (`putProductInCart`, `findProductByName`, `registerCustomerForTest`) run before the first step, and a setup failure throws an error starting with `Setup:`.
- The checkout is opened with `CartPage.open()` (the nav bar's cart link): Cloudflare blocks direct loads of `/checkout` from CI runners. Only `openWithoutCart()` loads it, for the visitor without a cart.
- A check that several tests of a spec repeat is a function in that spec (`expectEveryNameContains`), not copied.
- Messages are plain text (no `assertMessage` in UI specs).
- Layout or style checks (position, colour, struck through): read the step's wording; these are often brittle, so they should have an approved reading comment, use a retrying matcher where one exists (`toHaveCSS`), and compare with a tolerance where pixels are involved.

## Page objects, components, dialogs

- Locators are `private readonly` fields assigned in the constructor, named with the element kind (`searchCaptionText`, `addToCartButton`). Tests reach them only through a noun getter, added because a test asserts on it. Dynamic locators are methods with parameters.
- Locator priority: `getByTestId` (`data-test`), then `getByRole` / `getByLabel` / `getByText`, then CSS; never XPath. A CSS locator needs a reason (no test id, role or label exists): a comment, or it's a finding. CSS on framework classes (`.ngx-slider-floor`, `.mat-...`) and on layout (`div > span`, `:nth-child`) breaks with a library or layout change.
- A locator that can match more than one element where the code expects one (strict mode violation waiting to happen), or one that matches a hidden duplicate (mobile menu, template).
- `getByText` / `getByRole` names that depend on the data shown (a price, a count) belong in a method with a parameter, not a fixed field.
- No assertions in page objects; `expect(...)` inside an action or `waitForLoaded()` only as a wait for the app's signal (a marker attached, a toast visible, a value shown).
- Actions are verbs, getters nouns; values a test reads come from `async get...()` methods that wait for the value to be there.
- Amounts (prices, totals) are read with `parseAmount`, never `Number(text)`: `Number('')` is 0, so a price that hasn't rendered passes a check.
- A wait for the app's request uses `waitForApiResponse(page, method, path)`, started before the action and awaited after it, not a hand-written `waitForResponse` predicate.
- The toast is the base page's `toast`; a page doesn't define its own.
- `waitForLoaded()` waits for the data the page loads (the first card, the product name), not only the frame.
- A component extends `BaseComponent` and its locators start from `root`; one built from `page` can match the same test id elsewhere on the page. A `filter({ has })` inner locator built from `root` matches nothing (it's resolved inside each match).
- Every new page object, dialog and flow, and every component used outside a page, is registered as a fixture (the profile's `ui.exemplars.fixtures`); a component a page holds is reached through that page's field (`homePage.productGrid`), not registered; a precondition fixture is exported from `ui.exemplars.fixturesIndex`.

## Data

- Data a test needs (a customer, a product, a cart) is prepared and removed through API fixtures, not by clicking through the UI.
- Browser state a test sets (localStorage such as a location, a cookie) is set before the page loads (`addInitScript` in a fixture), and only for that test.
