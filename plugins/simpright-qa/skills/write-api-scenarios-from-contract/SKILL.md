---
name: write-api-scenarios-from-contract
description: Propose and write API test scenarios (YAML files in the project's scenario folder) from an API contract document, with a checkpoint where the user approves the proposal before any file is written. Use when the user asks to write, propose or fill gaps in API test scenarios for an API area or contract, e.g. "/write-api-scenarios-from-contract Products_API.md". For test steps, requests or a Bruno collection, use write-api-scenarios-from-steps.
argument-hint: "<contract document> [endpoint ...]"
---

# Write API scenarios from a contract

The work is done by the `api-scenario-writer` subagent, in two phases: a proposal, then the files. Your part: settle the brief, run the proposal, get the user's approval, run the writing, then check and report. A subagent can't ask the user anything, so the checkpoint happens here.

Arguments, if any: $ARGUMENTS

## How to ask

Before the first question, read `../_shared/how-to-ask.md` (next to this skill's folder) and follow it for every question in this skill.

## 1. Settle the brief

- **Profile:** `simpright.yml` in the repository root. If there's none, stop: tell the user the agent needs a profile (paths, ID codes, roles), and that the conventions (`docs/framework/conventions.md`) and the profile's schema describe it.
- **Contract:** the first argument, resolved in this order: an existing path as given; `<paths.contracts>/<name>` from the profile; a case-insensitive match of the name (with or without `.md`) in that folder. If nothing matches, or no argument was given, ask which contract.
- **Endpoints:** the remaining arguments (`GET /products/{productId}`, or just paths, which mean every method on them). Default: every endpoint in the contract. For a contract with more than about 8 endpoints, say how many there are and ask: "All of them", "A subset" (the endpoints in "Other").
- **Notes:** anything the user said that matters (endpoints to skip, priorities, things they know about the API).

## 2. Proposal

Start the `api-scenario-writer` subagent with a brief that stands on its own (it can't see this conversation):

```
Profile: <absolute path of simpright.yml>
Contract: <absolute path>
Endpoints: <list or "all">
Phase: propose
Notes: <or "none">
```

Show the user the proposal as the agent returned it: the tables, the steps and "Decisions needed". Don't shorten the steps, because they are what the user approves. Then ask, in one call:
1. **Proposal:** the approval question (edits: drop, rename, merge or reword).
2. **Decisions needed:** one question each.

When the agent proposes nothing new (everything is already covered), say so and ask only its decisions, if any.

If the user approves a new area, add it to `ids.areas` in the profile yourself before the writing phase (the agent doesn't change the profile).

## 3. Writing

Continue **the same agent** with SendMessage:

```
Phase: write
Approved, with these edits: <the user's edits and decisions, or "none">
```

If the agent can't be continued, start a new `api-scenario-writer` with the brief from step 2, `Phase: write`, and the approved proposal pasted in full, followed by the edits.

## 4. Check and report

1. Run the profile's `commands.validateScenarios` yourself and confirm it passes.
2. Tell the user briefly: the files created and extended with their IDs, the validator result, the flagged scenarios (writes, dangerous, known issues, unconfirmed), any ID renumbering, and what the agent noticed but didn't change.
3. Suggest the next step: review the diff of the scenario folder, then implement the scenarios with `/implement-api-scenarios <file or IDs>`.

Don't commit anything unless the user asks.
