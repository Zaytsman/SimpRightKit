# Review checklist: both layers

The conventions themselves are in the files under the profile's `project.conventions` (the framework's `conventions.md`: "Scenarios and specs", "Spec style, both layers"; the project's own in the others) and in the profile's `rules`. This list says what to look for; when a finding breaks one of those rules, cite the rule there, not this file. Items only written here are cited as "review checklist".

## 1. The test matches its scenario

- Every scenario step has its own `test.step`, titled with the step text verbatim, in the scenario's order. None dropped, merged or split. After a run, `npm run check:step-titles -- <JSON report>` compares them (titles passed to a template are only visible there).
- An action step does what it says, and only that (it may read values for later checks). A `Verify` step checks and never changes data.
- **A `Verify` step checks what it says, completely.** Compare the step's words with the assertion:
  - The step names a value ("the price \"$14.15\"", "with quantity 2") → the assertion compares that value, not only visibility or existence.
  - The step says "only", "every", "exactly", "in order", "equals" → the assertion covers every item, the exact count, or the order; not the first item.
  - The step has two checks ("shown and disabled") → both are asserted.
  - A negative step ("is not shown") → asserted in a way that can fail: `toHaveCount(0)` or `not.toBeVisible()` on a locator that would match the element if it appeared, not on a locator that can never match.
- A step the code does as setup (a fixture, `beforeEach`) is not also a scenario step, and a scenario step isn't hidden in a fixture.
- `// Approved reading:` comments: the code does what the comment says.
- Smoke: a test tagged `@smoke` is a happy path with no known issue, cleans up every record it creates (`cleanup`, throwaway customers), and has no fixed waits or reads of shared totals that could flake.
- Known issues: the scenario's `knownIssue` and `bug` and the test's known-issue line agree (the profile's `knownIssue` snippet, same bug ID and text); the line sits right before the first `test.step`, with no setup code (an `await` outside a step) after it, because a setup failure after it passes as "bug still present"; the bug is open and has the same root cause as the scenario's failure; no `test.fail` without a `knownIssue`, and no `test.skip`/`test.fixme` left in.
- The test uses the scenario's `role` (`test.use({ role })`; `guest` → `authMode: 'none'`).

## 2. Assertions

- Every assertion has a message (conventions). The message says what is checked, and it's true: a message that says "sorted by price" over a check of the count misleads the report.
- **No vacuous check:** "every item matches", "sorted", "all prices in range" over a list must first check the list isn't empty, or it passes on an empty page.
- **Retrying checks for the page:** an assertion on the page uses a web-first matcher on a locator (`toHaveText`, `toBeVisible`, `toHaveCount`), so it waits. A value read once and asserted (`expect(await x.textContent())`, `expect(await x.isVisible())`, `boundingBox()`, `count()`) doesn't retry: fine only after the action that changed it has waited for the app's signal; otherwise a race.
- "Shown" means visible: `toHaveText`, `toHaveAttribute` and `toHaveCount` pass on hidden elements, so a step about what the user sees needs `toBeVisible` too, or a source that is never hidden (an ARIA attribute such as `aria-valuemin` rather than a library's label that it hides on overlap).
- A comparison that can be fooled: `toContain` where the step means equality, a regex without anchors, a case-insensitive compare where case matters, `toBeTruthy` on an object that is always truthy.
- Money and other decimals: `toBeCloseTo` with the number of digits, not `toBe` on a computed float.
- A check whose expected value is computed by the same code that produced the actual one proves nothing.

## 3. Stability

- No fixed sleeps (`waitForTimeout`), no longer timeouts or `retries` added as a fix.
- Every action waits for the app's own signal before the next step relies on its result (a marker, a toast, a URL, a response). Look for an action followed directly by a read.
- Data shared between parallel tests: a test that changes a shared record (a seeded product, the run's customer's cart or favourites) can break another test reading it. Each spec file must pass alone and next to the others.
- The demo site re-seeds every hour: record ids (ULIDs) change, so a hard-coded id breaks; names and seeded values stay.
- Order inside a list the app doesn't promise to keep (search results, related products) isn't asserted unless the scenario says so.
- Test-created records use `uniqueName` (so parallel runs don't collide) and are removed with `cleanup`.

## 4. Test data

- A seeded value (a product name, a category, a price) that **more than one test** uses goes in the constants module (`TestConstants`); a value one test uses stays a variable in that test (conventions "Layout"). Count the uses across all specs, not only the change.
- No secret values in steps, code, messages or test titles. Users come from fixtures and roles.
- No magic values without a source: an expected price or count that isn't in the scenario or the constants needs a comment saying where it comes from.

## 5. Live app safety

- A test that creates, changes or deletes data (in any step, including setup) does so only when its writes were approved (the profile's `liveApi.writes`), and every record it creates is cleaned up, pass or fail.
- Nothing from the profile's `liveApi.dangerous` happens (a wrong password for a shared account, changes to the admin).

## 6. Shared code

- Changes to shared files (page objects, base classes, fixtures, services, constants) only add: no changed signature or behaviour that existing tests rely on, unless the change says why and the other tests were run.
- New members are used: a getter, method or constant nothing calls is dead code.
- Two specs or page objects doing the same thing in their own way: one should use the other's, or move to a shared helper.
- Comments explain why, and are true for the code next to them.
