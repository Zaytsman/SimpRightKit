// YAML text edited in place (src/yaml-text.ts): each edit changes only the lines it's about, comments and spacing kept.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { YamlText } from '../src/yaml-text.ts';

const SAMPLE = `# The project's config.
template: v0.3.0                 # the template version

paths:
  scenarios: test-scenarios      # <layer>/<area>/<name>.yml
  tests: tests
  uiTests: tests/ui

commands:
  typecheck: npm run typecheck
  # The page inspector, read-only.
  # Options: --role <role>.
  inspectUi: npm run inspect:ui -- {path}
  # CI runs.
  ciRunInfo: gh run view {run}

ids:
  layers:
    ui: { prefix: UI, digits: 3 }
    api: { prefix: API, digits: 4 }
  areas: [products]

roles: [default, guest]

# The agents' facts.
agents:
  api:
    rules:
      - one
      - two

  ui:
    rules:
      - three   # last

  liveApi:
    writes: ask

parts:
  scenarios: true                # the scenarios part
  inspector: true

ci:
  branches: { default: main }
  node: 24
  secrets: []
`;

/** The lines of `after` that aren't in `before`, and the other way round. */
function changedLines(before: string, after: string): { added: string[]; removed: string[] } {
  const a = before.split('\n');
  const b = after.split('\n');
  return { added: b.filter((line) => !a.includes(line)), removed: a.filter((line) => !b.includes(line)) };
}

describe('YamlText', () => {
  it('replaces a scalar in place and keeps its comment and spacing', () => {
    const yaml = new YamlText(SAMPLE);
    yaml.set(['paths', 'scenarios'], 'qa/scenarios');
    assert.deepEqual(changedLines(SAMPLE, yaml.toString()), {
      added: ['  scenarios: qa/scenarios      # <layer>/<area>/<name>.yml'],
      removed: ['  scenarios: test-scenarios      # <layer>/<area>/<name>.yml'],
    });
  });

  it('replaces a flow list or mapping in place', () => {
    const yaml = new YamlText(SAMPLE);
    yaml.set(['ids', 'areas'], []);
    yaml.set(['roles'], ['default', 'admin', 'guest']);
    yaml.set(['ci', 'branches'], { default: 'main', work: 'develop' });
    assert.deepEqual(changedLines(SAMPLE, yaml.toString()), {
      added: ['  areas: []', 'roles: [default, admin, guest]', '  branches: { default: main, work: develop }'],
      removed: ['  areas: [products]', 'roles: [default, guest]', '  branches: { default: main }'],
    });
  });

  it('removes a key with the comment lines right above it, and no others', () => {
    const yaml = new YamlText(SAMPLE);
    yaml.remove(['commands', 'inspectUi']);
    yaml.remove(['paths', 'uiTests']);
    yaml.remove(['ids', 'layers', 'ui']);
    assert.deepEqual(changedLines(SAMPLE, yaml.toString()).removed, [
      '  uiTests: tests/ui',
      '  # The page inspector, read-only.',
      '  # Options: --role <role>.',
      '  inspectUi: npm run inspect:ui -- {path}',
      '    ui: { prefix: UI, digits: 3 }',
    ]);
    assert.match(yaml.toString(), /typecheck: npm run typecheck\n {2}# CI runs\.\n {2}ciRunInfo/);
  });

  it('removes a block, and one of the two blank lines it leaves', () => {
    const yaml = new YamlText(SAMPLE);
    yaml.remove(['agents', 'ui']);
    assert.match(yaml.toString(), /      - two\n\n {2}liveApi:\n/);
    yaml.remove(['agents']);
    assert.match(yaml.toString(), /roles: \[default, guest\]\n\nparts:\n/);
    assert.equal(yaml.get(['agents']), undefined);
  });

  it('merges a mapping key by key: existing values replaced, new keys added at the end of the block', () => {
    const yaml = new YamlText(SAMPLE);
    yaml.merge(['parts'], { inspector: false, ci: true, portal: { testCases: true, bugs: true } });
    yaml.merge(['ci'], { secrets: ['ADMIN_PASSWORD'], branches: { work: 'develop' } });
    assert.match(yaml.toString(), /parts:\n {2}scenarios: true {16}# the scenarios part\n {2}inspector: false\n {2}ci: true\n {2}portal: \{ testCases: true, bugs: true \}\n/);
    assert.match(yaml.toString(), /ci:\n {2}branches: \{ default: main, work: develop \}\n {2}node: 24\n {2}secrets: \[ADMIN_PASSWORD\]\n$/);
  });

  it('adds a new top-level key at the end of the file, as a block when it is nested', () => {
    const yaml = new YamlText(SAMPLE);
    yaml.merge(['runs'], [{ id: 'nightly-api', label: 'Nightly API', project: 'api', schedule: '15 2 * * 1-5', trend: 'api' }]);
    yaml.merge(['portal'], { title: 'Example Shop', healthThreshold: { api: 1 } });
    const tail = yaml.toString().slice(SAMPLE.length);
    assert.equal(
      tail,
      '\nruns:\n  - id: nightly-api\n    label: Nightly API\n    project: api\n    schedule: 15 2 * * 1-5\n    trend: api\n\nportal:\n  title: Example Shop\n  healthThreshold:\n    api: 1\n',
    );
    assert.deepEqual(yaml.get(['runs', '0' as string]), undefined); // get walks mappings only
    assert.equal((yaml.get(['runs']) as { id: string }[])[0]!.id, 'nightly-api');
  });

  it('quotes a string that would read back as another value or break a flow list', () => {
    const yaml = new YamlText(SAMPLE);
    yaml.set(['roles'], ['true', 'a, b', 'plain-name']);
    yaml.set(['paths', 'tests'], '123');
    assert.deepEqual(yaml.get(['roles']), ['true', 'a, b', 'plain-name']);
    assert.equal(yaml.get(['paths', 'tests']), '123');
  });

  it('reads CRLF text and writes LF, with nothing else changed', () => {
    const yaml = new YamlText(SAMPLE.replace(/\n/g, '\r\n'));
    assert.equal(yaml.toString(), SAMPLE);
  });
});
