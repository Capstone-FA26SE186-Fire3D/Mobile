import test from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../../src/features/training/downloads-store.ts';
import { control, memory } from '../support/fakes/async-storage.mjs';
const record = (id) => ({
  trainingId: id,
  trainingName: id,
  buildingId: 'b',
  buildingName: 'Building',
  qrToken: 'qr',
  releaseId: 'r',
  manifestHash: 'hash',
  runtimeVersion: '2.5.0',
  savedAt: '2026-11-23T00:00:00Z',
});
test.beforeEach(() => control.reset());
test.afterEach(() => control.reset());
test('failed write releases lock, preserves prior records and permits retry', async () => {
  await store.upsertDownload('a', record('first'));
  control.fail = (op) => {
    if (op === 'set') throw Error('quota');
  };
  await assert.rejects(store.upsertDownload('a', record('second')), /quota/);
  await assert.rejects(store.removeDownload('a', 'first'), /quota/);
  control.fail = null;
  assert.deepEqual(await store.listDownloads('a'), [record('first')]);
  await store.upsertDownload('a', record('second'));
  assert.deepEqual(
    (await store.listDownloads('a')).map((r) => r.trainingId),
    ['second', 'first'],
  );
});
test('concurrent updates do not lose records; remove never crosses account', async () => {
  await Promise.all(['one', 'two', 'three'].map((id) => store.upsertDownload('a', record(id))));
  assert.equal((await store.listDownloads('a')).length, 3);
  await store.upsertDownload('b', record('one'));
  await store.removeDownload('a', 'one');
  assert.equal(await store.readDownload('a', 'one'), null);
  assert.deepEqual(await store.readDownload('b', 'one'), record('one'));
});
test('unknown document version and malformed entries do not become downloaded items', async () => {
  memory.set(
    'fire3d.training.downloads.v1.a',
    JSON.stringify({ version: 2, items: [record('one')] }),
  );
  assert.deepEqual(await store.listDownloads('a'), []);
  memory.set(
    'fire3d.training.downloads.v1.a',
    JSON.stringify({
      version: 1,
      items: [null, {}, record('ok'), { ...record('bad'), qrToken: '' }],
    }),
  );
  assert.deepEqual(await store.listDownloads('a'), [record('ok')]);
});
