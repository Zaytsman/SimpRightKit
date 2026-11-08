---
name: report-bug
description: Record bugs in the app under test as bug files (one per root cause, published on the portal's Bugs page) and link the scenarios that hit them, with a checkpoint where the user approves the draft before any file is written. Also imports a contract's suspected bugs and re-checks open bugs, closing the fixed ones. Use when the user asks to report, file, log or record a bug, to turn a known issue or a failing test into a bug, to import suspected bugs, or to re-check bugs, e.g. "/report-bug the cart accepts quantity 0", "/report-bug UI-024 UI-025", "/report-bug import Users_API.md" or "/report-bug recheck BUG-005".
argument-hint: "<description | scenario IDs | spec> | import <contract> | recheck <bug IDs | open>"
---

# Report bugs

The work is done by the `bug-reporter` subagent, in two phases: a draft, then the files. Your part: settle the brief, run the draft, check it and get the user's approval, run the writing, then check and report. A subagent can't ask the user anything, so the checkpoint happens here.

Arguments, if any: $ARGUMENTS

## How to ask

Before the first question, read `../_shared/how-to-ask.md` (next to this skill's folder) and follow it for every question in this skill.

## 1. Settle the brief

- **Profile:** `simpright.yml` in the repository root. If there's none, or it has no `paths.bugs`, stop: the agent needs both.
- **Mode and input**, from the argument:
  - `import <contract>` (a file in `paths.contracts`, or `all`): **import**.
  - `recheck <bug IDs>` or `recheck open`: **recheck**. The portal's Bugs page flags bugs to re-check; `/heal-tests` reports "unexpectedly passed" known-issue tests.
  - Anything else: **report**: scenario IDs, a spec, a failed test, or a description (pasted text or a file path). For a description, keep the user's words; if it names no page or endpoint and you can't tell which, ask before starting.
  - None: ask what to record.
- **Writes approved:** reproductions that change data (a `POST`, a registration) run only after the user approves them at the checkpoint; carry over approvals the user already gave in this conversation.
- **Notes:** anything else the user said (a severity they want, a scenario they suspect).

## 2. Draft

Start the `bug-reporter` subagent with a brief that stands on its own (it can't see this conversation):

```
Profile: <absolute path of simpright.yml>
Mode: <report | import | recheck>
Input: <the IDs, spec, file path, or the pasted description verbatim>
Phase: draft
Writes approved: <calls or tests the user approved, or "none">
Notes: <or "none">
```

Before showing the draft, check it yourself:
- each "Extends BUG-NNN" and each new bug against the existing bug files: no new bug for a cause an open bug already covers, and no merge of two different causes;
- each "Reproduced: yes" against what it quotes (a status, a field), and that the evidence has no secrets;
- each bug file against the schema's keys and order (the validator will check it too).

Show the draft as the agent returned it. Then ask, in one call:
1. **Items to write:** with one item, "Write it", "Write with edits" (title, severity or wording), "Don't write"; with more, a multi-select of the items. Recommend the items whose reproduction you checked.
2. **Writes** for reproduction, when the draft lists "Writes needed".
3. **Decisions needed:** one question each (closing a bug now or after a re-run, extending a bug or filing a new one, a severity).
4. **Coverage gaps:** "Add the scenario now" (with `/write-api-scenarios-from-steps` or `/write-ui-scenarios-from-steps` from the bug's steps, or `/analyze-requirements <bug file>` for both layers, after this skill), "Later".

## 3. Write

If the user approved any items, continue **the same agent** with SendMessage:

```
Phase: write
Items approved: <numbers, with the user's edits>
Writes approved: <calls or tests, or "none">
Decisions: <the user's answers>
```

If the agent can't be continued, start a new `bug-reporter` with the brief from step 2, `Phase: write`, the draft pasted in full, and the lines above.

## 4. Check and report

1. Run `commands.validateScenarios` and `commands.typecheck` yourself, and `npm run bugs:build` (the Bugs page must still build).
2. Run the specs whose known-issue line changed, once (`commands.runSpec`), if their tests are read-only or their writes approved.
3. Tell the user briefly: the bugs created, extended and closed (ID, title, severity), the scenarios linked, the spec results, writes made and cleaned up, and the coverage gaps.
4. Suggest the next step: for coverage gaps, `/write-api-scenarios-from-steps` or `/write-ui-scenarios-from-steps` (the bug's steps), or `/analyze-requirements <bug file>`; for newly linked automated tests, `/review-tests` on the changed specs; then commit.

Don't commit anything unless the user asks.
