// The kit's plugins as plain project files (src/plain.ts): the QA plugin as the build ships it, and a small made-up
// plugin whose every converted file is checked.

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { currentKit } from '../src/kit.ts';
import { plainFiles } from '../src/plain.ts';

/** A plugin folder made of `files` (path → text) in a new temporary folder. */
function pluginOf(files: Record<string, string>): { dir: string; dispose: () => void } {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'simpright-plugin-'));
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    writeFileSync(path.join(dir, file), text);
  }
  return { dir, dispose: () => rmSync(dir, { recursive: true, force: true }) };
}

describe('plainFiles', () => {
  it('converts a plugin: names, paths, the plugin root, the shared files and the README', () => {
    const plugin = pluginOf({
      '.claude-plugin/plugin.json': JSON.stringify({ name: 'demo', displayName: 'Demo Tools', version: '1.0.0' }),
      'skills/check/SKILL.md': '---\r\nname: check\r\ndescription: Checks a file.\r\n---\r\n\r\nRead `${CLAUDE_PLUGIN_ROOT}/shared/rules.md`, then start the `demo:checker` agent.\r\nThe list: ${CLAUDE_SKILL_DIR}/references/list.md\r\n',
      'skills/check/references/list.md': 'Run /demo:check again after a fix.\n',
      'agents/checker.md': '---\nname: checker\nskills:\n  - demo:check\n---\n\nThe helper is `${CLAUDE_PLUGIN_ROOT}/skills/check/references/list.md`.\n',
      'shared/rules.md': '# Rules\n\nAsk with demo: only one question at a time.\n',
      'README.md': 'The plugin form: not converted.\n',
    });
    try {
      const files = Object.fromEntries(plainFiles(plugin.dir).map(({ file, text }) => [file, text]));
      assert.deepEqual(Object.keys(files), ['.claude/agents/demo-checker.md', '.claude/demo/README.md', '.claude/demo/rules.md', '.claude/skills/demo-check/references/list.md', '.claude/skills/demo-check/SKILL.md']);
      assert.equal(
        files['.claude/skills/demo-check/SKILL.md'],
        '---\nname: demo-check\ndescription: Checks a file.\n---\n\nRead `.claude/demo/rules.md`, then start the `demo-checker` agent.\nThe list: ${CLAUDE_SKILL_DIR}/references/list.md\n',
      );
      assert.equal(files['.claude/skills/demo-check/references/list.md'], 'Run /demo-check again after a fix.\n');
      assert.equal(files['.claude/agents/demo-checker.md'], '---\nname: demo-checker\nskills:\n  - demo-check\n---\n\nThe helper is `.claude/skills/demo-check/references/list.md`.\n');
      assert.equal(files['.claude/demo/rules.md'], '# Rules\n\nAsk with demo: only one question at a time.\n', '"demo:" followed by a space is no name');
      assert.match(files['.claude/demo/README.md']!, /^# Demo Tools: written by simpright apply\n/);
      assert.match(files['.claude/demo/README.md']!, /`\/demo-<skill>`/);
    } finally {
      plugin.dispose();
    }
  });

  it("refuses a skill or an agent without a name in its frontmatter", () => {
    const plugin = pluginOf({ '.claude-plugin/plugin.json': JSON.stringify({ name: 'demo' }), 'agents/nameless.md': '---\ndescription: No name.\n---\n\nHello.\n' });
    try {
      assert.throws(() => plainFiles(plugin.dir), /agents\/nameless\.md: no name in its frontmatter/);
    } finally {
      plugin.dispose();
    }
  });

  it('converts the QA plugin the build ships, leaving nothing of the plugin form', () => {
    const files = plainFiles(path.join(currentKit().plugins!, 'simpright-qa'));
    const under = (prefix: string) => files.filter(({ file }) => file.startsWith(prefix));
    assert.equal(new Set(under('.claude/skills/').map(({ file }) => file.split('/')[2])).size, 14, 'skills');
    assert.equal(under('.claude/agents/').length, 9, 'agents');
    assert.deepEqual(under('.claude/simpright-qa/').map(({ file }) => file), ['.claude/simpright-qa/how-to-ask.md', '.claude/simpright-qa/README.md']);
    for (const { file, text } of files) {
      assert.ok(!text.includes('${CLAUDE_PLUGIN_ROOT}') && !/simpright-qa:[a-z]/.test(text), `${file} names the plugin form`);
      assert.ok(!text.includes('\r'), `${file} has LF line endings`);
      if (/\/SKILL\.md$|^\.claude\/agents\//.test(file)) {
        const name = file.startsWith('.claude/agents/') ? path.basename(file, '.md') : file.split('/')[2];
        assert.match(text, new RegExp(`^name: ${name}$`, 'm'), `${file}: its name`);
      }
    }
    const writer = files.find(({ file }) => file === '.claude/agents/simpright-qa-api-contract-writer.md')!.text;
    assert.ok(writer.includes('`.claude/skills/simpright-qa-write-api-contracts/scripts/shape.js`'), "the contract writer's script at its project path");
  });
});
