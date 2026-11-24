import test from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../../src/api/trainee-ai.ts';
import { mockBackend } from '../support/http.mjs';
test('all context variants and caller retry key survive submission', async (t) => {
  const calls = mockBackend(t, async () => ({ status: 'Accepted' }));
  for (const context of [
    { kind: 'Learn', postId: 'p', versionId: 'v' },
    { kind: 'Training', trainingId: 't' },
    { kind: 'Result', sessionId: 's' },
  ]) {
    await api.submitAiQuestion('Cách thoát hiểm?', context, 'stable-key');
    assert.deepEqual(calls.at(-1).options, {
      headers: { 'Idempotency-Key': 'stable-key' },
      json: { question: 'Cách thoát hiểm?', context },
    });
  }
  assert.ok(calls.every((c) => c.path === '/api/ai/trainee/answer'));
  await api.submitAiQuestion('one');
  await api.submitAiQuestion('two');
  assert.notEqual(
    calls.at(-1).options.headers['Idempotency-Key'],
    calls.at(-2).options.headers['Idempotency-Key'],
  );
});
test('quota blocked by Assessment and withheld reconciliation results are returned unchanged', async (t) => {
  const quota = { canSubmit: false, blockedByAssessment: true, remainingUnits: 4 };
  const request = {
    requestId: 'r',
    status: 'NeedsReconcile',
    result: null,
    resultWithheld: true,
    citations: [],
  };
  const calls = mockBackend(t, async (path) => (path.endsWith('/quota') ? quota : request));
  assert.equal(await api.getAiQuota(), quota);
  assert.equal(await api.getAiRequest('id/a'), request);
  assert.equal(calls[1].path, '/api/ai/trainee/requests/id%2Fa');
  await api.listAiRequests(4);
  assert.deepEqual(calls[2].options.query, { page: 4, pageSize: 20 });
});
test('lost submit response can be retried with exactly the supplied key', async (t) => {
  const calls = mockBackend(t, async () => {
    if (globalThis.__requests.length === 1) throw Error('lost response');
    return { status: 'Accepted' };
  });
  await assert.rejects(api.submitAiQuestion('q', undefined, 'retry'), /lost response/);
  await api.submitAiQuestion('q', undefined, 'retry');
  assert.deepEqual(calls[0], calls[1]);
});
