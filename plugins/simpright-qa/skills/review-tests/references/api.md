# Review checklist: API

On top of `common.md`. The rules are in the conventions files (the framework's "API spec style", "API layer" and "API contracts", plus the project's own) and the profile's `api.rules`; cite them there.

## Specs

- Every assertion passes `assertMessage({ request, expected, actual })`; a bare `expect` or a plain-text message is a finding.
- Requests and responses are attached with `attachJson`, never `test.info().attach`, so secrets are masked in the public reports.
- Bodies are parsed with `parseJson(request, response)`, never `JSON.parse` (a non-JSON error page then fails with the request and the status, not a bare SyntaxError), and only after the status check.
- A status step uses `expectStatus` / `expectStatusAndBody`; a call whose status a step checks goes through `sendAndAttach`, with an `AUTH` label for the token; a page that may list other visitors is attached as a summary (`describePage`).
- A spec-local copy of a shared check or step helper (the profile's `api.exemplars.checks` and `api.exemplars.steps`, the area's `*Steps.ts`) is a finding: import the shared one.
- Tests that differ only in their data share one template (`checkStatusAndMessage`, `checkRejectedBody`, `checkValidationRedirect`, or a `check...` in the spec) called from a literal `test()` per scenario. Copied test bodies are a finding, and so is a loop that generates tests (the validator can't see their titles).
- An "every item" loop over a response list starts with `expectSomeItems`.
- A redirect's expected `Location` comes from `config.apiBaseUrl`, never a hard-coded host.
- A test that can outlive the token's 5 minutes (the PDF polls) uses the role fixtures, which read the token for each request; a token the test got itself (`xClientForToken(token)`) expires.
- A secret (a test user's email, a password, a token) is compared as a condition (`expect(a === b, message).toBe(true)`), never with a matcher whose diff prints it.
- Happy paths go through a service; any step that checks a status code (including `200`) uses the client and asserts `response.status`.
- Clients and services come from fixtures; specs never construct them, call `fetch` or `request.get`.
- A status check also checks the body the scenario names (the error message, the field errors); a status alone where the step names a message is a weakened check.
- Records the test creates are removed with `cleanup.add(...)`, registered right after the create succeeds, not in `afterAll` or at the end of the test.
- Create and update payloads come from the area's factory, with `uniqueName` for every created record; no hand-written payload objects repeated across tests.
- A user-changing test uses a throwaway customer (`registerThrowawayCustomer` or the factory), never a shared user or the admin.
- A list check that filters by a field (brand, category) is safe next to the write specs: test-created records can appear in it (see `PRODUCT_NAME_PREFIX` in the factory).

## Clients, services, DTOs

- Client methods map 1:1 to endpoints and send through `BaseClient.executeRequest`; services parse and throw on non-2xx.
- DTOs match the contract: optional fields marked optional, no `any`.
- New clients and services are registered in the API fixtures (the profile's `api.exemplars.fixtures`).

## Contracts

- A contract fact the change tagged `_(verified)_` is one a test in the change actually checked against the live API (the status code and, where the line says so, the body). A fact the tests don't check stays `_(source)_` or `_(spec)_`.
- An endpoint a new spec calls is in its contract (conventions "Contracts").
