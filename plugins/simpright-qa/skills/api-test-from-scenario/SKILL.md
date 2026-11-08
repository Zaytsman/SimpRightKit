---
name: api-test-from-scenario
description: How to write an API test spec from a scenario file. Preloaded into the api-test-engineer agent.
user-invocable: false
---

# API spec from a scenario file

Copy the structure of the exemplar spec (`api.exemplars.spec` in the profile) and follow the spec conventions in the project's conventions files; the scenario validator checks the parts marked "(checked)".

## File

- One spec per scenario file, with the same name, in the same layer and area folders under the tests path: `test-scenarios/api/products/put-products-by-product-id.yml` → `tests/api/products/put-products-by-product-id.spec.ts`. (checked)
- The comment `// Scenarios: <scenario file path>` at the top. (checked)
- Imports only from the project's fixtures entry point, the DTOs, the test-data modules and the assertion helpers (`api.exemplars.helpers`); no direct construction of clients or services.
- One `test.describe('<the file's tags joined by spaces> - <suite>')`. (checked)

## Tests

- One `test('<ID>: <name>')` per scenario, with the name verbatim (escape quotes the way the exemplar does). (checked)
- A scenario with `role` runs as that role: when every scenario in the file has the same role, set it once with `test.use({ role })` inside the describe; otherwise wrap that one test in an anonymous `test.describe(() => { test.use({ role: '<role>' }); test(...) })`.
- A scenario with `tags` (`["@smoke"]`): the test gets Playwright's tag option and keeps its title: `test('<ID>: <name>', { tag: '@smoke' }, async (...) => ...)`. A smoke test only makes writes it cleans up itself.
- A scenario with `knownIssue`: the profile's `api.knownIssue` snippet with the scenario's `bug` ID and the text verbatim goes right before the test's first `test.step`, after any setup code in the body (setup helpers such as `createBrand` or `registerThrowawayCustomer`), so a failed setup is a real failure, not "bug still present". With no setup it's the first line.
- Tests in a file run in parallel and each file runs on its own: no state shared between tests, no order between them.
- State shared between steps goes in `let` variables at the top of the test; values only this test uses are `const`s there too.
- **Reuse first:** before writing a helper, look in the shared checks (`api.exemplars.checks`), the step helpers (`api.exemplars.steps`) and the area's `*Steps.ts`; a spec never redefines one. Tests whose bodies differ only in their data go through one template function that takes the step titles and the data (shared ones: `checkStatusAndMessage`, `checkRejectedBody`, `checkValidationRedirect`), called from a literal `test('<ID>: <name>', ...)` per scenario. Never generate tests in a loop: the validator finds titles only in literal calls.

## Steps

One `test.step('<step text verbatim>', ...)` per scenario step, in order.

**Action steps** (everything that isn't a `Verify` step):
- Make the call. When the next steps check the status of this call, use the client; when the step is setup (taking ids from a list, creating a record to work on), use the service, which fails the step with a clear error if setup breaks.
- Attach what was sent and what came back with the helpers, never with the runner's attach API directly, so secrets are masked: a call whose status a step checks goes through `sendAndAttach('<Name>', request, () => client.x(...))`, which attaches both and returns `{ request, response }`; other attachments use `attachJson`. Name the token in the request record with the shared `AUTH` labels, and attach a page that may list other visitors as a summary (`describePage`). Parse a body with `parseJson(request, response)`, never `JSON.parse`.
- Assert only what's needed to continue (a setup call succeeded), and with a message.
- **Created records:** register their removal right after the call that creates them, in the same step: `cleanup.add(() => <service>.delete(id))`, using a fixture with the role allowed to delete. When the creating call is the one under test (or a known issue that may create a record), register cleanup only when the response shows the record was created.
- Payloads come from the area's factory; names from the unique-name helper; shared seeded values from the constants module.

**Verify steps:**
- Hold the checks, in the order the step lists them. They may read (a GET) when the step says so; they never write.
- Every assertion passes `assertMessage({ request, expected, actual })`; a bare `expect` without a message is forbidden. `expected` says the check in words, `actual` shows the value or the relevant part of the body.
- A status step is `expectStatus(request, response, <code>)`, or `expectStatusAndBody` when later steps read the body. An "every item" check starts with `expectSomeItems(request, items, '<what>')`, so an empty list can't pass.
- Compare secret values (a test user's email) as a condition, `expect(a === b, message).toBe(true)`, so a failure diff never prints them.
- Check exactly what the step says: "the body has a name key with at least one message" checks that key and that it's a non-empty array, not the message text. Don't add checks the step doesn't ask for.

## Things that bite

- **Server-side caching:** when the contract says responses are cached, never read a record before changing it in the same test, or a later read may return the cached copy. Read back only records the test created.
- **Parsing:** parse a body only after checking its status; a failed request may return HTML or an empty body.
- **Status codes:** compare with `toBe(<code>)`; don't accept a range unless the scenario does.
- **Time:** wait for a condition the API exposes, never a fixed sleep.
