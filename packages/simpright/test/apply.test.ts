// simpright apply on copies of the sample project: the CI files it writes (against the golden files in test/golden/),
// the parts it turns on and their needs, the QA plugin as plain files in .claude/, the kit's entries in package.json,
// the settings entries of kit 0.3.0 it removes, the state it keeps, the conflicts that stop it, and the CLI.
// UPDATE_GOLDEN=1 rewrites the golden files.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { KIT, sampleProject, type Project } from '../../../test/helpers.ts';
import { apply, report, type ApplyOptions, type ApplyResult } from '../src/apply.ts';
import { ConfigError, readConfig, UsageError } from '../src/config.ts';
import { unifiedDiff } from '../src/diff.ts';
import { describeCron } from '../src/generate.ts';
import { currentKit, type Kit } from '../src/kit.ts';
import { plainFiles } from '../src/plain.ts';
import { hashEntries, pluginEntries } from '../src/settings.ts';
import { readState, STATE_FILE } from '../src/state.ts';

const GOLDEN = path.join(KIT, 'packages/simpright/test/golden');
const CLI = path.join(KIT, 'packages/simpright/dist/cli.js');
const REF = 'b'.repeat(40);
/** A kit release with made-up pins and version, so the golden files don't change with the kit's own. */
const TEST_KIT: Kit = {
  version: '9.9.9',
  actions: currentKit().actions,
  pins: {
    'actions/checkout': { ref: 'c'.repeat(40), version: 'v7.0.1' },
    'actions/upload-artifact': { ref: 'a'.repeat(40), version: 'v7.0.2' },
  },
  plugins: currentKit().plugins,
};
const CHECKOUT = `uses: actions/checkout@${'c'.repeat(40)} # v7.0.1`;

/** A sample project without its hand-written workflows and actions: what a project looks like before its first apply. */
function freshProject(change: (project: Project) => void = () => {}): Project {
  const project = sampleProject();
  project.remove('.github');
  change(project);
  return project;
}

const run = (project: Project, options: ApplyOptions = {}) => apply(project.root, readConfig(project.root), { kit: TEST_KIT, kitRef: REF, ...options });

const SETTINGS = '.claude/settings.json';
/** The command the sample gets for the page inspector, which its UI agents need. */
const INSPECT_UI = '  runScenario: npx playwright test -g "{id}:"\n';
/** Turns the agents part on in the sample, which has it off, with the page inspector its UI agents need. */
const agentsOn = (project: Project) => {
  project.edit('simpright.yml', 'parts:\n  scenarios: true\n', 'parts:\n  scenarios: true\n  inspector: true\n  agents: true\n');
  if (!project.read('simpright.yml').includes('inspectUi:')) project.edit('simpright.yml', INSPECT_UI, `${INSPECT_UI}  inspectUi: npm run inspect:ui -- {path}\n`);
};
const agentsOff = (project: Project) => project.edit('simpright.yml', '  inspector: true\n  agents: true\n', '');
/** The change apply plans for `file`, if any. */
const changeOf = (result: ApplyResult, file: string) => result.changes.find((change) => change.file === file);
const settingsChange = (result: ApplyResult) => changeOf(result, SETTINGS);
/** The changes apply plans under `prefix`. */
const changesUnder = (result: ApplyResult, prefix: string) => result.changes.filter((change) => change.file.startsWith(prefix));
/** The QA plugin's plain files, as apply writes them. */
const QA_FILES = plainFiles(path.join(currentKit().plugins!, 'simpright-qa'));

/** The sample turned into a project like SimpRight: a private coverage package, a wiki, the agents, a develop branch, named workflows. */
function simprightLike(project: Project): void {
  agentsOn(project);
  project.edit('simpright.yml', '  agents: true\n', "  agents: true\n  coverage: { package: '@acme/coverage', registry: https://npm.pkg.github.com }\n  wiki: true\n");
  project.edit('simpright.yml', '  pages: src/app/pages\n', '  pages: src/app/pages\n  wiki: docs/wiki\n');
  project.edit('simpright.yml', 'branches: { default: main }', 'branches: { default: main, work: develop }');
  project.edit('simpright.yml', '  - id: ui-regression\n', '  - id: ui-regression\n    workflow: run-ui-tests.yml\n');
  project.edit('simpright.yml', "    grep: '@smoke'\n", "    grep: '@smoke'\n    keep: 5\n");
  project.write('docs/wiki/Home.md', '# Home\n');
}

