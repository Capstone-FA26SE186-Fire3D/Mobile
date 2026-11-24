import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const group = process.argv[2] ?? 'all';
if (!['all', 'unit', 'adapter'].includes(group)) throw new Error(`Unknown test group: ${group}`);
const adapters = new Set(['playtest.test.mjs', 'package-cache.test.mjs']);
const files = readdirSync(new URL('./', import.meta.url))
  .filter((name) => name.endsWith('.test.mjs') && name !== 'release.test.mjs')
  .filter((name) => group === 'all' || adapters.has(name) === (group === 'adapter'))
  .map((name) => `tests/${name}`);
for (const directory of group === 'all' ? ['unit', 'adapter'] : [group]) {
  try {
    files.push(
      ...readdirSync(new URL(`./${directory}/`, import.meta.url))
        .filter((name) => name.endsWith('.test.mjs'))
        .map((name) => `tests/${directory}/${name}`),
    );
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
if (!files.length) throw new Error(`No tests discovered for ${group}`);
// Each file gets a fresh process/module graph. Cases within a file reset their own fixtures.
const result = spawnSync(
  process.execPath,
  ['--import', './tests/support/register.mjs', '--test', ...files.sort()],
  { stdio: 'inherit', cwd: new URL('../', import.meta.url) },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
