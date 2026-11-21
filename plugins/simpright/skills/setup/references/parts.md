# Changing a part

Every change in a project already set up goes through `simpright.yml` and `npx simpright apply`. Edit the file line by line (its comments are documentation), show the diff, then `apply --dry-run`, the user's OK, `apply`, `npm install` when it says the kit's packages changed, and `npx simpright doctor`. `apply` refuses a config that breaks the parts' rules, one line per rule: fix the config and run it again.

The rules: the agents need the scenarios, and with the UI layer the page inspector, which needs `commands.inspectUi`; the runs, the portal and the wiki need the CI part, which needs `ci` (with `node` and `secrets`); the Test Cases and Bugs pages need the scenarios; coverage needs the API layer; the wiki needs `paths.wiki`.

For the values (runs, the portal's text, folders), ask as the interview does: `interview.md` in this folder has each round's questions and defaults.

## Turning a part on

| Part | In `simpright.yml` | Also |
|---|---|---|
| Scenarios | `parts.scenarios: true`; `paths.scenarios` and `paths.bugs` | `apply` adds the validator's scripts and the folders' `.gitkeep` |
| Page inspector | `parts.inspector: true`; `commands.inspectUi: npm run inspect:ui -- {path}` | UI layer only; `apply` adds the `inspect:ui` script |
| QA agents | `parts.agents: true`, and the `agents` block: per layer its exemplars, known-issue line and rules, and `liveApi` | When the block is missing (init removes it with the examples when the agents are off), copy it from the template's `simpright.yml` at the `template` tag (`https://raw.githubusercontent.com/Zaytsman/SimpRightTemplate/<tag>/simpright.yml`) and point each exemplar at the project's own file of that kind. For a kind the project doesn't have yet, fetch the template's file from the same place into `docs/exemplars/<its path>`, as init does, and point there. Optional folders for the agents: `paths.contracts`, `paths.userStories`, `paths.analysis`. Then tell the user the commands (`/simpright-qa-<skill>`, loaded in a new session) |
| CI | `parts.ci: true`; `ci` with `branches`, `node` and `secrets`; `runs` | A project that still has the template's own CI files (`pr-checks.yml`, `tests.yml`, `.github/dependabot.yml`): `apply` stops on the ones it would write itself, and `tests.yml` would run the tests twice, so delete those three first, after an OK. Then the GitHub settings (`github.md`) |
| Portal | `parts.portal: { testCases: true, bugs: true }` (each page needs the scenarios; `{}` for the dashboard alone); `portal` with its `title` | GitHub Pages (`github.md`) |
| Wiki | `parts.wiki: true`; `paths.wiki` (e.g. `docs/wiki`, with a `Home.md`) | The wiki's first page (`github.md`) |
| Coverage | `parts.coverage: { package: <name>, registry: <https URL> }` | A coverage package of the user's own; without it, nothing |

## Turning a part off

Set it to `false`. `apply` then removes what it wrote for it (the workflows, the agents' files in `.claude/`, the scripts), and stops on any of those the user changed since, showing the diff. Folders and the user's own files stay. Rules still hold: turning the CI part off needs `runs`, `parts.portal` and `parts.wiki` gone first.

## The runs

Each entry of `runs`: `id`, `label`, `project`, and optionally `note`, `schedule`, `grep`, `paths`, `areaPicker`, `keep`, `trend`, `publishCoverage`, `workflow` (round 5 has the defaults and how to write a schedule).
- A run's `workflow` (its caller's file name, `<id>.yml` by default) never changes once the workflow has run: GitHub numbers a workflow's runs per file, and the portal keeps a family's highest numbers.
- Removing a run removes its workflow; its reports stay on Pages.
- A new folder under the tests changes the area pickers' options: run `apply` after adding one.

## The portal

`portal`: `title`, and optionally `titleAccent`, `tagline`, `description`, `healthThreshold` (round 6). The next publish shows the change.

## A layer

To add the UI layer to an API-only project, or the API layer to a UI-only one: `ids.layers.<layer>` (its ID prefix and digits), `paths.uiTests` or `paths.apiTests`, the layer's half of the `agents` block with the agents part, and for the UI `parts.inspector` and `commands.inspectUi`. Copy them from the template's `simpright.yml` at the `template` tag and adjust; `ids.fileNames` comes back with the API layer. The core already has both layers' files; the app's code (pages, or clients and services, with their fixtures) is the project's to write, e.g. with the agents.

## Exemplars

`docs/exemplars/` holds the template's examples when the setup removed them with the agents part on, and `agents.<layer>.exemplars` point there, so the agents copy their style. Once the project has its own file of a kind (a client, a service, a DTO, a page, a component, a precondition fixture, a spec), offer to point that exemplar at it: per layer one multi-select question, one option per pair ("spec → tests/ui/cart/add-to-cart.spec.ts"), picking the file that shows the style best. When no exemplar points into `docs/exemplars/` any more, offer to delete the folder. `simpright doctor` notes the exemplars still there.
