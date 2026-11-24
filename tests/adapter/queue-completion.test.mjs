import test from 'node:test';
import assert from 'node:assert/strict';
import {
  queueFixture,
  native,
  queue,
  launch,
  events,
  completed,
} from '../support/queue-fixture.mjs';
test('completion replay retains its original key and changed completion enters recovery', async (t) => {
  await queueFixture(t);
  await launch();
  await completed();
  const original = await queue.completionFor('s1');
  await completed();
  assert.equal((await queue.completionFor('s1')).key, original.key);
  native.push({
    type: 'Completed',
    sessionId: 's1',
    payload: { lastEventSequence: 2, endReason: 'Finished' },
  });
  await queue.ingestUnityCallbacks();
  assert.equal((await queue.getLaunch('s1')).recovery_code, 'CALLBACK_REJECTED');
  assert.deepEqual(await queue.completionFor('s1'), original);
});
test('synthetic abandoned completion uses highest local sequence and does not replace real completion', async (t) => {
  await queueFixture(t);
  await events('s1', 3);
  await queue.queueAbandonedCompletion('s1');
  const result = await queue.completionFor('s1');
  assert.equal(result.end_reason, 'Abandoned');
  assert.equal(result.last_sequence, 3);
  await completed('s2', 7);
  const original = await queue.completionFor('s2');
  await queue.queueAbandonedCompletion('s2');
  assert.deepEqual(await queue.completionFor('s2'), original);
});
test('negative completion sequence is retained as rejected and never queued', async (t) => {
  await queueFixture(t);
  await launch();
  await completed('s1', -1);
  assert.equal(await queue.completionFor('s1'), null);
  assert.equal((await queue.getLaunch('s1')).sync_state, 'recovery');
});
