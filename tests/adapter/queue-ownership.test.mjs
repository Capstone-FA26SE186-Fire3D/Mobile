import test from 'node:test';
import assert from 'node:assert/strict';
import {
  queueFixture,
  queue,
  launch,
  events,
  completed,
  db,
  event,
} from '../support/queue-fixture.mjs';

test('opening the legacy schema adds ownership and receive-time fields without losing queued data', async () => {
  const legacy = db();
  legacy.exec(`
    CREATE TABLE bridge_messages (native_id INTEGER PRIMARY KEY, session_id TEXT, type TEXT NOT NULL, payload_json TEXT NOT NULL, handled INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE unity_events (session_id TEXT NOT NULL, event_id TEXT NOT NULL, sequence INTEGER NOT NULL, json TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending', conflict_code TEXT, PRIMARY KEY(session_id,event_id), UNIQUE(session_id,sequence));
    CREATE TABLE session_completions (session_id TEXT PRIMARY KEY, key TEXT NOT NULL, last_sequence INTEGER NOT NULL, end_reason TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending');
    CREATE TABLE session_launches (session_id TEXT PRIMARY KEY, kind TEXT NOT NULL, generation INTEGER NOT NULL, expires_at TEXT NOT NULL, manifest_path TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending');
    INSERT INTO session_launches VALUES ('legacy','Training',1,'2099-01-01T00:00:00Z','/manifest','pending');
    INSERT INTO session_completions VALUES ('legacy','stable-completion',1,'Finished','pending');
    INSERT INTO bridge_messages VALUES (7,'legacy','Launched','{}',0);
  `);
  const pending = event(1);
  legacy
    .prepare('INSERT INTO unity_events(session_id,event_id,sequence,json) VALUES (?,?,?,?)')
    .run('legacy', pending.eventId, 1, JSON.stringify(pending));
  assert.deepEqual(await queue.pendingEvents('legacy'), [pending]);
  const launch = await queue.getLaunch('legacy');
  assert.equal(launch.account_id, null);
  assert.equal(launch.sync_state, 'active');
  assert.equal(launch.recovery_code, null);
  assert.equal((await queue.completionFor('legacy')).key, 'stable-completion');
  assert.equal((await queue.pendingLaunchedSignals())[0].received_at, null);
  assert.equal((await queue.sessionsToSync('owner', false)).length, 0);
  assert.equal((await queue.sessionsToSync('owner', true))[0].session_id, 'legacy');
});
test('legacy training is optional while foreign and legacy playtest rows never join owner queue', async (t) => {
  await queueFixture(t);
  await launch('own', 'Training', 'a');
  await launch('foreign', 'Training', 'b');
  await launch('legacy', 'Training', null);
  await launch('old-playtest', 'Playtest', null);
  assert.deepEqual(
    (await queue.sessionsToSync('a', false)).map((x) => x.session_id),
    ['own'],
  );
  assert.deepEqual(
    new Set((await queue.sessionsToSync('a', true)).map((x) => x.session_id)),
    new Set(['own', 'legacy']),
  );
  await queue.markRecovery('own', 'BLOCKED');
  assert.equal((await queue.sessionsToSync('a', false)).length, 0);
});
test('reissuing unlaunched playtest drops previous events but training relaunch preserves them', async (t) => {
  await queueFixture(t);
  for (const kind of ['Training', 'Playtest']) {
    await launch(kind, kind, 'a');
    await events(kind);
    await completed(kind);
    await queue.saveLaunch(kind, kind, 2, new Date(Date.now() + 300000).toISOString(), '/new', 'a');
    assert.equal((await queue.pendingEvents(kind)).length, kind === 'Training' ? 1 : 0);
    assert.equal((await queue.completionFor(kind)) !== null, kind === 'Training');
  }
});
test('completed session leaves queue only when no pending events remain', async (t) => {
  await queueFixture(t);
  await launch();
  await events();
  await completed();
  await queue.markCompletion('s1', 'completed');
  assert.equal((await queue.sessionsToSync('owner', false)).length, 1);
  const pending = await queue.pendingEvents('s1');
  await queue.applyEventReceipt('s1', {
    accepted: pending.map((x) => x.eventId),
    duplicates: [],
    conflicts: [],
  });
  assert.equal((await queue.sessionsToSync('owner', false)).length, 0);
});
