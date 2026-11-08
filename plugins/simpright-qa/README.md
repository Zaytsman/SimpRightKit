# SimpRight QA (`simpright-qa`)

The QA agents and skills of the [SimpRight Kit](https://github.com/Zaytsman/SimpRightKit), as a Claude Code plugin, for projects built on the kit (Playwright + TypeScript, started from [SimpRightTemplate](https://github.com/Zaytsman/SimpRightTemplate)). Each skill is a command you run. It starts an agent that does the work and stops at a checkpoint, where you approve before anything is written.

## The commands

| Command | What it does | Agent |
|---|---|---|
| `/simpright-qa:analyze-requirements <story or bug>` | Plans the tests of a user story, bug report or feature by layer (API first), writes the analysis, then has the scenario writers write the scenarios | `simpright-qa:requirements-analyst`, then both scenario writers |
| `/simpright-qa:write-api-contracts [update] [source] [spec] [areas]` | Writes or updates API contracts from the API's source code, its OpenAPI spec or both | `simpright-qa:api-contract-writer` |
| `/simpright-qa:write-api-scenarios-from-contract <contract>` | API scenarios from a contract, endpoint by endpoint | `simpright-qa:api-scenario-writer` |
| `/simpright-qa:write-api-scenarios-from-steps <steps, JSON or Bruno>` | API scenarios from test cases you already have, checked against the contracts | `simpright-qa:api-scenario-writer` |
| `/simpright-qa:write-ui-scenarios-from-steps <steps>` | UI scenarios from plain-text test steps, with the labels checked in the live app | `simpright-qa:ui-scenario-writer` |
| `/simpright-qa:implement-api-scenarios <IDs, file or area>` | Automates API scenarios as specs | `simpright-qa:api-test-engineer` |
| `/simpright-qa:implement-ui-scenarios <IDs, file or area>` | Automates UI scenarios as browser specs | `simpright-qa:ui-test-engineer` |
| `/simpright-qa:review-tests [spec, IDs, area or commit]` | Reviews tests against their scenarios and the conventions, then applies the findings you pick | `simpright-qa:test-reviewer` |
| `/simpright-qa:heal-tests [CI run, PR, spec or IDs]` | Diagnoses failing tests, then fixes the ones you approve | `simpright-qa:test-healer` |
| `/simpright-qa:report-bug <description, IDs, import or recheck>` | Records bugs as bug files and links the scenarios that hit them; also imports a contract's suspected bugs and re-checks open bugs | `simpright-qa:bug-reporter` |

The two test engineers preload the skills that hold how the framework builds its code: `simpright-qa:api-scaffolding` and `simpright-qa:api-test-from-scenario` for the API, `simpright-qa:ui-scaffolding` and `simpright-qa:ui-test-from-scenario` for the UI. A plain request ("automate UI-012") starts the matching skill too, from its description.

## What it needs

- **`simpright.yml`**, the project's profile, which every agent reads first:
  - `project.conventions`: the files with the project's rules;
  - `paths`, `commands`, `ids` and `roles`;
  - each layer's exemplars, known-issue line and rules (`api`, `ui`);
  - the live-app guardrails (`liveApi`).
- **The scenario and bug formats** and their validator, from [`@simpright/scenarios`](../../packages/scenarios) (`commands.validateScenarios`).
- **For the UI agents, the page inspector** from the template's core (`commands.inspectUi`). It shows a live page's test ids, roles and labels, read-only.
- **For the contract commands** (convert a spec, compare, validate), the optional API coverage package (`parts.coverage`). Without it, contracts are still written from the source.
- **Claude Code 2.1.271 or later.**

## Install

With `parts.agents: true` in `simpright.yml`, `npx simpright apply` writes two keys into `.claude/settings.json`: the kit's marketplace, pinned to your kit version, and the plugin, enabled. `npx simpright doctor` checks them. The same keys by hand:

```json
{
  "extraKnownMarketplaces": {
    "simpright-kit": {
      "source": { "source": "github", "repo": "Zaytsman/SimpRightKit", "ref": "v0.3.0", "sparsePaths": [".claude-plugin", "plugins"] }
    }
  },
  "enabledPlugins": { "simpright-qa@simpright-kit": true }
}
```

Everyone who trusts the folder gets the plugin: Claude Code clones the marketplace in the background the first time. Cloud sessions don't add marketplaces from a repository's settings, so they run without the agents.

To try it on your own, without changing the project, install it at your user level from the kit's main branch:

```text
/plugin install simpright-qa --marketplace Zaytsman/SimpRightKit
```

## How the agents work

- **Checkpoints:** a skill settles the brief, starts its agent, shows you what the agent returns, and asks at each checkpoint (a plan, a proposal, a draft, a diagnosis), following `shared/how-to-ask.md`. An agent can't ask you anything, so nothing is written before your approval.
- **No app facts in the agents:** everything project-specific comes from `simpright.yml` and the files it names.
  - An app quirk the agents should know (a periodic data reset, a cache, a rate limit) goes in `liveApi.transient`.
  - An action that does lasting harm (failed logins that lock a shared account) goes in `liveApi.dangerous`.
  - Writes on the live app follow `liveApi.writes` (`never`, `ask` or `allowed`).
- **The same start everywhere:** the agents start without CLAUDE.md, CLAUDE.local.md or your memory (`omitClaudeMd`), and read the files in `project.conventions` themselves. A rule the agents must follow belongs in one of those files.

## Develop

A marketplace added from a local folder loads the plugin in place: an edit applies after `/reload-plugins` or in a new session, with no version bump. To try a change in a project, register your kit clone in the project's `.claude/settings.local.json` (git-ignored):

```json
{
  "extraKnownMarketplaces": { "simpright-kit": { "source": { "source": "directory", "path": "<path of your SimpRightKit clone>" } } },
  "enabledPlugins": { "simpright-qa@simpright-kit": true }
}
```

In the kit:
- `npm run validate:plugins` runs `claude plugin validate --strict` on the marketplace and each plugin;
- `npm test` includes `test/plugin.test.ts`, which checks the names, paths and `simpright.yml` keys the texts use.

## License

[MIT](../../LICENSE)
