import test from 'node:test';
import assert from 'node:assert/strict';
import { sdk } from '../support/fakes/providers.mjs';
import { control, getItemAsync } from '../support/fakes/expo-secure-store.mjs';
import { mockBackend, deferred } from '../support/http.mjs';
import {
  bindDevice,
  revokeDevice,
  listenForDeviceTokenChange,
} from '../../src/services/device.native.ts';
test.beforeEach(() => {
  sdk.reset();
  control.reset();
});
test.afterEach(() => {
  sdk.reset();
  control.reset();
});
test('foreign account cannot revoke binding; failed revoke preserves identity and owner for retry', async (t) => {
  const calls = mockBackend(t, async () => {});
  await bindDevice('a');
  await revokeDevice('b');
  assert.equal(calls.length, 1);
  const installation = calls[0].options.headers['X-Installation-Key'];
  const id = calls[0].options.json.deviceUuid;
  globalThis.__be = async () => {
    throw Error('offline');
  };
  await assert.rejects(revokeDevice('a'), /offline/);
  assert.equal(await getItemAsync('fire3d.device.bound-account.v1'), 'a');
  globalThis.__be = async () => {};
  await revokeDevice('a');
  const last = calls.at(-1);
  assert.equal(last.path, '/api/auth/devices/' + encodeURIComponent(id));
  assert.equal(last.options.method, 'DELETE');
  assert.equal(last.options.headers['X-Installation-Key'], installation);
  assert.equal(await getItemAsync('fire3d.device.bound-account.v1'), null);
  assert.equal(await getItemAsync('fire3d.device.uuid.v1'), id);
});
test('rotation rebinds with fresh native token and unsubscribe removes callback', async (t) => {
  const calls = mockBackend(t, async () => {});
  await bindDevice('a');
  sdk.handlers.pushToken = () => ({ type: 'android', data: 'rotated-token' });
  const done = deferred();
  globalThis.__be = async () => {
    done.resolve();
  };
  const errors = [];
  const unsubscribe = listenForDeviceTokenChange('a', (e) => errors.push(e));
  t.after(unsubscribe);
  assert.equal(sdk.listeners.size, 1);
  for (const listener of sdk.listeners) listener({ type: 'android', data: 'event-token' });
  await done.promise;
  await revokeDevice('foreign');
  assert.equal(calls[1].options.json.fcmToken, 'rotated-token');
  assert.equal(
    calls[1].options.headers['X-Installation-Key'],
    calls[0].options.headers['X-Installation-Key'],
  );
  unsubscribe();
  assert.equal(sdk.listeners.size, 0);
  assert.deepEqual(errors, []);
});
test('rotation errors reach callback without an unhandled rejection', async (t) => {
  mockBackend(t, async () => {
    throw Error('binding failed');
  });
  const error = deferred();
  const unsubscribe = listenForDeviceTokenChange('a', error.resolve);
  t.after(unsubscribe);
  for (const listener of sdk.listeners) listener({});
  assert.match((await error.promise).message, /binding failed/);
});
