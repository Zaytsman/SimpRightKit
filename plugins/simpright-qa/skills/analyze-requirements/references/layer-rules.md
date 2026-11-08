# Choosing the test layer

API tests are faster, cheaper and more stable than UI tests: no browser, no rendering, no waiting for pages, fewer reasons to fail. So **every check goes to the API unless the API can't prove it**. A UI test is the exception and carries its reason.

## API, by default

The check is about what the server decides or stores:

- business rules and calculations the server does (prices, totals, discounts computed on the server, stock);
- validation the server enforces: required fields, formats, lengths, ranges, and the error codes and messages it returns;
- permissions and roles: who may read, change or delete what; logged-out access;
- data that is created, changed or deleted, read back through the API;
- filters, sorting, search and pagination the server performs;
- a bug that shows in an API response (a wrong status code, a missing field, a wrong value).

Proof that the server decides: an endpoint in a contract with that rule (a 422 for the limit, a filter parameter), or the app's source.

## UI, only when the API can't prove it

- **What only the page shows:** rendering and layout (a strikethrough price, a badge, an image, hidden or disabled controls), texts that exist only in the page (labels, placeholders, toasts the page builds itself).
- **Validation in the browser only:** the page blocks or corrects a value before anything is sent (a field that clamps its value, a disabled button), and the server doesn't enforce the same rule. If the server enforces it too, the rule is an API item and the UI item checks only what the user sees.
- **State kept in the browser:** localStorage, sessionStorage, cookies, client-side location or settings (a discount that depends on the visitor's location set in the browser).
- **Navigation and journeys:** which page the user lands on, links, redirects after login, a flow across pages.
- **Accessibility:** roles, labels, keyboard use.

## Rules of thumb

- **One journey per story at most.** When the story is a user journey (view, add to cart, see it in the cart), one UI item covers the happy path end to end. The rules along the way are API items.
- **Split, don't duplicate.** A rule the server enforces and the page displays is two items: the API item proves the rule with every case and boundary; the UI item checks one case to show the user sees the result. Never repeat the boundaries on the UI.
- **Bugs** are reproduced on the lowest layer where they show. A bug that shows in the API response is an API item even when it was reported from the UI.
- **Data setup is never a reason for the UI.** A UI item that needs a record (a product in the cart, a favourite) gets it through the API; the scenario only says what is needed.
- **Unknown endpoint.** When the API layer is right but no contract documents the endpoint, the item stays API with a `contract gap` flag: run `/write-api-contracts` for that area first, or move the item to the UI with that reason, as the user chooses.
- **When in doubt**, choose the API and put the choice under "Decisions needed".
