# Contracts from an OpenAPI spec

The package converts a spec into draft contracts with code, so the endpoint list, parameters and body shapes are complete and repeatable. Your job is to review and correct that draft, because specs are routinely incomplete.

## 1. Convert into a scratch folder

Never convert straight into the contract folder: existing contracts could be overwritten, and the draft isn't reviewed yet.

```bash
node -e "console.log(require('os').tmpdir())"      # find the temp folder
npx playwright-api-coverage from-openapi <spec file or URL> --out <temp>/api-contract-draft --force
```

- `--tags Product,User` limits the draft to the areas in scope.
- The converter accepts OpenAPI 3.x JSON only. Many servers publish the same spec as JSON too (try the URL with `.json`); otherwise convert YAML with a YAML library the project already has, and never download a converter without the user's approval. For Swagger 2.0, say in the report that it's unsupported and fall back to the source code.
- Don't pass `--exclude-status` yet; decide per code in step 3.

Each draft file has one area, a header saying it came from the spec, and every status code and auth line tagged `_(spec)_`.

Draft files are named after the spec's tags (`Product_API.md`), which may not match the existing contracts (`Products_API.md`). Before writing anything, map each tag to its existing file by the endpoints they share:

```bash
npx playwright-api-coverage diff <contract folder> <spec> --tags <tag>
```

The files listed under "Changed" and "Removed" are the ones that already document that tag's endpoints. Put the tag's endpoints there; only a tag with no matching file gets a new file.

## 2. Read the draft with the spec's usual gaps in mind

Check every endpoint for these. Each is common in real specs, including ones generated from annotations in the code:

| Gap | Example | How to fix |
|---|---|---|
| Missing `required` lists: every body field looks optional | Toolshop's `ProductRequest` has no `required`, but the store rules require 7 fields | Read the validation rules in the source; mark required fields without `?` and tag the endpoint's 422 line `_(source)_` |
| Missing error codes | `POST /users/login` lists only `200`, but wrong credentials return `401` | Source: the handler and auth code. Live: a safe call (see live-checks.md) |
| Codes listed everywhere by copy-paste | `405` on 53 of 88 operations; `404` on list and search endpoints that can't return it | Keep a code only if this endpoint can return it; move framework-wide codes to `## Error Handling` |
| Missing or wrong security | An update endpoint with no security in the spec | Check the route's middleware in the source, or a live call without a token |
| Wrong or missing success code | `200` in the spec, `201` in reality | The handler's return statement, or a live call |
| Examples presented as facts | `example: 1` on a boolean | Examples are illustrations; never turn them into rules |
| New methods | `QUERY` (OpenAPI 3.2) | Supported by the package; keep them |

## 3. Correct and complete

- Fix each gap from the source (tag `_(source)_`) or a live check (tag `_(verified)_`). Leave a fact tagged `_(spec)_` only when nothing else confirms or contradicts it.
- Remove status codes this endpoint can't return, and say why in the report (e.g. "405 removed from 53 endpoints: returned by the router for any wrong method; documented once in Error Handling").
- Add the sections the converter can't write: `## Data required for successful requests`, `## Enums` (from the enum types in the models), `## Error Handling` (the shared error body), and `## Notes`.
- Replace the converter's header note with one line saying what the contract was built from, e.g. `> Built from the OpenAPI spec (Toolshop API 5.0.0) and the Laravel source; facts are tagged by origin.`
- Follow the project's conventions from the existing contracts (the Base URL wording, for one), but take the structure and level of detail from the format specification.

## Without source code

When only the spec is available (the user has no access to the code), the live checks are the only way to confirm behaviour. If they aren't allowed either, the contract stays mostly `_(spec)_`: say clearly in the report that it's unverified, and list the gaps from the table above that you suspect but couldn't confirm.
