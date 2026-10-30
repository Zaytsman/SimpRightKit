// What the simpright command knows about the kit itself. At build time scripts/kit-data.ts writes dist/kit-data.json:
// the kit's actions (their inputs and steps, which simpright doctor checks a workflow's steps against) and the pins of
// the third-party actions the generated workflows use. A published package also has dist/release.json, written by the
// kit's release workflow: the release's commit, which the generated workflows pin the kit's actions to (a commit can't
// hold its own SHA, so the release run records it).

import { existsSync, readFileSync } from 'node:fs';
import type { LocalAction } from './workflows.ts';

/** The kit's repository on GitHub. */
export const KIT_REPO = 'Zaytsman/SimpRightKit';
/** How a workflow names one of the kit's actions, before its name and `@<commit>`. */
export const KIT_ACTIONS = `${KIT_REPO}/actions/`;

/** An action pinned to a commit, with the version its comment names (v7.0.1). */
export interface Pin {
  ref: string;
  version: string;
}

/** One kit release, as the simpright command that belongs to it knows it. */
export interface Kit {
  /** The release's version: every kit package and action has it. */
  version: string;
  /** The release's commit (dist/release.json), or undefined in a build from the kit's repository. */
  commit?: string;
  /** The kit's actions by name, as their action.yml declares them. */
  actions: Record<string, LocalAction['action']>;
  /** Third-party action (actions/checkout) → its pin in the kit's own workflows. */
  pins: Record<string, Pin>;
}

/** Whether version `a` (v7.0.2) is newer than `b` (v7.0.1); a missing part counts as 0. */
export function isNewerVersion(a: string, b: string): boolean {
  const [x, y] = [a, b].map((version) => version.replace(/^v/, '').split('.').map(Number));
  for (let i = 0; i < Math.max(x!.length, y!.length); i++) {
    const [p, q] = [x![i] ?? 0, y![i] ?? 0];
    if (p !== q) return p > q;
  }
  return false;
}

const fromPackage = (file: string) => new URL(`../${file}`, import.meta.url);
const readJson = <T>(url: URL): T => JSON.parse(readFileSync(url, 'utf8')) as T;

/** The kit this simpright package belongs to. */
export function currentKit(): Kit {
  const { version } = readJson<{ version: string }>(fromPackage('package.json'));
  const data = readJson<Pick<Kit, 'actions' | 'pins'>>(fromPackage('dist/kit-data.json'));
  const releaseFile = fromPackage('dist/release.json');
  const release = existsSync(releaseFile) ? readJson<{ version?: string; commit?: string }>(releaseFile) : undefined;
  return { version, commit: release?.version === version ? release.commit : undefined, actions: data.actions, pins: data.pins };
}
