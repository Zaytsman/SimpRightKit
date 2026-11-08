// .simpright/state.json: what simpright apply last wrote. It records the kit version that applied, a hash of each
// generated file and a hash of the entries apply owns in a settings file (src/settings.ts), so the next apply
// overwrites or removes them only while nobody has changed them since. A file's hash leaves out each `uses:` reference
// (the commit and its version comment), so a Dependabot pin bump is never an edit.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const STATE_FILE = '.simpright/state.json';

export interface State {
  /** The kit version that last applied. */
  kit: string;
  /** Generated file → the hash of its text as apply wrote it (hashGenerated). */
  files: Record<string, string>;
  /** Settings file → the hash of the entries apply wrote in it (hashEntries); empty when it wrote none. */
  settings: Record<string, string>;
}

/** A `uses:` line: the action, then `@<ref>` and an optional `# <version>` comment. */
const USES_REF = /^(\s*(?:-\s+)?uses:\s*[^@\s#]+)@\S+(?:[ \t]+#.*)?$/gm;

/** The text with LF line endings. */
export const withLf = (text: string) => text.replace(/\r\n/g, '\n');

/** The text with LF line endings and every `uses:` reference left out: what the hashes and comparisons look at. */
export function withoutRefs(text: string): string {
  return withLf(text).replace(USES_REF, '$1');
}

/** The hash state.json records for a generated file's text. */
export function hashGenerated(text: string): string {
  return `sha256-${createHash('sha256').update(withoutRefs(text)).digest('hex')}`;
}

/** The project's state.json, or undefined when apply has never run there. */
export function readState(root: string): State | undefined {
  const file = path.join(root, STATE_FILE);
  if (!existsSync(file)) return undefined;
  const state = JSON.parse(readFileSync(file, 'utf8')) as Partial<State>;
  return { kit: String(state.kit ?? ''), files: state.files ?? {}, settings: state.settings ?? {} };
}

/** Writes state.json, its keys sorted; `settings` only when apply wrote entries, so a project without them keeps its file as it was. */
export function writeState(root: string, state: State): void {
  const file = path.join(root, STATE_FILE);
  mkdirSync(path.dirname(file), { recursive: true });
  const sorted = (map: Record<string, string>) => Object.fromEntries(Object.entries(map).sort(([a], [b]) => a.localeCompare(b)));
  const settings = Object.keys(state.settings).length > 0 ? { settings: sorted(state.settings) } : {};
  writeFileSync(file, `${JSON.stringify({ kit: state.kit, files: sorted(state.files), ...settings }, null, 2)}\n`);
}
