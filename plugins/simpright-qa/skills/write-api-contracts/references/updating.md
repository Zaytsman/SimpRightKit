# Updating existing contracts

Use this when the brief's mode is **update**: the contracts exist, and the API has changed since they were written (new endpoints, removed endpoints, changed fields or errors). The goal is a precise sync, not a rewrite: every change is traceable to a change in the inputs, and everything else in the files stays as it was.

## 1. Find what changed

Build the list of differences before editing anything.

**With a spec**, the package computes it:

```bash
npx playwright-api-coverage diff <contract folder> <spec file or URL> [--tags Product,User] [--json]
```

- It matches endpoints by method and path, ignoring path parameter names (`{id}` = `{productId}`).
- **Added**: in the spec, not in the contracts. **Removed**: in the contracts, not in the spec. **Changed**: query parameters, body fields (added, removed, now required or optional) and status codes.
- With `--tags`, only the contract files that share endpoints with those tags are compared, so other areas aren't reported as removed.
- Exit code 1 just means "there are differences".

Read the status-code part critically: the contracts were curated (generic codes removed, missing codes added from the source), so a spec-only `+405` or a contract-only `-401` is usually not a change in the API. Compare with the diff of the previous spec version if the user has one, or check the source.

**With source code**, build the same three lists yourself:

1. List the current routes (see from-source.md), and list the contracts' endpoints with `npx playwright-api-coverage validate <contract folder> --json` (`files[].endpoints[].id`).
2. Match them by method and path, ignoring parameter names.
3. For endpoints on both sides, compare the validation rules, handler errors and auth with the contract.

If the source is a git repository, narrow the reading to what changed since the contracts were last updated:

```bash
git -C <project> log -1 --format=%cI -- <contract folder>          # when the contracts last changed
git -C <source> log --since=<that date> --name-only --format= -- <source dirs> | sort -u
```

Read the changed route, validation, handler and error files first. Still check the full route list for added and removed endpoints; it's cheap and catches changes made before that date.

A shallow clone (`git -C <source> rev-parse --is-shallow-repository` prints `true`) has no usable history: skip the shortcut, compare every endpoint in scope, and say so in the report.

**With both**, compute both lists, and treat a difference found in only one of them as a finding for the report.

## 2. Apply the changes

| Change | What to do |
|---|---|
| **Added endpoint** | Document it fully (as when creating) in the file for its area. A new area gets a new file. Add it to the `## Endpoints Overview` table. |
| **Removed endpoint** | Delete its section and its overview row only when it's gone from **every** input you were given (spec and source). If it's gone from one only, keep it and report it. List every deleted endpoint in the report, since the tests for it will now fail or be undocumented. |
| **Changed endpoint** | Edit only the parts that changed. New facts get the tag of their evidence. A fact the contract is missing or has wrong, which the current inputs clearly show, is a change to apply, whether the API changed or the contract was incomplete. List it in the change log like any other change. |
| **Changed fact that was `_(verified)_`** | Replace it only when there's evidence the API changed after it was verified: the git history shows the change, or the old and new spec differ. Then tag the new fact by its evidence (`_(source)_` / `_(spec)_`) and list it as "was verified, changed, needs re-checking". When the current source or spec contradicts it but nothing shows a change (no history, a shallow clone), keep it and report the conflict: someone saw it happen, and only a new live check can overrule that. |
| **Unchanged endpoint** | Don't touch it: no rewording, reformatting or re-tagging. |

**New endpoints follow the file's existing conventions**, even where they differ from the current rules (for example, a file that lists `403` for a disabled account under every endpoint). An update must not make sibling endpoints measure different things. Mention the outdated convention in the report as a suggested clean-up that a `create` run, or the user, can apply to the whole file.

Then tidy up what the edits affect:

- Renumber the `### <n>.` headings in each changed file so they're sequential again.
- Update `## Data required for successful requests`, `## Data Models` and `## Enums` for new or removed fields and models. Remove a model only when no endpoint uses it any more.
- Keep the order of existing sections and the project's conventions.

## 3. Check the result

1. Run `validate`; fix every error and every warning you caused.
2. With a spec, run `diff` again: what remains should be only intentional differences (curated status codes, endpoints kept on purpose). Say which ones remain and why.
3. In the report, add a change log: endpoints added, removed and changed (one line each, with what changed), and the verified facts that need re-checking.
