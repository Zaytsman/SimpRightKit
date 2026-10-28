// Writing a portal site folder (a gh-pages checkout, or any folder): the dashboard that every publish refreshes, the
// site's layout version, and the folder copy the commands share. Pushing the folder is the CI step's job.

import { copyFileSync, cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { repositoryUrl, type Config, type Portal } from 'simpright/config';

/** The pages this package ships: dashboard.html (the site's index.html), test-cases.html and bugs.html. */
export const PAGES_DIR = fileURLToPath(new URL('../pages/', import.meta.url));
/** Changes when the format changes, so a page can tell an older portal.json apart. */
const PORTAL_FORMAT_VERSION = 1;
/** The site's layout (the folders and files described in publish-run.ts); a later version can migrate older sites. */
const SITE_LAYOUT_VERSION = 1;

/** The brand the portal pages show (portal.json, and the Test Cases and Bugs data files). */
export function portalBrand(portal: Portal): Pick<Portal, 'title' | 'titleAccent' | 'tagline'> {
  return { title: portal.title, titleAccent: portal.titleAccent, tagline: portal.tagline };
}

/** When the pages were built: SOURCE_DATE_EPOCH (seconds) when it's set, for builds that must be reproducible, else now. */
export function buildTime(): string {
  const epoch = process.env.SOURCE_DATE_EPOCH;
  return (epoch && /^\d+$/.test(epoch) ? new Date(Number(epoch) * 1000) : new Date()).toISOString();
}

/**
 * portal.json, what the dashboard (index.html) shows: its brand and description and the health thresholds
 * (simpright.yml portal), the test runs it lists (simpright.yml runs) and the repository it links to.
 */
export function portalConfig(root: string, config: Config) {
  const { portal, runs } = config;
  if (!portal || !runs) throw new Error('simpright.yml needs a portal section and runs to build the portal.');
  return {
    formatVersion: PORTAL_FORMAT_VERSION,
    ...portalBrand(portal),
    description: portal.description,
    repository: repositoryUrl(root),
    // The side panel links the repository's wiki only when the project publishes one (simpright.yml parts.wiki).
    wiki: config.parts?.wiki === true,
    healthThreshold: portal.healthThreshold ?? {},
    // Only what the page shows: the Latest reports links, the Run history rows and the layers' regressions.
    runs: runs.map(({ id, label, note, trend }) => ({ id, label, note, trend })),
  };
}

/**
 * Writes the dashboard into the site: index.html, its portal.json, .nojekyll (serve the files as they are, without
 * Jekyll) and, when the site has none yet, site.json with the layout version.
 */
export function writeDashboard(root: string, config: Config, site: string) {
  const portal = portalConfig(root, config);
  mkdirSync(site, { recursive: true });
  copyFileSync(path.join(PAGES_DIR, 'dashboard.html'), path.join(site, 'index.html'));
  writeFileSync(path.join(site, 'portal.json'), `${JSON.stringify(portal, null, 2)}\n`);
  const noJekyll = path.join(site, '.nojekyll');
  if (!existsSync(noJekyll)) writeFileSync(noJekyll, '');
  const siteInfo = path.join(site, 'site.json');
  if (!existsSync(siteInfo)) writeFileSync(siteInfo, `${JSON.stringify({ layoutVersion: SITE_LAYOUT_VERSION }, null, 2)}\n`);
  console.log(`Dashboard: index.html and portal.json (${portal.runs.length} runs) -> ${path.relative(process.cwd(), site).split(path.sep).join('/') || '.'}/`);
}

/** Replaces the `target` folder with a copy of the `source` folder. */
export function replaceDir(source: string, target: string) {
  rmSync(target, { recursive: true, force: true });
  cpSync(source, target, { recursive: true });
}
