import test from 'node:test';
import assert from 'node:assert/strict';
import {
  acquirePlaytestGrant,
  createPlaytestKeys,
  assertPlaytestGrant,
} from '../../src/features/playtest/playtest-flow.ts';
import storage, { control } from '../support/fakes/async-storage.mjs';
import { ApiError } from '../../src/api/types/common.ts';
const status = {
  id: 'p',
  status: 'Launching',
  package: { manifestHash: 'hash' },
  recovery: { canReissueGrant: true },
};
const grant = {
  playtestId: 'p',
  manifestHash: 'hash',
  runtimeVersion: '2.5.0',
  protocolVersion: '1',
  generation: 2,
  launchGrant: 'short-lived',
  expiresAt: '2099-01-01T00:00:00Z',
};
test.beforeEach(() => control.reset());
test.afterEach(() => control.reset());
test('invalid generation, protocol, runtime, manifest and session cannot reach Unity', () => {
  for (const patch of [
    { generation: 0 },
    { generation: 1.5 },
    { protocolVersion: '2' },
    { runtimeVersion: 'old' },
    { manifestHash: 'foreign' },
    { playtestId: 'other' },
    { launchGrant: '' },
  ])
    assert.throws(() => assertPlaytestGrant({ ...grant, ...patch }, status));
  assert.equal(assertPlaytestGrant(grant, status), grant);
});
test('503 is not replayed as a lost response and retry keeps persisted start key', async () => {
  let n = 0;
  const keys = createPlaytestKeys(storage, () => String(++n));
  const calls = [];
  const issue = new ApiError('unavailable', 503);
  const api = {
    start: async (id, key) => {
      calls.push(key);
      throw issue;
    },
    getStatus: async () => assert.fail('503 must not read/replay'),
    reissue: async () => assert.fail('no reissue'),
  };
  const created = { ...status, status: 'Created', recovery: { canStart: true } };
  await assert.rejects(acquirePlaytestGrant(api, keys, 'a', created), (e) => e === issue);
  api.start = async (id, key) => {
    calls.push(key);
    return grant;
  };
  await acquirePlaytestGrant(api, keys, 'a', created);
  assert.deepEqual(calls, ['1', '1']);
});
test('reissue stops after two expired generations; never consumes start again', async () => {
  let n = 0;
  const keys = createPlaytestKeys(storage, () => String(++n));
  const used = [];
  const api = {
    start: async () => assert.fail('no start'),
    getStatus: async () => status,
    reissue: async (id, key) => {
      used.push(key);
      return { ...grant, expiresAt: '2000-01-01T00:00:00Z' };
    },
  };
  await assert.rejects(acquirePlaytestGrant(api, keys, 'a', status));
  assert.equal(used.length, 2);
  assert.notEqual(used[0], used[1]);
});
test('failed status read after a lost start response preserves original error without replay', async () => {
  const keys = createPlaytestKeys(storage, () => 'stable');
  let starts = 0;
  const lost = new Error('network lost');
  await assert.rejects(
    acquirePlaytestGrant(
      {
        start: async () => {
          starts++;
          throw lost;
        },
        getStatus: async () => {
          throw Error('status failed');
        },
      },
      keys,
      'a',
      { ...status, status: 'Created', recovery: { canStart: true } },
    ),
    (e) => e === lost,
  );
  assert.equal(starts, 1);
  assert.equal(await keys.get('a', 'p', 'start'), 'stable');
});
