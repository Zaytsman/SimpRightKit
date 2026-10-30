// `simpright apply`: makes the project's files match simpright.yml. It writes the CI part's files (src/generate.ts):
// the workflows and dependabot.yml, with the kit's actions pinned to a kit release's commit. It records what it wrote in
// .simpright/state.json (src/state.ts) and overwrites or removes a file only while it still matches what apply last
// wrote; a file it didn't write, or one changed since, stops it (`--force` overwrites, after you've read the diff).
// A third-party pin that is newer in the file than in the kit (a Dependabot bump) is kept. `--dry-run` shows the
// changes and writes nothing.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { type Config, UsageError } from './config.ts';
import { unifiedDiff } from './diff.ts';
import { generateCi } from './generate.ts';
import { currentKit, isNewerVersion, KIT_ACTIONS, type Kit } from './kit.ts';
import { hashGenerated, readState, STATE_FILE, withLf, withoutRefs, writeState } from './state.ts';

export interface ApplyOptions {
  /** Show the changes, write nothing. */
  dryRun?: boolean;
  /** Overwrite or remove files that apply didn't write or that changed since. */
  force?: boolean;
  /** The kit commit to pin the kit's actions to (default: the release's, from dist/release.json). */
  kitRef?: string;
  /** The kit release (tests pass their own; default: this package's). */
  kit?: Kit;
}

export interface Change {
  file: string;
  action: 'create' | 'update' | 'delete' | 'unchanged' | 'conflict';
  /** Why a conflict is one. */
  why?: string;
  /** The file now against what apply writes (unified format); '' when unchanged. */
  diff: string;
}

export interface ApplyResult {
  kit: Kit;
  kitRef: string;
  changes: Change[];
  /** Whether apply wrote the files (not a dry run, and no conflict or --force). */
  written: boolean;
}

/** A step that uses an action pinned to a full commit SHA, with its version in a comment. */
const PINNED = /^(\s*(?:-\s+)?uses:\s*)([\w.-]+\/[\w./-]+)@([0-9a-f]{40})[ \t]+#[ \t]*(v\d+(?:\.\d+)*)[ \t]*$/gm;

/** `generated` with each third-party pin that `existing` has at a newer version kept as `existing` has it. */
function keepNewerPins(generated: string, existing: string | undefined): string {
  if (existing === undefined) return generated;
  const theirs = new Map<string, { ref: string; version: string }>();
  for (const [, , action, ref, version] of withLf(existing).matchAll(PINNED)) {
    if (!action!.startsWith(KIT_ACTIONS) && !theirs.has(action!)) theirs.set(action!, { ref: ref!, version: version! });
  }
  return generated.replace(PINNED, (line, prefix: string, action: string, _ref: string, version: string) => {
    const pin = theirs.get(action);
    return pin && isNewerVersion(pin.version, version) ? `${prefix}${action}@${pin.ref} # ${pin.version}` : line;
  });
}

/** Writes (or, with dryRun, only plans) the CI part's files of the project in `root`; see the top of this file. */
export function apply(root: string, config: Config, options: ApplyOptions = {}): ApplyResult {
  const kit = options.kit ?? currentKit();
  const kitRef = options.kitRef ?? kit.commit;
  if (!kitRef) {
    throw new UsageError(`This simpright ${kit.version} is a build from the kit's repository, not a published release, so it doesn't know which kit commit to pin the actions to: pass --kit-ref <commit>.`);
  }
  if (!/^[0-9a-f]{40}$/.test(kitRef)) throw new UsageError(`--kit-ref must be a full commit SHA (40 hex digits), got '${kitRef}'.`);

  const generated = generateCi(root, config, { kit, kitRef });
  const recorded = readState(root)?.files ?? {};
  const read = (file: string) => (existsSync(path.join(root, file)) ? readFileSync(path.join(root, file), 'utf8') : undefined);

  const changes: Change[] = [];
  /** Generated file → the text apply writes (the generated text with any newer third-party pins kept). */
  const finals = new Map<string, string>();
  for (const { file, text } of generated) {
    const existing = read(file);
    const final = keepNewerPins(text, existing);
    finals.set(file, final);
    if (existing !== undefined && withLf(existing) === final) {
      changes.push({ file, action: 'unchanged', diff: '' });
      continue;
    }
    const diff = unifiedDiff(file, existing, final);
    // Apply's own file, or one that differs only in its pins, can be overwritten; anything else is someone's work.
    const ours = existing === undefined || recorded[file] === hashGenerated(existing) || withoutRefs(existing) === withoutRefs(final);
    if (ours) changes.push({ file, action: existing === undefined ? 'create' : 'update', diff });
    else changes.push({ file, action: 'conflict', why: recorded[file] ? 'changed since simpright apply wrote it' : "simpright apply didn't write it", diff });
  }
  for (const [file, hash] of Object.entries(recorded)) {
    if (finals.has(file)) continue;
    const existing = read(file);
    if (existing === undefined) continue; // gone already: it just leaves the state
    const diff = unifiedDiff(file, existing, undefined);
    if (hashGenerated(existing) === hash) changes.push({ file, action: 'delete', diff });
    else changes.push({ file, action: 'conflict', why: 'no longer generated, and changed since simpright apply wrote it', diff });
  }

  const written = !options.dryRun && (options.force === true || changes.every((change) => change.action !== 'conflict'));
  if (written) {
    for (const change of changes) {
      const file = path.join(root, change.file);
      const final = finals.get(change.file);
      if (final === undefined) {
        rmSync(file, { force: true });
      } else if (change.action !== 'unchanged') {
        mkdirSync(path.dirname(file), { recursive: true });
        writeFileSync(file, final);
      }
    }
    writeState(root, { kit: kit.version, files: Object.fromEntries([...finals].map(([file, text]) => [file, hashGenerated(text)])) });
  }
  return { kit, kitRef, changes, written };
}

/** The lines `simpright apply` prints for a result: one per file, then the diffs (all with --dry-run, else the conflicts'). */
export function report(result: ApplyResult, options: Pick<ApplyOptions, 'dryRun' | 'force'>): string[] {
  const out = [`simpright apply: kit ${result.kit.version}, its actions at ${result.kitRef.slice(0, 7)}`];
  for (const change of result.changes) out.push(`  ${change.action.padEnd(9)} ${change.file}${change.why ? `: ${change.why}` : ''}`);
  const shown = result.changes.filter((change) => change.diff !== '' && (options.dryRun || change.action === 'conflict'));
  for (const change of shown) out.push('', change.diff.replace(/\n$/, ''));
  const count = (action: Change['action']) => result.changes.filter((change) => change.action === action).length;
  const conflicts = count('conflict');
  out.push('');
  if (options.dryRun) {
    out.push(`Dry run, nothing written: ${count('create')} to create, ${count('update')} to update, ${count('delete')} to delete${conflicts ? `, ${conflicts} conflict(s)` : ''}.`);
  } else if (result.written) {
    out.push(`Done: ${count('create')} created, ${count('update')} updated, ${count('delete')} deleted${conflicts ? `, ${conflicts} conflict(s) overwritten` : ''}; ${STATE_FILE} records what apply wrote.`);
  } else {
    out.push(`Nothing written: ${conflicts} conflict(s). Move those changes into simpright.yml, or run again with --force to overwrite them (read the diffs first).`);
  }
  return out;
}
