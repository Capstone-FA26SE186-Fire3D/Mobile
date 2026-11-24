import test from 'node:test';
import assert from 'node:assert/strict';
import { authFixture, mockFetch, json, session, deferred } from '../support/http.mjs';
import { getItemAsync } from 'expo-secure-store';
test('two concurrent 401s share one refresh and replay with the new token', async (t) => {
  const auth = await authFixture(t);
  const entered = deferred(),
    release = deferred();
  let count = 0;
  const calls = mockFetch(t, async (c) => {
    if (c.url.pathname.endsWith('/login')) return json(200, session());
    if (c.url.pathname.endsWith('/refresh')) {
      count++;
      entered.resolve();
      await release.promise;
      return json(200, session({ accessToken: 'access-2' }));
    }
    return c.headers.get('authorization') === 'Bearer access-2'
      ? json(200, { ok: true })
      : json(401, {});
  });
  await auth.loginWithPassword('a', 'b');
  const first = auth.requestWithSession('/one'),
    second = auth.requestWithSession('/two');
  await entered.promise;
  release.resolve();
  assert.deepEqual(await Promise.all([first, second]), [{ ok: true }, { ok: true }]);
  assert.equal(count, 1);
  assert.equal(calls.filter((c) => c.headers.get('authorization') === 'Bearer access-2').length, 2);
});
test('a second unauthorized response is not retried forever', async (t) => {
  const auth = await authFixture(t);
  let refreshes = 0;
  mockFetch(t, (c) => {
    if (c.url.pathname.endsWith('/login')) return json(200, session());
    if (c.url.pathname.endsWith('/refresh')) {
      refreshes++;
      return json(200, session({ accessToken: 'new' }));
    }
    return json(401, {});
  });
  await auth.loginWithPassword('a', 'b');
  await assert.rejects(auth.requestWithSession('/x'), (e) => e.status === 401);
  assert.equal(refreshes, 1);
});
for (const status of [400, 401, 403])
  test('refresh rejection clears credentials: ' + status, async (t) => {
    const auth = await authFixture(t);
    mockFetch(t, (c) =>
      json(
        c.url.pathname.endsWith('/login')
          ? 200
          : c.url.pathname.endsWith('/refresh')
            ? status
            : 401,
        session(),
      ),
    );
    await auth.loginWithPassword('a', 'b');
    await assert.rejects(auth.requestWithSession('/x'), (e) => e.status === status);
    assert.equal(await getItemAsync('fire3d.auth.session.v1'), null);
    assert.equal(await getItemAsync('fire3d.auth.account.v1'), null);
  });
