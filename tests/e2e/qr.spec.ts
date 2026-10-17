import { expect, test } from '@playwright/test';

const token = 'a'.repeat(43);
const buildingId = '11111111-1111-4111-8111-111111111111';
const user = {
  id: '22222222-2222-4222-8222-222222222222',
  email: 'trainee@example.test',
  fullName: 'Trainee QR',
  role: 'Trainee',
  organizationId: null,
};

test('QR survives login, verifies private code and loads allowed trainings', async ({ page }) => {
  let access = false;
  await page.route('**/api/auth/login', async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ accessToken: 'access', refreshToken: 'refresh', user }),
    }),
  );
  await page.route(`**/api/qr/${token}`, async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        buildingId,
        buildingName: 'Building A',
        visibility: 'Private',
        hasAccess: access,
        serviceStatus: 'Active',
        serviceEndsAt: null,
        canStartNewSessions: access,
      }),
    }),
  );
  await page.route(`**/api/buildings/${buildingId}/participation/verify`, async (route) => {
    expect(route.request().postDataJSON()).toEqual({ code: 'ABCD' });
    access = true;
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.route(`**/api/qr/${token}/trainings`, async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { id: 'training-1', name: 'Thoát hiểm', description: null, allowedModes: ['Learn'] },
      ]),
    }),
  );

  await page.goto(`/qr/${token}`);
  await page.getByRole('button', { name: 'Đăng nhập và tiếp tục' }).click();
  await page.getByRole('textbox', { name: 'Email' }).fill(user.email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill('StrongPassword12!');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/qr/${token}$`));
  await expect(page.getByText('Building A')).toBeVisible();
  await page.getByRole('textbox', { name: 'Mã tham gia Building Private' }).fill('ABCD');
  await page.getByRole('button', { name: 'Xác minh mã tham gia' }).click();
  await expect(page.getByText('Thoát hiểm')).toBeVisible();
});

test('revoked QR shows its own error', async ({ page }) => {
  await page.route('**/api/auth/login', async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ accessToken: 'access', refreshToken: 'refresh', user }),
    }),
  );
  await page.route(`**/api/qr/${token}`, async (route) =>
    route.fulfill({
      status: 410,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'QR_REVOKED', title: 'Revoked' }),
    }),
  );
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'Email' }).fill(user.email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill('StrongPassword12!');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.getByRole('button', { name: 'Quét QR hoặc nhập mã Building' }).click();
  await page.getByRole('textbox', { name: 'URL QR hoặc token' }).fill(token);
  await page.getByRole('button', { name: 'Mở Building' }).click();
  await expect(page.getByText(/đã bị thu hồi/)).toBeVisible();
});
