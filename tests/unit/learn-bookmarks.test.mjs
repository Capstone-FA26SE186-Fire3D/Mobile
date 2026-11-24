import test from 'node:test';
import assert from 'node:assert/strict';
import { mockBackend, mockFetch, json } from '../support/http.mjs';
import * as api from '../../src/api/learn.ts';
test('public search encodes Unicode and detail slug without authentication', async (t) => {
  const calls = mockFetch(t, async () => json(200, { items: [] }));
  mockBackend(t, () => assert.fail('public reads'));
  await api.listLearnPosts(3, 'cháy & khói');
  await api.getLearnPost('slug/a?b');
  assert.equal(calls[0].url.searchParams.get('search'), 'cháy & khói');
  assert.equal(calls[0].url.searchParams.get('page'), '3');
  assert.equal(calls[0].url.searchParams.get('pageSize'), '20');
  assert.equal(calls[0].headers.has('Authorization'), false);
  assert.equal(calls[1].url.pathname, '/api/learn/posts/slug%2Fa%3Fb');
});
test('bookmark list retains unavailable records; mutations use PUT and DELETE', async (t) => {
  const page = {
    items: [{ postId: 'p', available: false, slug: null }],
    total: 1,
    page: 2,
    pageSize: 20,
  };
  const calls = mockBackend(t, async () => page);
  assert.equal(await api.listBookmarks(2), page);
  await api.getBookmark('p/id');
  await api.setBookmark('p/id', true);
  await api.setBookmark('p/id', false);
  assert.deepEqual(calls[0].options.query, { page: 2, pageSize: 20 });
  assert.equal(calls[1].path, '/api/learn/bookmarks/p%2Fid');
  assert.deepEqual(
    calls.slice(2).map((c) => c.options.method),
    ['PUT', 'DELETE'],
  );
});
test('failed bookmark mutation rejects and does not invent optimistic server state', async (t) => {
  const issue = Error('offline');
  mockBackend(t, async () => {
    throw issue;
  });
  await assert.rejects(api.setBookmark('p', true), (e) => e === issue);
});
