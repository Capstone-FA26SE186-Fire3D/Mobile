import test from 'node:test';
import assert from 'node:assert/strict';
import { supportApi } from '../../src/api/support.ts';
import { mockBackend } from '../support/http.mjs';
import { ApiError } from '../../src/api/types/common.ts';
test('list feedback retains backend moderation status', async (t) => {
  const items = [
    { id: 'f', category: 'Bug', rating: null, status: 'Pending', message: 'Không mở được' },
  ];
  const calls = mockBackend(t, async () => items);
  assert.equal(await supportApi.listFeedback(), items);
  assert.deepEqual(calls, [{ path: '/api/feedback', options: {} }]);
});
test('creation sends nullable rating and Unicode without altering feedback', async (t) => {
  const calls = mockBackend(t, async () => ({ id: 'f' }));
  for (const rating of [null, 1, 5])
    await supportApi.createFeedback('Bug', 'Khói\nở tầng 2', rating);
  assert.deepEqual(
    calls.map((c) => c.options.json),
    [null, 1, 5].map((rating) => ({ category: 'Bug', message: 'Khói\nở tầng 2', rating })),
  );
});
test('validation rejection is preserved without retry or success placeholder', async (t) => {
  const issue = new ApiError('invalid rating', 400);
  const calls = mockBackend(t, async () => {
    throw issue;
  });
  await assert.rejects(supportApi.createFeedback('Bug', 'message', 6), (e) => e === issue);
  assert.equal(calls.length, 1);
});
