import test from 'node:test';
import assert from 'node:assert/strict';
import { sdk } from '../support/fakes/providers.mjs';
process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = 'web-client';
const google = await import('../../src/services/google.native.ts');
test.beforeEach(() => sdk.reset());
test.afterEach(() => sdk.reset());
test('returns Firebase token after Google credential exchange without forced token refresh', async () => {
  assert.equal(await google.firebaseIdTokenFromGoogle(), 'firebase-id');
  assert.deepEqual(
    sdk.calls.map((c) => c.name),
    ['configure', 'hasPlayServices', 'signIn', 'credential', 'signInWithCredential', 'getIdToken'],
  );
  assert.deepEqual(sdk.calls.find((c) => c.name === 'configure').args, [
    { webClientId: 'web-client' },
  ]);
  assert.deepEqual(sdk.calls.find((c) => c.name === 'credential').args, ['google-id']);
  assert.deepEqual(sdk.calls.find((c) => c.name === 'getIdToken').args, []);
});
test('cancelled or missing Google token never signs into Firebase', async () => {
  for (const response of [{ type: 'cancelled' }, { type: 'success', data: {} }]) {
    sdk.reset();
    sdk.handlers.signIn = () => response;
    await assert.rejects(google.firebaseIdTokenFromGoogle());
    assert.ok(!sdk.calls.some((c) => c.name === 'signInWithCredential'));
  }
});
test('Google signout is attempted even if Firebase signout fails', async () => {
  sdk.handlers.firebaseSignOut = () => {
    throw Error('offline');
  };
  sdk.handlers.googleSignOut = () => {
    throw Error('also offline');
  };
  await google.clearGoogleIdentity();
  assert.deepEqual(
    sdk.calls.map((c) => c.name),
    ['firebaseSignOut', 'googleSignOut'],
  );
});
