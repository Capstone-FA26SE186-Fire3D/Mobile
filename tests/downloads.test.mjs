// "Bài đã tải": per-account list of verified downloads, kept across app restarts (AsyncStorage fake), one record per
// training, never holding URLs, codes or grants.
import test from 'node:test';
import assert from 'node:assert/strict';
import { memory } from './support/fakes/async-storage.mjs';
import { pinFromSession } from '../src/features/training/session-contract.ts';
import { APP_RUNTIME_VERSION } from '../src/features/training/runtime-version.ts';

const store = await import('../src/features/training/downloads-store.ts');
const hash = (char) => char.repeat(64);
const ACCOUNT = 'acc-trainee-1';
const OTHER = 'acc-trainee-2';

function record(overrides = {}) {
  return {
    trainingId: 'training-1',
    trainingName: 'Thoát hiểm tầng 3',
    buildingId: '11111111-1111-4111-8111-111111111111',
    buildingName: 'Tòa A',
    qrToken: 'qr-token-a',
    releaseId: '33333333-3333-4333-8333-333333333333',
    manifestHash: hash('b'),
    runtimeVersion: APP_RUNTIME_VERSION,
    savedAt: '2026-10-29T08:00:00.000Z',
    ...overrides,
  };
}

test('records survive a restart, newest first, one per training', async () => {
  memory.clear();
  await store.upsertDownload(ACCOUNT, record());
  await store.upsertDownload(ACCOUNT, record({ trainingId: 'training-2', trainingName: 'Bếp' }));
  await store.upsertDownload(
    ACCOUNT,
    record({
      releaseId: '99999999-9999-4999-8999-999999999999',
      savedAt: '2026-10-30T08:00:00.000Z',
    }),
  );
  // A new app process reads the same storage.
  const list = await store.listDownloads(ACCOUNT);
  assert.deepEqual(
    list.map((item) => [item.trainingId, item.releaseId]),
    [
      ['training-1', '99999999-9999-4999-8999-999999999999'],
      ['training-2', '33333333-3333-4333-8333-333333333333'],
    ],
  );
  assert.equal((await store.readDownload(ACCOUNT, 'training-2')).trainingName, 'Bếp');
  assert.equal(await store.readDownload(ACCOUNT, 'missing'), null);
});

test('each account sees only its own downloads', async () => {
  memory.clear();
  await store.upsertDownload(ACCOUNT, record());
  assert.deepEqual(await store.listDownloads(OTHER), []);
  assert.equal(await store.readDownload(OTHER, 'training-1'), null);
  assert.deepEqual([...memory.keys()], [`fire3d.training.downloads.v1.${ACCOUNT}`]);
});

test('concurrent saves keep every record', async () => {
  memory.clear();
  await Promise.all(
    ['t1', 't2', 't3', 't4'].map((trainingId) =>
      store.upsertDownload(ACCOUNT, record({ trainingId })),
    ),
  );
  assert.equal((await store.listDownloads(ACCOUNT)).length, 4);
  await store.removeDownload(ACCOUNT, 't2');
  assert.deepEqual((await store.listDownloads(ACCOUNT)).map((item) => item.trainingId).sort(), [
    't1',
    't3',
    't4',
  ]);
});

test('corrupt, other-version or incomplete data reads as an empty list; incomplete records are refused', async () => {
  memory.clear();
  memory.set(`fire3d.training.downloads.v1.${ACCOUNT}`, '{not json');
  assert.deepEqual(await store.listDownloads(ACCOUNT), []);
  memory.set(
    `fire3d.training.downloads.v1.${ACCOUNT}`,
    JSON.stringify({ version: 2, items: [record()] }),
  );
  assert.deepEqual(await store.listDownloads(ACCOUNT), []);
  memory.set(
    `fire3d.training.downloads.v1.${ACCOUNT}`,
    JSON.stringify({ version: 1, items: [record(), { trainingId: 'x' }] }),
  );
  assert.equal((await store.listDownloads(ACCOUNT)).length, 1);
  await assert.rejects(store.upsertDownload(ACCOUNT, record({ qrToken: '' })));
});

test('the stored document has no URL, code or grant', async () => {
  memory.clear();
  await store.upsertDownload(ACCOUNT, record());
  const raw = memory.get(`fire3d.training.downloads.v1.${ACCOUNT}`);
  assert.doesNotMatch(raw, /https?:|sig=|grant|participation|token"\s*:\s*"ey/i);
  assert.deepEqual(Object.keys(JSON.parse(raw).items[0]).sort(), Object.keys(record()).sort());
});

test('a record maps to the same package pin the session had, and detects a newer release', () => {
  const session = {
    id: '44444444-4444-4444-8444-444444444444',
    status: 'Prepared',
    releaseId: '33333333-3333-4333-8333-333333333333',
    buildingId: '11111111-1111-4111-8111-111111111111',
    runtimeVersion: APP_RUNTIME_VERSION,
    package: { packageHash: hash('a'), manifestHash: hash('b'), buildTarget: 'Android' },
  };
  assert.deepEqual(store.pinOfRecord(record()), pinFromSession(session));
  assert.equal(store.isNewerRelease(record(), { releaseId: record().releaseId }), false);
  assert.equal(
    store.isNewerRelease(record(), { releaseId: '99999999-9999-4999-8999-999999999999' }),
    true,
  );
});
