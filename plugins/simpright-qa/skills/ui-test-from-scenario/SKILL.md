---
name: ui-test-from-scenario
description: How to write a UI test spec from a scenario file. Preloaded into the ui-test-engineer agent.
user-invocable: false
---

# UI spec from a scenario file

Copy the structure of the exemplar spec (`ui.exemplars.spec` in the profile) and follow the spec conventions in the project's conventions files; the scenario validator checks the parts marked "(checked)".

## File

- One spec per scenario file, with the same name, in the same layer and area folders under the tests path: `test-scenarios/ui/products/product-sorting.yml` → `tests/ui/products/product-sorting.spec.ts`. (checked)
- The comment `// Scenarios: <scenario file path>` at the top. (checked)
- Imports only from the project's fixtures entry point, the test-data modules and page object types; no direct construction of page objects, components, flows or API clients, no `page.goto`, no selectors.
- One `test.describe('<the file's tags joined by spaces> - <suite>')`. (checked)

## Tests

- One `test('<ID>: <name>')` per scenario, with the name verbatim (escape quotes the way the exemplar does). (checked)
- **Roles:** absent → the default user, nothing to set. `admin` (or another login role) → `test.use({ role: '<role>' })`. `guest` (logged out) → `test.use({ authMode: 'none' })`. When every scenario in the file has the same role, set it once inside the describe; otherwise wrap that one test in an anonymous `test.describe(() => { test.use(...); test(...) })`.
- A scenario with `tags` (`["@smoke"]`): the test gets Playwright's tag option and keeps its title: `test('<ID>: <name>', { tag: '@smoke' }, async (...) => ...)`. A smoke test only makes writes it cleans up itself.
- A scenario with `knownIssue`: the profile's `ui.knownIssue` snippet with the scenario's `bug` ID and the text verbatim goes right before the test's first `test.step`, after any setup code in the body (`// Precondition:` code, carts put through the API), so a failed setup is a real failure, not "bug still present". With no setup (or setup in a precondition fixture) it's the first line.
- Tests in a file run in parallel and each file runs on its own: no state shared between tests, no order between them.
- State shared between steps goes in `let` variables at the top of the test; values only this test uses are `const`s there too (from the constants module when shared).
- **Preconditions** (the scenario's `preconditions`): each precondition is set up before the first step, never in a `test.step`: with a precondition fixture (`openHomePageTest`, `openHomePageInLondonTest`, `openProductPageTest`, `openProductPageInLondonTest`, `openProductPageWithNewCustomerTest`) when the tests share it, imported as `test` (`import { openHomePageTest as test, expect } from '@fixtures'`) so the validator finds the titles; otherwise as setup code at the top of the test with a `// Precondition: <text>` comment. A precondition fixture that exists for the text ("The home page is open." → `openHomePageTest`, "The product page of "X" is open." → `openProductPageTest` with `test.use({ productName })`) is always used; when tests in the file have different preconditions, wrap the ones that share a fixture in an anonymous `test.describe(() => { const test = <fixture>; ... })`.
- **Setup** (the preconditions and the data they need: `putProductInCart`, `findProductByName`, `registerCustomerForTest`) is code before the first step, never a `test.step`; when it can't prepare the state it throws an error starting with `Setup:`. The checkout is opened with `cartPage.open()`, never by loading `/checkout`.

## Steps

One `test.step('<step text verbatim>', ...)` per scenario step, in order.

**Action steps** (everything that isn't a `Verify` step):
- One page object, component or flow action per user action the step names. A flow is used only when it does exactly what the step says.
- Actions wait for the app's signal themselves (page objects do this); the spec never waits on its own with sleeps or `networkidle`.
- An action step may read a value a later check needs (`unitPrice = await productPage.getUnitPrice()`).
- **Data setup** the step describes ("A product is in the cart.") goes through the API fixtures and step helpers, which register cleanup; a record the UI action under test creates gets `cleanup.add(...)` right after the action, in the same step, using a fixture with the role allowed to delete it.

**Verify steps:**
- Hold the checks, in the order the step lists them. They read the page; they never act on it.
- **Every assertion has a plain-text message** saying what is checked: `expect(homePage.searchCaption, 'The caption names the search term').toHaveText(...)`. A bare `expect` without a message is forbidden.
- **Prefer web-first assertions on locators** (`await expect(locator).toHaveText/toBeVisible/toBeChecked/toHaveCount(...)`): they retry until the page settles. Read values once (`getProductNames()`) only for checks a locator assertion can't express (an order, a sum, "every name contains"), and only after the action has waited for its signal.
- **Order checks:** compare the list with a sorted copy, using the comparison the step implies: names case-insensitively (`a.localeCompare(b, undefined, { sensitivity: 'base' })`), prices as numbers. Put the list in the message, so a failure shows it.
- "Every item ..." and order checks: assert the list is not empty first (an empty list passes both), unless an earlier step already checked it.
- **Approved readings:** when the user approved how to read a step (names compared case-insensitively, the displayed price, the first page only), record it in a short comment above the check, so later readers see why the test checks it that way.
- Check exactly what the step says, on what a user can see. Don't add checks the step doesn't ask for.
- A check that several tests of the spec repeat goes in a function in the spec (`expectEveryNameContains(homePage, term)`), not copied.
- Compare secret values (a test user's email) as a condition, `expect(a === b, message).toBe(true)`, so a failure diff never prints them.

## Things that bite

- **Re-seeding:** the demo site re-seeds every hour, which changes record ids: never use ids in specs; find records by visible names. A run that starts right on the hour may fail in setup; that's the site, not the test.
- **Re-renders:** a list that re-renders after an action can be read half-updated; the action must wait for its signal (marker, response, change) before the spec reads.
- **Hidden duplicates:** responsive layouts may render an element twice (one hidden); scope locators to the visible one or to a container.
- **Time:** wait for a condition the page exposes, never a fixed sleep.
