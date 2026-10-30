// .simpright/state.json: what simpright apply last wrote. It records the kit version that applied and a hash of each
// generated file, so the next apply overwrites or removes a file only while nobody has changed it since. The hash
// leaves out each `uses:` reference (the commit and its version comment), so a Dependabot pin bump is never an edit.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const STATE_FILE = '.simpright/state.json';

export interface State {
  /** The kit version that last applied. */
  kit: string;
  /** Generated file → the hash of its text as apply wrote it (hashGenerated). */
  files: Record<string, string>;
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
  return { kit: String(state.kit ?? ''), files: state.files ?? {} };
}

export function writeState(root: string, state: State): void {
  const file = path.join(root, STATE_FILE);
  mkdirSync(path.dirname(file), { recursive: true });
  const files = Object.fromEntries(Object.entries(state.files).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(file, `${JSON.stringify({ kit: state.kit, files }, null, 2)}\n`);
}
