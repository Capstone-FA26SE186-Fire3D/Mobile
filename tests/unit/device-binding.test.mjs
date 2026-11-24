import test from 'node:test';
import assert from 'node:assert/strict';
import { sdk } from '../support/fakes/providers.mjs';
import { control, getItemAsync } from '../support/fakes/expo-secure-store.mjs';
import { mockBackend, deferred } from '../support/http.mjs';
import { bindDevice } from '../../src/services/device.native.ts';
const bound = 'fire3d.device.bound-account.v1';
test.beforeEach(() => {
  sdk.reset();
  control.reset();
});
test.afterEach(() => {
  sdk.reset();
  control.reset();
});
test('denied permission never requests token, creates identity or binds', async (t) => {
  const calls = mockBackend(t, () => assert.fail('no binding'));
  sdk.handlers.getPermissions = () => ({ granted: false });
  sdk.handlers.requestPermissions = () => ({ granted: false });
  assert.equal(await bindDevice('a'), false);
  assert.equal(calls.length, 0);
  assert.ok(!sdk.calls.some((c) => c.name === 'pushToken'));
  assert.equal(await getItemAsync('fire3d.device.uuid.v1'), null);
});
test('new installation has 32-byte URL-safe secret, persists identity and marks bound only after BE success', async (t) => {
  const calls = mockBackend(t, async () => {
    if (globalThis.__requests.length === 1) throw Error('network lost');
  });
  await assert.rejects(bindDevice('a'), /network lost/);
  assert.equal(await getItemAsync(bound), null);
  await bindDevice('a');
  assert.equal(await getItemAsync(bound), 'a');
  const [first, next] = calls;
  assert.equal(first.path, '/api/auth/devices');
  assert.equal(first.options.method, 'PUT');
  assert.match(first.options.headers['X-Installation-Key'], /^[A-Za-z0-9_-]{43}$/);
  assert.deepEqual(first.options, next.options);
  assert.equal(next.options.json.fcmToken, 'fcm-test');
  assert.equal(next.options.json.osVersion, '35');
  assert.equal(next.options.json.appVersion, 'test-app');
  assert.ok(!Object.hasOwn(next.options.json, 'installationKey'));
});
test('unsupported or blank native tokens never create backend binding', async (t) => {
  const calls = mockBackend(t, () => assert.fail('no invalid token'));
  for (const token of [
    { type: 'ios', data: 'token' },
    { type: 'android', data: '' },
    { type: 'android', data: {} },
  ]) {
    sdk.handlers.pushToken = () => token;
    await assert.rejects(bindDevice('a'));
  }
  assert.equal(calls.length, 0);
});
test('overlapping account binds execute in order', async (t) => {
  const gate = deferred();
  const entered = deferred();
  const calls = mockBackend(t, async () => {
    if (globalThis.__requests.length === 1) {
      entered.resolve();
      await gate.promise;
    }
  });
  const a = bindDevice('a');
  await entered.promise;
  const b = bindDevice('b');
  await Promise.resolve();
  assert.equal(calls.length, 1);
  gate.resolve();
  await Promise.all([a, b]);
  assert.equal(calls.length, 2);
  assert.equal(await getItemAsync(bound), 'b');
});
