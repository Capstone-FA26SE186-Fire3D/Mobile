import test from 'node:test';
import assert from 'node:assert/strict';
import { queueFixture, queue, events } from '../support/queue-fixture.mjs';
import { mockBackend } from '../support/http.mjs';
const { syncTrainingSession } = await import('../../src/api/training.ts');
const receipt = (events) => ({
  accepted: events.map((e) => e.eventId),
  duplicates: [],
  conflicts: [],
  missingRanges: [],
  acknowledgedSequence: events.at(-1)?.sequence ?? 0,
});
test('sync drains 501 events without completing an unfinished game', async (t) => {
  await queueFixture(t);
  await events('s1', 501);
  const calls = mockBackend(t, async (path, { json }) => {
    assert.ok(path.endsWith('/events:batch'));
    return receipt(json.events);
  });
  assert.equal(await syncTrainingSession('s1', 'owner'), null);
  assert.deepEqual(
    calls.map((c) => c.options.json.events.length),
    [500, 1],
  );
  assert.equal((await queue.pendingEvents('s1')).length, 0);
});
test('lost receipt retries identical event ids and payloads', async (t) => {
  await queueFixture(t);
  await events();
  let lose = true;
  const calls = mockBackend(t, async (_, { json }) => {
    if (lose) {
      lose = false;
      throw new TypeError('lost response');
    }
    return receipt(json.events);
  });
  await assert.rejects(syncTrainingSession('s1'), /lost response/);
  await syncTrainingSession('s1');
  assert.deepEqual(calls[0].options.json, calls[1].options.json);
});
test('two receipts with no progress stop without discarding pending events', async (t) => {
  await queueFixture(t);
  await events();
  const calls = mockBackend(t, async () => receipt([]));
  await assert.rejects(syncTrainingSession('s1'), /không tiến triển/);
  assert.equal(calls.length, 2);
  assert.equal((await queue.pendingEvents('s1')).length, 1);
});
