import test from 'node:test';
import assert from 'node:assert/strict';
import { authFixture, mockFetch, json, session, user } from '../support/http.mjs';
import { getItemAsync, setItemAsync } from 'expo-secure-store';
for (const raw of ['{', 'null', '{"accessToken":1,"refreshToken":"r"}'])
  test('corrupt session is removed: ' + raw, async (t) => {
    const auth = await authFixture(t);
    const calls = mockFetch(t, () => {
      throw Error('must not call');
    });
    await setItemAsync('fire3d.auth.session.v1', raw);
    assert.equal(await auth.restoreSession(), null);
    assert.equal(calls.length, 0);
    assert.equal(await getItemAsync('fire3d.auth.session.v1'), null);
  });
for (const status of [408, 429, 500, 503])
  test('transient response keeps cached identity: ' + status, async (t) => {
    const auth = await authFixture(t);
    mockFetch(t, (c) =>
      c.url.pathname.endsWith('/login') ? json(200, session()) : json(status, {}),
    );
    await auth.loginWithPassword('a', 'b');
    assert.deepEqual(await auth.restoreSession(), user);
    assert.ok(await getItemAsync('fire3d.auth.session.v1'));
  });
test('forbidden account is cleared rather than restored offline', async (t) => {
  const auth = await authFixture(t);
  mockFetch(t, (c) => (c.url.pathname.endsWith('/login') ? json(200, session()) : json(403, {})));
  await auth.loginWithPassword('a', 'b');
  assert.equal(await auth.restoreSession(), null);
  assert.equal(await getItemAsync('fire3d.auth.account.v1'), null);
});
