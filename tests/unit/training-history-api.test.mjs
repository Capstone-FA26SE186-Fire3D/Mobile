import test from 'node:test';
import assert from 'node:assert/strict';
import { getTrainingHistory, getTrainingResult } from '../../src/api/training-history.ts';
import { mockBackend } from '../support/http.mjs';
import { ApiError } from '../../src/api/types/common.ts';
test('history defaults and next page retain release pin and absent result', async (t) => {
  const page = {
    items: [{ sessionId: 's', releaseId: 'r', resultStatus: null, status: 'AwaitingSync' }],
    totalCount: 21,
    page: 1,
    pageSize: 20,
  };
  const calls = mockBackend(t, async () => page);
  assert.equal(await getTrainingHistory(), page);
  await getTrainingHistory(2);
  assert.deepEqual(
    calls.map((c) => c.options.query),
    [
      { page: 1, pageSize: 20 },
      { page: 2, pageSize: 20 },
    ],
  );
});
test('result safely encodes session id and returns backend criteria without computing a score', async (t) => {
  const result = { sessionId: 's', outcome: 'Pending', scorePercent: null, criteria: null };
  const calls = mockBackend(t, async () => result);
  assert.equal(await getTrainingResult('s/a?'), result);
  assert.equal(calls[0].path, '/api/training/sessions/s%2Fa%3F/result');
});
test('missing and not-ready results remain distinct errors', async (t) => {
  for (const status of [404, 409]) {
    const issue = new ApiError('not ready', status);
    mockBackend(t, async () => {
      throw issue;
    });
    await assert.rejects(getTrainingResult('s'), (e) => e === issue);
  }
});
