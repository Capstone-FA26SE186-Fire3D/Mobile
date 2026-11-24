import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPackage } from '../support/package-fixture.mjs';
import '../support/fakes/expo-file-system.mjs';
const cache = await import('../../src/features/training/package-cache.native.ts');
test('ready lookup returns local scenario without fetching or contacting authorization', async (t) => {
  const fs = globalThis.__fs;
  fs.reset();
  t.after(() => fs.reset());
  const pkg = buildPackage({ seed: 'read-scenario' });
  pkg.seed(fs);
  const scenario = await cache.readPackageScenario(pkg.pin);
  assert.equal(scenario.seed, 'read-scenario');
  assert.equal(await cache.cachedPackagePath(pkg.pin), pkg.manifestPath);
  assert.equal(fs.downloadLog.length, 0);
});
test('a different release pin cannot use the cached manifest of another release', async (t) => {
  const fs = globalThis.__fs;
  fs.reset();
  t.after(() => fs.reset());
  const pkg = buildPackage({ seed: 'foreign' });
  pkg.seed(fs);
  const foreign = { ...pkg.pin, releaseId: 'other-release' };
  await assert.rejects(cache.assertPackageReady(foreign, pkg.manifestPath));
  assert.ok(fs.files.has(pkg.folder(false) + '/manifest.json'));
});
test('available storage becoming zero stops new downloads without deleting verified chunks', async (t) => {
  const fs = globalThis.__fs;
  fs.reset();
  t.after(() => {
    delete fs.freeBytes;
    fs.reset();
  });
  const pkg = buildPackage({ seed: 'space' });
  pkg.serve(fs);
  pkg.seed(fs, { paths: ['manifest.json', 'floors/L1.bundle'] });
  fs.freeBytes = 0;
  await assert.rejects(
    cache.prepareVerifiedPackage(pkg.plan(), { refresh: async () => pkg.plan() }),
    (e) => e.name === 'PackageStorageFull',
  );
  assert.equal(fs.downloadLog.length, 0);
  assert.ok(fs.files.has(pkg.folder(false) + '/floors/L1.bundle'));
});
