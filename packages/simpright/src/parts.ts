// The parts' rules, which simpright apply and simpright doctor both enforce: what each optional part needs from
// simpright.yml and from the other parts. Since kit 0.4.0 the CI part is a part like the others (parts.ci): a config
// from before, with runs or with CI files apply recorded but no parts.ci, gets one line saying so instead of losing its
// workflows.

import { CONFIG_FILE, type Config } from './config.ts';

/** Where the files of the CI part live: a file apply recorded there was written by the CI part. */
const CI_FILES = '.github/';

/**
 * The problems with the parts simpright.yml turns on, as "simpright.yml: <what>" lines; empty when they fit together.
 * `recorded` lists the files .simpright/state.json says apply wrote.
 */
export function partProblems(config: Config, recorded: string[] = []): string[] {
  const parts = config.parts ?? {};
  const problems: string[] = [];
  const need = (message: string) => problems.push(`${CONFIG_FILE}: ${message}`);

  // A config from before kit 0.4.0 gets the one line, not one per part that needs the CI part as well.
  const beforeCiPart = parts.ci === undefined && (config.runs !== undefined || recorded.some((file) => file.startsWith(CI_FILES)));
  if (beforeCiPart) {
    need('parts.ci: since kit 0.4.0 simpright apply writes the workflows only with parts.ci: true. Set it to keep them, or set parts.ci: false to have apply remove the ones it wrote');
  } else if (config.runs && !parts.ci) {
    need('runs need parts.ci: each run is a workflow of the CI part');
  }
  if (parts.ci && !config.ci) need('parts.ci needs ci: the Node version and the secrets the workflows use');
  const needsCi = !parts.ci && !beforeCiPart;

  if (parts.portal) {
    if (needsCi) need('parts.portal needs parts.ci: the CI part publishes the portal');
    if (!config.runs) need('parts.portal needs runs: the portal publishes the reports of the test runs');
    if (!config.portal) need('parts.portal needs portal: the pages take their title from it');
    if (parts.portal.testCases && !parts.scenarios) need('parts.portal.testCases needs parts.scenarios: the Test Cases pages are built from the scenario files');
    if (parts.portal.bugs && !parts.scenarios) need('parts.portal.bugs needs parts.scenarios: the Bugs page is built from the bug files');
    if (parts.portal.bugs && !config.paths.bugs) need('parts.portal.bugs needs paths.bugs');
  }
  if (parts.wiki) {
    if (needsCi) need('parts.wiki needs parts.ci: the CI part publishes the wiki');
    if (!config.paths.wiki) need('parts.wiki needs paths.wiki, the folder of the wiki pages');
  }
  if (parts.inspector && !config.commands.inspectUi) need('parts.inspector needs commands.inspectUi: the command that runs the page inspector');
  if (parts.agents) {
    if (!config.agents) need('parts.agents needs agents: the facts the QA agents read (agents.liveApi, and agents.api or agents.ui for the layers the project tests)');
    if (!parts.scenarios) need('parts.agents needs parts.scenarios: the agents write the scenarios and automate them');
    if (config.agents?.ui && !parts.inspector) need('agents.ui needs parts.inspector: the UI agents take labels and test ids from the page inspector');
  }
  if (parts.coverage && !config.ids.layers.api) need('parts.coverage needs an API layer (ids.layers.api): it measures the API tests against the contracts');
  return problems;
}
