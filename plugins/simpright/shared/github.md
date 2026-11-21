# The GitHub settings

What a kit project needs on GitHub besides its code, in the order to set it up. Each setting says when it applies, how to check it (read-only) and how to set it: the click path, or a `gh` command run after the user's OK. `gh` fills `{owner}` and `{repo}` from the repository of the current folder.

Never ask for a secret's value, never put one in a command, and never read one back.

**Before any of them:** a GitHub remote (`git remote get-url origin`) and `gh auth status` logged in with access to it. Without them, list the settings below with their click paths for later. Read the repository once: `gh repo view --json nameWithOwner,visibility,hasWikiEnabled,defaultBranchRef`.

**Why this order:** the first push to the default branch already starts the publishing workflows (Publish Test Cases with the portal, Publish Wiki with the wiki), so the settings they need come first; the tests' secrets come before the first test run; the rulesets come last, because after them nobody pushes to that branch directly.

## 1. Actions

Applies with the CI part: the generated workflows use the kit's actions (`Zaytsman/SimpRightKit/actions/<name>`) and actions created by GitHub, each pinned to a commit.
- **Check:** `gh api repos/{owner}/{repo}/actions/permissions`: `enabled` must be `true`. `allowed_actions: all` is fine; `selected` needs the kit's actions in `gh api repos/{owner}/{repo}/actions/permissions/selected-actions` (`patterns_allowed`); `local_only` blocks them.
- **Set:** Settings → Actions → General → Actions permissions: "Allow all actions and reusable workflows", or "Allow <owner>, and select non-<owner>, actions and reusable workflows" with the actions created by GitHub and `Zaytsman/SimpRightKit/*` in the allowed list.

## 2. The wiki's first page

Applies with the wiki part: `publish-wiki.yml` copies the pages in `paths.wiki` into the repository's GitHub wiki, whose git repository exists only once its first page was created on the web. Until then each publish fails, the one the first push starts included.
- **Check:** `hasWikiEnabled` from `gh repo view`; then `git ls-remote https://github.com/<owner>/<repo>.wiki.git`, which fails until the first page exists.
- **Set:** `gh repo edit --enable-wiki` when it's off (after an OK). Then the user creates the first page: the repository's Wiki tab → "Create the first page" → Save, with any text: the first publish replaces it with `Home.md` from the folder. A private repository needs a paid plan for a wiki.

## 3. The code on GitHub

Applies always: the workflows run, and Pages publishes, from what's pushed.
- **Check:** `git status -sb` (the branch ahead of its remote, or no upstream yet).
- **Set:** `git push` (with `-u origin <branch>` the first time), after an OK that names the remote and the branch, and the workflows the push starts. With a work branch (`ci.branches.work`): also create and push it (`git switch -c <work>`, `git push -u origin <work>`), and say that work happens there from now on, merged into the default branch with a pull request.
- **Then:** `gh run list --limit 5` shows the runs the push started; a failed one is worth a look (`gh run view <id> --log-failed`) before the next setting.

## 4. Secrets

Applies with the CI part, for each name in `ci.secrets`: the generated workflows pass each one by name to the tests, which read the users' credentials from them. Needed before the first test run.
- **Check:** `gh secret list` (names and dates only) against `ci.secrets`.
- **Set:** the user runs `gh secret set <NAME>` in their own terminal (it asks for the value and doesn't show it), or adds it on the web: Settings → Secrets and variables → Actions → New repository secret. You only name the secrets and wait until the user says they're done.

## 5. The first publish

Applies with the portal: GitHub Pages serves the `gh-pages` branch, which the first publish creates (without the portal, the runs keep their reports as workflow artifacts only). The push's Publish Test Cases run may have created it already.
- **Check:** `git ls-remote --heads origin gh-pages` (no output: not there yet).
- **Set:** run one test workflow by hand after an OK: `gh workflow run <workflow file> --ref <default branch>` (a run without a schedule is a good first one: `runs` in `simpright.yml`, its `workflow` or `<id>.yml`). Follow it with `gh run watch` or on the Actions tab.

## 6. Pages

Applies with the portal, once `gh-pages` exists.
- **Check:** `gh api repos/{owner}/{repo}/pages --jq '{source, html_url}'`: a 404 means Pages is off; the source should be the branch `gh-pages`, path `/`.
- **Set:** Settings → Pages → Build and deployment: Source "Deploy from a branch", branch `gh-pages`, folder `/ (root)` → Save. With `gh`:

  ```bash
  gh api -X POST repos/{owner}/{repo}/pages --input - <<'EOF'
  {"source": {"branch": "gh-pages", "path": "/"}}
  EOF
  ```

  Use `-X PUT` instead when Pages is already on with another source. The portal is at the `html_url` a minute or two later.
- **Private repositories:** Pages needs a paid plan, and its site is public on the plans most people have, so the reports on it are public too (the framework masks the test users' credentials in them).

## 7. Rulesets, last

Applies when the user wants the default branch protected: changes only through a pull request that passes `verify` (the PR checks' job), no deletion, no force push. Ask first (one call): whether to require pull requests (a one-person project may keep only the deletion and force-push rules), and which merge methods to allow ("Merge commits only", "Squash only", "All three").
- **Check:** `gh api repos/{owner}/{repo}/rules/branches/<branch>`: the rules in force, each with its `type` (`pull_request`, `required_status_checks`, `deletion`, `non_fast_forward`); `[]` means none.
- **Set:** Settings → Rules → Rulesets → New ruleset → New branch ruleset: the name "Protect <branch>", Enforcement status "Active", Target branches → Add target → Include default branch; rules: Restrict deletions, Require a pull request before merging (its allowed merge methods as chosen), Require status checks to pass (Add checks: `verify`), Block force pushes → Create. With `gh`, the same as JSON, without the `pull_request` and `required_status_checks` rules when the user doesn't want them:

  ```bash
  gh api -X POST repos/{owner}/{repo}/rulesets --input - <<'EOF'
  {
    "name": "Protect main",
    "target": "branch",
    "enforcement": "active",
    "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
    "rules": [
      { "type": "deletion" },
      { "type": "non_fast_forward" },
      { "type": "pull_request", "parameters": {
          "required_approving_review_count": 0, "dismiss_stale_reviews_on_push": false, "require_code_owner_review": false,
          "require_last_push_approval": false, "required_review_thread_resolution": false, "allowed_merge_methods": ["merge"] } },
      { "type": "required_status_checks", "parameters": {
          "strict_required_status_checks_policy": false, "required_status_checks": [{ "context": "verify" }] } }
    ]
  }
  EOF
  ```

  With a work branch, a second ruleset for it, "Protect <work>", with the deletion and force-push rules only, and `"include": ["refs/heads/<work>"]`.
- **Private repositories** on GitHub Free don't enforce rulesets.

## Afterwards

`/simpright:doctor` runs every check above that applies to the project.
