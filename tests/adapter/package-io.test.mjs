import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPackage } from '../support/package-fixture.mjs';
import { File, openHandles } from '../support/fakes/expo-file-system.mjs';
const cache = await import('../../src/features/training/package-cache.native.ts');
test('cancelled before work neither downloads nor removes verified content', async (t) => {
  const fs = globalThis.__fs;
  fs.reset();
  t.after(() => fs.reset());
  const pkg = buildPackage({ seed: 'cancel-before' });
  pkg.seed(fs, { staging: true, paths: ['scenario.json'] });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    cache.prepareVerifiedPackage(pkg.plan(), {
      signal: controller.signal,
      refresh: async () => pkg.plan(),
    }),
    (e) => e.name === 'PackageDownloadCancelled',
  );
  assert.equal(fs.downloadLog.length, 0);
  assert.ok(fs.files.has(pkg.folder(true) + '/scenario.json'));
});
test('hash read failure still closes the file handle', async (t) => {
  const fs = globalThis.__fs;
  fs.reset();
  t.after(() => fs.reset());
  const pkg = buildPackage({ seed: 'read-failure' });
  pkg.serve(fs);
  globalThis.__digests.fail = true;
  t.after(() => {
    globalThis.__digests.fail = false;
  });
  const original = File.prototype.open;
  t.mock.method(File.prototype, 'open', function (mode) {
    const handle = original.call(this, mode);
    handle.readBytes = () => {
      throw Error('read failed');
    };
    return handle;
  });
  await assert.rejects(
    cache.prepareVerifiedPackage(pkg.plan(), { refresh: async () => pkg.plan() }),
    /read failed/,
  );
  assert.equal(openHandles.size, 0);
});
test('downloaded bytes with wrong digest never become a ready package', async (t) => {
  const fs = globalThis.__fs;
  fs.reset();
  t.after(() => fs.reset());
  const pkg = buildPackage({ seed: 'wrong-digest' });
  pkg.serve(fs);
  fs.downloads.set(pkg.urlOf('scenario.json'), new Uint8Array(pkg.bytes['scenario.json'].length));
  await assert.rejects(
    cache.prepareVerifiedPackage(pkg.plan(), { refresh: async () => pkg.plan() }),
    /SHA-256/,
  );
  assert.equal(await cache.packageStatus(pkg.pin), 'partial');
  assert.ok(fs.files.has(pkg.folder(false) + '/floors/L1.bundle'));
});
