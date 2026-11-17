// `simpright apply`: makes the project's files match simpright.yml, for the parts it turns on (src/parts.ts says what
// each part needs, and apply stops when they don't fit):
// - the CI part (parts.ci): the workflows and dependabot.yml (src/generate.ts), with the kit's actions pinned to a kit
//   release's commit; a third-party pin that is newer in the file than in the kit (a Dependabot bump) is kept;
// - the kit's plugins as plain files in .claude/ (src/plain.ts): the setup plugin in every project, the QA agents'
//   with parts.agents;
// - the kit's packages and npm scripts in package.json (src/package-json.ts), entry by entry;
// - the folders of the scenarios part: a .gitkeep in each one that's missing (it never removes a folder).
// It removes what it wrote for a part that's off, and the .claude/settings.json entries kit 0.3.0 wrote. It records
// what it wrote in .simpright/state.json (src/state.ts) and overwrites or removes a file, or an entry, only while it
// still matches what apply last wrote; ones it didn't write, or ones changed since, stop it (`--force` overwrites, after
// you've read the diff). `--dry-run` shows the changes and writes nothing.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ConfigError, type Config, UsageError } from './config.ts';
import { unifiedDiff } from './diff.ts';
import { generateCi } from './generate.ts';
import { currentKit, isNewerVersion, KIT_ACTIONS, type Kit } from './kit.ts';
import { kitEntries, PACKAGE_FILE, planPackageJson, type PackageEntries } from './package-json.ts';
import { partProblems } from './parts.ts';
import { pluginFiles } from './plain.ts';
import { entriesOf, formatSettings, hasEntries, hashEntries, PLUGIN_NAME, readSettings, SETTINGS_FILE, withEntries } from './settings.ts';
import { hashGenerated, readState, STATE_FILE, withLf, withoutRefs, writeState } from './state.ts';

export interface ApplyOptions {
  /** Show the changes, write nothing. */
  dryRun?: boolean;
  /** Overwrite or remove files and entries that apply didn't write or that changed since. */
  force?: boolean;
  /** The kit commit to pin the kit's actions to (default: the release's, from dist/release.json). */
  kitRef?: string;
  /** The kit release (tests pass their own; default: this package's). */
  kit?: Kit;
}

export interface Change {
  file: string;
  /** What apply owns in the file, when it isn't the whole file. */
  part?: string;
  action: 'create' | 'update' | 'delete' | 'unchanged' | 'conflict';
  /** Why a conflict is one. */
  why?: string;
  /** The file now against what apply writes (unified format); '' when unchanged. */
  diff: string;
}

export interface ApplyResult {
  kit: Kit;
  /** The commit the kit's actions are pinned to; undefined without the CI part. */
  kitRef?: string;
  changes: Change[];
  /** Whether apply wrote the files (not a dry run, and no conflict or --force). */
  written: boolean;
  /** Whether the kit's packages in package.json change, so that npm install has to follow. */
  install: boolean;
}