/** Every file under `dir`, relative to it, with forward slashes. */
function filesUnder(dir: string, prefix = ''): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? filesUnder(path.join(dir, entry.name), `${prefix}${entry.name}/`) : [`${prefix}${entry.name}`],
  );
}

/** Compares what apply wrote under .github/ with test/golden/<variant>/ (or rewrites it with UPDATE_GOLDEN=1). */
function assertGolden(project: Project, variant: string): void {
  const written = filesUnder(path.join(project.root, '.github')).sort();
  const golden = path.join(GOLDEN, variant);
  if (process.env.UPDATE_GOLDEN) {
    for (const file of written) {
      mkdirSync(path.dirname(path.join(golden, file)), { recursive: true });
      writeFileSync(path.join(golden, file), project.read(`.github/${file}`));
    }
  }
  assert.deepEqual(written, filesUnder(golden).sort(), `the files apply writes for ${variant}`);
  for (const file of written) {
    assert.equal(project.read(`.github/${file}`), readFileSync(path.join(golden, file), 'utf8').replace(/\r\n/g, '\n'), `${variant}: .github/${file}`);
  }
}

describe('simpright apply', () => {
  it("writes the sample project's CI files", () => {
    const project = freshProject();
    try {
      const result = run(project);
      assert.equal(result.written, true);
      const ci = changesUnder(result, '.github/');
      assert.ok(ci.every((change) => change.action === 'create'));
      assertGolden(project, 'sample');
      assert.deepEqual(Object.keys(readState(project.root)?.files ?? {}), ci.map((change) => change.file).sort());
      assert.equal(changeOf(result, 'package.json')?.action, 'update');
    } finally {
      project.dispose();
    }
  });

  it('writes a project with a private package, a wiki, the agents, a work branch and named workflows', () => {
    const project = freshProject(simprightLike);
    try {
      const result = run(project);
      assert.equal(result.written, true);
      assertGolden(project, 'simpright-like');
      assert.equal(changesUnder(result, '.claude/').length, QA_FILES.length);
      assert.equal(settingsChange(result), undefined);
    } finally {
      project.dispose();
    }
  });

  it('changes nothing the second time', () => {
    const project = freshProject();
    try {
      run(project);
      const state = project.read(STATE_FILE);
      const again = run(project);
      assert.ok(again.changes.every((change) => change.action === 'unchanged'));
      assert.equal(project.read(STATE_FILE), state);
    } finally {
      project.dispose();
    }
  });

  it('stops on a file someone changed, and --force overwrites it', () => {
    const project = freshProject();
    try {
      run(project);
      project.edit('.github/workflows/smoke.yml', 'name: Smoke test run', 'name: My smoke run');
      project.edit('simpright.yml', 'label: Smoke', 'label: Smoke set');
      const stopped = run(project);
      assert.equal(stopped.written, false);
      assert.deepEqual(
        stopped.changes.filter((change) => change.action !== 'unchanged').map(({ file, action, why }) => ({ file, action, why })),
        [{ file: '.github/workflows/smoke.yml', action: 'conflict', why: 'changed since simpright apply wrote it' }],
      );
      assert.match(project.read('.github/workflows/smoke.yml'), /My smoke run/);
      assert.equal(run(project, { force: true }).written, true);
      assert.match(project.read('.github/workflows/smoke.yml'), /name: Smoke set test run/);
    } finally {
      project.dispose();
    }
  });

  it("stops on a workflow it didn't write, unless it differs only in its pins", () => {
    const project = freshProject();
    try {
      project.write('.github/workflows/pr-checks.yml', 'name: Our own checks\n');
      const stopped = run(project);
      assert.equal(stopped.written, false);
      assert.equal(stopped.changes.find((change) => change.file === '.github/workflows/pr-checks.yml')?.why, "simpright apply didn't write it");

      project.remove('.github');
      run(project);
      project.remove(STATE_FILE);
      project.edit('.github/workflows/pr-checks.yml', CHECKOUT, `uses: actions/checkout@${'d'.repeat(40)} # v7.0.0`);
      const adopted = run(project);
      assert.equal(adopted.written, true);
      assert.equal(adopted.changes.find((change) => change.file === '.github/workflows/pr-checks.yml')?.action, 'update');
    } finally {
      project.dispose();
    }
  });

  it("keeps a third-party pin that's newer than the kit's, and updates an older one", () => {
    const project = freshProject();
    try {
      run(project);
      const newer = `uses: actions/checkout@${'e'.repeat(40)} # v7.1.0`;
      project.edit('.github/workflows/pr-checks.yml', CHECKOUT, newer);
      project.edit('.github/workflows/squash-gh-pages.yml', CHECKOUT, `uses: actions/checkout@${'d'.repeat(40)} # v6.9.0`);
      const result = run(project);
      assert.equal(result.written, true);
      assert.equal(result.changes.find((change) => change.file === '.github/workflows/pr-checks.yml')?.action, 'unchanged');
      assert.equal(result.changes.find((change) => change.file === '.github/workflows/squash-gh-pages.yml')?.action, 'update');
      assert.ok(project.read('.github/workflows/pr-checks.yml').includes(newer), 'the newer pin stays');
      assert.ok(project.read('.github/workflows/squash-gh-pages.yml').includes(CHECKOUT), "the older pin becomes the kit's");
    } finally {
      project.dispose();
    }
  });

  it("moves the kit's pins to another release without calling it a conflict", () => {
    const project = freshProject();
    try {
      run(project);
      const moved = run(project, { kitRef: 'f'.repeat(40), kit: { ...TEST_KIT, version: '9.9.10' } });
      assert.equal(moved.written, true);
      // The callers and dependabot.yml use none of the kit's actions, and the sample's package.json links the kit's
      // packages from the kit's folder, so a new version doesn't change it.
      assert.deepEqual(
        moved.changes.filter((change) => change.action === 'unchanged').map((change) => change.file),
        ['.github/dependabot.yml', '.github/workflows/api-regression.yml', '.github/workflows/custom-ui.yml', '.github/workflows/smoke.yml', '.github/workflows/ui-regression.yml', 'package.json'],
      );
      assert.ok(moved.changes.every((change) => change.action === 'update' || change.action === 'unchanged'));
      assert.ok(project.read('.github/workflows/pr-checks.yml').includes(`Zaytsman/SimpRightKit/actions/setup@${'f'.repeat(40)} # v9.9.10`), 'the pins move to the new release');
      assert.equal(readState(project.root)?.kit, '9.9.10');
    } finally {
      project.dispose();
    }
  });

  it("removes the workflow of a run that's gone, unless someone changed it", () => {
    const project = freshProject();
    try {
      run(project);
      project.edit('simpright.yml', "  - id: smoke\n    label: Smoke\n    note: UI + API\n    project: all\n    grep: '@smoke'\n", '');
      const removed = run(project);
      assert.deepEqual(removed.changes.filter((change) => change.action === 'delete').map((change) => change.file), ['.github/workflows/smoke.yml']);
      assert.equal(existsSync(path.join(project.root, '.github/workflows/smoke.yml')), false);
      assert.equal(readState(project.root)?.files['.github/workflows/smoke.yml'], undefined);

      project.edit('simpright.yml', '  - id: custom-ui\n', "  - id: smoke\n    label: Smoke\n    project: all\n    grep: '@smoke'\n  - id: custom-ui\n");
      run(project);
      project.edit('.github/workflows/smoke.yml', 'name: Smoke test run', 'name: Kept by hand');
      project.edit('simpright.yml', "  - id: smoke\n    label: Smoke\n    project: all\n    grep: '@smoke'\n", '');
      const stopped = run(project);
      assert.equal(stopped.written, false);
      assert.equal(stopped.changes.find((change) => change.file === '.github/workflows/smoke.yml')?.why, 'no longer generated, and changed since simpright apply wrote it');
    } finally {
      project.dispose();
    }
  });

  it('writes nothing in a dry run', () => {
    const project = freshProject();
    try {
      const before = project.read('package.json');
      const result = run(project, { dryRun: true });
      assert.equal(result.written, false);
      assert.ok(changesUnder(result, '.github/').every((change) => change.action === 'create' && change.diff.startsWith('--- /dev/null')));
      assert.equal(changeOf(result, 'package.json')?.action, 'update');
      assert.equal(existsSync(path.join(project.root, '.github')), false);
      assert.equal(existsSync(path.join(project.root, STATE_FILE)), false);
      assert.equal(project.read('package.json'), before);
    } finally {
      project.dispose();
    }
  });

  it('needs the kit commit to pin the actions to', () => {
    const project = freshProject();
    try {
      const config = readConfig(project.root);
      assert.throws(() => apply(project.root, config, { kit: TEST_KIT }), (error) => error instanceof UsageError && /pass --kit-ref <commit>/.test(error.message));
      assert.throws(() => apply(project.root, config, { kit: TEST_KIT, kitRef: 'v1.0.0' }), (error) => error instanceof UsageError && /full commit SHA/.test(error.message));
      assert.equal(apply(project.root, config, { kit: { ...TEST_KIT, commit: REF }, dryRun: true }).kitRef, REF);
    } finally {
      project.dispose();
    }
  });

  const problems: { name: string; change: (project: Project) => void; expect: string }[] = [
    { name: 'a wiki without its folder', change: (p) => p.edit('simpright.yml', 'parts:\n  scenarios: true\n', 'parts:\n  scenarios: true\n  wiki: true\n'), expect: 'simpright.yml: parts.wiki needs paths.wiki, the folder of the wiki pages' },
    {
      name: 'a registry other than GitHub Packages',
      change: (p) => p.edit('simpright.yml', 'parts:\n  scenarios: true\n', "parts:\n  scenarios: true\n  coverage: { package: '@acme/coverage', registry: https://registry.acme.test }\n"),
      expect: 'parts.coverage.registry: the CI part installs from GitHub Packages (https://npm.pkg.github.com) only',
    },
    { name: "a run named after another workflow's file", change: (p) => p.edit('simpright.yml', '  - id: smoke\n', '  - id: smoke\n    workflow: pr-checks.yml\n'), expect: 'smoke: its workflow .github/workflows/pr-checks.yml is one simpright apply writes for another purpose' },
    { name: 'two runs with one workflow', change: (p) => p.edit('simpright.yml', '  - id: smoke\n', '  - id: smoke\n    workflow: custom-ui.yml\n'), expect: 'custom-ui and smoke both name the workflow .github/workflows/custom-ui.yml' },
  ];
  for (const { name, change, expect } of problems) {
    it(`refuses ${name}`, () => {
      const project = freshProject(change);
      try {
        assert.throws(() => run(project), (error) => error instanceof ConfigError && error.problems.some((problem) => problem.includes(expect)), expect);
      } finally {
        project.dispose();
      }
    });
  }
});

