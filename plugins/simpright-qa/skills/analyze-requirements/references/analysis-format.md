# Analysis document format

One markdown file per work item in the profile's `paths.analysis` folder, written by the `requirements-analyst` agent from the approved analysis. Keep it short: a reader should understand the work item and its tests in two minutes. Leave out sections that would be empty, except "Test plan".

````md
# <Work item title>

<!-- Written by the requirements-analyst agent (/analyze-requirements). Source: <path or "pasted text"> -->

| | |
|---|---|
| **Source** | [<file name>](<relative link to the document>) or "pasted text, <date>" |
| **Type** | User story / Bug / Feature |
| **Criteria in scope** | AC1-AC14 (all) |
| **Analysed** | <yyyy-mm-dd> |

## Summary

<3-6 sentences: who wants what and why, and the main rules. For a bug: what's broken, where, and the impact.>

## Acceptance criteria

- **AC1 – <title>**: Given <state>, when <action>, then <outcome>.
- ...

(For a bug: **Steps**, **Expected**, **Actual**, one line each.)

## What it touches

- **API:** `GET /products/{productId}` ([Products_API.md](<relative link>) §3), ...
- **UI:** the product page (`/product/<id>`), the cart page.
- **Data:** a product with a discount, an out-of-stock product, a logged-in customer.

## Test plan

API first: a check goes to the UI only when the API can't prove it ([layer rules](<relative link to layer-rules.md>)).

| Item | Criterion | What to check | Layer | Why this layer | Flags | Scenarios |
|---|---|---|---|---|---|---|
| T1 | AC1 | ... | API | ... | | pending |
| T2 | AC2 | ... | UI | ... | data | pending |

**Not tested:** <criterion: reason>, or "none".

**Totals:** <n> items: <a> API, <u> UI; <c> already covered by existing scenarios.

## Open questions

- <questions the user left open, contract gaps, document vs app mismatches>

## Notes

- <decisions the user made at the checkpoint, existing UI scenarios that could move to the API, known issues>
````

The "Scenarios" column starts as `pending`. After the scenario writers finish, it lists the scenario IDs written for each item (`API-0114, API-0115`), or `UI-018 (existing)` for an item an existing scenario covers. Links are relative to the analysis folder.
