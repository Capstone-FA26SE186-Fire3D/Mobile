// Package cache on the device: verification never deletes a package, good files in the final and the `.partial` folder
// are both reused, only missing or corrupt files are downloaded, cancel/move failures keep data, and operations on the
// same package run one at a time. The file system and S3 are in-memory fakes (tests/support).
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPackage } from './support/package-fixture.mjs';
import './support/fakes/expo-file-system.mjs';

const cache = await import('../src/features/training/package-cache.native.ts');
const { withPackageLock } = await import('../src/features/training/package-lock.ts');
const fs = globalThis.__fs;

function fresh(options) {
  fs.reset();
  const pkg = buildPackage(options);
  pkg.serve(fs);
  return pkg;
}

const finalFiles = (pkg) =>
  pkg.paths.filter((path) => fs.files.has(`${pkg.folder(false)}/${path}`)).sort();
const stagingFiles = (pkg) =>
  pkg.paths.filter((path) => fs.files.has(`${pkg.folder(true)}/${path}`)).sort();
const downloaded = (pkg) => fs.downloadLog.map((url) => url.slice(pkg.urlOf('').length));
const prepare = (pkg, options = {}) =>
  cache.prepareVerifiedPackage(pkg.plan(), { refresh: async () => pkg.plan(), ...options });

test('a fresh package downloads every file once, verifies it and keeps no staging folder', async () => {
  const pkg = fresh();
  const phases = [];
  const path = await prepare(pkg, { onProgress: (progress) => phases.push(progress.phase) });
  assert.equal(path, pkg.manifestPath);
  assert.deepEqual(downloaded(pkg).sort(), [...pkg.paths].sort());
  assert.deepEqual(finalFiles(pkg), [...pkg.paths].sort());
  assert.equal(fs.dirs.has(pkg.folder(true)), false);
  assert.equal(phases.at(-1), 'ready');
  fs.downloadLog = [];
  assert.equal(await cache.cachedPackagePath(pkg.pin), pkg.manifestPath);
  assert.equal(await prepare(pkg), pkg.manifestPath);
  assert.deepEqual(fs.downloadLog, [], 'a verified package is never downloaded again');
});

test('one corrupt file: the cache check deletes nothing and only that file is downloaded again', async () => {
  const pkg = fresh();
  pkg.seed(fs, { corrupt: ['floors/L1.bundle'] });
  assert.equal(await cache.cachedPackagePath(pkg.pin), null);
  assert.deepEqual(finalFiles(pkg), [...pkg.paths].sort(), 'the failed check kept every file');
  assert.equal(await cache.packageStatus(pkg.pin), 'partial');
  assert.equal(await prepare(pkg), pkg.manifestPath);
  assert.deepEqual(downloaded(pkg), ['floors/L1.bundle']);
  assert.equal(await cache.packageStatus(pkg.pin), 'ready');
});

test('good files spread over the final and the staging folder are both reused; only the missing one is fetched', async () => {
  const pkg = fresh();
  pkg.seed(fs, { paths: ['manifest.json', 'floors/L1.bundle'] });
  pkg.seed(fs, { staging: true, paths: ['building_metadata.json'] });
  assert.equal(await prepare(pkg), pkg.manifestPath);
  assert.deepEqual(downloaded(pkg), ['scenario.json']);
  assert.deepEqual(finalFiles(pkg), [...pkg.paths].sort());
  assert.equal(fs.dirs.has(pkg.folder(true)), false);
});

test('cancel keeps every verified file and the next attempt downloads only the rest', async () => {
  const pkg = fresh();
  const controller = new AbortController();
  fs.downloads.set(pkg.urlOf('building_metadata.json'), async () => {
    controller.abort();
    return pkg.bytes['building_metadata.json'];
  });
  await assert.rejects(prepare(pkg, { signal: controller.signal }), cache.PackageDownloadCancelled);
  assert.deepEqual(finalFiles(pkg), ['floors/L1.bundle']);
  assert.deepEqual(stagingFiles(pkg), ['manifest.json']);
  assert.equal(await cache.packageStatus(pkg.pin), 'partial');
  pkg.serve(fs);
  fs.downloadLog = [];
  assert.equal(await prepare(pkg), pkg.manifestPath);
  assert.deepEqual(downloaded(pkg).sort(), ['building_metadata.json', 'scenario.json']);
});

test('a failed move falls back to copy; when both fail the staging copy stays and a retry needs no download', async () => {
  const pkg = fresh();
  fs.failMove = (path) => path.endsWith('scenario.json');
  assert.equal(await prepare(pkg), pkg.manifestPath, 'copy replaced the failed move');

  const other = fresh({ releaseId: '77777777-7777-4777-8777-777777777777' });
  fs.failMove = (path) => path.endsWith('building_metadata.json');
  fs.failCopy = fs.failMove;
  await assert.rejects(prepare(other), /building_metadata\.json/);
  assert.ok(stagingFiles(other).includes('building_metadata.json'));
  assert.deepEqual(finalFiles(other), ['floors/L1.bundle']);
  fs.failMove = null;
  fs.failCopy = null;
  fs.downloadLog = [];
  assert.equal(await prepare(other), other.manifestPath);
  assert.deepEqual(downloaded(other).sort(), ['scenario.json']);
});

