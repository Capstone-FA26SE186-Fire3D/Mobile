import test from 'node:test';
import assert from 'node:assert/strict';
import { queueFixture, native, queue, db, launch, event } from '../support/queue-fixture.mjs';
import { control } from '../support/fakes/expo-sqlite.mjs';
test('failed SQLite write rolls back the entire callback and leaves native journal unacknowledged', async (t) => {
  await queueFixture(t);
  await launch();
  native.push({ type: 'Events', sessionId: 's1', payload: [event(1), event(2)] });
  control.before = (op, sql, params) => {
    if (op === 'run' && sql.includes('INTO unity_events') && params[2] === 2)
      throw Error('disk full');
  };
  await assert.rejects(queue.ingestUnityCallbacks(), /disk full/);
  assert.equal(db().prepare('SELECT COUNT(*) n FROM unity_events').get().n, 0);
  assert.equal(db().prepare('SELECT COUNT(*) n FROM bridge_messages').get().n, 0);
  assert.equal(native.acknowledgements.length, 0);
  assert.equal(native.journal.length, 1);
  control.before = null;
  await queue.ingestUnityCallbacks();
  assert.equal((await queue.pendingEvents('s1')).length, 2);
  assert.equal(native.journal.length, 0);
});
test('ACK failure can replay committed callback without duplicating events', async (t) => {
  await queueFixture(t);
  native.push({ type: 'Events', sessionId: 's1', payload: [event(1)] });
  const ack = native.acknowledgeCallback;
  t.after(() => {
    native.acknowledgeCallback = ack;
  });
  native.acknowledgeCallback = async () => {
    assert.equal((await queue.pendingEvents('s1')).length, 1);
    throw Error('ack lost');
  };
  await assert.rejects(queue.ingestUnityCallbacks(), /ack lost/);
  native.acknowledgeCallback = ack;
  await queue.ingestUnityCallbacks();
  assert.equal((await queue.pendingEvents('s1')).length, 1);
  assert.equal(native.journal.length, 0);
});
test('malformed callback is retained and does not block the next valid one', async (t) => {
  await queueFixture(t);
  native.push('{');
  native.push({ type: 'Events', sessionId: 's1', payload: [event(1)] });
  const results = await queue.ingestUnityCallbacks();
  assert.deepEqual(
    results.map((x) => x.type),
    ['Malformed', 'Events'],
  );
  assert.equal(
    db().prepare("SELECT payload_json FROM bridge_messages WHERE type='Malformed'").get()
      .payload_json,
    '{',
  );
  assert.equal(native.journal.length, 0);
});
