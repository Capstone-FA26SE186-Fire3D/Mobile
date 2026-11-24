import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { skipPlayRelease } from '../../scripts/release/policy.mjs';

test('only a push to main with the exact marker opts out of release', () => {
  for (const headMessage of ['[skip-play-release]', 'Merge tests\n\n[skip-play-release]']) {
    assert.equal(skipPlayRelease({ eventName: 'push', ref: 'refs/heads/main', headMessage }), true);
  }
  for (const headMessage of [
    '',
    null,
    undefined,
    'skip-play-release',
    '[skip-play-releases]',
    '[SKIP-PLAY-RELEASE]',
  ]) {
    assert.equal(
      skipPlayRelease({ eventName: 'push', ref: 'refs/heads/main', headMessage }),
      false,
    );
  }
});

test('manual runs, unrelated events, branches and tags preserve existing behavior', () => {
  const headMessage = '[skip-play-release]';
  for (const eventName of [
    'workflow_dispatch',
    'pull_request',
    'workflow_call',
    'schedule',
    undefined,
  ]) {
    assert.equal(skipPlayRelease({ eventName, ref: 'refs/heads/main', headMessage }), false);
  }
  for (const ref of [
    'refs/heads/develop',
    'refs/heads/chore/mobile-unit-tests',
    'refs/tags/main',
    'main',
    undefined,
  ]) {
    assert.equal(skipPlayRelease({ eventName: 'push', ref, headMessage }), false);
  }
});

test('CLI uses head commit only and writes a GitHub output without executing release work', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'mobile-release-policy-'));
  const eventFile = join(directory, 'event.json');
  const output = join(directory, 'output');
  const summary = join(directory, 'summary');
  t.after(() => {
    for (const path of [eventFile, output, summary]) unlinkSync(path);
    rmdirSync(directory);
  });
  for (const [message, expected] of [
    ['merge [skip-play-release]', true],
    ['regular merge', false],
  ]) {
    writeFileSync(
      eventFile,
      JSON.stringify({
        head_commit: { message },
        commits: [{ message: '[skip-play-release]' }],
      }),
    );
    writeFileSync(output, 'existing=value\n');
    writeFileSync(summary, '');
    const child = spawnSync(process.execPath, ['scripts/release/policy.mjs'], {
      cwd: new URL('../../', import.meta.url),
      encoding: 'utf8',
      env: {
        ...process.env,
        GITHUB_EVENT_PATH: eventFile,
        GITHUB_OUTPUT: output,
        GITHUB_STEP_SUMMARY: summary,
        GITHUB_EVENT_NAME: 'push',
        GITHUB_REF: 'refs/heads/main',
      },
    });
    assert.equal(child.status, 0, child.stderr);
    assert.equal(readFileSync(output, 'utf8'), `existing=value\nskip_release=${expected}\n`);
    if (expected) assert.match(readFileSync(summary, 'utf8'), /CI checks still run/);
  }
});
