---
name: api-scaffolding
description: How to add the clients, services, DTOs, fixtures and test data a scenario needs. Preloaded into the api-test-engineer agent.
user-invocable: false
---

# API scaffolding

Add only what the approved plan lists as new, and copy the style of the exemplar files in the profile's `api.exemplars`: their naming, comments, imports and structure. Running this twice must change nothing the second time: look before adding, and reuse what exists.

## Clients (exemplar: `api.exemplars.client`)

- One client per API area, one method per endpoint, mapping 1:1: the method sends the request and returns the raw response. No parsing and no status checks in clients.
- Name methods after the operation (`list`, `getById`, `create`, `update`, `patch`, `delete`, `related`), with path parameters, query parameters and the body as arguments, typed with DTOs.
- All HTTP goes through the base client's request method, never a direct call to the runner's request API or `fetch`.
- If the base client lacks an HTTP method the contract uses (for example `QUERY`), adding it is an additive change to the base client: extend the method type and add a method in the same style as the others.

## Services (exemplar: `api.exemplars.service`)

- Happy-path operations built on a client: they expect success, parse the body into a DTO and throw with the status and the start of the body otherwise.
- Add a service method only when a step uses that endpoint as a happy path or as setup or cleanup. A step that checks a status code uses the client, not the service.

## DTOs (exemplar: `api.exemplars.dto`)

- Request and response types from the contract's shapes: optional fields with `?`, nullable ones with `| null`, nested objects as their own interfaces when the contract defines them.
- Add new types freely. Change an existing field's type only to make it more precise, when the contract documents it and the typecheck still passes, and report the change.

## Fixtures (exemplar: `api.exemplars.fixtures`)

- Register every new client and service in the fixtures file, built the way the existing ones are, and grouped and commented like them (which ones carry a token, for which role).
- Tests never construct clients or services, and never call a token setter on a shared fixture. When tests need a different authentication (no token, an invalid token, or a fixed role such as an admin for cleanup), add a dedicated fixture that builds its own client: a fixed role gets its token from the project's token service, read for each request (`roleToken`), so a long test never sends an expired token.

## Test data (exemplars: `api.exemplars.constants`, `api.exemplars.testDataUtils`)

- A seeded value that more than one test relies on goes in the constants module, in its area group. A value one test uses stays a variable in that test.
- Create and update payloads come from a factory per area in the test-data folder's `factories/` (`<Area>Factory.ts`), created with the first scenario that needs it: a function that builds a valid create request (with the unique-name helper for every name) from the ids the test passes in, with optional overrides; and builders for the invalid payloads the scenarios describe (too long, wrong type, missing fields).
- Factories never call the API and never hard-code ids of seeded records: ids that must exist are looked up by a test step, as the scenario says, and passed in.

## Keep it small

- No abstraction for a single call site, and no helper a scenario doesn't need yet.
- **Shared setup steps:** a helper that runs setup steps (for example "take the ids from the list, create a record to work on") starts inside the one spec that uses it. When a second spec needs the same steps, move the helper to a shared module next to the fixtures and import it in both specs, instead of copying it. Keep the step titles as parameters or constants, so each spec's step titles still match its scenarios verbatim. The same for checks and send helpers: one that a second spec needs moves to the shared checks (`api.exemplars.checks`), the step helpers (`api.exemplars.steps`) or the area's `*Steps.ts`.
- Additive changes only to shared files: no renamed or removed exports, no changed signatures or behaviour.
- A new test folder or scenario area may need entries elsewhere: follow the conventions files (for example CI workflow options and the profile's `ids.areas`), and list what you changed.