describe('simpright apply: the QA plugin as plain files in .claude/', () => {
  it('writes the plugin with parts.agents, and changes nothing the second time', () => {
    const project = freshProject(agentsOn);
    try {
      const first = run(project);
      assert.equal(first.written, true);
      const written = changesUnder(first, '.claude/');
      assert.deepEqual(written.map((change) => change.file), QA_FILES.map(({ file }) => file));
      assert.ok(written.every((change) => change.action === 'create'));
      const engineer = project.read('.claude/agents/simpright-qa-ui-test-engineer.md');
      assert.match(engineer, /^name: simpright-qa-ui-test-engineer$/m);
      assert.match(engineer, /^ {2}- simpright-qa-ui-scaffolding$/m, 'the preloaded skills by their plain names');
      const review = project.read('.claude/skills/simpright-qa-review-tests/SKILL.md');
      assert.match(review, /^name: simpright-qa-review-tests$/m);
      assert.ok(review.includes('`.claude/simpright-qa/how-to-ask.md`'), 'the shared file at its project path');
      assert.ok(review.includes('${CLAUDE_SKILL_DIR}/references/'), "a plain skill's own folder");
      assert.ok(existsSync(path.join(project.root, '.claude/simpright-qa/README.md')));
      assert.equal(existsSync(path.join(project.root, SETTINGS)), false, 'no settings entries since kit 0.4.0');
      assert.ok(QA_FILES.every(({ file }) => readState(project.root)?.files[file]?.startsWith('sha256-')));

      const state = project.read(STATE_FILE);
      const again = run(project);
      assert.ok(changesUnder(again, '.claude/').every((change) => change.action === 'unchanged'));
      assert.equal(project.read(STATE_FILE), state);
    } finally {
      project.dispose();
    }
  });

  it('stops on a file someone changed, and --force overwrites it', () => {
    const project = freshProject(agentsOn);
    try {
      run(project);
      const file = '.claude/agents/simpright-qa-test-reviewer.md';
      const original = project.read(file);
      project.write(file, `${original}\nAlso check the comments.\n`);
      const stopped = run(project);
      assert.equal(stopped.written, false);
      assert.deepEqual({ action: changeOf(stopped, file)?.action, why: changeOf(stopped, file)?.why }, { action: 'conflict', why: 'changed since simpright apply wrote it' });
      assert.equal(run(project, { force: true }).written, true);
      assert.equal(project.read(file), original);
    } finally {
      project.dispose();
    }
  });

  it('removes its files when parts.agents goes, unless someone changed one', () => {
    const project = freshProject(agentsOn);
    try {
      run(project);
      agentsOff(project);
      const removed = run(project);
      assert.ok(changesUnder(removed, '.claude/').every((change) => change.action === 'delete'));
      assert.equal(existsSync(path.join(project.root, '.claude/agents/simpright-qa-ui-test-engineer.md')), false);
      assert.ok(Object.keys(readState(project.root)?.files ?? {}).every((file) => !file.startsWith('.claude/')));

      agentsOn(project);
      run(project);
      project.write('.claude/simpright-qa/how-to-ask.md', `${project.read('.claude/simpright-qa/how-to-ask.md')}\nOur own rule.\n`);
      agentsOff(project);
      const stopped = run(project);
      assert.equal(stopped.written, false);
      assert.equal(changeOf(stopped, '.claude/simpright-qa/how-to-ask.md')?.why, 'no longer generated, and changed since simpright apply wrote it');
    } finally {
      project.dispose();
    }
  });
});

