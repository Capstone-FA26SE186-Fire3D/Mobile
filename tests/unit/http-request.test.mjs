import test from 'node:test';
import assert from 'node:assert/strict';
import { mockFetch, json } from '../support/http.mjs';
const { apiClient } = await import('../../src/api/client.ts');
test('query arrays append to existing query without losing false or zero', async (t) => {
  const calls = mockFetch(t, () => json(200, {}));
  await apiClient.request('items?fixed=1', {
    query: { tag: ['a b', 'đ'], zero: 0, flag: false, absent: null, missing: undefined },
  });
  assert.equal(calls[0].url.pathname, '/items');
  assert.deepEqual(calls[0].url.searchParams.getAll('tag'), ['a b', 'đ']);
  assert.equal(calls[0].url.searchParams.get('fixed'), '1');
  assert.equal(calls[0].url.searchParams.get('zero'), '0');
  assert.equal(calls[0].url.searchParams.get('flag'), 'false');
  assert.equal(calls[0].url.searchParams.has('absent'), false);
});
test('JSON chooses POST, preserves custom headers and overrides a stale bearer', async (t) => {
  const calls = mockFetch(t, () => json(200, {}));
  await apiClient.request('/items', {
    json: { enabled: false },
    accessToken: 'new',
    headers: { Authorization: 'Bearer old', 'Idempotency-Key': 'k' },
  });
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].headers.get('authorization'), 'Bearer new');
  assert.equal(calls[0].headers.get('idempotency-key'), 'k');
  assert.equal(calls[0].headers.get('content-type'), 'application/json');
  assert.deepEqual(JSON.parse(calls[0].body), { enabled: false });
});
test('raw body keeps explicit method and does not invent a JSON content type', async (t) => {
  const calls = mockFetch(t, () => json(204));
  await apiClient.request('/items', { method: 'PUT', body: 'bytes' });
  assert.equal(calls[0].method, 'PUT');
  assert.equal(calls[0].body, 'bytes');
  assert.equal(calls[0].headers.has('content-type'), false);
});
test('body and json together fail before transport', async (t) => {
  const calls = mockFetch(t, () => {
    throw Error('unexpected fetch');
  });
  await assert.rejects(apiClient.request('/items', { body: 'x', json: {} }), TypeError);
  assert.equal(calls.length, 0);
});
