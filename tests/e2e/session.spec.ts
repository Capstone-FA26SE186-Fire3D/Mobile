import { expect, test } from '@playwright/test';

test('logout clears the previous account and retired deep links return home', async ({ page }) => {
  const users = [
    {
      id: '11111111-1111-4111-8111-111111111111',
      email: 'first@example.test',
      fullName: 'Trainee One',
      role: 'Trainee',
      organizationId: null,
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      email: 'second@example.test',
      fullName: 'Trainee Two',
      role: 'Trainee',
      organizationId: null,
    },
  ];
  let login = 0;
  let logout = 0;
  await page.route('**/api/auth/login', async (route) => {
    const user = users[login++];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        accessToken: `access-${login}`,
        refreshToken: `refresh-${login}`,
        user,
      }),
    });
  });
  await page.route('**/api/auth/logout', async (route) => {
    logout++;
    await route.fulfill({ status: 204, body: '' });
  });
  await page.route('**/api/me/avatar', async (route) => route.fulfill({ status: 404, body: '' }));

  await page.goto('/game/old-session');
  await expect(page).toHaveURL(/\/login$/);
  await page.getByRole('textbox', { name: 'Email' }).fill(users[0].email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill('StrongPassword12!');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page.getByText('Trainee One')).toBeVisible();
  await expect(page.getByRole('button', { name: /quét QR|bắt đầu bài|xem kết quả/i })).toHaveCount(
    0,
  );
  await page.getByRole('button', { name: 'Mở tài khoản' }).click();
  await page.getByRole('button', { name: 'Đăng xuất' }).click();
  await expect(page.getByRole('button', { name: 'Đăng nhập', exact: true })).toBeVisible();
  expect(logout).toBe(1);
  await page.getByRole('textbox', { name: 'Email' }).fill(users[1].email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill('StrongPassword12!');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page.getByText('Trainee Two')).toBeVisible();
  await expect(page.getByText('Trainee One')).toHaveCount(0);
});
