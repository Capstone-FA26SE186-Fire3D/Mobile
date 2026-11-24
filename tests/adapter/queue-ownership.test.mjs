import test from 'node:test';
import assert from 'node:assert/strict';
import { queueFixture, queue, launch, events, completed } from '../support/queue-fixture.mjs';
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
