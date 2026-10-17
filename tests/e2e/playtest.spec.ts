import { expect, test } from '@playwright/test';

const code = 'z'.repeat(43);
const id = '11111111-1111-4111-8111-111111111111';
const owner = {
  id: '22222222-2222-4222-8222-222222222222',
  email: 'owner@example.test',
  fullName: 'Owner',
  role: 'OrganizationUser',
  organizationId: '33333333-3333-4333-8333-333333333333',
};
const status = {
  id,
  buildingId: '44444444-4444-4444-8444-444444444444',
  revisionId: '55555555-5555-4555-8555-555555555555',
  scenarioVersionId: '66666666-6666-4666-8666-666666666666',
  status: 'Created',
  runtimeVersion: null,
  package: { packageHash: 'a'.repeat(64), manifestHash: 'b'.repeat(64), buildTarget: 'Android' },
  grant: null,
  acknowledgedSequence: 0,
  boundToMobile: true,
  launchSession: true,
  recovery: { canStart: true, canReissueGrant: false, canSync: false, canCancel: true },
  completion: null,
};

test('OrganizationUser redeems handoff after login and stays in playtest only', async ({
  page,
}) => {
  let redeemed = 0;
  await page.route('**/api/auth/login', async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ accessToken: 'org-access', refreshToken: 'org-refresh', user: owner }),
    }),
  );
  await page.route('**/api/playtests/handoffs/redeem', async (route) => {
    redeemed++;
    expect(route.request().postDataJSON()).toEqual({ code });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(status),
    });
  });
  await page.route(`**/api/playtests/${id}`, async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(status),
    }),
  );

  await page.goto(`/playtest/handoff?code=${code}`);
  await page.getByRole('button', { name: 'Đăng nhập và nhận playtest' }).click();
  await page.getByRole('textbox', { name: 'Email' }).fill(owner.email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill('StrongPassword12!');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page.getByText('Trạng thái: Created')).toBeVisible();
  await expect(page.getByText(/Chờ BE cấp URL tải manifest/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mở tài khoản' })).toHaveCount(0);
  expect(redeemed).toBe(1);
});