describe("simpright apply: the .claude/settings.json entries of kit 0.3.0", () => {
  /** The entries kit 0.3.0 wrote, and state.json recording them as apply's. */
  function entriesOf030(project: Project, extra: Record<string, unknown> = {}): void {
    const { marketplace, plugin } = pluginEntries('0.3.0');
    project.write(SETTINGS, `${JSON.stringify({ ...extra, extraKnownMarketplaces: { 'simpright-kit': marketplace }, enabledPlugins: { 'simpright-qa@simpright-kit': plugin } }, null, 2)}\n`);
    const state = JSON.parse(project.read(STATE_FILE)) as Record<string, unknown>;
    project.write(STATE_FILE, `${JSON.stringify({ ...state, settings: { [SETTINGS]: hashEntries(pluginEntries('0.3.0')) } }, null, 2)}\n`);
  }

  it('removes the entries it wrote, and the file when nothing else is left', () => {
    const project = freshProject(agentsOn);
    try {
      run(project);
      entriesOf030(project);
      const result = run(project);
      assert.equal(settingsChange(result)?.action, 'delete');
      assert.equal(existsSync(path.join(project.root, SETTINGS)), false);
      assert.deepEqual(readState(project.root)?.settings, {});
    } finally {
      project.dispose();
    }
  });

  it('keeps the rest of the file: its other keys and its indentation', () => {
    const project = freshProject(agentsOn);
    try {
      run(project);
      entriesOf030(project, { permissions: { deny: ['Read(./.env)'] } });
      assert.equal(settingsChange(run(project))?.action, 'update');
      assert.deepEqual(JSON.parse(project.read(SETTINGS)), { permissions: { deny: ['Read(./.env)'] } });
    } finally {
      project.dispose();
    }
  });

  it("stops on entries changed since it wrote them, and leaves ones it didn't write", () => {
    const project = freshProject(agentsOn);
    try {
      run(project);
      entriesOf030(project);
      project.edit(SETTINGS, '"ref": "v0.3.0"', '"ref": "main"');
      const stopped = run(project);
      assert.equal(stopped.written, false);
      assert.match(settingsChange(stopped)?.why ?? '', /^no longer written \(since kit 0\.4\.0 the agents are plain files in \.claude\/\), and changed since/);

      const state = JSON.parse(project.read(STATE_FILE)) as Record<string, unknown>;
      delete state.settings;
      project.write(STATE_FILE, JSON.stringify(state));
      assert.equal(settingsChange(run(project)), undefined);
      assert.match(project.read(SETTINGS), /"ref": "main"/);
    } finally {
      project.dispose();
    }
  });

  it("refuses a settings file that isn't strict JSON", () => {
    const project = freshProject();
    try {
      project.write(SETTINGS, '{\n  // our settings\n}\n');
      assert.throws(() => run(project), (error) => error instanceof ConfigError && error.problems.some((problem) => problem.startsWith(`${SETTINGS}: invalid JSON`)));
    } finally {
      project.dispose();
    }
  });
});

