// simpright apply on copies of the sample project: the files it writes (against the golden files in test/golden/), the
// state it keeps, the conflicts that stop it, and the CLI. UPDATE_GOLDEN=1 rewrites the golden files.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { KIT, sampleProject, type Project } from '../../../test/helpers.ts';
import { apply, type ApplyOptions } from '../src/apply.ts';
import { ConfigError, readConfig, UsageError } from '../src/config.ts';
import { unifiedDiff } from '../src/diff.ts';
import { describeCron } from '../src/generate.ts';
import { currentKit, type Kit } from '../src/kit.ts';
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

/** The sample turned into a project like SimpRight: a private coverage package, a wiki, a develop branch, named workflows. */
function simprightLike(project: Project): void {
  project.edit('simpright.yml', 'parts:\n  scenarios: true\n', "parts:\n  scenarios: true\n  coverage: { package: '@acme/coverage', registry: https://npm.pkg.github.com }\n  wiki: true\n");
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
      assert.ok(result.changes.every((change) => change.action === 'create'));
      assertGolden(project, 'sample');
      assert.deepEqual(Object.keys(readState(project.root)?.files ?? {}), result.changes.map((change) => change.file).sort());
    } finally {
      project.dispose();
    }
  });

  it('writes a project with a private package, a wiki, a work branch and named workflows', () => {
    const project = freshProject(simprightLike);
    try {
      assert.equal(run(project).written, true);
      assertGolden(project, 'simpright-like');
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
      // The callers and dependabot.yml use none of the kit's actions.
      assert.deepEqual(
        moved.changes.filter((change) => change.action === 'unchanged').map((change) => change.file),
        ['.github/dependabot.yml', '.github/workflows/api-regression.yml', '.github/workflows/custom-ui.yml', '.github/workflows/smoke.yml', '.github/workflows/ui-regression.yml'],
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
      const result = run(project, { dryRun: true });
      assert.equal(result.written, false);
      assert.ok(result.changes.every((change) => change.action === 'create' && change.diff.startsWith('--- /dev/null')));
      assert.equal(existsSync(path.join(project.root, '.github')), false);
      assert.equal(existsSync(path.join(project.root, STATE_FILE)), false);
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
      assert.match(dry.stdout, /Dry run, nothing written: 9 to create, 0 to update, 0 to delete\.\n$/);
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