test('two requests for the same package queue up: one download, same path; other packages are not blocked', async () => {
  const pkg = fresh();
  const other = buildPackage({ releaseId: '88888888-8888-4888-8888-888888888888', seed: 'b' });
  other.serve(fs);
  const [first, second, third] = await Promise.all([
    prepare(pkg),
    prepare(pkg),
    cache.prepareVerifiedPackage(other.plan(), { refresh: async () => other.plan() }),
  ]);
  assert.equal(first, pkg.manifestPath);
  assert.equal(second, pkg.manifestPath);
  assert.equal(third, other.manifestPath);
  const mine = fs.downloadLog.filter((url) => url.startsWith(pkg.urlOf('')));
  assert.equal(mine.length, pkg.paths.length, 'the queued request reused the finished package');
});

test('before launch: the exact verified path passes; a broken or foreign package is refused and nothing is deleted', async () => {
  const pkg = fresh();
  await prepare(pkg);
  await cache.assertPackageReady(pkg.pin, pkg.manifestPath);
  await assert.rejects(
    cache.assertPackageReady(pkg.pin, '/documents/elsewhere/manifest.json'),
    cache.PackageNotReady,
  );
  fs.files.set(`${pkg.folder(false)}/scenario.json`, new TextEncoder().encode('{}'));
  await assert.rejects(cache.assertPackageReady(pkg.pin, pkg.manifestPath), cache.PackageNotReady);
  assert.deepEqual(finalFiles(pkg), [...pkg.paths].sort());
  fs.downloadLog = [];
  assert.equal(await prepare(pkg), pkg.manifestPath);
  assert.deepEqual(downloaded(pkg), ['scenario.json']);
  await cache.assertPackageReady(pkg.pin, pkg.manifestPath);
});

test('status reports missing, partial and ready without changing anything', async () => {
  const pkg = fresh();
  assert.equal(await cache.packageStatus(pkg.pin), 'missing');
  pkg.seed(fs, { staging: true, paths: ['manifest.json'] });
  assert.equal(await cache.packageStatus(pkg.pin), 'partial');
  assert.deepEqual(stagingFiles(pkg), ['manifest.json']);
  await prepare(pkg);
  assert.equal(await cache.packageStatus(pkg.pin), 'ready');
});

test('the package lock runs work for one key in order and a failure does not block the next', async () => {
  const order = [];
  const slow = withPackageLock('k', async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    order.push('slow');
    throw new Error('boom');
  });
  const next = withPackageLock('k', async () => order.push('next'));
  const other = withPackageLock('other', async () => order.push('other'));
  await assert.rejects(slow, /boom/);
  await Promise.all([next, other]);
  assert.deepEqual(order, ['other', 'slow', 'next']);
});

test('ending a session or leaving the screen never touches downloaded packages', async () => {
  const { readFileSync } = await import('node:fs');
  for (const file of [
    'src/features/training/attempt-store.ts',
    'src/store/SessionProvider.tsx',
    'app/training/session/[sessionId].tsx',
  ])
    assert.doesNotMatch(readFileSync(file, 'utf8'), /package-cache|expo-file-system|\.delete\(\)/);
});

test('each file is hashed once (natively); later checks reuse it until the file changes (#83)', async () => {
  const digests = globalThis.__digests;
  const pkg = fresh();
  const before = digests.count;
  await prepare(pkg);
  assert.equal(digests.count - before, pkg.paths.length, 'one native hash per file, manifest included');
  assert.ok(fs.files.has('/documents/fire3d-packages/verified-hashes.json'), 'hashes kept for the next app start');
  const after = digests.count;
  assert.equal(await cache.cachedPackagePath(pkg.pin), pkg.manifestPath);
  assert.equal(await cache.packageStatus(pkg.pin), 'ready');
  assert.equal(await prepare(pkg), pkg.manifestPath);
  assert.equal(digests.count, after, 'unchanged files are not read again');

  // Same size, other bytes: the modification time changes, so the file is hashed again and refused.
  const path = pkg.paths.find((item) => item !== 'manifest.json');
  const full = `${pkg.folder(false)}/${path}`;
  const original = fs.files.get(full);
  fs.files.set(full, original.map((byte) => byte ^ 0xff));
  assert.equal(await cache.cachedPackagePath(pkg.pin), null);
  assert.equal(digests.count, after + 1);
  fs.downloadLog = [];
  assert.equal(await prepare(pkg), pkg.manifestPath);
  assert.deepEqual(downloaded(pkg), [path], 'only the changed file is downloaded again');
});

test('without native SHA-256 the chunked JS hash reads through read-only handles and closes every one', async () => {
  const { openHandles, handleStats } = await import('expo-file-system');
  globalThis.__digests.fail = true;
  try {
    const pkg = fresh();
    const opened = handleStats.opened;
    assert.equal(await prepare(pkg), pkg.manifestPath);
    assert.ok(handleStats.opened > opened, 'files were hashed in JS');
    assert.deepEqual([...handleStats.modes], ['r']);
    assert.equal(openHandles.size, 0, 'no handle left open');
  } finally {
    globalThis.__digests.fail = false;
  }
});
