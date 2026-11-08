// The agents part's entries in a project's .claude/settings.json (parts.agents): the kit's marketplace, simpright-kit,
// from GitHub at the kit release's tag, and its plugin, simpright-qa, enabled. simpright apply writes the two entries and
// simpright doctor checks them. The rest of the file is the project's own (other marketplaces and plugins, permissions,
// hooks), and .claude/settings.local.json is each person's: apply touches neither.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ConfigError } from './config.ts';
import { KIT_REPO } from './kit.ts';

/** The project's shared Claude Code settings, which the repository commits. */
export const SETTINGS_FILE = '.claude/settings.json';
/** The kit's marketplace, by the name its .claude-plugin/marketplace.json gives it. */
export const MARKETPLACE = 'simpright-kit';
/** The QA agents' plugin: its name, and its id as enabledPlugins names it. */
export const PLUGIN_NAME = 'simpright-qa';
export const PLUGIN = `${PLUGIN_NAME}@${MARKETPLACE}`;
/** The folders the marketplace's sparse checkout fetches: its catalog and the plugins, not the kit's packages. */
const SPARSE_PATHS = ['.claude-plugin', 'plugins'];

/** A JSON object, as a settings file holds one. */
export type Settings = Record<string, unknown>;

/** The two entries: the marketplace's (under extraKnownMarketplaces) and the plugin's (under enabledPlugins). */
export interface PluginEntries {
  marketplace?: unknown;
  plugin?: unknown;
}

/** The marketplace's source in the entries for kit `version`: the kit's repository at the release's tag. */
export function marketplaceSource(version: string): { source: 'github'; repo: string; ref: string; sparsePaths: string[] } {
  return { source: 'github', repo: KIT_REPO, ref: `v${version}`, sparsePaths: SPARSE_PATHS };
}

/** The entries apply writes for kit `version`: the marketplace at the release's tag, and the plugin enabled. */
export function pluginEntries(version: string): Required<PluginEntries> {
  return { marketplace: { source: marketplaceSource(version) }, plugin: true };
}

const isObject = (value: unknown): value is Settings => typeof value === 'object' && value !== null && !Array.isArray(value);

/** The project's settings file, its text and its JSON (undefined when there's none); a ConfigError when it isn't a JSON object. */
export function readSettings(root: string): { text: string; settings: Settings } | undefined {
  const file = path.join(root, SETTINGS_FILE);
  if (!existsSync(file)) return undefined;
  const text = readFileSync(file, 'utf8');
  let settings: unknown;
  try {
    settings = JSON.parse(text);
  } catch (error) {
    throw new ConfigError([`${SETTINGS_FILE}: invalid JSON (Claude Code's settings are strict JSON): ${(error as Error).message}`]);
  }
  if (!isObject(settings)) throw new ConfigError([`${SETTINGS_FILE}: must be a JSON object`]);
  for (const key of ['extraKnownMarketplaces', 'enabledPlugins']) {
    if (settings[key] !== undefined && !isObject(settings[key])) throw new ConfigError([`${SETTINGS_FILE}: ${key} must be a JSON object`]);
  }
  return { text, settings };
}

/** The two entries as `settings` has them; a missing one is undefined. */
export function entriesOf(settings: Settings | undefined): PluginEntries {
  const marketplaces = settings?.extraKnownMarketplaces as Settings | undefined;
  const plugins = settings?.enabledPlugins as Settings | undefined;
  return { marketplace: marketplaces?.[MARKETPLACE], plugin: plugins?.[PLUGIN] };
}

/** Whether either entry is there. */
export const hasEntries = (entries: PluginEntries) => entries.marketplace !== undefined || entries.plugin !== undefined;

/** The value with every object's keys sorted, so equal entries hash alike whatever their key order. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (isObject(value)) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}

/** The hash state.json records for the entries: their values only, not the file's formatting or other keys. */
export function hashEntries(entries: PluginEntries): string {
  const json = JSON.stringify(canonical([entries.marketplace ?? null, entries.plugin ?? null]));
  return `sha256-${createHash('sha256').update(json).digest('hex')}`;
}

/**
 * `settings` (or, for a new file, nothing) with the entries set to `entries`, or without them when it's undefined; an
 * extraKnownMarketplaces or enabledPlugins that removing them leaves empty goes too. The other keys keep their order,
 * and a new one comes last.
 */
export function withEntries(settings: Settings | undefined, entries: PluginEntries | undefined): Settings {
  const result: Settings = { ...settings };
  const put = (key: string, name: string, value: unknown) => {
    const map: Settings = { ...(isObject(result[key]) ? result[key] : {}) };
    if (value === undefined) delete map[name];
    else map[name] = value;
    if (Object.keys(map).length > 0) result[key] = map;
    else delete result[key];
  };
  put('extraKnownMarketplaces', MARKETPLACE, entries?.marketplace);
  put('enabledPlugins', PLUGIN, entries?.plugin);
  return result;
}

/** The file's text for `settings`: JSON indented as `text` (the file now) indents its keys, two spaces by default. */
export function formatSettings(settings: Settings, text: string | undefined): string {
  const indent = /^([ \t]+)"/m.exec(text ?? '')?.[1] ?? '  ';
  return `${JSON.stringify(settings, null, indent)}\n`;
}
