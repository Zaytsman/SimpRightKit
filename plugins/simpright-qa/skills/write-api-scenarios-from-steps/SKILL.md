---
name: write-api-scenarios-from-steps
description: Turn API test cases the user already has (steps in plain text, request and expected-response JSON files, or a Bruno collection) into API test scenarios (YAML files in the project's scenario folder), checking each one against the API contracts, with a checkpoint where the user approves the proposal before any file is written. Use when the user gives test steps, a request with its expected response, or a Bruno collection and asks for API scenarios from them, e.g. "/write-api-scenarios-from-steps add-to-cart.md", "/write-api-scenarios-from-steps login-request.json login-response.json" or "/write-api-scenarios-from-steps ../bruno/Toolshop/Carts". For a whole contract, use write-api-scenarios-from-contract.
argument-hint: "<steps file | JSON files | Bruno folder or export | pasted text> [ref]"
---

# Write API scenarios from test steps

The work is done by the `api-scenario-writer` subagent, in two phases: a proposal, then the files. Your part: settle the brief, run the proposal, get the user's approval, run the writing, then check and report. A subagent can't ask the user anything, so the checkpoint happens here.

Arguments, if any: $ARGUMENTS

## How to ask

Before the first question, read `../_shared/how-to-ask.md` (next to this skill's folder) and follow it for every question in this skill.

## 1. Settle the brief

- **Profile:** `simpright.yml` in the repository root. If there's none, stop: tell the user the agent needs a profile (paths, ID codes, roles), and that the conventions (`docs/framework/conventions.md`) and the profile's schema describe it.
- **Inputs:** every argument that is an existing path, plus any steps the user pasted into the conversation. If there's nothing, ask the user to paste the steps or give the paths in their next message (plain text, no options), and wait. Supported:
  - text (`.md`, `.txt`, pasted): one or more test cases with requests and expected results;
  - `.json` files: a request body and an expected response. Pair them by file name (`login-request.json` with `login-response.json`) or by what the user wrote; when a pairing or the method and path of a request isn't clear, ask;
  - a Bruno collection: a folder with `.bru` files (a subfolder for one area), or a Bruno JSON export. Count its requests (`.bru` files other than `collection.bru` and `folder.bru`); with more than about 10, say how many there are per folder and ask: "All of them", "A subset" (folders or requests in "Other").
- **Secrets:** never open a collection's `environments/` folder, `.env` files or the user's Bruno settings; the agent gets only the request files. A request file may still hold a token or password inline: the agent never copies it, and you never quote it.
- **Ref:** the remaining argument, when it looks like an ID or a path (`TC-12`, `US-123`, `docs/...md`). Otherwise, if the input names one, use that. If there's none, don't ask: the scenarios get no `ref`.
- **Notes:** anything the user said that matters (requests to skip, known bugs, the role to use).

A whole API area without test cases is not this skill's job: `/write-api-scenarios-from-contract` covers a contract endpoint by endpoint.

## 2. Proposal

Start the `api-scenario-writer` subagent with a brief that stands on its own (it can't see this conversation):

```
Profile: <absolute path of simpright.yml>
Steps: <absolute paths, one per line (for a Bruno collection the folder or export, and the requests in scope when the user picked a subset), and/or "pasted:" followed by the full text>
Ref: <the ref, or "none">
Phase: propose
Notes: <or "none">
```

Show the user the proposal as the agent returned it: the tables, the steps, the source map, what was left out of the response checks and "Decisions needed". Don't shorten the steps, because they are what the user approves. Then ask, in one call:
1. **Proposal:** the approval question (edits: drop, rename, merge or reword).
2. **Decisions needed:** one question each.

When the agent proposes nothing new (everything is already covered), say so and ask only its decisions, if any.

If a decision is an endpoint missing from the contracts and the user wants it added first, run the `write-api-contracts` skill's steps for that area (update mode) before the writing phase, then continue here. If the user approves a new area, add it to `ids.areas` in the profile yourself before the writing phase (the agent doesn't change the profile).

## 3. Writing

Continue **the same agent** with SendMessage:

```
Phase: write
Approved, with these edits: <the user's edits and decisions, or "none">
```

If the agent can't be continued, start a new `api-scenario-writer` with the brief from step 2, `Phase: write`, and the approved proposal pasted in full, followed by the edits.

## 4. Check and report

1. Run the profile's `commands.validateScenarios` yourself and confirm it passes.
2. Tell the user briefly: the files created and extended with their IDs, the validator result, the flagged scenarios (writes, dangerous, known issues, unconfirmed), the user's test cases not turned into scenarios and why, inline secrets the agent found in the input (where, never the value), any ID renumbering, and what the agent noticed but didn't change.
3. Suggest the next step: review the diff of the scenario folder, then implement the scenarios with `/implement-api-scenarios <file or IDs>`.

Don't commit anything unless the user asks.
