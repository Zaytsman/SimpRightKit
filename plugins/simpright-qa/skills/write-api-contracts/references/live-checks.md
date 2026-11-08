# Checking facts against the running API

A live response is the strongest evidence a contract can have (`_(verified)_`). It is also the only step that touches a real system, so it follows strict rules.

## When you may call the API

Only when the brief gives a base URL **and** says live checks are allowed. The brief also says whether writes are allowed. Without both, skip this step and say so in the report.

## Safe calls

| Allowed | Call | What it verifies |
|---|---|---|
| Always (when live checks are allowed) | `GET`, `HEAD`, `QUERY`, `OPTIONS` without a token | Public endpoints, 401 on protected ones, response shapes |
| Always | `GET` with an ID that can't exist, e.g. `00000000000000000000000000` | 404 and its error body |
| Always | Any method without a token on an endpoint the source or spec says is protected | 401 (the request is rejected before it does anything) |
| Only with a token variable named in the brief | `GET` / `QUERY` with `Authorization: Bearer $VAR` | Protected read endpoints, role checks (403 with a lower role) |
| Only when writes are allowed | `POST`, `PUT`, `PATCH`, `DELETE` that could succeed | Success statuses and validation errors |

- A request "without a token" to a protected write endpoint is safe only if the source or spec says it's protected. If an endpoint turns out to accept it, that is a finding (and possibly a bug): stop calling it, and report it.
- A validation check (an empty body to get `422`) is a write request: only when writes are allowed, because a weak validation could let it through.
- A framework-wide code such as `405` may be observed with any safe call: `GET` or `OPTIONS` on a path that doesn't accept them, or a write method on a path where the source shows **no** route accepts that method (so nothing can run). A route in another area is fine for this.
- With writes allowed, create your own test data and delete it afterwards; never change or delete data you didn't create.
- **Budget:** about 2 calls per endpoint in scope and 50 in total, unless the brief says otherwise. Never loops, never load. Stop and report instead of retrying when something fails repeatedly.

## How to call

Call the API **the way the project's tests do**: read the project's HTTP client (base URL, default headers such as `Accept` and `Content-Type`, how the token is sent) and send the same headers. Some behaviour depends on them. Toolshop, for example, answers a `415` with a JSON body when `Accept: application/json` is sent, and with an HTML page when it isn't. When a response is rendered by the framework rather than the API's own code, check it both ways and document the difference.

Use `curl` through Bash (`$TMP` below is your temp folder). Save the body to a file and print the status, the body's shape (never its values), and only the response headers a contract documents:

```bash
curl -s -o "$TMP/body.json" -D "$TMP/headers.txt" -w "%{http_code}\n" \
  -H "Accept: application/json" "$BASE_URL/products/00000000000000000000000000"
node .claude/skills/write-api-contracts/scripts/shape.js "$TMP/body.json"
grep -iE "^(content-type|allow|cache-control|etag|accept-query|retry-after|location):" "$TMP/headers.txt"
```

- `shape.js` prints keys and value types only, and says when a body isn't JSON. Use it for every response, so no data ends up in your context or the contracts.
- Never print `Authorization`, `Set-Cookie` or other credential headers. Send a token only as `-H "Authorization: Bearer $TOKEN_VAR"` with the variable named in the brief; never write its value into a command, a file or your report.
- Use the temp folder for response files, and don't copy personal data (emails, names, addresses) into contracts: describe shapes, not values.

## Recording the result

- A status or shape you observed: tag it `_(verified)_`, and say in the line what you sent when it matters ("no token", "with `Accept: application/json`").
- When a code has several triggers and you observed only some, name the observed one first and tag it, then the others with their own tag, e.g. `` - `401 Unauthorized`: no token _(verified)_; an expired token gives the same _(source)_ ``. `validate` counts the code by the first tag on the line.
- An observation that contradicts or refines the source or spec: the observation wins in the contract. Report it as a correction, including corrections of `_(source)_` facts.
- Something you tried to verify but couldn't (network error, missing token, an inconclusive response): leave the original tag and list it under "couldn't determine".
- End the report with the list of calls you made: method, path, whether a token was sent, and the status.
