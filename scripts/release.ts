// Prepares a kit release: one version in every package, the packages' pins on each other, the lockfile, and the date
// of the CHANGELOG's entry. It changes files only; committing, tagging and pushing stay explicit steps (CONTRIBUTING.md).
// Run with `npm run release -- <version>`, e.g. `npm run release -- 0.2.0`. CHANGELOG.md must have a
// "## <version> (unreleased)" entry.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KIT = fileURLToPath(new URL('..', import.meta.url));
const PACKAGES = ['packages/simpright', 'packages/scenarios', 'packages/portal'];
const VERSION = /^\d+\.\d+\.\d+$/;

const version = process.argv[2];
if (!version || !VERSION.test(version)) {
  console.error('usage: npm run release -- <version> (e.g. 0.2.0)');
  process.exit(2);
}

interface Manifest {
  name: string;
  version: string;
  dependencies?: Record<string, string>;
}
const manifests = PACKAGES.map((folder) => ({ file: path.join(KIT, folder, 'package.json'), json: JSON.parse(readFileSync(path.join(KIT, folder, 'package.json'), 'utf8')) as Manifest }));
const names = new Set(manifests.map(({ json }) => json.name));

const changelogFile = path.join(KIT, 'CHANGELOG.md');
const changelog = readFileSync(changelogFile, 'utf8');
const unreleased = `## ${version} (unreleased)`;
if (!changelog.includes(unreleased)) {
  console.error(`CHANGELOG.md has no "${unreleased}" entry: write what the release changes first.`);
  process.exit(1);
}

for (const { file, json } of manifests) {
  json.version = version;
  // Each package pins its siblings exactly: a project installs one kit release.
  for (const dependency of Object.keys(json.dependencies ?? {})) {
    if (names.has(dependency)) json.dependencies![dependency] = version;
  }
  writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
}
const today = new Date().toISOString().slice(0, 10);
writeFileSync(changelogFile, changelog.replace(unreleased, `## ${version} (${today})`));

// The lockfile records the workspaces' versions; npm's own script, as `npm run` gives it.
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Run this with npm run release.');
execFileSync(process.execPath, [npmCli, 'install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: KIT, stdio: 'inherit' });

console.log(`Set ${[...names].join(', ')} to ${version}, and the CHANGELOG entry to ${today}. Next:
  git commit -am "Release v${version}"
  git tag -a v${version} -m "SimpRight Kit v${version}"
  git push origin main v${version}     # the Release workflow publishes after your approval`);
