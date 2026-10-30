// Checks what each package would publish (`npm pack --dry-run`): its built code, its README and LICENSE, and the
// files it ships besides (schemas, pages), and nothing else (no sources, tests or maps). Run with
// `npm run check:packages` after a build; exits with 1 when a package's file list is wrong.

import { execFileSync } from 'node:child_process';

/**
 * Besides dist/*.js, dist/*.d.ts, package.json, README.md and LICENSE: the files each package must ship. The published
 * simpright also has dist/release.json, which the release workflow writes after this check.
 */
const EXTRA: Record<string, string[]> = {
  simpright: ['simpright.schema.json', 'dist/kit-data.json'],
  '@simpright/scenarios': ['schemas/bug.schema.json', 'schemas/scenarios.schema.json'],
  '@simpright/portal': ['pages/bugs.html', 'pages/dashboard.html', 'pages/test-cases.html', 'sample/portal.json', 'sample/site.json'],
};
/** Folders a package ships whole, besides the files above: the portal's sample site (scripts/sample-site.ts writes it). */
const FOLDERS: Record<string, string[]> = { '@simpright/portal': ['sample/'] };
const COMMON = ['package.json', 'README.md', 'LICENSE'];

interface Packed {
  name: string;
  version: string;
  files: { path: string }[];
}

// `npm run` names npm's own script (npm on Windows is a .cmd file, which execFileSync can't run without a shell).
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Run this with npm run check:packages.');
const output = execFileSync(process.execPath, [npmCli, 'pack', '--dry-run', '--json', '--workspaces'], { encoding: 'utf8' });
const packed = JSON.parse(output) as Packed[];
let failed = 0;
for (const { name, version, files } of packed) {
  const paths = files.map((file) => file.path);
  const expected = [...COMMON, ...(EXTRA[name] ?? [])];
  const missing = expected.filter((file) => !paths.includes(file));
  if (!paths.some((file) => file === 'dist/cli.js')) missing.push('dist/cli.js');
  const unexpected = paths.filter(
    (file) => !expected.includes(file) && !/^dist\/[\w-]+\.(?:js|d\.ts)$/.test(file) && !(FOLDERS[name] ?? []).some((folder) => file.startsWith(folder)),
  );
  const ok = missing.length === 0 && unexpected.length === 0;
  if (!ok) failed++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}@${version}: ${paths.length} files${missing.length ? `; missing ${missing.join(', ')}` : ''}${unexpected.length ? `; unexpected ${unexpected.join(', ')}` : ''}`);
}
if (packed.length !== Object.keys(EXTRA).length) {
  console.log(`FAIL expected ${Object.keys(EXTRA).length} packages, npm packed ${packed.length}`);
  failed++;
}
process.exitCode = failed > 0 ? 1 : 0;
