import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mockBackend, mockFetch, json } from '../support/http.mjs';
import { control, setItemAsync } from '../support/fakes/expo-secure-store.mjs';
import { Platform } from 'react-native';
const api = await import('../../src/api/training.ts');
const { ApiError } = await import('../../src/api/types/common.ts');
beforeEach(() => control.reset());
test('401 heartbeat falls back to this session continuation only', async (t) => {
  await setItemAsync('fire3d.continuation.s1', 'continuation');
  mockBackend(t, async () => {
    throw new ApiError('expired', 401);
  });
  const calls = mockFetch(t, () => json(200, { status: 'Running' }));
  await api.heartbeatTrainingSession('s1');
  assert.equal(calls[0].headers.get('authorization'), 'Bearer continuation');
  assert.equal(calls[0].url.pathname, '/api/training/sessions/s1/heartbeat');
  await assert.rejects(api.heartbeatTrainingSession('s2'), (e) => e.status === 401);
  assert.equal(calls.length, 1);
});
test('403 and web never use stored continuation', async (t) => {
  await setItemAsync('fire3d.continuation.s1', 'continuation');
  let status = 403;
  mockBackend(t, async () => {
    throw new ApiError('denied', status);
  });
  const calls = mockFetch(t, () => {
    throw Error('unexpected transport');
  });
  await assert.rejects(api.heartbeatTrainingSession('s1'), (e) => e.status === 403);
  status = 401;
  Platform.OS = 'web';
  t.after(() => {
    Platform.OS = 'android';
  });
  await assert.rejects(api.getTrainingSession('s1'), (e) => e.status === 401);
  assert.equal(calls.length, 0);
});
test('renewal saves token only after live-login response and rejects missing token', async (t) => {
  let value = { token: 'new', expiresAt: 'future' };
  const calls = mockBackend(t, async () => value);
  await api.renewTrainingContinuation('s1');
  assert.equal(calls[0].path, '/api/training/sessions/s1/continuation');
  value = {};
  await assert.rejects(api.renewTrainingContinuation('s1'), /token/);
});
