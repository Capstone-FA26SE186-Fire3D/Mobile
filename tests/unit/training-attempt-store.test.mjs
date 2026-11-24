import test from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../../src/features/training/attempt-store.ts';
import { control, memory } from '../support/fakes/async-storage.mjs';
test.beforeEach(() => control.reset());
test.afterEach(() => control.reset());
test('prepare survives reread, same-session binding reuses start key and rotation changes only start', async () => {
  const a = await store.getOrCreateAttempt('a', 'training', 'Assessment');
  assert.deepEqual(await store.getOrCreateAttempt('a', 'training', 'Assessment'), a);
  const bound = await store.bindPreparedSession('a', a, 's1');
  assert.ok(bound.startKey);
  assert.equal(bound.prepareKey, a.prepareKey);
  assert.deepEqual(await store.bindPreparedSession('a', bound, 's1'), bound);
  const rotated = await store.rotateStartKey('a', bound);
  assert.notEqual(rotated.startKey, bound.startKey);
  assert.equal(rotated.prepareKey, a.prepareKey);
  assert.equal(rotated.sessionId, 's1');
  assert.deepEqual(await store.readAttempt('a', 'training', 'Assessment'), rotated);
});
test('ending one attempt preserves other accounts, modes and trainings', async () => {
  const scopes = [
    ['a', 't', 'Guided'],
    ['b', 't', 'Guided'],
    ['a', 't', 'Assessment'],
    ['a', 'other', 'Guided'],
  ];
  const attempts = await Promise.all(scopes.map((s) => store.getOrCreateAttempt(...s)));
  assert.equal(new Set(attempts.map((a) => a.prepareKey)).size, 4);
  await store.clearAttempt(...scopes[0]);
  assert.equal(await store.readAttempt(...scopes[0]), null);
  for (let i = 1; i < scopes.length; i++)
    assert.deepEqual(await store.readAttempt(...scopes[i]), attempts[i]);
});
test('corrupt storage starts a new attempt; failed persistence is not reported as success', async () => {
  memory.set('fire3d.training.attempt.v1.a.t.Guided', '{bad');
  assert.equal(await store.readAttempt('a', 't', 'Guided'), null);
  control.fail = (op) => {
    if (op === 'set') throw Error('disk full');
  };
  await assert.rejects(store.getOrCreateAttempt('a', 't', 'Guided'), /disk full/);
  control.fail = null;
  assert.ok((await store.getOrCreateAttempt('a', 't', 'Guided')).prepareKey);
});
