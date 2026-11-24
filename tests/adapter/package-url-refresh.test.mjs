import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPackage } from '../support/package-fixture.mjs';
import '../support/fakes/expo-file-system.mjs';
const cache = await import('../../src/features/training/package-cache.native.ts');
test('expired plan refreshes before downloading any file', async (t) => {
  const fs = globalThis.__fs;
  fs.reset();
  t.after(() => fs.reset());
  const pkg = buildPackage({ seed: 'expire' });
  pkg.serve(fs);
  let refreshed = 0;
  const initial = { ...pkg.plan(), expiresAt: 0 };
  assert.equal(
    await cache.prepareVerifiedPackage(initial, {
      refresh: async () => {
        assert.equal(fs.downloadLog.length, 0);
        refreshed++;
        return pkg.plan();
      },
    }),
    pkg.manifestPath,
  );
  assert.equal(refreshed, 1);
});
test('repeated expired URL plans stop after five refreshes', async (t) => {
  const fs = globalThis.__fs;
  fs.reset();
  t.after(() => fs.reset());
  const pkg = buildPackage({ seed: 'loop' });
  let count = 0;
  const plan = { ...pkg.plan(), expiresAt: 0 };
  await assert.rejects(
    cache.prepareVerifiedPackage(plan, {
      refresh: async () => {
        count++;
        return plan;
      },
    }),
    /hết hạn/,
  );
  assert.equal(count, 5);
  assert.equal(fs.downloadLog.length, 0);
});
test('403 during download refreshes URLs and resumes verification', async (t) => {
  const fs = globalThis.__fs;
  fs.reset();
  t.after(() => fs.reset());
  const pkg = buildPackage({ seed: '403' });
  pkg.serve(fs);
  fs.downloads.set(pkg.urlOf('manifest.json'), new Error('403 expired'));
  let count = 0;
  await cache.prepareVerifiedPackage(pkg.plan(), {
    refresh: async () => {
      count++;
      pkg.serve(fs);
      return pkg.plan();
    },
  });
  assert.equal(count, 1);
  assert.equal(await cache.packageStatus(pkg.pin), 'ready');
});
