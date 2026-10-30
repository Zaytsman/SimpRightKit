// Writes what the simpright command knows about the kit itself into packages/simpright/dist/kit-data.json:
// - the kit's actions (actions/<name>/action.yml): their inputs and steps, which simpright doctor checks a workflow's
//   steps against;
// - the pins of the third-party actions the kit's own workflows and actions use, which simpright apply writes into the
//   workflows it generates. The kit's Dependabot keeps those pins current, so each build takes them as they are.
// Runs as part of `npm run build`; src/kit.ts reads the file.

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { isNewerVersion } from '../packages/simpright/src/kit.ts';

const KIT = fileURLToPath(new URL('..', import.meta.url));
const OUT = path.join(KIT, 'packages/simpright/dist/kit-data.json');
/** A step that uses an action pinned to a full commit SHA, with its version in a comment. */
const PINNED = /^\s*(?:-\s+)?uses:\s*([\w.-]+\/[\w./-]+)@([0-9a-f]{40})\s+#\s*(v\d+(?:\.\d+)*)\s*$/gm;

interface Step {
  uses?: string;
  with?: Record<string, unknown>;
}
interface ActionFile {
  inputs?: Record<string, { required?: boolean; default?: unknown }>;
  runs?: { using?: string; steps?: Step[] };
}

const read = (file: string) => readFileSync(path.join(KIT, file), 'utf8');

const actions: Record<string, ActionFile> = {};
for (const entry of readdirSync(path.join(KIT, 'actions'), { withFileTypes: true }).filter((item) => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
  let text: string;
  try {
    text = read(`actions/${entry.name}/action.yml`);
  } catch {
    continue; // a scripts folder such as lib/
  }
  const action = parse(text) as ActionFile;
  actions[entry.name] = {
    inputs: Object.fromEntries(Object.entries(action.inputs ?? {}).map(([name, spec]) => [name, { required: spec?.required, default: spec?.default }])),
    runs: { using: action.runs?.using, steps: (action.runs?.steps ?? []).map((step) => ({ uses: step.uses, with: step.with })) },
  };
}

// When the kit pins an action twice, the newest pin wins.
const pins: Record<string, { ref: string; version: string }> = {};
const files = [
  ...readdirSync(path.join(KIT, '.github/workflows')).filter((name) => /\.ya?ml$/.test(name)).map((name) => `.github/workflows/${name}`),
  ...Object.keys(actions).map((name) => `actions/${name}/action.yml`),
];
for (const file of files) {
  for (const [, action, ref, version] of read(file).matchAll(PINNED)) {
    const known = pins[action!];
    if (!known || isNewerVersion(version!, known.version)) pins[action!] = { ref: ref!, version: version! };
  }
}

mkdirSync(path.dirname(OUT), { recursive: true });
const sorted = Object.fromEntries(Object.entries(pins).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(OUT, `${JSON.stringify({ actions, pins: sorted }, null, 2)}\n`);
console.log(`kit-data.json: ${Object.keys(actions).length} action(s), ${Object.keys(sorted).length} pin(s)`);
