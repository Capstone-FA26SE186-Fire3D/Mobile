import test from 'node:test';
import assert from 'node:assert/strict';
import { authFixture, mockFetch, json, session, user } from '../support/http.mjs';
import '../support/fakes/expo-file-system.mjs';
test('only missing avatar maps to null; server failures propagate', async (t) => {
  const auth = await authFixture(t);
  let status = 404;
  mockFetch(t, (c) =>
    c.url.pathname.endsWith('/login') ? json(200, session()) : json(status, {}),
  );
  await auth.loginWithPassword('a', 'b');
  assert.equal(await auth.getCurrentAvatar(), null);
  status = 500;
  await assert.rejects(auth.getCurrentAvatar(), (e) => e.status === 500);
});
test('delete requires the profile ETag', async (t) => {
  const auth = await authFixture(t);
  const calls = mockFetch(t, (c) =>
    c.url.pathname.endsWith('/login')
      ? json(200, session())
      : c.method === 'DELETE'
        ? json(204)
        : json(200, user, { etag: 'v7' }),
  );
  await auth.loginWithPassword('a', 'b');
  await auth.deleteCurrentAvatar();
  assert.equal(calls.at(-1).url.pathname, '/api/me/avatar');
  assert.equal(calls.at(-1).headers.get('if-match'), 'v7');
});
test('unsupported empty and oversized images fail before contacting API', async (t) => {
  const auth = await authFixture(t);
  const calls = mockFetch(t, () => {
    throw Error('unexpected');
  });
  await assert.rejects(auth.uploadCurrentAvatar('/missing', 'image/gif'), /JPEG/);
  await assert.rejects(auth.uploadCurrentAvatar('/missing', 'image/png'), /5 MB/);
  globalThis.__fs.files.set('/large', new Uint8Array(5 * 1024 * 1024 + 1));
  await assert.rejects(auth.uploadCurrentAvatar('/large', 'image/png'), /5 MB/);
  assert.equal(calls.length, 0);
  globalThis.__fs.reset();
});
