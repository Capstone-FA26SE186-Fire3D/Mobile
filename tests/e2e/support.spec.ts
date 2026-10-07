import { expect, test } from '@playwright/test';

test('trainee can send feedback and continue a support ticket through BE routes', async ({
  page,
}) => {
  const account = {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'trainee@example.test',
    fullName: 'Người học',
    role: 'Trainee',
    organizationId: null,
  };
  const requests: { path: string; body: unknown }[] = [];
  let feedback: Record<string, unknown>[] = [];
  let tickets: Record<string, unknown>[] = [];
  let messages: Record<string, unknown>[] = [];
  await page.route('**/api/auth/login', async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ accessToken: 'access', refreshToken: 'refresh', user: account }),
    }),
  );
  await page.route('**/api/me/avatar', async (route) =>
    route.fulfill({ status: 404, contentType: 'application/problem+json', body: '{}' }),
  );
  await page.route('**/api/feedback', async (route) => {
    if (route.request().method() === 'POST') {
      requests.push({ path: 'feedback', body: route.request().postDataJSON() });
      feedback = [
        {
          id: 'f1',
          category: 'Mobile',
          message: 'Ứng dụng dễ dùng',
          rating: null,
          status: 'Submitted',
          createdAt: '2026-10-07T00:00:00Z',
        },
      ];
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(feedback[0]),
      });
    } else
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(feedback),
      });
  });
  await page.route('**/api/support/tickets', async (route) => {
    if (route.request().method() === 'POST') {
      requests.push({ path: 'ticket', body: route.request().postDataJSON() });
      tickets = [
        {
          id: '22222222-2222-4222-8222-222222222222',
          ticketNumber: 'SUP-001',
          subject: 'Không mở được bài',
          status: 'Open',
          createdAt: '2026-10-07T00:00:00Z',
          updatedAt: '2026-10-07T00:00:00Z',
        },
      ];
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ ...tickets[0], description: 'Màn hình trắng', messages }),
      });
    } else
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(tickets),
      });
  });
  await page.route('**/api/support/tickets/*', async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...tickets[0], description: 'Màn hình trắng', messages }),
    }),
  );
  await page.route('**/api/support/tickets/*/messages', async (route) => {
    requests.push({ path: 'message', body: route.request().postDataJSON() });
    messages = [
      {
        id: 'm1',
        authorId: account.id,
        message: 'Tôi đã thử lại',
        createdAt: '2026-10-07T01:00:00Z',
      },
    ];
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify(messages[0]),
    });
  });

  await page.goto('/');
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill(account.email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill('StrongPassword12!');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.getByRole('button', { name: 'Mở tài khoản' }).click();
  await page.getByRole('button', { name: 'Phản hồi và hỗ trợ' }).click();
  await page.getByRole('textbox', { name: 'Nội dung phản hồi' }).fill('Ứng dụng dễ dùng');
  await page.getByRole('button', { name: 'Gửi phản hồi' }).click();
  await expect(page.getByText('Đã gửi phản hồi.')).toBeVisible();
  await page.getByRole('textbox', { name: 'Tiêu đề hỗ trợ' }).fill('Không mở được bài');
  await page.getByRole('textbox', { name: 'Mô tả hỗ trợ' }).fill('Màn hình trắng');
  await page.getByRole('button', { name: 'Tạo yêu cầu hỗ trợ' }).click();
  await expect(page.getByText('SUP-001 · Open')).toBeVisible();
  await page.getByRole('textbox', { name: 'Tin nhắn hỗ trợ' }).fill('Tôi đã thử lại');
  await page.getByRole('button', { name: 'Gửi tin nhắn' }).click();
  await expect(page.getByText('Tôi đã thử lại')).toBeVisible();
  expect(requests).toEqual([
    { path: 'feedback', body: { category: 'Mobile', message: 'Ứng dụng dễ dùng', rating: null } },
    { path: 'ticket', body: { subject: 'Không mở được bài', description: 'Màn hình trắng' } },
    { path: 'message', body: { message: 'Tôi đã thử lại' } },
  ]);
});
