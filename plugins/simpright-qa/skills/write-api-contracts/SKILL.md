---
name: write-api-contracts
description: Write new API contracts, or update existing ones after the API changed (the markdown files in the project's contract folder that the scenario writer reads and the API coverage report measures tests against), from an OpenAPI spec, the service's source code, or both. Use when the user asks to document an API, create API contracts, fill gaps in them, or update/sync/refresh them because endpoints were added, removed or changed, e.g. "/write-api-contracts ../practice-software-testing/sprint5/API carts".
argument-hint: "[update] [source path] [spec file or URL] [areas]"
---

# Write API contracts

The user wants API contracts written or updated. The work itself is done by the `api-contract-writer` subagent, so that reading a large codebase doesn't fill this conversation. Your part: settle the brief, delegate, then check and report the result.

Arguments, if any: $ARGUMENTS

## How to ask

Before the first question, read `../_shared/how-to-ask.md` (next to this skill's folder) and follow it for every question in this skill.

## 1. Settle the brief

- **Profile:** `simpright.yml` in the repository root. If there's none, stop: the agent needs one (the contract folder, the format specification, the commands and the live-API guardrails).

Work out each other item from the arguments, the conversation and the project. Look before asking.

| Item | Where to look | Default |
|---|---|---|
| **Mode** | `update` only when the user explicitly asks to update, sync or refresh the contracts, or says the API changed (new, removed or changed endpoints). Otherwise `create`, which writes missing contracts and fills gaps but never removes anything | `create` |
| **Source code** | A path in the arguments or conversation; a sibling repository | None |
| **OpenAPI spec** | A file or URL in the arguments; `openapi.json`, `api-docs.json` or `swagger.json` in the source; the API's docs page | None |
| **Areas** | The arguments ("products and users"), the test scenarios in the project | All areas |
| **Base URL for live checks** | The project's environment config for API tests | None |
| **Live checks allowed?** | Only the user can say | No |
| **Writes allowed?** | Only the user can say; the profile's `liveApi.writes` sets the project's default (`ask` means ask) | No |
| **Token variable** | Only the user can say (the name of an environment variable holding a token, never the token itself) | None |

At least one input (source or spec) is required. In `update` mode the contract folder (`paths.contracts`) must already have contracts; if it's empty, say so and use `create`.

For an update with a spec, you can show the user what changed before delegating: the profile's `commands.diffContracts` with the spec (`--tags ...` to limit the areas) lists the added, removed and changed endpoints in seconds. If the user only wanted to know whether the contracts are out of date, that answer may be enough. Then ask, in one call, whatever you couldn't settle: always **Live checks** against the base URL, unless the user already said: "Read-only", "Read and write", "None" (recommend "Read-only" for a test environment and "None" for production). Add one question for each other open item (the mode, the source, the spec, the areas), with the candidates you found as options.

Also check that the contract commands can run (`npx --no-install playwright-api-coverage --help`). They come from the optional coverage package. If it isn't installed, tell the user: the agent can still write contracts from the source, but it can't convert a spec or validate its work.

## 2. Delegate

Start the `api-contract-writer` subagent with a brief that stands on its own (it can't see this conversation):

```
Profile: <absolute path of simpright.yml>
Mode: <create | update>
Inputs: source <absolute path or "none">; spec <path or URL or "none">
Areas: <list or "all">
Live checks: <"not allowed" | "read-only against <base URL>" | "read and write against <base URL>">
Token variable: <NAME or "none">
Notes: <anything the user said that matters: areas to skip, known quirks, conventions>
```

For a large API (more than about six areas), start one subagent per group of areas, in parallel, each with its own areas and the same folder. Tell each which areas the others own, so they don't write the same files.

## 3. Check and report

When the subagent finishes:

1. Run the profile's `commands.validateContracts` yourself and confirm there are no errors (or say it couldn't run without the package).
2. Tell the user, briefly: the files written or changed, endpoint counts, the `validate` summary, how many status codes are verified, from source or from the spec only, and the subagent's findings (disagreements between the spec and the code, suspected bugs, what it couldn't determine). After an update, lead with the change log: endpoints added, removed and changed, and the verified facts that need re-checking. Removed endpoints matter most, because tests that call them will now fail or show up as undocumented calls.
3. Suggest the next step: review the diff of the contract folder, then propose scenarios for the new or changed endpoints with `/write-api-scenarios-from-contract <contract>`. The coverage report shows the documented status codes the tests don't cover yet.

Don't commit anything unless the user asks.
