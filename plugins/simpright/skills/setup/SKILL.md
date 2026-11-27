---
name: setup
description: Set up a project built on the SimpRight Kit (UI and API tests in Playwright and TypeScript). In a fresh copy of SimpRightTemplate, an interview about the app, the layers, the kit's parts, the login, the folders, CI and the portal, then simpright init and apply at the user's OK, a first test run, the project's README and CLAUDE.md, and the GitHub settings. In a project already set up, it turns a part on or off or changes the runs, the portal or the agents' exemplars. Use when the user asks to set up the project or the framework, has just created a repository from the template, or wants to add, change or remove a part (scenarios, page inspector, QA agents, CI and runs, portal, wiki), e.g. "/simpright:setup" or "/simpright:setup turn on the agents".
argument-hint: "[what to change, e.g. turn on the agents]"
---

# Set up the project

The kit's CLI does the setup from a config, so the same answers always give the same files: `simpright init` turns a fresh copy of the template into the project from an answers file, and `simpright apply` writes what the parts in `simpright.yml` need (the workflows, the agents' files, the kit's packages and scripts). Your part: the interview, the answers file, each command at the user's OK, the checks, and what no command writes: a login the presets don't cover, the project's `README.md` and `CLAUDE.md`, and the GitHub settings. Work in the main conversation: every question goes to the user, and nothing is written before their OK.

Arguments, if any: $ARGUMENTS

## How to ask

Before the first question, read `${CLAUDE_PLUGIN_ROOT}/shared/how-to-ask.md` and follow it for every question in this skill. One addition: values to type (URLs, paths, field names, names, times) have no options to pick from. Ask them in one plain message after the round's AskUserQuestion call, numbered, each with its default if it has one; the user answers the ones they change.

## 1. Where the project is

- **The config:** `simpright.yml` in the repository root. Without it this isn't a kit project: stop, and say that a project starts from SimpRightTemplate (https://github.com/Zaytsman/SimpRightTemplate, "Use this template").
- **The kit:** `node_modules/simpright/package.json` and its version. Without `node_modules`, ask: "Install the packages (Recommended)" (`npm ci`, or `npm install` without a `package-lock.json`), "I'll install them". Every command below is the project's own kit version, through `npx simpright`. When `package.json` takes a kit package from a local folder or file (`file:` or `link:`), someone is trying a kit build that isn't on npm, maybe with npm's version number: keep those entries as they are (`apply` leaves them alone too), and never offer npm's packages in their place.
- **The mode:**
  - **First setup:** `simpright.yml` names a `template`, and `README.md` is still the template's (its first line is `# SimpRightTemplate`). Go on with sections 2–7, then 9. When `git remote get-url origin` names `Zaytsman/SimpRightTemplate`, this is a clone of the template itself, not a repository made from it: say so, and ask "Go on here (Recommended)" (the commits stay local until the project has its own repository: `git remote set-url origin <its URL>`), "Stop".
  - **A project already set up:** anything else. Sections 8 and 9.
  - An argument that names a change ("turn on the agents") is section 8 in a project already set up; in a fresh copy, say that the first setup covers it, and use it as that round's answer.
- **Git:** `git status --short`. A fresh copy with uncommitted changes is fine, but say that the setup's changes would mix with them, and suggest committing them first.

## 2. The interview

Read `${CLAUDE_SKILL_DIR}/references/interview.md`: the rounds, their questions and defaults, and what each answer fills in the answers file. Before round 1, tell the user in a few lines what comes: seven short rounds of questions, then a summary and the changes, shown before anything is written; the recommended options give a working project; they can stop at any point.

Ask the rounds in order. Skip a question the earlier answers settle, and say so in one line (an API-only project gets no page-inspector question; without the CI part there are no runs to plan).

## 3. The summary

Show every choice in one table (round, choice, value), then the answers file it makes: YAML in the format of `node_modules/simpright/init-answers.schema.json`, with a key only where the answer differs from the template. Ask: "Go on (Recommended)", "Change something" (what, in "Other"). After a change, show the table again.

Then write the answers to `.simpright/init-answers.yml`.

## 4. init and apply

