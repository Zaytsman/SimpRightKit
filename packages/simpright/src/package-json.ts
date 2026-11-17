// The kit's entries in a project's package.json: its packages in devDependencies, at the kit's exact version, and the
// npm scripts that run them, each for the parts simpright.yml turns on. simpright apply writes them entry by entry and
// keeps the rest of the file (other packages and scripts, the key order, the indentation):
// - an entry that already has the value apply wants is apply's from then on, and a missing one is added;
// - an entry with another value is changed only when it still has the value apply last wrote (state.json records them),
//   and otherwise is someone's work: a conflict, which --force overwrites;
// - a kit package installed from a local folder (file: or link:, as the kit's own sample does) is left as it is;
// - an entry for a part that's off goes, when it still has apply's value.
// apply never runs npm: when the packages change, it says to run npm install.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ConfigError, type Config } from './config.ts';

export const PACKAGE_FILE = 'package.json';
/** The two objects of package.json that apply writes into. */
export const SECTIONS = ['devDependencies', 'scripts'] as const;
export type Section = (typeof SECTIONS)[number];
/** Entries by section: a package's version, or a script's command. */
export type PackageEntries = Record<Section, Record<string, string>>;

/** A kit package installed from a local folder rather than the registry: left as it is. */
const LOCAL_SPEC = /^(?:file|link):/;

/** The entries apply wants in package.json for `config`, with the kit at `version`. */
export function kitEntries(config: Config, version: string): PackageEntries {
  const parts = config.parts ?? {};
  const devDependencies: Record<string, string> = { simpright: version };
  const scripts: Record<string, string> = { doctor: 'simpright doctor', apply: 'simpright apply' };
  if (parts.scenarios) {
    devDependencies['@simpright/scenarios'] = version;
    scripts['validate:scenarios'] = 'simpright-scenarios validate';
    scripts['check:step-titles'] = 'simpright-scenarios check-step-titles';
  }
  if (parts.inspector) scripts['inspect:ui'] = 'node scripts/inspect-ui.mts';
  if (parts.portal) {
    devDependencies['@simpright/portal'] = version;
    if (parts.portal.testCases) scripts['test-cases:build'] = 'simpright-portal build-test-cases';
    if (parts.portal.bugs) scripts['bugs:build'] = 'simpright-portal build-bugs';
    scripts['portal:build'] = 'simpright-portal build-config';
  }
  return { devDependencies, scripts };
}

export interface PackagePlan {
  /** The file's text now, and with every change made, conflicts included (the same text when nothing changes). */
  before: string;
  after: string;
  /** The entries that are someone's work, as "<section>.<name>": `after` overwrites or removes them. */
  conflicts: string[];
  /** Whether a kit package's entry changes: then npm install has to follow. */
  packagesChanged: boolean;
  /** The entries apply owns once `after` is written: the wanted ones, except kit packages from a local folder. */
  owned: PackageEntries;
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The plan for the project's package.json: `wanted` written, and the entries apply last wrote (`recorded`) that aren't
 * wanted any more removed. Undefined when the project has no package.json.
 */
export function planPackageJson(root: string, wanted: PackageEntries, recorded: PackageEntries | undefined): PackagePlan | undefined {
  const file = path.join(root, PACKAGE_FILE);
  if (!existsSync(file)) return undefined;
  const before = readFileSync(file, 'utf8');
  let json: unknown;
  try {
    json = JSON.parse(before);
  } catch (error) {
    throw new ConfigError([`${PACKAGE_FILE}: invalid JSON: ${(error as Error).message}`]);
  }
  if (!isObject(json)) throw new ConfigError([`${PACKAGE_FILE}: must be a JSON object`]);
  const pkg: Record<string, unknown> = { ...json };
  const conflicts: string[] = [];
  const local = new Set<string>();
  let packagesChanged = false;

  for (const section of SECTIONS) {
    if (pkg[section] !== undefined && !isObject(pkg[section])) throw new ConfigError([`${PACKAGE_FILE}: ${section} must be a JSON object`]);
    const current = { ...((pkg[section] as Record<string, unknown> | undefined) ?? {}) };
    const ours = recorded?.[section] ?? {};
    const want = wanted[section];
    // npm keeps devDependencies sorted, so apply does too unless the project doesn't; scripts keep their order.
    const sorted = section === 'devDependencies' && Object.keys(current).join('\n') === Object.keys(current).sort().join('\n');
    let changed = false;

    for (const [name, value] of Object.entries(want)) {
      const now = current[name];
      if (now === value) continue;
      if (section === 'devDependencies' && typeof now === 'string' && LOCAL_SPEC.test(now)) {
        local.add(name);
        continue;
      }
      if (now !== undefined && now !== ours[name]) conflicts.push(`${section}.${name}`);
      current[name] = value;
      changed = true;
    }
    for (const [name, value] of Object.entries(ours)) {
      if (name in want || current[name] === undefined) continue;
      if (current[name] !== value) conflicts.push(`${section}.${name}`);
      delete current[name];
      changed = true;
    }
    if (!changed) continue;
    if (section === 'devDependencies') packagesChanged = true;
    const entries = Object.entries(current);
    if (sorted) entries.sort(([a], [b]) => a.localeCompare(b));
    if (entries.length > 0) pkg[section] = Object.fromEntries(entries);
    else delete pkg[section];
  }

  const indent = /^([ \t]+)"/m.exec(before)?.[1] ?? '  ';
  const written = `${JSON.stringify(pkg, null, indent)}\n`;
  return {
    before,
    after: written === before.replace(/\r\n/g, '\n') ? before : written,
    conflicts,
    packagesChanged,
    owned: {
      devDependencies: Object.fromEntries(Object.entries(wanted.devDependencies).filter(([name]) => !local.has(name))),
      scripts: { ...wanted.scripts },
    },
  };
}
