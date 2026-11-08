---
name: write-ui-scenarios-from-steps
description: Turn test steps the user describes in plain text (one or more manual test cases, pasted or in a file) into UI test scenarios (YAML files in the project's scenario folder), checking labels and messages in the live app with the read-only page inspector, with a checkpoint where the user approves the proposal before any file is written. Use when the user gives test steps or a manual test case and asks for a UI scenario from them, e.g. "/write-ui-scenarios-from-steps login-steps.md" or "/write-ui-scenarios-from-steps" followed by pasted steps. For a user story, bug report or feature description, use analyze-requirements instead.
argument-hint: "<steps file | pasted text> [ref]"
---

# Write UI scenarios from test steps

The work is done by the `ui-scenario-writer` subagent, in two phases: a proposal, then the files. Your part: settle the brief, run the proposal, get the user's approval, run the writing, then check and report. A subagent can't ask the user anything, so the checkpoint happens here.

Arguments, if any: $ARGUMENTS

## How to ask

Before the first question, read `../_shared/how-to-ask.md` (next to this skill's folder) and follow it for every question in this skill.

## 1. Settle the brief

- **Profile:** `simpright.yml` in the repository root. If there's none, stop: tell the user the agent needs a profile (paths, ID codes, roles), and that the conventions (`docs/framework/conventions.md`) and the profile's schema describe it.
- **Steps:** text only (no screenshots). The first argument when it's an existing file (a `.md` or `.txt` with one or more test cases), otherwise the steps the user pasted into the conversation. If there's neither, ask the user to paste them in their next message (plain text, no options), and wait.
  - A user story, bug report or feature description (acceptance criteria, "As a ..., I want ...") is not a list of steps: say that `/analyze-requirements` is the skill for it, and ask: "Use /analyze-requirements (Recommended)" (it plans API and UI checks), "Treat it as steps anyway".
- **Ref:** the remaining argument, when it looks like an ID or a path (`TC-12`, `US-123`, `docs/...md`). Otherwise, if the text names one (a test case ID or ticket in its title), use that. If there's none, don't ask: the scenarios get no `ref`.
- **Notes:** anything the user said that matters (cases to skip, known bugs, the role to use).

## 2. Proposal

Start the `ui-scenario-writer` subagent with a brief that stands on its own (it can't see this conversation):

```
Profile: <absolute path of simpright.yml>
Steps: <absolute path, or "pasted:" followed by the full text>
Ref: <the ref, or "none">
Phase: propose
Notes: <or "none">
```

The agent runs the page inspector against the live site (read-only; each logged-in run also registers and deletes the run's throwaway customer, like every test run).

Show the user the proposal as the agent returned it: the tables, the steps, the steps map and "Decisions needed". Don't shorten the steps, because they are what the user approves. Then ask, in one call:
1. **Proposal:** the approval question (edits: drop, rename, merge or reword).
2. **Decisions needed:** one question each.

When the agent proposes nothing new (everything is already covered), say so and ask only its decisions, if any.

If the user approves a new area or role, add it to `ids.areas` or `roles` in the profile yourself before the writing phase (the agent doesn't change the profile). A new area also needs a folder option in the custom UI workflow, which the test engineer adds with the first spec.

## 3. Writing

Continue **the same agent** with SendMessage:

```
Phase: write
Approved, with these edits: <the user's edits and decisions, or "none">
```

If the agent can't be continued, start a new `ui-scenario-writer` with the brief from step 2, `Phase: write`, and the approved proposal pasted in full, followed by the edits.

## 4. Check and report

1. Run the profile's `commands.validateScenarios` yourself and confirm it passes.
2. Tell the user briefly: the files created and extended with their IDs, the validator result, the flagged scenarios (writes, data, dangerous, known issues), the user's test cases not turned into scenarios and why, any ID renumbering, and what the agent noticed but didn't change.
3. Suggest the next step: review the diff of the scenario folder, then automate the scenarios with `/implement-ui-scenarios <file or IDs>`.

Don't commit anything unless the user asks.