1. `npx simpright init --answers .simpright/init-answers.yml --dry-run`. It reads the template's files at the `template` tag from GitHub, so it needs the network.
   - **The answers fail its checks:** fix the file as the message says, tell the user what changed, and run it again.
   - **"It isn't a fresh copy of the template":** show the files it names, then ask: "Restore them and run init" (`git restore <files>` for uncommitted changes, otherwise each file from `https://raw.githubusercontent.com/Zaytsman/SimpRightTemplate/<tag>/<file>`; say in the description that this undoes the user's changes to them), "Set up without init" (section 8 for the parts, then sections 5–7, and a list of what init would have done for the user to do by hand), "Stop".
   - **It can't reach GitHub:** say so, and ask whether to retry or stop.
2. Show the dry run's list of changes as it printed it, and each diff as one line of what changes (a diff in full when the user asks). Ask: "Make these changes (Recommended)", "Change the answers" (back to section 3), "Stop".
3. `npx simpright init --answers .simpright/init-answers.yml`, then delete `.simpright/init-answers.yml`: `simpright.yml` is the record from now on.
4. **The login,** when round 3 chose one the `bearer` preset doesn't fit: read `${CLAUDE_SKILL_DIR}/references/login.md` and write it with the user now, before anything runs. Show each change and get an OK before writing it.
5. **Other environments** from round 1: `src/envs/<NAME>.json` for each, a copy of `src/envs/TEST.json` with its URLs.
6. **What tests should know about the app** (round 1), with the agents part: one sentence each in `agents.liveApi.transient`. Edit `simpright.yml` line by line, never rewrite it: its comments are documentation.
7. `npx simpright apply --dry-run`: what `apply` writes from `simpright.yml` (with the CI part, the workflows and `.github/dependabot.yml`; the kit's skills, and with the agents part its agents, in `.claude/`; the kit's packages and scripts in `package.json`). Show its list and one line per diff. Ask: "Apply them (Recommended)", "Stop".
8. `npx simpright apply`, then `npm install` when it says the kit's packages changed.

## 5. Checks and a first run

1. `npx simpright doctor`. It should pass now; explain any problem and fix it with the user (section 2 of `${CLAUDE_PLUGIN_ROOT}/skills/doctor/SKILL.md` says what each kind means).
2. `npm run typecheck`, and with the scenarios part `npm run validate:scenarios`.
3. **The users' secrets,** when the roles have users: every test run reads them, a logged-out one too. Ask the user to copy `.env.example` to `.env` and fill in the values in their editor, never in the chat, and wait until they say it's done. Then check that each variable has a value without reading any: `grep -cE '^(<NAME>|<NAME>)=.+' .env` must print the number of names. Never open `.env`, print it or pass its values anywhere.
4. **A first run:**
   - **With the examples kept:** they run logged out against the site they were written for. With the UI layer, the browser first: ask "Install Chromium (Recommended)", "Skip the UI tests" (`npm run install:browsers` downloads Chromium and its system packages, which on Linux asks for sudo). Then `HEADLESS=true npx playwright test` (`--project=api` without the browser). They pass on a fresh setup, so a failure is worth a look before anything else.
   - **With a login:** one login check (`${CLAUDE_SKILL_DIR}/references/login.md`, "Check one login").
   - **Neither:** nothing runs yet; say so.
   - Report one line per Playwright project (passed, failed, skipped); on a failure, show its first error and offer to look into it.

## 6. README.md and CLAUDE.md

Read `${CLAUDE_SKILL_DIR}/references/project-docs.md`. Write the project's `README.md` (the template's describes the template) and fill in `CLAUDE.md`'s project sections from the answers and the files as they are now. With the wiki part, also write the wiki's first page, `Home.md` in `paths.wiki`: init leaves that folder empty, and the wiki shows only what the folder holds. Show them as diffs, then ask "Write them (Recommended)", "Change something". `docs/framework/conventions.md` is a core file: leave it as it is.

## 7. Commit, push and GitHub

1. **Commit:** `git status --short`, then ask: "Commit the setup (Recommended)" (one commit; its message lists what the setup did), "I'll commit it myself". Nothing is pushed yet.
2. **GitHub,** with the CI part, the portal or the wiki: read `${CLAUDE_PLUGIN_ROOT}/shared/github.md` and go through its settings in order, one at a time. For each: say what it's for, check it, then ask "Do it with gh (Recommended)" (with the command shown first), "I'll do it on GitHub" (with the click path), "Later". Secrets are the exception: the user types each value in their own terminal or on the web page. The push is one of these steps.
3. Without a GitHub remote, or with `gh` missing or logged out, list the settings that apply with their click paths, for later.

## 8. A project already set up

Read `${CLAUDE_SKILL_DIR}/references/parts.md`.
1. Show what the project has, as one table: the layers (`ids.layers`), each part in `parts` (on or off), the runs (label, layer, when, in local time), the portal's title; and the result of `npx simpright doctor --offline` in one line. Fix nothing yet.
2. **The exemplars:** when `docs/exemplars/` exists and the project has its own files of a kind it holds (a client, a service, a DTO, a page, a component, a precondition fixture, a spec), offer to point those exemplars at them (`parts.md`, "Exemplars").
3. Ask what to change, unless the argument says it: up to four options from what's likely ("Turn on <a part that's off>", "Change the runs", "Change the portal", "The GitHub settings"); anything else goes in "Other".
4. Make the change as `parts.md` says: edit `simpright.yml` line by line, show the diff, then `npx simpright apply --dry-run`, the user's OK, `npx simpright apply`, `npm install` when it says so, and `npx simpright doctor`.
5. Update what `README.md` and `CLAUDE.md` say about it (`${CLAUDE_SKILL_DIR}/references/project-docs.md`), shown as a diff first.
6. The GitHub settings the change needs, as in section 7.

## 9. The report

End with three short lists:
- **Done:** what changed (init's and apply's counts, the login, the docs), the checks and the first run, the commit, the GitHub settings made.
- **Left for you:** the GitHub settings not done (with their click paths), `.env` on each machine that runs the tests, and `LICENSE`: it's the template's (MIT, with the template author's name), so put your name in it or choose your own license.
- **Next:** the commands for the parts that are on: `npm test`, `npm run inspect:ui -- <path>` while writing page objects, and with the agents part `/simpright-qa-analyze-requirements <story>`, `/simpright-qa-write-ui-scenarios-from-steps <steps>` and `/simpright-qa-write-api-contracts <source>` (a new session loads them); `/simpright:setup` again to change a part, `/simpright:doctor` to check the project.

Never commit, push or change a GitHub setting without the user's OK for that step.
