---
name: review-tests
description: Review automated UI and API tests (specs and the page objects, flows, fixtures, clients, services and test data they use) against their scenarios and the project's conventions, then apply the findings the user picks. Use when the user asks to review tests, specs, a scenario file's automation or unpushed test work, e.g. "/review-tests", "/review-tests product-detail.spec.ts", "/review-tests 055e6d4" or "/review-tests UI-013..017".
argument-hint: "[spec | scenario file | IDs | area | commit | range]"
---

# Review tests

The review is done by the `test-reviewer` subagent, which only reads and reports. Your part: settle what to review, run the review, show the findings, and apply the ones the user picks. Keeping the reviewer read-only keeps it independent of the fixes.

Arguments, if any: $ARGUMENTS

## How to ask

Before the first question, read `../_shared/how-to-ask.md` (next to this skill's folder) and follow it for every question in this skill.

## 1. Settle the target

- **Profile:** `simpright.yml` in the repository root. If there's none, stop: the reviewer needs one.
- **Change and files**, from the argument:
  - **None:** the work not pushed yet: uncommitted changes plus the commits on the current branch that its upstream doesn't have (`git status`, `git log @{u}..HEAD`). Change: `<upstream>..HEAD` and/or `working tree`. If there's nothing, say so and ask what to review: the last commit, an area or a spec.
  - **A commit or range** (`055e6d4`, `abc123..def456`): the files it touches. Change: `<sha>^..<sha>` for one commit, the range as given otherwise.
  - **A spec, a scenario file, IDs or an area:** the spec files they map to (a scenario file → the spec with the same name; IDs → the specs in their `automatedIn`; an area → every spec in `tests/<layer>/<area>/`). Change: `files`. Only `automated` scenarios have tests; say which IDs were skipped as `manual`.
- Keep the files that are test code: specs, and what tests use under `src/` (pages, components, dialogs, flows, fixtures, clients, services, DTOs, factories, constants, helpers), plus the scenario files of the specs. Leave out docs, contracts, workflows, `.claude/` and `package*.json`, and say they weren't reviewed.
- **Layers:** `ui` for `tests/ui/` and `src/ui/`, `api` for `tests/api/` and `src/api/`, `shared` for the rest of `src/`. The checklists follow: `references/common.md` always, `references/ui.md` and `references/api.md` for the layers present (both for `shared` only).
- **Size:** more than about 15 files or 30 tests makes a review shallow. Ask: "One area or commit at a time (Recommended)" (name the first one), "All of it".

## 2. Review

Start the `test-reviewer` subagent with a brief that stands on its own (it can't see this conversation):

```
Profile: <absolute path of simpright.yml>
Change: <range | working tree | both | files>
Files:
- <absolute path> (<ui | api | shared>)
Checklists: <absolute paths of the checklist files>
Notes: <what the user asked to focus on or ignore, or "none">
```

## 3. Show the findings

Show the report as the agent returned it. Before you show it, check each blocker yourself against the code (open the file at the line); if one doesn't hold, drop it and say you dropped it and why.

Then ask which findings to apply, in one multi-select question (each finding with its number and short title; with more than 4, the groups "All blockers", "All should fix" and "All"). With no findings, say so and ask nothing.

## 4. Apply the chosen findings

1. Make the changes yourself, in the project's style. Don't touch scenario steps or names: a finding about the scenario goes back to the user.
2. Run `commands.typecheck` and `commands.validateScenarios`.
3. Run the specs the changes touch with `commands.runSpec`, and `commands.repeatSpec` when a wait or a locator changed. A spec that writes data is run only if the user approved its writes before (the profile's `liveApi.writes`); otherwise ask: "Run it", "Don't run it", with what it writes and its cleanup in the descriptions.
4. Report: the findings applied, the ones left and why, and the test results.

Don't commit anything unless the user asks.
