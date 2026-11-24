import test from 'node:test';
import assert from 'node:assert/strict';
import { queueFixture, queue, launch, events, completed } from '../support/queue-fixture.mjs';
import { mockBackend } from '../support/http.mjs';
import { ApiError } from '../../src/api/types/common.ts';
const api = await import('../../src/api/playtest.ts');
test('403 and 404 event responses become persistent recovery', async (t) => {
  await queueFixture(t);
  for (const code of [403, 404]) {
    const id = 'p' + code;
    await launch(id, 'Playtest');
    await events(id);
    mockBackend(t, async (path) => {
      assert.ok(path.startsWith('/api/playtests/'));
      throw new ApiError('missing', code);
    });
    assert.deepEqual(await api.syncPlaytest(id), { kind: 'recovery', code: 'HTTP_' + code });
    assert.equal((await queue.getLaunch(id)).sync_state, 'recovery');
  }
});
test('terminal completion is reconciled by status; cancelled state retires to recovery', async (t) => {
  await queueFixture(t);
  for (const state of ['Completed', 'Cancelled']) {
    await launch(state, 'Playtest');
    await completed(state, 0);
    const calls = mockBackend(t, async (path) => {
      if (path.endsWith('/complete'))
        throw new ApiError('terminal', 409, { code: 'PLAYTEST_TERMINAL' });
      return { id: state, status: state };
    });
    const result = await api.syncPlaytest(state);
    assert.equal(result.kind, state === 'Completed' ? 'completed' : 'recovery');
    assert.equal(calls.length, 2);
    assert.ok(calls.every((c) => c.path.startsWith('/api/playtests/')));
  }
});
test('cancel lost response uses same persisted key on explicit retry', async (t) => {
  const calls = mockBackend(t, async () => {
    if (globalThis.__requests.length === 1) throw Error('network lost');
    return { status: 'Cancelled' };
  });
  await assert.rejects(api.cancelPlaytest('owner', 'id/space'), /network lost/);
  await api.cancelPlaytest('owner', 'id/space');
  assert.equal(calls[0].path, '/api/playtests/id%2Fspace/cancel');
  assert.equal(
    calls[0].options.headers['Idempotency-Key'],
    calls[1].options.headers['Idempotency-Key'],
  );
});