describe('simpright apply: the parts', () => {
  /** The sample without the CI part: no parts.ci, no runs, no portal (which needs them). */
  function withoutCi(project: Project, ci: 'unset' | 'false' = 'unset'): void {
    project.edit('simpright.yml', '  ci: true\n  portal: { testCases: true, bugs: true }\n', ci === 'false' ? '  ci: false\n' : '');
    project.write('simpright.yml', project.read('simpright.yml').replace(/^runs:\r?\n[\s\S]*?(?=^portal:)/m, ''));
  }

  it('writes no workflow without parts.ci, and needs no kit commit then', () => {
    const project = freshProject(withoutCi);
    try {
      const result = apply(project.root, readConfig(project.root), { kit: TEST_KIT });
      assert.equal(result.written, true);
      assert.equal(result.kitRef, undefined);
      assert.equal(existsSync(path.join(project.root, '.github')), false);
      assert.deepEqual(result.changes.map((change) => change.file), ['package.json']);
      assert.equal(report(result, {})[0], 'simpright apply: kit 9.9.9');
    } finally {
      project.dispose();
    }
  });

  it('removes the CI files it wrote when parts.ci is false', () => {
    const project = freshProject();
    try {
      run(project);
      withoutCi(project, 'false');
      const removed = run(project);
      assert.equal(removed.written, true);
      assert.equal(changesUnder(removed, '.github/').length, 9);
      assert.ok(changesUnder(removed, '.github/').every((change) => change.action === 'delete'));
      assert.deepEqual(readState(project.root)?.files, {});
    } finally {
      project.dispose();
    }
  });

  it('stops a config from before kit 0.4.0 instead of removing its workflows', () => {
    const migration = 'simpright.yml: parts.ci: since kit 0.4.0 simpright apply writes the workflows only with parts.ci: true';
    const project = freshProject();
    try {
      run(project);
      // With runs, and no parts.ci.
      project.edit('simpright.yml', '  ci: true\n', '');
      assert.throws(() => run(project), (error) => error instanceof ConfigError && error.problems.some((problem) => problem.startsWith(migration)));
      // Without runs either: the workflows apply recorded say the same.
      project.edit('simpright.yml', '  portal: { testCases: true, bugs: true }\n', '');
      project.write('simpright.yml', project.read('simpright.yml').replace(/^runs:\r?\n[\s\S]*?(?=^portal:)/m, ''));
      assert.throws(() => run(project), (error) => error instanceof ConfigError && error.problems.some((problem) => problem.startsWith(migration)));
      assert.ok(existsSync(path.join(project.root, '.github/workflows/pr-checks.yml')));
    } finally {
      project.dispose();
    }
  });

  const needs: { name: string; change: (project: Project) => void; expect: string }[] = [
    { name: 'runs without the CI part', change: (p) => p.edit('simpright.yml', '  ci: true\n', '  ci: false\n'), expect: 'simpright.yml: runs need parts.ci' },
    { name: 'the portal without the CI part', change: (p) => p.edit('simpright.yml', '  ci: true\n', '  ci: false\n'), expect: 'simpright.yml: parts.portal needs parts.ci' },
    { name: 'the agents without the scenarios', change: (p) => { agentsOn(p); p.edit('simpright.yml', 'parts:\n  scenarios: true\n', 'parts:\n'); }, expect: 'simpright.yml: parts.agents needs parts.scenarios' },
    { name: 'the UI agents without the page inspector', change: (p) => { agentsOn(p); p.edit('simpright.yml', '  inspector: true\n', ''); }, expect: 'simpright.yml: agents.ui needs parts.inspector' },
    { name: 'the inspector without its command', change: (p) => p.edit('simpright.yml', 'parts:\n  scenarios: true\n', 'parts:\n  scenarios: true\n  inspector: true\n'), expect: 'simpright.yml: parts.inspector needs commands.inspectUi' },
    { name: 'coverage without an API layer', change: (p) => { p.edit('simpright.yml', '    api: { prefix: API, digits: 4 }\n', ''); p.edit('simpright.yml', '  ci: true\n', "  ci: true\n  coverage: { package: '@acme/coverage' }\n"); }, expect: 'simpright.yml: parts.coverage needs an API layer' },
  ];
  for (const { name, change, expect } of needs) {
    it(`refuses ${name}`, () => {
      const project = freshProject(change);
      try {
        assert.throws(() => run(project), (error) => error instanceof ConfigError && error.problems.some((problem) => problem.startsWith(expect)), expect);
      } finally {
        project.dispose();
      }
    });
  }

  it("adds a .gitkeep to a scenarios part's folder that's missing", () => {
    const project = freshProject((p) => p.remove('test-scenarios/ui'));
    try {
      const result = run(project);
      assert.deepEqual({ action: changeOf(result, 'test-scenarios/ui/.gitkeep')?.action, part: changeOf(result, 'test-scenarios/ui/.gitkeep')?.part }, { action: 'create', part: 'a folder the scenarios part uses' });
      assert.ok(existsSync(path.join(project.root, 'test-scenarios/ui/.gitkeep')));
      assert.equal(changeOf(run(project), 'test-scenarios/ui/.gitkeep'), undefined);
    } finally {
      project.dispose();
    }
  });
});

