import test from 'node:test';
import assert from 'node:assert/strict';
import { authFixture, mockFetch, json, session, user } from '../support/http.mjs';
import { getItemAsync } from 'expo-secure-store';
test('PATCH uses fetched ETag and stores confirmed profile', async (t) => {
  const auth = await authFixture(t);
  const next = { ...user, fullName: 'New' };
  const calls = mockFetch(t, (c) =>
    c.url.pathname.endsWith('/login')
      ? json(200, session())
      : c.method === 'PATCH'
        ? json(200, next)
        : json(200, user, { etag: '"v2"' }),
  );
  await auth.loginWithPassword('a', 'b');
  assert.deepEqual(await auth.updateCurrentProfile({ fullName: 'New' }), next);
  assert.equal(calls.at(-1).headers.get('if-match'), '"v2"');
  assert.deepEqual(JSON.parse(calls.at(-1).body), { fullName: 'New' });
  assert.equal(JSON.parse(await getItemAsync('fire3d.auth.account.v1')).fullName, 'New');
});
test('missing ETag prevents mutation', async (t) => {
  const auth = await authFixture(t);
  const calls = mockFetch(t, (c) =>
    json(200, c.url.pathname.endsWith('/login') ? session() : user),
  );
  await auth.loginWithPassword('a', 'b');
  await assert.rejects(auth.updateCurrentProfile({ fullName: 'x' }), /phiên bản/);
  assert.equal(
    calls.some((c) => c.method === 'PATCH'),
    false,
  );
});
test('412 preserves the previously confirmed cached profile', async (t) => {
  const auth = await authFixture(t);
  mockFetch(t, (c) =>
    c.url.pathname.endsWith('/login')
      ? json(200, session())
      : c.method === 'PATCH'
        ? json(412, {})
        : json(200, user, { etag: 'v' }),
  );
  await auth.loginWithPassword('a', 'b');
  await assert.rejects(auth.updateCurrentProfile({ fullName: 'x' }), (e) => e.status === 412);
  assert.deepEqual(JSON.parse(await getItemAsync('fire3d.auth.account.v1')), user);
});
