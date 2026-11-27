---
name: doctor
description: Check a SimpRight Kit project and explain what's wrong. Runs simpright doctor (simpright.yml, the parts and their rules, the kit's packages, the files simpright apply writes, the core against SimpRightTemplate) and, with gh logged in, checks the GitHub settings the parts need (the secrets by name, Actions, Pages, the wiki, the rulesets); then makes the fixes the user picks. Use when the user asks to check the project, its setup or its GitHub settings, or why simpright doctor or apply fails, e.g. "/simpright:doctor" or "/simpright:doctor --offline".
argument-hint: "[--offline]"
---

# Check the project

`simpright doctor` checks the project's files; only its last check, the core against the template, reads GitHub. The GitHub settings it can't see, you check here with `gh`. Your part: run both, explain each problem in plain words with its fix, and make the fixes the user picks.

Arguments, if any: $ARGUMENTS

## How to ask

Before the first question, read `${CLAUDE_PLUGIN_ROOT}/shared/how-to-ask.md` and follow it for every question in this skill.

## 1. Run doctor

- Without `simpright.yml`, this isn't a kit project; without `node_modules/simpright`, the kit isn't installed (`npm ci`). Say which and stop.
- `npx simpright doctor`, with `--offline` when the user asked for it or GitHub can't be reached (it then leaves out the template check). It prints one line per problem (`<where>: <what>`), a hint for some kinds, and an OK line per check that passed; it exits with 1 when there are problems.

## 2. What the problems mean

Group them by kind; for each, say what it means and the fix:

| Kind | Means | Fix |
|---|---|---|
| `simpright.yml`: a schema message, or a path that doesn't exist | The config is wrong, or names a file or folder that moved | Edit the key; a renamed exemplar or folder needs its new path |
| `simpright.yml`: a key that moved, with the line saying where | The config is from an older kit version | Move the key as the line says |
| `simpright.yml`: `parts.<x> needs ...`, or runs that need the CI part | A part is on without what it needs | Turn the needed part on, or this one off: `/simpright:setup` |
| The kit's packages at different versions, or a pin in `package.json` that the installed kit doesn't match | The kit's packages move together, one version for all | `npm install` |
| A generated file that differs from what `apply` writes: a workflow, `.github/dependabot.yml`, a kit file in `.claude/`, the kit's entries in `package.json` | Someone edited it, or `simpright.yml`, the test folders or the kit version changed since `apply` ran | `npx simpright apply --dry-run` shows the diff. A hand edit belongs in `simpright.yml` (each generated file says so at its top), then `apply`; `apply --force` overwrites the hand edit, only after an explicit yes |
| A run and its workflow, or a kit action's pin or inputs | The workflows don't match `runs` or the kit's release | `apply` |
| A core file that imports a file outside the core | App code reached the framework's core | Move that code into the project's own files: a seam (`src/config/project.ts`, `src/config/roles.ts`) or an app file next to the examples |
| A core file that differs from SimpRightTemplate at the version `template` names | The core changed. It stays as the template ships it, so the project's changes stay apart from the framework's | Undo the change (the file at the `template` tag), or move the code into the project's own files. A change the core itself needs goes into the template first. When the project's `CLAUDE.md` says how its core changes are made, follow that |
| The template can't be read (no tag, no network) | `template` names a version that doesn't exist, or GitHub can't be reached | Check the version; run with `--offline` meanwhile |

Notes aren't problems: "Exemplars: N still point into `docs/exemplars/`" means the agents copy the template's examples until the project has its own files; `/simpright:setup` points them at the project's.

## 3. GitHub

When the project has the CI part, the portal or the wiki, the repository has a GitHub remote, and `gh auth status` is logged in: read `${CLAUDE_PLUGIN_ROOT}/shared/github.md` and run each check that applies, read-only (the secrets against `ci.secrets`, Actions, `gh-pages`, Pages, the wiki, the rulesets). Otherwise say which checks were left out and why.

## 4. The report and the fixes

Show one table: each check (doctor's and GitHub's), OK or its problem, and the fix. With no problems, say so and stop.

Then ask which fixes to make, in one multi-select question (one option per fix; with more than 4, "All file fixes", "All GitHub settings" and "All", the numbers through "Other"). Make the chosen ones:
- **Files:** show the edit, or the `apply --dry-run` diff, before writing.
- **GitHub settings:** one at a time, as `github.md` says: the `gh` command shown first and run after an OK, or the click path. A secret's value only ever goes in the user's own terminal or on the web page.

Then run `npx simpright doctor` and the GitHub checks you fixed again, and show what's left.

Don't commit or push unless the user asks.
