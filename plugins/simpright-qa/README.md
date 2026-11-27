# SimpRight QA (`simpright-qa`)

The QA agents and skills of the [SimpRight Kit](https://github.com/Zaytsman/SimpRightKit), as a Claude Code plugin, for projects built on the kit (Playwright + TypeScript, started from [SimpRightTemplate](https://github.com/Zaytsman/SimpRightTemplate)). Each skill is a command you run. It starts an agent that does the work and stops at a checkpoint, where you approve before anything is written. In a kit project, `npx simpright apply` writes the plugin into `.claude/` as plain skills and agents, so the commands are there in every Claude Code session, with nothing to install.

## The commands

As a kit project has them:

| Command | What it does | Agent |
|---|---|---|
| `/simpright-qa-analyze-requirements <story or bug>` | Plans the tests of a user story, bug report or feature by layer (API first), writes the analysis, then has the scenario writers write the scenarios | `simpright-qa-requirements-analyst`, then both scenario writers |
| `/simpright-qa-write-api-contracts [update] [source] [spec] [areas]` | Writes or updates API contracts from the API's source code, its OpenAPI spec or both | `simpright-qa-api-contract-writer` |
| `/simpright-qa-write-api-scenarios-from-contract <contract>` | API scenarios from a contract, endpoint by endpoint | `simpright-qa-api-scenario-writer` |
| `/simpright-qa-write-api-scenarios-from-steps <steps, JSON or Bruno>` | API scenarios from test cases you already have, checked against the contracts | `simpright-qa-api-scenario-writer` |
| `/simpright-qa-write-ui-scenarios-from-steps <steps>` | UI scenarios from plain-text test steps, with the labels checked in the live app | `simpright-qa-ui-scenario-writer` |
| `/simpright-qa-implement-api-scenarios <IDs, file or area>` | Automates API scenarios as specs | `simpright-qa-api-test-engineer` |
| `/simpright-qa-implement-ui-scenarios <IDs, file or area>` | Automates UI scenarios as browser specs | `simpright-qa-ui-test-engineer` |
| `/simpright-qa-review-tests [spec, IDs, area or commit]` | Reviews tests against their scenarios and the conventions, then applies the findings you pick | `simpright-qa-test-reviewer` |
| `/simpright-qa-heal-tests [CI run, PR, spec or IDs]` | Diagnoses failing tests, then fixes the ones you approve | `simpright-qa-test-healer` |
| `/simpright-qa-report-bug <description, IDs, import or recheck>` | Records bugs as bug files and links the scenarios that hit them; also imports a contract's suspected bugs and re-checks open bugs | `simpright-qa-bug-reporter` |

The two test engineers preload the skills that hold how the framework builds its code: `simpright-qa-api-scaffolding` and `simpright-qa-api-test-from-scenario` for the API, `simpright-qa-ui-scaffolding` and `simpright-qa-ui-test-from-scenario` for the UI. A plain request ("automate UI-012") starts the matching skill too, from its description.

Installed as a plugin instead (below), the same commands and agents carry the plugin's prefix with a colon: `/simpright-qa:analyze-requirements`, `simpright-qa:requirements-analyst`. That's how the plugin's own files name them; `apply` turns the colon into a hyphen.

## What it needs

- **`simpright.yml`**, the project's profile, which every agent reads first:
  - `project.conventions`: the files with the project's rules;
  - `paths`, `commands`, `ids` and `roles`;
  - each layer's exemplars, known-issue line and rules (`agents.api`, `agents.ui`);
  - the live-app guardrails (`agents.liveApi`).
- **The scenario and bug formats** and their validator, from [`@simpright/scenarios`](../../packages/scenarios) (`commands.validateScenarios`).
- **For the UI agents, the page inspector** from the template's core (`commands.inspectUi`). It shows a live page's test ids, roles and labels, read-only.
- **For the contract commands** (convert a spec, compare, validate), the optional API coverage package (`parts.coverage`). Without it, contracts are still written from the source.
- **Claude Code 2.1.271 or later.**

## Install

In a kit project, turn the agents part on: `parts.agents: true` in `simpright.yml`, with the agents' facts under `agents` (`/simpright-setup` asks for them and does the rest). Then `npx simpright apply` writes the plugin into `.claude/` as plain files:

- its skills as folders named `simpright-qa-<skill>` and its agents as files named `simpright-qa-<agent>.md`, in the skills and agents folders there, next to any of your own;
- its shared rules in `.claude/simpright-qa/`.

Commit them: everyone who clones the project has the agents in their next session, in the desktop app, the terminal, VS Code or the cloud, with no install and no folder to trust. Never edit them by hand. `apply` writes them again for each kit version, and stops with the diff when one has changed; `npx simpright doctor` checks them.

Kit 0.3.0 enabled the plugin from the kit's marketplace in `.claude/settings.json` instead. A plugin that a repository supplies that way loads only in a folder the user has trusted, and Claude Code's desktop app never asks, so kit 0.4.0 writes plain files. To upgrade, follow [the CHANGELOG](../../CHANGELOG.md)'s 0.4.0 steps.

To try the plugin on your own, at your user level, from the kit's main branch:

```text
/plugin install simpright-qa --marketplace Zaytsman/SimpRightKit
```

Its commands then have the colon (`/simpright-qa:review-tests`); in a kit project with the agents part you'd see both forms.

## How the agents work

- **Checkpoints:** a skill settles the brief, starts its agent, shows you what the agent returns, and asks at each checkpoint (a plan, a proposal, a draft, a diagnosis), following `shared/how-to-ask.md`. An agent can't ask you anything, so nothing is written before your approval.
- **No app facts in the agents:** everything project-specific comes from `simpright.yml` and the files it names.
  - An app quirk the agents should know (a periodic data reset, a cache, a rate limit) goes in `agents.liveApi.transient`.
  - An action that does lasting harm (failed logins that lock a shared account) goes in `agents.liveApi.dangerous`.
  - Writes on the live app follow `agents.liveApi.writes` (`never`, `ask` or `allowed`).
- **The same start everywhere:** the agents start without CLAUDE.md, CLAUDE.local.md or your memory (`omitClaudeMd`), and read the files in `project.conventions` themselves. A rule the agents must follow belongs in one of those files.

## Develop

The plugin's files here are the source: `plugins/simpright-qa/` in the kit, which names its own skills and agents with the colon. To try a change in a project, with the kit's folder next to it:

- **as a plugin, for one session:** `claude --plugin-dir ../SimpRightKit/plugins/simpright-qa`. It loads next to the project's plain files, under the plugin's names (`/simpright-qa:review-tests`); an edit applies after `/reload-plugins`;
- **under the project's names:** build the kit (`npm run build` there), then run its `apply` on the project: `node ../SimpRightKit/packages/simpright/dist/cli.js apply --root . --kit-ref <kit commit>` (`--kit-ref` only with the CI part). It writes the plain files from your working copy; `git restore` the project afterwards.

In the kit:
- `npm run validate:plugins` runs `claude plugin validate --strict` on the marketplace and each plugin;
- `npm test` includes `test/plugin.test.ts`, which checks the names, paths and `simpright.yml` keys the texts use, and `packages/simpright/test/plain.test.ts`, which checks the plain files `apply` makes of them.

## License

[MIT](../../LICENSE)
