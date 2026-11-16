// UAT 16/11 (L7): a brief network drop on the building page (opened from a QR link) showed the raw platform text
// "fetch failed: java.net.UnknownHostException: Unable to resolve host "api.fet3d.io.vn": …". Every request goes through
// apiClient, so a request that never reached the server must surface one plain Vietnamese line on every screen.
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.EXPO_PUBLIC_API_BASE_URL ||= 'https://api.test';
const { env } = await import('../src/config/env.ts');
if (!env.apiBaseUrl) env.apiBaseUrl = 'https://api.test';
const { apiClient } = await import('../src/api/client.ts');
const { ApiError, NETWORK_MESSAGE, NetworkError, isNetworkError } =
  await import('../src/api/types/common.ts');
const { describeQrProblem } = await import('../src/features/qr/qr-problems.ts');
const { responseMayBeLost } = await import('../src/features/playtest/playtest-flow.ts');

const RAW =
  'fetch failed: java.net.UnknownHostException: Unable to resolve host "api.fet3d.io.vn": No address associated with hostname';
const TECHNICAL = /exception|java\.|unable to resolve|fetch failed|api\.fet3d|hostname/i;

async function failWith(error, run) {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw error;
  };
  try {
    return await run();
  } finally {
    globalThis.fetch = realFetch;
  }
}

test('a DNS failure becomes a plain Vietnamese NetworkError, raw text only in cause', async () => {
  const raw = new TypeError(RAW);
  const issue = await failWith(raw, () =>
    apiClient.request('/api/public/qr/abc').then(
      () => assert.fail('request should fail'),
      (error) => error,
    ),
  );
  assert.ok(issue instanceof NetworkError);
  assert.equal(issue.message, NETWORK_MESSAGE);
  assert.doesNotMatch(issue.message, TECHNICAL);
  assert.equal(issue.cause, raw);
});

test('the building/QR page and playtest read it as "no connection"', async () => {
  const issue = await failWith(new TypeError(RAW), () =>
    apiClient.request('/api/public/qr/abc').catch((error) => error),
  );
  assert.doesNotMatch(describeQrProblem(issue), TECHNICAL);
  assert.equal(describeQrProblem(issue), NETWORK_MESSAGE);
  // training-runtime's isOfflineError (sync, home, downloads, training screens) delegates to isNetworkError.
  assert.ok(isNetworkError(issue));
  assert.ok(responseMayBeLost(issue));
});

test('a cancelled request stays an AbortError', async () => {
  const controller = new AbortController();
  controller.abort();
  const abort = new DOMException('The operation was aborted.', 'AbortError');
  const issue = await failWith(abort, () =>
    apiClient.request('/api/x', { signal: controller.signal }).catch((error) => error),
  );
  assert.equal(issue, abort);
  assert.ok(!(issue instanceof NetworkError));
});

test('a server answer is never mistaken for a lost connection', async () => {
  const issue = new ApiError('Máy chủ FET3D đang gặp lỗi. Hãy thử lại sau ít phút.', 500);
  assert.equal(isNetworkError(issue), false);
  assert.equal(responseMayBeLost(issue), true, '5xx may still have been applied on BE');
});
