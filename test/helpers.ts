// What the kit's tests share: a fresh copy of the sample project (examples/sample-project) to break one file at a time,
// with node_modules as an install leaves it (the kit's package files the commands look for, copied).

import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const KIT = fileURLToPath(new URL('..', import.meta.url));
export const SAMPLE = path.join(KIT, 'examples', 'sample-project');

/** Each package's folder in the kit and the files of it a project's node_modules needs for the tests. */
const INSTALLED = [
  { name: 'simpright', folder: 'simpright', files: ['package.json', 'simpright.schema.json'] },
  { name: '@simpright/scenarios', folder: 'scenarios', files: ['package.json', 'schemas'] },
  { name: '@simpright/portal', folder: 'portal', files: ['package.json'] },
];

export interface Project {
  root: string;
  /** Replaces `from` with `to` in `file`; `from` must occur exactly once (both are matched in the file's line endings). */
  edit(file: string, from: string, to: string): void;
  write(file: string, content: string): void;
  read(file: string): string;
  remove(file: string): void;
  dispose(): void;
}

/** What an install or a run of the sample leaves (the e2e workflow does both): never part of a copy. */
const LEFT_BY_RUNS = new Set(['node_modules', 'test-results', 'playwright-report']);

/** A copy of the sample project in a new temporary folder. */
export function sampleProject(): Project {
  const root = mkdtempSync(path.join(os.tmpdir(), 'simpright-sample-'));
  cpSync(SAMPLE, root, { recursive: true, filter: (source) => !LEFT_BY_RUNS.has(path.relative(SAMPLE, source).split(path.sep)[0] ?? '') });
  for (const { name, folder, files } of INSTALLED) {
    for (const file of files) {
      cpSync(path.join(KIT, 'packages', folder, file), path.join(root, 'node_modules', name, file), { recursive: true });
    }
  }
  const full = (file: string) => path.join(root, file);
  return {
    root,
    edit(file, from, to) {
      const text = readFileSync(full(file), 'utf8');
      const eol = text.includes('\r\n') ? '\r\n' : '\n';
      const [a, b] = [from, to].map((part) => part.split('\n').join(eol));
      const count = text.split(a!).length - 1;
      if (count !== 1) throw new Error(`edit of ${file}: found ${count} times: ${JSON.stringify(from)}`);
      writeFileSync(full(file), text.replace(a!, () => b!));
    },
    write(file, content) {
      mkdirSync(path.dirname(full(file)), { recursive: true });
      writeFileSync(full(file), content);
    },
    read: (file) => readFileSync(full(file), 'utf8'),
    remove: (file) => rmSync(full(file), { recursive: true, force: true }),
    dispose: () => rmSync(root, { recursive: true, force: true }),
  };
}