describe("simpright apply: the kit's entries in package.json", () => {
  const PACKAGE = 'package.json';
  /** The sample's package.json with the kit's packages from the registry instead of the kit's folder. */
  function fromRegistry(project: Project, version = '9.9.9'): void {
    const json = JSON.parse(project.read(PACKAGE)) as { devDependencies: Record<string, string> };
    for (const name of ['simpright', '@simpright/scenarios', '@simpright/portal']) json.devDependencies[name] = version;
    project.write(PACKAGE, `${JSON.stringify(json, null, 2)}\n`);
  }
  const packageJson = (project: Project) => JSON.parse(project.read(PACKAGE)) as { devDependencies: Record<string, string>; scripts?: Record<string, string> };

  it("adds the kit's scripts, keeps the rest, and leaves the kit's packages linked from a folder", () => {
    const project = freshProject();
    try {
      const before = packageJson(project);
      const result = run(project);
      assert.equal(changeOf(result, PACKAGE)?.part, "the kit's packages and scripts");
      assert.equal(result.install, false);
      const after = packageJson(project);
      assert.deepEqual(after.devDependencies, before.devDependencies, 'file: links stay');
      assert.deepEqual(after.scripts, {
        doctor: 'simpright doctor',
        apply: 'simpright apply',
        'validate:scenarios': 'simpright-scenarios validate',
        'check:step-titles': 'simpright-scenarios check-step-titles',
        'test-cases:build': 'simpright-portal build-test-cases',
        'bugs:build': 'simpright-portal build-bugs',
        'portal:build': 'simpright-portal build-config',
      });
      assert.deepEqual(readState(project.root)?.packageJson, { devDependencies: {}, scripts: after.scripts });
    } finally {
      project.dispose();
    }
  });

  it("adopts the kit's packages at its version and moves them with the kit, saying to run npm install", () => {
    const project = freshProject(fromRegistry);
    try {
      const first = run(project);
      assert.equal(first.install, false, 'the pins were already the kit version');
      const bumped = run(project, { kit: { ...TEST_KIT, version: '9.9.10' } });
      assert.equal(changeOf(bumped, PACKAGE)?.action, 'update');
      assert.equal(bumped.install, true);
      assert.equal(packageJson(project).devDependencies.simpright, '9.9.10');
      assert.deepEqual(Object.keys(packageJson(project).devDependencies), Object.keys(packageJson(project).devDependencies).sort(), 'devDependencies stay sorted');
      assert.ok(report(bumped, {}).includes("Then run npm install: the kit's packages in package.json change."));
    } finally {
      project.dispose();
    }
  });

  it('stops on an entry with a value it didn\'t write, and --force overwrites it', () => {
    const project = freshProject();
    try {
      run(project);
      project.edit(PACKAGE, '"doctor": "simpright doctor"', '"doctor": "simpright doctor --offline"');
      const stopped = run(project);
      assert.equal(stopped.written, false);
      assert.deepEqual({ action: changeOf(stopped, PACKAGE)?.action, why: changeOf(stopped, PACKAGE)?.why }, { action: 'conflict', why: "scripts.doctor: simpright apply didn't write them, or they changed since" });
      assert.equal(run(project, { force: true }).written, true);
      assert.equal(packageJson(project).scripts?.doctor, 'simpright doctor');
    } finally {
      project.dispose();
    }
  });

  it("removes the scripts of a part that's off, and keeps the file's indentation and order", () => {
    const project = freshProject((p) => p.write(PACKAGE, `${JSON.stringify({ name: 'shop', scripts: { test: 'playwright test' }, devDependencies: packageJson(p).devDependencies }, null, 4)}\n`));
    try {
      run(project);
      assert.deepEqual(Object.keys(packageJson(project).scripts ?? {}).slice(0, 2), ['test', 'doctor'], "new scripts after the project's own");
      assert.match(project.read(PACKAGE), /^ {4}"name"/m, 'the file keeps its indentation');
      project.edit('simpright.yml', '  portal: { testCases: true, bugs: true }\n', '  portal: { testCases: true }\n');
      run(project);
      assert.equal(packageJson(project).scripts?.['bugs:build'], undefined);
      assert.equal(packageJson(project).scripts?.['test-cases:build'], 'simpright-portal build-test-cases');
    } finally {
      project.dispose();
    }
  });
});