/** A change and the file's text once it's made: null when the file goes. */
interface Planned {
  change: Change;
  text: string | null;
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

/**
 * The .claude/settings.json entries kit 0.3.0 wrote for the agents (its marketplace at the kit's tag and simpright-qa
 * enabled), removed when apply recorded them and they're unchanged. Entries apply didn't record are left for doctor to
 * report.
 */
function planSettings(root: string, recorded: string | undefined): Planned | undefined {
  const existing = readSettings(root);
  const current = entriesOf(existing?.settings);
  if (!hasEntries(current) || recorded === undefined) return undefined;
  const base = { file: SETTINGS_FILE, part: `the ${PLUGIN_NAME} plugin's entries of kit 0.3.0` };
  const settings = withEntries(existing?.settings, undefined);
  const text = Object.keys(settings).length === 0 ? null : formatSettings(settings, existing?.text);
  const diff = unifiedDiff(SETTINGS_FILE, existing?.text, text ?? undefined);
  if (recorded !== hashEntries(current)) {
    const why = 'no longer written (since kit 0.4.0 the agents are plain files in .claude/), and changed since simpright apply wrote them';
    return { change: { ...base, action: 'conflict', why, diff }, text };
  }
  return { change: { ...base, action: text === null ? 'delete' : 'update', diff }, text };
}

/** A .gitkeep in each folder of the scenarios part that doesn't exist yet: a folder per layer, and the bugs folder. */
function planFolders(root: string, config: Config): Planned[] {
  if (!config.parts?.scenarios) return [];
  const folders = [...Object.keys(config.ids.layers).map((layer) => `${config.paths.scenarios}/${layer}`), ...(config.paths.bugs ? [config.paths.bugs] : [])];
  return folders
    .filter((folder) => !existsSync(path.join(root, folder)))
    .map((folder) => ({ change: { file: `${folder}/.gitkeep`, part: 'a folder the scenarios part uses', action: 'create', diff: '' }, text: '' }));
}

/** Writes (or, with dryRun, only plans) the project's files and entries in `root`; see the top of this file. */
export function apply(root: string, config: Config, options: ApplyOptions = {}): ApplyResult {
  const kit = options.kit ?? currentKit();
  const state = readState(root);
  const recorded = state?.files ?? {};
  const problems = partProblems(config, Object.keys(recorded));
  if (problems.length > 0) throw new ConfigError(problems);

  let kitRef: string | undefined;
  if (config.parts?.ci) {
    kitRef = options.kitRef ?? kit.commit;
    if (!kitRef) {
      throw new UsageError(`This simpright ${kit.version} is a build from the kit's repository, not a published release, so it doesn't know which kit commit to pin the actions to: pass --kit-ref <commit>.`);
    }
    if (!/^[0-9a-f]{40}$/.test(kitRef)) throw new UsageError(`--kit-ref must be a full commit SHA (40 hex digits), got '${kitRef}'.`);
  }

  const generated = [
    ...(kitRef ? generateCi(root, config, { kit, kitRef }).map((file) => ({ ...file, pinned: true })) : []),
    ...pluginFiles(config, kit).map((file) => ({ ...file, pinned: false })),
  ];
  const read = (file: string) => (existsSync(path.join(root, file)) ? readFileSync(path.join(root, file), 'utf8') : undefined);

  const planned: Planned[] = [];
  /** Generated file → the text apply writes (with any newer third-party pins kept in a workflow). */
  const finals = new Map<string, string>();
  for (const { file, text, pinned } of generated) {
    const existing = read(file);
    const final = pinned ? keepNewerPins(text, existing) : text;
    finals.set(file, final);
    if (existing !== undefined && withLf(existing) === final) {
      planned.push({ change: { file, action: 'unchanged', diff: '' }, text: final });
      continue;
    }
    const diff = unifiedDiff(file, existing, final);
    // Apply's own file, or one that differs only in its pins, can be overwritten; anything else is someone's work.
    const ours = existing === undefined || recorded[file] === hashGenerated(existing) || withoutRefs(existing) === withoutRefs(final);
    const change: Change = ours
      ? { file, action: existing === undefined ? 'create' : 'update', diff }
      : { file, action: 'conflict', why: recorded[file] ? 'changed since simpright apply wrote it' : "simpright apply didn't write it", diff };
    planned.push({ change, text: final });
  }
  for (const [file, hash] of Object.entries(recorded)) {
    if (finals.has(file)) continue;
    const existing = read(file);
    if (existing === undefined) continue; // gone already: it just leaves the state
    const diff = unifiedDiff(file, existing, undefined);
    const change: Change =
      hashGenerated(existing) === hash ? { file, action: 'delete', diff } : { file, action: 'conflict', why: 'no longer generated, and changed since simpright apply wrote it', diff };
    planned.push({ change, text: null });
  }

  const settings = planSettings(root, state?.settings[SETTINGS_FILE]);
  if (settings) planned.push(settings);

  const wanted = kitEntries(config, kit.version);
  const pkg = planPackageJson(root, wanted, state?.packageJson);
  let owned: PackageEntries | undefined;
  if (pkg) {
    const base = { file: PACKAGE_FILE, part: "the kit's packages and scripts" };
    const diff = unifiedDiff(PACKAGE_FILE, pkg.before, pkg.after);
    const change: Change =
      pkg.conflicts.length > 0
        ? { ...base, action: 'conflict', why: `${pkg.conflicts.join(', ')}: simpright apply didn't write them, or they changed since`, diff }
        : { ...base, action: pkg.after === pkg.before ? 'unchanged' : 'update', diff };
    planned.push({ change, text: pkg.after });
    owned = pkg.owned;
  }
  planned.push(...planFolders(root, config));

  const changes = planned.map(({ change }) => change);
  const written = !options.dryRun && (options.force === true || changes.every((change) => change.action !== 'conflict'));
  if (written) {
    for (const { change, text } of planned) {
      if (change.action === 'unchanged') continue;
      const file = path.join(root, change.file);
      if (text === null) {
        rmSync(file, { force: true });
      } else {
        mkdirSync(path.dirname(file), { recursive: true });
        writeFileSync(file, text);
      }
    }
    writeState(root, {
      kit: kit.version,
      files: Object.fromEntries([...finals].map(([file, text]) => [file, hashGenerated(text)])),
      settings: {},
      packageJson: owned,
    });
  }
  const pkgChange = changes.find((change) => change.file === PACKAGE_FILE);
  return { kit, kitRef, changes, written, install: Boolean(pkg?.packagesChanged && pkgChange && pkgChange.action !== 'unchanged') };
}

/** The lines `simpright apply` prints for a result: one per file, then the diffs (all with --dry-run, else the conflicts'). */
export function report(result: ApplyResult, options: Pick<ApplyOptions, 'dryRun' | 'force'>): string[] {
  const out = [`simpright apply: kit ${result.kit.version}${result.kitRef ? `, its actions at ${result.kitRef.slice(0, 7)}` : ''}`];
  for (const change of result.changes) {
    out.push(`  ${change.action.padEnd(9)} ${change.file}${change.part ? ` (${change.part})` : ''}${change.why ? `: ${change.why}` : ''}`);
  }
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
  if (result.install && (options.dryRun || result.written)) out.push(`Then run npm install: the kit's packages in ${PACKAGE_FILE} change.`);
  return out;
}
