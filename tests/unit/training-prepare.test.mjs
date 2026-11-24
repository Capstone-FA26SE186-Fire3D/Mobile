import test from 'node:test';
import assert from 'node:assert/strict';
import { mockBackend } from '../support/http.mjs';
const api = await import('../../src/api/training.ts');
test('prepare preserves caller key and sends runtime but never calls start', async (t) => {
  const calls = mockBackend(t, async () => ({ id: 'prepared' }));
  assert.deepEqual(await api.prepareTrainingSession('training', 'Assessment', 'stable-key'), {
    id: 'prepared',
  });
  assert.deepEqual(calls, [
    {
      path: '/api/training/sessions',
      options: {
        headers: { 'Idempotency-Key': 'stable-key' },
        json: { trainingId: 'training', mode: 'Assessment', runtimeVersion: '2.5.0' },
      },
    },
  ]);
});
test('reconcile preserves both identifiers without starting a replacement session', async (t) => {
  const input = { sessionIds: ['a'], idempotencyKeys: ['key'] };
  const calls = mockBackend(t, async () => []);
  assert.deepEqual(await api.reconcileTrainingSessions(input), []);
  assert.deepEqual(calls, [{ path: '/api/training/reconcile', options: { json: input } }]);
});
test('package lookup encodes opaque session ids', async (t) => {
  const calls = mockBackend(t, async () => ({}));
  await api.getTrainingPackage('a/b?c');
  assert.equal(calls[0].path, '/api/training/sessions/a%2Fb%3Fc/package');
});
