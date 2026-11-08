// The kit's Claude Code plugins (plugins/*) and their marketplace: the fields their agents and skills set, the names,
// paths and simpright.yml keys their texts use, and the names of SimpRight's own app, which none of them may contain.
// `npm run validate:plugins` runs Claude Code's own checks of the same files.

import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { KIT } from './helpers.ts';

const VERSION = (JSON.parse(readFileSync(path.join(KIT, 'packages/simpright/package.json'), 'utf8')) as { version: string }).version;

/** Fields a plugin agent supports (code.claude.com/docs/en/plugins/components, "Frontmatter fields in plugin agents"). */
const AGENT_FIELDS = new Set(['name', 'description', 'model', 'effort', 'maxTurns', 'autoCompactWindow', 'tools', 'disallowedTools', 'skills', 'memory', 'background', 'omitClaudeMd', 'isolation', 'color', 'experimental']);
/** Fields a skill supports (code.claude.com/docs/en/skills). */
const SKILL_FIELDS = new Set(['name', 'description', 'when_to_use', 'argument-hint', 'arguments', 'disable-model-invocation', 'user-invocable', 'allowed-tools', 'disallowed-tools', 'model', 'effort', 'context', 'agent', 'background', 'hooks', 'paths', 'shell', 'metadata', 'license', 'compatibility']);
/** The skill listing cuts a description (with when_to_use) at this length. */
const DESCRIPTION_LIMIT = 1536;
/** SimpRight's app under test, its helpers and its tools: facts like these belong in a project's simpright.yml. */
const APP_WORDS = [/Toolshop/i, /practicesoftwaretesting/i, /practice-software-testing/i, /sprint5/, /re-?seed/i, /Cloudflare/i, /putProductInCart/, /findProductByName/, /registerCustomerForTest/, /registerThrowawayCustomer/, /search_completed/, /parseAmount/, /TestConstants/, /CartPage/, /run's customer/, /@zaytsman/, /playwright-api-coverage/];
/** The top-level keys of simpright.yml that the texts name as `key.subkey`. */
const CONFIG_KEYS = ['template', 'project', 'paths', 'commands', 'ids', 'roles', 'api', 'ui', 'liveApi', 'parts', 'core', 'ci', 'runs', 'portal'];

interface Schema {
  properties?: Record<string, Schema>;
  additionalProperties?: boolean | Schema;
  oneOf?: Schema[];
  anyOf?: Schema[];
  allOf?: Schema[];
  $ref?: string;
  definitions?: Record<string, Schema>;
}
const SCHEMA = JSON.parse(readFileSync(path.join(KIT, 'packages/simpright/simpright.schema.json'), 'utf8')) as Schema;

interface Plugin {
  name: string;
  root: string;
  agents: string[];
  skills: string[];
  /** Every text file of the plugin, relative to its root. */
  files: string[];
}

function filesUnder(root: string, dir = ''): string[] {
  return readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const file = path.posix.join(dir, entry.name);
    return entry.isDirectory() ? filesUnder(root, file) : [file];
  });
}

const PLUGINS: Plugin[] = readdirSync(path.join(KIT, 'plugins'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => {
    const root = path.join(KIT, 'plugins', entry.name);
    const manifest = JSON.parse(readFileSync(path.join(root, '.claude-plugin/plugin.json'), 'utf8')) as { name: string };
    return {
      name: manifest.name,
      root,
      agents: readdirSync(path.join(root, 'agents')).filter((file) => file.endsWith('.md')).map((file) => file.slice(0, -3)),
      skills: readdirSync(path.join(root, 'skills')).filter((dir) => existsSync(path.join(root, 'skills', dir, 'SKILL.md'))),
      files: filesUnder(root).filter((file) => !file.startsWith('.claude-plugin/')),
    };
  });

const read = (plugin: Plugin, file: string) => readFileSync(path.join(plugin.root, file), 'utf8').replace(/\r\n/g, '\n');

/** A Markdown file's frontmatter: `key: value` lines, and `key:` followed by `  - item` lines. */
function frontmatter(text: string): Map<string, string | string[]> {
  const block = /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1];
  assert.ok(block !== undefined, 'no frontmatter');
  const fields = new Map<string, string | string[]>();
  let list: string[] | undefined;
  for (const line of block.split('\n')) {
    const item = /^\s+- (.*)$/.exec(line);
    if (item && list) {
      list.push(item[1]!);
      continue;
    }
    const field = /^([\w-]+):\s?(.*)$/.exec(line);
    assert.ok(field, `a frontmatter line that isn't a field: ${line}`);
    list = field[2] === '' ? [] : undefined;
    fields.set(field[1]!, list ?? field[2]!);
  }
  return fields;
}

