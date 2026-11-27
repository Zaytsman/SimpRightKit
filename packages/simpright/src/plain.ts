// The kit's Claude Code plugins as plain project files. Claude Code loads a plugin that a repository supplies (a
// declared marketplace or a folder under .claude/skills/) only in a folder the user trusted, and the desktop app never
// shows the trust dialog; plain project skills and agents load in any session. So simpright apply writes each plugin a
// project uses into .claude/ (kit Phase 6, decided 2026-11-17 after a pilot):
// - skills/<s>/      -> .claude/skills/<plugin>-<s>/    (the frontmatter's name becomes <plugin>-<s>)
// - agents/<a>.md    -> .claude/agents/<plugin>-<a>.md  (name: <plugin>-<a>)
// - shared/          -> .claude/<plugin>/, with a README that says where the files come from
// In every text, `<plugin>:<name>` (how the plugin names its own skills and agents) becomes `<plugin>-<name>`, and
// ${CLAUDE_PLUGIN_ROOT}/shared/ and ${CLAUDE_PLUGIN_ROOT}/skills/<s>/ become those project paths. ${CLAUDE_SKILL_DIR}
// stays: a plain skill has it too.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Config } from './config.ts';
import type { GeneratedFile } from './generate.ts';
import type { Kit } from './kit.ts';
import { withLf } from './state.ts';

/** The setup plugin, which every kit project gets, and the QA agents' plugin, which parts.agents turns on. */
export const SETUP_PLUGIN = 'simpright';
export const AGENTS_PLUGIN = 'simpright-qa';

/** The folders and files of .claude/ that the plugin's plain files take: what apply owns there. */
export const plainPaths = (plugin: string) => [`.claude/skills/${plugin}-*/`, `.claude/agents/${plugin}-*.md`, `.claude/${plugin}/`];

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');

/** The manifest's name and display name. */
function manifest(pluginDir: string): { name: string; displayName: string } {
  const file = path.join(pluginDir, '.claude-plugin', 'plugin.json');
  const json = JSON.parse(readFileSync(file, 'utf8')) as { name?: unknown; displayName?: unknown };
  if (typeof json.name !== 'string') throw new Error(`${file}: no name`);
  return { name: json.name, displayName: typeof json.displayName === 'string' ? json.displayName : json.name };
}

/** Every file under `dir`, relative to it, with forward slashes, sorted. */
function filesUnder(dir: string, prefix = ''): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => (entry.isDirectory() ? filesUnder(path.join(dir, entry.name), `${prefix}${entry.name}/`) : [`${prefix}${entry.name}`]))
    .sort();
}

/** `text` with its frontmatter's name set to `name`; an error when the frontmatter has none. */
function renamed(text: string, name: string, file: string): string {
  const frontmatter = /^(---\n[\s\S]*?^name:[ \t]*)([^\n]+)/m;
  if (!frontmatter.test(text)) throw new Error(`${file}: no name in its frontmatter`);
  return text.replace(frontmatter, (_, head: string) => head + name);
}

/** The README apply writes into .claude/<plugin>/, so that someone who finds the files knows where they come from. */
function readme(name: string, displayName: string): string {
  return [
    `# ${displayName}: written by simpright apply`,
    '',
    `\`simpright apply\` writes the SimpRight Kit's \`${name}\` plugin into this project as plain files, which Claude Code loads in every session, a folder you never trusted included:`,
    '',
    `- its skills in \`.claude/skills/${name}-*/\`, which you run as \`/${name}-<skill>\`;`,
    `- its agents in \`.claude/agents/${name}-*.md\`;`,
    '- its shared files in this folder.',
    '',
    "Don't edit them: `apply` stops on a file that changed since it wrote it. The parts in `simpright.yml` say which plugins the project gets, and a kit upgrade, followed by `npm run apply`, brings their new versions.",
    '',
  ].join('\n');
}

/**
 * The plain files of the plugin in `pluginDir`, as GeneratedFile entries with paths from the project's root; throws when
 * a text still names the plugin's own paths or prefix after the conversion.
 */
export function plainFiles(pluginDir: string): GeneratedFile[] {
  const { name, displayName } = manifest(pluginDir);
  const scoped = new RegExp(`${escape(name)}:(?=[a-z])`, 'g');
  const rewrite = (text: string) =>
    withLf(text)
      .replace(/\$\{CLAUDE_PLUGIN_ROOT\}\/shared\//g, `.claude/${name}/`)
      .replace(/\$\{CLAUDE_PLUGIN_ROOT\}\/skills\/([a-z0-9-]+)\//g, (_, skill: string) => `.claude/skills/${name}-${skill}/`)
      .replace(scoped, `${name}-`);
  const read = (file: string) => readFileSync(path.join(pluginDir, file), 'utf8');

  const files: GeneratedFile[] = [];
  for (const file of filesUnder(path.join(pluginDir, 'skills'))) {
    const [skill, ...rest] = file.split('/');
    const target = `.claude/skills/${name}-${skill}/${rest.join('/')}`;
    const text = rewrite(read(`skills/${file}`));
    files.push({ file: target, text: rest.join('/') === 'SKILL.md' ? renamed(text, `${name}-${skill}`, `skills/${file}`) : text });
  }
  for (const file of filesUnder(path.join(pluginDir, 'agents')).filter((entry) => entry.endsWith('.md') && !entry.includes('/'))) {
    const agent = `${name}-${file.replace(/\.md$/, '')}`;
    files.push({ file: `.claude/agents/${agent}.md`, text: renamed(rewrite(read(`agents/${file}`)), agent, `agents/${file}`) });
  }
  for (const file of filesUnder(path.join(pluginDir, 'shared'))) {
    files.push({ file: `.claude/${name}/${file}`, text: rewrite(read(`shared/${file}`)) });
  }
  files.push({ file: `.claude/${name}/README.md`, text: readme(name, displayName) });

  const left = files.filter(({ text }) => text.includes('${CLAUDE_PLUGIN_ROOT}') || new RegExp(`${escape(name)}:(?=[a-z])`).test(text));
  if (left.length > 0) throw new Error(`The ${name} plugin's plain files still name plugin paths: ${left.map(({ file }) => file).join(', ')}`);
  return files.sort((a, b) => a.file.localeCompare(b.file));
}

/**
 * The plain files of the kit's plugins that `config` turns on: the setup plugin in every project (once the kit has
 * it), the QA agents' with parts.agents; throws when the agents' plugin is wanted and the build has none.
 */
export function pluginFiles(config: Config, kit: Kit): GeneratedFile[] {
  const pluginDir = (name: string) => (kit.plugins ? path.join(kit.plugins, name) : undefined);
  const files: GeneratedFile[] = [];
  const setup = pluginDir(SETUP_PLUGIN);
  if (setup && existsSync(setup)) files.push(...plainFiles(setup));
  if (config.parts?.agents) {
    const agents = pluginDir(AGENTS_PLUGIN);
    if (!agents || !existsSync(agents)) throw new Error(`This simpright ${kit.version} has no ${AGENTS_PLUGIN} plugin to write (dist/plugins/${AGENTS_PLUGIN}): build it with npm run build.`);
    files.push(...plainFiles(agents));
  }
  return files;
}
