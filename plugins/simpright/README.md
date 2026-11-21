# SimpRight Setup (`simpright`)

The setup and the check of a [SimpRight Kit](https://github.com/Zaytsman/SimpRightKit) project, as a Claude Code plugin. `simpright apply` writes it into every kit project as plain skills, so a repository made from [SimpRightTemplate](https://github.com/Zaytsman/SimpRightTemplate) has `/simpright-setup` and `/simpright-doctor` in its first Claude Code session, with nothing to install and no folder to trust.

## The commands

| In a project | As a plugin | What it does |
|---|---|---|
| `/simpright-setup [change]` | `/simpright:setup` | In a fresh copy of the template: an interview in seven rounds (the app, the parts, the login and roles, the folders and examples, CI and runs, the portal, GitHub), then `simpright init` and `simpright apply`, each after you've seen its changes; a first test run; the project's README and CLAUDE.md; and the GitHub settings, one at a time. In a project already set up: turns a part on or off, changes the runs or the portal, points the agents' exemplars at your own files |
| `/simpright-doctor [--offline]` | `/simpright:doctor` | `simpright doctor`, each problem explained with its fix, plus the GitHub settings the parts need (the secrets by name, Actions, Pages, the wiki, the rulesets) checked with `gh`; then the fixes you pick |

## How it works

- **The CLI does the work:** the skill writes the interview's answers to a file for `simpright init --answers`, and later changes go into `simpright.yml` for `simpright apply`. The same answers give the same project, and everything the skill does can be done by hand with the same commands.
- **You approve each step:** nothing is written before you've seen it, and each commit, push or GitHub setting waits for your yes. Secrets never go through the chat: you type them in your own terminal (`gh secret set`) or on GitHub.
- **It runs in the main conversation,** since it asks you things, and it names the QA agents' commands as a project has them (`/simpright-qa-<skill>`).
- **Shared files:** `shared/how-to-ask.md`, the same rules as the QA plugin's (a test keeps the two copies equal), and `shared/github.md`, the GitHub settings with their checks, click paths and `gh` commands, which both skills read.

## Install

In a kit project there's nothing to install: `npx simpright apply` writes the plugin into `.claude/` (and keeps it current with each kit version), and `npx simpright doctor` checks it. To try it at your user level instead, from the kit's main branch:

```text
/plugin install simpright --marketplace Zaytsman/SimpRightKit
```

## Develop

`claude --plugin-dir <path of your SimpRightKit clone>/plugins/simpright` loads the plugin next to a project's plain files, under its plugin names (`/simpright:setup`). To try a change under the project's names, build the kit and run its `apply` on a scratch copy of the template.

In the kit:
- `npm run validate:plugins` runs `claude plugin validate --strict` on the marketplace and each plugin;
- `npm test` includes `test/plugin.test.ts`, which checks the names, paths and `simpright.yml` keys the texts use, the shared rules' copies, and the interview's example answers.

## License

[MIT](../../LICENSE)
