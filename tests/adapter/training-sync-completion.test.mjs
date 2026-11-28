import test from 'node:test';
import assert from 'node:assert/strict';
import {
  queueFixture,
  queue,
  events,
  completed,
  event,
  launch,
} from '../support/queue-fixture.mjs';
import { mockBackend } from '../support/http.mjs';
const { syncTrainingSession } = await import('../../src/api/training.ts');
const { ApiError } = await import('../../src/api/types/common.ts');
test('awaiting-sync requeues missing events then completes with the same key', async (t) => {
  await queueFixture(t);
  await events();
  await completed();
  let completions = 0;
  const calls = mockBackend(t, async (path) => {
    if (path.endsWith('events:batch'))
      return { accepted: [event(1).eventId], duplicates: [], conflicts: [], missingRanges: [] };
    return {
      status: ++completions === 1 ? 'AwaitingSync' : 'Completed',
      missingRanges: completions === 1 ? [{ from: 1, to: 1 }] : [],
      session: { id: 's1' },
    };
  });
  assert.equal((await syncTrainingSession('s1')).status, 'AwaitingSync');
  assert.equal((await queue.pendingEvents('s1')).length, 1);
  assert.equal((await syncTrainingSession('s1')).status, 'Completed');
  const keys = calls
    .filter((c) => c.path.endsWith('/complete'))
    .map((c) => c.options.headers['Idempotency-Key']);
  assert.equal(keys.length, 2);
  assert.equal(keys[0], keys[1]);
  assert.equal(await syncTrainingSession('s1'), null);
});
test('lost completion response leaves local completion pending for identical replay', async (t) => {
  await queueFixture(t);
  await completed('s1', 0);
  let lose = true;
  const calls = mockBackend(t, async () => {
    if (lose) {
      lose = false;
      throw Error('lost');
    }
    return { status: 'Completed', missingRanges: [] };
  });
  await assert.rejects(syncTrainingSession('s1'), /lost/);
  assert.equal((await queue.completionFor('s1')).state, 'pending');
  await syncTrainingSession('s1');
  assert.deepEqual(calls[0], calls[1]);
});
test('only synthetic abandoned completions retire on 409', async (t) => {
  await queueFixture(t);
  await launch();
  await queue.queueAbandonedCompletion('s1');
  mockBackend(t, async () => {
    throw new ApiError('terminal', 409);
  });
  assert.equal(await syncTrainingSession('s1'), null);
  assert.equal((await queue.getLaunch('s1')).recovery_code, 'ABANDONED_REFUSED');
  await completed('s2', 0);
  await assert.rejects(syncTrainingSession('s2'), (e) => e.status === 409);
  assert.equal((await queue.completionFor('s2')).state, 'pending');
});

test('null optional receipt arrays do not prevent a session from completing', async (t) => {
  await queueFixture(t);
  await events();
  await completed();
  mockBackend(t, async (path) =>
    path.endsWith('events:batch')
      ? { accepted: [event(1).eventId], duplicates: null, conflicts: null, missingRanges: null }
      : { status: 'Completed', missingRanges: null },
  );
  assert.equal((await syncTrainingSession('s1')).status, 'Completed');
  assert.equal((await queue.pendingEvents('s1')).length, 0);
});

test('awaiting sync tolerates a null missing-ranges response', async (t) => {
  await queueFixture(t);
  await completed('s1', 0);
  mockBackend(t, async () => ({ status: 'AwaitingSync', missingRanges: null }));
  assert.equal((await syncTrainingSession('s1')).status, 'AwaitingSync');
  assert.equal((await queue.completionFor('s1')).state, 'awaiting_sync');
});
