# How to ask

Shared by the QA skills (`/analyze-requirements`, `/write-api-scenarios-from-contract`, `/write-*-scenarios-from-steps`, `/implement-*-scenarios`, `/review-tests`, `/heal-tests`, `/report-bug`, `/write-api-contracts`). Each skill reads this file before its first question and says which questions it asks at its checkpoints; these rules say how, so a skill doesn't repeat them.

Every question to the user goes through the AskUserQuestion tool:
- Show what the question is about (the plan, the proposal, the findings, the diagnosis, the failures) as text first, as the agent returned it; the question itself stays short.
- 2–4 options per question, at most 4 questions per call; more questions go in further calls. The tool adds "Other" for free text, so edits, wording changes and lists of IDs or numbers go there; don't add an option for it.
- Put an option first and mark it "(Recommended)" only when the agent's report or your own check supports it, and say why in its description. When it's the user's judgment call, recommend nothing.
- Use a multi-select when the choices aren't exclusive (findings to apply, items to write, causes to fix): one option per item when there are up to 4; with more, options for groups ("All blockers", "All", "None") and the numbers through "Other".
- If the tool isn't available (a headless run), ask the same questions in one plain-text message with the options listed.

The common questions:
- **Approval** of a plan, proposal, analysis or draft: "Approve", "Approve with edits" (the edits go in "Other"), "Rework" (what's wrong goes in "Other"). Recommend "Approve" unless the agent left open assumptions or decisions that change its shape. "Approve" or "Approve with edits" is the clear yes; write nothing before it. On "Rework", continue the agent in its first phase with the user's notes and ask again.
- **Writes on the live app** (the profile's `liveApi.writes` is `ask`): may these tests or calls create, change or delete data? "All of them", "None", and with more than one item "Some" (the IDs in "Other"); with up to 3 items, a multi-select with one option per item instead. Name each cleanup in the description, and what can't be cleaned up. Recommend "All of them" only when every write has a cleanup or the leftovers are accepted for that area.
- **Decisions needed:** one question per decision, with the agent's alternatives as the options and its preference first, marked "(Recommended)" with its reason.
- **Picking an input** (a file, a contract, a run, a subset): up to 4 candidates as options (the most likely or the smallest first), the rest named through "Other".
- **Changes to shared code or to what a test checks:** say so in the option's description, so the yes is explicit.
