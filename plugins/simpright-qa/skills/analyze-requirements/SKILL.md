---
name: analyze-requirements
description: Analyse a user story, bug report or feature description, write a short analysis document with a test plan that puts each check on the API or the UI (API first, because it's cheaper and faster), then have the scenario writers turn the plan into API and UI scenarios. Two checkpoints - the user approves the plan, then the scenarios. Use when the user asks to analyse a story or bug, plan its tests, or create test cases for both layers from a work item, e.g. "/analyze-requirements Product_Detail.md" or "/analyze-requirements BUG-45.md".
argument-hint: "<story or bug file | pasted text> [AC ...]"
---

# Analyse a work item and plan its tests

Three agents do the work: the `requirements-analyst` writes the analysis and the test plan, then the `api-scenario-writer` and the `ui-scenario-writer` write the scenarios for the items on their layer. Your part: settle the brief, run the agents, hold the two checkpoints with the user, then check and report. A subagent can't ask the user anything or start other agents, so the checkpoints and the hand-offs happen here.

Arguments, if any: $ARGUMENTS

## How to ask

Before the first question, read `../_shared/how-to-ask.md` (next to this skill's folder) and follow it for every question in this skill.

## 1. Settle the brief

- **Profile:** `simpright.yml` in the repository root. If there's none, stop: tell the user the agents need a profile (paths, ID codes, roles), and that the conventions (`docs/framework/conventions.md`) and the profile's schema describe it.
- **Document:** the first argument, resolved in this order: an existing path as given; `<paths.userStories>/<name>` from the profile; a case-insensitive match of the name (with or without `.md`) in that folder. If the user pasted the work item into the conversation instead, use the text. If there's neither, ask which story file.
  - Pasted text: ask once: "Save it in the stories folder first (Recommended)" (so the analysis and the scenarios can link to it), "Use the text as is".
  - Only local files and pasted text are supported; a link to a tracker (Azure DevOps, Jira) is not fetched. Ask the user to paste the work item's text.
- **Criteria:** the remaining arguments (`AC3 AC8`, `AC1-AC5`). Default: every criterion.
- **Notes:** anything the user said that matters (criteria to skip, known bugs, a layer they want).

## 2. Checkpoint 1: the analysis

Start the `requirements-analyst` subagent with a brief that stands on its own (it can't see this conversation):

```
Profile: <absolute path of simpright.yml>
Document: <absolute path, or "pasted:" followed by the full text>
Criteria: <list or "all">
Layer rules: <absolute path of references/layer-rules.md in this skill>
Analysis format: <absolute path of references/analysis-format.md in this skill>
Phase: analyze
Notes: <or "none">
```

Show the user the analysis as the agent returned it: the summary, the test plan table, "not tested" and "Decisions needed". Then ask, in one call:
1. **Analysis:** the approval question (edits: move an item to the other layer, drop or reword items).
2. **Decisions needed:** one question each; a contract gap is one too: "Fill the contract first", "Go on without it".

If a decision is a **contract gap** the user wants filled first, run the `write-api-contracts` skill's steps for that area after the analyst's `write` phase and before checkpoint 2 (ask its questions: the scope, usually the whole area, and live checks), then continue here; the analysis doesn't need to be re-run, because its items name the endpoints. If the user approves a new area or role, add it to `ids.areas` or `roles` in the profile yourself (the agents don't change the profile).

Then continue **the same agent** with SendMessage:

```
Phase: write
Approved, with these edits: <the user's edits and decisions, or "none">
```

If it can't be continued, start a new `requirements-analyst` with the brief above, `Phase: write`, and the approved analysis pasted in full, followed by the edits. Its report holds the document's path and the approved API and UI items.

## 3. Checkpoint 2: the scenarios

Start the writers for the layers that have new items (skip a layer with none, and items marked as already covered), **in parallel**, each with a brief that stands on its own:

```
Profile: <absolute path of simpright.yml>
Contract: <absolute paths of the contracts the API items name>          (api-scenario-writer only)
Document: <absolute path of the work item, or "pasted:" with the text>   (ui-scenario-writer only)
Analysis: <absolute path of the analysis document>
Items: <the analyst's API items or UI items, pasted as reported>
Phase: propose
Notes: <the user's decisions that matter to this layer, or "none">
```

Show the user both proposals together, API first, as the agents returned them (don't shorten the steps: they are what the user approves). Then ask, in one call: the approval question for each layer that has a proposal (**API scenarios**, **UI scenarios**), and one per decision either writer left. Write nothing for a layer before its yes. Then continue each writer with SendMessage:

```
Phase: write
Approved, with these edits: <the user's edits for this layer, or "none">
```

If a writer can't be continued, start a new one with its brief, `Phase: write`, and its approved proposal pasted in full, followed by the edits. The writers number IDs per layer, so they never collide.

## 4. Link, check and report

1. Fill in the analysis document's "Scenarios" column yourself from the writers' reports: the IDs written for each item, `<ID> (existing)` for items an existing scenario covers, and `dropped at review` for items the user dropped at checkpoint 2. Update the totals with the new scenarios and their file, and the parts that are out of date now: a contract gap that was filled (and the new contract sections), an area that was added, a decision changed at checkpoint 2.
2. Run the profile's `commands.validateScenarios` and confirm it passes.
3. Tell the user briefly: the analysis document, the scenario files created and extended with their IDs per layer, the API/UI split, the validator result, the flagged scenarios (writes, data, dangerous, known issues), what's not tested and why.
4. Suggest the next step: review the diff (`docs/analysis/` and the scenario folder), then automate, API first: `/implement-api-scenarios <files or IDs>`, then `/implement-ui-scenarios <files or IDs>`.

Don't commit anything unless the user asks.
