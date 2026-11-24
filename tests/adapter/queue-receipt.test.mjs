import test from 'node:test';
import assert from 'node:assert/strict';
import { queueFixture, queue, events, event } from '../support/queue-fixture.mjs';
test('501 events are sent as ordered batches of 500 then 1', async (t) => {
  await queueFixture(t);
  await events('s1', 501);
  const first = await queue.pendingEvents('s1');
  assert.equal(first.length, 500);
  assert.deepEqual([first[0].sequence, first.at(-1).sequence], [1, 500]);
  await queue.applyEventReceipt('s1', {
    accepted: first.map((e) => e.eventId),
    duplicates: [],
    conflicts: [],
  });
  assert.deepEqual(
    (await queue.pendingEvents('s1')).map((e) => e.sequence),
    [501],
  );
});
test('accepted duplicate and conflict receipts remain session scoped', async (t) => {
  await queueFixture(t);
  await events('s1', 3);
  await events('s2', 3);
  await queue.applyEventReceipt('s1', {
    accepted: [event(1).eventId],
    duplicates: [event(2).eventId],
    conflicts: [{ eventId: event(3).eventId, code: 'EVENT_TYPE_UNSUPPORTED' }],
  });
  assert.equal((await queue.pendingEvents('s1')).length, 0);
  assert.equal((await queue.pendingEvents('s2')).length, 3);
  assert.equal(await queue.requeueMissingRanges('s1', [{ from: 1, to: 3 }]), 2);
  assert.deepEqual(
    (await queue.pendingEvents('s1')).map((e) => e.sequence),
    [1, 2],
  );
});
test('invalid later missing range rolls back earlier requeue', async (t) => {
  await queueFixture(t);
  await events();
  await queue.applyEventReceipt('s1', {
    accepted: [event(1).eventId],
    duplicates: [],
    conflicts: [],
  });
  await assert.rejects(
    queue.requeueMissingRanges('s1', [
      { from: 1, to: 1 },
      { from: 0, to: 2 },
    ]),
    /missingRanges/,
  );
  assert.equal((await queue.pendingEvents('s1')).length, 0);
});
