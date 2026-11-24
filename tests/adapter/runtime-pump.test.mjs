import test from 'node:test';
import assert from 'node:assert/strict';
import { queueFixture, native, queue, launch, events } from '../support/queue-fixture.mjs';
import { mockBackend, deferred } from '../support/http.mjs';
const runtime = await import('../../src/features/training/training-runtime.ts');
test('concurrent pumps share one flight and do not resend accepted batch', async (t) => {
  await queueFixture(t);
  await launch();
  await events();
  const entered = deferred(),
    release = deferred();
  const calls = mockBackend(t, async (_, { json }) => {
    entered.resolve();
    await release.promise;
    return {
      accepted: json.events.map((e) => e.eventId),
      duplicates: [],
      conflicts: [],
      missingRanges: [],
    };
  });
  const stop = runtime.startTrainingRuntime({ accountId: 'owner', role: 'Trainee' });
  t.after(stop);
  await entered.promise;
  const a = runtime.pumpTrainingRuntime(),
    b = runtime.pumpTrainingRuntime();
  assert.equal(a, b);
  release.resolve();
  await a;
  assert.equal(calls.length, 1);
  assert.equal((await queue.pendingEvents('s1')).length, 0);
});
test('failed session leaves its data while another session syncs; bad listener is isolated', async (t) => {
  await queueFixture(t);
  await launch('bad');
  await events('bad');
  await launch('good');
  await events('good');
  const observed = [];
  const remove = runtime.subscribeTrainingRuntime((e) => observed.push(e));
  const removeBad = runtime.subscribeTrainingRuntime(() => {
    throw Error('screen');
  });
  t.after(remove);
  t.after(removeBad);
  mockBackend(t, async (path, { json }) => {
    if (path.includes('/bad/')) throw Error('unreachable');
    return {
      accepted: json.events.map((e) => e.eventId),
      duplicates: [],
      conflicts: [],
      missingRanges: [],
    };
  });
  const stop = runtime.startTrainingRuntime({ accountId: 'owner', role: 'Trainee' });
  t.after(stop);
  await runtime.pumpTrainingRuntime();
  assert.equal((await queue.pendingEvents('bad')).length, 1);
  assert.equal((await queue.pendingEvents('good')).length, 0);
  assert.ok(observed.some((e) => e.kind === 'sync-failed' && e.sessionId === 'bad'));
  assert.ok(observed.some((e) => e.kind === 'synced' && e.sessionId === 'good'));
});
