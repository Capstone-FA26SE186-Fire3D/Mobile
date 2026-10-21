import test from 'node:test';
import assert from 'node:assert/strict';
import { getItemAsync } from 'expo-secure-store';

process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.test';
const auth = await import('../src/api/auth.ts?real');

const user = { id: 'u1', email: 'a@b.c', fullName: 'A', role: 'Trainee' };
const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

test('signed-in session survives an app restart that starts offline', async () => {
  const realFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => json(200, { accessToken: 'a1', refreshToken: 'r1', user });
    await auth.loginWithPassword('a@b.c', 'secret');
    assert.ok(await getItemAsync('fire3d.auth.session.v1'));

    globalThis.fetch = async () => {
      throw new TypeError('Network request failed');
    };
    assert.deepEqual(await auth.restoreSession(), user);

    globalThis.fetch = async () => json(503, { title: 'down' });
    assert.deepEqual(await auth.restoreSession(), user);
    assert.ok(
      await getItemAsync('fire3d.auth.session.v1'),
      'a transient failure keeps the session',
    );
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('a rejected refresh clears the stored session and cached profile', async () => {
  const realFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url) =>
      String(url).endsWith('/api/auth/refresh')
        ? json(401, { title: 'bad' })
        : json(401, { title: 'expired' });
    assert.equal(await auth.restoreSession(), null);
    assert.equal(await getItemAsync('fire3d.auth.session.v1'), null);
    assert.equal(await getItemAsync('fire3d.auth.account.v1'), null);
  } finally {
    globalThis.fetch = realFetch;
  }
});
