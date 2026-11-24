import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlaytestKeys } from '../../src/features/playtest/playtest-flow.ts';
import storage, { control } from '../support/fakes/async-storage.mjs';
test.beforeEach(() => control.reset());
test.afterEach(() => control.reset());
test('recreated key store reuses operations and rotates only the requested generation', async () => {
  let n = 0;
  const keys = createPlaytestKeys(storage, () => String(++n));
  const start = await keys.get('a', 'p', 'start'),
    reissue = await keys.get('a', 'p', 'reissue'),
    cancel = await keys.get('a', 'p', 'cancel');
  assert.equal(new Set([start, reissue, cancel]).size, 3);
  const reload = createPlaytestKeys(storage, () => String(++n));
  assert.equal(await reload.get('a', 'p', 'start'), start);
  assert.notEqual(await reload.rotate('a', 'p', 'reissue'), reissue);
  assert.equal(await keys.get('a', 'p', 'cancel'), cancel);
  const foreign = await keys.get('b', 'p', 'start');
  await keys.clear('a', 'p');
  assert.equal(await keys.get('b', 'p', 'start'), foreign);
  assert.notEqual(await keys.get('a', 'p', 'start'), start);
});
test('failure to persist never returns an unpersisted idempotency key', async () => {
  const keys = createPlaytestKeys(storage, () => 'key');
  control.fail = (op) => {
    if (op === 'set') throw Error('write denied');
  };
  await assert.rejects(keys.get('a', 'p', 'start'), /write denied/);
  control.fail = null;
  assert.equal(await keys.get('a', 'p', 'start'), 'key');
});
