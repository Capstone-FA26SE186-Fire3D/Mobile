import test from 'node:test';
import assert from 'node:assert/strict';
import { mockFetch, json } from '../support/http.mjs';
const { apiClient } = await import('../../src/api/client.ts');
const { ApiError } = await import('../../src/api/types/common.ts');
test('JSON metadata exposes ETag without changing the body', async (t) => {
  mockFetch(t, () => json(200, { value: 3 }, { etag: '"v3"' }));
  assert.deepEqual(await apiClient.requestWithMeta('/x'), { data: { value: 3 }, etag: '"v3"' });
});
for (const status of [200, 204])
  test('empty response ' + status, async (t) => {
    mockFetch(t, () => new Response(null, { status, headers: { 'content-length': '0' } }));
    assert.equal(await apiClient.request('/x'), undefined);
  });
test('text response stays text', async (t) => {
  mockFetch(t, () => new Response('plain', { headers: { 'content-type': 'text/plain' } }));
  assert.equal(await apiClient.request('/x'), 'plain');
});
test('problem+json preserves structured payload and Vietnamese detail', async (t) => {
  mockFetch(t, () =>
    json(
      409,
      { code: 'CONFLICT', detail: 'Dữ liệu đã thay đổi' },
      { 'content-type': 'application/problem+json' },
    ),
  );
  await assert.rejects(
    apiClient.request('/x'),
    (e) =>
      e instanceof ApiError &&
      e.status === 409 &&
      e.payload.code === 'CONFLICT' &&
      e.message === 'Dữ liệu đã thay đổi',
  );
});
test('invalid JSON fails parsing instead of becoming network failure', async (t) => {
  mockFetch(t, () => new Response('{', { headers: { 'content-type': 'application/json' } }));
  await assert.rejects(apiClient.request('/x'), SyntaxError);
});
