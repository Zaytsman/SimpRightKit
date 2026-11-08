# From steps: API scenarios from the user's test cases

Read by the `simpright-qa:api-scenario-writer` agent when the `/simpright-qa:write-api-scenarios-from-steps` skill starts it with **Steps**. The scope is the user's test cases, not whole endpoints. The agent's rules, "Prepare", "Writing steps" and phases still apply; this file replaces its endpoint checklist ("Choosing scenarios") except where it points back to it.

- **Read the input.**
  - Text: split it into test cases (numbered or titled cases, or one request with its expected result each).
  - JSON: a request body with its expected response is one test case; the method, path and role come from the file names or the user's text (the brief says them when the skill asked).
  - Bruno `.bru` files: `meta` (name, order), the method block (`get`, `post`, ...: the URL), `params:query`, `headers`, `body:json` (the request), `auth:*` (who sends it, never the value), `vars:pre-request` and `{{variables}}` (data to describe, not to copy), `assert` and `tests` (the expected results) and `docs` (context). `collection.bru` and `folder.bru` give the shared auth. A Bruno JSON export holds the same per request. Skip `environments/`.
- **Candidates:** one scenario per test case. A case that sends several requests (create, then read) is one scenario in the file of the endpoint it tests, with the other requests as setup steps; when it's unclear which endpoint that is, use the last request with checks and say so under "Decisions needed". A case that checks unrelated things (two requests with their own expected statuses) is proposed split, as a decision.
- **Keep the user's intent and order;** change only what the conventions need:
  - The request becomes the action step: the method and the path with `{param}` names, the body described by its fields. Keep literal values only when they're stable (seeded values in the project's test data, enum values, a deliberately invalid value the case is about); otherwise describe them ("a unique product name", "an existing product's id, taken from GET /products"). Never copy record ids from URLs: they can change (the profile's `agents.liveApi.transient` says when, such as a periodic data reset).
  - Auth becomes `role`, or "without an Authorization header" / "with an invalid token" in the step.
  - The expected response becomes `Verify` steps: the status first, then one step per field the case expects (a value, a type, presence, a number of items). Fields whose value changes between runs (ids, timestamps, tokens, generated numbers, totals over shared data) are checked for presence or type, never by value. Never compare the whole body. List every expected field you didn't turn into a value check, with the reason, under "Left out of response checks".
  - A request that creates, changes or deletes a record gets a read-back `Verify` step (see the agent's "Writing steps") when the contract has an endpoint to read it with; say so when the user's case had none.
- **Against the contract**, for each scenario:
  - the endpoint isn't in any contract: a decision ("add it with `/simpright-qa:write-api-contracts` in update mode, or go on"), and the scenario is `unconfirmed`;
  - the case expects a status, field or rule the contract contradicts (the case expects 422, the contract says 404): a decision, never a silent choice: a possible bug (the scenario asserts the case and gets a proposed `knownIssue` and `bug`) or an outdated case (the scenario follows the contract);
  - an existing scenario sends the same request with the same trigger but expects something else (usually what the contract says): it isn't "already covered", it's the same decision, naming that scenario. The "possible bug" option then means changing the existing scenario (its `Verify` steps, plus `knownIssue` and `bug`) instead of adding a new one, because two scenarios must never assert opposite results; propose the change as a decision, and make it in the `write` phase only when the user explicitly approves it (the exception to the agent's rule 2);
  - the contract is silent about what the case expects: keep the check and mark the scenario `unconfirmed`;
  - the origin is the tag of the contract fact the scenario matches.
- **Filter:** drop what an existing scenario already covers (same endpoint, status code and trigger) and list it as "already covered" with its ID. Flag `writes` and `dangerous` as in the agent's checklist. Don't add candidates the user's cases don't ask for; mention obvious gaps once under "Decisions needed" (they belong to `/simpright-qa:write-api-scenarios-from-contract`).
- **`ref`** is the brief's `Ref`; with "none", leave `ref` out.
- **Proposal:** put the source in the "Request (trigger)" column (`#3: no token`, `Bruno Carts/Add item: no token`), and add these sections before "Summary":

  ```
  ## Source map
  | Test case | Scenarios | Not turned into a scenario (why) |
  |---|---|---|

  ## Left out of response checks
  - <scenario ID>: <field>: <why (changes every run, not in the contract, ...)>

  ## Secrets found in the input
  - <file and block, never the value>, or "none"
  ```