describe('describeCron', () => {
  it('says the common schedules in words', () => {
    assert.equal(describeCron('15 2 * * 1-5'), '02:15 UTC on weekdays');
    assert.equal(describeCron('45 4 1 * *'), '04:45 UTC on the 1st of each month');
    assert.equal(describeCron('0 12 22 * *'), '12:00 UTC on the 22nd of each month');
    assert.equal(describeCron('30 23 * * *'), '23:30 UTC every day');
    assert.equal(describeCron('5 6 * * 0'), '06:05 UTC on Sundays');
    assert.equal(describeCron('*/15 * * * *'), undefined);
    assert.equal(describeCron('15 2 * 1 *'), undefined);
  });
});

describe('unifiedDiff', () => {
  it('shows the changed lines with their context', () => {
    const before = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'].join('\n');
    const after = ['a', 'b', 'c', 'd', 'E', 'f', 'g', 'h', 'i', 'j', 'k'].join('\r\n');
    assert.equal(unifiedDiff('x.yml', before, after), ['--- a/x.yml', '+++ b/x.yml', '@@ -2,9 +2,10 @@', ' b', ' c', ' d', '-e', '+E', ' f', ' g', ' h', ' i', ' j', '+k', ''].join('\n'));
    assert.equal(unifiedDiff('x.yml', 'a\n', 'a\r\n'), '');
    assert.equal(unifiedDiff('x.yml', undefined, 'a\nb\n'), ['--- /dev/null', '+++ b/x.yml', '@@ -0,0 +1,2 @@', '+a', '+b', ''].join('\n'));
    assert.equal(unifiedDiff('x.yml', 'a\n', undefined), ['--- a/x.yml', '+++ /dev/null', '@@ -1,1 +0,0 @@', '-a', ''].join('\n'));
  });
});

describe('the simpright apply command', () => {
  const cli = (args: string[]) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });

  it('shows a dry run, refuses the other command\'s options, and needs a commit from a repository build', () => {
    const project = freshProject();
    try {
      const dry = cli(['apply', '--dry-run', '--kit-ref', REF, '--root', project.root]);
      assert.equal(dry.status, 0, dry.stderr);
      assert.match(dry.stdout, /^simpright apply: kit \d+\.\d+\.\d+, its actions at bbbbbbb\n {2}create {4}\.github\/dependabot\.yml\n/);
      assert.match(dry.stdout, /Dry run, nothing written: 9 to create, 1 to update, 0 to delete\.\n$/);
      assert.equal(cli(['apply', '--offline', '--root', project.root]).status, 2);
      assert.equal(cli(['doctor', '--dry-run', '--root', project.root]).status, 2);
      const noRef = cli(['apply', '--root', project.root]);
      assert.equal(noRef.status, 2);
      assert.match(noRef.stderr, /pass --kit-ref <commit>/);
    } finally {
      project.dispose();
    }
  });
});
