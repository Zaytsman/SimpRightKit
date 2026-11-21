# Bugs

One file per bug in the app under test, named after its ID (`BUG-001.yml`, one number sequence for all bugs; `npm run validate:scenarios` prints the next free one). One bug per root cause: the scenarios that hit it name it in `bug`, next to their `knownIssue`.

The format is the bug schema of [`@simpright/scenarios`](https://github.com/Zaytsman/SimpRightKit/tree/main/packages/scenarios) (`paths.bugSchema` in `simpright.yml`). Its keys, in this order: `id`, `title`, `status` (`open`, `fixed`, `wont-fix`), `severity`, `layer`, `area`, `affects`, `found`, `resolved` (exactly when not open), `ref`, `upstream`, `description`, `steps`, `expected`, `actual`, `evidence`. Start each file with the schema line, so your editor checks it as you type:

```yaml
# yaml-language-server: $schema=../node_modules/@simpright/scenarios/schemas/bug.schema.json
id: BUG-001
title: Product list returns 500 for an unknown sort column instead of a client error
status: open
severity: major
layer: api
area: products
affects:
  - GET /products
found: 2026-10-02
steps:
  - Send GET /products?sort=unknown.
expected: A 4xx client error naming the sort column.
actual: 500 Internal Server Error.
```

The rules, such as what changes when a bug is fixed, are in `docs/framework/conventions.md`; [SimpRight's bugs](https://github.com/Zaytsman/SimpRight/tree/main/bugs) are fuller examples. This README keeps the folder in git until your first bug; the validator reads only the `.yml` files.
