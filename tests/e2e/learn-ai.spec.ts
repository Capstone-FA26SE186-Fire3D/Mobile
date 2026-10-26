import { expect, test } from '@playwright/test';

const postId = '11111111-1111-4111-8111-111111111111';
const versionId = '22222222-2222-4222-8222-222222222222';
const requestId = '33333333-3333-4333-8333-333333333333';

test('guest reads public Learn content', async ({ page }) => {
  await page.route('**/api/learn/posts?*', async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          {
            id: postId,
            slug: 'an-toan',
            kind: 'Article',
            title: 'An toàn',
            summary: 'Hướng dẫn',
            coverImageUrl: null,
            publishedAt: '2026-10-17T00:00:00Z',
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
      }),
    }),
  );
  await page.route('**/api/learn/posts/an-toan', async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: postId,
        slug: 'an-toan',
        publishedVersionId: versionId,
        publishedVersion: {
          id: versionId,
          postId,
          contentSchemaVersion: 'fet3d.learn/1',
          kind: 'Article',
          title: 'An toàn',
          summary: 'Hướng dẫn',
          blocks: [
            { type: 'heading', text: 'Bước đầu tiên', level: 2 },
            { type: 'paragraph', text: 'Giữ bình tĩnh.' },
          ],
        },
      }),
    }),
  );
  await page.goto('/login');
  await page.getByRole('button', { name: 'Xem Learn không cần đăng nhập' }).click();
  await expect(page.getByText('An toàn', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'An toàn' }).click();
  await expect(page.getByText('Giữ bình tĩnh.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Đăng nhập để lưu và hỏi AI' })).toBeVisible();
});

test('AI keeps the accepted request and polls it without submitting again', async ({ page }) => {
  const user = {
    id: '44444444-4444-4444-8444-444444444444',
    email: 'trainee@example.test',
    fullName: 'Trainee',
    role: 'Trainee',
    organizationId: null,
  };
  let submits = 0;
  const request = {
    requestId,
    status: 'Accepted',
    resultType: null,
    input: { text: 'Cần làm gì?', context: null },
    result: null,
    citations: [],
    resultWithheld: false,
    createdAt: '2026-10-17T00:00:00Z',
  };
  await page.route('**/api/auth/login', async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ accessToken: 'access', refreshToken: 'refresh', user }),
    }),
  );
  await page.route('**/api/ai/trainee/quota', async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        policyActive: true,
        quotaUnit: 'tokens',
        dailyUnits: 100,
        usedUnits: 0,
        reservedUnits: 0,
        remainingUnits: 100,
        estimatedReserve: 10,
        maxInputChars: 100,
        resetsAt: '2026-10-18T00:00:00Z',
        blockedByAssessment: false,
        canSubmit: true,
      }),
    }),
  );
  await page.route('**/api/ai/trainee/requests?*', async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [], total: 0, page: 1, pageSize: 20 }),
    }),
  );
  await page.route('**/api/ai/trainee/answer', async (route) => {
    submits++;
    expect(route.request().headers()['idempotency-key']).toBeTruthy();
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify(request),
    });
  });
  await page.route(`**/api/ai/trainee/requests/${requestId}`, async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ...request,
        status: 'Succeeded',
        resultType: 'KnowledgeAnswer',
        result: { status: 'Answered', answer: 'Đi theo lối thoát hiểm.', message: null },
      }),
    }),
  );
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'Email' }).fill(user.email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill('StrongPassword12!');
  await page.getByRole('button', { name: 'Vào game', exact: true }).click();
  await page.getByRole('tab', { name: 'Learn' }).click();
  await page.getByRole('button', { name: 'Hỏi AI' }).click();
  await page.getByRole('textbox', { name: 'Câu hỏi AI' }).fill('Cần làm gì?');
  await page.getByRole('button', { name: 'Gửi câu hỏi' }).click();
  await expect(page.getByText('Đi theo lối thoát hiểm.')).toBeVisible({ timeout: 10000 });
  expect(submits).toBe(1);
});
