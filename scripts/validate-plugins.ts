// Claude Code's own checks of the kit's marketplace and of each plugin in plugins/, with warnings as errors
// (`claude plugin validate --strict`). The CLI is the @anthropic-ai/claude-code devDependency. Its wrapper script runs
// the native binary of the platform's optional dependency, so this works after `npm ci --ignore-scripts`, which skips
// the package's postinstall. Run with `npm run validate:plugins`.

import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KIT = fileURLToPath(new URL('..', import.meta.url));
const CLI = path.join(KIT, 'node_modules', '@anthropic-ai', 'claude-code', 'cli-wrapper.cjs');

const plugins = readdirSync(path.join(KIT, 'plugins'), { withFileTypes: true }).filter((entry) => entry.isDirectory());
const targets = ['.', ...plugins.map((entry) => `plugins/${entry.name}`)];

let failed = 0;
for (const target of targets) {
  console.log(`\n> claude plugin validate --strict ${target}`);
  const result = spawnSync(process.execPath, [CLI, 'plugin', 'validate', '--strict', target], { cwd: KIT, stdio: 'inherit' });
  if (result.status !== 0) failed++;
}
if (failed > 0) console.error(`\n${failed} of ${targets.length} failed.`);
process.exitCode = failed > 0 ? 1 : 0;