/** Whether `key` (a.b.c) is a key of simpright.yml's schema. */
function isConfigKey(key: string): boolean {
  const deref = (node: Schema): Schema => (node.$ref ? deref(SCHEMA.definitions![node.$ref.replace('#/definitions/', '')]!) : node);
  let nodes = [SCHEMA];
  for (const segment of key.split('.')) {
    const variants = nodes.map(deref).flatMap((node) => [node, ...(node.oneOf ?? []), ...(node.anyOf ?? []), ...(node.allOf ?? [])].map(deref));
    nodes = variants.flatMap((node) => {
      const property = node.properties?.[segment];
      if (property) return [property];
      return typeof node.additionalProperties === 'object' ? [node.additionalProperties] : [];
    });
    if (nodes.length === 0) return false;
  }
  return true;
}

for (const plugin of PLUGINS) {
  const names = new Set([...plugin.agents, ...plugin.skills]);
  const texts = plugin.files.filter((file) => /\.(md|js|json)$/.test(file));

  describe(`the ${plugin.name} plugin`, () => {
    it('has its folder name and the kit version in its manifest', () => {
      const manifest = JSON.parse(read(plugin, '.claude-plugin/plugin.json')) as { name: string; version?: string };
      assert.equal(manifest.name, path.basename(plugin.root));
      assert.equal(manifest.version, VERSION, 'the plugin carries the kit version (release.ts sets it)');
    });

    it('has agents that set only the fields plugin agents support, keep their file names and start without CLAUDE.md', () => {
      assert.ok(plugin.agents.length > 0, 'no agents');
      for (const agent of plugin.agents) {
        const fields = frontmatter(read(plugin, `agents/${agent}.md`));
        for (const key of fields.keys()) assert.ok(AGENT_FIELDS.has(key), `agents/${agent}.md: ${key} isn't a field plugin agents support`);
        assert.equal(fields.get('name'), agent, `agents/${agent}.md: name`);
        assert.ok(typeof fields.get('description') === 'string' && fields.get('description') !== '', `agents/${agent}.md: a one-line description`);
        assert.equal(fields.get('omitClaudeMd'), 'true', `agents/${agent}.md: the agents read project.conventions themselves`);
      }
    });

    it("has agents that preload only the plugin's own skills, by their scoped names", () => {
      for (const agent of plugin.agents) {
        const skills = frontmatter(read(plugin, `agents/${agent}.md`)).get('skills') ?? [];
        assert.ok(Array.isArray(skills), `agents/${agent}.md: skills is a list`);
        for (const skill of skills) {
          const match = new RegExp(`^${plugin.name}:(.+)$`).exec(skill);
          assert.ok(match && plugin.skills.includes(match[1]!), `agents/${agent}.md: preloads ${skill}, which isn't ${plugin.name}:<one of its skills>`);
        }
      }
    });

    it("has skills named after their folders, with a description the listing doesn't cut", () => {
      assert.ok(plugin.skills.length > 0, 'no skills');
      for (const skill of plugin.skills) {
        const fields = frontmatter(read(plugin, `skills/${skill}/SKILL.md`));
        for (const key of fields.keys()) assert.ok(SKILL_FIELDS.has(key), `skills/${skill}/SKILL.md: ${key} isn't a skill field`);
        assert.equal(fields.get('name'), skill, `skills/${skill}/SKILL.md: name`);
        const description = `${fields.get('description') ?? ''}${fields.get('when_to_use') ?? ''}`;
        assert.ok(description.length > 0 && description.length <= DESCRIPTION_LIMIT, `skills/${skill}/SKILL.md: a description of 1 to ${DESCRIPTION_LIMIT} characters`);
      }
    });

    it('names its agents and skills by their scoped names only, and each one exists', () => {
      const scoped = new RegExp(`(?<![\\w-])${plugin.name}:([a-z][a-z0-9*-]*[a-z0-9])`, 'g');
      for (const file of texts) {
        read(plugin, file).split('\n').forEach((line, index) => {
          const where = `${file}:${index + 1}`;
          for (const [, name] of line.matchAll(scoped)) {
            const pattern = new RegExp(`^${name!.replaceAll('*', '[a-z0-9-]+')}$`);
            assert.ok([...names].some((known) => pattern.test(known)), `${where}: ${plugin.name}:${name} is no agent or skill of the plugin`);
          }
          if (/^name: /.test(line)) return;
          for (const name of names) {
            for (const match of line.matchAll(new RegExp(`(?<![\\w:.-])${name}(?![\\w-])`, 'g'))) {
              const before = line.slice(0, match.index);
              assert.ok(before.endsWith('skills/'), `${where}: names ${name} without the ${plugin.name}: prefix`);
            }
          }
        });
      }
    });

    it('points its path variables at its own files, only where Claude Code substitutes them', () => {
      for (const file of texts) {
        const isSkill = /^skills\/[^/]+\/SKILL\.md$/.test(file);
        const isAgent = /^agents\/[^/]+\.md$/.test(file);
        for (const [, variable, rest] of read(plugin, file).matchAll(/\$\{(CLAUDE_[A-Z_]+)\}([^\s`'")<>,;]*)/g)) {
          const allowed = variable === 'CLAUDE_PLUGIN_ROOT' ? isSkill || isAgent : variable === 'CLAUDE_SKILL_DIR' && isSkill;
          assert.ok(allowed, `${file}: \${${variable}} isn't substituted here (only in SKILL.md and agent bodies; CLAUDE_SKILL_DIR in SKILL.md only)`);
          const relative = rest!.replace(/[.:]+$/, '');
          const base = variable === 'CLAUDE_SKILL_DIR' ? path.join(plugin.root, path.dirname(file)) : plugin.root;
          assert.ok(existsSync(path.join(base, relative)), `${file}: \${${variable}}${relative} doesn't exist`);
        }
      }
    });

    it("doesn't point into a project's .claude folder", () => {
      for (const file of texts) {
        const text = read(plugin, file);
        for (const old of ['.claude/skills', '.claude/agents', '_shared/']) assert.ok(!text.includes(old), `${file}: names ${old}`);
      }
    });

    it('names only simpright.yml keys that its schema has', () => {
      const key = new RegExp(`\`((?:${CONFIG_KEYS.join('|')})(?:\\.[A-Za-z][A-Za-z0-9]*)+)\``, 'g');
      for (const file of texts) {
        for (const [, name] of read(plugin, file).matchAll(key)) {
          if (/\.(md|ts|mts|js|json|ya?ml)$/.test(name!)) continue;
          assert.ok(isConfigKey(name!), `${file}: ${name} isn't a key of simpright.yml`);
        }
      }
    });

    it("names nothing of SimpRight's own app under test", () => {
      for (const file of texts) {
        const text = read(plugin, file);
        for (const word of APP_WORDS) assert.ok(!word.test(text), `${file}: names ${word.source}`);
      }
    });
  });
}

describe('the marketplace', () => {
  it('lists every plugin by its manifest name and folder, with no version of its own', () => {
    const marketplace = JSON.parse(readFileSync(path.join(KIT, '.claude-plugin/marketplace.json'), 'utf8')) as { name: string; plugins: { name: string; source: string; version?: string }[] };
    assert.equal(marketplace.name, 'simpright-kit');
    assert.deepEqual(
      marketplace.plugins.map(({ name, source }) => ({ name, source })),
      PLUGINS.map(({ name, root }) => ({ name, source: `./plugins/${path.basename(root)}` })),
    );
    for (const entry of marketplace.plugins) assert.equal(entry.version, undefined, `${entry.name}: the version is plugin.json's (the kit version)`);
  });
});
