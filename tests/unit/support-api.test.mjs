import test from 'node:test';
import assert from 'node:assert/strict';
import { supportApi } from '../../src/api/support.ts';
import { mockBackend } from '../support/http.mjs';
import { ApiError } from '../../src/api/types/common.ts';
test('ticket list and detail preserve server messages and status', async (t) => {
  const detail = {
    id: 't',
    status: 'Open',
    messages: [{ id: 'm', authorId: 'staff', message: 'Đã nhận' }],
  };
  const calls = mockBackend(t, async (path) =>
    path === '/api/support/tickets' ? [detail] : detail,
  );
  assert.deepEqual(await supportApi.listTickets(), [detail]);
  assert.equal(await supportApi.getTicket('t/a?'), detail);
  assert.equal(calls[1].path, '/api/support/tickets/t%2Fa%3F');
});
test('create and reply retain user text in their own request bodies', async (t) => {
  const calls = mockBackend(t, async () => ({ id: 'new' }));
  await supportApi.createTicket('Không tải được', 'Lỗi ở tầng 1');
  await supportApi.addMessage('t/a', 'Đã thử lại');
  assert.deepEqual(calls, [
    {
      path: '/api/support/tickets',
      options: { json: { subject: 'Không tải được', description: 'Lỗi ở tầng 1' } },
    },
    { path: '/api/support/tickets/t%2Fa/messages', options: { json: { message: 'Đã thử lại' } } },
  ]);
});
test('403 on a ticket or reply propagates ownership failure', async (t) => {
  const issue = new ApiError('forbidden', 403);
  mockBackend(t, async () => {
    throw issue;
  });
  await assert.rejects(supportApi.getTicket('foreign'), (e) => e === issue);
  await assert.rejects(supportApi.addMessage('foreign', 'text'), (e) => e === issue);
});
